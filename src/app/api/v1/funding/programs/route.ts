import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  createFundingProgram,
  listFundingPrograms,
} from "@/lib/server/funding";
import { canManageClubConfiguration } from "@/lib/access-roles";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";

/**
 * Programmi di contributo: elenco e creazione.
 *
 *   GET  /api/v1/funding/programs?status=active
 *   POST /api/v1/funding/programs
 *
 * Un programma e **configurazione economica del club**: descrive quanto un
 * ente riconosce e a quali condizioni. Crearlo o modificarlo richiede quindi
 * il ruolo che governa la configurazione, lo stesso che protegge piani di
 * pagamento e incassi. La lettura resta a chi ha accesso al club: la scheda
 * atleta mostra i contributi a chiunque possa vederla.
 */

export const runtime = "nodejs";

const unauthorized = () =>
  NextResponse.json(
    { data: null, error: { message: "Accesso negato: sessione assente" } },
    { status: 401 },
  );

const forbidden = (message: string) =>
  NextResponse.json({ data: null, error: { message } }, { status: 403 });

const failure = (error: any, fallback: string) => {
  const message = String(error?.message || fallback);
  const status = message.includes("Accesso negato")
    ? 403
    : message.includes("non trovato")
      ? 404
      : 400;
  return NextResponse.json({ data: null, error: { message } }, { status });
};

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return unauthorized();

    const url = new URL(request.url);
    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      url.searchParams.get("organization_id") ||
        request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );

    const programs = await listFundingPrograms(
      {
        organizationId: url.searchParams.get("organization_id"),
        status: url.searchParams.get("status"),
      },
      scope,
    );

    return NextResponse.json({ data: programs, error: null });
  } catch (error: any) {
    return failure(error, "Errore nella lettura dei programmi di contributo");
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return unauthorized();

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );

    if (!canManageClubConfiguration(scope.activeRole)) {
      return forbidden(
        "Accesso negato: solo il proprietario o un gestore del club puo configurare un programma di contributo",
      );
    }

    const body = await request.json().catch(() => ({}));
    const program = await createFundingProgram(body, scope);

    await recordAuditEvent({
      action: AUDIT_ACTIONS.resourceCreated,
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      actorRole: scope.activeRole,
      organizationId: program.organization_id,
      resource: "funding_programs",
      resourceId: program.id,
      request,
      metadata: {
        name: program.name,
        funderName: program.funder_name,
        athletePlafond: program.athlete_plafond,
        periodAmount: program.period_amount,
        requirementMin: program.requirement_min,
        requirementUnit: program.requirement_unit,
      },
    });

    return NextResponse.json({ data: program, error: null }, { status: 201 });
  } catch (error: any) {
    return failure(error, "Creazione del programma non riuscita");
  }
}
