import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { reorderPages } from "@/lib/server/website/pages";

/**
 * L'ordine delle pagine nell'elenco dell'editor.
 *
 * Il guscio (`websiteRoute`) traduce sessione ed errori; l'autorizzazione la
 * fa il modulo chiamato: club attivo, permesso, stato del servizio.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  return websiteRoute(
    request,
    async ({ scope }) => {
      const body = await readJsonBody(request);
      return reorderPages(scope, body.pageIds);
    },
  );
}
