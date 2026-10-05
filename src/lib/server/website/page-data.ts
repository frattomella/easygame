import { prisma } from "../prisma";
import { buildTrainerAssignmentIndex } from "@/lib/trainers/season-assignments";
import { linkForSeason, membershipMatchesLink } from "@/lib/sports/teams";
import {
  datasourceRequestKey,
  type DatasourceKey,
  type DatasourceRequest,
  type PageContext,
} from "@/lib/website/datasources/contracts";
import { collectPageRequests } from "@/lib/website/datasources/requests";
import type {
  DatasourceResult,
  PublicClubInfo,
  PublicClubNumber,
  PublicImage,
  PublicPerson,
  PublicRegistrationForm,
  PublicStandingsRow,
  PublicTeam,
} from "@/lib/website/public-dto";
import type { SiteSnapshot } from "@/lib/website/publishing/snapshot";
import type { WebsitePageDocument } from "@/lib/website/document/types";
import { loadClubContext, resolveSeasonRef, seasonLabel, type ClubContext, type TeamRow } from "./public-data/club-context";
import { collectMediaRefs, loadMediaMeta, toPublicImage, toRouteImage, type MediaMeta } from "./public-data/images";
import { loadPeopleIndex, loadSeasonStats, statValues, teamsForMemberships, type PeopleIndex } from "./public-data/people";
import {
  filterEventRows,
  loadEventById,
  loadEventRows,
  teamStatsFrom,
  toPublicEvent,
  toPublicMatch,
  type EventRow,
  type MatchBuildOptions,
} from "./public-data/matches";
import {
  loadArticleSummaries,
  loadPublicArticle,
  loadPublicSponsors,
  loadRecapLinks,
} from "./public-data/sponsors-articles";

/**
 * **Il risolutore dei dati di una pagina** (ADR-0200 §6).
 *
 * 1. raccoglie le richieste dei blocchi (`collectPageRequests`), gia
 *    deduplicate: tre blocchi che chiedono la stessa squadra sono una
 *    richiesta;
 * 2. carica i dati **per caricatore**, una volta sola e solo se una richiesta
 *    li usa: il contesto del club, le gare, le persone pubblicate, gli
 *    sponsor in vetrina;
 * 3. risolve ogni richiesta in memoria e restituisce un DTO pubblico.
 *
 * Nessun blocco interroga il database. Il club arriva dal chiamante — il
 * dominio risolto, o l'anteprima autorizzata — mai dalla richiesta HTTP.
 */

export type SiteRenderContext = {
  organizationId: string;
  siteId: string;
  snapshot: SiteSnapshot;
  now: Date;
  /** Le basi degli indirizzi di dettaglio, dalle pagine del sito. */
  bases: Partial<Record<"article" | "team" | "match" | "player" | "event", string>>;
};

export type PageData = {
  club: PublicClubInfo;
  results: Record<string, DatasourceResult<unknown>>;
  /** I metadati dei file citati dai blocchi (alt, dimensioni, punto focale). */
  media: Record<string, MediaMeta>;
  sport: { key: string; periodLabel: string; stats: Array<{ key: string; label: string; short: string }> };
  /** Gli sponsor del piede, se il piede li mostra. */
  footerSponsors: DatasourceResult<unknown> | null;
};

const ok = <T>(data: T, emptyWhen = false): DatasourceResult<T> => (emptyWhen ? { status: "empty", data } : { status: "ok", data });
const unavailable = (reason: string): DatasourceResult<never> => ({ status: "unavailable", reason });

const memo = <T>(fn: () => Promise<T>) => {
  let promise: Promise<T> | null = null;
  return () => (promise ??= fn());
};

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};

/** Le informazioni pubbliche del club: identita del sito sopra l'anagrafica. */
export const buildClubInfo = (context: ClubContext, snapshot: SiteSnapshot, meta: Map<string, MediaMeta>): PublicClubInfo => {
  const identity = snapshot.settings.identity;
  const settings = asRecord(context.club.settings);
  const name = identity.displayName || context.club.name;
  const social: Record<string, string> = {};
  for (const network of ["facebook", "instagram", "youtube", "tiktok", "x", "linkedin", "whatsapp", "telegram"]) {
    const fromSettings = network === "x" ? settings.twitter || settings.x : settings[network];
    const value = (identity.social as Record<string, string>)[network] || (typeof fromSettings === "string" ? fromSettings : "");
    if (value && /^https?:\/\//i.test(value)) social[network] = value;
  }
  const logo: PublicImage | null = identity.logo
    ? toPublicImage(identity.logo.mediaId, meta, `Logo ${name}`, identity.logo)
    : context.club.logo_url
      ? toRouteImage(`/api/public/website/club-logo/${context.organizationId}`, `Logo ${name}`)
      : null;
  const founded = Number(settings.foundingYear ?? settings.foundedYear);
  return {
    name,
    legalName: String(context.club.business_name || context.club.name || ""),
    shortName: name.length > 24 ? name.split(" ").slice(0, 2).join(" ") : name,
    tagline: identity.tagline,
    description: identity.description,
    logo,
    logoOnDark: identity.logoOnDark ? toPublicImage(identity.logoOnDark.mediaId, meta, `Logo ${name}`, identity.logoOnDark) : null,
    email: identity.email || String(context.club.contact_email || ""),
    phone: identity.phone || String(context.club.contact_phone || ""),
    address: identity.address || String(context.club.address || ""),
    city: String(context.club.city || ""),
    postalCode: String(context.club.postal_code || ""),
    province: String(context.club.province || ""),
    vatNumber: String(context.club.vat_number || ""),
    fiscalCode: String(context.club.fiscal_code || ""),
    foundedYear: Number.isInteger(founded) && founded > 1800 && founded < 2200 ? founded : null,
    sports: Array.isArray(settings.sports) ? settings.sports.map((sport: unknown) => String(sport)).slice(0, 6) : [],
    social,
    websiteOrigin: null,
  };
};

const teamDto = (context: ClubContext, team: TeamRow, seasonId: string | null, meta: Map<string, MediaMeta>, bases: SiteRenderContext["bases"], rosterCount: number): PublicTeam => {
  const link = linkForSeason(team.season_links, seasonId);
  const category = link ? context.categoryById.get(link.categoryId) : null;
  return {
    id: team.id,
    slug: team.slug,
    href: bases.team ? `${bases.team}/${team.slug}` : null,
    name: team.name,
    shortName: team.short_name || team.name,
    description: String(team.description || "").slice(0, 2000),
    sport: team.sport || context.sport.key,
    categoryLabel: String(category?.name || "").slice(0, 80),
    seasonLabel: seasonLabel(context, seasonId),
    photo: toPublicImage(team.photo_attachment_id, meta, team.name),
    rosterCount,
  };
};

/** Le persone pubblicate di una squadra in una stagione. */
const rosterOf = (context: ClubContext, people: PeopleIndex, team: TeamRow, seasonId: string | null) => {
  const link = linkForSeason(team.season_links, seasonId);
  if (!link) return [];
  const groupSiteId = link.groupId ? context.groupById.get(link.groupId)?.siteId || null : null;
  return Array.from(people.athletes.values()).filter((entry) =>
    entry.memberships.some((membership) => membershipMatchesLink(membership, link, groupSiteId)),
  );
};

const sortRoster = (entries: PublicPerson[], sort: "number" | "name" | "role") =>
  entries.slice().sort((a, b) => {
    if (sort === "number") {
      const na = Number.parseInt(a.jerseyNumber, 10);
      const nb = Number.parseInt(b.jerseyNumber, 10);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
      if (Number.isFinite(na) !== Number.isFinite(nb)) return Number.isFinite(na) ? -1 : 1;
    }
    if (sort === "role" && a.role !== b.role) return a.role.localeCompare(b.role, "it");
    return a.displayName.localeCompare(b.displayName, "it");
  });

/** Gli allenatori pubblicati assegnati, nella stagione, alla squadra. */
const trainersOf = (context: ClubContext, people: PeopleIndex, team: TeamRow, seasonId: string | null) => {
  const link = linkForSeason(team.season_links, seasonId);
  if (!link) return [];
  const index = buildTrainerAssignmentIndex({
    trainers: context.trainers as any,
    categories: context.categoriesBySeason(null).map((category) => ({ id: String(category.id), name: String(category.name || ""), seasonId: category.seasonId ?? category.season_id ?? null })) as any,
    groups: context.groups.map((group) => ({ id: group.id, categoryId: group.categoryId, name: group.name })) as any,
    seasons: context.seasons.seasons,
    seasonId,
    legacySeasonId: context.seasons.legacySeasonId,
  });
  return index
    .assignedTo({ categoryId: link.categoryId, groupId: link.groupId })
    .map((id) => people.trainers.get(id))
    .filter((person): person is PublicPerson => Boolean(person));
};

export const resolvePageData = async (
  render: SiteRenderContext,
  documents: readonly WebsitePageDocument[],
  pageContext: PageContext,
): Promise<PageData> => {
  const { organizationId, siteId, snapshot, now, bases } = render;
  const requests = collectPageRequests(documents, pageContext);

  const club = memo(async () => {
    const context = await loadClubContext(organizationId);
    if (!context) throw new Error("Club non trovato");
    return context;
  });
  const matches = memo(async () => loadEventRows(await club(), { kinds: ["match"], limit: 1000 }));
  const trainings = memo(async () =>
    loadEventRows(await club(), { kinds: ["training"], from: new Date(now.getTime() - 3 * 3600 * 1000), to: new Date(now.getTime() + 60 * 86400 * 1000), limit: 300 }),
  );
  const people = memo(async () => {
    const context = await club();
    return loadPeopleIndex(context, { now, seasonId: context.seasons.activeSeasonId, bases });
  });
  const sponsors = memo(() => loadPublicSponsors(organizationId, snapshot.settings, now));
  const recaps = memo(() => loadRecapLinks(organizationId, siteId, bases, now));

  /* I file citati dai blocchi e dall'identita, letti insieme. */
  const refs = collectMediaRefs([...documents, snapshot.settings.identity, snapshot.seo]);
  const context = await club();
  for (const team of context.teams) if (team.photo_attachment_id) refs.add(team.photo_attachment_id);
  for (const opponent of context.opponents.values()) if (opponent.logo_attachment_id) refs.add(opponent.logo_attachment_id);
  const meta = await loadMediaMeta(organizationId, refs);
  const clubInfo = buildClubInfo(context, snapshot, meta);

  const matchOptions = async (): Promise<MatchBuildOptions> => ({
    now,
    bases,
    meta,
    clubSide: { name: clubInfo.name, shortName: clubInfo.shortName, logo: clubInfo.logo },
    recapByEvent: await recaps(),
  });

  const handlers: { [K in DatasourceKey]: (config: any) => Promise<DatasourceResult<unknown>> } = {
    CLUB_INFO: async () => ok(clubInfo),

    NEXT_MATCH: async (config) => {
      const rows = filterEventRows(context, await matches(), config).filter(
        (row) => row.starts_at.getTime() >= now.getTime() - 2 * 3600 * 1000 && row.status !== "cancelled" && row.result_status !== "final",
      );
      const options = await matchOptions();
      return rows.length ? ok(toPublicMatch(context, rows[0], options)) : ok(null, true);
    },

    UPCOMING_MATCHES: async (config) => {
      const rows = filterEventRows(context, await matches(), config)
        .filter((row) => row.starts_at.getTime() >= now.getTime() - 2 * 3600 * 1000 && row.result_status !== "final")
        .slice(0, config.limit);
      const options = await matchOptions();
      const data = rows.map((row) => toPublicMatch(context, row, options));
      return ok(data, !data.length);
    },

    RECENT_RESULTS: async (config) => {
      const rows = filterEventRows(context, await matches(), config)
        .filter((row) => row.home_score !== null && row.away_score !== null && row.starts_at.getTime() <= now.getTime() + 3600 * 1000)
        .sort((a, b) => b.starts_at.getTime() - a.starts_at.getTime())
        .slice(0, config.limit);
      const options = await matchOptions();
      const data = rows.map((row) => toPublicMatch(context, row, options));
      return ok(data, !data.length);
    },

    MATCH_LIST: async (config) => {
      const seasonId = resolveSeasonRef(context, config.seasonId);
      let rows = filterEventRows(context, await matches(), { ...config, seasonId });
      const cut = now.getTime() - 2 * 3600 * 1000;
      if (config.when === "upcoming") rows = rows.filter((row) => row.starts_at.getTime() >= cut);
      if (config.when === "past") rows = rows.filter((row) => row.starts_at.getTime() < cut).reverse();
      const options = await matchOptions();
      const data = rows.slice(0, config.limit).map((row) => toPublicMatch(context, row, options));
      return ok(data, !data.length);
    },

    MATCH_DETAIL: async (config) => {
      if (!config.matchId) return ok(null, true);
      const row = (await matches()).find((item) => item.id === config.matchId) || (await loadEventById(context, config.matchId));
      if (!row || row.kind !== "match") return ok(null, true);
      const [index, participants, stats] = await Promise.all([
        people(),
        (prisma as any).clubEventParticipant.findMany({
          where: { organization_id: organizationId, event_id: row.id, convocation_status: "convocated" },
          select: { athlete_id: true },
        }),
        (prisma as any).clubEventPlayerStat.findMany({
          where: { organization_id: organizationId, event_id: row.id },
          select: { athlete_id: true, stats: true },
        }),
      ]);
      const convocated = (participants as any[])
        .map((participant) => index.athletes.get(String(participant.athlete_id))?.person)
        .filter((person): person is PublicPerson => Boolean(person));
      const statRows = (stats as any[])
        .map((stat) => {
          const entry = index.athletes.get(String(stat.athlete_id));
          if (!entry || !entry.showStats) return null;
          const values: Record<string, number> = {};
          for (const definition of context.sport.stats) {
            const value = Number(asRecord(stat.stats)[definition.key]);
            if (Number.isFinite(value)) values[definition.key] = value;
          }
          return Object.keys(values).length ? { person: entry.person, values } : null;
        })
        .filter((value): value is { person: PublicPerson; values: Record<string, number> } => Boolean(value));
      return ok({ match: toPublicMatch(context, row, await matchOptions()), convocated: sortRoster(convocated, "number"), stats: statRows });
    },

    TEAMS: async (config) => {
      const seasonId = resolveSeasonRef(context, config.seasonId);
      const index = await people();
      const data = context.teams
        .filter((team) => team.active && linkForSeason(team.season_links, seasonId))
        .slice(0, config.limit)
        .map((team) => teamDto(context, team, seasonId, meta, bases, rosterOf(context, index, team, seasonId).length));
      return ok(data, !data.length);
    },

    TEAM: async (config) => {
      const team = config.teamId ? context.teamById.get(config.teamId) : null;
      if (!team || !team.active) return ok(null, true);
      const seasonId = context.seasons.activeSeasonId;
      return ok(teamDto(context, team, seasonId, meta, bases, rosterOf(context, await people(), team, seasonId).length));
    },

    TEAM_ROSTER: async (config) => {
      const team = config.teamId ? context.teamById.get(config.teamId) : null;
      if (!team) return ok([], true);
      const seasonId = resolveSeasonRef(context, config.seasonId);
      const index = await people();
      const entries = rosterOf(context, index, team, seasonId);
      const stats = await loadSeasonStats(context, entries.filter((entry) => entry.showStats).map((entry) => entry.person.id), seasonId);
      const persons = entries.map((entry) => ({
        ...entry.person,
        stats: entry.showStats ? statValues(context, stats.get(entry.person.id)?.values || {}, []) : [],
      }));
      const data = sortRoster(persons, config.sort).slice(0, config.limit);
      return ok(data, !data.length);
    },

    TEAM_STAFF: async (config) => {
      const team = config.teamId ? context.teamById.get(config.teamId) : null;
      if (!team) return ok([], true);
      const data = trainersOf(context, await people(), team, resolveSeasonRef(context, config.seasonId));
      return ok(data, !data.length);
    },

    TEAM_STATS: async (config) => {
      const team = config.teamId ? context.teamById.get(config.teamId) : null;
      if (!team) return ok(null, true);
      const seasonId = resolveSeasonRef(context, config.seasonId);
      const rows = filterEventRows(context, await matches(), { teamId: team.id, seasonId });
      const stats = teamStatsFrom(context, rows);
      if (!stats.played) return ok(null, true);
      return ok({ team: { id: team.id, name: team.name }, ...stats, basedOn: "final_results" as const });
    },

    PLAYER: async (config) => {
      const entry = config.personId ? (await people()).athletes.get(config.personId) : null;
      if (!entry) return ok(null, true);
      const seasonId = context.seasons.activeSeasonId;
      const stats = entry.showStats ? await loadSeasonStats(context, [entry.person.id], seasonId) : new Map();
      return ok({ ...entry.person, stats: entry.showStats ? statValues(context, stats.get(entry.person.id)?.values || {}, []) : [] });
    },

    PLAYER_STATS: async (config) => {
      const entry = config.personId ? (await people()).athletes.get(config.personId) : null;
      if (!entry || !entry.showStats) return ok(null, true);
      const seasonId = resolveSeasonRef(context, config.seasonId);
      const stats = (await loadSeasonStats(context, [entry.person.id], seasonId)).get(entry.person.id);
      if (!stats) return ok(null, true);
      return ok({ person: { ...entry.person, stats: statValues(context, stats.values, []) }, seasonLabel: seasonLabel(context, seasonId), matches: stats.matches });
    },

    STAFF: async (config) => {
      const index = await people();
      let trainers = Array.from(index.trainers.values());
      if (config.teamId) {
        const team = context.teamById.get(config.teamId);
        trainers = team ? trainersOf(context, index, team, context.seasons.activeSeasonId) : [];
      }
      const staff = config.teamId ? [] : Array.from(index.staff.values());
      const data = (config.kind === "trainer" ? trainers : config.kind === "staff" ? staff : [...staff, ...trainers]).slice(0, config.limit);
      return ok(data, !data.length);
    },

    SPONSORS: async (config) => {
      let list = await sponsors();
      if (config.tier) list = list.filter((sponsor) => sponsor.tier.key === config.tier);
      if (config.featuredOnly) list = list.filter((sponsor) => sponsor.featured);
      const data = list.slice(0, config.limit);
      return ok(data, !data.length);
    },

    LATEST_NEWS: async (config) => {
      const data = await loadArticleSummaries(organizationId, siteId, snapshot.settings, bases, now, {
        category: config.category || undefined,
        featuredOnly: config.featuredOnly,
        limit: config.limit,
        offset: config.offset,
        excludeId: config.excludeContext ? pageContext.articleId || null : null,
      });
      return ok(data, !data.items.length);
    },

    ARTICLE: async (config) => {
      const article = await loadPublicArticle(organizationId, siteId, snapshot.settings, bases, now, { id: config.articleId });
      return article ? ok(article) : ok(null, true);
    },

    EVENTS: async (config) => {
      const kinds: Array<"match" | "training"> = config.kinds;
      const rows: EventRow[] = [
        ...(kinds.includes("match") ? await matches() : []),
        ...(kinds.includes("training") ? await trainings() : []),
      ]
        .filter((row) => row.starts_at.getTime() >= now.getTime() - 2 * 3600 * 1000 && row.status !== "cancelled")
        .sort((a, b) => a.starts_at.getTime() - b.starts_at.getTime());
      const filtered = filterEventRows(context, rows, { teamId: config.teamId }).slice(0, config.limit);
      const options = await matchOptions();
      const data = filtered.map((row) => toPublicEvent(context, row, options));
      return ok(data, !data.length);
    },

    EVENT_DETAIL: async (config) => {
      if (!config.eventId) return ok(null, true);
      const row = await loadEventById(context, config.eventId);
      if (!row || (row.kind !== "match" && row.kind !== "training")) return ok(null, true);
      return ok(toPublicEvent(context, row, await matchOptions()));
    },

    STANDINGS: async (config) => {
      const competition = config.competitionId ? context.competitions.get(config.competitionId) : null;
      if (!competition) return unavailable("Nessuna competizione indicata");
      const rows = Array.isArray(competition.standings) ? (competition.standings as any[]) : [];
      if (!rows.length) return unavailable("La classifica di questa competizione non e stata inserita");
      const num = (value: unknown) => (value === null || value === undefined || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null);
      const data: PublicStandingsRow[] = rows.slice(0, 40).map((row, index) => ({
        position: num(row.position) ?? index + 1,
        team: String(row.team || "").slice(0, 80),
        isClub: Boolean(row.isClub),
        played: num(row.played),
        won: num(row.won),
        drawn: num(row.drawn),
        lost: num(row.lost),
        pointsFor: num(row.pointsFor),
        pointsAgainst: num(row.pointsAgainst),
        points: num(row.points),
      }));
      return ok({
        competition: { id: competition.id, name: competition.name },
        rows: data,
        updatedAt: competition.standings_updated_at ? new Date(competition.standings_updated_at).toISOString() : null,
        source: "manual" as const,
      });
    },

    CLUB_NUMBERS: async (config) => {
      const metrics: string[] = config.metrics;
      const out: PublicClubNumber[] = [];
      const activeSeasonId = context.seasons.activeSeasonId;
      if (metrics.includes("athletes")) {
        const value = await (prisma as any).athlete.count({ where: { organization_id: organizationId, status: "active", anonymized_at: null } });
        if (value) out.push({ key: "athletes", label: "Atleti", value, suffix: "", source: "auto" });
      }
      if (metrics.includes("teams")) {
        const teams = context.teams.filter((team) => team.active && linkForSeason(team.season_links, activeSeasonId)).length;
        const value = teams || context.categoriesBySeason(activeSeasonId).length;
        if (value) out.push({ key: "teams", label: "Squadre", value, suffix: "", source: "auto" });
      }
      if (metrics.includes("matches")) {
        const value = (await matches()).filter((row) => row.status === "completed" || row.home_score !== null).length;
        if (value) out.push({ key: "matches", label: "Gare giocate", value, suffix: "", source: "auto" });
      }
      if (metrics.includes("seasons") && !context.seasons.isFallback) {
        out.push({ key: "seasons", label: "Stagioni", value: context.seasons.seasons.length, suffix: "", source: "auto" });
      }
      if (metrics.includes("trainers")) {
        const value = context.trainers.filter((trainer) => !["inactive", "archived", "suspended"].includes(String(trainer.status || "").toLowerCase())).length;
        if (value) out.push({ key: "trainers", label: "Allenatori", value, suffix: "", source: "auto" });
      }
      return ok(out, !out.length);
    },

    REGISTRATION_FORMS: async (config) => {
      const slugs: string[] = config.slugs;
      if (!slugs.length) return ok([], true);
      const rows = await (prisma as any).formTemplate.findMany({
        where: { organization_id: organizationId, public_slug: { in: slugs }, status: "published", public_enabled: true },
        select: { public_slug: true, title: true, description: true },
      });
      const origin = (process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_BASE_URL || "").replace(/\/+$/, "");
      const bySlug = new Map((rows as any[]).map((row) => [row.public_slug, row]));
      const data: PublicRegistrationForm[] = slugs
        .map((slug) => bySlug.get(slug))
        .filter(Boolean)
        .map((row: any) => ({
          slug: row.public_slug,
          title: String(row.title || "").slice(0, 160),
          description: String(row.description || "").slice(0, 400),
          href: `${origin}/forms/${encodeURIComponent(row.public_slug)}`,
        }));
      return ok(data, !data.length);
    },
  };

  const results: Record<string, DatasourceResult<unknown>> = {};
  await Promise.all(
    Array.from(requests.entries()).map(async ([key, request]) => {
      try {
        results[key] = await handlers[request.key](request.config);
      } catch (error) {
        results[key] = { status: "error", reason: error instanceof Error ? error.message.slice(0, 200) : "Errore" };
      }
    }),
  );

  let footerSponsors: DatasourceResult<unknown> | null = null;
  if (snapshot.footer.showSponsors) {
    const request: DatasourceRequest = { key: "SPONSORS", config: { tier: snapshot.footer.sponsorTier || "", featuredOnly: false, limit: 40 } } as DatasourceRequest;
    footerSponsors = results[datasourceRequestKey(request)] ?? (await handlers.SPONSORS(request.config));
  }

  return {
    club: clubInfo,
    results,
    media: Object.fromEntries(meta),
    sport: {
      key: context.sport.key,
      periodLabel: context.sport.periodLabel,
      stats: context.sport.stats.map((stat) => ({ key: stat.key, label: stat.label, short: stat.short })),
    },
    footerSponsors,
  };
};

/** Le persone di una squadra in una stagione, per il contesto di un indirizzo di dettaglio. */
export { teamsForMemberships };
