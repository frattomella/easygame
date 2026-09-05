import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **La paginazione contava il club, il perimetro tagliava dopo** (PP-03 §10.1).
 *
 * `hasPostQueryFilters` elencava i due parametri storici `trainer_scope` e
 * `trainer_id`, ed era giusta quando il filtro si **chiedeva**. Dal momento in
 * cui il perimetro dell'allenatore e diventato implicito sul ruolo — D-5, «non
 * c'e nessun parametro da omettere per uscirne» — la domanda non e piu «e stato
 * chiesto un filtro?» ma «ne verra applicato uno?».
 *
 * Finche guardava i parametri, `take/skip` e `count` giravano **prima** del
 * taglio: a un allenatore con due atleti nel perimetro `meta.total` dichiarava
 * quelli del club intero, e `hasMore` gli offriva pagine che non contenevano
 * niente. La cardinalita di un insieme che non si puo vedere e comunque
 * un'informazione su quell'insieme.
 */

const CLUB = "dddddddd-d100-4000-8000-00000000000d";
const MISTER = "11111111-d100-4000-8000-000000000001";

const CAT_MIA = "cat-mia";
const CAT_ALTRUI = "cat-altrui";

let risorse;
let setPrismaClientForTests;
let fake;

const scopeAllenatore = () => ({
  userId: MISTER,
  activeOrganizationId: CLUB,
  activeRole: "trainer",
  allowedOrganizationIds: [CLUB],
  accessScopes: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  risorse = await import("../../src/lib/server/resources.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const atleta = (indice, categoria) => ({
  id: `atleta-${indice}`,
  organization_id: CLUB,
  first_name: `Nome${indice}`,
  last_name: `Cognome${indice}`,
  status: "active",
  category_id: categoria,
  data: {},
});

const seed = () => ({
  user: [{ id: MISTER, email: "mister@club.it" }],
  club: [
    {
      id: CLUB,
      slug: "club",
      name: "Club",
      categories: [
        { id: CAT_MIA, name: "Under 12" },
        { id: CAT_ALTRUI, name: "Prima squadra" },
      ],
      trainers: [
        {
          id: "trainer-1",
          email: "mister@club.it",
          linkedUserId: MISTER,
          categories: [CAT_MIA],
          groups: [],
        },
      ],
      staff_members: [],
    },
  ],
  athlete: [
    atleta(1, CAT_MIA),
    atleta(2, CAT_MIA),
    atleta(3, CAT_ALTRUI),
    atleta(4, CAT_ALTRUI),
    atleta(5, CAT_ALTRUI),
    atleta(6, CAT_ALTRUI),
  ],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const pagina = (parametri) =>
  risorse.listResourcePage(
    "athletes",
    new URLSearchParams({ organization_id: CLUB, ...parametri }),
    scopeAllenatore(),
  );

test("PP-03 §10.1 · `meta.total` conta il perimetro, non il club", async () => {
  const { meta } = await pagina({ limit: "1", offset: "0" });

  assert.equal(
    meta.total,
    2,
    "dichiarava la cardinalita del club a chi non ne puo vedere le righe",
  );
});

test("PP-03 §10.1 · `hasMore` non offre pagine che non contengono niente", async () => {
  const { records, meta } = await pagina({ limit: "2", offset: "0" });

  assert.equal(records.length, 2);
  assert.equal(
    meta.hasMore,
    false,
    "con il totale del club `hasMore` restava vero e la pagina dopo era vuota",
  );
});

test("PP-03 §10.1 · percorrendo le pagine si ritrovano tutti e soli i propri atleti", async () => {
  const trovati = [];
  for (let offset = 0; offset < 6; offset += 1) {
    const { records } = await pagina({ limit: "1", offset: String(offset) });
    trovati.push(...records.map((riga) => riga.id));
  }

  assert.deepEqual(
    [...new Set(trovati)].sort(),
    ["atleta-1", "atleta-2"],
    "il taglio dopo la query non deve perdere righe ne ripeterle",
  );
});

test("PP-03 §10.1 · senza paginazione il perimetro resta quello di prima", async () => {
  const { records, meta } = await pagina({});

  assert.deepEqual(
    records.map((riga) => riga.id).sort(),
    ["atleta-1", "atleta-2"],
  );
  assert.ok(
    !meta,
    "chi non chiede la pagina non deve interpretare niente di nuovo",
  );
});

test("PP-03 §10.1 · alla direzione la paginazione resta quella del club", async () => {
  /*
    Il verso opposto: la correzione tocca il **ruolo allenatore** e non deve
    spostare il conteggio di chi vede tutto — ne, soprattutto, spegnere la
    paginazione sul database per tutti, che era la strada facile e sbagliata.
  */
  const { meta } = await risorse.listResourcePage(
    "athletes",
    new URLSearchParams({ organization_id: CLUB, limit: "2", offset: "0" }),
    {
      userId: "presidente",
      activeOrganizationId: CLUB,
      activeRole: "owner",
      allowedOrganizationIds: [CLUB],
      accessScopes: [],
    },
  );

  assert.equal(meta.total, 6);
  assert.equal(meta.hasMore, true);
});
