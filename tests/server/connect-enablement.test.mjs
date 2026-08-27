import assert from "node:assert/strict";
import test, { before, beforeEach, afterEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **E9 — l'interruttore commerciale di un club che aveva gia una riga.**
 *
 * Il difetto, trovato nel collaudo sandbox del Blocco E: `startConnectOnboarding`
 * e `applyProviderAccountSnapshot` scrivevano `online_payments_enabled: true`
 * **solo** nel ramo `create` dell'upsert. Bastava che una riga di
 * `club_payment_accounts` esistesse gia — legacy, o creata da un percorso che
 * non era l'onboarding — perche il valore restasse a `false`, cioe al default
 * della colonna, per sempre. Il club completava l'onboarding, Stripe dichiarava
 * l'account operativo, e EasyGame rispondeva «i pagamenti online non sono
 * attivi per questa societa».
 *
 * Peggio: `applyProviderAccountSnapshot` leggeva quel `false` come una
 * sospensione della piattaforma e forzava lo stato a `disabled` **a ogni**
 * sincronizzazione riuscita.
 *
 * La correzione non e un `true` indiscriminato — che sarebbe il difetto
 * opposto, e peggiore: riaccendere gli incassi di una societa sospesa di
 * proposito. Le due cose si distinguono con una data,
 * `online_payments_decided_at`: presente quando qualcuno ha deciso, assente
 * quando il `false` e solo il default della colonna.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const ALTRO_CLUB = "bbbbbbbb-0000-4000-8000-000000000002";
const ACCOUNT = "acct_alfa";
const ALTRO_ACCOUNT = "acct_beta";

let connect;
let setPrismaClientForTests;
let fake;
let fetchOriginale;

before(async () => {
  connect = await import("../../src/lib/server/connect-accounts.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

/*
  L'abbonamento e in corso: qui si prova la catena fra l'interruttore
  commerciale della piattaforma e lo stato dell'account connesso, e un club
  senza abbonamento si fermerebbe prima — a un ostacolo che questi test non
  riguardano.
*/
const ABBONAMENTO_IN_CORSO = {
  subscription: { plan: "plus", status: "active" },
};

const seed = (clubPaymentAccount = []) => ({
  club: [
    { id: CLUB, name: "ASD Alfa", settings: ABBONAMENTO_IN_CORSO },
    { id: ALTRO_CLUB, name: "ASD Beta", settings: ABBONAMENTO_IN_CORSO },
  ],
  clubPaymentAccount,
});

/** L'account e operativo: charges attive, nessun requisito pendente. */
const operativo = (externalId = ACCOUNT) => ({
  externalId,
  chargesEnabled: true,
  payoutsEnabled: true,
  currentlyDue: [],
  pastDue: [],
  pendingVerification: [],
  disabledReason: null,
});

const beforeEachCon = (righe) => {
  fake = createFakePrisma(seed(righe));
  setPrismaClientForTests(fake.client);
};

beforeEach(() => {
  /* Il prefisso non si scrive per esteso: vedi `tests/ui/ci-guardrails.test.mjs`. */
  process.env.STRIPE_SECRET_KEY = `sk_${"test"}_non_e_una_chiave_vera`;
  fetchOriginale = globalThis.fetch;
  beforeEachCon([]);
});

afterEach(() => {
  globalThis.fetch = fetchOriginale;
  delete process.env.STRIPE_SECRET_KEY;
  setPrismaClientForTests(null);
});

const rigaDi = (organizationId = CLUB) =>
  fake.rows("clubPaymentAccount").find(
    (row) => row.organization_id === organizationId,
  );

/** Stripe risponde: un account creato e un link di onboarding. */
const stripeRisponde = (accountId = ACCOUNT) => {
  globalThis.fetch = async (url) => {
    const indirizzo = String(url);

    if (indirizzo.includes("/core/account_links")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          url: "https://connect.stripe.invalid/setup",
          expires_at: "2026-12-31T00:00:00.000Z",
        }),
      };
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: accountId,
        configuration: { merchant: { capabilities: {} } },
        requirements: { entries: [] },
      }),
    };
  };
};

const avviaOnboarding = (organizationId = CLUB) =>
  connect.startConnectOnboarding({
    organizationId,
    clubName: "EasyGame FC",
    email: "segreteria@example.invalid",
    returnUrl: "https://easygame.invalid/ritorno",
    refreshUrl: "https://easygame.invalid/riprova",
  });

/* --------------------------------------------------------------------- A */

test("A — senza riga preesistente, l'onboarding accende l'interruttore", async () => {
  stripeRisponde();

  const risultato = await avviaOnboarding();

  assert.equal(risultato.account.onlinePaymentsEnabled, true);
  assert.equal(rigaDi().online_payments_enabled, true);
});

/* --------------------------------------------------------------------- B */

test("B — una riga legacy non resta spenta per sempre dopo l'onboarding", async () => {
  /*
    La riga che riproduce il difetto: esiste, non ha mai avuto un account, e
    porta il default della colonna. Prima della correzione il ramo `update`
    non toccava l'interruttore e questa riga restava `false` per sempre.
  */
  beforeEachCon([
    {
      id: "cpa-legacy",
      organization_id: CLUB,
      provider: "stripe",
      external_account_id: null,
      account_type: "standard",
      status: "not_configured",
      charges_enabled: false,
      payouts_enabled: false,
      requirements: [],
      online_payments_enabled: false,
      online_payments_decided_at: null,
    },
  ]);

  stripeRisponde();

  const risultato = await avviaOnboarding();

  assert.equal(risultato.account.onlinePaymentsEnabled, true);
  assert.equal(rigaDi().online_payments_enabled, true);
});

test("B — una riga legacy che il PSP dichiara operativa viene abilitata", async () => {
  beforeEachCon([
    {
      id: "cpa-legacy",
      organization_id: CLUB,
      provider: "stripe",
      external_account_id: ACCOUNT,
      account_type: "standard",
      status: "onboarding_required",
      charges_enabled: false,
      payouts_enabled: false,
      requirements: ["individual.id_number"],
      online_payments_enabled: false,
      online_payments_decided_at: null,
    },
  ]);

  const account = await connect.applyProviderAccountSnapshot({
    organizationId: CLUB,
    snapshot: operativo(),
  });

  assert.equal(account.state, "active");
  assert.equal(account.onlinePaymentsEnabled, true);
});

test("B — lo stato non viene piu forzato a «disabilitato» da un default", async () => {
  beforeEachCon([
    {
      id: "cpa-legacy",
      organization_id: CLUB,
      provider: "stripe",
      external_account_id: ACCOUNT,
      account_type: "standard",
      status: "onboarding_required",
      charges_enabled: false,
      payouts_enabled: false,
      requirements: [],
      online_payments_enabled: false,
      online_payments_decided_at: null,
    },
  ]);

  await connect.applyProviderAccountSnapshot({
    organizationId: CLUB,
    snapshot: operativo(),
  });

  assert.equal(rigaDi().status, "active");
});

/* --------------------------------------------------------------------- C */

test("C — una sospensione decisa dalla piattaforma sopravvive a account.updated", async () => {
  /* Prima l'onboarding, poi la sospensione esplicita: l'ordine del difetto. */
  stripeRisponde();
  await avviaOnboarding();

  await connect.setClubOnlinePaymentsEnabled({
    organizationId: CLUB,
    enabled: false,
  });

  assert.ok(
    rigaDi().online_payments_decided_at,
    "la sospensione esplicita deve lasciare una data",
  );

  const account = await connect.applyProviderAccountSnapshot({
    organizationId: CLUB,
    snapshot: operativo(),
  });

  assert.equal(account.onlinePaymentsEnabled, false);
  assert.equal(account.state, "disabled");
});

test("C — una sospensione esplicita non viene revocata da un nuovo onboarding", async () => {
  await connect.setClubOnlinePaymentsEnabled({
    organizationId: CLUB,
    enabled: false,
  });

  stripeRisponde();
  const risultato = await avviaOnboarding();

  assert.equal(risultato.account.onlinePaymentsEnabled, false);
  assert.equal(risultato.account.state, "disabled");
});

test("C — riaccendere e una decisione, e resta una decisione", async () => {
  await connect.setClubOnlinePaymentsEnabled({
    organizationId: CLUB,
    enabled: false,
  });

  await connect.setClubOnlinePaymentsEnabled({
    organizationId: CLUB,
    enabled: true,
  });

  const account = await connect.applyProviderAccountSnapshot({
    organizationId: CLUB,
    snapshot: operativo(),
  });

  assert.equal(account.onlinePaymentsEnabled, true);
  assert.equal(account.state, "active");
});

/* --------------------------------------------------------------------- D */

test("D — abilitare un club non tocca l'interruttore di un altro", async () => {
  beforeEachCon([
    {
      id: "cpa-alfa",
      organization_id: CLUB,
      provider: "stripe",
      external_account_id: ACCOUNT,
      account_type: "standard",
      status: "onboarding_required",
      charges_enabled: false,
      payouts_enabled: false,
      requirements: [],
      online_payments_enabled: false,
      online_payments_decided_at: null,
    },
    {
      id: "cpa-beta",
      organization_id: ALTRO_CLUB,
      provider: "stripe",
      external_account_id: ALTRO_ACCOUNT,
      account_type: "standard",
      status: "disabled",
      charges_enabled: true,
      payouts_enabled: true,
      requirements: [],
      online_payments_enabled: false,
      /* Beta e sospesa di proposito: la data lo dice. */
      online_payments_decided_at: new Date("2026-08-01T00:00:00.000Z"),
    },
  ]);

  await connect.applyProviderAccountSnapshot({
    organizationId: CLUB,
    snapshot: operativo(),
  });

  assert.equal(rigaDi(CLUB).online_payments_enabled, true);
  assert.equal(rigaDi(ALTRO_CLUB).online_payments_enabled, false);
  assert.equal(rigaDi(ALTRO_CLUB).status, "disabled");
});

test("D — la sospensione di un club non spegne quello accanto", async () => {
  beforeEachCon([
    {
      id: "cpa-alfa",
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
      id: "cpa-beta",
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
  ]);

  await connect.setClubOnlinePaymentsEnabled({
    organizationId: ALTRO_CLUB,
    enabled: false,
  });

  assert.equal(rigaDi(CLUB).online_payments_enabled, true);
  assert.equal(rigaDi(ALTRO_CLUB).online_payments_enabled, false);
});

/* --------------------------------------------------------------------- E */

test("E — un account non pronto non abilita niente", async () => {
  beforeEachCon([
    {
      id: "cpa-legacy",
      organization_id: CLUB,
      provider: "stripe",
      external_account_id: ACCOUNT,
      account_type: "standard",
      status: "onboarding_required",
      charges_enabled: false,
      payouts_enabled: false,
      requirements: [],
      online_payments_enabled: false,
      online_payments_decided_at: null,
    },
  ]);

  const account = await connect.applyProviderAccountSnapshot({
    organizationId: CLUB,
    snapshot: {
      ...operativo(),
      chargesEnabled: false,
      currentlyDue: ["individual.verification.document"],
    },
  });

  assert.equal(account.state, "action_required");
  assert.equal(account.onlinePaymentsEnabled, false);
});

test("E — un account limitato dal PSP non viene abilitato", async () => {
  beforeEachCon([
    {
      id: "cpa-legacy",
      organization_id: CLUB,
      provider: "stripe",
      external_account_id: ACCOUNT,
      account_type: "standard",
      status: "onboarding_required",
      charges_enabled: false,
      payouts_enabled: false,
      requirements: [],
      online_payments_enabled: false,
      online_payments_decided_at: null,
    },
  ]);

  const account = await connect.applyProviderAccountSnapshot({
    organizationId: CLUB,
    snapshot: { ...operativo(), disabledReason: "requirements" },
  });

  assert.equal(account.state, "restricted");
  assert.equal(account.onlinePaymentsEnabled, false);
});

test("E — l'onboarding predispone l'incasso ma non lo rende possibile", async () => {
  /*
    L'interruttore commerciale acceso non basta: `describeCheckoutReadiness`
    chiede anche che l'account sia `active` e che incassi davvero. Sono due
    condizioni diverse e la prima non implica la seconda — e la ragione per
    cui inizializzare l'interruttore all'avvio dell'onboarding e sicuro.
  */
  stripeRisponde();
  const risultato = await avviaOnboarding();

  assert.equal(risultato.account.onlinePaymentsEnabled, true);

  const { readiness } = await connect.resolveCheckoutReadiness({
    organizationId: CLUB,
    clubEnabled: true,
  });

  assert.equal(readiness.canCheckout, false);
  assert.equal(readiness.blocker, "account_not_ready");
});

/* ------------------------------- l'abbonamento accende, o non accende, la CTA */

/**
 * **Il difetto trovato a runtime nel collaudo E-13.**
 *
 * `/api/v1/payments/account` e cio che accende «Paga online» nella scheda di
 * un atleta, e la sua risposta veniva calcolata senza sapere nulla
 * dell'abbonamento: su un club con il piano `free` il pulsante compariva, e il
 * clic rispondeva «Accesso negato: l'abbonamento non e in corso» — perche la
 * rotta che incassa l'abbonamento lo chiedeva eccome. Due meta della stessa
 * regola, lette in due posti diversi.
 *
 * Sono le due proprieta che, insieme, dicono che le meta sono tornate una.
 */

test("un club senza abbonamento in corso non vede accendersi «Paga online»", async () => {
  stripeRisponde();
  await avviaOnboarding();

  await connect.applyProviderAccountSnapshot({
    organizationId: CLUB,
    provider: "stripe",
    snapshot: operativo(),
  });

  /* Il piano torna quello di un club che non ha comprato i pagamenti online. */
  fake.rows("club").find((row) => row.id === CLUB).settings = {
    subscription: { plan: "free", status: "not_active" },
  };

  const { readiness } = await connect.resolveCheckoutReadiness({
    organizationId: CLUB,
    clubEnabled: true,
  });

  assert.equal(readiness.canCheckout, false);
  assert.equal(readiness.blocker, "subscription_inactive");
  assert.match(
    readiness.message,
    /abbonamento|piano/i,
    "il messaggio deve dire come si risolve, non «non disponibile»",
  );
});

test("con l'abbonamento in corso il conto operativo torna a poter incassare", async () => {
  stripeRisponde();
  await avviaOnboarding();

  await connect.applyProviderAccountSnapshot({
    organizationId: CLUB,
    provider: "stripe",
    snapshot: operativo(),
  });

  const { readiness } = await connect.resolveCheckoutReadiness({
    organizationId: CLUB,
    clubEnabled: true,
  });

  assert.equal(
    readiness.canCheckout,
    true,
    `atteso incassabile, bloccato da ${readiness.blocker}: ${readiness.message}`,
  );
  assert.equal(readiness.blocker, null);
});
