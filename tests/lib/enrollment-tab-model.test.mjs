import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInstallmentLedgers,
  findNextInstallment,
  resolveEnrollmentPaymentState,
  shouldExpandInstallments,
  summarizeLedgers,
  ENROLLMENT_PAYMENT_STATE_LABELS,
} from "../../src/lib/payments/installment-ledger.ts";

/**
 * La scheda «Iscrizione»: cosa mostrare in cima, e perche (ADR-0056).
 *
 * La domanda a cui la scheda deve rispondere in pochi secondi e sempre la
 * stessa: **qual e la prossima cosa da fare**. Farla trovare scorrendo quattro
 * righe uguali e confrontando quattro date significa chiedere a chi legge un
 * lavoro che il programma sa gia fare.
 *
 * Come per tutto Payments V2, niente qui **scrive** uno stato: lo stato
 * dell'iscrizione, come quello di una rata, e una conseguenza degli importi.
 */

const OGGI = new Date("2026-10-15T12:00:00Z");

const rata = (id, amount, dueDate, overrides = {}) => ({
  id,
  organization_id: "club-a",
  athlete_id: "atleta-1",
  description: `Quota annuale - ${id}`,
  amount,
  due_date: dueDate,
  paid_at: null,
  status: "pending",
  ...overrides,
});

const incasso = (paymentId, amount, paidAt = "2026-09-01T10:00:00.000Z") => ({
  id: `mov-${paymentId}-${amount}`,
  organization_id: "club-a",
  athlete_id: "atleta-1",
  payment_id: paymentId,
  amount,
  paid_at: paidAt,
  payment_method: "Contanti",
  source: "MANUAL",
});

const ledgersOf = (charges, transactions = []) =>
  buildInstallmentLedgers({ charges, transactions, now: OGGI });

/* ------------------------------------------- lo stato dell'iscrizione */

test("senza rate non c'e un piano, e si dice", () => {
  assert.equal(resolveEnrollmentPaymentState([]), "no_plan");
  assert.equal(
    ENROLLMENT_PAYMENT_STATE_LABELS.no_plan,
    "NESSUN PIANO",
  );
});

test("con rate e nessun incasso l'iscrizione e da pagare", () => {
  const ledgers = ledgersOf([
    rata("r1", 130, "2026-09-30T00:00:00.000Z"),
    rata("r2", 130, "2026-11-30T00:00:00.000Z"),
  ]);

  assert.equal(resolveEnrollmentPaymentState(ledgers), "pending");
});

test("un incasso parziale rende l'iscrizione parzialmente pagata", () => {
  const ledgers = ledgersOf(
    [rata("r1", 130, "2026-09-30T00:00:00.000Z")],
    [incasso("r1", 50)],
  );

  assert.equal(resolveEnrollmentPaymentState(ledgers), "partial");
  assert.equal(
    ENROLLMENT_PAYMENT_STATE_LABELS.partial,
    "PARZIALMENTE PAGATO",
  );
});

test("saldate tutte le rate l'iscrizione e completata", () => {
  const ledgers = ledgersOf(
    [
      rata("r1", 130, "2026-09-30T00:00:00.000Z"),
      rata("r2", 70, "2026-11-30T00:00:00.000Z"),
    ],
    [incasso("r1", 130), incasso("r2", 70)],
  );

  assert.equal(resolveEnrollmentPaymentState(ledgers), "paid");
  assert.equal(summarizeLedgers(ledgers).residualAmount, 0);
});

test("lo stato dell'iscrizione si ricava, non si scrive", () => {
  /*
    La riga porta `status: "pending"` anche quando e stata saldata: e il campo
    che ADR-0036 ha smesso di leggere. Se questo test passasse leggendolo,
    l'intero registro tornerebbe una dichiarazione.
  */
  const ledgers = ledgersOf(
    [rata("r1", 130, "2026-09-30T00:00:00.000Z", { status: "pending" })],
    [incasso("r1", 130)],
  );

  assert.equal(resolveEnrollmentPaymentState(ledgers), "paid");
});

/* ---------------------------------------------------- la prossima rata */

test("la prossima rata e la piu vecchia fra quelle scadute", () => {
  const ledgers = ledgersOf([
    rata("r1", 130, "2026-09-30T00:00:00.000Z"),
    rata("r2", 130, "2026-08-31T00:00:00.000Z"),
    rata("r3", 130, "2026-12-31T00:00:00.000Z"),
  ]);

  assert.equal(findNextInstallment(ledgers).installmentId, "r2");
});

test("senza scadute e la prima ancora scoperta per scadenza", () => {
  const ledgers = ledgersOf(
    [
      rata("r1", 130, "2026-11-30T00:00:00.000Z"),
      rata("r2", 130, "2026-12-31T00:00:00.000Z"),
    ],
    [],
  );

  assert.equal(findNextInstallment(ledgers).installmentId, "r1");
});

test("una rata saldata non e la prossima cosa da fare", () => {
  const ledgers = ledgersOf(
    [
      rata("r1", 130, "2026-09-30T00:00:00.000Z"),
      rata("r2", 130, "2026-11-30T00:00:00.000Z"),
    ],
    [incasso("r1", 130)],
  );

  assert.equal(findNextInstallment(ledgers).installmentId, "r2");
});

test("una rata parziale resta la prossima finche non e saldata", () => {
  const ledgers = ledgersOf(
    [rata("r1", 130, "2026-11-30T00:00:00.000Z")],
    [incasso("r1", 50)],
  );

  const next = findNextInstallment(ledgers);

  assert.equal(next.installmentId, "r1");
  assert.equal(next.paidAmount, 50);
  assert.equal(next.residualAmount, 80);
  assert.ok(next.statusLabels.includes("PARZIALMENTE PAGATA"));
});

test("saldate tutte le rate non c'e nessuna prossima rata", () => {
  const ledgers = ledgersOf(
    [rata("r1", 130, "2026-09-30T00:00:00.000Z")],
    [incasso("r1", 130)],
  );

  assert.equal(
    findNextInstallment(ledgers),
    null,
    "niente da incassare, nessun pulsante: una CTA che non porta da nessuna parte e peggio della sua assenza",
  );
});

test("una rata senza scadenza non scavalca quelle datate", () => {
  const ledgers = ledgersOf([
    rata("senza", 50, null),
    rata("r1", 130, "2026-12-31T00:00:00.000Z"),
  ]);

  assert.equal(
    findNextInstallment(ledgers).installmentId,
    "r1",
    "cio che nessuno ha ancora deciso quando incassare non e urgente",
  );
});

test("senza rate non c'e prossima rata", () => {
  assert.equal(findNextInstallment([]), null);
});

/* ------------------------------------ quando le rate meritano di aprirsi */

test("le rate restano chiuse quando non c'e niente di anomalo", () => {
  const ledgers = ledgersOf([
    rata("r1", 130, "2026-11-30T00:00:00.000Z"),
    rata("r2", 130, "2026-12-31T00:00:00.000Z"),
  ]);

  assert.equal(shouldExpandInstallments(summarizeLedgers(ledgers)), false);
});

test("una rata scaduta apre la sezione da sola", () => {
  const ledgers = ledgersOf([rata("r1", 130, "2026-08-31T00:00:00.000Z")]);

  assert.equal(shouldExpandInstallments(summarizeLedgers(ledgers)), true);
});

test("un pagamento parziale apre la sezione da sola", () => {
  const ledgers = ledgersOf(
    [rata("r1", 130, "2026-12-31T00:00:00.000Z")],
    [incasso("r1", 50)],
  );

  assert.equal(shouldExpandInstallments(summarizeLedgers(ledgers)), true);
});

test("senza totali la sezione resta chiusa", () => {
  assert.equal(shouldExpandInstallments(null), false);
});

/* -------------------------------------- lo scenario della specifica */

test("scenario 650 / 300 / 350: un riepilogo solo, e la rata giusta in cima", () => {
  const ledgers = ledgersOf(
    [
      rata("r1", 130, "2026-09-30T00:00:00.000Z"),
      rata("r2", 130, "2026-11-30T00:00:00.000Z"),
      rata("r3", 195, "2026-12-31T00:00:00.000Z"),
      rata("r4", 195, "2027-01-31T00:00:00.000Z"),
    ],
    [incasso("r1", 130), incasso("r2", 130), incasso("r3", 40)],
  );

  const totals = summarizeLedgers(ledgers);

  assert.equal(totals.dueAmount, 650);
  assert.equal(totals.paidAmount, 300);
  assert.equal(totals.residualAmount, 350);
  assert.equal(resolveEnrollmentPaymentState(ledgers, totals), "partial");

  const next = findNextInstallment(ledgers);

  assert.equal(next.installmentId, "r3", "la prima ancora scoperta");
  assert.equal(next.paidAmount, 40);
  assert.equal(next.residualAmount, 155);
  assert.equal(
    shouldExpandInstallments(totals),
    true,
    "c'e un parziale: le rate si aprono da sole",
  );
});
