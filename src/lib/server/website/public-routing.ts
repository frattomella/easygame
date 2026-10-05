import { prisma } from "../prisma";
import { resolveWebsiteAccessFromSettings } from "./access";
import type { SiteRenderContext } from "./page-data";
import { loadClubContext } from "./public-data/club-context";
import { loadPeopleIndex } from "./public-data/people";
import { isDomainServing, type DomainState, type TlsState } from "@/lib/website/domains/model";
import {
  detailBasesFromPages,
  matchSnapshotRoute,
  type DetailKind,
  type SiteSnapshot,
  type SnapshotPage,
} from "@/lib/website/publishing/snapshot";
import { detailSlugId } from "@/lib/website/slug";
import type { PageContext } from "@/lib/website/datasources/contracts";

/**
 * **L'instradamento del sito pubblico, senza cache** (ADR-0200 §2, §4).
 *
 * Host → dominio → sito → revisione, e percorso → pagina con il suo contesto
 * di dettaglio. Vive qui, fuori da `public-site.ts`, perche quel file avvolge
 * queste funzioni in `unstable_cache` di Next, che fuori da una richiesta Next
 * non gira: separate, si provano nel runner di test (D-WS-5,
 * `tests/server/website-public-routing.test.mjs`). `public-site.ts` resta il
 * punto d'ingresso del renderer e le riesporta.
 */

export const normalizeRequestHost = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "")
    .replace(/\.$/, "")
    .slice(0, 253);

export type HostResolution =
  | { status: "not_found" }
  | { status: "unavailable"; reason: "offline" | "suspended" | "not_published" | "domain_not_ready"; siteName: string | null }
  | { status: "redirect"; location: string }
  | {
      status: "ok";
      siteId: string;
      organizationId: string;
      revisionId: string;
      hostname: string;
      primaryHostname: string;
    };

export const resolveHostUncached = async (hostname: string): Promise<HostResolution> => {
  if (!hostname || !/^[a-z0-9.-]+$/.test(hostname)) return { status: "not_found" };
  const domain = await (prisma as any).websiteDomain.findUnique({
    where: { hostname },
    select: { site_id: true, organization_id: true, state: true, tls_state: true, role: true },
  });
  if (!domain) return { status: "not_found" };
  const site = await (prisma as any).websiteSite.findFirst({
    where: { id: domain.site_id, organization_id: domain.organization_id },
    select: { id: true, organization_id: true, status: true, current_revision_id: true, settings: true, organization: { select: { settings: true, name: true } } },
  });
  if (!site) return { status: "not_found" };
  const siteName = String(site.settings?.identity?.displayName || site.organization?.name || "") || null;

  if (!isDomainServing(domain.state as DomainState, domain.tls_state as TlsState)) {
    return { status: "unavailable", reason: "domain_not_ready", siteName };
  }
  const access = resolveWebsiteAccessFromSettings(site.organization?.settings);
  if (!access.publicServing) return { status: "unavailable", reason: "suspended", siteName };
  if (site.status === "offline") return { status: "unavailable", reason: "offline", siteName };
  if (site.status !== "published" || !site.current_revision_id) return { status: "unavailable", reason: "not_published", siteName };

  const primary = await (prisma as any).websiteDomain.findFirst({
    where: { site_id: site.id, organization_id: site.organization_id, role: "primary" },
    select: { hostname: true, state: true, tls_state: true },
  });
  const primaryHostname =
    primary && isDomainServing(primary.state as DomainState, primary.tls_state as TlsState) ? primary.hostname : hostname;

  return {
    status: "ok",
    siteId: site.id,
    organizationId: site.organization_id,
    revisionId: site.current_revision_id,
    hostname,
    primaryHostname,
  };
};


export type ResolvedPublicPage =
  | { status: "not_found" }
  | { status: "redirect"; location: string }
  | {
      status: "ok";
      render: SiteRenderContext;
      page: SnapshotPage;
      pageContext: PageContext;
      detail: DetailKind | null;
    };

/**
 * Il contesto di una pagina di dettaglio dall'indirizzo: la squadra dallo
 * slug (anche uno vecchio, con un reindirizzamento allo slug nuovo), la gara,
 * l'articolo, il giocatore, l'evento. Un elemento che non esiste o non e
 * pubblico e una pagina che non esiste.
 */
const resolveDetailContext = async (
  organizationId: string,
  siteId: string,
  detail: DetailKind,
  item: string,
  basePath: string,
  now: Date,
): Promise<{ context: PageContext } | { redirect: string } | null> => {
  switch (detail) {
    case "team": {
      const team = await (prisma as any).clubTeam.findFirst({
        where: { organization_id: organizationId, active: true, OR: [{ slug: item }, { previous_slugs: { has: item } }] },
        select: { id: true, slug: true },
      });
      if (!team) return null;
      if (team.slug !== item) return { redirect: `${basePath}/${team.slug}` };
      return { context: { teamId: team.id } };
    }
    case "match":
    case "event": {
      const id = detailSlugId(item);
      if (!id) return null;
      const event = await (prisma as any).clubEvent.findFirst({
        where: { id, organization_id: organizationId, status: { not: "archived" }, ...(detail === "match" ? { kind: "match" } : {}) },
        select: { id: true },
      });
      if (!event) return null;
      return { context: detail === "match" ? { matchId: event.id } : { eventId: event.id } };
    }
    case "article": {
      const article = await (prisma as any).websiteArticle.findFirst({
        where: {
          organization_id: organizationId,
          site_id: siteId,
          slug: item,
          OR: [
            { status: "published", published_at: { lte: now } },
            { status: "scheduled", publish_at: { lte: now } },
          ],
        },
        select: { id: true },
      });
      return article ? { context: { articleId: article.id } } : null;
    }
    case "player": {
      const id = detailSlugId(item);
      if (!id) return null;
      const context = await loadClubContext(organizationId);
      if (!context) return null;
      const people = await loadPeopleIndex(context, { now, seasonId: context.seasons.activeSeasonId, bases: {} });
      return people.athletes.has(id) ? { context: { personId: id } } : null;
    }
    default:
      return null;
  }
};

/** Un percorso del sito di un club alla sua pagina, con il contesto di dettaglio. */
export const resolveSitePage = async (
  organizationId: string,
  siteId: string,
  snapshot: SiteSnapshot,
  segments: string[],
  now: Date,
  pathPrefix = "",
): Promise<ResolvedPublicPage> => {
  const match = matchSnapshotRoute(snapshot.pages, segments);
  const bases = detailBasesFromPages(snapshot.pages);
  const render: SiteRenderContext = { organizationId, siteId, snapshot, now, bases };

  if (match.kind === "page") return { status: "ok", render, page: match.page, pageContext: {}, detail: null };

  if (match.kind === "detail") {
    const base = `/${match.page.slug}`;
    const resolved = await resolveDetailContext(organizationId, siteId, match.detail, match.item, base, now);
    if (!resolved) return { status: "not_found" };
    if ("redirect" in resolved) return { status: "redirect", location: `${pathPrefix}${resolved.redirect}` };
    return { status: "ok", render, page: match.page, pageContext: resolved.context, detail: match.detail };
  }

  /* Un indirizzo vecchio di una pagina rinominata. */
  const path = segments.length ? `/${segments.join("/")}` : "/";
  const redirect = await (prisma as any).websiteRedirect.findFirst({
    where: { site_id: siteId, organization_id: organizationId, from_path: path },
    select: { to_path: true },
  });
  if (redirect?.to_path) return { status: "redirect", location: `${pathPrefix}${redirect.to_path}` };
  if (segments.length === 2) {
    const prefixRedirect = await (prisma as any).websiteRedirect.findFirst({
      where: { site_id: siteId, organization_id: organizationId, from_path: `/${segments[0]}` },
      select: { to_path: true },
    });
    if (prefixRedirect?.to_path) return { status: "redirect", location: `${pathPrefix}${prefixRedirect.to_path}/${segments[1]}` };
  }
  return { status: "not_found" };
};


/** Gli indirizzi della sitemap di un sito pubblicato: pagine, articoli, squadre. */
export const buildSitemapEntries = async (
  organizationId: string,
  siteId: string,
  snapshot: SiteSnapshot,
  origin: string,
  now = new Date(),
) => {
  const bases = detailBasesFromPages(snapshot.pages);
  const urls: Array<{ loc: string; lastmod?: string }> = [];
  for (const page of snapshot.pages) {
    if (page.path.endsWith("/*") || page.seo.noindex) continue;
    urls.push({ loc: page.path === "/" ? origin : `${origin}${page.path}` });
  }
  if (bases.article) {
    const articles = await (prisma as any).websiteArticle.findMany({
      where: {
        organization_id: organizationId,
        site_id: siteId,
        OR: [
          { status: "published", published_at: { lte: now } },
          { status: "scheduled", publish_at: { lte: now } },
        ],
      },
      select: { slug: true, updated_at: true, seo: true },
      orderBy: { published_at: "desc" },
      take: 2000,
    });
    for (const article of articles as any[]) {
      if (article.seo?.noindex) continue;
      urls.push({ loc: `${origin}${bases.article}/${article.slug}`, lastmod: new Date(article.updated_at).toISOString() });
    }
  }
  if (bases.team) {
    const teams = await (prisma as any).clubTeam.findMany({
      where: { organization_id: organizationId, active: true },
      select: { slug: true, updated_at: true },
    });
    for (const team of teams as any[]) {
      urls.push({ loc: `${origin}${bases.team}/${team.slug}`, lastmod: new Date(team.updated_at).toISOString() });
    }
  }
  return urls;
};
