import { prisma } from "../../prisma";
import { readClubResourceCollection } from "../../resources";
import { filterCollectionBySeason, normalizeClubSeasons } from "@/lib/club-seasons";
import { buildCategoryGroups, normalizeClubSites, type CategoryGroup } from "@/lib/club-sites";
import { clubPrimarySport, getSportAdapter, type SportAdapter } from "@/lib/sports/adapters";
import { normalizeSeasonLinks, type SeasonLink } from "@/lib/sports/teams";

/**
 * **Il contesto del club per il sito**: cio che quasi ogni sorgente dati
 * chiede, letto **una volta** per pagina.
 *
 * Contiene configurazione sportiva e anagrafiche di societa (categorie,
 * gruppi, sedi, impianti, squadre stabili, competizioni, avversari, schede di
 * allenatori e staff) — mai una riga di atleta, che passa dal caricatore delle
 * persone e dalla policy di pubblicazione. Le schede di allenatori e staff
 * restano interne a questo modulo: il sito vede di loro solo cio che la policy
 * restituisce.
 */

export type ClubRow = {
  id: string;
  name: string;
  logo_url: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  province: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  vat_number: string | null;
  fiscal_code: string | null;
  business_name: string | null;
  settings: Record<string, any>;
};

export type TeamRow = {
  id: string;
  name: string;
  short_name: string | null;
  slug: string;
  previous_slugs: string[];
  sport: string | null;
  description: string | null;
  photo_attachment_id: string | null;
  season_links: SeasonLink[];
  sort_order: number;
  active: boolean;
};

export type ClubContext = {
  organizationId: string;
  club: ClubRow;
  seasons: ReturnType<typeof normalizeClubSeasons>;
  sport: SportAdapter;
  categoriesBySeason: (seasonId: string | null) => Array<Record<string, any>>;
  categoryById: Map<string, Record<string, any>>;
  groups: CategoryGroup[];
  groupById: Map<string, CategoryGroup>;
  structures: Array<Record<string, any>>;
  trainers: Array<Record<string, any>>;
  staff: Array<Record<string, any>>;
  jerseyAssignments: Array<Record<string, any>>;
  teams: TeamRow[];
  teamById: Map<string, TeamRow>;
  competitions: Map<string, { id: string; name: string; short_name: string | null; season_id: string | null; standings: unknown; standings_updated_at: Date | null; kind: string }>;
  opponents: Map<string, { id: string; name: string; short_name: string | null; city: string | null; logo_attachment_id: string | null }>;
};

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};

/** Solo le colonne che il sito puo mostrare: niente IBAN, PEC, codice SDI, rappresentante. */
const CLUB_SELECT = {
  id: true,
  name: true,
  logo_url: true,
  address: true,
  city: true,
  postal_code: true,
  province: true,
  contact_email: true,
  contact_phone: true,
  vat_number: true,
  fiscal_code: true,
  business_name: true,
  settings: true,
} as const;

export const loadClubContext = async (organizationId: string): Promise<ClubContext | null> => {
  const club = (await (prisma as any).club.findUnique({ where: { id: organizationId }, select: CLUB_SELECT })) as ClubRow | null;
  if (!club) return null;
  const settings = asRecord(club.settings);
  const seasons = normalizeClubSeasons(settings);
  const knownSeasonIds = seasons.seasons.map((season) => season.id);

  const [categories, groupsRaw, sites, trainers, staff, jersey, teams, competitions, opponents, structuresRow] = await Promise.all([
    readClubResourceCollection(organizationId, "categories"),
    readClubResourceCollection(organizationId, "category_groups"),
    readClubResourceCollection(organizationId, "club_sites"),
    readClubResourceCollection(organizationId, "trainers"),
    readClubResourceCollection(organizationId, "staff_members"),
    readClubResourceCollection(organizationId, "jersey_assignments"),
    (prisma as any).clubTeam.findMany({
      where: { organization_id: organizationId },
      orderBy: [{ sort_order: "asc" }, { name: "asc" }],
    }),
    (prisma as any).competition.findMany({
      where: { organization_id: organizationId },
      select: { id: true, name: true, short_name: true, season_id: true, standings: true, standings_updated_at: true, kind: true },
    }),
    (prisma as any).opponent.findMany({
      where: { organization_id: organizationId },
      select: { id: true, name: true, short_name: true, city: true, logo_attachment_id: true },
    }),
    (prisma as any).club.findUnique({ where: { id: organizationId }, select: { structures: true } }),
  ]);

  const categoryById = new Map<string, Record<string, any>>();
  for (const category of categories as Array<Record<string, any>>) {
    if (category?.id) categoryById.set(String(category.id), category);
  }

  const categoriesBySeason = (seasonId: string | null) =>
    filterCollectionBySeason("categories", categories as any[], seasonId, {
      legacySeasonId: seasons.legacySeasonId,
      knownSeasonIds,
    }) as Array<Record<string, any>>;

  const groups = buildCategoryGroups({
    categories: categories as any[],
    sites: normalizeClubSites(sites),
    groups: groupsRaw,
  });

  const teamRows: TeamRow[] = (teams as any[]).map((team) => ({
    ...team,
    previous_slugs: Array.isArray(team.previous_slugs) ? team.previous_slugs : [],
    season_links: normalizeSeasonLinks(team.season_links),
  }));

  return {
    organizationId,
    club,
    seasons,
    sport: getSportAdapter(clubPrimarySport(settings)),
    categoriesBySeason,
    categoryById,
    groups,
    groupById: new Map(groups.map((group) => [group.id, group])),
    structures: Array.isArray(structuresRow?.structures) ? structuresRow.structures : [],
    trainers: trainers as Array<Record<string, any>>,
    staff: staff as Array<Record<string, any>>,
    jerseyAssignments: jersey as Array<Record<string, any>>,
    teams: teamRows,
    teamById: new Map(teamRows.map((team) => [team.id, team])),
    competitions: new Map((competitions as any[]).map((competition) => [competition.id, competition])),
    opponents: new Map((opponents as any[]).map((opponent) => [opponent.id, opponent])),
  };
};

/** L'identificativo della stagione che un blocco chiede: `active` o uno vero. */
export const resolveSeasonRef = (context: ClubContext, ref: unknown) => {
  const value = String(ref ?? "active");
  if (value === "active" || !value) return context.seasons.activeSeasonId;
  return context.seasons.seasons.some((season) => season.id === value) ? value : context.seasons.activeSeasonId;
};

export const seasonLabel = (context: ClubContext, seasonId: string | null) =>
  context.seasons.seasons.find((season) => season.id === seasonId)?.label || "";

/** Il collegamento di una squadra in una stagione (categoria e gruppo). */
export const teamLinkForSeason = (team: TeamRow, seasonId: string | null) =>
  team.season_links.find((link) => link.seasonId === seasonId) || null;
