/**
 * **Le squadre stabili** (ADR-0200 §8): dominio puro.
 *
 * Una categoria nasce e muore con la stagione; una squadra no. `club_teams`
 * da alla «Serie C» un'identita che attraversa le stagioni, e ogni stagione
 * la collega alla categoria (e, se il club ha piu sedi, al gruppo) che in
 * quella stagione la rappresenta. L'indirizzo pubblico `/squadre/serie-c`
 * nasce dallo slug della squadra, non dal nome della categoria: cambia
 * stagione, cambia la categoria interna, l'indirizzo resta.
 *
 * Modulo puro.
 */

export type SeasonLink = {
  seasonId: string;
  categoryId: string;
  groupId: string | null;
};

const text = (value: unknown, max = 64) => String(value ?? "").trim().slice(0, max);

/** I collegamenti ripuliti: uno per stagione, l'ultimo vince. */
export const normalizeSeasonLinks = (raw: unknown): SeasonLink[] => {
  const bySeason = new Map<string, SeasonLink>();
  for (const item of Array.isArray(raw) ? raw : []) {
    const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const seasonId = text(record.seasonId ?? record.season_id);
    const categoryId = text(record.categoryId ?? record.category_id);
    if (!seasonId || !categoryId) continue;
    bySeason.set(seasonId, { seasonId, categoryId, groupId: text(record.groupId ?? record.group_id) || null });
  }
  return Array.from(bySeason.values());
};

/** Il collegamento della stagione, o nessuno: mai quello di un'altra stagione. */
export const linkForSeason = (links: readonly SeasonLink[], seasonId: string | null | undefined) =>
  links.find((link) => link.seasonId === seasonId) || null;

/** Un'appartenenza appartiene alla squadra nella stagione se combacia categoria (e sede del gruppo). */
export const membershipMatchesLink = (
  membership: { categoryId: string; siteId: string | null },
  link: SeasonLink,
  groupSiteId: string | null,
) => {
  if (membership.categoryId !== link.categoryId) return false;
  if (!link.groupId || !groupSiteId) return true;
  return !membership.siteId || membership.siteId === groupSiteId;
};

/** Lo slug nuovo e quelli vecchi che devono restare raggiungibili. */
export const nextSlugHistory = (currentSlug: string, nextSlug: string, previous: readonly string[]) => {
  if (currentSlug === nextSlug) return Array.from(new Set(previous)).filter((slug) => slug !== nextSlug);
  return Array.from(new Set([...previous, currentSlug])).filter((slug) => slug && slug !== nextSlug).slice(-20);
};
