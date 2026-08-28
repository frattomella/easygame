import {
  ok,
  readBody,
  sportWorkRoute,
} from "@/lib/server/sport-work-route";
import { payBonus } from "@/lib/server/sport-work-agenda";

/**
 * Eroga un premio.
 *
 *   POST /api/v1/sport-work/bonuses/:id/pay
 *
 * Esce dal registro come ogni altra uscita — Movimenti lo deve vedere — ma non
 * consuma le franchigie del lavoratore.
 */
export const runtime = "nodejs";

export const POST = sportWorkRoute(
  "sport_work.pay",
  async ({ params, request, scope }) =>
    ok(await payBonus(params.id, (await readBody(request)) as any, scope), 201),
  "Erogazione del premio non riuscita",
);
