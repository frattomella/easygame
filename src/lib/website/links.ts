import { LINK_KINDS, type LinkKind, type WebsiteLink } from "./document/types";

/**
 * **Collegamenti sicuri** (ADR-0200 §7; sicurezza in KB 14).
 *
 * Ogni `href` del sito nasce qui. Un URL scritto da un operatore passa da
 * `sanitizeExternalUrl`: solo `http(s)`, niente `javascript:`, niente
 * `data:`, niente credenziali nell'host. Una pagina si cita per
 * identificativo e diventa un percorso solo al render, cosi rinominare uno
 * slug non rompe i bottoni.
 *
 * Modulo puro.
 */

const asText = (value: unknown) => String(value ?? "").trim();

const CONTROL = new RegExp("[\\u0000-\\u001f\\u007f\\s]", "g");

/** Un URL esterno accettabile, o `null`. */
export const sanitizeExternalUrl = (value: unknown): string | null => {
  const raw = asText(value).replace(CONTROL, "");
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    if (!url.hostname || !url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
};

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;
export const sanitizeEmail = (value: unknown) => {
  const raw = asText(value).toLowerCase();
  return EMAIL.test(raw) && raw.length <= 200 ? raw : null;
};

export const sanitizePhone = (value: unknown) => {
  const raw = asText(value).replace(/[^\d+]/g, "");
  return /^\+?\d{6,16}$/.test(raw) ? raw : null;
};

/** Un'ancora: lettere minuscole, cifre e trattini. */
export const sanitizeAnchor = (value: unknown) => {
  const raw = asText(value)
    .replace(/^#/, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return raw || null;
};

export const normalizeLink = (raw: unknown): WebsiteLink => {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const kind = (LINK_KINDS as readonly string[]).includes(String(record.kind))
    ? (record.kind as LinkKind)
    : "none";
  const link: WebsiteLink = { kind, newTab: Boolean(record.newTab) };
  if (kind === "page") link.pageId = asText(record.pageId) || null;
  if (kind === "url") link.url = sanitizeExternalUrl(record.url);
  if (kind === "anchor") link.anchor = sanitizeAnchor(record.anchor);
  if (kind === "email") link.email = sanitizeEmail(record.email);
  if (kind === "phone") link.phone = sanitizePhone(record.phone);
  if (kind === "form") link.formSlug = asText(record.formSlug).replace(/[^a-z0-9-]/gi, "").slice(0, 120) || null;
  if (kind === "page" && record.anchor) link.anchor = sanitizeAnchor(record.anchor);
  return link;
};

export type LinkResolverContext = {
  /** Identificativo di pagina → percorso pubblico (`/squadre`). */
  pagePaths: Record<string, string>;
  /** L'origine del gestionale, per i moduli online (`https://app.easygame.it`). */
  formsOrigin: string;
  /** In anteprima i percorsi vivono sotto un prefisso privato. */
  pathPrefix?: string;
};

export type ResolvedLink = {
  href: string;
  external: boolean;
  newTab: boolean;
};

/** Il link pronto per un `<a>`, o `null` se non porta da nessuna parte. */
export const resolveLinkHref = (
  link: WebsiteLink | null | undefined,
  context: LinkResolverContext,
): ResolvedLink | null => {
  if (!link) return null;
  const prefix = context.pathPrefix || "";
  const newTab = Boolean(link.newTab);
  switch (link.kind) {
    case "page": {
      const path = link.pageId ? context.pagePaths[link.pageId] : null;
      if (!path) return null;
      const anchor = link.anchor ? `#${link.anchor}` : "";
      return { href: `${prefix}${path === "/" && prefix ? "" : path}${anchor}` || "/", external: false, newTab };
    }
    case "url": {
      const url = sanitizeExternalUrl(link.url);
      return url ? { href: url, external: true, newTab } : null;
    }
    case "anchor":
      return link.anchor ? { href: `#${link.anchor}`, external: false, newTab: false } : null;
    case "email": {
      const email = sanitizeEmail(link.email);
      return email ? { href: `mailto:${email}`, external: true, newTab: false } : null;
    }
    case "phone": {
      const phone = sanitizePhone(link.phone);
      return phone ? { href: `tel:${phone}`, external: true, newTab: false } : null;
    }
    case "form": {
      if (!link.formSlug) return null;
      const origin = context.formsOrigin.replace(/\/+$/, "");
      return { href: `${origin}/forms/${encodeURIComponent(link.formSlug)}`, external: true, newTab };
    }
    default:
      return null;
  }
};

/** `rel` coerente: un link esterno in una nuova scheda non passa `opener`. */
export const linkRel = (resolved: ResolvedLink | null) =>
  resolved?.external ? (resolved.newTab ? "noopener noreferrer" : "noopener") : undefined;
