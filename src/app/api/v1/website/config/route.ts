import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { updateSiteConfig } from "@/lib/server/website/sites";

/**
 * La configurazione in bozza (tema, intestazione, piede, menu, SEO, impostazioni), con la versione letta.
 *
 * Il guscio (`websiteRoute`) traduce sessione ed errori; l'autorizzazione la
 * fa il modulo chiamato: club attivo, permesso, stato del servizio.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  return websiteRoute(
    request,
    async ({ scope }) => {
      const body = await readJsonBody(request);
      return updateSiteConfig(scope, body as any, request);
    },
  );
}
