import {
  ok,
  readBody,
  sportWorkRoute,
} from "@/lib/server/sport-work-route";
import {
  getPlanForRelationship,
  listInstallments,
  recomputeInstallmentAccruals,
  saveCompensationPlan,
} from "@/lib/server/sport-work";

/**
 * Il piano compensi di un rapporto.
 *
 *   GET /api/v1/sport-work/relationships/:id/plan
 *   PUT /api/v1/sport-work/relationships/:id/plan
 *
 * `PUT` e non `POST` perche un rapporto ha **un** piano: rimandarlo lo
 * sostituisce, non ne aggiunge un secondo. La sostituzione viene rifiutata se
 * una scadenza ha gia ricevuto denaro.
 */
export const runtime = "nodejs";

export const GET = sportWorkRoute(
  "sport_work.read",
  async ({ params, scope }) => {
    const [plan, installments] = await Promise.all([
      getPlanForRelationship(params.id, scope),
      listInstallments({ relationshipId: params.id }, scope),
    ]);
    return ok({ plan, installments });
  },
);

export const PUT = sportWorkRoute(
  "sport_work.manage",
  async ({ params, request, scope }) => {
    const body = (await readBody(request)) as any;
    const plan = await saveCompensationPlan(
      { ...body, relationshipId: params.id },
      scope,
    );
    await recomputeInstallmentAccruals(params.id, scope);

    return ok(
      {
        plan,
        installments: await listInstallments(
          { relationshipId: params.id },
          scope,
        ),
      },
      201,
    );
  },
  "Salvataggio del piano non riuscito",
);
