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

/*
  I due eventi come li costruisce davvero il provider: entrambi identificano
  l'incasso con l'**intent**, e ciascuno tiene il proprio nome come alternativo.
  Vedi `paymentFromSession` e `paymentFromIntent`.
*/
const daIntent = (id) => ({
  ...eventoRiuscito({ id, type: "payment_intent.succeeded" }),
  payment: {
    ...eventoRiuscito().payment,
    externalId: "pi_1",
    relatedExternalIds: ["ch_1"],
  },
});

const daSessione = (id) => ({
  ...eventoRiuscito({ id, type: "checkout.session.completed" }),
  payment: {
    ...eventoRiuscito().payment,
    externalId: "pi_1",
    relatedExternalIds: ["cs_1"],
  },
});

test("intent prima, sessione poi: un incasso solo", async () => {
  const primo = await gateway.handleGatewayWebhookEvent(daIntent("evt_1"));
  const secondo = await gateway.handleGatewayWebhookEvent(daSessione("evt_2"));

  assert.equal(primo.duplicate, false);
  assert.equal(secondo.duplicate, true);
  assert.equal(fake.rows("paymentTransaction").length, 1);
});

test("sessione prima, intent poi: un incasso solo", async () => {
  /*
    **Il difetto della prima correzione, trovato al secondo pagamento del
    collaudo.** L'ordine di consegna non e garantito, e Stripe non promette
    che l'intent preceda la sessione: nel collaudo si sono presentati
    **entrambi** gli ordini, a un minuto di distanza.

    La prima correzione identificava l'incasso con la sessione e si affidava a
    un campo `checkout_session` sull'intent — che **non esiste**: un
    PaymentIntent non sa di essere nato da una sessione. La deduplica
    funzionava quindi in un ordine solo, e nell'ordine opposto la rata veniva
    accreditata due volte.

    Il test che avrebbe dovuto coprirlo era anch'esso difettoso: riusava lo
    stesso `id` di evento per i due eventi, quindi a scattare era la deduplica
    **dell'evento**, non quella del denaro. Passava senza provare niente.
  */
  const primo = await gateway.handleGatewayWebhookEvent(daSessione("evt_1"));
  const secondo = await gateway.handleGatewayWebhookEvent(daIntent("evt_2"));

  assert.equal(primo.duplicate, false);
  assert.equal(secondo.duplicate, true);
  assert.equal(fake.rows("paymentTransaction").length, 1);
});

test("i due eventi hanno davvero identificativi diversi, altrimenti il test non prova nulla", async () => {
  /*
    Guardia sulla guardia: se i due eventi finissero per avere lo stesso
    `id`, i due test qui sopra passerebbero per la ragione sbagliata — come e
    successo davvero.
  */
  assert.notEqual(daIntent("evt_1").id, daSessione("evt_2").id);
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

/* ------------------------------------- l'idempotenza del checkout */

test("due clic sullo stesso tentativo riusano la stessa sessione", () => {
  /*
    E' il motivo per cui la chiave esiste: due sessioni sullo stesso tentativo
    sono due addebiti a una famiglia.
  */
  const chiave = () =>
    gateway.buildCheckoutIdempotencyKey({
      organizationId: CLUB,
      paymentId: RATA,
      amountCents: 5000,
      settledCents: 0,
    });

  assert.equal(chiave(), chiave());
});

test("un secondo versamento dello stesso importo apre una sessione nuova", () => {
  /*
    **Il difetto trovato nel collaudo sandbox del Blocco E.** La chiave
    conteneva club, rata e importo, e nient'altro. Una famiglia che versa 50 €
    su una rata da 130 € e poi ne versa altri 50 riceveva la stessa sessione —
    quella gia pagata — e leggeva «hai completato il pagamento» davanti a un
    residuo di 80 €. Il secondo versamento era **impossibile**.

    Il collaudo non l'aveva intercettato per caso: la matrice prevedeva 50 e
    poi 80, due importi diversi. Con due acconti uguali si sarebbe visto
    subito.
  */
  const prima = gateway.buildCheckoutIdempotencyKey({
    organizationId: CLUB,
    paymentId: RATA,
    amountCents: 5000,
    settledCents: 0,
  });

  const dopo = gateway.buildCheckoutIdempotencyKey({
    organizationId: CLUB,
    paymentId: RATA,
    amountCents: 5000,
    settledCents: 5000,
  });

  assert.notEqual(
    prima,
    dopo,
    "dopo un incasso la rata e in un altro stato: serve una sessione nuova",
  );
});

test("rate diverse e club diversi non condividono una sessione", () => {
  const base = {
    organizationId: CLUB,
    paymentId: RATA,
    amountCents: 5000,
    settledCents: 0,
  };

  assert.notEqual(
    gateway.buildCheckoutIdempotencyKey(base),
    gateway.buildCheckoutIdempotencyKey({ ...base, organizationId: ALTRO_CLUB }),
  );
  assert.notEqual(
    gateway.buildCheckoutIdempotencyKey(base),
    gateway.buildCheckoutIdempotencyKey({ ...base, paymentId: "altra-rata" }),
  );
  assert.notEqual(
    gateway.buildCheckoutIdempotencyKey(base),
    gateway.buildCheckoutIdempotencyKey({ ...base, amountCents: 8000 }),
  );
});

test("un acconto senza rata resta distinguibile", () => {
  assert.match(
    gateway.buildCheckoutIdempotencyKey({
      organizationId: CLUB,
      paymentId: null,
      amountCents: 5000,
      settledCents: 0,
    }),
    /:acconto:/,
  );
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

test("se la lettura non vede l'incasso, il database lo ferma comunque", async () => {
  /*
    **La corsa fra i due eventi.** Il controllo applicativo e una lettura
    seguita da una scrittura: due invocazioni concorrenti leggono entrambe
    «non c'e» prima che una delle due scriva. Nel collaudo del Blocco E i due
    eventi dello stesso pagamento sono arrivati a 109 millisecondi di distanza
    e il doppio accredito si e verificato a **ogni** pagamento — non e un caso
    di laboratorio.

    Qui la corsa si riproduce accecando la lettura, che e esattamente cio che
    la concorrenza produce. A fermare il secondo incasso resta solo l'indice
    unico parziale `payment_transactions_incasso_unico`.
  */
  const primo = await gateway.handleGatewayWebhookEvent(daIntent("evt_1"));
  assert.equal(primo.duplicate, false);

  const letturaVera = fake.client.paymentTransaction.findFirst;
  let accecata = true;
  fake.client.paymentTransaction.findFirst = async (args) =>
    accecata ? null : letturaVera(args);

  try {
    const secondo = await gateway.handleGatewayWebhookEvent(daSessione("evt_2"));

    assert.equal(
      secondo.duplicate,
      true,
      "il vincolo del database deve tradursi in «gia incassato», non in un errore",
    );
  } finally {
    accecata = false;
    fake.client.paymentTransaction.findFirst = letturaVera;
  }

  assert.equal(
    fake.rows("paymentTransaction").length,
    1,
    "due eventi concorrenti, un incasso solo",
  );
});

test("un errore che non sia il vincolo non viene scambiato per un duplicato", async () => {
  /*
    La cattura non deve diventare un tappo che nasconde guasti veri: un
    incasso perso in silenzio e peggio di un incasso contato due volte,
    perche nessuno lo cerca.
  */
  const creaVera = fake.client.paymentTransaction.create;
  fake.client.paymentTransaction.create = async () => {
    throw new Error("il database non risponde");
  };

  try {
    await assert.rejects(
      () => gateway.handleGatewayWebhookEvent(daIntent("evt_9")),
      /il database non risponde/,
    );
  } finally {
    fake.client.paymentTransaction.create = creaVera;
  }
});

/* ------------------------- la commissione del PSP, recuperata piu tardi */

test("la commissione del PSP si recupera quando la transazione di saldo matura", async () => {
  /*
    **Il difetto trovato nel collaudo sandbox del Blocco E.** La commissione di
    Stripe non viaggia nell'evento: vive sul `balance_transaction`, che matura
    **dopo**. Il webhook arriva entro frazioni di secondo e la trova quasi
    sempre non pronta — nel collaudo era `null` su **tutti** gli incassi.

    Il campo era progettato per essere riempito «piu tardi», e il commento nel
    provider lo dice; ma quel piu tardi non esisteva: `fetchSettlement` veniva
    chiamata in un punto solo, alla registrazione, e nessuno tornava a
    chiedere. Il risultato e che `net_amount_cents` restava il lordo meno la
    sola quota di piattaforma, cioe **sovrastimava il netto del club** di tutta
    la commissione Stripe.
  */
  await gateway.handleGatewayWebhookEvent(daIntent("evt_1"));

  const incasso = fake.rows("paymentTransaction")[0];
  assert.equal(
    incasso.provider_fee_cents,
    null,
    "alla registrazione la commissione non e ancora nota",
  );

  /*
    Ora il saldo e maturato e il provider sa rispondere. Si sostituisce il
    trasporto, non la traduzione: cio che si vuole provare e che EasyGame torni
    a chiedere e scriva il numero giusto, non che sappia parlare HTTP.
  */
  process.env.STRIPE_SECRET_KEY = `sk_${"test"}_non_e_una_chiave_vera`;
  const fetchVera = globalThis.fetch;
  globalThis.fetch = async (url) => ({
    ok: true,
    status: 200,
    json: async () =>
      String(url).includes("pi_non_maturo")
        ? {
            id: "pi_non_maturo",
            /* Non ancora espansa: e un identificativo, non l'oggetto. */
            latest_charge: { id: "ch_x", balance_transaction: "txn_x" },
          }
        : {
            id: "pi_1",
            latest_charge: {
              id: "ch_1",
              balance_transaction: {
                amount: 4000,
                net: 3754,
                fee: 246,
                fee_details: [
                  { type: "stripe_fee", amount: 146 },
                  { type: "application_fee", amount: 100 },
                ],
              },
            },
          },
  });

  fake.client.paymentTransaction.findMany = async () => [
    {
      id: incasso.id,
      external_payment_id: "pi_1",
      external_account_id: "acct_1",
      gross_amount_cents: 4000,
      platform_fee_cents: 100,
      organization_id: CLUB,
    },
  ];

  const aggiornamenti = [];
  fake.client.paymentTransaction.update = async (args) => {
    aggiornamenti.push(args.data);
    return { id: incasso.id, ...args.data };
  };

  const esito = await gateway.backfillProviderFees({ limit: 10 });

  globalThis.fetch = fetchVera;
  delete process.env.STRIPE_SECRET_KEY;

  assert.equal(esito.aggiornati, 1);
  assert.equal(aggiornamenti[0].provider_fee_cents, 146);
  assert.equal(
    aggiornamenti[0].net_amount_cents,
    4000 - 100 - 146,
    "il netto del club e il lordo meno **entrambe** le trattenute",
  );
});

test("se il saldo non e ancora maturo non si scrive niente", async () => {
  /*
    `null` significa «non ancora noto», non zero. Scriverci zero direbbe
    «gratis», che e un'affermazione diversa — e falsa.
  */
  await gateway.handleGatewayWebhookEvent(daIntent("evt_1"));
  const incasso = fake.rows("paymentTransaction")[0];

  process.env.STRIPE_SECRET_KEY = `sk_${"test"}_non_e_una_chiave_vera`;
  const fetchVera = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      id: "pi_non_maturo",
      /* Un identificativo, non l'oggetto: il saldo non e ancora maturato. */
      latest_charge: { id: "ch_x", balance_transaction: "txn_x" },
    }),
  });

  fake.client.paymentTransaction.findMany = async () => [
    {
      id: incasso.id,
      external_payment_id: "pi_non_maturo",
      external_account_id: "acct_1",
      gross_amount_cents: 4000,
      platform_fee_cents: 100,
      organization_id: CLUB,
    },
  ];

  let scritture = 0;
  fake.client.paymentTransaction.update = async () => {
    scritture += 1;
    return {};
  };

  const esito = await gateway.backfillProviderFees({ limit: 10 });

  globalThis.fetch = fetchVera;
  delete process.env.STRIPE_SECRET_KEY;

  assert.equal(esito.aggiornati, 0);
  assert.equal(scritture, 0);
});

/* ------------------------------- il tentativo fallito, e la riconsegna */

/**
 * **Un tentativo fallito non e un evento gia elaborato.**
 *
 * La riga di deduplica si scrive **prima** di agire — ed e giusto, perche e il
 * vincolo di unicita a rendere affidabile la deduplica fra consegne
 * simultanee. Ma se qualcosa falliva dopo l'inserimento, `markFailed` lasciava
 * la riga dov'era e la rotta rispondeva 500. Alla riconsegna dello stesso
 * `evt_` l'inserimento falliva di nuovo, e il ramo del doppione rispondeva
 * **200 «gia ricevuto»**: il provider smetteva di ritentare.
 *
 * Il risultato e il caso peggiore che questo dominio conosca. Il denaro e sul
 * conto del club e in EasyGame non esiste nessuna riga: la rata resta
 * scoperta, il sollecito riparte, e la famiglia viene invitata a pagare una
 * seconda volta. Un incasso perso in silenzio e peggio di uno contato due
 * volte, perche nessuno lo va a cercare.
 *
 * La finestra non e teorica: fra l'inserimento e la scrittura del movimento
 * ci sono piu viaggi verso il database e una chiamata HTTPS al provider senza
 * timeout.
 */
test("un evento fallito e poi riconsegnato viene elaborato, non scambiato per un doppione", async () => {
  const evento = conPagamento({
    reference: {
      organizationId: CLUB,
      paymentId: "rata-che-arriva-dopo",
      athleteId: null,
    },
  });

  await assert.rejects(
    () => gateway.handleGatewayWebhookEvent(evento),
    /Accesso negato|non trovata/,
    "il primo tentativo fallisce dopo aver gia scritto la riga di deduplica",
  );

  assert.equal(fake.rows("paymentTransaction").length, 0);
  assert.equal(fake.rows("paymentWebhookEvent")[0].status, "failed");

  // La condizione transitoria si risolve: la rata c'e.
  fake.rows("athletePayment").push({
    id: "rata-che-arriva-dopo",
    organization_id: CLUB,
    athlete_id: ATLETA,
    amount: 100,
    status: "pending",
    description: "Rata arrivata dopo",
    data: {},
  });

  const ritentato = await gateway.handleGatewayWebhookEvent(evento);

  assert.equal(
    ritentato.duplicate,
    false,
    "la riconsegna di un tentativo fallito non e un doppione",
  );
  assert.equal(
    fake.rows("paymentTransaction").length,
    1,
    "il denaro incassato dal provider deve finire nel registro",
  );
});

/**
 * Il verso opposto, che e la ragione per cui la riga si scrive prima: un
 * evento **riuscito** e riconsegnato resta un doppione, e non incassa due
 * volte. La ripresa vale solo per lo stato `failed`.
 */
test("la ripresa non riapre un evento gia riuscito", async () => {
  const evento = eventoRiuscito();

  await gateway.handleGatewayWebhookEvent(evento);
  const secondo = await gateway.handleGatewayWebhookEvent(evento);
  const terzo = await gateway.handleGatewayWebhookEvent(evento);

  assert.equal(secondo.duplicate, true);
  assert.equal(terzo.duplicate, true);
  assert.equal(fake.rows("paymentTransaction").length, 1);
});
