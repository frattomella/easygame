import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Il servizio degli eventi: permesso, confine, e tre scritture che non si
 * toccano** (ADR-0098, ADR-0099).
 *
 * Cio che una colonna JSON non poteva avere, e che qui va provato:
 *
 * - un **permesso per riga**, e non «chi puo scrivere il club puo scrivere
 *   ogni evento»;
 * - un **confine** verificato riga per riga con `assertActiveClub`;
 * - il **controllo ottimistico**: due segretarie che salvano insieme non si
 *   sovrascrivono;
 * - convocazione, risposta e presenza come **tre colonne della stessa riga**,
 *   con tre scrittori che non si scrivono mai a vicenda.
 */

const CLUB = "aaaaaaaa-9800-4000-8000-00000000000a";
const ALTRO_CLUB = "bbbbbbbb-9800-4000-8000-00000000000b";
const SEGRETERIA = "11111111-9800-4000-8000-000000000aaa";
const ALLENATORE = "22222222-9800-4000-8000-000000000bbb";

const EVENTO = "eeeeeeee-9800-4000-8000-000000000001";
const EVENTO_ALTRUI = "eeeeeeee-9800-4000-8000-000000000002";

const scope = (activeRole, userId = SEGRETERIA, organizationId = CLUB) => ({
  userId,
  activeOrganizationId: organizationId,
  activeRole,
  allowedOrganizationIds: [CLUB, ALTRO_CLUB],
});

let eventi;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  eventi = await import("../../src/lib/server/events.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const seed = () => ({
  user: [
    { id: SEGRETERIA, email: "segreteria@club.it" },
    { id: ALLENATORE, email: "mister@club.it" },
  ],
  club: [
    {
      id: CLUB,
      slug: "club",
      name: "Club",
      categories: [
        { id: "u15", name: "Under 15" },
        { id: "prima", name: "Prima squadra" },
      ],
      trainers: [
        {
          id: "t1",
          name: "Mister",
          email: "mister@club.it",
          linkedUserId: ALLENATORE,
          categories: ["u15"],
        },
      ],
      staff_members: [],
      trainings: [],
      matches: [],
    },
    { id: ALTRO_CLUB, slug: "altro", name: "Altro club", trainings: [], matches: [] },
  ],
  clubEvent: [
    {
      id: EVENTO,
      organization_id: CLUB,
      kind: "training",
      legacy_id: "training-1",
      title: "Allenamento Under 15",
      status: "scheduled",
      category_id: "u15",
      category_name: "Under 15",
      structure_id: "palestra",
      starts_at: new Date("2026-09-05T17:30:00.000Z"),
      ends_at: new Date("2026-09-05T19:00:00.000Z"),
      capacity: 3,
      version: 1,
      payload: { id: "training-1" },
    },
    {
      id: EVENTO_ALTRUI,
      organization_id: ALTRO_CLUB,
      kind: "training",
      legacy_id: "training-altrui",
      title: "Allenamento di un altro club",
      status: "scheduled",
      starts_at: new Date("2026-09-05T17:30:00.000Z"),
      version: 1,
      payload: { id: "training-altrui" },
    },
    {
      id: "eeeeeeee-9800-4000-8000-000000000003",
      organization_id: CLUB,
      kind: "match",
      legacy_id: "match-1",
      title: "Gara Prima squadra",
      status: "scheduled",
      category_id: "prima",
      category_name: "Prima squadra",
      starts_at: new Date("2026-09-13T15:00:00.000Z"),
      version: 1,
      payload: { id: "match-1" },
    },
  ],
  clubEventParticipant: [],
  auditLog: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const negato = /Accesso negato/;

/* ================================================== il permesso ========== */

test("un genitore non legge e non scrive gli eventi del club", async () => {
  await assert.rejects(
    () => eventi.listClubEvents(scope("parent")),
    negato,
    "l'accesso della famiglia a un evento nasce dal legame, non dal ruolo",
  );
  await assert.rejects(
    () => eventi.createClubEvent(scope("parent"), "training", {}),
    negato,
  );
});

test("senza un club attivo non si legge niente", async () => {
  await assert.rejects(
    () =>
      eventi.listClubEvents({
        userId: SEGRETERIA,
        activeOrganizationId: null,
        activeRole: "owner",
        allowedOrganizationIds: [CLUB],
      }),
    negato,
  );
});

/* =================================================== il confine ========== */

test("un evento di un altro club non si modifica", async () => {
  await assert.rejects(
    () =>
      eventi.updateClubEvent(scope("owner"), EVENTO_ALTRUI, {
        date: "2026-09-05",
        time: "17:30",
        title: "Violato",
      }),
    /Accesso negato|non trovato/,
  );
});

test("la lista porta solo gli eventi del club attivo", async () => {
  const righe = await eventi.listClubEvents(scope("owner"));
  assert.ok(righe.length > 0);
  for (const riga of righe) {
    assert.equal(riga.organization_id, CLUB);
  }
});

/* ============================== il perimetro dell'allenatore ============= */

test("l'allenatore vede gli eventi delle proprie categorie", async () => {
  const righe = await eventi.listClubEvents(scope("trainer", ALLENATORE));
  assert.deepEqual(
    righe.map((riga) => riga.legacy_id).sort(),
    ["training-1"],
    "la gara della prima squadra non e la sua",
  );
});

/* ====================================== il controllo ottimistico ========= */

test("due modifiche sulla stessa versione: la seconda fallisce, non vince", async () => {
  await eventi.updateClubEvent(
    scope("owner"),
    EVENTO,
    { date: "2026-09-05", time: "18:00", title: "Spostato dalla prima" },
    {},
    { expectedVersion: 1 },
  );

  await assert.rejects(
    () =>
      eventi.updateClubEvent(
        scope("owner"),
        EVENTO,
        { date: "2026-09-05", time: "19:00", title: "Spostato dalla seconda" },
        {},
        { expectedVersion: 1 },
      ),
    /modificato da qualcun altro/,
  );

  const riga = fake.rows("clubEvent").find((row) => row.id === EVENTO);
  assert.equal(riga.title, "Spostato dalla prima");
});

/* ================================= la proiezione, in un verso solo ======= */

test("una modifica riallinea la colonna storica del club", async () => {
  await eventi.updateClubEvent(scope("owner"), EVENTO, {
    date: "2026-09-05",
    time: "18:00",
    title: "Nuovo titolo",
  });

  const club = fake.rows("club").find((row) => row.id === CLUB);
  const proiettati = Array.isArray(club.trainings) ? club.trainings : [];
  const proiettato = proiettati.find((item) => item.id === "training-1");

  assert.ok(proiettato, "la forma storica resta leggibile per chi non e passato");
  assert.equal(proiettato.title, "Nuovo titolo");
  assert.equal(proiettato.time, "18:00");
  assert.equal(
    proiettato.eventId,
    EVENTO,
    "e porta con se la riga, cosi chi vuole passare puo farlo",
  );
});

/* ============================ tre colonne, tre scrittori distinti ======== */

test("la convocazione non tocca la presenza gia registrata", async () => {
  await eventi.saveEventAttendance(scope("owner"), EVENTO, [
    { athleteId: "atleta-1", status: "present", notes: "puntuale" },
  ]);

  await eventi.saveEventConvocations(scope("owner"), EVENTO, [
    { athleteId: "atleta-1", status: "convocated" },
  ]);

  const riga = fake
    .rows("clubEventParticipant")
    .find((row) => row.athlete_id === "atleta-1");

  assert.equal(riga.status, "present", "una convocazione non e un appello");
  assert.equal(riga.notes, "puntuale");
  assert.equal(riga.convocation_status, "convocated");
});

test("l'appello non tocca la convocazione ne la risposta della famiglia", async () => {
  await eventi.saveEventConvocations(scope("owner"), EVENTO, [
    { athleteId: "atleta-1", status: "convocated" },
  ]);

  fake.rows("clubEventParticipant")[0].rsvp_status = "yes";
  fake.rows("clubEventParticipant")[0].rsvp_note = "ci sono";

  await eventi.saveEventAttendance(scope("owner"), EVENTO, [
    { athleteId: "atleta-1", status: "absent" },
  ]);

  const riga = fake.rows("clubEventParticipant")[0];
  assert.equal(riga.status, "absent");
  assert.equal(
    riga.convocation_status,
    "convocated",
    "una promessa non diventa mai una presenza, e viceversa",
  );
  assert.equal(riga.rsvp_status, "yes");
  assert.equal(riga.rsvp_note, "ci sono");
});

test("chi esce dall'elenco torna indeciso, non escluso", async () => {
  await eventi.saveEventConvocations(scope("owner"), EVENTO, [
    { athleteId: "atleta-1" },
    { athleteId: "atleta-2" },
  ]);

  await eventi.saveEventConvocations(scope("owner"), EVENTO, [
    { athleteId: "atleta-1" },
  ]);

  const due = fake
    .rows("clubEventParticipant")
    .find((row) => row.athlete_id === "atleta-2");

  assert.equal(
    due.convocation_status,
    null,
    "togliere un nome da una lista non e dire a un ragazzo che non gioca",
  );
});

test("la capienza dell'evento e un limite vero", async () => {
  await assert.rejects(
    () =>
      eventi.saveEventConvocations(scope("owner"), EVENTO, [
        { athleteId: "a1" },
        { athleteId: "a2" },
        { athleteId: "a3" },
        { athleteId: "a4" },
      ]),
    /Capienza superata/,
  );
});

/* ================================== cancellare, solo senza storia ======== */

test("un evento con una storia si annulla, non si cancella", async () => {
  await eventi.saveEventAttendance(scope("owner"), EVENTO, [
    { athleteId: "atleta-1", status: "present" },
  ]);

  await assert.rejects(
    () => eventi.deleteClubEvent(scope("owner"), EVENTO),
    /si annulla, non si cancella/,
  );

  await eventi.updateClubEvent(scope("owner"), EVENTO, {
    date: "2026-09-05",
    time: "17:30",
    status: "cancelled",
  });

  const riga = fake.rows("clubEvent").find((row) => row.id === EVENTO);
  assert.equal(riga.status, "cancelled");
});

test("un evento senza storia si cancella davvero", async () => {
  await eventi.deleteClubEvent(scope("owner"), EVENTO);
  assert.equal(
    fake.rows("clubEvent").some((row) => row.id === EVENTO),
    false,
  );
});

/* ==================================== il campo occupato alla stessa ora == */

test("due eventi sullo stesso campo alla stessa ora: il secondo e respinto", async () => {
  await assert.rejects(
    () =>
      eventi.createClubEvent(scope("owner"), "training", {
        id: "training-2",
        date: "2026-09-05",
        time: "18:00",
        endTime: "19:30",
        structureId: "palestra",
        title: "Sovrapposto",
      }),
    /campo e gia occupato/,
  );
});

test("lo stesso orario su un campo diverso passa", async () => {
  const riga = await eventi.createClubEvent(scope("owner"), "training", {
    id: "training-3",
    date: "2026-09-05",
    time: "18:00",
    endTime: "19:30",
    structureId: "campo-esterno",
    title: "Altro campo",
  });

  assert.equal(riga.legacy_id, "training-3");
});
