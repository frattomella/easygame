import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { addDomain, listDomains } from "@/lib/server/website/domains";

/**
 * I domini del sito: elenco (con i record DNS) e aggiunta. Aggiungere e del solo proprietario.
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
      return listDomains(scope);
    },
  );
}

export async function POST(request: Request) {
  return websiteRoute(
    request,
    async ({ scope }) => {
      const body = await readJsonBody(request);
      return addDomain(scope, { hostname: body.hostname }, request);
    },
    { status: 201 },
  );
}
