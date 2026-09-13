import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **La causa reale dietro "il campo «Palazzetto» non e disponibile in quel
 * giorno e a quell'ora"** (issue UAT, verificata sui dati dello staging del
 * club pilota Fortitudo Scauri — vedi ADR-0180 e ADR-... nel decision log).
 *
 * `club_events` non ha un fuso orario: `toEventInstant`
 * (`src/lib/events/model.ts`) scrive `starts_at`/`ends_at` con
 * `setUTCHours` — le cifre digitate diventano letteralmente le cifre UTC in
 * colonna, senza nessuna conversione — e `toEventDay`/`toEventTime` le
 * rileggono allo stesso modo per mostrarle. E la convenzione dell'**intero**
 * dominio degli eventi.
 *
 * `assertFieldIsOpenConStrutture` (`src/lib/server/events.ts`) confrontava
 * pero quelle stesse cifre convertendole nel fuso reale `Europe/Rome`
 * (il comportamento di default di `isWithinFieldAvailability`, corretto per
 * l'**altro** chiamante della stessa funzione — la prenotazione struttura
 * dall'area famiglia, che costruisce un vero UTC con `instantFromLocalTime`
 * apposta perche il dispositivo della famiglia puo stare in un fuso
 * diverso). Un allenamento digitato 19:30-21:30 — dentro l'orario 13:00-
 * 23:00 del campo, per chi l'ha scritto — diventava, riletto in
 * `Europe/Rome` a settembre (UTC+2), le 21:30-23:30: fuori da quella
 * stessa fascia, un rifiuto che nominava un campo aperto senza che lo
 * fosse davvero secondo l'unica convenzione che conta per un evento del
 * club.
 *
 * Questo file riproduce esattamente la fascia trovata sullo staging
 * (Martedi, Palazzetto, 19:30-21:30, disponibilita 13:00-23:00 tutti i
 * giorni feriali) e prova che ora viene creata.
 */

const CLUB = "aaaaaaaa-6c00-4000-8000-00000000ca01";
const DIREZIONE = "11111111-6c00-4000-8000-00000000ca01";

let eventi;
let setPrismaClientForTests;
let fake;

const scope = () => ({
  userId: DIREZIONE,
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
});

/*
  Le stesse ore del campo "Palazzetto" della struttura "PalaBorrelli" sullo
  staging: aperto dalle 13:00 alle 23:00 nei giorni feriali (Lun-Ven), non
  configurato Sab/Dom in questa prova (irrilevante: la fascia da provare e
  di martedi).
*/
const PALAZZETTO = {
  id: "FIELD-PALAZZETTO",
  name: "Palazzetto",
  availability: {
    Lun: [{ start: "13:00", end: "23:00" }],
    Mar: [{ start: "13:00", end: "23:00" }],
    Mer: [{ start: "13:00", end: "23:00" }],
    Gio: [{ start: "13:00", end: "23:00" }],
    Ven: [{ start: "13:00", end: "23:00" }],
  },
};

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
      structures: [
        { id: "STRUCT-PALABORRELLI", name: "PalaBorrelli", fields: [PALAZZETTO] },
      ],
      trainings: [],
      matches: [],
    },
  ],
  athlete: [],
  athleteCategoryMembership: [],
  clubEvent: [],
  clubEventParticipant: [],
  auditLog: [],
  notification: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  eventi = await import("../../src/lib/server/events.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

test('Martedi 19:30-21:30 sul Palazzetto (aperto 13:00-23:00) si crea: le cifre digitate sono l\'ora del campo, non un istante da riconvertire in Europe/Rome', async () => {
  const { righe, esclusi, esclusiDettaglio } = await eventi.createClubEventsBatch(
    scope(),
    "training",
    [
      {
        id: "batch-palazzetto-1930-2130",
        // 2026-09-15 e un martedi.
        date: "2026-09-15",
        time: "19:30",
        endTime: "21:30",
        title: "Allenamento Under 15",
        categoryId: "u15",
        structureId: "STRUCT-PALABORRELLI",
        fieldId: "FIELD-PALAZZETTO",
      },
    ],
    {},
    { campoChiuso: "salta" },
  );

  assert.equal(
    esclusi,
    0,
    `la fascia non doveva essere esclusa (motivo: ${esclusiDettaglio[0]?.reason || "nessuno"})`,
  );
  assert.equal(righe.length, 1);
  assert.equal(righe[0]?.starts_at?.toISOString(), "2026-09-15T19:30:00.000Z");
  assert.equal(righe[0]?.ends_at?.toISOString(), "2026-09-15T21:30:00.000Z");
});

test("una fascia davvero fuori orario (Martedi 23:30-00:30, oltre la chiusura delle 23:00) resta esclusa", async () => {
  const { righe, esclusi, esclusiDettaglio } = await eventi.createClubEventsBatch(
    scope(),
    "training",
    [
      {
        id: "batch-palazzetto-2330",
        date: "2026-09-15",
        time: "23:30",
        endTime: "23:59",
        title: "Allenamento fuori orario",
        categoryId: "u15",
        structureId: "STRUCT-PALABORRELLI",
        fieldId: "FIELD-PALAZZETTO",
      },
    ],
    {},
    { campoChiuso: "salta" },
  );

  assert.equal(righe.length, 0);
  assert.equal(esclusi, 1);
  assert.equal(esclusiDettaglio[0]?.reasonCode, "OUTSIDE_OPENING_HOURS");
});
