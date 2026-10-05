import { prisma } from "../prisma";
import { sanitizeWebsiteRichHtml, richHtmlToText } from "@/lib/rich-text/sanitize";
import {
  auditWebsite,
  requireExpectedVersion,
  requireWebsiteAccess,
  WebsiteConflictError,
  WEBSITE_AUDIT_ACTIONS,
  type WebsiteScope,
} from "./access";
import { findSiteRow } from "./sites";
import { invalidateWebsiteData } from "./cache";
import { normalizeMediaRef, normalizeSettings } from "@/lib/website/site-config";
import { normalizePageSeo } from "@/lib/website/publishing/snapshot";
import { slugify, uniqueSlug, validatePageSlug } from "@/lib/website/slug";

/**
 * **Le news del sito** (ADR-0200 §9, §25).
 *
 * La bacheca del gestionale e interna e per pubblico (ADR della Wave 2): una
 * comunicazione alle famiglie di una categoria non e un articolo per il mondo.
 * Gli articoli del sito sono quindi `website_articles`, con uno stato proprio
 * — bozza, programmato, pubblicato, archiviato — fuori dallo snapshot del
 * sito: pubblicare una news non chiede di ripubblicare il sito.
 *
 * Il corpo si sanifica sul server (`sanitizeWebsiteRichHtml`) a ogni
 * scrittura; il sommario, se manca, si ricava dal testo.
 */

export const ARTICLE_STATUSES = ["draft", "scheduled", "published", "archived"] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

const text = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const toIso = (value: unknown) => (value instanceof Date ? value.toISOString() : value ? String(value) : null);

export const serializeArticle = (row: any) => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  excerpt: row.excerpt || "",
  bodyHtml: row.body_html || "",
  cover: normalizeMediaRef(row.cover),
  gallery: (Array.isArray(row.gallery) ? row.gallery : []).map(normalizeMediaRef).filter(Boolean),
  categorySlug: row.category_slug || null,
  authorLabel: row.author_label || "",
  status: row.status as ArticleStatus,
  publishAt: toIso(row.publish_at),
  publishedAt: toIso(row.published_at),
  featured: Boolean(row.featured),
  seo: normalizePageSeo(row.seo),
  relatedEventId: row.related_event_id || null,
  version: Number(row.version || 1),
  updatedAt: toIso(row.updated_at),
});

const requireSite = async (organizationId: string) => {
  const site = await findSiteRow(organizationId);
  if (!site) throw new Error("Il sito non e ancora stato creato");
  return site;
};

const findArticle = async (organizationId: string, articleId: string) => {
  const row = await (prisma as any).websiteArticle.findFirst({ where: { id: String(articleId || ""), organization_id: organizationId } });
  if (!row) throw new Error("Accesso negato: l'articolo non appartiene al sito del club attivo, o non esiste");
  return row;
};

export const listArticles = async (
  scope: WebsiteScope | null | undefined,
  filter: { status?: unknown; q?: unknown; category?: unknown } = {},
) => {
  const grant = await requireWebsiteAccess(scope, "website.read", "read");
  const site = await findSiteRow(grant.organizationId);
  if (!site) return [];
  const query = text(filter.q, 80);
  const rows = await (prisma as any).websiteArticle.findMany({
    where: {
      site_id: site.id,
      organization_id: grant.organizationId,
      ...((ARTICLE_STATUSES as readonly string[]).includes(String(filter.status)) ? { status: filter.status } : {}),
      ...(filter.category ? { category_slug: String(filter.category) } : {}),
      ...(query ? { title: { contains: query, mode: "insensitive" } } : {}),
    },
    orderBy: [{ updated_at: "desc" }],
    take: 200,
  });
  return rows.map(serializeArticle);
};

export const getArticle = async (scope: WebsiteScope | null | undefined, articleId: string) => {
  const grant = await requireWebsiteAccess(scope, "website.read", "read");
  return serializeArticle(await findArticle(grant.organizationId, articleId));
};

type ArticleFields = {
  title?: unknown;
  slug?: unknown;
  excerpt?: unknown;
  bodyHtml?: unknown;
  cover?: unknown;
  gallery?: unknown;
  categorySlug?: unknown;
  authorLabel?: unknown;
  featured?: unknown;
  seo?: unknown;
  relatedEventId?: unknown;
};

/** I campi ripuliti. La categoria deve esistere fra quelle del sito. */
const cleanFields = (input: ArticleFields, categories: string[]) => {
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) {
    const title = text(input.title, 200);
    if (!title) throw new Error("Il titolo non puo essere vuoto");
    data.title = title;
  }
  if (input.bodyHtml !== undefined) data.body_html = sanitizeWebsiteRichHtml(input.bodyHtml);
  if (input.excerpt !== undefined) data.excerpt = text(input.excerpt, 400);
  if (input.cover !== undefined) data.cover = normalizeMediaRef(input.cover);
  if (input.gallery !== undefined) {
    data.gallery = (Array.isArray(input.gallery) ? input.gallery : []).map(normalizeMediaRef).filter(Boolean).slice(0, 60);
  }
  if (input.categorySlug !== undefined) {
    const slug = text(input.categorySlug, 60);
    data.category_slug = slug && categories.includes(slug) ? slug : null;
  }
  if (input.authorLabel !== undefined) data.author_label = text(input.authorLabel, 80);
  if (input.featured !== undefined) data.featured = Boolean(input.featured);
  if (input.seo !== undefined) data.seo = normalizePageSeo(input.seo);
  if (input.relatedEventId !== undefined) {
    const id = text(input.relatedEventId, 64);
    data.related_event_id = /^[0-9a-f-]{36}$/i.test(id) ? id : null;
  }
  return data;
};

export const createArticle = async (scope: WebsiteScope | null | undefined, input: ArticleFields) => {
  const grant = await requireWebsiteAccess(scope, "website.blog.manage", "write");
  const site = await requireSite(grant.organizationId);
  const categories = normalizeSettings(site.settings).articleCategories.map((category) => category.slug);
  const data = cleanFields({ ...input, title: input.title ?? "Nuovo articolo" }, categories);
  const existing = await (prisma as any).websiteArticle.findMany({ where: { site_id: site.id }, select: { slug: true } });
  const requested = input.slug ? validatePageSlug(input.slug) : null;
  if (requested && !requested.ok) throw new Error(requested.message);
  const slug = requested?.ok ? requested.slug : uniqueSlug(String(data.title), existing.map((row: any) => row.slug));
  if (existing.some((row: any) => row.slug === slug)) throw new Error(`L'indirizzo «${slug}» e gia usato da un altro articolo`);

  if (data.related_event_id) await assertEventInClub(grant.organizationId, String(data.related_event_id));
  const body = String(data.body_html || "");
  const row = await (prisma as any).websiteArticle.create({
    data: {
      site_id: site.id,
      organization_id: grant.organizationId,
      slug,
      status: "draft",
      seo: data.seo || normalizePageSeo({}),
      excerpt: data.excerpt ?? richHtmlToText(body).slice(0, 240),
      gallery: data.gallery ?? [],
      created_by: grant.scope.userId,
      updated_by: grant.scope.userId,
      ...data,
    },
  });
  return serializeArticle(row);
};

const assertEventInClub = async (organizationId: string, eventId: string) => {
  const event = await (prisma as any).clubEvent.findFirst({ where: { id: eventId, organization_id: organizationId }, select: { id: true } });
  if (!event) throw new Error("La gara collegata non appartiene al club");
};

export const updateArticle = async (
  scope: WebsiteScope | null | undefined,
  articleId: string,
  input: ArticleFields & { expectedVersion: unknown },
) => {
  const grant = await requireWebsiteAccess(scope, "website.blog.manage", "write");
  const expectedVersion = requireExpectedVersion(input.expectedVersion);
  const row = await findArticle(grant.organizationId, articleId);
  const site = await requireSite(grant.organizationId);
  const categories = normalizeSettings(site.settings).articleCategories.map((category) => category.slug);
  const data = cleanFields(input, categories);
  if (input.slug !== undefined) {
    const check = validatePageSlug(input.slug);
    if (!check.ok) throw new Error(check.message);
    if (check.slug !== row.slug) {
      const clash = await (prisma as any).websiteArticle.findFirst({
        where: { site_id: row.site_id, slug: check.slug, NOT: { id: row.id } },
        select: { id: true },
      });
      if (clash) throw new Error(`L'indirizzo «${check.slug}» e gia usato da un altro articolo`);
      data.slug = check.slug;
    }
  }
  if (data.related_event_id) await assertEventInClub(grant.organizationId, String(data.related_event_id));
  const result = await (prisma as any).websiteArticle.updateMany({
    where: { id: row.id, organization_id: grant.organizationId, version: expectedVersion },
    data: { ...data, version: { increment: 1 }, updated_by: grant.scope.userId },
  });
  if (!result.count) {
    const fresh = await findArticle(grant.organizationId, articleId);
    throw new WebsiteConflictError("Qualcun altro ha modificato l'articolo mentre lo scrivevi", Number(fresh.version));
  }
  if (row.status === "published" || row.status === "scheduled") invalidateWebsiteData(grant.organizationId);
  return serializeArticle(await findArticle(grant.organizationId, articleId));
};

/**
 * Cambia lo stato di un articolo: pubblica adesso, programma, riporta in
 * bozza, archivia. La data di pubblicazione resta quella della prima
 * pubblicazione: ripubblicare dopo una correzione non sposta l'articolo in
 * cima all'elenco.
 */
export const setArticleStatus = async (
  scope: WebsiteScope | null | undefined,
  articleId: string,
  input: { status: unknown; publishAt?: unknown; expectedVersion: unknown },
  request?: Request,
) => {
  const grant = await requireWebsiteAccess(scope, "website.blog.manage", "write");
  const expectedVersion = requireExpectedVersion(input.expectedVersion);
  const row = await findArticle(grant.organizationId, articleId);
  const status = String(input.status) as ArticleStatus;
  if (!(ARTICLE_STATUSES as readonly string[]).includes(status)) throw new Error("Stato non riconosciuto");
  const data: Record<string, unknown> = { status, version: { increment: 1 }, updated_by: grant.scope.userId };
  if (status === "published") data.published_at = row.published_at || new Date();
  if (status === "scheduled") {
    const at = new Date(String(input.publishAt || ""));
    if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) throw new Error("Indica una data di pubblicazione futura");
    data.publish_at = at;
    data.published_at = at;
  }
  if (status === "published" && !String(row.title || "").trim()) throw new Error("Un articolo senza titolo non si pubblica");
  const result = await (prisma as any).websiteArticle.updateMany({
    where: { id: row.id, organization_id: grant.organizationId, version: expectedVersion },
    data,
  });
  if (!result.count) {
    const fresh = await findArticle(grant.organizationId, articleId);
    throw new WebsiteConflictError("L'articolo e cambiato: ricarica prima di cambiarne lo stato", Number(fresh.version));
  }
  if (status === "published" || status === "scheduled") {
    await auditWebsite(grant, WEBSITE_AUDIT_ACTIONS.articlePublished, row.id, { status, slug: row.slug }, request);
  }
  invalidateWebsiteData(grant.organizationId);
  return serializeArticle(await findArticle(grant.organizationId, articleId));
};

export const deleteArticle = async (scope: WebsiteScope | null | undefined, articleId: string, request?: Request) => {
  const grant = await requireWebsiteAccess(scope, "website.blog.manage", "write");
  const row = await findArticle(grant.organizationId, articleId);
  await (prisma as any).websiteArticle.deleteMany({ where: { id: row.id, organization_id: grant.organizationId } });
  await auditWebsite(grant, WEBSITE_AUDIT_ACTIONS.articleDeleted, row.id, { slug: row.slug, title: row.title }, request);
  invalidateWebsiteData(grant.organizationId);
  return { deleted: true };
};

/** Le categorie delle news, nelle impostazioni del sito. */
export const suggestArticleSlug = (title: unknown) => slugify(title) || "articolo";
