import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **"Generato e mai toccato" contro "generato e poi modificato a mano"**
 * (WP-10).
 *
 * Prima non c'era modo di saperlo: la prossima esecuzione dell'automazione
 * confrontava per valore (stessa chiave giorno/ora/campo/categoria), e quel
 * confronto smette di funzionare esattamente quando qualcuno cambia uno di
 * quei valori — che e l'unico caso in cui la distinzione serve davvero.
 */

const CLUB = "aaaaaaaa-6c00-4000-8000-00000000000e";
const DIREZIONE = "11111111-6c00-4000-8000-000000000ddd";
const GENERATO_ID = "cccccccc-6c00-4000-8000-000000000010";
const MANUALE_ID = "cccccccc-6c00-4000-8000-000000000011";

let eventi;
let setPrismaClientForTests;
let fake;

const scope = () => ({
  userId: DIREZIONE,
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  eventi = await import("../../src/lib/server/events.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const rigaEvento = (id, { generated, fieldId }) => ({
  id,
  organization_id: CLUB,
  kind: "training",
  legacy_id: `legacy-${id}`,
  title: "Allenamento",
  status: "scheduled",
  category_id: "u15",
  category_name: "Under 15",
  category_ids: ["u15"],
  structure_id: "STRUCT1",
  field_id: fieldId,
  site_id: null,
  group_ids: [],
  rsvp_required: false,
  starts_at: new Date("2026-09-21T17:00:00.000Z"),
  ends_at: new Date("2026-09-21T18:30:00.000Z"),
  version: 1,
  payload: generated ? { generated: true } : {},
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
  athlete: [],
  athleteCategoryMembership: [],
  clubEvent: [
    rigaEvento(GENERATO_ID, { generated: true, fieldId: "FIELD1" }),
    rigaEvento(MANUALE_ID, { generated: false, fieldId: "FIELD2" }),
  ],
  clubEventParticipant: [],
  auditLog: [],
  notification: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

test("WP-10 · spostare l'orario di un evento generato lo segna come modificato a mano", async () => {
  await eventi.updateClubEvent(scope(), GENERATO_ID, { time: "18:30" });

  const riga = fake.rows("clubEvent").find((r) => r.id === GENERATO_ID);
  assert.equal(riga.payload.generated, true, "il flag di origine resta");
  assert.equal(riga.payload.manuallyModified, true);
  assert.ok(riga.payload.manuallyModifiedAt);
});

test("WP-10 · correggere solo il titolo non segna niente", async () => {
  await eventi.updateClubEvent(scope(), GENERATO_ID, { title: "Allenamento U15" });

  const riga = fake.rows("clubEvent").find((r) => r.id === GENERATO_ID);
  assert.equal(riga.payload.manuallyModified, undefined);
});

test("WP-10 · un evento non generato non porta il flag", async () => {
  await eventi.updateClubEvent(scope(), MANUALE_ID, { time: "19:00" });

  const riga = fake.rows("clubEvent").find((r) => r.id === MANUALE_ID);
  assert.equal(riga.payload.manuallyModified, undefined);
});

test("WP-10 · il segno e a una via: riportare i valori uguali non lo toglie", async () => {
  await eventi.updateClubEvent(scope(), GENERATO_ID, { time: "18:30" });
  await eventi.updateClubEvent(scope(), GENERATO_ID, { time: "17:00" });

  const riga = fake.rows("clubEvent").find((r) => r.id === GENERATO_ID);
  assert.equal(riga.payload.manuallyModified, true);
});
