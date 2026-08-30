import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Le due porte che restavano aperte dopo che il confine era chiuso.**
 *
 * La revisione di conferma della Wave 4 ha trovato che il confine multi-tenant
 * — costruito, documentato e collaudato — era aggirabile in due modi che nessun
 * controllo di confine poteva vedere, perche **nessuno dei due lo attraversa**.
 *
 * 1. `createResource` non chiamava `assertRecordAccess` **mai**. In modo
 *    `upsert` non crea: aggiorna per chiave, e la chiave la sceglie chi chiama.
 *    Su `users` la chiave e l'email, e `password` diventa `password_hash` per
 *    strada: bastava un `POST /api/v1/users` in `upsert` per riscrivere la
 *    password di chiunque. Il divieto di scrivere `users.role` restava intatto
 *    e inutile — non serviva diventare amministratore, bastava entrare nel suo
 *    account.
 *
 * 2. `syncUserClubAccess` scriveva `organization_users` dal corpo della
 *    richiesta senza guardarlo. La riga modificata era la **propria**, quindi
 *    il confine dava ragione all'attaccante; ma il corpo portava un
 *    `club_access` che nominava un club qualsiasi con ruolo `owner`. Da li in
 *    poi il confine continuava a dargli ragione, perche a quel punto **aveva
 *    ragione**: era owner davvero.
 *
 * Questo file esiste perche fallisca.
 */

const MIO = "aaaaaaaa-3333-4000-8000-00000000000a";
const ALTRUI = "bbbbbbbb-3333-4000-8000-00000000000b";
const IO = "11111111-3333-4000-8000-000000000aaa";
const VITTIMA = "22222222-3333-4000-8000-000000000bbb";

const scopeAttaccante = () => ({
  userId: IO,
  activeOrganizationId: MIO,
  activeRole: "owner",
  allowedOrganizationIds: [MIO],
});

let risorse;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  risorse = await import("../../src/lib/server/resources.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const seed = () => ({
  user: [
    { id: IO, email: "io@example.it", password_hash: "$2b$MIO", role: "user" },
    {
      id: VITTIMA,
      email: "presidente@altrasocieta.it",
      password_hash: "$2b$VITTIMA",
      first_name: "Presidente",
      role: "platform_admin",
    },
  ],
  club: [
    { id: MIO, slug: "mio", name: "Il mio club", creator_id: IO },
    { id: ALTRUI, slug: "altrui", name: "Club altrui", creator_id: VITTIMA },
  ],
  organizationUser: [
    { id: "ou-1", organization_id: MIO, user_id: IO, role: "owner", is_primary: true },
  ],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const negato = /Accesso negato/;

/* ============================== 1. l'upsert che modificava === */

test("un upsert per email non riscrive la password di un altro", async () => {
  await assert.rejects(
    () =>
      risorse.createResource(
        "users",
        { email: "presidente@altrasocieta.it", password: "Password!Nuova9" },
        "upsert",
        scopeAttaccante(),
      ),
    negato,
  );

  const vittima = fake.rows("user").find((riga) => riga.id === VITTIMA);
  assert.equal(
    vittima.password_hash,
    "$2b$VITTIMA",
    "la password della vittima non e stata toccata",
  );
});

test("un upsert per id non riscrive la scheda di un altro", async () => {
  await assert.rejects(
    () =>
      risorse.createResource(
        "users",
        { id: VITTIMA, first_name: "Preso", password: "Password!Nuova9" },
        "upsert",
        scopeAttaccante(),
      ),
    negato,
  );

  const vittima = fake.rows("user").find((riga) => riga.id === VITTIMA);
  assert.equal(vittima.first_name, "Presidente");
  assert.equal(vittima.password_hash, "$2b$VITTIMA");
});

test("una riga personale non si crea per conto di un altro", async () => {
  await assert.rejects(
    () =>
      risorse.createResource(
        "users",
        { id: "99999999-3333-4000-8000-000000000ccc", email: "nuovo@example.it" },
        "create",
        scopeAttaccante(),
      ),
    negato,
  );
});

test("la propria scheda resta modificabile", async () => {
  const record = await risorse.createResource(
    "users",
    { id: IO, first_name: "Io stesso" },
    "upsert",
    scopeAttaccante(),
  );
  assert.equal(record.first_name, "Io stesso");
});

/* ============================== 2. la tessera che si firmava da sola === */

test("non ci si tessera da soli in un club che non e il proprio", async () => {
  await assert.rejects(
    () =>
      risorse.updateResource(
        "users",
        IO,
        { club_access: [{ club_id: ALTRUI, role: "owner", is_primary: true }] },
        scopeAttaccante(),
      ),
    negato,
  );

  const tessere = fake.rows("organizationUser").filter(
    (riga) => riga.organization_id === ALTRUI,
  );
  assert.deepEqual(tessere, [], "nessuna tessera nel club altrui");
});

test("la stessa concessione dalla porta principale e negata", async () => {
  await assert.rejects(
    () =>
      risorse.createResource(
        "organization_users",
        { organization_id: ALTRUI, user_id: IO, role: "owner" },
        "upsert",
        scopeAttaccante(),
      ),
    negato,
  );

  assert.equal(
    fake.rows("organizationUser").filter(
      (riga) => riga.organization_id === ALTRUI,
    ).length,
    0,
  );
});

test("chi ha creato il club puo tesserarsi nel club che ha creato", async () => {
  await risorse.updateResource(
    "users",
    IO,
    { club_access: [{ club_id: MIO, role: "club_creator", is_primary: true }] },
    scopeAttaccante(),
  );

  const tessera = fake.rows("organizationUser").find(
    (riga) => riga.organization_id === MIO && riga.role === "club_creator",
  );
  assert.ok(tessera, "la tessera del fondatore nasce");
});

test("riscrivere una tessera che c'e gia non concede niente", async () => {
  await risorse.updateResource(
    "users",
    IO,
    { club_access: [{ club_id: MIO, role: "owner", is_primary: false }] },
    scopeAttaccante(),
  );

  const tessera = fake.rows("organizationUser").find(
    (riga) => riga.id === "ou-1",
  );
  assert.equal(tessera.is_primary, false, "cambia solo cio che non e un permesso");
});

test("un amministratore tessera qualcun altro nel club attivo", async () => {
  await risorse.createResource(
    "organization_users",
    { organization_id: MIO, user_id: VITTIMA, role: "trainer" },
    "upsert",
    scopeAttaccante(),
  );

  const tessera = fake.rows("organizationUser").find(
    (riga) => riga.user_id === VITTIMA && riga.organization_id === MIO,
  );
  assert.ok(tessera, "nel proprio club si tessera, ed e il caso legittimo");
});

test("un genitore non tessera nessuno, nemmeno nel club attivo", async () => {
  await assert.rejects(
    () =>
      risorse.createResource(
        "organization_users",
        { organization_id: MIO, user_id: VITTIMA, role: "owner" },
        "upsert",
        { ...scopeAttaccante(), activeRole: "parent" },
      ),
    negato,
  );
});
