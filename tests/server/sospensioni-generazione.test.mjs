import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Sospensioni ed eccezioni** (WP-15): saltare una singola occorrenza, o un
 * intervallo (vacanze natalizie, chiusura impianti), senza disattivare la
 * regola. Non e un secondo modello: `from === to` e un salto singolo,
 * `from < to` e una sospensione, e senza `slotId` vale per tutto il
 * programma.
 */

let isDateExcludedForSlot;
let automazione;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  ({ isDateExcludedForSlot } = await import(
    "../../src/lib/training-automation-utils.ts"
  ));
  automazione = await import("../../src/lib/server/training-automation.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

test("isDateExcludedForSlot (pura) · un salto singolo copre solo quel giorno", () => {
  const esclusioni = [{ id: "e1", from: "2026-12-24", to: "2026-12-24", slotId: "slot-1" }];

  assert.equal(isDateExcludedForSlot(esclusioni, "2026-12-24", "slot-1"), true);
  assert.equal(isDateExcludedForSlot(esclusioni, "2026-12-23", "slot-1"), false);
  assert.equal(isDateExcludedForSlot(esclusioni, "2026-12-25", "slot-1"), false);
});

test("isDateExcludedForSlot (pura) · una sospensione senza slotId vale per tutto il programma", () => {
  const esclusioni = [
    { id: "e1", from: "2026-12-23", to: "2027-01-06", slotId: null, reason: "Natale" },
  ];

  assert.equal(isDateExcludedForSlot(esclusioni, "2026-12-25", "slot-qualunque"), true);
  assert.equal(isDateExcludedForSlot(esclusioni, "2027-01-06", "altro-slot"), true, "estremo incluso");
  assert.equal(isDateExcludedForSlot(esclusioni, "2027-01-07", "slot-qualunque"), false);
});

test("isDateExcludedForSlot (pura) · una sospensione con slotId non tocca gli altri slot", () => {
  const esclusioni = [{ id: "e1", from: "2026-12-01", to: "2026-12-31", slotId: "slot-1" }];

  assert.equal(isDateExcludedForSlot(esclusioni, "2026-12-15", "slot-1"), true);
  assert.equal(isDateExcludedForSlot(esclusioni, "2026-12-15", "slot-2"), false);
});

/* ---------------------------------------------------- integrazione --- */

const CLUB = "aaaaaaaa-6c00-4000-8000-000000000011";
const DIREZIONE = "11111111-6c00-4000-8000-000000001aaa";

const slot = (id, structureId) => ({
  id,
  day: "Lunedì",
  startTime: "18:00",
  endTime: "19:30",
  categoryId: "u15",
  structureId,
  locationId: `${structureId}-field`,
  trainerIds: ["trainer-1"],
});

const seed = (exclusions) => ({
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
      structures: [],
      trainings: [],
      matches: [],
      weekly_schedule: [slot("slot-1", "STRUCT1"), slot("slot-2", "STRUCT2")],
      settings: { trainingAutomation: { exclusions } },
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

test("WP-15 · una sospensione club-wide salta le occorrenze di tutte le regole nel periodo", async () => {
  fake = createFakePrisma(
    seed([{ id: "natale", from: "2026-09-01", to: "2026-11-30" }]),
  );
  setPrismaClientForTests(fake.client);

  const risultato = await automazione.runTrainingAutomationForClub(CLUB, {
    force: true,
    now: NOW,
    untilDate: "2026-12-15",
  });

  // Entrambi gli slot generano solo dopo il 30/11.
  const dateGenerate = risultato.generatedTrainings.map((t) => t.date).sort();
  assert.ok(dateGenerate.every((d) => d > "2026-11-30"));
  assert.ok(dateGenerate.length > 0, "genera comunque dopo la sospensione");
});

test("WP-15 · una sospensione per un solo slot non tocca gli altri", async () => {
  fake = createFakePrisma(
    seed([
      { id: "chiusura-struct1", from: "2026-09-01", to: "2026-10-31", slotId: "slot-1" },
    ]),
  );
  setPrismaClientForTests(fake.client);

  const risultato = await automazione.runTrainingAutomationForClub(CLUB, {
    force: true,
    now: NOW,
    untilDate: "2026-10-15",
  });

  const perStruttura = risultato.generatedTrainings.reduce((acc, t) => {
    acc[t.structureId] = (acc[t.structureId] || 0) + 1;
    return acc;
  }, {});

  assert.equal(perStruttura.STRUCT1 || 0, 0, "slot-1 e sospeso nel periodo");
  assert.ok((perStruttura.STRUCT2 || 0) > 0, "slot-2 genera normalmente");
});
