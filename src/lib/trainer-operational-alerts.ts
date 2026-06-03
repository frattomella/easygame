import { recordMatchesCategory } from "@/lib/trainer-dashboard-helpers";
import { getConvocatedAthleteIdsFromMatch } from "@/lib/match-certificate-warnings";

export type TrainingAttendanceState = "complete" | "partial" | "missing";

export type MatchConvocationState =
  | "convocations_complete"
  | "convocations_missing"
  | "not_due_yet"
  | "past_match";

export type TrainerOperationalAlert = {
  key: string;
  type: "missing_attendance" | "missing_convocations";
  title: string;
  message: string;
  recordId: string;
  actionHref: string;
};

const DEFAULT_MATCH_CONVOCATION_DEADLINE_DAYS = 2;

const normalizeValue = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const PRESENT_STATUSES = new Set(["present", "presente", "yes", "true"]);
const RECORDED_ABSENCE_STATUSES = new Set([
  "absent",
  "assente",
  "justified",
  "giustificato",
  "late",
  "ritardo",
  "delayed",
]);
const CANCELLED_STATUSES = new Set(["cancelled", "annullato", "annullata"]);
const COMPLETED_STATUSES = new Set([
  "completed",
  "complete",
  "concluded",
  "concluso",
  "conclusa",
]);

export const getMatchConvocationDeadlineDays = (settings: any) => {
  const rawValue =
    settings?.matchConvocationDeadlineDays ??
    settings?.match_convocation_deadline_days ??
    settings?.matches?.convocationDeadlineDays ??
    settings?.matches?.matchConvocationDeadlineDays;
  const parsedValue = Number(rawValue);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return DEFAULT_MATCH_CONVOCATION_DEADLINE_DAYS;
  }

  return Math.min(Math.round(parsedValue), 30);
};

export const getTrainerRecordAthletes = ({
  record,
  assignedAthletes,
  assignedCategories,
  categories,
}: {
  record: any;
  assignedAthletes: any[];
  assignedCategories: any[];
  categories: any[];
}) => {
  const recordCategories = assignedCategories.filter((category) =>
    recordMatchesCategory(record, category, categories),
  );

  if (recordCategories.length === 0) {
    return [];
  }

  return assignedAthletes.filter((athlete) =>
    recordCategories.some((category) =>
      recordMatchesCategory(athlete, category, categories),
    ),
  );
};

const getAttendanceAthleteId = (entry: any) =>
  String(entry?.athleteId || entry?.athlete_id || entry?.id || "").trim();

const isAttendanceEntryRecorded = (entry: any) => {
  const normalizedStatus = normalizeValue(entry?.status);

  return (
    Boolean(getAttendanceAthleteId(entry)) &&
    (normalizedStatus
      ? PRESENT_STATUSES.has(normalizedStatus) ||
        RECORDED_ABSENCE_STATUSES.has(normalizedStatus)
      : typeof entry?.present === "boolean")
  );
};

export const getTrainingAttendanceStatus = (
  training: any,
  athletes: any[],
) => {
  const total = Array.isArray(athletes) ? athletes.length : 0;
  const allowedAthleteIds = new Set(
    (Array.isArray(athletes) ? athletes : [])
      .map((athlete) => String(athlete?.id || "").trim())
      .filter(Boolean),
  );
  const attendanceEntries = Array.isArray(training?.attendance)
    ? training.attendance
    : [];
  const recordedAthleteIds = new Set<string>();
  let present = 0;

  for (const entry of attendanceEntries) {
    const athleteId = getAttendanceAthleteId(entry);
    if (!athleteId || (allowedAthleteIds.size > 0 && !allowedAthleteIds.has(athleteId))) {
      continue;
    }

    if (!isAttendanceEntryRecorded(entry)) {
      continue;
    }

    recordedAthleteIds.add(athleteId);

    const status = normalizeValue(entry?.status);
    if (entry?.present === true || PRESENT_STATUSES.has(status)) {
      present += 1;
    }
  }

  const registered = recordedAthleteIds.size;
  const state: TrainingAttendanceState =
    total === 0
      ? "complete"
      : registered >= total
      ? "complete"
      : registered > 0
        ? "partial"
        : "missing";

  return {
    state,
    total,
    present,
    registered,
    missing: Math.max(total - registered, 0),
  };
};

export const isTrainingConcluded = (training: any, now = new Date()) => {
  const status = normalizeValue(training?.status);

  if (CANCELLED_STATUSES.has(status)) {
    return false;
  }

  if (COMPLETED_STATUSES.has(status)) {
    return true;
  }

  const endDate = training?.endsAt || training?.startsAt;
  if (!endDate) {
    return false;
  }

  const parsedEndDate = new Date(endDate);
  return !Number.isNaN(parsedEndDate.getTime()) && parsedEndDate < now;
};

export const isTrainingMissingAttendance = (
  training: any,
  athletes: any[],
  now = new Date(),
) => {
  if (!isTrainingConcluded(training, now)) {
    return false;
  }

  const attendanceStatus = getTrainingAttendanceStatus(training, athletes);
  return attendanceStatus.state !== "complete";
};

export const getTrainingAttendanceLabel = (
  state: TrainingAttendanceState,
) => {
  if (state === "complete") {
    return "Presenze complete";
  }

  if (state === "partial") {
    return "Presenze parziali";
  }

  return "Presenze mancanti";
};

export const getConvocatedAthleteIds = (match: any) => {
  return getConvocatedAthleteIdsFromMatch(match);
};

export const getMatchConvocationStatus = ({
  match,
  totalAthletes,
  deadlineDays,
  now = new Date(),
}: {
  match: any;
  totalAthletes: number;
  deadlineDays: number;
  now?: Date;
}) => {
  const status = normalizeValue(match?.status);
  const convocated = getConvocatedAthleteIds(match).length;
  const startsAt = match?.startsAt ? new Date(match.startsAt) : null;

  if (CANCELLED_STATUSES.has(status)) {
    return {
      state: "convocations_complete" as MatchConvocationState,
      convocated,
      total: totalAthletes,
      daysUntilMatch: null as number | null,
    };
  }

  if (convocated > 0) {
    return {
      state: "convocations_complete" as MatchConvocationState,
      convocated,
      total: totalAthletes,
      daysUntilMatch: startsAt
        ? Math.ceil((startsAt.getTime() - now.getTime()) / 86_400_000)
        : null,
    };
  }

  if (!startsAt || Number.isNaN(startsAt.getTime()) || startsAt < now) {
    return {
      state: "past_match" as MatchConvocationState,
      convocated,
      total: totalAthletes,
      daysUntilMatch: null,
    };
  }

  const daysUntilMatch = Math.ceil(
    (startsAt.getTime() - now.getTime()) / 86_400_000,
  );

  return {
    state:
      daysUntilMatch <= deadlineDays
        ? ("convocations_missing" as MatchConvocationState)
        : ("not_due_yet" as MatchConvocationState),
    convocated,
    total: totalAthletes,
    daysUntilMatch,
  };
};

export const getMatchConvocationLabel = (state: MatchConvocationState) => {
  if (state === "convocations_complete") {
    return "Convocazioni complete";
  }

  if (state === "convocations_missing") {
    return "Convocazioni mancanti";
  }

  if (state === "not_due_yet") {
    return "Non ancora in scadenza";
  }

  return "Non registrato";
};

const MATCH_DAY_PHRASES = [
  "Oggi si scende in campo. Testa alta e squadra unita ⚽",
  "Giorno gara: concentrazione, energia e cuore 🔥",
  "È il momento di dare tutto. Forza squadra 💪",
  "Ogni partita è un'occasione per crescere ⚽",
];

export const getMatchDayPhrase = (match: any) => {
  const seed = String(match?.id || match?.date || match?.title || "gara");
  const index =
    seed.split("").reduce((total, char) => total + char.charCodeAt(0), 0) %
    MATCH_DAY_PHRASES.length;

  return MATCH_DAY_PHRASES[index];
};

export const buildTrainerOperationalAlerts = ({
  trainings,
  matches,
  assignedAthletes,
  assignedCategories,
  categories,
  matchConvocationDeadlineDays,
  now = new Date(),
}: {
  trainings: any[];
  matches: any[];
  assignedAthletes: any[];
  assignedCategories: any[];
  categories: any[];
  matchConvocationDeadlineDays: number;
  now?: Date;
}): TrainerOperationalAlert[] => {
  const alerts: TrainerOperationalAlert[] = [];

  for (const training of trainings || []) {
    const trainingAthletes = getTrainerRecordAthletes({
      record: training,
      assignedAthletes,
      assignedCategories,
      categories,
    });

    if (!isTrainingMissingAttendance(training, trainingAthletes, now)) {
      continue;
    }

    alerts.push({
      key: `missing-attendance:${training.id}`,
      type: "missing_attendance",
      title: "Presenze mancanti",
      message: `Completa le presenze di ${training.title || "allenamento"}.`,
      recordId: String(training.id || ""),
      actionHref: `/trainer-dashboard/trainings?focus=${training.id}`,
    });
  }

  for (const match of matches || []) {
    const matchAthletes = getTrainerRecordAthletes({
      record: match,
      assignedAthletes,
      assignedCategories,
      categories,
    });
    const convocationStatus = getMatchConvocationStatus({
      match,
      totalAthletes: matchAthletes.length,
      deadlineDays: matchConvocationDeadlineDays,
      now,
    });

    if (convocationStatus.state !== "convocations_missing") {
      continue;
    }

    alerts.push({
      key: `missing-convocations:${match.id}`,
      type: "missing_convocations",
      title: "Convocazioni mancanti",
      message: `La gara è tra ${convocationStatus.daysUntilMatch ?? matchConvocationDeadlineDays} giorni: prepara le convocazioni.`,
      recordId: String(match.id || ""),
      actionHref: `/trainer-dashboard/matches?focus=${match.id}`,
    });
  }

  return alerts;
};
