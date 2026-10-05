import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { removeDomain } from "@/lib/server/website/domains";

/**
 * Rimuove un dominio (solo il proprietario).
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
      return removeDomain(scope, params.id, request);
    },
  );
}
