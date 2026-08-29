import { NextResponse, type NextRequest } from "next/server";
import { authorizeCronRequest } from "@/lib/server/cron-auth";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  runAutomationsForAllClubs,
  runAutomationsForClub,
} from "@/lib/server/automations";
import { assertCommunicationPermission } from "@/lib/communications/permissions";
import { publicErrorMessage } from "@/lib/server/api-errors";

/**
 * Il giro delle automazioni.
 *
 *   POST /api/v1/automations/run   a mano, sul **club attivo**
 *   GET  /api/v1/automations/run   da cron, su **tutti** i club
 *
 * E lo stesso schema a due porte gia collaudato da `sport-work/scheduler`, e
 * le due esistono entrambe di proposito. Il `POST` serve a chi ha appena
 * cambiato una regola e vuole vederne l'effetto senza aspettare la notte, e
 * passa dai permessi come ogni altra rotta. Il `GET` non ha un attore: lo
 * invoca lo schedulatore, e si autentica con `CRON_SECRET`.
 *
 * **Senza `CRON_SECRET` la porta del cron non si apre**, in nessun ambiente.
 * Questa rotta manda email a tutte le famiglie di tutti i club: «fuori da
 * produzione passa comunque» sarebbe una porta aperta su ogni anteprima.
 */

export const runtime = "nodejs";

const unauthorized = () =>
  NextResponse.json(
    { data: null, error: { message: "Accesso negato: sessione assente" } },
    { status: 401 },
  );

const failure = (error: any, fallback: string) => {
  const message = publicErrorMessage(error, fallback);
  const status = message.includes("Accesso negato") ? 403 : 400;
  return NextResponse.json({ data: null, error: { message } }, { status });
};

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return unauthorized();

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );

    /*
      Il permesso si chiede **qui e nel dominio**. Non e una ripetizione
      inutile: `runAutomationsForClub` gira anche da cron, dove un ruolo non
      esiste, quindi non puo pretenderlo — ed e questa rotta a dover dire di no
      a un allenatore che prova a far partire trecento email.
    */
    assertCommunicationPermission(scope.activeRole, "automations.manage");

    const result = await runAutomationsForClub({
      organizationId: String(scope.activeOrganizationId || ""),
      scope,
    });

    return NextResponse.json({ data: result, error: null });
  } catch (error: any) {
    return failure(error, "Esecuzione delle automazioni non riuscita");
  }
}

export async function GET(request: NextRequest) {
  const denied = authorizeCronRequest(request, "il giro delle automazioni");
  if (denied) return denied.response;

  try {
    const results = await runAutomationsForAllClubs(new Date());

    return NextResponse.json({
      data: {
        processedClubs: results.length,
        failed: results.filter((row) => row.ok === false).length,
        results,
      },
      error: null,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message:
            error?.message || "Errore durante il giro delle automazioni",
        },
      },
      { status: 500 },
    );
  }
}
