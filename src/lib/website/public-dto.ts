/**
 * **I DTO pubblici del sito** (ADR-0200 §6, §7).
 *
 * L'unica forma in cui un dato del gestionale arriva a un componente del
 * sito. Nessun tipo qui contiene un identificativo di club, un'email o un
 * telefono personale, un codice fiscale, una data di nascita completa o un
 * campo «libero» copiato da un JSON interno: ogni campo e scelto, e ogni
 * persona passa prima dalla policy di pubblicazione
 * (`src/lib/website/people/policy.ts`).
 *
 * Le date viaggiano come stringhe ISO: i DTO attraversano la cache del
 * framework, che serializza in JSON.
 *
 * Modulo puro.
 */

export type PublicImage = {
  /** Identificativo del file nella libreria pubblica del sito. */
  mediaId: string;
  /** Percorso pubblico, gia costruito (`/api/public/website/media/<id>`). */
  src: string;
  alt: string;
  width: number | null;
  height: number | null;
  focalX: number;
  focalY: number;
};

export type PublicClubInfo = {
  name: string;
  legalName: string;
  shortName: string;
  tagline: string;
  description: string;
  logo: PublicImage | null;
  logoOnDark: PublicImage | null;
  email: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
  province: string;
  /** La partita IVA della societa: un dato pubblico per legge, non personale. */
  vatNumber: string;
  fiscalCode: string;
  foundedYear: number | null;
  sports: string[];
  social: Partial<Record<string, string>>;
  websiteOrigin: string | null;
};

export type PublicSide = {
  name: string;
  shortName: string;
  logo: PublicImage | null;
  isClub: boolean;
};

export type PublicPeriodScore = {
  number: number;
  label: string;
  home: number | null;
  away: number | null;
};

export type PublicMatchStatus = "scheduled" | "completed" | "cancelled" | "postponed";

export type PublicMatch = {
  id: string;
  slug: string;
  href: string | null;
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  status: PublicMatchStatus;
  homeAway: "home" | "away" | "neutral";
  home: PublicSide;
  away: PublicSide;
  venue: { name: string; address: string } | null;
  competition: { id: string; name: string; shortName: string } | null;
  round: string;
  team: { id: string; name: string; href: string | null } | null;
  categoryLabel: string;
  result: {
    home: number;
    away: number;
    final: boolean;
    /** Dal punto di vista del club. */
    outcome: "win" | "loss" | "draw" | null;
  } | null;
  periods: PublicPeriodScore[];
  /** Un collegamento al resoconto, se un articolo cita la gara. */
  recapHref: string | null;
};

export type PublicStatValue = {
  key: string;
  label: string;
  value: number;
  /** «media», «totale»: come leggerlo. */
  kind: "total" | "average";
};

export type PublicPerson = {
  id: string;
  slug: string;
  href: string | null;
  kind: "athlete" | "trainer" | "staff";
  displayName: string;
  photo: PublicImage | null;
  jerseyNumber: string;
  role: string;
  birthYear: number | null;
  heightCm: number | null;
  bio: string;
  teams: Array<{ id: string; name: string; href: string | null }>;
  stats: PublicStatValue[];
};

export type PublicTeam = {
  id: string;
  slug: string;
  href: string | null;
  name: string;
  shortName: string;
  description: string;
  sport: string;
  categoryLabel: string;
  seasonLabel: string;
  photo: PublicImage | null;
  /** Conteggi pubblici: quante persone in rosa sono pubblicate. */
  rosterCount: number;
};

export type PublicTeamStats = {
  team: { id: string; name: string };
  played: number;
  won: number;
  drawn: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  /** Solo gare con risultato definitivo. */
  basedOn: "final_results";
};

export type PublicSponsorTier = { key: string; label: string; order: number };

export type PublicSponsor = {
  id: string;
  name: string;
  logo: PublicImage | null;
  url: string | null;
  description: string;
  tier: PublicSponsorTier;
  order: number;
  featured: boolean;
};

export type PublicArticleSummary = {
  id: string;
  slug: string;
  href: string | null;
  title: string;
  excerpt: string;
  cover: PublicImage | null;
  publishedAt: string;
  category: { slug: string; label: string } | null;
  author: string;
  featured: boolean;
};

export type PublicArticle = PublicArticleSummary & {
  bodyHtml: string;
  gallery: PublicImage[];
  seo: { title: string; description: string; image: PublicImage | null; canonical: string | null; noindex: boolean };
  related: PublicArticleSummary[];
};

export type PublicEvent = {
  id: string;
  slug: string;
  href: string | null;
  kind: "match" | "training";
  title: string;
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  venue: { name: string; address: string } | null;
  team: { id: string; name: string; href: string | null } | null;
  categoryLabel: string;
  status: PublicMatchStatus;
  match: PublicMatch | null;
};

export type PublicStandingsRow = {
  position: number;
  team: string;
  isClub: boolean;
  played: number | null;
  won: number | null;
  drawn: number | null;
  lost: number | null;
  pointsFor: number | null;
  pointsAgainst: number | null;
  points: number | null;
};

export type PublicStandings = {
  competition: { id: string; name: string };
  rows: PublicStandingsRow[];
  updatedAt: string | null;
  /** Sempre `manual`: EasyGame non calcola classifiche che non conosce. */
  source: "manual";
};

export type PublicClubNumber = {
  key: string;
  label: string;
  value: number;
  suffix: string;
  /** `auto` = contato dal gestionale, `manual` = scritto dal club. */
  source: "auto" | "manual";
};

export type PublicRegistrationForm = {
  slug: string;
  title: string;
  description: string;
  href: string;
};

/**
 * L'esito di una sorgente dati. `unavailable` non e un errore: e il dominio
 * che dice «questo dato non esiste per questo club» (una classifica mai
 * inserita). Il blocco mostra il suo messaggio vuoto, mai dati inventati.
 */
export type DatasourceResult<T> =
  | { status: "ok"; data: T }
  | { status: "empty"; data: T }
  | { status: "unavailable"; reason: string }
  | { status: "error"; reason: string };
