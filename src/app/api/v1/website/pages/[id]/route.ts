import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { deletePage, getPage, updatePageMeta } from "@/lib/server/website/pages";

/**
 * Una pagina: lettura, titolo/slug/SEO con la versione letta, eliminazione.
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
      return getPage(scope, params.id);
    },
  );
}

export async function PATCH(request: Request, { params }: Context) {
  return websiteRoute(
    request,
    async ({ scope }) => {
      const body = await readJsonBody(request);
      return updatePageMeta(scope, params.id, body as any, request);
    },
  );
}

export async function DELETE(request: Request, { params }: Context) {
  return websiteRoute(
    request,
    async ({ scope }) => {
      return deletePage(scope, params.id, request);
    },
  );
}
