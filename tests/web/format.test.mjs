import assert from "node:assert/strict";
import test from "node:test";
import {
  MISSING,
  daysUntil,
  formatDateEyebrow,
  formatDateNumeric,
  formatDateShort,
  formatDaysLabel,
  formatInteger,
  formatMoney,
  formatPercent,
  formatTime,
  initialsOf,
  joinMeta,
  orMissing,
  parseDateInput,
} from "../../src/lib/web/format.ts";

/**
 * La formattazione del Web V2 (guideline 05 §5.3): mese corto italiano,
 * decimali italiani con il simbolo dopo, `—` per cio che manca.
 */

test("una data civile YYYY-MM-DD si legge come giorno locale, non come UTC", () => {
  const d = parseDateInput("2026-09-24");
  assert.ok(d);
  assert.equal(d.getDate(), 24);
  assert.equal(d.getMonth(), 8);
  assert.equal(formatDateShort("2026-09-24"), "24 set 2026");
  assert.equal(formatDateNumeric("2026-09-24"), "24/09/2026");
});

test("una data che manca e un trattino, mai una stringa vuota o «N/D»", () => {
  for (const value of [null, undefined, "", "non-una-data"]) {
    assert.equal(formatDateShort(value), MISSING);
    assert.equal(formatDateNumeric(value), MISSING);
    assert.equal(formatTime(value), MISSING);
  }
  assert.equal(orMissing("  "), MISSING);
  assert.equal(orMissing("Scauri"), "Scauri");
});

test("l'occhiello della Dashboard e il giorno per esteso in maiuscolo", () => {
  assert.equal(formatDateEyebrow("2026-09-10"), "GIOVEDÌ 10 SETTEMBRE 2026");
});

test("gli orari sono hh:mm anche da una stringa breve", () => {
  assert.equal(formatTime("17:30"), "17:30");
  assert.equal(formatTime("9:05:00"), "09:05");
});

test("il denaro e in decimali italiani con il simbolo dopo, mai nudo", () => {
  assert.equal(formatMoney(305), "305,00 €");
  assert.equal(formatMoney(1250.5), "1.250,50 €");
  assert.equal(formatMoney("18450"), "18.450,00 €");
  assert.equal(formatMoney(-42), "−42,00 €");
  assert.equal(formatMoney(42, { signed: true }), "+42,00 €");
  assert.equal(formatMoney(null), MISSING);
  assert.equal(formatMoney("abc"), MISSING);
});

test("interi e percentuali", () => {
  assert.equal(formatInteger(12400), "12.400");
  assert.equal(formatPercent(87), "87%");
  assert.equal(formatPercent(87.456, 1), "87,5%");
  assert.equal(formatPercent(undefined), MISSING);
});

test("i giorni alla scadenza contano i giorni civili", () => {
  const today = new Date(2026, 8, 10, 23, 30);
  assert.equal(daysUntil("2026-09-11", today), 1);
  assert.equal(daysUntil("2026-09-10", today), 0);
  assert.equal(daysUntil("2026-09-01", today), -9);
  assert.equal(daysUntil(null, today), null);
  assert.equal(formatDaysLabel(0), "OGGI");
  assert.equal(formatDaysLabel(1), "1 GIORNO");
  assert.equal(formatDaysLabel(4), "4 GIORNI");
});

test("iniziali e riga meta", () => {
  assert.equal(initialsOf("Marco Ferretti"), "MF");
  assert.equal(initialsOf("  anna  "), "A");
  assert.equal(initialsOf(null), "");
  assert.equal(joinMeta("14 mar 2011", null, "", MISSING, "Scauri"), "14 mar 2011 · Scauri");
});
