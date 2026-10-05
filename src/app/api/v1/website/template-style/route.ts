import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { applyTemplateStyle } from "@/lib/server/website/sites";

/**
 * Applica lo stile di un altro template senza toccare pagine e menu.
 *
 * Il guscio (`websiteRoute`) traduce sessione ed errori; l'autorizzazione la
 * fa il modulo chiamato: club attivo, permesso, stato del servizio.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return websiteRoute(
    request,
    async ({ scope }) => {
      const body = await readJsonBody(request);
      return applyTemplateStyle(scope, { templateKey: body.templateKey, expectedVersion: body.expectedVersion }, request);
    },
  );
}
