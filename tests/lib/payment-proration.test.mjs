import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  calculateProratedTotal,
  describeProrationResult,
  normalizePaymentPlan,
} from "../../src/lib/payment-plan-utils.ts";
import { calculateAthleteExpectedIncome } from "../../src/lib/athlete-payment-utils.ts";

/**
 * RC Fix 1, punto 4 — «il pro-rata risulta sempre Non applicato».
 *
 * Il calcolo era giusto. Rotti erano gli altri due pezzi:
 *
 * 1. **il dato.** Il modulo del piano chiede «Inizio periodo/stagione» e
 *    «Fine periodo/stagione» come due date da riscrivere ogni anno. Chi
 *    accendeva il pro-rata e le lasciava vuote — il caso normale — otteneva
 *    un pro-rata che non si applicava mai. La stagione attiva del club **e**
 *    quel periodo: ora viene usata come ripiego;
 * 2. **la risposta.** Esisteva solo `applied`, un booleano, e la scheda
 *    atleta scriveva «Non applicato» in quattro situazioni diverse che si
 *    risolvono in tre posti diversi. Ora ogni esito ha una `reason`.
 */

const SEASON = { startDate: "2026-09-01", endDate: "2027-06-30" };

const planWith = (proration) =>
  normalizePaymentPlan({
    id: "plan-1",
    name: "Quota annuale",
    services: [
      { id: "s1", name: "Iscrizione", price: 600, included: true, optional: false },
    ],
    installmentSchedule: [
      { id: "i1", label: "Unico", amountType: "percentage", amount: 100, dueAfterDays: 0 },
    ],
    proration,
  });

// --- il periodo ---------------------------------------------------------------

test("un piano che dichiara il proprio periodo lo usa", () => {
  const plan = planWith({
    enabled: true,
    method: "days",
    seasonStartDate: "2026-09-01",
    seasonEndDate: "2027-06-30",
  });

  const result = calculateProratedTotal({
    total: 600,
    proration: plan.proration,
    startDate: "2027-01-15",
    fallbackPeriod: { startDate: "2000-01-01", endDate: "2000-12-31" },
  });

  assert.equal(result.reason, "applied");
  assert.equal(result.periodFromSeason, false);
  assert.equal(result.periodStart, "2026-09-01");
  assert.equal(result.total < 600, true);
});

test("senza periodo nel piano si usa quello della stagione attiva", () => {
  const plan = planWith({ enabled: true, method: "days" });

  const result = calculateProratedTotal({
    total: 600,
    proration: plan.proration,
    startDate: "2027-01-15",
    fallbackPeriod: SEASON,
  });

  assert.equal(
    result.applied,
    true,
    "era il caso in cui il pro-rata non si applicava mai",
  );
  assert.equal(result.reason, "applied");
  assert.equal(result.periodFromSeason, true);
  assert.equal(result.periodStart, "2026-09-01");
  assert.equal(result.periodEnd, "2027-06-30");
  assert.equal(result.adjusted, true);
});

test("senza periodo e senza stagione il pro-rata non si inventa un periodo", () => {
  const plan = planWith({ enabled: true, method: "days" });

  const result = calculateProratedTotal({
    total: 600,
    proration: plan.proration,
    startDate: "2027-01-15",
    fallbackPeriod: null,
  });

  assert.equal(result.applied, false);
  assert.equal(result.reason, "missing-period");
  assert.equal(result.total, 600, "il totale resta quello, non diventa zero");
  assert.match(result.warning, /periodo non e definito/);
});

test("manca la data di iscrizione: il messaggio dice quello, non il periodo", () => {
  const plan = planWith({ enabled: true, method: "days" });

  const result = calculateProratedTotal({
    total: 600,
    proration: plan.proration,
    startDate: "",
    fallbackPeriod: SEASON,
  });

  assert.equal(result.reason, "missing-period");
  assert.match(result.warning, /data di inizio iscrizione/);
});

// --- gli esiti ----------------------------------------------------------------

test("ogni esito ha una ragione distinta", () => {
  const at = (proration, startDate = "2027-01-15", extra = {}) =>
    calculateProratedTotal({
      total: 600,
      proration: planWith(proration).proration,
      startDate,
      fallbackPeriod: SEASON,
      ...extra,
    }).reason;

  assert.equal(at(null), "not-configured");
  assert.equal(at({ enabled: false }), "not-configured");
  assert.equal(at({ enabled: true, method: "boh" }), "no-method");
  assert.equal(at({ enabled: true, method: "days" }), "applied");
  assert.equal(
    at({ enabled: true, method: "days", allowManualOverride: true }, "2027-01-15", {
      manualOverride: 300,
    }),
    "manual",
  );

  assert.equal(
    calculateProratedTotal({
      total: 0,
      proration: planWith({ enabled: true, method: "days" }).proration,
      startDate: "2027-01-15",
      fallbackPeriod: SEASON,
    }).reason,
    "no-amount",
  );
});

test("un'iscrizione che copre tutto il periodo resta «applicato»", () => {
  const result = calculateProratedTotal({
    total: 600,
    proration: planWith({ enabled: true, method: "months" }).proration,
    startDate: "2026-09-01",
    fallbackPeriod: SEASON,
  });

  assert.equal(result.applied, true, "WP-33: applicato non vuol dire ridotto");
  assert.equal(result.adjusted, false);
  assert.equal(result.total, 600);
});

test("la descrizione distingue i quattro casi che dicevano tutti «non applicato»", () => {
  const describe = (proration, extra = {}) =>
    describeProrationResult(
      calculateProratedTotal({
        total: 600,
        proration: planWith(proration).proration,
        startDate: "2027-01-15",
        fallbackPeriod: SEASON,
        ...extra,
      }),
    );

  assert.equal(describe(null).label, "Non previsto dal piano");
  assert.equal(describe({ enabled: true, method: "boh" }).tone, "warning");
  assert.equal(describe({ enabled: true, method: "days" }).label, "Pro-rata applicato");
  assert.match(
    describe({ enabled: true, method: "days" }).detail,
    /periodo della stagione attiva/,
  );

  // Nessun piano scelto: non e un «non applicato», e un «non ancora valutato».
  assert.equal(describeProrationResult(null).label, "Da calcolare");
  assert.equal(describeProrationResult(undefined).tone, "neutral");
});

// --- il giro completo ----------------------------------------------------------

test("dalla scheda atleta il pro-rata arriva calcolato e spiegato", () => {
  const plan = {
    id: "plan-1",
    name: "Quota annuale",
    services: [
      { id: "s1", name: "Iscrizione", price: 600, included: true, optional: false },
    ],
    installmentSchedule: [
      { id: "i1", label: "Unico", amountType: "percentage", amount: 100, dueAfterDays: 0 },
    ],
    proration: { enabled: true, method: "days" },
  };

  const summary = calculateAthleteExpectedIncome({
    athlete: {
      id: "a1",
      selectedPlan: "plan-1",
      subscriptionStartDate: "2027-01-15",
    },
    athleteId: "a1",
    paymentPlans: [plan],
    seasonPeriod: SEASON,
  });

  assert.equal(summary.prorationResult.applied, true);
  assert.equal(summary.prorationResult.periodFromSeason, true);
  assert.equal(summary.grossAmount < 600, true);
  assert.equal(summary.expectedTotal, summary.grossAmount);

  const senzaStagione = calculateAthleteExpectedIncome({
    athlete: {
      id: "a1",
      selectedPlan: "plan-1",
      subscriptionStartDate: "2027-01-15",
    },
    athleteId: "a1",
    paymentPlans: [plan],
  });

  assert.equal(
    senzaStagione.grossAmount,
    600,
    "senza periodo si paga la quota intera: non si tira a indovinare",
  );
});

// --- la UI --------------------------------------------------------------------

const read = (relative) =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

test("nessuna schermata scrive piu «Non applicato» a mano", () => {
  for (const file of [
    "src/app/athletes/[id]/page.tsx",
    "src/components/payments/EnrollmentPaymentBreakdown.tsx",
  ]) {
    assert.equal(
      /"Non applicato"/.test(read(file)),
      false,
      `${file}: la ragione la decide describeProrationResult`,
    );
  }
});

test("la scheda atleta legge il periodo della stagione attiva", () => {
  const page = read("src/app/athletes/[id]/page.tsx");
  assert.match(page, /loadActiveSeasonPeriod\(effectiveClubId\)/);
  assert.match(page, /seasonPeriod: activeSeasonPeriod/);
  assert.equal(
    (page.match(/seasonPeriod: activeSeasonPeriod/g) || []).length,
    2,
    "vale sia per il riepilogo sia per la conferma del piano",
  );
});

test("il modulo del piano dice quale periodo verra usato", () => {
  const page = read("src/app/registration-management/page.tsx");
  assert.match(page, /fallbackPeriod: seasonPeriod/);
  assert.match(page, /periodo della stagione attiva/);
});
