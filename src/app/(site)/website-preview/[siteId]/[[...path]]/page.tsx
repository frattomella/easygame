import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { authorizePreview, samplePageContext } from "@/lib/server/website/preview";
import { resolveSitePage } from "@/lib/server/website/public-site";
import { resolvePageData } from "@/lib/server/website/page-data";
import { matchSnapshotRoute, detailBasesFromPages, DETAIL_KIND_BY_PAGE_KIND } from "@/lib/website/publishing/snapshot";
import { splitRequestPath } from "@/lib/website/slug";
import { SiteDocument } from "@/components/website/render/SiteDocument";
import { buildRenderContext } from "@/components/website/render/build-context";
import { EditorProbe } from "@/components/website/preview/EditorProbe";
import { PREVIEW_SAMPLE_ITEM } from "@/lib/website/editor-protocol";

/**
 * **L'anteprima privata della bozza** (ADR-0200 §5).
 *
 * Non e un indirizzo pubblico: vive sul dominio del gestionale, chiede la
 * sessione (il middleware rimanda al login chi non ce l'ha) e il permesso
 * `website.read` sul club del sito. Rende la **bozza** con lo stesso renderer
 * del pubblico, senza cache, e non si indicizza mai. Dentro l'editor monta il
 * probe, che collega l'iframe ai pannelli.
 *
 * `/<modello>/__esempio` apre un modello di dettaglio riempito con un
 * elemento vero del club (la prima squadra, l'ultima gara…).
 */

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Anteprima",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

type Props = {
  params: { siteId: string; path?: string[] };
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function WebsitePreviewPage({ params, searchParams }: Props) {
  const grant = await authorizePreview(cookies().toString(), params.siteId);
  if (!grant) {
    return (
      <main className="ws-body flex min-h-screen items-center justify-center p-8 text-center">
        <div>
          <h1 className="text-2xl font-semibold">Anteprima non disponibile</h1>
          <p className="mt-2 opacity-80">Serve una sessione del gestionale con l&apos;accesso al sito di questa societa.</p>
        </div>
      </main>
    );
  }
  const prefix = `/website-preview/${grant.siteId}`;
  const segments = splitRequestPath(params.path);
  const now = new Date();

  let page;
  let pageContext: Record<string, unknown> = {};
  let detail: string | null = null;
  const route = matchSnapshotRoute(grant.snapshot.pages, segments);
  if (route.kind === "detail" && route.item === PREVIEW_SAMPLE_ITEM) {
    page = route.page;
    detail = route.detail;
    pageContext = await samplePageContext(grant.organizationId, route.detail);
  } else {
    const resolved = await resolveSitePage(grant.organizationId, grant.siteId, grant.snapshot, segments, now, prefix);
    if (resolved.status === "redirect") redirect(resolved.location);
    if (resolved.status !== "ok") notFound();
    page = resolved.page;
    pageContext = { ...resolved.pageContext };
    detail = resolved.detail;
  }
  if (page.kind === "news_index") {
    const category = Array.isArray(searchParams?.categoria) ? searchParams?.categoria[0] : searchParams?.categoria;
    const pageNumber = Array.isArray(searchParams?.pagina) ? searchParams?.pagina[0] : searchParams?.pagina;
    pageContext.articleCategory = String(category || "").replace(/[^a-z0-9-]/g, "") || null;
    pageContext.articlePage = Number.parseInt(String(pageNumber || ""), 10) || null;
  }

  const data = await resolvePageData(
    { organizationId: grant.organizationId, siteId: grant.siteId, snapshot: grant.snapshot, now, bases: detailBasesFromPages(grant.snapshot.pages) },
    [page.document],
    pageContext,
  );
  const path = segments.length ? `/${segments.join("/")}` : "/";
  const context = buildRenderContext({
    snapshot: grant.snapshot,
    page,
    data,
    pageContext,
    mode: "preview",
    origin: "",
    currentPath: path,
    pathPrefix: prefix,
  });
  return (
    <SiteDocument
      page={page}
      context={context}
      previewProbe={<EditorProbe pathPrefix={prefix} path={path} pageId={page.id} detail={detail || (DETAIL_KIND_BY_PAGE_KIND[page.kind] ?? null)} />}
    />
  );
}
