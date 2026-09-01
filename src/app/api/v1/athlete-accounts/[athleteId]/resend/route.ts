import { resendAthleteAccountInvite } from "@/lib/server/athlete-accounts";
import {
  errore,
  nonAutenticato,
  ok,
  risolviScope,
  type ContestoAtleta,
} from "../../shared";

/**
 * Il reinvio dell'invito.
 *
 * **Una rotta propria e non un `PATCH` sulla precedente**, perche non e una
 * modifica: revoca il token che gira e ne emette uno nuovo. Chi legge l'audit
 * deve poter distinguere «ha rimandato» da «ha cambiato indirizzo», e sono due
 * righe diverse proprio perche sono due gesti diversi.
 */

export const runtime = "nodejs";

export async function POST(request: Request, context: ContestoAtleta) {
  try {
    const risolto = await risolviScope(request);
    if (!risolto) return nonAutenticato();

    return ok(
      await resendAthleteAccountInvite(risolto.scope, {
        athleteId: context.params.athleteId,
      }),
    );
  } catch (error: any) {
    return errore(error, "Reinvio dell'invito non riuscito");
  }
}
