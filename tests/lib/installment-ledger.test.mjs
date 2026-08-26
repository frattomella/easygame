import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInstallmentLedgers,
  findChargeForPlanInstallment,
  isSettledTransaction,
  normalizePaymentTransaction,
  normalizePaymentTransactions,
  resolveInstallmentLedger,
  resolveLedgerState,
  sortTransactionsChronologically,
  summarizeLedgers,
  sumSettledTransactions,
  validateOnlinePaymentAmount,
  validatePaymentTransactionInput,
} from "../../src/lib/payments/installment-ledger.ts";

/**
 * Il registro incassi (Workstream A, ADR-0036).
 *
 * Quello che va dimostrato e una cosa sola, declinata in molti modi: **lo
 * stato di una rata non e un dato che qualcuno scrive, e una conseguenza degli
 * importi**. Se un test qui passasse per via di un campo `status` letto dalla
 * riga invece che dalla somma dei movimenti, la regressione tornerebbe senza
 * che nessuno se ne accorga.
 */

const OGGI = new Date("2026-08-25T12:00:00Z");

const rata = (overrides = {}) => ({
  id: "rata-1",
  organization_id: "club-a",
  athlete_id: "atleta-1",
  description: "Quota annuale - Rata 1",
  amount: 130,
  due_date: "2026-09-30T00:00:00.000Z",
  paid_at: null,
  status: "pending",
  data: { installmentId: "plan-rata-1", installmentLabel: "Rata 1" },
  ...overrides,
});

const incasso = (overrides = {}) => ({
  id: `mov-${overrides.amount ?? 0}-${overrides.paid_at ?? ""}`,
  organization_id: "club-a",
  athlete_id: "atleta-1",
  payment_id: "rata-1",
  amount: 50,
  paid_at: "2026-08-01T10:00:00.000Z",
  payment_method: "Contanti",
  source: "MANUAL",
  ...overrides,
});

const ledgerOf = (charge, incassi, now = OGGI) =>
  resolveInstallmentLedger({
    charge,
    transactions: normalizePaymentTransactions(incassi),
    now,
  });

// --- pagamento totale --------------------------------------------------------

test("una rata senza incassi e in attesa, con residuo pari al dovuto", () => {
  const ledger = ledgerOf(rata(), []);

  assert.equal(ledger.dueAmount, 130);
  assert.equal(ledger.paidAmount, 0);
  assert.equal(ledger.residualAmount, 130);
  assert.equal(ledger.state, "pending");
  assert.deepEqual(ledger.statusLabels, ["IN ATTESA"]);
  assert.equal(ledger.progress, 0);
});

test("un incasso pari al dovuto salda la rata senza toccare nessuno stato", () => {
  const ledger = ledgerOf(rata(), [incasso({ amount: 130 })]);

  assert.equal(ledger.paidAmount, 130);
  assert.equal(ledger.residualAmount, 0);
  assert.equal(ledger.state, "paid");
  assert.deepEqual(ledger.statusLabels, ["PAGATA"]);
  assert.equal(ledger.progress, 1);
});

// --- pagamento parziale ------------------------------------------------------

test("l'esempio della richiesta: 50 su 130 lascia 80 di residuo", () => {
  const ledger = ledgerOf(rata(), [incasso({ amount: 50 })]);

  assert.equal(ledger.paidAmount, 50);
  assert.equal(ledger.residualAmount, 80);
  assert.equal(ledger.state, "partial");
  assert.deepEqual(ledger.statusLabels, ["PARZIALMENTE PAGATA"]);
});

// --- pagamenti multipli ------------------------------------------------------

test("tre incassi con tre metodi diversi saldano la stessa rata", () => {
  const ledger = ledgerOf(rata(), [
    incasso({ id: "m1", amount: 50, payment_method: "Contanti", paid_at: "2026-08-01T10:00:00.000Z" }),
    incasso({ id: "m2", amount: 30, payment_method: "POS", paid_at: "2026-08-05T10:00:00.000Z" }),
    incasso({ id: "m3", amount: 50, payment_method: "Bonifico", paid_at: "2026-08-10T10:00:00.000Z" }),
  ]);

  assert.equal(ledger.paidAmount, 130);
  assert.equal(ledger.residualAmount, 0);
  assert.equal(ledger.state, "paid");
  assert.equal(ledger.transactions.length, 3);
  assert.deepEqual(
    ledger.transactions.map((movimento) => movimento.paymentMethod),
    ["Contanti", "POS", "Bonifico"],
  );
});

test("gli importi si sommano in centesimi, non in virgola mobile", () => {
  const ledger = ledgerOf(rata({ amount: 0.3 }), [
    incasso({ id: "m1", amount: 0.1 }),
    incasso({ id: "m2", amount: 0.2 }),
  ]);

  assert.equal(ledger.paidAmount, 0.3);
  assert.equal(ledger.residualAmount, 0);
  assert.equal(
    ledger.state,
    "paid",
    "0.1 + 0.2 in virgola mobile lascerebbe la rata scoperta di un millesimo",
  );
});

// --- scadenza ----------------------------------------------------------------

test("una rata scaduta e ancora scoperta porta entrambe le informazioni", () => {
  const ledger = ledgerOf(
    rata({ due_date: "2026-07-01T00:00:00.000Z" }),
    [incasso({ amount: 50 })],
  );

  assert.equal(ledger.overdue, true);
  assert.deepEqual(ledger.statusLabels, ["PARZIALMENTE PAGATA", "SCADUTA"]);
});

test("una rata saldata dopo la scadenza non e piu scaduta", () => {
  const ledger = ledgerOf(
    rata({ due_date: "2026-07-01T00:00:00.000Z" }),
    [incasso({ amount: 130 })],
  );

  assert.equal(ledger.overdue, false);
  assert.deepEqual(ledger.statusLabels, ["PAGATA"]);
});

test("una rata senza scadenza non e mai scaduta", () => {
  const ledger = ledgerOf(rata({ due_date: null }), []);
  assert.equal(ledger.overdue, false);
});

// --- storni ------------------------------------------------------------------

test("un incasso stornato non conta piu, ma resta nello storico", () => {
  const ledger = ledgerOf(rata(), [
    incasso({
      id: "m1",
      amount: 50,
      reversed_at: "2026-08-06T09:00:00.000Z",
      reversal_reason: "Importo sbagliato",
    }),
    incasso({
      id: "m2",
      amount: -50,
      paid_at: "2026-08-06T09:00:00.000Z",
      reverses_transaction_id: "m1",
    }),
  ]);

  assert.equal(ledger.paidAmount, 0);
  assert.equal(ledger.residualAmount, 130);
  assert.equal(ledger.state, "pending");
  assert.equal(
    ledger.transactions.length,
    2,
    "storno e originale restano visibili: un incasso non sparisce in silenzio",
  );
});

test("uno storno seguito da un nuovo incasso lascia il saldo corretto", () => {
  const ledger = ledgerOf(rata(), [
    incasso({ id: "m1", amount: 500, reversed_at: "2026-08-06T09:00:00.000Z" }),
    incasso({ id: "m2", amount: -500, reverses_transaction_id: "m1" }),
    incasso({ id: "m3", amount: 50, paid_at: "2026-08-07T09:00:00.000Z" }),
  ]);

  assert.equal(ledger.paidAmount, 50);
  assert.equal(ledger.residualAmount, 80);
});

test("isSettledTransaction esclude sia lo stornato sia lo storno", () => {
  const originale = normalizePaymentTransaction(
    incasso({ id: "m1", reversed_at: "2026-08-06T09:00:00.000Z" }),
  );
  const storno = normalizePaymentTransaction(
    incasso({ id: "m2", reverses_transaction_id: "m1" }),
  );
  const valido = normalizePaymentTransaction(incasso({ id: "m3" }));

  assert.equal(isSettledTransaction(originale), false);
  assert.equal(isSettledTransaction(storno), false);
  assert.equal(isSettledTransaction(valido), true);
  assert.equal(sumSettledTransactions([originale, storno, valido]), 50);
});

// --- compatibilita con i dati esistenti --------------------------------------

test("una rata gia marcata pagata, senza movimenti, resta pagata", () => {
  const ledger = ledgerOf(
    rata({ status: "paid", paid_at: "2026-07-15T00:00:00.000Z" }),
    [],
  );

  assert.equal(
    ledger.paidAmount,
    130,
    "i pagamenti registrati prima del registro non vengono riscritti",
  );
  assert.equal(ledger.state, "paid");
});

test("appena esiste un incasso, comanda il registro e non piu il campo stato", () => {
  const ledger = ledgerOf(
    rata({ status: "paid", paid_at: "2026-07-15T00:00:00.000Z" }),
    [incasso({ amount: 50 })],
  );

  assert.equal(ledger.paidAmount, 50);
  assert.equal(ledger.state, "partial");
});

test("una rata annullata non e un debito e non ha residuo incassabile", () => {
  const ledger = ledgerOf(
    rata({ status: "cancelled", data: { excludedFromTotals: true } }),
    [],
  );

  assert.equal(ledger.paidAmount, 0);
  assert.equal(ledger.overdue, false);
});

// --- ordine cronologico ------------------------------------------------------

test("gli incassi di una rata si leggono dal piu vecchio al piu recente", () => {
  const ordinati = sortTransactionsChronologically(
    normalizePaymentTransactions([
      incasso({ id: "m3", paid_at: "2026-08-10T10:00:00.000Z" }),
      incasso({ id: "m1", paid_at: "2026-08-01T10:00:00.000Z" }),
      incasso({ id: "m2", paid_at: "2026-08-05T10:00:00.000Z" }),
    ]),
  );

  assert.deepEqual(
    ordinati.map((movimento) => movimento.id),
    ["m1", "m2", "m3"],
  );
});

// --- normalizzazione ---------------------------------------------------------

test("le due grafie del payload arrivano alla stessa forma", () => {
  const daDatabase = normalizePaymentTransaction({
    id: "m1",
    payment_id: "rata-1",
    payment_method: "POS",
    external_reference: "TRX-1",
    amount: "50,00",
  });
  const daClient = normalizePaymentTransaction({
    id: "m1",
    paymentId: "rata-1",
    paymentMethod: "POS",
    externalReference: "TRX-1",
    amount: 50,
  });

  assert.equal(daDatabase.installmentId, daClient.installmentId);
  assert.equal(daDatabase.paymentMethod, daClient.paymentMethod);
  assert.equal(daDatabase.externalReference, daClient.externalReference);
  assert.equal(daDatabase.amount, 50);
});

test("una sorgente sconosciuta ricade su MANUAL invece di inventarsi un canale", () => {
  assert.equal(normalizePaymentTransaction({ id: "m", source: "PAYPAL" }).source, "MANUAL");
  assert.equal(normalizePaymentTransaction({ id: "m", source: "stripe" }).source, "STRIPE");
  assert.equal(normalizePaymentTransaction({ id: "m", source: "cedipay" }).source, "CEDIPAY");
});

// --- stato derivato ----------------------------------------------------------

test("lo stato dipende solo da dovuto e incassato", () => {
  assert.equal(resolveLedgerState({ dueAmount: 130, paidAmount: 0 }), "pending");
  assert.equal(resolveLedgerState({ dueAmount: 130, paidAmount: 50 }), "partial");
  assert.equal(resolveLedgerState({ dueAmount: 130, paidAmount: 130 }), "paid");
  assert.equal(resolveLedgerState({ dueAmount: 130, paidAmount: 200 }), "paid");
});

// --- riepilogo ---------------------------------------------------------------

test("il riepilogo somma le rate e conta quelle scadute", () => {
  const ledgers = buildInstallmentLedgers({
    charges: [
      rata({ id: "r1", amount: 130, due_date: "2026-07-01T00:00:00.000Z" }),
      rata({ id: "r2", amount: 130, due_date: "2026-10-01T00:00:00.000Z" }),
    ],
    transactions: [incasso({ id: "m1", payment_id: "r1", amount: 50 })],
    now: OGGI,
  });

  const totali = summarizeLedgers(ledgers);

  assert.equal(totali.dueAmount, 260);
  assert.equal(totali.paidAmount, 50);
  assert.equal(totali.residualAmount, 210);
  assert.equal(totali.overdueCount, 1);
  assert.equal(totali.overdueAmount, 80);
  assert.equal(totali.partialCount, 1);
  assert.equal(totali.pendingCount, 1);
  assert.equal(totali.paidCount, 0);
});

test("le rate si presentano nell'ordine in cui scadono, non in quello di creazione", () => {
  const ledgers = buildInstallmentLedgers({
    charges: [
      rata({ id: "r2", due_date: "2026-10-01T00:00:00.000Z" }),
      rata({ id: "r1", due_date: "2026-09-01T00:00:00.000Z" }),
      rata({ id: "r3", due_date: null }),
    ],
    now: OGGI,
  });

  assert.deepEqual(
    ledgers.map((ledger) => ledger.installmentId),
    ["r1", "r2", "r3"],
  );
});

test("una rata annullata non compare fra le rate dovute", () => {
  const ledgers = buildInstallmentLedgers({
    charges: [
      rata({ id: "r1" }),
      rata({ id: "r2", status: "cancelled", data: { excludedFromTotals: true } }),
    ],
    now: OGGI,
  });

  assert.deepEqual(
    ledgers.map((ledger) => ledger.installmentId),
    ["r1"],
  );
});

test("gli incassi di una rata non finiscono nel registro di un'altra", () => {
  const ledgers = buildInstallmentLedgers({
    charges: [rata({ id: "r1" }), rata({ id: "r2" })],
    transactions: [incasso({ id: "m1", payment_id: "r1", amount: 50 })],
    now: OGGI,
  });

  assert.equal(ledgers[0].paidAmount, 50);
  assert.equal(ledgers[1].paidAmount, 0);
});

// --- legame con la rata del piano --------------------------------------------

test("una rata del piano ritrova la riga che la rappresenta", () => {
  const charges = [rata({ id: "r1" }), rata({ id: "r2", data: { installmentId: "plan-rata-2" } })];

  const trovata = findChargeForPlanInstallment(
    { id: "plan-rata-2", label: "Rata 2" },
    charges,
  );

  assert.equal(trovata.id, "r2");
});

// --- validazione -------------------------------------------------------------

test("un incasso senza importo o senza metodo viene rifiutato con una spiegazione", () => {
  assert.match(
    validatePaymentTransactionInput({ amount: 0, paymentMethod: "Contanti" }),
    /maggiore di zero/i,
  );
  assert.match(
    validatePaymentTransactionInput({ amount: 50, paymentMethod: "" }),
    /metodo di pagamento/i,
  );
});

test("l'importo non puo superare il residuo, a meno che non lo si consenta", () => {
  const ledger = ledgerOf(rata(), [incasso({ amount: 50 })]);

  assert.match(
    validatePaymentTransactionInput({
      amount: 100,
      paymentMethod: "Contanti",
      ledger,
    }),
    /supera il residuo/i,
  );
  assert.equal(
    validatePaymentTransactionInput({
      amount: 80,
      paymentMethod: "Contanti",
      ledger,
    }),
    null,
  );
  assert.equal(
    validatePaymentTransactionInput({
      amount: 100,
      paymentMethod: "Contanti",
      ledger,
      allowOverpayment: true,
    }),
    null,
  );
});

/* ------------------------------------------------- l'importo di un online */

/**
 * L'acconto **online** era l'unico impossibile.
 *
 * Il registro sa gestire una rata pagata in piu volte da sempre, e il server
 * accettava gia un importo parziale: l'unico punto in cui l'acconto non si
 * poteva fare era il canale che una famiglia usa da sola, di sera, senza poter
 * chiamare la segreteria. Il canale manuale era piu flessibile di quello
 * automatico, che e il verso sbagliato.
 */

const rataDa130 = () =>
  resolveInstallmentLedger({
    charge: { id: "r1", amount: 130, description: "Rata unica", data: {} },
    transactions: [],
  });

test("online: l'importo e precompilabile con il residuo e accetta un acconto", () => {
  const ledger = rataDa130();

  assert.equal(validateOnlinePaymentAmount({ amount: 130, ledger }), null);
  assert.equal(validateOnlinePaymentAmount({ amount: 50, ledger }), null);
  assert.equal(validateOnlinePaymentAmount({ amount: 0.01, ledger }), null);
});

test("online: non si puo pagare piu del residuo", () => {
  /*
    E l'unica asimmetria voluta rispetto al canale manuale. Quello accetta un
    incasso superiore perche puo essere **gia successo** — denaro arrivato allo
    sportello mentre qualcun altro registrava. Online il pagamento non e ancora
    avvenuto: farlo partire per piu del dovuto creerebbe il credito invece di
    registrarlo, e a scoprirlo sarebbe la famiglia sull'estratto conto.
  */
  const ledger = rataDa130();

  assert.match(
    validateOnlinePaymentAmount({ amount: 130.01, ledger }),
    /piu del residuo/i,
  );
  assert.match(
    validateOnlinePaymentAmount({ amount: 500, ledger }),
    /piu del residuo/i,
  );
});

test("online: il residuo che conta e quello corrente, non l'importo della rata", () => {
  const ledger = resolveInstallmentLedger({
    charge: { id: "r1", amount: 130, description: "Rata unica", data: {} },
    transactions: normalizePaymentTransactions([
      { id: "t1", amount: 50, paid_at: "2026-08-26T10:00:00.000Z" },
    ]),
  });

  assert.equal(ledger.residualAmount, 80);
  assert.equal(validateOnlinePaymentAmount({ amount: 80, ledger }), null);
  assert.match(
    validateOnlinePaymentAmount({ amount: 100, ledger }),
    /piu del residuo/i,
  );
});

test("online: una rata saldata non si paga", () => {
  const ledger = resolveInstallmentLedger({
    charge: { id: "r1", amount: 130, description: "Rata unica", data: {} },
    transactions: normalizePaymentTransactions([
      { id: "t1", amount: 130, paid_at: "2026-08-26T10:00:00.000Z" },
    ]),
  });

  assert.equal(ledger.residualAmount, 0);
  assert.match(
    validateOnlinePaymentAmount({ amount: 10, ledger }),
    /gia saldata/i,
  );
});

test("online: zero e i valori non numerici vengono rifiutati", () => {
  const ledger = rataDa130();

  for (const amount of [0, -5, "", "abc", null, undefined]) {
    assert.match(
      validateOnlinePaymentAmount({ amount, ledger }),
      /maggiore di zero/i,
      `accettato ${JSON.stringify(amount)}`,
    );
  }
});

test("online: la virgola decimale italiana si accetta", () => {
  /* Chi digita su una tastiera italiana scrive «12,50», non «12.50». */
  assert.equal(
    validateOnlinePaymentAmount({ amount: "12,50", ledger: rataDa130() }),
    null,
  );
});
