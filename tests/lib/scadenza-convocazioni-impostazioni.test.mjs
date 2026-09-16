import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  DEFAULT_MATCH_CONVOCATION_DEADLINE_DAYS,
  getMatchConvocationDeadlineDays,
} from "../../src/lib/trainer-operational-alerts.ts";
import {
  DEFAULT_PREFERENCES,
  SETTINGS_SECTIONS,
  clampConvocationDeadlineDays,
  matchSettingsPayload,
  preferencesFrom,
  resolveSettingsSection,
} from "../../src/components/settings/v2/settings-model.ts";

/**
 * **La scadenza delle convocazioni: una regola del club, in Impostazioni.**
 *
 * Stava in fondo alla pagina Gare. Adesso vive in Impostazioni → Gare e
 * convocazioni, con la stessa chiave (`clubs.settings.matchConvocationDeadlineDays`),
 * lo stesso scrittore (`saveClubSettings`) e **una** lettura
 * (`getMatchConvocationDeadlineDays`), che e quella degli avvisi dell'allenatore.
 * Il default EasyGame e 4 giorni; un valore scritto — anche il vecchio 2 —
 * si conserva com'e: nessuna sovrascrittura massiva.
 */

test("il default EasyGame e 4 giorni, e vale solo quando il club non ha scelto", () => {
  assert.equal(DEFAULT_MATCH_CONVOCATION_DEADLINE_DAYS, 4);
  assert.equal(getMatchConvocationDeadlineDays({}), 4, "chiave assente → 4");
  assert.equal(getMatchConvocationDeadlineDays(null), 4);
  assert.equal(getMatchConvocationDeadlineDays({ matchConvocationDeadlineDays: "abc" }), 4, "valore non numerico → 4");
  assert.equal(getMatchConvocationDeadlineDays({ matchConvocationDeadlineDays: -3 }), 4, "negativo → 4");
});

test("un valore gia configurato si conserva: 2 resta 2, 0 resta 0, 30 resta 30", () => {
  assert.equal(getMatchConvocationDeadlineDays({ matchConvocationDeadlineDays: 2 }), 2);
  assert.equal(getMatchConvocationDeadlineDays({ matchConvocationDeadlineDays: 0 }), 0);
  assert.equal(getMatchConvocationDeadlineDays({ matchConvocationDeadlineDays: 30 }), 30);
  assert.equal(getMatchConvocationDeadlineDays({ matchConvocationDeadlineDays: 45 }), 30, "sopra il tetto → 30");
  assert.equal(getMatchConvocationDeadlineDays({ match_convocation_deadline_days: 7 }), 7, "la grafia storica si legge ancora");
});

test("le preferenze di /settings leggono la stessa autorita", () => {
  assert.equal(DEFAULT_PREFERENCES.matches.convocationDeadlineDays, 4);
  assert.equal(preferencesFrom({}).matches.convocationDeadlineDays, 4, "missing → 4");
  assert.equal(preferencesFrom({ matchConvocationDeadlineDays: 4 }).matches.convocationDeadlineDays, 4, "set 4 → reload → 4");
  assert.equal(preferencesFrom({ matchConvocationDeadlineDays: 9 }).matches.convocationDeadlineDays, 9, "set custom → reload → custom");
  assert.equal(preferencesFrom({ matchConvocationDeadlineDays: 2 }).matches.convocationDeadlineDays, 2, "existing explicit → preserved");
});

test("cio che si scrive e la chiave storica, nell'intervallo 0–30", () => {
  assert.deepEqual(matchSettingsPayload({ convocationDeadlineDays: 6 }), { matchConvocationDeadlineDays: 6 });
  assert.deepEqual(matchSettingsPayload({ convocationDeadlineDays: 99 }), { matchConvocationDeadlineDays: 30 });
  assert.deepEqual(matchSettingsPayload({ convocationDeadlineDays: -1 }), { matchConvocationDeadlineDays: 0 });
  assert.equal(clampConvocationDeadlineDays("abc"), 4);
  assert.equal(clampConvocationDeadlineDays("12.6"), 13);
  /* Il payload scrive **solo** la chiave della regola: nessun altro campo di settings viene toccato. */
  assert.deepEqual(Object.keys(matchSettingsPayload({ convocationDeadlineDays: 4 })), ["matchConvocationDeadlineDays"]);
});

test("la sezione «Gare e convocazioni» esiste e si raggiunge da ?tab=gare", () => {
  const sezione = SETTINGS_SECTIONS.find((item) => item.id === "gare");
  assert.ok(sezione);
  assert.equal(sezione.label, "Gare e convocazioni");
  assert.equal(resolveSettingsSection("gare"), "gare");
  assert.equal(resolveSettingsSection("convocazioni"), "gare");
  assert.equal(resolveSettingsSection(null), "notifiche");
});

test("la pagina Gare non scrive piu la regola e non ha un secondo default", () => {
  const radice = process.cwd();
  const gare = readFileSync(path.join(radice, "src/app/matches/page.tsx"), "utf8");
  assert.doesNotMatch(gare, /saveClubSettings/);
  assert.doesNotMatch(gare, /useState\(2\)/, "il default vive in un posto solo");
  assert.match(gare, /getMatchConvocationDeadlineDays/);
  const pannello = readFileSync(path.join(radice, "src/components/settings/v2/settings-sections.tsx"), "utf8");
  assert.match(pannello, /Scadenza convocazioni/);
  assert.match(pannello, /Definisci quanti giorni prima della gara devono essere inviate le convocazioni/);
  const alerts = readFileSync(path.join(radice, "src/lib/trainer-operational-alerts.ts"), "utf8");
  assert.equal((alerts.match(/DEFAULT_MATCH_CONVOCATION_DEADLINE_DAYS = \d+/g) || []).length, 1, "un default solo");
});
