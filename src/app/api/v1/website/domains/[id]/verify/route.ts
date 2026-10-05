import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { verifyDomain } from "@/lib/server/website/domains";

/**
 * Verifica un dominio: TXT di proprieta, poi instradamento e certificato dal provider.
 *
 * Il guscio (`websiteRoute`) traduce sessione ed errori; l'autorizzazione la
 * fa il modulo chiamato: club attivo, permesso, stato del servizio.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: { id: string } };

export async function POST(request: Request, { params }: Context) {
  return websiteRoute(
    request,
    async ({ scope }) => {
      return verifyDomain(scope, params.id, request);
    },
  );
}
