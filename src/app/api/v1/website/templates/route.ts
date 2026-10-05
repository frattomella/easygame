import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { listTemplates } from "@/lib/website/templates";
import { requireWebsiteAccess } from "@/lib/server/website/access";

/**
 * La galleria dei template del sito.
 *
 * Il guscio (`websiteRoute`) traduce sessione ed errori; l'autorizzazione la
 * fa il modulo chiamato: club attivo, permesso, stato del servizio.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return websiteRoute(
    request,
    async ({ scope }) => {
      await requireWebsiteAccess(scope, "website.read", "read");
      return listTemplates();
    },
  );
}
