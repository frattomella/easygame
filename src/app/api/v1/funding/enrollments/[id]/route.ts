import { NextResponse } from "next/server";
import { publicErrorMessage } from "@/lib/server/api-errors";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  getFundingEnrollmentById,
  removeFundingEnrollment,
  updateFundingEnrollment,
} from "@/lib/server/funding";
import { canManageFundingAsActor } from "@/lib/funding/permissions";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";

/**
 * Una singola iscrizione a un programma di contributo.
 *
 *   GET    /api/v1/funding/enrollments/:id
 *   PATCH  /api/v1/funding/enrollments/:id   plafond, codice voucher, stato
 *   DELETE /api/v1/funding/enrollments/:id   toglie, oppure revoca
 *
 * **`DELETE` non sempre cancella, ed e voluto.** Un'iscrizione che ha gia
 * prodotto maturati rendicontati o righe di liquidazione non si porta via:
 * quei numeri sono stati comunicati a un ente e in parte gia incassati.
 * L'operazione la **revoca** — passa a `closed`, smette di maturare, e resta
 * leggibile — e la risposta dice quale delle due cose e successa, perche
 * l'interfaccia deve poterlo dire a chi ha premuto invece di far sparire una
 * riga in silenzio.
 */

export const runtime = "nodejs";

type Context = { params: { id: string } };

const unauthorized = () =>
  NextResponse.json(
    { data: null, error: { message: "Accesso negato: sessione assente" } },
    { status: 401 },
  );

const forbidden = () =>
  NextResponse.json(
    {
      data: null,
      error: {
        message:
          "Accesso negato: solo il proprietario o un gestore del club puo modificare un'iscrizione a un contributo",
      },
    },
    { status: 403 },
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

const resolveScope = async (request: Request, userId: string) =>
  resolveOrganizationScopeForUser(
    userId,
    request.headers.get("x-active-club-id"),
    request.headers.get("x-active-access-role"),
  );

export async function GET(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return unauthorized();

    const scope = await resolveScope(request, session.db.user_id);
    const enrollment = await getFundingEnrollmentById(context.params.id, scope);

    return NextResponse.json({ data: enrollment, error: null });
  } catch (error) {
    return failure(error, "Errore nella lettura dell'iscrizione");
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return unauthorized();

    const scope = await resolveScope(request, session.db.user_id);
    if (!canManageFundingAsActor(scope.activeRole)) return forbidden();

    const body = (await request.json().catch(() => ({}))) as Record<string, any>;

    const enrollment = await updateFundingEnrollment(
      context.params.id,
      {
        assignedAmount: body.assigned_amount ?? body.assignedAmount,
        voucherCode: body.voucher_code ?? body.voucherCode,
        status: body.status,
        endsAt: body.ends_at ?? body.endsAt,
        notes: body.notes,
      },
      scope,
    );

    await recordAuditEvent({
      action: AUDIT_ACTIONS.resourceUpdated,
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      actorRole: scope.activeRole,
      organizationId: enrollment.organization_id,
      resource: "funding_enrollments",
      resourceId: enrollment.id,
      request,
      metadata: {
        status: enrollment.status,
        assignedAmount: enrollment.assigned_amount,
        hasVoucherCode: Boolean(enrollment.voucher_code),
      },
    });

    return NextResponse.json({ data: enrollment, error: null });
  } catch (error) {
    return failure(error, "Modifica dell'iscrizione non riuscita");
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return unauthorized();

    const scope = await resolveScope(request, session.db.user_id);
    if (!canManageFundingAsActor(scope.activeRole)) return forbidden();

    const url = new URL(request.url);

    const acknowledgeSettled = ["1", "true", "yes"].includes(
      String(url.searchParams.get("acknowledge_settled") || "")
        .trim()
        .toLowerCase(),
    );

    const result = await removeFundingEnrollment(
      context.params.id,
      {
        reason: url.searchParams.get("reason"),
        /*
          **Il consenso a chiudere un'adesione gia liquidata** (N13, caso C).
          Senza, il dominio rifiuta e spiega che si storna prima la
          liquidazione. Arriva come parametro esplicito perche una `DELETE` non
          porta corpo, e perche il consenso deve essere un gesto e non un
          default.
        */
        acknowledgeSettled,
      },
      scope,
    );

    await recordAuditEvent({
      /*
        Una revoca e una modifica, una rimozione e una cancellazione: due
        azioni diverse nell'audit, perche chi rilegge sta cercando due cose
        diverse.
      */
      action:
        result.outcome === "revoked"
          ? AUDIT_ACTIONS.resourceUpdated
          : AUDIT_ACTIONS.resourceDeleted,
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      actorRole: scope.activeRole,
      organizationId: result.enrollment.organization_id,
      resource: "funding_enrollments",
      resourceId: result.enrollment.id,
      request,
      metadata: {
        outcome: result.outcome,
        programId: result.enrollment.program_id,
        athleteId: result.enrollment.athlete_id,
        /*
          Quante rate tornano a carico della famiglia: e la conseguenza
          economica dell'atto, e un audit che non la registra costringe a
          ricostruirla dalle righe di storno (N9, N13).
        */
        coverageReversed: result.coverageReversed,
        settledAmount: result.plan.settledAmount,
        /*
          **Chi ha scavalcato il vaglio va scritto** (revisione ostile, F2).
          «Un'adesione con del liquidato e stata chiusa» e «qualcuno ha
          dichiarato di saperlo e l'ha chiusa lo stesso» sono due fatti diversi,
          e il secondo non si deduce dal primo.
        */
        acknowledgedSettled: acknowledgeSettled,
      },
    });

    return NextResponse.json({
      data: {
        outcome: result.outcome,
        enrollment: result.enrollment,
        /*
          **Quante rate tornano a carico della famiglia** (N9). Il dominio lo
          contava gia e la rotta lo buttava via, quindi la schermata poteva solo
          dire «fatto»: «tolto dal programma» e «tolto dal programma, e tre rate
          tornano a carico della famiglia» sono due frasi diverse, e la seconda
          e quella che una segreteria deve leggere.
        */
        coverageReversed: result.coverageReversed,
        plan: result.plan,
      },
      error: null,
    });
  } catch (error) {
    return failure(error, "Rimozione dell'iscrizione non riuscita");
  }
}
