import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * **"Genera ora" mostra dettaglio, non solo un toast a una riga** (issue UAT
 * Fortitudo Scauri: "il campo «Palazzetto» non e disponibile in quel
 * giorno e a quell'ora" abortiva l'intero blocco senza dire quale fascia).
 *
 * Nessun renderer React in questa suite (coerente con
 * `training-schedule-automation-panel.test.mjs`): la prova e sulla sorgente.
 */
const sorgente = readFileSync(
  new URL(
    "../../src/components/trainer/TrainingScheduleAutomationPanel.tsx",
    import.meta.url,
  ),
  "utf8",
);

test('"Genera ora" legge generatedCount, non generatedTrainings.length, per il conteggio dei creati', () => {
  // `generatedTrainings` e la lista di candidate del planner, non le righe
  // scritte davvero: con `campoChiuso: "salta"` una candidata puo restare
  // esclusa. Il numero mostrato all'utente deve venire da `generatedCount`
  // (il conteggio reale lato server), non dalla lunghezza della lista.
  assert.doesNotMatch(sorgente, /generatedTrainings\.length/);
  assert.match(sorgente, /data\?\.generatedCount/);
});

test('"Genera ora" tiene il risultato a schermo (excludedSlots), non solo nel toast', () => {
  assert.match(sorgente, /excludedSlots/);
  assert.match(sorgente, /lastGenerationResult/);
  assert.match(sorgente, /setLastGenerationResult/);
});

test('il pannello mostra il motivo di ogni fascia esclusa (reason), non solo il conteggio', () => {
  assert.match(sorgente, /slot\.reason/);
  assert.match(sorgente, /Motivo:/);
});
