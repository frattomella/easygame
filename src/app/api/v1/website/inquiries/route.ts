import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { listInquiries } from "@/lib/server/website/inquiries";

/**
 * La casella del modulo contatti del sito.
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
      const url = new URL(request.url);
      return listInquiries(scope, { status: url.searchParams.get("status") });
    },
  );
}
