import { unlinkGuardianAccount } from "@/lib/server/profile-account-links";
import {
  errore,
  nonAutenticato,
  ok,
  risolviScope,
  type ContestoGenitore,
} from "./shared";

/**
 * `DELETE /api/v1/guardian-accounts/:athleteId/:guardianId` — scollega
 * l'utenza dal genitore **indicato** di questo atleta, e nient'altro.
 *
 * Sostituisce la coppia di chiamate client (`PATCH /api/v1/access_tokens/:id`
 * + il salvataggio dell'intera scheda atleta) con una scrittura sola, lato
 * server, auditata (correzione Fortitudo Scauri, 2026-09-03).
 */

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  context: ContestoGenitore,
) {
  try {
    const risolto = await risolviScope(request);
    if (!risolto) return nonAutenticato();

    const url = new URL(request.url);

    return ok(
      await unlinkGuardianAccount(risolto.scope, {
        athleteId: context.params.athleteId,
        guardianId: context.params.guardianId,
        reason: url.searchParams.get("reason"),
      }),
    );
  } catch (error: any) {
    return errore(error, "Scollegamento del genitore non riuscito");
  }
}
