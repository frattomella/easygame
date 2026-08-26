import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateEnrollmentAccruals,
  calculatePeriodAccrual,
  generateFundingPeriods,
  normalizeFundingProgram,
  requiresExternalConfirmation,
  summarizeFunding,
  validateAssignedAmount,
  validateFundingProgram,
  FUNDING_ACCRUAL_SOURCES,
  SELECTABLE_FUNDING_ACCRUAL_SOURCES,
} from "../../src/lib/funding/funding-model.ts";
import {
  matchConfirmationsToPeriods,
  parseConfirmationImport,
  parseImportedAmount,
} from "../../src/lib/funding/confirmation-import.ts";

/**
 * Massimale del programma, importo assegnato al club e fonte della
 * maturazione (ADR-0054).
 *
 * Due difetti chiudono qui.
 *
 * 1. **Un numero solo per due concetti.** Il bando riconosce fino a 500 EUR a
 *    Mario; Mario ne usa 300 presso questo club. Trattarli come lo stesso
 *    valore fa credere alla societa di avere in carico 500, e la porta a
 *    rendicontarne piu di quanti ne ha.
 * 2. **La presenza EasyGame come prova universale.** Se la frequenza
 *    ufficiale si registra su una piattaforma dell'ente, l'appello del club e
 *    una previsione. Farlo maturare vuol dire dichiarare all'ente un credito
 *    che l'ente non ha riconosciuto.
 */

/** Un bando a soglia, fonte EasyGame: nessuna costante vive nel codice. */
const BANDO_EASYGAME = {
  name: "Contributo frequenza",
  funder_name: "Comune",
  status: "active",
  valid_from: "2026-09-01",
  valid_to: "2026-11-30",
  athlete_plafond: 500,
  accrual_source: "easygame_attendance",
  period_amount: 60,
  period_frequency: "monthly",
  requirement_unit: "hours",
  requirement_min: 8,
  unmet_behavior: "none",
};

/** Lo stesso bando, ma la frequenza ufficiale la registra l'ente. */
const BANDO_ESTERNO = {
  ...BANDO_EASYGAME,
  accrual_source: "external_confirmation",
};

/* ------------------------------------ massimale programma vs assegnato */

test("il massimale del programma e l'assegnato al club sono due numeri", () => {
  const programma = normalizeFundingProgram(BANDO_EASYGAME);

  assert.equal(programma.athletePlafond, 500, "il massimale sta sul programma");

  // 300 e cio che Mario usa qui: EasyGame non deve assumere di avere i 500.
  assert.equal(
    validateAssignedAmount({ program: programma, assignedAmount: 300 }),
    null,
  );
});

test("l'assegnato non puo superare il massimale del programma", () => {
  const errore = validateAssignedAmount({
    program: BANDO_EASYGAME,
    assignedAmount: 600,
  });

  assert.match(String(errore), /supera il massimale del programma/i);
});

test("l'assegnato pari al massimale e ammesso: e il caso piu comune", () => {
  assert.equal(
    validateAssignedAmount({ program: BANDO_EASYGAME, assignedAmount: 500 }),
    null,
  );
});

test("un assegnato non positivo non e un assegnato", () => {
  assert.match(
    String(validateAssignedAmount({ program: BANDO_EASYGAME, assignedAmount: 0 })),
    /maggiore di zero/i,
  );
});

test("l'assegnato non scende sotto il gia maturato", () => {
  const errore = validateAssignedAmount({
    program: BANDO_EASYGAME,
    assignedAmount: 100,
    alreadyAccrued: 180,
  });

  assert.match(String(errore), /non puo scendere sotto il gia maturato/i);
});

test("la maturazione si ferma all'assegnato, non al massimale", () => {
  const periodi = generateFundingPeriods(BANDO_EASYGAME);
  const risultati = calculateEnrollmentAccruals({
    program: BANDO_EASYGAME,
    // Mario usa 100 qui, non i 500 del bando.
    assignedAmount: 100,
    periods: periodi,
    measureForPeriod: () => 10,
  });

  const maturato = risultati.reduce(
    (total, riga) => total + riga.accruedAmount,
    0,
  );

  assert.equal(maturato, 100, "oltre l'assegnato non si matura, mai");
  assert.equal(risultati[0].accruedAmount, 60);
  assert.equal(risultati[1].accruedAmount, 40, "il secondo periodo si tronca");
  assert.equal(risultati[2].accruedAmount, 0);
});

/* -------------------------------------------- fonte della maturazione */

test("le fonti sono un elenco dichiarato, non stringhe sparse", () => {
  assert.deepEqual(FUNDING_ACCRUAL_SOURCES, [
    "easygame_attendance",
    "external_confirmation",
    "external_import",
    "external_api",
  ]);
});

test("l'API esterna non e selezionabile finche non esiste un provider", () => {
  assert.equal(SELECTABLE_FUNDING_ACCRUAL_SOURCES.includes("external_api"), false);
  assert.match(
    String(
      validateFundingProgram({ ...BANDO_EASYGAME, accrual_source: "external_api" }),
    ),
    /non e ancora disponibile/i,
  );
});

test("una fonte sconosciuta ricade sulle presenze EasyGame", () => {
  assert.equal(
    normalizeFundingProgram({ ...BANDO_EASYGAME, accrual_source: "telepatia" })
      .accrualSource,
    "easygame_attendance",
  );
});

test("un programma senza fonte dichiarata resta a presenze EasyGame", () => {
  const senzaFonte = { ...BANDO_EASYGAME };
  delete senzaFonte.accrual_source;

  assert.equal(requiresExternalConfirmation(senzaFonte), false);
});

test("solo le fonti esterne chiedono una conferma", () => {
  assert.equal(requiresExternalConfirmation(BANDO_EASYGAME), false);
  assert.equal(requiresExternalConfirmation(BANDO_ESTERNO), true);
  assert.equal(
    requiresExternalConfirmation({
      ...BANDO_EASYGAME,
      accrual_source: "external_import",
    }),
    true,
  );
});

/* ------------------------------------------ previsione contro maturato */

test("con la fonte EasyGame previsione e maturato coincidono", () => {
  const risultato = calculatePeriodAccrual({
    program: BANDO_EASYGAME,
    measuredValue: 10,
    remainingPlafond: 300,
  });

  assert.equal(risultato.estimatedAmount, 60);
  assert.equal(risultato.accruedAmount, 60);
  assert.equal(risultato.status, "accrued");
  assert.equal(risultato.origin, "easygame_attendance");
});

test("con la fonte esterna una presenza EasyGame non fa maturare niente", () => {
  const risultato = calculatePeriodAccrual({
    program: BANDO_ESTERNO,
    // Cinque ore su quattro richieste: la previsione dice «raggiunto».
    measuredValue: 10,
    remainingPlafond: 300,
  });

  assert.equal(risultato.requirementMet, true, "la previsione resta vera");
  assert.equal(risultato.estimatedAmount, 60, "e vale 60");
  assert.equal(risultato.accruedAmount, 0, "ma non e un credito");
  assert.equal(risultato.status, "pending_confirmation");
  assert.equal(risultato.origin, null);
  assert.match(risultato.reason, /conferma/i);
});

test("con la fonte esterna anche un periodo vuoto resta confermabile", () => {
  /*
    La piattaforma dell'ente puo conoscere ore che qui nessuno ha registrato:
    e proprio per questo la fonte e la sua.
  */
  const risultato = calculatePeriodAccrual({
    program: BANDO_ESTERNO,
    measuredValue: 0,
    remainingPlafond: 300,
  });

  assert.equal(risultato.status, "pending_confirmation");
  assert.equal(risultato.estimatedAmount, 0);
});

test("la conferma esterna fa maturare l'importo dichiarato, non la previsione", () => {
  const risultato = calculatePeriodAccrual({
    program: BANDO_ESTERNO,
    measuredValue: 10,
    remainingPlafond: 300,
    confirmedAmount: 45,
  });

  assert.equal(risultato.estimatedAmount, 60, "la previsione resta leggibile");
  assert.equal(risultato.accruedAmount, 45, "l'ente ne ha riconosciuti 45");
  assert.equal(risultato.status, "accrued");
  assert.equal(risultato.origin, "manual_confirmation");
});

test("una conferma a zero e una risposta, non un'attesa", () => {
  const risultato = calculatePeriodAccrual({
    program: BANDO_ESTERNO,
    measuredValue: 10,
    remainingPlafond: 300,
    confirmedAmount: 0,
  });

  assert.equal(risultato.status, "not_accrued");
  assert.equal(risultato.accruedAmount, 0);
});

test("nessuna conferma puo superare il residuo assegnato al club", () => {
  const risultato = calculatePeriodAccrual({
    program: BANDO_ESTERNO,
    measuredValue: 10,
    remainingPlafond: 20,
    confirmedAmount: 60,
  });

  assert.equal(risultato.accruedAmount, 20);
  assert.match(risultato.reason, /ridotta al residuo/i);
});

test("la provenienza dichiarata sopravvive al calcolo", () => {
  const risultato = calculatePeriodAccrual({
    program: BANDO_ESTERNO,
    measuredValue: 10,
    remainingPlafond: 300,
    confirmedAmount: 60,
    confirmationOrigin: "external_import",
  });

  assert.equal(risultato.origin, "external_import");
});

test("su piu periodi la conferma consuma l'assegnato in ordine", () => {
  const periodi = generateFundingPeriods(BANDO_ESTERNO);
  const confermati = { 0: 60, 1: 60, 2: 60 };

  const risultati = calculateEnrollmentAccruals({
    program: BANDO_ESTERNO,
    assignedAmount: 100,
    periods: periodi,
    measureForPeriod: () => 10,
    confirmationForPeriod: (periodo) =>
      confermati[periodo.index] === undefined
        ? null
        : { amount: confermati[periodo.index] },
  });

  assert.deepEqual(
    risultati.map((riga) => riga.accruedAmount),
    [60, 40, 0],
  );
});

test("un periodo non confermato non consuma l'assegnato dei successivi", () => {
  const periodi = generateFundingPeriods(BANDO_ESTERNO);

  const risultati = calculateEnrollmentAccruals({
    program: BANDO_ESTERNO,
    assignedAmount: 100,
    periods: periodi,
    measureForPeriod: () => 10,
    // Solo l'ultimo e confermato: i primi due restano previsioni.
    confirmationForPeriod: (periodo) =>
      periodo.index === 2 ? { amount: 60 } : null,
  });

  assert.equal(risultati[0].status, "pending_confirmation");
  assert.equal(risultati[1].status, "pending_confirmation");
  assert.equal(risultati[2].accruedAmount, 60);
});

/* ------------------------------------------------- riepilogo economico */

test("il riepilogo tiene la previsione fuori dal maturato", () => {
  const riepilogo = summarizeFunding({
    assignedAmount: 300,
    accruals: [
      {
        status: "accrued",
        accrued_amount: 60,
        estimated_amount: 60,
        unaccrued_amount: 0,
      },
      {
        status: "pending_confirmation",
        accrued_amount: 0,
        estimated_amount: 60,
        unaccrued_amount: 0,
      },
    ],
    settlementLines: [],
  });

  assert.equal(riepilogo.accruedAmount, 60);
  assert.equal(riepilogo.estimatedAmount, 60, "la previsione si mostra a parte");
  assert.equal(riepilogo.residualAmount, 240, "il residuo non conta la previsione");
  assert.equal(riepilogo.pendingConfirmationPeriodCount, 1);
  assert.equal(
    riepilogo.missedPeriodCount,
    0,
    "un periodo da confermare non e un periodo perso",
  );
});

test("lo scenario 500 / 300 si legge fino in fondo", () => {
  const riepilogo = summarizeFunding({
    // Il bando arriva a 500, ma qui Mario ne usa 300.
    assignedAmount: 300,
    accruals: [
      { status: "reported", accrued_amount: 60, unaccrued_amount: 0 },
      { status: "settled", accrued_amount: 60, unaccrued_amount: 0 },
    ],
    settlementLines: [{ amount: 60 }],
  });

  assert.equal(riepilogo.assignedAmount, 300);
  assert.equal(riepilogo.accruedAmount, 120);
  assert.equal(riepilogo.reportedAmount, 120);
  assert.equal(riepilogo.settledAmount, 60);
  assert.equal(riepilogo.residualAmount, 180);
});

/* --------------------------------------------------- import di conferme */

test("un importo si legge sia all'italiana sia all'inglese", () => {
  assert.equal(parseImportedAmount("60,00"), 60);
  assert.equal(parseImportedAmount("1.234,50"), 1234.5);
  assert.equal(parseImportedAmount("1234.50"), 1234.5);
  assert.equal(parseImportedAmount("€ 60,00"), 60);
  assert.equal(parseImportedAmount(""), null);
  assert.equal(parseImportedAmount("non un numero"), null);
});

test("l'import legge periodo, importo, riferimento e nota", () => {
  const esito = parseConfirmationImport(
    [
      "periodo;importo;riferimento;note",
      "ottobre 2026;60,00;PROT-114;",
      "novembre 2026;0,00;PROT-114;soglia non raggiunta",
    ].join("\n"),
  );

  assert.equal(esito.rows.length, 2);
  assert.equal(esito.rows[0].period, "ottobre 2026");
  assert.equal(esito.rows[0].amount, 60);
  assert.equal(esito.rows[0].externalReference, "PROT-114");
  assert.equal(esito.rows[1].notes, "soglia non raggiunta");
  assert.deepEqual(esito.rejected, []);
});

test("una riga illeggibile viene dichiarata, non ingoiata", () => {
  const esito = parseConfirmationImport(
    ["ottobre 2026;60,00", "novembre 2026;boh", ";10,00"].join("\n"),
  );

  assert.equal(esito.rows.length, 1);
  assert.equal(esito.rejected.length, 2);
  assert.equal(esito.rejected[0].line, 2);
  assert.match(esito.rejected[0].reason, /non leggibile/i);
  assert.match(esito.rejected[1].reason, /Periodo mancante/i);
});

test("un importo negativo non e una conferma", () => {
  const esito = parseConfirmationImport("ottobre 2026;-10,00");

  assert.equal(esito.rows.length, 0);
  assert.match(esito.rejected[0].reason, /negativo/i);
});

test("le righe si agganciano al periodo per etichetta o per indice", () => {
  const periodi = generateFundingPeriods(BANDO_ESTERNO).map((periodo) => ({
    index: periodo.index,
    label: periodo.label,
  }));

  const { matched, unmatched } = matchConfirmationsToPeriods({
    rows: [
      { period: "Settembre 2026", amount: 60, line: 1 },
      { period: "2", amount: 60, line: 2 },
      { period: "marzo 2030", amount: 60, line: 3 },
    ],
    periods: periodi,
  });

  assert.equal(matched.length, 2);
  assert.equal(matched[0].periodIndex, 0, "l'etichetta ignora le maiuscole");
  assert.equal(matched[1].periodIndex, 2);
  assert.equal(unmatched.length, 1, "un periodo inesistente resta dichiarato");
});
