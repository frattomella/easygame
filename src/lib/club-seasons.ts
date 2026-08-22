export type ClubSeason = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  status: "active" | "archived" | "draft";
  createdAt: string;
  archivedAt?: string | null;
};

const FALLBACK_DATE = new Date();

export const SEASON_SCOPED_DATA_TYPES = new Set([
  "categories",
  "discounts",
  "expected_expenses",
  "expected_income",
  "jersey_assignments",
  "jersey_groups",
  "kit_assignments",
  "matches",
  "payment_plans",
  "procure",
  "secretariat_notes",
  "sponsor_payments",
  "trainings",
  "transactions",
  "transfers",
  "weekly_schedule",
]);

const toIsoDate = (value: Date) => value.toISOString().split("T")[0];

const parseDate = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const buildSportsSeasonLabel = (referenceDate = FALLBACK_DATE) => {
  const currentYear = referenceDate.getFullYear();
  const startYear = referenceDate.getMonth() >= 6 ? currentYear : currentYear - 1;
  return `${startYear}/${startYear + 1}`;
};

export const buildDefaultSeason = (referenceDate = FALLBACK_DATE): ClubSeason => {
  const currentYear = referenceDate.getFullYear();
  const startYear = referenceDate.getMonth() >= 6 ? currentYear : currentYear - 1;
  const createdAt = new Date().toISOString();

  return {
    id: `season-${startYear}-${startYear + 1}`,
    label: `${startYear}/${startYear + 1}`,
    startDate: `${startYear}-07-01`,
    endDate: `${startYear + 1}-06-30`,
    status: "active",
    createdAt,
    archivedAt: null,
  };
};

export const normalizeClubSeasons = (settings: any) => {
  const fallbackSeason = buildDefaultSeason();
  const rawSeasons: unknown[] = Array.isArray(settings?.seasons)
    ? settings.seasons
    : [];

  const seasons: ClubSeason[] = rawSeasons.length
    ? rawSeasons
        .map((season: any) => {
          const startDate =
            typeof season?.startDate === "string" && season.startDate
              ? season.startDate
              : fallbackSeason.startDate;
          const endDate =
            typeof season?.endDate === "string" && season.endDate
              ? season.endDate
              : fallbackSeason.endDate;

          return {
            id:
              typeof season?.id === "string" && season.id.trim()
                ? season.id.trim()
                : `season-${startDate}-${endDate}`,
            label:
              typeof season?.label === "string" && season.label.trim()
                ? season.label.trim()
                : buildSportsSeasonLabel(parseDate(startDate) || FALLBACK_DATE),
            startDate,
            endDate,
            status:
              season?.status === "archived" || season?.status === "draft"
                ? season.status
                : "active",
            createdAt:
              typeof season?.createdAt === "string" && season.createdAt
                ? season.createdAt
                : new Date().toISOString(),
            archivedAt:
              typeof season?.archivedAt === "string" ? season.archivedAt : null,
          } satisfies ClubSeason;
        })
        .sort((left, right) => {
          const leftDate = parseDate(left.startDate)?.getTime() || 0;
          const rightDate = parseDate(right.startDate)?.getTime() || 0;
          return rightDate - leftDate;
        })
    : [fallbackSeason];

  const allowedSeasonIds = new Set(seasons.map((season) => season.id));
  const preferredActiveSeasonId =
    typeof settings?.activeSeasonId === "string" && allowedSeasonIds.has(settings.activeSeasonId)
      ? settings.activeSeasonId
      : null;

  const activeSeason =
    seasons.find((season) => season.id === preferredActiveSeasonId) ||
    seasons.find((season) => season.status === "active") ||
    seasons[0];

  return {
    seasons,
    activeSeasonId: activeSeason.id,
    activeSeason,
    legacySeasonId: resolveLegacySeasonId(seasons),
  };
};

/**
 * Stagione a cui appartengono i record creati **prima** dell'introduzione
 * delle stagioni, cioe quelli senza `seasonId`.
 *
 * E la stagione piu vecchia del club: `seasons` e ordinato dalla piu recente
 * alla piu antica. Attribuirli a una stagione sola e l'unico modo di tenere le
 * stagioni separate senza far sparire i dati storici (WP-32).
 */
export const resolveLegacySeasonId = (seasons: ClubSeason[]) =>
  seasons.length > 0 ? seasons[seasons.length - 1].id : null;

const readRecordSeasonId = (record: any) => {
  const value =
    typeof record?.seasonId === "string"
      ? record.seasonId
      : typeof record?.season_id === "string"
        ? record.season_id
        : "";

  return value.trim() || null;
};

export const isSeasonScopedDataType = (dataType: string) =>
  SEASON_SCOPED_DATA_TYPES.has(dataType);

export const applySeasonIdToRecord = (
  record: any,
  seasonId: string | null | undefined,
) => {
  if (!record || typeof record !== "object" || !seasonId) {
    return record;
  }

  return {
    ...record,
    seasonId: record.seasonId || seasonId,
  };
};

export const applySeasonIdToCollection = (
  records: any[],
  seasonId: string | null | undefined,
) =>
  (Array.isArray(records) ? records : []).map((record) =>
    applySeasonIdToRecord(record, seasonId),
  );

/**
 * Filtra una collezione sulla stagione attiva.
 *
 * I record **senza** `seasonId` sono quelli creati prima che le stagioni
 * esistessero. Non vanno scartati (sparirebbero) ne mostrati ovunque (le
 * stagioni non sarebbero piu separate): appartengono alla stagione baseline,
 * cioe la piu vecchia del club. Quando la baseline non e nota si preferisce
 * mostrarli, perche perdere dati e peggio che mostrarne troppi.
 */
export const filterCollectionBySeason = (
  dataType: string,
  records: any[],
  activeSeasonId: string | null | undefined,
  options: { legacySeasonId?: string | null } = {},
) => {
  if (!isSeasonScopedDataType(dataType)) {
    return Array.isArray(records) ? records : [];
  }

  if (!activeSeasonId) {
    return Array.isArray(records) ? records : [];
  }

  const legacySeasonId = options.legacySeasonId ?? null;
  const keepLegacyRecords = !legacySeasonId || legacySeasonId === activeSeasonId;

  return (Array.isArray(records) ? records : []).filter((record) => {
    const recordSeasonId = readRecordSeasonId(record);

    return recordSeasonId === null
      ? keepLegacyRecords
      : recordSeasonId === activeSeasonId;
  });
};

export const createSeasonDraft = (
  label: string,
  startDate: string,
  endDate: string,
): ClubSeason => ({
  id: `season-${startDate}-${endDate}-${Math.random().toString(36).slice(2, 7)}`,
  label: label.trim(),
  startDate,
  endDate,
  status: "active",
  createdAt: new Date().toISOString(),
  archivedAt: null,
});

export const buildSeasonLabelFromDates = (startDate: string, endDate: string) => {
  const start = parseDate(startDate);
  const end = parseDate(endDate);

  if (!start || !end) {
    return buildSportsSeasonLabel();
  }

  return `${start.getFullYear()}/${end.getFullYear()}`;
};

export const normalizeActiveClubSeason = (club: any) => {
  const settings =
    typeof club?.settings === "object" && club.settings ? club.settings : {};
  const { activeSeason, activeSeasonId } = normalizeClubSeasons(settings);

  return {
    activeSeasonId,
    activeSeasonLabel: activeSeason.label,
  };
};
