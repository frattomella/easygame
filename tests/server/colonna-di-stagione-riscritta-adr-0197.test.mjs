import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Una colonna di stagione riscritta per intero conserva le altre stagioni**
 * (ADR-0197, misurato sul pilota il 2026-09-17).
 *
 * Il riporto aveva copiato 36 voci del programma settimanale dalla stagione A
 * alla B (\`season.rollover … weekly_schedule created 36\`). Il giorno dopo la
 * colonna ne aveva 40, **tutte** di B: il pannello — che legge filtrato sulla
 * stagione che mostra e riscrive l'intera colonna con \`PATCH /api/v1/clubs\` —
 * aveva cancellato le 36 della A con un salvataggio riuscito. Lo stesso
 * percorso vale per gruppi operativi, note di segreteria e ogni collezione
 * di stagione scritta come colonna aggregata.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-0000000001a7";
const A = "season-2026-2027";
const B = "season-2026-09-01-2027-08-31-ru1uu";

const scope = () => ({
  userId: "user-a",
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
});

let resources;
let setPrismaClientForTests;
let fake;

const voce = (id, seasonId, extra = {}) => ({
  id,
  day: "Lunedì",
  startTime: "18:00",
  endTime: "19:00",
  categoryId: `cat-${seasonId}`,
  ...(seasonId ? { seasonId } : {}),
  ...extra,
});

const seed = () => ({
  club: [
    {
      id: CLUB,
      slug: "club-a",
      name: "Club A",
      settings: {
        seasons: [
          { id: A, label: "2026/2027", startDate: "2026-07-01", endDate: "2027-06-30", status: "archived", createdAt: "2026-08-21T00:00:00.000Z" },
          { id: B, label: "2026/27", startDate: "2026-09-01", endDate: "2027-08-31", status: "active", createdAt: "2026-09-16T00:00:00.000Z" },
        ],
        activeSeasonId: B,
      },
      weekly_schedule: [voce("a-1", A), voce("a-2", A), voce("b-1", B)],
      category_groups: [
        { id: "g-a", categoryId: "cat-a", siteId: "site-1", seasonId: A },
        { id: "g-b", categoryId: "cat-b", siteId: "site-1", seasonId: B },
      ],
    },
  ],
  clubResourceItem: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  resources = await import("../../src/lib/server/resources.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const colonna = (field) => fake.rows("club")[0][field];

test("il pannello della stagione B riscrive la colonna: le voci della A restano", async () => {
  // Cio che il browser ha in mano: la lettura filtrata su B, piu una voce nuova senza stagione.
  const dalPannello = [voce("b-1", B), voce("b-2", null)];

  await resources.updateResource(
    "clubs",
    CLUB,
    { weekly_schedule: dalPannello },
    scope(),
    { activeSeasonId: B },
  );

  const dopo = colonna("weekly_schedule");
  const ids = dopo.map((r) => r.id).sort();
  assert.deepEqual(ids, ["a-1", "a-2", "b-1", "b-2"], "le due voci della A non spariscono");
  assert.equal(dopo.find((r) => r.id === "b-2").seasonId, B, "la voce nuova prende la stagione della richiesta");
  assert.ok(dopo.filter((r) => r.seasonId === A).length === 2);
});

test("togliere una voce della stagione mostrata la toglie davvero", async () => {
  await resources.updateResource(
    "clubs",
    CLUB,
    { weekly_schedule: [] },
    scope(),
    { activeSeasonId: B },
  );

  const dopo = colonna("weekly_schedule");
  assert.deepEqual(dopo.map((r) => r.id).sort(), ["a-1", "a-2"], "B svuotata, A intatta");
});

test("chi guarda la A (stagione dichiarata, non attiva) riscrive la A e non tocca la B", async () => {
  await resources.updateResource(
    "clubs",
    CLUB,
    { weekly_schedule: [voce("a-1", A, { startTime: "17:00" })] },
    scope(),
    { activeSeasonId: A },
  );

  const dopo = colonna("weekly_schedule");
  assert.deepEqual(dopo.map((r) => r.id).sort(), ["a-1", "b-1"]);
  assert.equal(dopo.find((r) => r.id === "a-1").startTime, "17:00");
});

test("i gruppi operativi seguono la stessa regola", async () => {
  await resources.updateResource(
    "clubs",
    CLUB,
    { category_groups: [{ id: "g-b2", categoryId: "cat-b", siteId: "site-2" }] },
    scope(),
    { activeSeasonId: B },
  );

  const dopo = colonna("category_groups");
  assert.deepEqual(dopo.map((r) => r.id).sort(), ["g-a", "g-b2"], "g-b tolto, g-a conservato, g-b2 aggiunto");
  assert.equal(dopo.find((r) => r.id === "g-b2").seasonId, B);
});

test("senza un perimetro di stagione (header assente) la colonna si scrive com'e arrivata", async () => {
  await resources.updateResource(
    "clubs",
    CLUB,
    { weekly_schedule: [voce("solo", A)] },
    scope(),
  );

  assert.deepEqual(colonna("weekly_schedule").map((r) => r.id), ["solo"]);
});

test("la proiezione su club_resource_items dice la stessa cosa della colonna", async () => {
  await resources.updateResource(
    "clubs",
    CLUB,
    { weekly_schedule: [voce("b-1", B), voce("b-2", null)] },
    scope(),
    { activeSeasonId: B },
  );

  const items = fake
    .rows("clubResourceItem")
    .filter((r) => r.resource_type === "weekly_schedule")
    .map((r) => r.payload?.id)
    .sort();
  assert.deepEqual(items, ["a-1", "a-2", "b-1", "b-2"]);
});

/* ============================================ i record senza annata restano senza (revisione A-C2/B2/C2) */

test("un client che rimanda la colonna intera con i record senza annata non li sposta nella stagione della richiesta", async () => {
  fake = createFakePrisma({
    ...seed(),
    club: [
      {
        ...seed().club[0],
        discounts: [
          { id: "legacy-1", name: "Fratelli" },
          { id: "legacy-2", name: "Famiglia" },
          { id: "b-1", name: "Promo", seasonId: B },
          { id: "b-2", name: "Estate", seasonId: B },
        ],
      },
    ],
  });
  setPrismaClientForTests(fake.client);

  // `deleteClubDataItem` di b-2: legge la colonna grezza (tutte le stagioni) e la rimanda senza b-2.
  await resources.updateResource(
    "clubs",
    CLUB,
    { discounts: [{ id: "legacy-1", name: "Fratelli" }, { id: "legacy-2", name: "Famiglia" }, { id: "b-1", name: "Promo", seasonId: B }] },
    scope(),
    { activeSeasonId: B },
  );

  const dopo = colonna("discounts");
  assert.deepEqual(dopo.map((r) => r.id).sort(), ["b-1", "legacy-1", "legacy-2"], "b-2 tolto");
  assert.equal(dopo.find((r) => r.id === "legacy-1").seasonId, undefined, "il record senza annata resta senza: e della stagione piu vecchia per regola");
  assert.equal(dopo.find((r) => r.id === "legacy-2").seasonId, undefined);
});

test("un record esistente non cambia stagione anche se il client lo rimanda con un'altra", async () => {
  await resources.updateResource(
    "clubs",
    CLUB,
    { weekly_schedule: [voce("a-1", B, { startTime: "17:00" }), voce("b-1", B)] },
    scope(),
    { activeSeasonId: B },
  );
  const dopo = colonna("weekly_schedule");
  assert.equal(dopo.find((r) => r.id === "a-1").seasonId, A, "la stagione della riga e immutabile in aggiornamento");
  assert.equal(dopo.find((r) => r.id === "a-1").startTime, "17:00", "la modifica passa");
});

test("una dichiarazione stale (stagione che il club non ha) ricade sull'attiva e conserva le altre stagioni", async () => {
  await resources.updateResource(
    "clubs",
    CLUB,
    { weekly_schedule: [voce("b-1", B), voce("b-3", null)] },
    scope(),
    { activeSeasonId: "season-di-un-altro-club" },
  );
  const dopo = colonna("weekly_schedule");
  assert.deepEqual(dopo.map((r) => r.id).sort(), ["a-1", "a-2", "b-1", "b-3"]);
  assert.equal(dopo.find((r) => r.id === "b-3").seasonId, B);
});
