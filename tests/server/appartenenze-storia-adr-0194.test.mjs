import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * ADR-0194 §19/§34 — **la storia non si riclassifica con l'appartenenza
 * corrente**. Mario e Under 15, fa un allenamento Under 15 (presente) e una
 * convocazione in gara; poi passa Under 17 e l'Under 15 corrente se ne va.
 * L'allenamento resta Under 15, la presenza resta sua e del suo contesto, il
 * rapporto di settembre lo dice ancora Under 15, l'audit dell'evento non
 * cambia; la scheda dice Under 17 e nessuna riga corrente Under 15.
 */

const CLUB = "aaaaaaaa-1934-4000-8000-00000000000a";
const DIREZIONE = "11111111-1934-4000-8000-000000000001";
const MARIO = "a1a1a1a1-1934-4000-8000-000000000001";
const T1 = "eeeeeeee-1934-4000-8000-000000000001";
const G1 = "eeeeeeee-1934-4000-8000-000000000002";

let eventi;
let appartenenze;
let statistiche;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  eventi = await import("../../src/lib/server/events.ts");
  appartenenze = await import("../../src/lib/server/athlete-category-memberships.ts");
  statistiche = await import("../../src/lib/category-athlete-stats.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import("../../src/lib/server/prisma.ts"));
});

const scope = { userId: DIREZIONE, activeOrganizationId: CLUB, activeRole: "owner", allowedOrganizationIds: [CLUB], accessScopes: [] };
const categoria = (id, name) => ({ id: `cri-${id}`, organization_id: CLUB, resource_type: "categories", name, payload: { id, name } });

const seme = () => ({
  user: [{ id: DIREZIONE, email: "direzione@club.it", role: "owner" }],
  club: [
    {
      id: CLUB,
      slug: "club",
      name: "Club",
      creator_id: DIREZIONE,
      categories: [],
      club_sites: [],
      category_groups: [],
      trainers: [],
      staff_members: [],
      trainings: [],
      matches: [],
      settings: {},
      created_at: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
  organizationUser: [{ id: "ou-1", organization_id: CLUB, user_id: DIREZIONE, role: "owner" }],
  clubResourceItem: [categoria("u15", "Under 15"), categoria("u17", "Under 17"), categoria("u19", "Under 19")],
  athlete: [
    { id: MARIO, organization_id: CLUB, first_name: "Mario", last_name: "Rossi", status: "active", category_id: "u15", category_name: "Under 15", data: { category: "u15" }, anonymized_at: null },
  ],
  athleteCategoryMembership: [
    { id: "m-1", organization_id: CLUB, athlete_id: MARIO, category_id: "u15", category_name: "Under 15", is_primary: true, site_id: null, created_at: new Date("2026-08-01T00:00:00.000Z") },
  ],
  clubEvent: [
    {
      id: T1,
      organization_id: CLUB,
      kind: "training",
      legacy_id: "training-t1",
      title: "Allenamento Under 15",
      status: "scheduled",
      category_id: "u15",
      category_ids: ["u15"],
      category_name: "Under 15",
      group_ids: [],
      starts_at: new Date("2026-09-01T17:30:00.000Z"),
      ends_at: new Date("2026-09-01T19:00:00.000Z"),
      version: 1,
      payload: { id: "training-t1" },
    },
    {
      id: G1,
      organization_id: CLUB,
      kind: "match",
      legacy_id: "match-g1",
      title: "Gara Under 15",
      status: "scheduled",
      category_id: "u15",
      category_ids: ["u15"],
      category_name: "Under 15",
      group_ids: [],
      starts_at: new Date("2026-09-06T15:00:00.000Z"),
      ends_at: new Date("2026-09-06T17:00:00.000Z"),
      version: 1,
      payload: { id: "match-g1" },
    },
  ],
  clubEventParticipant: [],
  auditLog: [],
});

beforeEach(() => {
  fake = createFakePrisma(seme());
  setPrismaClientForTests(fake.client);
});

const fotografia = () => ({
  eventi: JSON.stringify(fake.rows("clubEvent").map(({ id, category_id, category_ids, category_name, status, version }) => ({ id, category_id, category_ids, category_name, status, version }))),
  righe: JSON.stringify(fake.rows("clubEventParticipant").map(({ event_id, athlete_id, status, convocation_status, is_extra_category }) => ({ event_id, athlete_id, status, convocation_status, is_extra_category }))),
  auditEventi: JSON.stringify(fake.rows("auditLog").filter((r) => r.resource === "club_event_participants" || r.resource === "club_events")),
});

const rapportoSettembre = () => {
  const allenamenti = fake.rows("clubEvent").filter((e) => e.kind === "training").map((e) => ({ id: e.legacy_id, category: e.category_id, categoryId: e.category_id, date: e.starts_at.toISOString().slice(0, 10), status: e.status }));
  const gare = fake.rows("clubEvent").filter((e) => e.kind === "match").map((e) => ({ id: e.legacy_id, category: e.category_id, categoryId: e.category_id, date: e.starts_at.toISOString().slice(0, 10), status: e.status }));
  const presenze = fake.rows("clubEventParticipant").map((r) => {
    const evento = fake.rows("clubEvent").find((e) => e.id === r.event_id);
    return { training_id: evento.legacy_id, athlete_id: r.athlete_id, status: r.status, convocation_status: r.convocation_status, is_extra_category: r.is_extra_category };
  });
  const atleti = fake.rows("athlete").map((a) => ({ ...a, category_memberships: fake.rows("athleteCategoryMembership").filter((m) => m.athlete_id === a.id) }));
  const catalogo = [{ id: "u15", name: "Under 15" }, { id: "u17", name: "Under 17" }, { id: "u19", name: "Under 19" }];
  return { u15: statistiche.calculateCategoryAthleteStats("u15", atleti, allenamenti, presenze, gare, catalogo), u17: statistiche.calculateCategoryAthleteStats("u17", atleti, allenamenti, presenze, gare, catalogo) };
};

const registraStoria = async () => {
  await eventi.saveEventAttendance(scope, T1, [{ athleteId: MARIO, status: "present" }]);
  await eventi.saveEventConvocations(scope, G1, [{ athleteId: MARIO, status: "convocated" }]);
};

test("§34 — U15 primaria → U17: allenamento, presenza, convocazione, rapporto e audit dell'evento restano Under 15; la scheda e Under 17 senza U15 corrente", async () => {
  await registraStoria();
  const prima = fotografia();
  const rapportoPrima = rapportoSettembre();
  assert.equal(rapportoPrima.u15[0]?.presences, 1, "a settembre Mario e presente a T1 come Under 15");
  assert.equal(rapportoPrima.u15[0]?.convocations, 1);
  assert.equal(rapportoPrima.u15[0]?.formerMember, false);
  const rigaPresenza = fake.rows("clubEventParticipant").find((r) => r.event_id === T1);
  assert.equal(rigaPresenza.is_extra_category, false, "la fotografia dice: era della categoria dell'evento");

  const esito = await appartenenze.applyMembershipChange(scope, { athleteIds: [MARIO], command: { kind: "assign", categoryId: "u17", role: "primary" } });
  assert.equal(esito.totals.updated, 1);

  /* La scheda: Under 17, nessuna Under 15 corrente. */
  const righe = fake.rows("athleteCategoryMembership").filter((m) => m.athlete_id === MARIO);
  assert.deepEqual(righe.map((m) => `${m.category_id}:${m.is_primary ? "P" : "S"}`), ["u17:P"]);
  assert.equal(fake.rows("athlete")[0].category_id, "u17");

  /* La storia: identica, byte per byte. */
  const dopo = fotografia();
  assert.equal(dopo.eventi, prima.eventi, "l'allenamento e la gara sono ancora Under 15, stessa versione");
  assert.equal(dopo.righe, prima.righe, "la presenza e la convocazione non sono state toccate ne riclassificate");
  assert.equal(dopo.auditEventi, prima.auditEventi, "l'audit degli eventi non cambia");

  /* Il rapporto di settembre: Mario, Under 15, presente a T1 — non Under 17. */
  const rapporto = rapportoSettembre();
  const marioU15 = rapporto.u15.find((r) => r.athleteId === MARIO);
  assert.ok(marioU15, "Mario resta nel rapporto Under 15");
  assert.equal(marioU15.categoryName, "Under 15");
  assert.equal(marioU15.presences, 1);
  assert.equal(marioU15.convocations, 1);
  assert.equal(marioU15.formerMember, true, "e il rapporto dice che oggi e altrove, invece di far sparire le presenze");
  const marioU17 = rapporto.u17.find((r) => r.athleteId === MARIO);
  assert.ok(marioU17, "e nel rapporto Under 17 come membro corrente");
  assert.equal(marioU17.presences, 0, "senza presenze Under 17: T1 non e diventato Under 17");

  /* Il contesto della presenza, letto con l'appartenenza di oggi: «della categoria», non «extra». */
  const { getParticipationCategoryContext } = await import("../../src/lib/athlete-category-memberships.ts");
  const atletaOggi = { ...fake.rows("athlete")[0], category_memberships: righe };
  assert.equal(
    getParticipationCategoryContext({ athlete: atletaOggi, eventCategories: ["u15"], entry: { status: "present", is_extra_category: false } }),
    "member",
  );
  assert.equal(
    getParticipationCategoryContext({ athlete: atletaOggi, eventCategories: ["u15"], entry: null }),
    "extra",
    "senza riga registrata vale l'appartenenza corrente, come prima",
  );

  /* L'audit del cambio: prima e dopo. */
  const cambio = fake.rows("auditLog").find((r) => r.action === "athlete.memberships.changed");
  assert.deepEqual(cambio.metadata.before, [{ categoryId: "u15", isPrimary: true, siteId: null }]);
  assert.deepEqual(cambio.metadata.after, [{ categoryId: "u17", isPrimary: true, siteId: null }]);
});

test("§34 bis — U15 primaria + U19 secondaria → U17 primaria: U19 resta, la storia Under 15 pure", async () => {
  await fake.client.athleteCategoryMembership.create({ data: { id: "m-2", organization_id: CLUB, athlete_id: MARIO, category_id: "u19", category_name: "Under 19", is_primary: false, site_id: null } });
  await registraStoria();
  const prima = fotografia();

  await appartenenze.applyMembershipChange(scope, { athleteIds: [MARIO], command: { kind: "assign", categoryId: "u17", role: "primary" } });

  const righe = fake.rows("athleteCategoryMembership").filter((m) => m.athlete_id === MARIO).map((m) => `${m.category_id}:${m.is_primary ? "P" : "S"}`).sort();
  assert.deepEqual(righe, ["u17:P", "u19:S"], "la secondaria non coinvolta resta");
  assert.equal(fotografia().righe, prima.righe);
  assert.equal(fotografia().eventi, prima.eventi);
  const marioU15 = rapportoSettembre().u15.find((r) => r.athleteId === MARIO);
  assert.equal(marioU15?.presences, 1);
  assert.equal(marioU15?.formerMember, true);
});

test("l'appello fotografa chi e della categoria dell'evento alla prima registrazione, e non riscrive la fotografia dopo", async () => {
  await eventi.saveEventAttendance(scope, T1, [{ athleteId: MARIO, status: "present" }]);
  assert.equal(fake.rows("clubEventParticipant")[0].is_extra_category, false);
  await appartenenze.applyMembershipChange(scope, { athleteIds: [MARIO], command: { kind: "assign", categoryId: "u17", role: "primary" } });
  /* Un secondo appello sullo stesso evento corregge lo stato, non la fotografia. */
  await eventi.saveEventAttendance(scope, T1, [{ athleteId: MARIO, status: "absent" }]);
  const riga = fake.rows("clubEventParticipant")[0];
  assert.equal(riga.status, "absent");
  assert.equal(riga.is_extra_category, false, "la fotografia resta quella della prima registrazione");
});
