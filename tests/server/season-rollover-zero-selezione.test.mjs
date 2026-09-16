import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Riporto di stagione: **zero significa zero** (ADR-0196).
 *
 * Il difetto osservato dal club: si crea una stagione nuova, EasyGame chiede
 * quali tesserati riportare, nessuno viene scelto, e nella stagione nuova
 * compaiono due atleti — quelli con pagamenti registrati — insieme ai loro
 * movimenti in prima nota.
 *
 * La fixture e quella del mandato: stagione A con tre atleti attivi, due con
 * incassi e uno senza; si crea la stagione B chiedendo il riporto dei
 * tesserati con `athleteIds = []`.
 *
 * Garanzie:
 *
 * 1. `[]` riporta **zero** tesserati e lo dichiara;
 * 2. `null` o assente **non** vale «tutti»: un riporto dei tesserati senza
 *    l'elenco e una richiesta incompleta, e si rifiuta prima di scrivere la
 *    stagione;
 * 3. creare una stagione — con o senza riporto — non tocca atleti, incassi,
 *    rate ne appartenenze: solo `clubs.settings` e le collezioni chieste;
 * 4. il riepilogo del riporto dichiara sempre i tesserati (proposti,
 *    riconfermati, creati).
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const CAT_A = "cat-under14-a";
const SEDE = "sede-nord";

const stagioni = () => ({
  activeSeasonId: "s-a",
  seasons: [
    {
      id: "s-a",
      label: "Stagione A",
      startDate: "2025-07-01",
      endDate: "2026-06-30",
      status: "active",
      createdAt: "2025-01-01T00:00:00.000Z",
    },
  ],
});

const voce = (id, resource_type, payload) => ({
  id,
  organization_id: CLUB,
  resource_type,
  name: payload.name || null,
  status: null,
  date: null,
  payload: { ...payload, id },
  created_at: new Date("2025-08-01T00:00:00.000Z"),
  updated_at: new Date("2025-08-01T00:00:00.000Z"),
});

const atleta = (id, cognome) => ({
  id,
  organization_id: CLUB,
  first_name: "Atleta",
  last_name: cognome,
  status: "active",
  category_id: CAT_A,
  category_name: "Under 14",
});

const appartenenza = (id, athlete_id) => ({
  id,
  organization_id: CLUB,
  athlete_id,
  category_id: CAT_A,
  category_name: "Under 14",
  site_id: SEDE,
  is_primary: true,
  created_at: "2025-08-01T00:00:00.000Z",
});

const incasso = (id, athlete_id, amount) => ({
  id,
  organization_id: CLUB,
  athlete_id,
  amount,
  paid_at: new Date("2025-09-10T00:00:00.000Z"),
  source: "MANUAL",
  reversed_at: null,
  data: {},
});

const seed = () => ({
  club: [{ id: CLUB, slug: "club", name: "Club", settings: stagioni() }],
  clubResourceItem: [voce(CAT_A, "categories", { name: "Under 14", seasonId: "s-a" })],
  athlete: [atleta("atleta-1", "Uno"), atleta("atleta-2", "Due"), atleta("atleta-3", "Tre")],
  athleteCategoryMembership: [
    appartenenza("m1", "atleta-1"),
    appartenenza("m2", "atleta-2"),
    appartenenza("m3", "atleta-3"),
  ],
  paymentTransaction: [incasso("p1", "atleta-1", 100), incasso("p2", "atleta-2", 50)],
  payment: [
    { id: "r1", organization_id: CLUB, athlete_id: "atleta-1", amount: 100, status: "paid", data: {} },
    { id: "r2", organization_id: CLUB, athlete_id: "atleta-2", amount: 50, status: "paid", data: {} },
  ],
});

let seasons;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  seasons = await import("../../src/lib/server/seasons.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import("../../src/lib/server/prisma.ts"));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const fotografia = () => ({
  atleti: JSON.stringify(fake.rows("athlete")),
  appartenenze: JSON.stringify(fake.rows("athleteCategoryMembership")),
  incassi: JSON.stringify(fake.rows("paymentTransaction")),
  rate: JSON.stringify(fake.rows("payment")),
});

const creaStagioneB = (rollover) =>
  seasons.createClubSeason({
    organizationId: CLUB,
    input: { label: "Stagione B", startDate: "2026-07-01", endDate: "2027-06-30" },
    activate: true,
    rollover,
  });

test("riproduzione del mandato: nessun atleta selezionato → zero tesserati nella stagione nuova", async () => {
  const prima = fotografia();
  const result = await creaStagioneB({
    sourceSeasonId: "s-a",
    types: ["categories", "athlete_memberships"],
    athleteIds: [],
  });

  assert.equal(result.rollover.athletes.proposed, 3, "la stagione A propone i tre tesserati");
  assert.equal(result.rollover.athletes.confirmed, 0);
  assert.equal(result.rollover.athletes.created, 0, "ATHLETES CARRIED = 0");
  assert.equal(result.rollover.athletes.carried, 0);
  assert.equal(result.rollover.athletes.notConfirmed, 3);

  const dopo = fotografia();
  assert.equal(dopo.atleti, prima.atleti, "nessun atleta creato o modificato");
  assert.equal(dopo.appartenenze, prima.appartenenze, "nessuna appartenenza nella stagione B");
  assert.equal(dopo.incassi, prima.incassi, "nessun incasso copiato");
  assert.equal(dopo.rate, prima.rate, "nessuna rata copiata");

  const categorieB = fake
    .rows("clubResourceItem")
    .filter((row) => row.resource_type === "categories" && row.payload.seasonId === result.season.id);
  assert.equal(categorieB.length, 1, "la categoria si riporta perche chiesta esplicitamente");
});

test("athleteIds assente con i tesserati fra i tipi non vale «tutti»: la richiesta si rifiuta prima di scrivere", async () => {
  const prima = fotografia();
  const stagioniPrima = JSON.stringify(fake.rows("club")[0].settings);

  await assert.rejects(
    creaStagioneB({ sourceSeasonId: "s-a", types: ["categories", "athlete_memberships"] }),
    /tesserati/i,
  );
  await assert.rejects(
    creaStagioneB({ sourceSeasonId: "s-a", types: ["categories", "athlete_memberships"], athleteIds: null }),
    /tesserati/i,
  );

  assert.equal(JSON.stringify(fake.rows("club")[0].settings), stagioniPrima, "la stagione non nasce");
  assert.deepEqual(fotografia(), prima);
});

test("il riporto diretto senza elenco dei tesserati si rifiuta allo stesso modo", async () => {
  const creata = await creaStagioneB(null);
  await assert.rejects(
    seasons.runClubSeasonRollover({
      organizationId: CLUB,
      sourceSeasonId: "s-a",
      targetSeasonId: creata.season.id,
      types: ["categories", "athlete_memberships"],
    }),
    /tesserati/i,
  );
  assert.equal(fake.rows("athleteCategoryMembership").length, 3);
});

test("senza i tesserati fra i tipi l'elenco non serve e non se ne porta nessuno", async () => {
  const result = await creaStagioneB({ sourceSeasonId: "s-a", types: ["categories"] });
  assert.equal(result.rollover.athletes.requested, false);
  assert.equal(result.rollover.athletes.created, 0);
  assert.equal(fake.rows("athleteCategoryMembership").length, 3);
});

test("creare una stagione senza riporto scrive solo le impostazioni del club", async () => {
  const prima = fotografia();
  const vociPrima = fake.rows("clubResourceItem").length;
  const result = await creaStagioneB(null);

  assert.equal(result.rollover, null);
  assert.deepEqual(fotografia(), prima);
  assert.equal(fake.rows("clubResourceItem").length, vociPrima);
  const scritture = fake.calls.filter((call) =>
    ["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"].includes(call.method),
  );
  assert.deepEqual(
    scritture.map((call) => call.delegate),
    ["club"],
    "l'unica scrittura e clubs.settings",
  );
});

test("una scelta esplicita si rispetta: un solo riconfermato entra, gli altri no", async () => {
  const result = await creaStagioneB({
    sourceSeasonId: "s-a",
    types: ["categories", "athlete_memberships"],
    athleteIds: ["atleta-2"],
  });
  assert.equal(result.rollover.athletes.confirmed, 1);
  assert.equal(result.rollover.athletes.created, 1);
  const nuove = fake.rows("athleteCategoryMembership").filter((row) => row.category_id !== CAT_A);
  assert.equal(nuove.length, 1);
  assert.equal(nuove[0].athlete_id, "atleta-2");
});
