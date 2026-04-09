type AthleteAnalyticsEvent = {
  id: string;
  type: "training" | "match";
  title: string;
  date: string | null;
  categoryLabel: string;
  statusLabel: string;
  context: "primary" | "secondary" | "extra";
  contextLabel: string;
  notes?: string;
};

export type AthleteAnalyticsSummary = {
  presenceCount: number;
  convocationCount: number;
  playedMatchesCount: number;
  extraCategoryCount: number;
  events: AthleteAnalyticsEvent[];
};

export const EMPTY_ATHLETE_ANALYTICS: AthleteAnalyticsSummary = {
  presenceCount: 0,
  convocationCount: 0,
  playedMatchesCount: 0,
  extraCategoryCount: 0,
  events: [],
};

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const parseMaybeJson = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const looksLikeJson =
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("{") && trimmed.endsWith("}"));

  if (!looksLikeJson) {
    return value;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const toNonNegativeNumber = (value: unknown) => {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const toTrimmedString = (value: unknown) => String(value || "").trim();

export const normalizeTextValue = (
  value: unknown,
  fallback = "",
) => {
  const parsed = parseMaybeJson(value);

  if (typeof parsed === "string" || typeof parsed === "number") {
    const trimmed = String(parsed).trim();
    return trimmed || fallback;
  }

  return fallback;
};

export const normalizeNullableTextValue = (value: unknown) =>
  normalizeTextValue(value) || null;

export const normalizeRecord = (value: unknown): Record<string, any> => {
  const parsed = parseMaybeJson(value);
  return isRecord(parsed) ? parsed : {};
};

export const normalizeCollection = <T = any>(value: unknown): T[] => {
  const parsed = parseMaybeJson(value);

  if (Array.isArray(parsed)) {
    return parsed.filter(
      (entry) => entry !== undefined && entry !== null,
    ) as T[];
  }

  if (isRecord(parsed) && Array.isArray(parsed.items)) {
    return parsed.items.filter(
      (entry) => entry !== undefined && entry !== null,
    ) as T[];
  }

  return [];
};

export const normalizeStringList = (value: unknown) =>
  normalizeCollection(value)
    .flatMap((entry) => {
      if (typeof entry === "string") {
        const trimmed = entry.trim();
        return trimmed ? [trimmed] : [];
      }

      if (isRecord(entry)) {
        const candidate = toTrimmedString(
          entry.name ??
            entry.label ??
            entry.title ??
            entry.categoryName ??
            entry.category_name,
        );
        return candidate ? [candidate] : [];
      }

      return [];
    })
    .filter(Boolean);

export const normalizeAthleteProfileCollections = (value: unknown) => {
  const record = normalizeRecord(value);

  return {
    guardians: normalizeCollection(record.guardians),
    registrations: normalizeCollection(record.registrations),
    medicalVisits: normalizeCollection(record.medicalVisits),
    identityDocuments: normalizeCollection(record.identityDocuments),
    enrollmentDocuments: normalizeCollection(record.enrollmentDocuments),
    documents: normalizeCollection(record.documents),
    payments: normalizeCollection(record.payments),
    certificateFiles: normalizeRecord(record.certificateFiles),
    clothingSizes: normalizeRecord(record.clothingSizes),
  };
};

export const normalizeAthleteAnalytics = (
  value: unknown,
): AthleteAnalyticsSummary => {
  const record = normalizeRecord(value);
  const events = normalizeCollection<any>(record.events).map((event, index) => ({
    id: toTrimmedString(event?.id) || `athlete-event-${index}`,
    type: event?.type === "match" ? "match" : "training",
    title: toTrimmedString(event?.title) || "Evento",
    date: toTrimmedString(event?.date) || null,
    categoryLabel: toTrimmedString(event?.categoryLabel) || "Categoria",
    statusLabel: toTrimmedString(event?.statusLabel) || "Registrato",
    context:
      event?.context === "secondary" || event?.context === "extra"
        ? event.context
        : "primary",
    contextLabel: toTrimmedString(event?.contextLabel) || "Primaria",
    notes: toTrimmedString(event?.notes) || undefined,
  }));

  return {
    presenceCount: toNonNegativeNumber(record.presenceCount),
    convocationCount: toNonNegativeNumber(record.convocationCount),
    playedMatchesCount: toNonNegativeNumber(record.playedMatchesCount),
    extraCategoryCount: toNonNegativeNumber(record.extraCategoryCount),
    events,
  };
};
