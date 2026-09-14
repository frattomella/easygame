import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **"Giovedi 17 alle 19:00 il campo non e disponibile"** (bug UAT, caso
 * reale riprodotto su staging: Palazzetto e aperto Gio 08:00-23:00, la gara
 * veniva rifiutata comunque).
 *
 * **Non era un bug di disponibilita.** L'utente scriveva un solo orario
 * ("19:00", nessun trattino): senza una fine esplicita `toEventColumns`
 * indovina una sessione a cavallo della notte (`resolveEndsAt`), e quella
 * sessione indovinata finiva DOPO la chiusura reale del campo —
 * `assertFieldIsOpen` rifiutava prima ancora che il controllo di
 * sovrapposizione (`assertNoOverlap`) venisse mai chiamato. Con un
 * intervallo esplicito lo stesso campo/giorno trovava invece il conflitto
 * VERO: un allenamento gia segnato sullo stesso campo alla stessa ora.
 *
 * Questi test coprono due cose distinte, entrambe richieste dal ticket:
 *
 * 1. che i due rifiuti — fuori orario, e sovrapposizione — restino
 *    distinguibili e portino la causa reale (`EventAvailabilityError`,
 *    `src/lib/events/model.ts`), non un solo messaggio generico;
 * 2. che il messaggio di sovrapposizione nomini l'evento in conflitto
 *    (allenamento/gara, categoria, orario) invece di un generico "il campo
 *    non e disponibile" — la UX che la segnalazione chiedeva.
 *
 * Il default lato form (+90 minuti su un solo orario di inizio) e provato
 * a parte in `tests/lib/match-time-suggestion.test.mjs`: qui si prova che
 * l'intervallo cosi prodotto ("19:00 - 20:30") viene davvero accettato e
 * persistito, che e il punto in cui il caso reale si chiude.
 */

const CLUB = "aaaaaaaa-9800-4000-8000-00000000000c";
const OWNER = "11111111-9800-4000-8000-000000000ccc";

let eventi;
let setPrismaClientForTests;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  eventi = await import("../../src/lib/server/events.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const scope = {
  userId: OWNER,
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
};

const attore = { userId: OWNER, email: "owner@club.it" };

/** Palazzetto: aperto giovedi 08:00-23:00, come il campo reale del ticket. */
const ORARIO_PALAZZETTO_GIOVEDI = { start: "08:00", end: "23:00" };
const AVAILABILITY_PALAZZETTO = {
  Lun: [ORARIO_PALAZZETTO_GIOVEDI],
  Mar: [ORARIO_PALAZZETTO_GIOVEDI],
  Mer: [ORARIO_PALAZZETTO_GIOVEDI],
  Gio: [ORARIO_PALAZZETTO_GIOVEDI],
  Ven: [ORARIO_PALAZZETTO_GIOVEDI],
  Sab: [ORARIO_PALAZZETTO_GIOVEDI],
  Dom: [ORARIO_PALAZZETTO_GIOVEDI],
};

let fake;

const seedClub = (overrides = {}) => ({
  user: [{ id: OWNER, email: "owner@club.it" }],
  club: [
    {
      id: CLUB,
      slug: "club-c",
      name: "Club C",
      categories: [
        { id: "u15", name: "Under 15 Eccellenza" },
        { id: "serie-c", name: "Serie C" },
      ],
      structures: [
        {
          id: "struct-1",
          name: "PalaBorrelli",
          fields: [
            { id: "field-1", name: "Palazzetto", availability: AVAILABILITY_PALAZZETTO },
          ],
        },
      ],
      trainers: [],
      staff_members: [],
      trainings: [],
      matches: [],
      ...overrides,
    },
  ],
  clubEvent: [],
});

beforeEach(() => {
  fake = createFakePrisma(seedClub());
  setPrismaClientForTests(fake.client);
});

/** Giovedi 17 settembre 2026 — la data esatta del caso reale. */
const GIOVEDI_17 = "2026-09-17T00:00:00.000Z";

const matchPayload = (overrides = {}) => ({
  id: `match-${Math.random().toString(36).slice(2)}`,
  title: "Gara di prova",
  date: GIOVEDI_17,
  time: "19:00 - 20:30",
  category: "Under 15 Eccellenza",
  categoryId: "u15",
  groupIds: [],
  opponent: "Avversario di prova",
  location: "Palazzetto",
  isHome: true,
  structureId: "struct-1",
  fieldId: "field-1",
  trainers: [],
  notes: "",
  matchNumber: "",
  status: "upcoming",
  convocationsStatus: "none",
  rsvpRequired: false,
  rsvpDeadline: null,
  capacity: null,
  siteId: null,
  ...overrides,
});

const trainingPayload = (overrides = {}) => ({
  id: `training-${Math.random().toString(36).slice(2)}`,
  title: "Allenamento di prova",
  date: GIOVEDI_17,
  time: "19:00",
  endTime: "20:30",
  categoryId: "serie-c",
  structureId: "struct-1",
  fieldId: "field-1",
  ...overrides,
});

test("1. gara 19:00-20:30 senza conflitto -> accettata", async () => {
  const row = await eventi.createClubEvent(scope, "match", matchPayload(), attore);

  assert.equal(row.starts_at.toISOString(), "2026-09-17T19:00:00.000Z");
  assert.equal(row.ends_at?.toISOString(), "2026-09-17T20:30:00.000Z");
});

test("2. gara che collide con un allenamento -> rifiutata con i dettagli dell'allenamento", async () => {
  await eventi.createClubEvent(scope, "training", trainingPayload(), attore);

  await assert.rejects(
    eventi.createClubEvent(
      scope,
      "match",
      matchPayload({ time: "19:30 - 20:15" }), // dentro l'intervallo dell'allenamento
      attore,
    ),
    (errore) => {
      assert.match(errore.message, /dall'allenamento Serie C/);
      assert.equal(errore.code, "EVENT_AVAILABILITY_CONFLICT");
      assert.equal(errore.details.reason, "OVERLAP");
      assert.equal(errore.details.conflictingEventKind, "training");
      assert.equal(errore.details.conflictingCategory, "Serie C");
      assert.equal(errore.details.fieldName, "Palazzetto");
      assert.equal(
        errore.details.conflictingStartsAt,
        "2026-09-17T19:00:00.000Z",
      );
      assert.equal(
        errore.details.conflictingEndsAt,
        "2026-09-17T20:30:00.000Z",
      );
      return true;
    },
  );
});

test("3. gara che collide con un'altra gara -> rifiutata con i dettagli della gara", async () => {
  await eventi.createClubEvent(
    scope,
    "match",
    matchPayload({ opponent: "Juventus Academy" }),
    attore,
  );

  await assert.rejects(
    eventi.createClubEvent(
      scope,
      "match",
      matchPayload({
        id: "match-secondo-tentativo",
        time: "19:30 - 20:15",
        category: "Under 15 Eccellenza",
        opponent: "Un altro avversario",
      }),
      attore,
    ),
    (errore) => {
      assert.match(
        errore.message,
        /dalla gara Under 15 Eccellenza vs Juventus Academy/,
      );
      assert.equal(errore.details.reason, "OVERLAP");
      assert.equal(errore.details.conflictingEventKind, "match");
      assert.equal(errore.details.conflictingCategory, "Under 15 Eccellenza");
      assert.equal(errore.details.conflictingOpponent, "Juventus Academy");
      return true;
    },
  );
});

test("4. gara fuori orario di apertura -> rifiutata con l'orario disponibile", async () => {
  await assert.rejects(
    eventi.createClubEvent(
      scope,
      "match",
      matchPayload({ time: "03:00 - 04:00" }),
      attore,
    ),
    (errore) => {
      assert.match(errore.message, /Orario disponibile: 08:00-23:00/);
      assert.equal(errore.code, "EVENT_AVAILABILITY_CONFLICT");
      assert.equal(errore.details.reason, "OUTSIDE_OPENING_HOURS");
      assert.equal(errore.details.availableHours, "08:00-23:00");
      assert.equal(errore.details.fieldName, "Palazzetto");
      return true;
    },
  );
});

test("5. un evento che finisce alle 19:00 e una gara che comincia alle 19:00 non si sovrappongono", async () => {
  await eventi.createClubEvent(
    scope,
    "training",
    trainingPayload({ time: "17:30", endTime: "19:00" }),
    attore,
  );

  const row = await eventi.createClubEvent(
    scope,
    "match",
    matchPayload({ time: "19:00 - 20:00" }),
    attore,
  );

  assert.equal(row.starts_at.toISOString(), "2026-09-17T19:00:00.000Z");
});

test("6. ora solare e ora legale: lo stesso 19:00-20:30 resta accettato in entrambe", async () => {
  const inverno = await eventi.createClubEvent(
    scope,
    "match",
    matchPayload({ date: "2026-01-15T00:00:00.000Z" }), // giovedi, CET
    attore,
  );
  assert.equal(inverno.starts_at.toISOString(), "2026-01-15T19:00:00.000Z");
  assert.equal(inverno.ends_at?.toISOString(), "2026-01-15T20:30:00.000Z");

  fake = createFakePrisma(seedClub());
  setPrismaClientForTests(fake.client);

  const estate = await eventi.createClubEvent(
    scope,
    "match",
    matchPayload({ date: "2026-07-16T00:00:00.000Z" }), // giovedi, CEST
    attore,
  );
  assert.equal(estate.starts_at.toISOString(), "2026-07-16T19:00:00.000Z");
  assert.equal(estate.ends_at?.toISOString(), "2026-07-16T20:30:00.000Z");
});

test("7. l'intervallo che il form propone (\"19:00 - 20:30\" da un solo \"19:00\") viene persistito cosi com'e", async () => {
  // Lo stesso testo che src/lib/matches/match-time-suggestion.ts produce da
  // un input "19:00": qui si prova che il dominio lo accetta e lo scrive
  // per intero, non che il suggerimento esista (quello e in tests/lib/).
  const row = await eventi.createClubEvent(
    scope,
    "match",
    matchPayload({ time: "19:00 - 20:30" }),
    attore,
  );

  assert.equal(row.starts_at.toISOString(), "2026-09-17T19:00:00.000Z");
  assert.equal(row.ends_at?.toISOString(), "2026-09-17T20:30:00.000Z");
});
