import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { reversePaymentTransaction } from "@/lib/server/payment-transactions";
import { canManageClubConfiguration } from "@/lib/access-roles";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";

/**
 * Storno di un incasso.
 *
 *   POST /api/v1/payment-transactions/:id/reverse  →  qui, come `action`
 *
 * Non esiste un `DELETE`, ed e una scelta: un incasso cancellato non lascia
 * traccia di essere esistito, e cio che si vuole sapere di un errore di cassa
 * e proprio che c'e stato. Lo storno marca l'originale e registra il
 * movimento di segno opposto (ADR-0036).
 *
 * Per correggere un importo sbagliato: si storna e si registra di nuovo.
 */

export const runtime = "nodejs";

type Context = { params: { id: string } };

const unauthorized = () =>
  NextResponse.json(
    { data: null, error: { message: "Accesso negato: sessione assente" } },
    { status: 401 },
  );

const failure = (error: any, fallback: string) => {
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
    if (!session) return unauthorized();

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );

    if (!canManageClubConfiguration(scope.activeRole)) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Accesso negato: solo il proprietario o un gestore del club puo stornare un incasso",
          },
        },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "reverse").trim();

    if (action !== "reverse") {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Azione non supportata: un incasso si storna, non si modifica",
          },
        },
        { status: 400 },
      );
    }

    const result = await reversePaymentTransaction(
      { transactionId: context.params.id, reason: body?.reason },
      scope,
    );

    await recordAuditEvent({
      action: AUDIT_ACTIONS.resourceUpdated,
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      actorRole: scope.activeRole,
      organizationId: result.transaction.organizationId,
      resource: "payment_transactions",
      resourceId: context.params.id,
      request,
      metadata: {
        reversalTransactionId: result.transaction.id,
        paymentId: result.transaction.installmentId,
        amount: result.transaction.amount,
        reason: result.transaction.notes,
      },
    });

    return NextResponse.json({ data: result, error: null });
  } catch (error: any) {
    return failure(error, "Storno dell'incasso non riuscito");
  }
}
