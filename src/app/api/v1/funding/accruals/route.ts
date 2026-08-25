import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  listFundingAccruals,
  markAccrualsReported,
  recomputeEnrollmentAccruals,
} from "@/lib/server/funding";
import { canManageClubConfiguration } from "@/lib/access-roles";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";

/**
 * Il maturato, periodo per periodo.
 *
 *   GET  /api/v1/funding/accruals?enrollment_id=…
 *   POST /api/v1/funding/accruals  {"action":"recompute","enrollment_id":…}
 *   POST /api/v1/funding/accruals  {"action":"report","accrual_ids":[…]}
 *
 * **Perche il ricalcolo e un'azione e non un effetto collaterale della
 * lettura.** Legge tutte le presenze e tutti gli allenamenti del club: farlo
 * a ogni apertura di una scheda atleta costerebbe una scansione per ogni
 * visita. Ricalcolare quando un appello cambia e una decisione della
 * segreteria, ed e ripetibile — l'unico `(enrollment_id, period_index)` rende
 * l'operazione idempotente.
 *
 * `report` marca i periodi come rendicontati all'ente: e una dichiarazione,
 * non un incasso, e sta in mezzo fra maturato e liquidato perche i due momenti
 * possono distare mesi.
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

    const accruals = await listFundingAccruals(
      {
        organizationId: url.searchParams.get("organization_id"),
        enrollmentId: url.searchParams.get("enrollment_id"),
      },
      scope,
    );

    return NextResponse.json({ data: accruals, error: null });
  } catch (error: any) {
    return failure(error, "Errore nella lettura del maturato");
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
              "Accesso negato: solo il proprietario o un gestore del club puo ricalcolare o rendicontare un contributo",
          },
        },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "recompute").trim();

    if (action === "recompute") {
      const result = await recomputeEnrollmentAccruals(
        String(body?.enrollment_id ?? body?.enrollmentId ?? ""),
        scope,
        { until: body?.until ?? null },
      );

      await recordAuditEvent({
        action: AUDIT_ACTIONS.resourceUpdated,
        actorUserId: session.db.user_id,
        actorEmail: session.db.user.email,
        actorRole: scope.activeRole,
        organizationId: result.enrollment.organization_id,
        resource: "funding_accruals",
        resourceId: result.enrollment.id,
        request,
        metadata: {
          periods: result.accruals.length,
          skippedSettledPeriods: result.skippedSettledPeriods,
        },
      });

      return NextResponse.json({ data: result, error: null });
    }

    if (action === "report") {
      const accruals = await markAccrualsReported(
        body?.accrual_ids ?? body?.accrualIds ?? [],
        scope,
      );

      await recordAuditEvent({
        action: AUDIT_ACTIONS.resourceUpdated,
        actorUserId: session.db.user_id,
        actorEmail: session.db.user.email,
        actorRole: scope.activeRole,
        organizationId: accruals[0]?.organization_id ?? null,
        resource: "funding_accruals",
        resourceId: accruals[0]?.id ?? null,
        request,
        metadata: { reportedPeriods: accruals.length },
      });

      return NextResponse.json({ data: accruals, error: null });
    }

    return NextResponse.json(
      {
        data: null,
        error: {
          message:
            "Azione non supportata: il maturato si ricalcola o si rendiconta, non si scrive a mano",
        },
      },
      { status: 400 },
    );
  } catch (error: any) {
    return failure(error, "Operazione sul maturato non riuscita");
  }
}
