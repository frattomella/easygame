import { readJsonBody, websiteRoute } from "@/lib/server/website/route";
import { getEditorOptions } from "@/lib/server/website/editor-options";

/**
 * Le scelte dei selettori dell'editor: squadre, stagioni, competizioni, moduli, persone pubblicate.
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
      return getEditorOptions(scope);
    },
  );
}
