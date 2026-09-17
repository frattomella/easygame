import {
  ok,
  readBody,
  sportWorkRoute,
} from "@/lib/server/sport-work-route";
import { completeObligation } from "@/lib/server/sport-work-agenda";
import { readRequestedSeason } from "@/lib/seasons/context";

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
  async ({ params, request, scope }) => {
    const body = (await readBody(request)) as any;
    /*
      La stagione che il browser mostra viaggia con il versamento (D-RD-29):
      la riga di prima nota del versamento nasce nella stagione giusta, non
      per data.
    */
    const stagione = readRequestedSeason(request);
    const input =
      body && typeof body === "object" && body.payment && typeof body.payment === "object"
        ? { ...body, payment: { ...body.payment, activeSeasonId: stagione.value } }
        : body;
    return ok(await completeObligation(params.id, input, scope));
  },
  "Aggiornamento dell'adempimento non riuscito",
);
