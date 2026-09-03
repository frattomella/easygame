import { unlinkTrainerAccount } from "@/lib/server/profile-account-links";
import {
  errore,
  nonAutenticato,
  ok,
  risolviScope,
  type ContestoAllenatore,
} from "./shared";

/**
 * `DELETE /api/v1/trainer-accounts/:trainerId` — scollega l'utenza dalla
 * scheda **di questo** allenatore, e nient'altro.
 *
 * Non e `DELETE /api/v1/organization_users/:id`: quella rotta resta l'unica a
 * cui la tessera di club risponde, e la revoca la fa la Gestione Accessi
 * (correzione Fortitudo Scauri, 2026-09-03).
 */

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  context: ContestoAllenatore,
) {
  try {
    const risolto = await risolviScope(request);
    if (!risolto) return nonAutenticato();

    const url = new URL(request.url);

    return ok(
      await unlinkTrainerAccount(risolto.scope, {
        trainerId: context.params.trainerId,
        reason: url.searchParams.get("reason"),
      }),
    );
  } catch (error: any) {
    return errore(error, "Scollegamento dell'allenatore non riuscito");
  }
}
