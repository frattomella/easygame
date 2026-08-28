import {
  ok,
  readBody,
  sportWorkRoute,
} from "@/lib/server/sport-work-route";
import { reverseCompensationPayout } from "@/lib/server/sport-work-ledger";

/**
 * Storna un'erogazione.
 *
 *   POST /api/v1/sport-work/payouts/:id/reverse  { reason }
 *
 * Non esiste DELETE su questo registro. La riga originale e la risposta alla
 * domanda «cosa e successo», e la risposta non e «niente»: resta, marcata, con
 * il motivo, e una riga di segno opposto la compensa.
 */
export const runtime = "nodejs";

export const POST = sportWorkRoute(
  "sport_work.pay",
  async ({ params, request, scope }) => {
    const body = (await readBody(request)) as any;
    return ok(
      await reverseCompensationPayout(
        params.id,
        { reason: body?.reason, idempotencyKey: body?.idempotencyKey },
        scope,
      ),
      201,
    );
  },
  "Storno non riuscito",
);
