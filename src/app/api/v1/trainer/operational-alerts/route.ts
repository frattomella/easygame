import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { isTrainerAccessRole } from "@/lib/access-roles";
import {
  computeTrainerOperationalAlerts,
  syncTrainerOperationalAlerts,
} from "@/lib/server/trainer-area";

/**
 * **Gli avvisi operativi dell'allenatore: adesso la rotta calcola, non riceve.**
 *
 * Prima il corpo della richiesta portava gli avvisi gia confezionati —
 * `{ alerts: [{ key, type, title, message, recordId, actionHref }] }` — e
 * questa rotta li normalizzava e li persisteva. L'unico controllo era che il
 * `type` fosse uno dei due ammessi: **titolo, testo, record e link li dettava
 * il client**. Da li discendevano tre cose, tutte vere insieme:
 *
 * - una notifica con il testo che si vuole, riferita a un evento qualsiasi;
 * - un avviso vero **spento** semplicemente non mandandolo, perche la rotta
 *   segna risolto tutto cio che non riceve;
 * - e, meno appariscente ma peggiore, il fatto che l'unica copia della regola
 *   «questa presenza manca» vivesse nel browser: chi non apriva la dashboard
 *   non aveva notifiche, e il club non aveva modo di saperlo.
 *
 * Adesso il contenuto lo calcola `src/lib/server/trainer-area.ts` dai dati del
 * club, con il perimetro applicato da `listClubEvents`. Il corpo della
 * richiesta **non viene letto**: non e ignorato per pigrizia, e che non esiste
 * piu niente che il client possa dire su questo fatto.
 *
 *   GET   ...  calcola e restituisce, senza scrivere
 *   POST  ...  calcola, allinea le notifiche persistite, e restituisce
 *
 * La risposta conserva `synced`, che era l'unico campo che il contesto
 * leggeva, e vi affianca `alerts`: cosi la dashboard disegna cio che il server
 * ha calcolato invece della propria copia.
 */

const scopeFrom = async (request: Request, userId: string) =>
  resolveOrganizationScopeForUser(
    userId,
    request.headers.get("x-active-club-id") ||
      request.headers.get("x-organization-id"),
    request.headers.get("x-active-access-role"),
  );

const errorStatus = (error: any) =>
  String(error?.message || "").includes("Accesso negato") ? 403 : 400;

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        { data: null, error: { message: "Sessione non valida" } },
        { status: 401 },
      );
    }

    const scope = await scopeFrom(request, session.db.user_id);
    if (!scope.activeOrganizationId || !isTrainerAccessRole(scope.activeRole)) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Accesso negato: area allenatore" },
        },
        { status: 403 },
      );
    }

    const alerts = await computeTrainerOperationalAlerts(scope);

    return NextResponse.json({
      data: { alerts, synced: 0 },
      error: null,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error?.message || "Errore calcolo avvisi allenatore",
        },
      },
      { status: errorStatus(error) },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        { data: null, error: { message: "Non autenticato" } },
        { status: 401 },
      );
    }

    const scope = await scopeFrom(request, session.db.user_id);
    if (!scope.activeOrganizationId || !isTrainerAccessRole(scope.activeRole)) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Accesso negato: area allenatore" },
        },
        { status: 403 },
      );
    }

    const esito = await syncTrainerOperationalAlerts(scope);

    return NextResponse.json({
      data: { synced: esito.synced, alerts: esito.alerts },
      error: null,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error?.message || "Errore aggiornamento avvisi allenatore",
        },
      },
      { status: errorStatus(error) },
    );
  }
}
