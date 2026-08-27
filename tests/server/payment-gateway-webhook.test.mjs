import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Cosa succede a un evento del provider **dopo** che la firma e stata
 * verificata.
 *
 * Il test sulla firma sta altrove e prova che l'evento venga dal PSP. Qui si
 * prova la seconda meta del problema, che e indipendente dalla prima: un
 * evento autentico puo arrivare **due volte**. Stripe riprova la consegna per
 * tre giorni finche non riceve un 2xx, e un rinvio manuale e a un clic di
 * distanza nella sua dashboard. Senza memoria, la seconda consegna registra
 * l'incasso una seconda volta e la rata di una famiglia risulta pagata il
 * doppio.
 *
 * L'altra meta e quali stati muovono denaro. «Sessione completa» non vuol
 * dire «pagato»: con SEPA o bonifico significa che il modulo e stato
 * compilato.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const ALTRO_CLUB = "bbbbbbbb-0000-4000-8000-000000000002";
const RATA = "cccccccc-0000-4000-8000-000000000003";
const ATLETA = "dddddddd-0000-4000-8000-000000000004";

let gateway;
let setPrismaClientForTests;
let fake;

before(async () => {
  gateway = await import("../../src/lib/server/payment-gateway.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const seed = () => ({
  club: [{ id: CLUB, name: "ASD Alfa", settings: {} }],
  athletePayment: [
    {
      id: RATA,
      organization_id: CLUB,
      athlete_id: ATLETA,
      amount: 100,
      status: "pending",
      description: "Prima rata",
      data: {},
    },
  ],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const eventoRiuscito = (overrides = {}) => ({
  provider: "stripe",
  id: "evt_1",
  type: "checkout.session.completed",
  createdAt: "2026-08-26T10:00:00.000Z",
  /* Stripe lo mette su ogni evento. Qui e sandbox, come l'ambiente di prova. */
  liveMode: false,
  raw: {},
  payment: {
    provider: "stripe",
    externalId: "cs_1",
    status: "succeeded",
    money: { amountCents: 4000, currency: "EUR" },
    platformFeeCents: 100,
    reference: {
      organizationId: CLUB,
      paymentId: RATA,
      athleteId: ATLETA,
    },
    paidAt: "2026-08-26T10:00:00.000Z",
  },
  ...overrides,
});

const conPagamento = (patch) => {
  const base = eventoRiuscito();
  return { ...base, payment: { ...base.payment, ...patch } };
};

/* --------------------------------------------------------- l'incasso */

test("un pagamento riuscito diventa un incasso sulla rata", async () => {
  const esito = await gateway.handleGatewayWebhookEvent(eventoRiuscito());

  assert.equal(esito.status, "processed");
  assert.equal(esito.duplicate, false);
  assert.ok(esito.transactionId);

  const incassi = fake.rows("paymentTransaction");
  assert.equal(incassi.length, 1);
  assert.equal(incassi[0].organization_id, CLUB);
  assert.equal(incassi[0].payment_id, RATA);
  assert.equal(incassi[0].amount, 40);
  assert.equal(incassi[0].source, "STRIPE");
  assert.equal(
    incassi[0].external_reference,
    "cs_1",
    "senza riferimento esterno non si riconcilia con l'estratto del PSP",
  );
});

test("gli importi arrivano in centesimi e non si perdono per strada", async () => {
  await gateway.handleGatewayWebhookEvent(
    conPagamento({ money: { amountCents: 3333, currency: "EUR" } }),
  );

  assert.equal(fake.rows("paymentTransaction")[0].amount, 33.33);
});

/* -------------------------------------------------------- la deduplica */

test("lo stesso evento consegnato due volte incassa una volta sola", async () => {
  const evento = eventoRiuscito();

  const primo = await gateway.handleGatewayWebhookEvent(evento);
  const secondo = await gateway.handleGatewayWebhookEvent(evento);

  assert.equal(primo.duplicate, false);
  assert.equal(secondo.duplicate, true);
  assert.equal(
    fake.rows("paymentTransaction").length,
    1,
    "Stripe riprova per tre giorni: la seconda consegna non deve incassare",
  );
});

test("due eventi diversi sullo stesso pagamento incassano una volta sola", async () => {
  /*
    **Il difetto trovato nel collaudo sandbox del Blocco E.** Un pagamento
    riuscito genera *sempre* due eventi — `payment_intent.succeeded` e
    `checkout.session.completed` — e la deduplica sull'identificativo
    dell'evento non li intercetta, perche gli eventi sono davvero due.
    Registrandoli entrambi, una famiglia che paga 50 € se ne vedeva
    accreditare 100, in silenzio: entrambi gli eventi sono legittimi, firmati
    e attesi.

    La versione precedente di questo test asseriva il contrario — «la chiave e
    l'evento, non il pagamento» — e contava solo le righe degli **eventi**,
    mai quelle dei **movimenti**. E' cosi che il difetto e sopravvissuto ai
    test: la cosa sbagliata non era osservata.
  */
  await gateway.handleGatewayWebhookEvent(
    eventoRiuscito({ id: "evt_1", type: "payment_intent.succeeded" }),
  );
  const secondo = await gateway.handleGatewayWebhookEvent(
    eventoRiuscito({ id: "evt_2", type: "checkout.session.completed" }),
  );

  assert.equal(secondo.duplicate, true, "e lo stesso denaro, non un secondo incasso");
  assert.equal(
    fake.rows("paymentTransaction").length,
    1,
    "due eventi, un incasso solo",
  );

  /* I due eventi restano entrambi in memoria: sono davvero arrivati. */
  assert.equal(fake.rows("paymentWebhookEvent").length, 2);
});

test("la sessione e il suo intent sono lo stesso incasso, anche con due identificativi", async () => {
  /*
    Il caso reale: i due eventi non portano lo stesso identificativo. La
    sessione si chiama `cs_…`, l'intent `pi_…`, e senza il legame fra i due
    nomi il secondo evento sembra un incasso nuovo.
  */
  await gateway.handleGatewayWebhookEvent(
    conPagamento({ externalId: "pi_1" }),
  );
  const secondo = await gateway.handleGatewayWebhookEvent({
    ...eventoRiuscito({ id: "evt_2" }),
    payment: {
      ...eventoRiuscito().payment,
      externalId: "cs_1",
      relatedExternalIds: ["pi_1"],
    },
  });

  assert.equal(secondo.duplicate, true);
  assert.equal(fake.rows("paymentTransaction").length, 1);
});

test("il legame vale anche quando arriva prima la sessione", async () => {
  /*
    L'ordine di consegna non e garantito: Stripe non promette che
    `payment_intent.succeeded` preceda `checkout.session.completed`. Se la
    deduplica funzionasse in un ordine solo, il doppio accredito tornerebbe
    quando la rete inverte i due.
  */
  await gateway.handleGatewayWebhookEvent({
    ...eventoRiuscito({ id: "evt_1" }),
    payment: {
      ...eventoRiuscito().payment,
      externalId: "cs_1",
      relatedExternalIds: ["pi_1"],
    },
  });
  const secondo = await gateway.handleGatewayWebhookEvent(
    conPagamento({ externalId: "pi_1" }),
  );

  assert.equal(
    secondo.duplicate,
    true,
    "l'intent citato dalla sessione e gia stato incassato",
  );
  assert.equal(fake.rows("paymentTransaction").length, 1);
});

test("due pagamenti davvero distinti restano due incassi", async () => {
  /*
    La guardia non deve diventare un tappo: due acconti sulla stessa rata sono
    due incassi, e devono restare tali.
  */
  await gateway.handleGatewayWebhookEvent(conPagamento({ externalId: "pi_1" }));
  const secondo = await gateway.handleGatewayWebhookEvent({
    ...eventoRiuscito({ id: "evt_2" }),
    payment: { ...eventoRiuscito().payment, externalId: "pi_2" },
  });

  assert.equal(secondo.duplicate, false);
  assert.equal(fake.rows("paymentTransaction").length, 2);
});

test("l'evento resta registrato anche quando non produce niente", async () => {
  await gateway.handleGatewayWebhookEvent(
    eventoRiuscito({ payment: null, type: "account.updated" }),
  );

  const righe = fake.rows("paymentWebhookEvent");
  assert.equal(righe.length, 1);
  assert.equal(righe[0].status, "ignored");
});

test("il corpo dell'evento non viene conservato", async () => {
  await gateway.handleGatewayWebhookEvent(
    eventoRiuscito({ raw: { segreto: "email di chi paga" } }),
  );

  const riga = fake.rows("paymentWebhookEvent")[0];
  assert.equal(
    JSON.stringify(riga).includes("email di chi paga"),
    false,
    "conservarlo vorrebbe dire una copia in piu dei dati di pagamento",
  );
});

/* ------------------------------------------- cosa non muove denaro */

test("una sessione compilata ma non pagata non incassa", async () => {
  const esito = await gateway.handleGatewayWebhookEvent(
    conPagamento({ status: "pending" }),
  );

  assert.equal(esito.status, "ignored");
  assert.equal(fake.rows("paymentTransaction").length, 0);
});

test("un pagamento fallito o scaduto non incassa", async () => {
  await gateway.handleGatewayWebhookEvent(
    conPagamento({ status: "failed" }),
  );
  await gateway.handleGatewayWebhookEvent({
    ...conPagamento({ status: "expired" }),
    id: "evt_2",
  });

  assert.equal(fake.rows("paymentTransaction").length, 0);
});

test("un pagamento senza riferimento a una rata non incassa", async () => {
  const esito = await gateway.handleGatewayWebhookEvent(
    conPagamento({
      reference: { organizationId: CLUB, paymentId: null, athleteId: null },
    }),
  );

  assert.equal(esito.status, "ignored");
  assert.match(esito.message, /non e nostro/);
  assert.equal(fake.rows("paymentTransaction").length, 0);
});

test("un pagamento senza club non incassa", async () => {
  const esito = await gateway.handleGatewayWebhookEvent(
    conPagamento({
      reference: { organizationId: "", paymentId: RATA, athleteId: null },
    }),
  );

  assert.equal(esito.status, "ignored");
  assert.equal(fake.rows("paymentTransaction").length, 0);
});

test("una rata di un altro club non si tocca", async () => {
  fake.rows("athletePayment").push({
    id: "rata-altro-club",
    organization_id: ALTRO_CLUB,
    amount: 100,
    status: "pending",
    data: {},
  });

  await assert.rejects(
    () =>
      gateway.handleGatewayWebhookEvent(
        conPagamento({
          reference: {
            organizationId: CLUB,
            paymentId: "rata-altro-club",
            athleteId: null,
          },
        }),
      ),
    /Accesso negato|non trovata/,
  );

  assert.equal(fake.rows("paymentTransaction").length, 0);
});

test("un evento senza identificativo non entra nemmeno in memoria", async () => {
  await assert.rejects(
    () => gateway.handleGatewayWebhookEvent(eventoRiuscito({ id: "" })),
    /senza identificativo/,
  );

  assert.equal(fake.rows("paymentWebhookEvent").length, 0);
});

/* ------------------------------------------------- lo stato del club */

test("un club senza conto di incasso non puo aprire un checkout", async () => {
  await assert.rejects(
    () =>
      gateway.openGatewayCheckout({
        organizationId: CLUB,
        amountCents: 4000,
        description: "Prima rata",
        successUrl: "https://esempio.it/ok",
        cancelUrl: "https://esempio.it/no",
      }),
    /non sono configurati|non ha ancora attivato|disattivati|in verifica/,
  );
});

test("il provider non arriva dalla richiesta ma dalle impostazioni del club", async () => {
  const contesto = await gateway.resolveClubGatewayContext(CLUB);

  assert.equal(contesto.organizationId, CLUB);
  assert.equal(contesto.readiness.canCheckout, false);
  assert.ok(contesto.readiness.blocker);
});

test("senza club non si risolve niente", async () => {
  await assert.rejects(
    () => gateway.resolveClubGatewayContext(""),
    /Accesso negato/,
  );
});

/* ------------------------------------------- sandbox contro produzione */

/**
 * La firma prova **chi** ha parlato, non **da dove**.
 *
 * Questi test girano senza `STRIPE_SECRET_KEY` e senza `PAYMENT_MODE`, quindi
 * l'ambiente atteso e quello di prova: e la configurazione di uno staging, che
 * e esattamente il caso da difendere.
 */

test("un evento live non incassa su un ambiente di prova", async () => {
  const esito = await gateway.handleGatewayWebhookEvent(
    eventoRiuscito({ liveMode: true }),
  );

  assert.equal(esito.status, "ignored");
  assert.equal(esito.transactionId, null);
  assert.equal(
    fake.rows("paymentTransaction").length,
    0,
    "denaro vero non entra nel registro di un database di prova",
  );
});

test("un evento dell'ambiente sbagliato non occupa la memoria dei duplicati", async () => {
  /*
    Se lo occupasse, il rinvio dello **stesso identificativo** all'ambiente a
    cui l'evento appartiene davvero risulterebbe un duplicato e verrebbe
    scartato senza registrare l'incasso. Per questo il controllo sta prima
    della deduplica e non dopo.
  */
  await gateway.handleGatewayWebhookEvent(eventoRiuscito({ liveMode: true }));

  assert.equal(fake.rows("paymentWebhookEvent").length, 0);

  const esito = await gateway.handleGatewayWebhookEvent(
    eventoRiuscito({ liveMode: false }),
  );

  assert.equal(esito.status, "processed");
  assert.equal(esito.duplicate, false);
  assert.equal(fake.rows("paymentTransaction").length, 1);
});

test("un evento che non dichiara l'ambiente non incassa", async () => {
  const esito = await gateway.handleGatewayWebhookEvent(
    eventoRiuscito({ liveMode: null }),
  );

  assert.equal(esito.status, "ignored");
  assert.equal(fake.rows("paymentTransaction").length, 0);
});
