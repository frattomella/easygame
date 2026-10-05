import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { listSponsorShowcaseForEditor } from "@/lib/server/website/sponsors-showcase";

/**
 * Gli sponsor del club con la loro vetrina sul sito e i livelli.
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
      return listSponsorShowcaseForEditor(scope);
    },
  );
}
