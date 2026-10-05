import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { invalidateWebsiteData } from "@/lib/server/website/cache";
import { listMatchPlayerStats, saveMatchResult } from "@/lib/server/events";

/**
 * Il risultato di una gara: parziali e statistiche individuali (ADR-0200 §8). Scrive solo events.ts.
 *
 * Il guscio (`websiteRoute`) traduce sessione ed errori; l'autorizzazione la
 * fa il modulo chiamato: club attivo, permesso, stato del servizio.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: { id: string } };

export async function GET(request: Request, { params }: Context) {
  return websiteRoute(
    request,
    async ({ scope }) => {
      return listMatchPlayerStats(scope, params.id);
    },
  );
}

export async function PUT(request: Request, { params }: Context) {
  return websiteRoute(
    request,
    async ({ scope, userId, email }) => {
      const body = await readJsonBody(request);
      const result = await (async () => {
        return saveMatchResult(scope, params.id, body, { userId, email });
      })();
      invalidateWebsiteData(scope.activeOrganizationId);
      return result;
    },
  );
}
