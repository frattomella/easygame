import assert from "node:assert/strict";
import test from "node:test";

import { parseScannedDocument } from "../../src/lib/document-scan.ts";
import { buildExtractionFromText } from "../../src/lib/document-extraction.ts";

/**
 * Nome e cognome letti da un documento: i casi che hanno rotto il parser
 * (Blocco 8, punto C).
 *
 * **Il difetto, e perche era rimasto aperto a meta.** Il Blocco 7 aveva
 * corretto la riga `COGNOME/SURNAME`: senza la correzione, `NOME` combaciava
 * dentro `COGNOME` e il **nome** dell'atleta veniva proposto come «Surname».
 * Ma bastava che l'OCR restituisse la stessa riga in una delle sue altre
 * forme reali perche il difetto tornasse, sotto un'altra faccia:
 *
 *     COGNOME / SURNAME     → cognome proposto: «Surname»
 *     NOME/GIVEN NAMES      → nome proposto: «S»
 *
 * Il secondo e il peggiore, perche non sembra un errore: e il resto di
 * `GIVEN NAME` dopo che l'etichetta e stata tolta, e in un campo «Nome» una
 * S sola passa per un'iniziale.
 *
 * La correzione definitiva non e un caso particolare in piu: e un elenco di
 * **parole-etichetta**. Dopo un'etichetta si continuano a consumare tutte le
 * parole che sono a loro volta etichette, in qualunque lingua e con
 * qualunque separatore. E quando il documento porta la zona a lettura ottica,
 * si legge quella — e la parte fatta apposta per essere letta da una
 * macchina, mentre il fronte e grafica.
 *
 * Ogni caso qui sotto e un layout che esiste davvero.
 */

const doc = (...lines) => parseScannedDocument(lines.join("\n"));

/* ------------------------------------------------------- etichette in linea */

test("CIE: NOME/GIVEN NAMES al plurale non lascia una «S» nel nome", () => {
  const result = doc(
    "REPUBBLICA ITALIANA",
    "CARTA DI IDENTITA",
    "COGNOME/SURNAME",
    "ROSSI",
    "NOME/GIVEN NAMES",
    "MARIO",
  );

  assert.equal(result.surname, "Rossi");
  assert.equal(result.name, "Mario");
});

test("CIE: spazi attorno alla barra non trasformano l'etichetta in valore", () => {
  const result = doc("COGNOME / SURNAME", "ROSSI", "NOME / GIVEN NAME", "MARIO");

  assert.equal(result.surname, "Rossi", "«Surname» e un'etichetta, non un cognome");
  assert.equal(result.name, "Mario", "«Given Name» e un'etichetta, non un nome");
});

test("CIE: etichetta e valore sulla stessa riga", () => {
  const result = doc(
    "COGNOME / SURNAME DE LUCA",
    "NOME / GIVEN NAMES ANNA MARIA",
  );

  assert.equal(result.surname, "De Luca");
  assert.equal(result.name, "Anna Maria");
});

test("carta d'identita cartacea: etichetta singola e valore accanto", () => {
  const result = doc("COGNOME ROSSI", "NOME MARIO", "NATO IL 01/01/1980");

  assert.equal(result.surname, "Rossi");
  assert.equal(result.name, "Mario");
  assert.equal(result.birthDate, "1980-01-01");
});

test("documento francese: NOM non viene scambiato per NOME", () => {
  const result = doc("NOM / SURNAME", "DUPONT", "PRENOMS / GIVEN NAMES", "JEAN");

  assert.equal(result.surname, "Dupont");
  assert.equal(result.name, "Jean");
});

test("la regressione originale del Blocco 7 resta chiusa", () => {
  const result = doc("COGNOME/SURNAME", "ROSSI", "NOME/GIVEN NAME", "MARIO");

  assert.equal(result.surname, "Rossi");
  assert.equal(result.name, "Mario");
  assert.notEqual(result.name, "Surname");
});

/* ------------------------------------------------ zona a lettura ottica (MRZ) */

test("MRZ TD1 di una carta d'identita: nome e cognome dalla riga a macchina", () => {
  const result = doc(
    "IDITACA00000AA0000000000<<<<<<",
    "8001010M3001019ITA<<<<<<<<<<<8",
    "ROSSI<<MARIO<GIUSEPPE<<<<<<<<<",
  );

  assert.equal(result.surname, "Rossi");
  assert.equal(result.name, "Mario Giuseppe", "i nomi multipli restano tutti");
});

test("MRZ TD3 di un passaporto: il prefisso P<ITA non finisce nel cognome", () => {
  const result = doc(
    "P<ITAROSSI<<MARIO<GIUSEPPE<<<<<<<<<<<<<<<<<<",
    "YA1234567ITA8001019M3001010<<<<<<<<<<<<<<04",
  );

  assert.equal(result.surname, "Rossi");
  assert.equal(result.name, "Mario Giuseppe");
});

test("la MRZ vince sulle etichette quando ci sono entrambe", () => {
  /*
    Caso reale: l'OCR legge male il fronte — «ROSS!» invece di «ROSSI» — ma
    la MRZ e monospaziata e la legge bene. Fidarsi del fronte vorrebbe dire
    proporre un cognome sbagliato quando ce n'e uno giusto sulla stessa
    immagine.
  */
  const result = doc(
    "COGNOME/SURNAME",
    "ROSS!",
    "NOME/GIVEN NAMES",
    "MARIO",
    "IDITACA00000AA0000000000<<<<<<",
    "8001010M3001019ITA<<<<<<<<<<<8",
    "ROSSI<<MARIO<<<<<<<<<<<<<<<<<<",
  );

  assert.equal(result.surname, "Rossi");
});

test("una riga che sembra una MRZ ma non lo e non produce un frammento", () => {
  const result = doc(
    "COGNOME/SURNAME",
    "ROSSI",
    "NOME/GIVEN NAMES",
    "MARIO",
    // Sfondo di sicurezza letto male: caratteri ammessi, ma nessun nome.
    "<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
  );

  assert.equal(result.surname, "Rossi");
  assert.equal(result.name, "Mario");
});

/* ------------------------------------------ il contratto verso le anagrafiche */

test("il risultato arriva ai form gia capitalizzato come si scrive, non come e stampato", () => {
  const extraction = buildExtractionFromText(
    [
      "COGNOME / SURNAME",
      "DE LUCA",
      "NOME / GIVEN NAMES",
      "ANNA MARIA",
      "CODICE FISCALE",
      "DLCNMR80A41H501B",
    ].join("\n"),
    "test",
  );

  assert.equal(extraction.fields.lastName?.value, "De Luca");
  assert.equal(extraction.fields.firstName?.value, "Anna Maria");
  assert.equal(extraction.empty, false);
});

test("nessun campo proposto contiene una parola-etichetta", () => {
  const extraction = buildExtractionFromText(
    [
      "COGNOME / SURNAME",
      "ROSSI",
      "NOME / GIVEN NAMES",
      "MARIO",
      "LUOGO DI NASCITA / PLACE OF BIRTH",
      "ROMA",
      "CITTADINANZA / NATIONALITY",
      "ITALIANA",
    ].join("\n"),
    "test",
  );

  const vietate = [
    "surname",
    "given name",
    "given names",
    "place of birth",
    "nationality",
  ];

  for (const [key, entry] of Object.entries(extraction.fields)) {
    if (!entry?.value) continue;
    assert.equal(
      vietate.includes(entry.value.toLowerCase()),
      false,
      `${key} ha ricevuto l'etichetta «${entry.value}» al posto del valore`,
    );
  }

  assert.equal(extraction.fields.birthPlace?.value, "Roma");
  assert.equal(extraction.fields.nationality?.value, "Italiana");
});

/* --------------------------------------- formati: cosa si legge e cosa no */

test("il rifiuto di un file dice cosa fare, e lo dice in modo diverso", async () => {
  const { validateDocumentForExtraction, MAX_DOCUMENT_SCAN_BYTES } =
    await import("../../src/lib/document-extraction.ts");
  const { ocrExtractionProvider } = await import(
    "../../src/lib/document-extraction-ocr.ts"
  );

  const pdf = validateDocumentForExtraction(
    { type: "application/pdf", size: 1024, name: "carta.pdf" },
    ocrExtractionProvider,
  );
  assert.equal(pdf.ok, false);
  assert.match(pdf.message, /Fotografa il documento/, "un PDF si risolve fotografando");

  // Anche senza tipo MIME: alcuni browser lo lasciano vuoto.
  assert.equal(
    validateDocumentForExtraction({ size: 1024, name: "carta.PDF" }, ocrExtractionProvider).ok,
    false,
  );

  const grande = validateDocumentForExtraction(
    { type: "image/jpeg", size: MAX_DOCUMENT_SCAN_BYTES + 1, name: "foto.jpg" },
    ocrExtractionProvider,
  );
  assert.equal(grande.ok, false);
  assert.match(grande.message, /piu piccola/, "una foto grande si risolve rimpicciolendola");

  const eseguibile = validateDocumentForExtraction(
    { type: "application/x-msdownload", size: 1024, name: "setup.exe" },
    ocrExtractionProvider,
  );
  assert.equal(eseguibile.ok, false);

  for (const type of ["image/jpeg", "image/png", "image/webp", "image/heic"]) {
    assert.equal(
      validateDocumentForExtraction({ type, size: 1024, name: `f.${type}` }, ocrExtractionProvider)
        .ok,
      true,
      `${type} deve essere accettato`,
    );
  }
});

test("il motore dichiara cosa sa leggere, e i PDF non ci sono", async () => {
  const { ocrExtractionProvider } = await import(
    "../../src/lib/document-extraction-ocr.ts"
  );

  assert.ok(ocrExtractionProvider.accepts.length > 0);
  assert.equal(
    ocrExtractionProvider.accepts.includes("application/pdf"),
    false,
    "dichiarare un formato che non si legge e peggio che non dichiararlo",
  );
});
