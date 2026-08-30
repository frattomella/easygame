import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * L'emissione di una fattura, e cosa la distingue da una ricevuta.
 *
 * Una ricevuta attesta che del denaro e arrivato. Una fattura e un documento
 * fiscale: ha un intestatario, una posizione fiscale e una numerazione
 * propria. Confonderle vorrebbe dire trasformare in fattura ogni incasso —
 * incluso quello di una societa che le fatture non le emette affatto, che e
 * la maggioranza delle ASD.
 *
 * L'errore che questi test presidiano piu di tutti e l'intestazione. Un
 * minorenne non ha una posizione fiscale, e la detrazione per attivita
 * sportiva la chiede il genitore con **il suo** codice fiscale: una fattura
 * intestata al bambino e corretta in tutto tranne che nell'unica cosa per cui
 * serve.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const ALTRO_CLUB = "bbbbbbbb-0000-4000-8000-000000000002";
const RATA = "cccccccc-0000-4000-8000-000000000003";
const ATLETA = "dddddddd-0000-4000-8000-000000000004";

let payments;
let documents;
let setPrismaClientForTests;
let fake;

const scope = () => ({
  userId: "11111111-0000-4000-8000-00000000000a",
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
});

const scopeAltro = () => ({
  userId: "22222222-0000-4000-8000-00000000000b",
  activeOrganizationId: ALTRO_CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [ALTRO_CLUB],
});

before(async () => {
  payments = await import("../../src/lib/server/payment-transactions.ts");
  documents = await import("../../src/lib/server/fiscal-documents.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const seed = (athleteData) => ({
  club: [
    {
      id: CLUB,
      name: "ASD Alfa",
      /*
        Dal Blocco D una fattura vuole anche l'emittente: senza indirizzo e
        posizione fiscale non e una fattura, ed e il motore fiscale a dirlo
        (ADR-0052). Qui arrivano dalle colonne `legal_*`, che sono il ripiego
        in lettura quando il profilo fiscale non e ancora stato compilato.
      */
      business_name: "Associazione Sportiva Dilettantistica Alfa",
      vat_number: "12345678903",
      legal_address: "Via Roma 1",
      legal_city: "Roma",
      legal_postal_code: "00100",
      legal_province: "RM",
      legal_country: "Italia",
    },
  ],
  athlete: [
    {
      id: ATLETA,
      organization_id: CLUB,
      first_name: "Mario",
      last_name: "Rossi",
      data: athleteData,
    },
  ],
  athletePayment: [
    {
      id: RATA,
      organization_id: CLUB,
      athlete_id: ATLETA,
      amount: 100,
      status: "pending",
      description: "Prima rata",
      data: {},
    },
  ],
  paymentTransaction: [
    {
      id: "incasso-1",
      organization_id: CLUB,
      athlete_id: ATLETA,
      payment_id: RATA,
      amount: 40,
      paid_at: new Date("2026-08-26T10:00:00.000Z"),
      payment_method: "Bonifico",
      source: "MANUAL",
      data: {},
    },
  ],
});

const TUTORE_COMPLETO = {
  guardians: [
    {
      name: "Anna",
      surname: "Rossi",
      fiscalCode: "RSSNNA80A41H501K",
      email: "anna@example.it",
      address: "Via Milano 4",
      city: "Roma",
      postalCode: "00185",
      province: "RM",
    },
  ],
};

const prepara = (athleteData = TUTORE_COMPLETO) => {
  fake = createFakePrisma(seed(athleteData));
  setPrismaClientForTests(fake.client);
};

beforeEach(() => prepara());

const emetti = () =>
  documents.issueInvoiceForTransaction({ transactionId: "incasso-1" }, scope());

/* ------------------------------------------------------- l'intestazione */

test("la fattura e intestata al genitore, non all'atleta", async () => {
  const fattura = await emetti();

  assert.equal(fattura.fiscal_code, "RSSNNA80A41H501K");
  assert.equal(fattura.data.recipientName, "Anna Rossi");
  assert.equal(
    fattura.data.recipientSource,
    "guardian",
    "una fattura intestata a un minorenne non e utilizzabile da nessuno",
  );
});

test("il club puo indicare quale tutore intesta", async () => {
  prepara({
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
      {
        name: "Luigi",
        surname: "Rossi",
        fiscalCode: "RSSLGU78B02H501X",
        address: "Via Milano 4",
        city: "Roma",
        postalCode: "00185",
        province: "RM",
      },
    ],
    billingGuardianIndex: 1,
  });

  const fattura = await emetti();

  assert.equal(
    fattura.fiscal_code,
    "RSSLGU78B02H501X",
    "chi paga non e sempre il primo dell'elenco",
  );
});

test("un atleta maggiorenne senza tutori intesta a se stesso", async () => {
  prepara({
    fiscalCode: "RSSMRA85M01H501Q",
    address: "Via Milano 4",
    city: "Roma",
    postalCode: "00185",
    province: "RM",
  });

  const fattura = await emetti();

  assert.equal(fattura.fiscal_code, "RSSMRA85M01H501Q");
  assert.equal(fattura.data.recipientSource, "athlete");
});

test("senza codice fiscale la fattura non si emette, e il messaggio dice cosa fare", async () => {
  prepara({ guardians: [{ name: "Anna", surname: "Rossi" }] });

  await assert.rejects(
    () => emetti(),
    /codice fiscale o partita IVA[\s\S]*ricevuta/,
  );
});

/* -------------------------------------------------------- il documento */

test("il numero viene dal registro delle fatture, non da quello delle ricevute", async () => {
  const fattura = await emetti();

  assert.equal(fattura.invoice_number, "FT-2026-0001");
});

test("i due registri non si mescolano", async () => {
  const ricevuta = await documents.issueReceiptForTransaction(
    { transactionId: "incasso-1" },
    scope(),
  );
  const fattura = await emetti();

  assert.equal(ricevuta.receipt_number, "R-2026-0001");
  assert.equal(
    fattura.invoice_number,
    "FT-2026-0001",
    "sono due registri distinti: la prima fattura e la 1 anche se c'e gia una ricevuta",
  );
});

test("emettere due volte restituisce la stessa fattura", async () => {
  const prima = await emetti();
  const seconda = await emetti();

  assert.equal(prima.id, seconda.id);
  assert.equal(
    fake.rows("invoice").length,
    1,
    "un secondo documento per lo stesso denaro consuma un numero e non serve a nessuno",
  );
});

test("la fattura non si dichiara elettronica: EasyGame non la trasmette", async () => {
  const fattura = await emetti();

  assert.equal(
    fattura.is_electronic,
    false,
    "dichiararla elettronica senza un canale verso lo SdI farebbe credere di aver adempiuto",
  );
});

test("la fattura cita l'incasso da cui nasce", async () => {
  const fattura = await emetti();

  assert.equal(fattura.data.transactionId, "incasso-1");
  assert.equal(fattura.payment_id, RATA);
  assert.equal(fattura.amount, 40);
});

/* ------------------------------------------------------------ i confini */

test("un incasso stornato non produce una fattura", async () => {
  fake.rows("paymentTransaction")[0].reversed_at = new Date();

  await assert.rejects(() => emetti(), /stornato/);
});

test("l'incasso di un altro club non si fattura", async () => {
  await assert.rejects(
    () =>
      documents.issueInvoiceForTransaction(
        { transactionId: "incasso-1" },
        scopeAltro(),
      ),
    /Accesso negato/,
  );

  assert.equal(fake.rows("invoice").length, 0);
});
