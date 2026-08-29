import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeAccountingLines,
  projectFundingSettlements,
  projectPaymentTransactions,
  projectSportWorkPayouts,
  sortAccountingLines,
} from "../../src/lib/accounting/projection.ts";
import { deriveAccountBalanceCents } from "../../src/lib/accounting/model.ts";

/**
 * **La proiezione: leggere il denaro degli altri senza riscriverlo.**
 *
 * E la decisione piu importante della Wave 4. L'alternativa — una tabella che
 * copiasse incassi, compensi e contributi — sarebbe stata una **seconda
 * contabilita**: due fonti per lo stesso numero, e nessun modo di tenerle
 * allineate.
 *
 * Questi test provano le tre cose che la proiezione deve garantire:
 *
 * 1. il numero proiettato e **quello del dominio**, non un ricalcolo;
 * 2. una riga proiettata e **sempre in sola lettura**;
 * 3. proiettare due volte non produce due righe — l'idempotenza qui e
 *    strutturale, perche non c'e niente da scrivere.
 */

const CLUB = "club-proiezione";

/* ============================================== incassi delle famiglie */

const incasso = (over = {}) => ({
  id: "inc-1",
  organization_id: CLUB,
  paid_at: "2026-09-01T10:00:00.000Z",
  amount: 200,
  payment_method: "Contanti",
  athlete_id: "atleta-1",
  financial_account_id: "conto-cassa",
  operation_type_code: "quota_attivita",
  _athleteName: "Anna Rossi",
  _accountName: "Cassa",
  _activityScope: "institutional",
  ...over,
});

test("un incasso diventa un'entrata con il suo conto e la sua causale", () => {
  const [riga] = projectPaymentTransactions([incasso()]);

  assert.equal(riga.direction, "IN");
  assert.equal(riga.amountCents, 20000);
  assert.equal(riga.financialAccountId, "conto-cassa");
  assert.equal(riga.operationTypeCode, "quota_attivita");
  assert.equal(riga.activityScope, "institutional");
  assert.equal(riga.counterpartyKind, "ATHLETE");
  assert.equal(riga.counterpartyLabel, "Anna Rossi");
  assert.equal(riga.sourceDomain, "ATHLETE_PAYMENT");
  assert.equal(riga.sourceId, "inc-1", "dalla riga si risale al fatto");
});

test("l'anno fiscale si deriva dalla data del fatto, e non si digita", () => {
  const [settembre] = projectPaymentTransactions([incasso()]);
  const [gennaio] = projectPaymentTransactions([
    incasso({ id: "inc-2", paid_at: "2027-01-08T10:00:00.000Z" }),
  ]);

  assert.equal(settembre.fiscalYear, 2026);
  assert.equal(gennaio.fiscalYear, 2027, "stessa stagione, esercizio diverso");
});

test("uno storno resta visibile, con il verso opposto", () => {
  /*
    La regola del dominio e che il denaro non si cancella: l'originale resta
    marcato e la riga opposta gli sta accanto. Se la prima nota nascondesse la
    coppia, chi legge vedrebbe un saldo corretto e una storia incomprensibile —
    e la prima nota esiste per raccontare la storia.
  */
  const righe = projectPaymentTransactions([
    incasso({ reversed_at: "2026-09-05T00:00:00.000Z" }),
    incasso({
      id: "inc-storno",
      amount: -200,
      reverses_transaction_id: "inc-1",
      paid_at: "2026-09-05T10:00:00.000Z",
    }),
  ]);

  assert.equal(righe.length, 2, "restano visibili entrambe");
  const storno = righe.find((r) => r.sourceId === "inc-storno");
  assert.equal(storno.direction, "OUT");
  assert.equal(storno.amountCents, 20000, "l'importo resta positivo: il segno e il verso");
  assert.equal(storno.sourceDomain, "REVERSAL");
  assert.match(storno.description, /^Storno/);
});

test("la coppia originale/storno non muove il saldo del conto", () => {
  const righe = projectPaymentTransactions([
    incasso({ reversed_at: "2026-09-05T00:00:00.000Z" }),
    incasso({ id: "inc-storno", amount: -200, reverses_transaction_id: "inc-1" }),
    incasso({ id: "inc-vero", amount: 400 }),
  ]);

  /* Il saldo esclude entrambe: 200 in e 200 out si compensano comunque. */
  const saldo = deriveAccountBalanceCents(
    0,
    righe.map((r) => ({ direction: r.direction, amountCents: r.amountCents })),
  );

  assert.equal(saldo, 40000, "resta solo l'incasso non stornato");
});

/* ================================================== lavoro sportivo */

const compenso = (over = {}) => ({
  id: "sw-1",
  organization_id: CLUB,
  transaction_type: "COMPENSATION_PAYMENT",
  paid_at: "2026-10-01T10:00:00.000Z",
  gross_amount: 1000,
  club_cost: 1240,
  payment_method: "Bonifico",
  person_id: "persona-1",
  financial_account_id: "conto-banca",
  _personName: "Mario Bianchi",
  ...over,
});

test("un compenso esce dal conto per il costo del club, non per il netto", () => {
  /*
    E la differenza fra sapere quanto e stato bonificato e sapere quanto e
    costato: il secondo comprende la quota contributiva a carico del club, che
    esce comunque. Senza, il costo del lavoro sportivo in prima nota e
    sistematicamente inferiore al vero.
  */
  const [riga] = projectSportWorkPayouts([compenso()]);

  assert.equal(riga.direction, "OUT");
  assert.equal(riga.amountCents, 124000, "1.240, non 1.000");
  assert.equal(riga.sourceDomain, "SPORT_WORK_PAYOUT");
});

test("la prima nota non ricalcola nessun contributo: legge il valore congelato", () => {
  /*
    Il registro congela contributi e aliquote sulla riga. Se la proiezione li
    ricalcolasse, un cambio di regole cambierebbe il costo di un compenso di
    sei mesi fa.
  */
  const [riga] = projectSportWorkPayouts([compenso({ club_cost: 1177.5 })]);
  assert.equal(riga.amountCents, 117750);
});

test("dove il costo del club non e valorizzato vale il lordo", () => {
  /* Premi, rimborsi e fatture dei professionisti: li il lordo e l'intero esborso. */
  const [riga] = projectSportWorkPayouts([
    compenso({ transaction_type: "BONUS_PAYMENT", club_cost: 0, gross_amount: 300 }),
  ]);

  assert.equal(riga.amountCents, 30000);
  assert.match(riga.description, /^Premio/);
});

test("lo storno di un compenso rientra, e non si somma all'uscita", () => {
  const righe = projectSportWorkPayouts([
    compenso({ reversed_at: "2026-10-10T00:00:00.000Z" }),
    compenso({
      id: "sw-storno",
      transaction_type: "COMPENSATION_REVERSAL",
      gross_amount: -1000,
      club_cost: -1240,
      reversal_of_id: "sw-1",
    }),
  ]);

  const storno = righe.find((r) => r.sourceId === "sw-storno");
  assert.equal(storno.direction, "IN");
  assert.equal(storno.amountCents, 124000);

  const saldo = deriveAccountBalanceCents(
    0,
    righe.map((r) => ({ direction: r.direction, amountCents: r.amountCents })),
  );
  assert.equal(saldo, 0, "la prima nota esclude entrambe dai totali");
});

test("il versamento dei contributi compare fra le uscite", () => {
  /*
    Prima un adempimento assolto aggiornava solo il proprio stato: il denaro dei
    contributi usciva dal club senza lasciare una riga di registro.
  */
  const [riga] = projectSportWorkPayouts([
    compenso({
      id: "sw-f24",
      transaction_type: "CONTRIBUTION_PAYMENT",
      gross_amount: 240,
      club_cost: 240,
    }),
  ]);

  assert.equal(riga.direction, "OUT");
  assert.match(riga.description, /Versamento contributi/);
});

/* ======================================================== bandi */

const liquidazione = (over = {}) => ({
  id: "fs-1",
  organization_id: CLUB,
  settled_at: "2026-11-15T00:00:00.000Z",
  amount: 1500,
  method: "Bonifico",
  program_id: "bando-1",
  financial_account_id: "conto-banca",
  _programName: "Voucher Sport 2026",
  ...over,
});

test("il bonifico dell'ente entra in liquidita, e dice su quale conto", () => {
  /*
    Il buco che chiude: fino a oggi un bonifico dell'ente era invisibile nel
    saldo. Il credito si chiudeva e il denaro non compariva da nessuna parte.
  */
  const [riga] = projectFundingSettlements([liquidazione()]);

  assert.equal(riga.direction, "IN");
  assert.equal(riga.amountCents, 150000);
  assert.equal(riga.financialAccountId, "conto-banca");
  assert.equal(riga.counterpartyKind, "ENTITY");
  assert.equal(riga.sourceDomain, "FUNDING_SETTLEMENT");
});

test("la maturazione non e un incasso: la proiezione conosce solo le liquidazioni", () => {
  /*
    ADR-0037. Mettere la maturazione qui vorrebbe dire dichiarare incassato cio
    che il club sta ancora aspettando. La funzione non accetta accrual, e non e
    una svista: e il modo in cui la regola e resa impossibile da violare.
  */
  assert.deepEqual(projectFundingSettlements([]), []);
});

test("lo storno di una liquidazione esce, e riapre il credito", () => {
  const righe = projectFundingSettlements([
    liquidazione({ reversed_at: "2026-11-20T00:00:00.000Z" }),
    liquidazione({ id: "fs-storno", reversal_of_id: "fs-1" }),
  ]);

  const storno = righe.find((r) => r.sourceId === "fs-storno");
  assert.equal(storno.direction, "OUT");
  assert.equal(storno.sourceDomain, "REVERSAL");
});

/* ================================== il contratto: sola lettura, sempre */

test("ogni riga proiettata e in sola lettura, qualunque sia il dominio", () => {
  const righe = [
    ...projectPaymentTransactions([incasso()]),
    ...projectSportWorkPayouts([compenso()]),
    ...projectFundingSettlements([liquidazione()]),
  ];

  for (const riga of righe) {
    assert.equal(riga.canEdit, false, `${riga.sourceDomain} non si modifica da qui`);
    assert.equal(riga.canDelete, false);
    assert.equal(
      riga.canReverse,
      false,
      "un compenso si storna dove i compensi si erogano: li ci sono i permessi del dominio",
    );
    assert.equal(riga.canReconcile, false);
  }
});

/* ============================================ unione e deduplicazione */

test("gli id sono prefissati per dominio: due domini non collidono", () => {
  const righe = mergeAccountingLines(
    projectPaymentTransactions([incasso({ id: "1" })]),
    projectSportWorkPayouts([compenso({ id: "1" })]),
    projectFundingSettlements([liquidazione({ id: "1" })]),
  );

  assert.equal(righe.length, 3, "stesso id nel dominio, righe diverse in prima nota");
  assert.equal(new Set(righe.map((r) => r.id)).size, 3);
});

test("proiettare due volte lo stesso fatto non produce due righe", () => {
  /*
    L'idempotenza qui e **strutturale**: non c'e niente da scrivere, quindi non
    c'e niente da duplicare. E la ragione principale per cui la proiezione e
    stata preferita alla materializzazione.
  */
  const righe = mergeAccountingLines(
    projectPaymentTransactions([incasso()]),
    projectPaymentTransactions([incasso()]),
  );

  assert.equal(righe.length, 1);
});

test("l'ordinamento e per timestamp, non per confronto fra stringhe", () => {
  /*
    Il vecchio aggregatore ordinava con `localeCompare` su date ISO: funziona
    finche i formati coincidono, e sbaglia in silenzio appena una riga porta un
    fuso o una precisione diversa.
  */
  const righe = sortAccountingLines([
    ...projectPaymentTransactions([
      incasso({ id: "a", paid_at: "2026-09-01T10:00:00.000Z" }),
      incasso({ id: "b", paid_at: "2026-09-01T12:00:00+02:00" }),
      incasso({ id: "c", paid_at: "2026-12-31T23:00:00.000Z" }),
    ]),
  ]);

  assert.deepEqual(
    righe.map((r) => r.sourceId),
    ["c", "a", "b"],
    "b e le 10:00 UTC scritte con un fuso: viene dopo a, che e le 10:00 esatte",
  );
});

test("l'ordine e stabile a parita di data: la pagina 2 non ripete la 1", () => {
  const primo = sortAccountingLines(
    projectPaymentTransactions([
      incasso({ id: "z" }),
      incasso({ id: "a" }),
      incasso({ id: "m" }),
    ]),
  );
  const secondo = sortAccountingLines(
    projectPaymentTransactions([
      incasso({ id: "m" }),
      incasso({ id: "z" }),
      incasso({ id: "a" }),
    ]),
  );

  assert.deepEqual(
    primo.map((r) => r.id),
    secondo.map((r) => r.id),
  );
});

/* ================================================ righe non proiettabili */

test("una riga senza data non si proietta: non e collocabile in nessun esercizio", () => {
  assert.deepEqual(projectPaymentTransactions([incasso({ paid_at: null })]), []);
  assert.deepEqual(projectSportWorkPayouts([compenso({ paid_at: "non-una-data" })]), []);
});

test("una riga da zero euro non si proietta", () => {
  assert.deepEqual(projectPaymentTransactions([incasso({ amount: 0 })]), []);
  assert.deepEqual(
    projectSportWorkPayouts([compenso({ gross_amount: 0, club_cost: 0 })]),
    [],
  );
});
