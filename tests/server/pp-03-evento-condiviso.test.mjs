import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Leggere e cambiare non sono la stessa domanda** (PP-03 §7).
 *
 * ADR-0111 ammette un evento se **almeno una** delle sue categorie sta nel
 * perimetro di chi guarda: e la regola che rende possibile l'allenamento
 * **congiunto**, e su un calendario e giusta.
 *
 * Era pero anche la guardia della **scrittura**, e da li una revisione ostile
 * ha ricavato un attacco che questo file presidia: l'allenatore della sola B,
 * sull'evento congiunto A+B, ne riscriveva le categorie a `["B"]` con un 200.
 * Dopo quel PATCH l'allenatore di A — che su quell'evento aveva gia fatto
 * l'appello — riceveva 403 su `GET /events/:id` e non lo trovava piu in nessun
 * elenco. L'allenamento restava in archivio con le presenze, cioe il dato su
 * cui si rendicontano i contributi pubblici, e il suo allenatore non ci
 * arrivava piu da nessuna porta.
 *
 * Lo stesso valeva per `DELETE`, per l'annullamento, e nella direzione
 * opposta: si poteva **aggiungere** all'evento una categoria di cui non si e
 * allenatori, purche fra le altre ce ne fosse una propria.
 *
 * Un evento condiviso lo cambia chi lo vede **per intero**.
 */

const CLUB = "aaaaaaaa-c100-4000-8000-00000000000a";
const MISTER_A = "11111111-c100-4000-8000-00000000000a";
const MISTER_B = "11111111-c100-4000-8000-00000000000b";

const CAT_A = "cat-a";
const CAT_B = "cat-b";
const CAT_C = "cat-c";

const EVENTO_AB = "eeeeeeee-c100-4000-8000-000000000001";
const EVENTO_B = "eeeeeeee-c100-4000-8000-000000000002";
const EVENTO_ANNULLATO = "eeeeeeee-c100-4000-8000-000000000003";
const EVENTO_ARCHIVIATO = "eeeeeeee-c100-4000-8000-000000000004";

const ATLETA_B = "bbbbbbbb-c100-4000-8000-00000000000b";

let eventi;
let setPrismaClientForTests;
let fake;

const scope = (userId) => ({
  userId,
  activeOrganizationId: CLUB,
  activeRole: "trainer",
  allowedOrganizationIds: [CLUB],
  accessScopes: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  eventi = await import("../../src/lib/server/events.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const evento = (id, categorie, status = "scheduled") => ({
  id,
  organization_id: CLUB,
  kind: "training",
  legacy_id: id,
  title: `Evento ${id}`,
  status,
  category_id: categorie[0] ?? null,
  category_name: null,
  category_ids: categorie,
  starts_at: new Date("2026-09-10T18:00:00.000Z"),
  ends_at: new Date("2026-09-10T19:30:00.000Z"),
  version: 1,
  payload: { id },
});

const seed = () => ({
  user: [
    { id: MISTER_A, email: "a@club.it" },
    { id: MISTER_B, email: "b@club.it" },
  ],
  club: [
    {
      id: CLUB,
      slug: "club",
      name: "Club",
      categories: [
        { id: CAT_A, name: "Under 12" },
        { id: CAT_B, name: "Under 15" },
        { id: CAT_C, name: "Prima squadra" },
      ],
      trainers: [
        {
          id: "trainer-a",
          email: "a@club.it",
          linkedUserId: MISTER_A,
          categories: [CAT_A],
        },
        {
          id: "trainer-b",
          email: "b@club.it",
          linkedUserId: MISTER_B,
          categories: [CAT_B],
        },
      ],
      staff_members: [],
      trainings: [],
      matches: [],
    },
  ],
  clubEvent: [
    evento(EVENTO_AB, [CAT_A, CAT_B]),
    evento(EVENTO_B, [CAT_B]),
    evento(EVENTO_ANNULLATO, [CAT_B], "cancelled"),
    evento(EVENTO_ARCHIVIATO, [CAT_B], "archived"),
  ],
  athlete: [
    {
      id: ATLETA_B,
      organization_id: CLUB,
      first_name: "Bruno",
      last_name: "B",
      status: "active",
      category_id: CAT_B,
      data: {},
    },
  ],
  clubEventParticipant: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

/* ------------------------------------------------- l'evento condiviso --- */

test("PP-03 · l'allenatore di B non riscrive le categorie dell'evento congiunto", async () => {
  await assert.rejects(
    () =>
      eventi.updateClubEvent(scope(MISTER_B), EVENTO_AB, {
        categoryId: CAT_B,
        categories: [CAT_B],
      }),
    /Accesso negato/,
  );

  const riga = fake.rows("clubEvent").find((r) => r.id === EVENTO_AB);
  assert.deepEqual(
    riga.category_ids,
    [CAT_A, CAT_B],
    "l'evento e stato tolto all'allenatore di A",
  );
});

test("PP-03 · e non gli aggiunge una categoria che non e sua", async () => {
  await assert.rejects(
    () =>
      eventi.updateClubEvent(scope(MISTER_B), EVENTO_B, {
        categories: [CAT_B, CAT_C],
      }),
    /Accesso negato/,
  );
});

test("PP-03 · non crea un evento che nomina anche una categoria altrui", async () => {
  await assert.rejects(
    () =>
      eventi.createClubEvent(scope(MISTER_B), "training", {
        id: "nuovo-1",
        title: "Per la Prima squadra",
        date: "2026-09-20",
        time: "18:00",
        endTime: "19:30",
        categoryId: CAT_B,
        categories: [CAT_B, CAT_C],
      }),
    /Accesso negato/,
  );
});

test("PP-03 · e non cancella ne annulla l'evento congiunto", async () => {
  await assert.rejects(
    () => eventi.deleteClubEvent(scope(MISTER_B), EVENTO_AB),
    /Accesso negato/,
  );
  assert.ok(fake.rows("clubEvent").find((r) => r.id === EVENTO_AB));

  await assert.rejects(
    () =>
      eventi.updateClubEvent(scope(MISTER_B), EVENTO_AB, {
        status: "cancelled",
      }),
    /Accesso negato/,
  );
  assert.equal(
    fake.rows("clubEvent").find((r) => r.id === EVENTO_AB).status,
    "scheduled",
  );
});

test("PP-03 · sul proprio evento, invece, puo tutto quello che poteva", async () => {
  /*
    Il verso opposto conta quanto il primo: la stretta e sull'evento
    **condiviso**, e su un evento di una sola categoria `every` e `some` danno
    la stessa risposta. Se questo test diventasse rosso, la correzione avrebbe
    tolto all'allenatore il proprio mestiere.
  */
  await eventi.updateClubEvent(scope(MISTER_B), EVENTO_B, {
    title: "Rinviato in palestra",
  });
  assert.equal(
    fake.rows("clubEvent").find((r) => r.id === EVENTO_B).title,
    "Rinviato in palestra",
  );

  await eventi.deleteClubEvent(scope(MISTER_B), EVENTO_B);
  assert.equal(
    fake.rows("clubEvent").some((r) => r.id === EVENTO_B),
    false,
  );
});

test("PP-03 · e l'evento congiunto resta leggibile a entrambi", async () => {
  const perB = await eventi.listClubEvents(scope(MISTER_B), {
    kind: "training",
  });
  assert.equal(
    perB.some((riga) => riga.id === EVENTO_AB),
    true,
    "stringere la scrittura ha stretto anche la lettura: ADR-0111 e saltato",
  );

  const perA = await eventi.listClubEvents(scope(MISTER_A), {
    kind: "training",
  });
  assert.equal(
    perA.some((riga) => riga.id === EVENTO_AB),
    true,
  );
});

/* --------------------------------------- l'evento annullato o archiviato */

test("PP-03 · un evento annullato non riceve piu appelli ne convocazioni", async () => {
  await assert.rejects(
    () =>
      eventi.saveEventAttendance(scope(MISTER_B), EVENTO_ANNULLATO, [
        { athleteId: ATLETA_B, status: "present" },
      ]),
    /annullato/i,
  );

  await assert.rejects(
    () =>
      eventi.saveEventConvocations(scope(MISTER_B), EVENTO_ANNULLATO, [
        { athleteId: ATLETA_B },
      ]),
    /annullato/i,
  );

  assert.equal(fake.rows("clubEventParticipant").length, 0);
});

test("PP-03 · e nemmeno uno archiviato", async () => {
  await assert.rejects(
    () =>
      eventi.saveEventAttendance(scope(MISTER_B), EVENTO_ARCHIVIATO, [
        { athleteId: ATLETA_B, status: "present" },
      ]),
    /archiviato/i,
  );
});

/* ---------------------------- il vocabolario dello stato di presenza --- */

test("PP-03 · lo stato di presenza ha un vocabolario, come la convocazione", async () => {
  await assert.rejects(
    () =>
      eventi.saveEventAttendance(scope(MISTER_B), EVENTO_B, [
        { athleteId: ATLETA_B, status: "PRESENTE-SEMPRE-<script>" },
      ]),
    /Stato di presenza non ammesso/,
  );

  /* Le grafie che il prodotto ha davvero scritto si riconoscono. */
  await eventi.saveEventAttendance(scope(MISTER_B), EVENTO_B, [
    { athleteId: ATLETA_B, status: "Presente" },
  ]);

  const riga = fake.rows("clubEventParticipant")[0];
  assert.equal(
    riga.attendance_status ?? riga.status,
    "present",
    "un appello in italiano si salvava e non contava per i contributi pubblici",
  );
});
