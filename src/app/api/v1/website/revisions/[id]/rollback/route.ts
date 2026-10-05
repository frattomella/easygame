import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { rollbackToRevision } from "@/lib/server/website/publishing";

/**
 * Ripristina una versione pubblicata scrivendone una nuova: la storia non si riscrive.
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
      return rollbackToRevision(scope, { revisionId: params.id, idempotencyKey: body.idempotencyKey }, request);
    },
  );
}
