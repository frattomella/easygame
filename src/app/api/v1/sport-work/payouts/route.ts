import {
  ok,
  readBody,
  sportWorkRoute,
} from "@/lib/server/sport-work-route";
import {
  listOutboundTransactions,
  recordCompensationPayout,
} from "@/lib/server/sport-work-ledger";

/**
 * Il registro in uscita.
 *
 *   GET  /api/v1/sport-work/payouts?person_id=&fiscal_year=2026
 *   POST /api/v1/sport-work/payouts
 *
 * Registrare un'erogazione richiede `sport_work.pay`, che e un permesso
 * diverso da `sport_work.manage`: configurare un piano e far uscire denaro
 * sono due responsabilita, e un giorno un club vorra separarle.
 *
 * Il corpo puo portare `idempotencyKey`: due invii dello stesso clic la
 * portano uguale, e il secondo restituisce il movimento gia registrato invece
 * di crearne un altro.
 */
export const runtime = "nodejs";

export const GET = sportWorkRoute("sport_work.read", async ({ url, scope }) =>
  ok(
    await listOutboundTransactions(
      {
        organizationId: url.searchParams.get("organization_id"),
        personId: url.searchParams.get("person_id"),
        relationshipId: url.searchParams.get("relationship_id"),
        installmentId: url.searchParams.get("installment_id"),
        fiscalYear: url.searchParams.get("fiscal_year"),
        transactionType: url.searchParams.get("type"),
      },
      scope,
    ),
  ),
);

export const POST = sportWorkRoute(
  "sport_work.pay",
  async ({ request, scope }) => {
    const body = (await readBody(request)) as any;
    const result = await recordCompensationPayout(body, scope);

    return ok(
      {
        transaction: result.transaction,
        installment: result.installment,
        position: result.position,
        computation: result.computation,
        duplicate: result.duplicate,
      },
      result.duplicate ? 200 : 201,
    );
  },
  "Registrazione dell'erogazione non riuscita",
);
