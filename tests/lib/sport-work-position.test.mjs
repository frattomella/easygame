import assert from "node:assert/strict";
import test from "node:test";

import {
  computeAnnualPosition,
  computePositionDrift,
  toEngineSnapshot,
} from "../../src/lib/sport-work/position.ts";

/**
 * La **posizione annua** del lavoratore.
 *
 * Quattro cose vanno dimostrate.
 *
 * 1. **Cio che il club ha pagato e cio che il lavoratore ha dichiarato
 *    restano due numeri.** Il primo EasyGame lo sa, il secondo glielo hanno
 *    detto, e una schermata che li somma in una colonna sola non puo piu
 *    dire quanto sa davvero.
 * 2. **La posizione e per anno solare.** Le erogazioni di un altro anno non
 *    entrano.
 * 3. **Uno storno toglie, non nasconde.** La riga stornata resta nel
 *    registro e smette di contare.
 * 4. **Una dichiarazione arrivata dopo non riscrive il passato.** Produce
 *    una differenza visibile — il famoso caso da 540,60 euro — che qualcuno
 *    deve sanare, non una correzione silenziosa.
 */

const payout = (overrides = {}) => ({
  id: "p1",
  transaction_type: "COMPENSATION_PAYMENT",
  gross_amount: 1200,
  paid_at: "2026-09-30T00:00:00.000Z",
  fiscal_year: 2026,
  employee_contribution: 0,
  employer_contribution: 0,
  taxable_social: 0,
  social_franchise_used: 1200,
  taxable_fiscal: 0,
  fiscal_franchise_used: 1200,
  reversal_of_id: null,
  reversed_at: null,
  ...overrides,
});

// --- i due numeri restano due --------------------------------------------------

test("erogato dal club e dichiarato esterno non si sommano in una colonna sola", () => {
  const position = computeAnnualPosition({
    year: 2026,
    payouts: [payout({ id: "a", gross_amount: 3000 })],
    declaration: {
      id: "d1",
      fiscal_year: 2026,
      external_amount: 2000,
      declaration_date: "2026-07-01T00:00:00.000Z",
    },
  });

  assert.equal(position.clubGross, 3000);
  assert.equal(position.externalDeclared, 2000);
  assert.equal(position.progressive, 5000);
  assert.equal(position.hasCurrentDeclaration, true);
  assert.equal(position.lastDeclarationAt, "2026-07-01T00:00:00.000Z");
});

test("senza dichiarazione il progressivo e solo quello che il club conosce", () => {
  const position = computeAnnualPosition({
    year: 2026,
    payouts: [payout({ gross_amount: 3000 })],
    declaration: null,
  });

  assert.equal(position.externalDeclared, 0);
  assert.equal(position.progressive, 3000);
  assert.equal(position.hasCurrentDeclaration, false);
});

test("le franchigie residue si leggono dalle regole dell'anno", () => {
  const position = computeAnnualPosition({
    year: 2026,
    payouts: [payout({ gross_amount: 3000 })],
  });

  assert.equal(position.socialFranchise, 5000);
  assert.equal(position.socialFranchiseRemaining, 2000);
  assert.equal(position.fiscalFranchise, 15000);
  assert.equal(position.fiscalFranchiseRemaining, 12000);
});

test("un anno senza regole non fa fallire una lettura", () => {
  const position = computeAnnualPosition({
    year: 2028,
    payouts: [payout({ fiscal_year: 2028, gross_amount: 1000 })],
  });

  assert.equal(position.clubGross, 1000);
  assert.equal(position.socialFranchise, 0);
  assert.equal(position.socialFranchiseRemaining, 0);
});

// --- l'anno e un confine -------------------------------------------------------

test("le erogazioni di un altro anno non entrano nella posizione", () => {
  const position = computeAnnualPosition({
    year: 2026,
    payouts: [
      payout({ id: "a", gross_amount: 1200, fiscal_year: 2026 }),
      payout({
        id: "b",
        gross_amount: 1200,
        fiscal_year: 2027,
        paid_at: "2027-01-31T00:00:00.000Z",
      }),
    ],
  });

  assert.equal(position.clubGross, 1200);
  assert.equal(position.paymentCount, 1);
});

test("una dichiarazione di un altro anno non si applica", () => {
  const position = computeAnnualPosition({
    year: 2026,
    payouts: [payout()],
    declaration: {
      id: "d",
      fiscal_year: 2027,
      external_amount: 9000,
      declaration_date: "2027-01-10T00:00:00.000Z",
    },
  });

  assert.equal(position.externalDeclared, 0);
  assert.equal(position.hasCurrentDeclaration, false);
});

// --- storni ---------------------------------------------------------------------

test("una coppia stornata esce a due a due, e vale zero", () => {
  const position = computeAnnualPosition({
    year: 2026,
    payouts: [
      payout({
        id: "a",
        gross_amount: 1200,
        reversed_at: "2026-10-05T00:00:00.000Z",
      }),
      payout({
        id: "a-rev",
        gross_amount: -1200,
        transaction_type: "COMPENSATION_REVERSAL",
        reversal_of_id: "a",
        paid_at: "2026-10-05T00:00:00.000Z",
      }),
      payout({ id: "b", gross_amount: 1200 }),
    ],
  });

  assert.equal(
    position.clubGross,
    1200,
    "resta solo l'erogazione non stornata",
  );
  assert.equal(position.paymentCount, 1);
});

test("escludere solo l'originale renderebbe negativo il progressivo", () => {
  const soloStorno = computeAnnualPosition({
    year: 2026,
    payouts: [
      payout({
        id: "a",
        gross_amount: 1200,
        reversed_at: "2026-10-05T00:00:00.000Z",
      }),
      payout({
        id: "a-rev",
        gross_amount: -1200,
        transaction_type: "COMPENSATION_REVERSAL",
        reversal_of_id: "a",
        paid_at: "2026-10-05T00:00:00.000Z",
      }),
    ],
  });

  assert.equal(soloStorno.clubGross, 0);
  assert.equal(soloStorno.socialFranchiseRemaining, 5000);
});

test("un rimborso spese non consuma la franchigia dei compensi", () => {
  const position = computeAnnualPosition({
    year: 2026,
    payouts: [
      payout({ id: "a", gross_amount: 1200 }),
      payout({
        id: "r",
        gross_amount: 137.4,
        transaction_type: "EXPENSE_REIMBURSEMENT",
      }),
    ],
  });

  assert.equal(position.clubGross, 1200);
});

test("un premio non consuma la franchigia dei compensi", () => {
  const position = computeAnnualPosition({
    year: 2026,
    payouts: [
      payout({ id: "a", gross_amount: 1200 }),
      payout({ id: "b", gross_amount: 500, transaction_type: "BONUS_PAYMENT" }),
    ],
  });

  assert.equal(position.clubGross, 1200);
});

test("il versamento dei contributi all'INPS non e un compenso al lavoratore", () => {
  const position = computeAnnualPosition({
    year: 2026,
    payouts: [
      payout({ id: "a", gross_amount: 1200 }),
      payout({
        id: "f",
        gross_amount: 270.3,
        transaction_type: "CONTRIBUTION_PAYMENT",
      }),
    ],
  });

  assert.equal(position.clubGross, 1200);
});

// --- aggregati congelati --------------------------------------------------------

test("i contributi della posizione sono la somma di quelli congelati", () => {
  const position = computeAnnualPosition({
    year: 2026,
    payouts: [
      payout({
        id: "a",
        gross_amount: 6000,
        employee_contribution: 45.05,
        employer_contribution: 90.1,
        taxable_social: 1000,
        social_franchise_used: 5000,
      }),
      payout({
        id: "b",
        gross_amount: 1200,
        employee_contribution: 54.06,
        employer_contribution: 108.12,
        taxable_social: 1200,
        social_franchise_used: 0,
      }),
    ],
  });

  assert.equal(position.employeeContribution, 99.11);
  assert.equal(position.employerContribution, 198.22);
  assert.equal(position.socialTaxable, 2200);
  assert.equal(position.socialFranchiseUsed, 5000);
});

test("la posizione si converte nell'input del motore senza perdere la data", () => {
  const position = computeAnnualPosition({
    year: 2026,
    payouts: [payout({ gross_amount: 4000 })],
    declaration: {
      id: "d",
      fiscal_year: 2026,
      external_amount: 1000,
      declaration_date: "2026-05-01T00:00:00.000Z",
    },
  });

  const snapshot = toEngineSnapshot(position);
  assert.deepEqual(snapshot, {
    year: 2026,
    clubGrossPaid: 4000,
    externalDeclared: 1000,
    declaredAt: "2026-05-01T00:00:00.000Z",
    hasCurrentDeclaration: true,
  });
});

// --- dichiarazione arrivata dopo -------------------------------------------------

test("una dichiarazione successiva alle erogazioni viene segnalata", () => {
  const position = computeAnnualPosition({
    year: 2026,
    payouts: [payout({ gross_amount: 6000, paid_at: "2026-03-31T00:00:00.000Z" })],
    declaration: {
      id: "d",
      fiscal_year: 2026,
      external_amount: 4000,
      declaration_date: "2026-05-20T00:00:00.000Z",
    },
  });

  assert.equal(position.declarationArrivedAfterPayment, true);
});

test("lo scostamento e il conto della differenza, e non riscrive niente", () => {
  const payouts = [
    payout({
      id: "a",
      gross_amount: 6000,
      paid_at: "2026-03-31T00:00:00.000Z",
      employee_contribution: 45.05,
      employer_contribution: 90.1,
      social_franchise_used: 5000,
      taxable_social: 1000,
    }),
  ];

  const position = computeAnnualPosition({
    year: 2026,
    payouts,
    declaration: {
      id: "d",
      fiscal_year: 2026,
      external_amount: 4000,
      declaration_date: "2026-05-20T00:00:00.000Z",
    },
  });

  const drift = computePositionDrift({
    position,
    payouts,
    relationshipType: "SPORT_COCOCO",
    socialCoverage: "NONE",
  });

  assert.equal(drift.frozenEmployeeContribution, 45.05);
  assert.equal(drift.frozenEmployerContribution, 90.1);
  assert.equal(drift.recomputedEmployeeContribution, 225.25);
  assert.equal(drift.recomputedEmployerContribution, 450.5);
  assert.equal(drift.employeeDelta, 180.2);
  assert.equal(drift.employerDelta, 360.4);
  assert.equal(
    Math.round((drift.employeeDelta + drift.employerDelta) * 100) / 100,
    540.6,
  );
  assert.equal(drift.hasDrift, true);
  assert.match(drift.reason, /dopo erogazioni gia registrate/);

  // La posizione non e cambiata: lo scostamento si mostra, non si scrive.
  assert.equal(position.employeeContribution, 45.05);
});

test("senza scostamento il conto lo dice, e non inventa un problema", () => {
  const payouts = [
    payout({
      id: "a",
      gross_amount: 6000,
      paid_at: "2026-03-31T00:00:00.000Z",
      employee_contribution: 45.05,
      employer_contribution: 90.1,
      social_franchise_used: 5000,
      taxable_social: 1000,
    }),
  ];

  const position = computeAnnualPosition({ year: 2026, payouts });
  const drift = computePositionDrift({
    position,
    payouts,
    relationshipType: "SPORT_COCOCO",
    socialCoverage: "NONE",
  });

  assert.equal(drift.hasDrift, false);
  assert.equal(drift.reason, null);
});

test("senza regole dell'anno non esiste uno scostamento da mostrare", () => {
  const position = computeAnnualPosition({ year: 2028, payouts: [] });
  assert.equal(
    computePositionDrift({
      position,
      payouts: [],
      relationshipType: "SPORT_COCOCO",
      socialCoverage: "NONE",
    }),
    null,
  );
});
