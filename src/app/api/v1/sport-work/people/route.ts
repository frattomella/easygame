import {
  ok,
  readBody,
  sportWorkRoute,
} from "@/lib/server/sport-work-route";
import {
  createSportWorkPerson,
  listSportWorkPeople,
} from "@/lib/server/sport-work";

/**
 * Le persone del lavoro sportivo.
 *
 *   GET  /api/v1/sport-work/people?search=rossi
 *   POST /api/v1/sport-work/people
 *
 * L'elenco **non porta l'IBAN**: un elenco si carica per mostrare venti righe,
 * e ogni campo che ci sta dentro finisce nella cache del browser. Le coordinate
 * bancarie si leggono aprendo la scheda, una alla volta.
 */
export const runtime = "nodejs";

export const GET = sportWorkRoute("sport_work.read", async ({ url, scope }) =>
  ok(
    await listSportWorkPeople(
      {
        organizationId: url.searchParams.get("organization_id"),
        search: url.searchParams.get("search"),
      },
      scope,
    ),
  ),
);

export const POST = sportWorkRoute(
  "sport_work.manage",
  async ({ request, scope }) =>
    ok(await createSportWorkPerson((await readBody(request)) as any, scope), 201),
  "Creazione della persona non riuscita",
);
