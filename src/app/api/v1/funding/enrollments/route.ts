import { NextResponse } from "next/server";
import { publicErrorMessage } from "@/lib/server/api-errors";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  createFundingEnrollments,
  getAthleteFundingOverview,
  listEnrollableProgramsForAthlete,
  listFundingEnrollments,
} from "@/lib/server/funding";
import { canManageClubConfiguration } from "@/lib/access-roles";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";

/**
 * Beneficiari di un programma di contributo.
 *
 *   GET  /api/v1/funding/enrollments?athlete_id=…&program_id=…
 *   GET  /api/v1/funding/enrollments?athlete_id=…&view=overview
 *   GET  /api/v1/funding/enrollments?athlete_id=…&view=enrollable
 *   POST /api/v1/funding/enrollments
 *
 * **Il POST iscrive uno o piu atleti dalla stessa rotta**, e non da due.
 * Il flusso «programma → iscrivo atleti» e il flusso «atleta → lo iscrivo a
 * un programma» sono la stessa operazione guardata da due parti: due rotte
 * avrebbero voluto dire due implementazioni che divergono al primo
 * cambiamento di regola.
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

    const athleteId = url.searchParams.get("athlete_id");

    if (url.searchParams.get("view") === "enrollable") {
      if (!athleteId) {
        return NextResponse.json(
          {
            data: null,
            error: {
              message: "La proiezione enrollable richiede athlete_id",
            },
          },
          { status: 400 },
        );
      }

      const programs = await listEnrollableProgramsForAthlete(
        athleteId,
        scope,
        url.searchParams.get("organization_id"),
      );

      return NextResponse.json({ data: programs, error: null });
    }

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

    /*
      Un atleta solo o trenta: la forma singolare resta accettata perche
      circola gia fra i chiamanti, e diventa un elenco di uno. Il servizio
      sotto e lo stesso in entrambi i casi.
    */
    const athleteIds = Array.isArray(body?.athlete_ids ?? body?.athleteIds)
      ? body.athlete_ids ?? body.athleteIds
      : [body?.athlete_id ?? body?.athleteId].filter(Boolean);

    const result = await createFundingEnrollments(
      {
        programId: body?.program_id ?? body?.programId,
        athleteIds,
        perAthlete: body?.per_athlete ?? body?.perAthlete,
        assignedAmount: body?.assigned_amount ?? body?.assignedAmount,
        enrolledAt: body?.enrolled_at ?? body?.enrolledAt,
        endsAt: body?.ends_at ?? body?.endsAt,
        notes: body?.notes,
      },
      scope,
    );

    for (const enrollment of result.created) {
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
          hasVoucherCode: Boolean(enrollment.voucher_code),
        },
      });
    }

    /*
      `201` solo se qualcosa e stato creato davvero. Un lotto in cui erano
      tutti gia iscritti non ha creato niente, e dirlo con un 201
      lascerebbe credere il contrario.
    */
    return NextResponse.json(
      {
        data: {
          created: result.created,
          skipped: result.skipped,
          /* La forma singolare della risposta, per chi la usava gia. */
          enrollment: result.created[0] || null,
        },
        error: null,
      },
      { status: result.created.length ? 201 : 200 },
    );
  } catch (error: any) {
    return failure(error, "Ammissione al contributo non riuscita");
  }
}
