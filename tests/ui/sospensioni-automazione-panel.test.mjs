import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * **Sospensioni/eccezioni raggiungibili dal pannello reale** (WP-15).
 */
const sorgente = readFileSync(
  new URL(
    "../../src/components/trainer/TrainingScheduleAutomationPanel.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("WP-15 · il pannello elenca e permette di aggiungere/togliere sospensioni", () => {
  assert.match(sorgente, /Sospensioni ed eccezioni/);
  assert.match(sorgente, /addExclusion/);
  assert.match(sorgente, /removeExclusion/);
  assert.match(sorgente, /settings\.exclusions/);
});
