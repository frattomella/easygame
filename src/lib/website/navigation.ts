import { normalizeLink } from "./links";
import type { WebsiteLink } from "./document/types";

/**
 * **La navigazione del sito** (ADR-0200 §3).
 *
 * Un'entita di configurazione propria, non una stringa nel template e non una
 * conseguenza delle pagine: due menu (intestazione e piede), voci ordinate,
 * un livello di sottomenu. Una voce punta a una pagina (per identificativo),
 * a un URL esterno, a un'ancora, oppure e un gruppo che apre un sottomenu.
 *
 * Modulo puro.
 */

export const NAV_ITEM_KINDS = ["page", "url", "anchor", "group"] as const;
export type NavItemKind = (typeof NAV_ITEM_KINDS)[number];

export type NavItem = {
  id: string;
  label: string;
  kind: NavItemKind;
  link: WebsiteLink;
  children: NavItem[];
};

export type SiteNavigation = {
  header: NavItem[];
  footer: NavItem[];
};

export const MAX_NAV_ITEMS = 12;
export const MAX_NAV_CHILDREN = 12;
export const MAX_NAV_LABEL = 40;

const asText = (value: unknown) => String(value ?? "").trim();

const newId = () =>
  typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `nav-${Math.random().toString(36).slice(2, 12)}`;

const normalizeItem = (raw: unknown, depth: number): NavItem | null => {
  const record = raw && typeof raw === "object" ? (raw as Record<string, any>) : null;
  if (!record) return null;
  const label = asText(record.label).slice(0, MAX_NAV_LABEL);
  if (!label) return null;
  const kind = (NAV_ITEM_KINDS as readonly string[]).includes(record.kind) ? (record.kind as NavItemKind) : "page";
  const link =
    kind === "group"
      ? ({ kind: "none" } as WebsiteLink)
      : normalizeLink({ ...(record.link || {}), kind: kind === "anchor" ? "anchor" : kind === "url" ? "url" : "page" });
  const children =
    depth === 0 && Array.isArray(record.children)
      ? record.children
          .map((child: unknown) => normalizeItem(child, 1))
          .filter((child: NavItem | null): child is NavItem => Boolean(child))
          .slice(0, MAX_NAV_CHILDREN)
      : [];
  return { id: asText(record.id) || newId(), label, kind, link, children };
};

export const normalizeNavItems = (raw: unknown): NavItem[] =>
  (Array.isArray(raw) ? raw : [])
    .map((item) => normalizeItem(item, 0))
    .filter((item): item is NavItem => Boolean(item))
    .slice(0, MAX_NAV_ITEMS);

export const normalizeNavigation = (raw: unknown): SiteNavigation => {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return { header: normalizeNavItems(record.header), footer: normalizeNavItems(record.footer) };
};

export type NavValidationIssue = { itemId: string; message: string };

/**
 * I problemi di un menu rispetto alle pagine che esistono. Non blocca il
 * salvataggio — un menu si costruisce a pezzi — ma la pubblicazione si.
 */
export const validateNavigation = (
  navigation: SiteNavigation,
  pageIds: ReadonlySet<string>,
): NavValidationIssue[] => {
  const issues: NavValidationIssue[] = [];
  const visit = (item: NavItem) => {
    if (item.kind === "page" && (!item.link.pageId || !pageIds.has(item.link.pageId))) {
      issues.push({ itemId: item.id, message: `La voce «${item.label}» punta a una pagina che non esiste piu` });
    }
    if (item.kind === "url" && !item.link.url) {
      issues.push({ itemId: item.id, message: `La voce «${item.label}» ha un indirizzo non valido` });
    }
    if (item.kind === "anchor" && !item.link.anchor) {
      issues.push({ itemId: item.id, message: `La voce «${item.label}» non indica l'ancora` });
    }
    if (item.kind === "group" && !item.children.length) {
      issues.push({ itemId: item.id, message: `Il gruppo «${item.label}» e vuoto` });
    }
    item.children.forEach(visit);
  };
  [...navigation.header, ...navigation.footer].forEach(visit);
  return issues;
};

/** Toglie le voci che puntano a una pagina cancellata. */
export const pruneNavigationForPage = (navigation: SiteNavigation, pageId: string): SiteNavigation => {
  const prune = (items: NavItem[]): NavItem[] =>
    items
      .filter((item) => !(item.kind === "page" && item.link.pageId === pageId))
      .map((item) => ({ ...item, children: prune(item.children) }));
  return { header: prune(navigation.header), footer: prune(navigation.footer) };
};

/** Sposta una voce di un passo nella sua lista (anche dentro un gruppo). */
export const moveNavItem = (items: NavItem[], itemId: string, delta: -1 | 1): NavItem[] => {
  const index = items.findIndex((item) => item.id === itemId);
  if (index >= 0) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return items;
    const next = items.slice();
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    return next;
  }
  return items.map((item) => ({ ...item, children: moveNavItem(item.children, itemId, delta) }));
};

/** Riordina una lista secondo un ordine di identificativi (drag & drop). */
export const reorderNavItems = (items: NavItem[], fromId: string, toId: string): NavItem[] => {
  const from = items.findIndex((item) => item.id === fromId);
  const to = items.findIndex((item) => item.id === toId);
  if (from < 0 || to < 0) {
    return items.map((item) => ({ ...item, children: reorderNavItems(item.children, fromId, toId) }));
  }
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};
