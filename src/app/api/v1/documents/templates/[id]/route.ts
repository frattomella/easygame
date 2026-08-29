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
  deleteDocumentTemplate,
  getDocumentTemplate,
  setDocumentTemplateStatus,
  updateDocumentTemplateDraft,
} from "@/lib/server/document-templates";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";

/**
 * Un modello: leggilo, correggine la bozza, ritiralo, cancellalo.
 *
 *   GET    /api/v1/documents/templates/:id
 *   PATCH  /api/v1/documents/templates/:id      bozza, e/oppure stato
 *   DELETE /api/v1/documents/templates/:id      solo se non ha prodotto niente
 *
 * **`PATCH` scrive la bozza, non una versione.** Un modello in uso si corregge
 * quanto serve senza che nessun documento gia consegnato cambi: la versione
 * nasce solo quando qualcuno **pubblica**.
 */

export const runtime = "nodejs";

type Context = { params: { id: string } };

const fail = (status: number, message: string) =>
  NextResponse.json({ data: null, error: { message } }, { status });

const failure = (error: any, fallback: string) => {
  const message = String(error?.message || fallback);
  const status = message.includes("Accesso negato") ? 403 : 400;
  return NextResponse.json(
    {
      data: null,
      error: { message, ...(error?.issues ? { issues: error.issues } : {}) },
    },
    { status },
  );
};

const scopeFor = async (request: Request, session: any) =>
  resolveOrganizationScopeForUser(
    session.db.user_id,
    request.headers.get("x-active-club-id"),
    request.headers.get("x-active-access-role"),
  );

const buildScope = (session: any, scope: any) => ({
  userId: session.db.user_id,
  activeOrganizationId: scope.activeOrganizationId,
  allowedOrganizationIds: scope.allowedOrganizationIds,
  role: scope.activeRole,
});

export async function GET(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return fail(401, "Accesso negato: sessione assente");

    const scope = await scopeFor(request, session);
    if (!canReadDocumentTemplates(scope.activeRole)) {
      return fail(403, "Accesso negato: i modelli li vede la segreteria del club");
    }

    const data = await getDocumentTemplate(
      buildScope(session, scope),
      context.params.id,
    );
    return NextResponse.json({ data, error: null });
  } catch (error) {
    return failure(error, "Modello non trovato");
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return fail(401, "Accesso negato: sessione assente");

    const scope = await scopeFor(request, session);
    if (!canManageDocumentTemplates(scope.activeRole)) {
      return fail(
        403,
        "Accesso negato: i modelli li scrive la direzione del club",
      );
    }

    const body = await request.json().catch(() => ({}));
    const templateScope = buildScope(session, scope);

    let data = await updateDocumentTemplateDraft(
      templateScope,
      context.params.id,
      {
        title: body?.title,
        description: body?.description,
        subjectKind: body?.subject_kind ?? body?.subjectKind,
        content: body?.content,
        editorialOwner: body?.editorial_owner ?? body?.editorialOwner,
        editorialNotes: body?.editorial_notes ?? body?.editorialNotes,
        lastReviewedAt: body?.last_reviewed_at ?? body?.lastReviewedAt,
      },
    );

    /*
      Lo stato si cambia nella stessa richiesta ma con la sua funzione, perche
      ha regole proprie: si attiva pubblicando, e si ritira senza perdere cio
      che ha gia prodotto.
    */
    if (body?.status !== undefined) {
      data = await setDocumentTemplateStatus(
        templateScope,
        context.params.id,
        String(body.status),
      );

      await recordAuditEvent({
        action: AUDIT_ACTIONS.documentTemplateStatusChanged,
        actorUserId: session.db.user_id,
        actorEmail: session.db.user.email,
        actorRole: scope.activeRole,
        organizationId: data.organizationId,
        resource: "document_templates",
        resourceId: data.id,
        metadata: { status: data.status },
      });
    }

    return NextResponse.json({ data, error: null });
  } catch (error) {
    return failure(error, "Impossibile aggiornare il modello");
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return fail(401, "Accesso negato: sessione assente");

    const scope = await scopeFor(request, session);
    if (!canManageDocumentTemplates(scope.activeRole)) {
      return fail(
        403,
        "Accesso negato: i modelli li scrive la direzione del club",
      );
    }

    const data = await deleteDocumentTemplate(
      buildScope(session, scope),
      context.params.id,
    );

    await recordAuditEvent({
      action: AUDIT_ACTIONS.documentTemplateDeleted,
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      actorRole: scope.activeRole,
      organizationId: scope.activeOrganizationId,
      resource: "document_templates",
      resourceId: data.id,
    });

    return NextResponse.json({ data, error: null });
  } catch (error) {
    return failure(error, "Impossibile cancellare il modello");
  }
}
