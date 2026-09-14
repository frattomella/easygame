import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **`site_id` in colonna si deriva al momento della scrittura, per
 * qualunque evento** (chiude il gap di scrittura trovato sul pilota
 * Fortitudo Scauri: una gara creata dal form Web sceglieva un gruppo —
 * `groupIds` — ma non mandava mai `siteId`, e `listClubEvents` applica il
 * perimetro di sede di un ruolo con `where.site_id = { in: sedi } `: la gara
 * spariva per ogni ruolo ristretto a una sede).
 *
 * Il secondo test e la **guardia di non regressione** sul difetto opposto,
 * misurato durante la correzione: derivare anche `group_ids` da sola (non
 * solo `site_id`) da una categoria mono-gruppo rompeva la creazione di un
 * allenatore recintato per sola categoria, perche `eventWithinTrainerPerimeter`
 * giudica *chi puo scrivere* anche sui gruppi — vedi
 * `perimetro-allenatore.test.mjs`, "l'allenatore crea l'allenamento del
 * proprio gruppo".
 */

const CLUB = "aaaaaaaa-5ede-4000-8000-000000000010";
const DIREZIONE = "11111111-5ede-4000-8000-000000000f01";
/** Allenatore recintato per sola categoria (nessun gruppo nel profilo). */
const MISTER = "22222222-5ede-4000-8000-000000000f02";

const CAT = "cat-solo-un-gruppo";
const SITE = "site-unica";

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

const scope = (activeRole, userId = DIREZIONE) => ({
  userId,
  activeOrganizationId: CLUB,
  activeRole,
  allowedOrganizationIds: [CLUB],
});

const seed = () => ({
  user: [{ id: DIREZIONE, email: "direzione@club.it" }, { id: MISTER, email: "mister@club.it" }],
  club: [
    {
      id: CLUB,
      slug: "club",
      name: "Club",
      categories: [{ id: CAT, name: "Under 15" }],
      club_sites: [{ id: SITE, name: "Sede Unica" }],
      category_groups: [{ categoryId: CAT, siteId: SITE }],
      trainers: [
        {
          id: "trainer-mister",
          linkedUserId: MISTER,
          email: "mister@club.it",
          categories: [CAT],
          groupIds: [],
        },
      ],
      staff_members: [],
      structures: [],
      trainings: [],
      matches: [],
    },
  ],
  athlete: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

test("createClubEvent: una gara creata con groupIds ma senza siteId eredita la sede dal gruppo", async () => {
  const gruppoId = `group:${CAT}:${SITE}`;
  const riga = await eventi.createClubEvent(scope("club_manager"), "match", {
    id: "gara-1",
    date: "2026-09-20",
    time: "18:00",
    categoryId: CAT,
    groupIds: [gruppoId],
    opponent: "Avversario",
  });

  assert.equal(riga.site_id, SITE);
  assert.deepEqual(riga.group_ids, [gruppoId]);
});

test("createClubEvent: categoria con un solo gruppo e nessun groupIds → site_id derivato, group_ids resta vuoto", async () => {
  const riga = await eventi.createClubEvent(scope("club_manager"), "training", {
    id: "training-1",
    date: "2026-09-20",
    time: "18:00",
    categoryId: CAT,
    title: "Allenamento",
  });

  assert.equal(riga.site_id, SITE);
  assert.ok(!riga.group_ids || riga.group_ids.length === 0);
});

test("createClubEvent: un allenatore recintato per sola categoria crea ancora il proprio allenamento (nessun gruppo inventato)", async () => {
  const riga = await eventi.createClubEvent(scope("trainer", MISTER), "training", {
    id: "training-mister",
    date: "2026-09-20",
    time: "18:00",
    categoryId: CAT,
    title: "Allenamento del mister",
  });

  assert.equal(riga.site_id, SITE, "la sede si deriva comunque");
  assert.ok(
    !riga.group_ids || riga.group_ids.length === 0,
    "group_ids non si inventa: romperebbe il perimetro di scrittura di un allenatore senza gruppi",
  );
});
