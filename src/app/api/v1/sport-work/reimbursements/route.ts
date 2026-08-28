import {
  ok,
  readBody,
  sportWorkRoute,
} from "@/lib/server/sport-work-route";
import {
  createReimbursement,
  listReimbursements,
} from "@/lib/server/sport-work-agenda";

/**
 * I rimborsi spese.
 *
 *   GET  /api/v1/sport-work/reimbursements?status=APPROVED
 *   POST /api/v1/sport-work/reimbursements
 *
 * Un rimborso non e un compenso: non e reddito, non concorre a nessuna soglia,
 * e non entra nel progressivo. Confonderli renderebbe falso — in eccesso — il
 * conto verso le franchigie.
 */
export const runtime = "nodejs";

export const GET = sportWorkRoute("sport_work.read", async ({ url, scope }) =>
  ok(
    await listReimbursements(
      {
        organizationId: url.searchParams.get("organization_id"),
        personId: url.searchParams.get("person_id"),
        status: url.searchParams.get("status"),
      },
      scope,
    ),
  ),
);

export const POST = sportWorkRoute(
  "sport_work.manage",
  async ({ request, scope }) =>
    ok(await createReimbursement((await readBody(request)) as any, scope), 201),
  "Creazione del rimborso non riuscita",
);
