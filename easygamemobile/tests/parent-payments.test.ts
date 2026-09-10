import { test } from "node:test";
import assert from "node:assert/strict";

import {
  findFirstPayableParentPayment,
  formatParentCurrency,
  isPayableParentPayment,
  resolveCheckoutAvailability,
  resolvePaymentCardState,
} from "../client/lib/parent-payments";
import type {
  FamilyCheckoutState,
  ParentPayment,
} from "../client/services/api";

const payment = (overrides: Partial<ParentPayment> = {}): ParentPayment => ({
  id: "p1",
  date: "2026-09-01",
  dueDate: "2026-09-01",
  paidAt: null,
  description: "Quota",
  type: "Quota",
  amount: 300,
  status: "Da incassare",
  statusKey: "pending",
  paidAmount: 0,
  source: "athlete_payment",
  ...overrides,
});

test("paid: statusKey paid -> stato 'paid', mai pagabile", () => {
  const p = payment({ statusKey: "paid", status: "Pagato", paidAmount: 300 });
  assert.equal(resolvePaymentCardState(p), "paid");
  assert.equal(isPayableParentPayment(p), false);
});

test("unpaid (pending, nessun acconto) -> stato 'due', pagabile", () => {
  const p = payment();
  assert.equal(resolvePaymentCardState(p), "due");
  assert.equal(isPayableParentPayment(p), true);
});

test("overdue: l'etichetta italiana 'Scaduto' governa lo stato, non una data locale", () => {
  const p = payment({ status: "Scaduto" });
  assert.equal(resolvePaymentCardState(p), "overdue");
  assert.equal(isPayableParentPayment(p), true);
});

test("parzialmente pagato: acconto tra 0 e l'importo totale", () => {
  const p = payment({ paidAmount: 120 });
  assert.equal(resolvePaymentCardState(p), "partially_paid");
});

test("annullato: mai pagabile, stato 'cancelled'", () => {
  const p = payment({ statusKey: "cancelled", status: "Annullato" });
  assert.equal(resolvePaymentCardState(p), "cancelled");
  assert.equal(isPayableParentPayment(p), false);
});

test("importo zero o negativo non e' mai pagabile", () => {
  assert.equal(isPayableParentPayment(payment({ amount: 0 })), false);
});

test("trova la prima rata pagabile nell'ordine del server", () => {
  const items = [
    payment({ id: "a", statusKey: "paid" }),
    payment({ id: "b" }),
    payment({ id: "c" }),
  ];
  assert.equal(findFirstPayableParentPayment(items)?.id, "b");
  assert.equal(
    findFirstPayableParentPayment(
      items.map((i) => ({ ...i, statusKey: "paid" as const })),
    ),
    null,
  );
});

test("checkout: canale attivo ma nessuna rata pagabile -> disabilitato con motivo, non finge disponibilita'", () => {
  const online: FamilyCheckoutState = {
    available: true,
    blocker: null,
    message: "",
  };
  const result = resolveCheckoutAvailability(online, false);
  assert.equal(result.available, false);
  assert.equal(result.blocker, "nothing_due");
});

test("checkout: canale attivo con una rata pagabile resta disponibile", () => {
  const online: FamilyCheckoutState = {
    available: true,
    blocker: null,
    message: "",
  };
  assert.deepEqual(resolveCheckoutAvailability(online, true), online);
});

test("checkout: canale gia non disponibile resta cosi', motivo del server intatto", () => {
  const online: FamilyCheckoutState = {
    available: false,
    blocker: "not_configured",
    message: "Il club non ha attivato i pagamenti online.",
  };
  assert.deepEqual(resolveCheckoutAvailability(online, true), online);
});

test("formato valuta it-IT: virgola decimale, punto delle migliaia, simbolo finale dopo uno spazio insecabile", () => {
  // U+00A0 (spazio insecabile) prima del simbolo, non uno spazio normale —
  // spec PaymentCard v2.2 §C3. Costruito con un escape, non digitato, per
  // non lasciarlo alla sorte di come l'editor tratta i caratteri invisibili.
  const nbsp = " ";
  assert.equal(formatParentCurrency(300), `300,00${nbsp}€`);
  assert.equal(formatParentCurrency(1250), `1.250,00${nbsp}€`);
  assert.equal(formatParentCurrency(0), `0,00${nbsp}€`);
});
