export type TrainingAutomationFrequency = "weekly" | "interval";

/**
 * **Un'eccezione alla generazione** (WP-15): niente di nuovo da generare fra
 * `from` e `to` (incluse), per lo slot indicato — o per **tutto** il
 * programma se `slotId` e assente, che e la forma di una sospensione
 * (vacanze natalizie, torneo, chiusura impianti). Un salto di una sola
 * occorrenza e lo stesso concetto con `from === to`: non e un secondo
 * modello, e lo stesso con un intervallo di un giorno.
 */
export type TrainingAutomationExclusion = {
  id: string;
  from: string;
  to: string;
  reason?: string | null;
  slotId?: string | null;
};

export type TrainingAutomationSettings = {
  enabled: boolean;
  frequency: TrainingAutomationFrequency;
  time: string;
  day: string;
  intervalDays: number;
  startDate: string;
  generateDaysAhead: number;
  lastRunAt: string | null;
  /**
   * L'ultimo giorno fino a cui un'esecuzione (automatica, manuale o
   * «Genera fino a...») ha davvero generato, in `YYYY-MM-DD` (WP-16). Non e
   * uno stato calcolato a parte: e cio che l'ultima esecuzione ha scritto di
   * se stessa, per poterlo mostrare senza rileggere il calendario.
   */
  generatedUntil: string | null;
  /** Le sospensioni/eccezioni attive (WP-15). Mai generate: la lista resta corta. */
  exclusions: TrainingAutomationExclusion[];
};

export const TRAINING_AUTOMATION_DAY_LABELS: Record<string, string> = {
  monday: "Lunedì",
  tuesday: "Martedì",
  wednesday: "Mercoledì",
  thursday: "Giovedì",
  friday: "Venerdì",
  saturday: "Sabato",
  sunday: "Domenica",
};

const DAY_TO_NUMBER: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

export const DEFAULT_TRAINING_AUTOMATION_SETTINGS: TrainingAutomationSettings = {
  enabled: false,
  frequency: "weekly",
  time: "23:00",
  day: "sunday",
  intervalDays: 7,
  startDate: todayIsoDate(),
  generateDaysAhead: 21,
  lastRunAt: null,
  generatedUntil: null,
  exclusions: [],
};

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isValidIsoDate = (value: unknown) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

const normalizeExclusion = (
  value: unknown,
): TrainingAutomationExclusion | null => {
  if (!isRecord(value)) return null;

  const from = String(value.from || "").slice(0, 10);
  const to = String(value.to || value.from || "").slice(0, 10);
  if (!isValidIsoDate(from) || !isValidIsoDate(to) || to < from) return null;

  const slotId = String(value.slotId || "").trim() || null;
  const reason = String(value.reason || "").trim() || null;
  /*
    Deterministico apposta: `parseTrainingAutomationSettings` gira a ogni
    lettura, e un id casuale qui cambierebbe a ogni parse per una voce che
    non ne ha ancora uno proprio — instabile esattamente dove servirebbe
    stabile (confronti, chiavi React, rimozione mirata).
  */
  const id =
    String(value.id || "").trim() || `excl-${from}-${to}-${slotId || "club"}`;

  return { id, from, to, reason, slotId };
};

const normalizeExclusions = (value: unknown): TrainingAutomationExclusion[] =>
  (Array.isArray(value) ? value : [])
    .map(normalizeExclusion)
    .filter((entry): entry is TrainingAutomationExclusion => Boolean(entry));

/**
 * Vero se `dateKey` (`YYYY-MM-DD`) cade in una sospensione che riguarda lo
 * slot indicato — o tutto il programma, se la sospensione non nomina uno
 * slot.
 */
export const isDateExcludedForSlot = (
  exclusions: readonly TrainingAutomationExclusion[],
  dateKey: string,
  slotId: string | null | undefined,
) =>
  exclusions.some(
    (exclusion) =>
      dateKey >= exclusion.from &&
      dateKey <= exclusion.to &&
      (!exclusion.slotId || exclusion.slotId === slotId),
  );

const toPositiveInteger = (value: unknown, fallback: number, minimum = 1) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(minimum, Math.trunc(parsed));
};

const normalizeTimeValue = (value: unknown, fallback: string) => {
  const candidate = String(value || "").trim();
  return /^\d{2}:\d{2}$/.test(candidate) ? candidate : fallback;
};

const normalizeDayValue = (value: unknown, fallback: string) => {
  const candidate = String(value || "").trim().toLowerCase();
  return DAY_TO_NUMBER[candidate] !== undefined ? candidate : fallback;
};

export const parseTrainingAutomationSettings = (
  value: unknown,
): TrainingAutomationSettings => {
  const source = isRecord(value) ? value : {};

  return {
    ...DEFAULT_TRAINING_AUTOMATION_SETTINGS,
    ...source,
    enabled: Boolean(source.enabled),
    frequency:
      source.frequency === "interval"
        ? "interval"
        : DEFAULT_TRAINING_AUTOMATION_SETTINGS.frequency,
    time: normalizeTimeValue(
      source.time,
      DEFAULT_TRAINING_AUTOMATION_SETTINGS.time,
    ),
    day: normalizeDayValue(
      source.day,
      DEFAULT_TRAINING_AUTOMATION_SETTINGS.day,
    ),
    intervalDays: toPositiveInteger(
      source.intervalDays,
      DEFAULT_TRAINING_AUTOMATION_SETTINGS.intervalDays,
      1,
    ),
    startDate:
      String(source.startDate || DEFAULT_TRAINING_AUTOMATION_SETTINGS.startDate).slice(
        0,
        10,
      ) || DEFAULT_TRAINING_AUTOMATION_SETTINGS.startDate,
    generateDaysAhead: toPositiveInteger(
      source.generateDaysAhead,
      DEFAULT_TRAINING_AUTOMATION_SETTINGS.generateDaysAhead,
      7,
    ),
    lastRunAt:
      source.lastRunAt === null || source.lastRunAt === undefined
        ? null
        : String(source.lastRunAt),
    generatedUntil:
      source.generatedUntil === null || source.generatedUntil === undefined
        ? null
        : String(source.generatedUntil).slice(0, 10),
    exclusions: normalizeExclusions(source.exclusions),
  };
};

const combineDateAndTime = (date: Date, time: string) => {
  const [hours, minutes] = String(time || "00:00")
    .split(":")
    .map((segment) => Number(segment || 0));
  const nextDate = new Date(date);
  nextDate.setHours(hours, minutes, 0, 0);
  return nextDate;
};

const getLastIntervalDue = (
  settings: TrainingAutomationSettings,
  now: Date,
) => {
  const start = combineDateAndTime(new Date(settings.startDate), settings.time);

  if (Number.isNaN(start.getTime())) {
    return combineDateAndTime(new Date(), settings.time);
  }

  if (start > now) {
    return start;
  }

  const intervalMs = settings.intervalDays * 24 * 60 * 60 * 1000;
  const elapsedIntervals = Math.floor(
    (now.getTime() - start.getTime()) / intervalMs,
  );
  return new Date(start.getTime() + elapsedIntervals * intervalMs);
};

export const getNextTrainingAutomationRun = (
  settings: TrainingAutomationSettings,
  now = new Date(),
) => {
  if (settings.frequency === "interval") {
    const lastDue = getLastIntervalDue(settings, now);
    if (lastDue > now) {
      return lastDue;
    }

    return new Date(
      lastDue.getTime() + settings.intervalDays * 24 * 60 * 60 * 1000,
    );
  }

  const targetDay = DAY_TO_NUMBER[settings.day] ?? 0;
  const nextDate = new Date(now);
  const diff = (targetDay - now.getDay() + 7) % 7;
  nextDate.setDate(now.getDate() + diff);
  const due = combineDateAndTime(nextDate, settings.time);

  if (due > now) {
    return due;
  }

  due.setDate(due.getDate() + 7);
  return due;
};

export const shouldRunTrainingAutomation = (
  settings: TrainingAutomationSettings,
  now = new Date(),
) => {
  if (!settings.enabled) {
    return false;
  }

  const due =
    settings.frequency === "weekly"
      ? (() => {
          const targetDay = DAY_TO_NUMBER[settings.day] ?? 0;
          const currentDue = combineDateAndTime(new Date(now), settings.time);
          currentDue.setDate(
            now.getDate() + ((targetDay - now.getDay() + 7) % 7),
          );

          if (currentDue <= now) {
            return currentDue;
          }

          const previousDue = new Date(currentDue);
          previousDue.setDate(previousDue.getDate() - 7);
          return previousDue;
        })()
      : getLastIntervalDue(settings, now);

  if (!due || due > now) {
    return false;
  }

  if (!settings.lastRunAt) {
    return true;
  }

  const lastRunAt = new Date(settings.lastRunAt);
  if (Number.isNaN(lastRunAt.getTime())) {
    return true;
  }

  return lastRunAt < due;
};
