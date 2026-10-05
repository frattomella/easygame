import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { savePageDocument } from "@/lib/server/website/pages";

/**
 * Il documento di una pagina (sezioni e blocchi). La versione e obbligatoria: un conflitto risponde 409.
 *
 * Il guscio (`websiteRoute`) traduce sessione ed errori; l'autorizzazione la
 * fa il modulo chiamato: club attivo, permesso, stato del servizio.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: { id: string } };

export async function PUT(request: Request, { params }: Context) {
  return websiteRoute(
    request,
    async ({ scope }) => {
      const body = await readJsonBody(request);
      return savePageDocument(scope, params.id, { expectedVersion: body.expectedVersion, document: body.document });
    },
  );
}
