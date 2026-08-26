import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * I **documenti fiscali**: snapshot, serie, immutabilita, annullamento.
 *
 * Il difetto che lo snapshot chiude era silenzioso e grave: una ricevuta si
 * ristampava leggendo l'anagrafica **di oggi**. Bastava che una famiglia
 * traslocasse perche la ricevuta gia consegnata mesi prima diventasse un
 * documento diverso da quello che quella famiglia aveva in mano — due
 * documenti con lo stesso numero.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const ALTRO_CLUB = "bbbbbbbb-0000-4000-8000-000000000002";
const RATA = "cccccccc-0000-4000-8000-000000000003";
const ATLETA = "dddddddd-0000-4000-8000-000000000004";

let documents;
let setPrismaClientForTests;
let fake;

before(async () => {
  documents = await import("../../src/lib/server/fiscal-documents.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const scope = (organizationId = CLUB) => ({
  userId: "utente-1",
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

const seed = (athleteData = TUTORE) => ({
  club: [
    {
      id: CLUB,
      name: "ASD Alfa",
      business_name: "Associazione Sportiva Dilettantistica Alfa",
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
      data: athleteData,
    },
  ],
  athletePayment: [
    {
      id: RATA,
      organization_id: CLUB,
      athlete_id: ATLETA,
      amount: 130,
      status: "paid",
      description: "Rata unica",
      data: {},
    },
  ],
  paymentTransaction: [
    {
      id: "incasso-1",
      organization_id: CLUB,
      athlete_id: ATLETA,
      payment_id: RATA,
      amount: 130,
      paid_at: new Date("2026-08-26T10:00:00.000Z"),
      payment_method: "Bonifico",
      source: "MANUAL",
      data: {},
    },
  ],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const ricevuta = () =>
  documents.issueReceiptForTransaction({ transactionId: "incasso-1" }, scope());

/* ---------------------------------------------------------- lo snapshot */

test("il documento emesso porta con se la fotografia dei dati", async () => {
  const emessa = await ricevuta();

  assert.equal(emessa.snapshot.recipient.name, "Anna Rossi");
  assert.equal(emessa.snapshot.recipient.fiscalCode, "RSSNNA80A41H501K");
  assert.equal(emessa.snapshot.recipient.address, "Via Milano 4");
  assert.equal(
    emessa.snapshot.issuer.name,
    "Associazione Sportiva Dilettantistica Alfa",
  );
  assert.equal(emessa.snapshot.amounts.totalCents, 13000);
});

test("il documento non cambia perche l'atleta trasloca", async () => {
  const emessa = await ricevuta();
  const indirizzoOriginale = emessa.snapshot.recipient.address;

  /* La famiglia si trasferisce dopo l'emissione. */
  const atleta = fake.rows("athlete").find((row) => row.id === ATLETA);
  atleta.data = {
    guardians: [{ ...TUTORE.guardians[0], address: "Via Nuova 99" }],
  };

  const riletto = fake.rows("receipt")[0];

  assert.equal(
    riletto.snapshot.recipient.address,
    indirizzoOriginale,
    "sarebbe un documento diverso da quello consegnato",
  );
});

test("lo snapshot dice anche chi ha emesso", async () => {
  const emessa = await ricevuta();

  assert.equal(emessa.snapshot.issuedByUserId, "utente-1");
  assert.equal(emessa.issued_by, "utente-1");
});

/* -------------------------------------------------------- la numerazione */

test("la ricevuta prende un numero dal registro delle ricevute", async () => {
  const emessa = await ricevuta();

  assert.equal(emessa.receipt_number, "R-2026-0001");
  assert.equal(emessa.series, "");
  assert.equal(emessa.sequence, 1);
  assert.equal(emessa.document_year, 2026);
});

test("una serie configurata entra nel numero", async () => {
  fake.rows("documentSeries").push({
    id: "serie-1",
    organization_id: CLUB,
    kind: "receipt",
    code: "SPO",
    label: "Sponsorizzazioni",
    prefix: "R",
    is_default: true,
    is_active: true,
  });

  const emessa = await ricevuta();

  assert.equal(emessa.receipt_number, "R-SPO-2026-0001");
  assert.equal(emessa.series, "SPO");
});

test("due serie hanno due progressioni indipendenti", async () => {
  fake.rows("documentNumberSequence").push(
    {
      id: "seq-1",
      organization_id: CLUB,
      kind: "receipt",
      series: "",
      year: 2026,
      last_number: 41,
    },
    {
      id: "seq-2",
      organization_id: CLUB,
      kind: "receipt",
      series: "SPO",
      year: 2026,
      last_number: 6,
    },
  );

  const senzaSerie = await documents.issueReceiptForTransaction(
    { transactionId: "incasso-1" },
    scope(),
  );

  assert.equal(senzaSerie.receipt_number, "R-2026-0042");
  assert.equal(
    fake.rows("documentNumberSequence").find((row) => row.series === "SPO")
      .last_number,
    6,
    "un registro mescolato non si riconcilia piu",
  );
});

test("la numerazione appartiene a un club: due societa hanno entrambe la loro prima", async () => {
  fake.rows("documentNumberSequence").push({
    id: "seq-altro",
    organization_id: ALTRO_CLUB,
    kind: "receipt",
    series: "",
    year: 2026,
    last_number: 87,
  });

  const emessa = await ricevuta();

  assert.equal(emessa.receipt_number, "R-2026-0001");
});

/* ---------------------------------------------------------- idempotenza */

test("emettere due volte restituisce la stessa ricevuta", async () => {
  const prima = await ricevuta();
  const seconda = await ricevuta();

  assert.equal(prima.id, seconda.id);
  assert.equal(
    fake.rows("receipt").length,
    1,
    "chiederla due volte non consuma un numero",
  );
});

/* ---------------------------------------------- incasso != documento */

test("un incasso stornato non produce un documento", async () => {
  fake.rows("paymentTransaction")[0].reversed_at = new Date();

  await assert.rejects(() => ricevuta(), /stornato non produce/i);
});

test("un rimborso non produce una ricevuta", async () => {
  fake.rows("paymentTransaction").push({
    id: "rimborso-1",
    organization_id: CLUB,
    athlete_id: ATLETA,
    payment_id: RATA,
    amount: -30,
    paid_at: new Date("2026-08-27T10:00:00.000Z"),
    payment_method: "online",
    source: "STRIPE",
    data: { kind: "refund" },
  });

  await assert.rejects(
    () =>
      documents.issueReceiptForTransaction(
        { transactionId: "rimborso-1" },
        scope(),
      ),
    /si rettifica il documento originale/i,
  );
});

/* ---------------------------------------------------------- multi-tenant */

test("il documento di un club non si emette da un altro club", async () => {
  await assert.rejects(
    () =>
      documents.issueReceiptForTransaction(
        { transactionId: "incasso-1" },
        scope(ALTRO_CLUB),
      ),
    /Accesso negato/,
  );
});

test("il documento di un club non si annulla da un altro club", async () => {
  const emessa = await ricevuta();

  await assert.rejects(
    () =>
      documents.cancelDocument(
        {
          kind: "receipt",
          documentId: emessa.id,
          reason: "prova di accesso incrociato",
        },
        scope(ALTRO_CLUB),
      ),
    /Accesso negato/,
  );

  assert.equal(fake.rows("receipt")[0].cancelled_at, undefined);
});

/* --------------------------------------------------------- annullamento */

test("annullare marca il documento e conserva il motivo", async () => {
  const emessa = await ricevuta();

  const annullata = await documents.cancelDocument(
    {
      kind: "receipt",
      documentId: emessa.id,
      reason: "Importo errato: si riemette",
    },
    scope(),
  );

  assert.equal(annullata.status, "cancelled");
  assert.ok(annullata.cancelled_at);
  assert.equal(annullata.cancellation_reason, "Importo errato: si riemette");
  assert.equal(annullata.cancelled_by, "utente-1");
});

test("annullare non libera il numero", async () => {
  const emessa = await ricevuta();

  await documents.cancelDocument(
    { kind: "receipt", documentId: emessa.id, reason: "annullata" },
    scope(),
  );

  assert.equal(
    fake.rows("documentNumberSequence")[0].last_number,
    1,
    "un buco nella numerazione e spiegabile, lo stesso numero su due documenti no",
  );
});

test("un annullamento senza motivo non si accetta", async () => {
  const emessa = await ricevuta();

  await assert.rejects(
    () =>
      documents.cancelDocument(
        { kind: "receipt", documentId: emessa.id, reason: "" },
        scope(),
      ),
    /senza motivo/i,
  );
});

test("un documento gia annullato non si annulla due volte", async () => {
  const emessa = await ricevuta();

  await documents.cancelDocument(
    { kind: "receipt", documentId: emessa.id, reason: "prima volta" },
    scope(),
  );

  await assert.rejects(
    () =>
      documents.cancelDocument(
        { kind: "receipt", documentId: emessa.id, reason: "seconda volta" },
        scope(),
      ),
    /gia stato annullato/i,
  );
});

/* --------------------------------------------------------- immutabilita */

test("un documento emesso non cambia numero, data ne importo", () => {
  const emesso = {
    status: "issued",
    receipt_number: "R-2026-0001",
    issue_date: "2026-08-26",
    amount: 130,
  };

  assert.throws(
    () => documents.assertDocumentMutable(emesso, { amount: 100 }),
    /non si modifica/i,
  );

  assert.throws(
    () =>
      documents.assertDocumentMutable(emesso, { receipt_number: "R-2026-0002" }),
    /receipt_number/,
  );
});

test("rimandare indietro lo stesso valore non e una modifica", () => {
  const emesso = { status: "issued", amount: 130, receipt_number: "R-2026-0001" };

  assert.doesNotThrow(() =>
    documents.assertDocumentMutable(emesso, {
      amount: 130,
      receipt_number: "R-2026-0001",
      file_url: "/documenti/r-2026-0001.pdf",
    }),
  );
});

test("una bozza si modifica: l'immutabilita comincia con l'emissione", () => {
  assert.doesNotThrow(() =>
    documents.assertDocumentMutable({ status: "draft", amount: 130 }, { amount: 100 }),
  );
});

/* --------------------------------------------------- cosa si propone */

test("la decisione documentale si legge prima di emettere", async () => {
  const esito = await documents.describeDocumentDecision(
    { transactionId: "incasso-1" },
    scope(),
  );

  assert.ok(esito.decision.suggested);
  assert.equal(esito.recipient.name, "Anna Rossi");
  assert.equal(esito.recipient.source, "guardian");
});
