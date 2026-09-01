import {
  readAthleteAccountState,
  revokeAthleteAccess,
  sendAthleteAccountInvite,
} from "@/lib/server/athlete-accounts";
import {
  errore,
  leggiCorpo,
  nonAutenticato,
  ok,
  risolviScope,
  type ContestoAtleta,
} from "../shared";

/**
 * **L'accesso EasyGame di un atleta, dalla parte del club** (W6-25/26/27).
 *
 *   GET    /api/v1/athlete-accounts/:athleteId   lo stato, per la scheda
 *   POST   /api/v1/athlete-accounts/:athleteId   invita
 *   DELETE /api/v1/athlete-accounts/:athleteId   revoca
 *
 * Il token non compare in **nessuna** di queste risposte, e non e una
 * dimenticanza: chi gestisce la scheda non deve poter entrare al posto
 * dell'atleta. Il link esiste solo dentro l'email, e in archivio ne resta solo
 * l'impronta (ADR-0085).
 */

export const runtime = "nodejs";

export async function GET(request: Request, context: ContestoAtleta) {
  try {
    const risolto = await risolviScope(request);
    if (!risolto) return nonAutenticato();

    return ok(
      await readAthleteAccountState(risolto.scope, context.params.athleteId),
    );
  } catch (error: any) {
    return errore(error, "Lettura dell'accesso atleta non riuscita");
  }
}

export async function POST(request: Request, context: ContestoAtleta) {
  try {
    const risolto = await risolviScope(request);
    if (!risolto) return nonAutenticato();

    const corpo = await leggiCorpo(request);

    return ok(
      await sendAthleteAccountInvite(risolto.scope, {
        athleteId: context.params.athleteId,
        email: String(corpo.email ?? ""),
      }),
      201,
    );
  } catch (error: any) {
    return errore(error, "Invio dell'invito non riuscito");
  }
}

export async function DELETE(request: Request, context: ContestoAtleta) {
  try {
    const risolto = await risolviScope(request);
    if (!risolto) return nonAutenticato();

    const url = new URL(request.url);

    return ok(
      await revokeAthleteAccess(risolto.scope, {
        athleteId: context.params.athleteId,
        reason: url.searchParams.get("reason"),
      }),
    );
  } catch (error: any) {
    return errore(error, "Revoca dell'accesso non riuscita");
  }
}
