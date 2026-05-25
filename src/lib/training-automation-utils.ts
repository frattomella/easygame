export type TrainingAutomationFrequency = "weekly" | "interval";

export type TrainingAutomationSettings = {
  enabled: boolean;
  frequency: TrainingAutomationFrequency;
  time: string;
  day: string;
  intervalDays: number;
  startDate: string;
  generateDaysAhead: number;
  lastRunAt: string | null;
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
};

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

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
