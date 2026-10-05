import { DEFAULT_THEME, normalizeTheme, type SiteTheme } from "../theme/theme";
import {
  DEFAULT_FOOTER,
  DEFAULT_HEADER,
  DEFAULT_SEO,
  type SiteFooter,
  type SiteHeader,
  type SiteSeo,
} from "../site-config";
import { b, commonPages, doc, section, type TemplatePage, type TemplatePageKey } from "./pages";

/**
 * **I template del sito** (ADR-0200 §9).
 *
 * Quattro punti di partenza curati, non quattro siti bloccati. Un template e
 * **dati**: un tema, un'intestazione, un piede, un menu e un insieme di pagine
 * costruite con il registry dei blocchi. Applicarlo crea righe normali —
 * pagine, menu, tema — che il club cambia come vuole; niente resta legato al
 * template, e il template non viene riletto al render.
 *
 * `version` serve solo a dire con quale stesura e nato un sito: le stesure
 * nuove non toccano i siti gia creati.
 *
 * Modulo puro.
 */

export const TEMPLATE_KEYS = ["club-modern", "academy", "professional", "minimal"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export type NavSeed = { label: string; pageKey: TemplatePageKey; children?: NavSeed[] };

export type TemplateSeed = {
  key: TemplateKey;
  version: number;
  label: string;
  description: string;
  /** Per la galleria dei template: tre colori e il carattere dei titoli. */
  preview: { colors: [string, string, string]; headingFont: string };
  theme: SiteTheme;
  header: SiteHeader;
  footer: SiteFooter;
  seo: SiteSeo;
  pages: TemplatePage[];
  navigation: { header: NavSeed[]; footer: NavSeed[] };
  /** La pagina verso cui punta il bottone dell'intestazione. */
  headerCtaPageKey: TemplatePageKey | null;
  headerCtaLabel: string;
};

const NAV_HEADER: NavSeed[] = [
  { label: "Societa", pageKey: "club" },
  { label: "Squadre", pageKey: "teams" },
  { label: "Gare", pageKey: "matches" },
  { label: "News", pageKey: "news" },
  { label: "Sponsor", pageKey: "sponsors" },
  { label: "Contatti", pageKey: "contacts" },
];

const NAV_FOOTER: NavSeed[] = [
  { label: "Iscrizioni", pageKey: "registration" },
  { label: "Contatti", pageKey: "contacts" },
  { label: "Privacy", pageKey: "privacy" },
  { label: "Cookie", pageKey: "cookie" },
];

const homePage = (document: TemplatePage["document"]): TemplatePage => ({
  key: "home",
  kind: "home",
  title: "Home",
  slug: "",
  inNavigation: false,
  document,
});

/* ----------------------------------------------------------- Club Modern */

const clubModern = (): TemplateSeed => {
  const theme = normalizeTheme({
    colors: { ...DEFAULT_THEME.colors, primary: "#1d4ed8", secondary: "#0b1b3f", accent: "#facc15", muted: "#eef2ff" },
    fonts: { heading: "oswald", body: "inter" },
    radius: "md",
    buttons: { shape: "rounded", transform: "uppercase" },
  });
  return {
    key: "club-modern",
    version: 1,
    label: "Club Modern",
    description: "Energico e sportivo: gara in copertina, risultati, news e sponsor in movimento.",
    preview: { colors: [theme.colors.primary, theme.colors.secondary, theme.colors.accent], headingFont: "Oswald" },
    theme,
    header: { ...DEFAULT_HEADER, style: "dark", sticky: true, topBar: true, showSocial: true },
    footer: { ...DEFAULT_FOOTER, style: "dark", showSponsors: true },
    seo: DEFAULT_SEO,
    headerCtaPageKey: "registration",
    headerCtaLabel: "Iscriviti",
    navigation: { header: NAV_HEADER, footer: NAV_FOOTER },
    pages: [
      homePage(
        doc(
          section({ blocks: [b("match-hero", {})], background: "dark", width: "full", paddingTop: "none", paddingBottom: "none", preset: "match-hero" }),
          section({ blocks: [b("sponsor-marquee", { monochrome: true })], background: "surface", paddingTop: "sm", paddingBottom: "sm", width: "full", preset: "sponsor-marquee" }),
          section({ layout: "two", blocks: [b("last-match", {}), b("upcoming-matches", { limit: 4 })], background: "muted" }),
          section({ blocks: [b("latest-news", { limit: 3 })] }),
          section({ blocks: [b("club-numbers", {})], background: "primary", paddingTop: "md", paddingBottom: "md" }),
          section({ blocks: [b("team-list", { columns: "4" })] }),
          section({ blocks: [b("registration-cta", { purpose: "trial", layout: "banner" })], background: "secondary" }),
          section({ blocks: [b("sponsor-grid", { title: "I nostri partner", monochrome: true })] }),
        ),
      ),
      ...commonPages({ accentSection: "primary" }),
    ],
  };
};

/* ---------------------------------------------------------------- Academy */

const academy = (): TemplateSeed => {
  const theme = normalizeTheme({
    colors: { ...DEFAULT_THEME.colors, primary: "#16a34a", secondary: "#14532d", accent: "#f97316", muted: "#f0fdf4" },
    fonts: { heading: "poppins", body: "inter" },
    radius: "lg",
    spacing: "spacious",
    buttons: { shape: "pill", transform: "none" },
  });
  return {
    key: "academy",
    version: 1,
    label: "Academy",
    description: "Pensato per il settore giovanile: iscrizioni, prove gratuite, camp e famiglie in primo piano.",
    preview: { colors: [theme.colors.primary, theme.colors.secondary, theme.colors.accent], headingFont: "Poppins" },
    theme,
    header: { ...DEFAULT_HEADER, style: "solid", sticky: true },
    footer: { ...DEFAULT_FOOTER, style: "primary" },
    seo: DEFAULT_SEO,
    headerCtaPageKey: "registration",
    headerCtaLabel: "Prova gratuita",
    navigation: { header: NAV_HEADER, footer: NAV_FOOTER },
    pages: [
      homePage(
        doc(
          section({
            blocks: [b("hero", { variant: "split", eyebrow: "Settore giovanile", title: "Cresciamo insieme, dentro e fuori dal campo", subtitle: "Allenatori qualificati, gruppi per eta e un percorso pensato per ogni bambino e ragazzo.", primaryCta: { label: "Prenota una prova", link: { kind: "page", pageId: "@registration" } }, secondaryCta: { label: "Scopri le squadre", link: { kind: "page", pageId: "@teams" } } })],
            paddingTop: "md",
            preset: "hero",
          }),
          section({ blocks: [b("columns", {})], background: "muted" }),
          section({ blocks: [b("registration-cta", { purpose: "trial", layout: "split" })] }),
          section({ blocks: [b("team-list", {})], background: "muted" }),
          section({ blocks: [b("stats", {})] }),
          section({ blocks: [b("latest-news", { limit: 3 })], background: "muted" }),
          section({ blocks: [b("faq", {})] }),
          section({ blocks: [b("sponsor-marquee", {})], paddingTop: "sm", paddingBottom: "sm", width: "full" }),
        ),
      ),
      ...commonPages({ accentSection: "muted" }),
    ],
  };
};

/* ----------------------------------------------------------- Professional */

const professional = (): TemplateSeed => {
  const theme = normalizeTheme({
    colors: { ...DEFAULT_THEME.colors, primary: "#b91c1c", secondary: "#111827", accent: "#d4af37", background: "#ffffff", muted: "#f5f5f4" },
    fonts: { heading: "barlow-condensed", body: "source-sans" },
    radius: "sm",
    container: "wide",
    buttons: { shape: "square", transform: "uppercase" },
    links: { underline: "always" },
  });
  return {
    key: "professional",
    version: 1,
    label: "Professional",
    description: "Prima squadra e campionato: tabellini, classifica, rosa e sponsor per livello.",
    preview: { colors: [theme.colors.primary, theme.colors.secondary, theme.colors.accent], headingFont: "Barlow Condensed" },
    theme,
    header: { ...DEFAULT_HEADER, style: "transparent", layout: "split", sticky: true },
    footer: { ...DEFAULT_FOOTER, style: "dark", showSponsors: true },
    seo: DEFAULT_SEO,
    headerCtaPageKey: "matches",
    headerCtaLabel: "Calendario",
    navigation: { header: NAV_HEADER, footer: NAV_FOOTER },
    pages: [
      homePage(
        doc(
          section({ blocks: [b("match-hero", { eyebrow: "Next game" })], background: "dark", width: "full", paddingTop: "none", paddingBottom: "none", preset: "match-hero" }),
          section({ layout: "three", blocks: [b("last-match", { layout: "card" }), b("next-match", { layout: "card", title: "Prossima in casa", venue: "home" }), b("standings", { compact: true })], background: "muted" }),
          section({ blocks: [b("featured-article", {})] }),
          section({ blocks: [b("roster-carousel", { teamId: null, title: "La rosa" })], background: "dark" }),
          section({ blocks: [b("news-grid", { title: "News", limit: 6 })] }),
          section({ blocks: [b("sponsor-section", {})], background: "muted" }),
        ),
      ),
      ...commonPages({ accentSection: "dark" }),
    ],
  };
};

/* ---------------------------------------------------------------- Minimal */

const minimal = (): TemplateSeed => {
  const theme = normalizeTheme({
    colors: { ...DEFAULT_THEME.colors, primary: "#111827", secondary: "#374151", accent: "#2563eb", muted: "#f9fafb" },
    fonts: { heading: "inter", body: "inter" },
    radius: "none",
    container: "narrow",
    spacing: "comfortable",
    buttons: { shape: "square", transform: "none" },
  });
  return {
    key: "minimal",
    version: 1,
    label: "Minimal",
    description: "Essenziale e leggero: testo, calendario e contatti, senza distrazioni.",
    preview: { colors: [theme.colors.primary, theme.colors.muted, theme.colors.accent], headingFont: "Inter" },
    theme,
    header: { ...DEFAULT_HEADER, style: "solid", sticky: false, layout: "logo-left" },
    footer: { ...DEFAULT_FOOTER, style: "light", showDescription: false },
    seo: DEFAULT_SEO,
    headerCtaPageKey: null,
    headerCtaLabel: "",
    navigation: { header: NAV_HEADER, footer: NAV_FOOTER },
    pages: [
      homePage(
        doc(
          section({ blocks: [b("hero", { variant: "plain", title: "Benvenuti", subtitle: "Il sito ufficiale della societa.", height: "sm" })], paddingTop: "md" }),
          section({ layout: "two", blocks: [b("next-match", { layout: "compact" }), b("latest-news", { layout: "list", limit: 4, showExcerpt: false })] }),
          section({ blocks: [b("contact", { layout: "cards" })], background: "muted" }),
        ),
      ),
      ...commonPages({ accentSection: "muted" }),
    ],
  };
};

const BUILDERS: Record<TemplateKey, () => TemplateSeed> = {
  "club-modern": clubModern,
  academy,
  professional,
  minimal,
};

export const isTemplateKey = (value: unknown): value is TemplateKey =>
  typeof value === "string" && (TEMPLATE_KEYS as readonly string[]).includes(value);

/** Un seme nuovo a ogni chiamata: gli identificativi dei blocchi non si condividono. */
export const buildTemplate = (key: TemplateKey): TemplateSeed => BUILDERS[key]();

/** La galleria: tutto tranne le pagine, che costerebbero senza servire. */
export const listTemplates = () =>
  TEMPLATE_KEYS.map((key) => {
    const seed = buildTemplate(key);
    return { key, label: seed.label, description: seed.description, preview: seed.preview, pageCount: seed.pages.length };
  });
