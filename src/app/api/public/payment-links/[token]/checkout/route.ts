import { NextResponse } from "next/server";
import { reportServerError } from "@/lib/server/observability";
import {
  AUTH_RATE_LIMITS,
  consumeRequestRateLimits,
  getRequestIp,
  rateLimitHeaders,
} from "@/lib/server/auth-rate-limit";
import {
  PAYMENT_LINK_NOT_AVAILABLE_MESSAGE,
  buildPaymentLinkReturnUrls,
  hashPaymentLinkToken,
  openPaymentLinkCheckout,
  resolvePaymentLinkOrigin,
} from "@/lib/server/payment-links";
import { PaymentGatewayError } from "@/lib/payments/gateway";

/**
 * L'apertura del pagamento da un link pubblico (G-06, W2-B).
 *
 *   POST /api/public/payment-links/:token/checkout
 *
 * **Gli URL di ritorno li costruisce il server, e non e un dettaglio.** Se
 * `successUrl` e `cancelUrl` arrivassero dal corpo della richiesta, questa
 * rotta diventerebbe un **redirector aperto**: chiunque avesse un token
 * potrebbe far tornare il browser di chi paga su un indirizzo scelto da lui,
 * con l'aria di venire da EasyGame e subito dopo un pagamento — cioe nel
 * momento in cui una persona e piu disposta a fidarsi di quello che legge.
 * Qui il ritorno e sempre la pagina del link, che mostra il residuo
 * ricalcolato invece di dichiarare un esito che solo il webhook conosce.
 *
 * **Il denaro passa dal checkout di sempre.** `openGatewayCheckout`, con la
 * stessa chiave di idempotenza, la stessa commissione e lo stesso webhook che
 * registra l'incasso. Nessun secondo percorso del denaro.
 *
 * **Rata gia saldata: `200`, non un errore.** E la risposta piu frequente che
 * questa rotta dara, ed e una buona notizia da dare.
 */

export const runtime = "nodejs";

type Context = { params: { token: string } };

const tooManyRequests = (result: {
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  allowed: boolean;
}) =>
  NextResponse.json(
    {
      data: null,
      error: {
        message: "Troppe richieste. Riprova fra qualche minuto.",
        code: "RATE_LIMITED",
      },
    },
    { status: 429, headers: rateLimitHeaders(result) },
  );

/*
  Un blocco per gradino, con lo stato che gli corrisponde: sono le stesse
  corrispondenze della rotta autenticata, perche il gradino e lo stesso.
*/
const STATUS_BY_CODE: Record<string, number> = {
  not_implemented: 501,
  not_configured: 503,
  merchant_not_ready: 409,
  provider_error: 502,
  invalid_signature: 400,
};

export async function POST(request: Request, context: Context) {
  try {
    const token = String(context.params.token || "");

    const limited = await consumeRequestRateLimits([
      {
        policy: AUTH_RATE_LIMITS.paymentLinkCheckoutIp,
        identifier: getRequestIp(request),
      },
      {
        policy: AUTH_RATE_LIMITS.paymentLinkCheckoutToken,
        identifier: hashPaymentLinkToken(token) || "vuoto",
      },
    ]);

    if (limited) return tooManyRequests(limited);

    const { successUrl, cancelUrl } = buildPaymentLinkReturnUrls(
      resolvePaymentLinkOrigin(request),
      token,
    );

    const result = await openPaymentLinkCheckout({
      token,
      successUrl,
      cancelUrl,
      request,
    });

    if (result.status === "not_available") {
      return NextResponse.json(
        { data: null, error: { message: PAYMENT_LINK_NOT_AVAILABLE_MESSAGE } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: result, error: null });
  } catch (error: any) {
    if (error instanceof PaymentGatewayError) {
      /*
        Il messaggio del gateway parla di configurazione del club, non di
        codice: e giusto che chi paga legga «la societa non puo incassare
        online in questo momento» invece di un errore generico.
      */
      return NextResponse.json(
        {
          data: null,
          error: { message: error.message, code: error.code },
        },
        { status: STATUS_BY_CODE[error.code] || 400 },
      );
    }

    reportServerError(error, {
      metadata: { esito: "[payment-links/checkout] apertura non riuscita" },
    });

    return NextResponse.json(
      { data: null, error: { message: "Errore nell'apertura del pagamento" } },
      { status: 500 },
    );
  }
}
