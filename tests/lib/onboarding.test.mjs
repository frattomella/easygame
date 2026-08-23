import assert from "node:assert/strict";
import test from "node:test";

import {
  ONBOARDING_STEP_IDS,
  canResumeOnboarding,
  emptyOnboardingState,
  normalizeOnboardingState,
  onboardingProgress,
  resumeOnboardingStep,
  shouldPromptOnboarding,
  withCompletedOnboarding,
  withCompletedStep,
  withOnboardingSettings,
  withSkippedOnboarding,
  withStartedOnboarding,
} from "../../src/lib/onboarding.ts";

/**
 * Blocco 4 — onboarding breve, opzionale e riprendibile.
 *
 * Le due proprieta che i test proteggono sono quelle promesse all'utente:
 * saltare non ripropone il banner, e saltare non cancella il percorso.
 */

const NOW = "2026-08-23T10:00:00.000Z";
const LATER = "2026-08-24T09:00:00.000Z";

test("un club senza onboarding parte da zero", () => {
  const state = normalizeOnboardingState({});
  assert.deepEqual(state, emptyOnboardingState());
  assert.equal(state.status, "pending");
  assert.equal(shouldPromptOnboarding(state), true);
  assert.equal(resumeOnboardingStep(state), "club");
});

test("uno stato salvato male non fa esplodere la pagina", () => {
  const state = normalizeOnboardingState({
    onboarding: {
      status: "qualcosa-di-strano",
      completedSteps: ["club", "passo-inventato", "club"],
      startedAt: 12345,
    },
  });

  assert.deepEqual(state.completedSteps, ["club"]);
  assert.equal(state.status, "in_progress");
  assert.equal(state.startedAt, null);
});

test("completare tutti i passi chiude l'onboarding da solo", () => {
  let state = withStartedOnboarding(emptyOnboardingState(), NOW);
  assert.equal(state.status, "in_progress");
  assert.equal(state.startedAt, NOW);

  for (const step of ONBOARDING_STEP_IDS) {
    state = withCompletedStep(state, step, NOW);
  }

  assert.equal(state.status, "completed");
  assert.equal(state.completedAt, NOW);
  assert.equal(onboardingProgress(state).percent, 100);
  assert.equal(shouldPromptOnboarding(state), false);
  assert.equal(canResumeOnboarding(state), false);
});

test("saltare non ripropone il banner ma non perde i passi fatti", () => {
  let state = withCompletedStep(emptyOnboardingState(), "club", NOW);
  state = withSkippedOnboarding(state, NOW);

  assert.equal(state.status, "skipped");
  assert.equal(state.skippedAt, NOW);
  assert.deepEqual(state.completedSteps, ["club"]);
  assert.equal(
    shouldPromptOnboarding(state),
    false,
    "chi ha saltato non deve rivedere l'invito a ogni accesso",
  );
  assert.equal(
    canResumeOnboarding(state),
    true,
    "saltare non e definitivo: resta raggiungibile",
  );
  assert.equal(resumeOnboardingStep(state), "season");
});

test("riprendere dopo aver saltato riporta lo stato in corso", () => {
  const skipped = withSkippedOnboarding(
    withCompletedStep(emptyOnboardingState(), "club", NOW),
    NOW,
  );
  const resumed = withCompletedStep(
    withStartedOnboarding(skipped, LATER),
    "season",
    LATER,
  );

  assert.equal(resumed.status, "in_progress");
  assert.equal(resumed.skippedAt, null);
  assert.deepEqual(resumed.completedSteps, ["club", "season"]);
  assert.equal(resumed.startedAt, NOW, "l'inizio resta quello originale");
  assert.equal(resumed.updatedAt, LATER);
});

test("un onboarding gia completato non torna indietro", () => {
  const completed = withCompletedOnboarding(emptyOnboardingState(), NOW);
  assert.deepEqual(withSkippedOnboarding(completed, LATER), completed);
  assert.deepEqual(withStartedOnboarding(completed, LATER), completed);
});

test("lo stato si innesta nelle impostazioni senza toccare il resto", () => {
  const settings = {
    seasons: [{ id: "season-1" }],
    activeSeasonId: "season-1",
    paymentSettings: { enabled: true },
  };
  const next = withOnboardingSettings(
    settings,
    withCompletedStep(emptyOnboardingState(), "club", NOW),
  );

  assert.deepEqual(next.seasons, settings.seasons);
  assert.equal(next.activeSeasonId, "season-1");
  assert.deepEqual(next.paymentSettings, settings.paymentSettings);
  assert.deepEqual(next.onboarding.completedSteps, ["club"]);
  assert.deepEqual(
    normalizeOnboardingState(next).completedSteps,
    ["club"],
    "quello che si scrive e quello che si rilegge",
  );
});

test("il progresso conta i passi, non le percentuali arrotondate a caso", () => {
  const state = withCompletedStep(
    withCompletedStep(emptyOnboardingState(), "club", NOW),
    "season",
    NOW,
  );
  assert.deepEqual(onboardingProgress(state), {
    completed: 2,
    total: 5,
    percent: 40,
  });
});
