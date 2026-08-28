import {
  ok,
  readBody,
  sportWorkRoute,
} from "@/lib/server/sport-work-route";
import { transitionReimbursement } from "@/lib/server/sport-work-agenda";

/**
 * Fa avanzare un rimborso lungo il suo ciclo.
 *
 *   PATCH /api/v1/sport-work/reimbursements/:id  { status, reason }
 *
 * A `PAID` non ci si arriva da qui: si registra il pagamento, che e un
 * movimento di denaro e non un cambio di etichetta.
 */
export const runtime = "nodejs";

export const PATCH = sportWorkRoute(
  "sport_work.manage",
  async ({ params, request, scope }) => {
    const body = (await readBody(request)) as any;
    return ok(
      await transitionReimbursement(
        params.id,
        String(body?.status || ""),
        { reason: body?.reason },
        scope,
      ),
    );
  },
  "Aggiornamento del rimborso non riuscito",
);
