import {
  ok,
  readBody,
  sportWorkRoute,
} from "@/lib/server/sport-work-route";
import {
  createVatInvoice,
  listVatInvoices,
} from "@/lib/server/sport-work-agenda";

/**
 * Le fatture ricevute dai professionisti con partita IVA.
 *
 *   GET  /api/v1/sport-work/vat-invoices?person_id=
 *   POST /api/v1/sport-work/vat-invoices
 *
 * Gli importi si **trascrivono dal documento**, non si calcolano: imponibile,
 * IVA ed eventuale ritenuta li ha determinati chi ha emesso la fattura.
 * Ricalcolarli qui significherebbe che EasyGame ha un'opinione su una
 * dichiarazione altrui.
 */
export const runtime = "nodejs";

export const GET = sportWorkRoute("sport_work.read", async ({ url, scope }) =>
  ok(
    await listVatInvoices(
      {
        organizationId: url.searchParams.get("organization_id"),
        personId: url.searchParams.get("person_id"),
      },
      scope,
    ),
  ),
);

export const POST = sportWorkRoute(
  "sport_work.manage",
  async ({ request, scope }) =>
    ok(await createVatInvoice((await readBody(request)) as any, scope), 201),
  "Registrazione della fattura non riuscita",
);
