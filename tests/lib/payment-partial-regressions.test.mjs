import assert from "node:assert/strict";
import test from "node:test";

import { calculateAthleteExpectedIncome } from "../../src/lib/athlete-payment-utils.ts";
import { resolveInstallmentPaymentStatus } from "../../src/lib/payments/payment-status-utils.ts";

/**
 * Regressione sul resto del dominio, dopo l'arrivo degli incassi parziali
 * (Workstream A, ADR-0036).
 *
 * Il registro degli incassi non basta a se stesso: se il Riepilogo Incasso
 * continua a contare **per stato** invece che per importo, un acconto da 50
 * su una rata da 130 resta invisibile — la rata non e «pagata», quindi vale
 * zero. Qui si verifica che tutto cio che gia funzionava continui a
 * funzionare *e* che gli importi parziali arrivino fino ai totali.
 */

const PIANO = {
  id: "plan-annuale",
  name: "Quota annuale",
  services: [
    { id: "svc-iscrizione", name: "Iscrizione", price: 100, optional: false },
    { id: "svc-allenamenti", name: "Allenamenti", price: 300, optional: false },
    { id: "svc-kit", name: "Kit gara", price: 80, optional: true },
  ],
  installmentSchedule: [
    { id: "rata-1", label: "Rata 1", amountType: "percentage", amount: 50, dueAfterDays: 0 },
    { id: "rata-2", label: "Rata 2", amountType: "remaining", amount: 0, dueAfterDays: 30 },
  ],
};

const ATLETA = {
  id: "atleta-1",
  selectedPlan: "plan-annuale",
  enrollmentDate: "2026-09-01",
  data: { enrollmentStartDate: "2026-09-01" },
};

const rata = (overrides = {}) => ({
  id: "rata-1",
  description: "Quota annuale - Rata 1",
  amount: 200,
  due_date: "2026-09-30",
  status: "pending",
  data: { installmentId: "rata-1", installmentLabel: "Rata 1" },
  ...overrides,
});

const riepilogo = (payments) =>
  calculateAthleteExpectedIncome({
    athlete: ATLETA,
    athleteId: "atleta-1",
    paymentPlans: [PIANO],
    payments,
  });

// --- totale, residuo e stato con incassi parziali ----------------------------

test("un acconto entra nel totale incassato, non viene ignorato", () => {
  const summary = riepilogo([
    rata({
      status: "partially_paid",
      data: {
        installmentId: "rata-1",
        ledger: { paidAmount: 50, residualAmount: 150, state: "partial" },
      },
    }),
  ]);

  assert.equal(summary.expectedTotal, 400);
  assert.equal(
    summary.recordedPaid,
    50,
    "contare per stato invece che per importo renderebbe l'acconto invisibile",
  );
  assert.equal(summary.recordedPending, 150);
  assert.equal(summary.residual, 350);
});

test("una rata saldata dal registro vale il suo importo pieno", () => {
  const summary = riepilogo([
    rata({
      status: "paid",
      paid_at: "2026-09-10",
      data: {
        installmentId: "rata-1",
        ledger: { paidAmount: 200, residualAmount: 0, state: "paid" },
      },
    }),
  ]);

  assert.equal(summary.recordedPaid, 200);
  assert.equal(summary.recordedPending, 0);
  assert.equal(summary.residual, 200);
});

test("una rata anteriore al registro conserva il comportamento di prima", () => {
  const saldata = riepilogo([rata({ status: "paid", paid_at: "2026-09-10" })]);
  const attesa = riepilogo([rata()]);

  assert.equal(saldata.recordedPaid, 200, "tutto o niente, come prima");
  assert.equal(attesa.recordedPaid, 0);
  assert.equal(attesa.recordedPending, 200);
});

test("una rata annullata non sposta nessun totale", () => {
  const summary = riepilogo([
    rata({
      status: "cancelled",
      data: {
        installmentId: "rata-1",
        excludedFromTotals: true,
        ledger: { paidAmount: 50, residualAmount: 150, state: "partial" },
      },
    }),
  ]);

  assert.equal(summary.recordedPaid, 0);
  assert.equal(summary.recordedTotal, 0);
});

test("piu rate, una parziale e una saldata, si sommano correttamente", () => {
  const summary = riepilogo([
    rata({
      id: "rata-1",
      amount: 200,
      status: "paid",
      paid_at: "2026-09-10",
      data: {
        installmentId: "rata-1",
        ledger: { paidAmount: 200, residualAmount: 0, state: "paid" },
      },
    }),
    rata({
      id: "rata-2",
      description: "Quota annuale - Rata 2",
      amount: 200,
      status: "partially_paid",
      data: {
        installmentId: "rata-2",
        installmentLabel: "Rata 2",
        ledger: { paidAmount: 80, residualAmount: 120, state: "partial" },
      },
    }),
  ]);

  assert.equal(summary.recordedPaid, 280);
  assert.equal(summary.recordedPending, 120);
  assert.equal(summary.residual, 120);
});

// --- servizi opzionali e pro-rata restano quelli -----------------------------

test("il servizio opzionale selezionato continua a entrare nel totale", () => {
  const conKit = calculateAthleteExpectedIncome({
    athlete: { ...ATLETA, selectedOptionalServiceIds: ["svc-kit"] },
    athleteId: "atleta-1",
    paymentPlans: [PIANO],
    payments: [],
  });

  assert.equal(conKit.expectedTotal, 480);
  assert.equal(
    conKit.installments.reduce((totale, rataPiano) => totale + rataPiano.amount, 0),
    480,
    "le rate coprono il totale, kit compreso",
  );
});

test("il pro-rata continua a ridurre il dovuto a stagione iniziata", () => {
  const summary = calculateAthleteExpectedIncome({
    athlete: {
      ...ATLETA,
      data: { enrollmentStartDate: "2027-01-01" },
    },
    athleteId: "atleta-1",
    paymentPlans: [
      {
        ...PIANO,
        proration: {
          enabled: true,
          method: "months",
          seasonStartDate: "2026-09-01",
          seasonEndDate: "2027-06-30",
        },
      },
    ],
    payments: [],
  });

  assert.equal(summary.prorationResult.applied, true);
  assert.ok(summary.expectedTotal < 400 && summary.expectedTotal > 0);
});

// --- la rata del piano mostra il parziale ------------------------------------

test("una rata parzialmente incassata non e piu «in attesa» nel riepilogo", () => {
  const stato = resolveInstallmentPaymentStatus({ id: "rata-1", label: "Rata 1" }, [
    {
      id: "pagamento-1",
      description: "Quota annuale - Rata 1",
      status: "partially_paid",
      data: {
        installmentId: "rata-1",
        ledger: { paidAmount: 50, residualAmount: 150, state: "partial" },
      },
    },
  ]);

  assert.equal(stato.state, "partial");
  assert.match(stato.label, /residuo 150\.00 EUR/);
});

test("una rata senza incassi resta in attesa, e una senza pagamenti da generare", () => {
  const inAttesa = resolveInstallmentPaymentStatus({ id: "rata-1", label: "Rata 1" }, [
    {
      id: "pagamento-1",
      description: "Quota annuale - Rata 1",
      status: "pending",
      data: { installmentId: "rata-1" },
    },
  ]);
  const daGenerare = resolveInstallmentPaymentStatus(
    { id: "rata-9", label: "Rata 9" },
    [],
  );

  assert.equal(inAttesa.state, "pending");
  assert.equal(daGenerare.state, "unbilled");
});
