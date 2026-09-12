import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Un programma disattivato smette di generare, non cancella cio che ha
 * gia generato** (WP-14).
 */

const CLUB = "aaaaaaaa-6c00-4000-8000-000000000010";
const DIREZIONE = "11111111-6c00-4000-8000-000000000fff";

let automazione;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  automazione = await import("../../src/lib/server/training-automation.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const slot = ({ id, active }) => ({
  id,
  day: "Lunedì",
  startTime: "18:00",
  endTime: "19:30",
  categoryId: "u15",
  structureId: "STRUCT1",
  locationId: "FIELD1",
  trainerIds: ["trainer-1"],
  ...(active === undefined ? {} : { active }),
});

const seed = (weeklySchedule) => ({
  user: [{ id: DIREZIONE, email: "direzione@club.it" }],
  club: [
    {
      id: CLUB,
      slug: "club",
      name: "Club",
      creator_id: DIREZIONE,
      categories: [{ id: "u15", name: "Under 15" }],
      trainers: [],
      staff_members: [],
      structures: [],
      trainings: [],
      matches: [],
      weekly_schedule: weeklySchedule,
      settings: {},
    },
  ],
  athlete: [],
  athleteCategoryMembership: [],
  clubResourceItem: [],
  clubEvent: [],
  clubEventParticipant: [],
  auditLog: [],
  notification: [],
});

const NOW = new Date("2026-09-14T08:00:00.000Z");

test("WP-14 · una regola disattivata non genera nessun allenamento", async () => {
  fake = createFakePrisma(seed([slot({ id: "slot-1", active: false })]));
  setPrismaClientForTests(fake.client);

  const risultato = await automazione.runTrainingAutomationForClub(CLUB, {
    force: true,
    now: NOW,
  });

  assert.equal(risultato.generatedTrainings.length, 0);
  assert.equal(fake.rows("clubEvent").length, 0);
});

test("WP-14 · una voce senza il campo active si legge come attiva (compatibilita)", async () => {
  fake = createFakePrisma(seed([slot({ id: "slot-1" })]));
  setPrismaClientForTests(fake.client);

  const risultato = await automazione.runTrainingAutomationForClub(CLUB, {
    force: true,
    now: NOW,
  });

  assert.ok(risultato.generatedTrainings.length > 0);
});

test("WP-14 · disattivare una regola conta come «removed» nell'impatto, non offre un aggiornamento", async () => {
  const previousSchedule = [slot({ id: "slot-1", active: true })];
  const nextSchedule = [slot({ id: "slot-1", active: false })];

  const cambi = automazione.findWeeklyScheduleSlotChanges(
    previousSchedule,
    nextSchedule,
  );

  assert.equal(cambi.length, 1);
  assert.equal(cambi[0].changeType, "removed");
});

test("WP-14 · riattivare una regola invariata non e un cambiamento da segnalare", () => {
  const previousSchedule = [slot({ id: "slot-1", active: false })];
  const nextSchedule = [slot({ id: "slot-1", active: true })];

  const cambi = automazione.findWeeklyScheduleSlotChanges(
    previousSchedule,
    nextSchedule,
  );

  assert.deepEqual(cambi, []);
});
