import {
  ok,
  readBody,
  sportWorkRoute,
} from "@/lib/server/sport-work-route";
import { completeObligation } from "@/lib/server/sport-work-agenda";

/**
 * Marca un adempimento come assolto.
 *
 *   POST /api/v1/sport-work/obligations/:id/complete
 *
 * «Assolto» significa che **una persona lo ha fatto** e lo ha dichiarato qui,
 * non che EasyGame lo abbia trasmesso. La distinzione e l'intero senso del
 * capitolo adempimenti.
 */
export const runtime = "nodejs";

export const POST = sportWorkRoute(
  "sport_work.manage",
  async ({ params, request, scope }) =>
    ok(
      await completeObligation(params.id, (await readBody(request)) as any, scope),
    ),
  "Aggiornamento dell'adempimento non riuscito",
);
