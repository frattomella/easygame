import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  createFundingEnrollment,
  getAthleteFundingOverview,
  listFundingEnrollments,
} from "@/lib/server/funding";
import { canManageClubConfiguration } from "@/lib/access-roles";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";

/**
 * Beneficiari di un programma di contributo.
 *
 *   GET  /api/v1/funding/enrollments?athlete_id=…&program_id=…
 *   GET  /api/v1/funding/enrollments?athlete_id=…&view=overview
 *   POST /api/v1/funding/enrollments
 *
 * `view=overview` e la proiezione che serve alla scheda atleta: per ogni
 * programma restituisce il beneficiario, la configurazione, i periodi e i
 * **cinque importi** gia calcolati. Farli calcolare al client vorrebbe dire
 * riscrivere il dominio in TypeScript di interfaccia, che e esattamente il
 * debito D1 che EasyGame sta riducendo.
 */

export const runtime = "nodejs";

const unauthorized = () =>
  NextResponse.json(
    { data: null, error: { message: "Accesso negato: sessione assente" } },
    { status: 401 },
  );

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

    const athleteId = url.searchParams.get("athlete_id");

    if (url.searchParams.get("view") === "overview") {
      if (!athleteId) {
        return NextResponse.json(
          {
            data: null,
            error: { message: "La proiezione overview richiede athlete_id" },
          },
          { status: 400 },
        );
      }

      const overview = await getAthleteFundingOverview(
        athleteId,
        scope,
        url.searchParams.get("organization_id"),
      );

      return NextResponse.json({ data: overview, error: null });
    }

    const enrollments = await listFundingEnrollments(
      {
        organizationId: url.searchParams.get("organization_id"),
        programId: url.searchParams.get("program_id"),
        athleteId,
      },
      scope,
    );

    return NextResponse.json({ data: enrollments, error: null });
  } catch (error: any) {
    return failure(error, "Errore nella lettura dei beneficiari");
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
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Accesso negato: solo il proprietario o un gestore del club puo ammettere un atleta a un contributo",
          },
        },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));

    const enrollment = await createFundingEnrollment(
      {
        programId: body?.program_id ?? body?.programId,
        athleteId: body?.athlete_id ?? body?.athleteId,
        assignedAmount: body?.assigned_amount ?? body?.assignedAmount,
        voucherCode: body?.voucher_code ?? body?.voucherCode,
        enrolledAt: body?.enrolled_at ?? body?.enrolledAt,
        endsAt: body?.ends_at ?? body?.endsAt,
        notes: body?.notes,
      },
      scope,
    );

    await recordAuditEvent({
      action: AUDIT_ACTIONS.resourceCreated,
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      actorRole: scope.activeRole,
      organizationId: enrollment.organization_id,
      resource: "funding_enrollments",
      resourceId: enrollment.id,
      request,
      metadata: {
        programId: enrollment.program_id,
        athleteId: enrollment.athlete_id,
        assignedAmount: enrollment.assigned_amount,
      },
    });

    return NextResponse.json({ data: enrollment, error: null }, { status: 201 });
  } catch (error: any) {
    return failure(error, "Ammissione al contributo non riuscita");
  }
}
