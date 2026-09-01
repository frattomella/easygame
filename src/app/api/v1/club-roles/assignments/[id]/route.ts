import {
  revokeClubAccess,
  updateAssignmentScopes,
} from "@/lib/server/club-roles";
import {
  errore,
  leggiCorpo,
  nonAutenticato,
  ok,
  risolviScope,
  type ContestoId,
} from "../../shared";

/**
 * Un accesso gia concesso: perimetro e revoca.
 *
 *   PATCH  /api/v1/club-roles/assignments/:id   sostituisce il perimetro
 *   DELETE /api/v1/club-roles/assignments/:id   revoca l'accesso
 *
 * Il perimetro si scrive per **sostituzione**, e un elenco vuoto significa
 * «tutto il club»: e la stessa convenzione della tabella, dove zero righe non
 * sono zero accessi ma nessuna restrizione.
 */

export const runtime = "nodejs";

export async function PATCH(request: Request, context: ContestoId) {
  try {
    const risolto = await risolviScope(request);
    if (!risolto) return nonAutenticato();

    const corpo = await leggiCorpo(request);

    return ok(
      await updateAssignmentScopes(
        risolto.scope,
        context.params.id,
        Array.isArray(corpo.scopes)
          ? corpo.scopes.map((voce: any) => ({
              kind: voce?.kind ?? null,
              value: voce?.value ?? null,
            }))
          : [],
      ),
    );
  } catch (error: any) {
    return errore(error, "Modifica del perimetro non riuscita");
  }
}

export async function DELETE(request: Request, context: ContestoId) {
  try {
    const risolto = await risolviScope(request);
    if (!risolto) return nonAutenticato();

    return ok(await revokeClubAccess(risolto.scope, context.params.id));
  } catch (error: any) {
    return errore(error, "Revoca dell'accesso non riuscita");
  }
}
