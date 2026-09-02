import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { reversePaymentTransaction } from "@/lib/server/payment-transactions";
import { requestGatewayRefund } from "@/lib/server/payment-gateway";
import {
  issueInvoiceForTransaction,
  issueReceiptForTransaction,
} from "@/lib/server/fiscal-documents";
import { canManageClubConfigurationAsActor } from "@/lib/access-roles";
import { hasAccountingPermission } from "@/lib/accounting/permissions";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";
import { publicErrorMessage } from "@/lib/server/api-errors";

/**
 * Le azioni su un incasso gia registrato.
 *
 *   POST /api/v1/payment-transactions/:id  {"action":"reverse"}
 *   POST /api/v1/payment-transactions/:id  {"action":"refund"}
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
  /*
    Il messaggio del driver non esce da qui. `publicErrorMessage` lascia
    passare i messaggi di dominio — «Accesso negato» compreso, perche e la
    stringa su cui questa riga decide il 403 — e sostituisce quelli che
    nominano Prisma, Postgres o una query: un identificativo che non e un UUID
    faceva rispondere con l'invocazione Prisma per intero.
  */
  const message = publicErrorMessage(error, fallback);
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

    /*
      **stornare o rimborsare: la chiave che il club ha spuntato deve contare.**

      La lettura della prima nota chiedeva gia `accounting.read`; la
      scrittura chiedeva soltanto il ruolo, che di un gettone personalizzato
      e la **base**. Misurato: lo stesso ruolo a cui il club aveva tolto la
      contabilita non poteva vedere il libro cassa e poteva scriverci dentro.

      Adesso passa la direzione canonica **oppure** chi porta la chiave. Le
      due condizioni non si sommano per comodita: la prima e il perimetro di
      chi amministra il club, la seconda e la delega che il club ha deciso.
    */
    if (
      !canManageClubConfigurationAsActor(scope.activeRole) &&
      !hasAccountingPermission(scope.activeRole, "accounting.reverse")
    ) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Accesso negato: solo il proprietario o un gestore del club puo stornare o rimborsare un incasso",
          },
        },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "reverse").trim();

    if (action === "issue-receipt") {
      const receipt = await issueReceiptForTransaction(
        {
          transactionId: context.params.id,
          description: body?.description,
          /*
            La causale scelta al momento dell'emissione **vale come
            dichiarazione**: l'ha indicata una persona guardando la proposta.
            Assente, il documento resta non classificato e lo dice, invece di
            ereditare in silenzio il valore predefinito del dominio (§5.2).
          */
          operationTypeCode:
            body?.operation_type_code ?? body?.operationTypeCode,
        },
        scope,
      );

      await recordAuditEvent({
        action: AUDIT_ACTIONS.documentIssued,
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
        {
          transactionId: context.params.id,
          description: body?.description,
          operationTypeCode:
            body?.operation_type_code ?? body?.operationTypeCode,
        },
        scope,
      );

      await recordAuditEvent({
        action: AUDIT_ACTIONS.documentIssued,
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

    if (action === "refund") {
      /*
        **Perche il rimborso passa da qui e non da una rotta propria.** Perche
        e un'azione su un incasso gia registrato, come lo storno e come
        l'emissione di un documento: stessa risorsa, stesso controllo di
        ruolo, stesso confine di club. Una rotta a parte avrebbe dovuto
        ricopiare le tre cose, ed e cosi che due percorsi cominciano a
        divergere.

        L'importo e **facoltativo**: assente significa «tutto il rimborsabile»,
        che e il caso piu comune e non deve costringere chi chiama a
        calcolarlo.
      */
      const outcome = await requestGatewayRefund(
        {
          transactionId: context.params.id,
          amountCents:
            body?.amountCents === undefined || body?.amountCents === null
              ? null
              : Number(body.amountCents),
          reason: body?.reason,
          notes: body?.notes,
          actorUserId: session.db.user_id,
        },
        scope,
      );

      await recordAuditEvent({
        action: AUDIT_ACTIONS.paymentRefundRequested,
        actorUserId: session.db.user_id,
        actorEmail: session.db.user.email,
        actorRole: scope.activeRole,
        organizationId: outcome.transaction.organizationId,
        resource: "payment_transactions",
        resourceId: context.params.id,
        request,
        metadata: {
          externalRefundId: outcome.externalRefundId,
          amountCents: outcome.amountCents,
          providerStatus: outcome.status,
          awaitingWebhook: outcome.awaitingWebhook,
          paymentId: outcome.transaction.installmentId,
        },
      });

      /*
        La risposta ha la **stessa forma** di quella di uno storno — rata e
        registro riscritti — perche la schermata la consuma con lo stesso
        codice. Se il webhook e gia arrivato il movimento e qui; se no,
        l'annotazione sull'incasso dice «in elaborazione».
      */
      return NextResponse.json({
        data: {
          refund: {
            status: outcome.status,
            externalRefundId: outcome.externalRefundId,
            amountCents: outcome.amountCents,
            awaitingWebhook: outcome.awaitingWebhook,
            message: outcome.message,
          },
          charge: outcome.charge,
          transactions: outcome.transactions,
        },
        error: null,
      });
    }

    if (action !== "reverse") {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Azione non supportata: un incasso si storna, si rimborsa o produce un documento, non si modifica",
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
      action: AUDIT_ACTIONS.paymentTransactionReversed,
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
