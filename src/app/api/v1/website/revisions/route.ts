import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { listRevisions } from "@/lib/server/website/publishing";

/**
 * Le versioni pubblicate, la piu recente per prima.
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
      return listRevisions(scope);
    },
  );
}
