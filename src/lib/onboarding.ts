/**
 * Stato dell'onboarding di un club.
 *
 * Vive dentro `clubs.settings.onboarding`: non serve una tabella per cinque
 * flag, e cosi lo stato viaggia insieme al club — chiunque apra quel club,
 * da qualunque dispositivo, riprende da dove era rimasto.
 *
 * Due proprieta sono deliberate:
 *
 * - **saltabile**: `skipped` non e un fallimento, e una scelta. Chi salta non
 *   deve rivedere il banner a ogni accesso.
 * - **riprendibile**: `skipped` non e nemmeno definitivo. Finche l'onboarding
 *   non e completato resta raggiungibile dalla scheda Club, e riparte dal
 *   primo passo non ancora fatto.
 *
 * Modulo puro: nessuna rete, nessun DOM, nessun `Date.now()` implicito — chi
 * chiama passa il momento.
 */

export type OnboardingStepId =
  | "club"
  | "season"
  | "categories"
  | "athletes"
  | "tour";

export type OnboardingStatus = "pending" | "in_progress" | "skipped" | "completed";

export type OnboardingStep = {
  id: OnboardingStepId;
  title: string;
  description: string;
};

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "club",
    title: "Dati del club",
    description: "Nome, sport e recapiti: compaiono su documenti e comunicazioni.",
  },
  {
    id: "season",
    title: "Stagione",
    description:
      "La stagione delimita i dati che vedrai: categorie, quote e allenamenti appartengono a una stagione.",
  },
  {
    id: "categories",
    title: "Categorie",
    description: "I gruppi per anno di nascita in cui si dividono gli atleti.",
  },
  {
    id: "athletes",
    title: "Primi atleti",
    description: "Bastano due o tre nomi per vedere come funziona, o un import.",
  },
  {
    id: "tour",
    title: "Le aree di EasyGame",
    description: "Dove si trova cosa, in mezzo minuto.",
  },
];

export const ONBOARDING_STEP_IDS = ONBOARDING_STEPS.map((step) => step.id);

export type OnboardingState = {
  status: OnboardingStatus;
  completedSteps: OnboardingStepId[];
  startedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  skippedAt: string | null;
};

export const emptyOnboardingState = (): OnboardingState => ({
  status: "pending",
  completedSteps: [],
  startedAt: null,
  updatedAt: null,
  completedAt: null,
  skippedAt: null,
});

const isStepId = (value: unknown): value is OnboardingStepId =>
  typeof value === "string" &&
  (ONBOARDING_STEP_IDS as string[]).includes(value);

const asIsoOrNull = (value: unknown) =>
  typeof value === "string" && value.trim() ? value : null;

export const normalizeOnboardingState = (
  settings: unknown,
): OnboardingState => {
  const source =
    typeof settings === "object" && settings
      ? ((settings as Record<string, any>).onboarding ?? null)
      : null;

  if (typeof source !== "object" || !source) {
    return emptyOnboardingState();
  }

  const raw = source as Record<string, any>;
  const completedSteps = Array.isArray(raw.completedSteps)
    ? Array.from(new Set(raw.completedSteps.filter(isStepId)))
    : [];

  const declaredStatus = String(raw.status || "");
  const status: OnboardingStatus =
    declaredStatus === "completed" ||
    declaredStatus === "skipped" ||
    declaredStatus === "in_progress"
      ? declaredStatus
      : completedSteps.length
        ? "in_progress"
        : "pending";

  return {
    status,
    completedSteps,
    startedAt: asIsoOrNull(raw.startedAt),
    updatedAt: asIsoOrNull(raw.updatedAt),
    completedAt: asIsoOrNull(raw.completedAt),
    skippedAt: asIsoOrNull(raw.skippedAt),
  };
};

const touch = (state: OnboardingState, now: string): OnboardingState => ({
  ...state,
  startedAt: state.startedAt || now,
  updatedAt: now,
});

export const withStartedOnboarding = (
  state: OnboardingState,
  now: string,
): OnboardingState =>
  state.status === "completed"
    ? state
    : touch({ ...state, status: "in_progress", skippedAt: null }, now);

export const withCompletedStep = (
  state: OnboardingState,
  step: OnboardingStepId,
  now: string,
): OnboardingState => {
  const completedSteps = state.completedSteps.includes(step)
    ? state.completedSteps
    : [...state.completedSteps, step];

  const everyStepDone = ONBOARDING_STEP_IDS.every((id) =>
    completedSteps.includes(id),
  );

  return touch(
    {
      ...state,
      completedSteps,
      status: everyStepDone ? "completed" : "in_progress",
      completedAt: everyStepDone ? now : state.completedAt,
      skippedAt: null,
    },
    now,
  );
};

export const withSkippedOnboarding = (
  state: OnboardingState,
  now: string,
): OnboardingState =>
  state.status === "completed"
    ? state
    : touch({ ...state, status: "skipped", skippedAt: now }, now);

export const withCompletedOnboarding = (
  state: OnboardingState,
  now: string,
): OnboardingState =>
  touch(
    {
      ...state,
      status: "completed",
      completedSteps: [...ONBOARDING_STEP_IDS],
      completedAt: now,
    },
    now,
  );

/** Primo passo non ancora completato; l'ultimo se sono tutti fatti. */
export const resumeOnboardingStep = (
  state: OnboardingState,
): OnboardingStepId =>
  ONBOARDING_STEP_IDS.find((id) => !state.completedSteps.includes(id)) ||
  ONBOARDING_STEP_IDS[ONBOARDING_STEP_IDS.length - 1];

export const onboardingProgress = (state: OnboardingState) => {
  const total = ONBOARDING_STEP_IDS.length;
  const completed = state.completedSteps.length;
  return {
    completed,
    total,
    percent: total ? Math.round((completed / total) * 100) : 0,
  };
};

/** Vero quando vale la pena proporlo da solo, senza che nessuno lo chieda. */
export const shouldPromptOnboarding = (state: OnboardingState) =>
  state.status === "pending" || state.status === "in_progress";

/** Vero finche l'onboarding resta raggiungibile: anche se e stato saltato. */
export const canResumeOnboarding = (state: OnboardingState) =>
  state.status !== "completed";

export const withOnboardingSettings = (
  settings: Record<string, any> | null | undefined,
  state: OnboardingState,
) => ({
  ...(typeof settings === "object" && settings ? settings : {}),
  onboarding: state,
});
