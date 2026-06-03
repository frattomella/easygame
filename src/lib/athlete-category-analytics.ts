import {
  normalizeAthleteCategoryMemberships,
  type AthleteCategoryMembership,
} from "@/lib/athlete-category-memberships";
import { getConvocatedAthleteIdsFromMatch } from "@/lib/match-certificate-warnings";

type CategoryOption = { id?: string | null; name?: string | null };

export type AthleteCategoryAnalyticsEvent = {
  id: string;
  title: string;
  date: string | null;
  statusLabel: string;
  notes?: string;
  record: any;
};

export type AthleteUnclassifiedAnalyticsEvent =
  AthleteCategoryAnalyticsEvent & {
    type: "training" | "match";
  };

export type AthleteCategoryAnalytics = {
  categoryId: string;
  categoryName: string;
  isPrimary?: boolean;
  trainingsTotal: number;
  attendancesPresent: number;
  attendancesAbsent: number;
  attendanceRegistered: number;
  attendanceRate: number;
  matchesTotal: number;
  convocationsTotal: number;
  convocationRate: number;
  recentTrainings: AthleteCategoryAnalyticsEvent[];
  recentMatches: AthleteCategoryAnalyticsEvent[];
};

export type AthleteCategoryAnalyticsResult = {
  categories: AthleteCategoryAnalytics[];
  unclassifiedEvents: AthleteUnclassifiedAnalyticsEvent[];
};

const PRESENT_STATUSES = new Set(["present", "presente", "yes", "true"]);

const normalizeReference = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const firstNonEmptyString = (...values: unknown[]) => {
  for (const value of values) {
    const candidate = String(value || "").trim();
    if (candidate) {
      return candidate;
    }
  }

  return "";
};

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const getAthleteId = (athlete: any) =>
  firstNonEmptyString(
    athlete?.id,
    athlete?.athleteId,
    athlete?.athlete_id,
    athlete?.data?.id,
  );

const getEventId = (record: any, fallback: string) =>
  firstNonEmptyString(record?.id, record?.eventId, record?.event_id, fallback);

const getEventTitle = (record: any, fallback: string) =>
  firstNonEmptyString(
    record?.title,
    record?.name,
    record?.opponent ? `vs ${record.opponent}` : "",
    record?.data?.title,
    record?.data?.name,
    fallback,
  );

const getEventDate = (record: any) =>
  firstNonEmptyString(
    record?.date,
    record?.start_date,
    record?.startDate,
    record?.startsAt,
    record?.starts_at,
    record?.scheduled_at,
    record?.scheduledAt,
    record?.data?.date,
    record?.data?.startsAt,
    record?.data?.scheduledAt,
  ) || null;

const getTrainingId = (training: any) =>
  firstNonEmptyString(training?.id, training?.trainingId, training?.training_id);

const getAttendanceTrainingId = (entry: any) =>
  firstNonEmptyString(
    entry?.trainingId,
    entry?.training_id,
    entry?.training?.id,
  );

const getAttendanceAthleteId = (entry: any) =>
  firstNonEmptyString(entry?.athleteId, entry?.athlete_id, entry?.id);

const isPresentAttendanceEntry = (entry: any) => {
  const status = normalizeReference(entry?.status);
  return (
    entry?.present === true ||
    entry?.is_present === true ||
    PRESENT_STATUSES.has(status)
  );
};

const getAttendanceEntriesForTraining = (
  training: any,
  attendanceRecords: any[] = [],
) => {
  const trainingId = getTrainingId(training);
  const embeddedEntries = Array.isArray(training?.attendance)
    ? training.attendance
    : [];
  const externalEntries = trainingId
    ? attendanceRecords.filter(
        (entry) => getAttendanceTrainingId(entry) === trainingId,
      )
    : [];

  return [...embeddedEntries, ...externalEntries];
};

const getAthleteAttendanceEntry = (
  training: any,
  athleteId: string,
  attendanceRecords: any[] = [],
) =>
  getAttendanceEntriesForTraining(training, attendanceRecords).find(
    (entry) => getAttendanceAthleteId(entry) === athleteId,
  ) || null;

const buildCategoryLookup = (categories: CategoryOption[] = []) => {
  const lookup = new Map<string, { id: string; name: string }>();

  categories.forEach((category) => {
    const id = firstNonEmptyString(category?.id);
    const name = firstNonEmptyString(category?.name);

    if (id) {
      lookup.set(normalizeReference(id), { id, name: name || id });
    }

    if (name) {
      lookup.set(normalizeReference(name), { id: id || name, name });
    }
  });

  return lookup;
};

const toCategoryIdentity = (
  rawId: unknown,
  rawName: unknown,
  lookup: Map<string, { id: string; name: string }>,
) => {
  const id = firstNonEmptyString(rawId);
  const name = firstNonEmptyString(rawName);
  const matched =
    lookup.get(normalizeReference(id)) || lookup.get(normalizeReference(name));

  if (!id && !name && !matched) {
    return null;
  }

  return {
    id: matched?.id || id || name,
    name: matched?.name || name || id || "Categoria",
    references: new Set(
      [matched?.id, matched?.name, id, name]
        .map(normalizeReference)
        .filter(Boolean),
    ),
  };
};

const collectCategoryIdentities = (
  value: unknown,
  lookup: Map<string, { id: string; name: string }>,
): Array<{ id: string; name: string; references: Set<string> }> => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectCategoryIdentities(entry, lookup));
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => toCategoryIdentity(entry, entry, lookup))
      .filter(Boolean) as Array<{
      id: string;
      name: string;
      references: Set<string>;
    }>;
  }

  if (!isRecord(value)) {
    const identity = toCategoryIdentity(value, value, lookup);
    return identity ? [identity] : [];
  }

  const identity = toCategoryIdentity(
    value.category_id ?? value.categoryId ?? value.id ?? value.value,
    value.category_name ??
      value.categoryName ??
      value.name ??
      value.label ??
      value.title,
    lookup,
  );

  const nested = [value.category, value.categories]
    .filter((entry) => entry !== undefined)
    .flatMap((entry) => collectCategoryIdentities(entry, lookup));

  return [...(identity ? [identity] : []), ...nested];
};

const getRecordCategoryIdentities = (
  record: any,
  lookup: Map<string, { id: string; name: string }>,
) => {
  const data = isRecord(record?.data) ? record.data : {};
  const payload = isRecord(record?.payload) ? record.payload : {};
  const sources = [
    {
      category_id: record?.category_id ?? record?.categoryId,
      category_name: record?.category_name ?? record?.categoryName,
    },
    record?.category,
    record?.categories,
    record?.category_ids,
    record?.categoryIds,
    {
      category_id: data.category_id ?? data.categoryId,
      category_name: data.category_name ?? data.categoryName,
    },
    data.category,
    data.categories,
    data.category_ids,
    data.categoryIds,
    {
      category_id: payload.category_id ?? payload.categoryId,
      category_name: payload.category_name ?? payload.categoryName,
    },
    payload.category,
    payload.categories,
  ];
  const deduped = new Map<string, { id: string; name: string; references: Set<string> }>();

  sources
    .flatMap((source) => collectCategoryIdentities(source, lookup))
    .forEach((identity) => {
      const key = normalizeReference(identity.id) || normalizeReference(identity.name);
      if (!key || deduped.has(key)) {
        return;
      }

      deduped.set(key, identity);
    });

  return Array.from(deduped.values());
};

const getMembershipReferences = (membership: AthleteCategoryMembership) =>
  new Set(
    [membership.categoryId, membership.categoryName]
      .map(normalizeReference)
      .filter(Boolean),
  );

const identitiesMatchMembership = (
  identities: Array<{ references: Set<string> }>,
  membership: AthleteCategoryMembership,
) => {
  const membershipRefs = getMembershipReferences(membership);
  return identities.some((identity) =>
    Array.from(identity.references).some((reference) =>
      membershipRefs.has(reference),
    ),
  );
};

const categoriesMatch = (
  left: CategoryOption | AthleteCategoryMembership,
  right: CategoryOption | AthleteCategoryMembership,
) => {
  const leftRecord = left as any;
  const rightRecord = right as any;
  const leftRefs = [
    leftRecord.id,
    leftRecord.name,
    leftRecord.categoryId,
    leftRecord.categoryName,
  ]
    .map(normalizeReference)
    .filter(Boolean);
  const rightRefs = [
    rightRecord.id,
    rightRecord.name,
    rightRecord.categoryId,
    rightRecord.categoryName,
  ]
    .map(normalizeReference)
    .filter(Boolean);

  return leftRefs.some((reference) => rightRefs.includes(reference));
};

const isAllowedCategory = (
  category: AthleteCategoryMembership,
  allowedCategories?: CategoryOption[],
) => {
  if (!allowedCategories || allowedCategories.length === 0) {
    return true;
  }

  return allowedCategories.some((allowedCategory) =>
    categoriesMatch(category, allowedCategory),
  );
};

const sortByDateDesc = <T extends { date: string | null }>(items: T[]) =>
  items.slice().sort((left, right) => {
    const leftTime = left.date ? new Date(left.date).getTime() : 0;
    const rightTime = right.date ? new Date(right.date).getTime() : 0;
    return rightTime - leftTime;
  });

const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  present: "Presente",
  presente: "Presente",
  absent: "Assente",
  assente: "Assente",
  justified: "Giustificato",
  giustificato: "Giustificato",
  late: "Ritardo",
  ritardo: "Ritardo",
  delayed: "Ritardo",
  unknown: "Non registrato",
  not_recorded: "Non registrato",
  "not recorded": "Non registrato",
  non_registrato: "Non registrato",
};

const toAttendanceStatusLabel = (entry: any) => {
  if (!entry) {
    return "Non registrato";
  }

  if (isPresentAttendanceEntry(entry)) {
    return "Presente";
  }

  const status = normalizeReference(firstNonEmptyString(entry?.status));
  return ATTENDANCE_STATUS_LABELS[status] || "Assente";
};

const addEventDerivedCategory = (
  categoriesByKey: Map<string, AthleteCategoryMembership>,
  identity: { id: string; name: string },
  allowedCategories?: CategoryOption[],
) => {
  const category: AthleteCategoryMembership = {
    id: `${identity.id}:event`,
    categoryId: identity.id,
    categoryName: identity.name,
    isPrimary: false,
    source: "data",
  };

  if (!isAllowedCategory(category, allowedCategories)) {
    return;
  }

  const key = normalizeReference(identity.id) || normalizeReference(identity.name);
  if (!key || categoriesByKey.has(key)) {
    return;
  }

  categoriesByKey.set(key, category);
};

export function calculateAthleteCategoryAnalytics({
  athlete,
  categoryMemberships,
  trainings = [],
  attendanceRecords = [],
  matches = [],
  categories = [],
  allowedCategories,
}: {
  athlete: any;
  categoryMemberships?: unknown;
  trainings?: any[];
  attendanceRecords?: any[];
  matches?: any[];
  categories?: CategoryOption[];
  allowedCategories?: CategoryOption[];
}): AthleteCategoryAnalyticsResult {
  const athleteId = getAthleteId(athlete);
  const lookup = buildCategoryLookup(categories);
  const memberships = normalizeAthleteCategoryMemberships(
    categoryMemberships || athlete,
    categories,
  ).filter((membership) => isAllowedCategory(membership, allowedCategories));
  const categoriesByKey = new Map<string, AthleteCategoryMembership>();

  memberships.forEach((membership) => {
    const key =
      normalizeReference(membership.categoryId) ||
      normalizeReference(membership.categoryName);
    if (key) {
      categoriesByKey.set(key, membership);
    }
  });

  if (athleteId) {
    trainings.forEach((training) => {
      const attendanceEntry = getAthleteAttendanceEntry(
        training,
        athleteId,
        attendanceRecords,
      );
      if (!attendanceEntry) {
        return;
      }

      getRecordCategoryIdentities(training, lookup).forEach((identity) =>
        addEventDerivedCategory(categoriesByKey, identity, allowedCategories),
      );
    });

    matches.forEach((match) => {
      if (!getConvocatedAthleteIdsFromMatch(match).includes(athleteId)) {
        return;
      }

      getRecordCategoryIdentities(match, lookup).forEach((identity) =>
        addEventDerivedCategory(categoriesByKey, identity, allowedCategories),
      );
    });
  }

  const categoryRows = Array.from(categoriesByKey.values())
    .sort((left, right) => {
      if (left.isPrimary !== right.isPrimary) {
        return Number(right.isPrimary) - Number(left.isPrimary);
      }

      return left.categoryName.localeCompare(right.categoryName, "it", {
        sensitivity: "base",
      });
    })
    .map((membership) => {
      const categoryTrainings = trainings.filter((training) =>
        identitiesMatchMembership(
          getRecordCategoryIdentities(training, lookup),
          membership,
        ),
      );
      const categoryMatches = matches.filter((match) =>
        identitiesMatchMembership(
          getRecordCategoryIdentities(match, lookup),
          membership,
        ),
      );
      const recentTrainings = sortByDateDesc(
        categoryTrainings.map((training, index) => {
          const attendanceEntry = athleteId
            ? getAthleteAttendanceEntry(training, athleteId, attendanceRecords)
            : null;

          return {
            id: `training-${getEventId(training, `${membership.categoryId}-${index}`)}`,
            title: getEventTitle(training, "Allenamento"),
            date: getEventDate(training),
            statusLabel: toAttendanceStatusLabel(attendanceEntry),
            notes: firstNonEmptyString(attendanceEntry?.notes) || undefined,
            record: training,
          };
        }),
      );
      const recentMatches = sortByDateDesc(
        categoryMatches.map((match, index) => {
          const convocated = athleteId
            ? getConvocatedAthleteIdsFromMatch(match).includes(athleteId)
            : false;

          return {
            id: `match-${getEventId(match, `${membership.categoryId}-${index}`)}`,
            title: getEventTitle(match, "Gara"),
            date: getEventDate(match),
            statusLabel: convocated ? "Convocato" : "Non convocato",
            record: match,
          };
        }),
      );
      const attendanceEntries = categoryTrainings
        .map((training) =>
          athleteId
            ? getAthleteAttendanceEntry(training, athleteId, attendanceRecords)
            : null,
        )
        .filter(Boolean);
      const attendancesPresent = attendanceEntries.filter((entry) =>
        isPresentAttendanceEntry(entry),
      ).length;
      const attendanceRegistered = attendanceEntries.length;
      const convocationsTotal = categoryMatches.filter(
        (match) =>
          athleteId && getConvocatedAthleteIdsFromMatch(match).includes(athleteId),
      ).length;

      return {
        categoryId: membership.categoryId,
        categoryName: membership.categoryName,
        isPrimary: membership.isPrimary,
        trainingsTotal: categoryTrainings.length,
        attendancesPresent,
        attendancesAbsent: Math.max(attendanceRegistered - attendancesPresent, 0),
        attendanceRegistered,
        attendanceRate: categoryTrainings.length
          ? Math.round((attendancesPresent / categoryTrainings.length) * 100)
          : 0,
        matchesTotal: categoryMatches.length,
        convocationsTotal,
        convocationRate: categoryMatches.length
          ? Math.round((convocationsTotal / categoryMatches.length) * 100)
          : 0,
        recentTrainings,
        recentMatches,
      };
    });

  const unclassifiedEvents = athleteId
    ? sortByDateDesc([
        ...trainings.flatMap((training, index) => {
          const identities = getRecordCategoryIdentities(training, lookup);
          const attendanceEntry = getAthleteAttendanceEntry(
            training,
            athleteId,
            attendanceRecords,
          );
          if (identities.length > 0 || !attendanceEntry) {
            return [];
          }

          return [
            {
              id: `unclassified-training-${getEventId(training, String(index))}`,
              type: "training" as const,
              title: getEventTitle(training, "Allenamento"),
              date: getEventDate(training),
              statusLabel: toAttendanceStatusLabel(attendanceEntry),
              notes: firstNonEmptyString(attendanceEntry?.notes) || undefined,
              record: training,
            },
          ];
        }),
        ...matches.flatMap((match, index) => {
          const identities = getRecordCategoryIdentities(match, lookup);
          const convocated = getConvocatedAthleteIdsFromMatch(match).includes(
            athleteId,
          );
          if (identities.length > 0 || !convocated) {
            return [];
          }

          return [
            {
              id: `unclassified-match-${getEventId(match, String(index))}`,
              type: "match" as const,
              title: getEventTitle(match, "Gara"),
              date: getEventDate(match),
              statusLabel: "Convocato",
              record: match,
            },
          ];
        }),
      ])
    : [];

  return {
    categories: categoryRows,
    unclassifiedEvents,
  };
}
