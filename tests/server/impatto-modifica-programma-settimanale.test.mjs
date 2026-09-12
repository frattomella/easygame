import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **"La modifica interessa X allenamenti futuri gia generati"** (WP-08).
 *
 * `findWeeklyScheduleSlotChanges` e una funzione pura (nessun database):
 * dice quali voci del programma settimanale sono cambiate o sparite.
 * `previewWeeklyScheduleImpact`/`applyWeeklyScheduleSlotChanges` usano
 * quell'elenco per contare, e poi eventualmente toccare, gli eventi futuri
 * che la definizione **precedente** dello slot ha generato — mai quelli con
 * una storia (partecipazioni) o gia modificati a mano, mai una voce rimossa.
 */

const CLUB = "aaaaaaaa-6c00-4000-8000-00000000000f";
const DIREZIONE = "11111111-6c00-4000-8000-000000000eee";

let automazione;
let setPrismaClientForTests;
let fake;

const NOW = new Date("2026-09-14T08:00:00.000Z");
let slotBase;
let buildLegacyId;
/*
  **L'istante si costruisce come lo costruisce il canonical writer**
  (`toEventInstant`, `src/lib/events/model.ts`): data e ora dichiarate come
  se fossero UTC (`setUTCHours`), non l'ora locale di chi esegue la sonda —
  e la ragione per cui il campo si chiama `starts_at` e la colonna `timezone`
  vive a fianco, non dentro. Il giorno del calendario (per il nome del
  weekday e per l'identificativo storico) resta invece quello che
  `formatLocalDateKey`/`getDateOnly` userebbero: le due cose non sono la
  stessa domanda, e mischiarle e esattamente il modo in cui questa sonda ha
  preso due ore di differenza al primo giro.
*/
const alleDiciotto = (dataIso) => new Date(`${dataIso}T18:00:00.000Z`);
let primaOccorrenza;
let secondaOccorrenza;
let terzaOccorrenza;
let quartaOccorrenza;
let primaDataIso;
let secondaDataIso;
let terzaDataIso;
let quartaDataIso;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  automazione = await import("../../src/lib/server/training-automation.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));

  /*
    `resolveTrainingWeekday`/`formatLocalDateKey`: le stesse primitive di
    calendario della produzione, non un calendario a memoria.
  */
  const { resolveTrainingWeekday, formatLocalDateKey } = await import(
    "../../src/lib/training-utils.ts"
  );

  slotBase = {
    id: "slot-lunedi",
    day: resolveTrainingWeekday({ date: NOW }),
    startTime: "18:00",
    endTime: "19:30",
    categoryId: "u15",
    structureId: "STRUCT1",
    locationId: "FIELD1",
    trainerIds: ["trainer-1"],
  };

  buildLegacyId = (trainingDate) =>
    `auto:${[trainingDate, "18:00", "FIELD1", "u15"]
      .map((v) => String(v).trim().toLowerCase())
      .join("|")}`;

  // Il primo giorno utile che cade sullo stesso weekday di NOW, e i tre dopo
  // (calendario locale: e questo che il ciclo della generazione confronta).
  const primaData = new Date(
    NOW.getFullYear(),
    NOW.getMonth(),
    NOW.getDate() + 7,
  );
  const secondaData = new Date(
    primaData.getFullYear(),
    primaData.getMonth(),
    primaData.getDate() + 7,
  );
  const terzaData = new Date(
    secondaData.getFullYear(),
    secondaData.getMonth(),
    secondaData.getDate() + 7,
  );
  const quartaData = new Date(
    terzaData.getFullYear(),
    terzaData.getMonth(),
    terzaData.getDate() + 7,
  );

  primaDataIso = formatLocalDateKey(primaData);
  secondaDataIso = formatLocalDateKey(secondaData);
  terzaDataIso = formatLocalDateKey(terzaData);
  quartaDataIso = formatLocalDateKey(quartaData);
  primaOccorrenza = alleDiciotto(primaDataIso);
  secondaOccorrenza = alleDiciotto(secondaDataIso);
  terzaOccorrenza = alleDiciotto(terzaDataIso);
  quartaOccorrenza = alleDiciotto(quartaDataIso);
});

const rigaGenerata = (id, { starts, dataIso, cancelled, manuallyModified }) => ({
  id,
  organization_id: CLUB,
  kind: "training",
  legacy_id: buildLegacyId(dataIso),
  title: "Allenamento",
  status: cancelled ? "cancelled" : "scheduled",
  category_id: "u15",
  category_name: "Under 15",
  category_ids: ["u15"],
  structure_id: "STRUCT1",
  field_id: "FIELD1",
  site_id: null,
  group_ids: [],
  rsvp_required: false,
  starts_at: starts,
  ends_at: new Date(starts.getTime() + 90 * 60 * 1000),
  version: 1,
  payload: { generated: true, ...(manuallyModified ? { manuallyModified: true } : {}) },
});

const SICURO_ID = "cccccccc-6c00-4000-8000-000000000020";
const MODIFICATO_ID = "cccccccc-6c00-4000-8000-000000000021";
const ANNULLATO_ID = "cccccccc-6c00-4000-8000-000000000022";
const CON_APPELLO_ID = "cccccccc-6c00-4000-8000-000000000023";
const ATLETA_ID = "dddddddd-6c00-4000-8000-000000000001";

const scope = () => ({
  userId: DIREZIONE,
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
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
  clubEvent: [
    rigaGenerata(SICURO_ID, { starts: primaOccorrenza, dataIso: primaDataIso }),
    rigaGenerata(MODIFICATO_ID, {
      starts: secondaOccorrenza,
      dataIso: secondaDataIso,
      manuallyModified: true,
    }),
    rigaGenerata(ANNULLATO_ID, {
      starts: terzaOccorrenza,
      dataIso: terzaDataIso,
      cancelled: true,
    }),
    rigaGenerata(CON_APPELLO_ID, { starts: quartaOccorrenza, dataIso: quartaDataIso }),
  ],
  clubEventParticipant: [
    {
      id: "part-1",
      organization_id: CLUB,
      event_id: CON_APPELLO_ID,
      athlete_id: ATLETA_ID,
      status: "present",
    },
  ],
  auditLog: [],
  notification: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

test("findWeeklyScheduleSlotChanges (pura) · rileva modifiche e rimozioni per id, ignora le voci nuove", () => {
  const previous = [slotBase, { ...slotBase, id: "slot-altro", startTime: "10:00" }];
  const next = [
    { ...slotBase, startTime: "19:00" }, // modificato
    // "slot-altro" rimosso
    { ...slotBase, id: "slot-nuovo", startTime: "20:00" }, // nuovo, non un cambiamento
  ];

  const cambi = automazione.findWeeklyScheduleSlotChanges(previous, next);

  assert.equal(cambi.length, 2);
  assert.ok(cambi.some((c) => c.slotId === "slot-lunedi" && c.changeType === "modified"));
  assert.ok(cambi.some((c) => c.slotId === "slot-altro" && c.changeType === "removed"));
});

test("findWeeklyScheduleSlotChanges (pura) · nessun cambio quando la fascia resta identica", () => {
  const cambi = automazione.findWeeklyScheduleSlotChanges([slotBase], [{ ...slotBase }]);
  assert.deepEqual(cambi, []);
});

test("WP-08 · l'anteprima conta creati/attivi/modificati a mano/sicuri correttamente", async () => {
  const nextSchedule = [{ ...slotBase, startTime: "19:00" }];
  const [impatto] = await automazione.previewWeeklyScheduleImpact(CLUB, {
    previousSchedule: [slotBase],
    nextSchedule,
    now: NOW,
  });

  assert.equal(impatto.changeType, "modified");
  assert.equal(impatto.matchedCount, 4, "quattro righe generate dalla vecchia definizione");
  assert.equal(impatto.activeCount, 3, "l'annullato non e attivo");
  assert.equal(impatto.manuallyModifiedCount, 1);
  assert.equal(
    impatto.safeCount,
    1,
    "solo SICURO_ID: non modificato a mano, non annullato, senza appello",
  );
});

test("WP-08 · una voce rimossa non offre mai un aggiornamento di massa", async () => {
  const [impatto] = await automazione.previewWeeklyScheduleImpact(CLUB, {
    previousSchedule: [slotBase],
    nextSchedule: [],
    now: NOW,
  });

  assert.equal(impatto.changeType, "removed");
  assert.equal(impatto.safeCount, 0);
});

test("WP-08 · l'esecuzione tocca solo la riga sicura, con lo stesso conteggio dell'anteprima", async () => {
  const nextSchedule = [{ ...slotBase, startTime: "19:00" }];

  const [anteprima] = await automazione.previewWeeklyScheduleImpact(CLUB, {
    previousSchedule: [slotBase],
    nextSchedule,
    now: NOW,
  });

  const [esito] = await automazione.applyWeeklyScheduleSlotChanges(
    scope(),
    CLUB,
    { userId: DIREZIONE, email: "direzione@club.it" },
    { previousSchedule: [slotBase], nextSchedule, now: NOW },
  );

  assert.equal(esito.updatedCount, anteprima.safeCount);
  assert.equal(esito.updatedCount, 1);
  assert.equal(esito.skippedCount, 0);

  const localTime = (date) =>
    `${String(new Date(date).getUTCHours()).padStart(2, "0")}:${String(
      new Date(date).getUTCMinutes(),
    ).padStart(2, "0")}`;

  const righe = fake.rows("clubEvent");
  const sicuro = righe.find((r) => r.id === SICURO_ID);
  assert.equal(
    localTime(sicuro.starts_at),
    "19:00",
    "l'evento sicuro ha preso il nuovo orario",
  );

  const modificato = righe.find((r) => r.id === MODIFICATO_ID);
  assert.equal(
    localTime(modificato.starts_at),
    "18:00",
    "l'evento gia modificato a mano non e stato toccato",
  );

  const conAppello = righe.find((r) => r.id === CON_APPELLO_ID);
  assert.equal(
    localTime(conAppello.starts_at),
    "18:00",
    "l'evento con presenze non e stato toccato",
  );
});

test("WP-14 · l'esecuzione non tocca niente per una voce rimossa", async () => {
  const localTime = (date) =>
    `${String(new Date(date).getUTCHours()).padStart(2, "0")}:${String(
      new Date(date).getUTCMinutes(),
    ).padStart(2, "0")}`;

  const risultati = await automazione.applyWeeklyScheduleSlotChanges(
    scope(),
    CLUB,
    { userId: DIREZIONE, email: "direzione@club.it" },
    { previousSchedule: [slotBase], nextSchedule: [], now: NOW },
  );

  assert.deepEqual(risultati, []);
  const sicuro = fake.rows("clubEvent").find((r) => r.id === SICURO_ID);
  assert.equal(
    localTime(sicuro.starts_at),
    "18:00",
    "rimuovere una voce non cancella ne modifica gli eventi gia generati",
  );
});
