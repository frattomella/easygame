import { NextResponse } from "next/server";
import { assertActiveClub } from "@/lib/auth/active-club-boundary";
import { hasAccountingPermission } from "@/lib/accounting/permissions";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";
import {
  normalizePaymentTransactions,
  resolveInstallmentLedger,
} from "@/lib/payments/installment-ledger";

/**
 * Lo stato di un pagamento online **secondo il server**.
 *
 *   GET /api/payments/checkout-status?payment_id=…&external_id=…
 *
 * **Perche esiste.** Perche il ritorno dal checkout non e una fonte. Chi paga
 * torna su una pagina che dice «grazie», ma in quell'istante il webhook puo
 * non essere ancora arrivato — e con SEPA o bonifico arrivera fra giorni. Le
 * due scelte possibili erano: dire «pagato» e a volte mentire, oppure dire
 * «pagamento in verifica» e lasciare che sia il server a cambiare idea.
 *
 * Questa rotta serve la seconda: l'interfaccia la interroga e mostra
 * «pagamento in verifica» finche non compare **l'incasso nel registro**. Non
 * chiede niente a Stripe — sarebbe una chiamata di rete su un percorso di
 * lettura, e uno stato che il registro non ha ancora non e uno stato che
 * EasyGame puo usare.
 */

export const runtime = "nodejs";

const unauthorized = () =>
  NextResponse.json(
    { data: null, error: { message: "Accesso negato: sessione assente" } },
    { status: 401 },
  );

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return unauthorized();

    const url = new URL(request.url);
    const paymentId = String(url.searchParams.get("payment_id") || "").trim();
    const externalId = String(url.searchParams.get("external_id") || "").trim();

    if (!paymentId) {
      return NextResponse.json(
        { data: null, error: { message: "Rata non indicata" } },
        { status: 400 },
      );
    }

    const charge = await (prisma as any).athletePayment.findUnique({
      where: { id: paymentId },
    });

    if (!charge) {
      return NextResponse.json(
        { data: null, error: { message: "Rata non trovata" } },
        { status: 404 },
      );
    }

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
    );

    /*
      Il confine e il club **attivo** — vedi
      `src/lib/auth/active-club-boundary.ts`. E il permesso: questa risposta
      contiene lo storico degli incassi di una famiglia, con importi, date e
      metodi. Non aveva nessun controllo di ruolo, e qualunque membro del club
      leggeva la posizione economica di chiunque altro, conoscendone la rata.
    */
    assertActiveClub(scope, charge.organization_id, "la rata");

    if (!hasAccountingPermission(scope.activeRole, "accounting.read")) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Accesso negato: lo storico degli incassi di una famiglia lo legge chi tiene i conti del club",
          },
        },
        { status: 403 },
      );
    }

    const rows = await (prisma as any).paymentTransaction.findMany({
      where: { payment_id: paymentId },
      orderBy: [{ paid_at: "asc" }, { created_at: "asc" }],
    });

    const transactions = normalizePaymentTransactions(rows);
    const ledger = resolveInstallmentLedger({ charge, transactions });

    /*
      Se il chiamante sa quale checkout ha aperto, si risponde a «quel»
      pagamento: senza, «e arrivato qualcosa dopo che ho premuto Paga» sarebbe
      vero anche per un bonifico registrato a mano nel frattempo.
    */
    const settled = externalId
      ? rows.find(
          (row: any) =>
            String(row.external_reference) === externalId ||
            String(row.external_payment_id) === externalId,
        )
      : rows.find((row: any) => String(row.source) === "STRIPE");

    return NextResponse.json({
      data: {
        paymentId,
        /*
          Tre stati e non due: «in verifica» e uno stato vero, non l'assenza di
          uno stato, ed e quello in cui una famiglia si trova nei secondi — o
          nei giorni — fra il pagamento e la conferma.
        */
        state: settled ? "settled" : "pending_confirmation",
        ledger: {
          dueAmount: ledger.dueAmount,
          paidAmount: ledger.paidAmount,
          residualAmount: ledger.residualAmount,
          state: ledger.state,
        },
        transactionId: settled ? String(settled.id) : null,
      },
      error: null,
    });
  } catch (error: any) {
    const message = String(error?.message || "");
    return NextResponse.json(
      {
        data: null,
        error: { message: message || "Errore nella lettura dello stato" },
      },
      { status: message.includes("Accesso negato") ? 403 : 400 },
    );
  }
}
