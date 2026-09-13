import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * **Categoria → sede → struttura consigliata, e l'avviso cross-site, sulle
 * superfici di creazione evento** (issue UAT).
 *
 * Nessun renderer React in questa suite (coerente con le altre prove
 * statiche di `tests/ui/`): la prova e sulla sorgente, e verifica che le
 * primitive pure di `src/lib/club-sites.ts` (`resolveRecommendedStructures`,
 * `isCrossSiteEvent`, gia provate in isolamento in
 * `tests/lib/struttura-consigliata-per-sede.test.mjs`) siano davvero
 * cablate nelle superfici che il mandato elenca, non solo disponibili.
 */
const read = (relative) =>
  readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8");

test("AddTrainingForm · usa resolveRecommendedStructures per ordinare/segnalare la struttura consigliata", () => {
  const sorgente = read("src/components/forms/AddTrainingForm.tsx");
  assert.match(sorgente, /resolveRecommendedStructures/);
  assert.match(sorgente, /Consigliata \(stessa sede\)/);
});

test("AddMatchForm · usa resolveRecommendedStructures per ordinare/segnalare la struttura consigliata", () => {
  const sorgente = read("src/components/forms/AddMatchForm.tsx");
  assert.match(sorgente, /resolveRecommendedStructures/);
  assert.match(sorgente, /Consigliata \(stessa sede\)/);
});

test("WeeklyTrainingSchedulePanel · usa resolveRecommendedStructures in entrambi i dialoghi (Aggiungi/Modifica)", () => {
  const sorgente = read("src/components/dashboard/WeeklyTrainingSchedulePanel.tsx");
  assert.match(sorgente, /structureRecommendationsForNewTraining/);
  assert.match(sorgente, /structureRecommendationsForEditingTraining/);
});

test("training/page.tsx · richiede conferma cross-site prima di salvare un allenamento", () => {
  const sorgente = read("src/app/training/page.tsx");
  assert.match(sorgente, /isCrossSiteEvent/);
  assert.match(sorgente, /La struttura appartiene a un'altra sede/);
});

test("matches/page.tsx · richiede conferma cross-site prima di salvare una gara, non per le trasferte", () => {
  const sorgente = read("src/app/matches/page.tsx");
  assert.match(sorgente, /isCrossSiteEvent/);
  assert.match(sorgente, /matchData\.venueMode !== "away"/);
});

test("WeeklyTrainingSchedulePanel · l'avviso cross-site in modifica scatta solo se la struttura e cambiata", () => {
  const sorgente = read("src/components/dashboard/WeeklyTrainingSchedulePanel.tsx");
  assert.match(sorgente, /editingOriginalStructureIdRef/);
  assert.match(
    sorgente,
    /normalizedEditingTraining\.structureId !==\s*\n?\s*editingOriginalStructureIdRef\.current/,
  );
});

test("nessuna delle superfici importa src/lib/server (CLAUDE.md §8)", () => {
  for (const file of [
    "src/components/forms/AddTrainingForm.tsx",
    "src/components/forms/AddMatchForm.tsx",
    "src/components/dashboard/WeeklyTrainingSchedulePanel.tsx",
  ]) {
    assert.doesNotMatch(read(file), /from ["']@\/lib\/server\//);
  }
});
