import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateEnrollmentAccruals,
  calculatePeriodAccrual,
  generateFundingPeriods,
  mergeFundingSummaries,
  normalizeFundingProgram,
  summarizeFunding,
  validateFundingProgram,
  validateSettlementAllocation,
} from "../../src/lib/funding/funding-model.ts";
import {
  getTrainingDurationHours,
  measureAttendanceByPeriod,
} from "../../src/lib/funding/attendance-measure.ts";

/**
 * Voucher e contributi legati alla frequenza (Workstream A, ADR-0037).
 *
 * Due cose vanno dimostrate.
 *
 * 1. **Nessuna regola di un singolo bando e nel codice.** Il caso di
 *    riferimento — Voucher per lo Sport, Regione Lazio 2025 — e configurato
 *    qui sotto e in nessun altro punto del repository. Un test che lo prova
 *    passando per una costante nel codice non proverebbe niente;
 * 2. **i cinque importi restano cinque.** Assegnato, maturato, rendicontato,
 *    liquidato e residuo sono numeri diversi, e il difetto che questo dominio
 *    esiste per evitare e che uno di essi venga scambiato per cassa.
 */

/**
 * Il caso reale, espresso **solo** come configurazione: plafond di 500 EUR,
 * mensilita da 60 EUR, requisito di 8 ore al mese, niente sotto la soglia.
 * Nessuno di questi valori compare in `src/lib/funding/**`.
 */
const VOUCHER_LAZIO_2025 = {
  id: "prog-lazio",
  name: "Voucher per lo Sport 2025",
  funder_name: "Regione Lazio / Sport e Salute",
  status: "active",
  valid_from: "2025-09-01",
  valid_to: "2026-06-30",
  athlete_plafond: 500,
  period_amount: 60,
  period_frequency: "monthly",
  requirement_unit: "hours",
  requirement_min: 8,
  unmet_behavior: "none",
};

// --- configurazione, non codice ---------------------------------------------

test("un programma si descrive per intero con la configurazione", () => {
  const program = normalizeFundingProgram(VOUCHER_LAZIO_2025);

  assert.equal(program.athletePlafond, 500);
  assert.equal(program.periodAmount, 60);
  assert.equal(program.periodFrequency, "monthly");
  assert.equal(program.requirementUnit, "hours");
  assert.equal(program.requirementMin, 8);
  assert.equal(program.unmetBehavior, "none");
});

test("un secondo bando con regole opposte usa lo stesso calcolo", () => {
  /*
    Requisito a presenze invece che a ore, periodi di 14 giorni invece che
    mensili, riconoscimento proporzionale invece che a soglia secca. Se il
    codice contenesse le regole del primo bando, questo non funzionerebbe.
  */
  const bandoComunale = {
    name: "Contributo comunale quindicinale",
    funder_name: "Comune",
    status: "active",
    valid_from: "2026-01-01",
    valid_to: "2026-02-28",
    athlete_plafond: 200,
    period_amount: 25,
    period_frequency: "days",
    period_length_days: 14,
    requirement_unit: "sessions",
    requirement_min: 4,
    unmet_behavior: "prorata",
  };

  const periodi = generateFundingPeriods(bandoComunale);
  assert.equal(periodi.length, 5, "59 giorni in periodi da 14: 4 pieni e uno parziale");

  const meta = calculatePeriodAccrual({
    program: bandoComunale,
    measuredValue: 2,
    remainingPlafond: 200,
  });

  assert.equal(meta.accruedAmount, 12.5, "meta del requisito, meta dell'importo");
  assert.equal(meta.requirementMet, false);
  assert.equal(meta.status, "accrued");
});

// --- periodi -----------------------------------------------------------------

test("i periodi mensili seguono il mese di calendario", () => {
  const periodi = generateFundingPeriods(VOUCHER_LAZIO_2025);

  assert.equal(periodi.length, 10, "da settembre 2025 a giugno 2026");
  assert.equal(periodi[0].label, "settembre 2025");
  assert.equal(periodi[0].start.slice(0, 10), "2025-09-01");
  assert.equal(periodi[0].end.slice(0, 10), "2025-09-30");
  assert.equal(periodi[9].label, "giugno 2026");
  assert.equal(periodi[9].end.slice(0, 10), "2026-06-30");
});

test("il primo e l'ultimo periodo possono essere parziali, e restano tali", () => {
  const periodi = generateFundingPeriods({
    ...VOUCHER_LAZIO_2025,
    valid_from: "2025-09-15",
    valid_to: "2025-11-10",
  });

  assert.equal(periodi.length, 3);
  assert.equal(periodi[0].start.slice(0, 10), "2025-09-15");
  assert.equal(periodi[0].end.slice(0, 10), "2025-09-30");
  assert.equal(
    periodi[2].end.slice(0, 10),
    "2025-11-10",
    "il periodo non si allunga oltre la validita del programma",
  );
});

test("«fino a» accorcia l'elenco ma non estende il programma", () => {
  const finoADicembre = generateFundingPeriods(VOUCHER_LAZIO_2025, {
    until: "2025-12-15",
  });
  const oltreLaFine = generateFundingPeriods(VOUCHER_LAZIO_2025, {
    until: "2027-01-01",
  });

  assert.equal(finoADicembre.length, 4, "settembre, ottobre, novembre, dicembre");
  assert.equal(finoADicembre[3].end.slice(0, 10), "2025-12-15");
  assert.equal(oltreLaFine.length, 10, "la validita del programma comanda");
});

test("il tetto ai periodi del programma viene rispettato", () => {
  const periodi = generateFundingPeriods({
    ...VOUCHER_LAZIO_2025,
    max_periods: 3,
  });

  assert.equal(periodi.length, 3);
});

test("un programma senza date non produce periodi invece di esplodere", () => {
  assert.deepEqual(generateFundingPeriods({ name: "x" }), []);
  assert.deepEqual(
    generateFundingPeriods({ ...VOUCHER_LAZIO_2025, valid_to: "2025-01-01" }),
    [],
  );
});

// --- maturazione: il caso di riferimento -------------------------------------

test("la mensilita matura solo al raggiungimento della soglia oraria", () => {
  const sotto = calculatePeriodAccrual({
    program: VOUCHER_LAZIO_2025,
    measuredValue: 7.5,
    remainingPlafond: 500,
  });
  const esatto = calculatePeriodAccrual({
    program: VOUCHER_LAZIO_2025,
    measuredValue: 8,
    remainingPlafond: 500,
  });

  assert.equal(sotto.accruedAmount, 0);
  assert.equal(sotto.unaccruedAmount, 60, "quanto si e perso, non nascosto");
  assert.equal(sotto.status, "not_accrued");
  assert.match(sotto.reason, /soglia di 8 ore/);

  assert.equal(esatto.accruedAmount, 60, "la soglia raggiunta esattamente basta");
  assert.equal(esatto.requirementMet, true);
});

test("il plafond limita l'ultima mensilita utile", () => {
  const risultato = calculatePeriodAccrual({
    program: VOUCHER_LAZIO_2025,
    measuredValue: 20,
    remainingPlafond: 20,
  });

  assert.equal(risultato.accruedAmount, 20, "non 60: il plafond e finito");
  assert.equal(risultato.unaccruedAmount, 40);
  assert.match(risultato.reason, /Importo assegnato quasi esaurito/);
});

test("con il plafond esaurito una mensilita frequentata matura zero", () => {
  const risultato = calculatePeriodAccrual({
    program: VOUCHER_LAZIO_2025,
    measuredValue: 20,
    remainingPlafond: 0,
  });

  assert.equal(risultato.accruedAmount, 0);
  assert.equal(risultato.requirementMet, true, "ha frequentato: il dato resta vero");
  assert.match(risultato.reason, /Importo assegnato esaurito/);
});

test("il plafond si consuma in ordine cronologico, non periodo per periodo", () => {
  const periodi = generateFundingPeriods(VOUCHER_LAZIO_2025);
  const risultati = calculateEnrollmentAccruals({
    program: VOUCHER_LAZIO_2025,
    assignedAmount: 500,
    periods: periodi,
    // Frequenta sempre abbastanza: il plafond e l'unico limite.
    measureForPeriod: () => 10,
  });

  const maturato = risultati.reduce(
    (totale, riga) => totale + riga.accruedAmount,
    0,
  );

  assert.equal(maturato, 500, "500 e non 600: il plafond taglia");
  assert.equal(risultati[7].accruedAmount, 60, "l'ottava mensilita e ancora piena");
  assert.equal(
    risultati[8].accruedAmount,
    20,
    "la nona matura solo il residuo: 500 - 8 x 60",
  );
  assert.equal(risultati[9].accruedAmount, 0, "la decima non ha piu plafond");
});

// --- comportamento sotto soglia, configurabile -------------------------------

test("«full» riconosce il periodo anche sotto la soglia", () => {
  const risultato = calculatePeriodAccrual({
    program: { ...VOUCHER_LAZIO_2025, unmet_behavior: "full" },
    measuredValue: 1,
    remainingPlafond: 500,
  });

  assert.equal(risultato.accruedAmount, 60);
  assert.equal(risultato.requirementMet, false, "il requisito resta non raggiunto");
});

test("«prorata» riconosce in proporzione, e zero senza frequenza", () => {
  const meta = calculatePeriodAccrual({
    program: { ...VOUCHER_LAZIO_2025, unmet_behavior: "prorata" },
    measuredValue: 4,
    remainingPlafond: 500,
  });
  const niente = calculatePeriodAccrual({
    program: { ...VOUCHER_LAZIO_2025, unmet_behavior: "prorata" },
    measuredValue: 0,
    remainingPlafond: 500,
  });

  assert.equal(meta.accruedAmount, 30);
  assert.equal(niente.accruedAmount, 0);
  assert.match(niente.reason, /Nessuna frequenza/);
});

// --- validazione della configurazione ----------------------------------------

test("una configurazione a soglia senza soglia viene rifiutata", () => {
  assert.match(
    validateFundingProgram({ ...VOUCHER_LAZIO_2025, requirement_min: 0 }),
    /requisito minimo/i,
  );
  assert.equal(
    validateFundingProgram({
      ...VOUCHER_LAZIO_2025,
      requirement_min: 0,
      unmet_behavior: "full",
    }),
    null,
    "senza soglia il requisito non serve",
  );
});

test("la configurazione incoerente viene spiegata, non accettata", () => {
  assert.match(validateFundingProgram({}), /nome/i);
  assert.match(
    validateFundingProgram({ ...VOUCHER_LAZIO_2025, funder_name: "" }),
    /ente finanziatore/i,
  );
  assert.match(
    validateFundingProgram({ ...VOUCHER_LAZIO_2025, valid_to: "2024-01-01" }),
    /finisce prima di cominciare/i,
  );
  assert.match(
    validateFundingProgram({ ...VOUCHER_LAZIO_2025, athlete_plafond: 0 }),
    /plafond/i,
  );
  assert.match(
    validateFundingProgram({
      ...VOUCHER_LAZIO_2025,
      period_frequency: "days",
      period_length_days: null,
    }),
    /lunghezza del periodo/i,
  );
  assert.equal(validateFundingProgram(VOUCHER_LAZIO_2025), null);
});

// --- i cinque importi --------------------------------------------------------

test("assegnato, maturato, rendicontato, liquidato e residuo restano cinque", () => {
  const summary = summarizeFunding({
    assignedAmount: 500,
    accruals: [
      { accrued_amount: 60, unaccrued_amount: 0, status: "settled" },
      { accrued_amount: 60, unaccrued_amount: 0, status: "reported" },
      { accrued_amount: 60, unaccrued_amount: 0, status: "accrued" },
      { accrued_amount: 0, unaccrued_amount: 60, status: "not_accrued" },
    ],
    settlementLines: [{ amount: 60 }],
  });

  assert.equal(summary.assignedAmount, 500, "il plafond assegnato");
  assert.equal(summary.accruedAmount, 180, "maturato con la frequenza");
  assert.equal(summary.reportedAmount, 120, "dichiarato all'ente");
  assert.equal(summary.settledAmount, 60, "**questo** e l'unico denaro arrivato");
  assert.equal(summary.pendingSettlementAmount, 120, "maturato ma da liquidare");
  assert.equal(summary.residualAmount, 320, "quanto puo ancora maturare");
  assert.equal(summary.unaccruedAmount, 60, "quanto e andato perso");
  assert.equal(summary.accruedPeriodCount, 3);
  assert.equal(summary.missedPeriodCount, 1);
});

test("un voucher assegnato e mai maturato non e denaro", () => {
  const summary = summarizeFunding({ assignedAmount: 500, accruals: [] });

  assert.equal(summary.assignedAmount, 500);
  assert.equal(summary.accruedAmount, 0);
  assert.equal(summary.settledAmount, 0);
  assert.equal(summary.residualAmount, 500);
});

test("il liquidato si legge dalle righe, non dallo stato del periodo", () => {
  /*
    Liquidazione parziale: il periodo e marcato «settled» ma l'ente ha versato
    meta. Fidarsi dello stato direbbe 60, che sono trenta euro che nessuno ha
    incassato.
  */
  const summary = summarizeFunding({
    assignedAmount: 500,
    accruals: [{ accrued_amount: 60, unaccrued_amount: 0, status: "settled" }],
    settlementLines: [{ amount: 30 }],
  });

  assert.equal(summary.settledAmount, 30);
  assert.equal(summary.pendingSettlementAmount, 30);
});

test("due contributi sullo stesso atleta si sommano senza confondersi", () => {
  const totale = mergeFundingSummaries([
    summarizeFunding({
      assignedAmount: 500,
      accruals: [{ accrued_amount: 60, status: "accrued" }],
    }),
    summarizeFunding({
      assignedAmount: 200,
      accruals: [{ accrued_amount: 25, status: "settled" }],
      settlementLines: [{ amount: 25 }],
    }),
  ]);

  assert.equal(totale.assignedAmount, 700);
  assert.equal(totale.accruedAmount, 85);
  assert.equal(totale.settledAmount, 25);
  assert.equal(totale.pendingSettlementAmount, 60);
});

// --- riconciliazione delle liquidazioni --------------------------------------

const accrualsById = () =>
  new Map([
    ["acc-1", { accruedAmount: 60, settledAmount: 0 }],
    ["acc-2", { accruedAmount: 60, settledAmount: 20 }],
  ]);

test("una liquidazione deve dire a quali periodi si riferisce", () => {
  assert.match(
    validateSettlementAllocation({ amount: 100, lines: [] }),
    /a quali periodi/i,
  );
});

test("la ripartizione deve corrispondere all'importo liquidato", () => {
  assert.match(
    validateSettlementAllocation({
      amount: 100,
      lines: [{ accrualId: "acc-1", amount: 60 }],
      accrualsById: accrualsById(),
    }),
    /non corrisponde/i,
  );

  assert.equal(
    validateSettlementAllocation({
      amount: 100,
      lines: [
        { accrualId: "acc-1", amount: 60 },
        { accrualId: "acc-2", amount: 40 },
      ],
      accrualsById: accrualsById(),
    }),
    null,
  );
});

test("non si liquida piu di quanto e maturato", () => {
  assert.match(
    validateSettlementAllocation({
      amount: 70,
      lines: [{ accrualId: "acc-1", amount: 70 }],
      accrualsById: accrualsById(),
    }),
    /piu di quanto e maturato/i,
  );

  assert.match(
    validateSettlementAllocation({
      amount: 50,
      lines: [{ accrualId: "acc-2", amount: 50 }],
      accrualsById: accrualsById(),
    }),
    /restano 40\.00 EUR/,
    "una liquidazione parziale gia registrata riduce il disponibile",
  );
});

test("lo stesso periodo non compare due volte nella stessa liquidazione", () => {
  assert.match(
    validateSettlementAllocation({
      amount: 40,
      lines: [
        { accrualId: "acc-1", amount: 20 },
        { accrualId: "acc-1", amount: 20 },
      ],
      accrualsById: accrualsById(),
    }),
    /due volte/i,
  );
});

test("una riga che punta a un periodo inesistente viene rifiutata", () => {
  assert.match(
    validateSettlementAllocation({
      amount: 10,
      lines: [{ accrualId: "acc-fantasma", amount: 10 }],
      accrualsById: accrualsById(),
    }),
    /non esiste/i,
  );
});

// --- misura della frequenza dalle presenze -----------------------------------

const allenamento = (id, date, start, end) => ({
  id,
  date,
  startTime: start,
  endTime: end,
});

const presenza = (trainingId, status = "present") => ({
  training_id: trainingId,
  athlete_id: "atleta-1",
  status,
});

test("le ore si ricavano dagli orari dell'allenamento", () => {
  assert.equal(getTrainingDurationHours(allenamento("t", "2025-09-02", "17:00", "19:00")), 2);
  assert.equal(getTrainingDurationHours(allenamento("t", "2025-09-02", "17:00", "18:30")), 1.5);
  assert.equal(
    getTrainingDurationHours(allenamento("t", "2025-09-02", "19:00", "17:00")),
    null,
    "un allenamento che finisce prima di cominciare non vale una durata negativa",
  );
  assert.equal(getTrainingDurationHours(allenamento("t", "2025-09-02", "", "")), null);
});

test("le presenze si distribuiscono nel periodo giusto", () => {
  const periodi = generateFundingPeriods(VOUCHER_LAZIO_2025);
  const trainings = [
    allenamento("t1", "2025-09-02", "17:00", "19:00"),
    allenamento("t2", "2025-09-30", "17:00", "19:00"),
    allenamento("t3", "2025-10-01", "17:00", "19:00"),
  ];

  const misure = measureAttendanceByPeriod({
    periods: periodi,
    trainings,
    attendance: [presenza("t1"), presenza("t2"), presenza("t3")],
  });

  assert.equal(misure[0].hours, 4, "l'ultimo giorno del mese e dentro il mese");
  assert.equal(misure[1].hours, 2);
  assert.equal(misure[0].sessions, 2);
});

test("un'assenza non conta, e nemmeno un appello mai registrato", () => {
  const periodi = generateFundingPeriods(VOUCHER_LAZIO_2025);
  const trainings = [
    allenamento("t1", "2025-09-02", "17:00", "19:00"),
    allenamento("t2", "2025-09-03", "17:00", "19:00"),
  ];

  const misure = measureAttendanceByPeriod({
    periods: periodi,
    trainings,
    // `t2` non ha nessuna riga: nessuno ha fatto l'appello.
    attendance: [presenza("t1"), presenza("t2", "absent")],
  });

  assert.equal(misure[0].hours, 2);
  assert.equal(misure[0].sessions, 1);
});

test("la stessa presenza contata due volte non gonfia il maturato", () => {
  const periodi = generateFundingPeriods(VOUCHER_LAZIO_2025);
  const misure = measureAttendanceByPeriod({
    periods: periodi,
    trainings: [allenamento("t1", "2025-09-02", "17:00", "19:00")],
    attendance: [presenza("t1"), presenza("t1")],
  });

  assert.equal(misure[0].hours, 2);
  assert.equal(misure[0].sessions, 1);
});

test("un allenamento senza orario si dichiara, non si nasconde in un totale piu basso", () => {
  const periodi = generateFundingPeriods(VOUCHER_LAZIO_2025);
  const misure = measureAttendanceByPeriod({
    periods: periodi,
    trainings: [
      allenamento("t1", "2025-09-02", "17:00", "19:00"),
      allenamento("t2", "2025-09-03", "", ""),
    ],
    attendance: [presenza("t1"), presenza("t2")],
  });

  assert.equal(misure[0].hours, 2);
  assert.equal(misure[0].sessions, 2);
  assert.equal(
    misure[0].sessionsWithoutDuration,
    1,
    "un requisito orario mancato per dati incompleti e un problema di anagrafica",
  );
});

test("con l'unita a presenze la misura conta le sessioni, non le ore", () => {
  const periodi = generateFundingPeriods(VOUCHER_LAZIO_2025);
  const misure = measureAttendanceByPeriod({
    periods: periodi,
    trainings: [
      allenamento("t1", "2025-09-02", "17:00", "19:00"),
      allenamento("t2", "2025-09-03", "17:00", "19:00"),
    ],
    attendance: [presenza("t1"), presenza("t2")],
    requirementUnit: "sessions",
  });

  assert.equal(misure[0].value, 2);
  assert.equal(misure[0].hours, 4);
});

// --- lo scenario completo del caso di riferimento ----------------------------

test("scenario Voucher Lazio 2025: dalla frequenza al residuo", () => {
  const periodi = generateFundingPeriods(VOUCHER_LAZIO_2025, {
    until: "2025-11-30",
  });

  const trainings = [
    // settembre: 4 allenamenti da 2 ore = 8 ore, la soglia e raggiunta
    allenamento("s1", "2025-09-02", "17:00", "19:00"),
    allenamento("s2", "2025-09-09", "17:00", "19:00"),
    allenamento("s3", "2025-09-16", "17:00", "19:00"),
    allenamento("s4", "2025-09-23", "17:00", "19:00"),
    // ottobre: 3 allenamenti da 2 ore = 6 ore, sotto la soglia
    allenamento("o1", "2025-10-07", "17:00", "19:00"),
    allenamento("o2", "2025-10-14", "17:00", "19:00"),
    allenamento("o3", "2025-10-21", "17:00", "19:00"),
    // novembre: 5 allenamenti da 2 ore = 10 ore
    allenamento("n1", "2025-11-04", "17:00", "19:00"),
    allenamento("n2", "2025-11-11", "17:00", "19:00"),
    allenamento("n3", "2025-11-18", "17:00", "19:00"),
    allenamento("n4", "2025-11-25", "17:00", "19:00"),
    allenamento("n5", "2025-11-27", "17:00", "19:00"),
  ];

  const misure = measureAttendanceByPeriod({
    periods: periodi,
    trainings,
    attendance: trainings.map((training) => presenza(training.id)),
  });

  const risultati = calculateEnrollmentAccruals({
    program: VOUCHER_LAZIO_2025,
    assignedAmount: 500,
    periods: periodi,
    measureForPeriod: (period) => misure[period.index].value,
  });

  assert.equal(risultati[0].measuredValue, 8);
  assert.equal(risultati[0].accruedAmount, 60, "settembre matura");
  assert.equal(risultati[1].measuredValue, 6);
  assert.equal(risultati[1].accruedAmount, 0, "ottobre no: 6 ore su 8");
  assert.equal(risultati[1].unaccruedAmount, 60);
  assert.equal(risultati[2].accruedAmount, 60, "novembre matura");

  const summary = summarizeFunding({
    assignedAmount: 500,
    accruals: risultati.map((riga) => ({
      accrued_amount: riga.accruedAmount,
      unaccrued_amount: riga.unaccruedAmount,
      status: riga.status,
    })),
    // L'ente non ha ancora versato niente: il maturato e un credito.
    settlementLines: [],
  });

  assert.equal(summary.accruedAmount, 120);
  assert.equal(summary.settledAmount, 0, "il pagamento dell'ente viene dopo");
  assert.equal(summary.pendingSettlementAmount, 120);
  assert.equal(summary.residualAmount, 380);
  assert.equal(summary.unaccruedAmount, 60);
});
