import assert from "node:assert/strict";
import test, { afterEach, before, beforeEach } from "node:test";

/**
 * Regressione WP-36 — costo delle scritture sul club.
 *
 * Ogni operazione su un campo JSON del club faceva cinque richieste, di cui
 * quattro trasferivano la riga intera: 35 colonne JSON per modificarne una.
 * Qui si fissa quante richieste ciascuna operazione puo fare e con quale
 * proiezione.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const SEASON = "season-2026-2027";
const MANDATORY = ["id", "slug", "name", "settings"];

let db;
let fetchOriginale;
let windowOriginale;
let richieste;
let club;

const project = (fields) => {
  if (!fields) return club;
  const keys = new Set([...MANDATORY, ...fields.split(",").map((f) => f.trim())]);
  return Object.fromEntries(Object.entries(club).filter(([k]) => keys.has(k)));
};

before(async () => {
  db = await import("../../src/lib/simplified-db.ts");
});

beforeEach(() => {
  richieste = [];
  club = {
    id: CLUB,
    slug: "club",
    name: "Club",
    settings: { activeSeasonId: SEASON, seasons: [] },
    categories: [{ id: "cat-1", name: "Under 2015" }],
    trainers: [{ id: "trainer-1", name: "Mario" }],
    staff_members: [],
    weekly_schedule: [],
    trainings: [{ id: "t-1" }],
    matches: [{ id: "m-1" }],
  };

  const store = new Map();
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  windowOriginale = globalThis.window;
  globalThis.window = { localStorage: storage, sessionStorage: storage };
  storage.setItem(
    "activeClub",
    JSON.stringify({ id: CLUB, role: "owner", activeSeasonId: SEASON }),
  );

  fetchOriginale = globalThis.fetch;
  globalThis.fetch = async (path, options = {}) => {
    const url = new URL(String(path), "https://local");
    const metodo = String(options.method || "GET").toUpperCase();
    richieste.push({
      metodo,
      pathname: url.pathname,
      fields: url.searchParams.get("fields"),
    });

    const proiettato = project(url.searchParams.get("fields"));
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        data: metodo === "GET" ? [proiettato] : proiettato,
        error: null,
      }),
    };
  };
});

afterEach(() => {
  globalThis.fetch = fetchOriginale;
  globalThis.window = windowOriginale;
});

const soloColonne = (fields) => (fields || "").split(",").filter(Boolean);

test("l'autosave di una collezione del club e una sola richiesta", async () => {
  await db.updateClubData(CLUB, "weekly_schedule", [{ id: "x" }]);

  assert.equal(richieste.length, 1, `richieste: ${JSON.stringify(richieste)}`);
  assert.equal(richieste[0].metodo, "PATCH");
  assert.deepEqual(
    soloColonne(richieste[0].fields),
    ["id"],
    "la PATCH non deve farsi rimandare indietro la collezione appena inviata",
  );
});

test("la stagione attiva nota al browser non costa una lettura", async () => {
  await db.updateClubData(CLUB, "categories", [{ id: "cat-1" }]);

  assert.equal(
    richieste.filter((r) => r.metodo === "GET").length,
    0,
    "categories e soggetta a stagione, ma la stagione e gia in localStorage",
  );
});

test("creare un elemento legge solo la colonna che modifica", async () => {
  await db.addClubData(CLUB, "categories", { name: "Under 2016" });

  const letture = richieste.filter((r) => r.metodo === "GET");
  const scritture = richieste.filter((r) => r.metodo === "PATCH");

  assert.equal(letture.length, 1);
  assert.deepEqual(soloColonne(letture[0].fields), ["categories"]);
  assert.equal(scritture.length, 1);
  assert.deepEqual(soloColonne(scritture[0].fields), ["id"]);
});

test("modificare un elemento legge solo la colonna che modifica", async () => {
  await db.updateClubDataItem(CLUB, "categories", "cat-1", { name: "Nuovo" });

  assert.equal(richieste.length, 2);
  assert.deepEqual(soloColonne(richieste[0].fields), ["categories"]);
});

test("eliminare un elemento legge solo la colonna che modifica", async () => {
  await db.deleteClubDataItem(CLUB, "categories", "cat-1");

  assert.equal(richieste.length, 2);
  assert.deepEqual(soloColonne(richieste[0].fields), ["categories"]);
});

test("eliminare un allenatore legge solo le due origini che lo contengono", async () => {
  await db.deleteClubTrainer(CLUB, "trainer-1");

  const letture = richieste.filter((r) => r.metodo === "GET");
  assert.equal(letture.length, 1);
  assert.deepEqual(soloColonne(letture[0].fields), ["trainers", "staff_members"]);
});

test("leggere una collezione del club e una sola richiesta proiettata", async () => {
  const categorie = await db.getClubData(CLUB, "categories");

  assert.equal(richieste.length, 1);
  assert.equal(richieste[0].metodo, "GET");
  assert.deepEqual(soloColonne(richieste[0].fields), ["categories"]);
  assert.equal(categorie.length, 1);
});

test("nessuna richiesta trasporta colonne che l'operazione non usa", async () => {
  await db.updateClubDataItem(CLUB, "categories", "cat-1", { name: "Nuovo" });

  for (const richiesta of richieste) {
    const colonne = soloColonne(richiesta.fields);
    assert.ok(
      colonne.length > 0,
      `richiesta senza proiezione: ${richiesta.metodo} ${richiesta.pathname}`,
    );
    assert.equal(
      colonne.includes("trainings") || colonne.includes("matches"),
      false,
      "una modifica di categoria non deve trasportare allenamenti o partite",
    );
  }
});
