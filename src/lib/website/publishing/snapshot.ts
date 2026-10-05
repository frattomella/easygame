import { stableStringify } from "../datasources/contracts";
import { normalizeMediaRef, type SiteFooter, type SiteHeader, type SiteSeo, type SiteSettings } from "../site-config";
import { sanitizeExternalUrl } from "../links";
import type { SiteNavigation } from "../navigation";
import type { SiteTheme } from "../theme/theme";
import type { MediaRef, WebsitePageDocument } from "../document/types";
import type { PageKind } from "../registry";

/**
 * **Lo snapshot pubblicato di un sito** (ADR-0200 §5).
 *
 * Pubblicare congela in un valore solo tutto cio che il club ha composto:
 * tema, intestazione, piede, menu, SEO globale, identita e pagine. Il valore
 * finisce in una riga di `website_revisions` che il database non lascia piu
 * modificare. Il pubblico legge **solo** questo — mai la bozza.
 *
 * Cio che non sta qui e voluto: gare, rose, sponsor, articoli e persone si
 * leggono vivi a ogni render, con le loro regole. Un risultato inserito non
 * aspetta una ripubblicazione, e una persona che ritira il consenso sparisce
 * dal sito senza che qualcuno debba ripubblicare.
 *
 * Modulo puro.
 */

export const SNAPSHOT_SCHEMA_VERSION = 1;

export type PageSeo = {
  title: string;
  description: string;
  socialImage: MediaRef | null;
  /** Un canonical esplicito (raro): vuoto = l'indirizzo della pagina sul dominio primario. */
  canonical: string | null;
  noindex: boolean;
};

export const EMPTY_PAGE_SEO: PageSeo = { title: "", description: "", socialImage: null, canonical: null, noindex: false };

export const normalizePageSeo = (raw: unknown): PageSeo => {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    title: String(record.title ?? "").trim().slice(0, 70),
    description: String(record.description ?? "").trim().slice(0, 320),
    socialImage: normalizeMediaRef(record.socialImage),
    canonical: sanitizeExternalUrl(record.canonical),
    noindex: Boolean(record.noindex),
  };
};

export type SnapshotPage = {
  id: string;
  kind: PageKind;
  slug: string;
  /** `/`, `/squadre`, oppure `/squadre/*` per un modello di dettaglio. */
  path: string;
  title: string;
  seo: PageSeo;
  document: WebsitePageDocument;
};

export type SiteSnapshot = {
  schemaVersion: number;
  siteId: string;
  templateKey: string;
  theme: SiteTheme;
  header: SiteHeader;
  footer: SiteFooter;
  navigation: SiteNavigation;
  seo: SiteSeo;
  settings: SiteSettings;
  pages: SnapshotPage[];
};

/**
 * Il contenuto da confrontare per dire «ci sono modifiche non pubblicate».
 * L'identificativo e il momento della pubblicazione non contano: due
 * pubblicazioni dello stesso contenuto sono lo stesso sito.
 */
export const snapshotFingerprintSource = (snapshot: SiteSnapshot) =>
  stableStringify({ ...snapshot, siteId: undefined });

/** Il percorso di una pagina dato tipo e slug. */
export const pagePathFor = (kind: PageKind, slug: string) => {
  const isDetail =
    kind === "article_detail" || kind === "team_detail" || kind === "match_detail" || kind === "player_detail" || kind === "event_detail";
  if (kind === "home") return "/";
  return isDetail ? `/${slug}/*` : `/${slug}`;
};

export type DetailKind = "article" | "team" | "match" | "player" | "event";

export const DETAIL_KIND_BY_PAGE_KIND: Partial<Record<PageKind, DetailKind>> = {
  article_detail: "article",
  team_detail: "team",
  match_detail: "match",
  player_detail: "player",
  event_detail: "event",
};

/** Le basi degli indirizzi di dettaglio di un sito: `{ team: "/squadre", … }`. */
export const detailBasesFromPages = (pages: ReadonlyArray<Pick<SnapshotPage, "kind" | "slug">>) => {
  const bases: Partial<Record<DetailKind, string>> = {};
  for (const page of pages) {
    const detail = DETAIL_KIND_BY_PAGE_KIND[page.kind];
    if (detail && !bases[detail]) bases[detail] = `/${page.slug}`;
  }
  return bases;
};

export type RouteMatch =
  | { kind: "page"; page: SnapshotPage }
  | { kind: "detail"; page: SnapshotPage; detail: DetailKind; item: string }
  | { kind: "not_found" };

/**
 * Da un percorso richiesto alla pagina. Prima la corrispondenza esatta, poi
 * un modello di dettaglio (`/squadre/serie-c` → modello «squadra» con
 * `serie-c`). Due livelli e basta: un indirizzo piu profondo non esiste.
 */
export const matchSnapshotRoute = (pages: readonly SnapshotPage[], segments: readonly string[]): RouteMatch => {
  const path = segments.length ? `/${segments.join("/")}` : "/";
  const exact = pages.find((page) => page.path === path);
  if (exact && !DETAIL_KIND_BY_PAGE_KIND[exact.kind]) return { kind: "page", page: exact };
  if (segments.length === 2) {
    const template = pages.find((page) => page.path === `/${segments[0]}/*`);
    const detail = template ? DETAIL_KIND_BY_PAGE_KIND[template.kind] : undefined;
    if (template && detail) return { kind: "detail", page: template, detail, item: segments[1] };
  }
  return { kind: "not_found" };
};
