import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Il riporto delle assegnazioni degli allenatori** (ADR-0197 §19, matrice
 * §46 n. 3): creare una stagione **non** riporta chi allena cosa se nessuno
 * lo chiede; se lo si chiede, l'allenatore riceve le categorie **nuove**
 * corrispondenti alle sue, dalla mappa del riporto, e le vecchie restano
 * storico. Un riferimento senza corrispondenza si dichiara, non si
 * indovina.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-0000000001a9";
const CAT_A_U15 = "cat-a-u15";
const CAT_A_U17 = "cat-a-u17";

const stagioni = () => ({
  activeSeasonId: "s-a",
  seasons: [
    { id: "s-a", label: "Stagione A", startDate: "2025-07-01", endDate: "2026-06-30", status: "active", createdAt: "2025-01-01T00:00:00.000Z" },
  ],
});

const voce = (id, resource_type, payload) => ({
  id,
  organization_id: CLUB,
  resource_type,
  name: payload.name || null,
  status: null,
  date: null,
  payload: { ...payload, id },
  created_at: new Date("2025-08-01T00:00:00.000Z"),
  updated_at: new Date("2025-08-01T00:00:00.000Z"),
});

const seed = () => ({
  club: [{ id: CLUB, slug: "club", name: "Club", settings: stagioni() }],
  clubResourceItem: [
    voce(CAT_A_U15, "categories", { name: "U15 Gold", seasonId: "s-a" }),
    voce(CAT_A_U17, "categories", { name: "U17 Gold", seasonId: "s-a" }),
    voce("trainer-rossi", "trainers", { name: "Coach Rossi", categories: [CAT_A_U15] }),
    voce("trainer-bianchi", "trainers", { name: "Coach Bianchi", categories: [CAT_A_U15, CAT_A_U17] }),
    voce("trainer-verdi", "trainers", { name: "Coach Verdi", categories: [] }),
  ],
  athlete: [],
  athleteCategoryMembership: [],
  paymentTransaction: [],
  payment: [],
});

let seasons;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  seasons = await import("../../src/lib/server/seasons.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import("../../src/lib/server/prisma.ts"));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const allenatori = () =>
  fake.rows("clubResourceItem").filter((r) => r.resource_type === "trainers").map((r) => r.payload);
const categorieDi = (id) => allenatori().find((t) => t.id === id)?.categories ?? [];
const categorieDellaStagione = (seasonId) =>
  fake.rows("clubResourceItem").filter((r) => r.resource_type === "categories" && r.payload.seasonId === seasonId).map((r) => r.payload);

const creaStagioneB = (rollover) =>
  seasons.createClubSeason({
    organizationId: CLUB,
    input: { label: "Stagione B", startDate: "2026-07-01", endDate: "2027-06-30" },
    activate: true,
    rollover,
  });

test("creare la B con le sole categorie: nessuna assegnazione implicita, e il riepilogo lo dice", async () => {
  const result = await creaStagioneB({ sourceSeasonId: "s-a", types: ["categories"] });
  assert.equal(result.rollover.trainers.requested, false);
  assert.equal(result.rollover.trainers.trainersWithAssignments, 2, "Rossi e Bianchi avevano squadre nella A");
  assert.equal(result.rollover.trainers.trainersUpdated, 0);
  assert.deepEqual(categorieDi("trainer-rossi"), [CAT_A_U15], "le assegnazioni restano quelle della A: storico");
  const nuove = categorieDellaStagione(result.season.id);
  assert.equal(nuove.length, 2);
  assert.ok(nuove.every((c) => ![CAT_A_U15, CAT_A_U17].includes(c.id)), "le categorie della B hanno id nuovi");
});

test("riporto esplicito: ogni allenatore riceve le categorie nuove corrispondenti; le vecchie restano", async () => {
  const result = await creaStagioneB({ sourceSeasonId: "s-a", types: ["categories", "trainer_assignments"] });
  const nuove = categorieDellaStagione(result.season.id);
  const b15 = nuove.find((c) => c.rolloverSourceId === CAT_A_U15)?.id;
  const b17 = nuove.find((c) => c.rolloverSourceId === CAT_A_U17)?.id;
  assert.ok(b15 && b17, "la mappa del riporto e per identificativo");

  assert.equal(result.rollover.trainers.requested, true);
  assert.equal(result.rollover.trainers.trainersUpdated, 2);
  assert.equal(result.rollover.trainers.assignmentsCreated, 3);
  assert.deepEqual(result.rollover.trainers.unmapped, []);
  assert.deepEqual(categorieDi("trainer-rossi"), [CAT_A_U15, b15]);
  assert.deepEqual(categorieDi("trainer-bianchi"), [CAT_A_U15, CAT_A_U17, b15, b17]);
  assert.deepEqual(categorieDi("trainer-verdi"), []);

  const voceRiepilogo = result.rollover.entries.find((e) => e.type === "trainer_assignments");
  assert.deepEqual(voceRiepilogo, { type: "trainer_assignments", label: "Assegnazioni allenatori", available: 2, created: 2, skipped: 0 });
});

test("un secondo riporto non duplica: le destinazioni esistono gia", async () => {
  const prima = await creaStagioneB({ sourceSeasonId: "s-a", types: ["categories", "trainer_assignments"] });
  const secondo = await seasons.runClubSeasonRollover({
    organizationId: CLUB,
    sourceSeasonId: "s-a",
    targetSeasonId: prima.season.id,
    types: ["categories", "trainer_assignments"],
  });
  assert.equal(secondo.trainers.trainersUpdated, 0);
  assert.equal(secondo.trainers.assignmentsExisting, 3);
  assert.equal(categorieDi("trainer-bianchi").length, 4);
});

test("l'anteprima non scrive niente", async () => {
  const prima = await creaStagioneB({ sourceSeasonId: "s-a", types: ["categories"] });
  const anteprima = await seasons.runClubSeasonRollover({
    organizationId: CLUB,
    sourceSeasonId: "s-a",
    targetSeasonId: prima.season.id,
    types: ["categories", "trainer_assignments"],
    preview: true,
  });
  assert.equal(anteprima.trainers.trainersUpdated, 2);
  assert.deepEqual(categorieDi("trainer-rossi"), [CAT_A_U15], "in anteprima l'archivio non cambia");
});

test("le assegnazioni allenatori richiedono le categorie", async () => {
  await assert.rejects(
    () => creaStagioneB({ sourceSeasonId: "s-a", types: ["trainer_assignments"] }),
    /Per riportare «Assegnazioni allenatori» devi riportare anche: Categorie/,
  );
});

test("il riepilogo delle stagioni conta gli allenatori con una squadra in ogni stagione", async () => {
  const result = await creaStagioneB({ sourceSeasonId: "s-a", types: ["categories"] });
  const riepilogo = await seasons.summarizeSeasonContents(CLUB);
  assert.equal(riepilogo.counts["s-a"].trainer_assignments, 2);
  assert.equal(riepilogo.counts[result.season.id].trainer_assignments, 0);
});
