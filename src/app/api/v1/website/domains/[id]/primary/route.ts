import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { setPrimaryDomain } from "@/lib/server/website/domains";

/**
 * Imposta il dominio principale: gli altri reindirizzano qui.
 *
 * Il guscio (`websiteRoute`) traduce sessione ed errori; l'autorizzazione la
 * fa il modulo chiamato: club attivo, permesso, stato del servizio.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: { id: string } };

export async function POST(request: Request, { params }: Context) {
  return websiteRoute(
    request,
    async ({ scope }) => {
      return setPrimaryDomain(scope, params.id, request);
    },
  );
}
