import { prisma } from "@/lib/server/prisma";
import { normalizeTrainerList } from "@/lib/trainer-utils";
import {
  athleteMatchesAnyCategory,
  buildClubCategoryOptions,
  resolveCategoryId,
  resolveCategoryLabel,
} from "@/lib/category-utils";
import {
  buildTrainingLocationOptions,
  findTrainingLocationOption,
  getFallbackTrainingLocationOptions,
} from "@/lib/training-location-options";
import {
  buildTrainingStart,
  dedupeTrainings,
  formatLocalDateKey,
  formatTrainingTitle,
  getTrainingCategoryReferences,
  getTrainingDate,
  getTrainingEndTime,
  getTrainingStartTime,
  isValidTimeRange,
  resolveCategoryLabelForTraining,
  resolveExplicitWeeklyScheduleDay,
  resolveTrainingWeekday,
} from "@/lib/training-utils";
import {
  parseTrainingAutomationSettings,
  shouldRunTrainingAutomation,
  type TrainingAutomationSettings,
} from "@/lib/training-automation-utils";

type AutomationRunOptions = {
  force?: boolean;
  now?: Date;
  weeklyScheduleOverride?: unknown;
  settingsOverride?: unknown;
};

type AutomationRunResult = {
  ran: boolean;
  due: boolean;
  generatedCount: number;
  generatedTrainings: Record<string, any>[];
  lastRunAt: string | null;
  settings: TrainingAutomationSettings;
  reason?: "not_due" | "missing_schedule";
};

const isMissingCategoryMembershipTableError = (error: unknown) =>
  String((error as any)?.message || error || "")
    .toLowerCase()
    .includes("athlete_category_memberships");

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const getNonEmptyString = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) {
      return normalized;
    }
  }

  return "";
};

const dedupeStringList = (values: unknown[]) =>
  Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );

const isTrainingRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  [
    "date",
    "start_date",
    "startDate",
    "scheduled_at",
    "scheduledAt",
    "time",
    "start_time",
    "startTime",
    "category",
    "categoryId",
    "category_id",
    "trainer",
    "trainerId",
    "trainer_id",
    "location",
  ].some((key) => (value as Record<string, unknown>)[key] !== undefined);

const isWeeklyScheduleRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Boolean(resolveExplicitWeeklyScheduleDay(value)) &&
  Boolean(getTrainingStartTime(value));

const toTrainingEntries = (source: unknown): Record<string, any>[] => {
  if (Array.isArray(source)) {
    return source.flatMap((entry) => toTrainingEntries(entry));
  }

  if (!source || typeof source !== "object") {
    return [];
  }

  if (isTrainingRecord(source)) {
    return [source];
  }

  const record = source as Record<string, unknown>;
  const nestedCandidates = [
    record.payload,
    record.trainings,
    record.training,
    record.items,
  ].filter((value) => value !== undefined);

  if (nestedCandidates.length > 0) {
    return nestedCandidates.flatMap((entry) => toTrainingEntries(entry));
  }

  return [];
};

const toWeeklyScheduleEntries = (source: unknown): Record<string, any>[] => {
  if (Array.isArray(source)) {
    return source.flatMap((entry) => toWeeklyScheduleEntries(entry));
  }

  if (!source || typeof source !== "object") {
    return [];
  }

  if (isWeeklyScheduleRecord(source)) {
    return [source];
  }

  const record = source as Record<string, unknown>;
  const nestedCandidates = [
    record.payload,
    record.weekly_schedule,
    record.schedule,
    record.items,
  ].filter((value) => value !== undefined);

  if (nestedCandidates.length > 0) {
    return nestedCandidates.flatMap((entry) => toWeeklyScheduleEntries(entry));
  }

  return [];
};

const buildWeeklyScheduleIdentityKey = (item: Record<string, any>) =>
  [
    item.day || "",
    item.startTime || item.start_time || item.time || "",
    item.endTime || item.end_time || "",
    item.categoryId || item.category_id || item.category || "",
    item.structureId || item.structure_id || "",
    item.locationId || item.location_id || item.location || "",
  ]
    .map((value) => String(value || "").trim())
    .join("|");

const normalizeTrainerIds = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return dedupeStringList(
      value.flatMap((entry) =>
        entry && typeof entry === "object"
          ? [
              (entry as Record<string, any>).id,
              (entry as Record<string, any>).trainerId,
              (entry as Record<string, any>).trainer_id,
            ]
          : [entry],
      ),
    );
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, any>;
    return dedupeStringList([
      record.id,
      record.user_id,
      record.linkedUserId,
      record.linked_user_id,
      record.trainerId,
      record.trainer_id,
      record.coachId,
      record.coach_id,
    ]);
  }

  return dedupeStringList([value]);
};

const normalizeWeeklyScheduleSourceItem = (item: Record<string, any>) => {
  const day = resolveExplicitWeeklyScheduleDay(item);
  const startTime = getTrainingStartTime(item);
  const endTime = getTrainingEndTime(item) || "";

  const categoryReference = getNonEmptyString(
    item.categoryId,
    item.category_id,
    item.category?.id,
    item.categoryName,
    item.category_name,
    item.category?.name,
    item.category,
    getTrainingCategoryReferences(item)[0],
  );
  const categoryId = getNonEmptyString(
    item.categoryId,
    item.category_id,
    item.category?.id,
  );
  const categoryName = resolveCategoryLabelForTraining(item, []);
  const trainerIds = dedupeStringList([
    ...normalizeTrainerIds(item.trainerIds),
    ...normalizeTrainerIds(item.trainer_ids),
    ...normalizeTrainerIds(item.trainerId),
    ...normalizeTrainerIds(item.trainer_id),
    ...normalizeTrainerIds(item.coachId),
    ...normalizeTrainerIds(item.coach_id),
    ...normalizeTrainerIds(item.trainers),
    ...normalizeTrainerIds(item.trainer),
    ...normalizeTrainerIds(item.coach),
  ]);
  const locationReference = getNonEmptyString(
    item.structureId,
    item.structure_id,
    item.locationId,
    item.location_id,
    item.fieldId,
    item.field_id,
    item.location,
    item.fieldName,
    item.field_name,
  );

  if (
    !day ||
    !startTime ||
    !endTime ||
    !isValidTimeRange(startTime, endTime) ||
    !categoryReference ||
    !locationReference ||
    trainerIds.length === 0
  ) {
    return null;
  }

  return {
    id: String(item.id || buildWeeklyScheduleIdentityKey(item)),
    day,
    startTime,
    endTime,
    categoryId: categoryId || categoryReference,
    categoryName: categoryName || null,
    trainerIds,
    structureId: getNonEmptyString(item.structureId, item.structure_id),
    locationId: getNonEmptyString(
      item.locationId,
      item.location_id,
      item.fieldId,
      item.field_id,
    ),
    location: getNonEmptyString(item.location, item.fieldName, item.field_name),
  };
};

const mergeWeeklyScheduleSources = ({
  clubWeeklySchedule,
  resourceWeeklySchedule,
}: {
  clubWeeklySchedule: unknown;
  resourceWeeklySchedule: unknown;
}) => {
  const scheduleSources = [clubWeeklySchedule, resourceWeeklySchedule];
  const merged: Record<string, any>[] = [];
  const seen = new Set<string>();

  scheduleSources.forEach((source) => {
    toWeeklyScheduleEntries(source).forEach((item) => {
      const normalizedItem = normalizeWeeklyScheduleSourceItem(item);
      if (!normalizedItem) {
        return;
      }

      const identity = buildWeeklyScheduleIdentityKey(normalizedItem);
      if (!identity || seen.has(identity)) {
        return;
      }

      seen.add(identity);
      merged.push(normalizedItem);
    });
  });

  return merged;
};

const getResourcePayloadsByType = async (clubId: string) => {
  const items = await prisma.clubResourceItem.findMany({
    where: {
      organization_id: clubId,
      resource_type: {
        in: ["weekly_schedule", "trainings", "categories", "trainers"],
      },
    },
    select: {
      resource_type: true,
      payload: true,
    },
  });

  return items.reduce<Record<string, unknown[]>>((collection, item) => {
    const key = String(item.resource_type || "").trim();
    if (!key) {
      return collection;
    }

    if (!collection[key]) {
      collection[key] = [];
    }

    collection[key].push(item.payload);
    return collection;
  }, {});
};

const buildTrainingDuplicateKey = ({
  trainingDate,
  time,
  locationKey,
  categoryKey,
}: {
  trainingDate: string;
  time: string;
  locationKey: string;
  categoryKey: string;
}) =>
  [trainingDate, time, locationKey, categoryKey]
    .map((value) => String(value || "").trim().toLowerCase())
    .join("|");

const buildExistingTrainingKey = (
  training: Record<string, any>,
  categories: Array<{ id?: string | null; name?: string | null }> = [],
) => {
  const trainingDate = getTrainingDate(training);
  const startTime = getTrainingStartTime(training);

  if (!trainingDate || !startTime) {
    return null;
  }

  const rawCategoryReference = getNonEmptyString(
    training.categoryId,
    training.category_id,
    ...getTrainingCategoryReferences(training),
  );
  const resolvedCategory =
    resolveCategoryId(rawCategoryReference, categories) ||
    resolveCategoryLabel(rawCategoryReference, categories) ||
    rawCategoryReference;

  return buildTrainingDuplicateKey({
    trainingDate: formatLocalDateKey(trainingDate),
    time: startTime,
    locationKey: getNonEmptyString(
      training.locationId,
      training.fieldId,
      training.location_id,
      training.field_id,
      training.location,
    ),
    categoryKey: resolvedCategory,
  });
};

const buildStoredAutomationSettings = (
  clubSettings: unknown,
  lastRunAt: string,
) => {
  const settingsRecord = isRecord(clubSettings) ? clubSettings : {};
  const currentAutomation = parseTrainingAutomationSettings(
    settingsRecord.trainingAutomation,
  );

  return {
    ...settingsRecord,
    trainingAutomation: {
      ...currentAutomation,
      lastRunAt,
    },
  };
};

const getDateOnly = (value: Date) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate());

const getWeekdayLabelFromDate = (value: Date) =>
  resolveTrainingWeekday({ date: getDateOnly(value) });

const loadAutomationAthletes = async (clubId: string) => {
  const athletes = await prisma.athlete.findMany({
    where: { organization_id: clubId },
    select: {
      id: true,
      first_name: true,
      last_name: true,
      category_id: true,
      category_name: true,
      data: true,
    },
  });

  let memberships: Array<{
    id: string;
    organization_id: string;
    athlete_id: string;
    category_id: string;
    category_name: string | null;
    is_primary: boolean;
  }> = [];

  try {
    memberships = await prisma.athleteCategoryMembership.findMany({
      where: { organization_id: clubId },
      select: {
        id: true,
        organization_id: true,
        athlete_id: true,
        category_id: true,
        category_name: true,
        is_primary: true,
      },
    });
  } catch (error) {
    if (!isMissingCategoryMembershipTableError(error)) {
      throw error;
    }
  }

  const membershipsByAthleteId = memberships.reduce<
    Map<string, typeof memberships>
  >((collection, membership) => {
    const athleteId = String(membership?.athlete_id || "").trim();
    if (!athleteId) {
      return collection;
    }

    const current = collection.get(athleteId) || [];
    current.push(membership);
    collection.set(athleteId, current);
    return collection;
  }, new Map());

  return athletes.map((athlete) => ({
    ...athlete,
    category_memberships:
      membershipsByAthleteId.get(String(athlete.id || "").trim()) || [],
  }));
};

export async function runTrainingAutomationForClub(
  clubId: string,
  options: AutomationRunOptions = {},
): Promise<AutomationRunResult> {
  const now = options.now ? new Date(options.now) : new Date();
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: {
      id: true,
      name: true,
      settings: true,
      categories: true,
      trainings: true,
      weekly_schedule: true,
      trainers: true,
      structures: true,
    },
  });

  if (!club) {
    throw new Error("Club non trovato");
  }

  const resourcePayloadsByType = await getResourcePayloadsByType(clubId);
  const athletes = await loadAutomationAthletes(clubId);

  const clubSettings = isRecord(club.settings)
    ? (club.settings as Record<string, unknown>)
    : {};
  const storedSettings = parseTrainingAutomationSettings(
    clubSettings.trainingAutomation,
  );
  const effectiveSettings = parseTrainingAutomationSettings(
    isRecord(options.settingsOverride)
      ? { ...storedSettings, ...options.settingsOverride }
      : storedSettings,
  );

  const due = options.force ? true : shouldRunTrainingAutomation(effectiveSettings, now);
  if (!due) {
    return {
      ran: false,
      due: false,
      generatedCount: 0,
      generatedTrainings: [],
      lastRunAt: effectiveSettings.lastRunAt,
      settings: effectiveSettings,
      reason: "not_due",
    };
  }

  const hasWeeklyScheduleOverride = options.weeklyScheduleOverride !== undefined;
  const weeklySchedule = mergeWeeklyScheduleSources({
    clubWeeklySchedule:
      hasWeeklyScheduleOverride
        ? options.weeklyScheduleOverride
        : club.weekly_schedule,
    resourceWeeklySchedule: hasWeeklyScheduleOverride
      ? []
      : resourcePayloadsByType.weekly_schedule || [],
  });

  if (!weeklySchedule.length) {
    return {
      ran: true,
      due: true,
      generatedCount: 0,
      generatedTrainings: [],
      lastRunAt: effectiveSettings.lastRunAt,
      settings: effectiveSettings,
      reason: "missing_schedule",
    };
  }

  const categoryList = buildClubCategoryOptions({
    clubCategories: club.categories,
    resourceCategories: resourcePayloadsByType.categories || [],
    athletes,
  });
  const trainerList = normalizeTrainerList(
    [club.trainers, ...(resourcePayloadsByType.trainers || [])],
    categoryList,
  );
  const builtLocationOptions = buildTrainingLocationOptions(
    Array.isArray(club.structures) ? (club.structures as any[]) : [],
  );
  const locationOptions =
    builtLocationOptions.length > 0
      ? builtLocationOptions
      : getFallbackTrainingLocationOptions();
  const existingTrainings = [
    ...toTrainingEntries(club.trainings),
    ...(resourcePayloadsByType.trainings || []).flatMap((entry) =>
      toTrainingEntries(entry),
    ),
  ];
  const existingKeys = new Set(
    existingTrainings
      .map((training) => buildExistingTrainingKey(training, categoryList))
      .filter(Boolean) as string[],
  );
  const generatedTrainings: Record<string, any>[] = [];
  const currentStoredTrainings = dedupeTrainings(
    Array.isArray(club.trainings)
      ? club.trainings.filter(isTrainingRecord)
      : toTrainingEntries(club.trainings),
  );

  const startDate = getDateOnly(now);
  const endDate = getDateOnly(now);
  endDate.setDate(
    endDate.getDate() + Math.max(7, effectiveSettings.generateDaysAhead),
  );

  for (
    const currentDate = new Date(startDate);
    currentDate <= endDate;
    currentDate.setDate(currentDate.getDate() + 1)
  ) {
    const currentWeekday = getWeekdayLabelFromDate(currentDate);
    if (!currentWeekday) {
      continue;
    }

    const daySchedule = weeklySchedule.filter(
      (item) => resolveTrainingWeekday(item) === currentWeekday,
    );

    for (const scheduleItem of daySchedule) {
      const trainingDate = formatLocalDateKey(currentDate);
      const trainingStart = buildTrainingStart(
        trainingDate,
        scheduleItem.startTime,
      );

      if (!trainingStart || trainingStart <= now) {
        continue;
      }

      const rawCategoryReference = getNonEmptyString(
        scheduleItem.categoryId,
        scheduleItem.category_name,
        scheduleItem.categoryName,
        scheduleItem.category,
      );
      const resolvedCategoryId =
        resolveCategoryId(rawCategoryReference, categoryList) || "";
      const resolvedCategoryLabel =
        resolveCategoryLabel(rawCategoryReference, categoryList) ||
        scheduleItem.categoryName ||
        rawCategoryReference;
      const categoryKey =
        resolvedCategoryId || resolvedCategoryLabel || rawCategoryReference;
      const categoryOption =
        categoryList.find(
          (category) =>
            String(category?.id || "").trim() === resolvedCategoryId ||
            String(category?.name || "").trim() === resolvedCategoryLabel,
        ) || null;
      const location = findTrainingLocationOption(locationOptions, {
        structureId: scheduleItem.structureId,
        fieldId: scheduleItem.locationId,
        locationId: scheduleItem.locationId,
      });
      const duplicateKey = buildTrainingDuplicateKey({
        trainingDate,
        time: scheduleItem.startTime,
        locationKey:
          location?.fieldId || scheduleItem.locationId || scheduleItem.location || "",
        categoryKey,
      });

      if (existingKeys.has(duplicateKey)) {
        continue;
      }

      const matchingCategoryOptions = categoryOption
        ? [categoryOption]
        : categoryKey
          ? [
              {
                id: resolvedCategoryId || categoryKey,
                name: resolvedCategoryLabel || categoryKey,
              },
            ]
          : [];
      const trainerNames = Array.isArray(scheduleItem.trainerIds)
        ? scheduleItem.trainerIds
            .map(
              (trainerId: string) =>
                trainerList.find((trainer) => trainer.id === trainerId)?.name,
            )
            .filter(Boolean)
        : [];
      const trainingId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `training-${trainingDate}-${scheduleItem.id || generatedTrainings.length + 1}`;

      generatedTrainings.push({
        id: trainingId,
        title: formatTrainingTitle(trainingDate),
        date: trainingDate,
        time: scheduleItem.startTime,
        endTime: scheduleItem.endTime,
        categoryId: resolvedCategoryId || categoryKey || null,
        categories: resolvedCategoryId || categoryKey ? [resolvedCategoryId || categoryKey] : [],
        category:
          resolvedCategoryLabel ||
          categoryOption?.name ||
          "Categoria",
        trainerIds: Array.isArray(scheduleItem.trainerIds)
          ? scheduleItem.trainerIds
          : [],
        trainer:
          trainerNames.length > 0 ? trainerNames.join(", ") : "Allenatore",
        structureId:
          location?.structureId || scheduleItem.structureId || null,
        locationId: location?.fieldId || scheduleItem.locationId || null,
        location: location?.name || scheduleItem.location || "Campo",
        attendees: 0,
        expectedAttendees: athletes.filter((athlete) =>
          athleteMatchesAnyCategory(athlete, matchingCategoryOptions),
        ).length,
        categoryColor: "bg-blue-500 text-white",
        status: "upcoming",
        generated: true,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      });
      existingKeys.add(duplicateKey);
    }
  }

  const lastRunAt = now.toISOString();
  await prisma.club.update({
    where: { id: clubId },
    data: {
      trainings: dedupeTrainings([...currentStoredTrainings, ...generatedTrainings]),
      settings: buildStoredAutomationSettings(club.settings, lastRunAt),
    },
  });

  return {
    ran: true,
    due: true,
    generatedCount: generatedTrainings.length,
    generatedTrainings,
    lastRunAt,
    settings: {
      ...effectiveSettings,
      lastRunAt,
    },
  };
}

export async function runDueTrainingAutomationForAllClubs(now = new Date()) {
  const clubs = await prisma.club.findMany({
    select: {
      id: true,
      name: true,
      settings: true,
    },
  });

  const results: Array<{
    clubId: string;
    clubName: string;
    generatedCount: number;
    ran: boolean;
    reason?: string;
  }> = [];

  for (const club of clubs) {
    const clubSettings = isRecord(club.settings)
      ? (club.settings as Record<string, unknown>)
      : {};
    const settings = parseTrainingAutomationSettings(
      clubSettings.trainingAutomation,
    );

    if (!shouldRunTrainingAutomation(settings, now)) {
      continue;
    }

    try {
      const result = await runTrainingAutomationForClub(club.id, { now });
      results.push({
        clubId: club.id,
        clubName: club.name,
        generatedCount: result.generatedCount,
        ran: result.ran,
        reason: result.reason,
      });
    } catch (error: any) {
      results.push({
        clubId: club.id,
        clubName: club.name,
        generatedCount: 0,
        ran: false,
        reason: error?.message || "automation_error",
      });
    }
  }

  return results;
}
