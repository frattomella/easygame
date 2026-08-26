import assert from "node:assert/strict";
import test, { before, beforeEach, afterEach } from "node:test";

/**
 * **Quanto e costato un incasso**, e perche il numero non lo scrive EasyGame.
 *
 * La commissione di EasyGame la decide EasyGame e si congela (ADR-0050);
 * quella di Stripe la decide Stripe, cambia per metodo di pagamento, circuito
 * e paese della carta, e cambia di listino senza avvisare. Una formula
 * scritta nel codice sarebbe giusta il giorno in cui viene scritta e
 * sbagliata il giorno dopo — e comparirebbe in un rendiconto con l'aria di
 * essere un fatto.
 *
 * Questi test non parlano con Stripe: sostituiscono il trasporto e provano la
 * **traduzione**, che e la parte in cui si puo sbagliare in silenzio.
 */

let stripe;
let fetchOriginale;
let chiamate;
let risposte;

before(async () => {
  stripe = await import("../../src/lib/payments/gateway/providers/stripe.ts");
});

beforeEach(() => {
  /* Il prefisso non si scrive per esteso: vedi `tests/ui/ci-guardrails.test.mjs`. */
  process.env.STRIPE_SECRET_KEY = `sk_${"test"}_non_e_una_chiave_vera`;
  fetchOriginale = globalThis.fetch;
  chiamate = [];
  risposte = new Map();

  globalThis.fetch = async (url, options) => {
    chiamate.push({ url: String(url), headers: options?.headers || {} });
    const corpo = [...risposte.entries()].find(([frammento]) =>
      String(url).includes(frammento),
    );

    return {
      ok: true,
      status: 200,
      json: async () => (corpo ? corpo[1] : {}),
    };
  };
});

afterEach(() => {
  globalThis.fetch = fetchOriginale;
  delete process.env.STRIPE_SECRET_KEY;
});

const BALANCE_TRANSACTION = {
  object: "balance_transaction",
  amount: 13000,
  net: 12500,
  fee: 500,
  fee_details: [
    { type: "stripe_fee", amount: 370, currency: "eur" },
    { type: "application_fee", amount: 130, currency: "eur" },
  ],
};

/* ------------------------------------------------------ la traduzione */

test("la commissione Stripe e il netto arrivano dal balance transaction", async () => {
  risposte.set("/payment_intents/pi_1", {
    id: "pi_1",
    latest_charge: { id: "ch_1", balance_transaction: BALANCE_TRANSACTION },
  });

  const liquidazione = await stripe.stripeProvider.fetchSettlement({
    externalPaymentId: "pi_1",
    merchantExternalId: "acct_alfa",
  });

  assert.equal(liquidazione.providerFeeCents, 370);
  assert.equal(liquidazione.platformFeeCents, 130);
  assert.equal(liquidazione.netAmountCents, 12500);
  assert.equal(liquidazione.grossAmountCents, 13000);
});

test("le voci si leggono per tipo, non per posizione", async () => {
  /*
    L'elenco puo contenere voci che non sono di Stripe — imposte su alcuni
    mercati, costi di rete. Sommarle tutte attribuirebbe a Stripe cio che non
    e suo, e il club vedrebbe un costo piu alto di quello vero.
  */
  risposte.set("/payment_intents/pi_2", {
    id: "pi_2",
    latest_charge: {
      balance_transaction: {
        amount: 10000,
        net: 9000,
        fee_details: [
          { type: "tax", amount: 200 },
          { type: "application_fee", amount: 100 },
          { type: "stripe_fee", amount: 700 },
        ],
      },
    },
  });

  const liquidazione = await stripe.stripeProvider.fetchSettlement({
    externalPaymentId: "pi_2",
    merchantExternalId: "acct_alfa",
  });

  assert.equal(liquidazione.providerFeeCents, 700, "solo la voce di Stripe");
  assert.equal(liquidazione.platformFeeCents, 100);
});

test("una voce assente resta ignota e non diventa zero", async () => {
  /*
    Zero direbbe «gratis», che e un'affermazione diversa da «non lo so» e che
    in un rendiconto si legge come un fatto.
  */
  risposte.set("/payment_intents/pi_3", {
    id: "pi_3",
    latest_charge: {
      balance_transaction: { amount: 5000, net: 4950, fee_details: [] },
    },
  });

  const liquidazione = await stripe.stripeProvider.fetchSettlement({
    externalPaymentId: "pi_3",
    merchantExternalId: "acct_alfa",
  });

  assert.equal(liquidazione.providerFeeCents, null);
  assert.equal(liquidazione.platformFeeCents, null);
  assert.equal(liquidazione.netAmountCents, 4950);
});

/* ------------------------------------------------- cosa non e un errore */

test("un balance transaction non ancora maturato non e un errore: e un «non lo so»", async () => {
  /*
    Finche non matura, Stripe restituisce l'identificativo invece dell'oggetto.
    E il caso normale nei minuti dopo un incasso.
  */
  risposte.set("/payment_intents/pi_4", {
    id: "pi_4",
    latest_charge: { balance_transaction: "txn_non_ancora_espanso" },
  });

  const liquidazione = await stripe.stripeProvider.fetchSettlement({
    externalPaymentId: "pi_4",
    merchantExternalId: "acct_alfa",
  });

  assert.equal(liquidazione, null);
});

test("un pagamento senza charge non produce numeri inventati", async () => {
  risposte.set("/payment_intents/pi_5", { id: "pi_5", latest_charge: null });

  assert.equal(
    await stripe.stripeProvider.fetchSettlement({
      externalPaymentId: "pi_5",
      merchantExternalId: "acct_alfa",
    }),
    null,
  );
});

/* ------------------------------------------------- le tre forme dell'id */

test("la sessione, l'intent e il charge portano tutti al balance transaction", async () => {
  risposte.set("/checkout/sessions/cs_1", {
    payment_intent: { latest_charge: { balance_transaction: BALANCE_TRANSACTION } },
  });
  risposte.set("/charges/ch_1", { balance_transaction: BALANCE_TRANSACTION });
  risposte.set("/payment_intents/pi_1", {
    latest_charge: { balance_transaction: BALANCE_TRANSACTION },
  });

  for (const id of ["cs_1", "ch_1", "pi_1"]) {
    const liquidazione = await stripe.stripeProvider.fetchSettlement({
      externalPaymentId: id,
      merchantExternalId: "acct_alfa",
    });

    assert.equal(liquidazione.providerFeeCents, 370, `fallito su ${id}`);
  }

  assert.equal(
    chiamate.every((chiamata) => chiamata.url.includes("expand")),
    true,
    "l'espansione si chiede nella stessa richiesta: seguire i riferimenti a mano sarebbe tre chiamate",
  );
});

test("il costo si chiede sempre sull'account connesso del club", async () => {
  /*
    E la stessa intestazione che rende l'addebito **diretto**. Senza, la
    lettura avverrebbe sull'account della piattaforma, dove quel charge non
    esiste: nel migliore dei casi non trova niente, nel peggiore trova
    l'omonimo di un'altra societa.
  */
  risposte.set("/payment_intents/pi_1", {
    latest_charge: { balance_transaction: BALANCE_TRANSACTION },
  });

  await stripe.stripeProvider.fetchSettlement({
    externalPaymentId: "pi_1",
    merchantExternalId: "acct_alfa",
  });

  assert.equal(chiamate.length, 1);
  assert.equal(chiamate[0].headers["Stripe-Account"], "acct_alfa");
});

test("senza identificativo non si chiama il provider", async () => {
  const liquidazione = await stripe.stripeProvider.fetchSettlement({
    externalPaymentId: "",
    merchantExternalId: "acct_alfa",
  });

  assert.equal(liquidazione, null);
  assert.equal(chiamate.length, 0);
});
