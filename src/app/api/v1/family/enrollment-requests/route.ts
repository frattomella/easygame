import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { publicErrorMessage } from "@/lib/server/api-errors";
import { listFamilyEnrollmentRequests } from "@/lib/server/enrollment-requests";

/**
 * Le domande di iscrizione e rinnovo **di questa famiglia** (Wave 5, lane 5G,
 * §16).
 *
 *   GET /api/v1/family/enrollment-requests?athlete_id=…
 *
 * E la stessa pratica che la ricevuta pubblica mostra, letta pero da chi ha un
 * account: qui c'e una sessione, quindi la risposta puo portare
 * l'identificativo della compilazione — che serve alla schermata dell'area
 * genitore (lane 5H) per aprirla.
 *
 * **Il gate e il legame, non il ruolo.** Un genitore collegato solo come
 * tutore puo non avere nessuna appartenenza al club: `roleHasPermission`
 * risponde `false` per lui, ed e il verso giusto in cui sbagliare. Il legame
 * lo verifica `resolveLinkedFamilyScope` dentro il servizio, e il club arriva
 * dalla riga dell'atleta — **mai** dal client.
 *
 * Non c'e un elenco senza atleta: chiederlo sarebbe chiedere le pratiche di
 * tutti.
 */

export const runtime = "nodejs";

const jsonError = (message: string, status: number) =>
  NextResponse.json({ data: null, error: { message } }, { status });

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return jsonError("Sessione non valida", 401);

    const athleteId = new URL(request.url).searchParams.get("athlete_id") || "";
    if (!athleteId) return jsonError("Indica l'atleta", 400);

    const data = await listFamilyEnrollmentRequests(
      session.db.user_id,
      athleteId,
    );

    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    const message = publicErrorMessage(error, "Lettura delle domande non riuscita");
    return jsonError(
      message,
      message.includes("Accesso negato")
        ? 403
        : /non trovat[oa]/i.test(message)
          ? 404
          : 400,
    );
  }
}
