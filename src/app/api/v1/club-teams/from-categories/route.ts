import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { invalidateWebsiteData } from "@/lib/server/website/cache";
import { createTeamsFromSeasonCategories } from "@/lib/server/club-teams";

/**
 * Crea le squadre dalle categorie della stagione che non ne hanno ancora una.
 *
 * Il guscio (`websiteRoute`) traduce sessione ed errori; l'autorizzazione la
 * fa il modulo chiamato: club attivo, permesso, stato del servizio.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return websiteRoute(
    request,
    async ({ scope }) => {
      const body = await readJsonBody(request);
      const result = await (async () => {
        return createTeamsFromSeasonCategories(scope, body.seasonId);
      })();
      invalidateWebsiteData(scope.activeOrganizationId);
      return result;
    },
  );
}
