import {
  ok,
  readBody,
  sportWorkRoute,
} from "@/lib/server/sport-work-route";
import {
  createRelationship,
  listRelationships,
  refreshExpiredRelationships,
} from "@/lib/server/sport-work";

/**
 * I rapporti di lavoro sportivo.
 *
 *   GET  /api/v1/sport-work/relationships?status=ACTIVE
 *   POST /api/v1/sport-work/relationships
 *
 * La lettura porta prima a scaduti i contratti la cui data di fine e passata:
 * una schermata che mostra «attivo» un contratto finito a giugno e una
 * schermata che mente, e la segreteria se ne accorge quando ormai il rinnovo e
 * in ritardo.
 */
export const runtime = "nodejs";

export const GET = sportWorkRoute("sport_work.read", async ({ url, scope }) => {
  if (scope.activeOrganizationId) {
    await refreshExpiredRelationships(scope.activeOrganizationId);
  }

  return ok(
    await listRelationships(
      {
        organizationId: url.searchParams.get("organization_id"),
        personId: url.searchParams.get("person_id"),
        status: url.searchParams.get("status"),
        seasonId: url.searchParams.get("season_id"),
      },
      scope,
    ),
  );
});

export const POST = sportWorkRoute(
  "sport_work.manage",
  async ({ request, scope }) =>
    ok(await createRelationship((await readBody(request)) as any, scope), 201),
  "Creazione del rapporto non riuscita",
);
