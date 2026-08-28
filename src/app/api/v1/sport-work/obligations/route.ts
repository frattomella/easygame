import {
  ok,
  readBody,
  sportWorkRoute,
} from "@/lib/server/sport-work-route";
import {
  createManualObligation,
  listObligations,
} from "@/lib/server/sport-work-agenda";

/**
 * L'agenda degli adempimenti.
 *
 *   GET  /api/v1/sport-work/obligations?status=DUE
 *   POST /api/v1/sport-work/obligations   (adempimento aggiunto a mano)
 *
 * EasyGame produce l'input dell'adempimento, non l'adempimento: sa che esiste,
 * entro quando, con quali dati, e se qualcuno lo ha marcato fatto. Non
 * trasmette niente a nessuno.
 */
export const runtime = "nodejs";

export const GET = sportWorkRoute("sport_work.read", async ({ url, scope }) =>
  ok(
    await listObligations(
      {
        organizationId: url.searchParams.get("organization_id"),
        status: url.searchParams.get("status"),
        kind: url.searchParams.get("kind"),
        dueBefore: url.searchParams.get("due_before"),
      },
      scope,
    ),
  ),
);

export const POST = sportWorkRoute(
  "sport_work.manage",
  async ({ request, scope }) =>
    ok(await createManualObligation((await readBody(request)) as any, scope), 201),
  "Creazione dell'adempimento non riuscita",
);
