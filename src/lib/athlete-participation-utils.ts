import {
  getParticipationCategoryBadgeLabel,
  getParticipationCategoryContext,
  type ParticipationCategoryContext,
} from "./athlete-category-memberships";

export type NormalizedAttendanceEntry = {
  athleteId: string;
  present: boolean;
  notes: string;
  isExtraCategory: boolean;
  isManualExtra: boolean;
  categoryMembershipType?: string | null;
};

export type NormalizedConvocationEntry = {
  athleteId: string;
  isExtraCategory: boolean;
  isManualExtra: boolean;
  categoryMembershipType?: string | null;
};

export type AthleteParticipationEvent = {
  id: string;
  type: "training" | "match";
  title: string;
  date: string | null;
  categoryLabel: string;
  statusLabel: string;
  context: ParticipationCategoryContext;
  contextLabel: string;
  notes?: string;
};

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const firstNonEmptyString = (...values: unknown[]) => {
  for (const value of values) {
    const candidate = String(value || "").trim();
    if (candidate) {
      return candidate;
    }
  }

  return "";
};

const getEventDate = (value: any) =>
  firstNonEmptyString(
    value?.date,
    value?.start_date,
    value?.startDate,
    value?.scheduled_at,
    value?.scheduledAt,
  ) || null;

const getEventCategoryLabel = (value: any) =>
  firstNonEmptyString(
    value?.category_name,
    value?.categoryName,
    value?.category?.name,
    value?.category,
  ) || "Categoria";

const getEventCategories = (value: any) => {
  const nested = Array.isArray(value?.categories) ? value.categories : [];
  const categories = [
    ...nested,
    value?.category_id,
    value?.categoryId,
    value?.category_name,
    value?.categoryName,
    value?.category,
  ].filter((entry) => entry !== undefined && entry !== null && entry !== "");

  return categories;
};

export const normalizeTrainingAttendanceEntries = (
  source: unknown,
): NormalizedAttendanceEntry[] => {
  const rawEntries = Array.isArray(source)
    ? source
    : isRecord(source) && Array.isArray(source.attendance)
      ? source.attendance
      : [];

  return rawEntries
    .map((entry) => {
      if (typeof entry === "string") {
        return {
          athleteId: entry,
          present: false,
          notes: "",
          isExtraCategory: false,
          isManualExtra: false,
          categoryMembershipType: null,
        };
      }

      if (!isRecord(entry)) {
        return null;
      }

      const athleteId = firstNonEmptyString(
        entry.athleteId,
        entry.athlete_id,
        entry.id,
      );

      if (!athleteId) {
        return null;
      }

      return {
        athleteId,
        present: Boolean(
          entry.present ??
            (typeof entry.status === "string"
              ? entry.status.toLowerCase() === "present"
              : false),
        ),
        notes: firstNonEmptyString(entry.notes),
        isExtraCategory: Boolean(
          entry.isExtraCategory ?? entry.is_extra_category ?? false,
        ),
        isManualExtra: Boolean(
          entry.isManualExtra ?? entry.is_manual_extra ?? false,
        ),
        categoryMembershipType:
          firstNonEmptyString(
            entry.categoryMembershipType,
            entry.category_membership_type,
            entry.relationshipToTrainingCategory,
            entry.relationshipToEventCategory,
          ) || null,
      };
    })
    .filter(Boolean) as NormalizedAttendanceEntry[];
};

export const normalizeMatchConvocationEntries = (
  source: unknown,
): NormalizedConvocationEntry[] => {
  const record = isRecord(source) ? source : {};
  const rawEntries = Array.isArray(record.convocationEntries)
    ? record.convocationEntries
    : Array.isArray(record.convocation_entries)
      ? record.convocation_entries
      : Array.isArray(record.convocatedAthletes)
        ? record.convocatedAthletes
        : Array.isArray(source)
          ? source
          : [];

  return rawEntries
    .map((entry) => {
      if (typeof entry === "string") {
        return {
          athleteId: entry,
          isExtraCategory: false,
          isManualExtra: false,
          categoryMembershipType: null,
        };
      }

      if (!isRecord(entry)) {
        return null;
      }

      const athleteId = firstNonEmptyString(
        entry.athleteId,
        entry.athlete_id,
        entry.id,
      );

      if (!athleteId) {
        return null;
      }

      return {
        athleteId,
        isExtraCategory: Boolean(
          entry.isExtraCategory ?? entry.is_extra_category ?? false,
        ),
        isManualExtra: Boolean(
          entry.isManualExtra ?? entry.is_manual_extra ?? false,
        ),
        categoryMembershipType:
          firstNonEmptyString(
            entry.categoryMembershipType,
            entry.category_membership_type,
            entry.relationshipToMatchCategory,
            entry.relationshipToEventCategory,
          ) || null,
      };
    })
    .filter(Boolean) as NormalizedConvocationEntry[];
};

export const buildAthleteParticipationAnalytics = ({
  athleteId,
  athlete,
  trainings = [],
  matches = [],
}: {
  athleteId: string;
  athlete?: unknown;
  trainings?: any[];
  matches?: any[];
}) => {
  const events: AthleteParticipationEvent[] = [];
  let presenceCount = 0;
  let convocationCount = 0;
  let playedMatchesCount = 0;
  let extraCategoryCount = 0;

  trainings.forEach((training) => {
    const attendanceEntries = normalizeTrainingAttendanceEntries(training);
    const attendanceEntry = attendanceEntries.find(
      (entry) => entry.athleteId === athleteId,
    );

    if (!attendanceEntry) {
      return;
    }

    const context = getParticipationCategoryContext({
      athlete,
      eventCategories: getEventCategories(training),
      entry: attendanceEntry,
    });

    if (attendanceEntry.present) {
      presenceCount += 1;
    }

    if (context !== "primary") {
      extraCategoryCount += 1;
    }

    events.push({
      id: `training-${training.id}-${athleteId}`,
      type: "training",
      title: String(training?.title || "Allenamento"),
      date: getEventDate(training),
      categoryLabel: getEventCategoryLabel(training),
      statusLabel: attendanceEntry.present ? "Presente" : "Assente",
      context,
      contextLabel: getParticipationCategoryBadgeLabel(context),
      notes: attendanceEntry.notes || undefined,
    });
  });

  matches.forEach((match) => {
    const convocationEntry = normalizeMatchConvocationEntries(match).find(
      (entry) => entry.athleteId === athleteId,
    );

    if (!convocationEntry) {
      return;
    }

    convocationCount += 1;
    if (String(match?.status || "").toLowerCase() === "completed") {
      playedMatchesCount += 1;
    }

    const context = getParticipationCategoryContext({
      athlete,
      eventCategories: getEventCategories(match),
      entry: convocationEntry,
    });

    if (context !== "primary") {
      extraCategoryCount += 1;
    }

    events.push({
      id: `match-${match.id}-${athleteId}`,
      type: "match",
      title: String(match?.title || match?.opponent || "Partita"),
      date: getEventDate(match),
      categoryLabel: getEventCategoryLabel(match),
      statusLabel: "Convocato",
      context,
      contextLabel: getParticipationCategoryBadgeLabel(context),
    });
  });

  events.sort((left, right) => {
    const leftTime = left.date ? new Date(left.date).getTime() : 0;
    const rightTime = right.date ? new Date(right.date).getTime() : 0;
    return rightTime - leftTime;
  });

  return {
    presenceCount,
    convocationCount,
    playedMatchesCount,
    extraCategoryCount,
    events,
  };
};
