import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { setInquiryStatus } from "@/lib/server/website/inquiries";

/**
 * Lo stato di una richiesta (nuova, gestita, archiviata).
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
      return setInquiryStatus(scope, params.id, body.status);
    },
  );
}
