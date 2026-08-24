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

export type SeasonRolloverSummary = {
  sourceSeasonId: string;
  targetSeasonId: string;
  sourceSeasonLabel: string;
  targetSeasonLabel: string;
  entries: SeasonRolloverEntry[];
  createdTotal: number;
  skippedTotal: number;
  applied: boolean;
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
  rollover?: { sourceSeasonId?: string; types: string[] } | null;
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
          preview: Boolean(input.preview),
        },
      },
    ),
  );
