import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **W5-69 — il gruppo operativo diventa un confine dove il dato e personale.**
 *
 * Il gruppo — categoria **piu** sede — esisteva da ADR-0055 ed era consumato da
 * un solo posto: l'RSVP. Ovunque altro il perimetro dell'allenatore era la sola
 * categoria. In un club multi-sede questo significa che il mister dei
 * `Pulcini · Scauri` leggeva l'anagrafica completa dei `Pulcini · Santi Cosma`:
 * stessa fascia, altra squadra, altre famiglie.
 *
 * Il confine vale sugli **atleti**, che sono dato personale. Su allenamenti e
 * gare resta un filtro di comodita, perche il calendario di una squadra non e
 * il dato di nessuno.
 */

const CLUB = "aaaaaaaa-6900-4000-8000-00000000000a";
const MISTER_SCAURI = "11111111-6900-4000-8000-000000000aaa";
const MISTER_SENZA_GRUPPI = "22222222-6900-4000-8000-000000000bbb";

const SCAURI = "sede-scauri";
const SANTI_COSMA = "sede-santi-cosma";
/* L id canonico di un gruppo lo costruisce `buildCategoryGroupId`. */
const GRUPPO_SCAURI = `group:pulcini:${SCAURI}`;
const GRUPPO_SANTI_COSMA = `group:pulcini:${SANTI_COSMA}`;

const ATLETA_SCAURI = "atleta-scauri";
const ATLETA_SANTI_COSMA = "atleta-santi-cosma";

const scope = (userId) => ({
  userId,
  activeOrganizationId: CLUB,
  activeRole: "trainer",
  allowedOrganizationIds: [CLUB],
});

let risorse;
let gruppi;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  risorse = await import("../../src/lib/server/resources.ts");
  gruppi = await import("../../src/lib/club-sites.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const atleta = (id, nome, siteId) => ({
  id,
  organization_id: CLUB,
  first_name: nome,
  last_name: "Rossi",
  data: {
    categoryMemberships: [{ category_id: "pulcini", site_id: siteId }],
  },
});

const seed = () => ({
  user: [
    { id: MISTER_SCAURI, email: "scauri@club.it", role: "user" },
    { id: MISTER_SENZA_GRUPPI, email: "storico@club.it", role: "user" },
  ],
  club: [
    {
      id: CLUB,
      slug: "club",
      name: "Club multi-sede",
      categories: [{ id: "pulcini", name: "Pulcini" }],
      club_sites: [
        { id: SCAURI, name: "Scauri", active: true },
        { id: SANTI_COSMA, name: "Santi Cosma", active: true },
      ],
      category_groups: [
        { id: GRUPPO_SCAURI, categoryId: "pulcini", siteId: SCAURI },
        {
          id: GRUPPO_SANTI_COSMA,
          categoryId: "pulcini",
          siteId: SANTI_COSMA,
        },
      ],
      trainers: [
        {
          id: "trainer-scauri",
          name: "Mister Scauri",
          email: "scauri@club.it",
          linkedUserId: MISTER_SCAURI,
          categories: ["pulcini"],
          groups: [GRUPPO_SCAURI],
        },
        {
          id: "trainer-storico",
          name: "Mister Storico",
          email: "storico@club.it",
          linkedUserId: MISTER_SENZA_GRUPPI,
          categories: ["pulcini"],
        },
      ],
    },
  ],
  athlete: [
    atleta(ATLETA_SCAURI, "Marco", SCAURI),
    atleta(ATLETA_SANTI_COSMA, "Luca", SANTI_COSMA),
  ],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const idsAtleti = async (userId) => {
  const { records } = await risorse.listResourcePage(
    "athletes",
    new URLSearchParams({ organization_id: CLUB }),
    scope(userId),
  );
  return records.map((riga) => riga.id).sort();
};

test("il gruppo operativo esiste e distingue le due sedi", () => {
  const costruiti = gruppi.buildCategoryGroups({
    categories: [{ id: "pulcini", name: "Pulcini" }],
    sites: gruppi.normalizeClubSites([
      { id: SCAURI, name: "Scauri", active: true },
      { id: SANTI_COSMA, name: "Santi Cosma", active: true },
    ]),
    groups: [
      { id: GRUPPO_SCAURI, categoryId: "pulcini", siteId: SCAURI },
      { id: GRUPPO_SANTI_COSMA, categoryId: "pulcini", siteId: SANTI_COSMA },
    ],
  });

  assert.equal(costruiti.length, 2, "stessa categoria, due squadre distinte");
});

test("l'allenatore con un gruppo dichiarato vede solo la propria squadra", async () => {
  assert.deepEqual(
    await idsAtleti(MISTER_SCAURI),
    [ATLETA_SCAURI],
    "i Pulcini di Santi Cosma non sono i suoi",
  );
});

test("l'allenatore senza gruppi dichiarati ricade sulla categoria", async () => {
  /*
    Un club che non ha configurato le sedi non deve perdere l'accesso da un
    giorno all'altro: la ricaduta e cio che il prodotto faceva prima.
  */
  assert.deepEqual(
    await idsAtleti(MISTER_SENZA_GRUPPI),
    [ATLETA_SANTI_COSMA, ATLETA_SCAURI].sort(),
  );
});

test("chi non e nel pool degli allenatori non vede nessun atleta", async () => {
  const { records } = await risorse.listResourcePage(
    "athletes",
    new URLSearchParams({ organization_id: CLUB }),
    scope("99999999-6900-4000-8000-000000000zzz"),
  );

  assert.deepEqual(records, []);
});
