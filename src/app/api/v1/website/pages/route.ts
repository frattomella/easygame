import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { createPage, listPages } from "@/lib/server/website/pages";

/**
 * Le pagine in bozza: elenco e creazione (vuota o duplicata).
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
      return listPages(scope);
    },
  );
}

export async function POST(request: Request) {
  return websiteRoute(
    request,
    async ({ scope }) => {
      const body = await readJsonBody(request);
      return createPage(scope, body as any, request);
    },
    { status: 201 },
  );
}
