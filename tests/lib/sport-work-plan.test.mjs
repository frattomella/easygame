import assert from "node:assert/strict";
import test from "node:test";

import {
  computeAccruedAmount,
  generatePlanItems,
  planTotal,
  splitAmount,
  splitPlanByScheduledYear,
  summarizePlanProgress,
} from "../../src/lib/sport-work/plan.ts";
import {
  deriveInstallmentStatus,
  installmentRemaining,
} from "../../src/lib/sport-work/model.ts";

/**
 * Il piano compensi e le sue scadenze.
 *
 * Tre cose vanno dimostrate.
 *
 * 1. **La somma delle rate e l'importo pattuito, al centesimo.** Un piano che
 *    non torna al pattuito lascia a giugno un residuo che nessuno sa
 *    spiegare.
 * 2. **Una stagione attraversa due anni solari.** 12.000 euro di stagione
 *    2026/27 non sono 12.000 euro del 2026, e la schermata deve poterlo dire
 *    prima di erogare.
 * 3. **Programmato, maturato e pagato restano tre numeri.** Lo stato di una
 *    rata si deriva da loro e non si imposta.
 */

// --- rate uguali --------------------------------------------------------------

test("12.000 stagionali in 10 rate da 1.200, da settembre", () => {
  const items = generatePlanItems({
    kind: "EQUAL_INSTALMENTS",
    totalAmount: 12000,
    installmentCount: 10,
    firstDueDate: "2026-09-30",
  });

  assert.equal(items.length, 10);
  assert.equal(planTotal(items), 12000);
  assert.ok(items.every((item) => item.grossAmount === 1200));
  assert.equal(items[0].dueDate, "2026-09-30");
  assert.equal(items[3].dueDate, "2026-12-30");
  assert.equal(items[4].dueDate, "2027-01-30");
  assert.equal(items[9].dueDate, "2027-06-30");
  assert.equal(items[0].label, "Rata 1 di 10");
});

test("un totale non divisibile torna comunque al pattuito", () => {
  const items = generatePlanItems({
    kind: "EQUAL_INSTALMENTS",
    totalAmount: 1000,
    installmentCount: 3,
    firstDueDate: "2026-09-30",
  });

  assert.deepEqual(
    items.map((item) => item.grossAmount),
    [333.33, 333.33, 333.34],
  );
  assert.equal(planTotal(items), 1000);
});

test("il resto va sull'ultima rata, non distribuito a centesimi", () => {
  assert.deepEqual(splitAmount(100, 3), [33.33, 33.33, 33.34]);
  assert.deepEqual(splitAmount(5000, 1), [5000]);
  assert.deepEqual(splitAmount(0.05, 2), [0.02, 0.03]);
});

test("un compenso fisso e una rata sola", () => {
  const items = generatePlanItems({
    kind: "EQUAL_INSTALMENTS",
    totalAmount: 5000,
    installmentCount: 1,
    firstDueDate: "2026-10-31",
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].grossAmount, 5000);
});

test("il 31 gennaio piu un mese non diventa il 3 marzo", () => {
  const items = generatePlanItems({
    kind: "EQUAL_INSTALMENTS",
    totalAmount: 300,
    installmentCount: 3,
    firstDueDate: "2026-12-31",
  });

  assert.deepEqual(
    items.map((item) => item.dueDate),
    ["2026-12-31", "2027-01-31", "2027-02-28"],
  );
});

// --- mensilita ----------------------------------------------------------------

test("900 euro al mese da settembre a giugno sono dieci mensilita", () => {
  const items = generatePlanItems({
    kind: "MONTHLY",
    monthlyAmount: 900,
    startMonth: "2026-09",
    endMonth: "2027-06",
  });

  assert.equal(items.length, 10);
  assert.equal(planTotal(items), 9000);
  assert.equal(items[0].label, "settembre 2026");
  assert.equal(items[0].dueDate, "2026-09-30");
  assert.equal(items[5].label, "febbraio 2027");
  assert.equal(items[5].dueDate, "2027-02-28");
  assert.equal(items[9].label, "giugno 2027");
});

test("il giorno di scadenza si puo scegliere e non sfora il mese", () => {
  const items = generatePlanItems({
    kind: "MONTHLY",
    monthlyAmount: 500,
    startMonth: "2027-01",
    endMonth: "2027-02",
    dueDayOfMonth: 31,
  });

  assert.deepEqual(
    items.map((item) => item.dueDate),
    ["2027-01-31", "2027-02-28"],
  );
});

test("il periodo di competenza di una mensilita e il mese intero", () => {
  const [settembre] = generatePlanItems({
    kind: "MONTHLY",
    monthlyAmount: 900,
    startMonth: "2026-09",
    endMonth: "2026-09",
  });

  assert.equal(settembre.accrualPeriodStart, "2026-09-01");
  assert.equal(settembre.accrualPeriodEnd, "2026-09-30");
});

// --- rate personalizzate ------------------------------------------------------

test("le rate personalizzate mantengono importi e date dichiarati", () => {
  const items = generatePlanItems({
    kind: "CUSTOM",
    items: [
      { label: "Acconto", grossAmount: 2000, dueDate: "2026-09-15" },
      { label: "Saldo", grossAmount: 3000, dueDate: "2027-05-31" },
    ],
  });

  assert.equal(planTotal(items), 5000);
  assert.equal(items[0].label, "Acconto");
  assert.equal(items[1].dueDate, "2027-05-31");
  assert.equal(items[1].scheduledYear, 2027);
});

// --- input rifiutati -----------------------------------------------------------

test("un piano senza importo o senza rate non nasce", () => {
  assert.throws(
    () =>
      generatePlanItems({
        kind: "EQUAL_INSTALMENTS",
        totalAmount: 0,
        installmentCount: 3,
        firstDueDate: "2026-09-30",
      }),
    /maggiore di zero/,
  );

  assert.throws(
    () =>
      generatePlanItems({
        kind: "EQUAL_INSTALMENTS",
        totalAmount: 1000,
        installmentCount: 0,
        firstDueDate: "2026-09-30",
      }),
    /almeno 1/,
  );

  assert.throws(
    () => generatePlanItems({ kind: "CUSTOM", items: [] }),
    /almeno una rata/,
  );
});

test("un piano non puo generare centinaia di rate per un errore di battitura", () => {
  assert.throws(
    () =>
      generatePlanItems({
        kind: "EQUAL_INSTALMENTS",
        totalAmount: 1000,
        installmentCount: 600,
        firstDueDate: "2026-09-30",
      }),
    /non puo superare 60/,
  );

  assert.throws(
    () =>
      generatePlanItems({
        kind: "MONTHLY",
        monthlyAmount: 100,
        startMonth: "2026-01",
        endMonth: "2036-01",
      }),
    /60 mensilita/,
  );
});

test("un mese finale che precede quello iniziale non passa", () => {
  assert.throws(
    () =>
      generatePlanItems({
        kind: "MONTHLY",
        monthlyAmount: 100,
        startMonth: "2027-06",
        endMonth: "2026-09",
      }),
    /precede/,
  );
});

// --- anno solare vs stagione ---------------------------------------------------

test("una stagione 2026/27 ricade su due anni solari, e il piano lo dice", () => {
  const items = generatePlanItems({
    kind: "EQUAL_INSTALMENTS",
    totalAmount: 12000,
    installmentCount: 10,
    firstDueDate: "2026-09-30",
  });

  const perAnno = splitPlanByScheduledYear(items);

  assert.equal(perAnno.length, 2);
  assert.deepEqual(perAnno[0], { year: 2026, total: 4800, count: 4 });
  assert.deepEqual(perAnno[1], { year: 2027, total: 7200, count: 6 });
  assert.equal(perAnno[0].total + perAnno[1].total, 12000);
});

// --- maturazione ---------------------------------------------------------------

test("una rata matura quando il periodo di competenza e trascorso", () => {
  const maturata = computeAccruedAmount({
    grossAmount: 1200,
    accrualPeriodEnd: "2026-09-30",
    relationshipActiveThroughPeriod: true,
    now: new Date("2026-10-01T00:00:00Z"),
  });
  assert.equal(maturata, 1200);

  const nonAncora = computeAccruedAmount({
    grossAmount: 1200,
    accrualPeriodEnd: "2026-10-31",
    relationshipActiveThroughPeriod: true,
    now: new Date("2026-10-01T00:00:00Z"),
  });
  assert.equal(nonAncora, 0);
});

test("la maturazione e idempotente: rieseguirla non accumula", () => {
  const input = {
    grossAmount: 1200,
    accrualPeriodEnd: "2026-09-30",
    relationshipActiveThroughPeriod: true,
    now: new Date("2026-12-01T00:00:00Z"),
  };
  assert.equal(computeAccruedAmount(input), computeAccruedAmount(input));
  assert.equal(computeAccruedAmount(input), 1200);
});

test("un rapporto non attivo per tutto il periodo non fa maturare da solo", () => {
  assert.equal(
    computeAccruedAmount({
      grossAmount: 1200,
      accrualPeriodEnd: "2026-09-30",
      relationshipActiveThroughPeriod: false,
      now: new Date("2026-12-01T00:00:00Z"),
    }),
    0,
  );
});

test("una rata annullata non matura", () => {
  assert.equal(
    computeAccruedAmount({
      grossAmount: 1200,
      accrualPeriodEnd: "2026-09-30",
      cancelled: true,
      relationshipActiveThroughPeriod: true,
      now: new Date("2026-12-01T00:00:00Z"),
    }),
    0,
  );
});

// --- stato derivato ------------------------------------------------------------

const stato = (overrides) =>
  deriveInstallmentStatus({
    grossAmount: 1200,
    accruedAmount: 0,
    paidAmount: 0,
    dueDate: "2026-09-30",
    now: new Date("2026-09-15T00:00:00Z"),
    ...overrides,
  });

test("lo stato di una rata si deriva, non si imposta", () => {
  assert.equal(stato({}), "SCHEDULED");
  assert.equal(stato({ accruedAmount: 1200 }), "ACCRUED");
  assert.equal(stato({ paidAmount: 500 }), "PARTIALLY_PAID");
  assert.equal(stato({ paidAmount: 1200 }), "PAID");
  assert.equal(
    stato({ now: new Date("2026-10-01T00:00:00Z") }),
    "OVERDUE",
  );
  assert.equal(stato({ cancelled: true, paidAmount: 1200 }), "CANCELLED");
});

test("una rata saldata resta erogata anche a data superata", () => {
  assert.equal(
    stato({ paidAmount: 1200, now: new Date("2027-01-01T00:00:00Z") }),
    "PAID",
  );
});

test("maturata e scaduta non sono la stessa cosa", () => {
  const maturataNonScaduta = deriveInstallmentStatus({
    grossAmount: 1200,
    accruedAmount: 1200,
    paidAmount: 0,
    dueDate: "2026-10-31",
    now: new Date("2026-10-05T00:00:00Z"),
  });
  const scaduta = deriveInstallmentStatus({
    grossAmount: 1200,
    accruedAmount: 1200,
    paidAmount: 0,
    dueDate: "2026-09-30",
    now: new Date("2026-10-05T00:00:00Z"),
  });

  assert.equal(maturataNonScaduta, "ACCRUED");
  assert.equal(scaduta, "OVERDUE");
});

test("il residuo non e mai negativo", () => {
  assert.equal(installmentRemaining(1200, 1500), 0);
  assert.equal(installmentRemaining(1200, 500), 700);
});

// --- i tre numeri ---------------------------------------------------------------

test("programmato, maturato e pagato restano tre numeri distinti", () => {
  const progress = summarizePlanProgress([
    { gross_amount: 1200, accrued_amount: 1200, paid_amount: 1200, status: "PAID" },
    { gross_amount: 1200, accrued_amount: 1200, paid_amount: 500, status: "PARTIALLY_PAID" },
    { gross_amount: 1200, accrued_amount: 1200, paid_amount: 0, status: "OVERDUE" },
    { gross_amount: 1200, accrued_amount: 0, paid_amount: 0, status: "SCHEDULED" },
    { gross_amount: 1200, accrued_amount: 0, paid_amount: 0, status: "CANCELLED" },
  ]);

  assert.equal(progress.scheduled, 4800);
  assert.equal(progress.accrued, 3600);
  assert.equal(progress.paid, 1700);
  assert.equal(progress.remaining, 3100);
  assert.equal(progress.accruedUnpaid, 1900);
});
