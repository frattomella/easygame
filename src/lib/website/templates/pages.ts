import { createBlock, type PageKind } from "../registry";
import { createSection } from "../document/operations";
import type { SectionLayout, WebsiteBlock, WebsitePageDocument, WebsiteSection } from "../document/types";
import { PAGE_DOCUMENT_SCHEMA_VERSION } from "../document/types";

/**
 * Le pagine iniziali che un template crea. Sono **pagine normali**: il club
 * le rinomina, le svuota, le cancella. Un template e un punto di partenza
 * scritto con il registry, non un layout bloccato.
 */

export type TemplatePageKey =
  | "home"
  | "club"
  | "teams"
  | "matches"
  | "news"
  | "sponsors"
  | "contacts"
  | "registration"
  | "privacy"
  | "cookie"
  | "article"
  | "team"
  | "match"
  | "player"
  | "event";

export type TemplatePage = {
  key: TemplatePageKey;
  kind: PageKind;
  title: string;
  slug: string;
  inNavigation: boolean;
  document: WebsitePageDocument;
  seoDescription?: string;
};

type SectionSpec = {
  layout?: SectionLayout;
  blocks: Array<WebsiteBlock | WebsiteBlock[]>;
  background?: "none" | "surface" | "muted" | "primary" | "secondary" | "accent" | "dark";
  paddingTop?: "none" | "xs" | "sm" | "md" | "lg" | "xl";
  paddingBottom?: "none" | "xs" | "sm" | "md" | "lg" | "xl";
  width?: "full" | "wide" | "container" | "narrow";
  label?: string;
  anchor?: string;
  preset?: string;
};

export const section = (spec: SectionSpec): WebsiteSection => {
  const layout = spec.layout || "one";
  const columns: WebsiteBlock[][] =
    layout === "one"
      ? [spec.blocks.flat() as WebsiteBlock[]]
      : spec.blocks.map((entry) => (Array.isArray(entry) ? entry : [entry]));
  return createSection(layout, columns, {
    label: spec.label,
    anchor: spec.anchor,
    preset: spec.preset,
    style: {
      static: { background: spec.background || "none", width: spec.width || "container" },
      responsive: { base: { paddingTop: spec.paddingTop || "lg", paddingBottom: spec.paddingBottom || "lg" } },
    },
  });
};

export const doc = (...sections: WebsiteSection[]): WebsitePageDocument => ({
  schemaVersion: PAGE_DOCUMENT_SCHEMA_VERSION,
  sections,
});

export const b = createBlock;

/** Le pagine che ogni template condivide, con i testi scritti per un club. */
export const commonPages = (options: { accentSection: "muted" | "primary" | "dark" }): TemplatePage[] => [
  {
    key: "club",
    kind: "standard",
    title: "La societa",
    slug: "societa",
    inNavigation: true,
    seoDescription: "La storia, i valori e le persone della societa.",
    document: doc(
      section({ blocks: [b("heading", { eyebrow: "Chi siamo", text: "La nostra societa", level: "h1", size: "xl" })], paddingBottom: "sm" }),
      section({ blocks: [b("club-info", { layout: "side" })], paddingTop: "sm" }),
      section({ blocks: [b("club-numbers", {})], background: options.accentSection, paddingTop: "md", paddingBottom: "md" }),
      section({
        layout: "two",
        blocks: [
          b("rich-text", { html: "<h2>La nostra storia</h2><p>Racconta qui come e nata la societa, i traguardi raggiunti e le persone che l'hanno fatta crescere.</p>" }),
          b("rich-text", { html: "<h2>I nostri valori</h2><ul><li>Lo sport come scuola di vita</li><li>Inclusione e rispetto</li><li>Crescita tecnica e personale</li></ul>" }),
        ],
      }),
      section({ blocks: [b("staff", { title: "Staff e dirigenza", kind: "all" })] }),
    ),
  },
  {
    key: "teams",
    kind: "standard",
    title: "Squadre",
    slug: "squadre",
    inNavigation: true,
    seoDescription: "Le squadre della stagione, dal settore giovanile alla prima squadra.",
    document: doc(
      section({ blocks: [b("heading", { eyebrow: "Stagione in corso", text: "Le nostre squadre", level: "h1", size: "xl" })], paddingBottom: "sm" }),
      section({ blocks: [b("team-list", { title: "", columns: "3" })], paddingTop: "sm" }),
    ),
  },
  {
    key: "matches",
    kind: "standard",
    title: "Gare",
    slug: "gare",
    inNavigation: true,
    seoDescription: "Calendario e risultati delle gare.",
    document: doc(
      section({ blocks: [b("heading", { eyebrow: "Calendario e risultati", text: "Le gare", level: "h1", size: "xl" })], paddingBottom: "sm" }),
      section({
        layout: "two-wide-left",
        blocks: [
          b("upcoming-matches", { title: "Prossime gare", limit: 8, layout: "list" }),
          b("recent-results", { title: "Ultimi risultati", limit: 8, layout: "list" }),
        ],
        paddingTop: "sm",
      }),
      section({ blocks: [b("match-list", { title: "Tutto il calendario", when: "all" })], background: "muted" }),
    ),
  },
  {
    key: "news",
    kind: "news_index",
    title: "News",
    slug: "news",
    inNavigation: true,
    seoDescription: "Notizie, resoconti e comunicazioni della societa.",
    document: doc(
      section({ blocks: [b("heading", { eyebrow: "Dalla societa", text: "News", level: "h1", size: "xl" })], paddingBottom: "sm" }),
      section({ blocks: [b("article-list", {})], paddingTop: "sm" }),
    ),
  },
  {
    key: "sponsors",
    kind: "standard",
    title: "Sponsor",
    slug: "sponsor",
    inNavigation: true,
    seoDescription: "Le aziende che sostengono la societa.",
    document: doc(
      section({ blocks: [b("heading", { eyebrow: "Grazie a chi ci sostiene", text: "Partner e sponsor", level: "h1", size: "xl" })], paddingBottom: "sm" }),
      section({ blocks: [b("featured-sponsor", {})], paddingTop: "sm" }),
      section({ blocks: [b("sponsor-section", { title: "" })] }),
      section({
        blocks: [b("cta", { title: "Diventa sponsor", text: "Associa il tuo marchio ai valori dello sport e alla nostra comunita.", primaryCta: { label: "Contattaci", link: { kind: "page", pageId: "@contacts" } } })],
        background: options.accentSection,
      }),
    ),
  },
  {
    key: "contacts",
    kind: "standard",
    title: "Contatti",
    slug: "contatti",
    inNavigation: true,
    seoDescription: "Dove siamo e come contattarci.",
    document: doc(
      section({ blocks: [b("heading", { eyebrow: "Siamo qui", text: "Contatti", level: "h1", size: "xl" })], paddingBottom: "sm" }),
      section({
        layout: "two",
        blocks: [b("contact", { title: "Recapiti", layout: "list" }), b("contact-form", { title: "Scrivici" })],
        paddingTop: "sm",
      }),
      section({ blocks: [b("map", {})], width: "full", paddingTop: "none", paddingBottom: "none" }),
    ),
  },
  {
    key: "registration",
    kind: "standard",
    title: "Iscrizioni",
    slug: "iscrizioni",
    inNavigation: true,
    seoDescription: "Iscrizioni, prove gratuite, open day e camp.",
    document: doc(
      section({ blocks: [b("heading", { eyebrow: "Unisciti a noi", text: "Iscrizioni", level: "h1", size: "xl" })], paddingBottom: "sm" }),
      section({ blocks: [b("registration-cta", { purpose: "trial", layout: "card" })], paddingTop: "sm" }),
      section({ blocks: [b("registration-forms", {})] }),
      section({ blocks: [b("faq", {})], background: "muted" }),
    ),
  },
  {
    key: "privacy",
    kind: "legal",
    title: "Privacy",
    slug: "privacy",
    inNavigation: false,
    document: doc(
      section({
        width: "narrow",
        blocks: [
          b("heading", { text: "Informativa sulla privacy", level: "h1", size: "lg" }),
          b("rich-text", { html: "<p>Questa pagina va completata con l'informativa della societa (titolare del trattamento, finalita, basi giuridiche, diritti dell'interessato). EasyGame non la scrive al posto del titolare.</p>" }),
        ],
      }),
    ),
  },
  {
    key: "cookie",
    kind: "legal",
    title: "Cookie",
    slug: "cookie",
    inNavigation: false,
    document: doc(
      section({
        width: "narrow",
        blocks: [
          b("heading", { text: "Cookie policy", level: "h1", size: "lg" }),
          b("rich-text", { html: "<p>Il sito usa solo cookie tecnici. I contenuti di terze parti (video, mappe) si caricano solo dopo il consenso del visitatore, dato con un clic sul contenuto stesso.</p>" }),
        ],
      }),
    ),
  },
  /* -------------------------------------------- modelli delle pagine di dettaglio */
  {
    key: "article",
    kind: "article_detail",
    title: "Articolo",
    slug: "news",
    inNavigation: false,
    document: doc(
      section({ width: "narrow", blocks: [b("article-body", {})] }),
      section({ blocks: [b("latest-news", { title: "Altre news", limit: 3 })], background: "muted" }),
    ),
  },
  {
    key: "team",
    kind: "team_detail",
    title: "Squadra",
    slug: "squadre",
    inNavigation: false,
    document: doc(
      section({ blocks: [b("team-hero", {})], width: "full", paddingTop: "none", paddingBottom: "none" }),
      section({ layout: "two-wide-left", blocks: [b("team-info", {}), b("team-stats", { title: "La stagione" })] }),
      section({ blocks: [b("team-roster", {})], background: "muted" }),
      section({ blocks: [b("team-staff", {})] }),
      section({ layout: "two", blocks: [b("team-schedule", {}), b("team-results", {})], background: "muted" }),
    ),
  },
  {
    key: "match",
    kind: "match_detail",
    title: "Gara",
    slug: "gare",
    inNavigation: false,
    document: doc(section({ blocks: [b("match-detail", {})] })),
  },
  {
    key: "player",
    kind: "player_detail",
    title: "Giocatore",
    slug: "giocatori",
    inNavigation: false,
    document: doc(
      section({ blocks: [b("player-card", { variant: "large" })] }),
      section({ blocks: [b("player-stats", {})], background: "muted" }),
    ),
  },
  {
    key: "event",
    kind: "event_detail",
    title: "Evento",
    slug: "eventi",
    inNavigation: false,
    document: doc(section({ width: "narrow", blocks: [b("event-detail", { showMap: true })] })),
  },
];

/**
 * Nei semi dei template un collegamento a una pagina si scrive `@chiave`
 * (`@registration`): la pagina non ha ancora un identificativo. Chi applica
 * il template sostituisce le chiavi con gli identificativi veri.
 */
export const TEMPLATE_PAGE_REF_PREFIX = "@";

export const rewriteTemplatePageRefs = <T>(value: T, ids: Record<string, string>): T => {
  if (Array.isArray(value)) return value.map((item) => rewriteTemplatePageRefs(item, ids)) as T;
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) {
    if (key === "pageId" && typeof item === "string" && item.startsWith(TEMPLATE_PAGE_REF_PREFIX)) {
      out[key] = ids[item.slice(1)] ?? null;
    } else {
      out[key] = rewriteTemplatePageRefs(item, ids);
    }
  }
  return out as T;
};

/** I tipi di pagina di dettaglio e il loro significato nell'indirizzo. */
export const DETAIL_PAGE_KINDS: readonly PageKind[] = [
  "article_detail",
  "team_detail",
  "match_detail",
  "player_detail",
  "event_detail",
];

export const isDetailPageKind = (kind: PageKind) => DETAIL_PAGE_KINDS.includes(kind);
