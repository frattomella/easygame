import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { openGatewayCheckout } from "@/lib/server/payment-gateway";
import { requireClubEntitlement } from "@/lib/server/entitlements";
import { isPlatformAdminUser } from "@/lib/platform-admin";
import { PaymentGatewayError } from "@/lib/payments/gateway";
import {
  isValidationError,
  parseInput,
  validationErrorPayload,
} from "@/lib/validation";
import { checkoutSessionInputSchema } from "@/lib/validation/schemas";
import { prisma } from "@/lib/server/prisma";
import {
  normalizePaymentTransactions,
  resolveInstallmentLedger,
} from "@/lib/payments/installment-ledger";

/**
 * Apre un checkout online per una rata.
 *
 *   POST /api/payments/create-checkout-session
 *
 * **Cosa arriva dal client e cosa no.** Dal client arrivano la rata, l'importo
 * e dove tornare. **Non** arrivano — e non verrebbero creduti — il provider, il
 * conto su cui il denaro finisce e la commissione della piattaforma: quelli li
 * dicono la configurazione di piattaforma e l'account connesso della societa.
 * Un client che potesse scegliere il provider sceglierebbe quello con meno
 * controlli; uno che potesse scegliere il conto sceglierebbe il proprio.
 *
 * **L'importo si valida contro il residuo.** Il client propone; il server
 * verifica che la rata esista, sia del club giusto e abbia ancora scoperto
 * almeno quell'importo. Un checkout aperto per piu del dovuto sarebbe denaro
 * incassato in eccesso che poi qualcuno deve rimborsare — e un rimborso costa
 * a tutti.
 *
 * **Il pagamento parziale e ammesso.** Il registro incassi sa gia gestire una
 * rata pagata in piu volte (ADR-0036): non c'e ragione perche il canale online
 * sia piu rigido di quello allo sportello.
 *
 * **Perche il ritorno del browser non conclude niente.** L'URL di successo
 * mostra una pagina, non registra un incasso: chi paga puo chiudere la
 * finestra, e con SEPA o bonifico il denaro arriva giorni dopo. L'incasso lo
 * registra il webhook, su un evento firmato (ADR-0045).
 */

export const runtime = "nodejs";

const jsonError = (
  message: string,
  status = 400,
  details: Record<string, unknown> = {},
) => NextResponse.json({ data: null, error: { message, ...details } }, { status });

/*
  Un blocco per gradino, con lo stato HTTP che gli corrisponde. `501` resta
  soltanto per «quel provider non e stato scritto»: gli altri non sono funzioni
  mancanti, sono configurazioni mancanti, e dirlo con lo stesso codice li
  farebbe sembrare tutti un problema di chi scrive il software.
*/
const STATUS_BY_CODE: Record<string, number> = {
  not_implemented: 501,
  not_configured: 503,
  merchant_not_ready: 409,
  provider_error: 502,
  invalid_signature: 400,
};

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return jsonError("Sessione non valida", 401);
    }

    const body = parseInput(
      checkoutSessionInputSchema,
      await request.json().catch(() => ({})),
    );

    const clubId = String(body.clubId || body.club_id || "").trim();
    const successUrl = String(body.successUrl || body.success_url || "").trim();
    const cancelUrl = String(body.cancelUrl || body.cancel_url || "").trim();
    const paymentId = String(body.paymentId || body.payment_id || "").trim();

    if (!successUrl || !cancelUrl) {
      return jsonError("URL di ritorno obbligatori");
    }

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id") || clubId,
    );

    /*
      **Il club lo dice la sessione, non il corpo della richiesta.** Era gia
      scritto qui sopra — «dal client arrivano la rata, l'importo e dove
      tornare» — e lo dichiarava anche lo schema, dove `clubId` e
      facoltativo: solo che il controllo pretendeva comunque di trovarlo nel
      corpo, e
      l'unica schermata che apre un checkout non lo manda. Il risultato era un
      pulsante «Paga online» che rispondeva sempre «Club non disponibile», e
      nessun test se n'era accorto perche nessuno chiamava la rotta come la
      chiama l'interfaccia.

      Quando il corpo lo porta comunque — un chiamante piu vecchio — vince
      quello: e un vincolo in piu, non uno in meno, e resta soggetto ai due
      controlli qui sotto.
    */
    const organizationId = clubId || String(scope.activeOrganizationId || "");

    if (!organizationId) {
      return jsonError("Club non disponibile");
    }

    if (!scope.allowedOrganizationIds.includes(organizationId)) {
      return jsonError("Accesso negato al club", 403);
    }

    /*
      Il gating vero, non la sua descrizione. Il messaggio arriva dal calcolo
      degli entitlement — «Disponibile con il piano Plus», «L'abbonamento non e
      in corso» — perche sono due cose che si risolvono in modi diversi, e un
      «Accesso negato» generico le farebbe finire entrambe al telefono.
    */
    await requireClubEntitlement({
      organizationId,
      key: "online_payments",
      isPlatformAdmin: isPlatformAdminUser(session.db.user),
    });

    let amountCents = Math.round(
      Number(body.amountCents || body.amount_cents || 0),
    );
    let description = String(body.description || "");
    let athleteId = String(body.athleteId || body.athlete_id || "").trim() || null;

    if (paymentId) {
      const charge = await (prisma as any).athletePayment.findUnique({
        where: { id: paymentId },
      });

      if (!charge) {
        return jsonError("Rata non trovata", 404);
      }

      /*
        La rata comanda sul club: aprire un checkout su una rata che non e
        del club attivo permetterebbe di incassare per un'altra societa
        purche si abbia accesso alla propria.
      */
      if (String(charge.organization_id) !== organizationId) {
        return jsonError("Accesso negato: la rata appartiene a un altro club", 403);
      }

      const transactions = normalizePaymentTransactions(
        await (prisma as any).paymentTransaction.findMany({
          where: { payment_id: paymentId },
        }),
      );

      const ledger = resolveInstallmentLedger({ charge, transactions });
      const residualCents = Math.round(ledger.residualAmount * 100);

      if (residualCents <= 0) {
        return jsonError("Questa rata e gia saldata", 409);
      }

      /* Nessun importo dal client = il residuo, che e cio che si paga di solito. */
      if (!amountCents) amountCents = residualCents;

      if (amountCents > residualCents) {
        return jsonError(
          `L'importo supera il residuo della rata (${ledger.residualAmount.toFixed(2)} €)`,
        );
      }

      description = description || String(charge.description || "Quota sportiva");
      athleteId = athleteId || (charge.athlete_id ? String(charge.athlete_id) : null);
    }

    if (!amountCents || amountCents <= 0) {
      return jsonError("Importo del pagamento non valido");
    }

    const { checkout, context, settlement } = await openGatewayCheckout({
      organizationId,
      paymentId: paymentId || null,
      athleteId,
      amountCents,
      description,
      successUrl,
      cancelUrl,
      payer: {
        email: body?.payer?.email,
        name: body?.payer?.name,
      },
      actorUserId: session.db.user_id,
    });

    return NextResponse.json({
      data: {
        checkoutUrl: checkout.url,
        provider: context.provider,
        externalId: checkout.externalId,
        amountCents: checkout.money.amountCents,
        /*
          La commissione si restituisce perche la segreteria la veda **prima**
          di mandare la famiglia a pagare: una trattenuta che si scopre
          sull'estratto conto e una telefonata.
        */
        platformFeeCents: settlement.platformFeeCents,
        clubNetAmountCents: settlement.netAmountCents,
      },
      error: null,
    });
  } catch (error: any) {
    if (isValidationError(error)) {
      return NextResponse.json(validationErrorPayload(error), { status: 400 });
    }

    if (error instanceof PaymentGatewayError) {
      return jsonError(error.message, STATUS_BY_CODE[error.code] || 400, {
        code: error.code,
        provider: error.provider,
      });
    }

    const message = String(error?.message || "");
    if (message.includes("Accesso negato")) {
      return jsonError(message, 403);
    }

    console.error("[payments/create-checkout-session]", message);
    return jsonError("Errore nell'apertura del pagamento online", 500);
  }
}
