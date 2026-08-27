import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Il servizio degli incassi, a runtime (Workstream A, ADR-0036).
 *
 * Tre cose vanno dimostrate, non affermate:
 *
 * 1. **l'isolamento multi-tenant**. Un incasso e denaro: se il confine perde,
 *    un club vede la cassa di un altro. Ogni operazione viene provata dal club
 *    sbagliato e deve fallire con «Accesso negato», la stringa da cui il route
 *    handler ricava il 403;
 * 2. **lo stato della rata lo scrive il servizio**, ricalcolandolo dagli
 *    incassi. E il difetto che ADR-0036 esiste per chiudere: finche lo stato
 *    arriva dal client, puo contraddire gli importi;
 * 3. **niente sparisce**. Uno storno lascia in piedi l'originale, aggiunge il
 *    movimento di compensazione e riporta indietro il saldo.
 */

const CLUB_A = "aaaaaaaa-0000-4000-8000-000000000001";
const CLUB_B = "bbbbbbbb-0000-4000-8000-000000000002";
const RATA_A = "11111111-0000-4000-8000-00000000000a";
const RATA_B = "22222222-0000-4000-8000-00000000000b";

const scopeA = () => ({
  userId: "user-a",
  activeOrganizationId: CLUB_A,
  allowedOrganizationIds: [CLUB_A],
});

const scopeB = () => ({
  userId: "user-b",
  activeOrganizationId: CLUB_B,
  allowedOrganizationIds: [CLUB_B],
});

let service;
let setPrismaClientForTests;
let fake;

const rata = (id, organizationId, overrides = {}) => ({
  id,
  organization_id: organizationId,
  athlete_id: `atleta-${id}`,
  description: "Quota annuale - Rata 1",
  amount: 130,
  due_date: new Date("2026-09-30T00:00:00Z"),
  paid_at: null,
  status: "pending",
  method: null,
  reference: null,
  notes: null,
  data: { installmentId: "plan-rata-1", installmentLabel: "Rata 1" },
  created_at: new Date("2026-08-01T10:00:00Z"),
  updated_at: new Date("2026-08-01T10:00:00Z"),
  ...overrides,
});

const seed = () => ({
  athletePayment: [rata(RATA_A, CLUB_A), rata(RATA_B, CLUB_B)],
  paymentTransaction: [],
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

const rejects = (promise, pattern) =>
  assert.rejects(promise, (error) => {
    assert.match(String(error.message), pattern);
    return true;
  });

const chargeRow = (id) =>
  fake.rows("athletePayment").find((row) => row.id === id);

const registra = (overrides = {}, scope = scopeA()) =>
  service.createPaymentTransaction(
    {
      paymentId: RATA_A,
      amount: 50,
      paymentMethod: "Contanti",
      paidAt: "2026-08-05T10:00:00.000Z",
      ...overrides,
    },
    scope,
  );

// --- isolamento multi-tenant -------------------------------------------------

test("non si registra un incasso su una rata di un altro club", async () => {
  await rejects(
    registra({ paymentId: RATA_B }, scopeA()),
    /Accesso negato/,
  );
  assert.equal(fake.rows("paymentTransaction").length, 0);
});

test("non si leggono gli incassi di un altro club", async () => {
  await rejects(
    service.listPaymentTransactions({ organizationId: CLUB_B }, scopeA()),
    /Accesso negato/,
  );
});

test("non si storna un incasso di un altro club", async () => {
  const { transaction } = await registra({}, scopeA());

  await rejects(
    service.reversePaymentTransaction({ transactionId: transaction.id }, scopeB()),
    /Accesso negato/,
  );
});

test("senza club attivo e senza club indicato l'incasso libero non passa", async () => {
  await rejects(
    service.createPaymentTransaction(
      { amount: 50, paymentMethod: "Contanti" },
      { userId: "user-a", activeOrganizationId: null, allowedOrganizationIds: [CLUB_A] },
    ),
    /Nessun club attivo/,
  );
});

// --- lo stato della rata lo scrive il servizio -------------------------------

test("un incasso parziale porta la rata a «parzialmente pagata», non a «pagata»", async () => {
  const result = await registra({ amount: 50 });

  assert.equal(result.transaction.amount, 50);
  assert.equal(chargeRow(RATA_A).status, "partially_paid");
  assert.equal(chargeRow(RATA_A).paid_at, null);
  assert.equal(chargeRow(RATA_A).data.ledger.residualAmount, 80);
  assert.equal(chargeRow(RATA_A).data.ledger.paidAmount, 50);
});

test("un incasso pari al residuo salda la rata e ne fissa la data", async () => {
  await registra({ amount: 130, paidAt: "2026-08-05T10:00:00.000Z" });

  const row = chargeRow(RATA_A);
  assert.equal(row.status, "paid");
  assert.equal(
    new Date(row.paid_at).toISOString(),
    "2026-08-05T10:00:00.000Z",
    "la data della rata e quella dell'ultimo incasso, non quella di sistema",
  );
  assert.equal(row.method, "Contanti");
  assert.equal(row.data.ledger.residualAmount, 0);
});

test("lo stato che arriva dal client non ha effetto: comanda il registro", async () => {
  await service.createPaymentTransaction(
    {
      paymentId: RATA_A,
      amount: 50,
      paymentMethod: "Contanti",
      // Un client che provasse a dichiarare la rata saldata non ha un campo
      // per farlo: il servizio non lo legge da nessuna parte.
      status: "paid",
    },
    scopeA(),
  );

  assert.equal(chargeRow(RATA_A).status, "partially_paid");
});

test("una rata annullata non torna in vita per un ricalcolo", async () => {
  fake.rows("athletePayment").push(
    rata("rata-annullata", CLUB_A, {
      status: "cancelled",
      data: { excludedFromTotals: true },
    }),
  );

  await service.createPaymentTransaction(
    { paymentId: "rata-annullata", amount: 50, paymentMethod: "Contanti" },
    scopeA(),
  );

  assert.equal(chargeRow("rata-annullata").status, "cancelled");
});

// --- validazione -------------------------------------------------------------

test("un incasso che supera il residuo viene rifiutato con l'importo residuo", async () => {
  await registra({ amount: 100 });

  await rejects(registra({ amount: 100 }), /supera il residuo/i);
  assert.equal(fake.rows("paymentTransaction").length, 1);
});

test("un incasso senza metodo di pagamento non entra nel registro", async () => {
  await rejects(registra({ paymentMethod: "" }), /metodo di pagamento/i);
  assert.equal(fake.rows("paymentTransaction").length, 0);
});

test("un incasso di importo nullo o negativo non entra nel registro", async () => {
  await rejects(registra({ amount: 0 }), /maggiore di zero/i);
  await rejects(registra({ amount: -10 }), /maggiore di zero/i);
});

test("una rata inesistente non si incassa", async () => {
  await rejects(registra({ paymentId: "rata-che-non-esiste" }), /Rata non trovata/);
});

test("un incasso online non lo dichiara chi chiama: lo conferma il provider", async () => {
  await rejects(registra({ source: "STRIPE" }), /lo conferma il provider/i);
  await rejects(registra({ source: "CEDIPAY" }), /lo conferma il provider/i);
});

test("con la conferma del provider l'incasso online si registra", async () => {
  /*
    `confirmedByProvider` non e un parametro dell'API: lo imposta soltanto
    `handleGatewayWebhookEvent`, dopo aver verificato la firma dell'evento
    (ADR-0045). Qui si prova che il confine sia quello e non un altro.
  */
  const result = await registra({
    source: "CEDIPAY",
    confirmedByProvider: true,
    externalReference: "cs_test_1",
  });

  assert.equal(result.transaction.source, "CEDIPAY");
  assert.equal(result.transaction.externalReference, "cs_test_1");
});

test("con allowOverpayment un acconto superiore al residuo e ammesso", async () => {
  const result = await registra({ amount: 200, allowOverpayment: true });

  assert.equal(result.transaction.amount, 200);
  assert.equal(chargeRow(RATA_A).status, "paid");
  assert.equal(chargeRow(RATA_A).data.ledger.residualAmount, 0);
});

// --- pagamenti multipli ------------------------------------------------------

test("tre incassi con tre metodi diversi saldano la rata", async () => {
  await registra({ amount: 50, paymentMethod: "Contanti", paidAt: "2026-08-01T10:00:00.000Z" });
  await registra({ amount: 30, paymentMethod: "POS", paidAt: "2026-08-05T10:00:00.000Z" });
  const ultimo = await registra({
    amount: 50,
    paymentMethod: "Bonifico",
    paidAt: "2026-08-10T10:00:00.000Z",
  });

  assert.equal(ultimo.transactions.length, 3);
  assert.equal(chargeRow(RATA_A).status, "paid");
  assert.equal(chargeRow(RATA_A).method, "Bonifico");
  assert.equal(
    await service.getSettledAmountForCharge(RATA_A, scopeA()),
    130,
  );
});

// --- storni ------------------------------------------------------------------

test("lo storno marca l'originale, aggiunge il movimento opposto e riporta indietro il saldo", async () => {
  const { transaction } = await registra({ amount: 130 });
  assert.equal(chargeRow(RATA_A).status, "paid");

  const result = await service.reversePaymentTransaction(
    { transactionId: transaction.id, reason: "Assegno scoperto" },
    scopeA(),
  );

  const originale = fake
    .rows("paymentTransaction")
    .find((row) => row.id === transaction.id);

  assert.ok(originale.reversed_at, "l'originale resta, marcato");
  assert.equal(originale.reversal_reason, "Assegno scoperto");
  assert.equal(originale.reversed_by, "user-a");
  assert.equal(result.transaction.amount, -130);
  assert.equal(result.transaction.reversesTransactionId, transaction.id);
  assert.equal(
    fake.rows("paymentTransaction").length,
    2,
    "nessuna riga viene cancellata: restano incasso e storno",
  );
  assert.equal(chargeRow(RATA_A).status, "pending");
  assert.equal(chargeRow(RATA_A).paid_at, null);
  assert.equal(chargeRow(RATA_A).data.ledger.residualAmount, 130);
});

test("un incasso gia stornato non si storna due volte", async () => {
  const { transaction } = await registra({});
  await service.reversePaymentTransaction({ transactionId: transaction.id }, scopeA());

  await rejects(
    service.reversePaymentTransaction({ transactionId: transaction.id }, scopeA()),
    /gia stato stornato/i,
  );
});

test("uno storno non si storna a sua volta", async () => {
  const { transaction } = await registra({});
  const storno = await service.reversePaymentTransaction(
    { transactionId: transaction.id },
    scopeA(),
  );

  await rejects(
    service.reversePaymentTransaction({ transactionId: storno.transaction.id }, scopeA()),
    /non si storna/i,
  );
});

test("correggere un incasso significa stornare e registrare di nuovo", async () => {
  const { transaction } = await registra({ amount: 100 });
  await service.reversePaymentTransaction(
    { transactionId: transaction.id, reason: "Importo sbagliato" },
    scopeA(),
  );
  await registra({ amount: 50 });

  assert.equal(chargeRow(RATA_A).status, "partially_paid");
  assert.equal(chargeRow(RATA_A).data.ledger.paidAmount, 50);
  assert.equal(
    fake.rows("paymentTransaction").length,
    3,
    "l'errore e la sua correzione restano leggibili nello storico",
  );
});

test("un incasso che non esiste non si storna", async () => {
  await rejects(
    service.reversePaymentTransaction({ transactionId: "mov-inesistente" }, scopeA()),
    /non trovato/i,
  );
});

// --- lettura -----------------------------------------------------------------

test("l'elenco per rata restituisce solo gli incassi di quella rata", async () => {
  await registra({ amount: 50 });
  fake.rows("paymentTransaction").push({
    id: "mov-altra-rata",
    organization_id: CLUB_A,
    athlete_id: "atleta-x",
    payment_id: "altra-rata",
    amount: 20,
    paid_at: new Date("2026-08-02T10:00:00Z"),
    payment_method: "Contanti",
    source: "MANUAL",
  });

  const movimenti = await service.listPaymentTransactions(
    { paymentId: RATA_A },
    scopeA(),
  );

  assert.equal(movimenti.length, 1);
  assert.equal(movimenti[0].installmentId, RATA_A);
});

test("l'elenco e cronologico crescente: e un estratto conto", async () => {
  await registra({ amount: 50, paidAt: "2026-08-10T10:00:00.000Z" });
  await registra({ amount: 30, paidAt: "2026-08-01T10:00:00.000Z" });

  const movimenti = await service.listPaymentTransactions(
    { paymentId: RATA_A },
    scopeA(),
  );

  assert.deepEqual(
    movimenti.map((movimento) => movimento.amount),
    [30, 50],
  );
});

test("ogni lettura filtra per organization_id, sempre", async () => {
  await service.listPaymentTransactions({ athleteId: "atleta-1" }, scopeA());

  const chiamata = fake.lastCall("paymentTransaction", "findMany");
  assert.equal(chiamata.args.where.organization_id, CLUB_A);
});

/* --------------------------------- il totale incassato, senza una sessione */

test("il totale incassato si legge anche senza uno scope, dando il club", async () => {
  /*
    **Il difetto trovato nel collaudo sandbox del Blocco E.** Questa funzione
    risolveva il club solo dallo scope. Chi non ha uno scope — l'apertura di un
    checkout, che risolve il club dalle impostazioni della societa e non da una
    sessione utente — riceveva «nessun club indicato», e il pagamento online
    falliva con un errore generico.

    E' lo stesso inciampo gia documentato in `recordRefundTransaction`, dove si
    era manifestato **solo sul secondo evento** di un rimborso.
  */
  await service.createPaymentTransaction(
    {
      organizationId: CLUB_A,
      paymentId: RATA_A,
      amount: 50,
      paidAt: "2026-08-27T10:00:00.000Z",
      paymentMethod: "online",
    },
    scopeA(),
  );

  const totale = await service.getSettledAmountForCharge({
    paymentId: RATA_A,
    organizationId: CLUB_A,
  });

  assert.equal(totale, 50);
});

test("senza club e senza scope il totale non si legge", async () => {
  /*
    La correzione non deve diventare una porta aperta: un identificativo di
    rata arriva dall'esterno e non e un lasciapassare per il registro di
    un'altra societa.
  */
  await assert.rejects(
    () => service.getSettledAmountForCharge({ paymentId: RATA_A }),
    /Nessun club indicato/,
  );
});
