import { unlinkAthleteAccount } from "@/lib/server/athlete-accounts";
import {
  errore,
  leggiCorpo,
  nonAutenticato,
  ok,
  risolviScope,
  type ContestoAtleta,
} from "../../shared";

/**
 * `DELETE /api/v1/athlete-accounts/:athleteId/link` — scollega l'utenza dalla
 * scheda di questo atleta, **senza** revocare la tessera `athlete` di
 * `organization_users` (correzione Fortitudo Scauri, 2026-09-03).
 *
 * Distinta da `DELETE /api/v1/athlete-accounts/:athleteId`
 * (`revokeAthleteAccess`), che resta la revoca **completa** — tessera e
 * invito compresi — per chi decide che l'atleta non ha piu accesso al club.
 */

export const runtime = "nodejs";

export async function DELETE(request: Request, context: ContestoAtleta) {
  try {
    const risolto = await risolviScope(request);
    if (!risolto) return nonAutenticato();

    const corpo = await leggiCorpo(request);

    return ok(
      await unlinkAthleteAccount(risolto.scope, {
        athleteId: context.params.athleteId,
        reason: typeof corpo.reason === "string" ? corpo.reason : null,
      }),
    );
  } catch (error: any) {
    return errore(error, "Scollegamento dell'atleta non riuscito");
  }
}
