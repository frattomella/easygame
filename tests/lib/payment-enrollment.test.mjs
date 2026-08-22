import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateProratedTotal,
  calculatePlanTotal,
  getSelectedOptionalServiceIdsFromAthlete,
  normalizePaymentPlan,
} from "../../src/lib/payment-plan-utils.ts";
import { calculateAthleteExpectedIncome } from "../../src/lib/athlete-payment-utils.ts";
import {
  paymentCoversInstallment,
  resolveInstallmentPaymentStatus,
} from "../../src/lib/payments/payment-status-utils.ts";

/**
 * Regressione WP-33 — dominio pagamenti.
 *
 * Copre i quattro difetti segnalati: servizi opzionali fuori dalle rate,
 * pro-rata sempre «non applicato», rate sempre «in attesa» dopo l'incasso e
 * metodo di pagamento non strutturato (qui la parte di dominio).
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
  proration: {
    enabled: true,
    method: "months",
    seasonStartDate: "2026-09-01",
    seasonEndDate: "2027-06-30",
    allowManualOverride: false,
  },
};

// --- servizi opzionali -------------------------------------------------------

test("un array vuoto in cima non nasconde la selezione confermata", () => {
  const athlete = {
    // La scheda atleta valorizza sempre questo campo, anche a vuoto.
    selectedOptionalServiceIds: [],
    data: {
      enrollmentPaymentConfig: {
        selectedOptionalServiceIds: ["svc-kit"],
      },
    },
  };

  assert.deepEqual(getSelectedOptionalServiceIdsFromAthlete(athlete), [
    "svc-kit",
  ]);
});

test("una selezione esplicita in cima ha comunque la precedenza", () => {
  const athlete = {
    selectedOptionalServiceIds: ["svc-kit"],
    data: {
      enrollmentPaymentConfig: { selectedOptionalServiceIds: ["svc-altro"] },
    },
  };

  assert.deepEqual(getSelectedOptionalServiceIdsFromAthlete(athlete), [
    "svc-kit",
  ]);
});

test("nessun servizio opzionale selezionato resta nessun servizio", () => {
  assert.deepEqual(
    getSelectedOptionalServiceIdsFromAthlete({
      selectedOptionalServiceIds: [],
      data: { enrollmentPaymentConfig: { selectedOptionalServiceIds: [] } },
    }),
    [],
  );
});

test("il servizio opzionale selezionato entra nel totale e nelle rate", () => {
  const senzaKit = calculateAthleteExpectedIncome({
    athlete: { selectedPlan: "plan-annuale", subscriptionStartDate: "2026-09-01" },
    athleteId: "atleta-1",
    paymentPlans: [PIANO],
  });
  const conKit = calculateAthleteExpectedIncome({
    athlete: {
      selectedPlan: "plan-annuale",
      subscriptionStartDate: "2026-09-01",
      selectedOptionalServiceIds: [],
      data: {
        enrollmentPaymentConfig: { selectedOptionalServiceIds: ["svc-kit"] },
      },
    },
    athleteId: "atleta-1",
    paymentPlans: [PIANO],
  });

  assert.equal(senzaKit.expectedTotal, 400);
  assert.equal(conKit.expectedTotal, 480);

  const sommaRate = conKit.installments.reduce(
    (total, installment) => total + installment.amount,
    0,
  );
  assert.equal(
    sommaRate,
    conKit.expectedTotal,
    "le rate devono coprire il totale comprensivo dei servizi opzionali",
  );
  assert.ok(
    conKit.installments.every((installment) => installment.amount > 0),
    "nessuna rata deve restare a zero",
  );
});

test("calculatePlanTotal esclude i servizi opzionali non richiesti", () => {
  assert.equal(calculatePlanTotal(PIANO), 400);
  assert.equal(
    calculatePlanTotal(PIANO, { selectedOptionalServiceIds: ["svc-kit"] }),
    480,
  );
});

// --- pro-rata ----------------------------------------------------------------

test("il pro-rata risulta applicato anche quando copre l'intero periodo", () => {
  const risultato = calculateProratedTotal({
    total: 400,
    proration: normalizePaymentPlan(PIANO).proration,
    startDate: "2026-09-01",
  });

  assert.equal(risultato.applied, true, "il calcolo e stato eseguito");
  assert.equal(risultato.adjusted, false, "l'importo non e cambiato");
  assert.equal(risultato.total, 400);
  assert.equal(risultato.warning, null);
});

test("il pro-rata riduce l'importo per un'iscrizione a stagione iniziata", () => {
  const risultato = calculateProratedTotal({
    total: 400,
    proration: normalizePaymentPlan(PIANO).proration,
    startDate: "2027-01-01",
  });

  assert.equal(risultato.applied, true);
  assert.equal(risultato.adjusted, true);
  assert.ok(risultato.total < 400 && risultato.total > 0);
  assert.equal(risultato.originalTotal, 400);
});

test("un pro-rata acceso senza metodo spiega cosa manca", () => {
  const risultato = calculateProratedTotal({
    total: 400,
    proration: normalizePaymentPlan({
      ...PIANO,
      proration: { ...PIANO.proration, method: "sconosciuto" },
    }).proration,
    startDate: "2027-01-01",
  });

  assert.equal(risultato.applied, false);
  assert.match(risultato.warning || "", /metodo di calcolo/i);
});

test("un pro-rata senza date spiega cosa manca", () => {
  const risultato = calculateProratedTotal({
    total: 400,
    proration: normalizePaymentPlan({
      ...PIANO,
      proration: { ...PIANO.proration, seasonEndDate: "" },
    }).proration,
    startDate: "2027-01-01",
  });

  assert.equal(risultato.applied, false);
  assert.match(risultato.warning || "", /data inizio/i);
});

test("il pro-rata spento non produce ne calcolo ne avviso", () => {
  const risultato = calculateProratedTotal({
    total: 400,
    proration: normalizePaymentPlan({
      ...PIANO,
      proration: { ...PIANO.proration, enabled: false, method: "none" },
    }).proration,
    startDate: "2027-01-01",
  });

  assert.equal(risultato.applied, false);
  assert.equal(risultato.adjusted, false);
  assert.equal(risultato.warning, null);
  assert.equal(risultato.total, 400);
});

// --- stato delle rate --------------------------------------------------------

const rata = { id: "rata-1", label: "Rata 1", amount: 240 };

test("una rata incassata non e piu in attesa", () => {
  const pagamenti = [
    {
      id: "pay-1",
      description: "Quota annuale - Rata 1",
      amount: 240,
      status: "paid",
      paid_at: "2026-09-05T10:00:00.000Z",
      data: { installmentId: "rata-1" },
    },
  ];

  const stato = resolveInstallmentPaymentStatus(rata, pagamenti);
  assert.equal(stato.state, "paid");
  assert.equal(stato.label, "Pagato");
});

test("una rata con pagamento generato e ancora da incassare resta in attesa", () => {
  const stato = resolveInstallmentPaymentStatus(rata, [
    {
      id: "pay-1",
      description: "Quota annuale - Rata 1",
      amount: 240,
      status: "pending",
      data: { installmentId: "rata-1" },
    },
  ]);

  assert.equal(stato.state, "pending");
  assert.equal(stato.label, "In attesa");
});

test("una rata senza pagamento generato non e in attesa: e da generare", () => {
  const stato = resolveInstallmentPaymentStatus(rata, []);
  assert.equal(stato.state, "unbilled");
});

test("un pagamento annullato non risulta come incasso della rata", () => {
  const stato = resolveInstallmentPaymentStatus(rata, [
    {
      id: "pay-1",
      description: "Quota annuale - Rata 1",
      amount: 240,
      status: "cancelled",
      paid_at: "2026-09-05T10:00:00.000Z",
      data: { installmentId: "rata-1", excludedFromTotals: true },
    },
  ]);

  assert.equal(stato.state, "unbilled");
});

test("il pagamento di un'altra rata non conta per questa", () => {
  const stato = resolveInstallmentPaymentStatus(rata, [
    {
      id: "pay-2",
      description: "Quota annuale - Rata 2",
      amount: 240,
      status: "paid",
      paid_at: "2026-10-05T10:00:00.000Z",
      data: { installmentId: "rata-2" },
    },
  ]);

  assert.equal(stato.state, "unbilled");
});

test("un pagamento storico senza installmentId si riconosce dalla descrizione", () => {
  const pagamento = {
    id: "pay-legacy",
    description: "Quota annuale - Rata 1",
    amount: 240,
    status: "paid",
    paid_at: "2026-09-05T10:00:00.000Z",
    data: {},
  };

  assert.equal(paymentCoversInstallment(pagamento, rata), true);
  assert.equal(resolveInstallmentPaymentStatus(rata, [pagamento]).state, "paid");
});
