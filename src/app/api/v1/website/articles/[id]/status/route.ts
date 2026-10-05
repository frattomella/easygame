import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { setArticleStatus } from "@/lib/server/website/articles";

/**
 * Pubblica, programma, riporta in bozza o archivia un articolo.
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
      return setArticleStatus(scope, params.id, { status: body.status, publishAt: body.publishAt, expectedVersion: body.expectedVersion }, request);
    },
  );
}
