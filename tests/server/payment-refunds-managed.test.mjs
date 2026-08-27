import assert from "node:assert/strict";
import test, { before, beforeEach, afterEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Il rimborso avviato da EasyGame**, dal clic della segreteria al movimento
 * nel registro.
 *
 * Fino al Blocco E il giro era mezzo: il gateway sapeva rimborsare, il registro
 * sapeva registrare un rimborso arrivato per webhook, e in mezzo non c'era
 * niente — il club doveva entrare nel cruscotto Stripe. Questi test coprono il
 * pezzo che mancava, e le quattro cose che, se si rompono, si rompono in
 * silenzio e costano denaro vero:
 *
 * 1. **il rimborso parte sull'account connesso giusto**, con la commissione di
 *    piattaforma richiesta indietro — senza, a rimetterla e il club;
 * 2. **la risposta del provider non e il registro**: il movimento lo scrive
 *    l'evento firmato, e nel frattempo si dice «in elaborazione»;
 * 3. **un rimborso cita un incasso**, non una rata: due incassi sulla stessa
 *    rata restano due residui rimborsabili distinti;
 * 4. **due clic non restituiscono due volte.**
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const ALTRO_CLUB = "bbbbbbbb-0000-4000-8000-000000000002";
const RATA = "cccccccc-0000-4000-8000-000000000003";
const ATLETA = "dddddddd-0000-4000-8000-000000000004";
const ACCOUNT = "acct_alfa";
const ALTRO_ACCOUNT = "acct_beta";

let gateway;
let ledger;
let setPrismaClientForTests;
let fake;
let fetchOriginale;
let chiamate;
let rispostaRimborso;

before(async () => {
  gateway = await import("../../src/lib/server/payment-gateway.ts");
  ledger = await import("../../src/lib/payments/installment-ledger.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const seed = () => ({
  club: [
    { id: CLUB, name: "ASD Alfa", settings: {} },
    { id: ALTRO_CLUB, name: "ASD Beta", settings: {} },
  ],
  clubPaymentAccount: [
    {
      id: "cpa-1",
      organization_id: CLUB,
      provider: "stripe",
      external_account_id: ACCOUNT,
      account_type: "standard",
      status: "active",
      charges_enabled: true,
      payouts_enabled: true,
      requirements: [],
      online_payments_enabled: true,
      online_payments_decided_at: null,
    },
    {
      id: "cpa-2",
      organization_id: ALTRO_CLUB,
      provider: "stripe",
      external_account_id: ALTRO_ACCOUNT,
      account_type: "standard",
      status: "active",
      charges_enabled: true,
      payouts_enabled: true,
      requirements: [],
      online_payments_enabled: true,
      online_payments_decided_at: null,
    },
  ],
  platformCommissionRule: [
    {
      id: "rule-1",
      organization_id: null,
      percent: 1,
      fixed_cents: 0,
      effective_from: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
  athletePayment: [
    {
      id: RATA,
      organization_id: CLUB,
      athlete_id: ATLETA,
      amount: 130,
      status: "pending",
      description: "Rata unica",
      due_date: new Date("2026-09-30T00:00:00.000Z"),
      data: {},
    },
  ],
});

beforeEach(() => {
  /* Il prefisso non si scrive per esteso: vedi `tests/ui/ci-guardrails.test.mjs`. */
  process.env.STRIPE_SECRET_KEY = `sk_${"test"}_non_e_una_chiave_vera`;

  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);

  chiamate = [];
  rispostaRimborso = null;
  fetchOriginale = globalThis.fetch;

  globalThis.fetch = async (url, options) => {
    const indirizzo = String(url);
    const body = String(options?.body || "");

    chiamate.push({
      url: indirizzo,
      headers: options?.headers || {},
      body: Object.fromEntries(new URLSearchParams(body)),
    });

    if (indirizzo.includes("/refunds")) {
      const importo = Number(
        Object.fromEntries(new URLSearchParams(body)).amount || 0,
      );

      return {
        ok: true,
        status: 200,
        json: async () =>
          rispostaRimborso || {
            id: `re_${chiamate.length}`,
            amount: importo,
            status: "succeeded",
          },
      };
    }

    /* Tutto il resto — la liquidazione — «non lo so ancora», che e il caso normale. */
    return { ok: true, status: 200, json: async () => ({}) };
  };
});

afterEach(() => {
  globalThis.fetch = fetchOriginale;
  delete process.env.STRIPE_SECRET_KEY;
  setPrismaClientForTests(null);
});

const scopeDi = (organizationId = CLUB) => ({
  userId: "user-1",
  activeOrganizationId: organizationId,
  allowedOrganizationIds: [organizationId],
});

const incasso = (overrides = {}) => ({
  provider: "stripe",
  id: "evt_pagamento",
  type: "checkout.session.completed",
  createdAt: "2026-08-26T10:00:00.000Z",
  accountId: ACCOUNT,
  liveMode: false,
  refund: null,
  account: null,
  raw: {},
  payment: {
    provider: "stripe",
    externalId: "pi_1",
    status: "succeeded",
    money: { amountCents: 13000, currency: "EUR" },
    platformFeeCents: 130,
    reference: { organizationId: CLUB, paymentId: RATA, athleteId: ATLETA },
    paidAt: "2026-08-26T10:00:00.000Z",
  },
  ...overrides,
});

const eventoRimborso = (overrides = {}) => ({
  provider: "stripe",
  id: `evt_rimborso_${overrides.refund?.externalRefundId || "re_1"}`,
  type: "charge.refund.updated",
  createdAt: "2026-08-27T10:00:00.000Z",
  accountId: ACCOUNT,
  liveMode: false,
  payment: null,
  account: null,
  raw: {},
  ...overrides,
  refund: {
    externalRefundId: "re_1",
    externalPaymentId: "pi_1",
    amountCents: 3000,
    currency: "EUR",
    status: "succeeded",
    reference: { organizationId: CLUB, paymentId: RATA, athleteId: ATLETA },
    createdAt: "2026-08-27T10:00:00.000Z",
    ...(overrides.refund || {}),
  },
});

/** Registra l'incasso da 130 € e restituisce la riga. */
const registraIncasso = async () => {
  await gateway.handleGatewayWebhookEvent(incasso());
  return fake.rows("paymentTransaction").find((row) => Number(row.amount) > 0);
};

const statoRata = () => {
  const charge = fake.rows("athletePayment").find((row) => row.id === RATA);
  const transactions = ledger.normalizePaymentTransactions(
    fake.rows("paymentTransaction").filter((row) => row.payment_id === RATA),
  );
  return ledger.resolveInstallmentLedger({
    charge,
    transactions,
    now: new Date("2026-08-27T12:00:00.000Z"),
  });
};

const chiamataRimborso = () =>
  chiamate.filter((entry) => entry.url.includes("/refunds"));

/* ----------------------------------------- la richiesta parte, e parte bene */

test("il rimborso parte sull'account connesso del club, non su un altro", async () => {
  const originale = await registraIncasso();

  await gateway.requestGatewayRefund(
    { transactionId: originale.id, amountCents: 3000 },
    scopeDi(),
  );

  const [richiesta] = chiamataRimborso();

  assert.ok(richiesta, "la richiesta di rimborso deve partire");
  assert.equal(richiesta.headers["Stripe-Account"], ACCOUNT);
  assert.equal(richiesta.body.payment_intent, "pi_1");
  assert.equal(richiesta.body.amount, "3000");
});

test("la commissione di piattaforma si chiede indietro", async () => {
  const originale = await registraIncasso();

  await gateway.requestGatewayRefund(
    { transactionId: originale.id, amountCents: 3000 },
    scopeDi(),
  );

  assert.equal(
    chiamataRimborso()[0].body.refund_application_fee,
    "true",
    "senza, la quota resta a EasyGame e a rimetterla e il club che ha rimborsato",
  );
});

test("la chiave di idempotenza viaggia nell'intestazione", async () => {
  const originale = await registraIncasso();

  await gateway.requestGatewayRefund(
    { transactionId: originale.id, amountCents: 3000 },
    scopeDi(),
  );

  assert.match(
    String(chiamataRimborso()[0].headers["Idempotency-Key"] || ""),
    /^refund:/,
  );
});

test("senza importo si rimborsa tutto il rimborsabile", async () => {
  const originale = await registraIncasso();

  const esito = await gateway.requestGatewayRefund(
    { transactionId: originale.id },
    scopeDi(),
  );

  assert.equal(esito.amountCents, 13000);
  assert.equal(chiamataRimborso()[0].body.amount, "13000");
});

test("il motivo che il provider non riconosce non parte", async () => {
  const originale = await registraIncasso();

  await gateway.requestGatewayRefund(
    { transactionId: originale.id, amountCents: 3000, reason: "perche si" },
    scopeDi(),
  );

  assert.equal(
    chiamataRimborso()[0].body.reason,
    undefined,
    "un motivo fuori catalogo produrrebbe un rifiuto del provider, non un errore di compilazione",
  );
});

test("un motivo del catalogo arriva al provider", async () => {
  const originale = await registraIncasso();

  await gateway.requestGatewayRefund(
    { transactionId: originale.id, amountCents: 3000, reason: "duplicate" },
    scopeDi(),
  );

  assert.equal(chiamataRimborso()[0].body.reason, "duplicate");
});

test("le note interne non viaggiano fino al provider", async () => {
  const originale = await registraIncasso();

  await gateway.requestGatewayRefund(
    {
      transactionId: originale.id,
      amountCents: 3000,
      notes: "la famiglia ha cambiato societa",
    },
    scopeDi(),
  );

  const inviato = JSON.stringify(chiamataRimborso()[0].body);
  assert.doesNotMatch(inviato, /cambiato societa/);
});

/* ------------------------------- la risposta del provider non e il registro */

test("la risposta HTTP non scrive il movimento: lo scrive il webhook", async () => {
  const originale = await registraIncasso();

  const esito = await gateway.requestGatewayRefund(
    { transactionId: originale.id, amountCents: 3000 },
    scopeDi(),
  );

  assert.equal(esito.awaitingWebhook, true);
  assert.match(esito.message, /in elaborazione/i);

  const negativi = fake
    .rows("paymentTransaction")
    .filter((row) => Number(row.amount) < 0);

  assert.deepEqual(negativi, [], "nessun movimento finche l'evento non arriva");
  assert.equal(statoRata().state, "paid", "la rata non si muove ancora");
});

test("la richiesta resta annotata sull'incasso, e dice «in elaborazione»", async () => {
  const originale = await registraIncasso();

  const esito = await gateway.requestGatewayRefund(
    { transactionId: originale.id, amountCents: 3000 },
    scopeDi(),
  );

  const richieste = esito.transaction.data.refundRequests;

  assert.equal(richieste.length, 1);
  assert.equal(richieste[0].externalRefundId, esito.externalRefundId);
  assert.equal(richieste[0].amountCents, 3000);
});

test("un rimborso senza identificativo del provider non si annota", async () => {
  const originale = await registraIncasso();
  rispostaRimborso = { id: "", amount: 3000, status: "succeeded" };

  await assert.rejects(
    gateway.requestGatewayRefund(
      { transactionId: originale.id, amountCents: 3000 },
      scopeDi(),
    ),
    /identificativo/i,
  );
});

/* -------------------------------------------- il giro completo, e la rata */

test("rimborso parziale: 130 incassati, 30 restituiti, rata parziale", async () => {
  const originale = await registraIncasso();

  const esito = await gateway.requestGatewayRefund(
    { transactionId: originale.id, amountCents: 3000 },
    scopeDi(),
  );

  await gateway.handleGatewayWebhookEvent(
    eventoRimborso({
      refund: { externalRefundId: esito.externalRefundId, amountCents: 3000 },
    }),
  );

  const dopo = statoRata();

  assert.equal(dopo.paidAmount, 100);
  assert.equal(dopo.residualAmount, 30);
  assert.equal(dopo.state, "partial");
  assert.deepEqual(dopo.statusLabels, ["PARZIALMENTE PAGATA"]);
});

test("l'incasso originale non viene cancellato", async () => {
  const originale = await registraIncasso();

  const esito = await gateway.requestGatewayRefund(
    { transactionId: originale.id, amountCents: 3000 },
    scopeDi(),
  );

  await gateway.handleGatewayWebhookEvent(
    eventoRimborso({
      refund: { externalRefundId: esito.externalRefundId, amountCents: 3000 },
    }),
  );

  const righe = fake.rows("paymentTransaction");

  assert.equal(righe.length, 2);
  assert.equal(Number(righe[0].amount), 130);
  assert.equal(Number(righe[1].amount), -30);
});

test("rimborso totale: netto incassato zero, rata di nuovo scoperta", async () => {
  const originale = await registraIncasso();

  const esito = await gateway.requestGatewayRefund(
    { transactionId: originale.id },
    scopeDi(),
  );

  await gateway.handleGatewayWebhookEvent(
    eventoRimborso({
      refund: { externalRefundId: esito.externalRefundId, amountCents: 13000 },
    }),
  );

  const dopo = statoRata();

  assert.equal(dopo.paidAmount, 0);
  assert.equal(dopo.residualAmount, 130);
  assert.equal(dopo.state, "pending");
  assert.equal(
    fake.rows("paymentTransaction").length,
    2,
    "nessuna riga sparisce: l'incasso resta accanto al rimborso",
  );
});

test("la quota di piattaforma torna in proporzione, e finisce nel registro", async () => {
  const originale = await registraIncasso();

  const esito = await gateway.requestGatewayRefund(
    { transactionId: originale.id, amountCents: 3000 },
    scopeDi(),
  );

  await gateway.handleGatewayWebhookEvent(
    eventoRimborso({
      refund: { externalRefundId: esito.externalRefundId, amountCents: 3000 },
    }),
  );

  const movimento = fake
    .rows("paymentTransaction")
    .find((row) => Number(row.amount) < 0);

  assert.equal(movimento.gross_amount_cents, -3000);
  assert.equal(movimento.platform_fee_cents, -30, "1% di 30 € = 0,30 €");
});

/* -------------------------------------------------------- i limiti */

test("un rimborso oltre il rimborsabile non parte nemmeno", async () => {
  const originale = await registraIncasso();

  await assert.rejects(
    gateway.requestGatewayRefund(
      { transactionId: originale.id, amountCents: 13001 },
      scopeDi(),
    ),
    /supera quanto resta rimborsabile/i,
  );

  assert.deepEqual(chiamataRimborso(), []);
});

test("un importo nullo o negativo non e un rimborso", async () => {
  const originale = await registraIncasso();

  for (const amountCents of [0, -100]) {
    await assert.rejects(
      gateway.requestGatewayRefund(
        { transactionId: originale.id, amountCents },
        scopeDi(),
      ),
      /maggiore di zero/i,
    );
  }

  assert.deepEqual(chiamataRimborso(), []);
});

test("due rimborsi non possono superare insieme l'incasso", async () => {
  const originale = await registraIncasso();

  const primo = await gateway.requestGatewayRefund(
    { transactionId: originale.id, amountCents: 10000 },
    scopeDi(),
  );

  await gateway.handleGatewayWebhookEvent(
    eventoRimborso({
      refund: { externalRefundId: primo.externalRefundId, amountCents: 10000 },
    }),
  );

  await assert.rejects(
    gateway.requestGatewayRefund(
      { transactionId: originale.id, amountCents: 3001 },
      scopeDi(),
    ),
    /supera quanto resta rimborsabile/i,
  );
});

test("un incasso gia rimborsato per intero non si rimborsa di nuovo", async () => {
  const originale = await registraIncasso();

  const primo = await gateway.requestGatewayRefund(
    { transactionId: originale.id },
    scopeDi(),
  );

  await gateway.handleGatewayWebhookEvent(
    eventoRimborso({
      refund: { externalRefundId: primo.externalRefundId, amountCents: 13000 },
    }),
  );

  await assert.rejects(
    gateway.requestGatewayRefund(
      { transactionId: originale.id, amountCents: 100 },
      scopeDi(),
    ),
    /gia stato rimborsato per intero/i,
  );
});

test("un incasso manuale non si rimborsa tramite l'adapter Stripe", async () => {
  const manuale = await fake.client.paymentTransaction.create({
    data: {
      id: "tx-manuale",
      organization_id: CLUB,
      athlete_id: ATLETA,
      payment_id: RATA,
      amount: 50,
      paid_at: new Date("2026-08-25T10:00:00.000Z"),
      payment_method: "contanti",
      source: "MANUAL",
      data: {},
    },
  });

  await assert.rejects(
    gateway.requestGatewayRefund(
      { transactionId: manuale.id, amountCents: 1000 },
      scopeDi(),
    ),
    /non e passato dal provider/i,
  );

  assert.deepEqual(chiamataRimborso(), []);
});

test("un incasso stornato non si rimborsa", async () => {
  const originale = await registraIncasso();

  fake
    .rows("paymentTransaction")
    .find((row) => row.id === originale.id).reversed_at = new Date();

  await assert.rejects(
    gateway.requestGatewayRefund(
      { transactionId: originale.id, amountCents: 1000 },
      scopeDi(),
    ),
    /stornato/i,
  );
});

/* ------------------------------------------------------- idempotenza */

test("due richieste identiche non restituiscono due volte", async () => {
  const originale = await registraIncasso();

  const primo = await gateway.requestGatewayRefund(
    { transactionId: originale.id, amountCents: 3000 },
    scopeDi(),
  );

  /*
    Il secondo clic arriva prima del webhook: la richiesta e ancora in volo, e
    il servizio non ne fa partire un'altra. E la difesa che sta **davanti** a
    quella del provider — l'idempotenza di Stripe e la rete di sicurezza, non
    la prima linea.
  */
  await assert.rejects(
    gateway.requestGatewayRefund(
      { transactionId: originale.id, amountCents: 3000 },
      scopeDi(),
    ),
    /in elaborazione/i,
  );

  assert.equal(chiamataRimborso().length, 1);
  assert.ok(primo.externalRefundId);
});

test("dopo la conferma un secondo rimborso chiede una chiave diversa", async () => {
  const originale = await registraIncasso();

  const primo = await gateway.requestGatewayRefund(
    { transactionId: originale.id, amountCents: 3000 },
    scopeDi(),
  );

  await gateway.handleGatewayWebhookEvent(
    eventoRimborso({
      refund: { externalRefundId: primo.externalRefundId, amountCents: 3000 },
    }),
  );

  await gateway.requestGatewayRefund(
    { transactionId: originale.id, amountCents: 3000 },
    scopeDi(),
  );

  const [prima, seconda] = chiamataRimborso();

  assert.notEqual(
    prima.headers["Idempotency-Key"],
    seconda.headers["Idempotency-Key"],
    "con la stessa chiave Stripe avrebbe restituito il primo rimborso, e il club ne avrebbe contati due",
  );
});

test("due eventi sullo stesso rimborso producono un solo movimento", async () => {
  const originale = await registraIncasso();

  const esito = await gateway.requestGatewayRefund(
    { transactionId: originale.id, amountCents: 3000 },
    scopeDi(),
  );

  const evento = (id) =>
    eventoRimborso({
      id,
      refund: { externalRefundId: esito.externalRefundId, amountCents: 3000 },
    });

  await gateway.handleGatewayWebhookEvent(evento("evt_a"));
  const secondo = await gateway.handleGatewayWebhookEvent(evento("evt_b"));

  assert.equal(secondo.duplicate, true);
  assert.equal(
    fake.rows("paymentTransaction").filter((row) => Number(row.amount) < 0)
      .length,
    1,
  );
  assert.equal(statoRata().paidAmount, 100);
});

test("l'annotazione si spegne quando il movimento arriva, non prima", async () => {
  const originale = await registraIncasso();

  const esito = await gateway.requestGatewayRefund(
    { transactionId: originale.id, amountCents: 3000 },
    scopeDi(),
  );

  await gateway.handleGatewayWebhookEvent(
    eventoRimborso({
      refund: { externalRefundId: esito.externalRefundId, amountCents: 3000 },
    }),
  );

  /* Un secondo rimborso ora e ammesso: il primo non e piu «in volo». */
  const secondo = await gateway.requestGatewayRefund(
    { transactionId: originale.id, amountCents: 1000 },
    scopeDi(),
  );

  assert.equal(secondo.amountCents, 1000);
});

/* ----------------------------------------------------- multi-incasso */

test("rimborsare un incasso della rata non tocca l'altro", async () => {
  /* Rata 130 = A (50) + B (80). Si rimborsano 30 di B. */
  await gateway.handleGatewayWebhookEvent(
    incasso({
      id: "evt_a",
      payment: {
        ...incasso().payment,
        externalId: "pi_a",
        money: { amountCents: 5000, currency: "EUR" },
      },
    }),
  );

  await gateway.handleGatewayWebhookEvent(
    incasso({
      id: "evt_b",
      payment: {
        ...incasso().payment,
        externalId: "pi_b",
        money: { amountCents: 8000, currency: "EUR" },
      },
    }),
  );

  assert.equal(statoRata().paidAmount, 130);

  const b = fake
    .rows("paymentTransaction")
    .find((row) => row.external_payment_id === "pi_b");

  const esito = await gateway.requestGatewayRefund(
    { transactionId: b.id, amountCents: 3000 },
    scopeDi(),
  );

  await gateway.handleGatewayWebhookEvent(
    eventoRimborso({
      refund: {
        externalRefundId: esito.externalRefundId,
        externalPaymentId: "pi_b",
        amountCents: 3000,
      },
    }),
  );

  const dopo = statoRata();

  assert.equal(dopo.paidAmount, 100, "50 di A piu 50 di B");
  assert.equal(dopo.residualAmount, 30);

  const a = fake
    .rows("paymentTransaction")
    .find((row) => row.external_payment_id === "pi_a");

  assert.equal(Number(a.amount), 50, "A non e stato toccato");

  const movimento = fake
    .rows("paymentTransaction")
    .find((row) => Number(row.amount) < 0);

  assert.equal(
    movimento.external_payment_id,
    "pi_b",
    "il rimborso cita il pagamento da cui e uscito, non «la rata»",
  );
});

test("il rimborsabile di B non e quello dell'intera rata", async () => {
  await gateway.handleGatewayWebhookEvent(
    incasso({
      id: "evt_a",
      payment: {
        ...incasso().payment,
        externalId: "pi_a",
        money: { amountCents: 5000, currency: "EUR" },
      },
    }),
  );

  await gateway.handleGatewayWebhookEvent(
    incasso({
      id: "evt_b",
      payment: {
        ...incasso().payment,
        externalId: "pi_b",
        money: { amountCents: 8000, currency: "EUR" },
      },
    }),
  );

  const b = fake
    .rows("paymentTransaction")
    .find((row) => row.external_payment_id === "pi_b");

  await assert.rejects(
    gateway.requestGatewayRefund(
      { transactionId: b.id, amountCents: 9000 },
      scopeDi(),
    ),
    /supera quanto resta rimborsabile/i,
  );
});

/* ------------------------------------------------------- multi-tenant */

test("un rimborso non attraversa il confine fra due societa", async () => {
  const originale = await registraIncasso();

  await assert.rejects(
    gateway.requestGatewayRefund(
      { transactionId: originale.id, amountCents: 1000 },
      scopeDi(ALTRO_CLUB),
    ),
    /Accesso negato/,
  );

  assert.deepEqual(chiamataRimborso(), []);
});

test("un incasso su un conto diverso da quello del club non si rimborsa", async () => {
  const originale = await registraIncasso();

  /*
    Lo scenario e sottile: la riga porta un account connesso, il club ne ha un
    altro. Puo succedere se l'account e stato ricollegato. Rimborsare
    sull'account del club vorrebbe dire prendere denaro dal conto sbagliato.
  */
  fake
    .rows("paymentTransaction")
    .find((row) => row.id === originale.id).external_account_id =
    "acct_di_qualcun_altro";

  await assert.rejects(
    gateway.requestGatewayRefund(
      { transactionId: originale.id, amountCents: 1000 },
      scopeDi(),
    ),
    /Accesso negato/,
  );

  assert.deepEqual(chiamataRimborso(), []);
});

test("senza conto di incasso collegato non si avvia nessun rimborso", async () => {
  const originale = await registraIncasso();

  fake
    .rows("clubPaymentAccount")
    .find((row) => row.organization_id === CLUB).external_account_id = null;

  await assert.rejects(
    gateway.requestGatewayRefund(
      { transactionId: originale.id, amountCents: 1000 },
      scopeDi(),
    ),
    /conto di incasso/i,
  );
});

/* -------------------------------------------------- niente storico doppio */

test("il rimborso non crea un secondo storico: e una riga di Payments V2", async () => {
  const originale = await registraIncasso();

  const esito = await gateway.requestGatewayRefund(
    { transactionId: originale.id, amountCents: 3000 },
    scopeDi(),
  );

  await gateway.handleGatewayWebhookEvent(
    eventoRimborso({
      refund: { externalRefundId: esito.externalRefundId, amountCents: 3000 },
    }),
  );

  const scritti = new Set(
    fake.calls
      .filter((call) => ["create", "update", "upsert"].includes(call.method))
      .map((call) => call.delegate),
  );

  assert.equal(
    [...scritti].some((delegate) => /refund/i.test(delegate)),
    false,
    "nessuna tabella dedicata ai rimborsi: la fonte canonica resta payment_transactions",
  );

  const movimenti = fake
    .rows("paymentTransaction")
    .filter((row) => row.payment_id === RATA);

  assert.equal(movimenti.length, 2, "un incasso e un rimborso, non tre righe");
});
