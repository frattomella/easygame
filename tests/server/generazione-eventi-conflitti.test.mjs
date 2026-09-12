import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **La creazione a blocchi non lasciava piu sapere di una sovrapposizione**
 * (D-AUD-22, WP-07).
 *
 * `createClubEventsBatch` e la porta con cui la training-automation genera
 * gli allenamenti dal programma settimanale: fino a qui non controllava
 * affatto se due fasce occupassero lo stesso campo alla stessa ora, ne contro
 * un evento gia esistente ne fra due voci dello stesso blocco. Questo file
 * prova che ora la riga in conflitto non si crea e torna nel risultato come
 * «conflitto da verificare», e che il resto del blocco procede comunque.
 */

const CLUB = "aaaaaaaa-6c00-4000-8000-00000000000a";
const DIREZIONE = "11111111-6c00-4000-8000-000000000aaa";
const ESISTENTE_ID = "cccccccc-6c00-4000-8000-000000000001";
const ANNULLATO_ID = "cccccccc-6c00-4000-8000-000000000002";

let eventi;
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
  eventi = await import("../../src/lib/server/events.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const seed = () => ({
  user: [{ id: DIREZIONE, email: "direzione@club.it" }],
  club: [
    {
      id: CLUB,
      slug: "club",
      name: "Club",
      creator_id: DIREZIONE,
      categories: [{ id: "u15", name: "Under 15" }],
      club_sites: [],
      category_groups: [],
      trainers: [],
      staff_members: [],
      structures: [],
      trainings: [],
      matches: [],
    },
  ],
  athlete: [],
  athleteCategoryMembership: [],
  clubEvent: [
    {
      id: ESISTENTE_ID,
      organization_id: CLUB,
      kind: "training",
      legacy_id: "gia-in-calendario",
      title: "Gia in calendario",
      status: "scheduled",
      category_id: "u15",
      category_name: "Under 15",
      structure_id: "STRUCT1",
      field_id: "FIELD1",
      site_id: null,
      group_ids: [],
      rsvp_required: false,
      starts_at: new Date("2026-09-21T17:00:00.000Z"),
      ends_at: new Date("2026-09-21T18:30:00.000Z"),
      version: 1,
      payload: {},
    },
    {
      id: ANNULLATO_ID,
      organization_id: CLUB,
      kind: "training",
      legacy_id: "annullato-in-calendario",
      title: "Annullato",
      status: "cancelled",
      category_id: "u15",
      category_name: "Under 15",
      structure_id: "STRUCT3",
      field_id: "FIELD3",
      site_id: null,
      group_ids: [],
      rsvp_required: false,
      starts_at: new Date("2026-09-21T20:00:00.000Z"),
      ends_at: new Date("2026-09-21T21:00:00.000Z"),
      version: 1,
      payload: {},
    },
  ],
  clubEventParticipant: [],
  auditLog: [],
  notification: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const candidato = ({ id, structureId, fieldId, start, end }) => ({
  id,
  date: "2026-09-21",
  time: start,
  endTime: end,
  title: `Allenamento ${id}`,
  categoryId: "u15",
  structureId,
  fieldId,
});

test("WP-07 · un candidato che occupa un posto gia occupato non si crea, e torna come conflitto", async () => {
  const { righe, conflitti } = await eventi.createClubEventsBatch(
    scope(),
    "training",
    [
      // Si sovrappone a ESISTENTE_ID sullo stesso campo.
      candidato({ id: "batch-a", structureId: "STRUCT1", fieldId: "FIELD1", start: "17:30", end: "19:00" }),
      // Stesso orario, campo diverso: nessun conflitto.
      candidato({ id: "batch-b", structureId: "STRUCT2", fieldId: "FIELD2", start: "17:30", end: "19:00" }),
    ],
  );

  assert.equal(righe.length, 1, "solo la riga senza conflitto viene creata");
  assert.equal(righe[0].legacy_id, "batch-b");

  assert.equal(conflitti.length, 1);
  assert.equal(conflitti[0].legacyId, "batch-a");
  assert.equal(conflitti[0].data, "2026-09-21");
  assert.equal(conflitti[0].structureId, "STRUCT1");
  assert.equal(conflitti[0].fieldId, "FIELD1");
  assert.equal(conflitti[0].conflictsWith.length, 1);
  assert.equal(conflitti[0].conflictsWith[0].id, ESISTENTE_ID);
  assert.equal(conflitti[0].conflictsWith[0].title, "Gia in calendario");
});

test("WP-07 · due candidati dello stesso blocco che si sovrappongono: uno crea, l'altro e conflitto", async () => {
  const { righe, conflitti } = await eventi.createClubEventsBatch(
    scope(),
    "training",
    [
      candidato({ id: "batch-c", structureId: "STRUCT9", fieldId: "FIELD9", start: "10:00", end: "11:30" }),
      candidato({ id: "batch-d", structureId: "STRUCT9", fieldId: "FIELD9", start: "11:00", end: "12:00" }),
    ],
  );

  assert.equal(righe.length, 1, "il primo candidato del blocco viene creato");
  assert.equal(righe[0].legacy_id, "batch-c");

  assert.equal(conflitti.length, 1, "il secondo, sovrapposto al primo, e un conflitto");
  assert.equal(conflitti[0].legacyId, "batch-d");
  assert.equal(
    conflitti[0].conflictsWith[0]?.title,
    "Allenamento batch-c",
    "il conflitto nomina l'altro candidato dello stesso blocco, non solo righe gia in tabella",
  );
});

test("WP-07 · un evento annullato non occupa piu il suo posto", async () => {
  const { righe, conflitti } = await eventi.createClubEventsBatch(
    scope(),
    "training",
    [
      candidato({ id: "batch-e", structureId: "STRUCT3", fieldId: "FIELD3", start: "20:00", end: "21:00" }),
    ],
  );

  assert.equal(conflitti.length, 0);
  assert.equal(righe.length, 1);
  assert.equal(righe[0].legacy_id, "batch-e");
});

test("WP-07 · sedi/strutture diverse alla stessa ora non sono un conflitto", async () => {
  const { righe, conflitti } = await eventi.createClubEventsBatch(
    scope(),
    "training",
    [
      candidato({ id: "batch-f", structureId: "STRUCT4", fieldId: "FIELD4", start: "18:00", end: "19:00" }),
      candidato({ id: "batch-g", structureId: "STRUCT5", fieldId: "FIELD5", start: "18:00", end: "19:00" }),
    ],
  );

  assert.equal(conflitti.length, 0);
  assert.equal(righe.length, 2);
});
