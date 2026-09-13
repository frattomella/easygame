import assert from "node:assert/strict";
import test, { before, beforeEach, afterEach } from "node:test";

import { createFakePrisma, withFailingClubUpdate } from "../helpers/fake-prisma.mjs";

/**
 * Controlled, end-to-end proof for the UAT bug:
 *
 * "L'AUTOMAZIONE SETTIMANALE HA SUPERATO IL CHECKPOINT MA NON HA GENERATO"
 *
 * These tests run the real planner + writer (`runTrainingAutomationForClub`,
 * `runDueTrainingAutomationForAllClubs`) against an in-memory fake Prisma
 * client — no real database, no shared/pilot data touched — simulating
 * exactly the reported checkpoint: Sunday 13/09/2026 13:40 Europe/Rome.
 */

let automation;
let setPrismaClientForTests;

before(async () => {
  process.env.TZ = "Europe/Rome";
  automation = await import("../../src/lib/server/training-automation.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

afterEach(() => {
  setPrismaClientForTests(null);
});

// Sunday 13/09/2026 13:40 Europe/Rome === 2026-09-13T11:40:00Z (CEST, UTC+2)
const CHECKPOINT = new Date("2026-09-13T11:40:00Z");
const NEXT_CHECKPOINT = new Date("2026-09-20T11:40:00Z");

const CLUB_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const DUE_CLUB_NAME = "Club Dovuto";
const NOT_DUE_CLUB_ID = "bbbbbbbb-0000-4000-8000-000000000002";
const NOT_DUE_CLUB_NAME = "Club Non Dovuto";

const weeklyScheduleFixture = () => [
  {
    day: "Domenica",
    startTime: "17:00",
    endTime: "18:30",
    categoryId: "cat-1",
    categoryName: "Under 12",
    trainerIds: ["trainer-1"],
    structureId: "structure-1",
    locationId: "field-1",
    location: "Struttura A - Campo 1",
  },
  {
    day: "Domenica",
    startTime: "19:00",
    endTime: "20:30",
    categoryId: "cat-1",
    categoryName: "Under 12",
    trainerIds: ["trainer-1"],
    structureId: "structure-1",
    locationId: "field-1",
    location: "Struttura A - Campo 1",
  },
];

const clubFixture = ({
  id = CLUB_ID,
  name = DUE_CLUB_NAME,
  automationOverrides = {},
  weeklySchedule = weeklyScheduleFixture(),
} = {}) => ({
  id,
  name,
  settings: {
    trainingAutomation: {
      enabled: true,
      frequency: "weekly",
      time: "13:40",
      day: "sunday",
      intervalDays: 7,
      startDate: "2026-01-01",
      generateDaysAhead: 21,
      lastRunAt: null,
      lastAttemptAt: null,
      lastRunStatus: null,
      lastRunError: null,
      lastGeneratedCount: null,
      ...automationOverrides,
    },
  },
  categories: [{ id: "cat-1", name: "Under 12" }],
  trainings: [],
  weekly_schedule: weeklySchedule,
  trainers: [{ id: "trainer-1", name: "Mario Rossi", categories: ["cat-1"] }],
  structures: [
    {
      id: "structure-1",
      name: "Struttura A",
      fields: [{ id: "field-1", name: "Campo 1" }],
    },
  ],
});

test("due automation is selected: runner picks up the club exactly at the 13:40 checkpoint", async () => {
  const fake = createFakePrisma({ club: [clubFixture()] });
  setPrismaClientForTests(fake);

  const { status, dueCount, results } = await automation.runDueTrainingAutomationForAllClubs(
    CHECKPOINT,
  );

  assert.equal(dueCount, 1);
  assert.equal(status, "success");
  assert.equal(results.length, 1);
  assert.equal(results[0].clubId, CLUB_ID);
  assert.equal(results[0].status, "success");
});

test("non-due automation is not selected: a club whose checkpoint hasn't passed yet is skipped", async () => {
  const notDueYet = clubFixture({
    id: NOT_DUE_CLUB_ID,
    name: NOT_DUE_CLUB_NAME,
    automationOverrides: {
      day: "monday",
      // Already ran for the most recent Monday checkpoint, so the "never
      // run yet -> catch up immediately" shortcut doesn't mask this case:
      // its NEXT Monday checkpoint is still in the future relative to
      // CHECKPOINT (Sunday).
      lastRunAt: "2026-09-07T11:40:00Z",
    },
  });
  const fake = createFakePrisma({ club: [notDueYet] });
  setPrismaClientForTests(fake);

  const { status, dueCount, results } = await automation.runDueTrainingAutomationForAllClubs(
    CHECKPOINT,
  );

  assert.equal(dueCount, 0);
  assert.equal(status, "not_run");
  assert.equal(results.length, 0);
  // And nothing was written to the club at all — lastRunAt is untouched.
  assert.equal(
    fake.__state.club[0].settings.trainingAutomation.lastRunAt,
    "2026-09-07T11:40:00Z",
  );
});

test("planner is invoked and produces real occurrences across the full 21-day horizon, and the writer persists them as club trainings", async () => {
  const fake = createFakePrisma({ club: [clubFixture()] });
  setPrismaClientForTests(fake);

  const result = await automation.runTrainingAutomationForClub(CLUB_ID, { now: CHECKPOINT });

  assert.equal(result.ran, true);
  assert.equal(result.due, true);
  assert.equal(result.status, "success");
  // horizon = 21 days, 2 weekly slots, 4 Sundays fall in [13/09, 04/10] inclusive.
  assert.equal(result.generatedCount, 8);
  assert.equal(result.generatedTrainings.length, 8);

  const persistedClub = fake.__state.club[0];
  assert.equal(persistedClub.trainings.length, 8);

  const checkpointDayTrainings = persistedClub.trainings.filter(
    (training) => training.date === "2026-09-13",
  );
  assert.equal(
    checkpointDayTrainings.length,
    2,
    "both weekly slots for the checkpoint's own Sunday must be among the generated trainings",
  );

  const generatedDates = new Set(persistedClub.trainings.map((t) => t.date));
  assert.deepEqual(
    [...generatedDates].sort(),
    ["2026-09-13", "2026-09-20", "2026-09-27", "2026-10-04"],
    "the writer must cover every Sunday within the configured 21-day horizon, not just the checkpoint day",
  );
});

test("lastRunAt is updated ONLY after a real, successful run — never as a side effect of merely being due", async () => {
  const fake = createFakePrisma({ club: [clubFixture()] });
  setPrismaClientForTests(fake);

  assert.equal(fake.__state.club[0].settings.trainingAutomation.lastRunAt, null);

  const result = await automation.runTrainingAutomationForClub(CLUB_ID, { now: CHECKPOINT });

  assert.equal(result.lastRunAt, CHECKPOINT.toISOString());
  assert.equal(
    fake.__state.club[0].settings.trainingAutomation.lastRunAt,
    CHECKPOINT.toISOString(),
  );
  assert.equal(fake.__state.club[0].settings.trainingAutomation.lastRunStatus, "success");
  assert.equal(fake.__state.club[0].settings.trainingAutomation.lastGeneratedCount, 8);
});

test("next execution advances to 20/09/2026 13:40 once the checkpoint has been consumed by a real run", async () => {
  const fake = createFakePrisma({ club: [clubFixture()] });
  setPrismaClientForTests(fake);

  await automation.runTrainingAutomationForClub(CLUB_ID, { now: CHECKPOINT });

  const persistedSettings = fake.__state.club[0].settings.trainingAutomation;
  const { getNextTrainingAutomationRun, parseTrainingAutomationSettings } = await import(
    "../../src/lib/training-automation-utils.ts"
  );
  const next = getNextTrainingAutomationRun(
    parseTrainingAutomationSettings(persistedSettings),
    new Date(CHECKPOINT.getTime() + 60_000),
  );

  assert.equal(next.toISOString(), NEXT_CHECKPOINT.toISOString());
});

test("a club that is not due is not run again after the checkpoint automation ran, without affecting other clubs", async () => {
  const dueClub = clubFixture();
  const notDueClub = clubFixture({
    id: NOT_DUE_CLUB_ID,
    name: NOT_DUE_CLUB_NAME,
    automationOverrides: { day: "monday", lastRunAt: "2026-09-07T11:40:00Z" },
  });
  const fake = createFakePrisma({ club: [dueClub, notDueClub] });
  setPrismaClientForTests(fake);

  const { results } = await automation.runDueTrainingAutomationForAllClubs(CHECKPOINT);

  assert.equal(results.length, 1);
  assert.equal(results[0].clubId, CLUB_ID);
  assert.equal(
    fake.__state.club.find((c) => c.id === NOT_DUE_CLUB_ID).settings.trainingAutomation
      .lastRunAt,
    "2026-09-07T11:40:00Z",
  );
});

test("failure does NOT masquerade as success: a writer error is reported as failed and lastRunAt stays untouched", async () => {
  const baseFake = createFakePrisma({ club: [clubFixture()] });
  const failingFake = withFailingClubUpdate(baseFake, {
    error: new Error("Simulated DB write failure"),
  });
  setPrismaClientForTests(failingFake);

  await assert.rejects(
    automation.runTrainingAutomationForClub(CLUB_ID, { now: CHECKPOINT }),
    /Simulated DB write failure/,
  );

  // The best-effort failure-record write (the update call after the failed
  // one) must have gone through, proving the attempt without faking a run.
  const persisted = baseFake.__state.club[0].settings.trainingAutomation;
  assert.equal(persisted.lastRunAt, null, "a failed write must never set lastRunAt");
  assert.equal(persisted.lastRunStatus, "failed");
  assert.match(persisted.lastRunError, /Simulated DB write failure/);
});

test("failure at the fleet level is reported as failed via runDueTrainingAutomationForAllClubs, not silently dropped", async () => {
  const baseFake = createFakePrisma({ club: [clubFixture()] });
  const failingFake = withFailingClubUpdate(baseFake, {
    error: new Error("Simulated DB write failure"),
    times: Infinity, // even the best-effort failure-record write fails
  });
  setPrismaClientForTests(failingFake);

  const { status, results } = await automation.runDueTrainingAutomationForAllClubs(CHECKPOINT);

  assert.equal(status, "failed");
  assert.equal(results.length, 1);
  assert.equal(results[0].status, "failed");
  assert.match(results[0].reason, /Simulated DB write failure/);
});

test("partial result: a due-but-broken club and a due-and-healthy club are both reported, and the batch status is partial", async () => {
  const healthyClub = clubFixture();
  const brokenClub = clubFixture({
    id: NOT_DUE_CLUB_ID,
    name: "Club Rotto",
    weeklySchedule: [], // due, but nothing valid to generate -> reason "missing_schedule"
  });
  const fake = createFakePrisma({ club: [healthyClub, brokenClub] });
  setPrismaClientForTests(fake);

  const { status, dueCount, results } = await automation.runDueTrainingAutomationForAllClubs(
    CHECKPOINT,
  );

  assert.equal(dueCount, 2);
  assert.equal(status, "partial");

  const healthyResult = results.find((r) => r.clubId === CLUB_ID);
  const brokenResult = results.find((r) => r.clubId === NOT_DUE_CLUB_ID);
  assert.equal(healthyResult.status, "success");
  assert.equal(brokenResult.status, "failed");

  const brokenSettings = fake.__state.club.find((c) => c.id === NOT_DUE_CLUB_ID).settings
    .trainingAutomation;
  assert.equal(brokenSettings.lastRunAt, null, "missing schedule is not a real run");
  assert.equal(brokenSettings.lastRunStatus, "failed");
});

test("a club with an unrelated, healthy automation is unaffected when another club's run fails (isolation)", async () => {
  const healthyClub = clubFixture();
  const failingClubId = "cccccccc-0000-4000-8000-000000000003";
  const failingClub = clubFixture({ id: failingClubId, name: "Club Che Fallisce" });

  const baseFake = createFakePrisma({ club: [healthyClub, failingClub] });
  const realUpdate = baseFake.club.update.bind(baseFake.club);
  const fake = {
    ...baseFake,
    club: {
      ...baseFake.club,
      update: async (args) => {
        if (args.where.id === failingClubId) {
          throw new Error("Simulated failure for one club only");
        }
        return realUpdate(args);
      },
    },
  };
  setPrismaClientForTests(fake);

  const { results } = await automation.runDueTrainingAutomationForAllClubs(CHECKPOINT);

  const healthyResult = results.find((r) => r.clubId === CLUB_ID);
  const failingResult = results.find((r) => r.clubId === failingClubId);
  assert.equal(healthyResult.status, "success");
  assert.equal(healthyResult.generatedCount, 8);
  assert.equal(failingResult.status, "failed");
});

test("timezone Europe/Rome determinism: the checkpoint fires on the Sunday it was configured for, not shifted by ambient server timezone", async () => {
  const fake = createFakePrisma({ club: [clubFixture()] });
  setPrismaClientForTests(fake);

  const result = await automation.runTrainingAutomationForClub(CLUB_ID, { now: CHECKPOINT });

  assert.equal(result.due, true);
  assert.ok(
    result.generatedTrainings.some((training) => training.date === "2026-09-13"),
    "the checkpoint's own Sunday (13/09/2026) must be among the generated occurrences",
  );
});
