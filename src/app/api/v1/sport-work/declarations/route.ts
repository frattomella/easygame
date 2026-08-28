import {
  ok,
  readBody,
  sportWorkRoute,
} from "@/lib/server/sport-work-route";
import {
  createDeclaration,
  listDeclarations,
} from "@/lib/server/sport-work";

/**
 * Le autocertificazioni dei compensi percepiti da altri committenti.
 *
 *   GET  /api/v1/sport-work/declarations?person_id=&fiscal_year=2026
 *   POST /api/v1/sport-work/declarations
 *
 * Non e un allegato: e un **dato di input del motore**. Le soglie sono del
 * lavoratore e non del committente, e senza questa dichiarazione il progressivo
 * e strutturalmente parziale.
 *
 * Registrarne una nuova sostituisce quella dell'anno, che resta marcata: quello
 * che il club sapeva a marzo resta quello che sapeva a marzo.
 */
export const runtime = "nodejs";

export const GET = sportWorkRoute("sport_work.read", async ({ url, scope }) =>
  ok(
    await listDeclarations(
      {
        organizationId: url.searchParams.get("organization_id"),
        personId: url.searchParams.get("person_id"),
        fiscalYear: url.searchParams.get("fiscal_year"),
        status: url.searchParams.get("status"),
      },
      scope,
    ),
  ),
);

export const POST = sportWorkRoute(
  "sport_work.manage",
  async ({ request, scope }) =>
    ok(await createDeclaration((await readBody(request)) as any, scope), 201),
  "Registrazione dell'autocertificazione non riuscita",
);
