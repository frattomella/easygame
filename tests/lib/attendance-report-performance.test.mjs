import assert from "node:assert/strict";
import test from "node:test";

import { calculateAttendanceReport } from "../../src/lib/club-report-utils.ts";
import { calculateCategoryAthleteStats } from "../../src/lib/category-athlete-stats.ts";

/**
 * I report scorrono le presenze una volta, non una volta per allenamento.
 *
 * **Il difetto misurato.** Sia `club-report-utils` sia
 * `category-athlete-stats` risolvevano «le presenze di questo allenamento»
 * con un `filter()` sull'intero elenco delle presenze del club, **dentro** un
 * ciclo sugli allenamenti — e in un caso dentro un ciclo sugli atleti dentro
 * un ciclo sugli allenamenti. Con duemila atleti l'elenco misurato da
 * `scripts/measure-web-v1-performance.mjs` e di centoventottomila righe: il
 * report chiedeva al browser centinaia di milioni di confronti per disegnare
 * una tabella.
 *
 * Non e un benchmark e non fissa millisecondi: misura il **rapporto** fra due
 * scenari, uno doppio dell'altro. Lineare raddoppia, quadratico quadruplica,
 * e la soglia sta in mezzo con margine. E la stessa forma di
 * `multisite-performance`, per la stessa ragione: una soglia assoluta su una
 * macchina carica e rumore.
 */

/** Raddoppiando l'ingresso: lineare ~2x, quadratico ~4x. */
const MAX_SCALING_RATIO = 3;

const TRAINING_COUNT = 120;

const buildScenario = (athleteCount) => {
  const categories = [{ id: "cat-1", name: "Under 14" }];

  const athletes = Array.from({ length: athleteCount }, (_, index) => ({
    id: `athlete-${index}`,
    first_name: `Nome${index}`,
    last_name: `Cognome${String(index).padStart(4, "0")}`,
    category_id: "cat-1",
    category_name: "Under 14",
  }));

  const trainings = Array.from({ length: TRAINING_COUNT }, (_, index) => ({
    id: `training-${index}`,
    date: new Date(2026, index % 12, 1 + (index % 27)).toISOString(),
    category_id: "cat-1",
    category_name: "Under 14",
  }));

  const attendanceRecords = athletes.flatMap((athlete) =>
    trainings.map((training) => ({
      id: `${athlete.id}-${training.id}`,
      athlete_id: athlete.id,
      training_id: training.id,
      is_present: true,
    })),
  );

  return { athletes, trainings, attendanceRecords, categories };
};

const timeOf = (run) => {
  const started = process.hrtime.bigint();
  run();
  return Number(process.hrtime.bigint() - started) / 1e6;
};

const ratioOf = (run) => {
  const small = buildScenario(40);
  const large = buildScenario(80);

  // Un giro a vuoto: la prima esecuzione paga la compilazione, non l'algoritmo.
  run(small);

  const smallMs = Math.max(timeOf(() => run(small)), 0.05);
  const largeMs = timeOf(() => run(large));

  return largeMs / smallMs;
};

test("il riepilogo presenze cresce con gli atleti, non con il loro quadrato", () => {
  const ratio = ratioOf((scenario) =>
    calculateAttendanceReport({
      athletes: scenario.athletes,
      trainings: scenario.trainings,
      attendanceRecords: scenario.attendanceRecords,
      categories: scenario.categories,
      selectedCategoryId: "",
      period: "all",
    }),
  );

  assert.ok(
    ratio < MAX_SCALING_RATIO,
    `raddoppiando gli atleti il tempo e cresciuto ${ratio.toFixed(1)}x: e tornato un filtro dentro il ciclo`,
  );
});

test("le statistiche per categoria non rileggono le presenze per ogni atleta", () => {
  const ratio = ratioOf((scenario) =>
    calculateCategoryAthleteStats(
      "cat-1",
      scenario.athletes,
      scenario.trainings,
      scenario.attendanceRecords,
      [],
      scenario.categories,
    ),
  );

  assert.ok(
    ratio < MAX_SCALING_RATIO,
    `raddoppiando gli atleti il tempo e cresciuto ${ratio.toFixed(1)}x: era atleti x allenamenti x presenze`,
  );
});

test("l'indice non cambia il risultato", () => {
  const scenario = buildScenario(12);

  const report = calculateAttendanceReport({
    athletes: scenario.athletes,
    trainings: scenario.trainings,
    attendanceRecords: scenario.attendanceRecords,
    categories: scenario.categories,
    selectedCategoryId: "",
    period: "all",
  });

  assert.equal(
    report.expectedAttendances,
    12 * TRAINING_COUNT,
    "ogni atleta e atteso a ogni allenamento della sua categoria",
  );
  assert.equal(report.presentAttendances, 12 * TRAINING_COUNT);
  assert.equal(report.absentAttendances, 0);

  const stats = calculateCategoryAthleteStats(
    "cat-1",
    scenario.athletes,
    scenario.trainings,
    scenario.attendanceRecords,
    [],
    scenario.categories,
  );

  assert.equal(stats.length, 12);
  assert.equal(stats[0].presences, TRAINING_COUNT);
});
