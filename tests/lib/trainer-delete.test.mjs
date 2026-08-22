import assert from "node:assert/strict";
import test, { afterEach, before, beforeEach } from "node:test";

/**
 * Regressione WP-32 — «gli allenatori eliminati ricompaiono dopo il refresh».
 *
 * La causa era che `handleDelete` non persisteva nulla: filtrava lo stato
 * React. `deleteClubTrainer` deve invece togliere l'allenatore da **tutte** le
 * origini che `getClubTrainers` rimette insieme.
 */

const CLUB = "club-1";

let deleteClubTrainer;
let fetchOriginale;
let richieste;
let club;

const risposta = (data) => ({
  ok: true,
  status: 200,
  statusText: "OK",
  json: async () => ({ data, error: null }),
});

before(async () => {
  ({ deleteClubTrainer } = await import("../../src/lib/simplified-db.ts"));
});

beforeEach(() => {
  richieste = [];
  club = {
    id: CLUB,
    trainers: [
      { id: "trainer-1", name: "Mario Rossi", email: "mario@example.com" },
      { id: "trainer-2", name: "Luisa Bianchi" },
    ],
    staff_members: [
      { id: "staff-1", name: "Mario Rossi", role: "trainer" },
      { id: "staff-2", name: "Anna Verdi", role: "segreteria" },
    ],
  };

  fetchOriginale = globalThis.fetch;
  globalThis.fetch = async (path, options = {}) => {
    const metodo = String(options.method || "GET").toUpperCase();
    richieste.push({ metodo, path: String(path), body: options.body });

    if (metodo === "PATCH") {
      const payload = JSON.parse(String(options.body)).data;
      Object.assign(club, payload);
      return risposta(club);
    }

    if (metodo === "DELETE") {
      return {
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: async () => ({
          data: null,
          error: { message: "Risorsa del club non trovata" },
        }),
      };
    }

    return risposta([club]);
  };
});

afterEach(() => {
  globalThis.fetch = fetchOriginale;
});

const ultimoPatch = () =>
  JSON.parse(
    String([...richieste].reverse().find((r) => r.metodo === "PATCH").body),
  ).data;

test("l'allenatore eliminato sparisce dal campo JSON del club", async () => {
  const risultato = await deleteClubTrainer(CLUB, "trainer-2");

  assert.equal(risultato.removed, true);
  assert.deepEqual(
    ultimoPatch().trainers.map((t) => t.id),
    ["trainer-1"],
  );
});

test("un'omonimia nello staff non trascina via la persona sbagliata", async () => {
  await deleteClubTrainer(CLUB, "trainer-1");

  const patch = ultimoPatch();
  assert.deepEqual(
    patch.trainers.map((t) => t.id),
    ["trainer-2"],
  );
  assert.equal(
    patch.staff_members,
    undefined,
    "staff-1 si chiama come trainer-1 ma ha un id proprio: resta dov'e",
  );
});

test("lo staff-allenatore viene eliminato quando condivide l'id", async () => {
  club.staff_members = [
    { id: "trainer-1", name: "Mario Rossi", role: "allenatore" },
    { id: "staff-2", name: "Anna Verdi", role: "segreteria" },
  ];

  await deleteClubTrainer(CLUB, "trainer-1");

  const patch = ultimoPatch();
  assert.deepEqual(
    patch.trainers.map((t) => t.id),
    ["trainer-2"],
  );
  assert.deepEqual(
    patch.staff_members.map((s) => s.id),
    ["staff-2"],
    "la stessa persona va tolta da entrambe le origini",
  );
});

test("uno staff-allenatore si elimina dal suo id", async () => {
  await deleteClubTrainer(CLUB, "staff-1");

  const patch = ultimoPatch();
  assert.deepEqual(
    patch.staff_members.map((s) => s.id),
    ["staff-2"],
  );
  assert.equal(
    patch.trainers,
    undefined,
    "il campo trainers non cambia: non va riscritto inutilmente",
  );
});

test("un membro dello staff che non e allenatore non viene mai eliminato", async () => {
  const risultato = await deleteClubTrainer(CLUB, "staff-2");

  assert.equal(risultato.removed, false);
  assert.equal(
    richieste.some((r) => r.metodo === "PATCH"),
    false,
    "nessuna scrittura per una richiesta che non riguarda un allenatore",
  );
});

test("un allenatore senza id si elimina dall'email", async () => {
  club.trainers = [
    { name: "Mario Rossi", email: "mario@example.com" },
    { name: "Luisa Bianchi", email: "luisa@example.com" },
  ];

  await deleteClubTrainer(CLUB, "luisa@example.com");

  assert.deepEqual(
    ultimoPatch().trainers.map((t) => t.email),
    ["mario@example.com"],
  );
});

test("senza corrispondenza nei campi JSON si prova la risorsa club", async () => {
  const risultato = await deleteClubTrainer(CLUB, "trainer-sconosciuto");

  assert.equal(risultato.removed, false);
  assert.equal(
    richieste.some(
      (r) => r.metodo === "DELETE" && r.path.includes("/api/v1/trainers/"),
    ),
    true,
    "va tentata anche la riga club_resource_items, se le due origini divergono",
  );
});

test("un id vuoto viene rifiutato senza toccare il database", async () => {
  await assert.rejects(deleteClubTrainer(CLUB, "   "), /Allenatore non valido/);
  assert.equal(richieste.length, 0);
});
