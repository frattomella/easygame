import assert from "node:assert/strict";
import test, { before } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Bug A del lotto ADR-0197, riprodotto prima della correzione** (Fortitudo
 * Scauri sul redesign, 2026-09-17).
 *
 * Il club ha creato la stagione B (1 set 2026 → 31 ago 2027, **sovrapposta**
 * alla A: 1 lug 2026 → 30 giu 2027), l'ha attivata e ha salvato 40 voci nel
 * programma settimanale: in archivio sono tutte marcate B e tutte su
 * categorie del catalogo di B. «Genera allenamenti → una settimana»
 * rispondeva «Il programma settimanale non contiene sessioni valide da
 * generare».
 *
 * La causa: il pannello manda al server **il proprio stato** come
 * `weeklySchedule`, e `normalizeScheduleItem` non porta `seasonId`. Il server
 * filtra l'override per stagione con la regola dei record senza annata —
 * «appartengono alla stagione piu vecchia del club» — che con la sola
 * stagione A era innocua (A era anche l'attiva) e con B attiva scarta tutte
 * e 40 le voci: `missing_schedule`, un messaggio generico per un difetto
 * preciso.
 */

const CLUB = "aaaaaaaa-6c00-4000-8000-0000000001a7";
const DIREZIONE = "11111111-6c00-4000-8000-000000000bbb";
const A = "season-2026-2027";
const B = "season-2026-09-01-2027-08-31-ru1uu";

let automazione;
let setPrismaClientForTests;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  automazione = await import("../../src/lib/server/training-automation.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const GIORNI = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì"];

/** 40 voci come quelle del pilota: 8 al giorno dal lunedi al venerdi, 2 categorie di B. */
const quarantaVoci = (seasonId) =>
  Array.from({ length: 40 }, (_, i) => ({
    id: `voce-${i + 1}`,
    ...(seasonId ? { seasonId } : {}),
    day: GIORNI[i % 5],
    startTime: `${String(8 + Math.floor(i / 5)).padStart(2, "0")}:00`,
    endTime: `${String(9 + Math.floor(i / 5)).padStart(2, "0")}:00`,
    categoryId: i % 2 === 0 ? "cat-b-u15" : "cat-b-u17",
    categoryName: i % 2 === 0 ? "Under 15 Eccellenza" : "Under 17 Regionale",
    structureId: "structure-1",
    locationId: "field-1",
    trainerIds: ["trainer-1"],
    active: true,
  }));

const seedDueStagioniSovrapposte = () => ({
  user: [{ id: DIREZIONE, email: "direzione@club.it" }],
  club: [
    {
      id: CLUB,
      slug: "fortitudo-uat",
      name: "Fortitudo UAT",
      creator_id: DIREZIONE,
      categories: [
        { id: "cat-a-u15", name: "Under 15 Eccellenza", seasonId: A },
        { id: "cat-a-u17", name: "Under 17 Regionale", seasonId: A },
        { id: "cat-b-u15", name: "Under 15 Eccellenza", seasonId: B, rolloverSourceId: "cat-a-u15" },
        { id: "cat-b-u17", name: "Under 17 Regionale", seasonId: B, rolloverSourceId: "cat-a-u17" },
      ],
      trainers: [{ id: "trainer-1", name: "Coach Rossi", categories: ["cat-a-u15"] }],
      staff_members: [],
      structures: [{ id: "structure-1", name: "Palazzetto", fields: [{ id: "field-1", name: "Campo" }] }],
      trainings: [],
      matches: [],
      weekly_schedule: quarantaVoci(B),
      settings: {
        seasons: [
          { id: A, label: "2026/2027", startDate: "2026-07-01", endDate: "2027-06-30", status: "archived", createdAt: "2026-08-21T13:45:36.564Z" },
          { id: B, label: "2026/27", startDate: "2026-09-01", endDate: "2027-08-31", status: "active", createdAt: "2026-09-16T18:11:42.035Z" },
        ],
        activeSeasonId: B,
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

const NOW = new Date("2026-09-17T06:00:00.000Z");

test("riproduzione · 40 voci marcate B in archivio, generazione dal pannello (override senza seasonId) con B attiva", async () => {
  const fake = createFakePrisma(seedDueStagioniSovrapposte());
  setPrismaClientForTests(fake.client);

  const dalPannello = quarantaVoci(null); // cio che `normalizeScheduleItem` manda: niente `seasonId`
  const risultato = await automazione.runTrainingAutomationForClub(CLUB, {
    force: true,
    now: NOW,
    weeklyScheduleOverride: dalPannello,
    untilDate: "2026-09-24",
    preview: true,
  });

  assert.notEqual(
    risultato.reason,
    "missing_schedule",
    "le 40 voci del programma della stagione attiva sono da generare: il pannello non le ha inventate",
  );
  assert.ok(risultato.generatedTrainings.length > 0, "una settimana di occorrenze");
  assert.ok(
    risultato.generatedTrainings.every((t) => t.seasonId === B),
    "ogni allenamento generato appartiene alla stagione B",
  );
});

test("riproduzione · la stessa generazione senza override (cron) trova le 40 voci", async () => {
  const fake = createFakePrisma(seedDueStagioniSovrapposte());
  setPrismaClientForTests(fake.client);

  const risultato = await automazione.runTrainingAutomationForClub(CLUB, {
    force: true,
    now: NOW,
    untilDate: "2026-09-24",
    preview: true,
  });

  assert.notEqual(risultato.reason, "missing_schedule");
  assert.ok(risultato.generatedTrainings.length > 0);
  assert.ok(risultato.generatedTrainings.every((t) => t.seasonId === B));
});
