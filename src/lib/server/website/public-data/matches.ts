import { prisma } from "../../prisma";
import { normalizePeriodScores } from "@/lib/sports/adapters";
import { detailSlug } from "@/lib/website/slug";
import { linkForSeason } from "@/lib/sports/teams";
import type { PublicEvent, PublicImage, PublicMatch, PublicMatchStatus, PublicSide } from "@/lib/website/public-dto";
import type { ClubContext, TeamRow } from "./club-context";
import { toPublicImage, type MediaMeta } from "./images";
import { instantFromLocalTime } from "@/lib/structures-utils";

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
  payload: true,
} as const;

/*
  **Le cifre dell'archivio e l'istante vero.**

  `club_events.starts_at` porta le cifre digitate come se fossero UTC
  (ADR-0098: `toEventInstant` fa `setUTCHours(ora, minuti)`), e il gestionale
  le rilegge cosi. Il sito invece ragiona in istanti — conto alla rovescia,
  JSON-LD, «prossima gara» contro l'adesso vero — e le mostra nel fuso del
  club: senza conversione una gara delle 18:00 compariva alle 20:00 (collaudo a
  browser del 2026-10-05). Si converte qui, una volta, all'uscita
  dall'archivio; i limiti delle query fanno il viaggio inverso.
*/
const DEFAULT_TIMEZONE = "Europe/Rome";

/** Cifre dell'archivio → istante vero nel fuso del club. */
export const archiveDigitsToInstant = (value: Date, timeZone: string = DEFAULT_TIMEZONE): Date => {
  const iso = value.toISOString();
  return instantFromLocalTime(iso.slice(0, 10), iso.slice(11, 16), timeZone || DEFAULT_TIMEZONE) || value;
};

/** Istante vero → cifre dell'archivio (per i limiti di una query su `starts_at`). */
export const instantToArchiveDigits = (value: Date, timeZone: string = DEFAULT_TIMEZONE): Date => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timeZone || DEFAULT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(value);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value || "0");
  return new Date(Date.UTC(read("year"), read("month") - 1, read("day"), read("hour") === 24 ? 0 : read("hour"), read("minute"), read("second")));
};

/*
  **Casa o trasferta.** La colonna `home_away` e nata con ADR-0200 e le gare
  scritte prima — o da un modulo che dichiara solo `isHome` — la hanno vuota:
  vuota non vuol dire «in casa», e il sito invertiva risultato e parziali di
  una gara in trasferta. Si legge la colonna, poi `payload.isHome`.
*/
export const homeAwayOfRow = (row: { home_away?: string | null; payload?: unknown }): "home" | "away" | "neutral" => {
  const column = String(row.home_away || "").trim().toLowerCase();
  if (column === "away" || column === "trasferta") return "away";
  if (column === "neutral") return "neutral";
  if (column === "home" || column === "casa") return "home";
  const payload = row.payload && typeof row.payload === "object" ? (row.payload as Record<string, unknown>) : {};
  if (payload.isHome === false) return "away";
  const declared = String(payload.homeAway ?? payload.home_away ?? "").trim().toLowerCase();
  if (declared === "away" || declared === "trasferta") return "away";
  return "home";
};

/** Una riga come la legge il sito: istanti veri, casa/trasferta deciso, senza il resto del payload. */
const toSiteRow = (row: EventRow & { payload?: unknown }): EventRow => {
  const { payload, ...rest } = row;
  const timeZone = rest.timezone || DEFAULT_TIMEZONE;
  return {
    ...rest,
    starts_at: archiveDigitsToInstant(rest.starts_at, timeZone),
    ends_at: rest.ends_at ? archiveDigitsToInstant(rest.ends_at, timeZone) : null,
    home_away: homeAwayOfRow({ home_away: rest.home_away, payload }),
  };
};

/** Le gare (e, se servono, gli allenamenti) del club in una finestra. */
export const loadEventRows = async (
  context: ClubContext,
  options: { kinds: Array<"match" | "training">; from?: Date | null; to?: Date | null; limit?: number },
): Promise<EventRow[]> => {
  const rows = await (prisma as any).clubEvent.findMany({
    where: {
      organization_id: context.organizationId,
      kind: { in: options.kinds },
      status: { not: "archived" },
      ...(options.from || options.to
        ? {
            starts_at: {
              ...(options.from ? { gte: instantToArchiveDigits(options.from) } : {}),
              ...(options.to ? { lte: instantToArchiveDigits(options.to) } : {}),
            },
          }
        : {}),
    },
    select: EVENT_SELECT,
    orderBy: { starts_at: "asc" },
    take: Math.min(2000, options.limit ?? 1000),
  });
  return (rows as Array<EventRow & { payload?: unknown }>).map(toSiteRow);
};

export const loadEventById = async (context: ClubContext, eventId: string): Promise<EventRow | null> => {
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return null;
  const row = await (prisma as any).clubEvent.findFirst({
    where: { id: eventId, organization_id: context.organizationId, status: { not: "archived" } },
    select: EVENT_SELECT,
  });
  return row ? toSiteRow(row) : null;
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
