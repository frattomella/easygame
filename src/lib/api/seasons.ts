import { apiRequest } from "./client";
import type {
  ClubSeason,
  SeasonRolloverEntry,
  SeasonRolloverTypeDescriptor,
} from "../club-seasons";

/**
 * Trasporto delle stagioni. Sta qui e non nei componenti: nessun `fetch`
 * diretto a `/api` da un componente (CLAUDE.md, sezione 2).
 */

export type SeasonRolloverAthletes = {
  proposed: number;
  confirmed: number;
  notConfirmed: number;
  created: number;
  alreadyPresent: number;
  unmappable: number;
  carried: number;
  requested: boolean;
};

export type SeasonRolloverSummary = {
  sourceSeasonId: string;
  targetSeasonId: string;
  sourceSeasonLabel: string;
  targetSeasonLabel: string;
  entries: SeasonRolloverEntry[];
  createdTotal: number;
  skippedTotal: number;
  applied: boolean;
  athletes: SeasonRolloverAthletes;
};

export type SeasonRosterMembership = {
  membershipId: string;
  categoryId: string;
  categoryName: string;
  siteId: string | null;
  isPrimary: boolean;
  mappable: boolean;
};

export type SeasonRosterAthlete = {
  athleteId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  status: string;
  memberships: SeasonRosterMembership[];
};

export type SeasonRoster = {
  seasonId: string;
  seasonLabel: string;
  athletes: SeasonRosterAthlete[];
  total: number;
  unmappable: number;
};

export type SeasonsOverview = {
  seasons: ClubSeason[];
  activeSeasonId: string;
  activeSeason: ClubSeason;
  legacySeasonId: string | null;
  counts: Record<string, Record<string, number>>;
  rolloverTypes: SeasonRolloverTypeDescriptor[];
  globalTypes: Array<{ key: string; label: string }>;
  neverCopiedTypes: Array<{ key: string; label: string }>;
  /** Atleti attivi senza squadra nella stagione attiva. */
  athletesWithoutTeam?: number;
};

const unwrap = <T>(envelope: { data: T; error: { message: string } | null }) => {
  if (envelope.error) {
    throw new Error(envelope.error.message);
  }
  return envelope.data;
};

export const fetchSeasonsOverview = async () =>
  unwrap(await apiRequest<SeasonsOverview>("/api/v1/seasons"));

export const createSeason = async (input: {
  label?: string;
  startDate: string;
  endDate: string;
  activate?: boolean;
  rollover?: {
    sourceSeasonId?: string;
    types: string[];
    /** `null` = tutti i proposti. Un elenco = solo i riconfermati. */
    athleteIds?: string[] | null;
  } | null;
}) =>
  unwrap(
    await apiRequest<{
      season: ClubSeason;
      state: SeasonsOverview;
      rollover: SeasonRolloverSummary | null;
    }>("/api/v1/seasons", { method: "POST", body: input }),
  );

export const updateSeasonStatus = async (
  seasonId: string,
  action: "activate" | "archive",
) =>
  unwrap(
    await apiRequest<{ season: ClubSeason; state: SeasonsOverview }>(
      `/api/v1/seasons/${encodeURIComponent(seasonId)}`,
      { method: "PATCH", body: { action } },
    ),
  );

export const runSeasonRollover = async (input: {
  targetSeasonId: string;
  sourceSeasonId: string;
  types: string[];
  athleteIds?: string[] | null;
  preview?: boolean;
}) =>
  unwrap(
    await apiRequest<SeasonRolloverSummary>(
      `/api/v1/seasons/${encodeURIComponent(input.targetSeasonId)}/rollover`,
      {
        method: "POST",
        body: {
          sourceSeasonId: input.sourceSeasonId,
          types: input.types,
          athleteIds: input.athleteIds ?? null,
          preview: Boolean(input.preview),
        },
      },
    ),
  );

/** L'elenco di riconferma della stagione di origine. */
export const fetchSeasonRoster = async (seasonId: string) =>
  unwrap(
    await apiRequest<SeasonRoster>(
      `/api/v1/seasons/${encodeURIComponent(seasonId)}/roster`,
    ),
  );
