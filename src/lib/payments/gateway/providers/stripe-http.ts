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

  /*
    **Una chiamata che non finisce e peggio di una che fallisce.**

    Non c'era nessun limite di tempo. Dentro il gestore del webhook questa
    chiamata sta **fra** la riga di deduplica gia scritta e la scrittura del
    movimento: se resta appesa finche la funzione viene uccisa dalla
    piattaforma, il codice non riceve nessun errore — quindi non passa da
    nessun `catch`, non segna il tentativo come fallito, e la riga resta come
    se l'evento fosse stato elaborato. Alla riconsegna il provider si sente
    rispondere «gia ricevuto» e smette di ritentare: l'incasso sparisce.

    Un errore lo si puo gestire; una funzione uccisa no. Il limite serve a
    trasformare il secondo caso nel primo.
  */
  const STRIPE_TIMEOUT_MS = Number(
    process.env.STRIPE_HTTP_TIMEOUT_MS || 10_000,
  );

  let response: Response;
  const stopwatch = AbortSignal.timeout(
    Number.isFinite(STRIPE_TIMEOUT_MS) && STRIPE_TIMEOUT_MS > 0
      ? STRIPE_TIMEOUT_MS
      : 10_000,
  );

  try {
    response = await fetch(`${STRIPE_API_BASE}${path}`, {
      method,
      headers,
      body: options.body ? encodeStripeForm(options.body) : undefined,
      signal: stopwatch,
    });
  } catch (error: any) {
    const scaduta = error?.name === "TimeoutError" || stopwatch.aborted;
    throw new PaymentGatewayError(
      "provider_error",
      scaduta
        ? "Stripe non ha risposto entro il tempo massimo"
        : `Stripe non raggiungibile: ${error?.message || "errore di rete"}`,
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

/* ------------------------------------------------------------ la API v2 */

/**
 * L'**API v2** di Stripe, che non e la v1 con un numero diverso.
 *
 * **Perche serve un secondo trasporto invece di un parametro.** Le due API non
 * differiscono per il percorso ma per tre cose che il chiamante non deve
 * ricordarsi ogni volta: il corpo e **JSON** e non `form-urlencoded`, la
 * versione di API e **obbligatoria** in intestazione, e i rami dell'oggetto
 * si chiedono per nome con `include` — quelli non chiesti tornano `null`,
 * indistinguibili da «vuoto». Infilare tre `if` dentro `callStripe`
 * significherebbe che ogni chiamata v1 porta il peso di condizioni che non la
 * riguardano, e che una dimenticanza su una chiamata v2 fallisce a runtime.
 *
 * **Perche la v1 resta dov'e.** Solo il *provisioning* degli account connessi
 * e migrato (ADR-0061). Checkout, addebiti, rimborsi, movimenti di saldo e
 * firma dei webhook continuano sulla v1, che li serve correttamente: Stripe
 * dichiara l'interoperabilita fra le due, e un identificativo di account
 * creato in v2 e accettato dagli endpoint v1. Riscrivere anche quelli sarebbe
 * un rischio preso senza contropartita.
 */
export const STRIPE_API_V2_BASE = "https://api.stripe.com/v2";

/**
 * La versione di API dichiarata sulle chiamate v2.
 *
 * **Perche e fissata qui e non lasciata al default dell'account.** Sulla v2
 * non esiste un default: senza intestazione Stripe risponde `400`. E fissarla
 * nel codice invece che seguire quella dell'account significa che
 * l'aggiornamento della versione sul cruscotto non cambia da solo la forma
 * degli oggetti che questo modulo interpreta.
 */
export const STRIPE_API_VERSION = "2026-07-29.dahlia";

export type StripeV2RequestOptions = {
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  /**
   * I rami da popolare nella risposta.
   *
   * Non e un'ottimizzazione: cio che non si chiede torna `null` anche quando
   * un valore c'e. Leggere `configuration.merchant` senza averlo incluso vuol
   * dire leggere «nessuna capacita» su un account che incassa.
   */
  include?: string[];
  idempotencyKey?: string;
};

export const callStripeV2 = async (
  path: string,
  options: StripeV2RequestOptions = {},
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
    "Content-Type": "application/json",
    "Stripe-Version": STRIPE_API_VERSION,
  };

  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  const method = options.method || (options.body ? "POST" : "GET");
  const include = (options.include || []).filter(Boolean);

  /*
    `include` viaggia nel corpo quando c'e un corpo, e in query quando non c'e:
    una GET con un corpo JSON non e una richiesta che Stripe accetta.
  */
  const query =
    method === "GET" && include.length
      ? `?${include.map((entry) => `include=${encodeURIComponent(entry)}`).join("&")}`
      : "";

  const body =
    method === "GET"
      ? undefined
      : JSON.stringify({
          ...(options.body || {}),
          ...(include.length ? { include } : {}),
        });

  let response: Response;
  try {
    response = await fetch(`${STRIPE_API_V2_BASE}${path}${query}`, {
      method,
      headers,
      body,
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
      Come sulla v1: il messaggio del provider si riporta, la richiesta no.
    */
    throw new PaymentGatewayError(
      "provider_error",
      String(payload?.error?.message || `Stripe ha risposto ${response.status}`),
      "stripe",
    );
  }

  return payload;
};
