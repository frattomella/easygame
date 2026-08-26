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

let gateway;
let originalSecret;

before(async () => {
  gateway = await import("../../src/lib/payments/gateway/index.ts");
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

/*
  La chiave finta non porta il prefisso vero di Stripe.

  Il guardrail della CI cerca i prefissi delle chiavi Stripe fra i file
  tracciati, e non puo distinguere una chiave inventata da una vera: e il suo
  mestiere non farlo. Scriverne una con quel prefisso rendeva **rosso** il job
  dei guardrail — che e il modo piu rapido di insegnare a ignorare un allarme
  di sicurezza. Il codice controlla solo che la variabile esista, non come
  comincia.
*/
const configured = () => {
  process.env.STRIPE_SECRET_KEY = "chiave-finta-per-i-test";
};

const unconfigured = () => {
  delete process.env.STRIPE_SECRET_KEY;
};

const readiness = (overrides = {}) =>
  gateway.describeGatewayReadiness({
    provider: "stripe",
    enabledByClub: true,
    merchantExternalId: "acct_1",
    merchantChargesEnabled: true,
    ...overrides,
  });

/* ------------------------------------------------------- il registro */

test("il provider dichiarato senza adapter non finge di esistere", () => {
  assert.equal(gateway.getPaymentGateway("paypal"), null);
  assert.equal(gateway.PAYMENT_GATEWAYS.paypal.hasAdapter, false);
});

test("un provider inventato non risolve niente", () => {
  assert.equal(gateway.getPaymentGateway("banca_del_paese"), null);
  assert.throws(
    () => gateway.requirePaymentGateway("banca_del_paese"),
    /non riconosciuto/,
  );
});

test("un provider senza adapter lo dice, invece di fallire piu avanti", () => {
  assert.throws(
    () => gateway.requirePaymentGateway("paypal"),
    /non e ancora collegato/,
  );
});

test("Stripe senza credenziali e riconosciuto ma non utilizzabile", () => {
  unconfigured();

  assert.ok(gateway.getPaymentGateway("stripe"));
  assert.throws(
    () => gateway.requirePaymentGateway("stripe"),
    /non e configurato su questo ambiente/,
  );
});

test("in V1 non esiste un prodotto CediPay: si chiama Stripe", () => {
  for (const descriptor of Object.values(gateway.PAYMENT_GATEWAYS)) {
    assert.doesNotMatch(
      descriptor.label,
      /cedipay/i,
      "ADR-0049: il livello di prodotto CediPay non fa parte della V1",
    );
  }

  assert.equal(gateway.PAYMENT_GATEWAYS.stripe.label, "Stripe");
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
