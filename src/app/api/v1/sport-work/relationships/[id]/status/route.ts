import {
  ok,
  readBody,
  sportWorkRoute,
} from "@/lib/server/sport-work-route";
import {
  changeRelationshipStatus,
  recomputeInstallmentAccruals,
} from "@/lib/server/sport-work";

/**
 * Cambio di stato di un rapporto.
 *
 *   POST /api/v1/sport-work/relationships/:id/status  { status, reason, force }
 *
 * Non e un PATCH sul campo `status` per una ragione precisa: un cambio di
 * stato non e la modifica di un campo, e un atto che verifica delle condizioni
 * — attivare richiede contratto e anagrafica, cessare richiede un motivo — e un
 * PATCH generico permetterebbe di scriverlo aggirandole.
 */
export const runtime = "nodejs";

export const POST = sportWorkRoute(
  "sport_work.manage",
  async ({ params, request, scope }) => {
    const body = (await readBody(request)) as any;
    const relationship = await changeRelationshipStatus(
      params.id,
      String(body?.status || ""),
      { reason: body?.reason, force: Boolean(body?.force) },
      scope,
    );

    await recomputeInstallmentAccruals(relationship.id, scope);
    return ok(relationship);
  },
  "Cambio di stato non riuscito",
);
