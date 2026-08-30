import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * La lista Atleti consuma la paginazione (R-02, F1-12, B8-21).
 *
 * **Il difetto.** Il server sapeva impaginare dal Blocco 8, ma la pagina
 * Atleti continuava a chiedere l'archivio intero e a tagliarlo nel browser:
 * con duecento atleti erano duecento anagrafiche piu tutte le appartenenze di
 * categoria del club, per mostrarne venti. Una lista scaricata e poi filtrata
 * con `filter()` non e una lista paginata, e la differenza si vede solo
 * quando l'archivio e grande — cioe presso il cliente, non qui.
 *
 * **Cosa serviva perche la pagina potesse davvero paginare.** Non bastava
 * `?limit=`: la lista filtra per categoria e per sede, e la categoria di un
 * atleta non e una colonna — e una riga di `athlete_category_memberships`,
 * perche un atleta si allena con piu gruppi. Finche quei due filtri
 * esistevano solo nel browser, chiedere una pagina avrebbe restituito venti
 * atleti *poi* filtrati a tre: una pagina che non e una pagina.
 */

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..");
const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";

const scope = () => ({
  userId: "user-a",
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
});

let resources;
let setPrismaClientForTests;
let fake;

const athlete = (index) => ({
  id: `athlete-${index}`,
  organization_id: CLUB,
  first_name: `Nome${index}`,
  last_name: `Cognome${index}`,
  status: "active",
  data: {},
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  resources = await import("../../src/lib/server/resources.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma({
    athlete: Array.from({ length: 30 }, (_, index) => athlete(index)),
  });
  setPrismaClientForTests(fake.client);
});

const params = (query) => new URLSearchParams(query);

const whereOfLastFindMany = () => {
  const calls = fake.calls.filter(
    (call) => call.delegate === "athlete" && call.method === "findMany",
  );
  return calls[calls.length - 1].args.where;
};

/* ------------------------------------------- categoria e sede al database */

test("il filtro per categoria guarda la colonna storica e le appartenenze", async () => {
  await resources.listResourcePage(
    "simplified_athletes",
    params("limit=20&category_id=under-14"),
    scope(),
  );

  const where = whereOfLastFindMany();
  const condizione = where.AND.find((clause) => clause.OR);

  assert.deepEqual(condizione.OR, [
    { category_id: "under-14" },
    { category_memberships: { some: { category_id: "under-14" } } },
  ]);
});

test("il filtro per sede lascia dentro chi la sede non ce l'ha dichiarata", async () => {
  await resources.listResourcePage(
    "simplified_athletes",
    params("limit=20&site_id=sede-roma"),
    scope(),
  );

  const where = whereOfLastFindMany();
  const condizione = where.AND.find((clause) => clause.OR);

  assert.deepEqual(
    condizione.OR[1],
    { category_memberships: { none: { site_id: { not: null } } } },
    "sede vuota vuol dire «non dichiarata», non «nessuna»: ADR-0038",
  );
});

test("cercare e filtrare insieme stringe, non allarga", async () => {
  await resources.listResourcePage(
    "simplified_athletes",
    params("limit=20&category_id=under-14&q=rossi"),
    scope(),
  );

  const where = whereOfLastFindMany();

  assert.equal(
    where.AND.length,
    2,
    "un Object.assign qui cancellava il filtro categoria appena si scriveva nella casella di ricerca",
  );
  assert.ok(
    where.AND.some((clause) =>
      clause.OR?.some((item) => item.category_id === "under-14"),
    ),
    "il filtro per categoria deve sopravvivere alla ricerca",
  );
  assert.ok(
    where.AND.some((clause) =>
      clause.OR?.some((item) => item.last_name?.contains === "rossi"),
    ),
    "e la ricerca deve sopravvivere al filtro",
  );
});

test("il confine multi-tenant regge anche con i filtri nuovi", async () => {
  await resources.listResourcePage(
    "simplified_athletes",
    params("limit=20&category_id=under-14&site_id=sede-roma"),
    scope(),
  );

  assert.equal(whereOfLastFindMany().organization_id, CLUB);
});

/* ------------------------------------------------- la pagina la chiede */

const readFile = (relative) =>
  fs.readFileSync(path.join(PROJECT_ROOT, relative), "utf8");

test("la pagina Atleti chiede una pagina, non l'archivio", () => {
  const page = readFile("src/app/athletes/page.tsx");

  assert.match(
    page,
    /getClubAthletesPage\(/,
    "la lista deve passare dal lettore paginato",
  );
  assert.match(page, /limit: ATHLETE_PAGE_SIZE/);
  assert.doesNotMatch(
    page,
    /getClubAthletes\(/,
    "il lettore che scarica tutto non deve piu comparire in questa pagina",
  );
});

test("le appartenenze si chiedono per gli atleti della pagina", () => {
  const db = readFile("src/lib/simplified-db.ts");
  const paginato = db.slice(db.indexOf("export async function getClubAthletesPage"));

  assert.match(
    paginato.slice(0, 2600),
    /loadClubAthleteMemberships\(clubId, athleteIds\)/,
    "caricarle tutte lascerebbe in piedi il trasferimento che la paginazione toglie",
  );
});

test("l'export non si accontenta della pagina che si vede", () => {
  const page = readFile("src/app/athletes/page.tsx");

  assert.match(
    page,
    /collectAthletesForExport/,
    "esportare duecento righe su duemila chiamandole «filtrate» sarebbe una bugia in cima a un PDF",
  );
});
