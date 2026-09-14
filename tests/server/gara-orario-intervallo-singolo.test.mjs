import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Una gara dentro l'orario di apertura veniva rifiutata** (bug UAT
 * "creazione nuova gara fallisce", catturato in staging: `POST
 * /api/v1/events` rispondeva `"Il campo «Palazzetto» non e disponibile in
 * quel giorno e a quell'ora"` per una gara 19:30-21:00 su un campo aperto
 * 13:00-23:00).
 *
 * **La causa non era il fuso orario** — quello e gia corretto
 * (`src/lib/events/model.ts`: `isWithinFieldAvailability` passa
 * esplicitamente `"UTC"`, la stessa correzione che ha chiuso il difetto
 * gemello sul programma settimanale — vedi il commento li accanto,
 * issue Fortitudo Scauri). Era la **fine dell'intervallo**:
 * `AddMatchForm` scrive orario di inizio e fine in un solo campo libero
 * (`"19:30 - 21:00"`), mentre `AddTrainingForm` li scrive in due input
 * separati (`time`/`endTime`). `toEventColumns` leggeva solo il **primo**
 * orario di quella stringa come inizio, e non aveva alcun modo di leggere
 * il secondo come fine: `ends_at` restava a mezzanotte (nessun campo di
 * fine trovato), `resolveEndsAt` la trattava come una sessione a cavallo
 * della notte, e la fine "indovinata" (mezzanotte) superava il vero
 * orario di chiusura del campo — anche quando l'orario reale, scritto
 * proprio li, ci stava perfettamente.
 *
 * La correzione vive nel modello condiviso (`secondTimeFromRange`, in
 * `src/lib/events/model.ts`): quando non c'e un campo di fine esplicito,
 * la seconda ora di un intervallo scritto come stringa unica diventa la
 * fine vera. Nessun bypass della disponibilita, nessuna via legacy: stesso
 * scrittore canonico (`createClubEvent`), stessa `isWithinFieldAvailability`,
 * per allenamenti e gare.
 */

const CLUB = "aaaaaaaa-9800-4000-8000-00000000000a";
const OWNER = "11111111-9800-4000-8000-000000000aaa";

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

/** Palazzetto: aperto tutti i giorni 13:00-23:00, come descritto nel ticket. */
const ORARIO_PALAZZETTO = { start: "13:00", end: "23:00" };
const AVAILABILITY_PALAZZETTO = {
  Lun: [ORARIO_PALAZZETTO],
  Mar: [ORARIO_PALAZZETTO],
  Mer: [ORARIO_PALAZZETTO],
  Gio: [ORARIO_PALAZZETTO],
  Ven: [ORARIO_PALAZZETTO],
  Sab: [ORARIO_PALAZZETTO],
  Dom: [ORARIO_PALAZZETTO],
};

let fake;

const seedClub = (overrides = {}) => ({
  user: [{ id: OWNER, email: "owner@club.it" }],
  club: [
    {
      id: CLUB,
      slug: "club",
      name: "Club",
      categories: [{ id: "u15", name: "Under 15" }],
      structures: [
        {
          id: "struct-1",
          name: "Stadio Comunale",
          fields: [{ id: "field-1", name: "Palazzetto", availability: AVAILABILITY_PALAZZETTO }],
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

/**
 * Il payload esatto che `proceedWithMatchCreation` costruisce per una gara
 * "in casa": un solo campo `time` con l'intervallo, nessun `endTime`.
 */
const matchPayload = (overrides = {}) => ({
  id: `match-${Math.random().toString(36).slice(2)}`,
  title: "Partita Under 15 vs Juventus",
  date: "2026-09-20T00:00:00.000Z",
  time: "19:30 - 21:00",
  category: "Under 15",
  categoryId: "u15",
  groupIds: [],
  opponent: "Juventus Academy",
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

/** Lo stesso payload di un allenamento: due campi separati, non uno. */
const trainingPayload = (overrides = {}) => ({
  id: `training-${Math.random().toString(36).slice(2)}`,
  title: "Allenamento Under 15",
  date: "2026-09-20T00:00:00.000Z",
  time: "19:30",
  endTime: "21:00",
  categoryId: "u15",
  structureId: "struct-1",
  fieldId: "field-1",
  ...overrides,
});

test("una gara 19:30-21:00, scritta come intervallo unico, e accettata dentro un campo aperto 13:00-23:00", async () => {
  const row = await eventi.createClubEvent(scope, "match", matchPayload(), {
    userId: OWNER,
    email: "owner@club.it",
  });

  assert.equal(row.starts_at.toISOString().slice(11, 16), "19:30");
  assert.equal(
    row.ends_at?.toISOString().slice(11, 16),
    "21:00",
    "la fine vera (21:00), non una mezzanotte indovinata",
  );
});

test("la stessa gara, con la struttura CHIUSA in quell'orario, e rifiutata con il motivo reale", async () => {
  fake = createFakePrisma(
    seedClub({
      structures: [
        {
          id: "struct-1",
          name: "Stadio Comunale",
          fields: [
            {
              id: "field-1",
              name: "Palazzetto",
              // Aperto solo di mattina: 19:30-21:00 e genuinamente fuori.
              availability: { Dom: [{ start: "08:00", end: "12:00" }] },
            },
          ],
        },
      ],
    }),
  );
  setPrismaClientForTests(fake.client);

  await assert.rejects(
    eventi.createClubEvent(scope, "match", matchPayload(), {
      userId: OWNER,
      email: "owner@club.it",
    }),
    /Il campo «Palazzetto» non e disponibile in quel giorno e a quell'ora/,
  );
});

test("un allenamento (due campi separati) e una gara (intervallo unico) sullo stesso orario producono lo stesso esito", async () => {
  const gara = await eventi.createClubEvent(scope, "match", matchPayload(), {
    userId: OWNER,
    email: "owner@club.it",
  });

  fake = createFakePrisma(seedClub());
  setPrismaClientForTests(fake.client);

  const allenamento = await eventi.createClubEvent(scope, "training", trainingPayload(), {
    userId: OWNER,
    email: "owner@club.it",
  });

  assert.equal(gara.starts_at.toISOString(), allenamento.starts_at.toISOString());
  assert.equal(gara.ends_at?.toISOString(), allenamento.ends_at?.toISOString());
});

test("un intervallo genuinamente fuori orario (dopo la chiusura) resta rifiutato, non mascherato dal fix", async () => {
  await assert.rejects(
    eventi.createClubEvent(
      scope,
      "match",
      matchPayload({ time: "23:15 - 23:45" }),
      { userId: OWNER, email: "owner@club.it" },
    ),
    /Il campo «Palazzetto» non e disponibile in quel giorno e a quell'ora/,
  );
});

test("un intervallo appena dentro la chiusura (22:30-23:00) e accettato: nessuno spostamento di fuso residuo", async () => {
  const row = await eventi.createClubEvent(
    scope,
    "match",
    matchPayload({ time: "22:30 - 23:00" }),
    { userId: OWNER, email: "owner@club.it" },
  );

  assert.equal(row.ends_at?.toISOString().slice(11, 16), "23:00");
});

test("ora solare (CET, gennaio): l'intervallo 19:30-21:00 resta dentro l'orario, nessuna doppia conversione", async () => {
  const row = await eventi.createClubEvent(
    scope,
    "match",
    matchPayload({ date: "2026-01-11T00:00:00.000Z" }), // Domenica 11 gennaio 2026
    { userId: OWNER, email: "owner@club.it" },
  );

  assert.equal(row.starts_at.toISOString(), "2026-01-11T19:30:00.000Z");
  assert.equal(row.ends_at?.toISOString(), "2026-01-11T21:00:00.000Z");
});

test("ora legale (CEST, luglio): lo stesso intervallo resta dentro l'orario, nessuna doppia conversione", async () => {
  const row = await eventi.createClubEvent(
    scope,
    "match",
    matchPayload({ date: "2026-07-12T00:00:00.000Z" }), // Domenica 12 luglio 2026
    { userId: OWNER, email: "owner@club.it" },
  );

  assert.equal(row.starts_at.toISOString(), "2026-07-12T19:30:00.000Z");
  assert.equal(row.ends_at?.toISOString(), "2026-07-12T21:00:00.000Z");
});

test("weekend del cambio dell'ora (ultima domenica di ottobre 2026): l'intervallo non si sposta", async () => {
  // Il cambio CEST->CET e nella notte fra sabato 24 e domenica 25 ottobre
  // 2026. Le cifre di `club_events` sono lette cosi come sono (fuso "UTC"
  // esplicito): il cambio dell'ora reale non le riguarda affatto.
  const row = await eventi.createClubEvent(
    scope,
    "match",
    matchPayload({ date: "2026-10-25T00:00:00.000Z" }),
    { userId: OWNER, email: "owner@club.it" },
  );

  assert.equal(row.starts_at.toISOString(), "2026-10-25T19:30:00.000Z");
  assert.equal(row.ends_at?.toISOString(), "2026-10-25T21:00:00.000Z");
});

test("un intervallo unico senza spazi intorno al trattino (\"19:30-21:00\") si legge lo stesso", async () => {
  const row = await eventi.createClubEvent(
    scope,
    "match",
    matchPayload({ time: "19:30-21:00" }),
    { userId: OWNER, email: "owner@club.it" },
  );

  assert.equal(row.ends_at?.toISOString().slice(11, 16), "21:00");
});

test("senza alcun intervallo leggibile (un solo orario, nessun trattino), il comportamento resta quello di prima — non e questa la correzione", async () => {
  // Un orario libero senza trattino (un dato scritto male, o un vecchio
  // formato): non c'e una seconda ora da leggere, quindi la fine resta la
  // stessa ipotesi "scavalca la notte fino a mezzanotte" di prima di questa
  // correzione — e su un campo che chiude prima di mezzanotte quell'ipotesi
  // resta rifiutata, esattamente come sarebbe stata rifiutata anche senza
  // questo fix. E un limite preesistente, diverso da quello del ticket
  // (che riguarda specificamente un intervallo scritto come stringa unica
  // "inizio - fine"), e questa correzione non doveva — e non deve —
  // cambiarlo: lo documenta cosi nessuno lo confonda con una regressione.
  await assert.rejects(
    eventi.createClubEvent(
      scope,
      "match",
      matchPayload({ time: "19:30" }),
      { userId: OWNER, email: "owner@club.it" },
    ),
    /Il campo «Palazzetto» non e disponibile in quel giorno e a quell'ora/,
  );
});
