import { NextResponse } from "next/server";
import { publicErrorMessage } from "@/lib/server/api-errors";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  getFundingProgramById,
  getFundingProgramDetail,
  listEnrollableAthletes,
  updateFundingProgram,
} from "@/lib/server/funding";
import { canManageClubConfigurationAsActor } from "@/lib/access-roles";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";

/**
 * Dettaglio e modifica di un programma di contributo.
 *
 *   GET   /api/v1/funding/programs/:id
 *   GET   /api/v1/funding/programs/:id?view=detail
 *   PATCH /api/v1/funding/programs/:id
 *
 * `view=detail` e la proiezione che serve alla scheda del programma:
 * configurazione, beneficiari con nome e cognome, i **cinque importi** per
 * ognuno, i totali, e l'elenco degli atleti ancora iscrivibili. Farli
 * calcolare al client vorrebbe dire riscrivere il dominio in TypeScript di
 * interfaccia; mandargli l'anagrafica intera per filtrarla vorrebbe dire
 * cinque megabyte per aprire una tendina.
 *
 * Non esiste `DELETE`: un programma su cui sono maturati contributi non si
 * cancella, si porta a `closed`. Cancellarlo porterebbe via anche i maturati e
 * le liquidazioni, cioe la traccia di denaro che e stato versato davvero.
 */

export const runtime = "nodejs";

type Context = { params: { id: string } };

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

export async function GET(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return unauthorized();

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );

    if (new URL(request.url).searchParams.get("view") === "detail") {
      const [detail, enrollable] = await Promise.all([
        getFundingProgramDetail(context.params.id, scope),
        listEnrollableAthletes(context.params.id, scope),
      ]);

      return NextResponse.json({
        data: { ...detail, enrollableAthletes: enrollable },
        error: null,
      });
    }

    const program = await getFundingProgramById(context.params.id, scope);
    return NextResponse.json({ data: program, error: null });
  } catch (error: any) {
    return failure(error, "Errore nella lettura del programma");
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return unauthorized();

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );

    if (!canManageClubConfigurationAsActor(scope.activeRole)) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Accesso negato: solo il proprietario o un gestore del club puo modificare un programma di contributo",
          },
        },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const program = await updateFundingProgram(context.params.id, body, scope);

    await recordAuditEvent({
      action: AUDIT_ACTIONS.resourceUpdated,
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      actorRole: scope.activeRole,
      organizationId: program.organization_id,
      resource: "funding_programs",
      resourceId: program.id,
      request,
      metadata: {
        status: program.status,
        requirementMin: program.requirement_min,
        periodAmount: program.period_amount,
      },
    });

    return NextResponse.json({ data: program, error: null });
  } catch (error: any) {
    return failure(error, "Modifica del programma non riuscita");
  }
}
