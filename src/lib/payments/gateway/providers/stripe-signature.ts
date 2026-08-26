/**
 * Verifica della firma di un webhook Stripe, senza SDK.
 *
 * **Perche esiste, e perche e la parte piu importante di tutta l'integrazione.**
 * L'endpoint del webhook e pubblico: chiunque puo mandargli una richiesta.
 * Senza verifica, «il pagamento e riuscito» e una frase che puo scrivere
 * chiunque conosca l'indirizzo, e un incasso mai avvenuto entra in
 * contabilita. La firma e cio che distingue un evento del PSP da un POST.
 *
 * **Lo schema, dalla documentazione Stripe.** L'intestazione
 * `Stripe-Signature` e una riga sola di elementi `chiave=valore` separati da
 * virgola: `t` e il momento in cui l'evento e stato firmato, `v1` e la firma.
 * Il messaggio firmato e la concatenazione `timestamp + "." + corpo grezzo`,
 * e la firma e un HMAC-SHA256 con la chiave di firma dell'endpoint.
 *
 * **Tre regole che sembrano dettagli e non lo sono.**
 *
 * 1. *Solo `v1`.* Stripe manda anche un `v0` finto sugli eventi di test.
 *    Accettare uno schema qualunque significa accettare quello piu debole
 *    che qualcuno riuscira a proporre: e un attacco di downgrade.
 * 2. *Confronto a tempo costante.* Confrontare due firme con `===` fa
 *    trapelare, nel tempo di risposta, quanti caratteri iniziali erano
 *    giusti. Con abbastanza tentativi la firma si costruisce un carattere
 *    alla volta.
 * 3. *Tolleranza sul timestamp.* La firma resta valida per sempre: senza un
 *    limite temporale, chi intercetta un evento valido puo rimandarlo domani
 *    e farlo contare una seconda volta. Cinque minuti e il valore delle
 *    librerie ufficiali. Zero **disabilita** il controllo, quindi zero non e
 *    un valore ammesso qui.
 *
 * Il modulo usa solo `node:crypto`: si prova con vettori costruiti a mano,
 * senza rete e senza credenziali. Ed e bene che sia cosi, perche e l'unica
 * parte dell'integrazione che si puo davvero collaudare senza un account.
 */

import { createHmac, timingSafeEqual } from "crypto";

/** La tolleranza delle librerie ufficiali Stripe. */
export const STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300;

export type StripeSignatureHeader = {
  timestamp: number;
  /** Le firme `v1`. Possono essere piu di una durante la rotazione del segreto. */
  signatures: string[];
};

export class StripeSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeSignatureError";
  }
}

/**
 * Scompone l'intestazione.
 *
 * Tutto cio che non e `t` o `v1` viene ignorato: Stripe si riserva di
 * aggiungere elementi, e un parser che si rompe su cio che non conosce si
 * rompe a un rilascio del PSP.
 */
export const parseStripeSignatureHeader = (
  header: string,
): StripeSignatureHeader => {
  const parts = String(header || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  let timestamp = 0;
  const signatures: string[] = [];

  for (const part of parts) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;

    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();

    if (key === "t") {
      timestamp = Number(value);
      continue;
    }

    /* Solo `v1`: vedi la nota sul downgrade in testa al file. */
    if (key === "v1" && value) {
      signatures.push(value);
    }
  }

  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    throw new StripeSignatureError(
      "Intestazione di firma senza un momento valido",
    );
  }

  if (!signatures.length) {
    throw new StripeSignatureError("Intestazione di firma senza firme v1");
  }

  return { timestamp, signatures };
};

/** Il messaggio firmato: `timestamp.corpo grezzo`. */
export const buildStripeSignedPayload = (timestamp: number, rawBody: string) =>
  `${timestamp}.${rawBody}`;

export const computeStripeSignature = (
  signedPayload: string,
  secret: string,
) => createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");

const equalsInConstantTime = (left: string, right: string) => {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");

  /*
    `timingSafeEqual` esige la stessa lunghezza. Uscire subito su lunghezze
    diverse non fa trapelare niente di utile: la lunghezza di un HMAC-SHA256
    in esadecimale e nota e costante, quindi una lunghezza diversa vuol dire
    soltanto «non e una firma».
  */
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
};

/**
 * Verifica una firma. Non lancia: restituisce l'esito e il motivo.
 *
 * Il motivo serve a chi legge i log dell'applicazione, **non** a chi ha
 * mandato la richiesta: la risposta HTTP di un webhook rifiutato non deve
 * spiegare quale delle due condizioni non era soddisfatta.
 */
export const verifyStripeSignature = (input: {
  rawBody: string;
  header: string;
  secret: string;
  now?: Date;
  toleranceSeconds?: number;
}): { valid: boolean; reason?: "malformed" | "stale" | "mismatch" } => {
  const tolerance = Math.max(
    1,
    Math.trunc(input.toleranceSeconds ?? STRIPE_WEBHOOK_TOLERANCE_SECONDS),
  );

  let parsed: StripeSignatureHeader;
  try {
    parsed = parseStripeSignatureHeader(input.header);
  } catch {
    return { valid: false, reason: "malformed" };
  }

  if (!input.secret) {
    return { valid: false, reason: "malformed" };
  }

  const nowSeconds = Math.floor((input.now?.getTime() ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - parsed.timestamp) > tolerance) {
    return { valid: false, reason: "stale" };
  }

  const expected = computeStripeSignature(
    buildStripeSignedPayload(parsed.timestamp, input.rawBody),
    input.secret,
  );

  const matches = parsed.signatures.some((candidate) =>
    equalsInConstantTime(candidate, expected),
  );

  return matches ? { valid: true } : { valid: false, reason: "mismatch" };
};
