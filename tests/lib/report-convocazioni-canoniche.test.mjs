import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateCategoryReport,
  calculateMatchConvocationReport,
} from "../../src/lib/club-report-utils.ts";
import { calculateCategoryAthleteStats } from "../../src/lib/category-athlete-stats.ts";
import { buildClubCategoryOptions } from "../../src/lib/category-utils.ts";
import { attachParticipationToEvents } from "../../src/lib/trainer-operational-alerts.ts";

/**
 * **I report contavano le convocazioni su un payload che nessuno scrive piu**
 * (`D-AUD-9`).
 *
 * Dopo ADR-0099 la rosa e `club_event_participants.convocation_status`, con il
 * suo scrittore (`saveEventConvocations`), il suo permesso e la sua notifica.
 * `getConvocatedAthleteIdsFromMatch` cerca invece **quattordici grafie** dentro
 * la gara — `convocatedAthletes`, `calledAthletes`, `selectedAthleteIds`… — e
 * nessuna di quelle la scrive piu nessuno.
 *
 * Il numero che ne usciva non era approssimato: era **zero**, su ogni gara, per
 * sempre. Misurato end-to-end da
 * `scripts/audit-finale-report-canonici-probe.mjs`, che convoca dalla rotta
 * canonica e poi rilegge cio che la pagina `/reports` rilegge. P0-6 aveva
 * corretto le due schermate operative; il rendiconto — che e la superficie da
 * cui il numero esce verso un ente — no.
 *
 * **E il rendiconto vuole «chi», non solo «quanti».** Una somma non dice se lo
 * stesso ragazzo e stato convocato dieci volte o se dieci ragazzi lo sono stati
 * una volta ciascuno, e un contributo per la partecipazione misura esattamente
 * quella differenza.
 */

const CAT = "cat-u12";
const GARA = "evt-gara-1";
const GARA_ANNULLATA = "evt-gara-2";
const ALLENAMENTO = "evt-all-1";

const categorie = buildClubCategoryOptions({
  clubCategories: [{ id: CAT, name: "Under 12" }],
});

const atleti = [
  { id: "atleta-1", first_name: "Uno", last_name: "A", category_id: CAT },
  { id: "atleta-2", first_name: "Due", last_name: "B", category_id: CAT },
];

/** La forma storica che `clubs.matches` conserva: nessuna traccia della rosa. */
const gara = (id, extra = {}) => ({
  id,
  eventId: id,
  kind: "match",
  date: "2026-09-07",
  time: "15:00",
  categoryId: CAT,
  categories: [CAT],
  category: "Under 12",
  status: "scheduled",
  ...extra,
});

/** Le righe come le serve `training_attendance`, alias di `club_event_participants`. */
const riga = (eventId, athleteId, extra = {}) => ({
  event_id: eventId,
  training_id: eventId,
  athlete_id: athleteId,
  status: "pending",
  convocation_status: null,
  ...extra,
});

const righe = [
  riga(GARA, "atleta-1", { convocation_status: "convocated" }),
  /*
    `excluded` e una decisione presa — «non giochi» — e non e una convocazione:
    contarla direbbe «rosa fatta» a una gara in cui l'allenatore ha soltanto
    tolto un nome.
  */
  riga(GARA, "atleta-2", { convocation_status: "excluded" }),
  riga(GARA_ANNULLATA, "atleta-2", { convocation_status: "convocated" }),
  riga(ALLENAMENTO, "atleta-1", { status: "present" }),
];

/* ============================ il rendiconto delle gare =================== */

test("il rendiconto conta la rosa scritta nelle righe, non nel payload", () => {
  const report = calculateMatchConvocationReport({
    matches: [gara(GARA)],
    attendanceRecords: righe,
    categories: categorie,
    selectedCategoryId: "all",
    period: "all",
  });

  assert.equal(report.totalMatches, 1);
  assert.equal(report.matchesWithConvocations, 1);
  assert.equal(report.totalConvocations, 1, "solo `convocated` e una convocazione");
  assert.equal(report.uniqueAthletesConvocated, 1);
  assert.equal(report.convocationCompletionRate, 100);
});

test("e porta gli identificativi, che una somma non porta", () => {
  const report = calculateMatchConvocationReport({
    matches: [gara(GARA)],
    attendanceRecords: righe,
    categories: categorie,
    selectedCategoryId: "all",
    period: "all",
  });

  assert.deepEqual(report.convocatedAthleteIds, ["atleta-1"]);
});

/**
 * **Il controspecchio, e conta.** Senza le righe il rendiconto deve dire zero,
 * non pescare una rosa dal payload: se le grafie storiche tornassero a valere,
 * una convocazione **cancellata** dalle righe continuerebbe a comparire come
 * fatta.
 */
test("le grafie storiche del payload non risuscitano una rosa cancellata", () => {
  const conPayload = gara(GARA, {
    convocatedAthletes: ["atleta-1", "atleta-2"],
    calledAthletes: ["atleta-1"],
    payload: { convocations: ["atleta-2"] },
  });

  const report = calculateMatchConvocationReport({
    matches: [conPayload],
    attendanceRecords: [riga(GARA, "atleta-1", { convocation_status: null })],
    categories: categorie,
    selectedCategoryId: "all",
    period: "all",
  });

  assert.equal(report.totalConvocations, 0);
  assert.deepEqual(report.convocatedAthleteIds, []);
});

test("una gara annullata non pesa sul rendiconto", () => {
  const report = calculateMatchConvocationReport({
    matches: [gara(GARA), gara(GARA_ANNULLATA, { status: "cancelled" })],
    attendanceRecords: righe,
    categories: categorie,
    selectedCategoryId: "all",
    period: "all",
  });

  assert.equal(report.totalMatches, 1, "non si e giocata: non ha avuto una rosa");
  assert.equal(report.matchesWithoutConvocations, 0);
  assert.equal(report.totalConvocations, 1);
});

/* ==================== la statistica per categoria e per atleta =========== */

test("le convocazioni per atleta si contano dalle righe", () => {
  const righeStat = calculateCategoryAthleteStats(
    CAT,
    atleti,
    [],
    righe,
    [gara(GARA)],
    categorie,
  );

  const uno = righeStat.find((r) => r.athleteId === "atleta-1");
  const due = righeStat.find((r) => r.athleteId === "atleta-2");

  assert.equal(uno.convocations, 1);
  assert.equal(due.convocations, 0, "`excluded` non e una convocazione");
});

/**
 * **L'intestazione conta cio che contano le righe.**
 *
 * `calculateCategoryAthleteStats` toglie gli annullati da entrambi gli elenchi
 * prima di calcolare i tassi; i due totali della scheda no. Sulla stessa
 * pagina e sullo stesso periodo l'intestazione diceva «2 allenamenti» e la
 * colonna «Presenze» di ogni riga li calcolava su 1.
 */
test("i totali della scheda Categorie escludono gli annullati, come le righe", () => {
  const report = calculateCategoryReport({
    athletes: atleti,
    trainings: [
      {
        id: ALLENAMENTO,
        eventId: ALLENAMENTO,
        date: "2026-09-07",
        categoryId: CAT,
        categories: [CAT],
        status: "scheduled",
      },
      {
        id: "evt-all-2",
        eventId: "evt-all-2",
        date: "2026-09-08",
        categoryId: CAT,
        categories: [CAT],
        status: "cancelled",
      },
    ],
    attendanceRecords: righe,
    matches: [gara(GARA), gara(GARA_ANNULLATA, { status: "cancelled" })],
    categories: categorie,
    selectedCategoryId: "all",
    period: "all",
  });

  assert.equal(report.totalTrainings, 1);
  assert.equal(report.totalMatches, 1);
  assert.equal(
    report.rows[0].totalTrainings,
    report.totalTrainings,
    "l'intestazione e la riga devono contare lo stesso denominatore",
  );
});

/* ================== la primitiva, e le due chiavi che incrocia =========== */

/**
 * Un evento nato prima della migrazione porta l'identificativo **storico** in
 * `id` e la riga in `eventId`; la lettura di `training_attendance` porta
 * `event_id` e `training_id`, che il registro traduce da `legacy_training_id`.
 * Indicizzare su una chiave sola vorrebbe dire non far incontrare mai le due.
 */
test("le righe si incrociano sia sull'identificativo storico sia sulla riga", () => {
  const storica = {
    id: "training-legacy-9",
    eventId: "evt-uuid-9",
    kind: "match",
    date: "2026-09-07",
  };

  const perStorico = attachParticipationToEvents(
    [storica],
    [riga("training-legacy-9", "atleta-1", { convocation_status: "convocated" })],
  );
  const perRiga = attachParticipationToEvents(
    [storica],
    [riga("evt-uuid-9", "atleta-2", { convocation_status: "convocated" })],
  );

  assert.deepEqual(perStorico[0].convocatedAthleteIds, ["atleta-1"]);
  assert.deepEqual(perRiga[0].convocatedAthleteIds, ["atleta-2"]);
});

test("un evento senza righe non eredita la rosa di un altro", () => {
  const proiettati = attachParticipationToEvents(
    [gara(GARA), gara("evt-gara-3")],
    righe,
  );

  assert.deepEqual(proiettati[0].convocatedAthleteIds, ["atleta-1"]);
  assert.deepEqual(proiettati[1].convocatedAthleteIds, []);
});

/**
 * **La risposta del server non e una grafia storica.**
 *
 * La rotta del calendario serve `convocated_athlete_ids`: gli identificativi
 * che il server ha letto dalle righe e filtrato sul perimetro di chi legge.
 * Tre schermate della bacheca dell'allenatore le righe non le hanno in mano e
 * usano quella chiave — e la proiezione, che azzera le quattordici grafie
 * storiche, azzerava anche quella: da li in poi ogni gara diceva «zero
 * convocati», e senza nemmeno il ripiego di prima.
 *
 * Quando per un evento non arriva nessuna riga si tiene cio che il server
 * aveva gia detto. Quando le righe ci sono, decidono loro: sono la stessa
 * fonte, lette piu da vicino.
 */
test("senza righe si tiene la risposta canonica del server", () => {
  const dallaRotta = gara(GARA, { convocated_athlete_ids: ["atleta-1"] });

  const [proiettato] = attachParticipationToEvents([dallaRotta], []);

  assert.deepEqual(proiettato.convocatedAthleteIds, ["atleta-1"]);
});

test("ma se le righe ci sono, sono loro a decidere", () => {
  const dallaRotta = gara(GARA, {
    convocated_athlete_ids: ["atleta-1", "atleta-2"],
  });

  const [proiettato] = attachParticipationToEvents(
    [dallaRotta],
    [riga(GARA, "atleta-1", { convocation_status: "convocated" })],
  );

  assert.deepEqual(
    proiettato.convocatedAthleteIds,
    ["atleta-1"],
    "una rosa ristretta dalle righe non torna larga per via della copia",
  );
});

test("e una rosa svuotata resta vuota", () => {
  const dallaRotta = gara(GARA, {
    convocated_athlete_ids: [],
    convocatedAthletes: ["atleta-1"],
  });

  const [proiettato] = attachParticipationToEvents([dallaRotta], []);

  assert.deepEqual(
    proiettato.convocatedAthleteIds,
    [],
    "le grafie storiche non risuscitano una rosa che il server dice vuota",
  );
});
