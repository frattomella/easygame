import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { createArticle, listArticles } from "@/lib/server/website/articles";

/**
 * Le news del sito: elenco e creazione.
 *
 * Il guscio (`websiteRoute`) traduce sessione ed errori; l'autorizzazione la
 * fa il modulo chiamato: club attivo, permesso, stato del servizio.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return websiteRoute(
    request,
    async ({ scope }) => {
      const url = new URL(request.url);
      return listArticles(scope, { status: url.searchParams.get("status"), q: url.searchParams.get("q"), category: url.searchParams.get("category") });
    },
  );
}

export async function POST(request: Request) {
  return websiteRoute(
    request,
    async ({ scope }) => {
      const body = await readJsonBody(request);
      return createArticle(scope, body);
    },
    { status: 201 },
  );
}
