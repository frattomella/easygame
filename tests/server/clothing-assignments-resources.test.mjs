import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Le scritture dell'abbigliamento passano da `resources.ts` (D32).
 *
 * Il difetto. `/api/clothing/assignments` scriveva `clubs.clothing_inventory`,
 * `clubs.kit_assignments` e `clubs.jersey_assignments` con
 * `prisma.club.update`. Le pagine leggono quelle colonne e non se ne
 * accorgevano, ma `club_resource_items` — la copia normalizzata che serve il
 * CRUD generico `/api/v1/kit_assignments` — restava alla versione precedente.
 * Il disallineamento era silenzioso e cresceva a ogni assegnazione: e la
 * trappola numero 3 di CLAUDE.md.
 *
 * Perche una transazione sola e non tre chiamate in fila. Assegnare un kit
 * scala il magazzino, aggiunge l'assegnazione e puo assegnare un numero di
 * maglia. Con una transazione per collezione, un errore sulla seconda
 * lascerebbe la prima gia scritta: magazzino scalato per un kit che nessuno
 * risulta avere. E il tipo di incoerenza che nessuno nota finche non conta i
 * capi in magazzino.
 */

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..");
const CLUB_A = "aaaaaaaa-0000-4000-8000-000000000001";
const CLUB_B = "bbbbbbbb-0000-4000-8000-000000000002";

let resources;
let setPrismaClientForTests;
let fake;
let transazioni;

const seed = () => ({
  club: [
    {
      id: CLUB_A,
      clothing_inventory: [],
      kit_assignments: [],
      jersey_assignments: [],
    },
    {
      id: CLUB_B,
      clothing_inventory: [],
      kit_assignments: [],
      jersey_assignments: [],
    },
  ],
  clubResourceItem: [
    {
      id: "riga-b",
      organization_id: CLUB_B,
      resource_type: "kit_assignments",
      name: null,
      status: null,
      date: null,
      payload: { id: "assegnazione-del-club-b", athleteId: "atleta-b" },
      created_at: new Date("2026-01-01T00:00:00Z"),
      updated_at: new Date("2026-01-01T00:00:00Z"),
    },
  ],
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
  transazioni = 0;
  const vera = fake.client.$transaction.bind(fake.client);
  fake.client.$transaction = async (input) => {
    transazioni += 1;
    return vera(input);
  };
  setPrismaClientForTests(fake.client);
});

const assegnazione = (id, athleteId) => ({
  id,
  athleteId,
  kitId: "kit-1",
  status: "assigned",
  createdAt: "2026-08-26T10:00:00.000Z",
});

const treCollezioni = (assegnazioni) => [
  {
    resource_type: "clothing_inventory",
    items: [{ id: "stock-1", itemId: "maglia", quantity: 9 }],
  },
  { resource_type: "kit_assignments", items: assegnazioni },
  {
    resource_type: "jersey_assignments",
    items: [{ id: "num-1", athleteId: "atleta-1", number: 7 }],
  },
];

test("le tre collezioni finiscono in club_resource_items, non solo nel JSON", async () => {
  await resources.replaceClubResourceCollections(
    CLUB_A,
    treCollezioni([assegnazione("ass-1", "atleta-1")]),
  );

  const righe = fake
    .rows("clubResourceItem")
    .filter((r) => r.organization_id === CLUB_A);
  const perTipo = (tipo) => righe.filter((r) => r.resource_type === tipo);

  assert.equal(
    perTipo("clothing_inventory").length,
    1,
    "il magazzino deve essere normalizzato",
  );
  assert.equal(
    perTipo("kit_assignments").length,
    1,
    "l'assegnazione deve essere normalizzata",
  );
  assert.equal(
    perTipo("jersey_assignments").length,
    1,
    "il numero di maglia deve essere normalizzato",
  );

  assert.equal(
    perTipo("kit_assignments")[0].payload.athleteId,
    "atleta-1",
    "il payload deve conservare i campi dell'assegnazione",
  );
});

test("il campo JSON del club resta allineato alle righe normalizzate", async () => {
  await resources.replaceClubResourceCollections(
    CLUB_A,
    treCollezioni([assegnazione("ass-1", "atleta-1")]),
  );

  const club = fake.rows("club").find((c) => c.id === CLUB_A);

  for (const campo of [
    "clothing_inventory",
    "kit_assignments",
    "jersey_assignments",
  ]) {
    assert.ok(Array.isArray(club[campo]), `${campo} deve restare un array`);
    assert.equal(
      club[campo].length,
      1,
      `${campo} deve contenere l'elemento scritto`,
    );
  }

  // L'aggregato e un **sovrainsieme** dell'elemento originale: i campi di
  // dominio restano al loro posto, e le pagine che li leggono non cambiano.
  assert.equal(club.kit_assignments[0].id, "ass-1");
  assert.equal(club.kit_assignments[0].athleteId, "atleta-1");
  assert.equal(club.kit_assignments[0].kitId, "kit-1");
});

test("le tre collezioni si scrivono in una transazione sola", async () => {
  await resources.replaceClubResourceCollections(
    CLUB_A,
    treCollezioni([assegnazione("ass-1", "atleta-1")]),
  );

  assert.equal(
    transazioni,
    1,
    "tre transazioni separate lascerebbero il magazzino scalato senza assegnazione",
  );
});

test("una collezione non valida non lascia scritte le precedenti", async () => {
  await assert.rejects(
    resources.replaceClubResourceCollections(CLUB_A, [
      { resource_type: "clothing_inventory", items: [{ id: "stock-1" }] },
      { resource_type: "kit_assignments", items: "non un array" },
    ]),
    /Collezione non valida per kit_assignments/,
  );

  assert.equal(
    fake.rows("clubResourceItem").filter((r) => r.organization_id === CLUB_A)
      .length,
    0,
    "la validazione deve precedere qualunque scrittura",
  );
  assert.equal(transazioni, 0, "non deve nemmeno aprire la transazione");
});

test("una risorsa di club sconosciuta viene rifiutata", async () => {
  await assert.rejects(
    resources.replaceClubResourceCollections(CLUB_A, [
      { resource_type: "collezione_inventata", items: [] },
    ]),
    /Risorsa di club sconosciuta/,
  );
});

test("la scrittura di un club non tocca le righe di un altro", async () => {
  await resources.replaceClubResourceCollections(
    CLUB_A,
    treCollezioni([assegnazione("ass-1", "atleta-1")]),
  );

  const righeB = fake
    .rows("clubResourceItem")
    .filter((r) => r.organization_id === CLUB_B);

  assert.equal(
    righeB.length,
    1,
    "l'assegnazione dell'altro club deve sopravvivere",
  );
  assert.equal(righeB[0].payload.id, "assegnazione-del-club-b");

  const clubB = fake.rows("club").find((c) => c.id === CLUB_B);
  assert.deepEqual(
    clubB.kit_assignments,
    [],
    "il JSON dell'altro club non si tocca",
  );
});

test("le assegnazioni gia esistenti conservano la loro data di creazione", async () => {
  fake.rows("clubResourceItem").push({
    id: "riga-a",
    organization_id: CLUB_A,
    resource_type: "kit_assignments",
    name: null,
    status: null,
    date: null,
    payload: assegnazione("ass-storica", "atleta-1"),
    created_at: new Date("2026-02-02T00:00:00Z"),
    updated_at: new Date("2026-02-02T00:00:00Z"),
  });

  await resources.replaceClubResourceCollections(CLUB_A, [
    {
      resource_type: "kit_assignments",
      items: [
        assegnazione("ass-storica", "atleta-1"),
        assegnazione("ass-nuova", "atleta-2"),
      ],
    },
  ]);

  const righe = fake
    .rows("clubResourceItem")
    .filter(
      (r) =>
        r.organization_id === CLUB_A && r.resource_type === "kit_assignments",
    );

  assert.equal(righe.length, 2, "la storica e la nuova devono convivere");

  const storica = righe.find((r) => r.payload.id === "ass-storica");
  assert.equal(
    storica.created_at.toISOString(),
    "2026-02-02T00:00:00.000Z",
    "riscrivere la collezione non deve rigenerare l'identita di cio che c'era gia",
  );
});

// --- il percorso di scrittura della route ------------------------------------

test("la route delle assegnazioni non scrive piu il club con Prisma diretto", () => {
  const route = fs.readFileSync(
    path.join(PROJECT_ROOT, "src/app/api/clothing/assignments/route.ts"),
    "utf8",
  );
  const codice = route
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  assert.equal(
    /prisma\.club\.update/.test(codice),
    false,
    "scrivere clubs.<json> con Prisma diretto disallinea club_resource_items",
  );
  assert.match(
    codice,
    /replaceClubResourceCollections\(/,
    "la scrittura deve passare dal proprietario dell'accesso ai dati di club",
  );
});
