import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "../prisma";
import { resolvePageData, type PageData, type SiteRenderContext } from "./page-data";
import {
  WEBSITE_DATA_TTL,
  WEBSITE_SITE_TTL,
  websiteDataTag,
  websiteHostTag,
  websiteSiteTag,
} from "./cache";
import type { SiteSnapshot, SnapshotPage } from "@/lib/website/publishing/snapshot";
import type { PageContext } from "@/lib/website/datasources/contracts";
import { normalizeRequestHost, resolveHostUncached, type HostResolution } from "./public-routing";

export {
  buildSitemapEntries,
  normalizeRequestHost,
  resolveHostUncached,
  resolveSitePage,
  type HostResolution,
  type ResolvedPublicPage,
} from "./public-routing";

/**
 * **Dal dominio alla pagina pubblicata** (ADR-0200 §2, §4).
 *
 *     HOST → website_domains → website_sites → club → revisione pubblicata
 *
 * Un passaggio solo, in un posto solo. L'host arriva dal middleware gia
 * normalizzato (minuscolo, senza porta) e qui si normalizza di nuovo, perche
 * il percorso interno `/site-render/<host>/…` si puo anche scrivere a mano.
 * Un host sconosciuto, un dominio non verificato, un sito ritirato o un
 * servizio sospeso non mostrano mai niente di un altro club: rispondono «sito
 * non disponibile».
 *
 * **Cache** (Next 14.2): la risoluzione dell'host e lo snapshot sono
 * `unstable_cache` con i tag del sito, invalidati da pubblicazione, ripristino
 * e domini; i dati vivi di una pagina hanno un tag per club e una durata di un
 * minuto. `React.cache` evita che metadati e pagina leggano due volte nella
 * stessa richiesta — il difetto del renderer GPW che non ripetiamo.
 */

/** La risoluzione di un host, in cache con i tag del sito e dell'host. */
export const resolvePublicHost = cache(async (rawHost: string): Promise<HostResolution> => {
  const hostname = normalizeRequestHost(rawHost);
  const cached = unstable_cache(() => resolveHostUncached(hostname), ["website-host", hostname], {
    revalidate: WEBSITE_SITE_TTL,
    tags: [websiteHostTag(hostname)],
  });
  const result = await cached();
  if (result.status === "ok") {
    /* Il tag del sito si aggiunge rileggendo con la chiave del sito: una pubblicazione invalida entrambe. */
    return unstable_cache(async () => result, ["website-host-site", hostname, result.siteId], {
      revalidate: WEBSITE_SITE_TTL,
      tags: [websiteSiteTag(result.siteId), websiteHostTag(hostname)],
    })();
  }
  return result;
});

/** Lo snapshot di una revisione: immutabile, quindi la cache non scade da sola. */
export const loadPublishedSnapshot = cache(async (siteId: string, revisionId: string): Promise<SiteSnapshot | null> =>
  unstable_cache(
    async () => {
      const row = await (prisma as any).websiteRevision.findFirst({
        where: { id: revisionId, site_id: siteId },
        select: { snapshot: true },
      });
      return (row?.snapshot as SiteSnapshot) || null;
    },
    ["website-revision", revisionId],
    { revalidate: false, tags: [websiteSiteTag(siteId)] },
  )(),
);

/** I dati vivi di una pagina pubblicata, in cache per un minuto e per tag di club. */
export const loadPublicPageData = cache(
  async (render: SiteRenderContext, page: SnapshotPage, pageContext: PageContext, revisionId: string): Promise<PageData> =>
    unstable_cache(
      () => resolvePageData({ ...render, now: new Date() }, [page.document], pageContext),
      ["website-page-data", render.organizationId, revisionId, page.id, JSON.stringify(pageContext)],
      { revalidate: WEBSITE_DATA_TTL, tags: [websiteDataTag(render.organizationId), websiteSiteTag(render.siteId)] },
    )(),
);

