import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { invalidateWebsiteData } from "@/lib/server/website/cache";
import { createClubTeam, listClubTeams } from "@/lib/server/club-teams";

/**
 * Le squadre stabili del club (ADR-0200 §8): elenco e creazione.
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
      return listClubTeams(scope);
    },
  );
}

export async function POST(request: Request) {
  return websiteRoute(
    request,
    async ({ scope }) => {
      const body = await readJsonBody(request);
      const result = await (async () => {
        return createClubTeam(scope, body);
      })();
      invalidateWebsiteData(scope.activeOrganizationId);
      return result;
    },
    { status: 201 },
  );
}
