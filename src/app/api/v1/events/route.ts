import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  createClubEvent,
  createClubEventsBatch,
  listClubEvents,
} from "@/lib/server/events";
import { normalizeEventKind, toEventLegacyShape } from "@/lib/events/model";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";

/**
 * **Il calendario del club, e l'unica porta per crearci dentro.**
 *
 * Allenamenti e gare non hanno piu due rotte separate su due colonne JSON:
 * hanno una rotta sola su una tabella sola, e il tipo e un parametro
 * (ADR-0098). E la riga che rende esprimibile il calendario unico, l'RSVP sulle
 * gare, la presenza a una gara e «scrivi ai convocati» — quattro gap che
 * sembravano indipendenti e poggiavano tutti sullo stesso mattone mancante.
 *
 * La risposta porta **entrambe le forme**: la riga, e la forma storica che le
 * schermate leggono ancora. Sparira la seconda, non la prima.
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

const errorStatus = (error: any) =>
  String(error?.message || "").includes("Accesso negato") ? 403 : 400;

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

    const rows = await listClubEvents(scope, {
      kind: (url.searchParams.get("kind") as any) || "all",
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
      seasonId: url.searchParams.get("season_id"),
      siteId: url.searchParams.get("site_id"),
      categoryId: url.searchParams.get("category_id"),
      groupId: url.searchParams.get("group_id"),
      status: url.searchParams.get("status"),
      includeCancelled: url.searchParams.get("include_cancelled") === "1",
    });

    return NextResponse.json({
      data: rows.map((row) => ({
        ...toEventLegacyShape(row),
        row: {
          id: row.id,
          kind: row.kind,
          status: row.status,
          starts_at: row.starts_at,
          ends_at: row.ends_at,
          capacity: row.capacity,
          rsvp_required: row.rsvp_required,
          rsvp_deadline: row.rsvp_deadline,
          version: row.version,
        },
      })),
      error: null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { data: [], error: { message: error?.message || "Errore lettura eventi" } },
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
    const payload =
      body && typeof body === "object" && body.data ? body.data : body;
    const kind = normalizeEventKind(payload?.kind || body?.kind);
    const batch = Array.isArray(payload?.events) ? payload.events : null;

    try {
      if (batch) {
        /*
          La generazione dal programma settimanale crea decine di eventi
          insieme: una richiesta sola, e **una** riproiezione alla fine invece
          di una per evento.
        */
        const rows = await createClubEventsBatch(scope, kind, batch, {
          userId: session.db.user_id,
          email: session.db.user.email,
        });
        return NextResponse.json({
          data: rows.map((row) => ({ ...toEventLegacyShape(row), id: row.id })),
          error: null,
        });
      }

      const row = await createClubEvent(scope, kind, payload, {
        userId: session.db.user_id,
        email: session.db.user.email,
      });

      return NextResponse.json({
        data: { ...toEventLegacyShape(row), id: row.id, row },
        error: null,
      });
    } catch (denied: any) {
      if (String(denied?.message || "").includes("Accesso negato")) {
        await recordAuditEvent({
          action: AUDIT_ACTIONS.resourceAccessDenied,
          outcome: "denied",
          actorUserId: session.db.user_id,
          actorEmail: session.db.user.email,
          actorRole: scope.activeRole,
          organizationId: scope.activeOrganizationId,
          resource: "club_events",
          request,
          metadata: { attemptedAction: "create", permission: "events.manage" },
        });
      }
      throw denied;
    }
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: { message: error?.message || "Errore creazione evento" },
      },
      { status: errorStatus(error) },
    );
  }
}
