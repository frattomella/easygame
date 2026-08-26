import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  issueInvoiceForTransaction,
  issueReceiptForTransaction,
  reversePaymentTransaction,
} from "@/lib/server/payment-transactions";
import { canManageClubConfiguration } from "@/lib/access-roles";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";

/**
 * Le azioni su un incasso gia registrato.
 *
 *   POST /api/v1/payment-transactions/:id  {"action":"reverse"}
 *   POST /api/v1/payment-transactions/:id  {"action":"issue-receipt"}
 *   POST /api/v1/payment-transactions/:id  {"action":"issue-invoice"}
 *
 * Non esiste un `DELETE`, ed e una scelta: un incasso cancellato non lascia
 * traccia di essere esistito, e cio che si vuole sapere di un errore di cassa
 * e proprio che c'e stato. Lo storno marca l'originale e registra il
 * movimento di segno opposto (ADR-0036).
 *
 * Per correggere un importo sbagliato: si storna e si registra di nuovo.
 *
 * **Ricevuta o fattura, non entrambe per abitudine.** Una ricevuta attesta
 * che del denaro e arrivato; una fattura e un documento fiscale con un
 * intestatario e una numerazione propria, e la maggior parte delle ASD non ne
 * emette affatto. Il documento si **sceglie** a partire dallo stesso incasso,
 * e i due registri di numerazione restano distinti (ADR-0044).
 *
 * La ricevuta si emette **per incasso**, non per rata: e l'incasso che va
 * documentato, e una rata pagata in tre volte ne produce tre. L'emissione e
 * idempotente — chiederla due volte restituisce la stessa ricevuta.
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

    if (action === "issue-receipt") {
      const receipt = await issueReceiptForTransaction(
        { transactionId: context.params.id, description: body?.description },
        scope,
      );

      await recordAuditEvent({
        action: AUDIT_ACTIONS.resourceCreated,
        actorUserId: session.db.user_id,
        actorEmail: session.db.user.email,
        actorRole: scope.activeRole,
        organizationId: receipt.organization_id,
        resource: "receipts",
        resourceId: receipt.id,
        request,
        metadata: {
          transactionId: context.params.id,
          receiptNumber: receipt.receipt_number,
          amount: receipt.amount,
        },
      });

      return NextResponse.json({ data: receipt, error: null }, { status: 201 });
    }

    if (action === "issue-invoice") {
      const invoice = await issueInvoiceForTransaction(
        { transactionId: context.params.id, description: body?.description },
        scope,
      );

      await recordAuditEvent({
        action: AUDIT_ACTIONS.resourceCreated,
        actorUserId: session.db.user_id,
        actorEmail: session.db.user.email,
        actorRole: scope.activeRole,
        organizationId: invoice.organization_id,
        resource: "invoices",
        resourceId: invoice.id,
        request,
        metadata: {
          transactionId: context.params.id,
          invoiceNumber: invoice.invoice_number,
          amount: invoice.amount,
        },
      });

      return NextResponse.json({ data: invoice, error: null }, { status: 201 });
    }

    if (action !== "reverse") {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Azione non supportata: un incasso si storna o produce un documento, non si modifica",
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
