import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  CSV_BOM,
  CSV_DELIMITER,
  CSV_EOL,
  buildCsvBlob,
  csvEscape,
  csvFileName,
  csvValue,
  downloadCsv,
  toCsv,
} from "../../src/lib/csv.ts";

import {
  exportPeopleCsv,
  personExportColumns,
  personExportValue,
} from "../../src/lib/person-export.ts";

/**
 * W1-D — export CSV delle quattro anagrafiche.
 *
 * Il rischio di questo lavoro non era scrivere un CSV: era scriverne un
 * quinto. Ne esistevano gia due divergenti, e nessuno dei due proteggeva il
 * ritorno a capo. Questi test difendono **un tracciato solo**, e difendono il
 * caso che rompe i file veri: accenti, apostrofi, cognomi composti.
 */

// --- il tracciato ------------------------------------------------------------

test("il tracciato e punto e virgola e CRLF", () => {
  const csv = toCsv(
    [
      { key: "a", label: "Cognome" },
      { key: "b", label: "Nome" },
    ],
    [{ a: "Rossi", b: "Anna" }],
  );

  assert.equal(CSV_DELIMITER, ";");
  assert.equal(CSV_EOL, "\r\n");
  assert.equal(csv, "Cognome;Nome\r\nRossi;Anna");
});

test("l'intestazione c'e anche a zero righe", () => {
  const csv = toCsv(
    [
      { key: "a", label: "Cognome" },
      { key: "b", label: "Nome" },
    ],
    [],
  );

  // Un file senza intestazione non si distingue da un export fallito.
  assert.equal(csv, "Cognome;Nome");
});

test("una cella assente e vuota, non «null»", () => {
  assert.equal(csvEscape(null), "");
  assert.equal(csvEscape(undefined), "");
  assert.equal(
    toCsv([{ key: "a", label: "A" }, { key: "b", label: "B" }], [{ a: "x" }]),
    "A;B\r\nx;",
  );
});

// --- quoting -----------------------------------------------------------------

test("si virgoletta cio che spaccherebbe la riga o la colonna", () => {
  assert.equal(csvEscape("Rossi; Bianchi"), '"Rossi; Bianchi"');
  assert.equal(csvEscape('Detto "il Lungo"'), '"Detto ""il Lungo"""');
  assert.equal(csvEscape("Via Roma 1\nMilano"), '"Via Roma 1\nMilano"');
});

/**
 * Il ritorno a capo isolato: e il caso che mancava a entrambe le
 * implementazioni preesistenti. Una nota incollata da Windows porta `\r\n`, e
 * senza virgolette quella riga si spezza in due — chi apre il file trova una
 * persona in piu che nessuno ha censito.
 */
test("anche il solo ritorno a capo viene virgolettato", () => {
  assert.equal(csvEscape("Prima\rSeconda"), '"Prima\rSeconda"');
  assert.equal(csvEscape("Prima\r\nSeconda"), '"Prima\r\nSeconda"');

  const csv = toCsv(
    [{ key: "note", label: "Note" }],
    [{ note: "Prima\r\nSeconda" }],
  );

  // Tre righe fisiche, ma **due** righe logiche: intestazione e un record.
  assert.equal(csv, 'Note\r\n"Prima\r\nSeconda"');
});

test("i numeri escono con la virgola decimale", () => {
  assert.equal(csvValue(12.5), "12,5");
  assert.equal(csvValue(0), "0");
  // Il testo resta testo: un codice fiscale non e un numero.
  assert.equal(csvValue("12.5"), "12.5");
});

// --- Unicode ed Excel --------------------------------------------------------

test("accenti, apostrofi e cognomi composti escono intatti", () => {
  const columns = [
    { key: "lastName", label: "Cognome" },
    { key: "firstName", label: "Nome" },
    { key: "fiscalCode", label: "Codice fiscale" },
    { key: "birthDate", label: "Data di nascita" },
  ];

  const csv = toCsv(columns, [
    {
      lastName: "D'Angelo",
      firstName: "Nicolò",
      fiscalCode: "DNGNCL90A01H501X",
      birthDate: "01/01/1990",
    },
    {
      lastName: "De Luca Rossi",
      firstName: "Maria Assunta",
      fiscalCode: "DLCMSS85M41F205Y",
      birthDate: "01/08/1985",
    },
  ]);

  const lines = csv.split(CSV_EOL);
  assert.equal(lines.length, 3);
  assert.equal(lines[1], "D'Angelo;Nicolò;DNGNCL90A01H501X;01/01/1990");
  assert.equal(lines[2], "De Luca Rossi;Maria Assunta;DLCMSS85M41F205Y;01/08/1985");

  // Ne l'apostrofo ne lo spazio sono separatori: niente virgolette qui.
  assert.doesNotMatch(csv, /"/);
});

test("il file scaricato porta il BOM, o Excel legge «NicolÃ²»", async () => {
  const blob = buildCsvBlob("Cognome;Nome\r\nD'Angelo;Nicolò");
  const bytes = new Uint8Array(await blob.arrayBuffer());

  assert.equal(CSV_BOM, String.fromCharCode(0xfeff));

  // I byte, non il testo: `blob.text()` il BOM lo consuma decodificando, ed
  // e proprio quel byte che deve arrivare fino a Excel.
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);

  // La «o» accentata resta due byte UTF-8 e torna intera.
  assert.match(new TextDecoder().decode(bytes), /Nicolò/);
  assert.match(blob.type, /charset=utf-8/);
});

test("fuori dal browser il download non esplode: dice di no", () => {
  // Il chiamante e un gestore di click: un'eccezione li e una pagina bianca.
  assert.equal(typeof globalThis.window, "undefined");
  assert.equal(downloadCsv("atleti.csv", "A;B"), false);
});

test("il nome file e uno slug con la data", () => {
  const day = new Date(2026, 7, 28);

  assert.equal(csvFileName("Elenco Atleti", day), "elenco-atleti-2026-08-28.csv");
  assert.equal(csvFileName("Elenco Allenatori", day), "elenco-allenatori-2026-08-28.csv");
  // Accenti e punteggiatura non finiscono in un nome di file.
  assert.equal(csvFileName("Società Sportiva!", day), "societa-sportiva-2026-08-28.csv");
});

// --- lo stesso elenco del PDF ------------------------------------------------

const PERSON = {
  surname: "D'Angelo",
  name: "Nicolò",
  email: "nicolo@example.org",
  phone: "3331234567",
  fiscalCode: "DNGNCL90A01H501X",
  status: "active",
};

test("il CSV ha le stesse colonne del PDF, a parita di colonne visibili", () => {
  for (const entity of ["trainers", "staff", "members"]) {
    for (const visibleColumns of [
      null,
      { name: true, email: true, phone: true, status: true },
      { name: true, email: false, phone: false, status: false },
    ]) {
      // Le colonne del PDF: se il CSV ne prendesse altre, i due file
      // direbbero due cose diverse della stessa selezione.
      const columns = personExportColumns(entity, visibleColumns);

      const csv = toCsv(
        columns,
        [
          Object.fromEntries(
            columns.map((column) => [
              column.key,
              personExportValue(PERSON, column.key),
            ]),
          ),
        ],
      );

      const [header, row] = csv.split(CSV_EOL);

      assert.equal(header, columns.map((column) => column.label).join(CSV_DELIMITER));
      assert.equal(row.split(CSV_DELIMITER).length, columns.length);
      assert.match(row, /D'Angelo/);
      assert.match(row, /DNGNCL90A01H501X/);
    }
  }
});

test("le colonne senza interruttore restano sempre", () => {
  const keys = personExportColumns("members", {
    name: false,
    email: false,
    phone: false,
    status: false,
    membershipDate: false,
  }).map((column) => column.key);

  /*
    Codice fiscale e taglie in tabella non ci stanno, in un export servono.

    Dalla Wave 4 (W4-F) valgono lo stesso per i tre campi del libro soci:
    quando e stata ammessa quella persona, quando e uscita e perche. Un elenco
    di soci stampato senza il «perche» e cio che il libro attuale gia sa fare,
    e non basta. Lo **stato** nel libro non e qui perche segue l'interruttore
    della colonna «Stato», che qui e spento.
  */
  assert.deepEqual(keys, [
    "fiscalCode",
    "clothingSizes",
    "type",
    "membershipNumber",
    "admissionDate",
    "cessationDate",
    "cessationReason",
  ]);
});

test("esportare un elenco vuoto e un errore con un nome", () => {
  const result = exportPeopleCsv({
    entity: "trainers",
    people: [],
    clubName: "ASD Prova",
    visibleColumns: null,
    scope: "selected",
  });

  assert.deepEqual(result, { ok: false, reason: "empty" });
});

/**
 * Fuori dal browser `downloadCsv` non fa niente e ritorna `false`, ma
 * l'export **non** deve dichiararsi fallito per quello: il fallimento che ha
 * un messaggio per l'utente e uno solo, «non c'e niente da esportare».
 */
test("con delle righe l'export riesce e dichiara quante", () => {
  const result = exportPeopleCsv({
    entity: "members",
    people: [PERSON, { ...PERSON, surname: "De Luca Rossi" }],
    clubName: "ASD Prova",
    visibleColumns: null,
    scope: "all",
  });

  assert.deepEqual(result, { ok: true, count: 2 });
});

// --- una implementazione sola ------------------------------------------------

const SRC = path.join(process.cwd(), "src");

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
};

/**
 * Sullo stile del test «un solo generatore di PDF».
 *
 * Le due implementazioni in allowlist sono preesistenti e vanno fatte
 * convergere su `src/lib/csv.ts` (debito registrato in 16). L'allowlist esiste
 * per **non farne nascere una terza** nel frattempo: chi ne aggiunge una qui
 * deve prima spiegare perche il tracciato condiviso non basta.
 */
test("il tracciato CSV lo decide un modulo solo", () => {
  const ALLOWED = [
    "lib/csv.ts",
    "lib/funding/reconciliation.ts",
      ];

  const offenders = walk(SRC)
    .filter((file) => {
      const source = readFileSync(file, "utf8");
      return (
        /\.join\(";"\)/.test(source) || /replace\(\/"\/g,\s*'""'\)/.test(source)
      );
    })
    .map((file) => path.relative(SRC, file).replace(/\\/g, "/"))
    .filter((file) => !ALLOWED.includes(file));

  assert.deepEqual(
    offenders,
    [],
    "un secondo tracciato CSV diverge al primo campo con un punto e virgola dentro",
  );
});

test("una cella che sembra una formula non viene eseguita dal foglio di calcolo", () => {
  /*
    Il difetto che questo test chiude, trovato dall'audit di fine Wave: una
    cella che comincia per `=`, `+`, `-` o `@` e una **formula** per Excel e
    LibreOffice. Il contenuto di questi file arriva dall'anagrafica, che la
    compilano gli utenti e che si popola anche per import: un cognome scritto
    `=HYPERLINK(...)` verrebbe eseguito sul computer di chi apre il file.
  */
  for (const pericoloso of [
    '=HYPERLINK("http://esempio.test","clicca")',
    '+HYPERLINK("http://esempio.test","clicca")',
    "-A1+B2",
    "@SUM(A1:A9)",
  ]) {
    const cella = csvEscape(pericoloso);
    assert.ok(
      cella.startsWith("'") || cella.startsWith("\"'"),
      `«${pericoloso}» deve uscire come testo, non come formula: ${cella}`,
    );
  }

  assert.equal(csvEscape("Rossi"), "Rossi", "il testo normale non si tocca");
  assert.equal(
    csvEscape("De Luca-Rossi"),
    "De Luca-Rossi",
    "un trattino in mezzo non e una formula",
  );
});

test("un importo negativo resta un numero, non diventa testo", () => {
  assert.equal(
    csvValue(-12.5),
    "-12,5",
    "la neutralizzazione delle formule non deve rovinare una colonna di importi",
  );
  assert.equal(csvValue(12.5), "12,5");
});

test("un numero di telefono internazionale non viene sporcato", () => {
  /*
    La prima versione della difesa neutralizzava **ogni** valore che cominciasse
    per `+` o `-`. La colonna «Telefono» delle quattro anagrafiche contiene
    numeri come `+39 333 1234567`: uscivano tutti con un apice davanti, che in
    un CSV importato **si vede**. La difesa serviva contro le formule, e un
    prefisso internazionale non lo e.
  */
  assert.equal(csvEscape("+39 333 1234567"), "+39 333 1234567");
  assert.equal(csvEscape("-"), "-");
  assert.equal(csvEscape("+39-02-1234567"), "+39-02-1234567");

  // Ma cio che somiglia a una formula resta neutralizzato anche col segno.
  // Il quoting puo avvolgere il valore: cio che conta e che l'apice ci sia
  // **prima** del segno.
  assert.ok(
    csvEscape('+HYPERLINK("http://x")').includes("'+HYPERLINK"),
    "una formula col segno resta neutralizzata",
  );
  assert.ok(csvEscape("-1+SUM(A1:A2)").includes("'-1+SUM"));
});
