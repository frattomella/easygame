import {
  ok,
  readBody,
  sportWorkRoute,
} from "@/lib/server/sport-work-route";
import {
  getPlanForRelationship,
  getRelationshipById,
  getSportWorkPersonById,
  listActivationBlockers,
  listInstallments,
  updateRelationship,
} from "@/lib/server/sport-work";
import { listOutboundTransactions } from "@/lib/server/sport-work-ledger";

/**
 * Dettaglio e modifica di un rapporto.
 *
 *   GET   /api/v1/sport-work/relationships/:id
 *   GET   /api/v1/sport-work/relationships/:id?view=detail
 *   PATCH /api/v1/sport-work/relationships/:id
 *
 * `view=detail` e la proiezione che serve alla scheda: rapporto, persona,
 * piano, scadenze, movimenti e cosa manca per attivarlo. Farla comporre al
 * client vorrebbe dire cinque richieste per aprire una pagina.
 */
export const runtime = "nodejs";

export const GET = sportWorkRoute(
  "sport_work.read",
  async ({ params, url, scope }) => {
    const relationship = await getRelationshipById(params.id, scope);

    if (url.searchParams.get("view") !== "detail") {
      return ok(relationship);
    }

    const [person, plan, installments, transactions] = await Promise.all([
      getSportWorkPersonById(relationship.person_id, scope),
      getPlanForRelationship(relationship.id, scope),
      listInstallments({ relationshipId: relationship.id }, scope),
      listOutboundTransactions({ relationshipId: relationship.id }, scope),
    ]);

    return ok({
      relationship,
      person,
      plan,
      installments,
      transactions,
      activationBlockers: listActivationBlockers(relationship, person),
    });
  },
);

export const PATCH = sportWorkRoute(
  "sport_work.manage",
  async ({ params, request, scope }) =>
    ok(
      await updateRelationship(
        params.id,
        (await readBody(request)) as any,
        scope,
      ),
    ),
  "Modifica del rapporto non riuscita",
);
