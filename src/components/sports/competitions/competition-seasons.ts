import { normalizeClubSeasons } from "@/lib/club-seasons";
import { getClubSettings } from "@/lib/simplified-db";

/**
 * Le stagioni del club per l'editor delle competizioni: le stesse di
 * `normalizeClubSeasons`, senza quella sintetizzata per un club che non ne ha
 * ancora salvata nessuna (non e un dato, e una competizione non ci si lega).
 */
export type CompetitionSeasonOption = { id: string; label: string; active: boolean };

export const loadCompetitionSeasons = async (
  clubId: string,
): Promise<{ seasons: CompetitionSeasonOption[]; activeSeasonId: string | null }> => {
  const settings = await getClubSettings(clubId);
  const state = normalizeClubSeasons(settings || {});
  if (state.isFallback) return { seasons: [], activeSeasonId: null };
  return {
    seasons: state.seasons.map((season) => ({ id: season.id, label: season.label, active: season.id === state.activeSeasonId })),
    activeSeasonId: state.activeSeasonId,
  };
};
