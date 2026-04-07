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

const DEFAULT_TRAINING_DURATION_MINUTES = 90;

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
    return new Date(value);
  }

  const normalized = new Date(value);
  if (Number.isNaN(normalized.getTime())) {
    return null;
  }

  return normalized;
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
