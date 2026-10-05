import { prisma } from "../prisma";
import { ATTACHMENT_ENDPOINT } from "@/lib/attachments";
import { createAttachment, deleteAttachment, readAttachment } from "../attachments";
import { auditWebsite, requireWebsiteAccess, WEBSITE_AUDIT_ACTIONS, type WebsiteScope } from "./access";
import { findSiteRow } from "./sites";
import { readImageSize } from "./image-size";
import { isPersonPhotoPublic } from "./people";
import { invalidateWebsiteData } from "./cache";
import { WEBSITE_MEDIA_ENDPOINT } from "@/lib/rich-text/sanitize";

/**
 * **La libreria immagini del sito** (ADR-0200 §9).
 *
 * Non e un secondo archivio: ogni file e un allegato (`owner_type = website`,
 * `owner_id = <sito>`) del servizio allegati, che resta l'unico posto dove
 * vivono i byte e che oggi li tiene nel database e domani su S3/R2 senza che
 * questo modulo cambi. Qui vivono i metadati che servono a un sito — testo
 * alternativo, titolo, punto focale, dimensioni — in `website_media_meta`.
 *
 * Categorie: `website-media` (libreria), `person-photo` (foto di una persona,
 * pubblica solo se la policy lo consente), `sponsor-logo`, `team-photo`,
 * `opponent-logo`.
 */

export const WEBSITE_MEDIA_CATEGORIES = ["website-media", "person-photo", "sponsor-logo", "team-photo", "opponent-logo"] as const;
export type WebsiteMediaCategory = (typeof WEBSITE_MEDIA_CATEGORIES)[number];

/** Solo formati che un browser mostra: niente SVG (eseguibile), niente HEIC/TIFF. */
export const WEBSITE_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const MAX_WEBSITE_IMAGE_BYTES = 8 * 1024 * 1024;

const text = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

const clampFocal = (value: unknown, fallback = 50) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : fallback;
};

export type WebsiteMediaItem = {
  id: string;
  url: string;
  /**
   * Dove il gestionale la guarda. Per una foto di persona e la rotta
   * autenticata degli allegati: quella pubblica la nasconde finche la
   * pubblicazione non la consente, e nel gestionale apparirebbe rotta.
   */
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

const serialize = (row: any, meta: any): WebsiteMediaItem => ({
  id: row.id,
  url: `${WEBSITE_MEDIA_ENDPOINT}/${row.id}`,
  previewUrl: row.category === "person-photo" ? `${ATTACHMENT_ENDPOINT}/${row.id}` : `${WEBSITE_MEDIA_ENDPOINT}/${row.id}`,
  fileName: row.file_name,
  mimeType: row.mime_type,
  sizeBytes: Number(row.size_bytes || 0),
  category: row.category,
  alt: meta?.alt_text || "",
  title: meta?.title || "",
  focalX: meta?.focal_x ?? 50,
  focalY: meta?.focal_y ?? 50,
  width: meta?.width ?? null,
  height: meta?.height ?? null,
  createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
});

const requireSite = async (organizationId: string) => {
  const site = await findSiteRow(organizationId);
  if (!site) throw new Error("Il sito non e ancora stato creato");
  return site;
};

export const uploadWebsiteMedia = async (
  scope: WebsiteScope | null | undefined,
  input: { content: Buffer; fileName: string; mimeType: string; category?: unknown; alt?: unknown; title?: unknown },
) => {
  const grant = await requireWebsiteAccess(scope, "website.media.manage", "write");
  const site = await requireSite(grant.organizationId);
  const mimeType = String(input.mimeType || "").toLowerCase();
  if (!(WEBSITE_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw new Error("Il sito accetta immagini JPEG, PNG, WebP o GIF");
  }
  if (!Buffer.isBuffer(input.content) || !input.content.length) throw new Error("Il file e vuoto");
  if (input.content.length > MAX_WEBSITE_IMAGE_BYTES) throw new Error("L'immagine supera gli 8 MB: riducila prima di caricarla");
  const size = readImageSize(input.content);
  if (!size || size.mimeType !== (mimeType === "image/jpg" ? "image/jpeg" : mimeType)) {
    throw new Error("Il file non e un'immagine valida del tipo dichiarato");
  }
  const category = (WEBSITE_MEDIA_CATEGORIES as readonly string[]).includes(String(input.category)) ? String(input.category) : "website-media";

  const attachment = await createAttachment(
    {
      organizationId: grant.organizationId,
      ownerType: "website",
      ownerId: site.id,
      category,
      fileName: input.fileName,
      mimeType,
      content: input.content,
    },
    {
      userId: grant.scope.userId,
      activeOrganizationId: grant.scope.activeOrganizationId,
      allowedOrganizationIds: grant.scope.allowedOrganizationIds,
      activeRole: grant.scope.activeRole,
    },
  );
  const meta = await (prisma as any).websiteMediaMeta.create({
    data: {
      attachment_id: attachment.id,
      organization_id: grant.organizationId,
      alt_text: text(input.alt, 250),
      title: text(input.title, 120) || text(input.fileName, 120),
      width: size.width,
      height: size.height,
    },
  });
  const row = await (prisma as any).attachment.findUnique({ where: { id: attachment.id } });
  return serialize(row, meta);
};

export const listWebsiteMedia = async (
  scope: WebsiteScope | null | undefined,
  filter: { q?: unknown; category?: unknown; cursor?: unknown; take?: unknown } = {},
) => {
  const grant = await requireWebsiteAccess(scope, "website.read", "read");
  const site = await findSiteRow(grant.organizationId);
  if (!site) return { items: [] as WebsiteMediaItem[], nextCursor: null };
  const query = text(filter.q, 60);
  const take = Math.min(100, Math.max(1, Number(filter.take) || 48));
  const category = (WEBSITE_MEDIA_CATEGORIES as readonly string[]).includes(String(filter.category)) ? String(filter.category) : null;
  const rows = await (prisma as any).attachment.findMany({
    where: {
      organization_id: grant.organizationId,
      owner_type: "website",
      owner_id: site.id,
      /* Le foto delle persone non stanno nella libreria comune: si scelgono dal pannello della persona. */
      ...(category ? { category } : { category: { not: "person-photo" } }),
      ...(query
        ? {
            OR: [
              { file_name: { contains: query, mode: "insensitive" } },
              { website_meta: { alt_text: { contains: query, mode: "insensitive" } } },
              { website_meta: { title: { contains: query, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    select: { id: true, file_name: true, mime_type: true, size_bytes: true, category: true, created_at: true, website_meta: true },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(filter.cursor ? { cursor: { id: String(filter.cursor) }, skip: 1 } : {}),
  });
  const items = (rows as any[]).slice(0, take).map((row) => serialize(row, row.website_meta));
  return { items, nextCursor: rows.length > take ? rows[take - 1].id : null };
};

const findWebsiteMedia = async (organizationId: string, mediaId: string) => {
  const row = await (prisma as any).attachment.findFirst({
    where: { id: String(mediaId || ""), organization_id: organizationId, owner_type: "website" },
    select: { id: true, file_name: true, mime_type: true, size_bytes: true, category: true, created_at: true, website_meta: true },
  });
  if (!row) throw new Error("Accesso negato: l'immagine non appartiene al sito del club attivo, o non esiste");
  return row;
};

export const updateWebsiteMediaMeta = async (
  scope: WebsiteScope | null | undefined,
  mediaId: string,
  patch: { alt?: unknown; title?: unknown; focalX?: unknown; focalY?: unknown },
) => {
  const grant = await requireWebsiteAccess(scope, "website.media.manage", "write");
  const row = await findWebsiteMedia(grant.organizationId, mediaId);
  const data: Record<string, unknown> = {};
  if (patch.alt !== undefined) data.alt_text = text(patch.alt, 250);
  if (patch.title !== undefined) data.title = text(patch.title, 120);
  if (patch.focalX !== undefined) data.focal_x = clampFocal(patch.focalX);
  if (patch.focalY !== undefined) data.focal_y = clampFocal(patch.focalY);
  const meta = await (prisma as any).websiteMediaMeta.upsert({
    where: { attachment_id: row.id },
    update: data,
    create: { attachment_id: row.id, organization_id: grant.organizationId, alt_text: "", title: row.file_name, ...data },
  });
  invalidateWebsiteData(grant.organizationId);
  return serialize(row, meta);
};

const containsMedia = (value: unknown, mediaId: string): boolean => {
  if (!value) return false;
  if (typeof value === "string") return value === mediaId || value.includes(`${WEBSITE_MEDIA_ENDPOINT}/${mediaId}`);
  if (Array.isArray(value)) return value.some((item) => containsMedia(item, mediaId));
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).some((item) => containsMedia(item, mediaId));
  return false;
};

/**
 * Dove e usata un'immagine: pagine in bozza, versione pubblicata, impostazioni
 * del sito, articoli, persone, sponsor, squadre, avversari. Un'immagine usata
 * non si cancella: la libreria lo dice e mostra dove.
 */
export const findMediaUsages = async (organizationId: string, mediaId: string) => {
  const site = await findSiteRow(organizationId);
  const usages: string[] = [];
  if (!site) return usages;
  const [pages, revision, articles, publications, teams, opponents, sponsors] = await Promise.all([
    (prisma as any).websitePage.findMany({ where: { site_id: site.id, organization_id: organizationId }, select: { title: true, document: true, seo: true } }),
    site.current_revision_id ? (prisma as any).websiteRevision.findUnique({ where: { id: site.current_revision_id }, select: { snapshot: true } }) : null,
    (prisma as any).websiteArticle.findMany({ where: { site_id: site.id, organization_id: organizationId }, select: { title: true, cover: true, gallery: true, body_html: true, seo: true } }),
    (prisma as any).websitePersonPublication.findMany({ where: { organization_id: organizationId }, select: { settings: true } }),
    (prisma as any).clubTeam.findMany({ where: { organization_id: organizationId, photo_attachment_id: mediaId }, select: { name: true } }),
    (prisma as any).opponent.findMany({ where: { organization_id: organizationId, logo_attachment_id: mediaId }, select: { name: true } }),
    import("../sponsors").then((module) => module.listSponsorShowcases(organizationId)),
  ]);
  for (const page of pages as any[]) if (containsMedia([page.document, page.seo], mediaId)) usages.push(`Pagina «${page.title}»`);
  if (containsMedia([site.settings, site.seo, site.header, site.footer], mediaId)) usages.push("Impostazioni del sito");
  if (revision && containsMedia(revision.snapshot, mediaId)) usages.push("Versione pubblicata del sito");
  for (const article of articles as any[]) if (containsMedia([article.cover, article.gallery, article.body_html, article.seo], mediaId)) usages.push(`Articolo «${article.title}»`);
  if ((publications as any[]).some((row) => containsMedia(row.settings, mediaId))) usages.push("Foto di una persona pubblicata");
  for (const team of teams as any[]) usages.push(`Squadra «${team.name}»`);
  for (const opponent of opponents as any[]) usages.push(`Avversario «${opponent.name}»`);
  for (const sponsor of sponsors as any[]) if (sponsor.showcase.logoMediaId === mediaId) usages.push(`Sponsor «${sponsor.name}»`);
  return usages;
};

export const getWebsiteMediaUsages = async (scope: WebsiteScope | null | undefined, mediaId: string) => {
  const grant = await requireWebsiteAccess(scope, "website.read", "read");
  await findWebsiteMedia(grant.organizationId, mediaId);
  return { usages: await findMediaUsages(grant.organizationId, mediaId) };
};

export const deleteWebsiteMedia = async (scope: WebsiteScope | null | undefined, mediaId: string, request?: Request) => {
  const grant = await requireWebsiteAccess(scope, "website.media.manage", "write");
  const row = await findWebsiteMedia(grant.organizationId, mediaId);
  const usages = await findMediaUsages(grant.organizationId, mediaId);
  if (usages.length) {
    const error = new Error(`L'immagine e in uso e non si puo eliminare: ${usages.slice(0, 4).join(", ")}${usages.length > 4 ? "…" : ""}`);
    (error as any).usages = usages;
    throw error;
  }
  await deleteAttachment(row.id, {
    userId: grant.scope.userId,
    activeOrganizationId: grant.scope.activeOrganizationId,
    allowedOrganizationIds: grant.scope.allowedOrganizationIds,
    activeRole: grant.scope.activeRole,
  });
  await auditWebsite(grant, WEBSITE_AUDIT_ACTIONS.mediaDeleted, row.id, { fileName: row.file_name }, request);
  return { deleted: true };
};

/**
 * **La lettura pubblica** di un file del sito, per la rotta
 * `/api/public/website/media/<id>`.
 *
 * Nessuna sessione e nessun host: un file della libreria del sito e pubblico
 * per natura, e il suo identificativo e opaco. Le eccezioni sono le foto delle
 * persone, servite solo se la policy le lascia passare **adesso** — una foto
 * di un minore il cui consenso e stato revocato smette di essere servita
 * anche se una cache o un link la ricordano. Un allegato che non e del sito
 * (un documento, un certificato) non esce mai da qui.
 */
export const readPublicWebsiteMedia = async (mediaId: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(String(mediaId || ""))) return null;
  const row = await (prisma as any).attachment.findFirst({
    where: { id: mediaId, owner_type: "website" },
    select: { id: true, organization_id: true, category: true, mime_type: true },
  });
  if (!row) return null;
  if (!(WEBSITE_IMAGE_MIME_TYPES as readonly string[]).includes(String(row.mime_type))) return null;
  if (row.category === "person-photo" && !(await isPersonPhotoPublic(row.organization_id, row.id))) return null;
  const content = await readAttachment(row.id);
  if (!content) return null;
  return { content: content.content, mimeType: row.mime_type as string, isPersonPhoto: row.category === "person-photo" };
};
