import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Regressioni Web V1 sul layer dati server (WP-31, WP-32, WP-10).
 *
 * Esercitano le funzioni vere di `src/lib/server/resources.ts` con un doppio
 * del client Prisma:
 *
 * - proiezione `view=summary` della lista atleti;
 * - filtro e stampa della stagione attiva sulle risorse club;
 * - sincronizzazione transazionale di `club_resource_items`.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const ATHLETE = "11111111-0000-4000-8000-000000000001";
const CATEGORIA_CORRENTE = "33333333-0000-4000-8000-000000000003";
const CATEGORIA_VECCHIA = "44444444-0000-4000-8000-000000000004";
const CATEGORIA_LEGACY = "55555555-0000-4000-8000-000000000005";

const SEASON_SETTINGS = {
  activeSeasonId: "season-2026-2027",
  seasons: [
    {
      id: "season-2026-2027",
      label: "2026/2027",
      startDate: "2026-07-01",
      endDate: "2027-06-30",
      status: "active",
    },
    {
      id: "season-2025-2026",
      label: "2025/2026",
      startDate: "2025-07-01",
      endDate: "2026-06-30",
      status: "archived",
    },
  ],
};

const scope = () => ({
  userId: "user-a",
  activeOrganizationId: CLUB,
  allowedOrganizationIds: [CLUB],
});

/** Un allegato salvato come data URL, cioe il caso che appesantisce la lista. */
const SCANSIONE = `data:application/pdf;base64,${"A".repeat(4000)}`;

const seed = () => ({
  club: [{ id: CLUB, slug: "club-a", name: "Club A", settings: SEASON_SETTINGS }],
  athlete: [
    {
      id: ATHLETE,
      organization_id: CLUB,
      first_name: "Anna",
      last_name: "Rossi",
      birth_date: "2015-04-12",
      status: "active",
      data: {
        medicalCertExpiry: "2027-01-31",
        avatar: "data:image/png;base64,AAAA",
        enrollmentDocuments: [{ id: "doc-1", fileUrl: SCANSIONE }],
        identityDocuments: [{ id: "doc-2", fileUrl: SCANSIONE }],
        documents: [{ id: "doc-3", fileUrl: SCANSIONE }],
        payments: [{ id: "pay-1", amount: 100 }],
        certificateFiles: { fronte: SCANSIONE },
        scansioneCustom: SCANSIONE,
      },
    },
  ],
  clubResourceItem: [
    {
      id: CATEGORIA_CORRENTE,
      organization_id: CLUB,
      resource_type: "categories",
      name: "Under 2015",
      payload: { id: CATEGORIA_CORRENTE, name: "Under 2015", seasonId: "season-2026-2027" },
      created_at: new Date("2026-07-02T00:00:00.000Z"),
    },
    {
      id: CATEGORIA_VECCHIA,
      organization_id: CLUB,
      resource_type: "categories",
      name: "Under 2014",
      payload: { id: CATEGORIA_VECCHIA, name: "Under 2014", seasonId: "season-2025-2026" },
      created_at: new Date("2025-07-02T00:00:00.000Z"),
    },
    {
      id: CATEGORIA_LEGACY,
      organization_id: CLUB,
      resource_type: "categories",
      name: "Storica",
      payload: { id: CATEGORIA_LEGACY, name: "Storica" },
      created_at: new Date("2024-07-02T00:00:00.000Z"),
    },
  ],
});

let resources;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  resources = await import("../../src/lib/server/resources.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

/* ------------------- WP-31 · proiezione della lista atleti ------------------- */

test("view=summary toglie gli allegati dalla lista atleti", async () => {
  const [atleta] = await resources.listResource(
    "simplified_athletes",
    new URLSearchParams({ club_id: CLUB, view: "summary" }),
    scope(),
  );

  assert.equal(atleta.id, ATHLETE);
  assert.equal(atleta.first_name, "Anna");
  assert.equal(
    atleta.data.medicalCertExpiry,
    "2027-01-31",
    "i campi che la lista mostra devono restare",
  );
  /*
    L'avatar resta — la lista lo mostra — ma dal Blocco 8 come **indirizzo**
    e non come contenuto. Con il base64 dentro, la lista di 200 atleti
    pesava 23,7 MB anche dopo aver tolto tutti gli altri allegati: era
    l'ultimo binario rimasto nella risposta.
  */
  assert.equal(
    atleta.data.avatar,
    `/api/v1/athletes/${ATHLETE}/avatar`,
    "l'avatar resta, servito come immagine invece che incollato nel JSON",
  );

  for (const chiave of [
    "enrollmentDocuments",
    "identityDocuments",
    "documents",
    "payments",
    "certificateFiles",
  ]) {
    assert.equal(
      chiave in atleta.data,
      false,
      `la lista non deve trasportare ${chiave}`,
    );
  }

  assert.equal(
    "scansioneCustom" in atleta.data,
    false,
    "anche un data URL fuori dalle collezioni note va escluso",
  );

  assert.ok(
    !JSON.stringify(atleta).includes(SCANSIONE),
    "nessun allegato base64 deve finire nella risposta",
  );
});

test("senza view la lista atleti resta completa", async () => {
  const [atleta] = await resources.listResource(
    "simplified_athletes",
    new URLSearchParams({ club_id: CLUB }),
    scope(),
  );

  assert.equal(atleta.data.enrollmentDocuments.length, 1);
  assert.equal(atleta.data.scansioneCustom, SCANSIONE);
});

test("il dettaglio atleta riceve sempre il data completo", async () => {
  const atleta = await resources.getResourceById(
    "simplified_athletes",
    ATHLETE,
    scope(),
  );

  assert.equal(atleta.data.enrollmentDocuments[0].fileUrl, SCANSIONE);
});

test("view=summary non tocca le risorse che non sono atleti", async () => {
  const categorie = await resources.listResource(
    "categories",
    new URLSearchParams({ club_id: CLUB, view: "summary" }),
    scope(),
  );

  assert.equal(categorie.length, 3);
});

/* ----------------- WP-31 · proiezione di colonne sul club ------------------- */

test("fields restituisce solo le colonne chieste piu quelle di servizio", async () => {
  const [record] = await resources.listResource(
    "clubs",
    new URLSearchParams({ id: CLUB, fields: "categories" }),
    scope(),
  );

  const query = fake.lastCall("club", "findMany");
  assert.deepEqual(Object.keys(query.args.select).sort(), [
    "categories",
    "id",
    "name",
    "settings",
    "slug",
  ]);
  assert.ok(record, "la lettura proiettata deve comunque restituire il club");
});

test("senza fields la lettura del club resta completa", async () => {
  await resources.listResource(
    "clubs",
    new URLSearchParams({ id: CLUB }),
    scope(),
  );

  const query = fake.lastCall("club", "findMany");
  assert.equal(query.args.select, undefined);
});

test("una colonna sconosciuta viene ignorata invece di far fallire la query", async () => {
  await resources.listResource(
    "clubs",
    new URLSearchParams({ id: CLUB, fields: "categories,colonna_inventata" }),
    scope(),
  );

  const query = fake.lastCall("club", "findMany");
  assert.equal("colonna_inventata" in query.args.select, false);
  assert.equal(query.args.select.categories, true);
});

test("fields non tocca le risorse diverse dal club", async () => {
  await resources.listResource(
    "simplified_athletes",
    new URLSearchParams({ club_id: CLUB, fields: "first_name" }),
    scope(),
  );

  const query = fake.lastCall("athlete", "findMany");
  assert.equal(query.args.select, undefined);
});

test("la risposta di una scrittura sul club rispetta la stessa proiezione", () => {
  const proiettato = resources.projectClubResponse(
    "clubs",
    {
      id: CLUB,
      slug: "club",
      name: "Club",
      settings: {},
      categories: [{ id: "cat" }],
      matches: [{ id: "m" }],
      transactions: [{ id: "t" }],
    },
    new URLSearchParams({ fields: "id" }),
  );

  assert.deepEqual(Object.keys(proiettato).sort(), [
    "id",
    "name",
    "settings",
    "slug",
  ]);
});

test("senza fields la risposta di una scrittura resta completa", () => {
  const record = { id: CLUB, categories: [{ id: "cat" }] };

  assert.deepEqual(
    resources.projectClubResponse("clubs", record, new URLSearchParams()),
    record,
  );
});

/* ------------------- WP-32 · stagione applicata dal server ------------------- */

test("con la stagione attiva il server esclude le risorse delle altre stagioni", async () => {
  const categorie = await resources.listResource(
    "categories",
    new URLSearchParams({ club_id: CLUB }),
    scope(),
    { activeSeasonId: "season-2026-2027" },
  );

  assert.deepEqual(
    categorie.map((categoria) => categoria.id).sort(),
    [CATEGORIA_CORRENTE].sort(),
  );
});

test("nella stagione baseline si vedono anche le risorse senza stagione", async () => {
  const categorie = await resources.listResource(
    "categories",
    new URLSearchParams({ club_id: CLUB }),
    scope(),
    { activeSeasonId: "season-2025-2026" },
  );

  assert.deepEqual(
    categorie.map((categoria) => categoria.id).sort(),
    [CATEGORIA_LEGACY, CATEGORIA_VECCHIA].sort(),
  );
});

test("senza header stagione il comportamento e invariato", async () => {
  const categorie = await resources.listResource(
    "categories",
    new URLSearchParams({ club_id: CLUB }),
    scope(),
  );

  assert.equal(categorie.length, 3);
});

test("una stagione che il club non ha non filtra nulla", async () => {
  const categorie = await resources.listResource(
    "categories",
    new URLSearchParams({ club_id: CLUB }),
    scope(),
    { activeSeasonId: "season-inesistente" },
  );

  assert.equal(
    categorie.length,
    3,
    "un id stagione stale non deve svuotare la lista",
  );
});

test("le risorse non soggette a stagione non vengono filtrate", async () => {
  fake.rows("clubResourceItem").push({
    id: "66666666-0000-4000-8000-000000000006",
    organization_id: CLUB,
    resource_type: "staff_members",
    payload: { id: "staff-1", name: "Mario", seasonId: "season-2025-2026" },
  });

  const staff = await resources.listResource(
    "staff_members",
    new URLSearchParams({ club_id: CLUB }),
    scope(),
    { activeSeasonId: "season-2026-2027" },
  );

  assert.equal(staff.length, 1);
});

test("una categoria creata mentre e attiva una stagione porta quella stagione", async () => {
  const creata = await resources.createResource(
    "categories",
    { id: "categoria-nuova", name: "Under 2016", club_id: CLUB },
    "create",
    scope(),
    { activeSeasonId: "season-2026-2027" },
  );

  assert.equal(creata.seasonId, "season-2026-2027");

  const nellaStagioneVecchia = await resources.listResource(
    "categories",
    new URLSearchParams({ club_id: CLUB }),
    scope(),
    { activeSeasonId: "season-2025-2026" },
  );

  assert.equal(
    nellaStagioneVecchia.some((categoria) => categoria.name === "Under 2016"),
    false,
    "la categoria nuova non deve comparire nella stagione precedente",
  );
});

test("modificare una risorsa di un'altra stagione non la sposta di stagione", async () => {
  const aggiornata = await resources.updateResource(
    "categories",
    CATEGORIA_VECCHIA,
    { color: "bg-green-500" },
    scope(),
    { activeSeasonId: "season-2026-2027" },
  );

  assert.equal(aggiornata.color, "bg-green-500", "la modifica deve essere applicata");
  assert.equal(
    aggiornata.seasonId,
    "season-2025-2026",
    "la categoria deve restare nella sua stagione",
  );
});

test("un upsert su una risorsa di un'altra stagione non la sposta di stagione", async () => {
  const aggiornata = await resources.createResource(
    "categories",
    { id: CATEGORIA_VECCHIA, name: "Under 2014 upsert", club_id: CLUB },
    "upsert",
    scope(),
    { activeSeasonId: "season-2026-2027" },
  );

  assert.equal(aggiornata.seasonId, "season-2025-2026");
});

test("una stagione gia indicata sul payload non viene sovrascritta", async () => {
  const creata = await resources.createResource(
    "categories",
    {
      id: "categoria-import",
      name: "Import",
      club_id: CLUB,
      seasonId: "season-2025-2026",
    },
    "create",
    scope(),
    { activeSeasonId: "season-2026-2027" },
  );

  assert.equal(creata.seasonId, "season-2025-2026");
});

/* -------- WP-10 · sincronizzazione transazionale delle risorse club --------- */

const categorieDelClub = () =>
  fake
    .rows("clubResourceItem")
    .filter((row) => row.resource_type === "categories");

test("il PATCH del club risincronizza le risorse in una sola transazione", async () => {
  fake.reset();

  await resources.updateResource(
    "clubs",
    CLUB,
    {
      categories: [
        { id: CATEGORIA_CORRENTE, name: "Under 2015 rinominata" },
        { id: "categoria-nuova", name: "Under 2016" },
      ],
    },
    scope(),
  );

  const transazioni = fake.calls.filter(
    (call) => call.delegate === "clubResourceItem" && call.method === "createMany",
  );
  assert.equal(
    transazioni.length,
    1,
    "gli elementi vanno inseriti in blocco, non uno per volta",
  );
  assert.equal(
    fake.calls.some(
      (call) => call.delegate === "clubResourceItem" && call.method === "create",
    ),
    false,
    "non deve restare nessuna create per riga",
  );

  assert.deepEqual(
    categorieDelClub()
      .map((row) => row.name)
      .sort(),
    ["Under 2015 rinominata", "Under 2016"],
  );
});

test("gli id delle risorse esistenti non cambiano dopo un PATCH del club", async () => {
  await resources.updateResource(
    "clubs",
    CLUB,
    {
      categories: [
        { id: CATEGORIA_CORRENTE, name: "Under 2015" },
        { id: "categoria-nuova", name: "Under 2016" },
      ],
    },
    scope(),
  );

  const conservata = categorieDelClub().find(
    (row) => row.name === "Under 2015",
  );

  assert.equal(
    conservata.id,
    CATEGORIA_CORRENTE,
    "un elemento gia presente deve mantenere la sua riga",
  );
});

test("un errore a meta sincronizzazione non lascia il club senza risorse", async () => {
  const clientReale = fake.client;
  const clientCheFallisce = new Proxy(clientReale, {
    get: (target, property) => {
      if (property === "$transaction") {
        return async () => {
          throw new Error("connessione persa a meta sincronizzazione");
        };
      }
      return Reflect.get(target, property);
    },
  });
  setPrismaClientForTests(clientCheFallisce);

  await assert.rejects(
    resources.updateResource(
      "clubs",
      CLUB,
      { categories: [{ id: "categoria-nuova", name: "Under 2016" }] },
      scope(),
    ),
    /connessione persa/,
  );

  setPrismaClientForTests(clientReale);
  assert.equal(
    categorieDelClub().length,
    3,
    "senza transazione le categorie sarebbero gia state cancellate",
  );
});
