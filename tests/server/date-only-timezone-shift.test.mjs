import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **"Date-only timezone shift"**: `AddMatchForm` mostrava correttamente
 * "17 settembre 2026", ma il submit poteva produrre una gara salvata il
 * 16 — `matchData.date.toISOString()` su un `Date` costruito a mezzanotte
 * locale (`react-day-picker`) lo riconvertiva in un istante UTC vero, e a
 * Roma (sempre avanti su UTC) quella conversione sposta la data indietro
 * di un giorno.
 *
 * `src/lib/matches/match-time-suggestion.ts` non c'entra (quello e
 * l'orario di fine, un bug diverso, gia chiuso): qui il campo in gioco e
 * `date`, non `time`.
 *
 * Il dominio (`createClubEvent`/`updateClubEvent`, `toEventColumns` in
 * `src/lib/events/model.ts`) non ha mai avuto il difetto — legge il primo
 * `YYYY-MM-DD` che trova e lo tratta come cifre letterali, senza nessuna
 * conversione. Il difetto era **prima**, nel client: questi test provano
 * che il dominio, ricevendo esattamente la stringa che il client corretto
 * manda ora (`formatLocalDateOnly`, non piu `.toISOString()`), scrive il
 * giorno civile scelto — non quello prima. Il cablaggio del client stesso
 * (che chiami davvero `formatLocalDateOnly`) e provato in
 * `tests/ui/date-only-timezone-shift.test.mjs`; il formattore puro in
 * `tests/lib/date-only.test.mjs`.
 */

const CLUB = "aaaaaaaa-9800-4000-8000-00000000000d";
const OWNER = "11111111-9800-4000-8000-000000000ddd";

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

const ORARIO_TUTTO_IL_GIORNO = { start: "08:00", end: "23:00" };
const AVAILABILITY = {
  Lun: [ORARIO_TUTTO_IL_GIORNO],
  Mar: [ORARIO_TUTTO_IL_GIORNO],
  Mer: [ORARIO_TUTTO_IL_GIORNO],
  Gio: [ORARIO_TUTTO_IL_GIORNO],
  Ven: [ORARIO_TUTTO_IL_GIORNO],
  Sab: [ORARIO_TUTTO_IL_GIORNO],
  Dom: [ORARIO_TUTTO_IL_GIORNO],
};

let fake;

const seedClub = () => ({
  user: [{ id: OWNER, email: "owner@club.it" }],
  club: [
    {
      id: CLUB,
      slug: "club-d",
      name: "Club D",
      categories: [{ id: "u15", name: "Under 15" }],
      structures: [
        {
          id: "struct-1",
          name: "PalaBorrelli",
          fields: [{ id: "field-1", name: "Palazzetto", availability: AVAILABILITY }],
        },
      ],
      trainers: [],
      staff_members: [],
      trainings: [],
      matches: [],
    },
  ],
  clubEvent: [],
});

beforeEach(() => {
  fake = createFakePrisma(seedClub());
  setPrismaClientForTests(fake.client);
});

/*
  Esattamente la stringa che `formatLocalDateOnly` produce da un "17
  settembre 2026" scelto nel calendario — nessun'ora, nessuna "Z", nessuna
  conversione: il giorno civile, cosi com'e stato scelto.
*/
const GIORNO_CIVILE_SCELTO = "2026-09-17";
const GIORNO_PRIMA_SBAGLIATO = "2026-09-16";

const matchPayload = (overrides = {}) => ({
  id: `match-${Math.random().toString(36).slice(2)}`,
  title: "Gara di prova",
  date: GIORNO_CIVILE_SCELTO,
  time: "19:00 - 20:30",
  category: "Under 15",
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
  date: GIORNO_CIVILE_SCELTO,
  time: "18:00",
  endTime: "19:30",
  categoryId: "u15",
  structureId: "struct-1",
  fieldId: "field-1",
  ...overrides,
});

test("creazione gara: il giorno civile scelto (17 settembre) e quello persistito, non il 16", async () => {
  const row = await eventi.createClubEvent(scope, "match", matchPayload(), attore);

  assert.equal(row.starts_at.toISOString().slice(0, 10), GIORNO_CIVILE_SCELTO);
  assert.notEqual(row.starts_at.toISOString().slice(0, 10), GIORNO_PRIMA_SBAGLIATO);
});

test("modifica gara: il giorno civile scelto in modifica resta quello scelto, non il giorno prima", async () => {
  const creata = await eventi.createClubEvent(
    scope,
    "match",
    matchPayload({ date: "2026-09-10" }),
    attore,
  );

  const modificata = await eventi.updateClubEvent(
    scope,
    creata.legacy_id,
    { date: GIORNO_CIVILE_SCELTO, time: "19:00 - 20:30" },
    attore,
    { expectedVersion: creata.version },
  );

  assert.equal(modificata.starts_at.toISOString().slice(0, 10), GIORNO_CIVILE_SCELTO);
  assert.notEqual(modificata.starts_at.toISOString().slice(0, 10), GIORNO_PRIMA_SBAGLIATO);
});

test("creazione allenamento: il giorno civile scelto (17 settembre) e quello persistito, non il 16", async () => {
  const row = await eventi.createClubEvent(scope, "training", trainingPayload(), attore);

  assert.equal(row.starts_at.toISOString().slice(0, 10), GIORNO_CIVILE_SCELTO);
  assert.notEqual(row.starts_at.toISOString().slice(0, 10), GIORNO_PRIMA_SBAGLIATO);
});

test("modifica allenamento: il giorno civile scelto in modifica resta quello scelto, non il giorno prima", async () => {
  const creato = await eventi.createClubEvent(
    scope,
    "training",
    trainingPayload({ date: "2026-09-10" }),
    attore,
  );

  const modificato = await eventi.updateClubEvent(
    scope,
    creato.legacy_id,
    { date: GIORNO_CIVILE_SCELTO, time: "18:00", endTime: "19:30" },
    attore,
    { expectedVersion: creato.version },
  );

  assert.equal(modificato.starts_at.toISOString().slice(0, 10), GIORNO_CIVILE_SCELTO);
  assert.notEqual(modificato.starts_at.toISOString().slice(0, 10), GIORNO_PRIMA_SBAGLIATO);
});
