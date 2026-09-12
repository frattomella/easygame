import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Un allenamento generato non portava mai il campo, solo la struttura**
 * (reperto trovato dalla sonda di performance dell'hostile audit su Postgres
 * reale, non da un test — la finta Prisma dei test esistenti seminava
 * `field_id` direttamente sulla riga, scavalcando `toEventColumns`).
 *
 * Il ciclo di generazione (`runTrainingAutomationForClub`) scriveva
 * `locationId: location?.fieldId || ...` nell'oggetto passato a
 * `createClubEventsBatch`, ma `toEventColumns` (`src/lib/events/model.ts`)
 * legge la colonna `field_id` solo da `source.fieldId`/`source.field_id`, mai
 * da `source.locationId`. Ogni allenamento generato nasceva quindi con
 * `field_id: null`: `findEventOverlaps` tratta "nessun campo dichiarato" come
 * "occupa tutta la struttura" — due squadre su due campi diversi della
 * stessa struttura, alla stessa ora, sarebbero apparse in conflitto una con
 * l'altra, e non lo sono. Questo file prova che la riga scritta in
 * `club_events` porta il campo giusto, non solo la struttura, e che due voci
 * di programma sulla stessa struttura ma su campi diversi restano
 * distinguibili.
 */

const CLUB = "aaaaaaaa-6c00-4000-8000-00000000000f";
const DIREZIONE = "11111111-6c00-4000-8000-000000000fff";

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

const slot = ({ id, day, time, endTime, fieldId }) => ({
  id,
  day,
  startTime: time,
  endTime,
  categoryId: "u15",
  structureId: "STRUCT1",
  locationId: fieldId,
  trainerIds: ["trainer-1"],
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
      trainers: [],
      staff_members: [],
      // Una struttura sola, due campi: il caso che il bug confondeva.
      structures: [
        {
          id: "STRUCT1",
          name: "Struttura 1",
          fields: [
            { id: "FIELD1", name: "Campo 1" },
            { id: "FIELD2", name: "Campo 2" },
          ],
        },
      ],
      trainings: [],
      matches: [],
      weekly_schedule: [
        slot({ id: "slot-1", day: "Lunedì", time: "18:00", endTime: "19:00", fieldId: "FIELD1" }),
        slot({ id: "slot-2", day: "Lunedì", time: "18:00", endTime: "19:00", fieldId: "FIELD2" }),
      ],
      settings: { trainingAutomation: { enabled: true, generateDaysAhead: 21 } },
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

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

test("un allenamento generato porta il field_id del campo risolto, non solo la struttura", async () => {
  await automazione.runTrainingAutomationForClub(CLUB, { force: true });

  const righe = fake.rows("clubEvent");
  assert.ok(righe.length >= 2, "entrambe le voci di programma generano un evento");

  for (const riga of righe) {
    assert.equal(
      riga.structure_id,
      "STRUCT1",
      "la struttura resta quella della voce di programma",
    );
    assert.ok(
      riga.field_id === "FIELD1" || riga.field_id === "FIELD2",
      `il campo non deve restare null (trovato: ${riga.field_id})`,
    );
  }
});

test("due voci sulla stessa struttura ma su campi diversi restano distinguibili nel field_id", async () => {
  await automazione.runTrainingAutomationForClub(CLUB, { force: true });

  const righe = fake.rows("clubEvent");
  const campi = new Set(righe.map((riga) => riga.field_id));

  assert.equal(
    campi.size,
    2,
    "due campi diversi della stessa struttura non devono collassare sullo stesso field_id (o su null)",
  );
  assert.ok(campi.has("FIELD1"));
  assert.ok(campi.has("FIELD2"));
});
