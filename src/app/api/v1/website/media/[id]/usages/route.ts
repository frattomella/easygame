import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { getWebsiteMediaUsages } from "@/lib/server/website/media";

/**
 * Dove e usata un'immagine.
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
      return getWebsiteMediaUsages(scope, params.id);
    },
  );
}
