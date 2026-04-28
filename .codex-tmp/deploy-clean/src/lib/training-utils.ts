import type { NormalizedCategoryOption } from "./category-utils";
import type { NormalizedTrainerViewModel } from "./trainer-utils";
import { getTrainerDisplayName } from "./trainer-utils";

export type ScheduleConflictItem = {
  id?: string;
  day?: string;
  startTime?: string;
  endTime?: string;
  structureId?: string;
  locationId?: string;
  categoryId?: string;
  category?: string;
};

export type TrainingConflictItem = {
  id?: string;
  date?: string | Date;
  time?: string;
  endTime?: string | null;
  locationId?: string | null;
  status?: string | null;
};

export const WEEKLY_SCHEDULE_DAYS = [
  "Lunedì",
  "Martedì",
  "Mercoledì",
  "Giovedì",
  "Venerdì",
  "Sabato",
  "Domenica",
] as const;

const NORMALIZED_WEEKLY_SCHEDULE_DAYS = WEEKLY_SCHEDULE_DAYS.map((day) =>
  day
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""),
);

const DAY_INDEX_TO_WEEKLY_DAY: Record<number, (typeof WEEKLY_SCHEDULE_DAYS)[number]> =
  {
    0: "Domenica",
    1: "Lunedì",
    2: "Martedì",
    3: "Mercoledì",
    4: "Giovedì",
    5: "Venerdì",
    6: "Sabato",
  };

const DEFAULT_TRAINING_DURATION_MINUTES = 90;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const INVALID_TRAINING_TEXT_VALUES = new Set(["", "undefined", "null"]);
const GENERIC_TRAINER_LABELS = new Set([
  "allenatore",
  "allenatore non specificato",
  "coach",
  "coach non specificato",
  "trainer",
  "trainer non specificato",
]);

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeTrainingText = (value: unknown) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (INVALID_TRAINING_TEXT_VALUES.has(trimmed.toLowerCase())) {
      return null;
    }

    return trimmed;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return null;
};

const normalizeLookupValue = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const firstNonEmptyString = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = normalizeTrainingText(value);
    if (normalized) {
      return normalized;
    }
  }

  return "";
};

const uniqueValues = (values: Array<string | null | undefined>) => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const candidate = normalizeTrainingText(value);
    if (!candidate) {
      continue;
    }

    const key = normalizeLookupValue(candidate);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(candidate);
  }

  return normalized;
};

const getTrainingSourceRecord = (training: unknown) => {
  if (!isRecord(training)) {
    return {} as Record<string, unknown>;
  }

  return isRecord(training.data) ? training.data : {};
};

const extractTimeParts = (value: unknown) => {
  const normalized = normalizeTrainingText(value);
  if (!normalized) {
    return [];
  }

  return normalized.match(/\d{1,2}:\d{2}/g) || [];
};

const collectCategoryReferenceValues = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return uniqueValues(value.flatMap((entry) => collectCategoryReferenceValues(entry)));
  }

  if (isRecord(value)) {
    return uniqueValues([
      value.id,
      value.name,
      value.label,
      value.title,
      value.categoryId,
      value.category_id,
      value.categoryName,
      value.category_name,
      ...collectCategoryReferenceValues(value.category),
      ...collectCategoryReferenceValues(value.categories),
    ]);
  }

  const normalized = normalizeTrainingText(value);
  if (!normalized) {
    return [];
  }

  return uniqueValues(
    normalized.split(",").map((entry) => entry.trim()),
  );
};

const collectCategoryColors = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return uniqueValues(value.flatMap((entry) => collectCategoryColors(entry)));
  }

  if (!isRecord(value)) {
    return [];
  }

  return uniqueValues([
    value.color,
    value.categoryColor,
    value.category_color,
    ...collectCategoryColors(value.category),
    ...collectCategoryColors(value.categories),
  ]);
};

const findCategoryMatch = (
  reference: unknown,
  categories: Array<Pick<NormalizedCategoryOption, "id" | "name" | "color">>,
) => {
  const normalizedReference = normalizeLookupValue(reference);
  if (!normalizedReference) {
    return null;
  }

  return (
    categories.find((category) => {
      const normalizedId = normalizeLookupValue(category?.id);
      const normalizedName = normalizeLookupValue(category?.name);

      return (
        normalizedReference === normalizedId ||
        normalizedReference === normalizedName
      );
    }) || null
  );
};

const getCurrentCategoryMatch = (
  training: Record<string, any>,
  categories: Array<Pick<NormalizedCategoryOption, "id" | "name" | "color">>,
) => {
  if (!categories.length) {
    return null;
  }

  const source = getTrainingSourceRecord(training);
  const references = uniqueValues([
    training.categoryId,
    training.category_id,
    training.category?.id,
    ...collectCategoryReferenceValues(training.categories),
    ...collectCategoryReferenceValues(training.category),
    source.categoryId,
    source.category_id,
    source.category?.id,
    ...collectCategoryReferenceValues(source.categories),
    ...collectCategoryReferenceValues(source.category),
  ]);

  for (const reference of references) {
    const match = findCategoryMatch(reference, categories);
    if (match) {
      return match;
    }
  }

  return null;
};

const collectTrainerObjectLabels = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return uniqueValues(value.flatMap((entry) => collectTrainerObjectLabels(entry)));
  }

  if (!isRecord(value)) {
    return [];
  }

  const displayName = normalizeTrainingText(getTrainerDisplayName(value));
  const key = normalizeLookupValue(displayName);

  if (!displayName || !key || GENERIC_TRAINER_LABELS.has(key)) {
    return [];
  }

  return [displayName];
};

const collectTrainerReferences = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return uniqueValues(value.flatMap((entry) => collectTrainerReferences(entry)));
  }

  if (isRecord(value)) {
    return uniqueValues([
      value.id,
      value.name,
      value.email,
      value.user_id,
      value.linkedUserId,
      value.linked_user_id,
      value.trainerId,
      value.trainer_id,
      value.coachId,
      value.coach_id,
      ...collectTrainerReferences(value.trainer),
      ...collectTrainerReferences(value.trainers),
      ...collectTrainerReferences(value.coach),
    ]);
  }

  const normalized = normalizeTrainingText(value);
  if (!normalized) {
    return [];
  }

  return uniqueValues(
    normalized.split(",").map((entry) => entry.trim()),
  );
};

const findTrainerMatch = (
  reference: unknown,
  trainers: Array<Pick<NormalizedTrainerViewModel, "id" | "name" | "email">>,
) => {
  const normalizedReference = normalizeLookupValue(reference);
  if (!normalizedReference) {
    return null;
  }

  return (
    trainers.find((trainer) => {
      const normalizedId = normalizeLookupValue(trainer?.id);
      const normalizedName = normalizeLookupValue(trainer?.name);
      const normalizedEmail = normalizeLookupValue(trainer?.email);

      return (
        normalizedReference === normalizedId ||
        normalizedReference === normalizedName ||
        normalizedReference === normalizedEmail
      );
    }) || null
  );
};

export const timeToMinutes = (value?: string | null) => {
  const normalized = String(value || "").trim();
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
};

export const isValidTimeRange = (
  startTime?: string | null,
  endTime?: string | null,
) => {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);

  if (start === null || end === null) {
    return false;
  }

  return end > start;
};

export const rangesOverlap = (
  startA?: string | null,
  endA?: string | null,
  startB?: string | null,
  endB?: string | null,
) => {
  const firstStart = timeToMinutes(startA);
  const firstEnd = timeToMinutes(endA);
  const secondStart = timeToMinutes(startB);
  const secondEnd = timeToMinutes(endB);

  if (
    firstStart === null ||
    firstEnd === null ||
    secondStart === null ||
    secondEnd === null
  ) {
    return false;
  }

  return firstStart < secondEnd && secondStart < firstEnd;
};

export const findScheduleConflicts = (
  schedule: ScheduleConflictItem[],
  candidate: ScheduleConflictItem,
  options?: { ignoreId?: string },
) =>
  (Array.isArray(schedule) ? schedule : []).filter((item) => {
    if (!item) {
      return false;
    }

    if (options?.ignoreId && item.id === options.ignoreId) {
      return false;
    }

    if (
      !candidate.day ||
      !candidate.structureId ||
      !candidate.locationId ||
      !candidate.startTime ||
      !candidate.endTime
    ) {
      return false;
    }

    return (
      item.day === candidate.day &&
      item.structureId === candidate.structureId &&
      item.locationId === candidate.locationId &&
      rangesOverlap(
        item.startTime,
        item.endTime,
        candidate.startTime,
        candidate.endTime,
      )
    );
  });

const normalizeDateValue = (value?: string | Date | null) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    const next = new Date(value);
    return Number.isNaN(next.getTime()) ? null : next;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const dateOnlyMatch = trimmed.match(DATE_ONLY_PATTERN);
    if (dateOnlyMatch) {
      const next = new Date(
        Number(dateOnlyMatch[1]),
        Number(dateOnlyMatch[2]) - 1,
        Number(dateOnlyMatch[3]),
      );
      next.setHours(0, 0, 0, 0);
      return Number.isNaN(next.getTime()) ? null : next;
    }

    const normalized = new Date(trimmed);
    if (Number.isNaN(normalized.getTime())) {
      return null;
    }

    return normalized;
  }

  const normalized = new Date(value);
  if (Number.isNaN(normalized.getTime())) {
    return null;
  }

  return normalized;
};

export const getTrainingDate = (training: unknown) => {
  if (!isRecord(training)) {
    return null;
  }

  const source = getTrainingSourceRecord(training);

  for (const candidate of [
    training.date,
    training.start_date,
    training.startDate,
    training.scheduled_at,
    training.scheduledAt,
    source.date,
    source.start_date,
    source.startDate,
    source.scheduled_at,
    source.scheduledAt,
  ]) {
    const parsed = normalizeDateValue(candidate as string | Date | null | undefined);
    if (parsed) {
      return parsed;
    }
  }

  return null;
};

export const resolveTrainingWeekday = (training: unknown) => {
  if (isRecord(training)) {
    const source = getTrainingSourceRecord(training);
    const directDay = firstNonEmptyString(
      training.day,
      training.weekday,
      training.weekDay,
      source.day,
      source.weekday,
      source.weekDay,
    );

    if (directDay) {
      const normalizedDay = directDay
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      const matchIndex = NORMALIZED_WEEKLY_SCHEDULE_DAYS.findIndex(
        (day) => day === normalizedDay,
      );

      if (matchIndex >= 0) {
        return WEEKLY_SCHEDULE_DAYS[matchIndex];
      }
    }
  }

  const trainingDate = getTrainingDate(training);
  if (!trainingDate) {
    return null;
  }

  return DAY_INDEX_TO_WEEKLY_DAY[trainingDate.getDay()] || null;
};

export const isSameLocalDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

export const getTrainingStartTime = (training: unknown) => {
  if (!isRecord(training)) {
    return null;
  }

  const source = getTrainingSourceRecord(training);

  return (
    firstNonEmptyString(
      training.start_time,
      training.startTime,
      extractTimeParts(training.time)[0],
      training.time,
      source.start_time,
      source.startTime,
      extractTimeParts(source.time)[0],
      source.time,
    ) || null
  );
};

export const getTrainingEndTime = (training: unknown) => {
  if (!isRecord(training)) {
    return null;
  }

  const source = getTrainingSourceRecord(training);

  return (
    firstNonEmptyString(
      training.end_time,
      training.endTime,
      extractTimeParts(training.time)[1],
      source.end_time,
      source.endTime,
      extractTimeParts(source.time)[1],
    ) || null
  );
};

export const getTrainingTimeLabel = (training: unknown) => {
  const startTime = getTrainingStartTime(training);
  const endTime = getTrainingEndTime(training);

  if (startTime && endTime) {
    return `${startTime} - ${endTime}`;
  }

  if (startTime) {
    return startTime;
  }

  return "Orario da definire";
};

export const isTrainingOnDate = (training: unknown, targetDate: Date) => {
  const trainingDate = getTrainingDate(training);
  return Boolean(trainingDate && isSameLocalDay(trainingDate, targetDate));
};

export const compareTrainingsByStart = (left: unknown, right: unknown) => {
  const leftDate = getTrainingDate(left);
  const rightDate = getTrainingDate(right);
  const leftTimestamp = leftDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const rightTimestamp = rightDate?.getTime() ?? Number.MAX_SAFE_INTEGER;

  if (leftTimestamp !== rightTimestamp) {
    return leftTimestamp - rightTimestamp;
  }

  const leftMinutes = timeToMinutes(getTrainingStartTime(left)) ?? Number.MAX_SAFE_INTEGER;
  const rightMinutes =
    timeToMinutes(getTrainingStartTime(right)) ?? Number.MAX_SAFE_INTEGER;

  if (leftMinutes !== rightMinutes) {
    return leftMinutes - rightMinutes;
  }

  const leftTitle = isRecord(left) ? firstNonEmptyString(left.title, left.id) : "";
  const rightTitle = isRecord(right) ? firstNonEmptyString(right.title, right.id) : "";

  return leftTitle.localeCompare(rightTitle, "it", {
    sensitivity: "base",
  });
};

export const getTrainingCategoryReferences = (training: unknown) => {
  if (!isRecord(training)) {
    return [];
  }

  const source = getTrainingSourceRecord(training);

  return uniqueValues([
    training.categoryId,
    training.category_id,
    training.category?.id,
    training.category_name,
    training.categoryName,
    training.category?.name,
    training.category,
    ...collectCategoryReferenceValues(training.categories),
    ...collectCategoryReferenceValues(training.category),
    source.categoryId,
    source.category_id,
    source.category?.id,
    source.category_name,
    source.categoryName,
    source.category?.name,
    source.category,
    ...collectCategoryReferenceValues(source.categories),
    ...collectCategoryReferenceValues(source.category),
  ]);
};

export const resolveCategoryLabelForTraining = (
  training: unknown,
  categories: Array<Pick<NormalizedCategoryOption, "id" | "name" | "color">> = [],
) => {
  if (!isRecord(training)) {
    return "Categoria assegnata";
  }

  const source = getTrainingSourceRecord(training);
  const currentMatch = getCurrentCategoryMatch(training, categories);
  if (currentMatch?.name) {
    return String(currentMatch.name);
  }

  const explicitLabel = firstNonEmptyString(
    training.category_name,
    training.categoryName,
    training.category?.name,
    source.category_name,
    source.categoryName,
    source.category?.name,
  );

  if (explicitLabel) {
    return explicitLabel;
  }

  const references = getTrainingCategoryReferences(training);

  const fallbackLabel = firstNonEmptyString(
    training.category,
    source.category,
    references[0],
  );

  return fallbackLabel || "Categoria assegnata";
};

export const getTrainingCategoryLabel = resolveCategoryLabelForTraining;

export const getTrainingCategoryColor = (
  training: unknown,
  categories: Array<Pick<NormalizedCategoryOption, "id" | "name" | "color">> = [],
) => {
  if (!isRecord(training)) {
    return "bg-gray-100 text-gray-800";
  }

  const source = getTrainingSourceRecord(training);
  const explicitColor =
    uniqueValues([
      training.categoryColor,
      training.category_color,
      source.categoryColor,
      source.category_color,
      ...collectCategoryColors(training.category),
      ...collectCategoryColors(training.categories),
      ...collectCategoryColors(source.category),
      ...collectCategoryColors(source.categories),
    ])[0] || null;

  if (explicitColor) {
    return explicitColor;
  }

  const references = uniqueValues([
    training.categoryId,
    training.category_id,
    training.category?.id,
    ...collectCategoryReferenceValues(training.categories),
    ...collectCategoryReferenceValues(training.category),
    source.categoryId,
    source.category_id,
    source.category?.id,
    ...collectCategoryReferenceValues(source.categories),
    ...collectCategoryReferenceValues(source.category),
  ]);

  for (const reference of references) {
    const match = findCategoryMatch(reference, categories);
    const color = normalizeTrainingText(match?.color);
    if (color) {
      return color;
    }
  }

  return "bg-gray-100 text-gray-800";
};

export const getTrainingTrainerLabel = (
  training: unknown,
  trainers: Array<Pick<NormalizedTrainerViewModel, "id" | "name" | "email">> = [],
) => {
  if (!isRecord(training)) {
    return "Allenatore non specificato";
  }

  const source = getTrainingSourceRecord(training);
  const explicitLabels = uniqueValues([
    training.trainer_name,
    training.trainerName,
    training.coach_name,
    training.coachName,
    source.trainer_name,
    source.trainerName,
    source.coach_name,
    source.coachName,
    ...collectTrainerObjectLabels(training.trainers),
    ...collectTrainerObjectLabels(training.trainer),
    ...collectTrainerObjectLabels(training.coach),
    ...collectTrainerObjectLabels(source.trainers),
    ...collectTrainerObjectLabels(source.trainer),
    ...collectTrainerObjectLabels(source.coach),
  ]).filter(
    (label) => !GENERIC_TRAINER_LABELS.has(normalizeLookupValue(label)),
  );

  if (explicitLabels.length > 0) {
    return explicitLabels.join(", ");
  }

  const references = uniqueValues([
    ...collectTrainerReferences(training.trainerIds),
    ...collectTrainerReferences(training.trainer_ids),
    ...collectTrainerReferences(training.trainerId),
    ...collectTrainerReferences(training.trainer_id),
    ...collectTrainerReferences(training.coachId),
    ...collectTrainerReferences(training.coach_id),
    ...collectTrainerReferences(training.trainers),
    ...collectTrainerReferences(training.trainer),
    ...collectTrainerReferences(training.coach),
    ...collectTrainerReferences(source.trainerIds),
    ...collectTrainerReferences(source.trainer_ids),
    ...collectTrainerReferences(source.trainerId),
    ...collectTrainerReferences(source.trainer_id),
    ...collectTrainerReferences(source.coachId),
    ...collectTrainerReferences(source.coach_id),
    ...collectTrainerReferences(source.trainers),
    ...collectTrainerReferences(source.trainer),
    ...collectTrainerReferences(source.coach),
  ]);

  const mappedLabels = uniqueValues(
    references.map((reference) => findTrainerMatch(reference, trainers)?.name),
  );

  if (mappedLabels.length > 0) {
    return mappedLabels.join(", ");
  }

  const fallbackLabel = firstNonEmptyString(
    training.trainer,
    training.coach,
    source.trainer,
    source.coach,
  );

  if (
    fallbackLabel &&
    !GENERIC_TRAINER_LABELS.has(normalizeLookupValue(fallbackLabel))
  ) {
    return fallbackLabel;
  }

  return "Allenatore non specificato";
};

export const buildTrainingStart = (
  date?: string | Date | null,
  time?: string | null,
) => {
  const baseDate = normalizeDateValue(date);
  const minutes = timeToMinutes(time);

  if (!baseDate || minutes === null) {
    return null;
  }

  const next = new Date(baseDate);
  next.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return next;
};

export const buildTrainingEnd = (
  date?: string | Date | null,
  startTime?: string | null,
  endTime?: string | null,
) => {
  const start = buildTrainingStart(date, startTime);

  if (!start) {
    return null;
  }

  const explicitEnd = timeToMinutes(endTime);
  if (explicitEnd !== null) {
    const next = new Date(start);
    next.setHours(Math.floor(explicitEnd / 60), explicitEnd % 60, 0, 0);
    return next;
  }

  return new Date(start.getTime() + DEFAULT_TRAINING_DURATION_MINUTES * 60000);
};

export const getTrainingPhase = (
  training: TrainingConflictItem,
  now = new Date(),
) => {
  const normalizedStatus = String(training?.status || "").toLowerCase();

  if (normalizedStatus === "annullato" || normalizedStatus === "cancelled") {
    return "annullato" as const;
  }

  const start = buildTrainingStart(training?.date, training?.time);
  const end = buildTrainingEnd(training?.date, training?.time, training?.endTime);

  if (!start || !end) {
    return "upcoming" as const;
  }

  if (now >= end) {
    return "concluded" as const;
  }

  if (now >= start) {
    return "in_progress" as const;
  }

  return "upcoming" as const;
};

export const isHistoricalTraining = (
  training: TrainingConflictItem,
  now = new Date(),
) => {
  const normalizedStatus = String(training?.status || "").toLowerCase();
  if (normalizedStatus === "completed" || normalizedStatus === "concluded") {
    return true;
  }

  return getTrainingPhase(training, now) === "concluded";
};

export const isScheduledTraining = (
  training: TrainingConflictItem,
  now = new Date(),
) => getTrainingPhase(training, now) === "upcoming";

export const findTrainingsWithMissingCategories = (
  trainings: unknown[],
  categories: Array<Pick<NormalizedCategoryOption, "id" | "name" | "color">> = [],
  options?: {
    now?: Date;
    scheduledOnly?: boolean;
    includeHistorical?: boolean;
  },
) => {
  const now = options?.now || new Date();

  return (Array.isArray(trainings) ? trainings : []).flatMap((training, index) => {
    if (!isRecord(training)) {
      return [];
    }

    const references = getTrainingCategoryReferences(training);
    if (!references.length) {
      return [];
    }

    if (!options?.includeHistorical && getTrainingDate(training)) {
      if (!isScheduledTraining(training, now) && !options?.scheduledOnly) {
        return [];
      }

      if (options?.scheduledOnly && !isScheduledTraining(training, now)) {
        return [];
      }
    }

    if (!options?.includeHistorical && isHistoricalTraining(training, now)) {
      return [];
    }

    if (getCurrentCategoryMatch(training, categories)) {
      return [];
    }

    return [
      {
        id: String(training.id || `missing-category-${index}`),
        references,
        label: resolveCategoryLabelForTraining(training, []),
        training,
      },
    ];
  });
};

export const canRecordTrainingAttendance = (
  training: TrainingConflictItem,
  now = new Date(),
) => {
  const normalizedStatus = String(training?.status || "").toLowerCase();
  if (normalizedStatus === "annullato" || normalizedStatus === "cancelled") {
    return false;
  }

  const trainingDate = normalizeDateValue(training?.date);
  if (!trainingDate) {
    return false;
  }

  trainingDate.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  return trainingDate.getTime() <= today.getTime();
};

export const findTrainingCollisions = (
  trainings: TrainingConflictItem[],
  candidate: TrainingConflictItem,
  options?: { ignoreId?: string },
) =>
  (Array.isArray(trainings) ? trainings : []).filter((training) => {
    if (!training) {
      return false;
    }

    if (options?.ignoreId && training.id === options.ignoreId) {
      return false;
    }

    const normalizedStatus = String(training.status || "").toLowerCase();
    if (normalizedStatus === "annullato" || normalizedStatus === "cancelled") {
      return false;
    }

    if (!candidate.locationId || !training.locationId) {
      return false;
    }

    const trainingDate = normalizeDateValue(training.date);
    const candidateDate = normalizeDateValue(candidate.date);

    if (!trainingDate || !candidateDate) {
      return false;
    }

    const sameDay =
      trainingDate.getFullYear() === candidateDate.getFullYear() &&
      trainingDate.getMonth() === candidateDate.getMonth() &&
      trainingDate.getDate() === candidateDate.getDate();

    if (!sameDay || training.locationId !== candidate.locationId) {
      return false;
    }

    return rangesOverlap(
      training.time,
      training.endTime || null,
      candidate.time,
      candidate.endTime || null,
    );
  });

export const isUpcomingGeneratedTraining = (
  training: TrainingConflictItem & { generated?: boolean | null },
  now = new Date(),
) => {
  if (!training?.generated) {
    return false;
  }

  const start = buildTrainingStart(training.date, training.time);
  return Boolean(start && start > now);
};
