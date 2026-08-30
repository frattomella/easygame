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

/* ------------------------ le tessere di un club, e il libro soci */

/**
 * **Due cose diverse sotto lo stesso nome.**
 *
 * `members` in `clubs` e la collezione dei **soci** — un'anagrafica — ed e
 * chiusa alla riscrittura di massa. Ma `syncClubMembers` leggeva
 * `input.members` come elenco delle **tessere di accesso**, e le due si
 * incontravano nella creazione di un club: la tessera del fondatore veniva
 * scritta, e subito dopo il ciclo sulle collezioni la rileggeva come libro
 * soci e rifiutava la richiesta.
 *
 * `POST /api/v1/clubs` rispondeva quindi «Accesso negato» **dopo** aver
 * scritto il club e la tessera: la schermata diceva «Errore creazione club» e
 * il club esisteva.
 */
test("creare un club scrive la tessera del fondatore, e non fallisce", async () => {
  const NUOVO = "44444444-3333-4000-8000-000000000ddd";

  const record = await risorse.createResource(
    "clubs",
    {
      id: NUOVO,
      name: "Club nuovo",
      slug: "club-nuovo",
      creator_id: IO,
      memberships: [{ user_id: IO, role: "owner", is_primary: true }],
    },
    "create",
    scopeAttaccante(),
  );

  assert.equal(record.id, NUOVO);
  const tessera = fake
    .rows("organizationUser")
    .find((riga) => riga.organization_id === NUOVO && riga.user_id === IO);
  assert.ok(tessera, "la tessera del fondatore nasce con il club");
});

test("il libro soci resta chiuso alla riscrittura di massa", async () => {
  await assert.rejects(
    () =>
      risorse.updateResource(
        "clubs",
        MIO,
        { members: [{ id: "socio-1", fiscal_code: "RSSNNA80A41H501K" }] },
        scopeAttaccante(),
      ),
    /Accesso negato/,
  );
});

/**
 * **Una relazione annidata scavalcava il confine.**
 *
 * Il corpo passava da un **elenco di negazione** — otto nomi scritti a mano —
 * e tutto cio che non era nell'elenco arrivava a Prisma cosi com'era.
 * Togliendo l'unicita da `Invoice.payment_id`, la relazione inversa e
 * diventata `invoices` al plurale, e l'elenco continuava a negare `invoice` al
 * singolare, che da quel momento non esisteva piu.
 *
 * La riga figlia porta il club che il chiamante scrive, e il confine vincola
 * solo quello di primo livello: una fattura nasceva nel club di un altro,
 * senza numero della sequenza, senza fotografia, senza classificazione.
 */
test("una relazione annidata non entra nella scrittura", async () => {
  await risorse.createResource(
    "payments",
    {
      organization_id: MIO,
      amount: 10,
      description: "Rata",
      invoices: {
        create: { organization_id: ALTRUI, invoice_number: "X-1", amount: 999 },
      },
      receipts: {
        create: { organization_id: ALTRUI, receipt_number: "Y-1", amount: 999 },
      },
      transactions: {
        create: { organization_id: ALTRUI, amount: 999 },
      },
    },
    "create",
    scopeAttaccante(),
  );

  for (const tabella of ["invoice", "receipt", "paymentTransaction"]) {
    assert.equal(
      fake.rows(tabella).filter((r) => r.organization_id === ALTRUI).length,
      0,
      `nessuna riga ${tabella} nel club altrui`,
    );
  }
});

/* ------------------- il fondatore, e i valori che non sono valori */

/**
 * **Un club non si regala.**
 *
 * La creazione controllava che `creator_id` fosse quello della sessione; la
 * modifica no, e `creator_id` e una colonna scalare — arrivava intatta a
 * `delegate.update`. Con una richiesta sola un gestore poteva intestare il
 * club a chiunque, perche `resolveOrganizationScopeForUser` ricava da quella
 * colonna sia l'appartenenza sia il ruolo `owner`; e nello stesso gesto
 * **spodestava se stesso**. Il nuovo proprietario non compariva in nessuna
 * schermata delle tessere, perche di riga in `organization_users` non ne
 * nasceva nessuna.
 */
test("il fondatore di un club non si cambia dal registro generico", async () => {
  await risorse.updateResource(
    "clubs",
    MIO,
    { name: "Rinominato", creator_id: VITTIMA },
    scopeAttaccante(),
  );

  const club = fake.rows("club").find((riga) => riga.id === MIO);
  assert.equal(club.name, "Rinominato", "il resto della modifica passa");
  assert.equal(club.creator_id, IO, "il fondatore no");
});

/**
 * Un oggetto su una colonna scalare non e un valore: e un'**operazione** che
 * Prisma esegue. Le guardie leggono `normalized.<campo>` aspettandosi un
 * valore, quindi non lo riconoscono e lo lasciano passare intatto.
 */
test("un operatore su una colonna scalare non entra nella scrittura", async () => {
  for (const corpo of [
    { name: { set: "Operatore" } },
    { slug: { set: "operatore" } },
  ]) {
    await assert.rejects(
      () => risorse.updateResource("clubs", MIO, corpo, scopeAttaccante()),
      /attende un valore, non un'operazione/,
    );
  }

  const club = fake.rows("club").find((riga) => riga.id === MIO);
  assert.notEqual(club.name, "Operatore");
});

/**
 * E il rifiuto **non** dice «Accesso negato»: quella stringa e il marcatore
 * con cui il route handler generico ricava un 403, e un corpo scritto male
 * merita un 400 — con un messaggio che dica cosa correggere.
 */
test("un corpo malformato non e un problema di autorizzazione", async () => {
  await assert.rejects(
    () => risorse.updateResource("clubs", MIO, { name: { set: "x" } }, scopeAttaccante()),
    (errore) => {
      assert.ok(
        !String(errore.message).includes("Accesso negato"),
        "sarebbe un 403 su cio che e un 400",
      );
      return true;
    },
  );
});
