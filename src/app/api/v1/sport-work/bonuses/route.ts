import {
  ok,
  readBody,
  sportWorkRoute,
} from "@/lib/server/sport-work-route";
import { createBonus, listBonuses } from "@/lib/server/sport-work-agenda";

/**
 * I premi.
 *
 *   GET  /api/v1/sport-work/bonuses?person_id=
 *   POST /api/v1/sport-work/bonuses
 *
 * Dominio separato dai compensi, non un tipo di rata: il trattamento fiscale
 * di un premio e diverso e **non e validato**. Chi lo registra dichiara se e un
 * premio vero o una parte variabile della retribuzione — la distinzione la fa
 * il contratto, non l'etichetta — e il valore predefinito e «da verificare».
 */
export const runtime = "nodejs";

export const GET = sportWorkRoute("sport_work.read", async ({ url, scope }) =>
  ok(
    await listBonuses(
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
    ok(await createBonus((await readBody(request)) as any, scope), 201),
  "Creazione del premio non riuscita",
);
