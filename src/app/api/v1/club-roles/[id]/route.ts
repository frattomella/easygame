import { deleteClubRole, updateClubRole } from "@/lib/server/club-roles";
import {
  errore,
  leggiCorpo,
  nonAutenticato,
  ok,
  risolviScope,
  type ContestoId,
} from "../shared";

/**
 * Un ruolo personalizzato: modifica e cancellazione. Entrambe **del solo
 * proprietario** (§10.4).
 *
 *   PATCH  /api/v1/club-roles/:id   nome, descrizione, chiavi, attivo
 *   DELETE /api/v1/club-roles/:id   solo se non lo porta nessuno
 *
 * Il **ruolo base** non compare fra i campi modificabili, e non e una svista:
 * e lo slug, ed e il tetto. Cambiarlo cambierebbe i permessi di chi lo porta
 * senza che nessuno abbia toccato la sua tessera.
 */

export const runtime = "nodejs";

export async function PATCH(request: Request, context: ContestoId) {
  try {
    const risolto = await risolviScope(request);
    if (!risolto) return nonAutenticato();

    const corpo = await leggiCorpo(request);

    return ok(
      await updateClubRole(risolto.scope, context.params.id, {
        name: corpo.name === undefined ? undefined : String(corpo.name),
        description:
          corpo.description === undefined
            ? undefined
            : corpo.description == null
              ? null
              : String(corpo.description),
        permissions: Array.isArray(corpo.permissions)
          ? corpo.permissions.map((chiave: unknown) => String(chiave))
          : undefined,
        isActive:
          corpo.is_active === undefined && corpo.isActive === undefined
            ? undefined
            : Boolean(corpo.is_active ?? corpo.isActive),
      }),
    );
  } catch (error: any) {
    return errore(error, "Modifica del ruolo non riuscita");
  }
}

export async function DELETE(request: Request, context: ContestoId) {
  try {
    const risolto = await risolviScope(request);
    if (!risolto) return nonAutenticato();

    return ok(await deleteClubRole(risolto.scope, context.params.id));
  } catch (error: any) {
    return errore(error, "Cancellazione del ruolo non riuscita");
  }
}
