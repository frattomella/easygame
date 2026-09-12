import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **R1 dell'hostile audit del mandato: un blocco interamente scartato non
 * lasciava traccia.**
 *
 * `createClubEventsBatch` torna presto — prima di scrivere il riepilogo di
 * audit — quando ogni candidato del blocco e su un campo chiuso, o quando
 * ogni candidato rimasto e in conflitto con qualcosa gia in calendario. Chi
 * guardava il registro non poteva distinguere "la generazione non era
 * ancora dovuta" (nessuna riga, perche non e girata) da "e girata, e ha
 * escluso tutto" (nessuna riga, ma con un motivo). Questo file prova che
 * ora resta una riga di audit anche quando il risultato e zero eventi
 * creati — e che l'anteprima, che non scrive niente per costruzione,
 * continua a non scriverne nemmeno una.
 */

const CLUB = "aaaaaaaa-6c00-4000-8000-000000000d1";
const DIREZIONE = "11111111-6c00-4000-8000-000000000d1a";
const ESISTENTE_ID = "cccccccc-6c00-4000-8000-000000000d10";

let eventi;
let setPrismaClientForTests;
let fake;

const scope = () => ({
  userId: DIREZIONE,
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
});

const CAMPO_CHIUSO_LUNEDI = {
  id: "FIELD1",
  name: "Campo 1",
  /*
    Una fascia dichiarata SOLO il martedi: il campo non e "sempre aperto"
    (`isWithinFieldAvailability` tratta la disponibilita del tutto assente
    come sempre aperta), ma il 21/09/2026 e un lunedi ("Lun") — chiuso,
    senza nessuna fascia applicabile.
  */
  availability: { Mar: [{ start: "08:00", end: "20:00" }] },
};

const CAMPO_SEMPRE_APERTO = { id: "FIELD1", name: "Campo 1" };

const seed = (righeEsistenti = [], campo = CAMPO_CHIUSO_LUNEDI) => ({
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
      structures: [{ id: "STRUCT1", name: "Struttura 1", fields: [campo] }],
      trainings: [],
      matches: [],
    },
  ],
  athlete: [],
  athleteCategoryMembership: [],
  clubEvent: righeEsistenti,
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

const candidato = ({ id, structureId, fieldId, start, end }) => ({
  id,
  date: "2026-09-21",
  time: start,
  endTime: end,
  title: `Allenamento ${id}`,
  categoryId: "u15",
  structureId,
  fieldId,
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

test("R1 · un blocco interamente scartato per campo chiuso lascia comunque una riga di audit", async () => {
  const { righe, esclusi } = await eventi.createClubEventsBatch(
    scope(),
    "training",
    [candidato({ id: "batch-a", structureId: "STRUCT1", fieldId: "FIELD1", start: "23:00", end: "23:30" })],
    {},
    { campoChiuso: "salta" },
  );

  assert.equal(righe.length, 0);
  assert.equal(esclusi, 1);

  const tracce = fake.rows("auditLog");
  assert.equal(
    tracce.length,
    1,
    "un tentativo che scarta tutto deve lasciare una riga, non il silenzio di 'mai girato'",
  );
  assert.equal(tracce[0].metadata?.generati, 0);
  assert.equal(tracce[0].metadata?.saltate, 1);
});

test("R1 · un blocco interamente in conflitto lascia comunque una riga di audit", async () => {
  fake = createFakePrisma(
    seed([
      {
        id: ESISTENTE_ID,
        organization_id: CLUB,
        kind: "training",
        legacy_id: "gia-in-calendario",
        title: "Gia in calendario",
        status: "scheduled",
        category_id: "u15",
        category_name: "Under 15",
        structure_id: "STRUCT1",
        field_id: "FIELD1",
        site_id: null,
        group_ids: [],
        rsvp_required: false,
        starts_at: new Date("2026-09-21T17:00:00.000Z"),
        ends_at: new Date("2026-09-21T18:30:00.000Z"),
        version: 1,
        payload: {},
      },
    ], CAMPO_SEMPRE_APERTO),
  );
  setPrismaClientForTests(fake.client);

  const { righe, conflitti } = await eventi.createClubEventsBatch(scope(), "training", [
    candidato({ id: "batch-b", structureId: "STRUCT1", fieldId: "FIELD1", start: "17:30", end: "19:00" }),
  ]);

  assert.equal(righe.length, 0);
  assert.equal(conflitti.length, 1);

  const tracce = fake.rows("auditLog");
  assert.equal(
    tracce.length,
    1,
    "un blocco interamente in conflitto deve lasciare una riga, non il silenzio di 'mai girato'",
  );
  assert.equal(tracce[0].metadata?.generati, 0);
  assert.equal(tracce[0].metadata?.conflitti, 1);
});

test("R1 · l'anteprima resta senza audit anche quando scarta tutto (non scrive niente per costruzione)", async () => {
  const { righe, esclusi } = await eventi.createClubEventsBatch(
    scope(),
    "training",
    [candidato({ id: "batch-c", structureId: "STRUCT1", fieldId: "FIELD1", start: "23:00", end: "23:30" })],
    {},
    { campoChiuso: "salta", soloAnteprima: true },
  );

  assert.equal(righe.length, 0);
  assert.equal(esclusi, 1);
  assert.equal(
    fake.rows("auditLog").length,
    0,
    "l'anteprima non scrive niente: nessuna riga di audit, nemmeno per il tentativo",
  );
});
