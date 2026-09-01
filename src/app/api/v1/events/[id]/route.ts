import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  deleteClubEvent,
  listEventParticipants,
  readClubEvent,
  updateClubEvent,
} from "@/lib/server/events";
import { toEventLegacyShape } from "@/lib/events/model";

type Context = { params: { id: string } };

const scopeFrom = async (request: Request, userId: string) => {
  const url = new URL(request.url);
  return resolveOrganizationScopeForUser(
    userId,
    url.searchParams.get("organization_id") ||
      url.searchParams.get("club_id") ||
      request.headers.get("x-active-club-id"),
    request.headers.get("x-active-access-role"),
  );
};

const errorStatus = (error: any) =>
  String(error?.message || "").includes("Accesso negato")
    ? 403
    : String(error?.message || "").includes("modificato da qualcun altro")
      ? 409
      : 400;

export async function GET(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        { data: null, error: { message: "Sessione non valida" } },
        { status: 401 },
      );
    }

    const scope = await scopeFrom(request, session.db.user_id);
    const row = await readClubEvent(scope, context.params.id);
    if (!row) {
      return NextResponse.json(
        { data: null, error: { message: "Evento non trovato" } },
        { status: 404 },
      );
    }

    const participants = await listEventParticipants(scope, row.id);

    return NextResponse.json({
      data: { ...toEventLegacyShape(row), id: row.id, row, participants },
      error: null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { data: null, error: { message: error?.message || "Errore lettura evento" } },
      { status: errorStatus(error) },
    );
  }
}

/**
 * La modifica di un evento, con **controllo ottimistico**.
 *
 * `version` nel corpo dichiara su quale versione si sta lavorando. Due
 * segretarie che salvano insieme non si sovrascrivono piu: la seconda riceve un
 * 409 e ricarica, invece di far sparire in silenzio il lavoro della prima.
 */
export async function PATCH(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        { data: null, error: { message: "Sessione non valida" } },
        { status: 401 },
      );
    }

    const scope = await scopeFrom(request, session.db.user_id);
    const body = await request.json().catch(() => ({}));
    const payload =
      body && typeof body === "object" && body.data ? body.data : body;

    const row = await updateClubEvent(
      scope,
      context.params.id,
      payload,
      { userId: session.db.user_id, email: session.db.user.email },
      { expectedVersion: payload?.version ?? body?.version ?? null },
    );

    return NextResponse.json({
      data: row ? { ...toEventLegacyShape(row), id: row.id, row } : null,
      error: null,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: { message: error?.message || "Errore modifica evento" },
      },
      { status: errorStatus(error) },
    );
  }
}

/**
 * Cancellare un evento: **solo se non ha una storia**.
 *
 * La regola sta nel dominio, non qui: un evento con presenze, convocazioni o
 * risposte delle famiglie si annulla con un `PATCH`, non si cancella. Questa
 * porta serve alla rigenerazione del programma settimanale, che ripulisce cio
 * che ha generato e che non ha ancora avuto luogo.
 */
export async function DELETE(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        { data: null, error: { message: "Sessione non valida" } },
        { status: 401 },
      );
    }

    const scope = await scopeFrom(request, session.db.user_id);
    const esito = await deleteClubEvent(scope, context.params.id, {
      userId: session.db.user_id,
      email: session.db.user.email,
    });

    return NextResponse.json({ data: esito, error: null });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: { message: error?.message || "Errore rimozione evento" },
      },
      { status: errorStatus(error) },
    );
  }
}
