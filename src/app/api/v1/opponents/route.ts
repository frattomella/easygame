import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { invalidateWebsiteData } from "@/lib/server/website/cache";
import { listOpponents, saveOpponent } from "@/lib/server/competitions";

/**
 * Gli avversari in anagrafica: elenco e salvataggio.
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
      return listOpponents(scope);
    },
  );
}

export async function POST(request: Request) {
  return websiteRoute(
    request,
    async ({ scope }) => {
      const body = await readJsonBody(request);
      const result = await (async () => {
        return saveOpponent(scope, body);
      })();
      invalidateWebsiteData(scope.activeOrganizationId);
      return result;
    },
  );
}
