import { listSponsorsWithCredit } from "@/lib/server/sponsors";
import { failure, ok, resolveSponsorScope } from "./http";

/**
 * Gli sponsor del club, ognuno con le sue **tre cifre**.
 *
 *   GET /api/v1/sponsorships  ->  [{ sponsor, credit }]
 *
 * ---
 *
 * ## Il difetto che chiude
 *
 * `listSponsorsWithCredit` era scritta, collaudata e **senza nessun
 * chiamante**. L'elenco degli sponsor calcolava quindi il residuo nel browser,
 * e da una fonte sola: la vecchia collezione JSON. Da quando un incasso di
 * sponsorizzazione e una riga del registro degli incassi, quella collezione e
 * la piu vecchia delle due — e uno sponsor che aveva appena pagato 2.000 su
 * 5.000 compariva con residuo **5.000** nell'elenco e **3.000** nella sua
 * scheda.
 *
 * Due schermate della stessa applicazione, due risposte alla stessa domanda.
 * E il difetto che questa Wave ha passato mesi a togliere altrove.
 *
 * ## Perche il residuo lo calcola il server
 *
 * Perche le fonti sono due e solo il server le conosce entrambe, e sa perche
 * non si sommano due volte: sono disgiunte per costruzione, dato che un incasso
 * nuovo non scrive piu nel JSON. Una pagina che ne vedesse una sola direbbe un
 * numero sbagliato con la faccia di uno giusto.
 */

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const organizationId =
      url.searchParams.get("organization_id") ||
      url.searchParams.get("organizationId");
    const resolved = await resolveSponsorScope(request, organizationId);
    if (resolved.response) return resolved.response;

    const sponsors = await listSponsorsWithCredit(
      { organizationId },
      resolved.scope,
    );

    return ok({ sponsors });
  } catch (error: any) {
    return failure(error, "Lettura degli sponsor non riuscita");
  }
}
