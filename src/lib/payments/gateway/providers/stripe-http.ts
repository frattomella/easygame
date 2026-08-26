/**
 * Il **trasporto HTTP verso Stripe**: uno solo, per due flussi.
 *
 * **Perche e un modulo a se.** EasyGame parla con Stripe in due modi diversi e
 * per due denari diversi: gli incassi delle famiglie viaggiano sugli account
 * connessi dei club (intestazione `Stripe-Account`), gli abbonamenti EasyGame
 * viaggiano sull'account **centrale** di Cedi Soft (nessuna intestazione).
 * Sono due domini che non si devono mescolare — vedi ADR-0051 — ma la
 * chiamata HTTP e la stessa: chiave segreta, corpo `form-urlencoded`, chiave
 * di idempotenza, e la stessa cura nel non riportare la richiesta dentro un
 * errore.
 *
 * Scriverla due volte avrebbe voluto dire due posti in cui dimenticare
 * l'idempotenza, e due posti in cui l'importo di una famiglia puo finire in un
 * log.
 *
 * **Perche non c'e la libreria `stripe`.** Le operazioni che servono sono una
 * dozzina di chiamate HTTP. L'SDK legherebbe l'astrazione provider-agnostica
 * alla forma degli oggetti di un provider — cioe rinuncerebbe esattamente a
 * cio per cui l'astrazione esiste — e porterebbe una dipendenza nel bundle del
 * server. La verifica della firma, che e la parte in cui l'SDK vale davvero, e
 * implementata a parte e **collaudata** (`stripe-signature.ts`).
 */

import { PaymentGatewayError } from "../contract";

export const STRIPE_API_BASE = "https://api.stripe.com/v1";

export const readStripeSecretKey = () =>
  String(process.env.STRIPE_SECRET_KEY || "").trim();

/**
 * Il corpo di una richiesta Stripe: `form-urlencoded` con le parentesi quadre
 * per le strutture annidate (`payment_intent_data[application_fee_amount]`).
 */
export const encodeStripeForm = (
  values: Record<string, string | number | undefined | null>,
) => {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === "") continue;
    params.append(key, String(value));
  }

  return params.toString();
};

export type StripeRequestOptions = {
  method?: "GET" | "POST";
  body?: Record<string, string | number | undefined | null>;
  /**
   * L'account connesso su cui agire: e cio che rende l'addebito **diretto**.
   *
   * Assente sul flusso degli abbonamenti EasyGame, che agisce sull'account
   * centrale di Cedi Soft. Passarlo per sbaglio li dentro farebbe finire il
   * fatturato di EasyGame sul conto di un club.
   */
  stripeAccount?: string;
  idempotencyKey?: string;
};

export const callStripe = async (
  path: string,
  options: StripeRequestOptions = {},
): Promise<Record<string, any>> => {
  const secretKey = readStripeSecretKey();
  if (!secretKey) {
    throw new PaymentGatewayError(
      "not_configured",
      "Stripe non e configurato: manca la chiave segreta",
      "stripe",
    );
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (options.stripeAccount) {
    headers["Stripe-Account"] = options.stripeAccount;
  }

  /*
    La chiave di idempotenza non e un vezzo: senza, un doppio clic o un
    tentativo ripetuto dopo un timeout di rete crea due checkout, e due
    checkout su una rata sola sono due addebiti a una famiglia.
  */
  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  const method = options.method || (options.body ? "POST" : "GET");

  let response: Response;
  try {
    response = await fetch(`${STRIPE_API_BASE}${path}`, {
      method,
      headers,
      body: options.body ? encodeStripeForm(options.body) : undefined,
    });
  } catch (error: any) {
    throw new PaymentGatewayError(
      "provider_error",
      `Stripe non raggiungibile: ${error?.message || "errore di rete"}`,
      "stripe",
    );
  }

  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    any
  >;

  if (!response.ok) {
    /*
      Il messaggio del provider si riporta, la richiesta no: contiene
      l'importo, l'email di chi paga e la chiave dell'account connesso.
    */
    throw new PaymentGatewayError(
      "provider_error",
      String(payload?.error?.message || `Stripe ha risposto ${response.status}`),
      "stripe",
    );
  }

  return payload;
};
