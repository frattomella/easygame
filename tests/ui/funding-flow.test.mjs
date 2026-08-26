import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Voucher e contributi, come interfaccia e come confine (ADR-0037).
 *
 * Il test piu importante di questo file e il primo: **nessuna costante del
 * Voucher Lazio 2025 vive nel codice**. Un dominio che si dice configurabile e
 * poi porta 500, 60 o 8 dentro un modulo non e configurabile, e il secondo
 * bando che arriva lo scopre nel modo peggiore.
 *
 * Gli altri verificano il confine che questo lavoro esiste per tenere: un
 * contributo non e un pagamento della famiglia, e le due contabilita non si
 * sommano.
 */

const SRC = path.join(process.cwd(), "src");
const read = (relative) =>
  readFileSync(path.join(SRC, ...relative.split("/")), "utf8");

const FUNDING_MODEL = "lib/funding/funding-model.ts";
const ATTENDANCE_MEASURE = "lib/funding/attendance-measure.ts";
const FUNDING_SERVICE = "lib/server/funding.ts";
const ATHLETE_SUMMARY = "components/funding/AthleteFundingSummary.tsx";
const PERIODS_TABLE = "components/funding/FundingPeriodsTable.tsx";
const CONFIRM_DIALOG = "components/funding/ConfirmAccrualDialog.tsx";
const PROGRAMS_PANEL = "components/funding/FundingProgramsPanel.tsx";
const ATHLETE_PAGE = "app/athletes/[id]/page.tsx";
const REGISTRATION_PAGE = "app/registration-management/page.tsx";
const PAYMENT_LEDGER = "components/payments/AthletePaymentLedger.tsx";

// --- nessuna regola di un singolo bando nel codice ---------------------------

test("nessuna costante del bando di riferimento vive nel dominio", () => {
  const offenders = [];

  for (const file of [FUNDING_MODEL, ATTENDANCE_MEASURE, FUNDING_SERVICE]) {
    const source = read(file)
      // I commenti spiegano il caso reale e devono poterlo nominare: cio che
      // non deve esistere e un **valore** usato dal calcolo.
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    /*
      Il plafond (500), la mensilita (60) e la soglia (8) del Voucher Lazio
      2025. Un numero nudo accanto a un identificatore che parla di plafond,
      soglia o importo di periodo e il segno che la configurazione e stata
      scavalcata.
    */
    const sospetti = [
      /\b(plafond|threshold|soglia)\w*\s*[=:]\s*\d+/i,
      /\b(periodAmount|period_amount)\s*[=:]\s*\d+/i,
      /\b(requirementMin|requirement_min)\s*[=:]\s*[1-9]\d*/i,
      /\blazio\b/i,
    ];

    for (const pattern of sospetti) {
      const match = pattern.exec(source);
      if (match) offenders.push(`${file}: ${match[0]}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "le regole di un bando sono configurazione: un valore nel codice le rende irripetibili",
  );
});

test("il caso di riferimento e configurato solo nei test", () => {
  const collect = (dir, acc = []) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) collect(full, acc);
      else if (/\.(ts|tsx)$/.test(entry)) acc.push(full);
    }
    return acc;
  };

  const offenders = collect(SRC).filter((file) =>
    /Voucher per lo Sport 2025|Regione Lazio \/ Sport e Salute/.test(
      readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, ""),
    ),
  );

  assert.deepEqual(
    offenders.map((file) => path.relative(SRC, file)),
    [],
    "il bando compare come esempio nei commenti e come dato nei test, mai come valore in src/",
  );
});

test("le unita e i comportamenti sono elenchi dichiarati, non stringhe sparse", () => {
  const source = read(FUNDING_MODEL);

  assert.match(source, /FUNDING_PERIOD_FREQUENCIES = \[/);
  assert.match(source, /FUNDING_REQUIREMENT_UNITS = \[/);
  assert.match(source, /FUNDING_UNMET_BEHAVIORS = \[/);
  assert.match(source, /"hours"[\s\S]{0,40}"sessions"/);
  assert.match(source, /"none"[\s\S]{0,40}"prorata"[\s\S]{0,40}"full"/);
});

// --- il confine con i pagamenti ----------------------------------------------

test("una liquidazione non scrive mai un incasso della famiglia", () => {
  const source = read(FUNDING_SERVICE);

  assert.equal(
    /paymentTransaction|athletePayment/.test(source),
    false,
    "il servizio dei contributi non tocca la contabilita dei pagamenti: confonderle farebbe risultare saldate rate che nessuno ha pagato",
  );
});

test("il dominio dei pagamenti non conosce i contributi", () => {
  const source = read("lib/payments/installment-ledger.ts");

  assert.equal(
    /funding|voucher|accrual/i.test(source),
    false,
    "Payment e FundingAccrual restano due modelli distinti",
  );
});

test("il Riepilogo Incassi dichiara di chi e il denaro", () => {
  const source = read(PAYMENT_LEDGER);

  assert.match(source, /Pagamenti della famiglia/);
  // Il testo e mandato a capo da Prettier: si confronta senza gli spazi.
  assert.match(
    source.replace(/\s+/g, " "),
    /contributo maturato e un credito, non denaro incassato/,
  );
});

// --- gli importi che raccontano il ciclo -------------------------------------

test("la scheda atleta distingue il massimale del programma dall'assegnato", () => {
  const source = read(ATHLETE_SUMMARY);

  for (const label of [
    "Massimale programma",
    "Assegnato al club",
    "Maturato",
    "Rendicontato",
    "Liquidato",
    "Residuo",
  ]) {
    assert.match(
      source,
      new RegExp(`label="${label}"`),
      `manca l'importo «${label}»`,
    );
  }

  assert.match(
    source,
    /hint="tetto del bando"/,
    "il massimale deve dire di cosa e il tetto",
  );
  assert.match(
    source,
    /hint="limite di questa iscrizione"/,
    "l'assegnato al club e il limite vero dell'iscrizione",
  );
});

test("il dettaglio periodo per periodo c'e, con previsione e stato ufficiale", () => {
  const source = read(PERIODS_TABLE);

  for (const label of [
    "Periodo",
    "Frequenza EasyGame",
    "Requisito",
    "Previsione EasyGame",
    "Stato ufficiale",
    "Maturato",
    "Rendicontato",
    "Liquidato",
  ]) {
    assert.match(
      source,
      new RegExp(`label="${label}"`),
      `manca la voce ${label}`,
    );
  }
});

test("i cinque stati del maturato sono distinti a schermo", () => {
  const source = read(PERIODS_TABLE);

  for (const status of [
    "not_accrued",
    "pending_confirmation",
    "accrued",
    "reported",
    "settled",
  ]) {
    assert.match(source, new RegExp(`${status}:`), `manca il badge ${status}`);
  }
});

// --- configurazione ----------------------------------------------------------

test("il pannello chiede tutti i campi che il modello dichiara configurabili", () => {
  const source = read(PROGRAMS_PANEL);

  for (const field of [
    "name",
    "funder_name",
    "valid_from",
    "valid_to",
    "athlete_plafond",
    "period_amount",
    "period_frequency",
    "requirement_unit",
    "requirement_min",
    "unmet_behavior",
    "max_periods",
  ]) {
    assert.match(
      source,
      new RegExp(`"${field}"`),
      `il campo ${field} non e configurabile dall'interfaccia`,
    );
  }
});

test("la validazione del programma e la stessa del server", () => {
  assert.match(
    read(PROGRAMS_PANEL),
    /validateFundingProgram/,
    "il pannello non deve avere una regola propria",
  );
  assert.match(read(FUNDING_SERVICE), /validateFundingProgram/);
});

// --- montaggio ---------------------------------------------------------------

test("i contributi sono montati nella scheda atleta e in Gestione iscrizioni", () => {
  assert.match(read(ATHLETE_PAGE), /<AthleteFundingSummary/);
  assert.match(read(REGISTRATION_PAGE), /<FundingProgramsPanel/);
});

test("i contributi stanno in un riquadro separato dagli incassi", () => {
  const source = read(ATHLETE_PAGE);

  assert.match(
    source,
    /<CardTitle>Voucher e contributi<\/CardTitle>/,
    "un riquadro proprio, non una riga dentro il Riepilogo Incassi",
  );
  assert.match(source, /Un voucher assegnato non e denaro incassato/);
});

// --- responsivita ------------------------------------------------------------

test("le superfici dei contributi non restano a due colonne a 375 px", () => {
  const offenders = [];

  for (const file of [ATHLETE_SUMMARY, PROGRAMS_PANEL]) {
    const offending = read(file)
      .split(/\r?\n/)
      .filter((line) => /(?<![a-z:])grid-cols-[2345]\b/.test(line))
      .filter((line) => !line.includes("TabsList"));

    if (offending.length) {
      offenders.push(`${file}: ${offending[0].trim().slice(0, 80)}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "usare grid-cols-1 sm:grid-cols-N: i cinque importi a 375 px vanno in colonna",
  );
});

test("il dettaglio periodi non e una tabella che scorre di lato", () => {
  const source = read(PERIODS_TABLE);

  assert.equal(
    /<table/.test(source),
    false,
    "otto colonne a 375 px non si leggono: la riga si apre, non scorre",
  );
  assert.match(
    source,
    /aria-expanded=\{isOpen\}/,
    "la riga apribile deve dichiarare il proprio stato",
  );
  assert.match(
    read(PROGRAMS_PANEL),
    /max-h-\[90vh\] overflow-y-auto/,
    "la finestra di configurazione ha molti campi: su schermo basso deve scorrere",
  );
  assert.match(
    read(CONFIRM_DIALOG),
    /max-h-\[92vh\] overflow-y-auto/,
    "anche la conferma deve poter scorrere su schermo basso",
  );
});

// --- il maturato non si scrive a mano ----------------------------------------

test("l'interfaccia non offre di digitare un importo maturato", () => {
  const source = read(ATHLETE_SUMMARY);

  assert.equal(
    /accrued_amount[\s\S]{0,80}onChange/.test(source),
    false,
    "il maturato si ricalcola dalle presenze: digitarlo lo renderebbe un'opinione",
  );
  assert.match(source, /Ricalcola dalle presenze/);
});
