import assert from "node:assert/strict";
import test, { before, beforeEach, afterEach } from "node:test";

/**
 * Quando il pulsante «Paga online» ha il diritto di accendersi.
 *
 * Un'interfaccia che offre il pagamento online e un server che risponde «non
 * implementato» non e una funzione a meta: e una promessa rotta davanti a chi
 * sta pagando. Quattro condizioni diverse la impediscono, e vanno tenute
 * distinte perche le risolvono persone diverse — chi scrive il codice, chi
 * configura la piattaforma, la segreteria del club, il PSP.
 */

let cedipay;
let originalSecret;

before(async () => {
  cedipay = await import("../../src/lib/payments/cedipay/index.ts");
});

beforeEach(() => {
  originalSecret = process.env.STRIPE_SECRET_KEY;
});

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.STRIPE_SECRET_KEY;
  } else {
    process.env.STRIPE_SECRET_KEY = originalSecret;
  }
});

const configured = () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_non_e_una_chiave_vera";
};

const unconfigured = () => {
  delete process.env.STRIPE_SECRET_KEY;
};

const readiness = (overrides = {}) =>
  cedipay.describeCediPayReadiness({
    provider: "stripe",
    enabledByClub: true,
    merchantExternalId: "acct_1",
    merchantChargesEnabled: true,
    ...overrides,
  });

/* ------------------------------------------------------- il registro */

test("il provider dichiarato senza adapter non finge di esistere", () => {
  assert.equal(cedipay.getCediPayProvider("paypal"), null);
  assert.equal(cedipay.CEDIPAY_PROVIDERS.paypal.hasAdapter, false);
});

test("un provider inventato non risolve niente", () => {
  assert.equal(cedipay.getCediPayProvider("banca_del_paese"), null);
  assert.throws(
    () => cedipay.requireCediPayProvider("banca_del_paese"),
    /non riconosciuto/,
  );
});

test("un provider senza adapter lo dice, invece di fallire piu avanti", () => {
  assert.throws(
    () => cedipay.requireCediPayProvider("paypal"),
    /non e ancora collegato a CediPay/,
  );
});

test("Stripe senza credenziali e riconosciuto ma non utilizzabile", () => {
  unconfigured();

  assert.ok(cedipay.getCediPayProvider("stripe"));
  assert.throws(
    () => cedipay.requireCediPayProvider("stripe"),
    /non e configurato su questo ambiente/,
  );
});

test("il nome del PSP non e il nome del prodotto", () => {
  assert.match(
    cedipay.CEDIPAY_PROVIDERS.stripe.label,
    /CediPay/,
    "CediPay e il livello di prodotto, il provider e sotto e sostituibile",
  );
});

/* --------------------------------------------------- i quattro gradini */

test("con tutto a posto il pagamento online e attivo", () => {
  configured();

  const esito = readiness();
  assert.equal(esito.canCheckout, true);
  assert.equal(esito.blocker, null);
});

test("senza credenziali di piattaforma il blocco e dell'ambiente", () => {
  unconfigured();

  const esito = readiness();
  assert.equal(esito.canCheckout, false);
  assert.equal(esito.blocker, "not_configured");
});

test("senza adapter il blocco e del codice", () => {
  configured();

  const esito = readiness({ provider: "postepay" });
  assert.equal(esito.blocker, "no_adapter");
});

test("con la societa che li ha disattivati il blocco e delle impostazioni", () => {
  configured();

  const esito = readiness({ enabledByClub: false });
  assert.equal(esito.blocker, "disabled_by_club");
});

test("senza conto di incasso il blocco e della segreteria", () => {
  configured();

  const esito = readiness({ merchantExternalId: "" });
  assert.equal(esito.blocker, "no_merchant");
  assert.match(esito.message, /non ha ancora attivato/);
});

test("con il conto in verifica il blocco e del PSP", () => {
  configured();

  const esito = readiness({ merchantChargesEnabled: false });
  assert.equal(esito.blocker, "merchant_not_ready");
  assert.match(esito.message, /in verifica/);
});

test("ogni blocco ha un messaggio suo, gia in italiano", () => {
  configured();

  const messaggi = new Set(
    [
      readiness({ provider: "postepay" }),
      readiness({ enabledByClub: false }),
      readiness({ merchantExternalId: "" }),
      readiness({ merchantChargesEnabled: false }),
    ].map((esito) => esito.message),
  );

  assert.equal(
    messaggi.size,
    4,
    "quattro problemi diversi, risolti da quattro persone diverse",
  );
});
