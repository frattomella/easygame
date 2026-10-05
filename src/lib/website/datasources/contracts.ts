import { z } from "zod";
import type {
  PublicArticle,
  PublicArticleSummary,
  PublicClubInfo,
  PublicClubNumber,
  PublicEvent,
  PublicMatch,
  PublicPerson,
  PublicRegistrationForm,
  PublicSponsor,
  PublicStandings,
  PublicTeam,
  PublicTeamStats,
} from "../public-dto";

/**
 * **Il contratto delle sorgenti dati del sito** (ADR-0200 §6).
 *
 * Un blocco non interroga niente: dichiara **quale** sorgente gli serve e con
 * **quale** configurazione. La configurazione si valida qui, con lo stesso
 * schema in editor e sul server; il caricamento vive in
 * `src/lib/server/website/datasources/`, che conosce il club dal dominio
 * risolto e restituisce solo DTO pubblici.
 *
 * Il valore `"context"` dice «quello della pagina»: in una pagina di dettaglio
 * squadra (`/squadre/serie-c`) un blocco «rosa» con squadra `context` mostra
 * la squadra dell'indirizzo, senza che il club debba crearne una per squadra.
 *
 * Modulo puro.
 */

export const DATASOURCE_KEYS = [
  "CLUB_INFO",
  "NEXT_MATCH",
  "UPCOMING_MATCHES",
  "RECENT_RESULTS",
  "MATCH_LIST",
  "MATCH_DETAIL",
  "TEAMS",
  "TEAM",
  "TEAM_ROSTER",
  "TEAM_STAFF",
  "TEAM_STATS",
  "PLAYER",
  "PLAYER_STATS",
  "STAFF",
  "SPONSORS",
  "LATEST_NEWS",
  "ARTICLE",
  "EVENTS",
  "EVENT_DETAIL",
  "STANDINGS",
  "CLUB_NUMBERS",
  "REGISTRATION_FORMS",
] as const;

export type DatasourceKey = (typeof DATASOURCE_KEYS)[number];

const id = z.string().trim().min(1).max(64);
/** Un riferimento che puo dire «quello della pagina». */
const refOrContext = z.union([z.literal("context"), id]);
const optionalRef = z.union([refOrContext, z.null()]).optional().default(null);
const seasonRef = z.union([z.literal("active"), id]).optional().default("active");
const limit = (max: number, fallback: number) => z.coerce.number().int().min(1).max(max).optional().default(fallback);
const venue = z.enum(["all", "home", "away"]).optional().default("all");

export const DATASOURCE_CONFIG_SCHEMAS = {
  CLUB_INFO: z.object({}).strict().optional().default({}),
  NEXT_MATCH: z.object({ teamId: optionalRef, competitionId: optionalRef, venue }),
  UPCOMING_MATCHES: z.object({ teamId: optionalRef, competitionId: optionalRef, venue, limit: limit(30, 5) }),
  RECENT_RESULTS: z.object({ teamId: optionalRef, competitionId: optionalRef, venue, limit: limit(30, 5) }),
  MATCH_LIST: z.object({
    teamId: optionalRef,
    competitionId: optionalRef,
    seasonId: seasonRef,
    venue,
    when: z.enum(["upcoming", "past", "all"]).optional().default("all"),
    limit: limit(100, 20),
  }),
  MATCH_DETAIL: z.object({ matchId: refOrContext.optional().default("context") }),
  TEAMS: z.object({ seasonId: seasonRef, limit: limit(60, 30) }),
  TEAM: z.object({ teamId: refOrContext.optional().default("context") }),
  TEAM_ROSTER: z.object({
    teamId: refOrContext.optional().default("context"),
    seasonId: seasonRef,
    sort: z.enum(["number", "name", "role"]).optional().default("number"),
    limit: limit(80, 40),
  }),
  TEAM_STAFF: z.object({ teamId: refOrContext.optional().default("context"), seasonId: seasonRef }),
  TEAM_STATS: z.object({ teamId: refOrContext.optional().default("context"), seasonId: seasonRef }),
  PLAYER: z.object({ personId: refOrContext.optional().default("context") }),
  PLAYER_STATS: z.object({ personId: refOrContext.optional().default("context"), seasonId: seasonRef }),
  STAFF: z.object({
    teamId: optionalRef,
    kind: z.enum(["all", "trainer", "staff"]).optional().default("all"),
    limit: limit(80, 40),
  }),
  SPONSORS: z.object({
    tier: z.string().trim().max(40).optional().default(""),
    featuredOnly: z.boolean().optional().default(false),
    limit: limit(80, 40),
  }),
  LATEST_NEWS: z.object({
    category: z.string().trim().max(60).optional().default(""),
    featuredOnly: z.boolean().optional().default(false),
    limit: limit(48, 6),
    offset: z.coerce.number().int().min(0).max(10_000).optional().default(0),
    excludeContext: z.boolean().optional().default(true),
  }),
  ARTICLE: z.object({ articleId: refOrContext.optional().default("context") }),
  EVENTS: z.object({
    teamId: optionalRef,
    kinds: z.array(z.enum(["match", "training"])).max(2).optional().default(["match"]),
    limit: limit(50, 6),
  }),
  EVENT_DETAIL: z.object({ eventId: refOrContext.optional().default("context") }),
  STANDINGS: z.object({ competitionId: refOrContext.optional().default("context") }),
  CLUB_NUMBERS: z.object({ metrics: z.array(z.enum(["athletes", "teams", "matches", "seasons", "trainers"])).max(5).optional().default(["athletes", "teams", "matches"]) }),
  REGISTRATION_FORMS: z.object({ slugs: z.array(z.string().trim().max(120)).max(12).optional().default([]) }),
} satisfies Record<DatasourceKey, z.ZodTypeAny>;

export type DatasourceConfig<K extends DatasourceKey> = z.output<(typeof DATASOURCE_CONFIG_SCHEMAS)[K]>;

export type DatasourceData = {
  CLUB_INFO: PublicClubInfo;
  NEXT_MATCH: PublicMatch | null;
  UPCOMING_MATCHES: PublicMatch[];
  RECENT_RESULTS: PublicMatch[];
  MATCH_LIST: PublicMatch[];
  MATCH_DETAIL: { match: PublicMatch; convocated: PublicPerson[]; stats: Array<{ person: PublicPerson; values: Record<string, number> }> } | null;
  TEAMS: PublicTeam[];
  TEAM: PublicTeam | null;
  TEAM_ROSTER: PublicPerson[];
  TEAM_STAFF: PublicPerson[];
  TEAM_STATS: PublicTeamStats | null;
  PLAYER: PublicPerson | null;
  PLAYER_STATS: { person: PublicPerson; seasonLabel: string; matches: number } | null;
  STAFF: PublicPerson[];
  SPONSORS: PublicSponsor[];
  LATEST_NEWS: { items: PublicArticleSummary[]; total: number };
  ARTICLE: PublicArticle | null;
  EVENTS: PublicEvent[];
  EVENT_DETAIL: PublicEvent | null;
  STANDINGS: PublicStandings | null;
  CLUB_NUMBERS: PublicClubNumber[];
  REGISTRATION_FORMS: PublicRegistrationForm[];
};

export type DatasourceRequest<K extends DatasourceKey = DatasourceKey> = {
  key: K;
  config: DatasourceConfig<K>;
};

/** Il contesto di una pagina di dettaglio, ricavato dall'indirizzo. */
export type PageContext = {
  teamId?: string | null;
  matchId?: string | null;
  articleId?: string | null;
  personId?: string | null;
  eventId?: string | null;
  competitionId?: string | null;
  /** L'archivio delle news: categoria e pagina dall'indirizzo (`?categoria=`, `?pagina=`). */
  articleCategory?: string | null;
  articlePage?: number | null;
};

/** Valida una configurazione; una non valida torna ai predefiniti, mai a un errore. */
export const parseDatasourceConfig = <K extends DatasourceKey>(key: K, raw: unknown): DatasourceConfig<K> => {
  const schema = DATASOURCE_CONFIG_SCHEMAS[key] as z.ZodTypeAny;
  const parsed = schema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data as DatasourceConfig<K>;
  return schema.parse({}) as DatasourceConfig<K>;
};

/** Una chiave stabile per deduplicare due richieste identiche. */
export const datasourceRequestKey = (request: DatasourceRequest) =>
  `${request.key}:${stableStringify(request.config)}`;

export const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
};

/** Sostituisce `"context"` con l'identificativo della pagina, se c'e. */
export const bindContext = <K extends DatasourceKey>(
  request: DatasourceRequest<K>,
  context: PageContext,
): DatasourceRequest<K> => {
  const config = { ...(request.config as Record<string, unknown>) };
  const map: Record<string, keyof PageContext> = {
    teamId: "teamId",
    matchId: "matchId",
    articleId: "articleId",
    personId: "personId",
    eventId: "eventId",
    competitionId: "competitionId",
  };
  for (const [field, contextKey] of Object.entries(map)) {
    if (config[field] === "context") config[field] = context[contextKey] ?? null;
  }
  return { key: request.key, config: config as DatasourceConfig<K> };
};
