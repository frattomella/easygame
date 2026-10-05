import { prisma } from "../prisma";
import {
  auditWebsite,
  requireExpectedVersion,
  requireWebsiteAccess,
  WebsiteConflictError,
  WEBSITE_AUDIT_ACTIONS,
  type WebsiteScope,
} from "./access";
import { sanitizeDocumentRichText } from "./document-sanitize";
import { invalidateWebsiteSite } from "./cache";
import { normalizeTheme, type SiteTheme } from "@/lib/website/theme/theme";
import {
  normalizeFooter,
  normalizeHeader,
  normalizeSettings,
  normalizeSiteSeo,
  type SiteFooter,
  type SiteHeader,
  type SiteSeo,
  type SiteSettings,
} from "@/lib/website/site-config";
import { normalizeNavigation, type NavItem, type SiteNavigation } from "@/lib/website/navigation";
import { buildTemplate, isTemplateKey, type NavSeed, type TemplateKey } from "@/lib/website/templates";
import { rewriteTemplatePageRefs } from "@/lib/website/templates/pages";
import { normalizePageDocument } from "@/lib/website/document/validate";
import { normalizePageSeo, pagePathFor } from "@/lib/website/publishing/snapshot";
import { newWebsiteId } from "@/lib/website/ids";
import { listWebsitePermissions } from "@/lib/website/permissions";
import type { PageKind } from "@/lib/website/registry";

/**
 * **Il sito di un club: creazione e configurazione della bozza** (ADR-0200 §3, §5).
 *
 * Unico scrittore di `website_sites`. La configurazione (tema, intestazione,
 * piede, menu, SEO, impostazioni) e una bozza con una versione: ogni scrittura
 * dichiara la versione che ha letto, e se nel frattempo un altro operatore ha
 * salvato la scrittura fallisce con un conflitto invece di sovrascrivere.
 *
 * Ogni parte ha il suo permesso: chi puo toccare il menu non tocca per questo
 * il tema, e il tema non e la SEO.
 */

export type SiteDraft = {
  id: string;
  organizationId: string;
  status: "draft" | "published" | "offline";
  templateKey: string;
  templateVersion: number;
  theme: SiteTheme;
  header: SiteHeader;
  footer: SiteFooter;
  navigation: SiteNavigation;
  seo: SiteSeo;
  settings: SiteSettings;
  onboarding: Record<string, boolean>;
  draftVersion: number;
  currentRevisionId: string | null;
  publishedAt: string | null;
  updatedAt: string;
};

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};

const toIso = (value: unknown) => (value instanceof Date ? value.toISOString() : value ? String(value) : null);

export const serializeSiteDraft = (row: Record<string, any>): SiteDraft => ({
  id: row.id,
  organizationId: row.organization_id,
  status: row.status === "published" || row.status === "offline" ? row.status : "draft",
  templateKey: row.template_key,
  templateVersion: Number(row.template_version || 1),
  theme: normalizeTheme(row.theme),
  header: normalizeHeader(row.header),
  footer: normalizeFooter(row.footer),
  navigation: normalizeNavigation(row.navigation),
  seo: normalizeSiteSeo(row.seo),
  settings: normalizeSettings(row.settings),
  onboarding: Object.fromEntries(Object.entries(asRecord(row.onboarding)).filter(([, v]) => typeof v === "boolean")) as Record<string, boolean>,
  draftVersion: Number(row.draft_version || 1),
  currentRevisionId: row.current_revision_id || null,
  publishedAt: toIso(row.published_at),
  updatedAt: toIso(row.updated_at) || new Date().toISOString(),
});

export const findSiteRow = (organizationId: string) =>
  (prisma as any).websiteSite.findUnique({ where: { organization_id: organizationId } });

/** Il sito del club attivo, o lo stato «non ancora creato». */
export const getWebsiteOverview = async (scope: WebsiteScope | null | undefined) => {
  const grant = await requireWebsiteAccess(scope, "website.read", "read");
  const row = await findSiteRow(grant.organizationId);
  const permissions = listWebsitePermissions(grant.scope.activeRole);
  /* Il logo dell'anagrafica e il ripiego del sito: la panoramica deve sapere se c'e. */
  const club = await (prisma as any).club.findUnique({ where: { id: grant.organizationId }, select: { logo_url: true } });
  const clubHasLogo = Boolean(club?.logo_url);
  if (!row) {
    return { access: grant.access, site: null, permissions, pages: [], domains: [], publication: null, clubHasLogo };
  }
  const [pages, domains, revision] = await Promise.all([
    (prisma as any).websitePage.findMany({
      where: { site_id: row.id, organization_id: grant.organizationId },
      select: { id: true, kind: true, slug: true, path: true, title: true, sort_order: true, version: true, updated_at: true },
      orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
    }),
    (prisma as any).websiteDomain.findMany({
      where: { site_id: row.id, organization_id: grant.organizationId },
      select: { id: true, hostname: true, role: true, state: true, tls_state: true },
      orderBy: { created_at: "asc" },
    }),
    row.current_revision_id
      ? (prisma as any).websiteRevision.findUnique({
          where: { id: row.current_revision_id },
          select: { id: true, revision_number: true, published_at: true, origin: true },
        })
      : null,
  ]);
  return {
    access: grant.access,
    site: serializeSiteDraft(row),
    permissions,
    clubHasLogo,
    pages: pages.map((page: any) => ({
      id: page.id,
      kind: page.kind,
      slug: page.slug,
      path: page.path,
      title: page.title,
      sortOrder: page.sort_order,
      version: page.version,
      updatedAt: toIso(page.updated_at),
    })),
    domains: domains.map((domain: any) => ({
      id: domain.id,
      hostname: domain.hostname,
      role: domain.role,
      state: domain.state,
      tlsState: domain.tls_state,
    })),
    publication: revision
      ? { revisionId: revision.id, revisionNumber: revision.revision_number, publishedAt: toIso(revision.published_at), origin: revision.origin }
      : null,
  };
};

/* ---------------------------------------------------------------- creazione */

const navFromSeeds = (seeds: NavSeed[], ids: Record<string, string>): NavItem[] =>
  seeds
    .filter((seed) => ids[seed.pageKey])
    .map((seed) => ({
      id: newWebsiteId(),
      label: seed.label,
      kind: "page" as const,
      link: { kind: "page" as const, pageId: ids[seed.pageKey] },
      children: navFromSeeds(seed.children || [], ids),
    }));

export type CreateWebsiteInput = {
  templateKey: unknown;
  displayName?: unknown;
  primaryColor?: unknown;
  secondaryColor?: unknown;
};

/**
 * Crea il sito del club da un template: tema, menu, intestazione, piede e
 * pagine diventano righe normali, modificabili. Un club ha un sito solo: una
 * seconda creazione risponde con un conflitto.
 */
export const createWebsite = async (scope: WebsiteScope | null | undefined, input: CreateWebsiteInput, request?: Request) => {
  const grant = await requireWebsiteAccess(scope, "website.settings.manage", "write");
  const templateKey: TemplateKey = isTemplateKey(input.templateKey) ? input.templateKey : "club-modern";
  const seed = buildTemplate(templateKey);

  const existing = await findSiteRow(grant.organizationId);
  if (existing) throw new WebsiteConflictError("Il sito della societa esiste gia", Number(existing.draft_version));

  const theme = normalizeTheme(
    {
      ...seed.theme,
      colors: {
        ...seed.theme.colors,
        ...(typeof input.primaryColor === "string" ? { primary: input.primaryColor } : {}),
        ...(typeof input.secondaryColor === "string" ? { secondary: input.secondaryColor } : {}),
      },
    },
    seed.theme,
  );

  const siteId = newWebsiteId();
  const pageIds: Record<string, string> = {};
  for (const page of seed.pages) pageIds[page.key] = newWebsiteId();

  const pages = seed.pages.map((page, index) => {
    const document = rewriteTemplatePageRefs(page.document, pageIds);
    const normalized = sanitizeDocumentRichText(normalizePageDocument(document, page.kind).doc);
    return {
      id: pageIds[page.key],
      site_id: siteId,
      organization_id: grant.organizationId,
      kind: page.kind,
      slug: page.slug,
      path: pagePathFor(page.kind, page.slug),
      title: page.title,
      seo: normalizePageSeo({ description: page.seoDescription || "" }),
      document: normalized,
      sort_order: index,
      /* Esplicita: e la versione che l'editor mandera al primo salvataggio. */
      version: 1,
      created_by: grant.scope.userId,
      updated_by: grant.scope.userId,
    };
  });

  const navigation = normalizeNavigation({
    header: navFromSeeds(seed.navigation.header, pageIds),
    footer: navFromSeeds(seed.navigation.footer, pageIds),
  });
  const header = normalizeHeader({
    ...seed.header,
    cta:
      seed.headerCtaPageKey && pageIds[seed.headerCtaPageKey]
        ? { label: seed.headerCtaLabel, link: { kind: "page", pageId: pageIds[seed.headerCtaPageKey] } }
        : null,
  });
  const footer = normalizeFooter({ ...seed.footer, privacyPageId: pageIds.privacy || null, cookiePageId: pageIds.cookie || null });
  const settings = normalizeSettings({
    identity: { displayName: typeof input.displayName === "string" ? input.displayName : "" },
    articleCategories: [
      { slug: "prima-squadra", label: "Prima squadra" },
      { slug: "giovanili", label: "Settore giovanile" },
      { slug: "societa", label: "Societa" },
    ],
  });

  await (prisma as any).$transaction(async (tx: any) => {
    await tx.websiteSite.create({
      data: {
        id: siteId,
        organization_id: grant.organizationId,
        status: "draft",
        template_key: seed.key,
        template_version: seed.version,
        theme,
        header,
        footer,
        navigation,
        seo: normalizeSiteSeo(seed.seo),
        settings,
        onboarding: { template: true },
        draft_version: 1,
        created_by: grant.scope.userId,
      },
    });
    await tx.websitePage.createMany({ data: pages });
  });

  await auditWebsite(grant, WEBSITE_AUDIT_ACTIONS.siteCreated, siteId, { templateKey: seed.key, pages: pages.length }, request);
  return getWebsiteOverview(scope);
};

/* ----------------------------------------------------- configurazione */

export type SiteConfigPatch = {
  expectedVersion: unknown;
  theme?: unknown;
  header?: unknown;
  footer?: unknown;
  navigation?: unknown;
  seo?: unknown;
  settings?: unknown;
  onboarding?: unknown;
};

/** Il permesso di ciascuna parte della configurazione. */
const PART_PERMISSIONS = {
  theme: "website.theme.manage",
  header: "website.theme.manage",
  footer: "website.theme.manage",
  navigation: "website.navigation.manage",
  seo: "website.seo.manage",
  settings: "website.settings.manage",
  onboarding: "website.read",
} as const;

/**
 * Aggiorna una o piu parti della configurazione con la versione letta.
 * `updateMany` con la versione nel `where` e il controllo ottimistico: zero
 * righe aggiornate vuol dire che qualcuno ha salvato prima.
 */
export const updateSiteConfig = async (scope: WebsiteScope | null | undefined, patch: SiteConfigPatch, request?: Request) => {
  const parts = (Object.keys(PART_PERMISSIONS) as Array<keyof typeof PART_PERMISSIONS>).filter(
    (part) => patch[part] !== undefined,
  );
  if (!parts.length) throw new Error("Nessuna modifica da salvare");

  const grant = await requireWebsiteAccess(scope, PART_PERMISSIONS[parts[0]], parts.every((p) => p === "onboarding") ? "read" : "write");
  for (const part of parts.slice(1)) {
    await requireWebsiteAccess(scope, PART_PERMISSIONS[part], part === "onboarding" ? "read" : "write");
  }
  const expectedVersion = requireExpectedVersion(patch.expectedVersion);

  const row = await findSiteRow(grant.organizationId);
  if (!row) throw new Error("Il sito non e ancora stato creato");

  const data: Record<string, unknown> = { draft_version: { increment: 1 } };
  if (patch.theme !== undefined) data.theme = normalizeTheme(patch.theme, normalizeTheme(row.theme));
  if (patch.header !== undefined) data.header = normalizeHeader(patch.header);
  if (patch.footer !== undefined) data.footer = normalizeFooter(patch.footer);
  if (patch.navigation !== undefined) data.navigation = normalizeNavigation(patch.navigation);
  if (patch.seo !== undefined) data.seo = normalizeSiteSeo(patch.seo);
  if (patch.settings !== undefined) data.settings = normalizeSettings(patch.settings);
  if (patch.onboarding !== undefined) {
    data.onboarding = { ...asRecord(row.onboarding), ...Object.fromEntries(Object.entries(asRecord(patch.onboarding)).filter(([, v]) => typeof v === "boolean")) };
  }

  const result = await (prisma as any).websiteSite.updateMany({
    where: { id: row.id, organization_id: grant.organizationId, draft_version: expectedVersion },
    data,
  });
  if (!result.count) {
    const fresh = await findSiteRow(grant.organizationId);
    throw new WebsiteConflictError(
      "Qualcun altro ha modificato le impostazioni del sito mentre lavoravi: ricarica per vedere la versione attuale",
      fresh ? Number(fresh.draft_version) : null,
    );
  }

  if (patch.theme !== undefined) {
    await auditWebsite(grant, WEBSITE_AUDIT_ACTIONS.themeChanged, row.id, { fonts: (data.theme as SiteTheme).fonts }, request);
  }
  if (patch.settings !== undefined || patch.seo !== undefined) {
    await auditWebsite(grant, WEBSITE_AUDIT_ACTIONS.settingsChanged, row.id, { parts }, request);
  }

  const updated = await findSiteRow(grant.organizationId);
  return serializeSiteDraft(updated);
};

/**
 * Applica lo stile di un altro template (tema, intestazione, piede) senza
 * toccare pagine e menu: «cambia stile» non deve mai voler dire «perdi i
 * contenuti».
 */
export const applyTemplateStyle = async (
  scope: WebsiteScope | null | undefined,
  input: { templateKey: unknown; expectedVersion: unknown },
  request?: Request,
) => {
  if (!isTemplateKey(input.templateKey)) throw new Error("Template non riconosciuto");
  const seed = buildTemplate(input.templateKey);
  const grant = await requireWebsiteAccess(scope, "website.theme.manage", "write");
  const row = await findSiteRow(grant.organizationId);
  if (!row) throw new Error("Il sito non e ancora stato creato");
  const currentHeader = normalizeHeader(row.header);
  return updateSiteConfig(
    scope,
    {
      expectedVersion: input.expectedVersion,
      theme: seed.theme,
      header: { ...seed.header, cta: currentHeader.cta },
      footer: { ...seed.footer, privacyPageId: normalizeFooter(row.footer).privacyPageId, cookiePageId: normalizeFooter(row.footer).cookiePageId },
    },
    request,
  ).finally(() => invalidateWebsiteSite(row.id));
};

export type PageKindAllowed = PageKind;
