import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { restoreDraftFromRevision } from "@/lib/server/website/publishing";

/**
 * Riporta nella bozza il contenuto di una versione pubblicata.
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
      const body = await readJsonBody(request);
      return restoreDraftFromRevision(scope, { revisionId: params.id, expectedVersion: body.expectedVersion });
    },
  );
}
