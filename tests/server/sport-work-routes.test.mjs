import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Le rotte del lavoro sportivo, chiamate come le chiama l'interfaccia.
 *
 * I test di servizio provano il dominio con uno scope costruito a mano. Qui si
 * prova il pezzo **prima**: la sessione, il ruolo, il permesso. E il pezzo che
 * in questo dominio conta di piu, perche il difetto che teme non e un calcolo
 * sbagliato — e un allenatore che apre l'elenco e legge quanto guadagna il
 * collega.
 *
 * Quattro proprieta:
 *
 * 1. senza sessione si risponde 401, non 500;
 * 2. con una sessione **senza il permesso economico** si risponde 403, e il
 *    diniego finisce nell'audit;
 * 3. con il permesso si risponde, e la risposta **non contiene l'IBAN**;
 * 4. il club nella query non allarga il confine: chiedere quello di un altro
 *    resta 403.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const ALTRO_CLUB = "bbbbbbbb-0000-4000-8000-000000000002";
const PERSONA = "cccccccc-0000-4000-8000-000000000003";
const GESTORE = "dddddddd-0000-4000-8000-000000000004";
const ALLENATORE = "eeeeeeee-0000-4000-8000-000000000005";
const TOKEN_GESTORE = "token-gestore";
const TOKEN_ALLENATORE = "token-allenatore";

let peopleRoute;
let payoutsRoute;
let datasetsRoute;
let dashboardRoute;
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

const seed = () => ({
  session: [
    {
      id: "sess-1",
      token: TOKEN_GESTORE,
      user_id: GESTORE,
      expires_at: new Date(Date.now() + 3600_000),
      user: utente(GESTORE, "gestore@example.invalid", "club_manager"),
    },
    {
      id: "sess-2",
      token: TOKEN_ALLENATORE,
      user_id: ALLENATORE,
      expires_at: new Date(Date.now() + 3600_000),
      user: utente(ALLENATORE, "coach@example.invalid", "trainer"),
    },
  ],
  organizationUser: [
    {
      id: "ou-1",
      user_id: GESTORE,
      organization_id: CLUB,
      role: "club_manager",
      is_primary: true,
      created_at: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      id: "ou-2",
      user_id: ALLENATORE,
      organization_id: CLUB,
      role: "trainer",
      is_primary: true,
      created_at: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
  club: [
    { id: CLUB, name: "ASD Alfa" },
    { id: ALTRO_CLUB, name: "ASD Beta" },
  ],
  sportWorkPerson: [
    {
      id: PERSONA,
      organization_id: CLUB,
      origin_type: "trainer",
      first_name: "Marco",
      last_name: "Rossi",
      fiscal_code: "RSSMRC90A01H501A",
      fiscal_profile: "NONE",
      social_coverage: "NONE",
      iban: "IT60X0542811101000000123456",
      email: "marco@example.invalid",
      created_at: new Date("2026-08-01T00:00:00.000Z"),
      updated_at: new Date("2026-08-01T00:00:00.000Z"),
    },
  ],
  sportWorkRelationship: [],
  sportWorkInstallment: [],
  sportWorkOutboundTransaction: [],
  sportWorkExternalDeclaration: [],
  sportWorkYearPosition: [],
  sportWorkObligation: [],
  auditLog: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  peopleRoute = await import("../../src/app/api/v1/sport-work/people/route.ts");
  payoutsRoute = await import("../../src/app/api/v1/sport-work/payouts/route.ts");
  datasetsRoute = await import(
    "../../src/app/api/v1/sport-work/datasets/route.ts"
  );
  dashboardRoute = await import(
    "../../src/app/api/v1/sport-work/dashboard/route.ts"
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
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.token
        ? { cookie: `easygame_session=${options.token}` }
        : {}),
      ...(options.clubId ? { "x-active-club-id": options.clubId } : {}),
      ...(options.role ? { "x-active-access-role": options.role } : {}),
      ...(options.headers || {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

const leggi = async (response) => ({
  status: response.status,
  payload: await response.json(),
});

// --- sessione ---------------------------------------------------------------

test("senza sessione si risponde 401, non 500", async () => {
  const { status, payload } = await leggi(
    await peopleRoute.GET(
      richiesta("http://localhost/api/v1/sport-work/people"),
    ),
  );

  assert.equal(status, 401);
  assert.match(payload.error.message, /Accesso negato/);
});

// --- permessi ----------------------------------------------------------------

test("un allenatore non elenca le persone del modulo compensi", async () => {
  const { status, payload } = await leggi(
    await peopleRoute.GET(
      richiesta("http://localhost/api/v1/sport-work/people", {
        token: TOKEN_ALLENATORE,
        clubId: CLUB,
        role: "trainer",
      }),
    ),
  );

  assert.equal(status, 403);
  assert.match(payload.error.message, /Accesso negato/);
});

test("il diniego finisce nell'audit, con il permesso mancante", async () => {
  await peopleRoute.GET(
    richiesta("http://localhost/api/v1/sport-work/people", {
      token: TOKEN_ALLENATORE,
      clubId: CLUB,
      role: "trainer",
    }),
  );

  const traccia = fake
    .rows("auditLog")
    .find((row) => row.action === "resource.access.denied");

  assert.ok(traccia, "un tentativo negato su un dato economico si traccia");
  assert.equal(traccia.outcome, "denied");
  assert.equal(traccia.resource, "sport_work");
  assert.equal(traccia.metadata.permission, "sport_work.read");
});

test("un allenatore non registra un'erogazione", async () => {
  const { status } = await leggi(
    await payoutsRoute.POST(
      richiesta("http://localhost/api/v1/sport-work/payouts", {
        method: "POST",
        token: TOKEN_ALLENATORE,
        clubId: CLUB,
        role: "trainer",
        body: { amount: 1000 },
      }),
    ),
  );

  assert.equal(status, 403);
  assert.equal(fake.rows("sportWorkOutboundTransaction").length, 0);
});

test("un allenatore non legge il cruscotto ne i dataset fiscali", async () => {
  for (const route of [dashboardRoute, datasetsRoute]) {
    const { status } = await leggi(
      await route.GET(
        richiesta("http://localhost/api/v1/sport-work/x", {
          token: TOKEN_ALLENATORE,
          clubId: CLUB,
          role: "trainer",
        }),
      ),
    );
    assert.equal(status, 403);
  }
});

// --- lettura con permesso ------------------------------------------------------

test("il gestore elenca le persone, e la risposta non contiene l'IBAN", async () => {
  const { status, payload } = await leggi(
    await peopleRoute.GET(
      richiesta("http://localhost/api/v1/sport-work/people", {
        token: TOKEN_GESTORE,
        clubId: CLUB,
        role: "club_manager",
      }),
    ),
  );

  assert.equal(status, 200);
  assert.equal(payload.error, null);
  assert.equal(payload.data.length, 1);
  assert.equal(payload.data[0].full_name, "Marco Rossi");
  assert.equal(payload.data[0].has_iban, true);
  assert.equal(
    JSON.stringify(payload).includes("IT60X0542811101000000123456"),
    false,
    "l'IBAN non deve viaggiare in un elenco",
  );
});

test("il gestore legge il cruscotto", async () => {
  const { status, payload } = await leggi(
    await dashboardRoute.GET(
      richiesta("http://localhost/api/v1/sport-work/dashboard", {
        token: TOKEN_GESTORE,
        clubId: CLUB,
        role: "club_manager",
      }),
    ),
  );

  assert.equal(status, 200);
  assert.equal(payload.data.organizationId, CLUB);
  assert.equal(payload.data.toPayTotal, 0);
});

test("i dataset dichiarano di non essere l'adempimento", async () => {
  const { status, payload } = await leggi(
    await datasetsRoute.GET(
      richiesta(
        "http://localhost/api/v1/sport-work/datasets?kind=cu&year=2026",
        {
          token: TOKEN_GESTORE,
          clubId: CLUB,
          role: "club_manager",
        },
      ),
    ),
  );

  assert.equal(status, 200);
  assert.equal(payload.data.kind, "cu");
  assert.match(payload.data.disclaimer, /non predispone e non trasmette/);
});

// --- confine di club -------------------------------------------------------------

test("chiedere il club di un altro resta 403, anche con una sessione valida", async () => {
  const { status, payload } = await leggi(
    await peopleRoute.GET(
      richiesta(
        `http://localhost/api/v1/sport-work/people?organization_id=${ALTRO_CLUB}`,
        { token: TOKEN_GESTORE, clubId: CLUB, role: "club_manager" },
      ),
    ),
  );

  assert.equal(status, 403);
  assert.match(payload.error.message, /Accesso negato/);
});

// --- errori di dominio ------------------------------------------------------------

test("un errore di dominio diventa 400, non 500", async () => {
  const { status, payload } = await leggi(
    await peopleRoute.POST(
      richiesta("http://localhost/api/v1/sport-work/people", {
        method: "POST",
        token: TOKEN_GESTORE,
        clubId: CLUB,
        role: "club_manager",
        body: { firstName: "", lastName: "" },
      }),
    ),
  );

  assert.equal(status, 400);
  assert.match(payload.error.message, /Nome e cognome/);
});

test("una persona che non esiste diventa 404", async () => {
  const detail = await import(
    "../../src/app/api/v1/sport-work/people/[id]/route.ts"
  );

  const { status } = await leggi(
    await detail.GET(
      richiesta("http://localhost/api/v1/sport-work/people/manca", {
        token: TOKEN_GESTORE,
        clubId: CLUB,
        role: "club_manager",
      }),
      { params: { id: "manca" } },
    ),
  );

  assert.equal(status, 404);
});

test("la scheda di una persona porta l'IBAN, l'elenco no", async () => {
  const detail = await import(
    "../../src/app/api/v1/sport-work/people/[id]/route.ts"
  );

  const { status, payload } = await leggi(
    await detail.GET(
      richiesta(`http://localhost/api/v1/sport-work/people/${PERSONA}`, {
        token: TOKEN_GESTORE,
        clubId: CLUB,
        role: "club_manager",
      }),
      { params: { id: PERSONA } },
    ),
  );

  assert.equal(status, 200);
  assert.equal(payload.data.iban, "IT60X0542811101000000123456");
});
