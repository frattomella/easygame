import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { invalidateWebsiteData } from "@/lib/server/website/cache";
import { listCompetitions, saveCompetition } from "@/lib/server/competitions";

/**
 * Le competizioni del club: elenco e salvataggio (con la classifica inserita dal club).
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
      return listCompetitions(scope, { seasonId: url.searchParams.get("seasonId") });
    },
  );
}

export async function POST(request: Request) {
  return websiteRoute(
    request,
    async ({ scope }) => {
      const body = await readJsonBody(request);
      const result = await (async () => {
        return saveCompetition(scope, body);
      })();
      invalidateWebsiteData(scope.activeOrganizationId);
      return result;
    },
  );
}
