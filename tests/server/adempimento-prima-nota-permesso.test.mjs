import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **La seconda porta alla prima nota chiede la stessa chiave della prima.**
 * (B-H6, revisione finale della Wave 6)
 *
 * `createAccountingEntry` non contiene il permesso: lo chiede l'involucro
 * `accountingRoute`. `completeObligation` la chiamava da una rotta custodita
 * dal solo `sport_work.manage`, con uno scope composto a mano e l'importo dal
 * corpo: un ruolo personalizzato con quella chiave e senza
 * `accounting.manage` scriveva un'uscita in prima nota.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const CASSA = "cccccccc-0000-4000-8000-00000000c001";
const UTENTE = "11111111-0000-4000-8000-000000000aaa";

/** `sport_work.manage` senza `accounting.manage`: e l'editor dei ruoli a concederle separate. */
const SOLO_LAVORO = "custom:club_manager:lavoro-sportivo#sport_work.manage,sport_work.read";
/** Le due chiavi insieme, sempre come ruolo personalizzato. */
const LAVORO_E_PRIMA_NOTA =
  "custom:club_manager:amministrazione#sport_work.manage,sport_work.read,accounting.read,accounting.manage";

const scope = (activeRole = "owner") => ({
  userId: UTENTE,
  activeOrganizationId: CLUB,
  activeRole,
  allowedOrganizationIds: [CLUB],
});

let agenda;
let setPrismaClientForTests;
let fake;

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
  sportWorkObligation: [
    {
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
    },
  ],
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
const adempimento = () => fake.rows("sportWorkObligation")[0];

const versamento = () => ({
  financialAccountId: CASSA,
  operationTypeCode: "contributi_lavoro_sportivo",
  amount: 316,
  paidAt: "2026-11-14T00:00:00.000Z",
});

test("senza `accounting.manage` l'adempimento non scrive in prima nota, e non si chiude", async () => {
  await assert.rejects(
    () => agenda.completeObligation("obl-1", { payment: versamento() }, scope(SOLO_LAVORO)),
    /Accesso negato/,
  );

  assert.equal(movimenti().length, 0);
  assert.equal(adempimento().status, "DUE", "il 403 arriva prima di marcare l'adempimento assolto");
});

test("nemmeno dal recupero: un adempimento gia assolto non registra il versamento senza la chiave", async () => {
  adempimento().status = "COMPLETED";

  await assert.rejects(
    () => agenda.completeObligation("obl-1", { payment: versamento() }, scope(SOLO_LAVORO)),
    /Accesso negato/,
  );
  assert.equal(movimenti().length, 0);
});

test("controspecchio: assolvere senza registrare il versamento resta un atto del lavoro sportivo", async () => {
  const esito = await agenda.completeObligation(
    "obl-1",
    { notes: "Versato allo sportello" },
    scope(SOLO_LAVORO),
  );

  assert.equal(esito.status, "COMPLETED");
  assert.equal(movimenti().length, 0);
});

test("controspecchio: con le due chiavi il ruolo personalizzato registra il versamento", async () => {
  const esito = await agenda.completeObligation(
    "obl-1",
    { payment: versamento() },
    scope(LAVORO_E_PRIMA_NOTA),
  );

  assert.equal(esito.status, "COMPLETED");
  assert.equal(movimenti().length, 1);
  assert.equal(movimenti()[0].direction, "OUT");
});

test("controspecchio: il ruolo base con la prima nota la scrive come prima", async () => {
  await agenda.completeObligation("obl-1", { payment: versamento() }, scope("owner"));
  assert.equal(movimenti().length, 1);
});
