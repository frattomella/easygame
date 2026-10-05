import { prisma } from "../prisma";
import {
  auditWebsite,
  requireExpectedVersion,
  requireWebsiteAccess,
  WebsiteConflictError,
  WEBSITE_AUDIT_ACTIONS,
  type WebsiteScope,
} from "./access";
import { findSiteRow } from "./sites";
import { sanitizeDocumentRichText } from "./document-sanitize";
import { normalizePageDocument, type DocumentIssue } from "@/lib/website/document/validate";
import { emptyPageDocument, type WebsitePageDocument } from "@/lib/website/document/types";
import { reidentifySection } from "@/lib/website/document/operations";
import { normalizePageSeo, pagePathFor, type PageSeo } from "@/lib/website/publishing/snapshot";
import { normalizeNavigation, pruneNavigationForPage } from "@/lib/website/navigation";
import { normalizeFooter } from "@/lib/website/site-config";
import { uniqueSlug, validatePageSlug } from "@/lib/website/slug";
import { isDetailPageKind } from "@/lib/website/templates/pages";
import type { PageKind } from "@/lib/website/registry";

/**
 * **Le pagine in bozza** (ADR-0200 §5, §13).
 *
 * Unico scrittore di `website_pages` e `website_redirects`. Ogni pagina ha la
 * sua versione: due operatori sulla stessa pagina non si sovrascrivono, due
 * operatori su pagine diverse lavorano insieme senza accorgersene.
 *
 * Il documento che si salva e quello che il server ricostruisce: validato dal
 * registry, ripulito, con il testo ricco sanificato. Il client riceve
 * indietro la versione salvata e le avvertenze.
 */

export const PAGE_KINDS: readonly PageKind[] = [
  "home",
  "standard",
  "legal",
  "news_index",
  "article_detail",
  "team_detail",
  "match_detail",
  "player_detail",
  "event_detail",
];

const isPageKind = (value: unknown): value is PageKind => (PAGE_KINDS as readonly unknown[]).includes(value);

export type WebsitePageDto = {
  id: string;
  siteId: string;
  kind: PageKind;
  slug: string;
  path: string;
  title: string;
  seo: PageSeo;
  document: WebsitePageDocument;
  sortOrder: number;
  version: number;
  updatedAt: string | null;
};

const toIso = (value: unknown) => (value instanceof Date ? value.toISOString() : value ? String(value) : null);

export const serializePage = (row: Record<string, any>): WebsitePageDto => ({
  id: row.id,
  siteId: row.site_id,
  kind: isPageKind(row.kind) ? row.kind : "standard",
  slug: row.slug,
  path: row.path,
  title: row.title,
  seo: normalizePageSeo(row.seo),
  document: normalizePageDocument(row.document, isPageKind(row.kind) ? row.kind : "standard").doc,
  sortOrder: Number(row.sort_order || 0),
  version: Number(row.version || 1),
  updatedAt: toIso(row.updated_at),
});

const requireSite = async (organizationId: string) => {
  const site = await findSiteRow(organizationId);
  if (!site) throw new Error("Il sito non e ancora stato creato");
  return site;
};

const findPageRow = async (organizationId: string, pageId: string) => {
  const page = await (prisma as any).websitePage.findFirst({
    where: { id: String(pageId || ""), organization_id: organizationId },
  });
  if (!page) throw new Error("Accesso negato: la pagina non appartiene al sito del club attivo, o non esiste");
  return page;
};

export const getPage = async (scope: WebsiteScope | null | undefined, pageId: string) => {
  const grant = await requireWebsiteAccess(scope, "website.read", "read");
  return serializePage(await findPageRow(grant.organizationId, pageId));
};

export const listPages = async (scope: WebsiteScope | null | undefined) => {
  const grant = await requireWebsiteAccess(scope, "website.read", "read");
  const site = await requireSite(grant.organizationId);
  const rows = await (prisma as any).websitePage.findMany({
    where: { site_id: site.id, organization_id: grant.organizationId },
    orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
  });
  return rows.map(serializePage);
};

/* ------------------------------------------------------------- creazione */

export type CreatePageInput = {
  title: unknown;
  slug?: unknown;
  kind?: unknown;
  duplicateOf?: unknown;
};

export const createPage = async (scope: WebsiteScope | null | undefined, input: CreatePageInput, request?: Request) => {
  const grant = await requireWebsiteAccess(scope, "website.pages.manage", "write");
  const site = await requireSite(grant.organizationId);
  const title = String(input.title ?? "").trim().slice(0, 120);
  if (!title) throw new Error("Dai un titolo alla pagina");

  const existing = await (prisma as any).websitePage.findMany({
    where: { site_id: site.id, organization_id: grant.organizationId },
    select: { slug: true, path: true, kind: true, sort_order: true },
  });

  let kind: PageKind = isPageKind(input.kind) ? input.kind : "standard";
  if (kind === "home") throw new Error("La home esiste gia: ce n'e una sola per sito");
  if (isDetailPageKind(kind) && existing.some((page: any) => page.kind === kind)) {
    throw new Error("Questo modello di pagina di dettaglio esiste gia: modificalo invece di crearne un secondo");
  }

  let document: WebsitePageDocument = emptyPageDocument();
  let seo = normalizePageSeo({});
  if (input.duplicateOf) {
    const source = await findPageRow(grant.organizationId, String(input.duplicateOf));
    const sourceKind: PageKind = isPageKind(source.kind) ? source.kind : "standard";
    kind = sourceKind === "home" || isDetailPageKind(sourceKind) ? "standard" : sourceKind;
    const parsed = normalizePageDocument(source.document, kind).doc;
    document = { ...parsed, sections: parsed.sections.map(reidentifySection) };
    seo = { ...normalizePageSeo(source.seo), canonical: null };
  }

  const requested = input.slug ? validatePageSlug(input.slug) : null;
  if (requested && !requested.ok) throw new Error(requested.message);
  const takenPaths = new Set(existing.map((page: any) => page.path));
  const slug = requested?.ok
    ? requested.slug
    : uniqueSlug(title, existing.map((page: any) => page.slug));
  const path = pagePathFor(kind, slug);
  if (takenPaths.has(path)) throw new Error(`L'indirizzo «${path}» e gia usato da un'altra pagina`);

  const row = await (prisma as any).websitePage.create({
    data: {
      site_id: site.id,
      organization_id: grant.organizationId,
      kind,
      slug,
      path,
      title,
      seo,
      document,
      sort_order: existing.reduce((max: number, page: any) => Math.max(max, Number(page.sort_order || 0)), 0) + 1,
      version: 1,
      created_by: grant.scope.userId,
      updated_by: grant.scope.userId,
    },
  });
  await auditWebsite(grant, WEBSITE_AUDIT_ACTIONS.pageCreated, row.id, { slug, kind }, request);
  return serializePage(row);
};

/* ---------------------------------------------------------- documento */

export type SaveDocumentResult = { page: WebsitePageDto; issues: DocumentIssue[] };

/**
 * Salva il documento di una pagina con la versione letta. Il conflitto porta
 * la versione attuale: l'editor puo ricaricare, confrontare o — per scelta
 * esplicita dell'operatore — riscrivere sopra quella versione.
 */
export const savePageDocument = async (
  scope: WebsiteScope | null | undefined,
  pageId: string,
  input: { expectedVersion: unknown; document: unknown },
): Promise<SaveDocumentResult> => {
  const grant = await requireWebsiteAccess(scope, "website.edit", "write");
  const expectedVersion = requireExpectedVersion(input.expectedVersion);
  const page = await findPageRow(grant.organizationId, pageId);
  const kind: PageKind = isPageKind(page.kind) ? page.kind : "standard";
  const { doc, issues } = normalizePageDocument(input.document, kind);
  const document = sanitizeDocumentRichText(doc);

  const result = await (prisma as any).websitePage.updateMany({
    where: { id: page.id, organization_id: grant.organizationId, version: expectedVersion },
    data: { document, version: { increment: 1 }, updated_by: grant.scope.userId },
  });
  if (!result.count) {
    const fresh = await findPageRow(grant.organizationId, pageId);
    throw new WebsiteConflictError(
      "Qualcun altro ha salvato questa pagina mentre la modificavi",
      Number(fresh.version),
    );
  }
  return { page: serializePage(await findPageRow(grant.organizationId, pageId)), issues };
};

/* ------------------------------------------------- titolo, slug, SEO */

export type PageMetaPatch = {
  expectedVersion: unknown;
  title?: unknown;
  slug?: unknown;
  seo?: unknown;
};

/**
 * Titolo, slug e SEO. Rinominare lo slug di una pagina gia pubblicata lascia
 * un reindirizzamento dal vecchio indirizzo: un link condiviso ieri non deve
 * diventare un 404 oggi.
 */
export const updatePageMeta = async (scope: WebsiteScope | null | undefined, pageId: string, patch: PageMetaPatch, request?: Request) => {
  const needsSlug = patch.slug !== undefined;
  const needsSeo = patch.seo !== undefined;
  const grant = await requireWebsiteAccess(scope, needsSlug || patch.title !== undefined ? "website.pages.manage" : "website.seo.manage", "write");
  if (needsSeo) await requireWebsiteAccess(scope, "website.seo.manage", "write");
  const expectedVersion = requireExpectedVersion(patch.expectedVersion);
  const page = await findPageRow(grant.organizationId, pageId);
  const kind: PageKind = isPageKind(page.kind) ? page.kind : "standard";

  const data: Record<string, unknown> = { version: { increment: 1 }, updated_by: grant.scope.userId };
  if (patch.title !== undefined) {
    const title = String(patch.title ?? "").trim().slice(0, 120);
    if (!title) throw new Error("Il titolo non puo essere vuoto");
    data.title = title;
  }
  if (needsSeo) data.seo = normalizePageSeo(patch.seo);

  let redirect: { from: string; to: string } | null = null;
  if (needsSlug) {
    if (kind === "home") throw new Error("La home ha sempre l'indirizzo «/»");
    const check = validatePageSlug(patch.slug);
    if (!check.ok) throw new Error(check.message);
    if (check.slug !== page.slug) {
      const path = pagePathFor(kind, check.slug);
      const clash = await (prisma as any).websitePage.findFirst({
        where: { site_id: page.site_id, organization_id: grant.organizationId, path, NOT: { id: page.id } },
        select: { id: true },
      });
      if (clash) throw new Error(`L'indirizzo «${path}» e gia usato da un'altra pagina`);
      data.slug = check.slug;
      data.path = path;
      redirect = isDetailPageKind(kind)
        ? { from: `/${page.slug}`, to: `/${check.slug}` }
        : { from: page.path, to: path };
    }
  }

  const result = await (prisma as any).websitePage.updateMany({
    where: { id: page.id, organization_id: grant.organizationId, version: expectedVersion },
    data,
  });
  if (!result.count) {
    const fresh = await findPageRow(grant.organizationId, pageId);
    throw new WebsiteConflictError("Qualcun altro ha modificato questa pagina mentre lavoravi", Number(fresh.version));
  }

  if (redirect) {
    /* Il vecchio percorso punta al nuovo; un redirect che puntava al vecchio si aggiorna. */
    await (prisma as any).websiteRedirect.deleteMany({
      where: { site_id: page.site_id, organization_id: grant.organizationId, from_path: redirect.to },
    });
    await (prisma as any).websiteRedirect.upsert({
      where: { site_id_from_path: { site_id: page.site_id, from_path: redirect.from } },
      update: { to_path: redirect.to },
      create: { site_id: page.site_id, organization_id: grant.organizationId, from_path: redirect.from, to_path: redirect.to },
    });
    await (prisma as any).websiteRedirect.updateMany({
      where: { site_id: page.site_id, organization_id: grant.organizationId, to_path: redirect.from },
      data: { to_path: redirect.to },
    });
    await auditWebsite(grant, WEBSITE_AUDIT_ACTIONS.pageSlugChanged, page.id, redirect, request);
  }

  return serializePage(await findPageRow(grant.organizationId, pageId));
};

/* -------------------------------------------------------- cancellazione */

/**
 * Elimina una pagina. La home no: un sito senza home non ha un indirizzo da
 * cui partire. Le voci di menu che puntavano alla pagina spariscono con lei,
 * e il riferimento dal piede (privacy, cookie) torna vuoto.
 */
export const deletePage = async (scope: WebsiteScope | null | undefined, pageId: string, request?: Request) => {
  const grant = await requireWebsiteAccess(scope, "website.pages.manage", "write");
  const page = await findPageRow(grant.organizationId, pageId);
  if (page.kind === "home") throw new Error("La home non si elimina: puoi svuotarla o cambiarne il contenuto");

  await (prisma as any).$transaction(async (tx: any) => {
    await tx.websitePage.deleteMany({ where: { id: page.id, organization_id: grant.organizationId } });
    const site = await tx.websiteSite.findFirst({ where: { id: page.site_id, organization_id: grant.organizationId } });
    if (site) {
      const footer = normalizeFooter(site.footer);
      await tx.websiteSite.update({
        where: { id: site.id },
        data: {
          navigation: pruneNavigationForPage(normalizeNavigation(site.navigation), page.id),
          footer: {
            ...footer,
            privacyPageId: footer.privacyPageId === page.id ? null : footer.privacyPageId,
            cookiePageId: footer.cookiePageId === page.id ? null : footer.cookiePageId,
          },
          draft_version: { increment: 1 },
        },
      });
    }
  });
  await auditWebsite(grant, WEBSITE_AUDIT_ACTIONS.pageDeleted, page.id, { slug: page.slug, title: page.title }, request);
  return { deleted: true };
};

/** L'ordine delle pagine nell'elenco dell'editor. Non tocca il menu, che e suo. */
export const reorderPages = async (scope: WebsiteScope | null | undefined, pageIds: unknown) => {
  const grant = await requireWebsiteAccess(scope, "website.pages.manage", "write");
  const site = await requireSite(grant.organizationId);
  const ids = (Array.isArray(pageIds) ? pageIds : []).map((id) => String(id));
  const rows = await (prisma as any).websitePage.findMany({
    where: { site_id: site.id, organization_id: grant.organizationId },
    select: { id: true },
  });
  const known = new Set(rows.map((row: any) => row.id));
  const ordered = ids.filter((id) => known.has(id));
  await (prisma as any).$transaction(
    ordered.map((id, index) =>
      (prisma as any).websitePage.updateMany({
        where: { id, organization_id: grant.organizationId },
        data: { sort_order: index },
      }),
    ),
  );
  return { ordered: ordered.length };
};
