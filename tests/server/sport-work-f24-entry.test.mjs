import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **W4-C — il versamento dei contributi smette di essere invisibile.**
 *
 * Un adempimento assolto aggiornava **solo il proprio stato**: il denaro dei
 * contributi usciva dal club senza lasciare traccia in nessun registro. Il
 * costo del lavoro sportivo in prima nota risultava quindi sistematicamente
 * inferiore al vero, esattamente della parte contributiva — che su un compenso
 * non e una briciola.
 *
 * **Perche la riga non nasce nel registro delle uscite del lavoro sportivo.**
 * Quel registro e per persona: `person_id` e obbligatorio, e ogni riga consuma
 * o compensa le franchigie annue di **qualcuno**. Un F24 e pagato all'erario,
 * non a un lavoratore, e attribuirlo a una persona qualsiasi falserebbe il suo
 * progressivo — il numero piu delicato di tutto il dominio. E la ragione per
 * cui i tipi `CONTRIBUTION_PAYMENT` ed `EXTERNAL_PAYROLL_COST` sono dichiarati
 * in quel registro e nessun codice li produce.
 *
 * Il versamento e un fatto di cassa come l'affitto della palestra, e vive dove
 * vivono i fatti di cassa.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const CASSA = "cccccccc-0000-4000-8000-00000000c001";
const UTENTE = "11111111-0000-4000-8000-000000000aaa";

const scope = () => ({
  userId: UTENTE,
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
});

let agenda;
let setPrismaClientForTests;
let fake;

const adempimento = (over = {}) => ({
  id: "obl-1",
  organization_id: CLUB,
  kind: "F24",
  reference_key: "f24:2026-10",
  title: "Versamento contributi ottobre 2026",
  due_date: new Date("2026-11-16T00:00:00Z"),
  status: "DUE",
  amount: 316,
  period: "2026-10",
  source: "derived",
  person_id: null,
  ...over,
});

const seed = () => ({
  club: [{ id: CLUB, slug: "club-a", name: "Club A" }],
  financialAccount: [
    { id: CASSA, organization_id: CLUB, name: "Banca", kind: "BANK", is_archived: false },
  ],
  fiscalOperationType: [
    {
      id: "ft-contributi",
      organization_id: CLUB,
      code: "contributi_lavoro_sportivo",
      label: "Contributi lavoro sportivo",
      activity_scope: "institutional",
      is_active: true,
    },
  ],
  sportWorkObligation: [adempimento()],
  accountingEntry: [],
  auditLog: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  agenda = await import("../../src/lib/server/sport-work-agenda.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const movimenti = () => fake.rows("accountingEntry");

const versamento = (over = {}) => ({
  financialAccountId: CASSA,
  operationTypeCode: "contributi_lavoro_sportivo",
  paidAt: "2026-11-14T00:00:00.000Z",
  ...over,
});

/* ============================================ il denaro lascia una riga */

test("assolvere un F24 con conto e causale produce un'uscita in prima nota", async () => {
  const esito = await agenda.completeObligation(
    "obl-1",
    { payment: versamento() },
    scope(),
  );

  assert.equal(movimenti().length, 1);
  const riga = movimenti()[0];
  assert.equal(riga.direction, "OUT");
  assert.equal(riga.amount_cents, 31600, "l'importo dell'adempimento");
  assert.equal(riga.financial_account_id, CASSA);
  assert.equal(riga.operation_type_code, "contributi_lavoro_sportivo");
  assert.equal(riga.counterparty_kind, "ENTITY");
  assert.ok(esito.financialEntry, "la risposta porta la riga registrata");
  assert.equal(esito.financialEntrySkipped, null);
});

test("l'adempimento resta assolto, come prima", async () => {
  await agenda.completeObligation("obl-1", { payment: versamento() }, scope());

  assert.equal(fake.rows("sportWorkObligation")[0].status, "COMPLETED");
});

/* ==================================================== l'idempotenza */

test("assolvere due volte non fa uscire il denaro due volte", async () => {
  /*
    Due clic sul pulsante, o due richieste simultanee, portano la stessa chiave:
    `reference_key` e gia unica per club sull'adempimento, e diventa la chiave
    dell'evento finanziario.
  */
  await agenda.completeObligation("obl-1", { payment: versamento() }, scope());
  await agenda.completeObligation("obl-1", { payment: versamento() }, scope());

  assert.equal(movimenti().length, 1, "una riga, non due");
});

test("la chiave dell'evento e quella dell'adempimento", async () => {
  await agenda.completeObligation("obl-1", { payment: versamento() }, scope());

  assert.equal(movimenti()[0].source_event_key, "sport_work_obligation:f24:2026-10");
});

/* ============================== cosa succede se il dato non c'e ancora */

test("senza conto e causale l'adempimento si chiude, e lo dichiara", async () => {
  /*
    Non si blocca il lavoro della segreteria per un dato che puo arrivare dopo.
    Ma un versamento silenziosamente non registrato e un buco che nessuno vede,
    ed e il difetto che stiamo chiudendo: la risposta lo dice.
  */
  const esito = await agenda.completeObligation("obl-1", {}, scope());

  assert.equal(esito.status, "COMPLETED");
  assert.equal(movimenti().length, 0);
  assert.match(esito.financialEntrySkipped, /mancano il conto e la causale/i);
});

test("il movimento mancante si puo aggiungere dopo, sullo stesso adempimento", async () => {
  await agenda.completeObligation("obl-1", {}, scope());
  assert.equal(movimenti().length, 0);

  const esito = await agenda.completeObligation(
    "obl-1",
    { payment: versamento() },
    scope(),
  );

  assert.equal(movimenti().length, 1);
  assert.ok(esito.financialEntry);
});

test("un adempimento senza importo non produce una riga inventata", async () => {
  fake.rows("sportWorkObligation")[0].amount = null;

  const esito = await agenda.completeObligation(
    "obl-1",
    { payment: versamento() },
    scope(),
  );

  assert.equal(movimenti().length, 0);
  assert.match(esito.financialEntrySkipped, /non porta un importo/i);
});

/* ============================ gli adempimenti che non muovono denaro */

test("una scadenza di documento non produce nessun movimento", async () => {
  /*
    Un contratto in scadenza o una CU da preparare sono scadenze di documenti:
    non muovono un euro, e registrare un'uscita per esse sarebbe inventare.
  */
  fake.rows("sportWorkObligation")[0] = adempimento({
    id: "obl-2",
    kind: "CONTRACT_EXPIRY",
    reference_key: "contract:xyz",
    amount: null,
  });

  const esito = await agenda.completeObligation(
    "obl-2",
    { payment: versamento() },
    scope(),
  );

  assert.equal(movimenti().length, 0);
  assert.equal(esito.financialEntrySkipped, null, "non e un buco: e un adempimento senza denaro");
});

/* ========================================================= multi-tenant */

test("l'adempimento di un altro club non si assolve", async () => {
  await assert.rejects(
    () =>
      agenda.completeObligation(
        "obl-1",
        { payment: versamento() },
        {
          userId: "22222222-0000-4000-8000-000000000bbb",
          activeOrganizationId: "bbbbbbbb-0000-4000-8000-000000000002",
          activeRole: "owner",
          allowedOrganizationIds: ["bbbbbbbb-0000-4000-8000-000000000002"],
        },
      ),
    /Accesso negato/,
  );

  assert.equal(movimenti().length, 0);
});
