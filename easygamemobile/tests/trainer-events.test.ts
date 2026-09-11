import { test } from "node:test";
import assert from "node:assert/strict";

import {
  filterMatchesForTrainerScope,
  filterTrainingsForTrainerScope,
  mapEventRowToMatch,
  mapEventRowToTraining,
  mapParticipantsToAttendance,
  roleHasFullClubEventAccess,
  sortEventsByDateTime,
  type EventRow,
} from "../client/lib/trainer-events";
import type {
  ClubCategorySummary,
  Match,
  Training,
} from "../client/services/api";

// D-MOB-12 (WP13, acceptance pass autenticata): `GET /api/v1/trainings`/
// `matches` rispondono 400 "Unknown resource" dal 2026-09-01 (commit Web
// `d25934d`) — questo modulo e la sostituzione, sul registro autoritativo
// `GET /api/v1/events`. Il server (src/lib/server/events.ts) gia prova
// esaustivamente perimetro, concorrenza e le tre colonne di stato
// (tests/server/eventi-servizio.test.mjs e affini) — questi test coprono
// solo cio che e nuovo qui: la mappatura client e il filtro di scorta.

const categories: ClubCategorySummary[] = [
  { id: "cat-u15", name: "Under 15" },
  { id: "cat-u17", name: "Under 17" },
];

// --- mapEventRowToTraining --------------------------------------------

test("mapEventRowToTraining: legge la riga appiattita di GET /api/v1/events, categoria per id", () => {
  const row: EventRow = {
    id: "ev-1",
    organization_id: "club-1",
    title: "Allenamento tattico",
    date: "2026-09-15",
    time: "18:00",
    endTime: "19:30",
    location: "Campo 1",
    categoryId: "cat-u15",
    status: "scheduled",
    trainers: ["trainer-1"],
    version: 3,
    attendance_present: 8,
    attendance_recorded: 10,
  };

  const training = mapEventRowToTraining(row, categories);

  assert.equal(training.id, "ev-1");
  assert.equal(training.clubId, "club-1");
  assert.equal(training.title, "Allenamento tattico");
  assert.equal(training.date, "2026-09-15");
  assert.equal(training.time, "18:00");
  assert.equal(training.endTime, "19:30");
  assert.equal(training.category, "Under 15");
  assert.equal(training.categoryId, "cat-u15");
  assert.equal(training.status, "scheduled");
  assert.equal(training.presentCount, 8);
  assert.equal(training.totalCount, 10);
  assert.equal(training.version, 3);
  assert.deepEqual(training.trainerIds, ["trainer-1"]);
});

test("mapEventRowToTraining: nessun titolo dal server → titolo derivato dalla categoria, mai vuoto", () => {
  const row: EventRow = {
    id: "ev-2",
    date: "2026-09-16",
    time: "17:00",
    categoryId: "cat-u17",
  };

  const training = mapEventRowToTraining(row, categories);
  assert.equal(training.title, "Under 17 Training");
});

test("mapEventRowToTraining: status assente → 'scheduled', mai undefined (isCancelledTraining/canManageMobileTrainingAttendance ne dipendono)", () => {
  const training = mapEventRowToTraining(
    { id: "ev-3", date: "2026-09-16", time: "17:00" },
    categories,
  );
  assert.equal(training.status, "scheduled");
});

test("mapEventRowToTraining: attendance_recorded assente → totalCount undefined, non 0 inventato", () => {
  const training = mapEventRowToTraining(
    { id: "ev-4", date: "2026-09-16", time: "17:00" },
    categories,
  );
  assert.equal(training.totalCount, undefined);
  assert.equal(training.presentCount, 0);
});

// --- mapEventRowToMatch -------------------------------------------------

test("mapEventRowToMatch: gara in casa, avversario diventa la squadra ospite", () => {
  const row: EventRow = {
    id: "match-1",
    organization_id: "club-1",
    date: "2026-09-20",
    time: "15:00",
    categoryId: "cat-u15",
    opponent: "ASD Rivali",
    homeAway: "home",
    convocated_athlete_ids: ["ath-1", "ath-2"],
    convocated_count: 2,
    capacity: 18,
  };

  const match = mapEventRowToMatch(row, categories);

  assert.equal(match.isHome, true);
  assert.equal(match.homeTeam, "Casa");
  assert.equal(match.awayTeam, "ASD Rivali");
  assert.equal(match.convokedCount, 2);
  assert.equal(match.totalConvocable, 18);
  assert.deepEqual(match.convocatedAthletes, ["ath-1", "ath-2"]);
  assert.equal(match.convocationsStatus, "completed");
});

test("mapEventRowToMatch: gara in trasferta, avversario diventa la squadra di casa", () => {
  const row: EventRow = {
    id: "match-2",
    date: "2026-09-21",
    time: "10:00",
    opponent: "ASD Rivali",
    homeAway: "away",
  };

  const match = mapEventRowToMatch(row, categories);
  assert.equal(match.isHome, false);
  assert.equal(match.homeTeam, "ASD Rivali");
  assert.equal(match.awayTeam, "Ospiti");
});

test("mapEventRowToMatch: nessuna convocazione → elenco vuoto, stato 'none', mai 'completed' finto", () => {
  const match = mapEventRowToMatch(
    { id: "match-3", date: "2026-09-21", time: "10:00" },
    categories,
  );
  assert.deepEqual(match.convocatedAthletes, []);
  assert.equal(match.convocationsStatus, "none");
});

test("mapEventRowToMatch: struttura+campo formano il luogo, come il vecchio formatMobileMatchLocationLabel", () => {
  const match = mapEventRowToMatch(
    {
      id: "match-4",
      date: "2026-09-21",
      time: "10:00",
      structureName: "Centro Sportivo",
      fieldName: "Campo A",
      location: "Via Roma 1",
    },
    categories,
  );
  assert.equal(match.location, "Centro Sportivo - Campo A");
});

// --- filterTrainingsForTrainerScope / filterMatchesForTrainerScope -----

// `coachName`/`trainers` fissi e non corrispondenti di proposito: isolano
// lo scope di categoria dal ripiego per nome, che su due stringhe vuote
// ("".includes("") e true in JS) farebbe passare qualunque riga — lo
// stesso comportamento di bordo della logica originale (non toccato da
// questa migrazione, D-MOB-12 preserva lo scope cosi com'era).
const training = (
  id: string,
  categoryId?: string,
  trainerIds: string[] = [],
): Training =>
  ({
    id,
    categoryId,
    title: "",
    date: "",
    time: "",
    location: "",
    category: "",
    coachName: "Nessuno",
    trainerIds,
  }) as Training;

const match = (
  id: string,
  categoryId?: string,
  trainers: string[] = [],
): Match =>
  ({
    id,
    categoryId,
    date: "",
    time: "",
    homeTeam: "",
    awayTeam: "",
    location: "",
    isHome: true,
    trainers,
  }) as Match;

test("filterTrainingsForTrainerScope: owner/admin vedono tutto, nessun filtro applicato", () => {
  const all = [training("t1", "cat-u15"), training("t2", "cat-u17")];
  const result = filterTrainingsForTrainerScope(all, {
    role: "owner",
    assignedCategoryIds: [],
  });
  assert.equal(result.length, 2);
});

// `trainerName` sempre valorizzato e non corrispondente ("Altro Allenatore")
// nei casi sotto: `String.prototype.includes("")` e sempre vero, quindi un
// `trainerName` vuoto farebbe passare qualunque `coachName` per il ripiego
// sul nome — lo stesso comportamento di bordo della logica originale,
// isolato qui apposta per provare solo lo scope di categoria/trainerId.
const NON_MATCHING_TRAINER_NAME = "Altro Allenatore";

test("filterTrainingsForTrainerScope: trainer vede solo la propria categoria assegnata (scope categoria/squadra)", () => {
  const all = [training("t1", "cat-u15"), training("t2", "cat-u17")];
  const result = filterTrainingsForTrainerScope(all, {
    role: "trainer",
    assignedCategoryIds: ["cat-u15"],
    trainerName: NON_MATCHING_TRAINER_NAME,
  });
  assert.deepEqual(
    result.map((t) => t.id),
    ["t1"],
  );
});

test("filterTrainingsForTrainerScope: trainer vede anche un allenamento fuori categoria se e fra i trainerIds (co-conduzione)", () => {
  const all = [training("t1", "cat-u17", ["trainer-99"])];
  const result = filterTrainingsForTrainerScope(all, {
    role: "trainer",
    assignedCategoryIds: ["cat-u15"],
    trainerId: "trainer-99",
    trainerName: NON_MATCHING_TRAINER_NAME,
  });
  assert.equal(result.length, 1);
});

test("filterTrainingsForTrainerScope: nessuna categoria assegnata e nessuna corrispondenza → elenco vuoto (accesso non autorizzato, mai l'intero club)", () => {
  const all = [training("t1", "cat-u15"), training("t2", "cat-u17")];
  const result = filterTrainingsForTrainerScope(all, {
    role: "trainer",
    assignedCategoryIds: [],
    trainerName: NON_MATCHING_TRAINER_NAME,
  });
  assert.deepEqual(result, []);
});

test("filterMatchesForTrainerScope: stesso principio delle sessioni — categoria assegnata o nome nella lista trainers", () => {
  const all = [match("m1", "cat-u15"), match("m2", "cat-u17", ["Mario Rossi"])];
  const result = filterMatchesForTrainerScope(all, {
    role: "trainer",
    assignedCategoryIds: [],
    trainerName: "Mario Rossi",
  });
  assert.deepEqual(
    result.map((m) => m.id),
    ["m2"],
  );
});

test("roleHasFullClubEventAccess: solo owner e admin, case-insensitive", () => {
  assert.equal(roleHasFullClubEventAccess("owner"), true);
  assert.equal(roleHasFullClubEventAccess("Admin"), true);
  assert.equal(roleHasFullClubEventAccess("trainer"), false);
  assert.equal(roleHasFullClubEventAccess("assistant"), false);
  assert.equal(roleHasFullClubEventAccess(null), false);
});

// --- sortEventsByDateTime ------------------------------------------------

test("sortEventsByDateTime: ordina per data e ora, senza mutare l'elenco originale", () => {
  const items = [
    { date: "2026-09-16", time: "18:00" },
    { date: "2026-09-15", time: "09:00" },
    { date: "2026-09-15", time: "18:00" },
  ];
  const sorted = sortEventsByDateTime(items);
  assert.deepEqual(
    sorted.map((item) => `${item.date}T${item.time}`),
    ["2026-09-15T09:00", "2026-09-15T18:00", "2026-09-16T18:00"],
  );
  assert.equal(
    items[0].date,
    "2026-09-16",
    "l'elenco originale non e stato riordinato sul posto",
  );
});

// --- mapParticipantsToAttendance -----------------------------------------

test("mapParticipantsToAttendance: present/absent diventano righe, pending resta 'non ancora segnato' (nessuna riga)", () => {
  const entries = mapParticipantsToAttendance([
    { athlete_id: "a1", status: "present", notes: "In forma" },
    { athlete_id: "a2", status: "absent", notes: "" },
    { athlete_id: "a3", status: "pending" },
    { athlete_id: "a4", status: null },
  ]);

  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], {
    athleteId: "a1",
    present: true,
    notes: "In forma",
  });
  assert.deepEqual(entries[1], { athleteId: "a2", present: false, notes: "" });
});

test("mapParticipantsToAttendance: nessun tri-state esposto — 'pending' non diventa mai present:false visibile come 'segnato assente'", () => {
  const entries = mapParticipantsToAttendance([
    { athlete_id: "a1", status: "pending" },
  ]);
  assert.equal(entries.length, 0);
});

test("mapParticipantsToAttendance: elenco assente o vuoto → nessuna riga, mai un errore", () => {
  assert.deepEqual(mapParticipantsToAttendance(undefined), []);
  assert.deepEqual(mapParticipantsToAttendance([]), []);
});

test("mapParticipantsToAttendance: una riga senza athleteId viene scartata, non produce una voce vuota", () => {
  const entries = mapParticipantsToAttendance([{ status: "present" }]);
  assert.deepEqual(entries, []);
});
