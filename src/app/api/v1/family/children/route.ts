import { NextResponse } from "next/server";

import { requireAuthenticatedUser } from "@/lib/server/auth";
import { listParentChildren } from "@/lib/server/parent-dashboard";
import { publicErrorMessage } from "@/lib/server/api-errors";

/**
 * **Di quali figli posso parlare?**
 *
 * W6-12. E la sola domanda che la schermata di scelta deve fare, e la fa
 * **prima** che un figlio sia stato scelto: per questo non passa da
 * `/api/parent-dashboard/[athleteId]`, che di un figlio ha bisogno per esistere.
 *
 * Il gate e il **legame**, non il ruolo: `listParentChildren` risolve i figli di
 * chi chiede, e chi non ne ha collegati riceve un elenco vuoto — non un errore.
 * Un elenco vuoto e una risposta vera: significa «nessun figlio collegato a
 * questo account», che e esattamente cio che la schermata deve saper dire.
 *
 * Nessun parametro: non c'e niente da chiedere che non sia gia nella sessione,
 * e un identificativo che arrivasse dal client sarebbe solo un modo per
 * sbagliare.
 */
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        { data: null, error: { message: "Accesso negato: sessione assente" } },
        { status: 401 },
      );
    }

    const children = await listParentChildren(session.db.user_id);

    return NextResponse.json({ data: { children }, error: null });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message: publicErrorMessage(error, "Errore lettura dei figli collegati"),
        },
      },
      { status: 500 },
    );
  }
}
