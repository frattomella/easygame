import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Rimborsi, storni e stato dell'account**: cosa succede quando il denaro
 * torna indietro.
 *
 * Prima del Blocco D questi eventi arrivavano e non muovevano niente: un
 * rimborso su Stripe lasciava la rata segnata come pagata, e a scoprirlo era
 * la segreteria alla chiusura del mese.
 *
 * La distinzione che questi test presidiano e fra **storno** e **rimborso**.
 * Lo storno dice «questo incasso non e mai avvenuto»: e la correzione di un
 * errore di registrazione, e toglie dai totali sia l'incasso sia il movimento
 * che lo compensa. Il rimborso dice l'opposto — l'incasso e avvenuto, e poi
 * del denaro e tornato indietro — e restano due movimenti che **contano
 * entrambi**. E anche l'unico modo di rappresentare un rimborso parziale.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const ALTRO_CLUB = "bbbbbbbb-0000-4000-8000-000000000002";
const RATA = "cccccccc-0000-4000-8000-000000000003";
const ATLETA = "dddddddd-0000-4000-8000-000000000004";
const ACCOUNT = "acct_alfa";

let gateway;
let ledger;
let setPrismaClientForTests;
let fake;

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
      data: {},
    },
  ],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
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

const rimborso = (overrides = {}) => ({
  provider: "stripe",
  id: "evt_rimborso",
  type: "charge.refunded",
  createdAt: "2026-08-27T10:00:00.000Z",
  accountId: ACCOUNT,
  liveMode: false,
  payment: null,
  account: null,
  raw: {},
  refund: {
    externalRefundId: "re_1",
    externalPaymentId: "pi_1",
    amountCents: 3000,
    currency: "EUR",
    status: "succeeded",
    reference: { organizationId: CLUB, paymentId: RATA, athleteId: ATLETA },
    createdAt: "2026-08-27T10:00:00.000Z",
  },
  ...overrides,
});

const statoRata = () => {
  const charge = fake.rows("athletePayment").find((row) => row.id === RATA);
  const transactions = ledger.normalizePaymentTransactions(
    fake.rows("paymentTransaction").filter((row) => row.payment_id === RATA),
  );
  return ledger.resolveInstallmentLedger({ charge, transactions });
};

/* ---------------------------------------------- la commissione congelata */

test("l'incasso porta con se la commissione applicata quel giorno", async () => {
  await gateway.handleGatewayWebhookEvent(incasso());

  const riga = fake.rows("paymentTransaction")[0];

  assert.equal(riga.gross_amount_cents, 13000);
  assert.equal(riga.platform_fee_cents, 130);
  assert.equal(riga.net_amount_cents, 12870);
  assert.equal(riga.applied_fee_percent, 1);
  assert.equal(riga.commission_rule_id, "rule-1");
  assert.equal(riga.external_account_id, ACCOUNT);
  assert.equal(riga.external_payment_id, "pi_1");
  assert.equal(riga.external_event_id, "evt_pagamento");
});

test("cambiare la commissione non riscrive i movimenti gia registrati", async () => {
  await gateway.handleGatewayWebhookEvent(incasso());

  /* Cedi Soft passa dall'1% all'1,5%: e una decisione da domani, non da ieri. */
  fake.rows("platformCommissionRule").push({
    id: "rule-2",
    organization_id: null,
    percent: 1.5,
    fixed_cents: 0,
    effective_from: new Date("2026-08-26T00:00:00.000Z"),
  });

  const riga = fake.rows("paymentTransaction")[0];

  assert.equal(
    riga.platform_fee_cents,
    130,
    "lo storico non cambia perche il listino e cambiato",
  );
});

/* ------------------------------------------------------ rimborso parziale */

test("un rimborso parziale riporta la rata a parzialmente pagata", async () => {
  await gateway.handleGatewayWebhookEvent(incasso());
  assert.equal(statoRata().state, "paid");

  const esito = await gateway.handleGatewayWebhookEvent(rimborso());

  assert.equal(esito.status, "processed");

  const dopo = statoRata();
  assert.equal(dopo.paidAmount, 100, "130 incassati, 30 restituiti");
  assert.equal(dopo.residualAmount, 30);
  assert.equal(dopo.state, "partial");
});

test("il rimborso non cancella l'incasso originale", async () => {
  await gateway.handleGatewayWebhookEvent(incasso());
  await gateway.handleGatewayWebhookEvent(rimborso());

  const righe = fake.rows("paymentTransaction");

  assert.equal(righe.length, 2, "l'incasso resta, accanto al movimento di segno opposto");
  assert.equal(righe[0].amount, 130);
  assert.equal(righe[1].amount, -30);
  assert.equal(
    righe[0].reversed_at,
    undefined,
    "un rimborso non e uno storno: l'incasso e avvenuto davvero",
  );
});

test("il rimborso restituisce la quota proporzionale di commissione", async () => {
  await gateway.handleGatewayWebhookEvent(incasso());
  await gateway.handleGatewayWebhookEvent(rimborso());

  const storno = fake.rows("paymentTransaction")[1];

  assert.equal(storno.platform_fee_cents, -30);
  assert.equal(storno.gross_amount_cents, -3000);
});

test("un rimborso totale riporta la rata a scoperta", async () => {
  await gateway.handleGatewayWebhookEvent(incasso());
  await gateway.handleGatewayWebhookEvent(
    rimborso({ refund: { ...rimborso().refund, amountCents: 13000 } }),
  );

  const dopo = statoRata();
  assert.equal(dopo.paidAmount, 0);
  assert.equal(dopo.residualAmount, 130);
  assert.equal(dopo.state, "pending");
  assert.equal(fake.rows("paymentTransaction").length, 2);
});

test("un rimborso maggiore dell'incasso viene rifiutato", async () => {
  await gateway.handleGatewayWebhookEvent(incasso());

  await assert.rejects(
    () =>
      gateway.handleGatewayWebhookEvent(
        rimborso({ refund: { ...rimborso().refund, amountCents: 20000 } }),
      ),
    /supera quanto era stato incassato/i,
  );
});

test("due rimborsi non possono superare insieme l'incasso", async () => {
  await gateway.handleGatewayWebhookEvent(incasso());
  await gateway.handleGatewayWebhookEvent(rimborso());

  await assert.rejects(
    () =>
      gateway.handleGatewayWebhookEvent(
        rimborso({
          id: "evt_rimborso_2",
          refund: {
            ...rimborso().refund,
            externalRefundId: "re_2",
            amountCents: 11000,
          },
        }),
      ),
    /supera quanto era stato incassato/i,
  );
});

/* ------------------------------------------------------------- ripetizioni */

test("lo stesso evento di rimborso consegnato due volte non storna due volte", async () => {
  await gateway.handleGatewayWebhookEvent(incasso());
  await gateway.handleGatewayWebhookEvent(rimborso());
  const secondo = await gateway.handleGatewayWebhookEvent(rimborso());

  assert.equal(secondo.duplicate, true);
  assert.equal(fake.rows("paymentTransaction").length, 2);
});

test("due eventi diversi sullo stesso rimborso non lo registrano due volte", async () => {
  /*
    Non e un caso di laboratorio: `charge.refunded` e `charge.refund.updated`
    riguardano lo stesso rimborso e hanno identificativi di evento diversi. La
    deduplica degli eventi non basta: serve quella del rimborso.
  */
  await gateway.handleGatewayWebhookEvent(incasso());
  await gateway.handleGatewayWebhookEvent(rimborso());

  const secondo = await gateway.handleGatewayWebhookEvent(
    rimborso({ id: "evt_rimborso_bis", type: "charge.refund.updated" }),
  );

  assert.equal(secondo.duplicate, true);
  assert.equal(fake.rows("paymentTransaction").length, 2);
});

test("un rimborso di un incasso che non risulta viene ignorato, non inventato", async () => {
  const esito = await gateway.handleGatewayWebhookEvent(rimborso());

  assert.equal(esito.status, "ignored");
  assert.equal(fake.rows("paymentTransaction").length, 0);
});

test("un rimborso non riuscito non muove denaro", async () => {
  await gateway.handleGatewayWebhookEvent(incasso());

  const esito = await gateway.handleGatewayWebhookEvent(
    rimborso({ refund: { ...rimborso().refund, status: "pending" } }),
  );

  assert.equal(esito.status, "ignored");
  assert.equal(fake.rows("paymentTransaction").length, 1);
});

/* ------------------------------------------------ lo stato dell'account */

test("un evento sull'account aggiorna lo stato del club", async () => {
  const esito = await gateway.handleGatewayWebhookEvent({
    provider: "stripe",
    id: "evt_account",
    liveMode: false,
    type: "account.updated",
    createdAt: "2026-08-27T10:00:00.000Z",
    accountId: ACCOUNT,
    payment: null,
    refund: null,
    raw: {},
    account: {
      externalId: ACCOUNT,
      chargesEnabled: false,
      payoutsEnabled: false,
      currentlyDue: ["individual.verification.document"],
      pastDue: [],
      pendingVerification: [],
      disabledReason: null,
      organizationId: CLUB,
    },
  });

  assert.equal(esito.status, "processed");

  const account = fake.rows("clubPaymentAccount")[0];
  assert.equal(account.status, "action_required");
  assert.equal(account.charges_enabled, false);
  assert.deepEqual(account.requirements, ["individual.verification.document"]);
});

test("la sospensione decisa dalla piattaforma vince su cio che dice il PSP", async () => {
  fake.rows("clubPaymentAccount")[0].online_payments_enabled = false;
  /*
    **La data non e un dettaglio del doppio: e cio che rende «spento» una
    decisione.** Fino al Blocco E bastava il booleano, e non bastava — quel
    `false` e anche il default della colonna, quindi una riga mai
    inizializzata veniva scambiata per una societa sospesa e finiva
    `disabled` a ogni sincronizzazione riuscita (E9). Vedi
    `tests/server/connect-enablement.test.mjs`.
  */
  fake.rows("clubPaymentAccount")[0].online_payments_decided_at = new Date(
    "2026-08-20T09:00:00.000Z",
  );

  await gateway.handleGatewayWebhookEvent({
    provider: "stripe",
    id: "evt_account_2",
    liveMode: false,
    type: "account.updated",
    createdAt: "2026-08-27T10:00:00.000Z",
    accountId: ACCOUNT,
    payment: null,
    refund: null,
    raw: {},
    account: {
      externalId: ACCOUNT,
      chargesEnabled: true,
      payoutsEnabled: true,
      currentlyDue: [],
      pastDue: [],
      pendingVerification: [],
      disabledReason: null,
      organizationId: CLUB,
    },
  });

  assert.equal(
    fake.rows("clubPaymentAccount")[0].status,
    "disabled",
    "un evento del PSP non ribalta una decisione commerciale",
  );
});

/* ------------------------------------------------------- multi-tenant */

test("un evento che cita un club diverso dall'account non viene assecondato", async () => {
  /*
    I metadati li puo scrivere chiunque crei un pagamento sull'account
    connesso; `event.account` lo scrive Stripe. In condizioni normali
    coincidono sempre — ed e proprio per questo che una divergenza va fermata
    invece che interpretata.
  */
  const esito = await gateway.handleGatewayWebhookEvent(
    incasso({
      payment: {
        ...incasso().payment,
        reference: {
          organizationId: ALTRO_CLUB,
          paymentId: RATA,
          athleteId: ATLETA,
        },
      },
    }),
  );

  assert.equal(esito.status, "ignored");
  assert.match(esito.message, /club diverso/i);
  assert.equal(fake.rows("paymentTransaction").length, 0);
});

test("un incasso non finisce mai sul club sbagliato", async () => {
  await gateway.handleGatewayWebhookEvent(incasso());

  const righe = fake.rows("paymentTransaction");
  assert.equal(righe.length, 1);
  assert.equal(righe[0].organization_id, CLUB);
  assert.notEqual(righe[0].organization_id, ALTRO_CLUB);
});

test("un rimborso non attraversa il confine fra due societa", async () => {
  await gateway.handleGatewayWebhookEvent(incasso());

  /* Un evento firmato ma con l'account dell'altra societa. */
  const esito = await gateway.handleGatewayWebhookEvent(
    rimborso({ accountId: "acct_beta" }),
  );

  assert.equal(esito.status, "ignored");
  assert.equal(
    fake.rows("paymentTransaction").length,
    1,
    "il registro dell'altra societa non si tocca",
  );
});

/* ---------------------------------------------- il club senza Connect */

test("un evento da un account che EasyGame non conosce non muove denaro", async () => {
  /*
    Ripiegare sui metadati sarebbe il buco piu grande di tutti: chiunque possa
    far generare un evento su un proprio account Connect potrebbe metterci
    dentro l'identificativo di una rata altrui e vedersela registrata. Un
    account che non risulta collegato a nessuna societa viene ignorato.
  */
  fake.rows("clubPaymentAccount").length = 0;

  const esito = await gateway.handleGatewayWebhookEvent(incasso());

  assert.equal(esito.status, "ignored");
  assert.match(esito.message, /non risulta collegato a nessuna societa/i);
  assert.equal(fake.rows("paymentTransaction").length, 0);
});

test("un evento senza account connesso resta governato dai metadati", async () => {
  /*
    Gli eventi che **non** arrivano da Connect non hanno `event.account`: e il
    caso dei rilasci precedenti, e continua a funzionare come prima.
  */
  fake.rows("clubPaymentAccount").length = 0;

  const esito = await gateway.handleGatewayWebhookEvent(
    incasso({ accountId: null }),
  );

  assert.equal(esito.status, "processed");
  assert.equal(fake.rows("paymentTransaction")[0].organization_id, CLUB);
});
