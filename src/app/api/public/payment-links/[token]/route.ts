import { NextResponse } from "next/server";
import {
  AUTH_RATE_LIMITS,
  consumeRequestRateLimits,
  getRequestIp,
  rateLimitHeaders,
} from "@/lib/server/auth-rate-limit";
import {
  PAYMENT_LINK_NOT_AVAILABLE_MESSAGE,
  hashPaymentLinkToken,
  readPaymentLinkPublicView,
} from "@/lib/server/payment-links";

/**
 * La vista pubblica di un link di pagamento (G-06, W2-B).
 *
 *   GET /api/public/payment-links/:token
 *
 * **La superficie piu esposta del prodotto**: nessuna sessione, Internet
 * aperto, un pagamento dietro. Da qui escono il nome della societa, il nome
 * dell'atleta, la descrizione della rata e **quanto resta ricalcolato adesso**.
 * Non escono identificativi interni: chi ha il link non ha per questo il
 * diritto di sapere come sono fatte le chiavi dell'archivio di un club.
 *
 * **Una risposta sola per tutti i casi negativi.** Token sconosciuto, scaduto,
 * revocato, o che punta a una rata sparita: sempre `404` con lo stesso
 * messaggio. Distinguerli direbbe a chi prova token a caso quando ha
 * indovinato — e la stessa regola gia adottata dallo slug dei moduli pubblici.
 *
 * **Due contatori, non uno.** Per token e per indirizzo: con il solo contatore
 * per indirizzo chi cambia rete continuerebbe sullo stesso link; con il solo
 * contatore per token ogni tentativo su un token nuovo ripartirebbe da zero,
 * che e la forma esatta di un attacco a forza bruta. Il conteggio per token
 * usa l'**impronta**, mai il token: i contatori non devono diventare un posto
 * in piu da cui leggere un link funzionante.
 *
 * Il rate limit si consuma **prima** di toccare il database: un tentativo
 * fermato non deve costare una query.
 */

export const runtime = "nodejs";

type Context = { params: { token: string } };

const notAvailable = () =>
  NextResponse.json(
    { data: null, error: { message: PAYMENT_LINK_NOT_AVAILABLE_MESSAGE } },
    { status: 404 },
  );

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

export async function GET(request: Request, context: Context) {
  try {
    const token = String(context.params.token || "");

    const limited = await consumeRequestRateLimits([
      {
        policy: AUTH_RATE_LIMITS.paymentLinkViewIp,
        identifier: getRequestIp(request),
      },
      {
        policy: AUTH_RATE_LIMITS.paymentLinkViewToken,
        identifier: hashPaymentLinkToken(token) || "vuoto",
      },
    ]);

    if (limited) return tooManyRequests(limited);

    const view = await readPaymentLinkPublicView(token, { request });

    if (view.status === "not_available") return notAvailable();

    return NextResponse.json({ data: view, error: null });
  } catch (error: any) {
    /*
      A un estraneo non si raccontano gli errori interni; a chi tiene su il
      servizio si, ed e l'unico posto in cui il motivo resta leggibile. Il
      token non entra nemmeno nei log: e una credenziale.
    */
    console.error("[payment-links/public] lettura non riuscita", {
      message: String(error?.message || error),
    });
    return NextResponse.json(
      { data: null, error: { message: "Errore nel caricamento del link" } },
      { status: 500 },
    );
  }
}
