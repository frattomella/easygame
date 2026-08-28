import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateClubPayments,
  summarizeClubMovements,
} from "../../src/lib/club-financial-summary.ts";
import {
  isSettledTransaction,
  normalizePaymentTransactions,
  resolveInstallmentLedger,
} from "../../src/lib/payments/installment-ledger.ts";

/**
 * L'area Movimenti e il denaro realmente incassato (RC FIX 3).
 *
 * **Il difetto che questi test chiudono.** Il riepilogo di `/movements`
 * sommava l'importo *dovuto* di una rata ogni volta che la rata risultava
 * saldata, e **zero** in ogni altro caso. Ne seguivano due errori opposti
 * sullo stesso denaro: due rate da 329,80 EUR dichiaravano 329,80 EUR di
 * Entrate appena passavano a «pagata», e le stesse rate incassate in parte —
 * 250,00 EUR realmente entrati in cassa — ne dichiaravano 0,00, perche una
 * rata parziale non e «pagata».
 *
 * La regola qui provata e una sola: **Entrate e Uscite riportano la somma
 * degli incassi validi**, cioe il registro della rata (ADR-0036), non il suo
 * stato finale. Le rate anteriori al registro — saldate senza nessun movimento
 * a dimostrarlo — restano contate per intero, altrimenti il passaggio
 * cancellerebbe denaro gia registrato.
 *
 * Le rate di prova non portano una fotografia scritta a mano: la si ricava
 * dalle stesse funzioni che la scrivono in produzione
 * (`recomputeChargeFromLedger`), cosi un test non puo passare descrivendo un
 * registro che il servizio incassi non produrrebbe mai.
 */

const CLUB = "club-rc3";

const rata = ({
  id,
  amount,
  athleteId = "atleta-1",
  label = "Rata 1",
  description = "Quota annuale",
}) => ({
  id,
  organization_id: CLUB,
  athlete_id: athleteId,
  description: `${description} - ${label}`,
  amount,
  due_date: "2026-09-30T00:00:00.000Z",
  paid_at: null,
  status: "pending",
  method: null,
  data: { installmentId: `${id}-plan`, installmentLabel: label },
});

const incasso = ({
  id,
  chargeId,
  amount,
  paidAt,
  reversedAt = null,
  reverses = null,
}) => ({
  id,
  organization_id: CLUB,
  athlete_id: "atleta-1",
  payment_id: chargeId,
  amount,
  paid_at: paidAt,
  payment_method: "cash",
  source: "MANUAL",
  created_at: paidAt,
  reversed_at: reversedAt,
  reverses_transaction_id: reverses,
});

/**
 * La rata come la riscrive `recomputeChargeFromLedger` dopo un movimento:
 * stessi campi, stessa fotografia in `data.ledger`.
 */
const conIncassi = (charge, rows = []) => {
  const transactions = normalizePaymentTransactions(rows);
  const ledger = resolveInstallmentLedger({ charge, transactions });
  const settled = transactions.filter(isSettledTransaction);
  const last = settled[settled.length - 1] || null;

  return {
    ...charge,
    status:
      ledger.state === "paid"
        ? "paid"
        : ledger.state === "partial"
          ? "partially_paid"
          : "pending",
    paid_at: ledger.state === "paid" && last?.paidAt ? last.paidAt : null,
    method: last?.paymentMethod || charge.method || null,
    data: {
      ...(charge.data || {}),
      ledger: {
        dueAmount: ledger.dueAmount,
        paidAmount: ledger.paidAmount,
        residualAmount: ledger.residualAmount,
        state: ledger.state,
        transactionCount: settled.length,
        updatedAt: "2026-08-28T10:00:00.000Z",
      },
    },
  };
};

const riepilogo = (sources) =>
  summarizeClubMovements(aggregateClubPayments(sources));

test("una rata senza incassi non porta niente alle Entrate", () => {
  const totali = riepilogo({ payments: [rata({ id: "r1", amount: 100 })] });

  assert.equal(totali.totalIncome, 0);
  assert.equal(totali.totalPendingIncome, 100);
});

test("una rata incassata in parte porta alle Entrate il solo incassato", () => {
  const charge = conIncassi(rata({ id: "r1", amount: 100 }), [
    incasso({
      id: "t1",
      chargeId: "r1",
      amount: 40,
      paidAt: "2026-08-01T10:00:00.000Z",
    }),
  ]);

  const totali = riepilogo({ payments: [charge] });

  assert.equal(charge.status, "partially_paid");
  assert.equal(totali.totalIncome, 40);
  assert.equal(totali.totalPendingIncome, 60);
});

test("una rata saldata porta alle Entrate l'intero dovuto", () => {
  const charge = conIncassi(rata({ id: "r1", amount: 100 }), [
    incasso({
      id: "t1",
      chargeId: "r1",
      amount: 100,
      paidAt: "2026-08-01T10:00:00.000Z",
    }),
  ]);

  const totali = riepilogo({ payments: [charge] });

  assert.equal(charge.status, "paid");
  assert.equal(totali.totalIncome, 100);
  assert.equal(totali.totalPendingIncome, 0);
});

test("piu incassi sulla stessa rata si sommano una volta sola", () => {
  const charge = conIncassi(rata({ id: "r1", amount: 100 }), [
    incasso({
      id: "t1",
      chargeId: "r1",
      amount: 40,
      paidAt: "2026-08-01T10:00:00.000Z",
    }),
    incasso({
      id: "t2",
      chargeId: "r1",
      amount: 60,
      paidAt: "2026-08-05T10:00:00.000Z",
    }),
  ]);

  const totali = riepilogo({ payments: [charge] });

  assert.equal(totali.totalIncome, 100);
  assert.equal(totali.paidCount, 1);
});

test("uno storno riporta le Entrate a zero e la rata fra le previste", () => {
  const charge = conIncassi(rata({ id: "r1", amount: 100 }), [
    incasso({
      id: "t1",
      chargeId: "r1",
      amount: 100,
      paidAt: "2026-08-01T10:00:00.000Z",
      reversedAt: "2026-08-06T10:00:00.000Z",
    }),
    incasso({
      id: "t2",
      chargeId: "r1",
      amount: -100,
      paidAt: "2026-08-06T10:00:00.000Z",
      reverses: "t1",
    }),
  ]);

  const totali = riepilogo({ payments: [charge] });

  assert.equal(totali.totalIncome, 0);
  assert.equal(totali.totalPendingIncome, 100);
});

test("un rimborso parziale scende dalle Entrate senza annullare l'incasso", () => {
  const charge = conIncassi(rata({ id: "r1", amount: 100 }), [
    incasso({
      id: "t1",
      chargeId: "r1",
      amount: 100,
      paidAt: "2026-08-01T10:00:00.000Z",
    }),
    incasso({
      id: "t2",
      chargeId: "r1",
      amount: -30,
      paidAt: "2026-08-07T10:00:00.000Z",
    }),
  ]);

  const totali = riepilogo({ payments: [charge] });

  assert.equal(totali.totalIncome, 70);
  assert.equal(totali.totalPendingIncome, 30);
});

test("incasso, storno e nuovo incasso lasciano in cassa solo l'ultimo", () => {
  const charge = conIncassi(rata({ id: "r1", amount: 100 }), [
    incasso({
      id: "t1",
      chargeId: "r1",
      amount: 100,
      paidAt: "2026-08-01T10:00:00.000Z",
      reversedAt: "2026-08-02T10:00:00.000Z",
    }),
    incasso({
      id: "t2",
      chargeId: "r1",
      amount: -100,
      paidAt: "2026-08-02T10:00:00.000Z",
      reverses: "t1",
    }),
    incasso({
      id: "t3",
      chargeId: "r1",
      amount: 45,
      paidAt: "2026-08-03T10:00:00.000Z",
    }),
  ]);

  const totali = riepilogo({ payments: [charge] });

  assert.equal(totali.totalIncome, 45);
  assert.equal(totali.totalPendingIncome, 55);
});

test("il caso del Full Club UAT: 329,80 EUR dovuti, 250,00 EUR incassati", () => {
  const prima = conIncassi(rata({ id: "r1", amount: 179.8, label: "Rata 1" }), [
    incasso({
      id: "t1",
      chargeId: "r1",
      amount: 179.8,
      paidAt: "2026-08-01T10:00:00.000Z",
    }),
  ]);
  const seconda = conIncassi(rata({ id: "r2", amount: 150, label: "Rata 2" }), [
    incasso({
      id: "t2",
      chargeId: "r2",
      amount: 70.2,
      paidAt: "2026-08-05T10:00:00.000Z",
    }),
  ]);

  const totali = riepilogo({ payments: [prima, seconda] });

  assert.equal(totali.totalIncome, 250);
  assert.equal(totali.totalPendingIncome, 79.8);
  assert.equal(totali.totalIncome + totali.totalPendingIncome, 329.8);
});

test("una rata annullata non conta ne fra le Entrate ne fra le previste", () => {
  const base = rata({ id: "r1", amount: 100 });
  const charge = {
    ...base,
    status: "cancelled",
    data: { ...base.data, excludedFromTotals: true },
  };

  const totali = riepilogo({ payments: [charge] });

  assert.equal(totali.totalIncome, 0);
  assert.equal(totali.totalPendingIncome, 0);
});

test("una rata saldata prima del registro resta contata per intero", () => {
  const charge = {
    ...rata({ id: "r1", amount: 120 }),
    status: "paid",
    paid_at: "2026-05-01T10:00:00.000Z",
  };

  const totali = riepilogo({ payments: [charge] });

  assert.equal(totali.totalIncome, 120);
  assert.equal(totali.totalPendingIncome, 0);
});

test("Uscite e saldo seguono la stessa regola delle Entrate", () => {
  const entrata = conIncassi(rata({ id: "r1", amount: 200 }), [
    incasso({
      id: "t1",
      chargeId: "r1",
      amount: 120,
      paidAt: "2026-08-01T10:00:00.000Z",
    }),
  ]);

  const totali = riepilogo({
    payments: [entrata],
    supplierPayments: [
      {
        id: "u1",
        organization_id: CLUB,
        description: "Fornitura palloni",
        amount: 50,
        status: "paid",
        paid_at: "2026-08-02T10:00:00.000Z",
      },
      {
        id: "u2",
        organization_id: CLUB,
        description: "Fornitura divise",
        amount: 30,
        status: "pending",
      },
    ],
  });

  assert.equal(totali.totalIncome, 120);
  assert.equal(totali.totalExpense, 50);
  assert.equal(totali.totalPendingIncome, 80);
  assert.equal(totali.totalPendingExpense, 30);
  assert.equal(totali.balance, 70);
});
