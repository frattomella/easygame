import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..");
const readSource = (relative) =>
  readFileSync(path.join(PROJECT_ROOT, relative), "utf8");

import {
  detectCsvDelimiter,
  guessAthleteImportMapping,
  normalizeImportedAthletes,
  parseCsvText,
  parseXmlText,
  summarizeImportPlan,
  toImportPayload,
  toIsoDate,
} from "../../src/lib/athlete-import.ts";

/**
 * Blocco 4 — import atleti.
 *
 * Prima di questa riscrittura il CSV veniva letto da SheetJS, che indovina il
 * separatore, e l'XML da `DOMParser`, che nei test non esiste: nessuno dei due
 * percorsi era verificabile. Questi test coprono esattamente i casi che
 * arrivano da un gestionale italiano.
 */

const CSV_ITALIANO = [
  "Cognome;Nome;Data di nascita;Categoria;Codice Fiscale",
  "Rossi;Mario;01/08/1985;Under 14;RSSMRA85M01H501Q",
  'Bianchi;"Anna Maria";1990-02-14;Under 12;',
  "Verdi;Luca;14/03/2010;Under 14;",
].join("\r\n");

test("il CSV con punto e virgola non finisce in una sola colonna", () => {
  assert.equal(detectCsvDelimiter(CSV_ITALIANO), ";");

  const { headers, rows } = parseCsvText(CSV_ITALIANO);
  assert.deepEqual(headers, [
    "Cognome",
    "Nome",
    "Data di nascita",
    "Categoria",
    "Codice Fiscale",
  ]);
  assert.equal(rows.length, 3);
  assert.equal(rows[1].Nome, "Anna Maria");
});

test("il CSV regge BOM, virgolette con separatore dentro e righe vuote", () => {
  const text =
    "﻿cognome,nome,note\n" +
    'Rossi,Mario,"nato a Roma, in centro"\n' +
    "\n" +
    'Bianchi,Anna,"virgolette ""doppie"""\n';

  const { headers, rows } = parseCsvText(text);
  assert.deepEqual(headers, ["cognome", "nome", "note"]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].note, "nato a Roma, in centro");
  assert.equal(rows[1].note, 'virgolette "doppie"');
});

test("l'XML viene letto senza DOMParser, con attributi ed entita", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <!-- export tesserati -->
    <societa nome="ASD Prova">
      <atleti>
        <atleta tessera="1001">
          <cognome>Rossi</cognome>
          <nome>Mario</nome>
          <nascita>1985-08-01</nascita>
          <categoria>Under &amp; Over</categoria>
        </atleta>
        <atleta tessera="1002">
          <cognome><![CDATA[Bianchi]]></cognome>
          <nome>Anna</nome>
          <nascita>14/03/2010</nascita>
          <categoria>Under 14</categoria>
        </atleta>
      </atleti>
    </societa>`;

  const { headers, rows } = parseXmlText(xml);
  assert.equal(rows.length, 2);
  assert.equal(headers.includes("tessera"), true);
  assert.equal(rows[0].cognome, "Rossi");
  assert.equal(rows[0].categoria, "Under & Over");
  assert.equal(rows[1].cognome, "Bianchi");
  assert.equal(rows[1].tessera, "1002");
});

test("le date ambigue non vengono interpretate all'americana", () => {
  assert.equal(toIsoDate("14/03/2010"), "2010-03-14");
  assert.equal(toIsoDate("03/14/2010"), "");
  assert.equal(toIsoDate("2010-03-14"), "2010-03-14");
  assert.equal(toIsoDate("2010-02-30"), "");
  assert.equal(toIsoDate("2010"), "2010-01-01");
  assert.equal(toIsoDate(""), "");
  // Seriale Excel: 1 agosto 1985.
  assert.equal(toIsoDate(31260), "1985-08-01");
});

test("la mappatura riconosce le intestazioni italiane piu comuni", () => {
  const mapping = guessAthleteImportMapping([
    "Cognome",
    "Nome",
    "Data di nascita",
    "Categoria",
    "Codice Fiscale",
    "E-mail",
    "Cellulare",
    "Sesso",
  ]);

  assert.equal(mapping.lastName, "Cognome");
  assert.equal(mapping.firstName, "Nome");
  assert.equal(mapping.birthDate, "Data di nascita");
  assert.equal(mapping.category, "Categoria");
  assert.equal(mapping.fiscalCode, "Codice Fiscale");
  assert.equal(mapping.email, "E-mail");
  assert.equal(mapping.phone, "Cellulare");
  assert.equal(mapping.gender, "Sesso");
});

const CATEGORIES = [{ id: "cat-u14", name: "Under 14" }];

test("le righe non importabili sono riconosciute prima di scrivere", () => {
  const { headers, rows } = parseCsvText(
    [
      "Cognome;Nome;Data di nascita;Codice Fiscale;Email",
      "Rossi;Mario;01/08/1985;RSSMRA85M01H501Q;mario@example.com",
      "Bianchi;;1990-02-14;;anna@example.com",
      "Verdi;Luca;data-sbagliata;;luca@example.com",
      "Neri;Sara;2010-03-14;CODICE-FINTO;sara@example.com",
      "Gialli;Ugo;2010-03-14;;non-una-email",
    ].join("\n"),
  );

  const normalized = normalizeImportedAthletes(
    rows,
    guessAthleteImportMapping(headers),
    CATEGORIES,
  );

  assert.equal(normalized.length, 5);
  assert.equal(normalized[0].status, "ready");
  assert.deepEqual(normalized[1].errors, ["Nome mancante"]);
  assert.match(normalized[2].errors[0], /Data di nascita non riconosciuta/);
  assert.deepEqual(normalized[3].errors, ["Codice fiscale non valido"]);
  assert.deepEqual(normalized[4].errors, ["Email non valida"]);

  const summary = summarizeImportPlan(normalized);
  assert.deepEqual(summary, {
    total: 5,
    importable: 1,
    discarded: 4,
    withWarnings: 1,
  });
});

test("i duplicati, nel file e nel club, non vengono importati due volte", () => {
  const { headers, rows } = parseCsvText(
    [
      "Cognome;Nome;Data di nascita",
      "Rossi;Mario;01/08/1985",
      "Rossi;Mario;01/08/1985",
      "Bianchi;Anna;14/03/2010",
    ].join("\n"),
  );

  const normalized = normalizeImportedAthletes(
    rows,
    guessAthleteImportMapping(headers),
    CATEGORIES,
    {
      existingAthletes: [
        { firstName: "Anna", lastName: "Bianchi", birthDate: "2010-03-14" },
      ],
    },
  );

  assert.equal(normalized[0].status, "ready");
  assert.deepEqual(normalized[1].errors, ["Riga duplicata nel file"]);
  assert.deepEqual(normalized[2].errors, ["Atleta gia presente nel club"]);
  assert.equal(summarizeImportPlan(normalized).importable, 1);
});

test("il nominativo unico viene separato come Cognome Nome", () => {
  const { headers, rows } = parseCsvText(
    ["Nominativo;Data di nascita", "De Rossi Daniele;01/08/1985"].join("\n"),
  );

  const normalized = normalizeImportedAthletes(
    rows,
    guessAthleteImportMapping(headers),
    CATEGORIES,
  );

  assert.equal(normalized[0].lastName, "De Rossi");
  assert.equal(normalized[0].firstName, "Daniele");
  assert.equal(normalized[0].status, "ready");
});

test("il carico da scrivere contiene solo le righe valide", () => {
  const { headers, rows } = parseCsvText(
    [
      "Cognome;Nome;Data di nascita;Categoria",
      "Rossi;Mario;01/08/1985;Under 14",
      "Bianchi;;1990-02-14;Under 14",
      "Verdi;Luca;14/03/2010;Under 16",
    ].join("\n"),
  );

  const normalized = normalizeImportedAthletes(
    rows,
    guessAthleteImportMapping(headers),
    CATEGORIES,
  );
  const payload = toImportPayload(normalized);

  assert.equal(payload.length, 2);
  assert.deepEqual(
    payload.map((row) => row.rowNumber),
    [1, 3],
    "il numero di riga sopravvive allo scarto: il riepilogo deve poterla citare",
  );
  assert.equal(payload[0].categoryId, "cat-u14");
  // Categoria non ancora esistente: il nome resta, l'id no.
  assert.equal(payload[1].categoryId, null);
  assert.equal(payload[1].categoryLabel, "Under 16");
});

/* ---------------- L'import non fa una richiesta per atleta (§25) ---------- */

/**
 * **Il difetto misurato.** Il dialogo di import chiamava `addClubAthlete`
 * dentro un ciclo: duecento atleti erano duecento inserimenti **piu**
 * duecento scritture di appartenenza, in fila, ognuna con il suo giro sulla
 * rete. Su una connessione di palestra l'import di una squadra durava minuti,
 * e chiudere la finestra a meta lasciava l'archivio a meta.
 *
 * I test guardano il sorgente perche il percorso passa dall'adapter HTTP:
 * eseguirlo qui vorrebbe dire montare un server. Cio che va presidiato e la
 * **forma** — a scaglioni, con ripiego riga per riga — non il numero di
 * millisecondi.
 */
test("l'import passa dal lettore a scaglioni, non da un ciclo", () => {
  const page = readSource("src/app/athletes/page.tsx");

  assert.match(page, /addClubAthletesBatch\(/);
  assert.doesNotMatch(
    page,
    /for \(const row of importedRows\)/,
    "una richiesta per atleta e cio che questo lavoro toglie",
  );
});

test("uno scaglione che fallisce non porta via le righe buone", () => {
  const db = readSource("src/lib/simplified-db.ts");
  const batch = db.slice(db.indexOf("export async function addClubAthletesBatch"));

  assert.match(
    batch.slice(0, 1800),
    /for \(let index = 0; index < chunk\.length; index \+= 1\)/,
    "il ripiego riga per riga serve a sapere **quale** anagrafica era sbagliata",
  );
  assert.match(
    batch.slice(0, 1800),
    /failedIndexes\.push\(start \+ index\)/,
    "chi ha importato deve poter correggere la riga giusta",
  );
});

test("la riga di un atleta si costruisce in un posto solo", () => {
  const db = readSource("src/lib/simplified-db.ts");
  const occorrenze = db.match(/club_id: clubId,\n    first_name:/g) || [];

  assert.equal(
    occorrenze.length,
    1,
    "due copie della stessa riga divergono al primo campo aggiunto",
  );
});
