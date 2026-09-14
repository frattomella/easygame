import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Elimina / annulla gara usava ancora il writer legacy** (bug UAT
 * follow-up, scoperto durante l'UAT del fix "creazione nuova gara fallisce":
 * cliccando "Elimina" su una gara reale in staging, la rete rispondeva
 * `403 Accesso negato: matches e una proiezione degli eventi e si scrive da
 * /api/v1/events, non dal club`).
 *
 * `handleDeleteMatch`/`handleCancelMatch` (`src/app/matches/page.tsx`)
 * leggevano e riscrivevano `clubs.matches` con `getClubData`/`updateClubData`
 * — la stessa colonna che, da ADR-0098, e una **proiezione in sola lettura**
 * con un solo scrittore (`projectEventsToClubColumn`, dentro
 * `deleteClubEvent`/`updateClubEvent`). Un vaglio server-side rifiuta ogni
 * altra scrittura.
 *
 * Il dominio (`deleteClubEvent`, `updateClubEvent`, entrambi in
 * `src/lib/server/events.ts`) **era gia corretto** — e gia in uso da
 * `training/page.tsx` per lo stesso identico problema sugli allenamenti.
 * Questi test lo esercitano direttamente (senza passare dalla UI, come fa
 * gia `tests/server/gara-orario-intervallo-singolo.test.mjs`) per fissare il
 * comportamento che il cablaggio client-side ora rispetta: permesso,
 * guardia sulla storia, proiezione, nessun impatto sugli allenamenti. Il
 * cablaggio stesso — che `matches/page.tsx` chiami davvero questo dominio —
 * e coperto da `tests/ui/gara-elimina-annulla-canonico.test.mjs`.
 */

const CLUB = "aaaaaaaa-9800-4000-8000-00000000000b";
const OWNER = "11111111-9800-4000-8000-000000000bbb";

let eventi;
let setPrismaClientForTests;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  eventi = await import("../../src/lib/server/events.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const ownerScope = {
  userId: OWNER,
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
};

/** Stesso club, stessa persona, ma un ruolo senza `events.manage`. */
const athleteScope = {
  ...ownerScope,
  activeRole: "athlete",
};

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
      slug: "club-b",
      name: "Club B",
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

const attore = { userId: OWNER, email: "owner@club.it" };

/*
  **Perche `.legacy_id`, non `.id`, nelle chiamate qui sotto.**

  `createClubEvent` non passa mai un `id` esplicito a `prisma.clubEvent.create`
  (lo scrive Postgres, `@default(uuid())`): la fake in memoria, senza un `id`
  dichiarato, genera un segnaposto leggibile (`clubEvent-generated-N`), non
  un UUID — un limite noto della doppia condivisa (come il suo trattare
  `null === null` come collisione), non di questo dominio. `findClubEvent`
  cerca per `id` **solo** quando l'argomento e forma UUID, altrimenti cerca
  per `legacy_id` — che e esattamente cio che manda anche la UI reale:
  `match.eventId || match.id`, dove `match.id` (`toEventLegacyShape`) e
  `legacy_id` quando esiste. Usare `.legacy_id` qui non e un aggiustamento
  per far passare il test: e la stessa strada che percorre il browser.
*/

test("elimina una gara autorizzata (nessuna storia) -> successo, la riga canonica sparisce", async () => {
  const gara = await eventi.createClubEvent(ownerScope, "match", matchPayload(), attore);

  const esito = await eventi.deleteClubEvent(ownerScope, gara.legacy_id, attore);
  assert.equal(esito.id, gara.id);

  assert.equal(await eventi.readClubEvent(ownerScope, gara.legacy_id), null);
  assert.equal(
    fake.rows("clubEvent").some((riga) => riga.id === gara.id),
    false,
    "la riga canonica deve essere sparita da club_events, non solo dalla proiezione",
  );
});

test("annulla una gara autorizzata -> successo, lo stato canonico diventa cancelled", async () => {
  const gara = await eventi.createClubEvent(ownerScope, "match", matchPayload(), attore);
  assert.equal(gara.status, "scheduled");

  const annullata = await eventi.updateClubEvent(
    ownerScope,
    gara.legacy_id,
    { status: "cancelled" },
    attore,
    { expectedVersion: gara.version },
  );

  assert.equal(annullata.status, "cancelled");
  assert.equal(
    fake.rows("clubEvent").find((riga) => riga.id === gara.id)?.status,
    "cancelled",
    "lo stato deve essere scritto sulla riga canonica",
  );
});

test("un ruolo senza events.manage non puo eliminare la gara: 403 Accesso negato, la riga resta", async () => {
  const gara = await eventi.createClubEvent(ownerScope, "match", matchPayload(), attore);

  await assert.rejects(
    eventi.deleteClubEvent(athleteScope, gara.legacy_id, attore),
    /Accesso negato/,
  );

  assert.equal(
    fake.rows("clubEvent").some((riga) => riga.id === gara.id),
    true,
    "un tentativo rifiutato non deve toccare la riga",
  );
});

test("un ruolo senza events.manage non puo annullare la gara: 403 Accesso negato, lo stato resta", async () => {
  const gara = await eventi.createClubEvent(ownerScope, "match", matchPayload(), attore);

  await assert.rejects(
    eventi.updateClubEvent(
      athleteScope,
      gara.legacy_id,
      { status: "cancelled" },
      attore,
      { expectedVersion: gara.version },
    ),
    /Accesso negato/,
  );

  assert.equal(
    fake.rows("clubEvent").find((riga) => riga.id === gara.id)?.status,
    "scheduled",
    "un tentativo rifiutato non deve toccare lo stato",
  );
});

test("una gara con una storia (una convocazione) si annulla, non si elimina: messaggio reale, non un 403 generico", async () => {
  const gara = await eventi.createClubEvent(ownerScope, "match", matchPayload(), attore);
  await fake.client.clubEventParticipant.create({
    data: {
      id: "partecipante-1",
      organization_id: CLUB,
      event_id: gara.id,
      athlete_id: "atleta-1",
      status: "pending",
      convocation_status: "convocated",
    },
  });

  await assert.rejects(
    eventi.deleteClubEvent(ownerScope, gara.legacy_id, attore),
    /si annulla, non si cancella/,
  );

  // La stessa gara resta annullabile: l'operazione giusta non e bloccata.
  const annullata = await eventi.updateClubEvent(
    ownerScope,
    gara.legacy_id,
    { status: "cancelled" },
    attore,
    { expectedVersion: gara.version },
  );
  assert.equal(annullata.status, "cancelled");
});

test("eliminare o annullare una gara non tocca gli allenamenti dello stesso club", async () => {
  const gara = await eventi.createClubEvent(ownerScope, "match", matchPayload(), attore);
  const allenamento = await eventi.createClubEvent(
    ownerScope,
    "training",
    // Fuori dall'orario della gara sullo stesso campo: qui si controlla
    // l'impatto sull'allenamento, non la sovrapposizione (coperta altrove).
    trainingPayload({ time: "13:00", endTime: "14:00" }),
    attore,
  );

  await eventi.deleteClubEvent(ownerScope, gara.legacy_id, attore);

  const rigaAllenamento = fake
    .rows("clubEvent")
    .find((riga) => riga.id === allenamento.id);
  assert.ok(rigaAllenamento, "l'allenamento deve esistere ancora");
  assert.equal(rigaAllenamento.status, "scheduled");
  assert.equal(
    fake.rows("club")[0]?.trainings?.length,
    1,
    "la proiezione degli allenamenti non deve essere svuotata dall'eliminazione di una gara",
  );
});

test("la proiezione clubs.matches segue le righe: una gara eliminata non ci resta, una annullata ci resta con lo stato giusto", async () => {
  const primaGara = await eventi.createClubEvent(ownerScope, "match", matchPayload(), attore);
  const secondaGara = await eventi.createClubEvent(
    ownerScope,
    "match",
    matchPayload({ time: "14:00 - 15:30" }),
    attore,
  );

  await eventi.deleteClubEvent(ownerScope, primaGara.legacy_id, attore);
  await eventi.updateClubEvent(
    ownerScope,
    secondaGara.legacy_id,
    { status: "cancelled" },
    attore,
    { expectedVersion: secondaGara.version },
  );

  const proiezione = fake.rows("club")[0]?.matches ?? [];
  assert.equal(
    proiezione.some((riga) => riga.eventId === primaGara.id || riga.id === primaGara.id),
    false,
    "la gara eliminata non deve comparire nella proiezione",
  );
  const rigaAnnullata = proiezione.find(
    (riga) => riga.eventId === secondaGara.id || riga.id === secondaGara.id,
  );
  assert.ok(rigaAnnullata, "la gara annullata deve restare nella proiezione");
  assert.equal(rigaAnnullata.status, "cancelled");
});
