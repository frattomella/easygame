import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * **Il toggle "Regola attiva" e raggiungibile dalla schermata reale** (WP-14).
 */
const sorgente = readFileSync(
  new URL(
    "../../src/components/dashboard/WeeklyTrainingSchedulePanel.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("WP-14 · il dialog di modifica ha un interruttore per attivare/disattivare la regola", () => {
  assert.match(sorgente, /Regola attiva/);
  assert.match(sorgente, /checked=\{editingTraining\.active !== false\}/);
});

test("WP-14 · una regola disattivata e segnalata visivamente nell'elenco", () => {
  assert.match(sorgente, /Disattivato/);
  assert.match(sorgente, /item\.active === false/);
});
