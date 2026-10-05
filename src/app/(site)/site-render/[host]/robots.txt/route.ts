import { loadPublishedSnapshot, resolvePublicHost } from "@/lib/server/website/public-site";

/**
 * Il `robots.txt` del dominio di un club. Un sito pubblicato si lascia
 * indicizzare (salvo che il club l'abbia spento) e dichiara la sua sitemap;
 * un host sconosciuto o non pronto chiede di non indicizzare niente. Le rotte
 * tecniche non si indicizzano mai.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: { host: string } };

export async function GET(_request: Request, { params }: Context) {
  const host = await resolvePublicHost(decodeURIComponent(params.host));
  const headers = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" };
  if (host.status !== "ok") return new Response("User-agent: *\nDisallow: /\n", { headers });
  const snapshot = await loadPublishedSnapshot(host.siteId, host.revisionId);
  if (!snapshot || snapshot.seo.noindex) return new Response("User-agent: *\nDisallow: /\n", { headers });
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /site-render/",
    "Disallow: /website-preview/",
    `Sitemap: https://${host.primaryHostname}/sitemap.xml`,
    "",
  ].join("\n");
  return new Response(body, { headers });
}
