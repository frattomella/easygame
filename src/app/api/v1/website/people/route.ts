import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { listPublicationCandidates, savePersonPublication } from "@/lib/server/website/people";

/**
 * Chi compare sul sito: elenco delle persone con lo stato del consenso alle immagini, e salvataggio della pubblicazione.
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
      return listPublicationCandidates(scope, { kind: url.searchParams.get("kind"), q: url.searchParams.get("q") });
    },
  );
}

export async function PUT(request: Request) {
  return websiteRoute(
    request,
    async ({ scope }) => {
      const body = await readJsonBody(request);
      return savePersonPublication(scope, { personKind: body.personKind, personId: body.personId, settings: body.settings }, request);
    },
  );
}
