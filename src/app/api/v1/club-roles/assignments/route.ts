import {
  assignClubRole,
  listClubAccessAssignments,
} from "@/lib/server/club-roles";
import {
  errore,
  leggiCorpo,
  nonAutenticato,
  ok,
  risolviScope,
} from "../shared";

/**
 * **Chi ha accesso al club, e con che ruolo** (W6-2).
 *
 *   GET  /api/v1/club-roles/assignments   le persone, i ruoli, le voci di perimetro
 *   POST /api/v1/club-roles/assignments   assegna un ruolo a un'utenza
 *
 * E la rotta che sostituisce i tre nomi inventati con indirizzi `@example.com`
 * della vecchia schermata, e il token generato con `Math.random()` **nel
 * browser** e mai salvato. L'invito vero resta quello che esisteva gia:
 * `POST /api/v1/auth/access/redeem` per il riscatto, e la scheda della persona
 * per la consegna.
 */

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const risolto = await risolviScope(request);
    if (!risolto) return nonAutenticato();

    return ok(await listClubAccessAssignments(risolto.scope));
  } catch (error: any) {
    return errore(error, "Lettura degli accessi non riuscita");
  }
}

export async function POST(request: Request) {
  try {
    const risolto = await risolviScope(request);
    if (!risolto) return nonAutenticato();

    const corpo = await leggiCorpo(request);

    return ok(
      await assignClubRole(risolto.scope, {
        userId: String(corpo.user_id ?? corpo.userId ?? ""),
        role: String(corpo.role ?? ""),
        scopes: Array.isArray(corpo.scopes)
          ? corpo.scopes.map((voce: any) => ({
              kind: voce?.kind ?? null,
              value: voce?.value ?? null,
            }))
          : [],
        isPrimary: Boolean(corpo.is_primary ?? corpo.isPrimary),
      }),
      201,
    );
  } catch (error: any) {
    return errore(error, "Assegnazione del ruolo non riuscita");
  }
}
