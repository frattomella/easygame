import { createHash } from "node:crypto";
import { prisma } from "../prisma";
import {
  auditWebsite,
  requireWebsiteAccess,
  WebsiteConflictError,
  WEBSITE_AUDIT_ACTIONS,
  type WebsiteScope,
} from "./access";
import { findSiteRow, serializeSiteDraft } from "./sites";
import { serializePage } from "./pages";
import { invalidateWebsiteData, invalidateWebsiteSite } from "./cache";
import {
  SNAPSHOT_SCHEMA_VERSION,
  snapshotFingerprintSource,
  type SiteSnapshot,
} from "@/lib/website/publishing/snapshot";
import { checkDocumentForPublish, type DocumentIssue } from "@/lib/website/document/validate";
import { validateNavigation } from "@/lib/website/navigation";
import { isDomainServing, type DomainState, type TlsState } from "@/lib/website/domains/model";
import { isHiddenEverywhere } from "@/lib/website/document/operations";

/**
 * **Bozza → anteprima → pubblicazione → rollback** (ADR-0200 §5).
 *
 * Pubblicare costruisce lo snapshot dalla bozza, lo valida, e lo scrive in
 * una riga nuova di `website_revisions` che il database non lascia modificare.
 * Il puntatore `website_sites.current_revision_id` dice quale revisione serve
 * il pubblico. Ripristinare una versione vecchia scrive una revisione nuova con
 * lo stesso snapshot: la storia non si riscrive mai (pattern ADR-0030 GPW).
 *
 * Ogni pubblicazione porta una chiave di idempotenza: un doppio clic, o una
 * richiesta ripetuta dalla rete, non crea due revisioni.
 */

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** Lo snapshot che una pubblicazione congelerebbe adesso. */
export const buildDraftSnapshot = async (organizationId: string): Promise<SiteSnapshot | null> => {
  const row = await findSiteRow(organizationId);
  if (!row) return null;
  const site = serializeSiteDraft(row);
  const pageRows = await (prisma as any).websitePage.findMany({
    where: { site_id: row.id, organization_id: organizationId },
    orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
  });
  const pages = pageRows.map(serializePage).map((page: ReturnType<typeof serializePage>) => ({
    id: page.id,
    kind: page.kind,
    slug: page.slug,
    path: page.path,
    title: page.title,
    seo: page.seo,
    /* Una sezione nascosta su tutti i dispositivi resta in bozza, non arriva al pubblico. */
    document: {
      ...page.document,
      sections: page.document.sections
        .filter((section) => !isHiddenEverywhere(section.hidden))
        .map((section) => ({
          ...section,
          columns: section.columns.map((column) => ({
            ...column,
            blocks: column.blocks.filter((block) => !isHiddenEverywhere(block.hidden)),
          })),
        })),
    },
  }));
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    siteId: site.id,
    templateKey: site.templateKey,
    theme: site.theme,
    header: site.header,
    footer: site.footer,
    navigation: site.navigation,
    seo: site.seo,
    settings: site.settings,
    pages,
  };
};

const collectMediaIds = (value: unknown, out: Set<string>) => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectMediaIds(item, out));
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (typeof record.mediaId === "string" && record.mediaId) out.add(record.mediaId);
  for (const item of Object.values(record)) collectMediaIds(item, out);
};

export type PublishCheck = {
  ready: boolean;
  issues: Array<DocumentIssue & { pageId?: string; pageTitle?: string }>;
  hasUnpublishedChanges: boolean;
  primaryDomain: string | null;
};

/**
 * Cio che blocca la pubblicazione, e cio che e solo un'avvertenza.
 *
 * Bloccano: nessun dominio primario attivo con HTTPS; una voce di menu che
 * punta a una pagina che non c'e; un'immagine senza testo alternativo; due
 * ancore uguali nella stessa pagina.
 */
export const checkPublishReadiness = async (organizationId: string, snapshot?: SiteSnapshot | null): Promise<PublishCheck> => {
  const draft = snapshot ?? (await buildDraftSnapshot(organizationId));
  if (!draft) {
    return { ready: false, issues: [{ level: "error", message: "Il sito non e ancora stato creato" }], hasUnpublishedChanges: false, primaryDomain: null };
  }
  const site = await findSiteRow(organizationId);
  const [domains, currentRevision] = await Promise.all([
    (prisma as any).websiteDomain.findMany({
      where: { site_id: draft.siteId, organization_id: organizationId },
      select: { hostname: true, role: true, state: true, tls_state: true },
    }),
    site?.current_revision_id
      ? (prisma as any).websiteRevision.findUnique({ where: { id: site.current_revision_id }, select: { snapshot_hash: true } })
      : null,
  ]);

  const issues: PublishCheck["issues"] = [];
  const primary = domains.find((domain: any) => domain.role === "primary");
  if (!primary) {
    issues.push({ level: "error", message: "Collega il dominio della societa e impostalo come principale: il sito si pubblica solo sul vostro dominio" });
  } else if (!isDomainServing(primary.state as DomainState, primary.tls_state as TlsState)) {
    issues.push({ level: "error", message: `Il dominio ${primary.hostname} non e ancora verificato con HTTPS attivo` });
  }

  const pageIds = new Set(draft.pages.map((page) => page.id));
  for (const navIssue of validateNavigation(draft.navigation, pageIds)) {
    issues.push({ level: "error", message: navIssue.message });
  }
  if (!draft.pages.some((page) => page.kind === "home")) {
    issues.push({ level: "error", message: "Il sito non ha una home" });
  }
  if (!draft.footer.privacyPageId || !pageIds.has(draft.footer.privacyPageId)) {
    issues.push({ level: "warning", message: "Il piede non collega una pagina privacy" });
  }

  const mediaIds = new Set<string>();
  collectMediaIds(draft.pages.map((page) => page.document), mediaIds);
  const metas = mediaIds.size
    ? await (prisma as any).websiteMediaMeta.findMany({
        where: { organization_id: organizationId, attachment_id: { in: Array.from(mediaIds) } },
        select: { attachment_id: true, alt_text: true },
      })
    : [];
  const altById = new Map<string, string>(metas.map((meta: any) => [meta.attachment_id, meta.alt_text || ""]));
  for (const page of draft.pages) {
    for (const issue of checkDocumentForPublish(page.document, (id) => altById.get(id) || "")) {
      issues.push({ ...issue, pageId: page.id, pageTitle: page.title });
    }
  }

  const hash = sha256(snapshotFingerprintSource(draft));
  return {
    ready: !issues.some((issue) => issue.level === "error"),
    issues,
    hasUnpublishedChanges: !currentRevision || currentRevision.snapshot_hash !== hash,
    primaryDomain: primary?.hostname || null,
  };
};

export const getPublicationStatus = async (scope: WebsiteScope | null | undefined) => {
  const grant = await requireWebsiteAccess(scope, "website.read", "read");
  return checkPublishReadiness(grant.organizationId);
};

const sanitizeIdempotencyKey = (value: unknown) => {
  const key = String(value ?? "").trim();
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(key)) {
    throw new Error("Manca la chiave della pubblicazione: ricarica la pagina e riprova");
  }
  return key;
};

const hostsOf = async (siteId: string, organizationId: string) =>
  (
    await (prisma as any).websiteDomain.findMany({
      where: { site_id: siteId, organization_id: organizationId },
      select: { hostname: true },
    })
  ).map((domain: any) => domain.hostname as string);

const writeRevision = async (
  organizationId: string,
  siteId: string,
  input: { snapshot: SiteSnapshot; origin: "publish" | "rollback"; sourceRevisionId?: string | null; idempotencyKey: string; note?: string | null; userId: string },
) =>
  (prisma as any).$transaction(async (tx: any) => {
    /* Il blocco sulla riga del sito serializza due pubblicazioni contemporanee. */
    await tx.$queryRaw`SELECT id FROM website_sites WHERE id = ${siteId}::uuid FOR UPDATE`;
    const already = await tx.websiteRevision.findFirst({
      where: { site_id: siteId, organization_id: organizationId, idempotency_key: input.idempotencyKey },
    });
    if (already) return { revision: already, reused: true };
    const last = await tx.websiteRevision.findFirst({
      where: { site_id: siteId, organization_id: organizationId },
      orderBy: { revision_number: "desc" },
      select: { revision_number: true },
    });
    const now = new Date();
    const revision = await tx.websiteRevision.create({
      data: {
        site_id: siteId,
        organization_id: organizationId,
        revision_number: Number(last?.revision_number || 0) + 1,
        snapshot: input.snapshot,
        snapshot_hash: sha256(snapshotFingerprintSource(input.snapshot)),
        origin: input.origin,
        source_revision_id: input.sourceRevisionId || null,
        idempotency_key: input.idempotencyKey,
        note: input.note ? String(input.note).slice(0, 300) : null,
        published_by: input.userId,
        published_at: now,
      },
    });
    await tx.websiteSite.update({
      where: { id: siteId },
      data: { current_revision_id: revision.id, status: "published", published_at: now, published_by: input.userId },
    });
    return { revision, reused: false };
  });

const serializeRevision = (row: Record<string, any>) => ({
  id: row.id,
  revisionNumber: Number(row.revision_number),
  origin: row.origin as "publish" | "rollback",
  sourceRevisionId: row.source_revision_id || null,
  note: row.note || null,
  publishedBy: row.published_by || null,
  publishedAt: row.published_at instanceof Date ? row.published_at.toISOString() : String(row.published_at),
  pageCount: Array.isArray(row.snapshot?.pages) ? row.snapshot.pages.length : null,
});

/** Pubblica la bozza. Fallisce se un controllo bloccante non passa. */
export const publishSite = async (
  scope: WebsiteScope | null | undefined,
  input: { idempotencyKey: unknown; note?: unknown },
  request?: Request,
) => {
  const grant = await requireWebsiteAccess(scope, "website.publish", "publish");
  const idempotencyKey = sanitizeIdempotencyKey(input.idempotencyKey);
  const snapshot = await buildDraftSnapshot(grant.organizationId);
  if (!snapshot) throw new Error("Il sito non e ancora stato creato");

  const check = await checkPublishReadiness(grant.organizationId, snapshot);
  if (!check.ready) {
    const first = check.issues.find((issue) => issue.level === "error");
    const error = new Error(`Pubblicazione non possibile: ${first?.message || "controlli non superati"}`);
    (error as any).issues = check.issues;
    throw error;
  }

  const { revision, reused } = await writeRevision(grant.organizationId, snapshot.siteId, {
    snapshot,
    origin: "publish",
    idempotencyKey,
    note: input.note ? String(input.note) : null,
    userId: grant.scope.userId,
  });
  if (!reused) {
    await auditWebsite(grant, WEBSITE_AUDIT_ACTIONS.published, revision.id, { revisionNumber: revision.revision_number, pages: snapshot.pages.length }, request);
  }
  invalidateWebsiteSite(snapshot.siteId, await hostsOf(snapshot.siteId, grant.organizationId));
  invalidateWebsiteData(grant.organizationId);
  return { revision: serializeRevision(revision), reused, issues: check.issues };
};

/**
 * Quante revisioni pubblicate tiene ogni sito: le ultime N piu la corrente.
 * E anche quante ne mostra lo storico, cosi nessuna revisione elencata sparisce
 * sotto gli occhi di chi la sta per ripristinare.
 */
export const WEBSITE_REVISIONS_KEPT = 50;

export const listRevisions = async (scope: WebsiteScope | null | undefined) => {
  const grant = await requireWebsiteAccess(scope, "website.read", "read");
  const site = await findSiteRow(grant.organizationId);
  if (!site) return { currentRevisionId: null, revisions: [] };
  const rows = await (prisma as any).websiteRevision.findMany({
    where: { site_id: site.id, organization_id: grant.organizationId },
    orderBy: { revision_number: "desc" },
    take: WEBSITE_REVISIONS_KEPT,
  });
  return { currentRevisionId: site.current_revision_id || null, revisions: rows.map(serializeRevision) };
};

/**
 * **La potatura delle revisioni** (D-WS-11), dal giro periodico del sito.
 *
 * Ogni pubblicazione scrive una riga con lo snapshot intero: senza potatura la
 * tabella cresce per sempre. Per ogni sito restano le ultime
 * `WEBSITE_REVISIONS_KEPT` e, comunque, la corrente — anche se fosse piu
 * vecchia, dopo un ripristino. Il trigger rifiuta solo l'`UPDATE` (una
 * revisione non si riscrive), non la cancellazione; `source_revision_id` di un
 * ripristino non e una chiave esterna, e resta come memoria della provenienza.
 *
 * E un lavoro di sfondo, non un atto di una persona: nessuno scope, nessun
 * club alla volta da scegliere.
 */
export const pruneOldRevisions = async (options: { keep?: number } = {}) => {
  const keep = Math.max(5, Math.floor(options.keep ?? WEBSITE_REVISIONS_KEPT));
  const sites = (await (prisma as any).websiteSite.findMany({ select: { id: true, current_revision_id: true } })) as Array<{ id: string; current_revision_id: string | null }>;
  let deleted = 0;
  for (const site of sites) {
    const [boundary] = (await (prisma as any).websiteRevision.findMany({
      where: { site_id: site.id },
      orderBy: { revision_number: "desc" },
      skip: keep - 1,
      take: 1,
      select: { revision_number: true },
    })) as Array<{ revision_number: number }>;
    if (!boundary) continue;
    const result = await (prisma as any).websiteRevision.deleteMany({
      where: {
        site_id: site.id,
        revision_number: { lt: boundary.revision_number },
        ...(site.current_revision_id ? { id: { not: site.current_revision_id } } : {}),
      },
    });
    deleted += Number(result?.count || 0);
  }
  return { sites: sites.length, deleted, keep };
};

/**
 * Ripristina una revisione **scrivendone una nuova** con lo stesso snapshot.
 * La revisione di partenza resta com'e, e cosi la storia.
 */
export const rollbackToRevision = async (
  scope: WebsiteScope | null | undefined,
  input: { revisionId: unknown; idempotencyKey: unknown },
  request?: Request,
) => {
  const grant = await requireWebsiteAccess(scope, "website.publish", "publish");
  const idempotencyKey = sanitizeIdempotencyKey(input.idempotencyKey);
  const site = await findSiteRow(grant.organizationId);
  if (!site) throw new Error("Il sito non e ancora stato creato");
  const source = await (prisma as any).websiteRevision.findFirst({
    where: { id: String(input.revisionId || ""), site_id: site.id, organization_id: grant.organizationId },
  });
  if (!source) throw new Error("Accesso negato: la versione non appartiene al sito del club attivo, o non esiste");
  if (source.id === site.current_revision_id) {
    throw new WebsiteConflictError("Questa e gia la versione pubblicata", null);
  }
  const { revision, reused } = await writeRevision(grant.organizationId, site.id, {
    snapshot: source.snapshot as SiteSnapshot,
    origin: "rollback",
    sourceRevisionId: source.id,
    idempotencyKey,
    note: `Ripristino della versione ${source.revision_number}`,
    userId: grant.scope.userId,
  });
  if (!reused) {
    await auditWebsite(grant, WEBSITE_AUDIT_ACTIONS.rolledBack, revision.id, { from: source.revision_number, to: revision.revision_number }, request);
  }
  invalidateWebsiteSite(site.id, await hostsOf(site.id, grant.organizationId));
  return { revision: serializeRevision(revision), reused };
};

/**
 * Ritira il sito dal pubblico (lo stato torna `offline`), senza cancellare
 * niente: le revisioni restano e la prossima pubblicazione lo riaccende.
 */
export const unpublishSite = async (scope: WebsiteScope | null | undefined, request?: Request) => {
  const grant = await requireWebsiteAccess(scope, "website.publish", "read");
  const site = await findSiteRow(grant.organizationId);
  if (!site) throw new Error("Il sito non e ancora stato creato");
  await (prisma as any).websiteSite.updateMany({
    where: { id: site.id, organization_id: grant.organizationId },
    data: { status: "offline" },
  });
  await auditWebsite(grant, WEBSITE_AUDIT_ACTIONS.unpublished, site.id, {}, request);
  invalidateWebsiteSite(site.id, await hostsOf(site.id, grant.organizationId));
  return { status: "offline" as const };
};

/**
 * Riporta nella bozza le pagine e la configurazione di una revisione.
 * Serve quando si vuole ripartire da una versione pubblicata: la bozza
 * corrente viene sostituita, e l'operatore lo conferma prima.
 */
export const restoreDraftFromRevision = async (
  scope: WebsiteScope | null | undefined,
  input: { revisionId: unknown; expectedVersion: unknown },
) => {
  const grant = await requireWebsiteAccess(scope, "website.publish", "write");
  const site = await findSiteRow(grant.organizationId);
  if (!site) throw new Error("Il sito non e ancora stato creato");
  if (Number(input.expectedVersion) !== Number(site.draft_version)) {
    throw new WebsiteConflictError("La bozza e cambiata: ricarica prima di ripristinare", Number(site.draft_version));
  }
  const source = await (prisma as any).websiteRevision.findFirst({
    where: { id: String(input.revisionId || ""), site_id: site.id, organization_id: grant.organizationId },
  });
  if (!source) throw new Error("Accesso negato: la versione non appartiene al sito del club attivo, o non esiste");
  const snapshot = source.snapshot as SiteSnapshot;
  await (prisma as any).$transaction(async (tx: any) => {
    await tx.websiteSite.update({
      where: { id: site.id },
      data: {
        theme: snapshot.theme,
        header: snapshot.header,
        footer: snapshot.footer,
        navigation: snapshot.navigation,
        seo: snapshot.seo,
        settings: snapshot.settings,
        draft_version: { increment: 1 },
      },
    });
    const existing = await tx.websitePage.findMany({ where: { site_id: site.id, organization_id: grant.organizationId }, select: { id: true } });
    const keep = new Set(snapshot.pages.map((page) => page.id));
    const remove = existing.map((row: any) => row.id).filter((id: string) => !keep.has(id));
    if (remove.length) await tx.websitePage.deleteMany({ where: { id: { in: remove }, organization_id: grant.organizationId } });
    /*
      Due fasi: prima ogni pagina che resta prende un percorso provvisorio,
      poi il suo. Altrimenti due pagine che si scambiano l'indirizzo
      urterebbero l'indice unico a meta del giro.
    */
    for (const row of existing) {
      if (!keep.has(row.id)) continue;
      await tx.websitePage.update({ where: { id: row.id }, data: { path: `/__ripristino__/${row.id}` } });
    }
    for (const [index, page] of snapshot.pages.entries()) {
      const exists = existing.some((row: any) => row.id === page.id);
      if (exists) {
        await tx.websitePage.update({
          where: { id: page.id },
          data: { kind: page.kind, slug: page.slug, path: page.path, title: page.title, seo: page.seo, document: page.document, sort_order: index, version: { increment: 1 }, updated_by: grant.scope.userId },
        });
      } else {
        await tx.websitePage.create({
          data: { id: page.id, site_id: site.id, organization_id: grant.organizationId, kind: page.kind, slug: page.slug, path: page.path, title: page.title, seo: page.seo, document: page.document, sort_order: index, created_by: grant.scope.userId, updated_by: grant.scope.userId },
        });
      }
    }
  });
  return { restored: true, fromRevision: Number(source.revision_number) };
};
