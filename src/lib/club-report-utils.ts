import { getAthleteDisplayName } from "@/lib/athlete-name-utils";
import {
  buildClubCategoryOptions,
  type NormalizedCategoryOption,
} from "@/lib/category-utils";
import { calculateCategoryAthleteStats } from "@/lib/category-athlete-stats";
import { getConvocatedAthleteIdsFromMatch } from "@/lib/match-certificate-warnings";
import { isPaymentExcludedFromTotals } from "@/lib/payments/payment-status-utils";
import { recordMatchesCategory } from "@/lib/trainer-dashboard-helpers";
import type { NormalizedClubMovement } from "@/lib/club-financial-summary";

export type ReportPeriodKey = "all" | "last30" | "last90";

export type CategoryReportRow = ReturnType<
  typeof calculateCategoryAthleteStats
>[number];

export type CategoryReport = {
  rows: CategoryReportRow[];
  totalAthleteRows: number;
  totalTrainings: number;
  totalMatches: number;
};

export type AttendanceReport = {
  totalTrainings: number;
  expectedAttendances: number;
  registeredAttendances: number;
  presentAttendances: number;
  absentAttendances: number;
  missingAttendances: number;
  attendanceRate: number;
};

export type MatchConvocationReport = {
  totalMatches: number;
  matchesWithConvocations: number;
  matchesWithoutConvocations: number;
  totalConvocations: number;
  uniqueAthletesConvocated: number;
  convocationCompletionRate: number;
};

export type PaymentReport = {
  hasPayments: boolean;
  totalDue: number;
  totalPaid: number;
  totalPending: number;
  totalOverdue: number;
  paidCount: number;
  pendingCount: number;
  overdueCount: number;
};

const PRESENT_STATUSES = new Set(["present", "presente", "yes", "true"]);
const ABSENT_STATUSES = new Set(["absent", "assente", "no", "false"]);
const PAID_STATUSES = new Set([
  "paid",
  "completed",
  "complete",
  "pagato",
  "pagata",
  "saldato",
  "saldata",
]);

const normalizeText = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    const candidate = String(value || "").trim();
    if (candidate) {
      return candidate;
    }
  }

  return "";
};

const toAmount = (value: unknown) => {
  const parsed =
    typeof value === "number"
      ? value
      : Number(String(value || "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

const toDate = (value: unknown) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getRecordDate = (record: any) =>
  firstString(
    record?.date,
    record?.start_date,
    record?.startDate,
    record?.startsAt,
    record?.starts_at,
    record?.scheduled_at,
    record?.scheduledAt,
    record?.due_date,
    record?.dueDate,
    record?.created_at,
    record?.createdAt,
    record?.data?.date,
    record?.payload?.date,
  );

const isWithinPeriod = (record: any, period: ReportPeriodKey) => {
  if (period === "all") {
    return true;
  }

  const recordDate = toDate(getRecordDate(record));
  if (!recordDate) {
    return false;
  }

  const days = period === "last30" ? 30 : 90;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days);

  return recordDate >= start;
};

const getTrainingId = (training: any) =>
  firstString(training?.id, training?.trainingId, training?.training_id);

const getAttendanceTrainingId = (entry: any) =>
  firstString(entry?.trainingId, entry?.training_id, entry?.training?.id);

const getAttendanceAthleteId = (entry: any) =>
  firstString(entry?.athleteId, entry?.athlete_id, entry?.id);

const isPresentAttendance = (entry: any) => {
  const status = normalizeText(entry?.status);
  return (
    entry?.present === true ||
    entry?.is_present === true ||
    PRESENT_STATUSES.has(status)
  );
};

const isAbsentAttendance = (entry: any) => {
  const status = normalizeText(entry?.status);
  return (
    entry?.present === false ||
    entry?.is_present === false ||
    ABSENT_STATUSES.has(status)
  );
};

const getTrainingAttendanceEntries = (
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

const hasCategoryReference = (
  record: any,
  categories: NormalizedCategoryOption[],
) =>
  categories.some((category) =>
    recordMatchesCategory(record, category, categories),
  );

const filterByCategory = <T extends any>(
  records: T[],
  category: NormalizedCategoryOption | null,
  categories: NormalizedCategoryOption[],
) =>
  category
    ? records.filter((record) => recordMatchesCategory(record, category, categories))
    : records;

const filterByPeriod = <T extends any>(records: T[], period: ReportPeriodKey) =>
  records.filter((record) => isWithinPeriod(record, period));

const getSelectedCategory = (
  categories: NormalizedCategoryOption[],
  selectedCategoryId: string,
) =>
  selectedCategoryId === "all"
    ? null
    : categories.find(
        (category) =>
          String(category.id) === String(selectedCategoryId) ||
          String(category.name) === String(selectedCategoryId),
      ) || null;

const getAthletesForTraining = ({
  athletes,
  training,
  selectedCategory,
  categories,
}: {
  athletes: any[];
  training: any;
  selectedCategory: NormalizedCategoryOption | null;
  categories: NormalizedCategoryOption[];
}) => {
  if (selectedCategory) {
    return athletes.filter((athlete) =>
      recordMatchesCategory(athlete, selectedCategory, categories),
    );
  }

  if (hasCategoryReference(training, categories)) {
    return athletes.filter((athlete) =>
      categories.some(
        (category) =>
          recordMatchesCategory(training, category, categories) &&
          recordMatchesCategory(athlete, category, categories),
      ),
    );
  }

  return athletes;
};

export const getClubCategoryOptions = ({
  clubCategories,
  athletes = [],
}: {
  clubCategories?: unknown;
  athletes?: unknown[];
}) =>
  buildClubCategoryOptions({
    clubCategories,
    athletes,
  });

export const calculateCategoryReport = ({
  athletes,
  trainings,
  attendanceRecords,
  matches,
  categories,
  selectedCategoryId,
  period,
}: {
  athletes: any[];
  trainings: any[];
  attendanceRecords: any[];
  matches: any[];
  categories: NormalizedCategoryOption[];
  selectedCategoryId: string;
  period: ReportPeriodKey;
}): CategoryReport => {
  const selectedCategory = getSelectedCategory(categories, selectedCategoryId);
  const periodTrainings = filterByPeriod(trainings, period);
  const periodMatches = filterByPeriod(matches, period);
  const reportCategories = selectedCategory
    ? [selectedCategory]
    : categories;
  const rows = reportCategories
    .flatMap((category) =>
      calculateCategoryAthleteStats(
        category.id,
        athletes,
        periodTrainings,
        attendanceRecords,
        periodMatches,
        categories,
      ),
    )
    .sort(
      (left, right) =>
        left.categoryName.localeCompare(right.categoryName, "it", {
          sensitivity: "base",
        }) ||
        getAthleteDisplayName(left.athlete).localeCompare(
          getAthleteDisplayName(right.athlete),
          "it",
          { sensitivity: "base" },
        ),
    );

  const filteredTrainings = filterByCategory(
    periodTrainings,
    selectedCategory,
    categories,
  );
  const filteredMatches = filterByCategory(
    periodMatches,
    selectedCategory,
    categories,
  );

  return {
    rows,
    totalAthleteRows: rows.length,
    totalTrainings: filteredTrainings.length,
    totalMatches: filteredMatches.length,
  };
};

export const calculateAttendanceReport = ({
  athletes,
  trainings,
  attendanceRecords,
  categories,
  selectedCategoryId,
  period,
}: {
  athletes: any[];
  trainings: any[];
  attendanceRecords: any[];
  categories: NormalizedCategoryOption[];
  selectedCategoryId: string;
  period: ReportPeriodKey;
}): AttendanceReport => {
  const selectedCategory = getSelectedCategory(categories, selectedCategoryId);
  const filteredTrainings = filterByCategory(
    filterByPeriod(trainings, period),
    selectedCategory,
    categories,
  );

  let expectedAttendances = 0;
  let registeredAttendances = 0;
  let presentAttendances = 0;
  let absentAttendances = 0;

  filteredTrainings.forEach((training) => {
    const eligibleAthletes = getAthletesForTraining({
      athletes,
      training,
      selectedCategory,
      categories,
    });
    const entriesByAthlete = new Map<string, any>();

    getTrainingAttendanceEntries(training, attendanceRecords).forEach((entry) => {
      const athleteId = getAttendanceAthleteId(entry);
      if (athleteId) {
        entriesByAthlete.set(athleteId, entry);
      }
    });

    expectedAttendances += eligibleAthletes.length;

    eligibleAthletes.forEach((athlete) => {
      const athleteId = firstString(athlete?.id, athlete?.athleteId);
      const entry = athleteId ? entriesByAthlete.get(athleteId) : null;

      if (!entry) {
        return;
      }

      registeredAttendances += 1;

      if (isPresentAttendance(entry)) {
        presentAttendances += 1;
      } else if (isAbsentAttendance(entry)) {
        absentAttendances += 1;
      }
    });
  });

  const missingAttendances = Math.max(
    0,
    expectedAttendances - registeredAttendances,
  );

  return {
    totalTrainings: filteredTrainings.length,
    expectedAttendances,
    registeredAttendances,
    presentAttendances,
    absentAttendances,
    missingAttendances,
    attendanceRate: expectedAttendances
      ? Math.round((presentAttendances / expectedAttendances) * 100)
      : 0,
  };
};

export const calculateMatchConvocationReport = ({
  matches,
  categories,
  selectedCategoryId,
  period,
}: {
  matches: any[];
  categories: NormalizedCategoryOption[];
  selectedCategoryId: string;
  period: ReportPeriodKey;
}): MatchConvocationReport => {
  const selectedCategory = getSelectedCategory(categories, selectedCategoryId);
  const filteredMatches = filterByCategory(
    filterByPeriod(matches, period),
    selectedCategory,
    categories,
  );
  const uniqueAthleteIds = new Set<string>();
  let matchesWithConvocations = 0;
  let totalConvocations = 0;

  filteredMatches.forEach((match) => {
    const convocatedIds = getConvocatedAthleteIdsFromMatch(match);
    if (convocatedIds.length > 0) {
      matchesWithConvocations += 1;
    }

    totalConvocations += convocatedIds.length;
    convocatedIds.forEach((athleteId) => uniqueAthleteIds.add(athleteId));
  });

  return {
    totalMatches: filteredMatches.length,
    matchesWithConvocations,
    matchesWithoutConvocations: Math.max(
      0,
      filteredMatches.length - matchesWithConvocations,
    ),
    totalConvocations,
    uniqueAthletesConvocated: uniqueAthleteIds.size,
    convocationCompletionRate: filteredMatches.length
      ? Math.round((matchesWithConvocations / filteredMatches.length) * 100)
      : 0,
  };
};

export const calculatePaymentReport = (
  movements: NormalizedClubMovement[] = [],
): PaymentReport => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return movements
    .filter(
      (movement) =>
        movement.direction === "income" &&
        movement.source === "athlete" &&
        !isPaymentExcludedFromTotals(movement.raw),
    )
    .reduce<PaymentReport>(
      (summary, movement) => {
        const amount = toAmount(movement.amount);
        if (amount <= 0) {
          return summary;
        }

        const status = normalizeText(movement.status);
        const isPaid = PAID_STATUSES.has(status) || Boolean(movement.paidAt);
        const dueDate = toDate(movement.dueDate);
        const isOverdue = !isPaid && Boolean(dueDate && dueDate < today);

        summary.hasPayments = true;
        summary.totalDue += amount;

        if (isPaid) {
          summary.totalPaid += amount;
          summary.paidCount += 1;
        } else if (isOverdue) {
          summary.totalOverdue += amount;
          summary.overdueCount += 1;
        } else {
          summary.totalPending += amount;
          summary.pendingCount += 1;
        }

        return summary;
      },
      {
        hasPayments: false,
        totalDue: 0,
        totalPaid: 0,
        totalPending: 0,
        totalOverdue: 0,
        paidCount: 0,
        pendingCount: 0,
        overdueCount: 0,
      },
    );
};
