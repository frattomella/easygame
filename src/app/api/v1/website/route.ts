import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { createWebsite, getWebsiteOverview } from "@/lib/server/website/sites";

/**
 * Il sito della societa: panoramica (stato del servizio, bozza, pagine, domini, pubblicazione) e creazione da template (ADR-0200).
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
      return getWebsiteOverview(scope);
    },
  );
}

export async function POST(request: Request) {
  return websiteRoute(
    request,
    async ({ scope }) => {
      const body = await readJsonBody(request);
      return createWebsite(scope, body as any, request);
    },
    { status: 201 },
  );
}
