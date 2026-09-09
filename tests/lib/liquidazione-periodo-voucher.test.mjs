import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * **Il ciclo di un periodo si chiude: Previsto → Maturato → Liquidato** (N15).
 *
 * ---
 *
 * ## Cosa fissa questo file
 *
 * Le tre regole pure su cui poggia tutto il resto, e che due consumatori — la
 * schermata che accende il pulsante e il servizio che poi scrive — devono
 * leggere **dalla stessa funzione**. Due stesure divergono, e chi le scopre e
 * la segreteria davanti a un pulsante che promette.
 *
 * 1. **Da ricevere e `maturato − liquidato`**, mai `previsto − liquidato`.
 *    La differenza non e formale: cio che non e maturato non e ancora un
 *    credito — l'atleta puo smettere di frequentare — e chiamarlo «da
 *    ricevere» metterebbe fra i crediti del club denaro che nessuno gli deve.
 * 2. **Si liquida solo cio che e maturato**, e solo fino a quanto resta.
 * 3. **Il nome nell'estratto conto** lo compone il dominio una volta sola, e
 *    lo congela: la vista SQL e il suo gemello TypeScript lo leggono e basta.
 */

let model;

before(async () => {
  model = await import("../../src/lib/funding/funding-model.ts");
});

const periodo = (extra = {}) => ({
  id: "maturato-1",
  period_label: "ottobre 2026",
  status: "accrued",
  accrued_amount: 100,
  settled_amount: 0,
  eligible_amount: 100,
  ...extra,
});

/* ------------------------------------------------------- da ricevere */

test("da ricevere e maturato meno liquidato", () => {
  assert.equal(model.pendingSettlementOfAccrual(periodo()), 100);
  assert.equal(
    model.pendingSettlementOfAccrual(periodo({ settled_amount: 60 })),
    40,
  );
  assert.equal(
    model.pendingSettlementOfAccrual(periodo({ settled_amount: 100 })),
    0,
  );
});

test("da ricevere non e previsto meno liquidato", () => {
  /*
    Il periodo vale 100 e non e maturato: l'ente non deve niente. Se «da
    ricevere» guardasse il previsto, il club aspetterebbe cento euro che non
    arriveranno mai, e il rendiconto gestionale li conterebbe fra i crediti.
  */
  const nonMaturato = periodo({
    status: "not_accrued",
    accrued_amount: 0,
    eligible_amount: 100,
  });

  assert.equal(model.pendingSettlementOfAccrual(nonMaturato), 0);
});

test("da ricevere non scende mai sotto zero", () => {
  /*
    Uno storno mal fatto, o una riga scritta a mano, non devono produrre un
    numero negativo che poi qualcuno somma.
  */
  assert.equal(
    model.pendingSettlementOfAccrual(
      periodo({ accrued_amount: 50, settled_amount: 80 }),
    ),
    0,
  );
});

test("gli importi restano al centesimo", () => {
  assert.equal(
    model.pendingSettlementOfAccrual(
      periodo({ accrued_amount: 33.33, settled_amount: 11.11 }),
    ),
    22.22,
  );
  assert.equal(
    model.pendingSettlementOfAccrual(
      periodo({ accrued_amount: 0.1 + 0.2, settled_amount: 0.3 }),
    ),
    0,
    "e la somma di due decimali non lascia un centesimo fantasma",
  );
});

/* --------------------------------------------------- chi si puo liquidare */

test("un periodo maturato e liquidabile per il suo residuo", () => {
  const esito = model.describeSettlementEligibility(periodo());
  assert.equal(esito.kind, "eligible");
  assert.equal(esito.pendingAmount, 100);

  const parziale = model.describeSettlementEligibility(
    periodo({ settled_amount: 60 }),
  );
  assert.equal(parziale.kind, "eligible");
  assert.equal(parziale.pendingAmount, 40);
});

test("un periodo non maturato non si liquida", () => {
  const esito = model.describeSettlementEligibility(
    periodo({ status: "not_accrued", accrued_amount: 0 }),
  );
  assert.equal(esito.kind, "blocked");
  assert.match(esito.reason, /non e maturato/);
});

test("un periodo gia liquidato per intero non si liquida di nuovo", () => {
  const esito = model.describeSettlementEligibility(
    periodo({ status: "settled", settled_amount: 100 }),
  );
  assert.equal(esito.kind, "blocked");
  assert.match(esito.reason, /gia liquidato per intero/);
});

test("un periodo in attesa della fonte ufficiale non si liquida", () => {
  /*
    Si liquida cio che l'ente ha **riconosciuto**. Un periodo che aspetta la
    conferma porta una previsione, e incassare su una previsione vorrebbe dire
    dichiarare arrivato un bonifico che nessuno ha disposto.
  */
  const esito = model.describeSettlementEligibility(
    periodo({ status: "pending_confirmation", accrued_amount: 0 }),
  );
  assert.equal(esito.kind, "blocked");
  assert.match(esito.reason, /conferma/);
});

test("un periodo che non esiste ancora non si liquida", () => {
  const esito = model.describeSettlementEligibility(null);
  assert.equal(esito.kind, "blocked");
  assert.match(esito.reason, /non e ancora stato calcolato/);
});

test("il vaglio non restituisce mai un residuo non finito", () => {
  const ingressi = [
    periodo({ accrued_amount: "cento" }),
    periodo({ accrued_amount: null }),
    periodo({ settled_amount: undefined }),
    periodo({ accrued_amount: Infinity }),
    {},
    null,
  ];

  for (const ingresso of ingressi) {
    const esito = model.describeSettlementEligibility(ingresso);
    if (esito.kind === "eligible") {
      assert.equal(Number.isFinite(esito.pendingAmount), true);
      assert.ok(esito.pendingAmount > 0);
    } else {
      assert.equal(typeof esito.reason, "string");
      assert.equal(/undefined|NaN|null/.test(esito.reason), false);
    }
  }
});

/* ------------------------------------------- il nome nell'estratto conto */

test("il movimento nomina ente, atleta e periodo", () => {
  assert.equal(
    model.describeSettlementLine({
      programName: "Voucher Sport e Salute",
      athleteName: "Mario Rossi",
      periodLabels: ["ottobre 2026"],
    }),
    "Incasso voucher Voucher Sport e Salute — Mario Rossi — ottobre 2026",
  );
});

test("con piu periodi dello stesso atleta dice quanti sono", () => {
  /*
    Elencarli farebbe una riga che non sta in nessuna colonna, e il dettaglio
    vive comunque nelle righe di ripartizione.
  */
  assert.equal(
    model.describeSettlementLine({
      programName: "Contributo Comunale",
      athleteName: "Anna Bianchi",
      periodLabels: ["ottobre 2026", "novembre 2026", "dicembre 2026"],
    }),
    "Incasso voucher Contributo Comunale — Anna Bianchi — 3 periodi",
  );
});

test("senza beneficiario resta il nome del bando, e non c'e un trattino vuoto", () => {
  const nome = model.describeSettlementLine({
    programName: "Voucher Regionale",
    athleteName: "",
    periodLabels: [],
  });

  assert.equal(nome, "Incasso voucher Voucher Regionale");
  assert.equal(/—\s*$/.test(nome), false);
});

test("nessun ingresso malformato produce undefined nel nome", () => {
  const ingressi = [
    {},
    { programName: null, athleteName: undefined, periodLabels: null },
    { programName: 42, athleteName: {}, periodLabels: [null, undefined, ""] },
    { periodLabels: ["ottobre"] },
  ];

  for (const ingresso of ingressi) {
    const nome = model.describeSettlementLine(ingresso);
    assert.equal(typeof nome, "string");
    assert.ok(nome.length > 0);
    assert.equal(
      /undefined|NaN|\[object/.test(nome),
      false,
      `«${nome}» finirebbe in un estratto conto`,
    );
  }
});

test("lo storno si chiama come cio che annulla", () => {
  const nome = model.describeSettlementLine({
    programName: "Sport e Salute",
    athleteName: "Mario Rossi",
    periodLabels: ["ottobre 2026"],
  });

  assert.equal(
    model.describeSettlementReversalLine(nome),
    "Storno incasso voucher Sport e Salute — Mario Rossi — ottobre 2026",
  );
  assert.equal(
    model.describeSettlementReversalLine(""),
    "",
    "senza nome congelato lo storno non ne inventa uno",
  );
});

/* ------------------------------------ il tetto, che esisteva gia e regge */

test("la ripartizione non supera cio che resta su un periodo", () => {
  const errore = model.validateSettlementAllocation({
    amount: 110,
    lines: [{ accrualId: "p1", amount: 110 }],
    accrualsById: new Map([
      ["p1", { accruedAmount: 100, settledAmount: 0 }],
    ]),
  });

  assert.match(errore, /non si puo liquidare piu di quanto e maturato/i);
});

test("e nemmeno sommando due accrediti parziali", () => {
  assert.equal(
    model.validateSettlementAllocation({
      amount: 40,
      lines: [{ accrualId: "p1", amount: 40 }],
      accrualsById: new Map([
        ["p1", { accruedAmount: 100, settledAmount: 60 }],
      ]),
    }),
    null,
    "quaranta su cento gia liquidati per sessanta: ci stanno esatti",
  );

  assert.match(
    model.validateSettlementAllocation({
      amount: 41,
      lines: [{ accrualId: "p1", amount: 41 }],
      accrualsById: new Map([
        ["p1", { accruedAmount: 100, settledAmount: 60 }],
      ]),
    }),
    /restano 40\.00 EUR/,
  );
});
