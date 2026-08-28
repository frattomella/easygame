import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Il registro in uscita, a runtime.
 *
 * Cinque cose vanno dimostrate, e sono le cinque che, mancando, fanno uscire
 * denaro due volte o lo fanno sparire.
 *
 * 1. **Un gesto, un movimento.** Due invii dello stesso clic non producono due
 *    uscite. E il difetto gia visto sugli incassi, dall'altra parte del
 *    registro.
 * 2. **Niente si cancella.** Stornare aggiunge una riga di segno opposto e
 *    marca l'originale; stornare due volte non si puo.
 * 3. **Il calcolo si congela.** Regole, soglie e progressivi finiscono sulla
 *    riga, e restano leggibili anche quando le regole cambiano.
 * 4. **Erogare al buio lascia una traccia con un nome.** Non e vietato, ma
 *    chi lo fa se ne assume la responsabilita per iscritto.
 * 5. **Il confine di club regge anche sul denaro.**
 */

const CLUB_A = "aaaaaaaa-0000-4000-8000-000000000001";
const CLUB_B = "bbbbbbbb-0000-4000-8000-000000000002";
const PERSON_A = "11111111-0000-4000-8000-00000000000a";
const PERSON_B = "22222222-0000-4000-8000-00000000000b";
const REL_A = "33333333-0000-4000-8000-00000000000c";
const REL_B = "44444444-0000-4000-8000-00000000000d";
const PLAN_A = "55555555-0000-4000-8000-00000000000e";
const RATA_1 = "66666666-0000-4000-8000-00000000000f";
const RATA_2 = "77777777-0000-4000-8000-000000000010";
const RATA_B = "88888888-0000-4000-8000-000000000011";

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
  actorEmail: "b@example.test",
  allowedOrganizationIds: [CLUB_B],
});

let ledger;
let service;
let setPrismaClientForTests;
let fake;

const persona = (id, organizationId, overrides = {}) => ({
  id,
  organization_id: organizationId,
  origin_type: "trainer",
  origin_id: "t1",
  first_name: "Marco",
  last_name: "Rossi",
  fiscal_code: "RSSMRC90A01H501A",
  fiscal_profile: "NONE",
  vat_number: null,
  social_coverage: "NONE",
  iban: null,
  created_at: new Date("2026-08-01T00:00:00Z"),
  updated_at: new Date("2026-08-01T00:00:00Z"),
  ...overrides,
});

const rapporto = (id, organizationId, personId, overrides = {}) => ({
  id,
  organization_id: organizationId,
  person_id: personId,
  season_id: "2026-27",
  role: "COACH",
  relationship_type: "SPORT_COCOCO",
  start_date: new Date("2026-09-01T00:00:00Z"),
  end_date: new Date("2027-06-30T00:00:00Z"),
  status: "ACTIVE",
  contract_amount: 12000,
  currency: "EUR",
  compensation_frequency: "SEASONAL",
  contract_attachment_id: "cccccccc-0000-4000-8000-000000000012",
  signature_state: "SIGNED",
  rasd_status: "TO_PREPARE",
  created_at: new Date("2026-08-01T00:00:00Z"),
  updated_at: new Date("2026-08-01T00:00:00Z"),
  ...overrides,
});

const rata = (id, organizationId, relationshipId, planId, sequence, overrides = {}) => ({
  id,
  organization_id: organizationId,
  plan_id: planId,
  relationship_id: relationshipId,
  sequence,
  label: `Rata ${sequence}`,
  accrual_period_start: new Date("2026-09-01T00:00:00Z"),
  accrual_period_end: new Date("2026-09-30T00:00:00Z"),
  due_date: new Date("2026-09-30T00:00:00Z"),
  gross_amount: 1200,
  accrued_amount: 1200,
  paid_amount: 0,
  remaining_amount: 1200,
  status: "ACCRUED",
  fiscal_year: 2026,
  cancelled: false,
  created_at: new Date("2026-08-01T00:00:00Z"),
  updated_at: new Date("2026-08-01T00:00:00Z"),
  ...overrides,
});

const dichiarazione = (personId, organizationId, overrides = {}) => ({
  id: `decl-${personId}`,
  organization_id: organizationId,
  person_id: personId,
  fiscal_year: 2026,
  external_amount: 0,
  declaration_date: new Date("2026-01-15T00:00:00Z"),
  effective_from: null,
  attachment_id: null,
  status: "ACTIVE",
  has_other_coverage: false,
  supersedes_id: null,
  created_at: new Date("2026-01-15T00:00:00Z"),
  updated_at: new Date("2026-01-15T00:00:00Z"),
  ...overrides,
});

const seed = (overrides = {}) => ({
  sportWorkPerson: [persona(PERSON_A, CLUB_A), persona(PERSON_B, CLUB_B)],
  sportWorkRelationship: [
    rapporto(REL_A, CLUB_A, PERSON_A),
    rapporto(REL_B, CLUB_B, PERSON_B),
  ],
  sportWorkCompensationPlan: [
    {
      id: PLAN_A,
      organization_id: CLUB_A,
      relationship_id: REL_A,
      kind: "EQUAL_INSTALMENTS",
      total_amount: 12000,
      currency: "EUR",
    },
  ],
  sportWorkInstallment: [
    rata(RATA_1, CLUB_A, REL_A, PLAN_A, 1),
    rata(RATA_2, CLUB_A, REL_A, PLAN_A, 2, {
      due_date: new Date("2026-10-31T00:00:00Z"),
      accrual_period_end: new Date("2026-10-31T00:00:00Z"),
    }),
    rata(RATA_B, CLUB_B, REL_B, "plan-b", 1),
  ],
  sportWorkOutboundTransaction: [],
  sportWorkExternalDeclaration: [dichiarazione(PERSON_A, CLUB_A)],
  sportWorkYearPosition: [],
  auditLog: [],
  ...overrides,
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  ledger = await import("../../src/lib/server/sport-work-ledger.ts");
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

const eroga = (overrides = {}, scope = scopeA()) =>
  ledger.recordCompensationPayout(
    {
      installmentId: RATA_1,
      paidAt: "2026-09-30",
      paymentMethod: "bonifico",
      acknowledgeWarnings: true,
      ...overrides,
    },
    scope,
  );

// --- multi-tenant ---------------------------------------------------------------

test("non si eroga su una scadenza di un altro club", async () => {
  await rejects(eroga({ installmentId: RATA_B }, scopeA()), /Accesso negato/);
  assert.equal(fake.rows("sportWorkOutboundTransaction").length, 0);
});

test("non si legge un movimento di un altro club", async () => {
  await eroga();
  const [movimento] = fake.rows("sportWorkOutboundTransaction");
  await rejects(
    ledger.getOutboundTransactionById(movimento.id, scopeB()),
    /Accesso negato/,
  );
});

test("non si storna un movimento di un altro club", async () => {
  await eroga();
  const [movimento] = fake.rows("sportWorkOutboundTransaction");
  await rejects(
    ledger.reverseCompensationPayout(movimento.id, { reason: "prova" }, scopeB()),
    /Accesso negato/,
  );
  assert.equal(fake.rows("sportWorkOutboundTransaction").length, 1);
});

test("non si elencano i movimenti di un altro club", async () => {
  await rejects(
    ledger.listOutboundTransactions({ organizationId: CLUB_B }, scopeA()),
    /Accesso negato/,
  );
});

// --- la proposta -----------------------------------------------------------------

test("la proposta spiega il calcolo e non scrive niente", async () => {
  const proposta = await ledger.prepareCompensationPayout(
    { installmentId: RATA_1, paidAt: "2026-09-30" },
    scopeA(),
  );

  assert.equal(proposta.suggestedAmount, 1200);
  assert.equal(proposta.computation.grossAmount, 1200);
  assert.equal(proposta.computation.employeeContribution, 0);
  assert.equal(proposta.netLabel, "Netto da corrispondere");
  assert.ok(proposta.computation.explanation.length > 8);
  assert.equal(fake.rows("sportWorkOutboundTransaction").length, 0);
});

test("la proposta di una persona che ha gia superato la soglia lo dice", async () => {
  fake.rows("sportWorkOutboundTransaction").push({
    id: "prev",
    organization_id: CLUB_A,
    transaction_type: "COMPENSATION_PAYMENT",
    person_id: PERSON_A,
    fiscal_year: 2026,
    gross_amount: 5000,
    paid_at: new Date("2026-08-31T00:00:00Z"),
    reversed_at: null,
  });

  const proposta = await ledger.prepareCompensationPayout(
    { installmentId: RATA_1, paidAt: "2026-09-30" },
    scopeA(),
  );

  assert.equal(proposta.computation.priorClubGross, 5000);
  assert.equal(proposta.computation.taxableSocialGross, 1200);
  assert.equal(proposta.computation.socialBase, 600);
  assert.equal(proposta.computation.totalContribution, 162.18);
  assert.equal(proposta.computation.employeeContribution, 54.06);
  assert.equal(proposta.computation.employerContribution, 108.12);
});

// --- registrazione -----------------------------------------------------------------

test("un'erogazione aggiorna la scadenza e la posizione annua", async () => {
  const esito = await eroga();

  assert.equal(esito.transaction.gross_amount, 1200);
  assert.equal(esito.transaction.fiscal_year, 2026);
  assert.equal(esito.installment.paid_amount, 1200);
  assert.equal(esito.installment.remaining_amount, 0);
  assert.equal(esito.installment.status, "PAID");

  const posizione = fake.rows("sportWorkYearPosition")[0];
  assert.equal(posizione.club_gross, 1200);
  assert.equal(posizione.year, 2026);
  assert.equal(posizione.payment_count, 1);

  assert.ok(auditActions().includes("sport_work.compensation.paid"));
});

test("un'erogazione parziale lascia la scadenza a meta", async () => {
  const esito = await eroga({ amount: 500 });

  assert.equal(esito.installment.paid_amount, 500);
  assert.equal(esito.installment.remaining_amount, 700);
  assert.equal(esito.installment.status, "PARTIALLY_PAID");
});

test("non si eroga piu del residuo, salvo che qualcuno lo decida", async () => {
  await rejects(eroga({ amount: 1500 }), /supera il residuo/);
  assert.equal(fake.rows("sportWorkOutboundTransaction").length, 0);

  const esito = await eroga({ amount: 1500, allowOverpayment: true });
  assert.equal(esito.transaction.gross_amount, 1500);
  assert.equal(esito.installment.remaining_amount, 0);
});

test("il calcolo si congela sulla riga, fonti comprese", async () => {
  const esito = await eroga();
  const riga = esito.transaction;

  assert.equal(riga.rules_version, "2026");
  assert.equal(riga.social_rate, 0.2703);
  assert.equal(riga.reduction_factor, 0.5);
  assert.equal(riga.f24_causale, "CXX");
  assert.equal(riga.fiscal_treatment, "NOT_APPLICABLE");
  assert.equal(riga.definitive, true);
  assert.equal(riga.withholding_amount, null);

  assert.equal(riga.fiscal_snapshot.thresholds.social, 5000);
  assert.equal(riga.fiscal_snapshot.thresholds.fiscal, 15000);
  assert.equal(riga.fiscal_snapshot.clubYtdAmount, 0);
  assert.ok(riga.fiscal_snapshot.sources.socialFranchise.includes("art. 35"));
});

test("un'erogazione datata 2028 non passa: quell'anno non ha regole", async () => {
  await rejects(
    eroga({ paidAt: "2028-01-31" }),
    /non configurate per l'anno 2028/,
  );
  assert.equal(fake.rows("sportWorkOutboundTransaction").length, 0);
});

test("un rapporto in bozza non riceve erogazioni", async () => {
  fake.rows("sportWorkRelationship").find((row) => row.id === REL_A).status = "DRAFT";
  await rejects(eroga(), /bozza non puo ricevere erogazioni/);
});

test("un rapporto cessato non riceve erogazioni", async () => {
  fake.rows("sportWorkRelationship").find((row) => row.id === REL_A).status =
    "TERMINATED";
  await rejects(eroga(), /TERMINATED non puo ricevere erogazioni/);
});

test("un rapporto scaduto riceve ancora: le rate maturate restano dovute", async () => {
  fake.rows("sportWorkRelationship").find((row) => row.id === REL_A).status = "EXPIRED";
  const esito = await eroga();
  assert.equal(esito.transaction.gross_amount, 1200);
});

test("una scadenza annullata non si eroga", async () => {
  fake.rows("sportWorkInstallment").find((row) => row.id === RATA_1).cancelled = true;
  await rejects(eroga(), /annullata non si eroga/);
});

// --- autocertificazione ------------------------------------------------------------------

test("senza autocertificazione l'erogazione si ferma, e dice perche", async () => {
  fake.rows("sportWorkExternalDeclaration").length = 0;

  await rejects(
    eroga({ acknowledgeWarnings: false }),
    /Autocertificazione compensi esterni non aggiornata per il 2026/,
  );
  assert.equal(fake.rows("sportWorkOutboundTransaction").length, 0);
});

test("chi procede comunque lascia una traccia con il suo nome", async () => {
  fake.rows("sportWorkExternalDeclaration").length = 0;

  const esito = await eroga({ acknowledgeWarnings: true });

  assert.equal(esito.transaction.gross_amount, 1200);
  assert.ok(
    auditActions().includes(
      "sport_work.payment.without_current_self_declaration",
    ),
    "l'evento di responsabilita deve essere registrato",
  );

  const traccia = fake
    .rows("auditLog")
    .find(
      (row) => row.action === "sport_work.payment.without_current_self_declaration",
    );
  assert.equal(traccia.metadata.fiscalYear, 2026);
  assert.equal(traccia.metadata.personName, "Marco Rossi");
});

test("con l'autocertificazione la traccia di responsabilita non compare", async () => {
  await eroga();
  assert.ok(
    !auditActions().includes(
      "sport_work.payment.without_current_self_declaration",
    ),
  );
});

test("superare la soglia fiscale richiede una conferma esplicita", async () => {
  fake.rows("sportWorkOutboundTransaction").push({
    id: "prev",
    organization_id: CLUB_A,
    transaction_type: "COMPENSATION_PAYMENT",
    person_id: PERSON_A,
    fiscal_year: 2026,
    gross_amount: 15000,
    paid_at: new Date("2026-08-31T00:00:00Z"),
    reversed_at: null,
  });

  await rejects(
    eroga({ acknowledgeWarnings: false }),
    /Soglia fiscale di 15.000 euro superata/,
  );

  const esito = await eroga({ acknowledgeWarnings: true });
  assert.equal(esito.transaction.fiscal_treatment, "TO_VERIFY");
  assert.equal(esito.transaction.definitive, false);
  assert.equal(esito.transaction.taxable_fiscal, 1200);
  assert.equal(esito.transaction.withholding_amount, null);
});

// --- doppio clic e concorrenza -------------------------------------------------------------

test("due invii dello stesso clic producono una sola uscita", async () => {
  const primo = await eroga({ idempotencyKey: "clic-1" });
  const secondo = await eroga({ idempotencyKey: "clic-1" });

  assert.equal(secondo.duplicate, true);
  assert.equal(secondo.transaction.id, primo.transaction.id);
  assert.equal(fake.rows("sportWorkOutboundTransaction").length, 1);
  assert.equal(
    fake.rows("sportWorkInstallment").find((row) => row.id === RATA_1).paid_amount,
    1200,
  );
});

test("due gesti diversi sulla stessa scadenza restano due gesti", async () => {
  await eroga({ amount: 500, idempotencyKey: "clic-1" });
  await eroga({ amount: 400, idempotencyKey: "clic-2" });

  assert.equal(fake.rows("sportWorkOutboundTransaction").length, 2);
  assert.equal(
    fake.rows("sportWorkInstallment").find((row) => row.id === RATA_1).paid_amount,
    900,
  );
});

/**
 * La corsa vera non si riproduce con un doppio di Prisma, che concorrenza non
 * ne ha. Si riproduce cio che la corsa **fa**: fra il momento in cui il
 * chiamante decide di erogare e quello in cui scrive, il registro cambia
 * sotto di lui.
 *
 * Con il controllo di capienza fuori dalla transazione, la seconda erogazione
 * passava; con il controllo dentro, dopo il blocco della riga, no.
 */
const conErogazioneConcorrente = (amount) => {
  const originale = fake.client.$transaction.bind(fake.client);
  let gia = false;
  fake.client.$transaction = async (input) => {
    if (!gia && typeof input === "function") {
      gia = true;
      const rata = fake
        .rows("sportWorkInstallment")
        .find((row) => row.id === RATA_1);
      rata.paid_amount = amount;
      rata.remaining_amount = 1200 - amount;
      fake.rows("sportWorkOutboundTransaction").push({
        id: "concorrente",
        organization_id: CLUB_A,
        transaction_type: "COMPENSATION_PAYMENT",
        person_id: PERSON_A,
        relationship_id: REL_A,
        installment_id: RATA_1,
        paid_at: new Date("2026-09-30T09:59:59.000Z"),
        fiscal_year: 2026,
        gross_amount: amount,
        reversed_at: null,
        reversal_of_id: null,
      });
    }
    return originale(input);
  };
};

test("un'erogazione scritta nel frattempo toglie capienza a quella in corso", async () => {
  conErogazioneConcorrente(800);

  await rejects(eroga({ amount: 800 }), /supera il residuo della scadenza/);

  const uscite = fake
    .rows("sportWorkOutboundTransaction")
    .filter((row) => row.installment_id === RATA_1);

  assert.equal(uscite.length, 1, "resta solo l'erogazione concorrente");
  assert.equal(
    uscite.reduce((total, row) => total + row.gross_amount, 0),
    800,
    "su una scadenza da 1200 non escono 1600",
  );
});

test("finche c'e capienza l'erogazione passa", async () => {
  conErogazioneConcorrente(400);

  const esito = await eroga({ amount: 800 });

  assert.equal(esito.transaction.gross_amount, 800);
  assert.equal(esito.installment.paid_amount, 1200);
  assert.equal(esito.installment.status, "PAID");
});

/**
 * Il blocco di riga e cio che rende serio il controllo. E **prima sulla
 * persona**, poi sulla scadenza: la franchigia annua e per persona, e due
 * erogazioni su due rate diverse della stessa persona devono comunque
 * mettersi in fila, o consumano entrambe la stessa franchigia residua.
 */
test("prima si blocca la persona, poi la scadenza", async () => {
  const eseguiti = [];
  fake.client.$queryRaw = async (strings, ...values) => {
    eseguiti.push({ sql: strings.join("?"), values });
    return [];
  };

  await eroga();

  assert.equal(eseguiti.length, 2, "due blocchi di riga, due soli");
  assert.match(eseguiti[0].sql, /FROM sport_work_people WHERE id = /);
  assert.match(eseguiti[0].sql, /FOR UPDATE/);
  assert.deepEqual(eseguiti[0].values, [PERSON_A]);

  assert.match(
    eseguiti[1].sql,
    /FROM sport_work_compensation_installments WHERE id = /,
  );
  assert.match(eseguiti[1].sql, /FOR UPDATE/);
  assert.deepEqual(eseguiti[1].values, [RATA_1]);
});

test("un importo non valido non apre nemmeno una transazione", async () => {
  await rejects(eroga({ amount: 0 }), /maggiore di zero/);
  assert.equal(fake.rows("sportWorkOutboundTransaction").length, 0);
});

test("la franchigia non si consuma due volte su due erogazioni della stessa persona", async () => {
  await eroga({ amount: 1200, idempotencyKey: "a" });
  await eroga({ installmentId: RATA_2, amount: 1200, idempotencyKey: "b" });

  const posizione = fake.rows("sportWorkYearPosition")[0];
  assert.equal(posizione.club_gross, 2400);
  assert.equal(posizione.social_franchise_used, 2400);
});

// --- storno -------------------------------------------------------------------------------

test("stornare aggiunge una riga di segno opposto e marca l'originale", async () => {
  const { transaction } = await eroga();
  const esito = await ledger.reverseCompensationPayout(
    transaction.id,
    { reason: "Erogazione registrata per errore" },
    scopeA(),
  );

  assert.equal(esito.reversal.gross_amount, -1200);
  assert.equal(esito.reversal.transaction_type, "COMPENSATION_REVERSAL");
  assert.equal(esito.reversal.reversal_of_id, transaction.id);

  const originale = fake
    .rows("sportWorkOutboundTransaction")
    .find((row) => row.id === transaction.id);
  assert.ok(originale, "l'originale resta nel registro");
  assert.ok(originale.reversed_at);
  assert.equal(originale.reversal_reason, "Erogazione registrata per errore");

  assert.equal(esito.installmentAfter.paid_amount, 0);
  assert.equal(
    esito.installmentAfter.status,
    "ACCRUED",
    "la scadenza torna dovuta: maturata e non erogata",
  );

  const posizione = fake.rows("sportWorkYearPosition")[0];
  assert.equal(posizione.club_gross, 0);

  assert.ok(auditActions().includes("sport_work.compensation.reversed"));
});

test("uno storno senza motivo non passa", async () => {
  const { transaction } = await eroga();
  await rejects(
    ledger.reverseCompensationPayout(transaction.id, { reason: "  " }, scopeA()),
    /richiede un motivo/,
  );
});

test("la stessa erogazione non si storna due volte", async () => {
  const { transaction } = await eroga();
  await ledger.reverseCompensationPayout(transaction.id, { reason: "x" }, scopeA());

  await rejects(
    ledger.reverseCompensationPayout(transaction.id, { reason: "y" }, scopeA()),
    /gia stata stornata/,
  );
  assert.equal(fake.rows("sportWorkOutboundTransaction").length, 2);
});

test("uno storno non si storna", async () => {
  const { transaction } = await eroga();
  const esito = await ledger.reverseCompensationPayout(
    transaction.id,
    { reason: "x" },
    scopeA(),
  );

  await rejects(
    ledger.reverseCompensationPayout(esito.reversal.id, { reason: "y" }, scopeA()),
    /non si storna/,
  );
});

test("dopo lo storno si puo ripagare, e la franchigia torna quella giusta", async () => {
  const { transaction } = await eroga({ amount: 1200 });
  await ledger.reverseCompensationPayout(transaction.id, { reason: "errore" }, scopeA());
  const nuovo = await eroga({ amount: 1200, idempotencyKey: "secondo" });

  assert.equal(nuovo.computation.priorClubGross, 0);
  const posizione = fake.rows("sportWorkYearPosition")[0];
  assert.equal(posizione.club_gross, 1200);
});

// --- uscite che non sono compensi ------------------------------------------------------------

test("un compenso non si registra dalla porta di servizio", async () => {
  await rejects(
    ledger.recordSupportingOutbound(
      {
        transactionType: "COMPENSATION_PAYMENT",
        personId: PERSON_A,
        amount: 500,
      },
      scopeA(),
    ),
    /passa da recordCompensationPayout/,
  );
});

test("un rimborso esce dal registro senza toccare il progressivo", async () => {
  await eroga();
  await ledger.recordSupportingOutbound(
    {
      transactionType: "EXPENSE_REIMBURSEMENT",
      personId: PERSON_A,
      amount: 137.4,
      paidAt: "2026-10-05",
    },
    scopeA(),
  );

  await service.recomputeYearPosition(PERSON_A, 2026, scopeA());
  const posizione = fake.rows("sportWorkYearPosition")[0];

  assert.equal(posizione.club_gross, 1200, "il rimborso non e un compenso");
  assert.equal(fake.rows("sportWorkOutboundTransaction").length, 2);
});

test("un'uscita di servizio per una persona di un altro club non passa", async () => {
  await rejects(
    ledger.recordSupportingOutbound(
      {
        transactionType: "BONUS_PAYMENT",
        personId: PERSON_B,
        amount: 500,
      },
      scopeA(),
    ),
    /Accesso negato/,
  );
});
