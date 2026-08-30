import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Il link di pagamento, dal lato che tocca l'archivio (G-06, W2-B).
 *
 * E la superficie piu esposta del prodotto: una pagina pubblica su Internet,
 * senza autenticazione, davanti a un pagamento. Le cose che questo file prova
 * sono, nell'ordine, quelle che se cedessero costerebbero denaro vero:
 *
 * 1. **in archivio finisce solo l'impronta**, mai il token;
 * 2. **il residuo si ricalcola adesso**: chi ha gia versato allo sportello non
 *    paga due volte;
 * 3. **sconosciuto, scaduto, revocato e manomesso rispondono la stessa cosa**,
 *    byte per byte;
 * 4. **nessun identificativo interno esce dalla vista pubblica**;
 * 5. **il perimetro e il club attivo**: nessuno emette o revoca link sulle
 *    rate di un'altra societa;
 * 6. **il denaro passa dal checkout di sempre**, con `actorUserId: null` e
 *    l'importo del residuo;
 * 7. **la forza bruta si ferma**, per token e per indirizzo.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const ALTRO_CLUB = "aaaaaaaa-0000-4000-8000-000000000002";
const ATLETA = "bbbbbbbb-0000-4000-8000-00000000000a";
const ATLETA_ALTRO_CLUB = "bbbbbbbb-0000-4000-8000-00000000000b";
const UTENTE = "cccccccc-0000-4000-8000-00000000000a";
const RATA = "dddddddd-0000-4000-8000-00000000000a";
const RATA_ALTRO_CLUB = "dddddddd-0000-4000-8000-00000000000b";

const ADESSO = new Date("2026-09-01T10:00:00Z");
const FRA_UN_MESE = new Date("2026-10-05T10:00:00Z");

let modulo;
let limiti;
let setPrismaClientForTests;
let fake;
let checkoutRicevuti;

const scope = (organizationId = CLUB) => ({
  userId: UTENTE,
  activeOrganizationId: organizationId,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB, ALTRO_CLUB],
});

/** Il club puo incassare online. La porta e iniettata: i piani non c'entrano. */
const entitlementConcesso = async () => ({
  allowed: true,
  message: "Incassi online attivi",
});

const entitlementNegato = async () => ({
  allowed: false,
  message: "Disponibile con il piano Plus",
});

/** Il checkout finto: registra cosa gli viene passato e non parla con nessuno. */
const checkoutFinto = async (input) => {
  checkoutRicevuti.push(input);
  return {
    checkout: {
      url: "https://psp.example/sessione/xyz",
      externalId: "cs_test_xyz",
      money: { amountCents: input.amountCents, currency: "EUR" },
    },
    context: { organizationId: input.organizationId, provider: "stripe" },
    settlement: { platformFeeCents: 0, netAmountCents: input.amountCents },
  };
};

const seed = () => ({
  club: [
    {
      id: CLUB,
      name: "ASD Alfa",
      logo_url: "https://cdn.example/alfa.png",
      contact_email: "segreteria@alfa.example",
      settings: {},
    },
    { id: ALTRO_CLUB, name: "ASD Beta", settings: {} },
  ],
  athlete: [
    {
      id: ATLETA,
      organization_id: CLUB,
      first_name: "Luca",
      last_name: "Bianchi",
      data: {},
    },
    {
      id: ATLETA_ALTRO_CLUB,
      organization_id: ALTRO_CLUB,
      first_name: "Nina",
      last_name: "Gialli",
      data: {},
    },
  ],
  athletePayment: [
    /* 130 dovuti, 80 gia incassati: il residuo e 50. */
    {
      id: RATA,
      organization_id: CLUB,
      athlete_id: ATLETA,
      description: "Quota annuale - Rata 1",
      amount: 130,
      due_date: new Date("2026-09-30T00:00:00Z"),
      paid_at: null,
      status: "pending",
      method: null,
      data: {},
    },
    {
      id: RATA_ALTRO_CLUB,
      organization_id: ALTRO_CLUB,
      athlete_id: ATLETA_ALTRO_CLUB,
      description: "Quota annuale - Rata 1",
      amount: 200,
      due_date: new Date("2026-09-30T00:00:00Z"),
      status: "pending",
      data: {},
    },
  ],
  paymentTransaction: [
    {
      id: "incasso-1",
      organization_id: CLUB,
      athlete_id: ATLETA,
      payment_id: RATA,
      amount: 80,
      paid_at: new Date("2026-08-10T00:00:00Z"),
      payment_method: "cash",
      source: "MANUAL",
      data: {},
    },
  ],
  paymentLink: [],
  auditLog: [],
  authRateLimitBucket: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  modulo = await import("../../src/lib/server/payment-links.ts");
  limiti = await import("../../src/lib/server/auth-rate-limit.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
  checkoutRicevuti = [];
});

const emetti = (overrides = {}) =>
  modulo.issuePaymentLink({
    organizationId: null,
    paymentId: RATA,
    scope: scope(),
    actorUserId: UTENTE,
    now: ADESSO,
    entitlement: entitlementConcesso,
    ...overrides,
  });

const vista = (token, overrides = {}) =>
  modulo.readPaymentLinkPublicView(token, {
    now: ADESSO,
    entitlement: entitlementConcesso,
    ...overrides,
  });

const apri = (token, overrides = {}) =>
  modulo.openPaymentLinkCheckout({
    token,
    successUrl: "https://app.easygame.test/pay/x?esito=inviato",
    cancelUrl: "https://app.easygame.test/pay/x?esito=annullato",
    now: ADESSO,
    entitlement: entitlementConcesso,
    checkout: checkoutFinto,
    ...overrides,
  });

const azioni = () => fake.rows("auditLog").map((riga) => riga.action);

// --- l'emissione ----------------------------------------------------------

test("in archivio finisce solo l'impronta: il token in chiaro non c'e", async () => {
  const esito = await emetti();

  assert.equal(esito.outcome, "issued");

  const righe = fake.rows("paymentLink");
  assert.equal(righe.length, 1);
  assert.equal(righe[0].token_hash, modulo.hashPaymentLinkToken(esito.token));
  assert.notEqual(righe[0].token_hash, esito.token);

  const archivio = JSON.stringify(righe);
  assert.equal(
    archivio.includes(esito.token),
    false,
    "un token leggibile in archivio e un link funzionante per chiunque legga il database",
  );
});

test("l'emissione fissa la scadenza a trenta giorni e traccia l'atto", async () => {
  const esito = await emetti();

  assert.equal(
    esito.expiresAt,
    new Date(ADESSO.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  );
  assert.equal(esito.paymentId, RATA);
  assert.equal(esito.athleteId, ATLETA);
  assert.equal(esito.path, `/pay/${esito.token}`);

  assert.deepEqual(azioni(), ["payment.link.issued"]);
  const traccia = fake.rows("auditLog")[0];
  assert.equal(traccia.actor_user_id, UTENTE);
  assert.equal(
    JSON.stringify(traccia.metadata).includes(esito.token),
    false,
    "il token non entra nemmeno nell'audit",
  );
});

test("una durata oltre il tetto viene riportata a novanta giorni", async () => {
  const esito = await emetti({ ttlDays: 3650 });

  assert.equal(
    esito.expiresAt,
    new Date(ADESSO.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
  );
});

test("senza l'entitlement il link non si emette, e lo dice invece di sollevare", async () => {
  const esito = await emetti({ entitlement: entitlementNegato });

  assert.equal(esito.outcome, "entitlement_missing");
  assert.equal(esito.message, "Disponibile con il piano Plus");
  assert.equal(
    fake.rows("paymentLink").length,
    0,
    "nessuna riga: un messaggio non deve promettere un pagamento che il club non puo incassare",
  );
  assert.deepEqual(azioni(), []);
});

test("la rata di un altro club non si trasforma in un link", async () => {
  await assert.rejects(
    emetti({ paymentId: RATA_ALTRO_CLUB }),
    /Accesso negato/,
    "emettere sulla rata di un'altra societa vorrebbe dire incassare per lei",
  );
  assert.equal(fake.rows("paymentLink").length, 0);
});

test("una rata che non esiste non produce un link", async () => {
  await assert.rejects(emetti({ paymentId: "non-esiste" }), /Rata non trovata/);
});

test("si emette sul club attivo, non su un altro fra quelli a cui si ha accesso", async () => {
  await assert.rejects(
    emetti({ organizationId: ALTRO_CLUB }),
    /Accesso negato/,
    "il ruolo con cui si decide e il club su cui si opera devono parlare dello stesso club",
  );
});

test("un sollecito nuovo emette un token nuovo e lascia vivo il precedente", async () => {
  const primo = await emetti();
  const secondo = await emetti();

  assert.notEqual(primo.token, secondo.token);
  assert.equal(fake.rows("paymentLink").length, 2);

  /*
    Revocare il primo renderebbe morto il link del sollecito mandato la
    settimana prima, che e ancora nella casella di posta della famiglia.
  */
  assert.equal((await vista(primo.token)).status, "payable");
  assert.equal((await vista(secondo.token)).status, "payable");
});

// --- la vista pubblica ----------------------------------------------------

test("il residuo e quello della cassa, ricalcolato adesso", async () => {
  const { token } = await emetti();
  const pubblica = await vista(token);

  assert.equal(pubblica.status, "payable");
  assert.equal(pubblica.residualAmount, 50);
  assert.equal(pubblica.residualCents, 5000);
  assert.equal(pubblica.dueAmount, 130);
  assert.equal(pubblica.paidAmount, 80);
  assert.notEqual(
    pubblica.residualAmount,
    130,
    "congelare l'importo nel link farebbe pagare due volte chi ha gia versato un acconto",
  );
});

test("un acconto registrato dopo l'emissione abbassa subito il residuo", async () => {
  const { token } = await emetti();

  fake.rows("paymentTransaction").push({
    id: "incasso-2",
    organization_id: CLUB,
    athlete_id: ATLETA,
    payment_id: RATA,
    amount: 30,
    paid_at: new Date("2026-08-20T00:00:00Z"),
    payment_method: "cash",
    source: "MANUAL",
    data: {},
  });

  assert.equal((await vista(token)).residualAmount, 20);
});

test("una rata gia saldata risponde «gia saldata», non un errore", async () => {
  const { token } = await emetti();

  fake.rows("paymentTransaction").push({
    id: "incasso-saldo",
    organization_id: CLUB,
    athlete_id: ATLETA,
    payment_id: RATA,
    amount: 50,
    paid_at: new Date("2026-08-25T00:00:00Z"),
    payment_method: "cash",
    source: "MANUAL",
    data: {},
  });

  const pubblica = await vista(token);
  assert.equal(pubblica.status, "already_settled");
  assert.equal(pubblica.residualCents, 0);
  assert.equal(
    pubblica.clubName,
    "ASD Alfa",
    "e una buona notizia da dare, non una schermata da nascondere",
  );
});

test("nessun identificativo interno esce dalla vista pubblica", async () => {
  const { token } = await emetti();
  const pubblica = await vista(token);

  assert.deepEqual(Object.keys(pubblica).sort(), [
    "athleteName",
    "clubContactEmail",
    "clubLogoUrl",
    "clubName",
    "description",
    "dueAmount",
    "dueDate",
    "linkExpiresAt",
    "paidAmount",
    "residualAmount",
    "residualCents",
    "status",
  ]);

  const serializzata = JSON.stringify(pubblica);
  for (const identificativo of [CLUB, ATLETA, RATA, fake.rows("paymentLink")[0].id]) {
    assert.equal(
      serializzata.includes(identificativo),
      false,
      `l'identificativo ${identificativo} non deve uscire su Internet`,
    );
  }
});

test("l'apertura incrementa il contatore e lascia la riga di audit senza attore", async () => {
  const { token } = await emetti();
  await vista(token);
  await vista(token);

  const riga = fake.rows("paymentLink")[0];
  assert.equal(riga.use_count, 2);
  assert.equal(riga.last_used_at.toISOString(), ADESSO.toISOString());

  const aperture = fake
    .rows("auditLog")
    .filter((r) => r.action === "payment.link.opened");
  assert.equal(aperture.length, 2);
  assert.equal(
    aperture[0].actor_user_id,
    null,
    "chi apre un link non e un utente: e la riga che serve quando una famiglia dice di non aver mai visto il link",
  );
});

test("senza l'entitlement la vista pubblica risponde come un link scaduto", async () => {
  const { token } = await emetti();

  assert.deepEqual(await vista(token, { entitlement: entitlementNegato }), {
    status: "not_available",
    message: modulo.PAYMENT_LINK_NOT_AVAILABLE_MESSAGE,
  });
});

test("un link che punta a una rata sparita non apre niente", async () => {
  const { token } = await emetti();
  fake.rows("athletePayment").splice(0, fake.rows("athletePayment").length);

  assert.equal((await vista(token)).status, "not_available");
});

// --- l'indistinguibilita --------------------------------------------------

test("sconosciuto, manomesso, scaduto e revocato rispondono la stessa identica cosa", async () => {
  const { token, linkId } = await emetti();

  const manomesso = (token[0] === "a" ? "b" : "a") + token.slice(1);
  const sconosciuto = modulo.generatePaymentLinkToken();

  const { token: tokenScaduto } = await emetti();
  const rigaScaduta = fake
    .rows("paymentLink")
    .find((r) => r.token_hash === modulo.hashPaymentLinkToken(tokenScaduto));
  rigaScaduta.expires_at = new Date("2026-08-01T10:00:00Z");

  await modulo.revokePaymentLink({
    organizationId: null,
    linkId,
    scope: scope(),
    actorUserId: UTENTE,
    now: ADESSO,
  });

  const risposte = [
    await vista(sconosciuto),
    await vista(manomesso),
    await vista(tokenScaduto),
    await vista(token),
    await vista(""),
  ];

  for (const risposta of risposte) {
    assert.deepEqual(
      risposta,
      risposte[0],
      "distinguere i casi dice a chi prova token a caso quando ha indovinato",
    );
    assert.equal(risposta.status, "not_available");
  }
});

test("un token manomesso non tocca nemmeno il contatore del link vero", async () => {
  const { token } = await emetti();
  const manomesso = (token[0] === "a" ? "b" : "a") + token.slice(1);

  await vista(manomesso);

  /* La riga non e stata toccata: il doppio non applica i valori predefiniti
     dello schema, quindi «mai aperto» qui si legge come contatore assente. */
  const riga = fake.rows("paymentLink")[0];
  assert.equal(Number(riga.use_count || 0), 0);
  assert.equal(riga.last_used_at, undefined);
  assert.deepEqual(azioni(), ["payment.link.issued"]);
});

// --- il riscatto ----------------------------------------------------------

test("il checkout e quello di sempre: residuo di adesso e nessun attore", async () => {
  const { token } = await emetti();
  const esito = await apri(token);

  assert.equal(esito.status, "ready");
  assert.equal(esito.checkoutUrl, "https://psp.example/sessione/xyz");
  assert.equal(esito.amountCents, 5000);

  assert.equal(checkoutRicevuti.length, 1);
  assert.equal(checkoutRicevuti[0].organizationId, CLUB);
  assert.equal(checkoutRicevuti[0].paymentId, RATA);
  assert.equal(checkoutRicevuti[0].athleteId, ATLETA);
  assert.equal(checkoutRicevuti[0].amountCents, 5000);
  assert.equal(
    checkoutRicevuti[0].actorUserId,
    null,
    "il gesto e di chi ha il link, non di un utente",
  );

  /*
    L'azione di audit e la stessa dell'apertura — il link e stato usato — ma i
    due gesti si distinguono: senza, «l'ha aperto tre volte» non direbbe se ha
    anche provato a pagare.
  */
  const apertura = fake
    .rows("auditLog")
    .find((r) => r.action === "payment.link.opened");
  assert.equal(apertura.metadata.gesture, "checkout");
  assert.equal(apertura.actor_user_id, null);
});

test("una rata saldata risponde «gia saldata» e non apre nessun pagamento", async () => {
  const { token } = await emetti();

  fake.rows("paymentTransaction").push({
    id: "incasso-saldo",
    organization_id: CLUB,
    athlete_id: ATLETA,
    payment_id: RATA,
    amount: 50,
    paid_at: new Date("2026-08-25T00:00:00Z"),
    payment_method: "cash",
    source: "MANUAL",
    data: {},
  });

  const esito = await apri(token);
  assert.equal(esito.status, "already_settled");
  assert.equal(checkoutRicevuti.length, 0);
});

test("un token non valido non arriva mai al fornitore di pagamento", async () => {
  await emetti();
  const esito = await apri(modulo.generatePaymentLinkToken());

  assert.equal(esito.status, "not_available");
  assert.equal(checkoutRicevuti.length, 0);
});

test("senza URL di ritorno il riscatto si ferma: non li puo mettere il client", async () => {
  const { token } = await emetti();

  await assert.rejects(
    apri(token, { successUrl: "", cancelUrl: "" }),
    /URL di ritorno mancanti/,
    "accettarli dal client renderebbe il link un redirector aperto",
  );
});

// --- la revoca ------------------------------------------------------------

test("la revoca spegne il link, lo traccia e non cancella la riga", async () => {
  const { token, linkId } = await emetti();

  const esito = await modulo.revokePaymentLink({
    organizationId: null,
    linkId,
    scope: scope(),
    actorUserId: UTENTE,
    now: FRA_UN_MESE,
  });

  assert.equal(esito.alreadyRevoked, false);
  assert.equal(
    fake.rows("paymentLink").length,
    1,
    "la riga resta: e la prova di aver emesso il link e il registro delle sue aperture",
  );
  assert.equal((await vista(token)).status, "not_available");
  assert.ok(azioni().includes("payment.link.revoked"));
});

test("revocare due volte non e un errore", async () => {
  const { linkId } = await emetti();
  const revoca = () =>
    modulo.revokePaymentLink({
      organizationId: null,
      linkId,
      scope: scope(),
      actorUserId: UTENTE,
      now: FRA_UN_MESE,
    });

  await revoca();
  const seconda = await revoca();

  assert.equal(seconda.alreadyRevoked, true);
  assert.equal(
    azioni().filter((a) => a === "payment.link.revoked").length,
    1,
    "un fatto gia registrato non si registra due volte",
  );
});

test("il link di un altro club non si revoca, e non si scopre che esiste", async () => {
  const altrui = await modulo.issuePaymentLink({
    organizationId: null,
    paymentId: RATA_ALTRO_CLUB,
    scope: scope(ALTRO_CLUB),
    actorUserId: UTENTE,
    now: ADESSO,
    entitlement: entitlementConcesso,
  });

  const inesistente = modulo.revokePaymentLink({
    organizationId: null,
    linkId: "eeeeeeee-0000-4000-8000-00000000000f",
    scope: scope(),
    actorUserId: UTENTE,
    now: ADESSO,
  });

  await assert.rejects(inesistente, /Accesso negato/);
  await assert.rejects(
    modulo.revokePaymentLink({
      organizationId: null,
      linkId: altrui.linkId,
      scope: scope(),
      actorUserId: UTENTE,
      now: ADESSO,
    }),
    /Accesso negato/,
    "stessa risposta per «non esiste» e «non e tuo»: altrimenti si enumerano i link altrui",
  );
});

// --- la forza bruta -------------------------------------------------------

test("i tentativi sullo stesso token si fermano al trentunesimo", async () => {
  const identificativo = modulo.hashPaymentLinkToken(
    modulo.generatePaymentLinkToken(),
  );

  let ultimo = null;
  for (let tentativo = 0; tentativo < 30; tentativo += 1) {
    ultimo = await limiti.consumeAuthRateLimit(
      limiti.AUTH_RATE_LIMITS.paymentLinkViewToken,
      identificativo,
    );
    assert.equal(ultimo.allowed, true, `tentativo ${tentativo + 1}`);
  }

  const oltre = await limiti.consumeAuthRateLimit(
    limiti.AUTH_RATE_LIMITS.paymentLinkViewToken,
    identificativo,
  );
  assert.equal(oltre.allowed, false);
  assert.ok(oltre.retryAfterSeconds > 0);
});

test("i due contatori sono indipendenti: per token e per indirizzo", async () => {
  /*
    Con il solo contatore per indirizzo, chi cambia rete continuerebbe sullo
    stesso token; con il solo contatore per token, ogni tentativo su un token
    nuovo ripartirebbe da zero — che e la forma esatta della forza bruta.
  */
  for (let tentativo = 0; tentativo < 30; tentativo += 1) {
    await limiti.consumeAuthRateLimit(
      limiti.AUTH_RATE_LIMITS.paymentLinkViewToken,
      "token-uno",
    );
  }

  const altroToken = await limiti.consumeAuthRateLimit(
    limiti.AUTH_RATE_LIMITS.paymentLinkViewToken,
    "token-due",
  );
  assert.equal(altroToken.allowed, true);

  for (let tentativo = 0; tentativo < 60; tentativo += 1) {
    const esito = await limiti.consumeAuthRateLimit(
      limiti.AUTH_RATE_LIMITS.paymentLinkViewIp,
      "203.0.113.7",
    );
    assert.equal(esito.allowed, true);
  }

  const oltreIp = await limiti.consumeAuthRateLimit(
    limiti.AUTH_RATE_LIMITS.paymentLinkViewIp,
    "203.0.113.7",
  );
  assert.equal(
    oltreIp.allowed,
    false,
    "chi prova tanti token diversi dallo stesso indirizzo si ferma comunque",
  );
});

test("aprire un checkout costa piu che guardare: dieci all'ora sullo stesso link", async () => {
  for (let tentativo = 0; tentativo < 10; tentativo += 1) {
    const esito = await limiti.consumeAuthRateLimit(
      limiti.AUTH_RATE_LIMITS.paymentLinkCheckoutToken,
      "token-checkout",
    );
    assert.equal(esito.allowed, true);
  }

  const oltre = await limiti.consumeAuthRateLimit(
    limiti.AUTH_RATE_LIMITS.paymentLinkCheckoutToken,
    "token-checkout",
  );
  assert.equal(oltre.allowed, false);
});
