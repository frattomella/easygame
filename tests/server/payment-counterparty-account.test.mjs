import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **W4-C — l'incasso impara due cose: su quale conto, e da chi.**
 *
 * Nessuna delle due riscrive il dominio degli incassi: il registro resta il
 * proprietario di quanto e stato incassato, e queste sono due colonne che
 * rispondono a due domande che prima non avevano risposta.
 *
 * 1. **Su quale conto.** Un incasso registrato dalla scheda atleta o dal
 *    webhook non toccava nessun saldo. «Quanto c'e in cassa» restava una cifra
 *    mutata a mano dal browser, che nessuna somma poteva confermare.
 * 2. **Da chi, quando non e un atleta.** Un socio che versa la quota
 *    associativa e uno sponsor che paga una tranche sono incassi come gli
 *    altri, e passano da qui — che finora sapeva parlare solo di atleti.
 *    `athlete_id` resta dov'e: nessuna migrazione distruttiva.
 *
 * La cosa che questi test difendono davvero e la **terza**: storno e rimborso
 * ereditano entrambe. Uno storno che perde il conto lascia quel saldo piu alto
 * del vero — cioe l'errore che lo storno esisteva per correggere. Uno storno
 * che perde la controparte sbaglia il credito proprio quando serve leggerlo.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const RATA = "11111111-0000-4000-8000-00000000000a";
const ATLETA = "99999999-0000-4000-8000-000000000009";
const CONTO_CASSA = "cccccccc-0000-4000-8000-00000000c001";
const CONTO_BANCA = "cccccccc-0000-4000-8000-00000000c002";
const SPONSOR = "sponsor-ferramenta";

const scope = () => ({
  userId: "user-a",
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
});

let service;
let setPrismaClientForTests;
let fake;

const seed = () => ({
  club: [{ id: CLUB, slug: "club-a", name: "Club A" }],
  athlete: [{ id: ATLETA, organization_id: CLUB, first_name: "Anna", last_name: "Rossi" }],
  financialAccount: [
    { id: CONTO_CASSA, organization_id: CLUB, name: "Cassa", kind: "CASH" },
    { id: CONTO_BANCA, organization_id: CLUB, name: "Banca", kind: "BANK" },
  ],
  athletePayment: [
    {
      id: RATA,
      organization_id: CLUB,
      athlete_id: ATLETA,
      description: "Quota annuale - Rata 1",
      amount: 600,
      due_date: new Date("2026-09-30T00:00:00Z"),
      paid_at: null,
      status: "pending",
      data: {},
    },
  ],
  paymentTransaction: [],
  auditLog: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  service = await import("../../src/lib/server/payment-transactions.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const incassi = () => fake.rows("paymentTransaction");

/* ============================================================= il conto */

test("un incasso dice su quale conto il denaro e entrato", async () => {
  await service.createPaymentTransaction(
    {
      paymentId: RATA,
      amount: 200,
      paymentMethod: "Contanti",
      financialAccountId: CONTO_CASSA,
    },
    scope(),
  );

  assert.equal(incassi()[0].financial_account_id, CONTO_CASSA);
});

test("il conto resta facoltativo: gli incassi gia registrati non ce l'hanno", async () => {
  /*
    Inventarne uno per una riga vecchia significherebbe attribuire denaro a una
    cassa che non l'ha mai visto.
  */
  await service.createPaymentTransaction(
    { paymentId: RATA, amount: 200, paymentMethod: "Contanti" },
    scope(),
  );

  assert.equal(incassi()[0].financial_account_id, null);
});

test("due incassi su due conti diversi restano su due conti diversi", async () => {
  await service.createPaymentTransaction(
    { paymentId: RATA, amount: 200, paymentMethod: "Contanti", financialAccountId: CONTO_CASSA },
    scope(),
  );
  await service.createPaymentTransaction(
    { paymentId: RATA, amount: 400, paymentMethod: "Bonifico", financialAccountId: CONTO_BANCA },
    scope(),
  );

  assert.deepEqual(
    incassi().map((r) => r.financial_account_id),
    [CONTO_CASSA, CONTO_BANCA],
  );
});

/* ======================================================== la controparte */

test("un incasso da uno sponsor dichiara la controparte, non un atleta", async () => {
  await service.createPaymentTransaction(
    {
      organizationId: CLUB,
      amount: 2000,
      paymentMethod: "Bonifico",
      financialAccountId: CONTO_BANCA,
      counterpartyKind: "SPONSOR",
      counterpartyId: SPONSOR,
      counterpartyLabel: "Ferramenta Bianchi",
    },
    scope(),
  );

  const riga = incassi()[0];
  assert.equal(riga.counterparty_kind, "SPONSOR");
  assert.equal(riga.counterparty_id, SPONSOR);
  assert.equal(riga.athlete_id, null, "una sponsorizzazione non e la quota di nessuno");
});

test("l'etichetta e congelata: il nome del momento, non quello di oggi", async () => {
  /*
    Se domani la scheda dello sponsor viene rinominata o cancellata, la riga
    deve poter ancora dire a chi si riferiva. E la stessa scelta dello snapshot
    di un documento fiscale.
  */
  await service.createPaymentTransaction(
    {
      organizationId: CLUB,
      amount: 2000,
      paymentMethod: "Bonifico",
      counterpartyKind: "SPONSOR",
      counterpartyId: SPONSOR,
      counterpartyLabel: "Ferramenta Bianchi",
    },
    scope(),
  );

  assert.equal(incassi()[0].counterparty_label, "Ferramenta Bianchi");
});

test("un tipo di controparte fuori catalogo si rifiuta, e dice quale", async () => {
  await assert.rejects(
    () =>
      service.createPaymentTransaction(
        {
          organizationId: CLUB,
          amount: 100,
          paymentMethod: "Contanti",
          counterpartyKind: "CHIUNQUE",
        },
        scope(),
      ),
    /controparte sconosciuto/i,
  );
});

test("senza controparte dichiarata le colonne restano vuote", async () => {
  await service.createPaymentTransaction(
    { paymentId: RATA, amount: 200, paymentMethod: "Contanti" },
    scope(),
  );

  const riga = incassi()[0];
  assert.equal(riga.counterparty_kind, undefined);
  assert.equal(riga.athlete_id, ATLETA, "la rata dice gia di chi e");
});

/* =========================================== storno: eredita entrambe */

test("lo storno torna sullo stesso conto dell'incasso", async () => {
  /*
    Se lo storno finisse su un altro conto — o su nessuno — il saldo di quello
    originale resterebbe piu alto del vero, cioe l'errore che lo storno
    esisteva per correggere.
  */
  const creato = await service.createPaymentTransaction(
    { paymentId: RATA, amount: 200, paymentMethod: "Contanti", financialAccountId: CONTO_CASSA },
    scope(),
  );

  await service.reversePaymentTransaction(
    { transactionId: creato.transaction.id, reason: "Registrato per errore" },
    scope(),
  );

  const storno = incassi().find((r) => r.reverses_transaction_id);
  assert.equal(storno.financial_account_id, CONTO_CASSA);
  assert.equal(storno.amount, -200);
});

test("lo storno conserva la controparte: un credito si legge per controparte", async () => {
  const creato = await service.createPaymentTransaction(
    {
      organizationId: CLUB,
      amount: 2000,
      paymentMethod: "Bonifico",
      financialAccountId: CONTO_BANCA,
      counterpartyKind: "SPONSOR",
      counterpartyId: SPONSOR,
      counterpartyLabel: "Ferramenta Bianchi",
    },
    scope(),
  );

  await service.reversePaymentTransaction(
    { transactionId: creato.transaction.id, reason: "Bonifico mai arrivato" },
    scope(),
  );

  const storno = incassi().find((r) => r.reverses_transaction_id);
  assert.equal(storno.counterparty_kind, "SPONSOR");
  assert.equal(storno.counterparty_id, SPONSOR);
  assert.equal(
    storno.counterparty_label,
    "Ferramenta Bianchi",
    "senza, il residuo dello sponsor tornerebbe sbagliato",
  );
});

test("lo storno conserva anche la causale dell'originale", async () => {
  /*
    Uno storno classificato diversamente dall'originale sposterebbe denaro da
    una voce di rendiconto a un'altra senza che nessuno lo abbia deciso.

    La causale va seminata nel catalogo: un codice fuori catalogo adesso viene
    **rifiutato**, e il doppio deve descrivere un club che quella causale ce
    l'ha davvero.
  */
  fake.rows("fiscalOperationType").push({
    id: "causale-quota-attivita",
    organization_id: CLUB,
    code: "quota_attivita",
    label: "Quota attivita",
    activity_scope: "institutional",
    is_active: true,
  });

  const creato = await service.createPaymentTransaction(
    {
      paymentId: RATA,
      amount: 200,
      paymentMethod: "Contanti",
      operationTypeCode: "quota_attivita",
    },
    scope(),
  );

  await service.reversePaymentTransaction(
    { transactionId: creato.transaction.id, reason: "Errore" },
    scope(),
  );

  const storno = incassi().find((r) => r.reverses_transaction_id);
  assert.equal(storno.operation_type_code, "quota_attivita");
});

/* ============================================ l'originale resta intatto */

test("l'originale resta, marcato, con il suo conto e la sua controparte", async () => {
  const creato = await service.createPaymentTransaction(
    { paymentId: RATA, amount: 200, paymentMethod: "Contanti", financialAccountId: CONTO_CASSA },
    scope(),
  );

  await service.reversePaymentTransaction(
    { transactionId: creato.transaction.id, reason: "Errore" },
    scope(),
  );

  const originale = incassi().find((r) => r.id === creato.transaction.id);
  assert.ok(originale, "il denaro non si cancella");
  assert.ok(originale.reversed_at, "ma si vede che e stato stornato");
  assert.equal(originale.financial_account_id, CONTO_CASSA);
});

/* ================================================== multi-tenant */

test("un incasso con la controparte di un altro club non passa dallo scope sbagliato", async () => {
  const altro = {
    userId: "user-b",
    activeOrganizationId: "bbbbbbbb-0000-4000-8000-000000000002",
    activeRole: "owner",
    allowedOrganizationIds: ["bbbbbbbb-0000-4000-8000-000000000002"],
  };

  await assert.rejects(
    () =>
      service.createPaymentTransaction(
        {
          paymentId: RATA,
          amount: 200,
          paymentMethod: "Contanti",
          financialAccountId: CONTO_CASSA,
        },
        altro,
      ),
    /Accesso negato/,
  );

  assert.equal(incassi().length, 0);
});

/* ============================ la classificazione congelata (W4-E1) */

test("l'ambito della causale si congela sull'incasso", async () => {
  /*
    La causale e configurazione **mutabile**. Se la prima nota leggesse la
    classificazione dalla voce corrente, il giorno in cui un club ne corregge
    la natura **tutti gli incassi passati cambierebbero natura
    retroattivamente** — e un rendiconto gia consegnato al commercialista
    direbbe qualcosa di diverso da quello che diceva.
  */
  await service.createPaymentTransaction(
    {
      paymentId: RATA,
      amount: 200,
      paymentMethod: "Contanti",
      operationTypeCode: "quota_attivita",
      activityScope: "institutional",
    },
    scope(),
  );

  assert.equal(incassi()[0].activity_scope_snapshot, "institutional");
});

test("senza causale dichiarata non si congela nessun ambito", async () => {
  /*
    Un ambito senza una causale che lo giustifichi sarebbe una classificazione
    che nessuno ha dichiarato. Meglio nullo, e visibile.
  */
  await service.createPaymentTransaction(
    { paymentId: RATA, amount: 200, paymentMethod: "Contanti", activityScope: "commercial" },
    scope(),
  );

  assert.equal(incassi()[0].activity_scope_snapshot, null);
});

test("un ambito fuori catalogo non entra: vale quello che dice la causale", async () => {
  /*
    Un ambito che non e nel catalogo degli ambiti non e una dichiarazione: si
    scarta, e vale cio che la **causale** dichiara. Prima cadeva su «non
    classificato», che era la risposta giusta solo finche nessuno leggeva la
    causale — adesso la si legge, e l'autorita e li.
  */
  fake.rows("fiscalOperationType").push({
    id: "causale-quota-attivita",
    organization_id: CLUB,
    code: "quota_attivita",
    label: "Quota attivita",
    activity_scope: "institutional",
    is_active: true,
  });

  await service.createPaymentTransaction(
    {
      paymentId: RATA,
      amount: 200,
      paymentMethod: "Contanti",
      operationTypeCode: "quota_attivita",
      activityScope: "qualcosa",
    },
    scope(),
  );

  assert.equal(incassi()[0].activity_scope_snapshot, "institutional");
});

test("lo storno conserva l'ambito congelato dell'originale", async () => {
  const creato = await service.createPaymentTransaction(
    {
      paymentId: RATA,
      amount: 200,
      paymentMethod: "Contanti",
      operationTypeCode: "quota_attivita",
      activityScope: "institutional",
    },
    scope(),
  );

  await service.reversePaymentTransaction(
    { transactionId: creato.transaction.id, reason: "Errore" },
    scope(),
  );

  const storno = incassi().find((r) => r.reverses_transaction_id);
  assert.equal(
    storno.activity_scope_snapshot,
    "institutional",
    "uno storno classificato diversamente sposterebbe denaro fra due voci di rendiconto",
  );
});

/* ================== l'ambito si legge dal catalogo, non si aspetta */

/*
  **Il difetto H-4, e perche i test non lo vedevano.**

  La firma prevedeva un `activityScope` fornito «da chi ha appena letto la
  causale». Nessun chiamante lo forniva, e `paymentTransactionInputSchema` non
  lo dichiarava, quindi Zod lo toglieva anche a chi ci avesse provato: ogni
  incasso reale finiva in tabella con `activity_scope_snapshot` a
  «unspecified», e il rendiconto dichiarava non classificato il cento per cento
  degli incassi delle famiglie — mentre il documento emesso per lo stesso
  incasso diceva «commerciale».

  I test non lo vedevano perche passavano `activityScope` a mano, cioe
  descrivevano un chiamante che non esiste. Questi due passano **solo** il
  codice, come fa il prodotto.
*/

test("l'ambito arriva dal catalogo quando nessuno lo dichiara", async () => {
  fake.rows("fiscalOperationType").push({
    id: "causale-commerciale",
    organization_id: CLUB,
    code: "sponsorizzazione",
    label: "Sponsorizzazione",
    activity_scope: "commercial",
    is_active: true,
  });

  await service.createPaymentTransaction(
    {
      paymentId: RATA,
      amount: 200,
      paymentMethod: "Bonifico",
      operationTypeCode: "sponsorizzazione",
    },
    scope(),
  );

  assert.equal(
    incassi()[0].activity_scope_snapshot,
    "commercial",
    "l'incasso deve portare l'ambito che il catalogo dichiara, non «unspecified»",
  );
});

test("una causale che il club non ha in catalogo si rifiuta", async () => {
  /*
    Prima l'incasso entrava con quel codice e ambito «non classificato»: la
    riga restava in tabella a citare una causale che nel suo club non esiste, e
    a chi aveva sbagliato a scriverla non lo diceva nessuno. Una
    classificazione che cita il nulla non e una classificazione mancante: e una
    sbagliata, che sembra compilata.
  */
  await assert.rejects(
    () =>
      service.createPaymentTransaction(
        {
          paymentId: RATA,
          amount: 200,
          paymentMethod: "Contanti",
          operationTypeCode: "codice_inesistente",
        },
        scope(),
      ),
    /non e nel catalogo del club/,
  );

  assert.equal(incassi().length, 0, "nessun incasso scritto");
});

test("l'ambito congelato non cambia se la causale viene corretta dopo", async () => {
  fake.rows("fiscalOperationType").push({
    id: "causale-mutabile",
    organization_id: CLUB,
    code: "quota_corsi",
    label: "Quota corsi",
    activity_scope: "institutional",
    is_active: true,
  });

  await service.createPaymentTransaction(
    {
      paymentId: RATA,
      amount: 200,
      paymentMethod: "Contanti",
      operationTypeCode: "quota_corsi",
    },
    scope(),
  );

  /* Il club corregge la natura della causale, il giorno dopo. */
  fake.rows("fiscalOperationType").find(
    (c) => c.code === "quota_corsi",
  ).activity_scope = "commercial";

  assert.equal(
    incassi()[0].activity_scope_snapshot,
    "institutional",
    "un rendiconto gia consegnato non deve cambiare natura retroattivamente",
  );
});
