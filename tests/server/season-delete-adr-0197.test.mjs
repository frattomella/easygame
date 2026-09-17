import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Eliminare una stagione** (ADR-0197 §30–§36, matrice §46 n. 35–42).
 *
 * Una stagione vuota si elimina con una conferma scritta; l'attiva no; una
 * stagione con storia (eventi, presenze, movimenti, tesserati…) si blocca,
 * con l'elenco di cio che la blocca; una conferma sbagliata si rifiuta; le
 * assegnazioni degli allenatori alle categorie eliminate si staccano; la
 * stagione piu vecchia con record senza annata non si elimina.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-0000000001d1";
const A = "s-a";
const B = "s-b";
const C = "s-c";

const stagioni = () => ({
  activeSeasonId: B,
  seasons: [
    { id: A, label: "2025/26", startDate: "2025-07-01", endDate: "2026-06-30", status: "archived", createdAt: "2025-01-01T00:00:00.000Z" },
    { id: B, label: "2026/27", startDate: "2026-07-01", endDate: "2027-06-30", status: "active", createdAt: "2026-01-01T00:00:00.000Z" },
    { id: C, label: "2027/28", startDate: "2027-07-01", endDate: "2028-06-30", status: "upcoming", createdAt: "2026-09-01T00:00:00.000Z" },
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
    voce("cat-a", "categories", { name: "U15", seasonId: A }),
    voce("cat-b", "categories", { name: "U15", seasonId: B }),
    voce("cat-c", "categories", { name: "U15", seasonId: C }),
    voce("grp-c", "category_groups", { categoryId: "cat-c", siteId: "sede", seasonId: C }),
    voce("plan-c", "payment_plans", { name: "Quota", seasonId: C }),
    voce("ws-c", "weekly_schedule", { day: "Lunedì", startTime: "18:00", endTime: "19:00", categoryId: "cat-c", seasonId: C }),
    voce("trainer-rossi", "trainers", { name: "Coach Rossi", categories: ["cat-a", "cat-c"], groupIds: ["grp-c"] }),
  ],
  clubEvent: [
    { id: "ev-a", organization_id: CLUB, kind: "training", legacy_id: "ev-a", status: "scheduled", season_id: A, starts_at: new Date("2025-09-01T18:00:00.000Z"), version: 1, payload: {} },
  ],
  clubEventParticipant: [
    { id: "p-a", organization_id: CLUB, event_id: "ev-a", athlete_id: "ath-1", status: "present" },
  ],
  athleteCategoryMembership: [
    { id: "m-a", organization_id: CLUB, athlete_id: "ath-1", category_id: "cat-a", category_name: "U15", is_primary: true },
  ],
  accountingEntry: [],
  documentRequest: [],
  generatedDocument: [],
  formSubmission: [],
  appointment: [],
  sportWorkRelationship: [],
  athletePayment: [],
  auditLog: [],
});

let del;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  del = await import("../../src/lib/server/season-delete.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import("../../src/lib/server/prisma.ts"));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const stagioniSalvate = () => fake.rows("club")[0].settings.seasons.map((s) => s.id).sort();
const items = (type) => fake.rows("clubResourceItem").filter((r) => r.resource_type === type).map((r) => r.payload);

test("§35 · la stagione attiva non si elimina, e nessun'altra viene scelta al posto suo", async () => {
  const impact = await del.summarizeSeasonDeleteImpact({ organizationId: CLUB, seasonId: B });
  assert.equal(impact.isActive, true);
  assert.equal(impact.canDelete, false);
  await assert.rejects(
    () => del.deleteClubSeason({ organizationId: CLUB, seasonId: B, confirmation: "ELIMINA 2026/27" }),
    /Prima di eliminare questa stagione, imposta un'altra stagione come attiva/,
  );
  assert.deepEqual(stagioniSalvate(), [A, B, C]);
  assert.equal(fake.rows("club")[0].settings.activeSeasonId, B);
});

test("§36 · una stagione futura e vuota si elimina: configurazione via, allenatori staccati, storia intatta", async () => {
  const impact = await del.summarizeSeasonDeleteImpact({ organizationId: CLUB, seasonId: C });
  assert.equal(impact.canDelete, true);
  assert.equal(impact.confirmationText, "ELIMINA 2027/28");
  const conteggi = Object.fromEntries(impact.entries.map((e) => [e.key, e.count]));
  assert.equal(conteggi.categories, 1);
  assert.equal(conteggi.category_groups, 1);
  assert.equal(conteggi.payment_plans, 1);
  assert.equal(conteggi.weekly_schedule, 1);
  assert.equal(conteggi.trainer_assignments, 2, "una categoria e un gruppo di Rossi");
  assert.equal(conteggi.events, 0);
  assert.equal(conteggi.memberships, 0);

  const result = await del.deleteClubSeason({ organizationId: CLUB, seasonId: C, confirmation: "ELIMINA 2027/28" });
  assert.deepEqual(stagioniSalvate(), [A, B]);
  assert.equal(fake.rows("club")[0].settings.activeSeasonId, B);
  assert.deepEqual(items("categories").map((c) => c.id).sort(), ["cat-a", "cat-b"]);
  assert.deepEqual(items("category_groups"), []);
  assert.deepEqual(items("payment_plans"), []);
  assert.deepEqual(items("weekly_schedule"), []);
  assert.equal(result.detachedTrainerAssignments, 2);
  const rossi = items("trainers")[0];
  assert.deepEqual(rossi.categories, ["cat-a"], "la A resta: storico");
  assert.deepEqual(rossi.groupIds, []);
  // §42: nessun orfano — la storia della A e intatta.
  assert.equal(fake.rows("clubEvent").length, 1);
  assert.equal(fake.rows("clubEventParticipant").length, 1);
  assert.equal(fake.rows("athleteCategoryMembership").length, 1);
});

test("§37 · una conferma sbagliata si rifiuta e non scrive niente", async () => {
  await assert.rejects(
    () => del.deleteClubSeason({ organizationId: CLUB, seasonId: C, confirmation: "elimina 2027/28" }),
    /Per confermare scrivi esattamente: ELIMINA 2027\/28/,
  );
  await assert.rejects(
    () => del.deleteClubSeason({ organizationId: CLUB, seasonId: C, confirmation: "" }),
    /Per confermare scrivi esattamente/,
  );
  assert.deepEqual(stagioniSalvate(), [A, B, C]);
  assert.equal(items("categories").length, 3);
});

test("§40 · una stagione con storia si blocca, e dice cosa la blocca", async () => {
  const impact = await del.summarizeSeasonDeleteImpact({ organizationId: CLUB, seasonId: A });
  assert.equal(impact.canDelete, false);
  const chiavi = impact.blockers.map((b) => b.key).sort();
  assert.deepEqual(chiavi, ["events", "memberships", "participants"]);
  await assert.rejects(
    () => del.deleteClubSeason({ organizationId: CLUB, seasonId: A, confirmation: "ELIMINA 2025/26" }),
    /contiene dati storici che non si cancellano \(1 allenamenti e gare, 1 presenze e convocazioni, 1 tesserati nelle squadre\): archiviala/,
  );
  assert.deepEqual(stagioniSalvate(), [A, B, C]);
  assert.equal(items("categories").length, 3);
});

test("§39 · un altro club non vede ne elimina la stagione", async () => {
  await assert.rejects(
    () => del.summarizeSeasonDeleteImpact({ organizationId: "bbbbbbbb-0000-4000-8000-000000000002", seasonId: C }),
    /Stagione non trovata|Club non trovato/,
  );
  assert.deepEqual(stagioniSalvate(), [A, B, C]);
});

test("la stagione piu vecchia con record senza annata non si elimina", async () => {
  fake = createFakePrisma({
    ...seed(),
    club: [{ id: CLUB, slug: "club", name: "Club", settings: { ...stagioni(), activeSeasonId: C } }],
    clubResourceItem: [
      voce("cat-legacy", "categories", { name: "Pulcini" }), // senza stagione: e della A per regola
      voce("cat-c", "categories", { name: "U15", seasonId: C }),
    ],
    clubEvent: [],
    clubEventParticipant: [],
    athleteCategoryMembership: [],
  });
  setPrismaClientForTests(fake.client);
  const impact = await del.summarizeSeasonDeleteImpact({ organizationId: CLUB, seasonId: A });
  assert.equal(impact.isLegacy, true);
  assert.ok(impact.blockers.some((b) => b.key === "legacy_records" && b.count === 1));
  assert.equal(impact.canDelete, false);
});

test("un contesto senza stagioni salvate non ha niente da eliminare", async () => {
  fake = createFakePrisma({ ...seed(), club: [{ id: CLUB, slug: "club", name: "Club", settings: {} }] });
  setPrismaClientForTests(fake.client);
  await assert.rejects(
    () => del.summarizeSeasonDeleteImpact({ organizationId: CLUB, seasonId: "season-2026-2027" }),
    /Stagione non trovata/,
  );
});
