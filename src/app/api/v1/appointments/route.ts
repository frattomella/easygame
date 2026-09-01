import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { createAppointment, listAppointments } from "@/lib/server/appointments";
import { toClubAppointment } from "@/lib/appointments/projection";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";

/**
 * **La coda di lavoro della segreteria, e l'unica porta per crearci dentro.**
 *
 * Questo file statico prevale sulla rotta dinamica `[resource]`: la risorsa
 * `appointments` resta **chiusa** al CRUD generico — che e cio che 5A ha
 * deciso — e il dominio ha la sua porta, con i suoi permessi e le sue
 * transizioni. Non e una duplicazione: il CRUD generico non sa che una
 * conferma non e una modifica.
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
  if (messaggio.includes("aggiornato da qualcun altro")) return 409;
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

    const url = new URL(request.url);
    const scope = await scopeFrom(request, session.db.user_id);

    const rows = await listAppointments(scope, {
      status: url.searchParams.getAll("status").length
        ? url.searchParams.getAll("status")
        : null,
      siteId: url.searchParams.get("site_id"),
      assignedToUserId: url.searchParams.get("assigned_to"),
      athleteId: url.searchParams.get("athlete_id"),
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });

    return NextResponse.json({
      data: rows.map((row) => toClubAppointment(row as any)),
      error: null,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: [],
        error: { message: error?.message || "Errore lettura appuntamenti" },
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
      const row = await createAppointment(
        scope,
        {
          athleteId: payload?.athlete_id ?? payload?.athleteId,
          siteId: payload?.site_id ?? payload?.siteId,
          seasonId: payload?.season_id ?? payload?.seasonId,
          slotId: payload?.slot_id ?? payload?.slotId,
          assignedToUserId: payload?.assigned_to ?? payload?.assignedToUserId,
          startsAt: payload?.starts_at ?? payload?.startsAt,
          date: payload?.date,
          time: payload?.time,
          durationMinutes: payload?.duration_minutes ?? payload?.durationMinutes,
          timezone: payload?.timezone,
          reason: payload?.reason ?? payload?.title,
          notes: payload?.notes,
          internalNotes: payload?.internal_notes ?? payload?.internalNotes,
          idempotencyKey:
            payload?.idempotency_key ||
            payload?.idempotencyKey ||
            request.headers.get("idempotency-key"),
          confirmed: Boolean(payload?.confirmed),
          outsideAvailability: Boolean(
            payload?.outside_availability ?? payload?.outsideAvailability,
          ),
        },
        { userId: session.db.user_id, email: session.db.user.email },
      );

      return NextResponse.json({ data: toClubAppointment(row as any), error: null });
    } catch (denied: any) {
      if (String(denied?.message || "").includes("Accesso negato")) {
        await recordAuditEvent({
          action: AUDIT_ACTIONS.resourceAccessDenied,
          outcome: "denied",
          actorUserId: session.db.user_id,
          actorEmail: session.db.user.email,
          actorRole: scope.activeRole,
          organizationId: scope.activeOrganizationId,
          resource: "appointments",
          request,
          metadata: {
            attemptedAction: "create",
            permission: "appointments.request",
          },
        });
      }
      throw denied;
    }
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: { message: error?.message || "Errore creazione appuntamento" },
      },
      { status: errorStatus(error) },
    );
  }
}
