import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { invalidateWebsiteData } from "@/lib/server/website/cache";
import { saveMatchSportDetails } from "@/lib/server/events";

/**
 * Squadra, competizione, avversario e giornata di una gara.
 *
 * Il guscio (`websiteRoute`) traduce sessione ed errori; l'autorizzazione la
 * fa il modulo chiamato: club attivo, permesso, stato del servizio.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: { id: string } };

export async function PUT(request: Request, { params }: Context) {
  return websiteRoute(
    request,
    async ({ scope, userId, email }) => {
      const body = await readJsonBody(request);
      const result = await (async () => {
        return saveMatchSportDetails(scope, params.id, body, { userId, email });
      })();
      invalidateWebsiteData(scope.activeOrganizationId);
      return result;
    },
  );
}
