import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  describeScheduleMismatch,
  reconcileInstallmentTotal,
} from "../../src/lib/payments/installment-ledger.ts";
import {
  generateInstallmentPreview,
  generateMonthlyDueDates,
} from "../../src/lib/payment-plan-utils.ts";

/**
 * MASTER BATCH — Wave D (Payment Plans V2).
 *
 * Il sistema esisteva gia maturo: servizi -> pro-rata -> sconto -> rate era
 * gia l'ordine reale (`calculateAthleteExpectedIncome`), il template era
 * gia distinto dalla schedule materializzata, le rate pagate erano gia
 * immutabili (`isPaymentPaidLike`). Il gap reale era la riconciliazione:
 * esisteva solo come avviso lato client all'editor del template, mai
 * rivalutata al momento in cui lo scrittore materializza le rate
 * sull'atleta.
 */

test("44/45: 545 in unica soluzione e 140+205+200 riconciliano esattamente", () => {
  assert.equal(reconcileInstallmentTotal({ expectedTotalAmount: 545, installmentAmounts: [545] }).ok, true);
  assert.equal(
    reconcileInstallmentTotal({ expectedTotalAmount: 545, installmentAmounts: [140, 205, 200] }).ok,
    true,
  );
});

test("46: 190 + 8x50 = 590 riconcilia", () => {
  const rate = [190, ...Array(8).fill(50)];
  assert.equal(reconcileInstallmentTotal({ expectedTotalAmount: 590, installmentAmounts: rate }).ok, true);
});

test("51: la somma delle rate automatiche torna esatta anche con centesimi che non dividono", () => {
  // 100 / 3 non e esatto in virgola mobile: la somma deve tornare 100.00 comunque.
  const preview = generateInstallmentPreview(
    { installmentSchedule: [
      { id: "r1", amountType: "percentage", amount: 33.34, dueAfterDays: 0 },
      { id: "r2", amountType: "percentage", amount: 33.33, dueAfterDays: 30 },
      { id: "r3", amountType: "remaining", amount: 0, dueAfterDays: 60 },
    ] },
    100,
    {},
  );
  const somma = preview.installments.reduce((acc, r) => acc + r.amount, 0);
  assert.ok(Math.abs(somma - 100) < 0.01, `somma attesa 100, ottenuta ${somma}`);
  assert.equal(preview.warnings.length, 0);
});

test("55: un piano sotto-pianificato non riconcilia — differenza positiva, mancano soldi", () => {
  const esito = reconcileInstallmentTotal({ expectedTotalAmount: 545, installmentAmounts: [140, 205, 150] });
  assert.equal(esito.ok, false);
  assert.equal(esito.differenceCents, 5000);
  assert.match(describeScheduleMismatch(esito), /ATTENZIONE: il piano lascia €50,00 non pianificati\./);
});

test("56: un piano sopra-pianificato non riconcilia — differenza negativa, il piano supera il dovuto", () => {
  const esito = reconcileInstallmentTotal({ expectedTotalAmount: 545, installmentAmounts: [545, 50] });
  assert.equal(esito.ok, false);
  assert.match(describeScheduleMismatch(esito), /ATTENZIONE: il piano supera di €50,00 il totale dovuto\./);
});

test("57: uno scarto di un centesimo resta accettato (arrotondamento, non un errore)", () => {
  assert.equal(reconcileInstallmentTotal({ expectedTotalAmount: 100, installmentAmounts: [99.99] }).ok, true);
  assert.equal(reconcileInstallmentTotal({ expectedTotalAmount: 100, installmentAmounts: [99.98] }).ok, false);
});

test("58: il writer che materializza le rate rifiuta prima di scrivere qualunque riga", () => {
  const source = readFileSync("src/lib/simplified-db.ts", "utf8");
  assert.match(source, /expectedTotalAmount: number;/);
  assert.match(
    source,
    /if \(installments\.length > 0\) \{\s*\n\s*const riconciliazione = reconcileInstallmentTotal\(/,
  );
  assert.match(source, /throw new Error\(describeScheduleMismatch\(riconciliazione\)\);/);
  // Il vaglio precede il ciclo che cancella/scrive le rate esistenti (dentro questa funzione, non nel file intero).
  const inizioFunzione = source.indexOf("export async function syncAthleteEnrollmentInstallmentPayments(");
  const corpo = source.slice(inizioFunzione);
  const idxVaglio = corpo.indexOf("throw new Error(describeScheduleMismatch(riconciliazione));");
  const idxScrittura = corpo.indexOf('.update({');
  assert.ok(idxVaglio > 0 && idxScrittura > 0 && idxVaglio < idxScrittura, "il vaglio deve precedere ogni scrittura");
});

test("D9: una data esatta sulla rata vince sulla scadenza a giorni", () => {
  const preview = generateInstallmentPreview(
    {
      installmentSchedule: [
        { id: "iscrizione", amountType: "fixed", amount: 140, dueAfterDays: 0, dueDate: null },
        { id: "rata1", amountType: "fixed", amount: 205, dueAfterDays: 15, dueDate: "2026-10-15" },
        { id: "saldo", amountType: "remaining", amount: 0, dueAfterDays: 45, dueDate: "2027-01-15" },
      ],
    },
    545,
    { startDate: "2026-09-01" },
  );
  const byId = Object.fromEntries(preview.installments.map((r) => [r.id, r]));
  assert.equal(byId.iscrizione.dueDate, "2026-09-01", "senza data esatta, vale l'offset dalla data di inizio");
  assert.equal(byId.rata1.dueDate, "2026-10-15", "la data esatta scritta sul piano non viene sovrascritta");
  assert.equal(byId.saldo.dueDate, "2027-01-15");
});

test("D10: preset mensile — 01/10, 01/11, 01/12… (la prima e la data di inizio, non un mese dopo)", () => {
  const date = generateMonthlyDueDates({ startDate: "2026-10-01", dayOfMonth: 1, count: 8 });
  assert.deepEqual(date.slice(0, 4), ["2026-10-01", "2026-11-01", "2026-12-01", "2027-01-01"]);
  assert.equal(date.length, 8);
  assert.equal(date[7], "2027-05-01");
});

test("D10: il giorno 31 si chiude dentro il mese che c'e (mesi corti, febbraio)", () => {
  const date = generateMonthlyDueDates({ startDate: "2026-01-31", dayOfMonth: 31, count: 4 });
  assert.deepEqual(date, ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
});

test("D10: un anno bisestile porta febbraio al 29, non al 28", () => {
  const date = generateMonthlyDueDates({ startDate: "2028-01-31", dayOfMonth: 31, count: 2 });
  assert.deepEqual(date, ["2028-01-31", "2028-02-29"]);
});

test("D10 (revisione ostile Wave F, Reviewer D): una serie di oltre 12 mesi attraversa piu di un capodanno senza saltare", () => {
  // 24 rate da giugno 2026: due capodanni, non uno.
  const date = generateMonthlyDueDates({ startDate: "2026-06-15", dayOfMonth: 15, count: 24 });
  assert.equal(date.length, 24);
  assert.equal(date[0], "2026-06-15");
  assert.equal(date[6], "2026-12-15");
  assert.equal(date[7], "2027-01-15", "il primo capodanno non deve saltare un mese");
  assert.equal(date[18], "2027-12-15");
  assert.equal(date[19], "2028-01-15", "il secondo capodanno non deve saltare un mese");
  assert.equal(date[23], "2028-05-15");
});

/**
 * D16/D17 — gia esistenti, verificati come regressione: template e schedule
 * materializzata restano due cose, una rata pagata resta immutabile.
 */
test("D16/D17: template vs schedule materializzata, rata pagata immutabile — regressione", () => {
  const route = readFileSync("src/app/api/athlete-payments/[paymentId]/route.ts", "utf8");
  assert.match(route, /isPaymentPaidLike\(fresh\)/);
  assert.match(route, /I pagamenti gia pagati non possono essere modificati/);
});

/**
 * D19 — l'audit del piano/sconto usa lo stesso meccanismo generico gia
 * cablato per le rate, non un nuovo scrittore.
 */
test("D19: payment_plans e discounts sono risorse auditate", () => {
  const source = readFileSync("src/lib/server/audit.ts", "utf8");
  assert.match(source, /"payment_plans",/);
  assert.match(source, /"discounts",/);
});
