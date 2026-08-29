import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCOUNTING_EXPORT_COLUMNS,
  ACCOUNTING_EXPORT_TITLE,
  buildAccountingExportCsv,
  formatExportDate,
  toAccountingExportRow,
} from "../../src/lib/accounting/export.ts";
import { CSV_BOM, CSV_DELIMITER, CSV_EOL } from "../../src/lib/csv.ts";
import { PAROLE_VIETATE } from "../../src/lib/accounting/reporting.ts";

/**
 * **W4-G — l'export per il commercialista.**
 *
 * Gli scenari sono quelli del §37 del piano, scritti prima del codice:
 *
 * - **41** — mille movimenti esportati: tutte le colonne del §27, nessuna riga
 *   persa;
 * - **42** — un importo con la virgola decimale e una nota con un ritorno a
 *   capo **non spezzano** una riga. E il motivo per cui `src/lib/csv.ts`
 *   esiste: le due implementazioni che l'hanno preceduto non proteggevano il
 *   `\r`, e una riga spezzata produce un movimento in piu che nessuno ha
 *   registrato;
 * - **43** — il file si apre in Excel italiano senza chiedere niente: BOM,
 *   punto e virgola, CRLF.
 *
 * Piu le tre regole che il file deve rispettare per essere onesto: entrata e
 * uscita in due colonne senza segno, la classificazione **congelata sulla
 * riga**, e nessuna parola che rivendichi una validita che nessuno ha
 * verificato.
 */

/* ========================================================================== */
/* Un lettore di CSV, perche uno `split` non e una lettura                     */
/* ========================================================================== */

/**
 * Il parser esiste per lo scenario 42: dividere il testo su `\r\n` e su `;`
 * darebbe **per costruzione** il risultato sbagliato proprio nel caso che il
 * test deve provare — una cella virgolettata che contiene un ritorno a capo.
 * Un test che dividesse a mano fallirebbe su un file corretto.
 */
const parseCsv = (text) => {
  const senzaBom = text.startsWith(CSV_BOM) ? text.slice(CSV_BOM.length) : text;
  const righe = [];
  let cella = "";
  let riga = [];
  let dentroVirgolette = false;

  for (let i = 0; i < senzaBom.length; i += 1) {
    const c = senzaBom[i];

    if (dentroVirgolette) {
      if (c === '"') {
        if (senzaBom[i + 1] === '"') {
          cella += '"';
          i += 1;
        } else {
          dentroVirgolette = false;
        }
      } else {
        cella += c;
      }
      continue;
    }

    if (c === '"') {
      dentroVirgolette = true;
      continue;
    }
    if (c === CSV_DELIMITER) {
      riga.push(cella);
      cella = "";
      continue;
    }
    if (c === "\r" && senzaBom[i + 1] === "\n") {
      riga.push(cella);
      righe.push(riga);
      riga = [];
      cella = "";
      i += 1;
      continue;
    }
    cella += c;
  }

  riga.push(cella);
  righe.push(riga);
  return righe;
};

/* ========================================================================== */
/* Le righe di prova                                                           */
/* ========================================================================== */

const riga = (over = {}) => ({
  id: "accounting-entry:m-1",
  organizationId: "club-1",
  entryDate: "2026-09-15T10:00:00.000Z",
  fiscalYear: 2026,
  seasonId: "2026-27",
  direction: "IN",
  amountCents: 123_456,
  currency: "EUR",
  financialAccountId: "conto-cassa",
  financialAccountName: "Cassa",
  operationTypeCode: "quota_attivita",
  operationTypeLabel: "Quota attivita",
  activityScope: "institutional",
  description: "Quota di settembre",
  notes: null,
  paymentMethod: "Contanti",
  counterpartyKind: "ATHLETE",
  counterpartyId: "atleta-1",
  counterpartyLabel: "Mario Rossi",
  sourceDomain: "MANUAL",
  sourceId: null,
  documentKind: null,
  documentId: null,
  documentNumber: null,
  siteId: null,
  reconciliationStatus: "unreconciled",
  valueDate: null,
  bankReference: null,
  transferGroupId: null,
  reversalOfId: null,
  reversedAt: null,
  reversalReason: null,
  createdBy: null,
  createdAt: "2026-09-15T10:00:00.000Z",
  canEdit: false,
  canDelete: false,
  canReverse: false,
  canReconcile: false,
  ...over,
});

const colonna = (nome) =>
  ACCOUNTING_EXPORT_COLUMNS.findIndex((c) => c.label === nome);

/* ================================================== scenario 43: il tracciato */

test("il file si apre in Excel italiano: BOM, punto e virgola, CRLF", () => {
  const { csv } = buildAccountingExportCsv([riga()]);

  assert.ok(csv.startsWith(CSV_BOM), "senza BOM Excel legge «NicolÃ²»");
  assert.equal(CSV_DELIMITER, ";");
  assert.equal(CSV_EOL, "\r\n");
  assert.ok(csv.includes("\r\n"), "la fine riga non e quella che Excel si aspetta");
  assert.ok(
    csv.slice(CSV_BOM.length).startsWith("Data;Numero documento;"),
    "l'intestazione non e la prima riga del file",
  );
});

test("il BOM c'e una volta sola, anche se il testo ci ripassa", () => {
  const { csv } = buildAccountingExportCsv([riga()]);
  assert.equal(csv.indexOf(CSV_BOM), 0);
  assert.equal(csv.lastIndexOf(CSV_BOM), 0);
});

test("l'intestazione c'e anche a zero righe", () => {
  const { csv, rowCount } = buildAccountingExportCsv([]);
  const righe = parseCsv(csv);

  assert.equal(rowCount, 0);
  assert.equal(righe.length, 1, "un file vuoto senza intestazione sembra un export fallito");
  assert.equal(righe[0].length, ACCOUNTING_EXPORT_COLUMNS.length);
});

/* ============================================ scenario 41: mille movimenti === */

test("mille movimenti esportati: tutte le colonne, nessuna riga persa", () => {
  const righe = Array.from({ length: 1000 }, (_, indice) =>
    riga({
      id: `accounting-entry:m-${indice}`,
      description: `Movimento numero ${indice}`,
      amountCents: 1000 + indice,
      direction: indice % 2 === 0 ? "IN" : "OUT",
    }),
  );

  const { csv, rowCount } = buildAccountingExportCsv(righe);
  const lette = parseCsv(csv);

  assert.equal(rowCount, 1000);
  assert.equal(lette.length, 1001, "intestazione piu mille righe");

  /* Tutte le colonne del §27 ci sono, e con il nome dichiarato. */
  assert.deepEqual(
    lette[0],
    ACCOUNTING_EXPORT_COLUMNS.map((c) => c.label),
  );

  for (const [indice, letta] of lette.slice(1).entries()) {
    assert.equal(
      letta.length,
      ACCOUNTING_EXPORT_COLUMNS.length,
      `la riga ${indice} ha un numero di celle diverso dall'intestazione`,
    );
  }

  /* Nessuna riga persa: la prima e l'ultima si riconoscono per descrizione. */
  const descrizioni = lette.slice(1).map((r) => r[colonna("Descrizione")]);
  assert.equal(descrizioni[0], "Movimento numero 0");
  assert.equal(descrizioni[999], "Movimento numero 999");
  assert.equal(new Set(descrizioni).size, 1000);
});

/* ====================== scenario 42: la virgola e il ritorno a capo === */

test("un importo con la virgola e una nota con un ritorno a capo non spezzano una riga", () => {
  const { csv } = buildAccountingExportCsv([
    riga({
      amountCents: 123_456,
      notes: "Pagato allo sportello\r\nRicevuta consegnata a mano",
      description: "Affitto; palestra",
    }),
  ]);

  const lette = parseCsv(csv);

  assert.equal(lette.length, 2, "il file deve avere intestazione e una riga sola");
  assert.equal(lette[1].length, ACCOUNTING_EXPORT_COLUMNS.length);

  assert.equal(lette[1][colonna("Entrata")], "1234,56");
  assert.equal(
    lette[1][colonna("Descrizione")],
    "Affitto; palestra",
    "il punto e virgola dentro una cella non deve creare una colonna",
  );
  assert.match(
    lette[1][colonna("Note")],
    /Pagato allo sportello[\r\n]+Ricevuta consegnata a mano/,
    "la nota su due righe deve restare dentro la sua cella",
  );

  /*
    La prova che il difetto storico non e tornato: il `\r` dentro la cella e
    virgolettato. Senza virgolette, chi apre il file vede un movimento in piu
    che nessuno ha registrato.
  */
  assert.ok(
    csv.includes('"Pagato allo sportello\r\nRicevuta consegnata a mano"'),
    "il ritorno a capo non e stato virgolettato",
  );
});

test("gli importi escono con la virgola decimale, che in un foglio italiano e un numero", () => {
  const { csv } = buildAccountingExportCsv([riga({ amountCents: 1250 })]);
  const lette = parseCsv(csv);

  assert.equal(lette[1][colonna("Entrata")], "12,5");
  assert.ok(
    !lette[1][colonna("Entrata")].includes("."),
    "un importo col punto, in un foglio italiano, e testo e non si somma",
  );
});

/* ============================================ entrata e uscita, due colonne === */

test("entrata e uscita sono due colonne distinte, e nessun importo porta il segno", () => {
  const { csv } = buildAccountingExportCsv([
    riga({ direction: "IN", amountCents: 10_000 }),
    riga({ id: "b", direction: "OUT", amountCents: 4_550 }),
  ]);

  const [, entrata, uscita] = parseCsv(csv);

  assert.equal(entrata[colonna("Entrata")], "100");
  assert.equal(
    entrata[colonna("Uscita")],
    "",
    "una cella a zero verrebbe sommata: in una riga di entrata l'uscita non esiste",
  );

  assert.equal(uscita[colonna("Uscita")], "45,5");
  assert.equal(uscita[colonna("Entrata")], "");

  assert.ok(!csv.includes("-"), "nessun importo esce con il segno");
});

test("un importo che arrivasse gia negativo esce comunque senza segno", () => {
  /*
    Le righe proiettate nascono da domini che usano il segno per distinguere
    uno storno. La proiezione lo normalizza, ma il file non deve dipendere da
    quella cortesia.
  */
  const { csv } = buildAccountingExportCsv([
    riga({ direction: "OUT", amountCents: -7_700 }),
  ]);
  const lette = parseCsv(csv);

  assert.equal(lette[1][colonna("Uscita")], "77");
  assert.equal(lette[1][colonna("Entrata")], "");
});

/* ================================== la classificazione congelata sulla riga === */

test("la classificazione esportata e quella congelata sulla riga", () => {
  /*
    La funzione **non riceve** il catalogo delle causali, e non puo
    consultarlo: se domani il club correggesse «Quota attivita» da
    istituzionale a commerciale, questa riga uscirebbe comunque commerciale
    perche cosi era il giorno in cui il movimento e stato registrato.
  */
  const { csv } = buildAccountingExportCsv([
    riga({ activityScope: "commercial", operationTypeLabel: "Quota attivita" }),
  ]);
  const lette = parseCsv(csv);

  assert.equal(lette[1][colonna("Classificazione")], "Commerciale");

  const nonClassificata = parseCsv(
    buildAccountingExportCsv([riga({ activityScope: "unspecified" })]).csv,
  );
  assert.equal(
    nonClassificata[1][colonna("Classificazione")],
    "Non classificato",
    "cio che nessuno ha classificato si dichiara, non si lascia vuoto",
  );
});

test("l'etichetta della controparte e quella congelata, con il suo tipo accanto", () => {
  const lette = parseCsv(
    buildAccountingExportCsv([
      riga({ counterpartyKind: "SPONSOR", counterpartyLabel: "Bar dello Sport" }),
    ]).csv,
  );

  assert.equal(lette[1][colonna("Controparte")], "Bar dello Sport");
  assert.equal(lette[1][colonna("Tipo controparte")], "Sponsor");
});

/* ================================ anno fiscale, riconciliazione, origine === */

test("anno fiscale e stato di riconciliazione ci sono, e li chiede sempre un commercialista", () => {
  const lette = parseCsv(
    buildAccountingExportCsv([
      riga({ fiscalYear: 2026, reconciliationStatus: "reconciled" }),
    ]).csv,
  );

  assert.ok(colonna("Anno fiscale") >= 0);
  assert.ok(colonna("Riconciliazione") >= 0);
  assert.equal(lette[1][colonna("Anno fiscale")], "2026");
  assert.equal(lette[1][colonna("Riconciliazione")], "Riconciliato");
});

test("l'origine dice da dove viene il numero", () => {
  const lette = parseCsv(
    buildAccountingExportCsv([
      riga({ sourceDomain: "ATHLETE_PAYMENT" }),
      riga({ id: "b", sourceDomain: "SPORT_WORK_PAYOUT", direction: "OUT" }),
      riga({ id: "c", sourceDomain: "INTERNAL_TRANSFER" }),
    ]).csv,
  );

  assert.deepEqual(
    lette.slice(1).map((r) => r[colonna("Origine")]),
    ["Incasso quota", "Compenso lavoro sportivo", "Giroconto"],
  );
});

test("una riga stornata lo dice nella sua cella", () => {
  const lette = parseCsv(
    buildAccountingExportCsv([
      riga({ reversedAt: "2026-10-01T09:00:00.000Z" }),
    ]).csv,
  );

  assert.equal(lette[1][colonna("Stornato il")], "01/10/2026");
});

/* ============================================================ la data === */

test("la data e italiana e letta in UTC, come l'anno fiscale", () => {
  assert.equal(formatExportDate("2026-01-01T00:30:00.000Z"), "01/01/2026");
  assert.equal(formatExportDate("2026-12-31T23:30:00.000Z"), "31/12/2026");
  assert.equal(formatExportDate(null), "");
  assert.equal(formatExportDate("non una data"), "");

  const lette = parseCsv(
    buildAccountingExportCsv([
      riga({ entryDate: "2027-01-01T00:10:00.000Z", fiscalYear: 2027 }),
    ]).csv,
  );

  assert.equal(lette[1][colonna("Data")], "01/01/2027");
  assert.equal(
    lette[1][colonna("Anno fiscale")],
    "2027",
    "data e anno fiscale devono raccontare lo stesso giorno",
  );
});

/* ==================================================== l'IVA, quando c'e === */

test("imponibile e imposta escono quando la riga li porta, e restano vuoti quando non ci sono", () => {
  const conIva = parseCsv(
    buildAccountingExportCsv([
      riga({ taxableCents: 100_000, vatCents: 22_000, documentLabel: "Fattura", documentNumber: "2026/12" }),
    ]).csv,
  );

  assert.equal(conIva[1][colonna("Imponibile IVA")], "1000");
  assert.equal(conIva[1][colonna("IVA")], "220");
  assert.equal(conIva[1][colonna("Documento")], "Fattura");
  assert.equal(conIva[1][colonna("Numero documento")], "2026/12");

  const senzaIva = parseCsv(buildAccountingExportCsv([riga()]).csv);
  assert.equal(
    senzaIva[1][colonna("IVA")],
    "",
    "uno zero direbbe «imposta zero», che e un'altra cosa da «non c'e IVA»",
  );
});

/* ========================================== le parole che non si possono dire */

test("nessuna intestazione e nessun nome di file rivendica una validita che non ha", () => {
  const { csv, fileName } = buildAccountingExportCsv([riga()], {
    generatedAt: new Date("2026-08-29T12:00:00.000Z"),
  });

  const testo = `${csv} ${fileName} ${ACCOUNTING_EXPORT_TITLE}`.toLowerCase();
  for (const parola of PAROLE_VIETATE) {
    assert.ok(!testo.includes(parola), `l'export rivendica «${parola}»`);
  }

  for (const { label } of ACCOUNTING_EXPORT_COLUMNS) {
    for (const parola of PAROLE_VIETATE) {
      assert.ok(
        !label.toLowerCase().includes(parola),
        `la colonna «${label}» rivendica «${parola}»`,
      );
    }
  }
});

test("un nome di file che rivendicasse una validita viene rifiutato, non ripulito", () => {
  assert.throws(
    () => buildAccountingExportCsv([riga()], { fileNameBase: "Prima nota ufficiale" }),
    /ufficiale/i,
  );
});

test("il nome del file dice cosa contiene e quando e stato prodotto", () => {
  const { fileName } = buildAccountingExportCsv([riga()], {
    fileNameBase: "Prima nota 2026",
    generatedAt: new Date("2026-08-29T12:00:00.000Z"),
  });

  assert.equal(fileName, "prima-nota-2026-2026-08-29.csv");
});

/* ================================================ la cella e un dato, non codice */

test("una descrizione che sembra una formula non diventa una formula all'apertura", () => {
  const lette = parseCsv(
    buildAccountingExportCsv([
      riga({ description: '=HYPERLINK("http://esempio.invalid";"clicca")' }),
    ]).csv,
  );

  assert.ok(
    lette[1][colonna("Descrizione")].startsWith("'="),
    "la neutralizzazione della formula appartiene al tracciato e deve valere anche qui",
  );
});

/* ================================================== la riga, cella per cella */

test("la riga del foglio si compone da sola, e ogni chiave e una colonna dichiarata", () => {
  const composta = toAccountingExportRow(riga());
  const chiaviDichiarate = ACCOUNTING_EXPORT_COLUMNS.map((c) => c.key);

  assert.deepEqual(Object.keys(composta).sort(), [...chiaviDichiarate].sort());
});
