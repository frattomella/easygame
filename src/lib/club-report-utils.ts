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
  /**
   * Le rate incassate in parte. E un sottoinsieme di `pendingCount` +
   * `overdueCount`: la rata contribuisce alla cassa per cio che e entrato e al
   * residuo per il resto, quindi resta contata nel secchio del suo residuo.
   */
  partialCount: number;
};

const PRESENT_STATUSES = new Set(["present", "presente", "yes", "true"]);
const ABSENT_STATUSES = new Set(["absent", "assente", "no", "false"]);
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

/**
 * Le presenze raggruppate per allenamento, calcolate **una volta sola**.
 *
 * **Il difetto che chiude.** `getTrainingAttendanceEntries` scorreva l'intero
 * elenco delle presenze del club per **ogni** allenamento. Con duemila atleti
 * l'elenco e di centoventottomila righe e gli allenamenti sono qualche
 * centinaio: il report chiedeva al browser decine di milioni di confronti per
 * disegnare una tabella. Non si vedeva su un club piccolo, e si vedeva solo
 * su quello grande — cioe presso il cliente.
 *
 * La memoria e legata all'array con una `WeakMap`: finche il report riceve lo
 * stesso elenco, l'indice si costruisce una volta e si ricicla; quando
 * l'elenco viene ricaricato, quello vecchio sparisce da solo.
 */
const attendanceIndexCache = new WeakMap<any[], Map<string, any[]>>();

const getAttendanceByTrainingId = (attendanceRecords: any[]) => {
  const cached = attendanceIndexCache.get(attendanceRecords);
  if (cached) return cached;

  const index = new Map<string, any[]>();
  for (const entry of attendanceRecords) {
    const trainingId = getAttendanceTrainingId(entry);
    if (!trainingId) continue;

    const bucket = index.get(trainingId);
    if (bucket) bucket.push(entry);
    else index.set(trainingId, [entry]);
  }

  attendanceIndexCache.set(attendanceRecords, index);
  return index;
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
    ? getAttendanceByTrainingId(attendanceRecords).get(trainingId) || []
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

/**
 * Il perimetro del report pagamenti: le entrate che arrivano dagli atleti e non
 * sono annullate. E esportato perche l'invariante di cassa (ADR-0068) deve poter
 * costruire lo **stesso** sottoinsieme che legge `summarizeClubMovements`: se le
 * due pagine partissero da righe diverse, confrontarle non direbbe niente.
 */
export const isAthletePaymentMovement = (movement: NormalizedClubMovement) =>
  movement.direction === "income" &&
  movement.source === "athlete" &&
  !isPaymentExcludedFromTotals(movement.raw);

const toCents = (value: number) => Math.round(value * 100);

/**
 * Il report dei pagamenti legge la **cassa**, non lo stato della rata.
 *
 * Fino alla Wave 1 questa funzione sommava `movement.amount` — l'importo
 * **dovuto** — quando la rata risultava saldata, e **zero** quando era incassata
 * a meta. Il Full Club UAT ha misurato la conseguenza su dati veri: `/reports`
 * dichiarava 179,80 «Pagato» dove `/movements` diceva 250,00 incassati, sullo
 * stesso club e sullo stesso periodo.
 *
 * ADR-0068 dice quale delle due letture e quella giusta: il denaro entrato e
 * `collectedAmount`, che il movimento normalizzato porta gia con se — non serve
 * recuperarlo, serve sommarlo. Cio che resta dell'importo dovuto e il
 * **residuo**, e si ripartisce fra «in attesa» e «scaduto». Una rata incassata a
 * meta non conta piu per intero in nessuno dei due secchi.
 *
 * L'aritmetica e in centesimi come in `summarizeClubMovements`: e la condizione
 * perche le due pagine chiudano sullo stesso numero invece che a meno di un
 * arrotondamento.
 *
 * **Il periodo, e perche e un parametro e non un'omissione.** Fino alla Wave 4
 * questa funzione ignorava il filtro Periodo di `/reports`: scegliere «Ultimo
 * mese» cambiava allenamenti, presenze e gare e lasciava i quattro numeri
 * finanziari sull'intero storico, **senza dirlo**. Non era un difetto di
 * questa funzione — che il periodo non lo riceveva — ma della chiamata, che
 * non glielo passava; la correzione mette il periodo dove le altre tre
 * funzioni di report lo hanno gia, cosi che dimenticarlo sia una scelta
 * visibile invece che un'omissione invisibile. Il valore predefinito resta
 * «intero periodo», che e cio che i chiamanti esistenti si aspettano.
 */
export const calculatePaymentReport = (
  movements: NormalizedClubMovement[] = [],
  period: ReportPeriodKey = "all",
): PaymentReport => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const totals = filterByPeriod(movements, period)
    .filter(isAthletePaymentMovement)
    .reduce(
    (summary, movement) => {
      const dueCents = Math.max(0, toCents(toAmount(movement.amount)));
      const collectedCents = Math.max(
        0,
        toCents(toAmount(movement.collectedAmount)),
      );

      if (dueCents <= 0 && collectedCents <= 0) {
        return summary;
      }

      const residualCents = Math.max(0, dueCents - collectedCents);
      const dueDate = toDate(movement.dueDate);
      const isOverdue = residualCents > 0 && Boolean(dueDate && dueDate < today);

      summary.hasPayments = true;
      summary.totalDue += dueCents;
      summary.totalPaid += collectedCents;

      if (residualCents === 0) {
        summary.paidCount += 1;
      } else if (isOverdue) {
        summary.totalOverdue += residualCents;
        summary.overdueCount += 1;
      } else {
        summary.totalPending += residualCents;
        summary.pendingCount += 1;
      }

      if (collectedCents > 0 && residualCents > 0) {
        summary.partialCount += 1;
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
      partialCount: 0,
    },
  );

  return {
    hasPayments: totals.hasPayments,
    totalDue: totals.totalDue / 100,
    totalPaid: totals.totalPaid / 100,
    totalPending: totals.totalPending / 100,
    totalOverdue: totals.totalOverdue / 100,
    paidCount: totals.paidCount,
    pendingCount: totals.pendingCount,
    overdueCount: totals.overdueCount,
    partialCount: totals.partialCount,
  };
};
