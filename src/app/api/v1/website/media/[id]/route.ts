import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { deleteWebsiteMedia, updateWebsiteMediaMeta } from "@/lib/server/website/media";

/**
 * Un'immagine della libreria: metadati (alt, titolo, punto focale) ed eliminazione se non e in uso.
 *
 * Il guscio (`websiteRoute`) traduce sessione ed errori; l'autorizzazione la
 * fa il modulo chiamato: club attivo, permesso, stato del servizio.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: { id: string } };

export async function PATCH(request: Request, { params }: Context) {
  return websiteRoute(
    request,
    async ({ scope }) => {
      const body = await readJsonBody(request);
      return updateWebsiteMediaMeta(scope, params.id, body);
    },
  );
}

export async function DELETE(request: Request, { params }: Context) {
  return websiteRoute(
    request,
    async ({ scope }) => {
      return deleteWebsiteMedia(scope, params.id, request);
    },
  );
}
