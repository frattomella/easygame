import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * **"La modifica interessa X allenamenti futuri gia generati"** (WP-08),
 * cablato nella schermata reale — non solo nel backend.
 *
 * Test statico sulla sorgente (nessun renderer React in questa suite, come
 * gli altri test di `tests/ui/`): verifica che il pannello del programma
 * settimanale chiami davvero l'endpoint di impatto dopo l'autosave, e che
 * offra le due scelte del mandato ("solo alle nuove generazioni" /
 * "aggiorna anche i futuri non modificati").
 */
const sorgente = readFileSync(
  new URL(
    "../../src/components/dashboard/WeeklyTrainingSchedulePanel.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("WP-08 · dopo un salvataggio riuscito si controlla l'impatto sugli eventi futuri", () => {
  assert.match(sorgente, /checkScheduleImpact\(scheduleDiPrima, scheduleToSave\)/);
  assert.match(sorgente, /"\/api\/v1\/training-automation\/schedule-impact"/);
});

test("WP-08 · l'avviso offre le due scelte del mandato, non solo un OK", () => {
  assert.match(sorgente, /Applica solo alle nuove generazioni/);
  assert.match(sorgente, /Aggiorna\{" "\}/);
  assert.match(sorgente, /apply: true/);
});

test("WP-08 · non e una finestra bloccante a ogni digitazione", () => {
  // L'avviso vive in uno stato locale mostrato in pagina, non in un
  // window.confirm/alert che fermerebbe l'autosave a ogni carattere.
  const sezioneAvviso = sorgente.slice(
    sorgente.indexOf("scheduleImpact ?"),
    sorgente.indexOf("showAutomation &&"),
  );
  assert.doesNotMatch(sezioneAvviso, /window\.(confirm|alert)/);
});

test("il componente client non importa src/lib/server (CLAUDE.md §8)", () => {
  assert.doesNotMatch(sorgente, /from ["']@\/lib\/server\//);
});
