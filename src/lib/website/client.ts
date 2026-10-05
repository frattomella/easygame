import { apiRequest, type ApiEnvelope } from "@/lib/api/client";
import type { WebsiteAccess } from "./access-state";
import type { WebsitePermission } from "./permissions";
import type { SiteTheme } from "./theme/theme";
import type { SiteFooter, SiteHeader, SiteSeo, SiteSettings } from "./site-config";
import type { SiteNavigation } from "./navigation";
import type { WebsitePageDocument } from "./document/types";
import type { PageSeo } from "./publishing/snapshot";
import type { PageKind } from "./registry";
import type { DnsRecord, DomainState, TlsState } from "./domains/model";
import type { PublicationSettings } from "./people/policy";
import type { SponsorShowcase } from "@/lib/sponsors/model";
import type { MediaRef } from "./document/types";
import { WEBSITE_MEDIA_ENDPOINT } from "@/lib/rich-text/sanitize";

/**
 * **Il client del modulo Website** per le schermate del gestionale.
 *
 * Ogni chiamata passa da `apiRequest` (CLAUDE.md §2: mai un `fetch` diretto a
 * `/api` da un componente), che aggiunge club attivo, ruolo e stagione. Le
 * funzioni restituiscono l'involucro `{ data, error }`: un conflitto di
 * versione arriva con `error.code === "CONFLICT"` e `error.currentVersion`.
 */

export type SiteDraftDto = {
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

export type PageSummaryDto = {
  id: string;
  kind: PageKind;
  slug: string;
  path: string;
  title: string;
  sortOrder: number;
  version: number;
  updatedAt: string | null;
};

export type PageDto = PageSummaryDto & { siteId: string; seo: PageSeo; document: WebsitePageDocument };

export type WebsiteOverviewDto = {
  access: WebsiteAccess;
  site: SiteDraftDto | null;
  permissions: WebsitePermission[];
  pages: PageSummaryDto[];
  domains: Array<{ id: string; hostname: string; role: "primary" | "redirect"; state: DomainState; tlsState: TlsState }>;
  publication: { revisionId: string; revisionNumber: number; publishedAt: string; origin: string } | null;
  /** Il club ha un logo in anagrafica: il sito lo usa se non ne ha uno suo. */
  clubHasLogo: boolean;
};

export type TemplateSummaryDto = {
  key: string;
  label: string;
  description: string;
  preview: { colors: [string, string, string]; headingFont: string };
  pageCount: number;
};

export type PublishIssueDto = { level: "error" | "warning"; message: string; pageId?: string; pageTitle?: string; sectionId?: string; blockId?: string };
export type PublishStatusDto = { ready: boolean; issues: PublishIssueDto[]; hasUnpublishedChanges: boolean; primaryDomain: string | null };

export type RevisionDto = {
  id: string;
  revisionNumber: number;
  origin: "publish" | "rollback";
  sourceRevisionId: string | null;
  note: string | null;
  publishedBy: string | null;
  publishedAt: string;
  pageCount: number | null;
};

export type DomainDto = {
  id: string;
  hostname: string;
  role: "primary" | "redirect";
  state: DomainState;
  tlsState: TlsState;
  provider: string;
  records: DnsRecord[];
  lastError: string | null;
  lastCheckedAt: string | null;
  verifiedAt: string | null;
  activatedAt: string | null;
  attemptCount: number;
  companion: string | null;
};

export type DomainsDto = {
  provider: { key: string | null; label: string; configured: boolean; routing: { cname: string; ipv4: readonly string[] } | null };
  domains: DomainDto[];
};

export type MediaItemDto = {
  id: string;
  url: string;
  /** Per le foto di persona la rotta autenticata: la pubblica le nasconde finche non sono pubblicate. */
  previewUrl: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  category: string;
  alt: string;
  title: string;
  focalX: number;
  focalY: number;
  width: number | null;
  height: number | null;
  createdAt: string;
};

export type PublicationCandidateDto = {
  id: string;
  name: string;
  categories: string[];
  status: string;
  isMinor: boolean;
  imageConsent: "accepted" | "rejected" | "missing";
  settings: PublicationSettings;
  role?: string;
  preview: { displayName: string; photoMediaId: string | null; jerseyNumber: string; role: string; birthYear: number | null; heightCm: number | null; bio: string } | null;
  updatedAt: string | null;
};

export type ArticleDto = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  bodyHtml: string;
  cover: MediaRef | null;
  gallery: MediaRef[];
  categorySlug: string | null;
  authorLabel: string;
  status: "draft" | "scheduled" | "published" | "archived";
  publishAt: string | null;
  publishedAt: string | null;
  featured: boolean;
  seo: PageSeo;
  relatedEventId: string | null;
  version: number;
  updatedAt: string | null;
};

export type InquiryDto = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  topic: string | null;
  message: string;
  consentText: string;
  sourcePath: string | null;
  status: "new" | "handled" | "archived";
  handledAt: string | null;
  createdAt: string;
};

export type EditorOptionsDto = {
  seasons: Array<{ id: string; label: string; active: boolean }>;
  teams: Array<{ id: string; name: string; slug: string; seasonIds: string[] }>;
  categories: Array<{ id: string; name: string }>;
  competitions: Array<{ id: string; name: string; seasonId: string | null }>;
  sponsorTiers: Array<{ key: string; label: string; order: number }>;
  sponsorCount: number;
  articleCategories: Array<{ slug: string; label: string }>;
  forms: Array<{ slug: string; title: string }>;
  people: Array<{ id: string; kind: string; label: string }>;
  sport: { key: string; label: string; periodLabel: string; stats: Array<{ key: string; label: string }> };
  formsOrigin: string;
};

export type SponsorShowcaseDto = {
  tiers: Array<{ key: string; label: string; order: number }>;
  sponsors: Array<{ id: string; name: string; showcase: SponsorShowcase; hasLegacyLogo: boolean }>;
};

const BASE = "/api/v1/website";
/* `apiRequest` serializza da solo: qui si passa l oggetto, mai una stringa. */
const json = (method: string, body?: unknown) => ({ method, body });

export const websiteApi = {
  overview: () => apiRequest<WebsiteOverviewDto>(BASE),
  create: (input: { templateKey: string; displayName?: string; primaryColor?: string; secondaryColor?: string }) =>
    apiRequest<WebsiteOverviewDto>(BASE, json("POST", input)),
  templates: () => apiRequest<TemplateSummaryDto[]>(`${BASE}/templates`),
  options: () => apiRequest<EditorOptionsDto>(`${BASE}/options`),
  updateConfig: (patch: Partial<Pick<SiteDraftDto, "theme" | "header" | "footer" | "navigation" | "seo" | "settings" | "onboarding">> & { expectedVersion: number }) =>
    apiRequest<SiteDraftDto>(`${BASE}/config`, json("PATCH", patch)),
  applyTemplateStyle: (templateKey: string, expectedVersion: number) =>
    apiRequest<SiteDraftDto>(`${BASE}/template-style`, json("POST", { templateKey, expectedVersion })),

  pages: () => apiRequest<PageDto[]>(`${BASE}/pages`),
  page: (id: string) => apiRequest<PageDto>(`${BASE}/pages/${encodeURIComponent(id)}`),
  createPage: (input: { title: string; slug?: string; kind?: PageKind; duplicateOf?: string }) => apiRequest<PageDto>(`${BASE}/pages`, json("POST", input)),
  updatePageMeta: (id: string, patch: { expectedVersion: number; title?: string; slug?: string; seo?: PageSeo }) =>
    apiRequest<PageDto>(`${BASE}/pages/${encodeURIComponent(id)}`, json("PATCH", patch)),
  savePageDocument: (id: string, expectedVersion: number, document: WebsitePageDocument) =>
    apiRequest<{ page: PageDto; issues: PublishIssueDto[] }>(`${BASE}/pages/${encodeURIComponent(id)}/document`, json("PUT", { expectedVersion, document })),
  deletePage: (id: string) => apiRequest<{ deleted: boolean }>(`${BASE}/pages/${encodeURIComponent(id)}`, { method: "DELETE" }),
  reorderPages: (pageIds: string[]) => apiRequest<{ ordered: number }>(`${BASE}/pages/order`, json("PUT", { pageIds })),

  publishStatus: () => apiRequest<PublishStatusDto>(`${BASE}/publish`),
  publish: (idempotencyKey: string, note?: string) =>
    apiRequest<{ revision: RevisionDto; reused: boolean; issues: PublishIssueDto[] }>(`${BASE}/publish`, json("POST", { idempotencyKey, note })),
  unpublish: () => apiRequest<{ status: "offline" }>(`${BASE}/unpublish`, { method: "POST" }),
  revisions: () => apiRequest<{ currentRevisionId: string | null; revisions: RevisionDto[] }>(`${BASE}/revisions`),
  rollback: (revisionId: string, idempotencyKey: string) =>
    apiRequest<{ revision: RevisionDto; reused: boolean }>(`${BASE}/revisions/${encodeURIComponent(revisionId)}/rollback`, json("POST", { idempotencyKey })),
  restoreDraft: (revisionId: string, expectedVersion: number) =>
    apiRequest<{ restored: boolean; fromRevision: number }>(`${BASE}/revisions/${encodeURIComponent(revisionId)}/restore-draft`, json("POST", { expectedVersion })),

  domains: () => apiRequest<DomainsDto>(`${BASE}/domains`),
  addDomain: (hostname: string) => apiRequest<DomainDto>(`${BASE}/domains`, json("POST", { hostname })),
  verifyDomain: (id: string) => apiRequest<DomainDto>(`${BASE}/domains/${encodeURIComponent(id)}/verify`, { method: "POST" }),
  setPrimaryDomain: (id: string) => apiRequest<DomainsDto>(`${BASE}/domains/${encodeURIComponent(id)}/primary`, { method: "POST" }),
  removeDomain: (id: string) => apiRequest<DomainsDto>(`${BASE}/domains/${encodeURIComponent(id)}`, { method: "DELETE" }),

  media: (query: { q?: string; category?: string; cursor?: string } = {}) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => value && params.set(key, value));
    return apiRequest<{ items: MediaItemDto[]; nextCursor: string | null }>(`${BASE}/media${params.toString() ? `?${params}` : ""}`);
  },
  uploadMedia: (file: File, options: { category?: string; alt?: string; title?: string } = {}) => {
    const form = new FormData();
    form.set("file", file);
    if (options.category) form.set("category", options.category);
    if (options.alt) form.set("alt", options.alt);
    if (options.title) form.set("title", options.title);
    return apiRequest<MediaItemDto>(`${BASE}/media`, { method: "POST", body: form });
  },
  updateMedia: (id: string, patch: { alt?: string; title?: string; focalX?: number; focalY?: number }) =>
    apiRequest<MediaItemDto>(`${BASE}/media/${encodeURIComponent(id)}`, json("PATCH", patch)),
  mediaUsages: (id: string) => apiRequest<{ usages: string[] }>(`${BASE}/media/${encodeURIComponent(id)}/usages`),
  deleteMedia: (id: string) => apiRequest<{ deleted: boolean }>(`${BASE}/media/${encodeURIComponent(id)}`, { method: "DELETE" }),

  people: (kind: "athlete" | "trainer" | "staff", q = "") =>
    apiRequest<{ kind: string; imageConsentDefined: boolean; people: PublicationCandidateDto[] }>(`${BASE}/people?kind=${kind}${q ? `&q=${encodeURIComponent(q)}` : ""}`),
  savePublication: (personKind: "athlete" | "trainer" | "staff", personId: string, settings: PublicationSettings) =>
    apiRequest<{ personKind: string; personId: string; settings: PublicationSettings; preview: PublicationCandidateDto["preview"] }>(`${BASE}/people`, json("PUT", { personKind, personId, settings })),

  articles: (query: { status?: string; q?: string; category?: string } = {}) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => value && params.set(key, value));
    return apiRequest<ArticleDto[]>(`${BASE}/articles${params.toString() ? `?${params}` : ""}`);
  },
  article: (id: string) => apiRequest<ArticleDto>(`${BASE}/articles/${encodeURIComponent(id)}`),
  createArticle: (input: Partial<ArticleDto>) => apiRequest<ArticleDto>(`${BASE}/articles`, json("POST", input)),
  updateArticle: (id: string, patch: Partial<ArticleDto> & { expectedVersion: number }) =>
    apiRequest<ArticleDto>(`${BASE}/articles/${encodeURIComponent(id)}`, json("PATCH", patch)),
  setArticleStatus: (id: string, status: ArticleDto["status"], expectedVersion: number, publishAt?: string) =>
    apiRequest<ArticleDto>(`${BASE}/articles/${encodeURIComponent(id)}/status`, json("POST", { status, expectedVersion, publishAt })),
  deleteArticle: (id: string) => apiRequest<{ deleted: boolean }>(`${BASE}/articles/${encodeURIComponent(id)}`, { method: "DELETE" }),

  inquiries: (status?: string) => apiRequest<{ unread: number; items: InquiryDto[] }>(`${BASE}/inquiries${status ? `?status=${status}` : ""}`),
  setInquiryStatus: (id: string, status: InquiryDto["status"]) =>
    apiRequest<{ id: string; status: string }>(`${BASE}/inquiries/${encodeURIComponent(id)}`, json("PATCH", { status })),

  sponsors: () => apiRequest<SponsorShowcaseDto>(`${BASE}/sponsors`),
  saveSponsorShowcase: (id: string, showcase: SponsorShowcase) =>
    apiRequest<{ id: string; name: string; showcase: SponsorShowcase }>(`${BASE}/sponsors/${encodeURIComponent(id)}`, json("PUT", { showcase })),
};

/**
 * Carica un'immagine nella libreria e restituisce l'indirizzo pubblico da
 * mettere nel testo formattato: e l'unica forma che `sanitizeWebsiteRichHtml`
 * lascia passare.
 */
export const uploadWebsiteInlineImage = async (file: File): Promise<string> => {
  const result = await websiteApi.uploadMedia(file, { title: file.name.replace(/.[^.]+$/, "") });
  if (result.error) throw new Error(result.error.message);
  return `${WEBSITE_MEDIA_ENDPOINT}/${result.data.id}`;
};

/** Una chiave di idempotenza per un'azione dell'operatore (pubblica, ripristina). */
export const newIdempotencyKey = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "");

export const isConflict = (envelope: ApiEnvelope<unknown>) => envelope.error?.code === "CONFLICT" || envelope.error?.status === 409;

/** Il percorso dell'anteprima privata di una pagina del sito. */
export const previewPath = (siteId: string, path: string) => `/website-preview/${siteId}${path === "/" ? "" : path}`;
