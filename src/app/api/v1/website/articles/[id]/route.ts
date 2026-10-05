import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { deleteArticle, getArticle, updateArticle } from "@/lib/server/website/articles";

/**
 * Un articolo: lettura, modifica con la versione letta, eliminazione.
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
      return getArticle(scope, params.id);
    },
  );
}

export async function PATCH(request: Request, { params }: Context) {
  return websiteRoute(
    request,
    async ({ scope }) => {
      const body = await readJsonBody(request);
      return updateArticle(scope, params.id, body as any);
    },
  );
}

export async function DELETE(request: Request, { params }: Context) {
  return websiteRoute(
    request,
    async ({ scope }) => {
      return deleteArticle(scope, params.id, request);
    },
  );
}
