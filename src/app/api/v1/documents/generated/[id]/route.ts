import { NextResponse } from "next/server";

import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  canAdvanceGeneratedDocument,
  canReadDocumentTemplates,
} from "@/lib/documents/permissions";
import {
  advanceGeneratedDocument,
  getGeneratedDocument,
} from "@/lib/server/document-templates";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";

/**
 * Un documento gia generato: rileggilo com'era, o portane avanti lo stato.
 *
 *   GET   /api/v1/documents/generated/:id
 *   GET   /api/v1/documents/generated/:id?format=html
 *   PATCH /api/v1/documents/generated/:id   { status, signed_attachment_id? }
 *
 * **Perche non e l'endpoint degli allegati** (ADR-0089). Quello
 * autorizza la lettura a chiunque appartenga al club — misurato, non dedotto —
 * e un'attestazione che dice quanto ha versato una famiglia non puo stare li.
 * Qui il permesso guarda **cosa il documento contiene** e **chi lo ha
 * prodotto**: la regola sta in `canReadGeneratedDocument`, in un posto solo.
 *
 * **La risposta e quella di allora.** Non si rigenera niente: si restituisce
 * `content_html`, cioe il documento come e stato consegnato. E la ragione per
 * cui quella colonna esiste.
 */

export const runtime = "nodejs";

type Context = { params: { id: string } };

const fail = (status: number, message: string) =>
  NextResponse.json({ data: null, error: { message } }, { status });

const scopeFor = async (request: Request, session: any) =>
  resolveOrganizationScopeForUser(
    session.db.user_id,
    request.headers.get("x-active-club-id"),
    request.headers.get("x-active-access-role"),
  );

export async function GET(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return fail(401, "Accesso negato: sessione assente");

    const scope = await scopeFor(request, session);
    if (!canReadDocumentTemplates(scope.activeRole)) {
      return fail(
        403,
        "Accesso negato: i documenti li vede la segreteria del club",
      );
    }

    const document = await getGeneratedDocument(
      {
        userId: session.db.user_id,
        activeOrganizationId: scope.activeOrganizationId,
        allowedOrganizationIds: scope.allowedOrganizationIds,
        role: scope.activeRole,
      },
      context.params.id,
    );

    const url = new URL(request.url);
    const headers = { "Cache-Control": "private, no-store" };

    if (
      String(url.searchParams.get("format") || "").toLowerCase() === "html"
    ) {
      return new NextResponse(document.contentHtml, {
        status: 200,
        headers: {
          ...headers,
          "Content-Type": "text/html; charset=utf-8",
          /*
            Il documento e HTML **generato dal server** e non un file caricato
            da un utente, ma la difesa e la stessa: il tipo lo decide il
            server, e nessuno lo re-interpreta.
          */
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    return NextResponse.json({ data: document, error: null }, { headers });
  } catch (error: any) {
    const message = String(error?.message || "Documento non trovato");
    return fail(message.includes("Accesso negato") ? 403 : 400, message);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return fail(401, "Accesso negato: sessione assente");

    const scope = await scopeFor(request, session);
    if (!canAdvanceGeneratedDocument(scope.activeRole)) {
      return fail(
        403,
        "Accesso negato: lo stato di un documento lo cambia la segreteria del club",
      );
    }

    const body = await request.json().catch(() => ({}));

    const data = await advanceGeneratedDocument(
      {
        userId: session.db.user_id,
        activeOrganizationId: scope.activeOrganizationId,
        allowedOrganizationIds: scope.allowedOrganizationIds,
        role: scope.activeRole,
      },
      context.params.id,
      {
        status: String(body?.status || ""),
        signedAttachmentId:
          body?.signed_attachment_id ?? body?.signedAttachmentId ?? null,
      },
    );

    await recordAuditEvent({
      action: AUDIT_ACTIONS.documentStatusChanged,
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      actorRole: scope.activeRole,
      organizationId: data.organizationId,
      resource: "generated_documents",
      resourceId: data.id,
      metadata: { status: data.status },
    });

    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    const message = String(error?.message || "Impossibile aggiornare");
    return fail(message.includes("Accesso negato") ? 403 : 400, message);
  }
}
