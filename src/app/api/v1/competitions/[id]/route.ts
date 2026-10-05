import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { invalidateWebsiteData } from "@/lib/server/website/cache";
import { deleteCompetition } from "@/lib/server/competitions";

/**
 * Elimina una competizione: le gare restano, senza competizione.
 *
 * Il guscio (`websiteRoute`) traduce sessione ed errori; l'autorizzazione la
 * fa il modulo chiamato: club attivo, permesso, stato del servizio.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: { id: string } };

export async function DELETE(request: Request, { params }: Context) {
  return websiteRoute(
    request,
    async ({ scope }) => {
      const result = await (async () => {
        return deleteCompetition(scope, params.id);
      })();
      invalidateWebsiteData(scope.activeOrganizationId);
      return result;
    },
  );
}
