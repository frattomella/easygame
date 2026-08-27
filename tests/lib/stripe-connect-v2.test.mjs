import assert from "node:assert/strict";
import test, { before, beforeEach, afterEach } from "node:test";
import fs from "node:fs";
import path from "node:path";

/**
 * Il **provisioning degli account connessi**, che parla Accounts v2.
 *
 * **Perche la migrazione esiste.** Stripe non crea piu account con
 * `POST /v1/accounts` per le integrazioni nuove: risponde con un rifiuto che
 * rimanda a `POST /v2/core/accounts`, e offre in alternativa un interruttore
 * di compatibilita sul cruscotto. EasyGame non e ancora in produzione con i
 * pagamenti online, quindi accendere quell'interruttore avrebbe voluto dire
 * nascere su una API deprecata. Vedi ADR-0061.
 *
 * **Cosa NON e migrato, di proposito.** Checkout, addebiti, rimborsi,
 * movimenti di saldo e verifica della firma restano sulla v1, che li serve
 * correttamente. Stripe dichiara l'interoperabilita fra le due versioni e
 * accetta un identificativo creato in v2 sugli endpoint v1.
 *
 * Questi test non parlano con Stripe: sostituiscono il trasporto e provano
 * **la traduzione**, che e la parte in cui si sbaglia in silenzio.
 */

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..");

let stripe;
let fetchOriginale;
let chiamate;
let risposta;

before(async () => {
  stripe = await import("../../src/lib/payments/gateway/providers/stripe.ts");
});

beforeEach(() => {
  /* Il prefisso non si scrive per esteso: vedi `tests/ui/ci-guardrails.test.mjs`. */
  process.env.STRIPE_SECRET_KEY = `sk_${"test"}_non_e_una_chiave_vera`;
  fetchOriginale = globalThis.fetch;
  chiamate = [];
  risposta = {};

  globalThis.fetch = async (url, options) => {
    chiamate.push({
      url: String(url),
      method: options?.method || "",
      headers: options?.headers || {},
      body: options?.body ? JSON.parse(String(options.body)) : null,
    });

    return { ok: true, status: 200, json: async () => risposta };
  };
});

afterEach(() => {
  globalThis.fetch = fetchOriginale;
  delete process.env.STRIPE_SECRET_KEY;
});

/* ------------------------------------------------------------ creazione */

const creaClub = (accountType = "standard") =>
  stripe.stripeProvider.createMerchant({
    organizationId: "org-1",
    clubName: "EasyGame FC",
    email: "segreteria@example.invalid",
    country: "IT",
    accountType,
  });

test("l'account si crea sulla v2, non sulla v1", async () => {
  risposta = { id: "acct_v2" };
  await creaClub();

  const [chiamata] = chiamate;
  assert.equal(chiamata.url, "https://api.stripe.com/v2/core/accounts");
  assert.equal(chiamata.method, "POST");
  assert.ok(
    !chiamata.url.includes("/v1/"),
    "il provisioning non deve toccare la v1",
  );
});

test("la v2 richiede la versione di API e un corpo JSON", async () => {
  /*
    Senza l'intestazione di versione la v2 risponde 400 — e lo fa per ogni
    chiamata, non solo per la prima. Senza JSON non riconosce il corpo: la v1
    voleva `form-urlencoded`, e portarsi dietro quell'abitudine e l'errore
    piu facile da fare in questa migrazione.
  */
  risposta = { id: "acct_v2" };
  await creaClub();

  const { headers } = chiamate[0];
  assert.equal(headers["Content-Type"], "application/json");
  assert.match(headers["Stripe-Version"], /^\d{4}-\d{2}-\d{2}/);
});

test("il club nasce esercente, con cruscotto completo e carte richieste", async () => {
  risposta = { id: "acct_v2" };
  await creaClub();

  const { body } = chiamate[0];
  assert.equal(body.dashboard, "full");
  assert.equal(
    body.configuration.merchant.capabilities.card_payments.requested,
    true,
  );
  assert.equal(body.identity.country, "IT");
  assert.equal(body.defaults.currency, "eur");
  assert.equal(body.metadata.easygame_organization_id, "org-1");
});

test("commissioni e perdite restano in capo a Stripe e al club", async () => {
  /*
    E la coppia equivalente all'account Standard della v1, e non e un
    dettaglio di configurazione: dice **chi e l'esercente**. Con
    `fees_collector: "application"` sarebbe EasyGame a pagare le commissioni
    Stripe e a doverle poi riaddebitare, e con `losses_collector:
    "application"` sarebbe EasyGame a rispondere del saldo negativo di un
    club. Nessuna delle due cose e vera nel modello della V1, e nessuna delle
    due si puo correggere dopo: Stripe congela le responsabilita alla
    creazione.
  */
  risposta = { id: "acct_v2" };
  await creaClub();

  const { responsibilities } = chiamate[0].body.defaults;
  assert.equal(responsibilities.fees_collector, "stripe");
  assert.equal(responsibilities.losses_collector, "stripe");
});

test("un account express chiede il cruscotto express", async () => {
  risposta = { id: "acct_v2" };
  await creaClub("express");

  assert.equal(chiamate[0].body.dashboard, "express");
});

/* ------------------------------------------------------- normalizzazione */

const CONTO = (cardStatus, cardDetails, payoutStatus, entries = []) => ({
  id: "acct_v2",
  closed: false,
  configuration: {
    merchant: {
      capabilities: {
        card_payments: { status: cardStatus, status_details: cardDetails },
        stripe_balance: { payouts: { status: payoutStatus } },
      },
    },
  },
  requirements: { entries },
});

test("un account appena creato e «in attesa», non «limitato»", async () => {
  /*
    Il caso che rende la migrazione delicata. Alla nascita la v2 dice
    `restricted` con motivo `requirements_past_due`: tradurlo alla lettera
    direbbe alla console che Stripe ha bloccato il club un istante dopo
    averlo creato, e manderebbe una segreteria a cercare un guasto
    inesistente invece che a completare l'onboarding.
  */
  risposta = CONTO(
    "restricted",
    [{ code: "requirements_past_due", resolution: "provide_info" }],
    "restricted",
  );

  const merchant = await creaClub();

  assert.equal(merchant.status, "pending");
  assert.equal(merchant.chargesEnabled, false);
  assert.equal(merchant.payoutsEnabled, false);
});

test("un blocco vero resta un blocco", async () => {
  risposta = CONTO("restricted", [{ code: "restricted_other" }], "restricted");

  const merchant = await creaClub();

  assert.equal(merchant.status, "restricted");
});

test("un paese non supportato spegne l'account", async () => {
  risposta = CONTO("unsupported", [{ code: "unsupported_country" }], "restricted");

  assert.equal((await creaClub()).status, "disabled");
});

test("le due capacita attive fanno un account operativo", async () => {
  risposta = CONTO("active", [], "active");

  const merchant = await creaClub();

  assert.equal(merchant.status, "active");
  assert.equal(merchant.chargesEnabled, true);
  assert.equal(merchant.payoutsEnabled, true);
});

test("incassa ma non riceve: non e ancora operativo", async () => {
  risposta = CONTO("active", [], "restricted");

  const merchant = await creaClub();

  assert.equal(merchant.chargesEnabled, true);
  assert.equal(merchant.payoutsEnabled, false);
  assert.equal(merchant.status, "pending");
});

test("si mostrano le richieste scadute e in scadenza, non le future", async () => {
  /*
    Le voci «eventually due» non impediscono di incassare oggi. Metterle
    davanti al club insieme alle altre farebbe sembrare urgente cio che non
    lo e, e la lista lunga e il modo piu sicuro perche non venga letta.
  */
  risposta = CONTO("restricted", [{ code: "requirements_past_due" }], "restricted", [
    {
      description: "configuration.merchant.mcc",
      minimum_deadline: { status: "past_due" },
    },
    {
      description: "identity.individual.id_number",
      minimum_deadline: { status: "currently_due" },
    },
    {
      description: "identity.individual.address",
      minimum_deadline: { status: "eventually_due" },
    },
  ]);

  const merchant = await creaClub();

  assert.deepEqual(merchant.pendingRequirements, [
    "configuration.merchant.mcc",
    "identity.individual.id_number",
  ]);
});

/* ------------------------------------------------------------ onboarding */

test("il link di onboarding si chiede alla v2, con il caso d'uso esplicito", async () => {
  risposta = { url: "https://connect.stripe.test/x", expires_at: "2026-08-27T01:00:00.000Z" };

  const link = await stripe.stripeProvider.createOnboardingLink({
    merchantExternalId: "acct_v2",
    returnUrl: "https://easygame.test/ritorno",
    refreshUrl: "https://easygame.test/rinnova",
  });

  const [chiamata] = chiamate;
  assert.equal(chiamata.url, "https://api.stripe.com/v2/core/account_links");
  assert.equal(chiamata.body.account, "acct_v2");
  assert.equal(chiamata.body.use_case.type, "account_onboarding");
  assert.deepEqual(chiamata.body.use_case.account_onboarding.configurations, [
    "merchant",
  ]);
  assert.equal(
    chiamata.body.use_case.account_onboarding.return_url,
    "https://easygame.test/ritorno",
  );
  assert.equal(link.url, "https://connect.stripe.test/x");
});

test("la scadenza del link resta la data ISO che manda Stripe", async () => {
  /*
    Sulla v1 `expires_at` era un intero epoch e andava convertito. Sulla v2 e
    gia una stringa ISO: applicarci la vecchia conversione produrrebbe una
    data del 1970, cioe un link che risulta scaduto appena creato.
  */
  risposta = { url: "https://connect.stripe.test/y", expires_at: "2026-08-27T01:00:00.000Z" };

  const link = await stripe.stripeProvider.createOnboardingLink({
    merchantExternalId: "acct_v2",
    returnUrl: "https://easygame.test/r",
    refreshUrl: "https://easygame.test/f",
  });

  assert.equal(link.expiresAt, "2026-08-27T01:00:00.000Z");
});

/* ------------------------------------------------------------- rilettura */

test("la rilettura chiede esplicitamente i rami che le servono", async () => {
  /*
    Sulla v2 cio che non si include torna `null`, non «vuoto». Una rilettura
    senza `configuration.merchant` direbbe che un club operativo non ha
    capacita, e la sincronizzazione gli spegnerebbe i pagamenti.
  */
  risposta = CONTO("active", [], "active");

  await stripe.stripeProvider.getMerchant("acct_v2");

  const [chiamata] = chiamate;
  assert.ok(chiamata.url.startsWith("https://api.stripe.com/v2/core/accounts/acct_v2"));
  assert.ok(chiamata.url.includes("include=configuration.merchant"));
  assert.ok(chiamata.url.includes("include=requirements"));
});

/* ------------------------------------------------------------- guardrail */

test("il provisioning non puo tornare alla v1", () => {
  /*
    Il rifiuto di Stripe arriva **a runtime**, e in sandbox l'interruttore di
    compatibilita puo mascherarlo. Se qualcuno ripristinasse la chiamata v1 —
    per un merge sbagliato, per un copia-incolla da una guida vecchia — il
    codice compilerebbe, i tipi tornerebbero e il difetto si vedrebbe solo il
    giorno del passaggio al live. Qui costa un millisecondo.
  */
  const provider = fs.readFileSync(
    path.join(PROJECT_ROOT, "src/lib/payments/gateway/providers/stripe.ts"),
    "utf8",
  );

  const vietati = [
    /callStripe\(\s*["'`]\/accounts/,
    /callStripe\(\s*["'`]\/account_links/,
  ];

  for (const pattern of vietati) {
    assert.ok(
      !pattern.test(provider),
      `il provisioning Connect deve usare la v2: trovato ${pattern}`,
    );
  }

  /* E la v2 dev'esserci davvero, altrimenti il test sopra passa a vuoto. */
  assert.match(provider, /callStripeV2\(\s*["'`]\/core\/accounts/);
  assert.match(provider, /callStripeV2\(\s*["'`]\/core\/account_links/);
});
