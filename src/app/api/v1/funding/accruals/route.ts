import { NextResponse } from "next/server";
import { publicErrorMessage } from "@/lib/server/api-errors";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  confirmAccrualPeriods,
  importAccrualConfirmations,
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
 *   POST /api/v1/funding/accruals  {"action":"confirm","enrollment_id":…,"confirmations":[…]}
 *   POST /api/v1/funding/accruals  {"action":"import","enrollment_id":…,"text":…}
 *   POST /api/v1/funding/accruals  {"action":"report","accrual_ids":[…]}
 *
 * `confirm` e `import` esistono per i programmi la cui fonte ufficiale sta
 * fuori da EasyGame: li il ricalcolo produce una **previsione**, e il credito
 * nasce solo quando qualcuno dichiara cosa l'ente ha riconosciuto. Le due
 * azioni scrivono la stessa cosa e si distinguono per provenienza, cosi una
 * correzione a mano resta distinguibile da cio che ha portato un file
 * (ADR-0054).
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
  /*
    **Il messaggio non esce grezzo.** Queste sette rotte costruivano la
    risposta da `error.message`, quindi un identificativo malformato faceva
    uscire il nome del modello, l operazione, lo SQLSTATE e le interiora del
    driver — l incidente I-03, che era stato chiuso altrove e non qui.
  */
  const message = publicErrorMessage(error, fallback);
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

    if (action === "confirm") {
      const result = await confirmAccrualPeriods(
        {
          enrollmentId: body?.enrollment_id ?? body?.enrollmentId,
          origin: body?.origin,
          confirmations: Array.isArray(body?.confirmations)
            ? body.confirmations.map((entry: any) => ({
                accrualId: entry?.accrual_id ?? entry?.accrualId,
                periodIndex: entry?.period_index ?? entry?.periodIndex,
                amount: entry?.amount,
                confirmedAt: entry?.confirmed_at ?? entry?.confirmedAt,
                externalReference:
                  entry?.external_reference ?? entry?.externalReference,
                notes: entry?.notes,
              }))
            : [],
        },
        scope,
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
          confirmedPeriods: result.accruals.length,
          confirmedAmount: result.accruals.reduce(
            (total, row: any) => total + Number(row.accrued_amount || 0),
            0,
          ),
        },
      });

      return NextResponse.json({ data: result, error: null });
    }

    if (action === "import") {
      const result = await importAccrualConfirmations(
        {
          enrollmentId: body?.enrollment_id ?? body?.enrollmentId,
          text: body?.text ?? body?.content,
          reference: body?.reference,
        },
        scope,
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
          importedPeriods: result.accruals.length,
          rejectedRows: result.rejected.length,
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
        action: AUDIT_ACTIONS.fundingReported,
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
            "Azione non supportata: il maturato si ricalcola, si conferma, si importa o si rendiconta, non si scrive a mano",
        },
      },
      { status: 400 },
    );
  } catch (error: any) {
    return failure(error, "Operazione sul maturato non riuscita");
  }
}
