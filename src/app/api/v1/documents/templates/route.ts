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
  createDocumentTemplate,
  listDocumentTemplates,
} from "@/lib/server/document-templates";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";

/**
 * I modelli di documento del club.
 *
 *   GET  /api/v1/documents/templates                elenco
 *   GET  /api/v1/documents/templates?include_retired=1
 *   POST /api/v1/documents/templates                nuovo modello (bozza)
 *
 * **Perche non passa dal CRUD generico.** Fino alla Wave 3 i modelli erano una
 * risorsa di `club_resource_items` con `GET/POST/PATCH/DELETE` automatici, e la
 * sonda a runtime (`scripts/wave-3-permissions-probe.mjs`) ha mostrato cosa
 * costava: collaboratore e staff potevano crearli, modificarli e cancellarli.
 * Un modello ha una bozza, delle versioni immutabili e dei documenti che le
 * citano: non e una riga generica, e non deve avere una rotta generica.
 *
 * **Il confine.** Il club non arriva dall'indirizzo: arriva dallo scope della
 * sessione.
 */

export const runtime = "nodejs";

const fail = (status: number, message: string) =>
  NextResponse.json({ data: null, error: { message } }, { status });

const failure = (error: any, fallback: string) => {
  const message = String(error?.message || fallback);
  const status = message.includes("Accesso negato") ? 403 : 400;
  return NextResponse.json({ data: null, error: { message } }, { status });
};

const scopeFor = async (request: Request, session: any) => {
  const url = new URL(request.url);
  return resolveOrganizationScopeForUser(
    session.db.user_id,
    request.headers.get("x-active-club-id") || url.searchParams.get("clubId"),
    request.headers.get("x-active-access-role"),
  );
};

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return fail(401, "Accesso negato: sessione assente");

    const scope = await scopeFor(request, session);
    if (!scope.activeOrganizationId) {
      return fail(403, "Accesso negato: nessun club attivo");
    }
    if (!canReadDocumentTemplates(scope.activeRole)) {
      return fail(403, "Accesso negato: i modelli li vede la segreteria del club");
    }

    const url = new URL(request.url);
    const data = await listDocumentTemplates(
      {
        userId: session.db.user_id,
        activeOrganizationId: scope.activeOrganizationId,
        allowedOrganizationIds: scope.allowedOrganizationIds,
        role: scope.activeRole,
      },
      {
        includeRetired: ["1", "true", "yes"].includes(
          String(url.searchParams.get("include_retired") || "").toLowerCase(),
        ),
        subjectKind: url.searchParams.get("subject_kind"),
      },
    );

    return NextResponse.json({ data, error: null });
  } catch (error) {
    return failure(error, "Impossibile leggere i modelli");
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
        "Accesso negato: i modelli li scrive la direzione del club",
      );
    }

    const body = await request.json().catch(() => ({}));

    const data = await createDocumentTemplate(
      {
        userId: session.db.user_id,
        activeOrganizationId: scope.activeOrganizationId,
        allowedOrganizationIds: scope.allowedOrganizationIds,
        role: scope.activeRole,
      },
      {
        title: body?.title,
        description: body?.description,
        subjectKind: body?.subject_kind ?? body?.subjectKind,
        content: body?.content,
        catalogKey: body?.catalog_key ?? body?.catalogKey,
        catalogClass: body?.catalog_class ?? body?.catalogClass,
        editorialOwner: body?.editorial_owner ?? body?.editorialOwner,
        editorialNotes: body?.editorial_notes ?? body?.editorialNotes,
        lastReviewedAt: body?.last_reviewed_at ?? body?.lastReviewedAt,
      },
    );

    await recordAuditEvent({
      action: AUDIT_ACTIONS.documentTemplateCreated,
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      actorRole: scope.activeRole,
      organizationId: scope.activeOrganizationId,
      resource: "document_templates",
      resourceId: data.id,
      metadata: { title: data.title, subject: data.subjectKind },
    });

    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (error) {
    return failure(error, "Impossibile creare il modello");
  }
}
