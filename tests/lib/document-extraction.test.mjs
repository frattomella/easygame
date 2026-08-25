import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptExtractedFields,
  buildExtractionFromText,
  isExtractionEmpty,
  listExtractedFields,
  mapScanToPersonFields,
} from "../../src/lib/document-extraction.ts";

/**
 * Blocco 7, punto 15 — foundation per la lettura documenti.
 *
 * L'OCR esisteva gia (`tesseract.js`, `document-scan.ts`) ma viveva **dentro**
 * la scheda atleta, e quindi esisteva solo per gli atleti. Questi test
 * verificano il contratto, cioe la parte pura: da testo grezzo a campi
 * anagrafici proposti, e da proposta a patch applicabile.
 *
 * La regola che non cambia: **si propone, non si scrive.**
 */

/** Un documento d'identita italiano come lo restituisce un OCR: maiuscolo. */
const CARTA_IDENTITA = [
  "REPUBBLICA ITALIANA",
  "CARTA DI IDENTITA",
  "COGNOME/SURNAME",
  "ROSSI",
  "NOME/GIVEN NAME",
  "MARIO",
  "DATA DI NASCITA",
  "01/01/1980",
  "LUOGO DI NASCITA",
  "MILANO",
  "CODICE FISCALE RSSMRA80A01F205X",
  "SCADENZA 15/06/2032",
].join("\n");

test("da un documento si ricavano i campi anagrafici", () => {
  const result = buildExtractionFromText(CARTA_IDENTITA, "test");

  assert.equal(result.empty, false);
  assert.equal(result.fields.lastName?.value, "Rossi");
  assert.equal(result.fields.firstName?.value, "Mario");
  assert.equal(result.fields.birthDate?.value, "1980-01-01");
  assert.equal(result.fields.fiscalCode?.value, "RSSMRA80A01F205X");
});

/**
 * L'OCR di un documento restituisce tutto maiuscolo, perche cosi e stampato.
 * Non e cosi che si scrive un nome in un elenco.
 */
test("nome e cognome escono capitalizzati, non urlati", () => {
  const fields = mapScanToPersonFields({
    rawText: "",
    name: "MARIO",
    surname: "DE LUCA",
  });

  assert.equal(fields.firstName?.value, "Mario");
  assert.equal(fields.lastName?.value, "De Luca");
});

/**
 * Il codice catastale si ricava dal codice fiscale **solo** se il codice ha il
 * carattere di controllo giusto: non si indovina mai (ADR-0027 / ADR-0032).
 */
test("il codice catastale arriva solo da un codice fiscale valido", () => {
  const valido = mapScanToPersonFields({
    rawText: "",
    fiscalCode: "RSSMRA80A01F205X",
  });
  assert.equal(valido.birthPlaceCode?.value, "F205");
  assert.equal(valido.fiscalCode?.confidence, "high");

  const invalido = mapScanToPersonFields({
    rawText: "",
    fiscalCode: "RSSMRA80A01F205Z",
  });
  assert.equal(
    invalido.birthPlaceCode,
    undefined,
    "da un codice che non torna non si ricava nessun comune",
  );
  assert.equal(
    invalido.fiscalCode?.confidence,
    "low",
    "il codice si propone comunque, ma marcato come incerto",
  );
});

test("un testo illeggibile produce un risultato vuoto, non campi inventati", () => {
  const result = buildExtractionFromText("...???...", "test");
  assert.equal(result.empty, true);
  assert.deepEqual(listExtractedFields(result.fields), []);
  assert.equal(isExtractionEmpty({}), true);
});

// --- la conferma manuale -----------------------------------------------------

test("si applicano solo i campi accettati", () => {
  const fields = mapScanToPersonFields({
    rawText: "",
    name: "MARIO",
    surname: "ROSSI",
    birthDate: "01/01/1980",
  });

  const patch = acceptExtractedFields(fields, ["firstName", "lastName"]);

  assert.deepEqual(patch, { firstName: "Mario", lastName: "Rossi" });
  assert.equal(
    "birthDate" in patch,
    false,
    "cio che non si accetta non deve arrivare al form",
  );
});

/**
 * Chi applica fa uno spread sullo stato: una chiave con valore vuoto
 * cancellerebbe un dato inserito a mano.
 */
test("la patch non contiene mai chiavi vuote", () => {
  const fields = mapScanToPersonFields({ rawText: "", name: "MARIO" });
  const patch = acceptExtractedFields(fields, [
    "firstName",
    "lastName",
    "fiscalCode",
  ]);

  assert.deepEqual(patch, { firstName: "Mario" });
});

test("accettare niente produce una patch vuota, non un errore", () => {
  const fields = mapScanToPersonFields({ rawText: "", name: "MARIO" });
  assert.deepEqual(acceptExtractedFields(fields, []), {});
});

test("l'elenco per l'anteprima porta etichetta e fiducia", () => {
  const result = buildExtractionFromText(CARTA_IDENTITA, "test");
  const entries = listExtractedFields(result.fields);

  assert.ok(entries.length > 0);
  for (const entry of entries) {
    assert.ok(entry.key, "ogni voce sa a che campo appartiene");
    assert.ok(entry.label, "ogni voce ha un'etichetta leggibile");
    assert.ok(["high", "low"].includes(entry.confidence));
    assert.ok(entry.value, "una voce senza valore non va mostrata");
  }
});

test("il risultato dichiara da quale motore viene", () => {
  assert.equal(buildExtractionFromText(CARTA_IDENTITA, "tesseract-local").source, "tesseract-local");
});
