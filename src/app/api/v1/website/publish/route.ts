import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { getPublicationStatus, publishSite } from "@/lib/server/website/publishing";

/**
 * Lo stato della pubblicazione (controlli, modifiche non pubblicate) e la pubblicazione con chiave di idempotenza.
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
      return getPublicationStatus(scope);
    },
  );
}

export async function POST(request: Request) {
  return websiteRoute(
    request,
    async ({ scope }) => {
      const body = await readJsonBody(request);
      return publishSite(scope, { idempotencyKey: body.idempotencyKey, note: body.note }, request);
    },
  );
}
