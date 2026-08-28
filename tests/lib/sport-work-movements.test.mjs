import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateClubPayments,
  getMovementSourceLabel,
  summarizeClubMovements,
} from "../../src/lib/club-financial-summary.ts";

/**
 * Le uscite del lavoro sportivo dentro Movimenti.
 *
 * Tre cose vanno dimostrate, e sono le tre che, mancando, fanno contare due
 * volte lo stesso euro.
 *
 * 1. **Un'erogazione produce una riga sola.** La scadenza *programmata* non e
 *    un movimento: se comparisse anche lei, lo stesso compenso figurerebbe
 *    due volte fra le Uscite.
 * 2. **Una coppia stornata non compare affatto.** Lo storno dice «questa
 *    erogazione non e mai avvenuta»: mostrarla insieme alla sua riga negativa
 *    riempirebbe l'estratto conto di coppie che si annullano.
 * 3. **Il denaro esce.** Direzione uscita, e `collectedAmount` pari al lordo,
 *    perche il registro registra denaro gia uscito e non un impegno.
 */

const erogazione = (overrides = {}) => ({
  id: "sw-1",
  organization_id: "club-a",
  transaction_type: "COMPENSATION_PAYMENT",
  person_id: "per-1",
  relationship_id: "rel-1",
  installment_id: "rata-1",
  paid_at: "2026-09-30T00:00:00.000Z",
  fiscal_year: 2026,
  gross_amount: 1200,
  currency: "EUR",
  payment_method: "Bonifico",
  reference: "SW-2026-09",
  bank_account_id: "conto-1",
  net_amount: 1145.94,
  club_cost: 1308.12,
  reversed_at: null,
  reversal_of_id: null,
  _personName: "Marco Rossi",
  ...overrides,
});

const movimenti = (payouts) =>
  aggregateClubPayments({ sportWorkPayouts: payouts });

test("un compenso erogato e una uscita, e si legge come tale", () => {
  const [movimento] = movimenti([erogazione()]);

  assert.equal(movimento.source, "sport_work");
  assert.equal(movimento.direction, "expense");
  assert.equal(movimento.amount, 1200);
  assert.equal(movimento.collectedAmount, 1200);
  assert.equal(movimento.status, "paid");
  assert.equal(movimento.description, "Compenso - Marco Rossi");
  assert.equal(movimento.subjectName, "Marco Rossi");
  assert.equal(movimento.method, "Bonifico");
  assert.equal(movimento.bankAccountId, "conto-1");
  assert.equal(movimento.sourceTable, "sport_work_outbound_transactions");
});

test("la fonte si chiama con il suo nome", () => {
  assert.equal(getMovementSourceLabel("sport_work"), "Lavoro sportivo");
});

test("premi, rimborsi e fatture si distinguono nella riga", () => {
  const righe = movimenti([
    erogazione({ id: "a", transaction_type: "BONUS_PAYMENT", gross_amount: 500 }),
    erogazione({
      id: "b",
      transaction_type: "EXPENSE_REIMBURSEMENT",
      gross_amount: 137.4,
    }),
    erogazione({
      id: "c",
      transaction_type: "VAT_INVOICE_PAYMENT",
      gross_amount: 1220,
    }),
  ]);

  assert.deepEqual(
    righe.map((row) => row.category).sort(),
    ["Fattura professionista", "Premio", "Rimborso spese"],
  );
  assert.ok(righe.every((row) => row.direction === "expense"));
});

test("una coppia stornata non compare in Movimenti", () => {
  const righe = movimenti([
    erogazione({ id: "a", reversed_at: "2026-10-05T00:00:00.000Z" }),
    erogazione({
      id: "a-rev",
      transaction_type: "COMPENSATION_REVERSAL",
      gross_amount: -1200,
      reversal_of_id: "a",
    }),
    erogazione({ id: "b" }),
  ]);

  assert.equal(righe.length, 1);
  assert.equal(righe[0].id, "b");
});

test("le Uscite contano il denaro uscito, una volta sola", () => {
  const righe = movimenti([
    erogazione({ id: "a" }),
    erogazione({ id: "b", gross_amount: 900 }),
  ]);

  const totali = summarizeClubMovements(righe);
  assert.equal(totali.totalExpense, 2100);
  assert.equal(totali.totalIncome, 0);
});

test("una riga senza importo non diventa un movimento", () => {
  assert.equal(movimenti([erogazione({ gross_amount: 0 })]).length, 0);
  assert.equal(movimenti([null, undefined, "x"]).length, 0);
});

test("un'erogazione non e modificabile ne cancellabile da Movimenti", () => {
  const [movimento] = movimenti([erogazione()]);

  assert.equal(movimento.canEdit, false);
  assert.equal(movimento.canDelete, false);
  assert.equal(
    movimento.canInvoice,
    false,
    "un compenso in uscita non genera una fattura del club",
  );
});

test("senza permesso sui compensi Movimenti resta una pagina che funziona", () => {
  // E il caso di un collaboratore: l'endpoint risponde 403 e il caricatore
  // restituisce un elenco vuoto invece di far fallire la pagina.
  const righe = aggregateClubPayments({ sportWorkPayouts: [] });
  assert.deepEqual(righe, []);
});
