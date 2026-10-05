import { apiRequest } from "@/lib/api/client";
import { normalizeClubSeasons } from "@/lib/club-seasons";
import { buildCategoryGroups, normalizeClubSites } from "@/lib/club-sites";
import { clubPrimarySport, getSportAdapter } from "@/lib/sports/adapters";
import type { ClubTeamDto } from "@/lib/sports/client";
import { getClubData, getClubSettings } from "@/lib/simplified-db";

/**
 * **Le scelte dell'editor delle squadre stabili** (ADR-0200 §8): stagioni del
 * club, categorie e gruppi operativi **di ogni stagione**.
 *
 * Una squadra si collega per stagione, quindi non bastano le categorie della
 * stagione mostrata: per ognuna si chiede il catalogo dichiarando quella
 * stagione (`x-active-season-id`), che e la stessa regola con cui il server
 * vaglia il collegamento (`filterCollectionBySeason`). Le letture passano dal
 * registro generico con `apiRequest`, come ogni schermata del gestionale.
 */

export type TeamSeasonOption = { id: string; label: string; status: string; active: boolean };
export type TeamCategoryOption = { id: string; name: string; seasonId: string };
export type TeamGroupOption = { id: string; label: string; categoryId: string; seasonId: string };

export type TeamEditorOptions = {
  seasons: TeamSeasonOption[];
  activeSeasonId: string | null;
  /** Il club non ha stagioni salvate: i collegamenti non si possono ancora scrivere. */
  seasonsMissing: boolean;
  categories: TeamCategoryOption[];
  groups: TeamGroupOption[];
  clubSportKey: string;
  clubSportLabel: string;
};

const asArray = (value: unknown): Record<string, any>[] => (Array.isArray(value) ? value : []);

const readSeasonCollection = async (resource: "categories" | "category_groups", clubId: string, seasonId: string) => {
  const response = await apiRequest<Record<string, any>[]>(
    `/api/v1/${resource}?club_id=${encodeURIComponent(clubId)}`,
    { headers: { "x-active-season-id": seasonId } },
  );
  if (response.error) throw new Error(response.error.message || "Impossibile leggere le categorie");
  return asArray(response.data);
};

export const loadTeamEditorOptions = async (clubId: string): Promise<TeamEditorOptions> => {
  const [settings, rawSites] = await Promise.all([getClubSettings(clubId), getClubData(clubId, "club_sites")]);
  const seasonState = normalizeClubSeasons(settings || {});
  const sites = normalizeClubSites(rawSites);
  const sportKey = clubPrimarySport(settings || {});
  const seasons = seasonState.seasons.map((season) => ({
    id: season.id,
    label: season.label,
    status: season.status,
    active: season.id === seasonState.activeSeasonId,
  }));

  if (seasonState.isFallback) {
    return {
      seasons: [],
      activeSeasonId: null,
      seasonsMissing: true,
      categories: [],
      groups: [],
      clubSportKey: sportKey,
      clubSportLabel: getSportAdapter(sportKey).label,
    };
  }

  const perSeason = await Promise.all(
    seasons.map(async (season) => {
      const [categories, groups] = await Promise.all([
        readSeasonCollection("categories", clubId, season.id),
        readSeasonCollection("category_groups", clubId, season.id),
      ]);
      const categoryOptions = categories
        .map((category) => ({
          id: String(category?.id || "").trim(),
          name: String(category?.name || "").trim() || "Categoria",
          seasonId: season.id,
        }))
        .filter((category) => category.id);
      const groupOptions = buildCategoryGroups({ categories: categories as any[], sites, groups })
        /* Il server accetta solo i gruppi configurati: quello implicito e la categoria stessa. */
        .filter((group) => !group.implicit && group.id)
        .map((group) => ({
          id: group.id,
          label: group.name,
          categoryId: group.categoryId,
          seasonId: season.id,
        }));
      return { categoryOptions, groupOptions };
    }),
  );

  return {
    seasons,
    activeSeasonId: seasonState.activeSeasonId,
    seasonsMissing: false,
    categories: perSeason.flatMap((entry) => entry.categoryOptions),
    groups: perSeason.flatMap((entry) => entry.groupOptions),
    clubSportKey: sportKey,
    clubSportLabel: getSportAdapter(sportKey).label,
  };
};

/** «2026/27 · Under 15 · Under 15 · Roma», per l'elenco delle squadre. */
export const describeSeasonLinks = (team: Pick<ClubTeamDto, "seasonLinks">, options: TeamEditorOptions | null) =>
  team.seasonLinks.map((link) => {
    const season = options?.seasons.find((candidate) => candidate.id === link.seasonId);
    const category = options?.categories.find(
      (candidate) => candidate.id === link.categoryId && candidate.seasonId === link.seasonId,
    );
    const group = link.groupId ? options?.groups.find((candidate) => candidate.id === link.groupId) : null;
    return {
      key: `${link.seasonId}:${link.categoryId}`,
      seasonLabel: season?.label || "Stagione non trovata",
      seasonActive: Boolean(season?.active),
      categoryLabel: category?.name || (options ? "Categoria non trovata" : "…"),
      groupLabel: link.groupId ? group?.label || "Gruppo non trovato" : null,
    };
  });

/** Lo sport di una squadra in parole: il suo, o quello del club. */
export const describeTeamSport = (team: Pick<ClubTeamDto, "sport">, options: TeamEditorOptions | null) =>
  team.sport ? getSportAdapter(team.sport).label : options ? `${options.clubSportLabel} (come il club)` : "Come il club";
