import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import {
  readAthleteAreaOverview,
  updateOwnAthleteContacts,
} from "@/lib/server/athlete-accounts";

/**
 * **L'area dell'atleta che sta chiedendo, e di nessun altro.**
 *
 * ## Perche non prende un identificativo
 *
 * Perche non c'e niente da scegliere. L'atleta e **se stesso**: la scheda si
 * risolve da `athletes.user_id = <la sua utenza>`, e non esiste un parametro
 * da cambiare per farla diventare la scheda di un altro. E la stessa forma di
 * `GET /api/v1/sport-work/me`: una domanda diversa, non un elenco ristretto.
 *
 * ## Il gate e il legame, non il ruolo
 *
 * Come per l'area famiglia. Un `activeRole` che valesse `athlete` non
 * proverebbe niente su **quale** atleta; il legame lo prova, ed e l'unica cosa
 * che qui nega. Chi non ha una scheda collegata riceve un 403.
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

    const data = await readAthleteAreaOverview(session.db.user_id);
    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    const messaggio = String(error?.message || "Lettura area atleta non riuscita");
    return NextResponse.json(
      { data: null, error: { message: messaggio } },
      { status: messaggio.includes("Accesso negato") ? 403 : 400 },
    );
  }
}

/**
 * I propri recapiti.
 *
 * L'elenco dei campi scrivibili sta nel dominio e non qui: una rotta che
 * decidesse da se cosa passare sarebbe una seconda dichiarazione della stessa
 * regola, e la seconda resterebbe indietro.
 */
export async function PATCH(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        { data: null, error: { message: "Accesso negato: sessione assente" } },
        { status: 401 },
      );
    }

    const corpo = await request
      .json()
      .catch(() => ({}) as Record<string, unknown>);

    const data = await updateOwnAthleteContacts(session.db.user_id, corpo);
    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    const messaggio = String(error?.message || "Aggiornamento non riuscito");
    return NextResponse.json(
      { data: null, error: { message: messaggio } },
      { status: messaggio.includes("Accesso negato") ? 403 : 400 },
    );
  }
}
