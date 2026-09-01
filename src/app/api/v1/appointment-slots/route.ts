import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  createAppointmentSlot,
  listAppointmentSlots,
} from "@/lib/server/appointments";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";

/**
 * **La disponibilita come dato configurabile.**
 *
 * Prima esisteva solo l'orario di apertura del club, uno per tutte le sedi: un
 * club con due sedi non poteva dire che una apre solo il martedi (W5-51), e
 * nessuno poteva dire quanto dura un colloquio ne quante persone si ricevono
 * insieme. Gli orari di apertura restano, come ripiego dichiarato per chi non
 * configura niente.
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

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        { data: [], error: { message: "Sessione non valida" } },
        { status: 401 },
      );
    }

    const scope = await scopeFrom(request, session.db.user_id);
    const rows = await listAppointmentSlots(scope);

    return NextResponse.json({ data: rows, error: null });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: [],
        error: { message: error?.message || "Errore lettura disponibilita" },
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
        { data: null, error: { message: "Sessione non valida" } },
        { status: 401 },
      );
    }

    const scope = await scopeFrom(request, session.db.user_id);
    const body = await request.json().catch(() => ({}));
    const payload = body && typeof body === "object" && body.data ? body.data : body;

    try {
      const row = await createAppointmentSlot(
        scope,
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
    } catch (denied: any) {
      if (String(denied?.message || "").includes("Accesso negato")) {
        await recordAuditEvent({
          action: AUDIT_ACTIONS.resourceAccessDenied,
          outcome: "denied",
          actorUserId: session.db.user_id,
          actorEmail: session.db.user.email,
          actorRole: scope.activeRole,
          organizationId: scope.activeOrganizationId,
          resource: "appointment_slots",
          request,
          metadata: { attemptedAction: "create", permission: "appointments.manage" },
        });
      }
      throw denied;
    }
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: { message: error?.message || "Errore creazione slot" },
      },
      { status: errorStatus(error) },
    );
  }
}
