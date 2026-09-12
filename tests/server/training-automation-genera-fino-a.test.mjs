import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **"Genera fino a..." e l'anteprima** (WP-03, WP-17).
 *
 * `runTrainingAutomationForClub` accetta ora una data assoluta al posto
 * della sola finestra relativa, e un'anteprima che calcola lo stesso
 * risultato senza scrivere niente. Questo file prova che:
 *
 * - la data assoluta genera oltre la finestra automatica di default;
 * - l'anteprima non tocca il database, e predice lo stesso numero di righe
 *   che l'esecuzione reale poi crea (stesso planner, PP-01/WP-17);
 * - una data fuori dall'intervallo consentito e un rifiuto esplicito, non un
 *   silenzio.
 */

const CLUB = "aaaaaaaa-6c00-4000-8000-00000000000d";
const DIREZIONE = "11111111-6c00-4000-8000-000000000ccc";

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
      structures: [],
      trainings: [],
      matches: [],
      weekly_schedule: [
        {
          id: "slot-lunedi",
          day: "Lunedì",
          startTime: "18:00",
          endTime: "19:30",
          categoryId: "u15",
          structureId: "STRUCT1",
          locationId: "FIELD1",
          trainerIds: ["trainer-1"],
        },
      ],
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

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const NOW = new Date("2026-09-14T08:00:00.000Z");

test("WP-03 · «Genera fino a...» copre un intervallo oltre la finestra automatica di default", async () => {
  const risultato = await automazione.runTrainingAutomationForClub(CLUB, {
    force: true,
    now: NOW,
    untilDate: "2026-12-31",
  });

  assert.equal(risultato.ran, true);
  assert.equal(risultato.preview, false);
  assert.equal(risultato.generatedUntil, "2026-12-31");
  // Da 2026-09-14 al 2026-12-31 ci sono molti piu di 3 lunedi (la finestra
  // automatica di default, 21 giorni, ne coprirebbe al piu 3).
  assert.ok(
    risultato.generatedCount > 10,
    `attese piu di 10 occorrenze, trovate ${risultato.generatedCount}`,
  );
  assert.equal(risultato.generatedCount, fake.rows("clubEvent").length);

  const club = fake.rows("club").find((c) => c.id === CLUB);
  assert.equal(club?.settings?.trainingAutomation?.generatedUntil, "2026-12-31");
});

test("WP-16 · «generato fino al» non regredisce quando il cron gira con una finestra piu corta", async () => {
  await automazione.runTrainingAutomationForClub(CLUB, {
    force: true,
    now: NOW,
    untilDate: "2026-12-31",
  });

  await automazione.runTrainingAutomationForClub(CLUB, {
    force: true,
    now: new Date("2026-09-15T04:00:00.000Z"),
  });

  const club = fake.rows("club").find((c) => c.id === CLUB);
  assert.equal(
    club?.settings?.trainingAutomation?.generatedUntil,
    "2026-12-31",
    "il cron notturno (finestra di 21 giorni) non deve far dimenticare dicembre",
  );
});

test("WP-17 · l'anteprima non scrive niente e predice lo stesso numero che l'esecuzione poi crea", async () => {
  const anteprima = await automazione.runTrainingAutomationForClub(CLUB, {
    force: true,
    now: NOW,
    untilDate: "2026-10-15",
    preview: true,
  });

  assert.equal(anteprima.preview, true);
  assert.ok(anteprima.generatedCount > 0);
  assert.equal(
    fake.rows("clubEvent").length,
    0,
    "l'anteprima non ha creato nessuna riga",
  );
  assert.equal(
    fake.rows("auditLog").length,
    0,
    "l'anteprima non ha scritto nessun audit",
  );

  const club = fake.rows("club").find((c) => c.id === CLUB);
  assert.equal(
    club?.settings?.trainingAutomation?.lastRunAt,
    undefined,
    "l'anteprima non aggiorna lastRunAt",
  );

  const reale = await automazione.runTrainingAutomationForClub(CLUB, {
    force: true,
    now: NOW,
    untilDate: "2026-10-15",
  });

  assert.equal(
    reale.generatedCount,
    anteprima.generatedCount,
    "l'anteprima e l'esecuzione usano lo stesso planner e concordano",
  );
  assert.equal(fake.rows("clubEvent").length, reale.generatedCount);
});

test("WP-03 · una data nel passato e fuori dall'intervallo consentito", async () => {
  const risultato = await automazione.runTrainingAutomationForClub(CLUB, {
    force: true,
    now: NOW,
    untilDate: "2026-01-01",
  });

  assert.equal(risultato.ran, false);
  assert.equal(risultato.reason, "until_out_of_range");
  assert.equal(fake.rows("clubEvent").length, 0);
});

test("WP-03 · una data oltre il limite massimo e un rifiuto esplicito", async () => {
  const risultato = await automazione.runTrainingAutomationForClub(CLUB, {
    force: true,
    now: NOW,
    untilDate: "2028-01-01",
  });

  assert.equal(risultato.ran, false);
  assert.equal(risultato.reason, "until_out_of_range");
});
