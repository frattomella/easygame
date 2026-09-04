import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **PP-02 §E — una ricevuta e un elenco chiuso di campi, non la riga.**
 *
 * `receipts: receipts.map((receipt) => ({ ...receipt, … }))` mandava al browser
 * di ogni famiglia **l'intera riga** del documento fiscale. Nessuno di quei
 * campi veniva disegnato, e per questo la revisione a schermo non lo vedeva; ma
 * uscire nella risposta e la stessa cosa che mostrarlo — basta aprire gli
 * strumenti del browser, e chiunque riceva quel JSON lo ha.
 *
 * Cosa usciva, e perche non e un dettaglio:
 *
 * | Campo | Cosa e |
 * |---|---|
 * | `issued_by`, `cancelled_by` | l'identificativo della persona di segreteria che ha emesso o annullato |
 * | `operation_type_code`, `snapshot` | la classificazione contabile congelata: il club che parla al proprio rendiconto |
 * | `transaction_id`, `invoice_id`, `payment_id` | le chiavi con cui il club riconcilia la cassa |
 * | `data` | un JSON libero, senza contratto, in cui nessuno ha promesso di non scrivere note interne |
 *
 * Il presidio e sul **verso positivo e su quello negativo insieme**: l'elenco
 * dei campi ammessi (cosi un campo nuovo sulla riga nasce invisibile) e
 * l'assenza nominale di quelli interni (cosi un ritorno allo `spread` si
 * vede).
 */

const CLUB = "aaaaaaaa-02e0-4000-8000-00000000000a";
const ANNA = "11111111-02e0-4000-8000-000000000aaa";
const BRUNO = "22222222-02e0-4000-8000-000000000bbb";
const MARCO = "aaaa02e0-02e0-4000-8000-00000000000a";
const LUCA = "bbbb02e0-02e0-4000-8000-00000000000b";

let cruscotto;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  cruscotto = await import("../../src/lib/server/parent-dashboard.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const seed = () => ({
  user: [
    {
      id: ANNA,
      email: "anna@example.it",
      email_verified_at: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      id: BRUNO,
      email: "bruno@example.it",
      email_verified_at: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
  club: [{ id: CLUB, slug: "club", name: "ASD Collaudo" }],
  organizationUser: [
    {
      id: "ou-anna",
      organization_id: CLUB,
      user_id: ANNA,
      role: "parent",
      is_primary: true,
    },
    {
      id: "ou-bruno",
      organization_id: CLUB,
      user_id: BRUNO,
      role: "parent",
      is_primary: true,
    },
  ],
  athlete: [
    {
      id: MARCO,
      organization_id: CLUB,
      first_name: "Marco",
      last_name: "Rossi",
      status: "active",
      data: { guardians: [{ name: "Anna", linkedUserId: ANNA }] },
    },
    {
      id: LUCA,
      organization_id: CLUB,
      first_name: "Luca",
      last_name: "Bianchi",
      status: "active",
      data: { guardians: [{ name: "Bruno", linkedUserId: BRUNO }] },
    },
  ],
  athleteCategoryMembership: [],
  athletePayment: [],
  receipt: [
    {
      id: "r-1",
      organization_id: CLUB,
      athlete_id: MARCO,
      payment_id: "pay-1",
      transaction_id: "tx-1",
      invoice_id: null,
      receipt_number: "12/2026",
      series: "",
      sequence: 12,
      document_year: 2026,
      operation_type_code: "quota_associativa",
      snapshot: { totale: 100 },
      cancelled_at: null,
      cancelled_by: null,
      issued_by: "segretaria-1",
      issue_date: new Date("2026-08-20T00:00:00.000Z"),
      amount: 100,
      description: "Acconto quota 2026/27",
      status: "issued",
      data: { note_interne: "riscosso in contanti allo sportello" },
    },
    {
      id: "r-2",
      organization_id: CLUB,
      athlete_id: MARCO,
      receipt_number: "13/2026",
      issue_date: new Date("2026-09-01T00:00:00.000Z"),
      amount: 50,
      description: "Kit gara",
      status: "issued",
      cancelled_at: new Date("2026-09-02T00:00:00.000Z"),
      cancelled_by: "segretaria-1",
      cancellation_reason: "importo sbagliato",
    },
    {
      id: "r-altra-famiglia",
      organization_id: CLUB,
      athlete_id: LUCA,
      receipt_number: "14/2026",
      issue_date: new Date("2026-09-01T00:00:00.000Z"),
      amount: 300,
      description: "Quota 2026/27",
      status: "issued",
    },
  ],
  invoice: [
    {
      id: "f-1",
      organization_id: CLUB,
      athlete_id: MARCO,
      invoice_number: "4/2026",
      issue_date: new Date("2026-07-01T00:00:00.000Z"),
      amount: 200,
      description: "Quota annuale",
      status: "issued",
      issued_by: "segretaria-1",
    },
  ],
  medicalCertificate: [],
  clubEventParticipant: [],
  notification: [],
  documentRequest: [],
  documentSubmission: [],
  attachment: [],
  auditLog: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const CAMPI_AMMESSI = [
  "amount",
  "athleteId",
  "athleteName",
  "description",
  "downloadPath",
  "id",
  "issueDate",
  "kind",
  "number",
  "status",
  "statusLabel",
];

const CAMPI_INTERNI = [
  "issued_by",
  "cancelled_by",
  "cancellation_reason",
  "operation_type_code",
  "snapshot",
  "transaction_id",
  "invoice_id",
  "payment_id",
  "series",
  "sequence",
  "document_year",
  "data",
  "organization_id",
];

test("la ricevuta che esce e esattamente l'elenco dichiarato", async () => {
  const dati = await cruscotto.getParentDashboardData(ANNA, MARCO);
  const ricevuta = dati.payments.receipts.find((riga) => riga.id === "r-1");

  assert.deepEqual(Object.keys(ricevuta).sort(), CAMPI_AMMESSI);
});

test("nessun campo interno del club raggiunge la famiglia", async () => {
  const dati = await cruscotto.getParentDashboardData(ANNA, MARCO);

  for (const documento of [
    ...dati.payments.receipts,
    ...dati.payments.invoices,
  ]) {
    for (const campo of CAMPI_INTERNI) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(documento, campo),
        false,
        `${campo} non deve uscire (documento ${documento.id})`,
      );
    }
  }
});

test("una ricevuta annullata si legge «Annullata», non sparisce", async () => {
  /*
    Sparire sarebbe la scelta comoda e la peggiore: una famiglia che ha in mano
    la copia cartacea di un documento annullato deve poterlo capire
    dall'applicazione, non scoprirlo in segreteria.
  */
  const dati = await cruscotto.getParentDashboardData(ANNA, MARCO);
  const annullata = dati.payments.receipts.find((riga) => riga.id === "r-2");

  assert.equal(annullata.status, "cancelled");
  assert.equal(annullata.statusLabel, "Annullata");
  /* Il motivo dell'annullamento e del club, e non esce. */
  assert.equal(
    Object.prototype.hasOwnProperty.call(annullata, "cancellation_reason"),
    false,
  );
});

test("la riga dice di quale figlio parla, e con quale numero", async () => {
  const dati = await cruscotto.getParentDashboardData(ANNA, MARCO);
  const ricevuta = dati.payments.receipts.find((riga) => riga.id === "r-1");

  assert.equal(ricevuta.athleteName, "Rossi Marco");
  assert.equal(ricevuta.number, "12/2026");
  assert.equal(ricevuta.kind, "receipt");
  assert.equal(ricevuta.downloadPath, "/api/v1/documents/receipt/r-1");
});

test("la fattura esce nella stessa forma, con il proprio tipo", async () => {
  const dati = await cruscotto.getParentDashboardData(ANNA, MARCO);
  const [fattura] = dati.payments.invoices;

  assert.deepEqual(Object.keys(fattura).sort(), CAMPI_AMMESSI);
  assert.equal(fattura.kind, "invoice");
  assert.equal(fattura.number, "4/2026");
  assert.equal(fattura.downloadPath, "/api/v1/documents/invoice/f-1");
});

test("la ricevuta dell'altra famiglia non entra in questo elenco", async () => {
  const dati = await cruscotto.getParentDashboardData(ANNA, MARCO);

  assert.equal(
    dati.payments.receipts.some((riga) => riga.id === "r-altra-famiglia"),
    false,
  );
  assert.equal(dati.payments.receipts.length, 2);
});
