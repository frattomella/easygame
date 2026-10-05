import type { Metadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import {
  loadPublicPageData,
  loadPublishedSnapshot,
  resolvePublicHost,
  resolveSitePage,
} from "@/lib/server/website/public-site";
import { splitRequestPath } from "@/lib/website/slug";
import { buildStructuredData, detailFromResults, resolvePageSeo } from "@/lib/website/seo";
import { WEBSITE_MEDIA_ENDPOINT } from "@/lib/rich-text/sanitize";
import { SiteDocument } from "@/components/website/render/SiteDocument";
import { SiteUnavailable } from "@/components/website/render/SiteUnavailable";
import { buildRenderContext } from "@/components/website/render/build-context";

/**
 * **Il renderer pubblico del sito di un club** (ADR-0200 §2, §4).
 *
 * Ci si arriva solo per rewrite dal middleware: un dominio del club diventa
 * `/site-render/<host>/<percorso>`. Qui: host → sito → revisione pubblicata
 * → pagina → dati vivi → HTML. Nessun provider del gestionale, nessun
 * editor, nessuna sessione: solo componenti server e le isole che i blocchi
 * della pagina dichiarano.
 *
 * Le letture sono in cache (`unstable_cache` + `React.cache`): metadati e
 * pagina condividono la stessa risoluzione, non la rifanno.
 */

export const dynamic = "force-dynamic";

type Props = {
  params: { host: string; path?: string[] };
  searchParams?: Record<string, string | string[] | undefined>;
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || "";

const resolve = async ({ params, searchParams }: Props) => {
  const host = await resolvePublicHost(decodeURIComponent(params.host));
  if (host.status !== "ok") return { kind: "host" as const, host };
  const segments = splitRequestPath(params.path);
  const path = segments.length ? `/${segments.join("/")}` : "/";
  if (host.hostname !== host.primaryHostname) {
    return { kind: "redirect" as const, location: `https://${host.primaryHostname}${path}`, permanent: true };
  }
  const snapshot = await loadPublishedSnapshot(host.siteId, host.revisionId);
  if (!snapshot) return { kind: "not_found" as const };
  const now = new Date();
  const resolved = await resolveSitePage(host.organizationId, host.siteId, snapshot, segments, now);
  if (resolved.status === "not_found") return { kind: "not_found" as const };
  if (resolved.status === "redirect") return { kind: "redirect" as const, location: resolved.location, permanent: true };
  const pageContext = { ...resolved.pageContext };
  if (resolved.page.kind === "news_index") {
    pageContext.articleCategory = first(searchParams?.categoria).replace(/[^a-z0-9-]/g, "").slice(0, 60) || null;
    pageContext.articlePage = Number.parseInt(first(searchParams?.pagina), 10) || null;
  }
  const data = await loadPublicPageData(resolved.render, resolved.page, pageContext, host.revisionId);
  return { kind: "ok" as const, host, snapshot, resolved, pageContext, data, path };
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const result = await resolve(props);
  if (result.kind !== "ok") return { robots: { index: false, follow: false } };
  const origin = `https://${result.host.primaryHostname}`;
  const seo = resolvePageSeo({
    snapshot: result.snapshot,
    page: result.resolved.page,
    club: result.data.club,
    origin,
    path: result.path,
    detail: detailFromResults(result.resolved.detail, result.data.results),
  });
  const favicon = result.snapshot.settings.identity.favicon?.mediaId
    ? `${WEBSITE_MEDIA_ENDPOINT}/${result.snapshot.settings.identity.favicon.mediaId}`
    : result.data.club.logo?.src;
  return {
    title: { absolute: seo.title },
    description: seo.description || undefined,
    alternates: { canonical: seo.canonical },
    robots: seo.noindex ? { index: false, follow: true } : { index: true, follow: true },
    icons: favicon ? { icon: favicon } : undefined,
    openGraph: {
      type: seo.type === "profile" ? "profile" : seo.type,
      title: seo.title,
      description: seo.description || undefined,
      url: seo.canonical,
      siteName: result.data.club.name,
      locale: "it_IT",
      images: seo.image ? [{ url: seo.image, alt: seo.imageAlt }] : undefined,
      ...(seo.publishedAt ? { publishedTime: seo.publishedAt } : {}),
    },
    twitter: {
      card: seo.image ? "summary_large_image" : "summary",
      title: seo.title,
      description: seo.description || undefined,
      images: seo.image ? [seo.image] : undefined,
    },
  };
}

export default async function PublicSitePage(props: Props) {
  const result = await resolve(props);
  if (result.kind === "host") {
    if (result.host.status === "redirect") redirect(result.host.location);
    if (result.host.status === "unavailable") return <SiteUnavailable siteName={result.host.siteName} reason={result.host.reason} />;
    notFound();
  }
  if (result.kind === "redirect") {
    if (result.permanent) permanentRedirect(result.location);
    redirect(result.location);
  }
  if (result.kind !== "ok") notFound();

  const origin = `https://${result.host.primaryHostname}`;
  const context = buildRenderContext({
    snapshot: result.snapshot,
    page: result.resolved.page,
    data: result.data,
    pageContext: result.pageContext,
    mode: "public",
    origin,
    currentPath: result.path,
  });
  const structuredData = buildStructuredData({
    club: result.data.club,
    origin,
    path: result.path,
    detail: detailFromResults(result.resolved.detail, result.data.results),
    isHome: result.resolved.page.kind === "home",
  });
  return <SiteDocument page={result.resolved.page} context={context} structuredData={structuredData} />;
}
