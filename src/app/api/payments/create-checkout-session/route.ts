import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { openCediPayCheckout } from "@/lib/server/cedipay";
import { CediPayError } from "@/lib/payments/cedipay";

/**
 * Apre un checkout online per una rata.
 *
 *   POST /api/payments/create-checkout-session
 *
 * **Cosa arriva dal client e cosa no.** Dal client arrivano la rata, l'importo
 * e dove tornare. **Non** arrivano — e non verrebbero creduti — il provider,
 * il conto su cui il denaro finisce e la commissione della piattaforma:
 * quelli li dicono le impostazioni del club. Un client che potesse scegliere
 * il provider sceglierebbe quello con meno controlli; un client che potesse
 * scegliere il conto sceglierebbe il proprio.
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
  soltanto per «quel provider non e stato scritto»: gli altri tre non sono
  funzioni mancanti, sono configurazioni mancanti, e dirlo con lo stesso
  codice li farebbe sembrare tutti un problema di chi scrive il software.
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

    const body = (await request.json().catch(() => ({}))) as Record<string, any>;
    const clubId = String(body.clubId || body.club_id || "").trim();
    const successUrl = String(body.successUrl || body.success_url || "").trim();
    const cancelUrl = String(body.cancelUrl || body.cancel_url || "").trim();

    if (!clubId) {
      return jsonError("Club non disponibile");
    }

    if (!successUrl || !cancelUrl) {
      return jsonError("URL di ritorno obbligatori");
    }

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id") || clubId,
    );

    if (!scope.allowedOrganizationIds.includes(clubId)) {
      return jsonError("Accesso negato al club", 403);
    }

    const { checkout, context } = await openCediPayCheckout({
      organizationId: clubId,
      paymentId: body.paymentId || body.payment_id || null,
      athleteId: body.athleteId || body.athlete_id || null,
      amountCents: Math.round(Number(body.amountCents || body.amount_cents || 0)),
      description: String(body.description || ""),
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
        platformFeeCents: checkout.platformFeeCents,
      },
      error: null,
    });
  } catch (error: any) {
    if (error instanceof CediPayError) {
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
