import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Il riporto dei tesserati fra stagioni (W1-A, gap G-01).
 *
 * **Il difetto che questi test chiudono.** Il riporto di stagione portava
 * categorie e gruppi operativi e lasciava indietro le persone, senza dirlo. Il
 * club leggeva «6 voci create» e si ritrovava le squadre vuote e le schede
 * degli atleti che citavano una categoria archiviata: non un dato perso, un
 * dato **scollegato**, che e peggio perche sembra giusto.
 *
 * Le garanzie provate qui:
 *
 * 1. chi viene riconfermato entra nella categoria **nuova**, con la sua sede;
 * 2. chi non viene riconfermato **non viene toccato**;
 * 3. rieseguire il riporto non duplica niente — nemmeno due riporti
 *    simultanei, perche a impedirlo e il vincolo del database e non un
 *    controllo fatto prima;
 * 4. la scheda dell'atleta smette di mostrare una categoria archiviata;
 * 5. il riepilogo dichiara i tesserati **anche quando sono zero**.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const ALTRO_CLUB = "bbbbbbbb-0000-4000-8000-000000000002";

const CAT_A_VECCHIA = "cat-under12-2026";
const CAT_B_VECCHIA = "cat-under14-2026";
const CAT_A_NUOVA = "cat-under12-2027";
const CAT_B_NUOVA = "cat-under14-2027";

const SEDE_NORD = "sede-nord";
const SEDE_SUD = "sede-sud";

let memberships;
let setPrismaClientForTests;
let fake;

const atleta = (id, overrides = {}) => ({
  id,
  organization_id: CLUB,
  first_name: id.toUpperCase(),
  last_name: "Rossi",
  status: "active",
  category_id: null,
  category_name: null,
  ...overrides,
});

const appartenenza = (id, overrides = {}) => ({
  id,
  organization_id: CLUB,
  athlete_id: "atleta-1",
  category_id: CAT_A_VECCHIA,
  category_name: "Under 12",
  site_id: SEDE_NORD,
  is_primary: true,
  created_at: "2026-07-01T00:00:00.000Z",
  ...overrides,
});

const seed = () => ({
  athlete: [
    atleta("atleta-1", {
      category_id: CAT_A_VECCHIA,
      category_name: "Under 12",
    }),
    atleta("atleta-2", {
      last_name: "Bianchi",
      category_id: CAT_A_VECCHIA,
      category_name: "Under 12",
    }),
    atleta("atleta-3", {
      last_name: "Verdi",
      category_id: CAT_B_VECCHIA,
      category_name: "Under 14",
    }),
    atleta("estraneo", { organization_id: ALTRO_CLUB, last_name: "Altrui" }),
  ],
  athleteCategoryMembership: [
    appartenenza("m1", { athlete_id: "atleta-1" }),
    appartenenza("m2", { athlete_id: "atleta-2", site_id: SEDE_SUD }),
    appartenenza("m3", {
      athlete_id: "atleta-3",
      category_id: CAT_B_VECCHIA,
      category_name: "Under 14",
      site_id: SEDE_NORD,
    }),
    // Un club diverso, con la stessa categoria: non deve essere sfiorato.
    appartenenza("m-altrui", {
      organization_id: ALTRO_CLUB,
      athlete_id: "estraneo",
    }),
  ],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  memberships = await import("../../src/lib/server/season-memberships.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const MAPPA = { [CAT_A_VECCHIA]: CAT_A_NUOVA, [CAT_B_VECCHIA]: CAT_B_NUOVA };
const NOMI = { [CAT_A_NUOVA]: "Under 12", [CAT_B_NUOVA]: "Under 14" };

const porta = (options = {}) =>
  memberships.runAthleteMembershipRollover({
    organizationId: CLUB,
    sourceCategoryIds: [CAT_A_VECCHIA, CAT_B_VECCHIA],
    categoryIdMap: MAPPA,
    targetCategoryNameById: NOMI,
    requested: true,
    ...options,
  });

const appartenenzeDi = (athleteId) =>
  fake
    .rows("athleteCategoryMembership")
    .filter(
      (row) => row.athlete_id === athleteId && row.organization_id === CLUB,
    );

// --- il riporto ---------------------------------------------------------------

test("i tesserati entrano nelle categorie della stagione nuova, con la loro sede", async () => {
  const summary = await porta();

  assert.equal(summary.proposed, 3);
  assert.equal(summary.confirmed, 3);
  assert.equal(summary.created, 3);
  assert.equal(summary.carried, 3);
  assert.equal(summary.notConfirmed, 0);

  const nuove = fake
    .rows("athleteCategoryMembership")
    .filter((row) => [CAT_A_NUOVA, CAT_B_NUOVA].includes(row.category_id));

  assert.equal(nuove.length, 3);
  assert.equal(
    nuove.find((row) => row.athlete_id === "atleta-2")?.site_id,
    SEDE_SUD,
    "la sede non si duplica e non si perde: viaggia con l'appartenenza",
  );
  assert.equal(
    nuove.find((row) => row.athlete_id === "atleta-3")?.category_id,
    CAT_B_NUOVA,
    "ogni atleta finisce nella categoria corrispondente, non nella prima",
  );
});

test("le appartenenze della stagione di origine non vengono cancellate", async () => {
  await porta();

  const vecchie = fake
    .rows("athleteCategoryMembership")
    .filter(
      (row) =>
        row.organization_id === CLUB &&
        [CAT_A_VECCHIA, CAT_B_VECCHIA].includes(row.category_id),
    );

  assert.equal(vecchie.length, 3, "la storia resta");
  assert.equal(vecchie.find((row) => row.id === "m1")?.category_id, CAT_A_VECCHIA);
  assert.equal(vecchie.find((row) => row.id === "m2")?.site_id, SEDE_SUD);
});

test("la bandiera «primaria» si sposta sulla stagione nuova, e non se ne creano due", async () => {
  await porta();

  const primarie = appartenenzeDi("atleta-1").filter((row) => row.is_primary);

  assert.equal(
    primarie.length,
    1,
    "il database ammette una sola primaria per atleta per club",
  );
  assert.equal(
    primarie[0].category_id,
    CAT_A_NUOVA,
    "«primaria» vuol dire «la squadra in cui l'atleta sta adesso»",
  );
});

test("la scheda dell'atleta smette di citare una categoria archiviata", async () => {
  await porta();

  const atleta1 = fake.rows("athlete").find((row) => row.id === "atleta-1");

  assert.equal(atleta1.category_id, CAT_A_NUOVA);
  assert.equal(atleta1.category_name, "Under 12");
});

// --- la riconferma ------------------------------------------------------------

test("chi non viene riconfermato resta in archivio e non entra nella stagione nuova", async () => {
  const summary = await porta({ confirmedAthleteIds: ["atleta-1", "atleta-2"] });

  assert.equal(summary.proposed, 3);
  assert.equal(summary.confirmed, 2);
  assert.equal(summary.notConfirmed, 1);
  assert.equal(summary.created, 2);

  const nuoveDelTerzo = appartenenzeDi("atleta-3").filter((row) =>
    [CAT_A_NUOVA, CAT_B_NUOVA].includes(row.category_id),
  );
  assert.equal(nuoveDelTerzo.length, 0, "non e stato riconfermato");

  const vecchieDelTerzo = appartenenzeDi("atleta-3").filter(
    (row) => row.category_id === CAT_B_VECCHIA,
  );
  assert.equal(vecchieDelTerzo.length, 1, "ma la sua storia e intatta");
  assert.equal(
    vecchieDelTerzo[0].is_primary,
    true,
    "e resta primaria: non gli si toglie la squadra di ieri",
  );

  const terzo = fake.rows("athlete").find((row) => row.id === "atleta-3");
  assert.equal(
    terzo.category_id,
    CAT_B_VECCHIA,
    "e nemmeno la colonna storica gli viene riscritta",
  );
});

test("riconfermare nessuno non scrive niente, e lo dice", async () => {
  const summary = await porta({ confirmedAthleteIds: [] });

  assert.equal(summary.proposed, 3);
  assert.equal(summary.confirmed, 0);
  assert.equal(summary.notConfirmed, 3);
  assert.equal(summary.created, 0);
  assert.equal(summary.carried, 0);
});

test("un id che non e fra i proposti viene ignorato, non aggiunto", async () => {
  const summary = await porta({
    confirmedAthleteIds: ["atleta-1", "estraneo", "inesistente"],
  });

  assert.equal(summary.confirmed, 1);
  assert.equal(summary.created, 1);
  assert.equal(
    appartenenzeDi("estraneo").length,
    0,
    "un id di un altro club non entra da questa porta",
  );
});

// --- idempotenza --------------------------------------------------------------

test("rieseguire il riporto non duplica le appartenenze", async () => {
  const primo = await porta();
  const secondo = await porta();

  assert.equal(primo.created, 3);
  assert.equal(secondo.created, 0, "il secondo giro non crea niente");
  assert.equal(secondo.alreadyPresent, 3);

  const nuove = fake
    .rows("athleteCategoryMembership")
    .filter((row) => [CAT_A_NUOVA, CAT_B_NUOVA].includes(row.category_id));
  assert.equal(nuove.length, 3);
});

test("due riporti simultanei non producono un doppione", async () => {
  const [primo, secondo] = await Promise.all([porta(), porta()]);

  const nuove = fake
    .rows("athleteCategoryMembership")
    .filter((row) => [CAT_A_NUOVA, CAT_B_NUOVA].includes(row.category_id));

  assert.equal(nuove.length, 3, "a impedirlo e il vincolo, non un controllo");
  assert.equal(
    primo.created + secondo.created,
    3,
    "le creazioni dichiarate sono in tutto tre, non sei",
  );
});

test("l'anteprima conta e non scrive", async () => {
  const summary = await porta({ preview: true });

  assert.equal(summary.created, 3);
  assert.equal(
    fake
      .rows("athleteCategoryMembership")
      .filter((row) => [CAT_A_NUOVA, CAT_B_NUOVA].includes(row.category_id))
      .length,
    0,
  );
});

test("l'anteprima del secondo riporto annuncia zero creazioni", async () => {
  await porta();
  const summary = await porta({ preview: true });

  assert.equal(summary.created, 0);
  assert.equal(summary.alreadyPresent, 3);
});

// --- il silenzio che la Wave toglie -------------------------------------------

test("non scegliere i tesserati non e un motivo per tacere", async () => {
  const summary = await porta({ requested: false });

  assert.equal(summary.requested, false);
  assert.equal(summary.proposed, 3, "il numero dei proposti si dice comunque");
  assert.equal(summary.carried, 0);
  assert.equal(summary.notConfirmed, 3);
  assert.equal(summary.created, 0);
});

test("una categoria senza destinazione non produce un'appartenenza orfana", async () => {
  const summary = await porta({
    categoryIdMap: { [CAT_A_VECCHIA]: CAT_A_NUOVA },
  });

  assert.equal(summary.unmappable, 1, "la Under 14 non ha dove andare");
  assert.equal(summary.created, 2);
  assert.equal(
    appartenenzeDi("atleta-3").filter((row) => row.category_id === CAT_B_NUOVA)
      .length,
    0,
  );
});

// --- isolamento fra club ------------------------------------------------------

test("il riporto di un club non tocca una riga di un altro", async () => {
  const prima = JSON.stringify(
    fake
      .rows("athleteCategoryMembership")
      .filter((row) => row.organization_id === ALTRO_CLUB),
  );

  await porta();

  const dopo = JSON.stringify(
    fake
      .rows("athleteCategoryMembership")
      .filter((row) => row.organization_id === ALTRO_CLUB),
  );

  assert.equal(dopo, prima);
  assert.equal(
    fake.rows("athlete").find((row) => row.id === "estraneo").category_id,
    null,
  );
});

test("ogni interrogazione sulle appartenenze filtra per club", async () => {
  await porta();

  const letture = fake.calls.filter(
    (call) =>
      call.delegate === "athleteCategoryMembership" &&
      ["findMany", "updateMany", "createMany"].includes(call.method),
  );

  assert.ok(letture.length > 0);
  for (const call of letture) {
    if (call.method === "createMany") {
      for (const row of call.args.data) {
        assert.equal(row.organization_id, CLUB);
      }
      continue;
    }
    assert.equal(
      call.args.where?.organization_id,
      CLUB,
      `${call.method} senza filtro di club`,
    );
  }
});

// --- l'elenco di riconferma ---------------------------------------------------

test("l'elenco di riconferma nomina le persone e le loro squadre", async () => {
  const roster = await memberships.listSeasonRoster({
    organizationId: CLUB,
    sourceCategoryIds: [CAT_A_VECCHIA, CAT_B_VECCHIA],
    categoryNameById: { [CAT_A_VECCHIA]: "Under 12", [CAT_B_VECCHIA]: "Under 14" },
  });

  assert.equal(roster.total, 3);
  assert.deepEqual(
    roster.athletes.map((athlete) => athlete.fullName),
    ["Bianchi ATLETA-2", "Rossi ATLETA-1", "Verdi ATLETA-3"],
    "ordinati per cognome, come ogni altro elenco di persone",
  );

  const terzo = roster.athletes.find(
    (athlete) => athlete.athleteId === "atleta-3",
  );
  assert.equal(terzo.memberships[0].categoryName, "Under 14");
  assert.equal(terzo.memberships[0].siteId, SEDE_NORD);
  assert.equal(terzo.memberships[0].isPrimary, true);
});

test("l'elenco di riconferma non mostra atleti di un altro club", async () => {
  const roster = await memberships.listSeasonRoster({
    organizationId: CLUB,
    sourceCategoryIds: [CAT_A_VECCHIA, CAT_B_VECCHIA],
  });

  assert.equal(
    roster.athletes.some((athlete) => athlete.athleteId === "estraneo"),
    false,
  );
});

// --- i contatori --------------------------------------------------------------

test("gli atleti senza squadra si contano sulla stagione attiva", async () => {
  const prima = await memberships.countAthletesWithoutTeam({
    organizationId: CLUB,
    categoryIds: [CAT_A_NUOVA, CAT_B_NUOVA],
  });
  assert.equal(prima, 3, "prima del riporto nessuno e nelle squadre nuove");

  await porta();

  const dopo = await memberships.countAthletesWithoutTeam({
    organizationId: CLUB,
    categoryIds: [CAT_A_NUOVA, CAT_B_NUOVA],
  });
  assert.equal(dopo, 0);
});

test("i tesserati per stagione si contano con una lettura sola", async () => {
  await porta();
  const chiamatePrima = fake.calls.filter(
    (call) =>
      call.delegate === "athleteCategoryMembership" && call.method === "findMany",
  ).length;

  const counts = await memberships.countSeasonMemberships({
    organizationId: CLUB,
    seasons: [
      { id: "2026", categoryIds: [CAT_A_VECCHIA, CAT_B_VECCHIA] },
      { id: "2027", categoryIds: [CAT_A_NUOVA, CAT_B_NUOVA] },
    ],
  });

  const chiamateDopo = fake.calls.filter(
    (call) =>
      call.delegate === "athleteCategoryMembership" && call.method === "findMany",
  ).length;

  assert.equal(counts.bySeason["2026"], 3);
  assert.equal(counts.bySeason["2027"], 3);
  assert.equal(
    chiamateDopo - chiamatePrima,
    1,
    "una lettura per tutte le stagioni, non una per stagione",
  );
});
