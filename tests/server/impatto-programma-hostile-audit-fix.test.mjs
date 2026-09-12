import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Correzioni dall'hostile audit del mandato** su WP-08:
 *
 * 1. "Sicuro" richiede anche che i valori dell'evento coincidano ancora con
 *    la definizione precedente dello slot — non solo il segno
 *    `manuallyModified`, assente su ogni evento generato prima che WP-10
 *    esistesse.
 * 2. La risoluzione di categoria/campo e la stessa della generazione
 *    (`resolveCategoryId`/`findTrainingLocationOption`), non
 *    un'approssimazione sui valori grezzi.
 * 3. Uno scarto durante l'applicazione porta il motivo, non solo il
 *    conteggio.
 * 4. Il calcolo dell'impatto su piu slot cambiati fa una query sola per la
 *    ricerca degli eventi e una per le partecipazioni, non una per slot.
 */

const CLUB = "aaaaaaaa-6c00-4000-8000-000000000013";
const DIREZIONE = "11111111-6c00-4000-8000-000000003aaa";
const ATLETA_ID = "dddddddd-6c00-4000-8000-000000000002";

let automazione;
let setPrismaClientForTests;
let fake;

const scope = () => ({
  userId: DIREZIONE,
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  automazione = await import("../../src/lib/server/training-automation.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const NOW = new Date("2026-09-14T08:00:00.000Z");

const slot = (overrides) => ({
  id: "slot-1",
  day: "Lunedì",
  startTime: "18:00",
  endTime: "19:30",
  categoryId: "u15",
  structureId: "STRUCT1",
  locationId: "FIELD1",
  trainerIds: ["trainer-1"],
  ...overrides,
});

// Il primo lunedi utile dopo NOW.
const primaData = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + 7);
const primaDataIso = `${primaData.getFullYear()}-${String(primaData.getMonth() + 1).padStart(2, "0")}-${String(primaData.getDate()).padStart(2, "0")}`;
const alleDiciotto = new Date(`${primaDataIso}T18:00:00.000Z`);

const legacyIdPerSlotUnico = `auto:${[primaDataIso, "18:00", "FIELD1", "u15"]
  .map((v) => String(v).toLowerCase())
  .join("|")}`;

const rigaGenerata = (id, overrides = {}) => ({
  id,
  organization_id: CLUB,
  kind: "training",
  legacy_id: legacyIdPerSlotUnico,
  title: "Allenamento",
  status: "scheduled",
  category_id: "u15",
  category_name: "Under 15",
  category_ids: ["u15"],
  structure_id: "STRUCT1",
  field_id: "FIELD1",
  site_id: null,
  group_ids: [],
  rsvp_required: false,
  starts_at: alleDiciotto,
  ends_at: new Date(alleDiciotto.getTime() + 90 * 60 * 1000),
  version: 1,
  payload: { generated: true },
  ...overrides,
});

const seed = (clubEvent, { conCatalogo = true } = {}) => ({
  user: [{ id: DIREZIONE, email: "direzione@club.it" }],
  club: [
    {
      id: CLUB,
      slug: "club",
      name: "Club",
      creator_id: DIREZIONE,
      categories: conCatalogo ? [{ id: "u15", name: "Under 15" }] : [],
      club_sites: [],
      category_groups: [],
      trainers: [],
      staff_members: [],
      structures: [],
      trainings: [],
      matches: [],
    },
  ],
  athlete: [
    {
      id: ATLETA_ID,
      organization_id: CLUB,
      first_name: "Mario",
      last_name: "Rossi",
      category_id: "u15",
      category_name: "Under 15",
      data: {},
    },
  ],
  athleteCategoryMembership: [],
  clubResourceItem: [],
  clubEvent,
  clubEventParticipant: [],
  auditLog: [],
  notification: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed([rigaGenerata("evt-1")]));
  setPrismaClientForTests(fake.client);
});

test("hostile audit · un evento storico senza manuallyModified ma con orario gia diverso NON e sicuro", async () => {
  // Simula un evento generato prima che WP-10 esistesse (nessun
  // manuallyModified nel payload) e poi corretto a mano: l'orario reale
  // (19:00) non coincide piu con quello dello slot precedente (18:00).
  fake = createFakePrisma(
    seed([
      rigaGenerata("evt-storico", {
        starts_at: new Date(`${primaDataIso}T19:00:00.000Z`),
        ends_at: new Date(`${primaDataIso}T20:30:00.000Z`),
        payload: { generated: true }, // nessun manuallyModified: precede WP-10
      }),
    ]),
  );
  setPrismaClientForTests(fake.client);

  const nextSchedule = [slot({ startTime: "19:00", endTime: "20:30" })];
  const [impatto] = await automazione.previewWeeklyScheduleImpact(CLUB, {
    previousSchedule: [slot({})],
    nextSchedule,
    now: NOW,
  });

  assert.equal(impatto.matchedCount, 1);
  assert.equal(
    impatto.safeCount,
    0,
    "i valori sono gia diversi da quelli della definizione precedente: non e sicuro, anche senza il segno",
  );
});

test("hostile audit · un evento con valori invariati e sicuro anche senza il segno esplicito", async () => {
  const nextSchedule = [slot({ startTime: "19:00", endTime: "20:30" })];
  const [impatto] = await automazione.previewWeeklyScheduleImpact(CLUB, {
    previousSchedule: [slot({})],
    nextSchedule,
    now: NOW,
  });

  assert.equal(impatto.matchedCount, 1);
  assert.equal(impatto.safeCount, 1, "i valori coincidono ancora: sicuro");
});

test("hostile audit · la categoria si risolve come nella generazione, non per confronto grezzo", async () => {
  // Lo slot precedente porta il NOME della categoria, non l'id -- come
  // potrebbe arrivare da un import o da una scrittura fuori dal pannello.
  // La risoluzione deve trovare comunque l'evento gia generato con l'id
  // canonico "u15".
  const previousSchedule = [slot({ categoryId: "Under 15" })];
  const nextSchedule = [slot({ categoryId: "Under 15", startTime: "19:00", endTime: "20:30" })];

  const [impatto] = await automazione.previewWeeklyScheduleImpact(CLUB, {
    previousSchedule,
    nextSchedule,
    now: NOW,
  });

  assert.equal(
    impatto.matchedCount,
    1,
    "il nome si risolve contro il catalogo, come fa la generazione, e trova l'evento",
  );
});

test("hostile audit · uno scarto in applicazione porta il motivo, non solo il conteggio", async () => {
  // Nessuna partecipazione in questo scenario: verifichiamo lo scarto per
  // sovrapposizione, spostando il nuovo orario sopra un altro evento reale
  // gia presente sullo stesso campo. Gli id sono a forma di UUID: e cosi che
  // `findClubEvent` cerca per id (altrimenti ricade sul legacy_id, che qui
  // e un'altra cosa).
  const EVT_DA_AGGIORNARE = "cccccccc-6c00-4000-8000-0000000000a1";
  const EVT_OCCUPANTE = "cccccccc-6c00-4000-8000-0000000000a2";

  fake = createFakePrisma(
    seed([
      rigaGenerata(EVT_DA_AGGIORNARE),
      rigaGenerata(EVT_OCCUPANTE, {
        id: EVT_OCCUPANTE,
        legacy_id: "altro",
        starts_at: new Date(`${primaDataIso}T20:00:00.000Z`),
        ends_at: new Date(`${primaDataIso}T21:00:00.000Z`),
      }),
    ]),
  );
  setPrismaClientForTests(fake.client);

  const previousSchedule = [slot({})];
  const nextSchedule = [slot({ startTime: "20:00", endTime: "21:00" })];

  const [esito] = await automazione.applyWeeklyScheduleSlotChanges(
    scope(),
    CLUB,
    { userId: DIREZIONE, email: "direzione@club.it" },
    { previousSchedule, nextSchedule, now: NOW },
  );

  assert.equal(esito.updatedCount, 0);
  assert.equal(esito.skippedCount, 1);
  assert.equal(esito.skippedReasons.length, 1);
  assert.match(esito.skippedReasons[0], /occupato|gia in calendario|Amichevole|campo/i);
});

test("hostile audit · l'impatto su piu slot cambiati fa una query sola per gli eventi e una per le partecipazioni", async () => {
  const molteRighe = Array.from({ length: 5 }, (_, i) =>
    rigaGenerata(`evt-${i}`, {
      legacy_id: `auto:${[primaDataIso, "18:00", `FIELD${i}`, "u15"]
        .map((v) => String(v).toLowerCase())
        .join("|")}`,
      structure_id: `STRUCT${i}`,
      field_id: `FIELD${i}`,
    }),
  );
  fake = createFakePrisma(seed(molteRighe));
  setPrismaClientForTests(fake.client);

  const previousSchedule = Array.from({ length: 5 }, (_, i) =>
    slot({ id: `slot-${i}`, structureId: `STRUCT${i}`, locationId: `FIELD${i}` }),
  );
  const nextSchedule = previousSchedule.map((s) => ({ ...s, startTime: "19:00", endTime: "20:30" }));

  fake.calls.length = 0;
  await automazione.previewWeeklyScheduleImpact(CLUB, {
    previousSchedule,
    nextSchedule,
    now: NOW,
  });

  const letureEventi = fake.calls.filter(
    (c) => c.delegate === "clubEvent" && c.method === "findMany",
  );
  const letureGroupBy = fake.calls.filter(
    (c) => c.delegate === "clubEventParticipant" && c.method === "groupBy",
  );

  assert.equal(
    letureEventi.length,
    1,
    `attesa una sola query per gli eventi su 5 slot cambiati, trovate ${letureEventi.length}`,
  );
  assert.equal(
    letureGroupBy.length,
    1,
    `attesa una sola query per le partecipazioni su 5 slot cambiati, trovate ${letureGroupBy.length}`,
  );
});
