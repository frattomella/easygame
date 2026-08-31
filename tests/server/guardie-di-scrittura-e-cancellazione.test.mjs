import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * ===========================================================================
 * Tredicesima tornata — chi si aggancia a chi, e cosa si porta via una
 * cancellazione
 * ===========================================================================
 *
 * Il filo comune trovato dall'audit su export e cancellazione, e la ragione
 * per cui questi tre difetti sono rimasti in piedi cosi a lungo:
 *
 * > Ogni guardia di questo prodotto e scritta sul **nome della risorsa** che
 * > si cancella, mentre Postgres distrugge per **raggiungibilita**.
 *
 * Le guardie fiscali sanno rifiutare `DELETE /api/v1/invoices/<emessa>`
 * spiegando che un buco nella numerazione non e spiegabile. Non sapevano
 * niente di cio che una cancellazione **un livello piu su** — un club, un
 * utente — o **di fianco** — un atleta — si porta dietro attraverso la catena
 * del database.
 *
 * `resources.ts` e importabile da questo runner: la nota che diceva il
 * contrario risaliva a prima di WP-04 ed e stata corretta. Questi sono quindi
 * test di comportamento, non ispezioni del sorgente.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const ALTRO_CLUB = "aaaaaaaa-0000-4000-8000-000000000002";
const UTENTE = "cccccccc-0000-4000-8000-00000000000a";
const ESTRANEO = "cccccccc-0000-4000-8000-00000000000b";
const ATLETA = "bbbbbbbb-0000-4000-8000-00000000000a";
const ATLETA_ALTRUI = "bbbbbbbb-0000-4000-8000-00000000000b";

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

const scope = () => ({
  userId: UTENTE,
  activeOrganizationId: CLUB,
  allowedOrganizationIds: [CLUB],
  activeRole: "owner",
});

const seed = () => ({
  club: [
    { id: CLUB, name: "ASD Alfa", creator_id: UTENTE },
    { id: ALTRO_CLUB, name: "ASD Beta", creator_id: ESTRANEO },
  ],
  user: [
    { id: UTENTE, email: "gestore@example.it" },
    { id: ESTRANEO, email: "estraneo@example.it" },
  ],
  organizationUser: [
    { id: "ou-1", organization_id: CLUB, user_id: UTENTE, role: "owner" },
    {
      id: "ou-2",
      organization_id: ALTRO_CLUB,
      user_id: ESTRANEO,
      role: "owner",
    },
  ],
  athlete: [
    { id: ATLETA, organization_id: CLUB, first_name: "Anna", last_name: "Rossi" },
    {
      id: ATLETA_ALTRUI,
      organization_id: ALTRO_CLUB,
      first_name: "Luca",
      last_name: "Bianchi",
    },
  ],
  notification: [],
  athleteCategoryMembership: [],
  fundingSettlementLine: [],
  invoice: [],
  receipt: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

/* ==================================================================== */
/* Il destinatario di una notifica                                       */
/* ==================================================================== */

/**
 * **Togliere il campo non e un modo di scavalcare la guardia.**
 *
 * La guardia rifiutava `{"user_id": null}` e usciva subito quando la chiave
 * era **assente** — e nessuno inietta `user_id` a monte, la colonna e
 * nullable, quindi Prisma scriveva `NULL` lo stesso. Cioe esattamente la riga
 * «di tutti» che la guardia esiste per impedire, ottenuta togliendo un campo
 * invece che scrivendoci dentro.
 *
 * Rifiutare `null` e lasciar passare `{}` non e una guardia: e un dosso.
 */
test("una notifica senza destinatario non si scrive, nemmeno omettendo il campo", async () => {
  await assert.rejects(
    () =>
      resources.createResource(
        "notifications",
        { title: "Avviso", message: "a tutti", type: "system" },
        "create",
        scope(),
      ),
    /Accesso negato/,
    "la chiave assente vale quanto `user_id: null`",
  );

  assert.equal(fake.rows("notification").length, 0);
});

test("ne scrivendoci dentro «nessuno»", async () => {
  await assert.rejects(
    () =>
      resources.createResource(
        "notifications",
        { user_id: null, title: "Avviso", message: "a tutti", type: "system" },
        "create",
        scope(),
      ),
    /Accesso negato/,
  );
});

test("il destinatario deve appartenere al club in cui si scrive", async () => {
  await assert.rejects(
    () =>
      resources.createResource(
        "notifications",
        {
          user_id: ESTRANEO,
          title: "Ciao",
          message: "…",
          type: "system",
        },
        "create",
        scope(),
      ),
    /Accesso negato/,
    "altrimenti parte una email vera, dal server del club, a un account di un'altra societa",
  );
});

test("a un tesserato del club invece si scrive", async () => {
  const creata = await resources.createResource(
    "notifications",
    { user_id: UTENTE, title: "Ciao", message: "…", type: "system" },
    "create",
    scope(),
  );

  assert.ok(creata);
  assert.equal(fake.rows("notification").length, 1);
  assert.equal(fake.rows("notification")[0].user_id, UTENTE);
});

/* ==================================================================== */
/* Il padre di una riga figlia                                           */
/* ==================================================================== */

/**
 * `organization_id` era forzato al club della sessione — la riga nasceva nel
 * club giusto — ma nessuno guardava **a chi si attacca**. La riga finiva quindi
 * nel club di chi scrive, pendendo dall'atleta di qualcun altro; e un
 * `site_id` iniettato li dentro fa sparire quell'atleta da ogni elenco per
 * sede del suo club, perche non corrisponde a nessuna sua sede e non e piu
 * «senza sede».
 */
test("non si aggancia un'appartenenza all'atleta di un altro club", async () => {
  await assert.rejects(
    () =>
      resources.createResource(
        "athlete_category_memberships",
        { athlete_id: ATLETA_ALTRUI, category_name: "Pulcini" },
        "create",
        scope(),
      ),
    /Accesso negato/,
  );

  assert.equal(fake.rows("athleteCategoryMembership").length, 0);
});

test("all'atleta del proprio club si", async () => {
  await resources.createResource(
    "athlete_category_memberships",
    { athlete_id: ATLETA, category_name: "Pulcini" },
    "create",
    scope(),
  );

  assert.equal(fake.rows("athleteCategoryMembership").length, 1);
});

/* ==================================================================== */
/* Cosa si porta via una cancellazione                                   */
/* ==================================================================== */

/**
 * La catena e `athletes -> funding_accruals -> funding_settlement_lines`, e
 * `athletes` non e fra le risorse riservate: la **segreteria** cancella un
 * atleta tutti i giorni, ed e giusto.
 *
 * La testata della liquidazione sopravvive con l'importo intero erogato
 * dall'ente; le righe che lo giustificano sparivano. Il totale «liquidato»
 * restava senza nessuno a cui attribuirlo, e la riconciliazione da consegnare
 * al finanziatore perdeva beneficiari in silenzio.
 */
test("un atleta con contributi gia liquidati non si cancella", async () => {
  fake.rows("fundingSettlementLine").push({
    id: "line-1",
    organization_id: CLUB,
    accrual: { athlete_id: ATLETA },
  });

  await assert.rejects(
    () => resources.deleteResource("athletes", ATLETA, scope()),
    /contributi gia liquidati/i,
  );
});

test("un atleta senza contributi liquidati si cancella", async () => {
  await resources.deleteResource("athletes", ATLETA, scope());
  assert.equal(
    fake.rows("athlete").some((riga) => riga.id === ATLETA),
    false,
  );
});

/**
 * `clubs` e una risorsa di modello, quindi `DELETE /api/v1/clubs/<il proprio>`
 * e raggiungibile da proprietario e gestore — e sotto quella riga la
 * cancellazione a catena tocca **cinquantaquattro tabelle**, misurate sul
 * database di sviluppo.
 *
 * Il prodotto rifiuta `DELETE /api/v1/invoices/<emessa>` dicendo che un buco
 * nella numerazione non e spiegabile, e poi le cancellava tutte insieme un
 * livello piu su. Due porte non possono rispondere diversamente sulla stessa
 * cosa.
 */
test("un club che ha emesso documenti fiscali non si cancella da una rotta CRUD", async () => {
  fake.rows("invoice").push({
    id: "inv-1",
    organization_id: CLUB,
    invoice_number: "2026/1",
  });

  await assert.rejects(
    () => resources.deleteResource("clubs", CLUB, scope()),
    /documenti fiscali/i,
  );

  assert.equal(
    fake.rows("club").some((riga) => riga.id === CLUB),
    true,
    "il club deve essere ancora li",
  );
});
