import { prisma } from "../../prisma";
import { normalizePeriodScores } from "@/lib/sports/adapters";
import { detailSlug } from "@/lib/website/slug";
import { linkForSeason } from "@/lib/sports/teams";
import type { PublicEvent, PublicImage, PublicMatch, PublicMatchStatus, PublicSide } from "@/lib/website/public-dto";
import type { ClubContext, TeamRow } from "./club-context";
import { toPublicImage, type MediaMeta } from "./images";

/**
 * **Le gare e gli eventi per il sito.**
 *
 * Una sola lettura di `club_events` per pagina (le righe, non la proiezione
 * JSON `clubs.matches`, ADR-0098), con le sole colonne che servono: niente
 * note interne, niente allenatori, niente RSVP. Tutte le richieste di gare
 * della pagina — prossima gara, calendario, risultati, squadra — si
 * risolvono in memoria da questa lettura.
 */

export type EventRow = {
  id: string;
  kind: string;
  title: string | null;
  status: string;
  season_id: string | null;
  category_id: string | null;
  category_name: string | null;
  starts_at: Date;
  ends_at: Date | null;
  timezone: string;
  location: string | null;
  structure_id: string | null;
  opponent: string | null;
  home_away: string | null;
  team_id: string | null;
  competition_id: string | null;
  opponent_id: string | null;
  round_label: string | null;
  home_score: number | null;
  away_score: number | null;
  result_status: string | null;
  period_scores: unknown;
};

const EVENT_SELECT = {
  id: true,
  kind: true,
  title: true,
  status: true,
  season_id: true,
  category_id: true,
  category_name: true,
  starts_at: true,
  ends_at: true,
  timezone: true,
  location: true,
  structure_id: true,
  opponent: true,
  home_away: true,
  team_id: true,
  competition_id: true,
  opponent_id: true,
  round_label: true,
  home_score: true,
  away_score: true,
  result_status: true,
  period_scores: true,
} as const;

/** Le gare (e, se servono, gli allenamenti) del club in una finestra. */
export const loadEventRows = async (
  context: ClubContext,
  options: { kinds: Array<"match" | "training">; from?: Date | null; to?: Date | null; limit?: number },
): Promise<EventRow[]> =>
  (prisma as any).clubEvent.findMany({
    where: {
      organization_id: context.organizationId,
      kind: { in: options.kinds },
      status: { not: "archived" },
      ...(options.from || options.to
        ? { starts_at: { ...(options.from ? { gte: options.from } : {}), ...(options.to ? { lte: options.to } : {}) } }
        : {}),
    },
    select: EVENT_SELECT,
    orderBy: { starts_at: "asc" },
    take: Math.min(2000, options.limit ?? 1000),
  });

export const loadEventById = async (context: ClubContext, eventId: string): Promise<EventRow | null> => {
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return null;
  return (prisma as any).clubEvent.findFirst({
    where: { id: eventId, organization_id: context.organizationId, status: { not: "archived" } },
    select: EVENT_SELECT,
  });
};

export type MatchBuildOptions = {
  now: Date;
  bases: Partial<Record<"match" | "team" | "event", string>>;
  meta: Map<string, MediaMeta>;
  clubSide: { name: string; shortName: string; logo: PublicImage | null };
  recapByEvent?: Map<string, string>;
};

/** La stagione di una riga: quella scritta, o la piu vecchia per i dati senza annata. */
const seasonOfRow = (context: ClubContext, row: EventRow) => {
  const known = context.seasons.seasons.some((season) => season.id === row.season_id);
  return known ? row.season_id : context.seasons.legacySeasonId;
};

/** La squadra stabile di una gara: dichiarata, o dedotta dalla categoria nella stagione. */
export const teamOfEvent = (context: ClubContext, row: EventRow): TeamRow | null => {
  if (row.team_id) return context.teamById.get(row.team_id) || null;
  if (!row.category_id) return null;
  const seasonId = seasonOfRow(context, row);
  return (
    context.teams.find((team) => {
      const link = linkForSeason(team.season_links, seasonId);
      return link?.categoryId === row.category_id;
    }) || null
  );
};

const venueOf = (context: ClubContext, row: EventRow) => {
  const structure = row.structure_id ? context.structures.find((item) => String(item?.id) === row.structure_id) : null;
  if (structure) {
    const address = [structure.address, structure.city].filter(Boolean).join(", ");
    return { name: String(structure.name || row.location || "").slice(0, 120), address: String(address).slice(0, 200) };
  }
  return row.location ? { name: String(row.location).slice(0, 120), address: "" } : null;
};

const statusOf = (row: EventRow, now: Date): PublicMatchStatus => {
  const status = String(row.status || "").toLowerCase();
  if (status === "cancelled") return "cancelled";
  if (status === "completed" || row.result_status === "final") return "completed";
  const ends = row.ends_at ? row.ends_at.getTime() : row.starts_at.getTime() + 3 * 3600 * 1000;
  return ends < now.getTime() ? "completed" : "scheduled";
};

export const toPublicMatch = (context: ClubContext, row: EventRow, options: MatchBuildOptions): PublicMatch => {
  const opponentRecord = row.opponent_id ? context.opponents.get(row.opponent_id) : null;
  const opponent: PublicSide = {
    name: String(opponentRecord?.name || row.opponent || "Avversario da definire").slice(0, 120),
    shortName: String(opponentRecord?.short_name || opponentRecord?.name || row.opponent || "").slice(0, 40),
    logo: opponentRecord?.logo_attachment_id
      ? toPublicImage(opponentRecord.logo_attachment_id, options.meta, `Logo ${opponentRecord.name}`)
      : null,
    isClub: false,
  };
  const team = teamOfEvent(context, row);
  const club: PublicSide = {
    name: options.clubSide.name,
    shortName: options.clubSide.shortName,
    logo: options.clubSide.logo,
    isClub: true,
  };
  const homeAway = row.home_away === "away" ? "away" : row.home_away === "neutral" ? "neutral" : "home";
  const home = homeAway === "away" ? opponent : club;
  const away = homeAway === "away" ? club : opponent;

  const hasResult = row.home_score !== null && row.home_score !== undefined && row.away_score !== null && row.away_score !== undefined;
  const clubScore = homeAway === "away" ? row.away_score : row.home_score;
  const otherScore = homeAway === "away" ? row.home_score : row.away_score;
  const outcome = hasResult
    ? (clubScore as number) > (otherScore as number)
      ? "win"
      : (clubScore as number) < (otherScore as number)
        ? "loss"
        : "draw"
    : null;

  const competition = row.competition_id ? context.competitions.get(row.competition_id) : null;
  const label = `${home.shortName || home.name} vs ${away.shortName || away.name}`;
  const slug = detailSlug(row.id, label);

  return {
    id: row.id,
    slug,
    href: options.bases.match ? `${options.bases.match}/${slug}` : null,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at ? row.ends_at.toISOString() : null,
    timezone: row.timezone || "Europe/Rome",
    status: statusOf(row, options.now),
    homeAway,
    home,
    away,
    venue: venueOf(context, row),
    competition: competition ? { id: competition.id, name: competition.name, shortName: competition.short_name || competition.name } : null,
    round: String(row.round_label || "").slice(0, 60),
    team: team ? { id: team.id, name: team.name, href: options.bases.team ? `${options.bases.team}/${team.slug}` : null } : null,
    categoryLabel: String(team?.name || row.category_name || "").slice(0, 80),
    result: hasResult
      ? { home: row.home_score as number, away: row.away_score as number, final: row.result_status === "final", outcome }
      : null,
    periods: normalizePeriodScores(row.period_scores, context.sport).filter((period) => period.home !== null || period.away !== null),
    recapHref: options.recapByEvent?.get(row.id) || null,
  };
};

export const toPublicEvent = (context: ClubContext, row: EventRow, options: MatchBuildOptions): PublicEvent => {
  const team = teamOfEvent(context, row);
  const match = row.kind === "match" ? toPublicMatch(context, row, options) : null;
  const title =
    match
      ? `${match.home.name} – ${match.away.name}`
      : `Allenamento${team ? ` · ${team.name}` : row.category_name ? ` · ${row.category_name}` : ""}`;
  const slug = detailSlug(row.id, title);
  return {
    id: row.id,
    slug,
    href: options.bases.event ? `${options.bases.event}/${slug}` : match?.href || null,
    kind: row.kind === "match" ? "match" : "training",
    title: title.slice(0, 160),
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at ? row.ends_at.toISOString() : null,
    timezone: row.timezone || "Europe/Rome",
    venue: venueOf(context, row),
    team: team ? { id: team.id, name: team.name, href: options.bases.team ? `${options.bases.team}/${team.slug}` : null } : null,
    categoryLabel: String(team?.name || row.category_name || "").slice(0, 80),
    status: statusOf(row, options.now),
    match,
  };
};

export type MatchFilter = {
  teamId?: string | null;
  competitionId?: string | null;
  venue?: "all" | "home" | "away";
  seasonId?: string | null;
};

export const filterEventRows = (context: ClubContext, rows: EventRow[], filter: MatchFilter) =>
  rows.filter((row) => {
    if (filter.teamId && teamOfEvent(context, row)?.id !== filter.teamId) return false;
    if (filter.competitionId && row.competition_id !== filter.competitionId) return false;
    if (filter.venue === "home" && row.home_away === "away") return false;
    if (filter.venue === "away" && row.home_away !== "away") return false;
    if (filter.seasonId && seasonOfRow(context, row) !== filter.seasonId) return false;
    return true;
  });

/** I numeri di una squadra, contati solo dai risultati definitivi. */
export const teamStatsFrom = (context: ClubContext, rows: EventRow[]) => {
  let played = 0;
  let won = 0;
  let drawn = 0;
  let lost = 0;
  let pointsFor = 0;
  let pointsAgainst = 0;
  for (const row of rows) {
    if (row.kind !== "match" || row.result_status !== "final" || row.home_score === null || row.away_score === null) continue;
    const away = row.home_away === "away";
    const forScore = (away ? row.away_score : row.home_score) as number;
    const against = (away ? row.home_score : row.away_score) as number;
    played += 1;
    pointsFor += forScore;
    pointsAgainst += against;
    if (forScore > against) won += 1;
    else if (forScore < against) lost += 1;
    else drawn += 1;
  }
  return { played, won, drawn, lost, pointsFor, pointsAgainst };
};
