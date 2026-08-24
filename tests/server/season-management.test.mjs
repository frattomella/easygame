import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Blocco 6 — gestione delle stagioni **a runtime**, con un doppio di Prisma.
 *
 * Verifica le tre cose che i test statici non possono dimostrare: che il
 * cambio di stato scriva davvero un solo `active`, che il riporto crei righe
 * nuove senza toccare le altre stagioni, e che niente di tutto questo possa
 * attraversare il confine fra due club.
 */

const CLUB_A = "aaaaaaaa-0000-4000-8000-000000000001";
const CLUB_B = "bbbbbbbb-0000-4000-8000-000000000002";

const CAT_A_2025 = "11111111-0000-4000-8000-000000000001";
const CAT_A_2026 = "11111111-0000-4000-8000-000000000002";
const PLAN_A_2025 = "22222222-0000-4000-8000-000000000001";
const CAT_B_2025 = "33333333-0000-4000-8000-000000000001";

const seasonsOf = (activeSeasonId) => ({
  activeSeasonId,
  seasons: [
    {
      id: "s-2026",
      label: "2026/2027",
      startDate: "2026-07-01",
      endDate: "2027-06-30",
      status: "upcoming",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "s-2025",
      label: "2025/2026",
      startDate: "2025-07-01",
      endDate: "2026-06-30",
      status: "active",
      createdAt: "2025-01-01T00:00:00.000Z",
    },
  ],
});

const clubResourceRow = (id, organization_id, resource_type, payload) => ({
  id,
  organization_id,
  resource_type,
  name: payload.name || null,
  status: null,
  date: null,
  payload: { ...payload, id },
  created_at: new Date("2025-08-01T00:00:00.000Z"),
  updated_at: new Date("2025-08-01T00:00:00.000Z"),
});

const seed = () => ({
  club: [
    { id: CLUB_A, slug: "club-a", name: "Club A", settings: seasonsOf("s-2025") },
    { id: CLUB_B, slug: "club-b", name: "Club B", settings: seasonsOf("s-2025") },
  ],
  clubResourceItem: [
    clubResourceRow(CAT_A_2025, CLUB_A, "categories", {
      name: "Under 14",
      seasonId: "s-2025",
    }),
    clubResourceRow(CAT_A_2026, CLUB_A, "categories", {
      name: "Prima squadra",
      seasonId: "s-2026",
    }),
    clubResourceRow(PLAN_A_2025, CLUB_A, "payment_plans", {
      name: "Quota base",
      seasonId: "s-2025",
      categoryId: CAT_A_2025,
    }),
    clubResourceRow(CAT_B_2025, CLUB_B, "categories", {
      name: "Under 14",
      seasonId: "s-2025",
    }),
  ],
});

let seasonsModule;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  seasonsModule = await import("../../src/lib/server/seasons.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const settingsOf = (clubId) =>
  fake.rows("club").find((club) => club.id === clubId).settings;

const itemsOf = (clubId, resourceType) =>
  fake
    .rows("clubResourceItem")
    .filter(
      (row) => row.organization_id === clubId && row.resource_type === resourceType,
    );

/* ------------------------------- STATO -------------------------------- */

test("una stagione nuova nasce futura e non tocca la stagione attiva", async () => {
  const result = await seasonsModule.createClubSeason({
    organizationId: CLUB_A,
    input: { startDate: "2027-07-01", endDate: "2028-06-30" },
  });

  assert.equal(result.season.status, "upcoming");
  assert.equal(result.state.activeSeasonId, "s-2025");
  assert.equal(result.rollover, null);
  assert.equal(settingsOf(CLUB_A).seasons.length, 3);
  assert.equal(
    settingsOf(CLUB_A).seasons.filter((season) => season.status === "active")
      .length,
    1,
  );
});

test("creare una stagione gia attiva sposta il perimetro e ne lascia una sola attiva", async () => {
  const result = await seasonsModule.createClubSeason({
    organizationId: CLUB_A,
    input: { startDate: "2027-07-01", endDate: "2028-06-30" },
    activate: true,
  });

  assert.equal(result.state.activeSeasonId, result.season.id);
  const attive = settingsOf(CLUB_A).seasons.filter(
    (season) => season.status === "active",
  );
  assert.deepEqual(
    attive.map((season) => season.id),
    [result.season.id],
  );
});

test("un periodo gia usato viene rifiutato", async () => {
  await assert.rejects(
    seasonsModule.createClubSeason({
      organizationId: CLUB_A,
      input: { startDate: "2026-07-01", endDate: "2027-06-30" },
    }),
    /Esiste gia una stagione/,
  );
});

test("attivare una stagione archivia la precedente e registra un solo attivo", async () => {
  const result = await seasonsModule.setClubSeasonStatus({
    organizationId: CLUB_A,
    seasonId: "s-2026",
    action: "activate",
  });

  assert.equal(result.state.activeSeasonId, "s-2026");
  const byId = Object.fromEntries(
    settingsOf(CLUB_A).seasons.map((season) => [season.id, season.status]),
  );
  assert.equal(byId["s-2026"], "active");
  assert.equal(byId["s-2025"], "archived");
});

test("la stagione attiva non si puo archiviare", async () => {
  await assert.rejects(
    seasonsModule.setClubSeasonStatus({
      organizationId: CLUB_A,
      seasonId: "s-2025",
      action: "archive",
    }),
    /Non si puo archiviare la stagione attiva/,
  );

  assert.equal(settingsOf(CLUB_A).activeSeasonId, "s-2025");
});

test("archiviare una stagione futura registra il momento e non tocca i dati", async () => {
  const before = itemsOf(CLUB_A, "categories").length;

  const result = await seasonsModule.setClubSeasonStatus({
    organizationId: CLUB_A,
    seasonId: "s-2026",
    action: "archive",
    now: "2026-08-24T10:00:00.000Z",
  });

  assert.equal(result.season.status, "archived");
  assert.equal(result.season.archivedAt, "2026-08-24T10:00:00.000Z");
  assert.equal(itemsOf(CLUB_A, "categories").length, before);
});

/* ------------------------------ RIPORTO ------------------------------- */

test("il riporto crea righe nuove nella stagione di destinazione", async () => {
  const result = await seasonsModule.runClubSeasonRollover({
    organizationId: CLUB_A,
    sourceSeasonId: "s-2025",
    targetSeasonId: "s-2026",
    types: ["categories", "payment_plans"],
  });

  assert.equal(result.applied, true);
  assert.equal(result.createdTotal, 2);

  const categorie = itemsOf(CLUB_A, "categories");
  assert.equal(categorie.length, 3, "la copia si aggiunge, non sostituisce");

  const originale = categorie.find((row) => row.id === CAT_A_2025);
  assert.equal(
    originale.payload.seasonId,
    "s-2025",
    "l'originale deve restare nella sua stagione",
  );

  const copia = categorie.find(
    (row) => row.payload.rolloverSourceId === CAT_A_2025,
  );
  assert.ok(copia, "la copia deve esistere");
  assert.notEqual(copia.id, CAT_A_2025);
  assert.equal(copia.payload.seasonId, "s-2026");

  const piano = itemsOf(CLUB_A, "payment_plans").find(
    (row) => row.payload.seasonId === "s-2026",
  );
  assert.equal(
    piano.payload.categoryId,
    copia.payload.id,
    "il piano riportato deve puntare alla categoria della stagione nuova",
  );
});

test("l'anteprima conta senza scrivere", async () => {
  const before = itemsOf(CLUB_A, "categories").length;

  const result = await seasonsModule.runClubSeasonRollover({
    organizationId: CLUB_A,
    sourceSeasonId: "s-2025",
    targetSeasonId: "s-2026",
    types: ["categories"],
    preview: true,
  });

  assert.equal(result.applied, false);
  assert.equal(result.createdTotal, 1);
  assert.equal(itemsOf(CLUB_A, "categories").length, before);
});

test("rieseguire il riporto non aggiunge nulla", async () => {
  await seasonsModule.runClubSeasonRollover({
    organizationId: CLUB_A,
    sourceSeasonId: "s-2025",
    targetSeasonId: "s-2026",
    types: ["categories", "payment_plans"],
  });
  const dopoPrimo = itemsOf(CLUB_A, "categories").length;

  const secondo = await seasonsModule.runClubSeasonRollover({
    organizationId: CLUB_A,
    sourceSeasonId: "s-2025",
    targetSeasonId: "s-2026",
    types: ["categories", "payment_plans"],
  });

  assert.equal(secondo.createdTotal, 0);
  assert.equal(itemsOf(CLUB_A, "categories").length, dopoPrimo);
});

test("non si riporta dentro una stagione archiviata", async () => {
  await seasonsModule.setClubSeasonStatus({
    organizationId: CLUB_A,
    seasonId: "s-2026",
    action: "archive",
  });

  await assert.rejects(
    seasonsModule.runClubSeasonRollover({
      organizationId: CLUB_A,
      sourceSeasonId: "s-2025",
      targetSeasonId: "s-2026",
      types: ["categories"],
    }),
    /stagione archiviata/,
  );
});

test("origine e destinazione devono essere due stagioni diverse ed esistenti", async () => {
  await assert.rejects(
    seasonsModule.runClubSeasonRollover({
      organizationId: CLUB_A,
      sourceSeasonId: "s-2025",
      targetSeasonId: "s-2025",
      types: ["categories"],
    }),
    /due stagioni diverse/,
  );

  await assert.rejects(
    seasonsModule.runClubSeasonRollover({
      organizationId: CLUB_A,
      sourceSeasonId: "s-inesistente",
      targetSeasonId: "s-2026",
      types: ["categories"],
    }),
    /Stagione di origine non trovata/,
  );
});

/* --------------------------- MULTI-TENANT ----------------------------- */

test("il riporto di un club non vede ne tocca le risorse di un altro", async () => {
  await seasonsModule.runClubSeasonRollover({
    organizationId: CLUB_A,
    sourceSeasonId: "s-2025",
    targetSeasonId: "s-2026",
    types: ["categories", "payment_plans"],
  });

  const categorieB = itemsOf(CLUB_B, "categories");
  assert.equal(categorieB.length, 1, "il club B non deve ricevere copie");
  assert.equal(categorieB[0].id, CAT_B_2025);
  assert.deepEqual(settingsOf(CLUB_B), seasonsOf("s-2025"));

  const letture = fake.calls.filter(
    (call) =>
      call.delegate === "clubResourceItem" &&
      ["findMany", "deleteMany", "createMany"].includes(call.method),
  );
  assert.ok(letture.length > 0);
  for (const call of letture) {
    if (call.method === "createMany") {
      for (const row of call.args.data) {
        assert.equal(row.organization_id, CLUB_A);
      }
      continue;
    }
    assert.equal(
      call.args.where?.organization_id,
      CLUB_A,
      `${call.method} senza filtro sull'organizzazione`,
    );
  }
});

test("lo stato delle stagioni si legge e si scrive solo sul club richiesto", async () => {
  await seasonsModule.setClubSeasonStatus({
    organizationId: CLUB_A,
    seasonId: "s-2026",
    action: "activate",
  });

  assert.equal(settingsOf(CLUB_A).activeSeasonId, "s-2026");
  assert.equal(settingsOf(CLUB_B).activeSeasonId, "s-2025");

  for (const call of fake.calls.filter(
    (entry) => entry.delegate === "club" && entry.method === "update",
  )) {
    assert.equal(call.args.where.id, CLUB_A);
  }
});

test("un club inesistente non produce una stagione fantasma", async () => {
  await assert.rejects(
    seasonsModule.readClubSeasonState("cccccccc-0000-4000-8000-000000000003"),
    /Club non trovato/,
  );
});

/* -------------------- SEPARAZIONE IN SCRITTURA ------------------------ */

const scopeA = () => ({
  userId: "user-a",
  activeOrganizationId: CLUB_A,
  allowedOrganizationIds: [CLUB_A],
});

test("una risorsa creata porta la stagione attiva della richiesta", async () => {
  const resources = await import("../../src/lib/server/resources.ts");

  const created = await resources.createResource(
    "categories",
    { name: "Under 12" },
    "create",
    scopeA(),
    { activeSeasonId: "s-2026" },
  );

  assert.equal(created.seasonId, "s-2026");
});

test("una modifica non puo spostare un record in un'altra stagione", async () => {
  const resources = await import("../../src/lib/server/resources.ts");

  await resources.updateResource(
    "categories",
    CAT_A_2025,
    { name: "Under 14 rinominata", seasonId: "s-2026" },
    scopeA(),
    { activeSeasonId: "s-2026" },
  );

  const row = itemsOf(CLUB_A, "categories").find((entry) => entry.id === CAT_A_2025);

  assert.equal(
    row.payload.seasonId,
    "s-2025",
    "spostare un record fra stagioni riscriverebbe la storia di un'annata chiusa",
  );
  assert.equal(row.name, "Under 14 rinominata", "il resto si modifica");
});

/* ------------------------------ CONTEGGI ------------------------------ */

test("il riepilogo conta le voci di ogni stagione separatamente", async () => {
  const state = await seasonsModule.summarizeSeasonContents(CLUB_A);

  assert.equal(state.counts["s-2025"].categories, 1);
  assert.equal(state.counts["s-2026"].categories, 1);
  assert.equal(state.counts["s-2025"].payment_plans, 1);
  assert.equal(state.counts["s-2026"].payment_plans, 0);
});
