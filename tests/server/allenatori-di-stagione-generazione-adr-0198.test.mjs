import assert from "node:assert/strict";
import test, { before } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";
import {
  MS_CLUB,
  MS_NOW,
  MS_SEASON_A,
  MS_SEASON_B,
  MS_TRAINER,
  MS_TRAINER_2,
  seedMultiSeasonClub,
  weeklyRule,
} from "../helpers/multi-season-club.mjs";

/**
 * **Issue 1 del lotto ADR-0198: gli allenatori della stagione precedente
 * comparivano sugli allenamenti della nuova.** Sul pilota le 40 voci della B
 * portavano `trainerIds` copiati dalla A (riporto del programma) e il
 * generatore li scriveva sull'evento com'erano: la pagina Allenatori diceva
 * «nessuna categoria assegnata nella stagione 2026/27», la pagina Allenamenti
 * mostrava gli stessi allenatori dell'anno scorso.
 *
 * Il club della fixture ha due stagioni sovrapposte (helper obbligatorio):
 * Coach Bianchi segue gli Aquilotti nella A e nessuno nella B.
 */

let automazione;
let setPrismaClientForTests;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  automazione = await import("../../src/lib/server/training-automation.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import("../../src/lib/server/prisma.ts"));
});

const genera = async (seed, options = {}) => {
  const fake = createFakePrisma(seed);
  setPrismaClientForTests(fake.client);
  const risultato = await automazione.runTrainingAutomationForClub(MS_CLUB, {
    force: true,
    now: MS_NOW,
    untilDate: "2026-09-24",
    preview: true,
    ...options,
  });
  return { fake, risultato };
};

test("1-2-4-5 · la voce di B porta l'allenatore della A: l'allenamento di B nasce senza, e la diagnostica lo dice", async () => {
  const { risultato } = await genera(
    seedMultiSeasonClub({ weekly_schedule: [weeklyRule({ trainerIds: [MS_TRAINER.id] })] }),
  );

  assert.equal(risultato.diagnostics.validRules, 1, "la voce resta valida: l'allenatore non la rende incompleta");
  assert.equal(risultato.generatedTrainings.length, 1);
  assert.deepEqual(risultato.generatedTrainings[0].trainerIds, [], "nessun ripiego sulla stagione precedente");
  assert.equal(risultato.generatedTrainings[0].seasonId, MS_SEASON_B);
  assert.equal(risultato.diagnostics.trainersNotAssigned.rules, 1);
  assert.equal(risultato.diagnostics.trainersNotAssigned.trainers, 1);
  assert.match(risultato.diagnostics.trainersNotAssigned.examples[0], /Coach Bianchi/);
});

test("7-8 · assegnato l'allenatore nella B, l'allenamento di B lo porta — anche se la voce non lo nomina", async () => {
  const seed = seedMultiSeasonClub({
    trainers: [{ ...MS_TRAINER, categories: ["cat-a-aquilotti", "cat-b-aquilotti"] }, MS_TRAINER_2],
    weekly_schedule: [weeklyRule({ trainerIds: [] })],
  });
  const { risultato } = await genera(seed);

  assert.deepEqual(risultato.generatedTrainings[0].trainerIds, [MS_TRAINER.id], "deriva SOLO dalle assegnazioni della B");
  assert.equal(risultato.generatedTrainings[0].trainer, "Coach Bianchi");
  assert.equal(risultato.diagnostics.trainersNotAssigned.rules, 0);
});

test("8 · la voce nomina due allenatori, uno solo e assegnato nella B: resta quello", async () => {
  const seed = seedMultiSeasonClub({
    trainers: [{ ...MS_TRAINER, categories: ["cat-b-aquilotti"] }, { ...MS_TRAINER_2, categories: ["cat-a-aquilotti"] }],
    weekly_schedule: [weeklyRule({ trainerIds: [MS_TRAINER.id, MS_TRAINER_2.id] })],
  });
  const { risultato } = await genera(seed);

  assert.deepEqual(risultato.generatedTrainings[0].trainerIds, [MS_TRAINER.id]);
  assert.equal(risultato.diagnostics.trainersNotAssigned.trainers, 1);
  assert.match(risultato.diagnostics.trainersNotAssigned.examples[0], /Coach Verdi/);
});

test("8 · l'assegnazione al gruppo operativo della B vale per la voce della sua categoria", async () => {
  const seed = seedMultiSeasonClub({
    trainers: [{ ...MS_TRAINER, categories: [], groupIds: ["grp-b-aquilotti"] }],
    weekly_schedule: [weeklyRule({ trainerIds: [] })],
  });
  const { risultato } = await genera(seed);
  assert.deepEqual(risultato.generatedTrainings[0].trainerIds, [MS_TRAINER.id]);
});

test("5 · un nome di categoria non sceglie fra due stagioni: «Aquilotti» esiste in A e in B, l'allenatore non e assegnato in B", async () => {
  const seed = seedMultiSeasonClub({
    trainers: [{ ...MS_TRAINER, categories: ["Aquilotti"] }],
    weekly_schedule: [weeklyRule({ trainerIds: [MS_TRAINER.id] })],
  });
  const { risultato } = await genera(seed);
  assert.deepEqual(risultato.generatedTrainings[0].trainerIds, []);
});

test("6-9 · un allenamento storico della A conserva il suo allenatore: la generazione in B non lo tocca", async () => {
  const storico = {
    id: "ev-a-1",
    organization_id: MS_CLUB,
    kind: "training",
    legacy_id: "auto:2026-09-14|18:00|field-1|cat-a-aquilotti",
    status: "completed",
    season_id: MS_SEASON_A,
    category_id: "cat-a-aquilotti",
    category_name: "Aquilotti",
    category_ids: ["cat-a-aquilotti"],
    starts_at: new Date("2026-09-14T16:00:00.000Z"),
    ends_at: new Date("2026-09-14T17:30:00.000Z"),
    trainer_ids: [MS_TRAINER.id],
    payload: { trainerIds: [MS_TRAINER.id], trainer: "Coach Bianchi" },
    version: 1,
  };
  const { fake, risultato } = await genera(
    seedMultiSeasonClub({ weekly_schedule: [weeklyRule({ trainerIds: [MS_TRAINER.id] })] }, { clubEvent: [storico] }),
    { preview: false },
  );
  assert.equal(risultato.generatedCount, 1);
  const riga = fake.rows("clubEvent").find((row) => row.id === "ev-a-1");
  assert.deepEqual(riga.trainer_ids, [MS_TRAINER.id], "lo snapshot dell'evento storico e intatto");
  assert.equal(riga.season_id, MS_SEASON_A);
  const nuovo = fake.rows("clubEvent").find((row) => row.id !== "ev-a-1");
  assert.equal(nuovo.season_id, MS_SEASON_B);
  assert.deepEqual(nuovo.trainer_ids ?? [], []);
});

test("il riporto del programma settimanale non copia gli allenatori: la voce nuova nasce senza", async () => {
  const { planSeasonRollover } = await import("../../src/lib/club-seasons.ts");
  const piano = planSeasonRollover({
    collections: {
      categories: [{ id: "cat-a-aquilotti", name: "Aquilotti", seasonId: MS_SEASON_A }],
      weekly_schedule: [{ id: "voce-a", seasonId: MS_SEASON_A, day: "Lunedì", startTime: "18:00", endTime: "19:30", categoryId: "cat-a-aquilotti", structureId: "structure-1", locationId: "field-1", trainerIds: [MS_TRAINER.id], trainer: "Coach Bianchi", active: true }],
    },
    sourceSeasonId: MS_SEASON_A,
    targetSeasonId: MS_SEASON_B,
    types: ["categories", "weekly_schedule"],
    legacySeasonId: MS_SEASON_A,
    knownSeasonIds: [MS_SEASON_A, MS_SEASON_B],
    now: "2026-09-16T00:00:00.000Z",
  });
  const voce = piano.collections.weekly_schedule.find((row) => row.seasonId === MS_SEASON_B);
  assert.ok(voce, "la voce e stata riportata");
  assert.deepEqual(voce.trainerIds, []);
  assert.equal("trainer" in voce, false);
  assert.notEqual(voce.categoryId, "cat-a-aquilotti", "la categoria e rimappata sulla copia nuova");
});

/* ── Chiusure della revisione ostile A ───────────────────────────────────── */

test("A5 · gli allenatori scritti sono tutti dell'anno scorso: l'allenamento riceve quelli assegnati nella B, non resta vuoto", async () => {
  const seed = seedMultiSeasonClub({
    trainers: [{ ...MS_TRAINER, categories: ["cat-a-aquilotti"] }, { ...MS_TRAINER_2, categories: ["cat-b-aquilotti"] }],
    weekly_schedule: [weeklyRule({ trainerIds: [MS_TRAINER.id] })],
  });
  const { risultato } = await genera(seed);
  assert.deepEqual(risultato.generatedTrainings[0].trainerIds, [MS_TRAINER_2.id], "chi e assegnato in B, mai chi lo era in A");
  assert.equal(risultato.diagnostics.trainersNotAssigned.rules, 1, "e la voce viene detta");
});

test("A6 · una voce che nomina la categoria per nome («Aquilotti») trova gli assegnati della squadra risolta in B", async () => {
  const seed = seedMultiSeasonClub({
    trainers: [{ ...MS_TRAINER, categories: ["cat-b-aquilotti"] }],
    weekly_schedule: [weeklyRule({ categoryId: undefined, category: "Aquilotti", trainerIds: [] })],
  });
  const { risultato } = await genera(seed);
  assert.equal(risultato.generatedTrainings.length, 1);
  assert.equal(risultato.generatedTrainings[0].categoryId, "cat-b-aquilotti");
  assert.deepEqual(risultato.generatedTrainings[0].trainerIds, [MS_TRAINER.id]);
});

test("A7 · se l'allenatore dichiara un gruppo della categoria, segue quel gruppo: la voce di un altro gruppo non lo prende", async () => {
  const seed = seedMultiSeasonClub({
    category_groups: [
      { id: "grp-b-aquilotti", categoryId: "cat-b-aquilotti", siteId: "site-ms-1", seasonId: MS_SEASON_B },
      { id: "grp-b-aquilotti-2", categoryId: "cat-b-aquilotti", siteId: "site-ms-2", seasonId: MS_SEASON_B },
    ],
    trainers: [{ ...MS_TRAINER, categories: ["cat-b-aquilotti"], groupIds: ["grp-b-aquilotti"] }],
    weekly_schedule: [weeklyRule({ trainerIds: [], groupId: "grp-b-aquilotti-2" })],
  });
  const { risultato } = await genera(seed);
  assert.deepEqual(risultato.generatedTrainings[0].trainerIds, [], "l'altra sede non e la sua squadra");
  const stessoGruppo = await genera(seedMultiSeasonClub({ ...seed.club[0], weekly_schedule: [weeklyRule({ trainerIds: [], groupId: "grp-b-aquilotti" })] }));
  assert.deepEqual(stessoGruppo.risultato.generatedTrainings[0].trainerIds, [MS_TRAINER.id]);
});

test("A8 · un nome scritto in «trainer» accanto agli id non e un allenatore non assegnato: non si conta", async () => {
  const seed = seedMultiSeasonClub({
    trainers: [{ ...MS_TRAINER, categories: ["cat-b-aquilotti"] }],
    weekly_schedule: [weeklyRule({ trainerIds: [MS_TRAINER.id], trainer: "Coach Bianchi" })],
  });
  const { risultato } = await genera(seed);
  assert.deepEqual(risultato.generatedTrainings[0].trainerIds, [MS_TRAINER.id]);
  assert.equal(risultato.diagnostics.trainersNotAssigned.rules, 0);
});

test("A2 · un allenatore storico in staff_members assegnato in B e un allenatore come gli altri", async () => {
  const seed = seedMultiSeasonClub({
    trainers: [],
    staff_members: [{ id: "staff-coach", name: "Coach Staff", role: "trainer", categories: ["cat-b-aquilotti"] }],
    weekly_schedule: [weeklyRule({ trainerIds: ["staff-coach"] })],
  });
  const { risultato } = await genera(seed);
  assert.deepEqual(risultato.generatedTrainings[0].trainerIds, ["staff-coach"]);
  assert.equal(risultato.generatedTrainings[0].trainer, "Coach Staff");
});

test("A11 · un allenatore sospeso non si deriva sugli allenamenti nuovi", async () => {
  const seed = seedMultiSeasonClub({
    trainers: [{ ...MS_TRAINER, categories: ["cat-b-aquilotti"], status: "suspended" }],
    weekly_schedule: [weeklyRule({ trainerIds: [] })],
  });
  const { risultato } = await genera(seed);
  assert.deepEqual(risultato.generatedTrainings[0].trainerIds, []);
});

test("D10 · la diagnostica sugli allenatori non assegnati vale anche quando le occorrenze esistono gia", async () => {
  const seed = seedMultiSeasonClub({ weekly_schedule: [weeklyRule({ trainerIds: [MS_TRAINER.id] })] });
  const fake = createFakePrisma(seed);
  setPrismaClientForTests(fake.client);
  const prima = await automazione.runTrainingAutomationForClub(MS_CLUB, { force: true, now: MS_NOW, untilDate: "2026-09-24" });
  assert.equal(prima.generatedCount, 1);
  const seconda = await automazione.runTrainingAutomationForClub(MS_CLUB, { force: true, now: MS_NOW, untilDate: "2026-09-24", preview: true });
  assert.equal(seconda.existingCount, 1);
  assert.equal(seconda.diagnostics.trainersNotAssigned.rules, 1);
});
