import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * **"Genera fino a..." e l'anteprima nel pannello reale** (WP-03, WP-16,
 * WP-17).
 *
 * Non c'e un renderer React in questa suite (nessuna dipendenza jsdom/
 * testing-library, coerente con `tests/ui/multisite-ux.test.mjs` e gli altri
 * test statici di questa cartella): la prova e sulla sorgente, e verifica
 * che la UI reale — non solo il backend — sia cablata alla stessa rotta
 * canonica, con gli stessi campi che il backend restituisce.
 */
const sorgente = readFileSync(
  new URL(
    "../../src/components/trainer/TrainingScheduleAutomationPanel.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("WP-16 · i preset della finestra automatica sono 7/14/21/30/60, nessun secondo interruttore di disattivazione", () => {
  assert.match(sorgente, /GENERATE_DAYS_AHEAD_PRESETS\s*=\s*\[7,\s*14,\s*21,\s*30,\s*60\]/);
  // La disattivazione resta l'interruttore "Automazione attiva" gia esistente:
  // nessuna voce "disattivata" duplicata nel preset dei giorni.
  assert.doesNotMatch(sorgente, /disattivat[ao].*<option/is);
});

test("WP-16 · «Allenamenti generati fino al» legge settings.generatedUntil, non uno stato calcolato a parte", () => {
  assert.match(sorgente, /Allenamenti generati fino al/);
  assert.match(sorgente, /settings\.generatedUntil/);
});

test("WP-03/WP-17 · «Genera fino a...» e l'anteprima passano dalla stessa rotta canonica, con preview a distinguerle", () => {
  assert.match(sorgente, /"\/api\/v1\/training-automation"/);
  assert.match(sorgente, /untilDate,\s*\n\s*preview: mode === "preview"/);
  // Un solo posto chiama l'endpoint per "genera fino a": niente secondo
  // generatore lato client.
  const occorrenzeEndpoint = (
    sorgente.match(/\/api\/v1\/training-automation/g) || []
  ).length;
  assert.ok(
    occorrenzeEndpoint <= 2,
    "l'endpoint canonico compare al massimo per «Genera ora» e per «Genera fino a...»",
  );
});

test("WP-17 · il riepilogo mostra creati/esistenti/conflitti/esclusi, non solo il totale", () => {
  assert.match(sorgente, /preview\.generatedCount/);
  assert.match(sorgente, /preview\.existingCount/);
  assert.match(sorgente, /preview\.conflicts\.length/);
  assert.match(sorgente, /preview\.excludedCount/);
});

test("il componente client non importa src/lib/server (CLAUDE.md §8)", () => {
  assert.doesNotMatch(sorgente, /from ["']@\/lib\/server\//);
});
