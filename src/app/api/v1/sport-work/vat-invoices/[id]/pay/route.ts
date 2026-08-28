import {
  ok,
  readBody,
  sportWorkRoute,
} from "@/lib/server/sport-work-route";
import { payVatInvoice } from "@/lib/server/sport-work-agenda";

/**
 * Paga una fattura ricevuta.
 *
 *   POST /api/v1/sport-work/vat-invoices/:id/pay
 *
 * Nessuna regola co.co.co. la tocca: il calcolo lo ha fatto chi ha emesso il
 * documento.
 */
export const runtime = "nodejs";

export const POST = sportWorkRoute(
  "sport_work.pay",
  async ({ params, request, scope }) =>
    ok(
      await payVatInvoice(params.id, (await readBody(request)) as any, scope),
      201,
    ),
  "Pagamento della fattura non riuscito",
);
