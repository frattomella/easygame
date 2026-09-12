import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **La training-automation non guardava mai la stagione** (WP-13).
 *
 * `runTrainingAutomationForClub` leggeva `clubs.weekly_schedule` e
 * `club_resource_items` senza filtrare per stagione attiva, e gli eventi che
 * generava uscivano con `season_id: null`. Un programma settimanale della
 * stagione precedente, mai ripulito, veniva generato ugualmente nella
 * stagione nuova. Questo file prova che una voce di una stagione non attiva
 * non genera niente, che una voce della stagione attiva si e che gli eventi
 * generati portano il `season_id` giusto — e che un club a stagione singola
 * (il caso di oggi per la quasi totalita dei club) non perde nessuna voce
 * preesistente senza `seasonId`.
 */

const CLUB = "aaaaaaaa-6c00-4000-8000-00000000000b";
const CLUB_SINGOLA_STAGIONE = "aaaaaaaa-6c00-4000-8000-00000000000c";
const DIREZIONE = "11111111-6c00-4000-8000-000000000bbb";

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

const slot = ({ id, seasonId, time, endTime, structureId, fieldId }) => ({
  id,
  ...(seasonId ? { seasonId } : {}),
  day: "Lunedì",
  startTime: time,
  endTime,
  categoryId: "u15",
  structureId,
  locationId: fieldId,
  trainerIds: ["trainer-1"],
});

const seedDueStagioni = () => ({
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
        slot({
          id: "slot-vecchia-stagione",
          seasonId: "s-old",
          time: "17:00",
          endTime: "18:00",
          structureId: "STRUCT-OLD",
          fieldId: "FIELD-OLD",
        }),
        slot({
          id: "slot-stagione-attiva",
          seasonId: "s-new",
          time: "18:30",
          endTime: "20:00",
          structureId: "STRUCT-NEW",
          fieldId: "FIELD-NEW",
        }),
      ],
      settings: {
        seasons: [
          {
            id: "s-old",
            label: "2025/2026",
            startDate: "2025-07-01",
            endDate: "2026-06-30",
            status: "archived",
            createdAt: "2025-06-01T00:00:00.000Z",
          },
          {
            id: "s-new",
            label: "2026/2027",
            startDate: "2026-07-01",
            endDate: "2027-06-30",
            status: "active",
            createdAt: "2026-06-01T00:00:00.000Z",
          },
        ],
        activeSeasonId: "s-new",
      },
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

const seedStagioneSingola = () => ({
  user: [{ id: DIREZIONE, email: "direzione@club.it" }],
  club: [
    {
      id: CLUB_SINGOLA_STAGIONE,
      slug: "club-singolo",
      name: "Club a stagione singola",
      creator_id: DIREZIONE,
      categories: [{ id: "u15", name: "Under 15" }],
      trainers: [],
      staff_members: [],
      structures: [],
      trainings: [],
      matches: [],
      // Voce storica, mai marcata con una stagione: e il caso comune di ogni
      // club che non ha ancora fatto un secondo rollover.
      weekly_schedule: [
        slot({
          id: "slot-senza-stagione",
          time: "19:00",
          endTime: "20:30",
          structureId: "STRUCT-UNICA",
          fieldId: "FIELD-UNICA",
        }),
      ],
      settings: {
        seasons: [
          {
            id: "s-unica",
            label: "2026/2027",
            startDate: "2026-07-01",
            endDate: "2027-06-30",
            status: "active",
            createdAt: "2026-06-01T00:00:00.000Z",
          },
        ],
        activeSeasonId: "s-unica",
      },
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

test("WP-13 · una voce di una stagione non attiva non genera nessun allenamento", async () => {
  fake = createFakePrisma(seedDueStagioni());
  setPrismaClientForTests(fake.client);

  const now = new Date("2026-09-14T08:00:00.000Z");
  const risultato = await automazione.runTrainingAutomationForClub(CLUB, {
    force: true,
    now,
  });

  assert.ok(risultato.generatedTrainings.length > 0, "la stagione attiva genera");
  assert.ok(
    risultato.generatedTrainings.every((t) => t.time !== "17:00"),
    "nessuna occorrenza della stagione archiviata",
  );
  assert.ok(
    risultato.generatedTrainings.every((t) => t.locationId !== "FIELD-OLD"),
    "il campo della stagione archiviata non compare",
  );
  assert.ok(
    risultato.generatedTrainings.every((t) => t.time === "18:30"),
    "solo la fascia della stagione attiva",
  );

  const righeCreate = fake.rows("clubEvent");
  assert.ok(righeCreate.length > 0);
  assert.ok(
    righeCreate.every((riga) => riga.field_id !== "FIELD-OLD"),
    "nessuna riga creata sul campo della stagione archiviata",
  );
  assert.ok(
    righeCreate.every((riga) => riga.season_id === "s-new"),
    "gli eventi generati portano la stagione attiva",
  );
});

test("WP-13 · un club a stagione singola non perde le voci senza seasonId", async () => {
  fake = createFakePrisma(seedStagioneSingola());
  setPrismaClientForTests(fake.client);

  const now = new Date("2026-09-14T08:00:00.000Z");
  const risultato = await automazione.runTrainingAutomationForClub(
    CLUB_SINGOLA_STAGIONE,
    { force: true, now },
  );

  assert.ok(
    risultato.generatedTrainings.length > 0,
    "una voce storica senza seasonId resta generabile su un club a stagione singola",
  );
  assert.ok(risultato.generatedTrainings.every((t) => t.time === "19:00"));

  const righeCreate = fake.rows("clubEvent");
  assert.ok(righeCreate.length > 0);
  assert.ok(
    righeCreate.every((riga) => riga.season_id === "s-unica"),
    "l'evento generato viene marcato con l'unica stagione del club",
  );
});
