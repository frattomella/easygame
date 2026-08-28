import {
  ok,
  readBody,
  sportWorkRoute,
} from "@/lib/server/sport-work-route";
import { payReimbursement } from "@/lib/server/sport-work-agenda";

/**
 * Liquida un rimborso approvato.
 *
 *   POST /api/v1/sport-work/reimbursements/:id/pay
 *
 * Si liquida solo cio che e stato approvato: l'approvazione e il momento in cui
 * qualcuno se ne assume la responsabilita, e saltarla renderebbe il passaggio
 * una formalita.
 */
export const runtime = "nodejs";

export const POST = sportWorkRoute(
  "sport_work.pay",
  async ({ params, request, scope }) =>
    ok(
      await payReimbursement(params.id, (await readBody(request)) as any, scope),
      201,
    ),
  "Liquidazione del rimborso non riuscita",
);
