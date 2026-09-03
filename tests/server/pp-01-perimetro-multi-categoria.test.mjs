import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **PP-01 §A — il perimetro si e allargato, e questo file dice fin dove.**
 *
 * [ADR-0111](../../docs/knowledge-base/18-decision-log.md) decide che un evento
 * sta dentro un perimetro se **almeno una** delle sue categorie ci sta. E un
 * allargamento voluto — senza, l'allenatore della seconda categoria era fuori
 * perimetro sul proprio stesso allenamento — ma un allargamento e la cosa che va
 * misurata due volte: una per verificare che faccia cio che deve, e una per
 * verificare che **non faccia altro**.
 *
 * I due confini che restano, e che questo file presidia:
 *
 * 1. un evento che non tocca **nessuna** categoria del perimetro resta fuori,
 *    sia in lettura sia nell'atto;
 * 2. ammettere l'evento **non ammette le persone**: la convocazione di un atleta
 *    fuori perimetro viene rifiutata lo stesso, perche la giudica una guardia
 *    diversa e piu stretta (`assertAtletiDentroIlPerimetro`).
 */

const CLUB = "aaaaaaaa-9801-4000-8000-00000000000a";
const GESTORE = "11111111-9801-4000-8000-000000000aaa";

const CAT_A = "cat-a";
const CAT_B = "cat-b";
const CAT_C = "cat-c";

const EVENTO_AB = "eeeeeeee-9801-4000-8000-000000000001";
const EVENTO_C = "eeeeeeee-9801-4000-8000-000000000002";

const ATLETA_A = "atleta-di-a";

let eventi;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  eventi = await import("../../src/lib/server/events.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

/** Un ruolo di club con il perimetro dichiarato in righe di `accessScopes`. */
const scope = (categorie = []) => ({
  userId: GESTORE,
  activeOrganizationId: CLUB,
  activeRole: "club_manager",
  allowedOrganizationIds: [CLUB],
  accessScopes: categorie.map((value) => ({ kind: "category", value })),
});

const evento = (id, categorie) => ({
  id,
  organization_id: CLUB,
  kind: "training",
  legacy_id: id,
  title: `Evento ${id}`,
  status: "scheduled",
  category_id: categorie[0] ?? null,
  category_name: null,
  category_ids: categorie,
  starts_at: new Date("2026-09-10T18:00:00.000Z"),
  ends_at: null,
  version: 1,
  payload: { id },
});

const seed = () => ({
  user: [{ id: GESTORE, email: "gestore@club.it" }],
  club: [
    {
      id: CLUB,
      slug: "club",
      name: "Club",
      categories: [
        { id: CAT_A, name: "Under 12" },
        { id: CAT_B, name: "Under 15" },
        { id: CAT_C, name: "Prima squadra" },
      ],
      trainers: [],
      staff_members: [],
      trainings: [],
      matches: [],
    },
  ],
  clubEvent: [evento(EVENTO_AB, [CAT_A, CAT_B]), evento(EVENTO_C, [CAT_C])],
  athlete: [
    {
      id: ATLETA_A,
      organization_id: CLUB,
      first_name: "Atleta",
      last_name: "Di A",
      status: "active",
      category_id: CAT_A,
      category_name: "Under 12",
      data: {},
    },
  ],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

test("§A · un ruolo recintato sulla seconda categoria vede l'evento", async () => {
  const elenco = await eventi.listClubEvents(scope([CAT_B]), {
    kind: "training",
  });

  assert.deepEqual(
    elenco.map((riga) => riga.id),
    [EVENTO_AB],
    "prima il filtro guardava la sola primaria: la seconda categoria non trovava niente",
  );
});

test("§A · e un evento di nessuna delle sue categorie resta fuori", async () => {
  const elenco = await eventi.listClubEvents(scope([CAT_B]), {
    kind: "training",
  });

  assert.equal(
    elenco.some((riga) => riga.id === EVENTO_C),
    false,
    "allargare non e spegnere: cio che non lo riguarda resta fuori",
  );
});

test("§A · senza perimetro dichiarato si vede tutto, come prima", async () => {
  const elenco = await eventi.listClubEvents(scope(), { kind: "training" });
  assert.equal(
    elenco.length,
    2,
    "zero righe di perimetro = tutto il club, mai «nessun accesso» (ADR-0103)",
  );
});

test("§A · l'atto su un evento che tocca il proprio perimetro e ammesso", async () => {
  await eventi.updateClubEvent(scope([CAT_B]), EVENTO_AB, {
    title: "Corretto",
  });

  const riga = fake.rows("clubEvent").find((r) => r.id === EVENTO_AB);
  assert.equal(riga.title, "Corretto");
});

test("§A · l'atto su un evento fuori da ogni sua categoria e respinto", async () => {
  await assert.rejects(
    () =>
      eventi.updateClubEvent(scope([CAT_B]), EVENTO_C, {
        title: "Non dovrebbe",
      }),
    /Accesso negato/,
  );

  const riga = fake.rows("clubEvent").find((r) => r.id === EVENTO_C);
  assert.equal(riga.title, `Evento ${EVENTO_C}`, "e la riga non e cambiata");
});

/*
  **Il confine che l'allargamento non sposta** — e perche non si prova qui.

  Un evento multi-categoria ammesso perche **una** delle sue categorie sta nel
  perimetro non e un lasciapassare sulle persone: ogni atleta convocato passa da
  `assertAtletiDentroIlPerimetro`, che e una guardia diversa e piu stretta.

  Quella guardia esprime il perimetro con un filtro **di relazione**
  (`category_memberships: { some: ... }`, in `access-scope-query.ts`), e il
  doppio di Prisma non lo implementa: una condizione che non sa valutare la
  considera soddisfatta, quindi qui l'atleta risulterebbe **ammesso** e il test
  proverebbe il contrario di cio che deve provare.

  La prova sta percio in `scripts/pp-01-uat.mjs` (P-08), contro PostgreSQL vero,
  dove quel filtro gira davvero. Scriverla qui con il doppio com'e sarebbe stato
  peggio che non scriverla: un presidio verde su un confine non verificato.
*/
