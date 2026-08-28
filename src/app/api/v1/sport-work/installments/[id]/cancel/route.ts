import { ok, sportWorkRoute } from "@/lib/server/sport-work-route";
import { cancelInstallment } from "@/lib/server/sport-work";

/**
 * Annulla una scadenza programmata.
 *
 *   POST /api/v1/sport-work/installments/:id/cancel
 *
 * Non e un DELETE: la riga resta, marcata annullata. Una scadenza che ha gia
 * ricevuto denaro non si annulla affatto — si storna l'erogazione, che e
 * un'operazione diversa e visibile.
 */
export const runtime = "nodejs";

export const POST = sportWorkRoute(
  "sport_work.manage",
  async ({ params, scope }) => ok(await cancelInstallment(params.id, scope)),
  "Annullamento della scadenza non riuscito",
);
