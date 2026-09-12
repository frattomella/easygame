import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Il gruppo operativo entra nell'identità di uno slot** (chiude D-AUD-30
 * sulle due superfici dove l'audit ostile del mandato lo ha trovato
 * propagato: il merge del programma settimanale e l'impatto di una modifica,
 * WP-08).
 *
 * Prima: due squadre della stessa categoria, stesso giorno/ora/campo, gruppo
 * operativo diverso (il caso ADR-0055, due sedi nella stessa fascia oraria)
 * risultavano la **stessa identità** — `mergeWeeklyScheduleSources` ne
 * scartava una in silenzio, e un cambio di sede puro non produceva mai un
 * avviso di impatto.
 */

const CLUB = "aaaaaaaa-6c00-4000-8000-000000000012";
const DIREZIONE = "11111111-6c00-4000-8000-000000002aaa";

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

const slot = ({ id, groupId }) => ({
  id,
  day: "Lunedì",
  startTime: "18:00",
  endTime: "19:30",
  categoryId: "u15",
  groupId,
  structureId: "STRUCT1",
  locationId: "FIELD1",
  trainerIds: ["trainer-1"],
});

const seed = (weeklySchedule) => ({
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
      weekly_schedule: weeklySchedule,
      settings: {},
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

test("WP-01/D-AUD-30 · due squadre stesso giorno/ora/campo ma gruppo diverso non si fondono nel merge", async () => {
  fake = createFakePrisma(
    seed([
      slot({ id: "slot-nord", groupId: "gruppo-nord" }),
      slot({ id: "slot-sud", groupId: "gruppo-sud" }),
    ]),
  );
  setPrismaClientForTests(fake.client);

  const risultato = await automazione.runTrainingAutomationForClub(CLUB, {
    force: true,
    now: NOW,
  });

  assert.ok(risultato.generatedTrainings.length >= 2, "entrambe le squadre generano");
  const gruppi = new Set(
    risultato.generatedTrainings.flatMap((t) => t.groupIds || []),
  );
  assert.ok(gruppi.has("gruppo-nord") && gruppi.has("gruppo-sud"));

  const righe = fake.rows("clubEvent");
  assert.equal(
    new Set(righe.map((r) => r.legacy_id)).size,
    righe.length,
    "identificativi storici distinti per le due squadre",
  );
});

test("WP-08/D-AUD-30 · spostare una squadra da un gruppo/sede a un altro, a parita di tutto il resto, e un cambiamento rilevato", () => {
  const previousSchedule = [slot({ id: "slot-1", groupId: "gruppo-nord" })];
  const nextSchedule = [slot({ id: "slot-1", groupId: "gruppo-sud" })];

  const cambi = automazione.findWeeklyScheduleSlotChanges(
    previousSchedule,
    nextSchedule,
  );

  assert.equal(cambi.length, 1, "il solo cambio di gruppo operativo non passa piu inosservato");
  assert.equal(cambi[0].changeType, "modified");
});

test("WP-08/D-AUD-30 · nessun cambio quando anche il gruppo resta identico", () => {
  const cambi = automazione.findWeeklyScheduleSlotChanges(
    [slot({ id: "slot-1", groupId: "gruppo-nord" })],
    [slot({ id: "slot-1", groupId: "gruppo-nord" })],
  );

  assert.deepEqual(cambi, []);
});
