import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Il motore fiscale arriva finalmente ai dati.** (W4-E, §5.2 del piano)
 *
 * La ricognizione della Wave 4 ha trovato un motore completo che non toccava
 * nessuna riga reale. La catena era questa, e ogni anello era vero:
 *
 * 1. `operation_type_code` esiste su `payment_transactions` e
 *    `createPaymentTransaction` lo scrive;
 * 2. ma lo **schema di validazione degli incassi non accettava il campo**, e
 *    Zod scarta cio che non dichiara: la rotta lo perdeva fra la richiesta e il
 *    dominio;
 * 3. quindi la colonna era `null` su ogni incasso, e all'emissione la catena
 *    ricadeva su `DEFAULT_OPERATION_TYPE_BY_ORIGIN`;
 * 4. quindi **ogni** documento risultava «quota attivita», e `activity_scope`
 *    non toccava una sola riga.
 *
 * Qui si prova che la catena e chiusa, e che il ripiego non e piu invisibile.
 *
 * Si presidiano nella stessa sede le due regole dei documenti che esistevano
 * scritte e **non avevano chiamanti**: il numero non lo digita il client, e un
 * documento emesso non si modifica.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const ALTRO_CLUB = "bbbbbbbb-0000-4000-8000-000000000002";
const RATA = "cccccccc-0000-4000-8000-000000000003";
const ATLETA = "dddddddd-0000-4000-8000-000000000004";
const UTENTE = "eeeeeeee-0000-4000-8000-000000000005";

let documents;
let transactions;
let resources;
let schemas;
let validation;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  documents = await import("../../src/lib/server/fiscal-documents.ts");
  transactions = await import("../../src/lib/server/payment-transactions.ts");
  resources = await import("../../src/lib/server/resources.ts");
  schemas = await import("../../src/lib/validation/schemas.ts");
  validation = await import("../../src/lib/validation/index.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const scope = (organizationId = CLUB) => ({
  userId: UTENTE,
  activeOrganizationId: organizationId,
  allowedOrganizationIds: [organizationId],
});

const TUTORE = {
  guardians: [
    {
      name: "Anna",
      surname: "Rossi",
      fiscalCode: "RSSNNA80A41H501K",
      address: "Via Milano 4",
      city: "Roma",
      postalCode: "00185",
      province: "RM",
    },
  ],
};

const seed = () => ({
  club: [
    {
      id: CLUB,
      name: "ASD Alfa",
      business_name: "ASD Alfa",
      vat_number: "12345678903",
      legal_address: "Via Roma 1",
      legal_city: "Roma",
      legal_postal_code: "00100",
      legal_province: "RM",
      legal_country: "Italia",
    },
    { id: ALTRO_CLUB, name: "ASD Beta" },
  ],
  athlete: [
    {
      id: ATLETA,
      organization_id: CLUB,
      first_name: "Mario",
      last_name: "Rossi",
      data: TUTORE,
    },
  ],
  athletePayment: [
    {
      id: RATA,
      organization_id: CLUB,
      athlete_id: ATLETA,
      amount: 122,
      status: "pending",
      description: "Rata unica",
      data: {},
    },
  ],
  fiscalOperationType: [
    {
      id: "causale-abbigliamento",
      organization_id: CLUB,
      code: "vendita_abbigliamento",
      label: "Vendita di abbigliamento",
      document_route: "invoice_or_receipt",
      activity_scope: "commercial",
      vat_rate: 22,
      is_active: true,
    },
    {
      id: "causale-quota",
      organization_id: CLUB,
      code: "quota_attivita",
      label: "Rata / quota periodica dell'attivita sportiva",
      document_route: "receipt",
      activity_scope: "unspecified",
      vat_rate: null,
      is_active: true,
    },
  ],
  paymentTransaction: [],
  receipt: [],
  invoice: [],
  auditLog: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

/** Il corpo cosi come arriva dalla rotta, e cosi come la rotta lo gira al dominio. */
const registraIncasso = async (body) => {
  const input = validation.parseInput(schemas.paymentTransactionInputSchema, body);
  return transactions.createPaymentTransaction(input, scope());
};

const CORPO = {
  payment_id: RATA,
  amount: 122,
  payment_method: "Contanti",
  paid_at: "2026-08-29T10:00:00.000Z",
};

/* ========================================================================== */
/* 1 — la causale arriva fino alla riga                                        */
/* ========================================================================== */

test("un incasso con la causale la conserva: prima lo scartava la validazione", async () => {
  const risultato = await registraIncasso({
    ...CORPO,
    operation_type_code: "vendita_abbigliamento",
  });

  const riga = fake
    .rows("paymentTransaction")
    .find((row) => row.id === risultato.transaction.id);

  assert.equal(
    riga.operation_type_code,
    "vendita_abbigliamento",
    "la riga dello schema che mancava e cio che rendeva nullo ogni operation_type_code",
  );
});

test("lo schema accetta anche la forma camelCase, come per gli altri campi", () => {
  const input = validation.parseInput(schemas.paymentTransactionInputSchema, {
    ...CORPO,
    operationTypeCode: "vendita_abbigliamento",
  });

  assert.equal(input.operationTypeCode, "vendita_abbigliamento");
});

test("un incasso senza causale resta senza: non se ne inventa una", async () => {
  const risultato = await registraIncasso(CORPO);

  const riga = fake
    .rows("paymentTransaction")
    .find((row) => row.id === risultato.transaction.id);

  assert.equal(riga.operation_type_code, null);
});

test("il conto e la controparte passano dalla stessa porta, e non si perdono", async () => {
  const risultato = await registraIncasso({
    ...CORPO,
    counterparty_kind: "SPONSOR",
    counterparty_id: "sponsor-1",
    counterparty_label: "Rossi Impianti SRL",
  });

  const riga = fake
    .rows("paymentTransaction")
    .find((row) => row.id === risultato.transaction.id);

  assert.equal(riga.counterparty_kind, "SPONSOR");
  assert.equal(riga.counterparty_label, "Rossi Impianti SRL");
});

/* ========================================================================== */
/* 2 — niente fallback invisibile                                              */
/* ========================================================================== */

test("dove manca la classificazione il documento e NON CLASSIFICATO, non «quota attivita»", async () => {
  await registraIncasso(CORPO);
  const incasso = fake.rows("paymentTransaction")[0];

  const ricevuta = await documents.issueReceiptForTransaction(
    { transactionId: incasso.id },
    scope(),
  );

  assert.equal(
    ricevuta.operation_type_code,
    null,
    "scrivere la causale proposta la renderebbe indistinguibile da una scelta",
  );
  assert.equal(ricevuta.snapshot.classification.declared, false);
  assert.equal(ricevuta.snapshot.classification.activityScope, "unspecified");
  assert.equal(ricevuta.snapshot.classification.label, "NON CLASSIFICATO");
  assert.equal(ricevuta.snapshot.classification.source, "proposed");
});

test("la proposta si legge prima di emettere, e dice di essere una proposta", async () => {
  await registraIncasso(CORPO);
  const incasso = fake.rows("paymentTransaction")[0];

  const proposta = await documents.describeDocumentDecision(
    { transactionId: incasso.id },
    scope(),
  );

  assert.equal(proposta.operationTypeSource, "proposed");
  assert.equal(proposta.decision.needsConfiguration, true);
  assert.match(proposta.decision.reason, /NON CLASSIFICATO/);
  assert.equal(
    proposta.nextNumbers.receipt.number,
    "R-2026-0001",
    "guardare il prossimo numero non deve consumarlo",
  );
  assert.equal(
    fake.rows("documentNumberSequence").length,
    0,
    "peekDocumentNumber legge, non alloca",
  );
});

test("una causale dichiarata sull'incasso arriva sul documento", async () => {
  await registraIncasso({
    ...CORPO,
    operation_type_code: "vendita_abbigliamento",
  });
  const incasso = fake.rows("paymentTransaction")[0];

  const ricevuta = await documents.issueReceiptForTransaction(
    { transactionId: incasso.id },
    scope(),
  );

  assert.equal(ricevuta.operation_type_code, "vendita_abbigliamento");
  assert.equal(ricevuta.snapshot.classification.declared, true);
  assert.equal(ricevuta.snapshot.classification.activityScope, "commercial");
});

/* ========================================================================== */
/* 3 — la classificazione si congela                                           */
/* ========================================================================== */

test("riclassificare la causale dopo non cambia i documenti gia emessi", async () => {
  await registraIncasso({
    ...CORPO,
    operation_type_code: "vendita_abbigliamento",
  });
  const incasso = fake.rows("paymentTransaction")[0];

  const ricevuta = await documents.issueReceiptForTransaction(
    { transactionId: incasso.id },
    scope(),
  );
  assert.equal(ricevuta.snapshot.classification.activityScope, "commercial");

  /*
    Il club corregge la classificazione della causale: `saveOperationType`
    riscrive `activity_scope` **in place**, e la causale e configurazione
    mutabile. Senza il congelamento, tutti i documenti passati cambierebbero
    natura retroattivamente.
  */
  fake
    .rows("fiscalOperationType")
    .find((row) => row.code === "vendita_abbigliamento").activity_scope =
    "institutional";

  const riletta = fake.rows("receipt").find((row) => row.id === ricevuta.id);

  assert.equal(
    riletta.snapshot.classification.activityScope,
    "commercial",
    "un documento consegnato non cambia natura sei mesi dopo",
  );
});

/* ========================================================================== */
/* 4 — imponibile e imposta                                                    */
/* ========================================================================== */

test("imponibile e imposta arrivano allo snapshot e alle colonne", async () => {
  await registraIncasso({
    ...CORPO,
    operation_type_code: "vendita_abbigliamento",
  });
  const incasso = fake.rows("paymentTransaction")[0];

  const ricevuta = await documents.issueReceiptForTransaction(
    { transactionId: incasso.id },
    scope(),
  );

  assert.equal(ricevuta.snapshot.amounts.totalCents, 12200);
  assert.equal(ricevuta.snapshot.amounts.taxableAmountCents, 10000);
  assert.equal(ricevuta.snapshot.amounts.vatAmountCents, 2200);
  assert.equal(ricevuta.taxable_amount_cents, 10000);
  assert.equal(ricevuta.vat_amount_cents, 2200);
});

test("senza aliquota dichiarata restano nulli, non zero", async () => {
  await registraIncasso({ ...CORPO, operation_type_code: "quota_attivita" });
  const incasso = fake.rows("paymentTransaction")[0];

  const ricevuta = await documents.issueReceiptForTransaction(
    { transactionId: incasso.id },
    scope(),
  );

  assert.equal(ricevuta.taxable_amount_cents, null);
  assert.equal(ricevuta.vat_amount_cents, null);
  assert.equal(
    ricevuta.snapshot.amounts.vatRate,
    null,
    "un imponibile pari al totale sarebbe un'affermazione fiscale gratuita",
  );
});

/* ========================================================================== */
/* 5 — il numero non lo digita il client                                       */
/* ========================================================================== */

test("una fattura con il numero digitato dal client non si crea", async () => {
  await assert.rejects(
    () =>
      resources.createResource(
        "invoices",
        {
          organization_id: CLUB,
          athlete_id: ATLETA,
          invoice_number: "FT-2026-0001",
          issue_date: "2026-08-29",
          amount: 122,
          description: "Fattura scritta a mano",
        },
        "create",
        scope(),
      ),
    /numero di un documento non si digita/i,
  );

  assert.equal(fake.rows("invoice").length, 0);
});

test("nemmeno una ricevuta, e nemmeno per aggiornamento", async () => {
  await registraIncasso(CORPO);
  const incasso = fake.rows("paymentTransaction")[0];
  const ricevuta = await documents.issueReceiptForTransaction(
    { transactionId: incasso.id },
    scope(),
  );

  await assert.rejects(
    () =>
      resources.updateResource(
        "receipts",
        ricevuta.id,
        { receipt_number: "R-2026-9999" },
        scope(),
      ),
    /numero di un documento non si digita/i,
  );

  assert.equal(
    fake.rows("receipt").find((row) => row.id === ricevuta.id).receipt_number,
    "R-2026-0001",
  );
});

test("rimandare indietro lo stesso numero non e un tentativo", async () => {
  await registraIncasso(CORPO);
  const incasso = fake.rows("paymentTransaction")[0];
  const ricevuta = await documents.issueReceiptForTransaction(
    { transactionId: incasso.id },
    scope(),
  );

  await assert.doesNotReject(() =>
    resources.updateResource(
      "receipts",
      ricevuta.id,
      { receipt_number: ricevuta.receipt_number, file_url: "/archivio/r-1.pdf" },
      scope(),
    ),
  );

  assert.equal(
    fake.rows("receipt").find((row) => row.id === ricevuta.id).file_url,
    "/archivio/r-1.pdf",
    "il resto del salvataggio deve continuare a passare",
  );
});

/* ========================================================================== */
/* 6 — un documento emesso non si modifica                                     */
/* ========================================================================== */

test("l'importo di un documento emesso non si riscrive dal CRUD generico", async () => {
  await registraIncasso(CORPO);
  const incasso = fake.rows("paymentTransaction")[0];
  const ricevuta = await documents.issueReceiptForTransaction(
    { transactionId: incasso.id },
    scope(),
  );

  await assert.rejects(
    () =>
      resources.updateResource("receipts", ricevuta.id, { amount: 10 }, scope()),
    /non si modifica/i,
  );

  assert.equal(
    fake.rows("receipt").find((row) => row.id === ricevuta.id).amount,
    122,
  );
});

test("nemmeno la data, ne lo snapshot, ne l'intestatario", async () => {
  await registraIncasso(CORPO);
  const incasso = fake.rows("paymentTransaction")[0];
  const ricevuta = await documents.issueReceiptForTransaction(
    { transactionId: incasso.id },
    scope(),
  );

  for (const modifica of [
    { issue_date: "2027-01-01" },
    { snapshot: {} },
    { athlete_id: null },
  ]) {
    await assert.rejects(
      () => resources.updateResource("receipts", ricevuta.id, modifica, scope()),
      /non si modifica/i,
    );
  }
});

test("cio che non e fiscalmente rilevante resta modificabile", async () => {
  await registraIncasso(CORPO);
  const incasso = fake.rows("paymentTransaction")[0];
  const ricevuta = await documents.issueReceiptForTransaction(
    { transactionId: incasso.id },
    scope(),
  );

  await resources.updateResource(
    "receipts",
    ricevuta.id,
    { description: "Ricevuta rata unica 2026/27" },
    scope(),
  );

  assert.equal(
    fake.rows("receipt").find((row) => row.id === ricevuta.id).description,
    "Ricevuta rata unica 2026/27",
  );
});

/* ========================================================================== */
/* 7 — multi-tenant                                                            */
/* ========================================================================== */

test("un documento di un altro club non si modifica ne si legge da qui", async () => {
  await registraIncasso(CORPO);
  const incasso = fake.rows("paymentTransaction")[0];
  const ricevuta = await documents.issueReceiptForTransaction(
    { transactionId: incasso.id },
    scope(),
  );

  await assert.rejects(
    () =>
      resources.updateResource(
        "receipts",
        ricevuta.id,
        { description: "manomissione" },
        scope(ALTRO_CLUB),
      ),
    /Accesso negato/,
  );
});

test("la proposta documentale di un altro club non si legge", async () => {
  await registraIncasso(CORPO);
  const incasso = fake.rows("paymentTransaction")[0];

  await assert.rejects(
    () =>
      documents.describeDocumentDecision(
        { transactionId: incasso.id },
        scope(ALTRO_CLUB),
      ),
    /Accesso negato/,
  );
});

test("una causale di un altro club non classifica un incasso", async () => {
  fake.rows("fiscalOperationType").push({
    id: "causale-altrui",
    organization_id: ALTRO_CLUB,
    code: "affitto_impianto",
    label: "Affitto impianto",
    document_route: "invoice",
    activity_scope: "commercial",
    vat_rate: 22,
    is_active: true,
  });

  await registraIncasso({ ...CORPO, operation_type_code: "affitto_impianto" });
  const incasso = fake.rows("paymentTransaction")[0];

  const ricevuta = await documents.issueReceiptForTransaction(
    { transactionId: incasso.id },
    scope(),
  );

  assert.equal(
    ricevuta.snapshot.classification.declared,
    false,
    "un codice che il club non ha in catalogo non e una dichiarazione valida",
  );
  assert.equal(ricevuta.snapshot.classification.source, "absent");
  assert.equal(ricevuta.operation_type_code, null);
});
