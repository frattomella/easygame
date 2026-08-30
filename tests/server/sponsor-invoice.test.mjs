import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * La fattura a uno **sponsor**.
 *
 * La sponsorizzazione e l'unica entrata dichiaratamente commerciale del
 * catalogo delle causali, l'unica con `documentRoute: "invoice"`, ed era
 * l'unica che una fattura non poteva averla: l'intestatario di un documento
 * veniva sempre risolto da un atleta, e un incasso di sponsorizzazione un
 * atleta non ce l'ha.
 *
 * Questi test presidiano due cose. La prima e l'intestazione: una fattura di
 * sponsorizzazione intestata a una famiglia sarebbe corretta in tutto tranne
 * che nell'unica cosa per cui serve. La seconda e lo **snapshot**: il documento
 * congela lo sponsor come gia congela l'atleta, e se domani la scheda cambia
 * ragione sociale il documento gia consegnato non cambia.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const SPONSOR = "sponsor-1";
const INCASSO = "incasso-sponsor-1";

let documents;
let setPrismaClientForTests;
let fake;

before(async () => {
  documents = await import("../../src/lib/server/fiscal-documents.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const scope = () => ({
  userId: "11111111-0000-4000-8000-00000000000a",
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
});

const SPONSOR_PAYLOAD = {
  id: SPONSOR,
  name: "Rossi Impianti SRL",
  type: "sponsor",
  vatNumber: "12345678903",
  sdi: "ABC1234",
  pec: "rossi@pec.it",
  address: "Via Torino 10",
  city: "Torino",
  postalCode: "10121",
  province: "TO",
  contract: { agreedAmountCents: 500000 },
};

const seed = () => ({
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
      sponsors: [],
    },
  ],
  clubResourceItem: [
    {
      id: SPONSOR,
      organization_id: CLUB,
      resource_type: "sponsors",
      name: SPONSOR_PAYLOAD.name,
      status: null,
      date: null,
      payload: SPONSOR_PAYLOAD,
      created_at: new Date("2026-08-01T00:00:00.000Z"),
      updated_at: new Date("2026-08-01T00:00:00.000Z"),
    },
  ],
  fiscalOperationType: [
    {
      id: "causale-sponsor",
      organization_id: CLUB,
      code: "sponsorizzazione",
      label: "Sponsorizzazione",
      document_route: "invoice",
      activity_scope: "commercial",
      vat_rate: 22,
      is_active: true,
    },
  ],
  paymentTransaction: [
    {
      id: INCASSO,
      organization_id: CLUB,
      athlete_id: null,
      payment_id: null,
      amount: 2000,
      paid_at: new Date("2026-10-01T10:00:00.000Z"),
      payment_method: "Bonifico",
      source: "MANUAL",
      operation_type_code: "sponsorizzazione",
      counterparty_kind: "SPONSOR",
      counterparty_id: SPONSOR,
      counterparty_label: "Rossi Impianti SRL",
      data: {},
    },
  ],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const emetti = () =>
  documents.issueInvoiceForTransaction({ transactionId: INCASSO }, scope());

test("l'intestatario della fattura e lo sponsor, non un atleta", async () => {
  const fattura = await emetti();

  assert.equal(fattura.snapshot.recipient.name, "Rossi Impianti SRL");
  assert.equal(fattura.snapshot.recipient.vatNumber, "12345678903");
  assert.equal(
    fattura.snapshot.recipient.source,
    "counterparty",
    "una fattura di sponsorizzazione intestata a una famiglia non serve a nessuno",
  );
  assert.equal(fattura.athlete_id, null);
});

test("lo snapshot congela lo sponsor: la ragione sociale nuova non riscrive il documento", async () => {
  const fattura = await emetti();

  const riga = fake
    .rows("clubResourceItem")
    .find((item) => item.payload?.id === SPONSOR);
  riga.payload = { ...riga.payload, name: "Bianchi Impianti SPA", city: "Milano" };

  assert.equal(fattura.snapshot.recipient.name, "Rossi Impianti SRL");
  assert.equal(fattura.snapshot.recipient.city, "Torino");
  assert.equal(fattura.snapshot.recipient.postalCode, "10121");
});

test("la fattura riceve la causale della sponsorizzazione e il suo importo", async () => {
  const fattura = await emetti();

  assert.equal(fattura.operation_type_code, "sponsorizzazione");
  assert.equal(fattura.amount, 2000);
  assert.equal(fattura.snapshot.amounts.totalCents, 200000);
  assert.equal(
    fattura.description,
    "Sponsorizzazione",
    "«Quota sportiva» su una fattura a uno sponsor sarebbe una riga sbagliata",
  );
});

test("la decisione dichiara la fattura ammessa e senza impedimenti", async () => {
  const { decision, recipient } = await documents.describeDocumentDecision(
    { transactionId: INCASSO },
    scope(),
  );

  assert.ok(decision.allowed.includes("invoice"));
  assert.deepEqual(decision.blockers, []);
  assert.equal(recipient.counterpartyKind, "SPONSOR");
  assert.equal(recipient.counterpartyId, SPONSOR);
});

test("uno sponsor senza partita IVA ne codice fiscale blocca la fattura, dicendo cosa manca", async () => {
  const riga = fake
    .rows("clubResourceItem")
    .find((item) => item.payload?.id === SPONSOR);
  riga.payload = { ...riga.payload, vatNumber: "", fiscalCode: "" };

  await assert.rejects(() => emetti(), /codice fiscale o partita IVA/);
});
