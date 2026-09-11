import { test } from "node:test";
import assert from "node:assert/strict";

import {
  describeDueDate,
  findFiscalDocumentsForPayment,
  resolvePaymentPlanIdentity,
  resolvePaymentPlanInstalments,
  resolveRemainingAmount,
} from "../client/lib/parent-payment-plan";
import type {
  FamilyFiscalDocument,
  ParentPayment,
} from "../client/services/api";

const payment = (overrides: Partial<ParentPayment> = {}): ParentPayment => ({
  id: "p1",
  date: "2026-09-01",
  dueDate: "2026-09-01",
  paidAt: null,
  description: "Rata di marzo",
  type: "Quota stagionale 2026/27",
  amount: 120,
  status: "Da incassare",
  statusKey: "pending",
  paidAmount: 0,
  source: "athlete_payment",
  ...overrides,
});

test("il piano rate raggruppa per piano (type) e ordina per scadenza, rata aperta compresa", () => {
  const march = payment({ id: "m", dueDate: "2027-03-14" });
  const december = payment({
    id: "d",
    description: "Rata di dicembre",
    dueDate: "2026-12-10",
    statusKey: "paid",
    status: "Pagato",
    paidAmount: 150,
    amount: 150,
  });
  const june = payment({
    id: "j",
    description: "Rata di giugno",
    dueDate: "2027-06-10",
  });
  const other = payment({
    id: "o",
    type: "Iscrizione 2026/27",
    dueDate: "2026-09-04",
  });

  const plan = resolvePaymentPlanInstalments(
    [june, other, december, march],
    march,
  );
  assert.deepEqual(
    plan.map((item) => item.id),
    ["d", "m", "j"],
  );
});

test("una rata senza piano fa piano da sola", () => {
  const alone = payment({ id: "a", type: "" });
  assert.deepEqual(
    resolvePaymentPlanInstalments([payment({ id: "x" }), alone], alone).map(
      (item) => item.id,
    ),
    ["a"],
  );
});

test("il residuo e zero per una rata saldata o annullata, altrimenti importo meno versato", () => {
  assert.equal(resolveRemainingAmount(payment({ paidAmount: 40 })), 80);
  assert.equal(
    resolveRemainingAmount(payment({ statusKey: "paid", status: "Pagato" })),
    0,
  );
  assert.equal(
    resolveRemainingAmount(
      payment({ statusKey: "cancelled", status: "Annullato" }),
    ),
    0,
  );
});

test("la riga di scadenza legge lo stato scritto dal server; i giorni sono solo un conteggio", () => {
  const now = new Date("2027-03-18T10:00:00");
  assert.deepEqual(
    describeDueDate(payment({ status: "Scaduto", dueDate: "2027-03-14" }), now),
    { label: "Scaduta da 4 giorni", urgent: true },
  );
  // Stessa data, ma il server non la chiama scaduta: nessuna urgenza dedotta dall'orologio.
  const notOverdue = describeDueDate(payment({ dueDate: "2027-03-14" }), now);
  assert.equal(notOverdue.urgent, false);
  assert.match(notOverdue.label, /^Scade il /);
  assert.deepEqual(
    describeDueDate(
      payment({ statusKey: "paid", status: "Pagato", paidAt: "2026-09-04" }),
      now,
    ),
    { label: "Pagata il 4 set 2026", urgent: false },
  );
  assert.deepEqual(describeDueDate(payment({ dueDate: null }), now), {
    label: "Nessuna scadenza",
    urgent: false,
  });
});

test("ricevuta e fattura si abbinano per riferimento, altrimenti per importo e descrizione", () => {
  const doc = (
    overrides: Partial<FamilyFiscalDocument>,
  ): FamilyFiscalDocument => ({
    id: "r1",
    kind: "receipt",
    number: "R-2027-0001",
    issueDate: "2027-03-20",
    amount: 120,
    description: "Rata di marzo",
    status: "issued",
    statusLabel: "Emessa",
    athleteId: null,
    athleteName: null,
    downloadPath: "/api/parent-dashboard/a/receipts/r1",
    ...overrides,
  });
  const byReference = findFiscalDocumentsForPayment(
    payment({ reference: "R-2027-0001", amount: 999, description: "altro" }),
    [doc({})],
  );
  assert.equal(byReference.receipt?.id, "r1");
  assert.equal(byReference.invoice, null);

  const byMatch = findFiscalDocumentsForPayment(payment({}), [
    doc({ id: "i1", kind: "invoice", number: "F-1" }),
    doc({ id: "x", amount: 130 }),
  ]);
  assert.equal(byMatch.invoice?.id, "i1");
  assert.equal(byMatch.receipt, null);
});

test("l'identita del piano viene da data.planName/planId e installmentLabel (payload reale); `type` e il metodo e resta solo come ultimo ripiego", () => {
  const real = payment({
    id: "r",
    type: "Bonifico",
    description: "Quota annuale pro-rata - Pagamento unico",
    data: {
      planId: "plan_1787857047458",
      planName: "Quota annuale pro-rata",
      installmentLabel: "Pagamento unico",
    },
  });
  assert.deepEqual(resolvePaymentPlanIdentity(real), {
    key: "plan_1787857047458",
    name: "Quota annuale pro-rata",
    instalmentLabel: "Pagamento unico",
  });
  // Stesso piano, metodo diverso: stanno insieme nel piano rate.
  const sibling = payment({
    id: "s",
    type: "Contanti",
    dueDate: "2026-12-10",
    data: { planId: "plan_1787857047458", installmentLabel: "Rata 2" },
  });
  assert.deepEqual(
    resolvePaymentPlanInstalments([sibling, real], real).map((i) => i.id),
    ["r", "s"],
  );
  // Riga legacy senza `data`: il ripiego e `type`, come prima.
  assert.equal(
    resolvePaymentPlanIdentity(payment({ type: "Quota stagionale 2026/27" }))
      .name,
    "Quota stagionale 2026/27",
  );
});

test("la ricevuta intitolata dal server 'Ricevuta <descrizione della rata>' si abbina alla rata (stesso importo)", () => {
  const found = findFiscalDocumentsForPayment(
    payment({
      description: "Quota annuale pro-rata - Pagamento unico",
      amount: 481.32,
      reference: "enrollment_plan:x:plan:2026-09-11:y",
    }),
    [
      {
        id: "r1",
        kind: "receipt",
        number: "R-2026-0001",
        issueDate: "2026-09-11",
        amount: 481.32,
        description: "Ricevuta Quota annuale pro-rata - Pagamento unico",
        status: "issued",
        statusLabel: "Emessa",
        athleteId: null,
        athleteName: null,
        downloadPath: "/api/v1/documents/receipt/r1",
      },
    ],
  );
  assert.equal(found.receipt?.id, "r1");
});
