import { NextResponse } from "next/server";
import { canManageClubConfiguration } from "@/lib/access-roles";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";
import {
  isValidationError,
  parseInput,
  validationErrorPayload,
} from "@/lib/validation";
import { documentCancellationSchema } from "@/lib/validation/schemas";
import { cancelDocument } from "@/lib/server/fiscal-documents";
import { isDocumentNumberKind } from "@/lib/documents/numbering";

/**
 * L'**annullamento** di un documento emesso.
 *
 *   POST /api/v1/documents/:kind/:id/cancel   `{ reason }`
 *
 * **Perche una rotta dedicata e non un `PATCH`.** Perche annullare non e
 * modificare: un documento emesso non si modifica affatto (i suoi campi
 * fiscalmente rilevanti sono immutabili), e l'unica cosa che gli puo succedere
 * dopo l'emissione e essere annullato. Una rotta separata rende la distinzione
 * visibile a chi legge l'API, invece di nasconderla dentro un campo `status`
 * che sembra scrivibile come gli altri.
 *
 * **Il numero non si libera.** La sequenza conta cio che e stato **assegnato**,
 * non cio che esiste: un buco nella numerazione e leggibile e spiegabile, lo
 * stesso numero su due documenti no (ADR-0044).
 */

export const runtime = "nodejs";

type Context = { params: { kind: string; id: string } };

const failure = (error: any, fallback: string) => {
  if (isValidationError(error)) {
    return NextResponse.json(validationErrorPayload(error), { status: 400 });
  }

  const message = String(error?.message || fallback);
  const status = message.includes("Accesso negato")
    ? 403
    : message.includes("non trovato")
      ? 404
      : 400;

  return NextResponse.json({ data: null, error: { message } }, { status });
};

export async function POST(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        { data: null, error: { message: "Accesso negato: sessione assente" } },
        { status: 401 },
      );
    }

    const kind = String(context.params.kind || "");
    if (!isDocumentNumberKind(kind)) {
      return failure(new Error("Tipo di documento non riconosciuto"), "");
    }

    const body = parseInput(
      documentCancellationSchema,
      await request.json().catch(() => ({})),
    );

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );

    /*
      **Il gate di ruolo che mancava.** Annullare un documento fiscale numerato
      e definitivo — il numero non torna disponibile (ADR-0044) — e questa
      rotta chiedeva soltanto una sessione valida: qualunque membro del club,
      un genitore compreso, poteva ritirare una fattura emessa. Il permesso e
      lo stesso che governa l'emissione.
    */
    if (!canManageClubConfiguration(scope.activeRole)) {
      throw new Error("Accesso negato per il ruolo attivo");
    }

    const document = await cancelDocument(
      { kind, documentId: context.params.id, reason: body.reason },
      {
        userId: session.db.user_id,
        activeOrganizationId: scope.activeOrganizationId,
        allowedOrganizationIds: scope.allowedOrganizationIds,
      },
    );

    await recordAuditEvent({
      action: AUDIT_ACTIONS.documentIssued,
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      organizationId: String(document.organization_id),
      resource: kind,
      resourceId: String(document.id),
      request,
      metadata: {
        operation: "cancelled",
        number: document.receipt_number || document.invoice_number || null,
        reason: body.reason,
      },
    });

    return NextResponse.json({
      data: {
        id: String(document.id),
        status: document.status,
        cancelledAt: document.cancelled_at,
        number: document.receipt_number || document.invoice_number || null,
      },
      error: null,
    });
  } catch (error) {
    return failure(error, "Errore nell'annullamento del documento");
  }
}
