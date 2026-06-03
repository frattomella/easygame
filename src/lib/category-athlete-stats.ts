import {
  compareAthletesByLastName,
  getAthleteDisplayName,
} from "@/lib/athlete-name-utils";
import { athleteMatchesCategory } from "@/lib/category-utils";
import { getConvocatedAthleteIdsFromMatch } from "@/lib/match-certificate-warnings";
import { recordMatchesCategory } from "@/lib/trainer-dashboard-helpers";

export type CategoryAthleteStat = {
  categoryId: string;
  categoryName: string;
  athleteId: string;
  athleteName: string;
  athlete: any;
  convocations: number;
  totalMatches: number;
  presences: number;
  totalTrainings: number;
  convocationRate: number;
  presenceRate: number;
};

const PRESENT_STATUSES = new Set(["present", "presente", "yes", "true"]);

const normalizeValue = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const normalizeId = (value: unknown) => String(value || "").trim();

const getAthleteId = (athlete: any) =>
  normalizeId(athlete?.id || athlete?.athleteId || athlete?.athlete_id);

const getTrainingId = (training: any) =>
  normalizeId(training?.id || training?.trainingId || training?.training_id);

const getAttendanceTrainingId = (entry: any) =>
  normalizeId(entry?.trainingId || entry?.training_id || entry?.training?.id);

const getAttendanceAthleteId = (entry: any) =>
  normalizeId(entry?.athleteId || entry?.athlete_id || entry?.id);

const isPresentAttendanceEntry = (entry: any) => {
  const status = normalizeValue(entry?.status);
  return entry?.present === true || entry?.is_present === true || PRESENT_STATUSES.has(status);
};

const getTrainingAttendanceEntries = (training: any, attendance: any[] = []) => {
  const trainingId = getTrainingId(training);
  const embeddedEntries = Array.isArray(training?.attendance)
    ? training.attendance
    : [];
  const externalEntries = trainingId
    ? attendance.filter((entry) => getAttendanceTrainingId(entry) === trainingId)
    : [];

  return [...embeddedEntries, ...externalEntries];
};

const resolveTargetCategory = (
  categoryId: string,
  categories: Array<{ id?: string | null; name?: string | null }> = [],
) => {
  const normalizedCategoryId = normalizeValue(categoryId);
  const matchedCategory = categories.find(
    (category) =>
      normalizeValue(category?.id) === normalizedCategoryId ||
      normalizeValue(category?.name) === normalizedCategoryId,
  );

  return (
    matchedCategory || {
      id: categoryId,
      name: categoryId,
    }
  );
};

const athleteBelongsToCategory = (
  athlete: any,
  category: { id?: string | null; name?: string | null },
  categories: Array<{ id?: string | null; name?: string | null }> = [],
) =>
  athleteMatchesCategory(athlete, {
    id: normalizeId(category?.id),
    name: normalizeId(category?.name),
  }) || recordMatchesCategory(athlete, category, categories);

export function calculateCategoryAthleteStats(
  categoryId: string,
  athletes: any[] = [],
  trainings: any[] = [],
  attendance: any[] = [],
  matches: any[] = [],
  categories: Array<{ id?: string | null; name?: string | null }> = [],
): CategoryAthleteStat[] {
  const targetCategory = resolveTargetCategory(categoryId, categories);
  const targetCategoryId = normalizeId(targetCategory?.id || categoryId);
  const targetCategoryName = normalizeId(
    targetCategory?.name || targetCategory?.id || categoryId,
  );
  const categoryAthletes = (Array.isArray(athletes) ? athletes : [])
    .filter((athlete) =>
      athleteBelongsToCategory(athlete, targetCategory, categories),
    )
    .sort(compareAthletesByLastName);
  const categoryTrainings = (Array.isArray(trainings) ? trainings : []).filter(
    (training) => recordMatchesCategory(training, targetCategory, categories),
  );
  const categoryMatches = (Array.isArray(matches) ? matches : []).filter((match) =>
    recordMatchesCategory(match, targetCategory, categories),
  );

  return categoryAthletes.map((athlete) => {
    const athleteId = getAthleteId(athlete);
    const convocations = categoryMatches.filter((match) =>
      getConvocatedAthleteIdsFromMatch(match).includes(athleteId),
    ).length;
    const presences = categoryTrainings.filter((training) =>
      getTrainingAttendanceEntries(training, attendance).some(
        (entry) =>
          getAttendanceAthleteId(entry) === athleteId &&
          isPresentAttendanceEntry(entry),
      ),
    ).length;
    const totalMatches = categoryMatches.length;
    const totalTrainings = categoryTrainings.length;

    return {
      categoryId: targetCategoryId,
      categoryName: targetCategoryName,
      athleteId,
      athleteName: getAthleteDisplayName(athlete),
      athlete,
      convocations,
      totalMatches,
      presences,
      totalTrainings,
      convocationRate: totalMatches
        ? Math.round((convocations / totalMatches) * 100)
        : 0,
      presenceRate: totalTrainings
        ? Math.round((presences / totalTrainings) * 100)
        : 0,
    };
  });
}
