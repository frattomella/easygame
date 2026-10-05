import { normalizeLink, sanitizeEmail, sanitizeExternalUrl, sanitizePhone } from "./links";
import type { MediaRef, WebsiteLink } from "./document/types";

/**
 * **Intestazione, piede, identita e SEO globale di un sito** (ADR-0200 §12).
 *
 * Il principio dei dati del club (§70): ragione sociale, logo, indirizzo,
 * contatti e social **si leggono dal gestionale** al render, non si copiano.
 * Qui vive solo cio che il sito vuole diverso — un nome breve, un logo per il
 * fondo scuro, un'email dedicata — e un campo vuoto significa «usa quello del
 * club». Cosi un cambio di indirizzo in anagrafica arriva al sito senza che
 * nessuno se ne ricordi.
 *
 * Modulo puro.
 */

const asText = (value: unknown, max = 300) => String(value ?? "").trim().slice(0, max);
const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

export const normalizeMediaRef = (raw: unknown): MediaRef | null => {
  const record = asRecord(raw);
  const mediaId = asText(record.mediaId, 64);
  if (!mediaId) return null;
  const clamp = (n: unknown) => {
    const value = Number(n);
    return Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : undefined;
  };
  const ref: MediaRef = { mediaId };
  const alt = asText(record.alt, 250);
  if (alt) ref.alt = alt;
  const x = clamp(record.focalX);
  const y = clamp(record.focalY);
  if (x !== undefined) ref.focalX = x;
  if (y !== undefined) ref.focalY = y;
  return ref;
};

/* ------------------------------------------------------------------ social */

export const SOCIAL_NETWORKS = [
  "facebook",
  "instagram",
  "youtube",
  "tiktok",
  "x",
  "linkedin",
  "whatsapp",
  "telegram",
] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];
export type SocialLinks = Partial<Record<SocialNetwork, string>>;

export const SOCIAL_LABELS: Record<SocialNetwork, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  tiktok: "TikTok",
  x: "X",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
};

export const normalizeSocialLinks = (raw: unknown): SocialLinks => {
  const record = asRecord(raw);
  const out: SocialLinks = {};
  for (const network of SOCIAL_NETWORKS) {
    const url = sanitizeExternalUrl(record[network]);
    if (url) out[network] = url;
  }
  return out;
};

/* --------------------------------------------------------------- identita */

export type SiteIdentity = {
  /** Il nome mostrato dal sito; vuoto = la denominazione del club. */
  displayName: string;
  tagline: string;
  description: string;
  /** Il logo del sito; nullo = il logo del club. */
  logo: MediaRef | null;
  /** Il logo per i fondi scuri (intestazione trasparente, piede). */
  logoOnDark: MediaRef | null;
  favicon: MediaRef | null;
  email: string;
  phone: string;
  address: string;
  /** Override dei social; una rete assente usa quella del club. */
  social: SocialLinks;
  /** Copyright del piede; vuoto = «© anno nome». */
  copyright: string;
  language: "it" | "en";
};

export const DEFAULT_IDENTITY: SiteIdentity = {
  displayName: "",
  tagline: "",
  description: "",
  logo: null,
  logoOnDark: null,
  favicon: null,
  email: "",
  phone: "",
  address: "",
  social: {},
  copyright: "",
  language: "it",
};

export const normalizeIdentity = (raw: unknown): SiteIdentity => {
  const record = asRecord(raw);
  return {
    displayName: asText(record.displayName, 120),
    tagline: asText(record.tagline, 160),
    description: asText(record.description, 600),
    logo: normalizeMediaRef(record.logo),
    logoOnDark: normalizeMediaRef(record.logoOnDark),
    favicon: normalizeMediaRef(record.favicon),
    email: sanitizeEmail(record.email) || "",
    phone: sanitizePhone(record.phone) ? asText(record.phone, 40) : "",
    address: asText(record.address, 240),
    social: normalizeSocialLinks(record.social),
    copyright: asText(record.copyright, 200),
    language: record.language === "en" ? "en" : "it",
  };
};

/* ------------------------------------------------------------- intestazione */

export const HEADER_LAYOUTS = ["logo-left", "logo-center", "split"] as const;
export const HEADER_STYLES = ["solid", "transparent", "primary", "dark"] as const;

export type SiteHeader = {
  layout: (typeof HEADER_LAYOUTS)[number];
  style: (typeof HEADER_STYLES)[number];
  sticky: boolean;
  showName: boolean;
  showSocial: boolean;
  /** Una riga sottile sopra l'intestazione con contatti e social. */
  topBar: boolean;
  cta: { label: string; link: WebsiteLink } | null;
};

export const DEFAULT_HEADER: SiteHeader = {
  layout: "logo-left",
  style: "solid",
  sticky: true,
  showName: true,
  showSocial: false,
  topBar: false,
  cta: null,
};

export const normalizeHeader = (raw: unknown): SiteHeader => {
  const record = asRecord(raw);
  const cta = asRecord(record.cta);
  const ctaLabel = asText(cta.label, 40);
  return {
    layout: oneOf(record.layout, HEADER_LAYOUTS, DEFAULT_HEADER.layout),
    style: oneOf(record.style, HEADER_STYLES, DEFAULT_HEADER.style),
    sticky: record.sticky === undefined ? DEFAULT_HEADER.sticky : Boolean(record.sticky),
    showName: record.showName === undefined ? DEFAULT_HEADER.showName : Boolean(record.showName),
    showSocial: Boolean(record.showSocial),
    topBar: Boolean(record.topBar),
    cta: ctaLabel ? { label: ctaLabel, link: normalizeLink(cta.link) } : null,
  };
};

/* --------------------------------------------------------------------- piede */

export const FOOTER_STYLES = ["dark", "light", "primary"] as const;

export type SiteFooter = {
  style: (typeof FOOTER_STYLES)[number];
  showLogo: boolean;
  showDescription: boolean;
  showContacts: boolean;
  showAddress: boolean;
  showSocial: boolean;
  /** Una fascia di loghi sponsor sopra il piede. */
  showSponsors: boolean;
  /** Il livello sponsor da mostrare; vuoto = tutti quelli in vetrina. */
  sponsorTier: string;
  privacyPageId: string | null;
  cookiePageId: string | null;
  /** Le voci legali obbligatorie che EasyGame aggiunge: ragione sociale e P.IVA del club. */
  showLegalIdentity: boolean;
};

export const DEFAULT_FOOTER: SiteFooter = {
  style: "dark",
  showLogo: true,
  showDescription: true,
  showContacts: true,
  showAddress: true,
  showSocial: true,
  showSponsors: false,
  sponsorTier: "",
  privacyPageId: null,
  cookiePageId: null,
  showLegalIdentity: true,
};

export const normalizeFooter = (raw: unknown): SiteFooter => {
  const record = asRecord(raw);
  const bool = (key: keyof SiteFooter) =>
    record[key] === undefined ? Boolean(DEFAULT_FOOTER[key]) : Boolean(record[key]);
  return {
    style: oneOf(record.style, FOOTER_STYLES, DEFAULT_FOOTER.style),
    showLogo: bool("showLogo"),
    showDescription: bool("showDescription"),
    showContacts: bool("showContacts"),
    showAddress: bool("showAddress"),
    showSocial: bool("showSocial"),
    showSponsors: bool("showSponsors"),
    sponsorTier: asText(record.sponsorTier, 40),
    privacyPageId: asText(record.privacyPageId, 64) || null,
    cookiePageId: asText(record.cookiePageId, 64) || null,
    showLegalIdentity: bool("showLegalIdentity"),
  };
};

/* --------------------------------------------------------------- SEO globale */

export type SiteSeo = {
  /** Il suffisso dei titoli: «Chi siamo · Fortitudo Scauri». */
  titleTemplate: string;
  defaultDescription: string;
  socialImage: MediaRef | null;
  /** Spegne l'indicizzazione dell'intero sito (es. sito in rifacimento). */
  noindex: boolean;
};

export const DEFAULT_SEO: SiteSeo = {
  titleTemplate: "%s · {site}",
  defaultDescription: "",
  socialImage: null,
  noindex: false,
};

export const normalizeSiteSeo = (raw: unknown): SiteSeo => {
  const record = asRecord(raw);
  const template = asText(record.titleTemplate, 80);
  return {
    titleTemplate: template.includes("%s") ? template : DEFAULT_SEO.titleTemplate,
    defaultDescription: asText(record.defaultDescription, 320),
    socialImage: normalizeMediaRef(record.socialImage),
    noindex: Boolean(record.noindex),
  };
};

/* ---------------------------------------------------------------- impostazioni */

export type ArticleCategory = { slug: string; label: string };

export type SponsorTier = { key: string; label: string; order: number };

/** I livelli predefiniti: il club li rinomina, li toglie o ne aggiunge. */
export const DEFAULT_SPONSOR_TIERS: SponsorTier[] = [
  { key: "main", label: "Main sponsor", order: 1 },
  { key: "gold", label: "Gold", order: 2 },
  { key: "silver", label: "Silver", order: 3 },
  { key: "partner", label: "Partner", order: 4 },
  { key: "technical", label: "Sponsor tecnico", order: 5 },
];

export const normalizeSponsorTiers = (raw: unknown): SponsorTier[] => {
  const seen = new Set<string>();
  const out: SponsorTier[] = [];
  (Array.isArray(raw) ? raw : []).forEach((item, index) => {
    const record = asRecord(item);
    const key = asText(record.key, 40).toLowerCase().replace(/[^a-z0-9-]/g, "");
    const label = asText(record.label, 40);
    if (!key || !label || seen.has(key)) return;
    seen.add(key);
    const order = Number(record.order);
    out.push({ key, label, order: Number.isFinite(order) ? order : index + 1 });
  });
  return out.length ? out.sort((a, b) => a.order - b.order).slice(0, 12) : DEFAULT_SPONSOR_TIERS.map((tier) => ({ ...tier }));
};

export type SiteSettings = {
  identity: SiteIdentity;
  articleCategories: ArticleCategory[];
  sponsorTiers: SponsorTier[];
  /** Il livello di dettaglio delle persone: puo restringere, mai allargare la policy. */
  showStaffContacts: false;
  /** Banner cookie: il sito non usa cookie di profilazione, ma i blocchi esterni si. */
  consentBanner: boolean;
};

export const normalizeArticleCategories = (raw: unknown): ArticleCategory[] => {
  const seen = new Set<string>();
  const out: ArticleCategory[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const record = asRecord(item);
    const label = asText(record.label, 40);
    const slug = asText(record.slug, 60)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!label || !slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, label });
  }
  return out.slice(0, 30);
};

export const normalizeSettings = (raw: unknown): SiteSettings => {
  const record = asRecord(raw);
  return {
    identity: normalizeIdentity(record.identity),
    articleCategories: normalizeArticleCategories(record.articleCategories),
    sponsorTiers: normalizeSponsorTiers(record.sponsorTiers),
    showStaffContacts: false,
    consentBanner: record.consentBanner === undefined ? true : Boolean(record.consentBanner),
  };
};
