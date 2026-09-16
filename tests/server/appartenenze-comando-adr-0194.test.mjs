import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * ADR-0194 — il comando canonico delle appartenenze (§10, §32): permesso,
 * tenant, perimetro, anteprima = applicazione, atomicita a lotti, audit
 * prima/dopo, idempotenza, coppie categoria/sede vietate anche sul registro
 * generico. La concorrenza vera sull'indice parziale la prova
 * `scripts/prova-appartenenze-concorrenti.mjs` sul database.
 */

const CLUB = "aaaaaaaa-1194-4000-8000-00000000000a";
const ALTRO_CLUB = "bbbbbbbb-1194-4000-8000-00000000000b";
const DIREZIONE = "11111111-1194-4000-8000-000000000001";
const ALLENATORE = "22222222-1194-4000-8000-000000000002";
const ALTRA_DIREZIONE = "44444444-1194-4000-8000-000000000004";
const A = "a1a1a1a1-1194-4000-8000-000000000001";
const B = "a1a1a1a1-1194-4000-8000-000000000002";
const C = "a1a1a1a1-1194-4000-8000-000000000003";
const D = "a1a1a1a1-1194-4000-8000-000000000004";
const ESTRANEO = "a1a1a1a1-1194-4000-8000-000000000009";

let dominio;
let guard;
let risorse;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  dominio = await import("../../src/lib/server/athlete-category-memberships.ts");
  guard = await import("../../src/lib/server/category-write-guard.ts");
  risorse = await import("../../src/lib/server/resources.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import("../../src/lib/server/prisma.ts"));
});

const categoria = (id, name) => ({ id: `cri-${id}`, organization_id: CLUB, resource_type: "categories", name, payload: { id, name } });
const atleta = (id, nome, categoryId) => ({
  id,
  organization_id: CLUB,
  first_name: nome,
  last_name: "Prova",
  birth_date: new Date("2012-01-01T00:00:00.000Z"),
  status: "active",
  category_id: categoryId,
  category_name: categoryId ? categoryId.toUpperCase() : null,
  data: { category: categoryId, siteId: "vecchia-copia" },
  anonymized_at: null,
});
const riga = (id, athleteId, categoryId, isPrimary, siteId = "scauri") => ({
  id: `m-${id}`,
  organization_id: CLUB,
  athlete_id: athleteId,
  category_id: categoryId,
  category_name: categoryId.toUpperCase(),
  is_primary: isPrimary,
  site_id: siteId,
  created_at: new Date("2026-01-01T00:00:00.000Z"),
});

const seme = () => ({
  user: [
    { id: DIREZIONE, email: "direzione@club.it", role: "owner" },
    { id: ALLENATORE, email: "coach@club.it", role: "trainer" },
    { id: ALTRA_DIREZIONE, email: "altra@club.it", role: "owner" },
  ],
  club: [
    {
      id: CLUB,
      slug: "club",
      name: "Club",
      creator_id: DIREZIONE,
      categories: [],
      club_sites: [
        { id: "scauri", name: "Scauri", active: true },
        { id: "cosma", name: "S. Cosma", active: true },
      ],
      category_groups: [
        { categoryId: "u15", siteId: "scauri", active: true },
        { categoryId: "u17", siteId: "scauri", active: true },
        { categoryId: "u19", siteId: "scauri", active: true },
        { categoryId: "pulcini", siteId: "cosma", active: true },
      ],
      settings: {},
      created_at: new Date("2026-01-01T00:00:00.000Z"),
    },
    { id: ALTRO_CLUB, slug: "altro", name: "Altro", creator_id: ALTRA_DIREZIONE, categories: [{ id: "u15", name: "Under 15" }], club_sites: [], category_groups: [], settings: {}, created_at: new Date("2026-01-01T00:00:00.000Z") },
  ],
  organizationUser: [
    { id: "ou-1", organization_id: CLUB, user_id: DIREZIONE, role: "owner" },
    { id: "ou-2", organization_id: CLUB, user_id: ALLENATORE, role: "trainer" },
    { id: "ou-4", organization_id: ALTRO_CLUB, user_id: ALTRA_DIREZIONE, role: "owner" },
  ],
  clubResourceItem: [categoria("u15", "Under 15"), categoria("u17", "Under 17"), categoria("u19", "Under 19"), categoria("pulcini", "Pulcini"), categoria("serie-c", "Serie C")],
  athlete: [
    atleta(A, "Anna", "u15"),
    atleta(B, "Bruno", "u15"),
    atleta(C, "Carla", "u15"),
    atleta(D, "Dario", "u17"),
    { ...atleta(ESTRANEO, "Estraneo", "u15"), organization_id: ALTRO_CLUB },
  ],
  athleteCategoryMembership: [
    riga("a1", A, "u15", true),
    riga("b1", B, "u15", true),
    riga("b2", B, "u17", false),
    riga("c1", C, "u15", true),
    riga("c2", C, "u17", false),
    riga("c3", C, "u19", false),
    riga("d1", D, "u17", true),
    { ...riga("e1", ESTRANEO, "u15", true), organization_id: ALTRO_CLUB },
  ],
  auditLog: [],
});

const scopeDirezione = { userId: DIREZIONE, activeOrganizationId: CLUB, activeRole: "owner", allowedOrganizationIds: [CLUB], accessScopes: [] };
const scopeAllenatore = { userId: ALLENATORE, activeOrganizationId: CLUB, activeRole: "trainer", allowedOrganizationIds: [CLUB], accessScopes: [] };
const scopeAltroClub = { userId: ALTRA_DIREZIONE, activeOrganizationId: ALTRO_CLUB, activeRole: "owner", allowedOrganizationIds: [ALTRO_CLUB], accessScopes: [] };

beforeEach(() => {
  fake = createFakePrisma(seme());
  setPrismaClientForTests(fake.client);
});

const righeDi = async (athleteId) =>
  (await fake.client.athleteCategoryMembership.findMany({ where: { athlete_id: athleteId } }))
    .map((r) => `${r.category_id}:${r.is_primary ? "P" : "S"}:${r.site_id || "-"}`)
    .sort();
const audit = async (action) => (await fake.client.auditLog.findMany({})).filter((r) => r.action === action);
const u17 = (extra = {}) => ({ kind: "assign", categoryId: "u17", role: "primary", ...extra });

test("§32.1-3 — primaria A → primaria B in blocco: B [P], A rimossa, non declassata; proiezione e colonna riallineate", async () => {
  const esito = await dominio.applyMembershipChange(scopeDirezione, { athleteIds: [A], command: u17() });
  assert.equal(esito.mode, "apply");
  assert.equal(esito.totals.updated, 1);
  assert.deepEqual(await righeDi(A), ["u17:P:scauri"]);
  const scheda = await fake.client.athlete.findUnique({ where: { id: A } });
  assert.equal(scheda.category_id, "u17");
  assert.equal(scheda.data.category, "u17");
  assert.deepEqual(scheda.data.categories, ["Under 17"]);
  assert.equal(scheda.data.categoryMemberships.length, 1);
  assert.equal(scheda.data.siteId, undefined, "la copia legacy della sede in data non si riscrive (ADR-0194 §25)");
  assert.equal(esito.target.siteName, "Scauri", "la sede si deriva dalla squadra: nessun selettore di sede");
});

test("§32.4 — mantieni la vecchia primaria come secondaria", async () => {
  await dominio.applyMembershipChange(scopeDirezione, { athleteIds: [A], command: u17({ previousPrimaryPolicy: "keep_as_secondary" }) });
  assert.deepEqual(await righeDi(A), ["u15:S:scauri", "u17:P:scauri"]);
});

test("§32.5-7 — le secondarie non coinvolte restano; «rimuovi tutte»; la secondaria di destinazione si promuove senza doppioni", async () => {
  await dominio.applyMembershipChange(scopeDirezione, { athleteIds: [C], command: u17() });
  assert.deepEqual(await righeDi(C), ["u17:P:scauri", "u19:S:scauri"]);
  const righe = await fake.client.athleteCategoryMembership.findMany({ where: { athlete_id: C, category_id: "u17" } });
  assert.equal(righe.length, 1);
  assert.equal(righe[0].id, "m-c2", "la riga promossa e quella che c'era");

  fake = createFakePrisma(seme());
  setPrismaClientForTests(fake.client);
  await dominio.applyMembershipChange(scopeDirezione, { athleteIds: [C], command: u17({ otherSecondariesPolicy: "remove" }) });
  assert.deepEqual(await righeDi(C), ["u17:P:scauri"]);
});

test("§32.8-9 — destinazione gia primaria: idempotente, nessuna scrittura, nessun audit; un secondo giro sullo stesso comando non cambia niente", async () => {
  const prima = await dominio.applyMembershipChange(scopeDirezione, { athleteIds: [D], command: u17() });
  assert.equal(prima.totals.unchanged, 1);
  assert.equal(prima.athletes[0].status, "unchanged");
  assert.equal((await audit("athlete.memberships.changed")).length, 0);

  await dominio.applyMembershipChange(scopeDirezione, { athleteIds: [A], command: u17() });
  const secondo = await dominio.applyMembershipChange(scopeDirezione, { athleteIds: [A], command: u17() });
  assert.equal(secondo.totals.unchanged, 1);
  assert.deepEqual(await righeDi(A), ["u17:P:scauri"]);
  assert.equal((await audit("athlete.memberships.changed")).length, 1, "una riga di audit sola: la seconda non ha scritto");
});

test("§32.10 — nuova secondaria: la primaria non cambia", async () => {
  await dominio.applyMembershipChange(scopeDirezione, { athleteIds: [A], command: { kind: "assign", categoryId: "u19", role: "secondary" } });
  assert.deepEqual(await righeDi(A), ["u15:P:scauri", "u19:S:scauri"]);
});

test("§32.11-12 — piu atleti con configurazioni miste, in un giro solo, con l'anteprima che dice la stessa cosa dell'applicazione", async () => {
  const anteprima = await dominio.previewMembershipChange(scopeDirezione, { athleteIds: [A, B, C, D], command: u17() });
  assert.equal(anteprima.mode, "preview");
  assert.equal(anteprima.totals.athletes, 4);
  assert.equal(anteprima.totals.updated, 3);
  assert.equal(anteprima.totals.unchanged, 1);
  assert.equal(anteprima.totals.newPrimaries, 3);
  assert.equal(anteprima.totals.promoted, 2, "B e C avevano gia U17 come secondaria");
  assert.equal(anteprima.totals.removedMemberships, 3);
  assert.equal(anteprima.totals.keptSecondaries, 1, "la U19 di C");
  assert.deepEqual(await righeDi(A), ["u15:P:scauri"], "l'anteprima non scrive");

  const esito = await dominio.applyMembershipChange(scopeDirezione, { athleteIds: [A, B, C, D], command: u17() }, {}, { batchId: anteprima.batchId });
  assert.equal(esito.batchId, anteprima.batchId);
  assert.deepEqual(
    esito.athletes.map((a) => [a.name, a.status]),
    [["Anna Prova", "updated"], ["Bruno Prova", "updated"], ["Carla Prova", "updated"], ["Dario Prova", "unchanged"]],
  );
  assert.deepEqual(await righeDi(A), ["u17:P:scauri"]);
  assert.deepEqual(await righeDi(B), ["u17:P:scauri"]);
  assert.deepEqual(await righeDi(C), ["u17:P:scauri", "u19:S:scauri"]);
  assert.deepEqual(await righeDi(D), ["u17:P:scauri"]);
  for (const id of [A, B, C, D]) {
    const primarie = (await fake.client.athleteCategoryMembership.findMany({ where: { athlete_id: id, is_primary: true } })).length;
    assert.equal(primarie, 1, `una primaria sola per ${id}`);
  }
});

test("§32.13 — atleta malformato (due primarie in archivio) e segnalato e non toccato; gli altri procedono", async () => {
  fake = createFakePrisma({
    ...seme(),
    athleteCategoryMembership: [
      { ...riga("a1", A, "u15", true), is_primary: false },
      riga("b1", B, "u15", true),
      riga("b2", B, "u19", false),
    ],
  });
  /* Il doppio applica l'indice: due primarie non si seminano. Il caso «senza primaria con secondarie» e quello che l'archivio ammette. */
  setPrismaClientForTests(fake.client);
  const esito = await dominio.applyMembershipChange(scopeDirezione, { athleteIds: [A, B], command: u17() });
  const anna = esito.athletes.find((a) => a.athleteId === A);
  assert.ok(anna.warnings.includes("missing_primary"), "ATTENZIONE: era senza primaria");
  assert.equal(anna.status, "updated", "assegnare una primaria a chi non ne ha e deterministico");
  assert.deepEqual(await righeDi(A), ["u15:S:scauri", "u17:P:scauri"], "la vecchia riga non era primaria: resta com'era");
  assert.deepEqual(await righeDi(B), ["u17:P:scauri", "u19:S:scauri"]);
  assert.equal(esito.totals.warnings, 1);
});

test("§32.14 — un allenatore non cambia le appartenenze: 403 con la riga di diniego", async () => {
  await assert.rejects(
    () => dominio.applyMembershipChange(scopeAllenatore, { athleteIds: [A], command: u17() }),
    /Accesso negato/,
  );
  await assert.rejects(() => dominio.previewMembershipChange(scopeAllenatore, { athleteIds: [A], command: u17() }), /Accesso negato/);
  assert.equal((await audit("permission.denied")).length >= 1, true);
  assert.deepEqual(await righeDi(A), ["u15:P:scauri"]);
});

test("§32.15 — un atleta di un altro club non si tocca, nemmeno in mezzo a un blocco: niente scritto", async () => {
  await assert.rejects(
    () => dominio.applyMembershipChange(scopeDirezione, { athleteIds: [A, ESTRANEO], command: u17() }),
    /Accesso negato: uno o piu atleti non appartengono al club attivo/,
  );
  assert.deepEqual(await righeDi(A), ["u15:P:scauri"]);
  assert.deepEqual(await righeDi(ESTRANEO), ["u15:P:scauri"]);
  await assert.rejects(() => dominio.applyMembershipChange(scopeAltroClub, { athleteIds: [A], command: u17() }), /Accesso negato/);
});

test("perimetro dell'accesso: chi e ristretto a S. Cosma non sposta nessuno a Scauri, ne tocca un atleta di Scauri", async () => {
  const perimetrato = { ...scopeDirezione, activeRole: "custom:club_manager:segreteria-cosma", accessScopes: [{ kind: "site", value: "cosma" }] };
  await assert.rejects(
    () => dominio.applyMembershipChange(perimetrato, { athleteIds: [A], command: u17() }),
    /Accesso negato/,
  );
  assert.deepEqual(await righeDi(A), ["u15:P:scauri"]);
});

test("§32.17 — audit per atleta con prima, dopo e politica; per il blocco una riga con batchId e i conteggi", async () => {
  const esito = await dominio.applyMembershipChange(scopeDirezione, { athleteIds: [A, C], command: u17({ previousPrimaryPolicy: "keep_as_secondary" }) }, { userId: DIREZIONE, email: "direzione@club.it" });
  const perAtleta = await audit("athlete.memberships.changed");
  assert.equal(perAtleta.length, 2);
  const anna = perAtleta.find((r) => r.resource_id === A);
  assert.equal(anna.metadata.batchId, esito.batchId);
  assert.deepEqual(anna.metadata.policy, { role: "primary", previousPrimary: "keep_as_secondary", otherSecondaries: "keep" });
  assert.deepEqual(anna.metadata.before, [{ categoryId: "u15", isPrimary: true, siteId: "scauri" }]);
  assert.deepEqual(
    anna.metadata.after.map((r) => `${r.categoryId}:${r.isPrimary ? "P" : "S"}`).sort(),
    ["u15:S", "u17:P"],
  );
  assert.equal(anna.actor_user_id, DIREZIONE);
  const blocco = await audit("athlete.memberships.bulk");
  assert.equal(blocco.length, 1);
  assert.equal(blocco[0].resource_id, esito.batchId);
  assert.equal(blocco[0].metadata.count, 2);
  assert.equal(blocco[0].metadata.updated, 2);
});

test("§32.18 — un lotto che fallisce non lascia meta lotto scritto e il rapporto lo dice per ogni atleta", async () => {
  const originale = fake.client.athleteCategoryMembership.create;
  let chiamate = 0;
  fake.client.athleteCategoryMembership.create = async (args) => {
    chiamate += 1;
    if (chiamate === 1) throw new Error("connessione caduta");
    return originale(args);
  };
  const esito = await dominio.applyMembershipChange(scopeDirezione, { athleteIds: [A, B], command: u17() });
  assert.equal(esito.totals.failed, 2, "il lotto e uno: o tutto o niente");
  assert.deepEqual(esito.athletes.map((a) => a.status), ["failed", "failed"]);
  assert.match(esito.athletes[0].error, /connessione caduta/);
  const blocco = await audit("athlete.memberships.bulk");
  assert.equal(blocco[0].outcome, "failure");
  assert.equal(blocco[0].metadata.failed, 2);
});

test("§33.3 — una coppia categoria/sede che il club non ha configurato non e una destinazione: «Pulcini» a Scauri e rifiutato", async () => {
  await assert.rejects(
    () => dominio.applyMembershipChange(scopeDirezione, { athleteIds: [A], command: { kind: "assign", categoryId: "pulcini", siteId: "scauri", role: "primary" } }),
    /non si svolge nella sede «Scauri»/,
  );
  await assert.rejects(
    () => dominio.applyMembershipChange(scopeDirezione, { athleteIds: [A], command: { kind: "assign", categoryId: "u15", siteId: "roma", role: "primary" } }),
    /non esiste nel club/,
  );
  await assert.rejects(
    () => dominio.applyMembershipChange(scopeDirezione, { athleteIds: [A], command: { kind: "assign", categoryId: "sconosciuta", role: "primary" } }),
    /non e una categoria del club/,
  );
  assert.deepEqual(await righeDi(A), ["u15:P:scauri"]);
});

test("§33.7 — il blocco deriva la sede dalla squadra: «Pulcini» senza sede indicata va a S. Cosma, per identificativo di gruppo o per categoria", async () => {
  await dominio.applyMembershipChange(scopeDirezione, { athleteIds: [A], command: { kind: "assign", targetId: "group:pulcini:cosma", role: "primary" } });
  assert.deepEqual(await righeDi(A), ["pulcini:P:cosma"]);
  await dominio.applyMembershipChange(scopeDirezione, { athleteIds: [B], command: { kind: "assign", categoryId: "pulcini", role: "primary" } });
  assert.deepEqual(await righeDi(B), ["pulcini:P:cosma", "u17:S:scauri"]);
});

test("l'insieme intero (scheda, creazione): stesse guardie, una primaria, sede derivata sulle righe nuove, righe storiche non nominate conservate", async () => {
  await fake.client.athleteCategoryMembership.create({
    data: { id: "m-a-storica", organization_id: CLUB, athlete_id: A, category_id: "cancellata", category_name: "Cancellata", is_primary: false, site_id: null },
  });
  const esito = await dominio.replaceAthleteMembershipSet(scopeDirezione, A, [
    { categoryId: "u17", isPrimary: true },
    { category_id: "u19", is_primary: false },
  ]);
  assert.equal(esito.changed, true);
  assert.deepEqual(await righeDi(A), ["cancellata:S:-", "u17:P:scauri", "u19:S:scauri"]);
  await assert.rejects(
    () => dominio.replaceAthleteMembershipSet(scopeDirezione, A, [{ categoryId: "u17", isPrimary: true }, { categoryId: "u19", isPrimary: true }]),
    /al massimo una categoria primaria/,
  );
  await assert.rejects(
    () => dominio.replaceAthleteMembershipSet(scopeDirezione, A, [{ categoryId: "pulcini", siteId: "scauri", isPrimary: true }]),
    /non si svolge nella sede/,
  );
  await assert.rejects(() => dominio.replaceAthleteMembershipSet(scopeAllenatore, A, [{ categoryId: "u17", isPrimary: true }]), /Accesso negato/);
  await assert.rejects(() => dominio.replaceAthleteMembershipSet(scopeAltroClub, A, [{ categoryId: "u17", isPrimary: true }]), /Accesso negato/);
  const ancora = await dominio.replaceAthleteMembershipSet(scopeDirezione, A, [{ categoryId: "u17", isPrimary: true }, { categoryId: "u19", isPrimary: false }]);
  assert.equal(ancora.changed, false, "idempotente");
});

test("§24 — il registro generico rifiuta una riga con una coppia non configurata, deriva la sede su una riga nuova senza sede, e lascia passare la coppia che la riga aveva", async () => {
  await assert.rejects(
    () => risorse.createResource("athlete_category_memberships", { organization_id: CLUB, athlete_id: A, category_id: "pulcini", site_id: "scauri", is_primary: false }, "create", scopeDirezione),
    /non si svolge nella sede «Scauri»/,
  );
  const nuova = await risorse.createResource("athlete_category_memberships", { organization_id: CLUB, athlete_id: A, category_id: "u19", is_primary: false }, "create", scopeDirezione);
  assert.equal(nuova.site_id, "scauri", "la sede e quella della squadra");
  await assert.rejects(
    () => risorse.updateResource("athlete_category_memberships", "m-a1", { site_id: "cosma" }, scopeDirezione),
    /non si svolge nella sede «S. Cosma»/,
  );
  /* Una riga precedente alle sedi che resta com'e passa: il salvataggio di un nome non e una bonifica. */
  await fake.client.athleteCategoryMembership.update({ where: { id: "m-a1" }, data: { site_id: "cosma" } });
  const aggiornata = await risorse.updateResource("athlete_category_memberships", "m-a1", { category_name: "Under 15 bis" }, scopeDirezione);
  assert.equal(aggiornata.site_id, "cosma");
});

test("il vaglio delle coppie: senza gruppi configurati una categoria non ha sedi, e una riga senza sede passa; una sede ignota no", async () => {
  fake = createFakePrisma({ ...seme(), club: seme().club.map((c) => ({ ...c, category_groups: [] })) });
  setPrismaClientForTests(fake.client);
  const senzaSede = { category_id: "u15", site_id: null };
  await guard.assertMembershipPlacementIsCanonical(CLUB, senzaSede, null);
  assert.equal(senzaSede.site_id, null, "nessuna squadra configurata: niente da derivare, niente da vietare");
  await assert.rejects(
    () => guard.assertMembershipPlacementIsCanonical(CLUB, { category_id: "u15", site_id: "scauri" }, null),
    /non si svolge nella sede «Scauri»/,
    "la sede si assegna configurando la squadra, non scrivendola sulla riga",
  );
  await assert.rejects(
    () => guard.assertMembershipPlacementIsCanonical(CLUB, { category_id: "u15", site_id: "qualunque" }, null),
    /non esiste nel club/,
  );
});

/* ── Revisione ostile (seconda passata) ─────────────────────────────────── */

test("A1 — una vecchia primaria fuori dal catalogo scende invece di restare doppia; il piano non la dice «rimossa»", async () => {
  await fake.client.athleteCategoryMembership.update({ where: { id: "m-a1" }, data: { is_primary: false } });
  await fake.client.athleteCategoryMembership.create({
    data: { id: "m-a-vecchia", organization_id: CLUB, athlete_id: A, category_id: "cancellata", category_name: "Cancellata", is_primary: true, site_id: null },
  });
  const anteprima = await dominio.previewMembershipChange(scopeDirezione, { athleteIds: [A], command: u17() });
  assert.equal(anteprima.athletes[0].summary.removed, 0, "la riga fuori catalogo non si dice rimossa");
  assert.ok(anteprima.athletes[0].warnings.includes("legacy_rows_kept"));
  const esito = await dominio.applyMembershipChange(scopeDirezione, { athleteIds: [A], command: u17() });
  assert.equal(esito.athletes[0].status, "updated");
  assert.deepEqual(await righeDi(A), ["cancellata:S:-", "u15:S:scauri", "u17:P:scauri"], "una primaria sola; la riga storica scende e resta");
});

test("A2/D6 — una riga fuori dal perimetro blocca l'atleta, non il lotto; le righe che non cambiano non si vagliano", async () => {
  const perimetrato = { ...scopeDirezione, activeRole: "custom:club_manager:segreteria-scauri", accessScopes: [{ kind: "site", value: "scauri" }] };
  /* B ha una secondaria senza sede: non cambia, quindi non ferma il salvataggio. */
  await fake.client.athleteCategoryMembership.update({ where: { id: "m-b2" }, data: { site_id: null } });
  const esito = await dominio.applyMembershipChange(perimetrato, { athleteIds: [A, B], command: { kind: "assign", categoryId: "u19", role: "primary" } });
  assert.deepEqual(esito.athletes.map((a) => a.status), ["updated", "updated"]);
  /* Una destinazione fuori dal perimetro: 403, prima di tutto. */
  await assert.rejects(
    () => dominio.previewMembershipChange(perimetrato, { athleteIds: [A], command: { kind: "assign", categoryId: "pulcini", role: "primary" } }),
    /Accesso negato/,
  );
});

test("D7 — le firme dell'anteprima: un archivio cambiato nel frattempo blocca l'atleta con «changed_since_preview»", async () => {
  const anteprima = await dominio.previewMembershipChange(scopeDirezione, { athleteIds: [A, B], command: u17() });
  const expected = Object.fromEntries(anteprima.athletes.map((a) => [a.athleteId, a.signature]));
  await dominio.applyMembershipChange(scopeDirezione, { athleteIds: [B], command: { kind: "assign", categoryId: "u19", role: "secondary" } });
  const esito = await dominio.applyMembershipChange(scopeDirezione, { athleteIds: [A, B], command: u17(), expected }, {}, { batchId: anteprima.batchId });
  assert.equal(esito.athletes[0].status, "updated");
  assert.equal(esito.athletes[1].status, "blocked");
  assert.ok(esito.athletes[1].warnings.includes("changed_since_preview"));
  assert.deepEqual(await righeDi(B), ["u15:P:scauri", "u17:S:scauri", "u19:S:scauri"], "B non e stato toccato");
});

test("D4 — un ruolo o una politica fuori vocabolario e un errore, non il default piu distruttivo", async () => {
  await assert.rejects(() => dominio.applyMembershipChange(scopeDirezione, { athleteIds: [A], command: { kind: "assign", categoryId: "u17", role: "Secondary" } }), /ruolo/);
  await assert.rejects(() => dominio.applyMembershipChange(scopeDirezione, { athleteIds: [A], command: { kind: "assign", categoryId: "u17", role: "primary", previousPrimaryPolicy: "keep" } }), /politica sulla primaria/);
  assert.deepEqual(await righeDi(A), ["u15:P:scauri"]);
});

test("D12 — due righe per la stessa categoria in grafie diverse fermano l'atleta", async () => {
  await fake.client.athleteCategoryMembership.create({
    data: { id: "m-a-doppia", organization_id: CLUB, athlete_id: A, category_id: "U15", category_name: "Under 15", is_primary: false, site_id: null },
  });
  const esito = await dominio.applyMembershipChange(scopeDirezione, { athleteIds: [A], command: u17() });
  assert.equal(esito.athletes[0].status, "blocked");
  assert.ok(esito.athletes[0].warnings.includes("duplicate_rows"));
});

test("D2 — l'insieme intero con le righe attese: un archivio cambiato nel frattempo non si sovrascrive", async () => {
  await assert.rejects(
    () => dominio.replaceAthleteMembershipSet(scopeDirezione, A, [{ categoryId: "u17", isPrimary: true }], {}, { expectedRowIds: ["m-qualcun-altro"] }),
    /cambiate nel frattempo/,
  );
  assert.deepEqual(await righeDi(A), ["u15:P:scauri"]);
  const esito = await dominio.replaceAthleteMembershipSet(scopeDirezione, A, [{ categoryId: "u17", isPrimary: true }], {}, { expectedRowIds: ["m-a1"] });
  assert.equal(esito.athlete.category_id, "u17", "la proiezione torna con le righe");
  assert.deepEqual(esito.athlete.data.categories, ["Under 17"]);
});

test("D3 — dal registro generico le appartenenze non si scrivono: la rotta lo dice", async () => {
  const { readFileSync } = await import("node:fs");
  for (const file of ["src/app/api/v1/[resource]/route.ts", "src/app/api/v1/[resource]/[id]/route.ts"]) {
    const codice = readFileSync(file, "utf8");
    assert.match(codice, /assertMembershipsWrittenByTheirWriter\(resource\)/, file);
  }
});
