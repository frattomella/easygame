import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Le sei strade per cui i libri potevano mentire.**
 *
 * Trovate da un audit indipendente che non ha guardato nessun diff: ha
 * attaccato il dominio dall'esterno, con la sola domanda «si puo far dire ai
 * conti una cosa che non e successa». E la revisione che le altre non
 * potevano fare, perche le altre partivano da cio che era stato appena
 * scritto.
 *
 * Ognuna di queste prove esiste perche fallisca.
 */

const CLUB = "aaaaaaaa-7777-4000-8000-00000000000a";
const ALTRUI = "bbbbbbbb-7777-4000-8000-00000000000b";
const CONTO = "cccccccc-7777-4000-8000-00000000000c";
const CONTO_ALTRUI = "dddddddd-7777-4000-8000-00000000000d";
const RATA = "11111111-7777-4000-8000-00000000000e";
const ATLETA = "22222222-7777-4000-8000-00000000000f";

const PIENI = { manage: true, reverse: true, reconcile: true };

const scope = () => ({
  userId: "utente-7",
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
});

let incassi;
let registro;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  incassi = await import("../../src/lib/server/payment-transactions.ts");
  registro = await import("../../src/lib/server/accounting.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const seed = () => ({
  club: [
    { id: CLUB, slug: "club", name: "Il club" },
    { id: ALTRUI, slug: "altrui", name: "Club altrui" },
  ],
  financialAccount: [
    { id: CONTO, organization_id: CLUB, name: "Cassa", kind: "CASH" },
    { id: CONTO_ALTRUI, organization_id: ALTRUI, name: "Banca altrui", kind: "BANK" },
  ],
  fiscalOperationType: [
    {
      id: "causale-1",
      organization_id: CLUB,
      code: "quota_attivita",
      label: "Quota attivita",
      activity_scope: "institutional",
      is_active: true,
    },
  ],
  athlete: [{ id: ATLETA, organization_id: CLUB, first_name: "Anna", last_name: "Rossi" }],
  athletePayment: [
    {
      id: RATA,
      organization_id: CLUB,
      athlete_id: ATLETA,
      description: "Quota - Rata 1",
      amount: 130,
      status: "pending",
    },
  ],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const incassa = (extra = {}) =>
  incassi.createPaymentTransaction(
    {
      paymentId: RATA,
      amount: 130,
      paymentMethod: "Contanti",
      financialAccountId: CONTO,
      ...extra,
    },
    scope(),
  );

/* ================================ 1. il conto di un altro club === */

/**
 * **Denaro che il registro mostra e che nessun saldo contiene.**
 *
 * `createAccountingEntry` verificava il conto; i quattro domini che
 * **proiettano** nel registro no. Una riga che dichiara il club A e un conto
 * di B non viene contata da nessuno dei due saldi, perche
 * `listFinancialAccountBalances` filtra per club **e** per elenco dei conti di
 * quel club. Misurato dall'audit: 8.500 euro netti nel rendiconto di A, e zero
 * nella somma dei saldi di entrambi i club.
 */
test("un incasso non si registra sul conto di un altro club", async () => {
  await assert.rejects(
    () => incassa({ financialAccountId: CONTO_ALTRUI }),
    /Accesso negato/,
  );

  assert.equal(
    fake.rows("paymentTransaction").length,
    0,
    "e non ne resta traccia",
  );
});

test("un conto del proprio club continua a funzionare", async () => {
  await incassa();

  const riga = fake.rows("paymentTransaction")[0];
  assert.equal(riga.financial_account_id, CONTO);
});

/* ================================ 2. l'ultimo giorno del periodo === */

/**
 * **«Fino al 31 dicembre» comprende il 31 dicembre.**
 *
 * Il filtro arriva da un `<input type="date">`, e `new Date("2026-12-31")`
 * vale mezzanotte: il confronto `lte` escludeva tutto cio che quel giorno
 * porta un orario — cioe quasi tutti i movimenti che il prodotto scrive da se.
 * Misurato: un rimborso di 200 alle 16:40 del 31 dicembre spariva, e il
 * rendiconto dell'anno sopravvalutava il netto di duecento euro.
 */
test("un movimento dell'ultimo giorno entra nel periodo", async () => {
  await registro.createAccountingEntry(
    {
      entryDate: "2026-12-31T16:40:00.000Z",
      direction: "OUT",
      amount: 200,
      financialAccountId: CONTO,
      operationTypeCode: "quota_attivita",
      description: "Rimborso di fine anno",
    },
    scope(),
  );

  const { entries } = await registro.listAccountingEntries(
    { from: "2026-01-01", to: "2026-12-31" },
    scope(),
    PIENI,
  );

  assert.equal(
    entries.length,
    1,
    "l'ultimo giorno non si perde fra un periodo e il successivo",
  );
});

test("un orario esplicito in fondo all'intervallo resta quello che dice", async () => {
  await registro.createAccountingEntry(
    {
      entryDate: "2026-12-31T16:40:00.000Z",
      direction: "OUT",
      amount: 200,
      financialAccountId: CONTO,
      operationTypeCode: "quota_attivita",
      description: "Rimborso di fine anno",
    },
    scope(),
  );

  const { entries } = await registro.listAccountingEntries(
    { from: "2026-01-01", to: "2026-12-31T12:00:00.000Z" },
    scope(),
    PIENI,
  );

  assert.equal(entries.length, 0, "chi chiede un istante preciso lo ottiene");
});

/* ================================ 3. il documento e lo storno === */

/**
 * **Un documento emesso attesta che il denaro e arrivato.**
 *
 * `assertIssuable` impediva di emettere su un incasso gia stornato — l'ordine
 * improbabile. L'ordine naturale — si emette, ci si accorge dell'errore, si
 * storna — non era guardato: la ricevuta restava viva e numerata mentre la
 * cassa di quell'incasso tornava a zero, e i due registri si contraddicevano
 * per l'intero importo.
 */
test("un incasso documentato non si storna finche il documento e vivo", async () => {
  const esito = await incassa();

  fake.rows("receipt").push({
    id: "ricevuta-1",
    organization_id: CLUB,
    transaction_id: esito.transaction.id,
    receipt_number: "R-2026-0001",
    cancelled_at: null,
    amount: 130,
  });

  await assert.rejects(
    () =>
      incassi.reversePaymentTransaction(
        { transactionId: esito.transaction.id, reason: "Errore" },
        scope(),
      ),
    /R-2026-0001/,
    "il messaggio nomina il documento da annullare",
  );
});

test("annullato il documento, lo storno passa", async () => {
  const esito = await incassa();

  fake.rows("receipt").push({
    id: "ricevuta-1",
    organization_id: CLUB,
    transaction_id: esito.transaction.id,
    receipt_number: "R-2026-0001",
    cancelled_at: new Date("2026-09-02T00:00:00.000Z"),
    amount: 130,
  });

  await incassi.reversePaymentTransaction(
    { transactionId: esito.transaction.id, reason: "Errore" },
    scope(),
  );

  const originale = fake
    .rows("paymentTransaction")
    .find((riga) => riga.id === esito.transaction.id);
  assert.ok(originale.reversed_at);
});
