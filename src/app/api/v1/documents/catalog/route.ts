import { NextResponse } from "next/server";

import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  canManageDocumentTemplates,
  canReadDocumentTemplates,
} from "@/lib/documents/permissions";
import {
  DISTRIBUTABLE_CATALOG,
  findCatalogEntry,
  isDistributable,
} from "@/lib/documents/catalog";
import {
  createDocumentTemplate,
  listDocumentTemplates,
  publishDocumentTemplate,
} from "@/lib/server/document-templates";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";

/**
 * Il catalogo dei modelli di piattaforma, e l'adozione di una voce.
 *
 *   GET  /api/v1/documents/catalog          cosa si puo adottare, e cosa gia c'e
 *   POST /api/v1/documents/catalog { key }  adotta: crea la copia del club
 *
 * **Il catalogo non si installa da solo** (§6.2 del planning). Sei voci
 * proposte in un elenco che il club sfoglia sono utili; sei modelli comparsi
 * senza che nessuno li abbia chiesti sono sei righe in piu in una schermata
 * che serviva a trovarne una.
 *
 * **Una copia adottata e del club.** Da quel momento si modifica liberamente e
 * il catalogo non la tocca piu: `catalog_key` resta solo per sapere da dove
 * viene, e per non riproporre due volte la stessa cosa.
 *
 * **Esce solo cio che si puo mantenere.** Le voci di classe C — quelle che
 * citano norme o spostano responsabilita — sono scritte ma ferme, e questa
 * rotta non le nomina nemmeno: `DISTRIBUTABLE_CATALOG` le esclude alla radice
 * (ADR-0092).
 */

export const runtime = "nodejs";

const fail = (status: number, message: string) =>
  NextResponse.json({ data: null, error: { message } }, { status });

const scopeFor = async (request: Request, session: any) =>
  resolveOrganizationScopeForUser(
    session.db.user_id,
    request.headers.get("x-active-club-id"),
    request.headers.get("x-active-access-role"),
  );

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return fail(401, "Accesso negato: sessione assente");

    const scope = await scopeFor(request, session);
    if (!scope.activeOrganizationId) {
      return fail(403, "Accesso negato: nessun club attivo");
    }
    if (!canReadDocumentTemplates(scope.activeRole)) {
      return fail(403, "Accesso negato: il catalogo lo vede la segreteria del club");
    }

    const templateScope = {
      userId: session.db.user_id,
      activeOrganizationId: scope.activeOrganizationId,
      allowedOrganizationIds: scope.allowedOrganizationIds,
      role: scope.activeRole,
    };

    /*
      I ritirati contano come «gia adottati»: riproporre a un club una voce che
      ha deliberatamente ritirato vorrebbe dire non aver capito la risposta.
    */
    const esistenti = await listDocumentTemplates(templateScope, {
      includeRetired: true,
    });
    const adottate = new Map(
      esistenti
        .filter((template) => template.catalogKey)
        .map((template) => [template.catalogKey as string, template]),
    );

    const data = DISTRIBUTABLE_CATALOG.map((entry) => {
      const adottata = adottate.get(entry.key);
      return {
        key: entry.key,
        title: entry.title,
        description: entry.description,
        subjectKind: entry.subjectKind,
        catalogClass: entry.catalogClass,
        editorialOwner: entry.editorialOwner,
        lastReviewedAt: entry.lastReviewedAt,
        adopted: Boolean(adottata),
        adoptedTemplateId: adottata?.id || null,
      };
    });

    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    const message = String(error?.message || "Impossibile leggere il catalogo");
    return fail(message.includes("Accesso negato") ? 403 : 400, message);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return fail(401, "Accesso negato: sessione assente");

    const scope = await scopeFor(request, session);
    if (!scope.activeOrganizationId) {
      return fail(403, "Accesso negato: nessun club attivo");
    }
    if (!canManageDocumentTemplates(scope.activeRole)) {
      return fail(
        403,
        "Accesso negato: i modelli li adotta la direzione del club",
      );
    }

    const body = await request.json().catch(() => ({}));
    const key = String(body?.key || "").trim();
    const entry = findCatalogEntry(key);

    /*
      Una voce ferma e una voce che non esiste danno la **stessa** risposta:
      dire «esiste ma non te la do» inviterebbe a chiedere di nuovo, e la
      ragione per cui e ferma non e negoziabile da chi la chiede.
    */
    if (!entry || !isDistributable(entry)) {
      return fail(404, "Questo modello non e nel catalogo");
    }

    const templateScope = {
      userId: session.db.user_id,
      activeOrganizationId: scope.activeOrganizationId,
      allowedOrganizationIds: scope.allowedOrganizationIds,
      role: scope.activeRole,
    };

    const esistenti = await listDocumentTemplates(templateScope, {
      includeRetired: true,
    });
    const gia = esistenti.find((template) => template.catalogKey === entry.key);
    if (gia) {
      return fail(
        409,
        `«${entry.title}» e gia fra i modelli del club: aprilo invece di adottarlo di nuovo`,
      );
    }

    const creato = await createDocumentTemplate(templateScope, {
      title: entry.title,
      description: entry.description,
      subjectKind: entry.subjectKind,
      content: entry.content,
      catalogKey: entry.key,
      catalogClass: entry.catalogClass,
      editorialOwner: entry.editorialOwner,
      lastReviewedAt: entry.lastReviewedAt,
    });

    /*
      Si adotta **gia pubblicato**: una voce di catalogo e stata scritta per
      essere usata, e un test verifica che ognuna sia pubblicabile cosi com'e.
      Consegnarla come bozza costringerebbe a un secondo clic che non decide
      niente.
    */
    const attivo = await publishDocumentTemplate(templateScope, creato.id);

    await recordAuditEvent({
      action: AUDIT_ACTIONS.documentTemplateCreated,
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      actorRole: scope.activeRole,
      organizationId: attivo.organizationId,
      resource: "document_templates",
      resourceId: attivo.id,
      metadata: { catalogo: entry.key, classe: entry.catalogClass },
    });

    return NextResponse.json({ data: attivo, error: null }, { status: 201 });
  } catch (error: any) {
    const message = String(error?.message || "Impossibile adottare il modello");
    return fail(message.includes("Accesso negato") ? 403 : 400, message);
  }
}
