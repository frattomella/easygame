import { changeAthleteAccountEmail } from "@/lib/server/athlete-accounts";
import {
  errore,
  leggiCorpo,
  nonAutenticato,
  ok,
  risolviScope,
  type ContestoAtleta,
} from "../../shared";

/**
 * Il cambio dell'indirizzo a cui l'invito e stato mandato.
 *
 * Vale solo **prima** che l'accesso sia attivo: dopo, quell'indirizzo e
 * l'identita dell'utenza di una persona, e spostarla dalla scheda del club
 * vorrebbe dire cambiare l'account di qualcuno senza che quel qualcuno lo
 * sappia. Il dominio rifiuta, e la scheda propone invece revoca e nuovo
 * invito.
 */

export const runtime = "nodejs";

export async function POST(request: Request, context: ContestoAtleta) {
  try {
    const risolto = await risolviScope(request);
    if (!risolto) return nonAutenticato();

    const corpo = await leggiCorpo(request);

    return ok(
      await changeAthleteAccountEmail(risolto.scope, {
        athleteId: context.params.athleteId,
        email: String(corpo.email ?? ""),
      }),
    );
  } catch (error: any) {
    return errore(error, "Cambio dell'indirizzo non riuscito");
  }
}
