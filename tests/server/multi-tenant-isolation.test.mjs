import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Test **a runtime** dell'isolamento multi-tenant.
 *
 * Esercitano le funzioni vere di `src/lib/server/resources.ts` con un doppio
 * del client Prisma, per verificare che nessuna operazione possa attraversare
 * il confine di un'organizzazione. Finora questa era la lacuna piu grave nella
 * copertura (WP-04): l'isolamento e la protezione principale del prodotto ed
 * era verificata solo staticamente.
 *
 * Richiede l'hook di risoluzione in `tests/helpers/extensionless-resolver.mjs`.
 */

const CLUB_A = "aaaaaaaa-0000-4000-8000-000000000001";
const CLUB_B = "bbbbbbbb-0000-4000-8000-000000000002";
const ATHLETE_A = "11111111-0000-4000-8000-000000000001";
const ATHLETE_B = "22222222-0000-4000-8000-000000000002";
const MATCH_A = "33333333-0000-4000-8000-000000000003";
const MATCH_B = "44444444-0000-4000-8000-000000000004";

/** Scope di un utente che appartiene SOLO al club A. */
const scopeA = () => ({
  userId: "user-a",
  activeOrganizationId: CLUB_A,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB_A],
});

/** Scope di un utente senza alcun club. */
const scopeVuoto = () => ({
  userId: "user-x",
  activeOrganizationId: null,
  activeRole: "owner",
  allowedOrganizationIds: [],
});

let resources;
let setPrismaClientForTests;
let fake;

const seed = () => ({
  athlete: [
    { id: ATHLETE_A, organization_id: CLUB_A, first_name: "Anna", last_name: "Rossi" },
    { id: ATHLETE_B, organization_id: CLUB_B, first_name: "Bruno", last_name: "Verdi" },
  ],
  club: [
    { id: CLUB_A, slug: "club-a", name: "Club A" },
    { id: CLUB_B, slug: "club-b", name: "Club B" },
  ],
  clubResourceItem: [
    { id: MATCH_A, organization_id: CLUB_A, resource_type: "matches", payload: { id: MATCH_A, name: "Partita A" }, name: "Partita A" },
    { id: MATCH_B, organization_id: CLUB_B, resource_type: "matches", payload: { id: MATCH_B, name: "Partita B" }, name: "Partita B" },
  ],
  athletePayment: [
    { id: "pay-a", organization_id: CLUB_A, athlete_id: ATHLETE_A, amount: 100, description: "Quota A" },
    { id: "pay-b", organization_id: CLUB_B, athlete_id: ATHLETE_B, amount: 200, description: "Quota B" },
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
  setPrismaClientForTests(fake.client);
});

/**
 * Un'operazione cross-tenant deve fallire. Due forme entrambe corrette:
 *
 * - "Accesso negato" — il record e stato letto e poi rifiutato
 *   (`assertRecordAccess`): e il caso dei modelli Prisma dedicati;
 * - "non trovata" — il record non e mai stato letto, perche il filtro per
 *   organizzazione e gia nella query: e il caso delle risorse generiche di
 *   club. E la forma migliore delle due, perche non conferma l'esistenza del
 *   record altrui.
 */
const attendeRifiuto = async (promise, cosa) => {
  await assert.rejects(
    promise,
    (error) => {
      assert.match(
        String(error.message),
        /Accesso negato|Nessun club attivo|non trovata/,
        `${cosa}: messaggio inatteso "${error.message}"`,
      );
      return true;
    },
    `${cosa}: l'operazione doveva essere rifiutata`,
  );
};

/* ------------------------------- LETTURA ------------------------------- */

test("lista: restituisce solo i record del club attivo", async () => {
  const risultato = await resources.listResource(
    "athletes",
    new URLSearchParams(),
    scopeA(),
  );

  assert.equal(risultato.length, 1);
  assert.equal(risultato[0].id, ATHLETE_A);

  // La query deve essere gia filtrata a monte, non dopo.
  const query = fake.lastCall("athlete", "findMany");
  assert.equal(query.args.where.organization_id, CLUB_A);
});

test("lista: un organization_id di un altro club viene rifiutato", async () => {
  await attendeRifiuto(
    resources.listResource(
      "athletes",
      new URLSearchParams({ organization_id: CLUB_B }),
      scopeA(),
    ),
    "lista atleti di un altro club",
  );
});

test("lista: anche l'alias club_id viene validato", async () => {
  await attendeRifiuto(
    resources.listResource(
      "athletes",
      new URLSearchParams({ club_id: CLUB_B }),
      scopeA(),
    ),
    "lista con club_id di un altro club",
  );
});

test("lista: le risorse generiche di club sono filtrate per organizzazione", async () => {
  const risultato = await resources.listResource(
    "matches",
    new URLSearchParams(),
    scopeA(),
  );

  assert.equal(risultato.length, 1);

  const query = fake.lastCall("clubResourceItem", "findMany");
  assert.equal(query.args.where.organization_id, CLUB_A);
  assert.equal(query.args.where.resource_type, "matches");
});

test("lista club: mostra solo i club consentiti, mai tutti", async () => {
  const risultato = await resources.listResource(
    "clubs",
    new URLSearchParams(),
    scopeA(),
  );

  assert.equal(risultato.length, 1);
  assert.equal(risultato[0].id, CLUB_A);

  const query = fake.lastCall("club", "findMany");
  assert.deepEqual(query.args.where.id, { in: [CLUB_A] });
});

test("lista club: chiedere un club non consentito viene rifiutato", async () => {
  await attendeRifiuto(
    resources.listResource("clubs", new URLSearchParams({ id: CLUB_B }), scopeA()),
    "dettaglio club altrui via lista",
  );
});

test("lista: senza alcun club consentito non esce nulla", async () => {
  const risultato = await resources.listResource(
    "clubs",
    new URLSearchParams(),
    scopeVuoto(),
  );
  assert.deepEqual(risultato, []);
});

test("dettaglio: un record di un altro club non e leggibile", async () => {
  await attendeRifiuto(
    resources.getResourceById("athletes", ATHLETE_B, scopeA()),
    "dettaglio atleta di un altro club",
  );
});

test("dettaglio: il record del proprio club e leggibile", async () => {
  const record = await resources.getResourceById("athletes", ATHLETE_A, scopeA());
  assert.equal(record.id, ATHLETE_A);
  assert.equal(record.organization_id, CLUB_A);
});

test("dettaglio: una risorsa di club altrui risulta inesistente, non negata", async () => {
  // Il filtro per organizzazione e dentro la query: il record non viene
  // proprio letto, quindi la risposta e null e non conferma che esista.
  const record = await resources.getResourceById("matches", MATCH_B, scopeA());
  assert.equal(record, null);

  const query = fake.lastCall("clubResourceItem", "findFirst");
  assert.equal(query.args.where.organization_id, CLUB_A);
  assert.equal(query.args.where.resource_type, "matches");
});

test("dettaglio: la risorsa di club del proprio club e leggibile", async () => {
  const record = await resources.getResourceById("matches", MATCH_A, scopeA());
  assert.ok(record, "la partita del proprio club deve essere leggibile");
});

/* ------------------------------ SCRITTURA ------------------------------ */

test("creazione: un organization_id altrui viene rifiutato", async () => {
  await attendeRifiuto(
    resources.createResource(
      "athletes",
      { organization_id: CLUB_B, first_name: "Intruso", last_name: "Test" },
      "create",
      scopeA(),
    ),
    "creazione atleta in un altro club",
  );
});

test("creazione: senza organization_id viene imposto il club attivo", async () => {
  await resources.createResource(
    "athletes",
    { first_name: "Nuova", last_name: "Atleta" },
    "create",
    scopeA(),
  );

  const query = fake.lastCall("athlete", "create");
  assert.equal(query.args.data.organization_id, CLUB_A);
});

test("creazione: senza club attivo l'operazione non procede", async () => {
  await attendeRifiuto(
    resources.createResource(
      "athletes",
      { first_name: "Nessun", last_name: "Club" },
      "create",
      scopeVuoto(),
    ),
    "creazione senza club attivo",
  );
});

test("creazione: risorsa generica di club legata al club attivo", async () => {
  await resources.createResource(
    "matches",
    { name: "Nuova partita" },
    "create",
    scopeA(),
  );

  const query = fake.lastCall("clubResourceItem", "create");
  assert.equal(query.args.data.organization_id, CLUB_A);
  assert.equal(query.args.data.resource_type, "matches");
});

/* ------------------------------- UPDATE -------------------------------- */

test("update: un record di un altro club non e modificabile", async () => {
  await attendeRifiuto(
    resources.updateResource("athletes", ATHLETE_B, { first_name: "Violato" }, scopeA()),
    "update atleta di un altro club",
  );

  // e il record non deve essere stato toccato
  const intatto = fake.rows("athlete").find((r) => r.id === ATHLETE_B);
  assert.equal(intatto.first_name, "Bruno");
});

test("update: il record del proprio club e modificabile", async () => {
  await resources.updateResource("athletes", ATHLETE_A, { first_name: "Annamaria" }, scopeA());
  const aggiornato = fake.rows("athlete").find((r) => r.id === ATHLETE_A);
  assert.equal(aggiornato.first_name, "Annamaria");
});

test("update: non si puo spostare un record in un altro club", async () => {
  await attendeRifiuto(
    resources.updateResource(
      "athletes",
      ATHLETE_A,
      { organization_id: CLUB_B },
      scopeA(),
    ),
    "spostamento di un atleta in un altro club",
  );

  const intatto = fake.rows("athlete").find((r) => r.id === ATHLETE_A);
  assert.equal(intatto.organization_id, CLUB_A);
});

test("update: una risorsa di club altrui non e modificabile", async () => {
  await attendeRifiuto(
    resources.updateResource("matches", MATCH_B, { name: "Violata" }, scopeA()),
    "update partita di un altro club",
  );

  const intatta = fake.rows("clubResourceItem").find((r) => r.id === MATCH_B);
  assert.equal(intatta.name, "Partita B");
});

/* ------------------------------- DELETE -------------------------------- */

test("delete: un record di un altro club non e cancellabile", async () => {
  await attendeRifiuto(
    resources.deleteResource("athletes", ATHLETE_B, scopeA()),
    "delete atleta di un altro club",
  );

  assert.ok(
    fake.rows("athlete").some((r) => r.id === ATHLETE_B),
    "il record dell'altro club deve essere ancora presente",
  );
});

test("delete: il record del proprio club e cancellabile", async () => {
  await resources.deleteResource("athletes", ATHLETE_A, scopeA());
  assert.ok(!fake.rows("athlete").some((r) => r.id === ATHLETE_A));
});

test("delete: una risorsa di club altrui non e cancellabile", async () => {
  await attendeRifiuto(
    resources.deleteResource("matches", MATCH_B, scopeA()),
    "delete partita di un altro club",
  );
  assert.ok(
    fake.rows("clubResourceItem").some((r) => r.id === MATCH_B),
    "la risorsa dell'altro club deve essere ancora presente",
  );
});

test("delete: la risorsa di club del proprio club e cancellabile", async () => {
  await resources.deleteResource("matches", MATCH_A, scopeA());
  assert.ok(!fake.rows("clubResourceItem").some((r) => r.id === MATCH_A));
});

test("nessun percorso cross-tenant distingue 'non esiste' da 'non tuo'", async () => {
  // Un id del tutto inventato e un id reale di un altro club devono produrre
  // la stessa risposta, altrimenti l'API diventa un oracolo di esistenza.
  const inventato = await resources.getResourceById(
    "matches",
    "99999999-0000-4000-8000-000000000099",
    scopeA(),
  );
  const altrui = await resources.getResourceById("matches", MATCH_B, scopeA());
  assert.equal(inventato, altrui);
  assert.equal(altrui, null);
});

/* ---------------------------- ALTRE RISORSE ---------------------------- */

test("i pagamenti sono isolati come le altre risorse organization-scoped", async () => {
  const risultato = await resources.listResource(
    "payments",
    new URLSearchParams(),
    scopeA(),
  );
  assert.equal(risultato.length, 1);
  assert.equal(risultato[0].id, "pay-a");

  await attendeRifiuto(
    resources.getResourceById("payments", "pay-b", scopeA()),
    "dettaglio pagamento di un altro club",
  );
});

test("gli alias di compatibilita applicano lo stesso isolamento", async () => {
  // simplified_athletes punta allo stesso delegate di athletes
  const risultato = await resources.listResource(
    "simplified_athletes",
    new URLSearchParams(),
    scopeA(),
  );
  assert.equal(risultato.length, 1);
  assert.equal(risultato[0].id, ATHLETE_A);

  await attendeRifiuto(
    resources.listResource(
      "simplified_athletes",
      new URLSearchParams({ organization_id: CLUB_B }),
      scopeA(),
    ),
    "alias simplified_athletes su un altro club",
  );
});

test("organizations e un alias di clubs e resta ristretto", async () => {
  const risultato = await resources.listResource(
    "organizations",
    new URLSearchParams(),
    scopeA(),
  );
  assert.equal(risultato.length, 1);
  assert.equal(risultato[0].id, CLUB_A);
});

/* ------------------ COPERTURA DELL'INSIEME DELLE RISORSE ---------------- */

test("ogni risorsa organization-scoped filtra davvero per organizzazione", async () => {
  const daVerificare = Object.entries(resources.RESOURCE_CONFIG)
    .filter(([, config]) => config.kind === "club_resource")
    .map(([name]) => name)
    // access_tokens non ha mirroring JSON ma resta club-scoped
    .concat(["athletes", "medical_certificates", "payments", "invoices", "receipts"]);

  const nonFiltrate = [];

  for (const resource of daVerificare) {
    fake = createFakePrisma(seed());
    setPrismaClientForTests(fake.client);

    await resources.listResource(resource, new URLSearchParams(), scopeA());

    const query = [...fake.calls].reverse().find((c) => c.method === "findMany");
    if (!query || query.args?.where?.organization_id !== CLUB_A) {
      nonFiltrate.push(resource);
    }
  }

  assert.deepEqual(
    nonFiltrate,
    [],
    `risorse senza filtro per organizzazione: ${nonFiltrate.join(", ")}`,
  );
});

test("nessuna risorsa organization-scoped accetta un club non consentito", async () => {
  const passate = [];

  for (const resource of ["athletes", "payments", "matches", "trainings", "categories"]) {
    fake = createFakePrisma(seed());
    setPrismaClientForTests(fake.client);

    try {
      await resources.listResource(
        resource,
        new URLSearchParams({ organization_id: CLUB_B }),
        scopeA(),
      );
      passate.push(resource);
    } catch {
      // atteso
    }
  }

  assert.deepEqual(
    passate,
    [],
    `risorse che hanno accettato un club altrui: ${passate.join(", ")}`,
  );
});
