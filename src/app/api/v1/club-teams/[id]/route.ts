import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { invalidateWebsiteData } from "@/lib/server/website/cache";
import { deleteClubTeam, updateClubTeam } from "@/lib/server/club-teams";

/**
 * Una squadra: modifica (anche dello slug, con lo storico) ed eliminazione.
 *
 * Il guscio (`websiteRoute`) traduce sessione ed errori; l'autorizzazione la
 * fa il modulo chiamato: club attivo, permesso, stato del servizio.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: { id: string } };

export async function PATCH(request: Request, { params }: Context) {
  return websiteRoute(
    request,
    async ({ scope }) => {
      const body = await readJsonBody(request);
      const result = await (async () => {
        return updateClubTeam(scope, params.id, body);
      })();
      invalidateWebsiteData(scope.activeOrganizationId);
      return result;
    },
  );
}

export async function DELETE(request: Request, { params }: Context) {
  return websiteRoute(
    request,
    async ({ scope }) => {
      const result = await (async () => {
        return deleteClubTeam(scope, params.id);
      })();
      invalidateWebsiteData(scope.activeOrganizationId);
      return result;
    },
  );
}
