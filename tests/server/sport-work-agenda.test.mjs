import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Premi, rimborsi, fatture dei professionisti e agenda degli adempimenti.
 *
 * Quattro cose vanno dimostrate.
 *
 * 1. **Nessuno di questi e un compenso.** Un premio, un rimborso e una
 *    fattura escono dal registro — il denaro esce davvero — ma non consumano
 *    le franchigie del lavoratore. Sommarli dichiarerebbe superamenti che non
 *    ci sono.
 * 2. **La sincronizzazione dell'agenda e idempotente.** Rieseguirla non crea
 *    una seconda riga per la stessa scadenza, e quindi non produce una
 *    seconda notifica.
 * 3. **Un adempimento assolto non torna dovuto.** Qualcuno lo ha fatto.
 * 4. **Il confine di club regge su tutte e quattro le entita.**
 */

const CLUB_A = "aaaaaaaa-0000-4000-8000-000000000001";
const CLUB_B = "bbbbbbbb-0000-4000-8000-000000000002";
const PERSON_A = "11111111-0000-4000-8000-00000000000a";
const PERSON_B = "22222222-0000-4000-8000-00000000000b";
const REL_A = "33333333-0000-4000-8000-00000000000c";
const REL_PIVA = "44444444-0000-4000-8000-00000000000d";

const scopeA = () => ({
  userId: "user-a",
  activeOrganizationId: CLUB_A,
  activeRole: "owner",
  actorEmail: "a@example.test",
  allowedOrganizationIds: [CLUB_A],
});

const scopeB = () => ({
  userId: "user-b",
  activeOrganizationId: CLUB_B,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB_B],
});

let agenda;
let service;
let setPrismaClientForTests;
let fake;

const persona = (id, organizationId, overrides = {}) => ({
  id,
  organization_id: organizationId,
  origin_type: "trainer",
  first_name: "Marco",
  last_name: "Rossi",
  fiscal_code: "RSSMRC90A01H501A",
  fiscal_profile: "NONE",
  vat_number: null,
  social_coverage: "NONE",
  created_at: new Date("2026-08-01T00:00:00Z"),
  updated_at: new Date("2026-08-01T00:00:00Z"),
  ...overrides,
});

const rapporto = (id, organizationId, personId, overrides = {}) => ({
  id,
  organization_id: organizationId,
  person_id: personId,
  relationship_type: "SPORT_COCOCO",
  role: "COACH",
  status: "ACTIVE",
  start_date: new Date("2026-09-01T00:00:00Z"),
  end_date: new Date("2027-06-30T00:00:00Z"),
  currency: "EUR",
  rasd_status: "TO_PREPARE",
  created_at: new Date("2026-08-01T00:00:00Z"),
  updated_at: new Date("2026-08-01T00:00:00Z"),
  ...overrides,
});

const seed = () => ({
  sportWorkPerson: [persona(PERSON_A, CLUB_A), persona(PERSON_B, CLUB_B)],
  sportWorkRelationship: [
    rapporto(REL_A, CLUB_A, PERSON_A),
    rapporto(REL_PIVA, CLUB_A, PERSON_A, {
      relationship_type: "SELF_EMPLOYED_VAT",
    }),
    rapporto("rel-b", CLUB_B, PERSON_B),
  ],
  sportWorkInstallment: [],
  sportWorkOutboundTransaction: [],
  sportWorkExternalDeclaration: [],
  sportWorkYearPosition: [],
  sportWorkBonus: [],
  sportWorkExpenseReimbursement: [],
  sportWorkVatInvoice: [],
  sportWorkObligation: [],
  auditLog: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  agenda = await import("../../src/lib/server/sport-work-agenda.ts");
  service = await import("../../src/lib/server/sport-work.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const rejects = (promise, pattern) =>
  assert.rejects(promise, (error) => {
    assert.match(String(error.message), pattern);
    return true;
  });

const auditActions = () => fake.rows("auditLog").map((row) => row.action);

// --- premi -------------------------------------------------------------------

const creaPremio = (overrides = {}, scope = scopeA()) =>
  agenda.createBonus(
    {
      personId: PERSON_A,
      relationshipId: REL_A,
      reason: "Premio playoff",
      competition: "Playoff 2026/27",
      amount: 500,
      awardDate: "2027-05-20",
      ...overrides,
    },
    scope,
  );

test("un premio nasce con trattamento fiscale da verificare, non dedotto", async () => {
  const premio = await creaPremio();

  assert.equal(premio.fiscal_treatment, "TO_VERIFY");
  assert.equal(premio.status, "SCHEDULED");
  assert.equal(premio.amount, 500);
  assert.ok(auditActions().includes("sport_work.bonus.created"));
});

test("il trattamento fiscale di un premio si dichiara", async () => {
  const premio = await creaPremio({ fiscalTreatment: "VARIABLE_REMUNERATION" });
  assert.equal(premio.fiscal_treatment, "VARIABLE_REMUNERATION");
});

test("un premio senza causale non nasce", async () => {
  await rejects(creaPremio({ reason: "  " }), /causale/);
});

test("un premio erogato esce dal registro senza toccare il progressivo", async () => {
  const premio = await creaPremio();
  const esito = await agenda.payBonus(
    premio.id,
    { paidAt: "2027-06-01", paymentMethod: "bonifico" },
    scopeA(),
  );

  assert.equal(esito.bonus.status, "PAID");
  assert.equal(esito.transaction.transaction_type, "BONUS_PAYMENT");
  assert.equal(esito.transaction.gross_amount, 500);
  assert.equal(esito.transaction.fiscal_year, 2027);

  await service.recomputeYearPosition(PERSON_A, 2027, scopeA());
  const posizione = fake.rows("sportWorkYearPosition")[0];
  assert.equal(posizione.club_gross, 0, "un premio non e un compenso");

  assert.ok(auditActions().includes("sport_work.bonus.paid"));
});

test("lo stesso premio non si eroga due volte", async () => {
  const premio = await creaPremio();
  await agenda.payBonus(premio.id, {}, scopeA());
  await rejects(agenda.payBonus(premio.id, {}, scopeA()), /gia erogato/);
  assert.equal(fake.rows("sportWorkOutboundTransaction").length, 1);
});

test("non si crea un premio per una persona di un altro club", async () => {
  await rejects(creaPremio({ personId: PERSON_B }, scopeA()), /Accesso negato/);
});

// --- rimborsi -------------------------------------------------------------------

const creaRimborso = (overrides = {}, scope = scopeA()) =>
  agenda.createReimbursement(
    {
      personId: PERSON_A,
      relationshipId: REL_A,
      category: "TRAVEL",
      description: "Trasferta Bologna",
      expenseDate: "2026-10-12",
      amount: 137.4,
      ...overrides,
    },
    scope,
  );

test("un rimborso nasce in bozza e attraversa il suo ciclo", async () => {
  const rimborso = await creaRimborso();
  assert.equal(rimborso.status, "DRAFT");
  assert.equal(rimborso.category, "TRAVEL");
  assert.equal(rimborso.amount, 137.4);

  const presentato = await agenda.transitionReimbursement(
    rimborso.id,
    "SUBMITTED",
    {},
    scopeA(),
  );
  assert.equal(presentato.status, "SUBMITTED");

  const approvato = await agenda.transitionReimbursement(
    rimborso.id,
    "APPROVED",
    {},
    scopeA(),
  );
  assert.equal(approvato.status, "APPROVED");
  assert.ok(approvato.approved_at);
  assert.ok(auditActions().includes("sport_work.reimbursement.approved"));
});

test("un rimborso non approvato non si liquida", async () => {
  const rimborso = await creaRimborso();
  await rejects(agenda.payReimbursement(rimborso.id, {}, scopeA()), /approvato/);
});

test("non si porta un rimborso a liquidato cambiandone lo stato", async () => {
  const rimborso = await creaRimborso();
  await rejects(
    agenda.transitionReimbursement(rimborso.id, "PAID", {}, scopeA()),
    /registrandone il pagamento/,
  );
});

test("un rimborso liquidato esce dal registro e non tocca il progressivo", async () => {
  const rimborso = await creaRimborso();
  await agenda.transitionReimbursement(rimborso.id, "SUBMITTED", {}, scopeA());
  await agenda.transitionReimbursement(rimborso.id, "APPROVED", {}, scopeA());

  const esito = await agenda.payReimbursement(
    rimborso.id,
    { paidAt: "2026-10-20" },
    scopeA(),
  );

  assert.equal(esito.reimbursement.status, "PAID");
  assert.equal(esito.transaction.transaction_type, "EXPENSE_REIMBURSEMENT");
  assert.equal(esito.transaction.gross_amount, 137.4);

  await service.recomputeYearPosition(PERSON_A, 2026, scopeA());
  assert.equal(fake.rows("sportWorkYearPosition")[0].club_gross, 0);
  assert.ok(auditActions().includes("sport_work.reimbursement.paid"));
});

test("lo stesso rimborso non si liquida due volte", async () => {
  const rimborso = await creaRimborso();
  await agenda.transitionReimbursement(rimborso.id, "SUBMITTED", {}, scopeA());
  await agenda.transitionReimbursement(rimborso.id, "APPROVED", {}, scopeA());
  await agenda.payReimbursement(rimborso.id, {}, scopeA());

  await rejects(agenda.payReimbursement(rimborso.id, {}, scopeA()), /approvato/);
  assert.equal(fake.rows("sportWorkOutboundTransaction").length, 1);
});

test("non si legge il rimborso di un altro club", async () => {
  const rimborso = await creaRimborso();
  await rejects(
    agenda.getReimbursementById(rimborso.id, scopeB()),
    /Accesso negato/,
  );
});

// --- fatture P.IVA ----------------------------------------------------------------

const creaFattura = (overrides = {}, scope = scopeA()) =>
  agenda.createVatInvoice(
    {
      relationshipId: REL_PIVA,
      documentNumber: "2026/114",
      documentDate: "2026-10-05",
      taxableAmount: 1000,
      vatAmount: 220,
      withholdingAmount: 200,
      totalAmount: 1220,
      dueDate: "2026-11-05",
      ...overrides,
    },
    scope,
  );

test("una fattura si registra solo su un rapporto con partita IVA", async () => {
  await rejects(
    creaFattura({ relationshipId: REL_A }),
    /solo su un rapporto con partita IVA/,
  );
});

test("gli importi della fattura si trascrivono, non si calcolano", async () => {
  const fattura = await creaFattura();

  assert.equal(fattura.taxable_amount, 1000);
  assert.equal(fattura.vat_amount, 220);
  assert.equal(fattura.withholding_amount, 200);
  assert.equal(fattura.total_amount, 1220);
  assert.equal(fattura.status, "PENDING");
});

test("pagare una fattura non applica il calcolo co.co.co.", async () => {
  const fattura = await creaFattura();
  const esito = await agenda.payVatInvoice(
    fattura.id,
    { paidAt: "2026-11-05" },
    scopeA(),
  );

  assert.equal(esito.invoice.status, "PAID");
  assert.equal(esito.transaction.transaction_type, "VAT_INVOICE_PAYMENT");
  assert.equal(esito.transaction.gross_amount, 1220);
  assert.equal(esito.transaction.employee_contribution ?? 0, 0);
  assert.equal(esito.transaction.employer_contribution ?? 0, 0);
  assert.equal(esito.transaction.rules_version, null);
  assert.equal(esito.transaction.fiscal_treatment, "OUT_OF_SCOPE");

  await service.recomputeYearPosition(PERSON_A, 2026, scopeA());
  assert.equal(fake.rows("sportWorkYearPosition")[0].club_gross, 0);
  assert.ok(auditActions().includes("sport_work.vat_invoice.paid"));
});

test("una fattura si puo pagare a rate, ma non oltre il totale", async () => {
  const fattura = await creaFattura();
  const parziale = await agenda.payVatInvoice(fattura.id, { amount: 500 }, scopeA());
  assert.equal(parziale.invoice.status, "PARTIALLY_PAID");

  await rejects(
    agenda.payVatInvoice(fattura.id, { amount: 900 }, scopeA()),
    /supera il residuo/,
  );

  const saldo = await agenda.payVatInvoice(fattura.id, {}, scopeA());
  assert.equal(saldo.invoice.status, "PAID");
  assert.equal(saldo.transaction.gross_amount, 720);
});

// --- adempimenti ---------------------------------------------------------------------

const erogazione = (overrides = {}) => ({
  id: "pay-1",
  organization_id: CLUB_A,
  person_id: PERSON_A,
  relationship_id: REL_A,
  transaction_type: "COMPENSATION_PAYMENT",
  paid_at: new Date("2026-09-30T00:00:00Z"),
  fiscal_year: 2026,
  gross_amount: 6000,
  employee_contribution: 45.05,
  employer_contribution: 90.1,
  reversed_at: null,
  reversal_of_id: null,
  ...overrides,
});

const NOW = new Date("2026-10-05T00:00:00Z");

test("la sincronizzazione crea l'agenda, e rieseguirla non la duplica", async () => {
  fake.rows("sportWorkOutboundTransaction").push(erogazione());

  const first = await agenda.syncObligations(CLUB_A, scopeA(), NOW);
  const second = await agenda.syncObligations(CLUB_A, scopeA(), NOW);

  assert.ok(first.created > 0);
  assert.equal(second.created, 0, "la seconda esecuzione non crea niente");
  assert.equal(
    new Set(fake.rows("sportWorkObligation").map((row) => row.reference_key)).size,
    fake.rows("sportWorkObligation").length,
  );
  assert.ok(auditActions().includes("sport_work.obligations.synced"));
});

test("l'agenda contiene RASD, F24, autocertificazione e CU", async () => {
  fake.rows("sportWorkOutboundTransaction").push(erogazione());
  await agenda.syncObligations(CLUB_A, scopeA(), NOW);

  const kinds = new Set(fake.rows("sportWorkObligation").map((row) => row.kind));
  for (const kind of [
    "RASD_COMMUNICATION",
    "F24",
    "SELF_DECLARATION",
    "CU_PREPARATION",
  ]) {
    assert.ok(kinds.has(kind), `manca l'adempimento ${kind}`);
  }

  const f24 = fake
    .rows("sportWorkObligation")
    .find((row) => row.kind === "F24");
  assert.equal(f24.reference_key, "f24:2026-09");
  assert.equal(f24.amount, 135.15);
  assert.equal(f24.due_date.toISOString().slice(0, 10), "2026-10-16");
});

test("un adempimento assolto non torna dovuto", async () => {
  fake.rows("sportWorkOutboundTransaction").push(erogazione());
  await agenda.syncObligations(CLUB_A, scopeA(), NOW);

  const f24 = fake.rows("sportWorkObligation").find((row) => row.kind === "F24");
  await agenda.completeObligation(f24.id, { notes: "Versato" }, scopeA());

  await agenda.syncObligations(CLUB_A, scopeA(), NOW);

  const dopo = fake.rows("sportWorkObligation").find((row) => row.id === f24.id);
  assert.equal(dopo.status, "COMPLETED");
  assert.ok(dopo.completed_at);
  assert.ok(auditActions().includes("sport_work.obligation.completed"));
});

test("un adempimento che non ha piu ragione di esistere passa a non dovuto, non sparisce", async () => {
  await agenda.syncObligations(CLUB_A, scopeA(), NOW);
  const prima = fake
    .rows("sportWorkObligation")
    .filter((row) => row.kind === "SELF_DECLARATION");
  assert.equal(prima.length, 1);

  await service.createDeclaration(
    { personId: PERSON_A, fiscalYear: 2026, externalAmount: 2000 },
    scopeA(),
  );
  const esito = await agenda.syncObligations(CLUB_A, scopeA(), NOW);

  assert.equal(esito.closed, 1);
  const dopo = fake
    .rows("sportWorkObligation")
    .find((row) => row.kind === "SELF_DECLARATION");
  assert.ok(dopo, "la riga resta: e stata dovuta, e la sua storia serve");
  assert.equal(dopo.status, "NOT_DUE");
});

test("non si sincronizza l'agenda di un altro club", async () => {
  await rejects(agenda.syncObligations(CLUB_B, scopeA(), NOW), /Accesso negato/);
});

test("non si assolve un adempimento di un altro club", async () => {
  await agenda.syncObligations(CLUB_A, scopeA(), NOW);
  const [row] = fake.rows("sportWorkObligation");
  await rejects(
    agenda.completeObligation(row.id, {}, scopeB()),
    /Accesso negato/,
  );
});

test("un adempimento manuale ha una chiave propria e non si scontra", async () => {
  const manuale = await agenda.createManualObligation(
    {
      kind: "DOCUMENT_EXPIRY",
      title: "Rinnovo polizza infortuni",
      dueDate: "2026-12-31",
    },
    scopeA(),
  );

  assert.equal(manuale.source, "manual");
  assert.match(manuale.reference_key, /^manual:DOCUMENT_EXPIRY:2026-12-31:/);

  await agenda.syncObligations(CLUB_A, scopeA(), NOW);
  const dopo = fake.rows("sportWorkObligation").find((row) => row.id === manuale.id);
  assert.equal(dopo.status, "DUE", "la sincronizzazione non tocca i manuali");
});

// --- cruscotto e dataset ---------------------------------------------------------------

test("il cruscotto tiene separati programmato, maturato e pagato", async () => {
  fake.rows("sportWorkInstallment").push(
    {
      id: "r1",
      organization_id: CLUB_A,
      relationship_id: REL_A,
      gross_amount: 1200,
      accrued_amount: 1200,
      paid_amount: 1200,
      remaining_amount: 0,
      status: "PAID",
      due_date: new Date("2026-10-31T00:00:00Z"),
      accrual_period_end: new Date("2026-10-31T00:00:00Z"),
      fiscal_year: 2026,
    },
    {
      id: "r2",
      organization_id: CLUB_A,
      relationship_id: REL_A,
      gross_amount: 1200,
      accrued_amount: 1200,
      paid_amount: 0,
      remaining_amount: 1200,
      status: "OVERDUE",
      due_date: new Date("2026-09-30T00:00:00Z"),
      accrual_period_end: new Date("2026-09-30T00:00:00Z"),
      fiscal_year: 2026,
    },
  );
  fake.rows("sportWorkOutboundTransaction").push(
    erogazione({
      id: "p1",
      gross_amount: 1200,
      paid_at: new Date("2026-10-31T00:00:00Z"),
      club_cost: 1290.1,
    }),
  );

  const cruscotto = await agenda.getSportWorkDashboard(
    CLUB_A,
    scopeA(),
    new Date("2026-10-15T00:00:00Z"),
  );

  assert.equal(cruscotto.scheduledThisMonth, 1200);
  assert.equal(cruscotto.accruedThisMonth, 1200);
  assert.equal(cruscotto.paidThisMonth, 1200);
  assert.equal(cruscotto.clubCostThisMonth, 1290.1);
  assert.equal(cruscotto.toPayTotal, 1200);
  assert.equal(cruscotto.overdueTotal, 1200);
  assert.equal(cruscotto.overdueCount, 1);
  assert.equal(cruscotto.activeRelationships, 2);
});

test("non si legge il cruscotto di un altro club", async () => {
  await rejects(
    agenda.getSportWorkDashboard(CLUB_B, scopeA(), NOW),
    /Accesso negato/,
  );
});

test("il dataset F24 raggruppa per periodo e causale", async () => {
  fake.rows("sportWorkOutboundTransaction").push(
    erogazione({ id: "a", f24_causale: "CXX", rules_version: "2026" }),
  );

  const righe = await agenda.getF24Dataset(CLUB_A, 2026, scopeA());
  assert.equal(righe.length, 1);
  assert.equal(righe[0].causale, "CXX");
  assert.equal(righe[0].total, 135.15);
});

test("il dataset CU segnala quando manca l'autocertificazione", async () => {
  fake.rows("sportWorkOutboundTransaction").push(erogazione({ taxable_fiscal: 0 }));

  const righe = await agenda.getCuDataset(CLUB_A, 2026, scopeA());
  assert.equal(righe.length, 1);
  assert.equal(righe[0].grossPaid, 6000);
  assert.equal(righe[0].needsAttention, true);
  assert.match(righe[0].attentionReason, /Nessuna autocertificazione/);
});

test("non si legge il dataset fiscale di un altro club", async () => {
  await rejects(agenda.getF24Dataset(CLUB_B, 2026, scopeA()), /Accesso negato/);
  await rejects(agenda.getCuDataset(CLUB_B, 2026, scopeA()), /Accesso negato/);
});
