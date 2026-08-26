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
 * **Perche non si cronometra.** La versione precedente di questo file
 * misurava due tempi e ne faceva il rapporto. Falliva circa una volta su
 * cinque per due ragioni, e nessuna delle due era una regressione:
 *
 * 1. lo scenario piccolo dura frazioni di millisecondo, e a quella scala un
 *    passaggio del garbage collector o un altro processo sulla macchina
 *    valgono piu dell'algoritmo;
 * 2. il giro di riscaldamento girava sullo **stesso** array dello scenario
 *    piccolo, e l'indice delle presenze e memorizzato in una `WeakMap`
 *    legata a quell'array: il piccolo veniva cronometrato con l'indice gia
 *    costruito, il grande no. Il rapporto era truccato in partenza.
 *
 * Qui non si misura il tempo ma il **lavoro**: ogni riga di presenza conta
 * quante volte viene letta. E la grandezza che il difetto faceva esplodere, e
 * si conta allo stesso modo su qualsiasi macchina. Un'implementazione lineare
 * legge ogni riga un numero fisso di volte; quella con il `filter()` dentro
 * il ciclo la rilegge una volta per allenamento.
 */

/**
 * Letture per riga di presenza tollerate.
 *
 * Le implementazioni odierne ne fanno quattro (report) e tre (statistiche):
 * l'indice legge `training_id`, poi si leggono `athlete_id`, `id` e
 * `is_present`. Otto lascia margine a un campo in piu senza lasciar passare
 * un secondo giro sull'elenco, che di letture ne farebbe centoventi volte
 * tante.
 */
const MAX_READS_PER_RECORD = 8;

/** Raddoppiando gli atleti: lineare ~2x, quadratico ~4x o piu. */
const MAX_SCALING_RATIO = 2.5;

const TRAINING_COUNT = 120;

let reads = 0;

/**
 * Una riga di presenza che si conta quando viene letta.
 *
 * I campi sono getter e non valori: e l'unico modo di misurare il lavoro
 * senza chiedere al codice di dominio di collaborare, cioe senza mettere un
 * contatore dentro cio che si sta verificando.
 */
const attendanceRecord = ({ id, athleteId, trainingId }) => ({
  get id() {
    reads += 1;
    return id;
  },
  get athlete_id() {
    reads += 1;
    return athleteId;
  },
  get training_id() {
    reads += 1;
    return trainingId;
  },
  get is_present() {
    reads += 1;
    return true;
  },
});

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
    trainings.map((training) =>
      attendanceRecord({
        id: `${athlete.id}-${training.id}`,
        athleteId: athlete.id,
        trainingId: training.id,
      }),
    ),
  );

  return { athletes, trainings, attendanceRecords, categories };
};

/**
 * Le letture di un giro su uno scenario **nuovo**.
 *
 * Nuovo per forza: l'indice delle presenze vive in una `WeakMap` legata
 * all'array, e riusare lo scenario misurerebbe la memoria invece del calcolo.
 */
const readsOf = (run, athleteCount) => {
  const scenario = buildScenario(athleteCount);
  reads = 0;
  run(scenario);
  return { reads, records: scenario.attendanceRecords.length };
};

const runAttendanceReport = (scenario) =>
  calculateAttendanceReport({
    athletes: scenario.athletes,
    trainings: scenario.trainings,
    attendanceRecords: scenario.attendanceRecords,
    categories: scenario.categories,
    selectedCategoryId: "",
    period: "all",
  });

const runCategoryStats = (scenario) =>
  calculateCategoryAthleteStats(
    "cat-1",
    scenario.athletes,
    scenario.trainings,
    scenario.attendanceRecords,
    [],
    scenario.categories,
  );

const assertLinear = (run, message) => {
  const small = readsOf(run, 40);
  const large = readsOf(run, 80);

  const perRecord = large.reads / large.records;
  assert.ok(
    perRecord <= MAX_READS_PER_RECORD,
    `${message}: ogni riga di presenza viene letta ${perRecord.toFixed(1)} volte (massimo ${MAX_READS_PER_RECORD})`,
  );

  const ratio = large.reads / small.reads;
  assert.ok(
    ratio < MAX_SCALING_RATIO,
    `${message}: raddoppiando gli atleti le letture sono cresciute ${ratio.toFixed(2)}x`,
  );
};

test("il riepilogo presenze cresce con gli atleti, non con il loro quadrato", () => {
  assertLinear(runAttendanceReport, "e tornato un filtro dentro il ciclo");
});

test("le statistiche per categoria non rileggono le presenze per ogni atleta", () => {
  assertLinear(runCategoryStats, "era atleti x allenamenti x presenze");
});

test("l'indice non cambia il risultato", () => {
  const scenario = buildScenario(12);

  const report = runAttendanceReport(scenario);

  assert.equal(
    report.expectedAttendances,
    12 * TRAINING_COUNT,
    "ogni atleta e atteso a ogni allenamento della sua categoria",
  );
  assert.equal(report.presentAttendances, 12 * TRAINING_COUNT);
  assert.equal(report.absentAttendances, 0);

  const stats = runCategoryStats(scenario);

  assert.equal(stats.length, 12);
  assert.equal(stats[0].presences, TRAINING_COUNT);
});
