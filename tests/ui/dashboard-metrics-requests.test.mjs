import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Quante volte la dashboard legge l'archivio atleti.
 *
 * Misurato su staging con un club da 212 atleti: la scheda delle metriche
 * apriva **due** letture su `simplified_athletes`, e la seconda —
 * `all-athletes-<club>` — non veniva usata da nessuna riga del componente.
 * 226 KB di JSON scaricati e scartati a ogni apertura.
 *
 * Un test che conta le chiamate e piu utile di uno che ne verifica una: una
 * query morta non rompe niente, e per questo puo restare per mesi.
 */

const source = readFileSync(
  path.join(process.cwd(), "src/components/dashboard/MetricsOverview.tsx"),
  "utf8",
);

test("la scheda metriche legge gli atleti una volta sola", () => {
  const reads = source.match(/\.from\("simplified_athletes"\)/g) || [];

  assert.equal(
    reads.length,
    1,
    `la dashboard deve leggere gli atleti una volta sola, trovate ${reads.length} letture`,
  );
  assert.equal(
    /all-athletes-\$\{orgId\}/.test(source),
    false,
    "la query «all-athletes» era morta: nessuna riga ne usava il risultato",
  );
});

/**
 * E il totale continua a venire dallo stesso posto da cui veniva prima: la
 * correzione toglie una lettura, non cambia il numero mostrato.
 */
test("il totale atleti si ricava dalla lettura rimasta", () => {
  assert.match(source, /const activeAthletes = \(athletesData\?\.data \|\| \[\]\)/);
  assert.match(source, /totalAthletes: activeAthletes\.length,/);
});
