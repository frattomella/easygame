import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **L'importo di una rata e denaro, e il registro generico lo riscriveva
 * come una colonna qualunque.** (B-H3, revisione finale della Wave 6)
 *
 * `guardLedgerOwnedPaymentState` chiudeva lo `status`; `amount`, `due_date`
 * e `athlete_id` restavano aperti. Misurato: rata `paid` da 130 portata a
 * 500 con `PATCH /api/v1/payments/:id`, riga ancora `paid`, registro
 * riletto `partial` con residuo 370. La stessa regola della rotta di dominio
 * vale ora anche qui: una rata saldata non cambia importo; una rata aperta lo
 * cambia dentro il lock, e lo stato lo riscrive il ledger.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const SALDATA = "11111111-0000-4000-8000-00000000000a";
const APERTA = "11111111-0000-4000-8000-00000000000b";
const ATLETA = "99999999-0000-4000-8000-000000000009";
const ALTRO_ATLETA = "99999999-0000-4000-8000-000000000008";

const scope = () => ({
  userId: "user-a",
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
});

let resources;
let setPrismaClientForTests;
let fake;

const rata = (id, overrides = {}) => ({
  id,
  organization_id: CLUB,
  athlete_id: ATLETA,
  description: "Quota annuale",
  amount: 130,
  due_date: new Date("2026-09-30T00:00:00Z"),
  paid_at: null,
  status: "pending",
  method: null,
  notes: null,
  data: {},
  ...overrides,
});

const incasso = (id, paymentId, amount) => ({
  id,
  organization_id: CLUB,
  athlete_id: ATLETA,
  payment_id: paymentId,
  amount,
  paid_at: new Date("2026-09-01T10:00:00Z"),
  payment_method: "Contanti",
  source: "MANUAL",
  reversed_at: null,
  reverses_transaction_id: null,
});

const seed = () => ({
  club: [{ id: CLUB, slug: "club-a", name: "Club A" }],
  athlete: [
    { id: ATLETA, organization_id: CLUB, first_name: "Anna", last_name: "Rossi" },
    { id: ALTRO_ATLETA, organization_id: CLUB, first_name: "Bruno", last_name: "Bianchi" },
  ],
  athletePayment: [
    rata(SALDATA, {
      status: "paid",
      paid_at: new Date("2026-09-01T10:00:00Z"),
      data: { ledger: { dueAmount: 130, paidAmount: 130, residualAmount: 0, state: "paid" } },
    }),
    rata(APERTA, {
      amount: 200,
      status: "partially_paid",
      data: { ledger: { dueAmount: 200, paidAmount: 120, residualAmount: 80, state: "partial" } },
    }),
  ],
  paymentTransaction: [
    incasso("aaaa1111-0000-4000-8000-00000000aaaa", SALDATA, 130),
    incasso("aaaa1111-0000-4000-8000-00000000aaab", APERTA, 120),
  ],
  receipt: [],
  invoice: [],
  auditLog: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  resources = await import("../../src/lib/server/resources.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const riga = (id) => fake.rows("athletePayment").find((row) => row.id === id);

test("una rata saldata non cambia importo dal registro generico", async () => {
  await assert.rejects(
    () => resources.updateResource("payments", SALDATA, { amount: 500 }, scope()),
    /gia pagati/,
  );
  assert.equal(riga(SALDATA).amount, 130);
  assert.equal(riga(SALDATA).status, "paid");
});

test("ne scadenza ne atleta: sono fissati dai suoi incassi", async () => {
  await assert.rejects(
    () =>
      resources.updateResource(
        "payments",
        SALDATA,
        { due_date: "2026-12-31T00:00:00.000Z" },
        scope(),
      ),
    /gia pagati/,
  );
  await assert.rejects(
    () => resources.updateResource("payments", SALDATA, { athlete_id: ALTRO_ATLETA }, scope()),
    /gia pagati/,
  );
  assert.equal(riga(SALDATA).athlete_id, ATLETA);
});

test("l'alias `simplified_payments` risponde uguale", async () => {
  await assert.rejects(
    () => resources.updateResource("simplified_payments", SALDATA, { amount: 500 }, scope()),
    /gia pagati/,
  );
  assert.equal(riga(SALDATA).amount, 130);
});

test("controspecchio: su una rata aperta l'importo cambia e lo stato lo ricava il registro", async () => {
  await resources.updateResource("payments", APERTA, { amount: 120 }, scope());

  assert.equal(riga(APERTA).amount, 120);
  assert.equal(riga(APERTA).status, "paid", "120 incassati su 120 dovuti: saldata");
  assert.equal(riga(APERTA).data.ledger.residualAmount, 0);
  assert.ok(riga(APERTA).paid_at, "la data di saldo la mette il ledger");
});

test("controspecchio: alzare l'importo di una rata aperta la riporta parziale", async () => {
  await resources.updateResource("payments", APERTA, { amount: 300 }, scope());

  assert.equal(riga(APERTA).amount, 300);
  assert.equal(riga(APERTA).status, "partially_paid");
  assert.equal(riga(APERTA).data.ledger.residualAmount, 180);
});

test("una rata aperta con incassi non si sposta su un altro atleta", async () => {
  await assert.rejects(
    () => resources.updateResource("payments", APERTA, { athlete_id: ALTRO_ATLETA }, scope()),
    /incassi registrati/,
  );
  assert.equal(riga(APERTA).athlete_id, ATLETA);
});

test("la descrizione e le note di una rata saldata restano modificabili", async () => {
  await resources.updateResource(
    "payments",
    SALDATA,
    { description: "Quota annuale (rinumerata)", notes: "Pagata allo sportello" },
    scope(),
  );

  assert.equal(riga(SALDATA).description, "Quota annuale (rinumerata)");
  assert.equal(riga(SALDATA).notes, "Pagata allo sportello");
  assert.equal(riga(SALDATA).amount, 130);
  assert.equal(riga(SALDATA).status, "paid");
});

test("rimandare lo stesso importo non e una modifica", async () => {
  await resources.updateResource("payments", SALDATA, { amount: 130, description: "Quota" }, scope());
  assert.equal(riga(SALDATA).description, "Quota");
});
