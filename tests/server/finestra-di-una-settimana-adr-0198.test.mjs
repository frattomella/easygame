import assert from "node:assert/strict";
import test, { before } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";
import {
  MS_CLUB,
  MS_SEASON_A,
  MS_SEASON_B,
  MS_TRAINER,
  fortyWeeklyRules,
  seedMultiSeasonClub,
} from "../helpers/multi-season-club.mjs";

/**
 * **Issue 7 del lotto ADR-0198: 40 voci, «una settimana», 50 allenamenti.**
 *
 * La traccia forense sul pilota (sola lettura, 2026-09-18): «Genera ora» con
 * «7 giorni» premuto giovedi 17 settembre alle 09:25 ha creato 50 eventi dal
 * 17 al **24** settembre compresi — otto giorni — e le 10 voci del giovedi
 * sono nate due volte (17 e 24). Le altre 30 una volta. 30 + 2 × 10 = 50.
 * Nessun duplicato di voce, nessuna voce di A, nessuna ricorrenza doppia:
 * era la finestra, `<= oggi + N`.
 *
 * Adesso la finestra a giorni e semiaperta sull'istante: `[adesso, adesso +
 * N × 24h)`. Ogni voce settimanale produce esattamente N/7 occorrenze.
 */

let automazione;
let setPrismaClientForTests;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  automazione = await import("../../src/lib/server/training-automation.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import("../../src/lib/server/prisma.ts"));
});

/*
  Le 40 voci della fixture vanno dalle 08:00 alle 15:00; il pilota premeva
  alle 09:25 con voci dalle 10:00 in poi. Per riprodurre «tutte le voci di
  oggi sono ancora davanti» il test preme alle 07:00 **di Roma**: il
  generatore confronta nella cornice civile del club (revisione D3), quindi
  l'istante e «quello la cui ora di Roma e 07:00», qualunque sia il fuso della
  macchina che esegue i test.
*/
const aRoma = (giorno, ore, minuti = 0) => {
  const [anno, mese, gg] = giorno.split("-").map(Number);
  const cifre = Date.UTC(anno, mese - 1, gg, ore, minuti, 0, 0);
  const scarto = automazione.civilDateOf(new Date(cifre), "Europe/Rome").getTime() - cifre;
  return new Date(cifre - scarto);
};
const alleOreLocali = aRoma;
const GIOVEDI_0700 = () => aRoma("2026-09-17", 7, 0);

/* Come sul pilota: l'allenatore e assegnato in B alle due squadre delle voci. */
const trainerDiB = { ...MS_TRAINER, categories: ["cat-b-u15", "cat-b-u17"] };

const genera = async (weekly_schedule, options = {}) => {
  const fake = createFakePrisma(seedMultiSeasonClub({ weekly_schedule, trainers: [trainerDiB] }));
  setPrismaClientForTests(fake.client);
  return automazione.runTrainingAutomationForClub(MS_CLUB, {
    force: true,
    now: GIOVEDI_0700(),
    preview: true,
    settingsOverride: { generateDaysAhead: 7 },
    ...options,
  });
};

const perVoce = (risultato) => {
  const conteggio = new Map();
  for (const evento of risultato.generatedTrainings) {
    const chiave = `${evento.time}|${evento.categoryId}|${new Date(`${evento.date}T12:00:00Z`).getUTCDay()}`;
    conteggio.set(chiave, (conteggio.get(chiave) || 0) + 1);
  }
  return conteggio;
};

test("39-40-43 · 40 voci, «7 giorni» premuto giovedi mattina: 40 occorrenze, una per voce (prima erano 50)", async () => {
  const risultato = await genera(fortyWeeklyRules());
  assert.equal(risultato.diagnostics.totalRules, 40);
  assert.equal(risultato.diagnostics.validRules, 40);
  assert.equal(risultato.generatedTrainings.length, 40, "non 50: il giovedi successivo e fuori dalla finestra");
  const conteggio = perVoce(risultato);
  assert.equal(conteggio.size, 40);
  assert.ok(Array.from(conteggio.values()).every((n) => n === 1), "ogni voce esattamente una volta");
  const date = new Set(risultato.generatedTrainings.map((e) => e.date));
  assert.deepEqual(
    Array.from(date).sort(),
    ["2026-09-17", "2026-09-18", "2026-09-21", "2026-09-22", "2026-09-23"],
    "giovedi 17 compreso (le voci sono dopo le 07:00), giovedi 24 escluso",
  );
  assert.equal(risultato.diagnostics.rulesWithoutOccurrence, 0);
});

test("40 · la finestra inclusiva di prima (giovedi → giovedi compresi) e cio che «Genera fino al 24» fa apposta: le voci del giovedi due volte", async () => {
  /* Sul pilota il giovedi aveva 10 voci: 40 + 10 = 50. Qui ne ha 8: 40 + 8 = 48. */
  const risultato = await genera(fortyWeeklyRules(), { untilDate: "2026-09-24", settingsOverride: undefined });
  assert.equal(risultato.generatedTrainings.length, 48);
  const conteggio = perVoce(risultato);
  const doppie = Array.from(conteggio.entries()).filter(([, n]) => n === 2);
  assert.equal(doppie.length, 8, "le 8 voci del giovedi due volte: 17 e 24");
  assert.ok(doppie.every(([chiave]) => chiave.endsWith("|4")), "sono tutte di giovedi");
  assert.equal(Array.from(conteggio.values()).filter((n) => n === 1).length, 32);
});

test("43-44 · deterministica sull'istante: premuto il giovedi alle 10:30 le voci del giovedi gia passate nascono la settimana dopo, e sono sempre 40", async () => {
  const risultato = await genera(fortyWeeklyRules(), { now: alleOreLocali("2026-09-17", 10, 30) });
  assert.equal(risultato.generatedTrainings.length, 40);
  const giovedi = risultato.generatedTrainings.filter((e) => new Date(`${e.date}T12:00:00Z`).getUTCDay() === 4);
  assert.equal(giovedi.length, 8, "le 8 voci del giovedi, una volta ciascuna");
  for (const evento of giovedi) {
    const passata = evento.time <= "10:30";
    assert.equal(evento.date, passata ? "2026-09-24" : "2026-09-17", `${evento.time}: ${passata ? "gia passata, nasce il 24" : "ancora davanti, nasce il 17"}`);
  }
});

test("45 · idempotenza: la seconda passata sulla stessa finestra non crea niente", async () => {
  const fake = createFakePrisma(seedMultiSeasonClub({ weekly_schedule: fortyWeeklyRules(), trainers: [trainerDiB] }));
  setPrismaClientForTests(fake.client);
  const prima = await automazione.runTrainingAutomationForClub(MS_CLUB, { force: true, now: GIOVEDI_0700(), settingsOverride: { generateDaysAhead: 7 } });
  assert.equal(prima.generatedCount, 40);
  const seconda = await automazione.runTrainingAutomationForClub(MS_CLUB, { force: true, now: GIOVEDI_0700(), settingsOverride: { generateDaysAhead: 7 } });
  assert.equal(seconda.generatedCount, 0);
  assert.equal(seconda.existingCount, 40);
  assert.equal(fake.rows("clubEvent").length, 40);
});

test("41-42 · una voce della A nel programma si conta come «altra stagione» e non genera in B", async () => {
  const conVoceDiA = [...fortyWeeklyRules(), { ...fortyWeeklyRules({ seasonId: MS_SEASON_A, categoryIds: ["cat-a-u15"] })[0], id: "voce-a" }];
  const risultato = await genera(conVoceDiA);
  assert.equal(risultato.diagnostics.totalRules, 41);
  assert.equal(risultato.diagnostics.reasons.find((r) => r.code === "other_season")?.count, 1);
  assert.equal(risultato.generatedTrainings.length, 40);
  assert.ok(risultato.generatedTrainings.every((e) => e.seasonId === MS_SEASON_B));
});

test("44 · la stessa cornice ovunque: premuto alle 09:25 di Roma da un server UTC, la voce delle 08:00 di oggi e passata e nasce fra sette giorni", async () => {
  /* 09:25 di Roma il 17 settembre = 07:25Z: un server in UTC che confrontasse le cifre locali direbbe che le 08:00 sono ancora davanti. */
  const risultato = await genera(fortyWeeklyRules(), { now: new Date("2026-09-17T07:25:00.000Z") });
  assert.equal(risultato.generatedTrainings.length, 40);
  const otto = risultato.generatedTrainings.filter((e) => e.time === "08:00" && new Date(`${e.date}T12:00:00Z`).getUTCDay() === 4);
  assert.ok(otto.length >= 1);
  assert.ok(otto.every((e) => e.date === "2026-09-24"), "le 08:00 del giovedi sono gia passate alle 09:25 di Roma");
  const dieci = risultato.generatedTrainings.filter((e) => e.time === "10:00" && new Date(`${e.date}T12:00:00Z`).getUTCDay() === 4);
  assert.ok(dieci.every((e) => e.date === "2026-09-17"), "le 10:00 nascono oggi");
});

test("44 · al cambio d'ora sette giorni restano sette giorni civili: nessuna voce persa o doppia", async () => {
  /* Giovedi 22 ottobre 2026 (CEST) → giovedi 29 (CET): con 7 × 24h la finestra finiva un'ora prima. */
  const risultato = await genera(fortyWeeklyRules(), { now: aRoma("2026-10-22", 7, 0) });
  assert.equal(risultato.generatedTrainings.length, 40);
  assert.equal(risultato.diagnostics.rulesWithoutOccurrence, 0);
  const primavera = await genera(fortyWeeklyRules(), { now: aRoma("2027-03-25", 7, 0) });
  assert.equal(primavera.generatedTrainings.length, 40);
});

test("D2 · «generato fino al» e l'ultimo giorno coperto per intero, non il giorno del confine", async () => {
  const fake = createFakePrisma(seedMultiSeasonClub({ weekly_schedule: fortyWeeklyRules(), trainers: [trainerDiB] }));
  setPrismaClientForTests(fake.client);
  const esito = await automazione.runTrainingAutomationForClub(MS_CLUB, { force: true, now: GIOVEDI_0700(), settingsOverride: { generateDaysAhead: 7 } });
  assert.equal(esito.generatedUntil, "2026-09-23");
});
