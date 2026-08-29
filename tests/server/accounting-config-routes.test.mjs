import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Le rotte dei **conti** e delle **causali**, chiamate come le chiama
 * l'interfaccia (Wave 4, lane W4-A).
 *
 * I test di servizio provano il dominio con uno scope costruito a mano. Qui si
 * prova il pezzo prima — sessione, ruolo, permesso — e si prova che le **tre
 * porte rispondano allo stesso modo**, che e il difetto che il piano ha
 * misurato al §30: su `/movements` la pagina, la rotta e il CRUD generico
 * rispondevano diversamente, e il collaboratore vedeva zeri invece di un
 * diniego.
 *
 * Quattro proprieta:
 *
 * 1. senza sessione si risponde 401, non 500;
 * 2. la segreteria **vede l'elenco dei conti** — senza, non registrerebbe un
 *    movimento — e **non i saldi**: chiedere i saldi senza il permesso e 403,
 *    e non un elenco con i saldi a zero;
 * 3. le causali si leggono con `accounting.read` e si **modificano** solo con
 *    `accounting.causes_manage`, e la risposta di lettura porta il permesso
 *    perche la superficie non mostri un pulsante che poi nega;
 * 4. non esiste nessun `DELETE` sui conti, e il `DELETE` sulle causali non
 *    cancella una voce di sistema.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const CASSA = "11111111-0000-4000-8000-00000000000a";
const GESTORE = "dddddddd-0000-4000-8000-000000000004";
const SEGRETERIA = "eeeeeeee-0000-4000-8000-000000000005";
const ALLENATORE = "ffffffff-0000-4000-8000-000000000006";
const TOKEN_GESTORE = "token-gestore";
const TOKEN_SEGRETERIA = "token-segreteria";
const TOKEN_ALLENATORE = "token-allenatore";

let accountsRoute;
let accountRoute;
let operationTypesRoute;
let setPrismaClientForTests;
let fake;

const utente = (id, email, role) => ({
  id,
  email,
  role,
  first_name: "Nome",
  last_name: "Cognome",
  created_at: new Date("2026-01-01T00:00:00.000Z"),
  updated_at: new Date("2026-01-01T00:00:00.000Z"),
  email_verified_at: new Date("2026-01-01T00:00:00.000Z"),
});

const sessione = (id, token, userId, email, role) => ({
  id,
  token,
  user_id: userId,
  expires_at: new Date(Date.now() + 3_600_000),
  user: utente(userId, email, role),
});

const appartenenza = (id, userId, role) => ({
  id,
  user_id: userId,
  organization_id: CLUB,
  role,
  is_primary: true,
  created_at: new Date("2026-01-01T00:00:00.000Z"),
});

const seed = () => ({
  session: [
    sessione("s1", TOKEN_GESTORE, GESTORE, "gestore@example.invalid", "club_manager"),
    sessione(
      "s2",
      TOKEN_SEGRETERIA,
      SEGRETERIA,
      "segreteria@example.invalid",
      "collaborator",
    ),
    sessione("s3", TOKEN_ALLENATORE, ALLENATORE, "coach@example.invalid", "trainer"),
  ],
  organizationUser: [
    appartenenza("ou-1", GESTORE, "club_manager"),
    appartenenza("ou-2", SEGRETERIA, "collaborator"),
    appartenenza("ou-3", ALLENATORE, "trainer"),
  ],
  club: [{ id: CLUB, name: "ASD Alfa", club_sites: [] }],
  financialAccount: [
    {
      id: CASSA,
      organization_id: CLUB,
      name: "Cassa",
      kind: "CASH",
      iban: null,
      bank_name: null,
      site_id: null,
      opening_balance_cents: 25_000,
      opening_balance_at: new Date("2026-01-01T00:00:00.000Z"),
      legacy_account_id: null,
      is_archived: false,
      archived_at: null,
      notes: null,
      created_by: null,
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      updated_at: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
  fiscalOperationType: [],
  accountingEntry: [],
  paymentTransaction: [],
  sportWorkOutboundTransaction: [],
  fundingSettlement: [],
  documentSeries: [],
  auditLog: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  accountsRoute = await import(
    "../../src/app/api/v1/accounting/accounts/route.ts"
  );
  accountRoute = await import(
    "../../src/app/api/v1/accounting/accounts/[id]/route.ts"
  );
  operationTypesRoute = await import(
    "../../src/app/api/v1/fiscal/operation-types/route.ts"
  );
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const richiesta = (url, options = {}) =>
  new Request(url, {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json",
      ...(options.token ? { cookie: `easygame_session=${options.token}` } : {}),
      ...(options.clubId ? { "x-active-club-id": options.clubId } : {}),
      ...(options.role ? { "x-active-access-role": options.role } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

const leggi = async (response) => ({
  status: response.status,
  payload: await response.json(),
});

const comeGestore = (extra = {}) => ({
  token: TOKEN_GESTORE,
  clubId: CLUB,
  role: "club_manager",
  ...extra,
});

const comeSegreteria = (extra = {}) => ({
  token: TOKEN_SEGRETERIA,
  clubId: CLUB,
  role: "collaborator",
  ...extra,
});

const comeAllenatore = (extra = {}) => ({
  token: TOKEN_ALLENATORE,
  clubId: CLUB,
  role: "trainer",
  ...extra,
});

const URL_CONTI = "http://localhost/api/v1/accounting/accounts";
const URL_CAUSALI = "http://localhost/api/v1/fiscal/operation-types";

// --- sessione ---------------------------------------------------------------

test("senza sessione i conti rispondono 401, non 500", async () => {
  const { status, payload } = await leggi(
    await accountsRoute.GET(richiesta(URL_CONTI)),
  );

  assert.equal(status, 401);
  assert.match(payload.error.message, /Accesso negato/);
});

// --- i conti ----------------------------------------------------------------

test("l'allenatore non apre l'elenco dei conti, e il diniego si traccia", async () => {
  const { status, payload } = await leggi(
    await accountsRoute.GET(richiesta(URL_CONTI, comeAllenatore())),
  );

  assert.equal(status, 403);
  assert.match(payload.error.message, /Accesso negato/);

  const traccia = fake
    .rows("auditLog")
    .find((row) => row.action === "resource.access.denied");

  assert.ok(traccia, "un tentativo negato su un dato economico si traccia");
  assert.equal(traccia.resource, "financial_accounts");
  assert.equal(traccia.metadata.permission, "accounting.read");
});

test("la segreteria vede l'elenco dei conti, senza i saldi", async () => {
  const { status, payload } = await leggi(
    await accountsRoute.GET(richiesta(URL_CONTI, comeSegreteria())),
  );

  assert.equal(status, 200);
  assert.equal(payload.data.balancesIncluded, false);
  assert.equal(payload.data.accounts.length, 1);
  assert.equal(payload.data.accounts[0].name, "Cassa");
  assert.equal(payload.data.accounts[0].balance, null);
});

test("la segreteria che chiede i saldi riceve un diniego, non degli zeri", async () => {
  const { status, payload } = await leggi(
    await accountsRoute.GET(
      richiesta(`${URL_CONTI}?with_balances=1`, comeSegreteria()),
    ),
  );

  assert.equal(status, 403);
  assert.match(payload.error.message, /Accesso negato/);
  assert.equal(payload.data, null);
});

test("il gestore vede i saldi, e sono derivati dai movimenti", async () => {
  fake.rows("accountingEntry").push({
    id: "m1",
    organization_id: CLUB,
    financial_account_id: CASSA,
    direction: "IN",
    amount_cents: 5_000,
    reversed_at: null,
    reversal_of_id: null,
  });

  const { status, payload } = await leggi(
    await accountsRoute.GET(
      richiesta(`${URL_CONTI}?with_balances=1`, comeGestore()),
    ),
  );

  assert.equal(status, 200);
  assert.equal(payload.data.balancesIncluded, true);
  assert.equal(payload.data.accounts[0].balance.balanceCents, 30_000);
});

test("la segreteria non apre un conto", async () => {
  const { status } = await leggi(
    await accountsRoute.POST(
      richiesta(URL_CONTI, comeSegreteria({ method: "POST", body: { name: "Banca" } })),
    ),
  );

  assert.equal(status, 403);
  assert.equal(fake.rows("financialAccount").length, 1);
});

test("il gestore apre un conto, e nasce senza saldo perche il saldo non e una colonna", async () => {
  const { status, payload } = await leggi(
    await accountsRoute.POST(
      richiesta(
        URL_CONTI,
        comeGestore({
          method: "POST",
          body: { name: "Banca", kind: "BANK", openingBalance: 1500 },
        }),
      ),
    ),
  );

  assert.equal(status, 201);
  assert.equal(payload.data.account.name, "Banca");
  assert.equal(payload.data.account.openingBalanceCents, 150_000);

  const riga = fake.rows("financialAccount").find((r) => r.name === "Banca");
  assert.equal("current_balance" in riga, false);
  assert.equal("balance" in riga, false);
});

test("un corpo non valido e 400, e non 403", async () => {
  const { status, payload } = await leggi(
    await accountsRoute.POST(
      richiesta(URL_CONTI, comeGestore({ method: "POST", body: { name: "" } })),
    ),
  );

  assert.equal(status, 400);
  assert.equal(payload.error.code, "VALIDATION_ERROR");
});

test("le rotte dei conti non espongono nessun DELETE", () => {
  assert.equal("DELETE" in accountsRoute, false);
  assert.equal("DELETE" in accountRoute, false);
});

test("un conto si archivia con il PATCH, e la riga resta", async () => {
  const { status, payload } = await leggi(
    await accountRoute.PATCH(
      richiesta(
        `${URL_CONTI}/${CASSA}`,
        comeGestore({ method: "PATCH", body: { archived: true } }),
      ),
      { params: { id: CASSA } },
    ),
  );

  assert.equal(status, 200);
  assert.equal(payload.data.account.isArchived, true);
  assert.equal(fake.rows("financialAccount").length, 1);
});

test("la segreteria non archivia un conto", async () => {
  const { status } = await leggi(
    await accountRoute.PATCH(
      richiesta(
        `${URL_CONTI}/${CASSA}`,
        comeSegreteria({ method: "PATCH", body: { archived: true } }),
      ),
      { params: { id: CASSA } },
    ),
  );

  assert.equal(status, 403);
  assert.equal(fake.rows("financialAccount")[0].is_archived, false);
});

test("un identificativo che non e un conto risponde 404, e non racconta le tabelle", async () => {
  const { status, payload } = await leggi(
    await accountRoute.GET(
      richiesta(`${URL_CONTI}/non-esiste`, comeGestore()),
      { params: { id: "non-esiste" } },
    ),
  );

  assert.equal(status, 404);
  assert.doesNotMatch(payload.error.message, /prisma|financial_accounts/i);
});

// --- le causali -------------------------------------------------------------

test("l'allenatore non legge le causali", async () => {
  const { status } = await leggi(
    await operationTypesRoute.GET(richiesta(URL_CAUSALI, comeAllenatore())),
  );

  assert.equal(status, 403);
});

test("la segreteria legge le causali e sa di non poterle modificare", async () => {
  const { status, payload } = await leggi(
    await operationTypesRoute.GET(richiesta(URL_CAUSALI, comeSegreteria())),
  );

  assert.equal(status, 200);
  assert.equal(payload.data.permissions.canManage, false);
  assert.ok(payload.data.operationTypes.length >= 9);
});

test("il gestore legge le causali e sa di poterle modificare", async () => {
  const { payload } = await leggi(
    await operationTypesRoute.GET(richiesta(URL_CAUSALI, comeGestore())),
  );

  assert.equal(payload.data.permissions.canManage, true);
});

test("la segreteria non modifica una causale", async () => {
  await operationTypesRoute.GET(richiesta(URL_CAUSALI, comeGestore()));

  const { status } = await leggi(
    await operationTypesRoute.PUT(
      richiesta(
        URL_CAUSALI,
        comeSegreteria({
          method: "PUT",
          body: { code: "quota_associativa", activityScope: "commercial" },
        }),
      ),
    ),
  );

  assert.equal(status, 403);
  const riga = fake
    .rows("fiscalOperationType")
    .find((r) => r.code === "quota_associativa");
  assert.equal(riga.activity_scope, "unspecified");
});

test("il gestore classifica una causale, e resta scritto chi e stato", async () => {
  await operationTypesRoute.GET(richiesta(URL_CAUSALI, comeGestore()));

  const { status, payload } = await leggi(
    await operationTypesRoute.PUT(
      richiesta(
        URL_CAUSALI,
        comeGestore({
          method: "PUT",
          body: {
            code: "quota_associativa",
            activityScope: "institutional",
            isMembershipFee: true,
          },
        }),
      ),
    ),
  );

  assert.equal(status, 200);
  assert.equal(payload.data.operationType.activityScope, "institutional");
  assert.equal(payload.data.operationType.isMembershipFee, true);
  assert.equal(payload.data.operationType.classifiedBy, GESTORE);
  assert.ok(payload.data.operationType.classifiedAt);
});

test("rinominare una causale dalla rotta non ne azzera la classificazione", async () => {
  await operationTypesRoute.GET(richiesta(URL_CAUSALI, comeGestore()));
  await operationTypesRoute.PUT(
    richiesta(
      URL_CAUSALI,
      comeGestore({
        method: "PUT",
        body: { code: "corso_servizio", activityScope: "commercial", vatRate: 22 },
      }),
    ),
  );

  const { payload } = await leggi(
    await operationTypesRoute.PUT(
      richiesta(
        URL_CAUSALI,
        comeGestore({
          method: "PUT",
          body: { code: "corso_servizio", label: "Corsi e stage" },
        }),
      ),
    ),
  );

  assert.equal(payload.data.operationType.label, "Corsi e stage");
  assert.equal(payload.data.operationType.activityScope, "commercial");
  assert.equal(payload.data.operationType.vatRate, 22);
});

test("la segreteria non disattiva una causale", async () => {
  await operationTypesRoute.GET(richiesta(URL_CAUSALI, comeGestore()));

  const { status } = await leggi(
    await operationTypesRoute.DELETE(
      richiesta(
        `${URL_CAUSALI}?code=sponsorizzazione&action=deactivate`,
        comeSegreteria({ method: "DELETE" }),
      ),
    ),
  );

  assert.equal(status, 403);
  /*
    La riga non e stata toccata: `is_active` non e mai stato messo a `false`.
    Non si confronta con `true` perche il valore vero lo mette il default della
    colonna, che il doppio del client non applica.
  */
  assert.notEqual(
    fake.rows("fiscalOperationType").find((r) => r.code === "sponsorizzazione")
      .is_active,
    false,
  );
});

test("una causale predefinita non si cancella nemmeno dalla rotta", async () => {
  await operationTypesRoute.GET(richiesta(URL_CAUSALI, comeGestore()));

  const { status, payload } = await leggi(
    await operationTypesRoute.DELETE(
      richiesta(
        `${URL_CAUSALI}?code=quota_attivita&action=delete`,
        comeGestore({ method: "DELETE" }),
      ),
    ),
  );

  assert.equal(status, 400);
  assert.match(payload.error.message, /non si cancella/);
  assert.ok(
    fake.rows("fiscalOperationType").find((r) => r.code === "quota_attivita"),
  );
});

test("il gestore disattiva una causale predefinita, che resta leggibile", async () => {
  await operationTypesRoute.GET(richiesta(URL_CAUSALI, comeGestore()));

  const { status, payload } = await leggi(
    await operationTypesRoute.DELETE(
      richiesta(
        `${URL_CAUSALI}?code=contributo&action=deactivate`,
        comeGestore({ method: "DELETE" }),
      ),
    ),
  );

  assert.equal(status, 200);
  assert.equal(payload.data.operationType.isActive, false);
  assert.ok(fake.rows("fiscalOperationType").find((r) => r.code === "contributo"));
});
