import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **«I miei compensi»: la chiave che nessuno chiedeva, e il dato che non deve
 * uscire** (W6-32).
 *
 * Due classi di difetto, e sono opposte:
 *
 * 1. una chiave concessa e mai interrogata — `sport_work.read_own` e stata per
 *    due Wave l'unica del catalogo senza un atto da proteggere. Qui si prova
 *    che la superficie esiste e che chiede **quella** chiave, non quella della
 *    direzione: chiedere `sport_work.read` avrebbe reso la pagina
 *    inaccessibile proprio a chi e stata scritta;
 * 2. una superficie «propria» che, per un legame sbagliato o per una `where`
 *    troppo larga, consegna i compensi di **un altro**. E il rischio specifico
 *    di questo dominio, perche `sport_work_people` non ha `user_id` e il
 *    legame va ricostruito.
 */

const CLUB = "aaaaaaaa-6c32-4000-8000-00000000000a";
const ALTRO_CLUB = "bbbbbbbb-6c32-4000-8000-00000000000b";

const MISTER = "22222222-6c32-4000-8000-000000000bbb";
const COLLEGA = "33333333-6c32-4000-8000-000000000ccc";
const ESTRANEO = "44444444-6c32-4000-8000-000000000ddd";

const PERSONA_MISTER = "99999999-6c32-4000-8000-000000000001";
const PERSONA_COLLEGA = "99999999-6c32-4000-8000-000000000002";

const RAPPORTO_MISTER = "77777777-6c32-4000-8000-000000000001";
const RAPPORTO_COLLEGA = "77777777-6c32-4000-8000-000000000002";

let area;
let setPrismaClientForTests;
let fake;

const scope = (activeRole, userId) => ({
  userId,
  activeOrganizationId: CLUB,
  activeRole,
  allowedOrganizationIds: [CLUB, ALTRO_CLUB],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  area = await import("../../src/lib/server/trainer-area.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const rapporto = (id, personId, importo) => ({
  id,
  organization_id: CLUB,
  person_id: personId,
  role: "COACH",
  relationship_type: "SPORT_COCOCO",
  status: "ACTIVE",
  start_date: new Date("2026-07-01T00:00:00.000Z"),
  end_date: null,
  contract_amount: importo,
  currency: "EUR",
  compensation_frequency: "SEASONAL",
});

const rata = (id, relationshipId, importo) => ({
  id,
  organization_id: CLUB,
  plan_id: `piano-${relationshipId}`,
  relationship_id: relationshipId,
  sequence: 1,
  label: "Prima rata",
  due_date: new Date("2026-10-31T00:00:00.000Z"),
  gross_amount: importo,
  accrued_amount: importo,
  paid_amount: 0,
  remaining_amount: importo,
  status: "ACCRUED",
  fiscal_year: 2026,
});

const seed = () => ({
  user: [
    { id: MISTER, email: "mister@club.it" },
    { id: COLLEGA, email: "collega@club.it" },
    { id: ESTRANEO, email: "estraneo@club.it" },
  ],
  club: [
    {
      id: CLUB,
      name: "Club",
      trainers: [
        {
          id: "t-mister",
          name: "Mister Uno",
          email: "mister@club.it",
          linkedUserId: MISTER,
          categories: ["u15"],
        },
        {
          id: "t-collega",
          name: "Mister Due",
          email: "collega@club.it",
          linkedUserId: COLLEGA,
          categories: ["prima"],
        },
      ],
      staff_members: [],
      categories: [{ id: "u15", name: "Under 15" }],
    },
  ],
  sportWorkPerson: [
    {
      id: PERSONA_MISTER,
      organization_id: CLUB,
      origin_type: "trainer",
      origin_id: "t-mister",
      first_name: "Uno",
      last_name: "Mister",
      email: "mister@club.it",
      /* Dati che **non devono uscire**: sono qui apposta. */
      iban: "IT60X0542811101000000123456",
      fiscal_code: "MSTRUN80A01H501Z",
      notes: "Nota interna della segreteria",
    },
    {
      id: PERSONA_COLLEGA,
      organization_id: CLUB,
      origin_type: "trainer",
      origin_id: "t-collega",
      first_name: "Due",
      last_name: "Mister",
      email: "collega@club.it",
      iban: "IT60X0542811101000000999999",
    },
  ],
  sportWorkRelationship: [
    rapporto(RAPPORTO_MISTER, PERSONA_MISTER, 1200),
    rapporto(RAPPORTO_COLLEGA, PERSONA_COLLEGA, 51234),
  ],
  sportWorkInstallment: [
    rata("r1", RAPPORTO_MISTER, 600),
    rata("r2", RAPPORTO_COLLEGA, 51235),
  ],
  sportWorkExternalDeclaration: [
    {
      id: "d1",
      organization_id: CLUB,
      person_id: PERSONA_MISTER,
      fiscal_year: 2026,
      external_amount: 300,
      declaration_date: new Date("2026-01-15T00:00:00.000Z"),
      status: "ACTIVE",
      has_other_coverage: false,
    },
    {
      id: "d2",
      organization_id: CLUB,
      person_id: PERSONA_COLLEGA,
      fiscal_year: 2026,
      external_amount: 51236,
      declaration_date: new Date("2026-01-15T00:00:00.000Z"),
      status: "ACTIVE",
      has_other_coverage: true,
    },
  ],
  sportWorkYearPosition: [
    {
      id: "p1",
      organization_id: CLUB,
      person_id: PERSONA_MISTER,
      year: 2026,
      club_gross: 600,
      external_declared: 300,
      progressive: 900,
      payment_count: 1,
      last_payment_at: new Date("2026-09-30T00:00:00.000Z"),
      has_current_declaration: true,
    },
    {
      id: "p2",
      organization_id: CLUB,
      person_id: PERSONA_COLLEGA,
      year: 2026,
      club_gross: 51237,
      external_declared: 0,
      progressive: 51237,
      payment_count: 3,
      last_payment_at: null,
      has_current_declaration: false,
    },
  ],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

/* ============================================ il permesso, e quale ======= */

test("W6-32 · la superficie chiede sport_work.read_own", async () => {
  /*
    Il genitore e l'unico ruolo che non ha nemmeno `read_own`: se passasse,
    vorrebbe dire che la guardia non e agganciata alla chiave.
  */
  await assert.rejects(
    () => area.readOwnCompensationStatement(scope("parent", MISTER)),
    /Accesso negato/,
  );
});

test("W6-32 · l'allenatore, che non ha sport_work.read, legge i propri", async () => {
  const statement = await area.readOwnCompensationStatement(
    scope("trainer", MISTER),
    { year: 2026 },
  );

  assert.ok(statement, "la chiave del ruolo direzione qui avrebbe chiuso tutto");
  assert.equal(statement.personId, PERSONA_MISTER);
  assert.equal(statement.position.clubGross, 600);
});

/* =========================== i compensi di un altro non escono =========== */

test("W6-32 · non escono i compensi di un'altra persona", async () => {
  const statement = await area.readOwnCompensationStatement(
    scope("trainer", MISTER),
    { year: 2026 },
  );

  assert.deepEqual(
    statement.relationships.map((riga) => riga.id),
    [RAPPORTO_MISTER],
  );
  assert.deepEqual(
    statement.installments.map((riga) => riga.id),
    ["r1"],
    "le rate non hanno person_id: si filtrano sui rapporti, non sul club",
  );
  assert.deepEqual(
    statement.declarations.map((riga) => riga.id),
    ["d1"],
  );

  const serializzato = JSON.stringify(statement);
  for (const estraneo of ["51234", "51235", "51236", "51237", PERSONA_COLLEGA]) {
    assert.equal(
      serializzato.includes(estraneo),
      false,
      `il dato del collega e uscito: ${estraneo}`,
    );
  }
});

/**
 * **La risposta e un elenco chiuso, non un oggetto ripulito** (regola 5I).
 *
 * Se la si costruisse togliendo campi da una riga completa, la colonna
 * aggiunta domani allo schema uscirebbe da sola — ed e cosi che un IBAN
 * finisce in una pagina.
 */
test("W6-32 · IBAN, codice fiscale e note interne non escono", async () => {
  const statement = await area.readOwnCompensationStatement(
    scope("trainer", MISTER),
    { year: 2026 },
  );

  const serializzato = JSON.stringify(statement);
  for (const riservato of [
    "IT60X0542811101000000123456",
    "MSTRUN80A01H501Z",
    "Nota interna della segreteria",
  ]) {
    assert.equal(
      serializzato.includes(riservato),
      false,
      `campo riservato uscito: ${riservato}`,
    );
  }
});

/* ================================= il legame mancante non e un elenco ==== */

/**
 * Il caso che una `where` scritta male trasformerebbe in un disastro: un
 * utente senza nessuna persona collegata. Con `origin_id: { in: [] }` e una
 * email nulla, una query permissiva restituirebbe la **prima** riga
 * dell'elenco, cioe i compensi di uno sconosciuto.
 */
test("W6-32 · chi non e nel registro riceve «niente», non la prima riga", async () => {
  const statement = await area.readOwnCompensationStatement(
    scope("trainer", ESTRANEO),
    { year: 2026 },
  );

  assert.equal(statement, null);
});

test("W6-32 · senza club attivo non si legge niente", async () => {
  await assert.rejects(
    () =>
      area.readOwnCompensationStatement({
        userId: MISTER,
        activeOrganizationId: null,
        activeRole: "trainer",
        allowedOrganizationIds: [CLUB],
      }),
    /Accesso negato/,
  );
});

/* ============ l'ambiguita non si scioglie tirando a sorte (difetto HIGH) === */

/**
 * **Il caso vuoto era protetto; quello ambiguo no.**
 *
 * La prima scrittura chiedeva le persone con un `OR` fra il legame di origine
 * e l'email, e prendeva `persone[0]`. `sport_work_people` non ha nessun
 * `@@unique` ne su `email` ne su `origin_id`, e non c'era `orderBy`: quale
 * riga fosse la prima lo decideva Postgres.
 *
 * Bastava percio un duplicato da re-import, o due persone che condividono una
 * casella — due coniugi, un indirizzo `segreteria@` — perche «I miei compensi»
 * consegnasse nome, importo del rapporto, rate, dichiarazioni e **posizione
 * annuale** di un'altra persona, senza che nessuno se ne accorgesse.
 *
 * La regola scelta ha due parti, e le due prove che seguono le fissano:
 *
 * 1. **il legame esplicito batte l'email**, perche e scritto da qualcuno
 *    mentre una casella si condivide;
 * 2. **un'ambiguita irrisolvibile nega**, e non indovina: due righe che
 *    rispondono alla stessa utenza sono un dato da correggere, e finche non e
 *    corretto la risposta giusta e nessuna.
 */

const persona = (id, overrides = {}) => ({
  id,
  organization_id: CLUB,
  origin_type: "trainer",
  origin_id: "t-mister",
  first_name: "Uno",
  last_name: "Mister",
  email: "mister@club.it",
  ...overrides,
});

test("W6-32 · due righe collegate alla stessa scheda: si nega, non si sceglie", async () => {
  const dati = seed();
  /* Il duplicato da re-import: stessa scheda di origine, riga nuova. */
  dati.sportWorkPerson.push(
    persona("99999999-6c32-4000-8000-00000000dupe", {
      first_name: "Uno (duplicato)",
    }),
  );
  fake = createFakePrisma(dati);
  setPrismaClientForTests(fake.client);

  await assert.rejects(
    () => area.readOwnCompensationStatement(scope("trainer", MISTER), { year: 2026 }),
    /Accesso negato/,
  );
});

test("W6-32 · una casella condivisa non identifica nessuno: si nega", async () => {
  const dati = seed();
  /*
    Nessuna delle due porta il legame alla scheda: restano due anagrafiche
    inserite a mano che dichiarano lo stesso indirizzo. E il caso dei coniugi,
    o della casella `segreteria@`.
  */
  dati.sportWorkPerson = [
    persona("99999999-6c32-4000-8000-0000000email1", {
      origin_type: "external",
      origin_id: null,
    }),
    persona("99999999-6c32-4000-8000-0000000email2", {
      origin_type: "external",
      origin_id: null,
      first_name: "Coniuge",
    }),
  ];
  fake = createFakePrisma(dati);
  setPrismaClientForTests(fake.client);

  await assert.rejects(
    () => area.readOwnCompensationStatement(scope("trainer", MISTER), { year: 2026 }),
    /Accesso negato/,
  );
});

test("W6-32 · il legame esplicito vince, e l'omonimo per email non si guarda", async () => {
  const dati = seed();
  /*
    Un collega registrato con la stessa casella del mister. Con l'`OR` di
    prima erano due candidati indistinguibili; con le due strade in ordine, il
    legame scritto sulla scheda risponde da solo e l'email non si consulta
    nemmeno — non c'e ambiguita da dichiarare.
  */
  dati.sportWorkPerson.push(
    persona("99999999-6c32-4000-8000-0000000shared", {
      origin_type: "external",
      origin_id: null,
      first_name: "Casella",
      last_name: "Condivisa",
    }),
  );
  fake = createFakePrisma(dati);
  setPrismaClientForTests(fake.client);

  const statement = await area.readOwnCompensationStatement(
    scope("trainer", MISTER),
    { year: 2026 },
  );

  assert.equal(statement.personId, PERSONA_MISTER);
});

test("W6-32 · un identificativo che coincide con quello di un'altra origine non e un legame", async () => {
  const dati = seed();
  /*
    `origin_id` e testo libero — «gli allenatori JSON non hanno UUID», dice lo
    schema — quindi lo stesso valore puo comparire come identificativo di un
    atleta. Cercare per solo `origin_id` avrebbe reso quella collisione un
    candidato, e con il duplicato un rifiuto al posto di una risposta.
  */
  dati.sportWorkPerson.push(
    persona("99999999-6c32-4000-8000-0000000athlet", {
      origin_type: "athlete",
      email: null,
      first_name: "Atleta",
      last_name: "Omonimo",
    }),
  );
  fake = createFakePrisma(dati);
  setPrismaClientForTests(fake.client);

  const statement = await area.readOwnCompensationStatement(
    scope("trainer", MISTER),
    { year: 2026 },
  );

  assert.equal(statement.personId, PERSONA_MISTER);
});

/* ================================ la lettura non cresce con il club ======= */

/**
 * Le rate si chiedevano **per club** e si filtravano in memoria: corretto nel
 * risultato — la prova sopra lo verifica — ma una lettura che cresce con il
 * club, e che fa passare dalla rete il piano di pagamento di tutti per
 * mostrarne uno.
 */
test("W6-32 · le rate si chiedono sui rapporti della persona, non su tutto il club", async () => {
  await area.readOwnCompensationStatement(scope("trainer", MISTER), {
    year: 2026,
  });

  const where = fake.lastCall("sportWorkInstallment", "findMany").args.where;

  assert.equal(where.organization_id, CLUB);
  assert.deepEqual(where.relationship_id, { in: [RAPPORTO_MISTER] });
});
