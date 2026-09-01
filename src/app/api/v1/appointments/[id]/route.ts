import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  cancelAppointment,
  closeAppointment,
  confirmAppointment,
  readAppointment,
  rejectAppointment,
  rescheduleAppointment,
} from "@/lib/server/appointments";
import { toClubAppointment } from "@/lib/appointments/projection";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";

type Context = { params: { id: string } };

/**
 * **Una transizione per rotta, e la transizione ha un nome.**
 *
 * Non un `PATCH` che accetta un campo `status`: quella forma lascia al client
 * la scelta dello stato di arrivo, e la macchina a stati diventa una
 * convenzione. Qui l'azione e nel corpo, il dominio la traduce nella sola
 * transizione ammessa da quello stato per quel lato, e cio che non e ammesso
 * non ha nemmeno un modo di essere chiesto.
 */

const AZIONI = [
  "confirm",
  "reject",
  "reschedule",
  "cancel",
  "complete",
  "no-show",
] as const;

type Azione = (typeof AZIONI)[number];

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
    const row = await readAppointment(scope, context.params.id);
    if (!row) {
      return NextResponse.json(
        { data: null, error: { message: "Appuntamento non trovato" } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: toClubAppointment(row as any), error: null });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: { message: error?.message || "Errore lettura appuntamento" },
      },
      { status: errorStatus(error) },
    );
  }
}

export async function POST(request: Request, context: Context) {
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
    const azione = String(payload?.action || "").trim().toLowerCase() as Azione;

    if (!AZIONI.includes(azione)) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: `Azione non riconosciuta: usa ${AZIONI.join(", ")}`,
          },
        },
        { status: 400 },
      );
    }

    const attore = { userId: session.db.user_id, email: session.db.user.email };
    const expectedVersion = payload?.version ?? null;
    const note = payload?.note ?? payload?.decision_note ?? null;

    try {
      if (azione === "reschedule") {
        const esito = await rescheduleAppointment(
          scope,
          context.params.id,
          {
            startsAt: payload?.starts_at ?? payload?.startsAt,
            date: payload?.date,
            time: payload?.time,
            timezone: payload?.timezone,
            siteId: payload?.site_id ?? payload?.siteId,
            slotId: payload?.slot_id ?? payload?.slotId,
            assignedToUserId: payload?.assigned_to ?? payload?.assignedToUserId,
            durationMinutes: payload?.duration_minutes ?? payload?.durationMinutes,
            reason: payload?.reason,
            notes: payload?.notes,
            note,
            outsideAvailability: Boolean(
              payload?.outside_availability ?? payload?.outsideAvailability,
            ),
            expectedVersion,
          },
          attore,
        );

        return NextResponse.json({
          data: {
            closed: toClubAppointment(esito.closed as any),
            created: toClubAppointment(esito.created as any),
          },
          error: null,
        });
      }

      const row =
        azione === "confirm"
          ? await confirmAppointment(
              scope,
              context.params.id,
              {
                note,
                assignedToUserId: payload?.assigned_to ?? payload?.assignedToUserId,
                expectedVersion,
              },
              attore,
            )
          : azione === "reject"
            ? await rejectAppointment(
                scope,
                context.params.id,
                { note, expectedVersion },
                attore,
              )
            : azione === "cancel"
              ? await cancelAppointment(
                  scope,
                  context.params.id,
                  { note, expectedVersion },
                  attore,
                )
              : await closeAppointment(
                  scope,
                  context.params.id,
                  azione === "complete" ? "completed" : "no_show",
                  { note, expectedVersion },
                  attore,
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
          resourceId: context.params.id,
          request,
          metadata: {
            attemptedAction: azione,
            permission: "appointments.manage",
          },
        });
      }
      throw denied;
    }
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: { message: error?.message || "Errore aggiornamento appuntamento" },
      },
      { status: errorStatus(error) },
    );
  }
}
