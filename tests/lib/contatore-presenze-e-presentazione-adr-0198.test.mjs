import assert from "node:assert/strict";
import test, { before } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * **Issue 2, 3 e 6 del lotto ADR-0198, la parte pura.**
 *
 * - il contatore delle presenze ha un posto solo (`countEventAttendance`):
 *   «registrato» = almeno una riga di appello, presenti o assenti; il
 *   numeratore conta rosa, fuori rosa e persone in prova, la stessa persona
 *   una volta sola; il denominatore e la rosa e non si allarga;
 * - la Dashboard deriva «registrato» dallo stesso lettore della pagina
 *   Allenamenti (`readRecordedAttendance` + `attendanceStateOf`);
 * - il titolo di un allenamento e il tipo, la categoria un badge, la data un
 *   campo: su Allenamenti, Dashboard, Calendario, bacheca dell'allenatore.
 */

let contatore;
let presenter;
let calendario;
let dashboard;
let modelloPagina;

before(async () => {
  contatore = await import("../../src/lib/events/attendance-count.ts");
  presenter = await import("../../src/lib/events/training-presenter.ts");
  calendario = await import("../../src/components/calendar/v2/calendar-model.ts");
  dashboard = await import("../../src/components/dashboard/v2/today-trainings.ts");
  modelloPagina = await import("../../src/components/training/v2/training-page-model.ts");
});

const rosa = (n, status = "present") =>
  Array.from({ length: n }, (_, i) => ({ key: contatore.participantKey(`atleta-${i + 1}`), status }));

/* ── Contatore ─────────────────────────────────────────────────────────────── */

test("32 · 9 presenti su una rosa di 13: 9/13", () => {
  const counts = contatore.countEventAttendance([...rosa(9), ...rosa(4, "absent").map((r, i) => ({ ...r, key: contatore.participantKey(`assente-${i}`) }))]);
  assert.equal(counts.present, 9);
  assert.equal(counts.recorded, 13);
  assert.equal(counts.absent, 4);
});

test("33 · 13 presenti su 13: 13/13", () => {
  const counts = contatore.countEventAttendance(rosa(13));
  assert.equal(counts.present, 13);
  assert.equal(counts.recorded, 13);
});

test("34-37 · 13 di rosa piu 2 in prova: 15 presenti; il denominatore resta la rosa (13), non si clampa", () => {
  const counts = contatore.countEventAttendance([
    ...rosa(13),
    { key: contatore.trialParticipantKey({ trialId: "prova-1" }), status: "present", trial: true },
    { key: contatore.trialParticipantKey({ trialId: "prova-2" }), status: "present", trial: true },
  ]);
  assert.equal(counts.present, 15);
  assert.equal(counts.presentTrial, 2);
  const riepilogo = modelloPagina.sessionAttendanceSummary({
    attendanceRecorded: counts.recorded,
    attendancePresent: counts.present,
    expectedAttendees: 13,
    attendees: 0,
  });
  assert.equal(riepilogo.present, 15);
  assert.equal(riepilogo.total, 13, "la rosa attesa non si allarga per far tornare la frazione");
});

test("35 · 12 di rosa, 1 fuori rosa, 2 in prova: 15/13", () => {
  const counts = contatore.countEventAttendance([
    ...rosa(12),
    { key: contatore.participantKey("extra-1"), status: "present", extra: true },
    { key: contatore.trialParticipantKey({ trialId: "prova-1" }), status: "present", trial: true },
    { key: contatore.trialParticipantKey({ trialId: "prova-2" }), status: "present", trial: true },
  ]);
  assert.equal(counts.present, 15);
  assert.equal(counts.presentExtra, 1);
  assert.equal(counts.presentTrial, 2);
});

test("36 · la stessa persona non si conta due volte: rosa + fuori rosa, o prova convertita + scheda", () => {
  const doppia = contatore.countEventAttendance([
    { key: contatore.participantKey("mario"), status: "absent" },
    { key: contatore.participantKey("mario"), status: "present", extra: true },
  ]);
  assert.equal(doppia.recorded, 1);
  assert.equal(doppia.present, 1, "se una riga la dice presente, era presente");
  const convertita = contatore.countEventAttendance([
    { key: contatore.participantKey("mario"), status: "present" },
    { key: contatore.trialParticipantKey({ trialId: "prova-1", athleteId: "mario" }), status: "present", trial: true },
  ]);
  assert.equal(convertita.recorded, 1);
  assert.equal(convertita.present, 1);
  assert.equal(contatore.trialParticipantKey({ trialId: "prova-9" }), "trial:prova-9", "una prova non convertita ha la sua identita");
});

test("10-11-12 · «registrato» = almeno una riga di appello: 13 assenti su 13 e un appello fatto; «pending» no", () => {
  assert.equal(contatore.attendanceStateOf(contatore.countEventAttendance([])), "none");
  assert.equal(contatore.attendanceStateOf(contatore.countEventAttendance(rosa(13))), "recorded");
  assert.equal(contatore.attendanceStateOf(contatore.countEventAttendance(rosa(13, "absent"))), "recorded", "0 presenti, 13 assenti: registrato");
  assert.equal(contatore.attendanceStateOf(contatore.countEventAttendance(rosa(5, "pending"))), "none");
});

/* ── Dashboard ─────────────────────────────────────────────────────────────── */

const evento = (extra = {}) => ({
  id: "ev-1",
  title: "Giovedì 17 Settembre",
  date: "2026-09-17",
  time: "18:00",
  endTime: "19:30",
  category: "Under 14 Gold",
  status: "upcoming",
  ...extra,
});

test("10 · Dashboard: senza righe di appello e «non registrato»", () => {
  const riga = dashboard.normalizeTodayTraining(evento({ attendance_recorded: 0, attendance_present: 0 }));
  assert.equal(riga.attendanceStatus, "none");
});

test("11 · Dashboard: con presenti e «registrato», e i presenti sono il numeratore", () => {
  const riga = dashboard.normalizeTodayTraining(evento({ attendance_recorded: 13, attendance_present: 9, attendees: 0 }));
  assert.equal(riga.attendanceStatus, "saved");
  assert.equal(riga.attendees, 9);
});

test("12 · Dashboard: tutti assenti e comunque «registrato» — presentCount > 0 non e la prova", () => {
  const riga = dashboard.normalizeTodayTraining(evento({ attendance_recorded: 13, attendance_present: 0 }));
  assert.equal(riga.attendanceStatus, "saved");
  assert.equal(riga.attendees, 0);
});

test("38 · Dashboard e scheda Allenamenti dicono la stessa cosa sullo stesso evento", () => {
  const conteggi = { attendance_recorded: 15, attendance_present: 15, expectedAttendees: 13 };
  const riga = dashboard.normalizeTodayTraining(evento(conteggi));
  const tono = modelloPagina.sessionAttendanceTone({ ...evento(), attendanceRecorded: 15, attendancePresent: 15, expectedAttendees: 13, date: new Date("2026-09-17T18:00:00"), attendees: 0, trainer: "", location: "", categoryColor: "" });
  assert.equal(riga.attendanceStatus, "saved");
  assert.equal(tono, "recorded");
  assert.equal(riga.attendees, 15);
});

test("13-15 · la Dashboard legge dalla rotta canonica degli eventi con la stagione, e l'appello salvato svuota la cache", () => {
  const src = readFileSync(path.resolve("src/components/dashboard/v2/today-trainings.ts"), "utf8");
  assert.match(src, /listEvents\(\{\s*kind: "training"/, "la rotta canonica, non la proiezione clubs.trainings");
  assert.doesNotMatch(src, /getClubTrainings\(/, "la proiezione storica non porta l'appello");
  assert.match(src, /clearCache\(`trainings-\$\{clubId\}:`\)/, "la chiave con la stagione si svuota per prefisso");
  const client = readFileSync(path.resolve("src/lib/events/client.ts"), "utf8");
  assert.match(client, /invalidaAllenamentiDiOggi\(\);/, "salvare l'appello invalida la cache di oggi");
  const trials = readFileSync(path.resolve("src/lib/trials/client.ts"), "utf8");
  assert.match(trials, /clearCache\("trainings-"\)/, "anche le presenze di prova");
});

/* ── Presentazione ─────────────────────────────────────────────────────────── */

test("16-17 · il titolo e «Allenamento»; la data non e un titolo", () => {
  assert.equal(presenter.trainingDisplayTitle(evento()), "Allenamento");
  assert.equal(presenter.trainingDisplayNote(evento()), null, "«Giovedì 17 Settembre» non dice niente che la data non dica");
  for (const title of ["Allenamento 17/09/2026", "giovedì 17 settembre", "Giovedì 17 Settembre 2026", "17-09-2026", "Allenamento", ""]) {
    assert.equal(presenter.trainingDisplayNote({ title }), null, title);
  }
  assert.equal(presenter.trainingDisplayNote({ title: "Tecnica portieri" }), "Tecnica portieri", "una nota scritta a mano resta");
  assert.equal(presenter.defaultTrainingTitle(), "Allenamento");
});

test("17 · Calendario: un allenamento si intitola per tipo, una gara conserva il suo titolo", () => {
  assert.equal(calendario.titoloDi({ ...evento(), kind: "training" }), "Allenamento");
  assert.equal(calendario.notaDi({ ...evento(), kind: "training", title: "Tecnica portieri" }), "Tecnica portieri");
  assert.equal(calendario.titoloDi({ ...evento(), kind: "match", title: "Derby", opponent: "Virtus" }), "Derby");
  assert.equal(calendario.titoloDi({ ...evento(), kind: "match", title: "", opponent: "Virtus" }), "Gara contro Virtus");
});

test("18-20 · la data resta nel dominio: il titolo cambia, `date`/`time` no, e il calendario raggruppa per data", () => {
  const riga = dashboard.normalizeTodayTraining(evento({ attendance_recorded: 0 }));
  assert.equal(riga.title, "Allenamento");
  assert.equal(riga.date.getFullYear(), 2026);
  assert.equal(riga.startTime, "18:00");
  const giorni = calendario.raggruppaPerGiorno([
    { ...evento(), kind: "training", title: "Giovedì 17 Settembre" },
    { ...evento(), id: "ev-2", kind: "training", date: "2026-09-24", title: "Giovedì 24 Settembre" },
  ]);
  assert.deepEqual(giorni.map((g) => g.giorno), ["2026-09-17", "2026-09-24"]);
});

test("19 · la ricerca per data esatta nello storico usa il campo data, non il titolo", () => {
  const eventi = [
    { ...evento(), kind: "training", title: "Allenamento" },
    { ...evento(), id: "ev-2", kind: "training", date: "2026-09-24", title: "Allenamento" },
  ];
  const del17 = eventi.filter((e) => calendario.dayKeyOf(e) === "2026-09-17");
  assert.equal(del17.length, 1);
  assert.equal(del17[0].id, "ev-1");
});

test("16 · le superfici usano il presentatore: Allenamenti, Dashboard, Calendario, bacheca allenatore, generatore", () => {
  const leggi = (p) => readFileSync(path.resolve(p), "utf8");
  assert.match(leggi("src/app/training/page.tsx"), /title: trainingDisplayTitle\(training\)/);
  assert.match(leggi("src/components/dashboard/v2/today-trainings.ts"), /title: trainingDisplayTitle\(training\)/);
  assert.match(leggi("src/components/calendar/v2/calendar-model.ts"), /trainingDisplayTitle\(evento\)/);
  assert.match(leggi("src/components/trainer/trainer-dashboard-home-v2-page.tsx"), /trainingDisplayTitle\(training\)/);
  assert.match(leggi("src/lib/server/training-automation.ts"), /title: defaultTrainingTitle\(\)/);
  assert.doesNotMatch(leggi("src/lib/server/training-automation.ts"), /formatTrainingTitle\(trainingDate\)/);
  assert.match(leggi("src/components/training/v2/DaySessions.tsx"), /data-test="training-note"/);
});

test("37 · il denominatore e l'organico della squadra per identificativo: i «Pulcini» dell'anno scorso non contano nei Pulcini di quest'anno", async () => {
  const appartenenze = await import("../../src/lib/athlete-category-memberships.ts");
  const dellaB = { id: "a1", category_id: "cat-b-pulcini", data: { categoryMemberships: [{ category_id: "cat-b-pulcini", is_primary: true }] } };
  const dellaA = { id: "a2", category_id: "cat-a-pulcini", category_name: "Pulcini", data: { category: "cat-a-pulcini", categoryName: "Pulcini", categoryMemberships: [{ category_id: "cat-a-pulcini", category_name: "Pulcini", is_primary: true }] } };
  assert.equal(appartenenze.athleteHasCategoryId(dellaB, "cat-b-pulcini"), true);
  assert.equal(appartenenze.athleteHasCategoryId(dellaA, "cat-b-pulcini"), false, "il nome «Pulcini» non attraversa le stagioni");
  const riga = dashboard.normalizeTodayTraining(
    { ...evento(), category: "Pulcini", categoryId: "cat-b-pulcini", attendance_recorded: 15, attendance_present: 15 },
    { categories: [{ id: "cat-b-pulcini", name: "Pulcini" }], athletes: [dellaB, dellaA, { ...dellaB, id: "a3" }] },
  );
  assert.equal(riga.expectedAttendees, 2, "due atleti della B, non tre");
  assert.equal(riga.attendees, 15);
});
