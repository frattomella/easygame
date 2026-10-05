import { buildSitemapEntries, loadPublishedSnapshot, resolvePublicHost } from "@/lib/server/website/public-site";

/**
 * La `sitemap.xml` del dominio di un club: le pagine pubblicate (non quelle
 * `noindex`, non i modelli di dettaglio in se), gli articoli pubblicati e le
 * squadre attive. Sempre sul dominio principale.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: { host: string } };

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function GET(_request: Request, { params }: Context) {
  const host = await resolvePublicHost(decodeURIComponent(params.host));
  if (host.status !== "ok") return new Response("Not found", { status: 404 });
  const snapshot = await loadPublishedSnapshot(host.siteId, host.revisionId);
  if (!snapshot || snapshot.seo.noindex) return new Response("Not found", { status: 404 });
  const urls = await buildSitemapEntries(host.organizationId, host.siteId, snapshot, `https://${host.primaryHostname}`);
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((url) => `  <url><loc>${escapeXml(url.loc)}</loc>${url.lastmod ? `<lastmod>${url.lastmod}</lastmod>` : ""}</url>`)
    .join("\n")}\n</urlset>\n`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
