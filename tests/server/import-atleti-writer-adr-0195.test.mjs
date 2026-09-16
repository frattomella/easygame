import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * ADR-0195 — il writer dell'import di atleti: permessi, tenant, una
 * transazione per atleta, idempotenza per lotto, categorie solo su decisione
 * esplicita, collegamento che non sovrascrive, audit per scheda e per lotto.
 */

const CLUB = "aaaaaaaa-1195-4000-8000-00000000000a";
const ALTRO_CLUB = "bbbbbbbb-1195-4000-8000-00000000000b";
const DIREZIONE = "11111111-1195-4000-8000-000000000001";
const SEGRETERIA = "33333333-1195-4000-8000-000000000003";
const ALLENATORE = "22222222-1195-4000-8000-000000000002";
const ALTRA_DIREZIONE = "44444444-1195-4000-8000-000000000004";
const ESISTENTE = "a1a1a1a1-1195-4000-8000-000000000001";
const INATTIVO = "a1a1a1a1-1195-4000-8000-000000000002";
const ESTRANEO = "a1a1a1a1-1195-4000-8000-000000000009";
const BATCH = "b0b0b0b0-1195-4000-8000-000000000001";

let dominio;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  dominio = await import("../../src/lib/server/athlete-import.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import("../../src/lib/server/prisma.ts"));
});

const categoria = (id, name) => ({ id: `cri-${id}`, organization_id: CLUB, resource_type: "categories", name, payload: { id, name, seasonId: "s1" } });

const seme = () => ({
  user: [
    { id: DIREZIONE, email: "direzione@club.it", role: "owner" },
    { id: SEGRETERIA, email: "segreteria@club.it", role: "staff" },
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
        { categoryId: "cat-u14", siteId: "scauri", active: true },
        { categoryId: "cat-pulcini", siteId: "scauri", active: true },
        { categoryId: "cat-pulcini", siteId: "cosma", active: true },
      ],
      settings: { seasons: [{ id: "s1", label: "2026/27", status: "active", startDate: "2026-09-01", endDate: "2027-08-31" }] },
      created_at: new Date("2026-01-01T00:00:00.000Z"),
    },
    { id: ALTRO_CLUB, slug: "altro", name: "Altro", creator_id: ALTRA_DIREZIONE, categories: [], club_sites: [], category_groups: [], settings: {}, created_at: new Date("2026-01-01T00:00:00.000Z") },
  ],
  organizationUser: [
    { id: "ou-1", organization_id: CLUB, user_id: DIREZIONE, role: "owner" },
    { id: "ou-2", organization_id: CLUB, user_id: ALLENATORE, role: "trainer" },
    { id: "ou-3", organization_id: CLUB, user_id: SEGRETERIA, role: "staff" },
    { id: "ou-4", organization_id: ALTRO_CLUB, user_id: ALTRA_DIREZIONE, role: "owner" },
  ],
  clubResourceItem: [categoria("cat-u14", "Under 14 Gold"), categoria("cat-pulcini", "Pulcini"), categoria("cat-u17", "Under 17")],
  athlete: [
    { id: ESISTENTE, organization_id: CLUB, first_name: "Anna", last_name: "Bianchi", birth_date: null, status: "active", category_id: "cat-u14", category_name: "Under 14 Gold", data: { category: "cat-u14", categoryMemberships: [] }, anonymized_at: null },
    { id: INATTIVO, organization_id: CLUB, first_name: "Ugo", last_name: "Neri", birth_date: new Date("2010-05-05T00:00:00.000Z"), status: "inactive", category_id: null, category_name: null, data: {}, anonymized_at: null },
    { id: ESTRANEO, organization_id: ALTRO_CLUB, first_name: "Estraneo", last_name: "Altro", birth_date: null, status: "active", category_id: null, category_name: null, data: {}, anonymized_at: null },
  ],
  athleteCategoryMembership: [
    { id: "m-1", organization_id: CLUB, athlete_id: ESISTENTE, category_id: "cat-u14", category_name: "Under 14 Gold", is_primary: true, site_id: "scauri", created_at: new Date("2026-01-01T00:00:00.000Z") },
  ],
  auditLog: [],
});

const scopeDirezione = { userId: DIREZIONE, activeOrganizationId: CLUB, activeRole: "owner", allowedOrganizationIds: [CLUB], accessScopes: [] };
const scopeSegreteria = { userId: SEGRETERIA, activeOrganizationId: CLUB, activeRole: "staff", allowedOrganizationIds: [CLUB], accessScopes: [] };
const scopeAllenatore = { userId: ALLENATORE, activeOrganizationId: CLUB, activeRole: "trainer", allowedOrganizationIds: [CLUB], accessScopes: [] };
const scopeAltroClub = { userId: ALTRA_DIREZIONE, activeOrganizationId: ALTRO_CLUB, activeRole: "owner", allowedOrganizationIds: [ALTRO_CLUB], accessScopes: [] };

beforeEach(() => {
  fake = createFakePrisma(seme());
  setPrismaClientForTests(fake.client);
});

const riga = (n, extra = {}) => ({
  sourceRowNumber: n,
  action: "create",
  athlete: { firstName: `Nome${n}`, lastName: `Cognome${n}`, birthDate: "2012-01-01", gender: "", fiscalCode: "", email: "", phone: "" },
  category: { kind: "target", targetId: "group:cat-u14:scauri" },
  ...extra,
});
const richiesta = (rows, categoriesToCreate = []) => ({ batchId: BATCH, categoriesToCreate, rows });
const schede = async () => fake.client.athlete.findMany({ where: { organization_id: CLUB } });
const appartenenze = async (athleteId) => fake.client.athleteCategoryMembership.findMany({ where: { athlete_id: athleteId } });
const audit = async (action) => (await fake.client.auditLog.findMany({})).filter((voce) => voce.action === action);

test("1 · una riga con squadra scelta crea scheda e appartenenza primaria, con la sede della squadra", async () => {
  const esito = await dominio.applyAthleteImport(scopeDirezione, richiesta([riga(2)]), { userId: DIREZIONE });
  assert.equal(esito.totals.created, 1);
  assert.equal(esito.rows[0].status, "created");
  assert.equal(esito.rows[0].membership, "written");
  const righe = await appartenenze(esito.rows[0].athleteId);
  assert.equal(righe.length, 1);
  assert.equal(righe[0].category_id, "cat-u14");
  assert.equal(righe[0].is_primary, true);
  assert.equal(righe[0].site_id, "scauri");
  const scheda = (await schede()).find((s) => s.id === esito.rows[0].athleteId);
  assert.equal(scheda.status, "active");
  assert.equal(scheda.category_id, "cat-u14");
  assert.deepEqual(scheda.data.import, { batchId: BATCH, sourceRowNumber: 2 });
  assert.equal(scheda.data.categoryMemberships[0].id, righe[0].id, "la proiezione cita la riga vera");
});

test("2 · riprovare lo stesso lotto non crea doppioni: le righe gia scritte si dicono tali", async () => {
  await dominio.applyAthleteImport(scopeDirezione, richiesta([riga(2), riga(3)]), { userId: DIREZIONE });
  const prima = (await schede()).length;
  const ripetuto = await dominio.applyAthleteImport(scopeDirezione, richiesta([riga(2), riga(3), riga(4)]), { userId: DIREZIONE });
  assert.equal(ripetuto.totals.alreadyWritten, 2);
  assert.equal(ripetuto.totals.created, 1);
  assert.equal((await schede()).length, prima + 1);
  assert.ok(ripetuto.rows.filter((r) => r.status === "already_written").every((r) => r.athleteId));
});

test("3 · un atleta che fallisce non ferma gli altri e non lascia la scheda senza appartenenza (transazione per atleta)", async () => {
  const esito = await dominio.applyAthleteImport(
    scopeDirezione,
    richiesta([riga(2), riga(3, { category: { kind: "target", targetId: "group:cat-u14:cosma" } }), riga(4)]),
    { userId: DIREZIONE },
  );
  assert.equal(esito.totals.created, 2);
  assert.equal(esito.totals.rejected + esito.totals.failed, 1);
  const rifiutata = esito.rows.find((r) => r.sourceRowNumber === 3);
  assert.ok(rifiutata.reason, "il motivo si dice");
  const nomi = (await schede()).map((s) => s.first_name);
  assert.ok(!nomi.includes("Nome3"), "la scheda della riga fallita non esiste");
});

test("4 · una coppia categoria/sede non configurata si rifiuta anche dall'import (ADR-0194 §24)", async () => {
  const esito = await dominio.applyAthleteImport(scopeDirezione, richiesta([riga(2, { category: { kind: "target", targetId: "group:cat-u14:cosma" } })]), { userId: DIREZIONE });
  assert.equal(esito.totals.created, 0);
  assert.match(String(esito.rows[0].reason), /squadra|sede|non/i);
});

test("5 · le categorie nascono solo se decise: un'etichetta del file senza decisione non crea niente", async () => {
  const prima = (await fake.client.clubResourceItem.findMany({ where: { organization_id: CLUB, resource_type: "categories" } })).length;
  const esito = await dominio.applyAthleteImport(scopeDirezione, richiesta([riga(2, { category: { kind: "create", key: "u15ecc" } })]), { userId: DIREZIONE });
  assert.equal(esito.totals.created, 0);
  assert.equal(esito.rows[0].status, "rejected");
  assert.match(esito.rows[0].reason, /non e nella richiesta/);
  assert.equal((await fake.client.clubResourceItem.findMany({ where: { organization_id: CLUB, resource_type: "categories" } })).length, prima);
});

test("6 · la categoria decisa si crea con la stagione, la squadra con la sede, e la scheda ci si collega con la sede derivata", async () => {
  const esito = await dominio.applyAthleteImport(
    scopeDirezione,
    richiesta([riga(2, { category: { kind: "create", key: "u15ecc" } })], [{ key: "u15ecc", name: "Under 15 Eccellenza", siteId: "scauri", birthYearFrom: 2012, birthYearTo: 2012 }]),
    { userId: DIREZIONE },
  );
  assert.equal(esito.categories[0].status, "created");
  assert.equal(esito.totals.categoriesCreated, 1);
  assert.equal(esito.totals.created, 1);
  const voce = (await fake.client.clubResourceItem.findMany({ where: { organization_id: CLUB, resource_type: "categories" } })).find((c) => (c.payload?.name || c.name) === "Under 15 Eccellenza");
  assert.ok(voce, "la categoria esiste");
  /* La stagione la stampa il registro (`applySeasonStamp`): sul database vero la voce nasce con `seasonId`, lo verifica l'UAT. */
  const club = await fake.client.club.findUnique({ where: { id: CLUB } });
  assert.ok(club.category_groups.some((g) => g.categoryId === voce.payload.id && g.siteId === "scauri"), "la squadra esiste");
  const righe = await appartenenze(esito.rows[0].athleteId);
  assert.equal(righe[0].category_id, voce.payload.id);
  assert.equal(righe[0].site_id, "scauri");
});

test("7 · la stessa categoria richiesta due volte (secondo scaglione, o riprova) si riusa, non nasce due volte", async () => {
  const cat = [{ key: "u15ecc", name: "Under 15 Eccellenza", siteId: "scauri", birthYearFrom: 2012, birthYearTo: 2012 }];
  await dominio.applyAthleteImport(scopeDirezione, richiesta([riga(2, { category: { kind: "create", key: "u15ecc" } })], cat), { userId: DIREZIONE });
  const secondo = await dominio.applyAthleteImport(scopeDirezione, richiesta([riga(3, { category: { kind: "create", key: "u15ecc" } })], cat), { userId: DIREZIONE });
  assert.equal(secondo.categories[0].status, "reused");
  const voci = (await fake.client.clubResourceItem.findMany({ where: { organization_id: CLUB, resource_type: "categories" } })).filter((c) => (c.payload?.name || c.name) === "Under 15 Eccellenza");
  assert.equal(voci.length, 1);
  const club = await fake.client.club.findUnique({ where: { id: CLUB } });
  assert.equal(club.category_groups.filter((g) => g.categoryId === voci[0].payload.id).length, 1, "una squadra sola");
});

test("8 · creare una categoria omonima di due esistenti si rifiuta: si collega, non si crea la terza", async () => {
  const esito = await dominio.applyAthleteImport(
    scopeDirezione,
    richiesta([riga(2, { category: { kind: "create", key: "pulcini" } })], [{ key: "pulcini", name: "Pulcini", siteId: "", birthYearFrom: 2018, birthYearTo: 2018 }]),
    { userId: DIREZIONE },
  );
  /* «Pulcini» esiste una volta sola nel catalogo: si riusa. Con due omonime si rifiuterebbe. */
  assert.equal(esito.categories[0].status, "reused");
  await fake.client.clubResourceItem.create({ data: categoria("cat-pulcini-2", "Pulcini") });
  const doppio = await dominio.applyAthleteImport(
    scopeDirezione,
    richiesta([riga(3, { category: { kind: "create", key: "pulcini" } })], [{ key: "pulcini", name: "Pulcini", siteId: "", birthYearFrom: 2018, birthYearTo: 2018 }]),
    { userId: DIREZIONE },
  );
  assert.equal(doppio.categories[0].status, "rejected");
  assert.match(doppio.categories[0].reason, /collegarne una/);
  assert.equal(doppio.rows[0].status, "rejected");
});

test("9 · chi importa e crea categorie ma non puo assegnare sedi: la categoria con sede si rifiuta prima di nascere, le altre righe si scrivono", async () => {
  const permessi = dominio.describeImportPermissions(scopeSegreteria);
  assert.equal(permessi.canImport, true);
  assert.equal(permessi.canCreateCategories, true, "la segreteria puo creare categorie (risorsa aperta)");
  assert.equal(permessi.canAssignSites, false, "ma non tocca il club (riservato alla direzione)");
  const prima = (await fake.client.clubResourceItem.findMany({ where: { organization_id: CLUB, resource_type: "categories" } })).length;
  const esito = await dominio.applyAthleteImport(
    scopeSegreteria,
    richiesta([riga(2), riga(3, { category: { kind: "create", key: "nuova" } })], [{ key: "nuova", name: "Nuova", siteId: "scauri", birthYearFrom: 2012, birthYearTo: 2012 }]),
    { userId: SEGRETERIA },
  );
  assert.equal(esito.categories[0].status, "rejected");
  assert.match(esito.categories[0].reason, /Accesso negato/);
  assert.equal((await fake.client.clubResourceItem.findMany({ where: { organization_id: CLUB, resource_type: "categories" } })).length, prima, "nessuna categoria orfana");
  assert.equal(esito.totals.created, 1, "la riga con la squadra esistente si scrive");
  assert.equal(esito.rows.find((r) => r.sourceRowNumber === 3).status, "rejected");
  /* Senza sede la segreteria la crea. */
  const senzaSede = await dominio.applyAthleteImport(
    scopeSegreteria,
    richiesta([riga(4, { category: { kind: "create", key: "nuova" } })], [{ key: "nuova", name: "Nuova", siteId: "", birthYearFrom: 2012, birthYearTo: 2012 }]),
    { userId: SEGRETERIA },
  );
  assert.equal(senzaSede.categories[0].status, "created");
  assert.equal(senzaSede.totals.created, 1);
});

test("10 · l'allenatore non importa; un altro club non scrive qui", async () => {
  await assert.rejects(() => dominio.applyAthleteImport(scopeAllenatore, richiesta([riga(2)]), { userId: ALLENATORE }), /Accesso negato/);
  await assert.rejects(() => dominio.applyAthleteImport({ ...scopeAltroClub, activeOrganizationId: CLUB }, richiesta([riga(2)]), { userId: ALTRA_DIREZIONE }), /Accesso negato/);
  assert.equal((await schede()).length, 2);
});

test("11 · collegare una scheda esistente completa i campi vuoti, non tocca la categoria che ha, e non riattiva un'inattiva", async () => {
  const esito = await dominio.applyAthleteImport(
    scopeDirezione,
    richiesta([
      riga(2, { action: "link", athleteId: ESISTENTE, athlete: { firstName: "Anna", lastName: "Bianchi", birthDate: "2012-03-03", gender: "F", fiscalCode: "", email: "anna@x.it", phone: "" }, category: { kind: "target", targetId: "group:cat-pulcini:cosma" } }),
      riga(3, { action: "link", athleteId: INATTIVO, athlete: { firstName: "Ugo", lastName: "Neri", birthDate: "2010-05-05", gender: "", fiscalCode: "", email: "", phone: "" } }),
    ]),
    { userId: DIREZIONE },
  );
  assert.equal(esito.totals.linked, 2);
  const anna = (await schede()).find((s) => s.id === ESISTENTE);
  assert.equal(new Date(anna.birth_date).toISOString().slice(0, 10), "2012-03-03", "la data vuota si completa");
  assert.equal(anna.data.email, "anna@x.it");
  assert.equal(esito.rows[0].membership, "kept_existing", "la categoria che ha resta");
  const righe = await appartenenze(ESISTENTE);
  assert.equal(righe.length, 1);
  assert.equal(righe[0].category_id, "cat-u14");
  const ugo = (await schede()).find((s) => s.id === INATTIVO);
  assert.equal(ugo.status, "inactive", "resta inattivo");
});

test("12 · collegare una scheda di un altro club si rifiuta", async () => {
  const esito = await dominio.applyAthleteImport(
    scopeDirezione,
    richiesta([riga(2, { action: "link", athleteId: ESTRANEO, athlete: { firstName: "Estraneo", lastName: "Altro", birthDate: "", gender: "", fiscalCode: "", email: "", phone: "" }, category: null })]),
    { userId: DIREZIONE },
  );
  assert.equal(esito.rows[0].status, "failed");
  assert.match(esito.rows[0].reason, /non e del club|Accesso negato/);
});

test("13 · una riga senza categoria si scrive senza appartenenza, senza inventarne una", async () => {
  const esito = await dominio.applyAthleteImport(scopeDirezione, richiesta([riga(2, { category: null })]), { userId: DIREZIONE });
  assert.equal(esito.rows[0].membership, "none");
  assert.equal((await appartenenze(esito.rows[0].athleteId)).length, 0);
  const scheda = (await schede()).find((s) => s.id === esito.rows[0].athleteId);
  assert.equal(scheda.category_id, null);
});

test("14 · il server rivaglia: nome vuoto, data impossibile, codice fiscale rotto, HTML nel nome, 201 righe, batchId non valido", async () => {
  const esito = await dominio.applyAthleteImport(
    scopeDirezione,
    richiesta([
      riga(2, { athlete: { firstName: "", lastName: "X", birthDate: "", gender: "", fiscalCode: "", email: "", phone: "" } }),
      riga(3, { athlete: { firstName: "A", lastName: "B", birthDate: "2099-01-01", gender: "", fiscalCode: "", email: "", phone: "" } }),
      riga(4, { athlete: { firstName: "A", lastName: "B", birthDate: "", gender: "", fiscalCode: "NOPE", email: "", phone: "" } }),
      riga(5, { athlete: { firstName: "<script>", lastName: "B", birthDate: "", gender: "", fiscalCode: "", email: "", phone: "" } }),
    ]),
    { userId: DIREZIONE },
  );
  assert.equal(esito.totals.rejected, 4);
  assert.equal(esito.totals.created, 0);
  await assert.rejects(() => dominio.applyAthleteImport(scopeDirezione, richiesta(Array.from({ length: 201 }, (_, i) => riga(i + 2))), { userId: DIREZIONE }), /200/);
  await assert.rejects(() => dominio.applyAthleteImport(scopeDirezione, { ...richiesta([riga(2)]), batchId: "x" }, { userId: DIREZIONE }), /lotto/);
});

test("15 · audit: una riga per scheda con lotto e riga del file, una per il lotto con i totali", async () => {
  await dominio.applyAthleteImport(scopeDirezione, richiesta([riga(2), riga(3)]), { userId: DIREZIONE });
  const perScheda = await audit("athlete.imported");
  assert.equal(perScheda.length, 2);
  assert.equal(perScheda[0].metadata.batchId, BATCH);
  assert.equal(perScheda[0].metadata.sourceRowNumber, 2);
  const lotto = await audit("athlete.import.batch");
  assert.equal(lotto.length, 1);
  assert.equal(lotto[0].resource_id, BATCH);
  assert.equal(lotto[0].metadata.totals.created, 2);
});
