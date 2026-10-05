import { prisma } from "../../prisma";
import { listSponsorShowcases } from "../../sponsors";
import { isSponsorShowcaseActive } from "@/lib/sponsors/model";
import { normalizeArticleCategories, type SiteSettings } from "@/lib/website/site-config";
import { normalizeMediaRef } from "@/lib/website/site-config";
import { normalizePageSeo } from "@/lib/website/publishing/snapshot";
import type { PublicArticle, PublicArticleSummary, PublicSponsor } from "@/lib/website/public-dto";
import { siteDayKey } from "@/lib/website/dates";
import { loadMediaMeta, toPublicImage, toRouteImage } from "./images";

/**
 * Sponsor in vetrina e articoli pubblicati, per il sito.
 *
 * Gli sponsor vengono dal dominio sponsor (`listSponsorShowcases`), che non
 * restituisce contratti ne dati fiscali. Un articolo e pubblico quando e
 * `published`, oppure `scheduled` con la data gia passata: non serve un
 * processo che lo «accenda», lo decide la lettura.
 */


export const loadPublicSponsors = async (
  organizationId: string,
  settings: SiteSettings,
  now: Date,
): Promise<PublicSponsor[]> => {
  const showcases = await listSponsorShowcases(organizationId);
  const today = siteDayKey(now);
  const active = showcases.filter((entry) => isSponsorShowcaseActive(entry.showcase, today));
  const meta = await loadMediaMeta(
    organizationId,
    active.map((entry) => entry.showcase.logoMediaId).filter((id): id is string => Boolean(id)),
  );
  const tiers = new Map(settings.sponsorTiers.map((tier) => [tier.key, tier]));
  const fallbackTier = { key: "partner", label: "Partner", order: 99 };
  return active
    .map((entry) => {
      const tier = tiers.get(entry.showcase.tierKey) || { ...fallbackTier, key: entry.showcase.tierKey || fallbackTier.key };
      const logo = entry.showcase.logoMediaId
        ? toPublicImage(entry.showcase.logoMediaId, meta, `Logo ${entry.name}`)
        : entry.hasLegacyLogo
          ? toRouteImage(`/api/public/website/sponsor-logo/${organizationId}/${encodeURIComponent(entry.id)}`, `Logo ${entry.name}`)
          : null;
      return {
        id: entry.id,
        name: entry.name,
        logo,
        url: entry.showcase.websiteUrl,
        description: entry.showcase.description,
        tier: { key: tier.key, label: tier.label, order: tier.order },
        order: entry.showcase.order,
        featured: entry.showcase.featured,
      } satisfies PublicSponsor;
    })
    .sort((a, b) => a.tier.order - b.tier.order || a.order - b.order || a.name.localeCompare(b.name, "it"));
};

const ARTICLE_SUMMARY_SELECT = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  cover: true,
  category_slug: true,
  author_label: true,
  status: true,
  published_at: true,
  publish_at: true,
  featured: true,
  related_event_id: true,
} as const;

export const publishedArticleWhere = (organizationId: string, siteId: string, now: Date) => ({
  organization_id: organizationId,
  site_id: siteId,
  OR: [
    { status: "published", published_at: { lte: now } },
    { status: "scheduled", publish_at: { lte: now } },
  ],
});

const publishedAtOf = (row: any) => {
  const value = row.status === "scheduled" ? row.publish_at : row.published_at;
  return value instanceof Date ? value.toISOString() : String(value || "");
};

export const toArticleSummary = (
  row: any,
  settings: SiteSettings,
  bases: Partial<Record<"article", string>>,
  meta: Map<string, any>,
): PublicArticleSummary => {
  const categories = normalizeArticleCategories(settings.articleCategories);
  const category = categories.find((item) => item.slug === row.category_slug) || null;
  const cover = normalizeMediaRef(row.cover);
  return {
    id: row.id,
    slug: row.slug,
    href: bases.article ? `${bases.article}/${row.slug}` : null,
    title: String(row.title || "").slice(0, 200),
    excerpt: String(row.excerpt || "").slice(0, 400),
    cover: cover ? toPublicImage(cover.mediaId, meta, row.title, cover) : null,
    publishedAt: publishedAtOf(row),
    category,
    author: String(row.author_label || "").slice(0, 80),
    featured: Boolean(row.featured),
  };
};

export const loadArticleSummaries = async (
  organizationId: string,
  siteId: string,
  settings: SiteSettings,
  bases: Partial<Record<"article", string>>,
  now: Date,
  options: { category?: string; featuredOnly?: boolean; limit: number; offset?: number; excludeId?: string | null },
) => {
  const where: Record<string, unknown> = {
    ...publishedArticleWhere(organizationId, siteId, now),
    ...(options.category ? { category_slug: options.category } : {}),
    ...(options.featuredOnly ? { featured: true } : {}),
    ...(options.excludeId ? { NOT: { id: options.excludeId } } : {}),
  };
  const [rows, total] = await Promise.all([
    (prisma as any).websiteArticle.findMany({
      where,
      select: ARTICLE_SUMMARY_SELECT,
      orderBy: [{ published_at: "desc" }, { publish_at: "desc" }, { created_at: "desc" }],
      take: options.limit,
      skip: options.offset || 0,
    }),
    (prisma as any).websiteArticle.count({ where }),
  ]);
  const meta = await loadMediaMeta(
    organizationId,
    rows.map((row: any) => normalizeMediaRef(row.cover)?.mediaId).filter(Boolean),
  );
  return { items: rows.map((row: any) => toArticleSummary(row, settings, bases, meta)), total: Number(total || 0) };
};

/** Un articolo pubblicato, per identificativo o per slug. */
export const loadPublicArticle = async (
  organizationId: string,
  siteId: string,
  settings: SiteSettings,
  bases: Partial<Record<"article", string>>,
  now: Date,
  ref: { id?: string | null; slug?: string | null },
): Promise<PublicArticle | null> => {
  if (!ref.id && !ref.slug) return null;
  const row = await (prisma as any).websiteArticle.findFirst({
    where: {
      ...publishedArticleWhere(organizationId, siteId, now),
      ...(ref.id ? { id: ref.id } : { slug: ref.slug }),
    },
  });
  if (!row) return null;
  const gallery = (Array.isArray(row.gallery) ? row.gallery : []).map(normalizeMediaRef).filter(Boolean) as Array<NonNullable<ReturnType<typeof normalizeMediaRef>>>;
  const seo = normalizePageSeo(row.seo);
  const cover = normalizeMediaRef(row.cover);
  const meta = await loadMediaMeta(
    organizationId,
    [cover?.mediaId, seo.socialImage?.mediaId, ...gallery.map((item) => item.mediaId)].filter((id): id is string => Boolean(id)),
  );
  const related = await loadArticleSummaries(organizationId, siteId, settings, bases, now, {
    category: row.category_slug || undefined,
    limit: 3,
    excludeId: row.id,
  });
  const summary = toArticleSummary(row, settings, bases, meta);
  return {
    ...summary,
    bodyHtml: String(row.body_html || ""),
    gallery: gallery.map((item) => toPublicImage(item.mediaId, meta, row.title, item)).filter((image): image is NonNullable<typeof image> => Boolean(image)),
    seo: {
      title: seo.title || row.title,
      description: seo.description || row.excerpt || "",
      image: seo.socialImage ? toPublicImage(seo.socialImage.mediaId, meta, row.title, seo.socialImage) : summary.cover,
      canonical: seo.canonical,
      noindex: seo.noindex,
    },
    related: related.items,
  };
};

/** Per i resoconti: gara → articolo che la racconta. */
export const loadRecapLinks = async (
  organizationId: string,
  siteId: string,
  bases: Partial<Record<"article", string>>,
  now: Date,
) => {
  if (!bases.article) return new Map<string, string>();
  const rows = await (prisma as any).websiteArticle.findMany({
    where: { ...publishedArticleWhere(organizationId, siteId, now), related_event_id: { not: null } },
    select: { slug: true, related_event_id: true },
    take: 500,
  });
  return new Map<string, string>(rows.map((row: any) => [row.related_event_id, `${bases.article}/${row.slug}`]));
};
