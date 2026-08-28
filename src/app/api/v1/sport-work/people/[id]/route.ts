import {
  ok,
  readBody,
  sportWorkRoute,
} from "@/lib/server/sport-work-route";
import {
  getSportWorkPersonById,
  updateSportWorkPerson,
} from "@/lib/server/sport-work";

/**
 * Dettaglio e modifica di una persona.
 *
 *   GET   /api/v1/sport-work/people/:id
 *   PATCH /api/v1/sport-work/people/:id
 *
 * Non esiste DELETE. Una persona con un rapporto e un contratto firmato: si
 * chiude il rapporto, non si cancella chi lo ha firmato.
 */
export const runtime = "nodejs";

export const GET = sportWorkRoute("sport_work.read", async ({ params, scope }) =>
  ok(await getSportWorkPersonById(params.id, scope)),
);

export const PATCH = sportWorkRoute(
  "sport_work.manage",
  async ({ params, request, scope }) =>
    ok(
      await updateSportWorkPerson(
        params.id,
        (await readBody(request)) as any,
        scope,
      ),
    ),
  "Modifica della persona non riuscita",
);
