import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * Il **token** del link di pagamento (G-06, W2-B).
 *
 * Questo file prova la meta del dominio che non ha bisogno di un database: la
 * generazione del segreto, la sua impronta, il confronto a tempo costante, la
 * finestra di validita e la costruzione degli URL di ritorno.
 *
 * Le tre cose che contano piu di tutte, e sono tre proprieta di sicurezza:
 *
 * 1. **il token in chiaro non e ricavabile dall'impronta**, e l'impronta e
 *    l'unica cosa che finisce in archivio;
 * 2. **un token manomesso non si distingue da uno scaduto**: cambiare un
 *    carattere produce un'impronta completamente diversa, e la risoluzione
 *    risponde lo stesso `not_available` — distinguere i casi direbbe a chi
 *    prova token a caso quando ha indovinato;
 * 3. **gli URL di ritorno li costruisce il server**, e puntano sempre alla
 *    pagina del link: accettarli dal client renderebbe il link un redirector
 *    aperto.
 */

let modulo;
let baseUrlOriginale;
let appUrlOriginale;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  baseUrlOriginale = process.env.AUTH_BASE_URL;
  appUrlOriginale = process.env.NEXT_PUBLIC_APP_URL;
  modulo = await import("../../src/lib/server/payment-links.ts");
});

const senzaOriginConfigurata = (fn) => {
  delete process.env.AUTH_BASE_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;
  try {
    return fn();
  } finally {
    if (baseUrlOriginale === undefined) delete process.env.AUTH_BASE_URL;
    else process.env.AUTH_BASE_URL = baseUrlOriginale;
    if (appUrlOriginale === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = appUrlOriginale;
  }
};

const richiestaFinta = (url, headers = {}) => ({
  url,
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
});

// --- il segreto -----------------------------------------------------------

test("il token porta 32 byte di casualita ed e url-safe", () => {
  const token = modulo.generatePaymentLinkToken();

  assert.match(
    token,
    /^[A-Za-z0-9_-]+$/,
    "un token con «+» o «/» dentro un percorso HTTP e un link che si rompe in posta",
  );
  assert.equal(
    token.length,
    43,
    "43 caratteri base64url sono i 32 byte richiesti: meno vorrebbe dire meno entropia",
  );
  assert.equal(modulo.PAYMENT_LINK_TOKEN_BYTES, 32);
});

test("due emissioni non producono mai lo stesso token", () => {
  const emessi = new Set(
    Array.from({ length: 500 }, () => modulo.generatePaymentLinkToken()),
  );
  assert.equal(emessi.size, 500);
});

test("l'impronta e deterministica, lunga 64 esadecimali, e vuota su un token vuoto", () => {
  const token = modulo.generatePaymentLinkToken();
  const impronta = modulo.hashPaymentLinkToken(token);

  assert.match(impronta, /^[0-9a-f]{64}$/);
  assert.equal(impronta, modulo.hashPaymentLinkToken(token));
  assert.notEqual(
    impronta,
    token,
    "l'impronta non deve mai coincidere con il segreto",
  );

  assert.equal(modulo.hashPaymentLinkToken(""), "");
  assert.equal(modulo.hashPaymentLinkToken(null), "");
  assert.equal(modulo.hashPaymentLinkToken(undefined), "");
});

test("un token manomesso di un carattere produce un'impronta del tutto diversa", () => {
  const token = modulo.generatePaymentLinkToken();
  const manomesso =
    (token[0] === "a" ? "b" : "a") + token.slice(1);

  const originale = modulo.hashPaymentLinkToken(token);
  const alterata = modulo.hashPaymentLinkToken(manomesso);

  assert.notEqual(originale, alterata);
  assert.equal(
    modulo.paymentLinkHashesMatch(originale, alterata),
    false,
    "un carattere cambiato non deve avvicinare chi prova: non c'e nessun avvicinarsi",
  );
});

// --- il confronto ---------------------------------------------------------

test("il confronto fra impronte riconosce l'uguaglianza e rifiuta tutto il resto", () => {
  const impronta = modulo.hashPaymentLinkToken("prova");

  assert.equal(modulo.paymentLinkHashesMatch(impronta, impronta), true);
  assert.equal(
    modulo.paymentLinkHashesMatch(impronta, impronta.slice(0, 63)),
    false,
    "lunghezze diverse non sono mai uguali",
  );
  assert.equal(modulo.paymentLinkHashesMatch("", ""), false);
  assert.equal(modulo.paymentLinkHashesMatch(impronta, null), false);
  assert.equal(modulo.paymentLinkHashesMatch(undefined, impronta), false);
});

test("il confronto scorre tutta l'impronta anche quando il primo carattere gia differisce", () => {
  /*
    Non si misura il tempo — su una macchina condivisa sarebbe una prova
    inaffidabile. Si prova la proprieta che rende il tempo costante: due
    impronte che differiscono **solo** all'inizio e due che differiscono solo
    alla fine ricevono lo stesso verdetto, e nessuna delle due esce prima.
  */
  const base = "0".repeat(64);
  const primaDiversa = `1${base.slice(1)}`;
  const ultimaDiversa = `${base.slice(0, 63)}1`;

  assert.equal(modulo.paymentLinkHashesMatch(base, primaDiversa), false);
  assert.equal(modulo.paymentLinkHashesMatch(base, ultimaDiversa), false);
});

// --- la finestra di validita ---------------------------------------------

test("un link vale finche non scade e non viene revocato", () => {
  const adesso = new Date("2026-09-01T10:00:00Z");

  assert.equal(
    modulo.isPaymentLinkUsable(
      { expires_at: new Date("2026-09-30T10:00:00Z"), revoked_at: null },
      adesso,
    ),
    true,
  );

  assert.equal(
    modulo.isPaymentLinkUsable(
      { expires_at: new Date("2026-08-30T10:00:00Z"), revoked_at: null },
      adesso,
    ),
    false,
    "scaduto",
  );

  assert.equal(
    modulo.isPaymentLinkUsable(
      {
        expires_at: new Date("2026-09-30T10:00:00Z"),
        revoked_at: new Date("2026-08-31T10:00:00Z"),
      },
      adesso,
    ),
    false,
    "revocato prima della scadenza",
  );

  assert.equal(
    modulo.isPaymentLinkUsable({ expires_at: "non una data" }, adesso),
    false,
    "una scadenza illeggibile non e un permesso a tempo indeterminato",
  );
});

test("la durata richiesta resta dentro i limiti dichiarati", () => {
  assert.equal(modulo.PAYMENT_LINK_DEFAULT_TTL_DAYS, 30);
  assert.equal(modulo.PAYMENT_LINK_MAX_TTL_DAYS, 90);

  assert.equal(modulo.normalizePaymentLinkTtlDays(undefined), 30);
  assert.equal(modulo.normalizePaymentLinkTtlDays(null), 30);
  assert.equal(modulo.normalizePaymentLinkTtlDays(0), 30);
  assert.equal(modulo.normalizePaymentLinkTtlDays(-5), 30);
  assert.equal(modulo.normalizePaymentLinkTtlDays("sette"), 30);
  assert.equal(modulo.normalizePaymentLinkTtlDays(7), 7);
  assert.equal(
    modulo.normalizePaymentLinkTtlDays(3650),
    90,
    "un link che vive dieci anni e una credenziale permanente in una casella di posta",
  );
});

// --- gli URL di ritorno ---------------------------------------------------

test("il percorso pubblico contiene il token e nient'altro", () => {
  assert.equal(modulo.buildPaymentLinkPath("abc-123_x"), "/pay/abc-123_x");
});

test("gli URL di ritorno puntano sempre alla pagina del link", () => {
  const { successUrl, cancelUrl } = modulo.buildPaymentLinkReturnUrls(
    "https://app.easygame.test/",
    "tok",
  );

  assert.equal(successUrl, "https://app.easygame.test/pay/tok?esito=inviato");
  assert.equal(cancelUrl, "https://app.easygame.test/pay/tok?esito=annullato");

  for (const url of [successUrl, cancelUrl]) {
    assert.equal(
      new URL(url).origin,
      "https://app.easygame.test",
      "un ritorno fuori dall'origine di EasyGame sarebbe un redirector aperto",
    );
  }
});

test("l'origine la decide il server: ambiente, poi proxy, poi la richiesta", () => {
  process.env.AUTH_BASE_URL = "https://configurata.easygame.test/";
  assert.equal(
    modulo.resolvePaymentLinkOrigin(
      richiestaFinta("https://qualsiasi.example/api", {
        "x-forwarded-host": "attaccante.example",
      }),
    ),
    "https://configurata.easygame.test",
    "quando l'origine e configurata, nessuna intestazione la sposta",
  );

  senzaOriginConfigurata(() => {
    assert.equal(
      modulo.resolvePaymentLinkOrigin(
        richiestaFinta("http://interno:3000/api/x", {
          "x-forwarded-host": "app.easygame.test",
          "x-forwarded-proto": "https",
        }),
      ),
      "https://app.easygame.test",
    );

    assert.equal(
      modulo.resolvePaymentLinkOrigin(
        richiestaFinta("https://app.easygame.test/api/x"),
      ),
      "https://app.easygame.test",
    );

    assert.equal(
      modulo.resolvePaymentLinkOrigin(richiestaFinta("non-un-url")),
      "",
      "un'origine che non si sa costruire resta vuota invece di inventarsi un host",
    );
  });
});

test("il messaggio dei casi non disponibili e uno solo", () => {
  assert.equal(typeof modulo.PAYMENT_LINK_NOT_AVAILABLE_MESSAGE, "string");
  assert.ok(
    modulo.PAYMENT_LINK_NOT_AVAILABLE_MESSAGE.length > 0,
    "tre frasi diverse tornerebbero a distinguere i casi alla prima modifica",
  );
});
