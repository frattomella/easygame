import { test } from "node:test";
import assert from "node:assert/strict";

import {
  formatOpeningHourSlots,
  normalizeOpeningHours,
} from "../client/lib/opening-hours";

test("stringa libera con fasce -> un giorno generico", () => {
  const days = normalizeOpeningHours("9:00-13:00, 15:00-19:00");
  assert.equal(days.length, 1);
  assert.equal(days[0].key, "general");
  assert.equal(formatOpeningHourSlots(days[0]), "09:00-13:00 / 15:00-19:00");
});

test("oggetto per giorno con alias italiani -> chiavi normalizzate in inglese", () => {
  const days = normalizeOpeningHours({
    lunedi: { start: "9:00", end: "18:00" },
    domenica: "chiuso",
  });
  const monday = days.find((d) => d.key === "monday");
  const sunday = days.find((d) => d.key === "sunday");
  assert.ok(monday);
  assert.equal(monday?.closed, false);
  assert.equal(formatOpeningHourSlots(monday!), "09:00-18:00");
  assert.ok(sunday);
  assert.equal(sunday?.closed, true);
  assert.equal(formatOpeningHourSlots(sunday!), "Chiuso");
});

test("giorno con mattina/pomeriggio -> due fasce etichettate", () => {
  const days = normalizeOpeningHours({
    monday: {
      morning: { start: "9:00", end: "13:00" },
      afternoon: { start: "15:00", end: "19:00" },
    },
  });
  const monday = days.find((d) => d.key === "monday");
  assert.ok(monday);
  assert.equal(
    formatOpeningHourSlots(monday!),
    "Mattina: 09:00-13:00 / Pomeriggio: 15:00-19:00",
  );
});

test("nessun orario configurato -> elenco vuoto, mai inventato", () => {
  assert.deepEqual(normalizeOpeningHours(null), []);
  assert.deepEqual(normalizeOpeningHours(undefined), []);
  assert.deepEqual(normalizeOpeningHours(""), []);
});

test("array con un solo elemento viene spacchettato", () => {
  const days = normalizeOpeningHours([{ monday: "09:00-18:00" }]);
  const monday = days.find((d) => d.key === "monday");
  assert.ok(monday);
  assert.equal(formatOpeningHourSlots(monday!), "09:00-18:00");
});

test("le chiavi che non sono giorni (id, date, name) non diventano righe di orario e i giorni escono in ordine di settimana", () => {
  const days = normalizeOpeningHours({
    id: "oh-1",
    name: "Segreteria",
    date: "2026-09-01",
    venerdi: { closed: true },
    lunedi: { mattina: { start: "09:00", end: "12:00" } },
  });
  assert.deepEqual(
    days.map((day) => day.label),
    ["Lunedì", "Venerdì"],
  );
});
