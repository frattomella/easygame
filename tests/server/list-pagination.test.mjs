import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Paginazione, ricerca, filtri e ordinamento server-side (WP-12, Blocco 8).
 *
 * Il difetto che chiudono e in [16 — D4](../../docs/knowledge-base/16-technical-debt.md):
 * `buildWhereFromSearchParams` sapeva fare tredici uguaglianze esatte e basta,
 * quindi ogni lista tornava intera e ogni ricerca era un `filter()` nel
 * browser su dati gia scaricati.
 *
 * Tre cose vanno dimostrate:
 *
 * 1. **il default non cambia.** Chi non chiede una pagina riceve tutto, come
 *    prima. Un default paginato troncherebbe in silenzio ogni lista della Web
 *    App, ed e il tipo di regressione che si scopre in produzione;
 * 2. **la pagina la taglia il database**, con `take`/`skip`, non il processo
 *    Node dopo aver letto tutto — altrimenti non e paginazione, e un
 *    `slice()` con piu passaggi;
 * 3. **il confine multi-tenant regge** anche quando arrivano una ricerca e un
 *    ordinamento dal client.
 */

const CLUB_A = "aaaaaaaa-0000-4000-8000-000000000001";
const CLUB_B = "bbbbbbbb-0000-4000-8000-000000000002";

const scopeA = () => ({
  userId: "user-a",
  activeOrganizationId: CLUB_A,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB_A],
});

let resources;
let setPrismaClientForTests;
let fake;

const athlete = (index, organizationId, overrides = {}) => ({
  id: `athlete-${organizationId}-${index}`,
  organization_id: organizationId,
  first_name: `Nome${index}`,
  last_name: `Cognome${index}`,
  status: "active",
  data: {},
  ...overrides,
});

const seed = () => ({
  athlete: [
    ...Array.from({ length: 25 }, (_, index) => athlete(index, CLUB_A)),
    ...Array.from({ length: 5 }, (_, index) => athlete(index, CLUB_B)),
  ],
});

const params = (query) => new URLSearchParams(query);

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

/* ------------------------------------------------- il default non cambia */

test("senza limit si riceve tutto, e nessun meta", async () => {
  const result = await resources.listResourcePage(
    "athletes",
    params(""),
    scopeA(),
  );

  assert.equal(result.records.length, 25);
  assert.equal(result.meta, null, "chi non chiede una pagina non deve leggerne una");

  const call = fake.lastCall("athlete", "findMany");
  assert.equal(call.args.take, undefined, "nessun troncamento implicito");
  assert.equal(call.args.skip, undefined);
});

test("listResource resta un array: nessun chiamante esistente cambia", async () => {
  const records = await resources.listResource("athletes", params(""), scopeA());
  assert.ok(Array.isArray(records));
  assert.equal(records.length, 25);
});

/* ------------------------------------------------ la pagina la fa il database */

test("con limit la pagina si chiede al database, non si ritaglia dopo", async () => {
  const result = await resources.listResourcePage(
    "athletes",
    params("limit=10"),
    scopeA(),
  );

  const call = fake.lastCall("athlete", "findMany");
  assert.equal(call.args.take, 10, "take deve arrivare a Prisma");
  assert.equal(call.args.skip, 0);

  assert.equal(result.meta.limit, 10);
  assert.equal(result.meta.offset, 0);
  assert.equal(result.meta.total, 25, "il totale e quello vero, non quello della pagina");
  assert.equal(result.meta.hasMore, true);
});

test("page=3 diventa lo skip giusto", async () => {
  await resources.listResourcePage("athletes", params("limit=10&page=3"), scopeA());

  const call = fake.lastCall("athlete", "findMany");
  assert.equal(call.args.skip, 20);
  assert.equal(call.args.take, 10);
});

test("offset e accettato in alternativa a page", async () => {
  await resources.listResourcePage("athletes", params("limit=5&offset=15"), scopeA());

  const call = fake.lastCall("athlete", "findMany");
  assert.equal(call.args.skip, 15);
});

test("hasMore e falso sull'ultima pagina", async () => {
  const result = await resources.listResourcePage(
    "athletes",
    params("limit=10&page=3"),
    scopeA(),
  );

  assert.equal(result.meta.hasMore, false);
});

test("una pagina enorme viene limitata: non e piu una pagina", async () => {
  const result = await resources.listResourcePage(
    "athletes",
    params("limit=100000"),
    scopeA(),
  );

  assert.equal(result.meta.limit, 200);
  assert.equal(fake.lastCall("athlete", "findMany").args.take, 200);
});

test("il conteggio e filtrato quanto la lista", async () => {
  await resources.listResourcePage("athletes", params("limit=5"), scopeA());

  const countCall = fake.lastCall("athlete", "count");
  assert.ok(countCall, "senza count non c'e un totale");
  assert.equal(
    countCall.args.where.organization_id,
    CLUB_A,
    "il totale non puo contare gli atleti di un altro club",
  );
});

/* ------------------------------------------------------------------ ricerca */

test("la ricerca diventa un filtro del database, non un filter() nel browser", async () => {
  await resources.listResourcePage("athletes", params("q=rossi"), scopeA());

  const where = fake.lastCall("athlete", "findMany").args.where;
  assert.ok(where.AND, "la ricerca deve essere nel where");

  const fields = where.AND[0].OR.map((clause) => Object.keys(clause)[0]);
  assert.deepEqual(fields, [
    "first_name",
    "last_name",
    "access_code",
    "jersey_number",
  ]);

  assert.deepEqual(where.AND[0].OR[0].first_name, {
    contains: "rossi",
    mode: "insensitive",
  });
});

test("«Mario Rossi» cerca due termini: nome e cognome stanno in due colonne", async () => {
  await resources.listResourcePage("athletes", params("q=Mario+Rossi"), scopeA());

  const where = fake.lastCall("athlete", "findMany").args.where;
  assert.equal(where.AND.length, 2, "un termine per parola");
  assert.equal(where.AND[0].OR[0].first_name.contains, "Mario");
  assert.equal(where.AND[1].OR[0].first_name.contains, "Rossi");
});

test("la ricerca non allenta mai il confine del club", async () => {
  await resources.listResourcePage("athletes", params("q=rossi"), scopeA());

  const where = fake.lastCall("athlete", "findMany").args.where;
  assert.equal(where.organization_id, CLUB_A);
});

test("una risorsa senza campi cercabili ignora q invece di filtrare a caso", async () => {
  await resources.listResourcePage("payments", params("q=qualcosa"), scopeA());

  const where = fake.lastCall("athletePayment", "findMany").args.where;
  assert.equal(where.AND, undefined);
});

/* ------------------------------------------------------------- ordinamento */

test("si ordina solo sui campi ammessi", async () => {
  await resources.listResourcePage(
    "athletes",
    params("order_by=last_name&order=desc"),
    scopeA(),
  );

  assert.deepEqual(fake.lastCall("athlete", "findMany").args.orderBy, {
    last_name: "desc",
  });
});

test("un campo di ordinamento non ammesso viene ignorato, non passato a Prisma", async () => {
  await resources.listResourcePage(
    "athletes",
    params("order_by=data&order=asc"),
    scopeA(),
  );

  assert.equal(
    fake.lastCall("athlete", "findMany").args.orderBy,
    undefined,
    "il client non decide su cosa lavora il database",
  );
});

/* -------------------------------------------------------------------- filtri */

test("il filtro di stato passa dal database", async () => {
  await resources.listResourcePage(
    "athletes",
    params("status=suspended&limit=10"),
    scopeA(),
  );

  const where = fake.lastCall("athlete", "findMany").args.where;
  assert.equal(where.status, "suspended");
  assert.equal(fake.lastCall("athlete", "count").args.where.status, "suspended");
});

/* --------------------------------------------- filtri applicati dopo la query */

test("con il filtro allenatore la pagina non viene chiesta al database", async () => {
  /*
    Il perimetro dell'allenatore dipende dalle categorie a lui assegnate, che
    stanno nel payload: non e esprimibile in un `where`. Chiedere `take` al
    database darebbe una pagina piena di record che poi vengono scartati, e un
    `total` che non corrisponde a cio che si vede.
  */
  await resources.listResourcePage(
    "athletes",
    params("limit=10&trainer_id=t-1"),
    scopeA(),
  );

  const call = fake.lastCall("athlete", "findMany");
  assert.equal(call.args.take, undefined);
  assert.equal(call.args.skip, undefined);
});

test("anche cosi la pagina restituita e quella chiesta, e il totale e vero", async () => {
  const result = await resources.listResourcePage(
    "athletes",
    params("limit=10&page=2&trainer_id=t-1"),
    scopeA(),
  );

  assert.equal(result.meta.limit, 10);
  assert.equal(result.meta.offset, 10);
  assert.ok(
    result.records.length <= 10,
    "la pagina non puo essere piu grande di quella chiesta",
  );
  assert.ok(
    result.meta.total <= 25,
    "il totale e quello dopo il filtro, non quello del database",
  );
  assert.equal(
    result.meta.hasMore,
    result.meta.offset + result.records.length < result.meta.total,
  );
});

/* -------------------------------------------------------------- isolamento */

test("un club senza accesso non riceve nemmeno una pagina", async () => {
  await assert.rejects(
    resources.listResourcePage(
      "athletes",
      params(`organization_id=${CLUB_B}&limit=5`),
      scopeA(),
    ),
    /Accesso negato/,
  );
});
