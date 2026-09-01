import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  deleteAppointmentSlot,
  updateAppointmentSlot,
} from "@/lib/server/appointments";

type Context = { params: { id: string } };

/**
 * Modifica e rimozione di una regola di disponibilita.
 *
 * Togliere uno slot **non** cancella gli appuntamenti presi su di esso: la
 * chiave esterna e `SET NULL`, e chi ha gia un colloquio in agenda non lo perde
 * perche la segreteria ha cambiato orario di ricevimento.
 */

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

const errorStatus = (error: any) => {
  const messaggio = String(error?.message || "");
  if (messaggio.includes("Accesso negato")) return 403;
  if (messaggio.includes("non trovato")) return 404;
  return 400;
};

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
    const payload = body && typeof body === "object" && body.data ? body.data : body;

    const row = await updateAppointmentSlot(
      scope,
      context.params.id,
      {
        siteId: payload?.site_id ?? payload?.siteId,
        assignedToUserId: payload?.assigned_to ?? payload?.assignedToUserId,
        weekday: payload?.weekday,
        specificDate: payload?.specific_date ?? payload?.specificDate,
        startTime: payload?.start_time ?? payload?.startTime,
        endTime: payload?.end_time ?? payload?.endTime,
        durationMinutes: payload?.duration_minutes ?? payload?.durationMinutes,
        capacity: payload?.capacity,
        validFrom: payload?.valid_from ?? payload?.validFrom,
        validUntil: payload?.valid_until ?? payload?.validUntil,
        active: payload?.active,
        notes: payload?.notes,
      },
      { userId: session.db.user_id, email: session.db.user.email },
    );

    return NextResponse.json({ data: row, error: null });
  } catch (error: any) {
    return NextResponse.json(
      { data: null, error: { message: error?.message || "Errore modifica slot" } },
      { status: errorStatus(error) },
    );
  }
}

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
    const esito = await deleteAppointmentSlot(scope, context.params.id, {
      userId: session.db.user_id,
      email: session.db.user.email,
    });

    return NextResponse.json({ data: esito, error: null });
  } catch (error: any) {
    return NextResponse.json(
      { data: null, error: { message: error?.message || "Errore rimozione slot" } },
      { status: errorStatus(error) },
    );
  }
}
