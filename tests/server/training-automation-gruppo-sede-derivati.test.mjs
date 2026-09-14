import assert from "node:assert/strict";
import test, { before } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **`site_id`/`group_ids` si derivano dal catalogo, non solo dalla fascia**
 * (pilota Fortitudo Scauri: Trainer con perimetro di sede parziale — righe
 * in `club_access_scopes`, non "tutte" — a zero allenamenti visibili).
 *
 * `listClubEvents` applica il perimetro di sede di un ruolo direttamente
 * sulla colonna (`where.site_id = { in: sedi }`, Wave 6 §11.3): un
 * allenamento generato con `site_id`/`group_ids` assenti non e mai dentro
 * quel filtro, qualunque sia la sua categoria — la riga sparisce dal
 * calendario di ogni Trainer che non copre tutte le sedi, in silenzio.
 *
 * Prima di questa correzione la generazione fidava **solo** di
 * `scheduleItem.groupId`: una fascia salvata senza quel campo (o una copia
 * del client rimasta indietro rispetto al catalogo) produceva un evento
 * senza sede in colonna, anche quando il catalogo del club bastava da solo
 * a non lasciare dubbi.
 */

const CLUB = "aaaaaaaa-6c00-4000-8000-00000000000e";
const DIREZIONE = "11111111-6c00-4000-8000-000000000ddd";

let automazione;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  automazione = await import("../../src/lib/server/training-automation.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const baseClub = (overrides = {}) => ({
  id: CLUB,
  slug: "club",
  name: "Club",
  creator_id: DIREZIONE,
  categories: [
    { id: "u15", name: "Under 15" },
    { id: "u17", name: "Under 17" },
    { id: "u19", name: "Under 19" },
  ],
  trainers: [],
  staff_members: [],
  structures: [],
  trainings: [],
  matches: [],
  club_sites: [
    { id: "site-a", name: "Sede A" },
    { id: "site-b", name: "Sede B" },
  ],
  settings: {},
  ...overrides,
});

const seed = (clubOverrides, weeklySchedule) => ({
  user: [{ id: DIREZIONE, email: "direzione@club.it" }],
  club: [
    {
      ...baseClub(clubOverrides),
      weekly_schedule: weeklySchedule,
    },
  ],
  athlete: [],
  athleteCategoryMembership: [],
  clubResourceItem: [],
  clubEvent: [],
  clubEventParticipant: [],
  auditLog: [],
  notification: [],
});

const NOW = new Date("2026-09-14T08:00:00.000Z");

const scheduleSlot = (overrides = {}) => ({
  id: "slot-lunedi",
  day: "Lunedì",
  startTime: "18:00",
  endTime: "19:30",
  categoryId: "u15",
  structureId: "STRUCT1",
  locationId: "FIELD1",
  trainerIds: ["trainer-1"],
  ...overrides,
});

test("categoria con un solo gruppo configurato e fascia senza groupId → l'evento generato eredita sede e gruppo dal catalogo", async () => {
  fake = createFakePrisma(
    seed(
      {
        category_groups: [{ categoryId: "u15", siteId: "site-a" }],
      },
      [scheduleSlot()],
    ),
  );
  setPrismaClientForTests(fake.client);

  const risultato = await automazione.runTrainingAutomationForClub(CLUB, {
    force: true,
    now: NOW,
    untilDate: "2026-09-15",
  });

  assert.equal(risultato.generatedCount, 1);
  const evento = fake.rows("clubEvent")[0];
  assert.equal(evento.site_id, "site-a");
  assert.deepEqual(evento.group_ids, ["group:u15:site-a"]);
});

test("fascia con groupId esplicito → site_id in colonna viene comunque popolato dal gruppo dichiarato", async () => {
  fake = createFakePrisma(
    seed(
      {
        category_groups: [{ categoryId: "u15", siteId: "site-a" }],
      },
      [scheduleSlot({ groupId: "group:u15:site-a" })],
    ),
  );
  setPrismaClientForTests(fake.client);

  const risultato = await automazione.runTrainingAutomationForClub(CLUB, {
    force: true,
    now: NOW,
    untilDate: "2026-09-15",
  });

  assert.equal(risultato.generatedCount, 1);
  const evento = fake.rows("clubEvent")[0];
  assert.equal(evento.site_id, "site-a");
  assert.deepEqual(evento.group_ids, ["group:u15:site-a"]);
});

test("categoria con due sedi vere (ADR-0055) e fascia senza groupId → nessuna sede indovinata, mai il difetto opposto", async () => {
  fake = createFakePrisma(
    seed(
      {
        category_groups: [
          { categoryId: "u17", siteId: "site-a" },
          { categoryId: "u17", siteId: "site-b" },
        ],
      },
      [scheduleSlot({ categoryId: "u17" })],
    ),
  );
  setPrismaClientForTests(fake.client);

  const risultato = await automazione.runTrainingAutomationForClub(CLUB, {
    force: true,
    now: NOW,
    untilDate: "2026-09-15",
  });

  assert.equal(risultato.generatedCount, 1);
  const evento = fake.rows("clubEvent")[0];
  assert.equal(evento.site_id, null);
  assert.ok(!evento.group_ids || evento.group_ids.length === 0);
});

test("categoria con un gruppo archiviato e uno attivo (migrazione a un gruppo nuovo) → la sede si deriva dal gruppo ancora attivo, non resta ambigua per sempre (pilota Fortitudo Scauri, \"Pulcini\")", async () => {
  fake = createFakePrisma(
    seed(
      {
        category_groups: [
          // Il club ha spostato "Pulcini" da site-a a site-b e disattivato
          // il gruppo vecchio invece di lasciarlo li: due righe per la
          // stessa categoria, ma solo una in uso davvero.
          { categoryId: "u15", siteId: "site-a", active: false },
          { categoryId: "u15", siteId: "site-b", active: true },
        ],
      },
      [scheduleSlot()],
    ),
  );
  setPrismaClientForTests(fake.client);

  const risultato = await automazione.runTrainingAutomationForClub(CLUB, {
    force: true,
    now: NOW,
    untilDate: "2026-09-15",
  });

  assert.equal(risultato.generatedCount, 1);
  const evento = fake.rows("clubEvent")[0];
  assert.equal(
    evento.site_id,
    "site-b",
    "un gruppo archiviato non conta come una seconda sede vera",
  );
  assert.deepEqual(evento.group_ids, ["group:u15:site-b"]);
});

test("categoria senza nessun gruppo configurato (mono-sede storico) → comportamento invariato, nessuna sede inventata", async () => {
  fake = createFakePrisma(
    seed({ category_groups: [] }, [scheduleSlot({ categoryId: "u19" })]),
  );
  setPrismaClientForTests(fake.client);

  const risultato = await automazione.runTrainingAutomationForClub(CLUB, {
    force: true,
    now: NOW,
    untilDate: "2026-09-15",
  });

  assert.equal(risultato.generatedCount, 1);
  const evento = fake.rows("clubEvent")[0];
  assert.equal(evento.site_id, null);
  // Il gruppo implicito (categoria senza sede) resta valido: e la stessa
  // convenzione gia in uso altrove nel dominio (`buildCategoryGroupId`).
  assert.deepEqual(evento.group_ids, ["group:u19"]);
});
