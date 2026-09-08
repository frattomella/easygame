import { NextResponse } from "next/server";
import { publicErrorMessage } from "@/lib/server/api-errors";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { transitionFundingProgram } from "@/lib/server/funding";
import { canManageClubConfigurationAsActor } from "@/lib/access-roles";

/**
 * **Aprire, chiudere, riaprire un programma di contributo** (N6).
 *
 *   POST /api/v1/funding/programs/:id/transition   { status, reason? }
 *
 * Una rotta propria e non un campo dentro la modifica generica, per la ragione
 * che il dominio degli eventi ha gia imparato: un cambio di stato **e un
 * atto**, e farlo passare per «aggiorna il programma» significa che una
 * schermata che voleva correggere una nota puo chiudere il bando serializzando
 * un campo in piu, e che l'audit registra «programma aggiornato» dove e
 * successo qualcos'altro.
 *
 * L'audit lo scrive il **servizio**, non questa rotta: `transitionFundingProgram`
 * e la sola strada che scrive quella colonna, e chiamarla da altrove non
 * lascerebbe segno. E la stessa scelta di `reverseFundingSettlement`.
 *
 * Le transizioni ammesse sono quattro e le dichiara il dominio
 * (`FUNDING_PROGRAM_TRANSITIONS`). Cio che non e ammesso viene **rifiutato**:
 * una transizione che non cambia niente lascerebbe in registro una riga che
 * racconta un atto mai avvenuto.
 */

export const runtime = "nodejs";

type Context = { params: { id: string } };

export async function POST(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        { data: null, error: { message: "Accesso negato: sessione assente" } },
        { status: 401 },
      );
    }

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );

    if (!canManageClubConfigurationAsActor(scope.activeRole)) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Accesso negato: solo il proprietario o un gestore del club puo aprire o chiudere un programma di contributo",
          },
        },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const program = await transitionFundingProgram(
      context.params.id,
      { status: body?.status, reason: body?.reason },
      scope,
    );

    return NextResponse.json({ data: program, error: null });
  } catch (error: any) {
    const message = publicErrorMessage(
      error,
      "Cambio di stato del programma non riuscito",
    );
    const status = message.includes("Accesso negato")
      ? 403
      : message.includes("non trovato")
        ? 404
        : 400;
    return NextResponse.json({ data: null, error: { message } }, { status });
  }
}
