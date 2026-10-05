import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { unpublishSite } from "@/lib/server/website/publishing";

/**
 * Ritira il sito dal pubblico senza cancellare niente.
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
      return unpublishSite(scope, request);
    },
  );
}
