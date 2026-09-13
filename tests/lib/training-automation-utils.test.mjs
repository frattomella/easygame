import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * Regression coverage for the UAT bug: "l'automazione settimanale ha
 * superato il checkpoint ma non ha generato".
 *
 * These tests pin the timezone explicitly to Europe/Rome (never relying on
 * the ambient machine/CI timezone) so the checkpoint math is deterministic
 * regardless of where the suite runs.
 */

let utils;

before(async () => {
  process.env.TZ = "Europe/Rome";
  utils = await import("../../src/lib/training-automation-utils.ts");
});

// Sunday 13/09/2026 13:40 Europe/Rome === 2026-09-13T11:40:00Z (CEST, UTC+2)
const CHECKPOINT_UTC = "2026-09-13T11:40:00Z";
const NEXT_CHECKPOINT_UTC = "2026-09-20T11:40:00Z";

const weeklySundaySettings = (overrides = {}) =>
  utils.parseTrainingAutomationSettings({
    ...utils.DEFAULT_TRAINING_AUTOMATION_SETTINGS,
    enabled: true,
    frequency: "weekly",
    day: "sunday",
    time: "13:40",
    generateDaysAhead: 21,
    ...overrides,
  });

test("weekly automation is due at the exact checkpoint (13/09/2026 13:40 Europe/Rome)", () => {
  const settings = weeklySundaySettings();
  const now = new Date(CHECKPOINT_UTC);

  assert.equal(utils.shouldRunTrainingAutomation(settings, now), true);
});

test("weekly automation is NOT due one minute before the checkpoint", () => {
  // lastRunAt reflects a real run for the *previous* week's checkpoint, so
  // the never-run "catch up immediately" behavior doesn't mask this
  // assertion — see the dedicated never-run test below for that case.
  const settings = weeklySundaySettings({ lastRunAt: "2026-09-06T11:40:00Z" });
  const oneMinuteBefore = new Date(new Date(CHECKPOINT_UTC).getTime() - 60_000);

  assert.equal(utils.shouldRunTrainingAutomation(settings, oneMinuteBefore), false);
});

test("an automation that has NEVER run is due immediately once enabled, even before its first weekly checkpoint occurrence in the past week", () => {
  const settings = weeklySundaySettings(); // lastRunAt: null
  const oneMinuteBefore = new Date(new Date(CHECKPOINT_UTC).getTime() - 60_000);

  assert.equal(
    utils.shouldRunTrainingAutomation(settings, oneMinuteBefore),
    true,
    "with no lastRunAt, last week's already-past checkpoint counts as due — catch-up behavior, by design",
  );
});

test("disabled automation is never due, even past the checkpoint", () => {
  const settings = weeklySundaySettings({ enabled: false });
  const now = new Date(CHECKPOINT_UTC);

  assert.equal(utils.shouldRunTrainingAutomation(settings, now), false);
});

test("automation already run for this week's checkpoint is not due again", () => {
  const settings = weeklySundaySettings({ lastRunAt: CHECKPOINT_UTC });
  const justAfter = new Date(new Date(CHECKPOINT_UTC).getTime() + 60_000);

  assert.equal(utils.shouldRunTrainingAutomation(settings, justAfter), false);
});

test("next execution is still THIS week before the checkpoint passes", () => {
  const settings = weeklySundaySettings();
  const before2 = new Date(new Date(CHECKPOINT_UTC).getTime() - 60_000);

  const next = utils.getNextTrainingAutomationRun(settings, before2);
  assert.equal(next.toISOString(), new Date(CHECKPOINT_UTC).toISOString());
});

test("next execution advances to 20/09/2026 13:40 once the checkpoint has passed", () => {
  const settings = weeklySundaySettings();
  const justAfter = new Date(new Date(CHECKPOINT_UTC).getTime() + 60_000);

  const next = utils.getNextTrainingAutomationRun(settings, justAfter);
  assert.equal(next.toISOString(), new Date(NEXT_CHECKPOINT_UTC).toISOString());
});

test("the next-execution projection is independent of whether a real run happened", () => {
  // This is the exact discrepancy from the bug report: the UI's "Prossima
  // esecuzione" is pure date arithmetic (getNextTrainingAutomationRun) and
  // says nothing about execution. The real due-check
  // (shouldRunTrainingAutomation) must stay true — proving the automation
  // is still due — no matter what the projection displays, until a real
  // lastRunAt is persisted.
  const settings = weeklySundaySettings(); // lastRunAt still null: never ran
  const justAfter = new Date(new Date(CHECKPOINT_UTC).getTime() + 60_000);

  const projectedNext = utils.getNextTrainingAutomationRun(settings, justAfter);
  assert.equal(projectedNext.toISOString(), new Date(NEXT_CHECKPOINT_UTC).toISOString());
  assert.equal(
    utils.shouldRunTrainingAutomation(settings, justAfter),
    true,
    "due-check must still report the automation as due — nothing ran yet",
  );
});

test(
  "KNOWN RISK: due/next-run math reads server-local Date parts, so a server whose " +
    "runtime timezone isn't Europe/Rome (e.g. Vercel defaults to UTC) resolves a " +
    "near-midnight weekly checkpoint to a different real-world moment — almost a " +
    "full week off, in this example",
  () => {
    // Club configures "Monday 00:30" meaning Europe/Rome wall-clock time.
    const settings = utils.parseTrainingAutomationSettings({
      ...utils.DEFAULT_TRAINING_AUTOMATION_SETTINGS,
      enabled: true,
      frequency: "weekly",
      day: "monday",
      time: "00:30",
    });
    const now = new Date("2026-09-13T22:35:00Z"); // Mon 14/09 00:35 in Rome, Sun 22:35 in UTC

    const originalTz = process.env.TZ;
    try {
      process.env.TZ = "Europe/Rome";
      const nextInRome = utils.getNextTrainingAutomationRun(settings, now);

      process.env.TZ = "UTC";
      const nextInUtc = utils.getNextTrainingAutomationRun(settings, now);

      // In Rome, "now" is just past this week's Monday 00:30 checkpoint, so the
      // next occurrence is a week away. Interpreted as UTC, the same instant is
      // still Sunday evening, so "Monday 00:30" is read as still hours away —
      // landing on a completely different calendar date than the Rome answer.
      assert.equal(nextInRome.toISOString(), "2026-09-20T22:30:00.000Z");
      assert.equal(nextInUtc.toISOString(), "2026-09-14T00:30:00.000Z");
      assert.notEqual(
        nextInRome.toISOString(),
        nextInUtc.toISOString(),
        "the same club configuration and the same instant must not resolve to " +
          "different real-world checkpoints depending on the server's ambient " +
          "timezone. Not fixed by this change — mitigate by setting TZ=Europe/Rome " +
          "on the server runtime (e.g. the Vercel project's env vars).",
      );
    } finally {
      process.env.TZ = originalTz;
    }
  },
);
