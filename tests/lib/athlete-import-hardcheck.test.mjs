import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test, { afterEach, beforeEach } from "node:test";

import {
  guessAthleteImportMapping,
  normalizeImportedAthletes,
  parseAthleteImportFile,
  summarizeImportPlan,
  toImportPayload,
} from "../../src/lib/athlete-import.ts";
import { addClubAthletesBatch } from "../../src/lib/simplified-db.ts";

/**
 * RC Fix 1, punto 3 — collaudo dell'import atleti su file veri.
 *
 * I test del Blocco precedente coprivano i pezzi (separatore, BOM, date). Qui
 * si passa **un file intero** attraverso il percorso reale — lettura,
 * mappatura automatica, normalizzazione, riepilogo, carico — nelle
 * combinazioni che una segreteria produce davvero: export con il punto e
 * virgola, date italiane, righe incomplete, doppioni, una categoria che nel
 * club non esiste.
 *
 * Non e una riscrittura dell'importatore: e la rete che dice se quello che
 * c'e regge.
 */

const CATEGORIES = [
  { id: "cat-u14", name: "Under 14" },
  { id: "cat-u16", name: "Under 16" },
];

const file = (name, content, type = "text/plain") =>
  new File([content], name, { type });

const importa = async (name, content, options = {}) => {
  const parsed = await parseAthleteImportFile(file(name, content));
  const mapping = guessAthleteImportMapping(parsed.headers);
  const rows = normalizeImportedAthletes(parsed.rows, mapping, CATEGORIES, options);

  return { parsed, mapping, rows, summary: summarizeImportPlan(rows) };
};

// --- CSV --------------------------------------------------------------------

const CSV_PUNTO_E_VIRGOLA = `Cognome;Nome;Data di nascita;Categoria;Sesso;Email;Telefono
Rossi;Mario;14/05/2011;Under 14;M;mario.rossi@esempio.it;3331112222
Bianchi;Anna;03/12/2010;Under 16;F;anna.bianchi@esempio.it;3332223333
Verdi;Luca;22/09/2011;Under 14;M;;
Neri;Sara;;Under 16;F;sara@esempio.it;3334445555
Rossi;Mario;14/05/2011;Under 14;M;mario.rossi@esempio.it;3331112222
Gialli;Ugo;07/03/2012;Esordienti;M;ugo@esempio.it;3335556666
`;

test("un export con il punto e virgola si legge riga per riga", async () => {
  const { parsed, mapping, rows, summary } = await importa(
    "atleti.csv",
    CSV_PUNTO_E_VIRGOLA,
  );

  assert.equal(parsed.format, "CSV");
  assert.equal(parsed.rows.length, 6);
  assert.deepEqual(parsed.headers, [
    "Cognome",
    "Nome",
    "Data di nascita",
    "Categoria",
    "Sesso",
    "Email",
    "Telefono",
  ]);

  assert.equal(mapping.lastName, "Cognome");
  assert.equal(mapping.firstName, "Nome");
  assert.equal(mapping.birthDate, "Data di nascita");
  assert.equal(mapping.category, "Categoria");

  assert.deepEqual(summary, {
    total: 6,
    importable: 4,
    discarded: 2,
    withWarnings: 1,
  });

  const [mario, anna, luca, sara, doppione, ugo] = rows;

  assert.equal(mario.birthDate, "2011-05-14", "14/05 non e il 5 di maggio");
  assert.equal(mario.categoryId, "cat-u14");
  assert.equal(anna.gender, "F");
  assert.deepEqual(luca.errors, [], "email e telefono vuoti non sono errori");
  assert.equal(luca.email, "");
  assert.deepEqual(sara.errors, ["Data di nascita mancante"]);
  assert.deepEqual(doppione.errors, ["Riga duplicata nel file"]);
  assert.equal(
    ugo.categoryId,
    null,
    "«Esordienti» nel club non esiste: si crea, non si inventa un id",
  );
  assert.deepEqual(ugo.warnings, ['La categoria "Esordienti" verra creata']);
});

test("lo stesso file con la virgola da lo stesso risultato", async () => {
  const conVirgola = CSV_PUNTO_E_VIRGOLA.replace(/;/g, ",");
  const punto = await importa("atleti.csv", CSV_PUNTO_E_VIRGOLA);
  const virgola = await importa("atleti.csv", conVirgola);

  assert.deepEqual(
    toImportPayload(virgola.rows),
    toImportPayload(punto.rows),
    "il separatore e una scelta dell'export, non un dato",
  );
});

test("virgolette, virgole dentro il campo e BOM non spostano le colonne", async () => {
  const contenuto =
    '﻿Cognome,Nome,Data di nascita,Categoria\n' +
    '"De Rossi, jr",Daniele,"01/01/2011",Under 14\n' +
    '"Bianchi ""Nino""",Antonio,02/02/2011,Under 14\n';

  const { rows } = await importa("virgolette.csv", contenuto);

  assert.equal(rows[0].lastName, "De Rossi, jr");
  assert.equal(rows[0].firstName, "Daniele");
  assert.equal(rows[0].birthDate, "2011-01-01");
  assert.equal(rows[1].lastName, 'Bianchi "Nino"');
  assert.deepEqual(rows[1].errors, []);
});

test("un nominativo unico si separa in cognome e nome", async () => {
  const { rows } = await importa(
    "nominativo.csv",
    "Nominativo;Data nascita\nRossi Mario;14/05/2011\nDe Luca Anna;03/12/2010\n",
  );

  assert.equal(rows[0].lastName, "Rossi");
  assert.equal(rows[0].firstName, "Mario");
  assert.equal(
    rows[1].lastName,
    "De Luca",
    "negli export italiani l'ultima parola e il nome",
  );
  assert.equal(rows[1].firstName, "Anna");
});

test("una data ambigua non viene letta all'americana", async () => {
  const { rows } = await importa(
    "date.csv",
    "Cognome;Nome;Data di nascita\nRossi;Mario;03/12/2011\nBianchi;Anna;2011-12-03\nVerdi;Luca;2011\nNeri;Sara;12-03-2011\nGialli;Ugo;dicembre 2011\n",
  );

  assert.equal(rows[0].birthDate, "2011-12-03");
  assert.equal(rows[1].birthDate, "2011-12-03");
  assert.equal(rows[2].birthDate, "2011-01-01", "solo l'anno vale 1 gennaio");
  assert.equal(rows[3].birthDate, "2011-03-12");
  assert.equal(rows[4].birthDate, "");
  assert.match(rows[4].errors[0], /non riconosciuta \(dicembre 2011\)/);
});

test("«Nascita» e «Nato il» sono intestazioni di data come le altre", async () => {
  for (const intestazione of ["Nascita", "Nato il", "NATA IL", "Data_Nascita"]) {
    const { mapping, rows } = await importa(
      "intestazioni.csv",
      `Cognome;Nome;${intestazione}\nRossi;Mario;14/05/2011\n`,
    );

    assert.equal(
      mapping.birthDate,
      intestazione,
      `${intestazione}: la colonna della data non veniva riconosciuta e ogni riga finiva fra gli scarti`,
    );
    assert.equal(rows[0].birthDate, "2011-05-14");
    assert.deepEqual(rows[0].errors, []);
  }
});

test("un atleta gia nel club non viene importato due volte", async () => {
  const { rows, summary } = await importa("atleti.csv", CSV_PUNTO_E_VIRGOLA, {
    existingAthletes: [
      { firstName: "Anna", lastName: "Bianchi", birthDate: "2010-12-03" },
    ],
  });

  const anna = rows.find((row) => row.firstName === "Anna");
  assert.deepEqual(anna.errors, ["Atleta gia presente nel club"]);
  assert.equal(summary.importable, 3);
});

test("un codice fiscale o un'email non validi fermano la riga, non il file", async () => {
  const { rows, summary } = await importa(
    "controlli.csv",
    "Cognome;Nome;Data di nascita;Codice fiscale;Email\n" +
      "Rossi;Mario;14/05/2011;MRTMTT25D09F205Z;mario@esempio.it\n" +
      "Bianchi;Anna;03/12/2010;ABC;anna@esempio.it\n" +
      "Verdi;Luca;22/09/2011;;non-una-email\n",
  );

  assert.deepEqual(rows[0].errors, []);
  assert.deepEqual(rows[1].errors, ["Codice fiscale non valido"]);
  assert.deepEqual(rows[2].errors, ["Email non valida"]);
  assert.equal(summary.importable, 1);
  assert.equal(summary.discarded, 2);
});

test("un file senza righe leggibili non produce un import vuoto silenzioso", async () => {
  const { parsed, summary } = await importa(
    "vuoto.csv",
    "Cognome;Nome;Data di nascita\n\n\n",
  );

  assert.deepEqual(parsed.rows, []);
  assert.equal(summary.total, 0);
  assert.equal(summary.importable, 0);
});

test("un formato non gestito lo dice, invece di importare niente", async () => {
  await assert.rejects(
    () => parseAthleteImportFile(file("atleti.txt", "qualcosa")),
    /Formato file non supportato: usa CSV, XLS, XLSX o XML/,
  );
});

// --- XML --------------------------------------------------------------------

const XML_TESSERATI = `<?xml version="1.0" encoding="UTF-8"?>
<!-- export gestionale -->
<Tesserati stagione="2026/2027">
  <Atleta>
    <Cognome>Rossi</Cognome>
    <Nome>Mario</Nome>
    <DataNascita>14/05/2011</DataNascita>
    <Categoria>Under 14</Categoria>
    <Sesso>M</Sesso>
  </Atleta>
  <Atleta>
    <Cognome><![CDATA[Bianchi & Figli]]></Cognome>
    <Nome>Anna</Nome>
    <DataNascita>2010-12-03</DataNascita>
    <Categoria>Under 16</Categoria>
    <Sesso>F</Sesso>
  </Atleta>
  <Atleta>
    <Cognome>Verdi</Cognome>
    <Nome></Nome>
    <DataNascita>22/09/2011</DataNascita>
    <Categoria>Under 14</Categoria>
    <Sesso>M</Sesso>
  </Atleta>
</Tesserati>
`;

test("un XML anagrafico si legge senza DOMParser", async () => {
  const { parsed, mapping, rows, summary } = await importa(
    "tesserati.xml",
    XML_TESSERATI,
  );

  assert.equal(parsed.format, "XML");
  assert.equal(parsed.rows.length, 3);
  assert.deepEqual(parsed.headers, [
    "Cognome",
    "Nome",
    "DataNascita",
    "Categoria",
    "Sesso",
  ]);
  assert.equal(mapping.birthDate, "DataNascita");

  assert.equal(rows[0].birthDate, "2011-05-14");
  assert.equal(
    rows[1].lastName,
    "Bianchi & Figli",
    "una sezione CDATA e testo, non markup",
  );
  assert.deepEqual(rows[2].errors, ["Nome mancante"]);
  assert.equal(summary.importable, 2);
});

test("un XML con i dati negli attributi si legge lo stesso", async () => {
  const { rows } = await importa(
    "attributi.xml",
    '<lista><atleta cognome="Rossi" nome="Mario" nascita="14/05/2011"/>' +
      '<atleta cognome="Bianchi" nome="Anna" nascita="03/12/2010"/></lista>',
  );

  assert.equal(rows.length, 2);
  assert.equal(rows[0].lastName, "Rossi");
  assert.equal(rows[1].birthDate, "2010-12-03");
});

test("un XML illeggibile lo dice invece di restituire zero righe", async () => {
  await assert.rejects(
    () => parseAthleteImportFile(file("rotto.xml", "questo non e xml")),
    /Il file XML non e leggibile/,
  );
});

// --- scrittura: scaglioni, avanzamento, import parziale -----------------------

let fetchOriginale;
let richieste;
let fallisciScaglione;

beforeEach(() => {
  richieste = [];
  fallisciScaglione = false;
  fetchOriginale = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url);
    const body = options.body ? JSON.parse(options.body) : null;
    richieste.push({ path, method: options.method || "GET", body });

    const isInsertList =
      path.startsWith("/api/v1/simplified_athletes") &&
      options.method === "POST" &&
      Array.isArray(body?.data);

    if (isInsertList && fallisciScaglione) {
      return {
        ok: false,
        status: 400,
        statusText: "Bad Request",
        headers: { get: () => "application/json" },
        json: async () => ({
          data: null,
          error: { message: "scaglione rifiutato" },
        }),
      };
    }

    const rows = Array.isArray(body?.data) ? body.data : body?.data ? [body.data] : [];
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => "application/json" },
      json: async () => ({
        data: rows.map((row, index) => ({
          id: `nuovo-${richieste.length}-${index}`,
          ...row,
        })),
        error: null,
      }),
    };
  };
});

afterEach(() => {
  globalThis.fetch = fetchOriginale;
});

const righeDaScrivere = (count) =>
  Array.from({ length: count }, (_, index) => ({
    firstName: `Nome${index}`,
    lastName: `Cognome${index}`,
    birthDate: "2011-05-14",
    category: "cat-u14",
    categoryName: "Under 14",
    status: "active",
    data: {},
  }));

test("l'import va in scaglioni, non una richiesta per atleta", async () => {
  const { created, failedIndexes } = await addClubAthletesBatch(
    "club-1",
    righeDaScrivere(120),
  );

  assert.equal(created.length, 120);
  assert.deepEqual(failedIndexes, []);

  const inserimenti = richieste.filter(
    (request) =>
      request.method === "POST" &&
      request.path.startsWith("/api/v1/simplified_athletes"),
  );
  assert.equal(
    inserimenti.length <= 4,
    true,
    `centoventi atleti in ${inserimenti.length} richieste: erano centoventi`,
  );
});

test("l'avanzamento cresce e arriva al totale", async () => {
  const avanzamento = [];
  await addClubAthletesBatch("club-1", righeDaScrivere(120), {
    onProgress: (completed) => avanzamento.push(completed),
  });

  assert.equal(avanzamento.length > 1, true, "una barra a un passo non e una barra");
  assert.deepEqual(
    avanzamento,
    [...avanzamento].sort((left, right) => left - right),
    "l'avanzamento non torna indietro",
  );
  assert.equal(avanzamento[avanzamento.length - 1], 120);
});

test("uno scaglione rifiutato non porta via le righe buone", async () => {
  fallisciScaglione = true;

  const { created, failedIndexes } = await addClubAthletesBatch(
    "club-1",
    righeDaScrivere(3),
  );

  /*
    Lo scaglione fallisce e si riprova riga per riga: e la ragione per cui un
    import di duecento atleti con una anagrafica sbagliata ne scrive
    centonovantanove invece di zero.
  */
  assert.equal(created.length, 3);
  assert.deepEqual(failedIndexes, []);

  const singole = richieste.filter(
    (request) =>
      request.method === "POST" &&
      request.path.startsWith("/api/v1/simplified_athletes") &&
      !Array.isArray(request.body?.data),
  );
  assert.equal(singole.length, 3);
});

test("il riepilogo finale racconta l'import avvenuto, non il club di adesso", () => {
  /*
    Difetto trovato in UAT su staging, importando 223 righe: la finestra
    annunciava «IMPORTATI 220» accanto a «SCARTATI IN ANTEPRIMA 202», ed
    elencava come «Atleta gia presente nel club» proprio le righe appena
    scritte. L'anteprima si ricalcola quando cambiano le anagrafiche del club,
    e a import concluso quelle anagrafiche comprendono i nuovi atleti.

    Numeri che non tornano fanno dubitare di un import riuscito: il riepilogo
    deve mostrare il piano **congelato** al momento di premere Importa.
  */
  const source = readFileSync(
    path.join(process.cwd(), "src/components/forms/AthleteImportDialog.tsx"),
    "utf8",
  );

  assert.match(source, /setCommittedPlan\(\{ rows: previewRows, summary \}\)/);
  assert.match(source, /const committedSummary = committedPlan\?\.summary \?\? summary/);
  assert.match(source, /const committedRows = committedPlan\?\.rows \?\? previewRows/);

  const done = source.slice(source.indexOf('step === "done"'));
  assert.equal(
    /value=\{summary\.discarded\}/.test(done),
    false,
    "il riepilogo finale non deve leggere l'anteprima ricalcolata",
  );
  assert.match(done, /committedSummary\.discarded/);
  assert.match(done, /\{committedRows/);
});

test("nessuna riga scritta senza il club", async () => {
  await addClubAthletesBatch("club-1", righeDaScrivere(2));

  const inserimenti = richieste.filter((request) => request.method === "POST");
  for (const request of inserimenti) {
    const rows = Array.isArray(request.body?.data)
      ? request.body.data
      : [request.body?.data];
    for (const row of rows) {
      assert.equal(
        row?.club_id || row?.organization_id,
        "club-1",
        "un atleta senza club finisce in nessun archivio, o in quello sbagliato",
      );
    }
  }
});
