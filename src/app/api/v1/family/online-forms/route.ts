import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { publicErrorMessage } from "@/lib/server/api-errors";
import { listFamilyOnlineForms } from "@/lib/server/enrollment-requests";

/**
 * **I moduli online del club, con lo stato di questo figlio** (PP-02 §G).
 *
 *   GET /api/v1/family/online-forms?athlete_id=…
 *
 * L'area «Moduli online» del fascicolo era un rimando alla pagina Iscrizione:
 * il posto era giusto — i moduli vivono li, e ospitarli due volte sarebbe la
 * seconda implementazione di un dominio che ne ha gia una — ma la card non
 * rispondeva alla domanda per cui esiste, «cosa mi manca e cosa ho gia fatto».
 *
 * **Il gate e il legame, non il ruolo**, come per le pratiche: lo verifica
 * `resolveLinkedFamilyScope` dentro il servizio, e il club arriva dalla riga
 * dell'atleta — mai dal client. Non c'e un elenco senza atleta: chiederlo
 * sarebbe chiedere i moduli di tutti.
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

    const data = await listFamilyOnlineForms(session.db.user_id, athleteId);

    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    const message = publicErrorMessage(
      error,
      "Lettura dei moduli online non riuscita",
    );
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
