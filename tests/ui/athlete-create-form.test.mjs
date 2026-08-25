import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Blocco 7, punto 14 — la scheda «Nuovo atleta».
 *
 * Il ciclo da rompere era: crea atleta con tre campi, apri la scheda,
 * ricompila tutto. Chi iscrive un atleta ha davanti il modulo cartaceo con
 * **tutti** i dati; farglieli inserire in due momenti diversi non e
 * semplicita, e lavoro doppio.
 *
 * Il rimedio non e una pagina infinita: gli obbligatori restano tre, il resto
 * sta in sezioni chiuse di default.
 */

const SRC = path.join(process.cwd(), "src");
const read = (file) => readFileSync(path.join(SRC, file), "utf8");

const readCode = (file) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const DIALOG = "components/forms/AthleteQuickCreateDialog.tsx";
const LIST = "app/athletes/page.tsx";

test("gli obbligatori restano nome, cognome e data di nascita", () => {
  const source = readCode(DIALOG);

  assert.match(
    source,
    /!formData\.firstName\.trim\(\) \|\|\s*\n?\s*!formData\.lastName\.trim\(\) \|\|\s*\n?\s*!formData\.birthDate/,
    "aggiungere campi non deve aggiungere obblighi",
  );
});

test("il resto sta in sezioni, non in una pagina infinita", () => {
  const source = readCode(DIALOG);

  assert.match(source, /<Accordion type="multiple"/);
  for (const section of [
    "Anagrafica e codice fiscale",
    "Contatti",
    "Residenza",
    "Dati sanitari",
    "Taglie e numero di maglia",
    "Genitori e tutori",
    "Tesseramento",
    "Note",
  ]) {
    assert.ok(
      source.includes(section),
      `manca la sezione ${section}`,
    );
  }
});

/**
 * Il punto: i componenti condivisi del Blocco 7 si riusano, non si
 * reimplementano. Un secondo campo «codice fiscale» scritto a mano qui
 * divergerebbe dal resto dell'applicazione al primo cambiamento.
 */
test("le sezioni usano i componenti condivisi", () => {
  const source = readCode(DIALOG);

  for (const component of [
    "AssistedFiscalCodeField",
    "AssistedAddressFields",
    "PhoneField",
    "CapitalizedInput",
    "ClothingSizesFields",
    "DocumentExtractionField",
  ]) {
    assert.match(
      source,
      new RegExp(`<${component}`),
      `${component} deve essere riusato, non reimplementato`,
    );
  }
});

/**
 * Il difetto vero non era nel form: era che il salvataggio buttava via tutto
 * cio che non fossero i tre campi.
 */
test("la creazione scrive tutti i dati raccolti, non solo tre campi", () => {
  const source = readCode(LIST);

  assert.match(
    source,
    /data: athleteData\.data \|\| \{\}/,
    "cio che il form raccoglie deve arrivare al record",
  );
  assert.match(
    source,
    /medicalCertExpiry: athleteData\.medicalCertExpiry \|\| null/,
  );
});

/**
 * Le chiavi di `data` devono essere quelle che la scheda atleta legge,
 * altrimenti il dato inserito alla creazione esiste ma non si vede — che e
 * peggio di non averlo inserito.
 */
test("le chiavi scritte sono quelle che la scheda atleta legge", () => {
  const dialog = readCode(DIALOG);
  const detail = read("app/athletes/[id]/page.tsx");

  for (const key of [
    "fiscalCode",
    "birthPlace",
    "birthPlaceCode",
    "nationality",
    "gender",
    "phone",
    "email",
    "address",
    "city",
    "postalCode",
    "province",
    "region",
    "country",
    "bloodType",
    "allergies",
    "emergencyContact",
    "emergencyPhone",
    "notes",
    "clothingSizes",
  ]) {
    assert.match(
      dialog,
      new RegExp(`\\b${key}:`),
      `il form deve scrivere ${key}`,
    );
    assert.ok(
      detail.includes(`athleteData.${key}`) ||
        detail.includes(`${key}:`),
      `la scheda atleta deve leggere ${key}`,
    );
  }
});

/* ----------------------------------------------- Blocco 8: le due sezioni mancanti */

/**
 * Il Blocco 7 aveva chiuso il ciclo «crea con tre campi, riapri e ricompila»
 * per quasi tutto. Restavano fuori le due cose che una segreteria ha davanti
 * proprio nel momento dell'iscrizione: **chi e il genitore** e **con che ente
 * l'atleta e tesserato**. Erano anche le due che costringevano a riaprire la
 * scheda subito dopo averla creata.
 */
test("genitori e tesseramento si inseriscono alla creazione", () => {
  const source = readCode(DIALOG);

  assert.ok(
    source.includes("Aggiungi genitore/tutore"),
    "si deve poterne aggiungere piu di uno",
  );
  assert.ok(
    source.includes("guardians: formData.guardians.filter(guardianHasContent)"),
    "una riga vuota lasciata aperta non deve diventare un tutore senza nome",
  );

  assert.match(
    source,
    /registrationFederation/,
    "la federazione e il campo che rende utile il record",
  );
  assert.ok(
    source.includes("registrations: formData.registrationFederation.trim()"),
    "senza federazione il tesseramento non si salva",
  );
});

/**
 * Il numero di tessera resta facoltativo anche qui (Blocco 7, punto 9): un
 * tesseramento si registra a inizio stagione e la federazione emette il
 * numero dopo. Pretenderlo costringe a inventarlo.
 */
test("il numero di tessera non diventa obbligatorio nella creazione", () => {
  const source = read(DIALOG);

  assert.match(
    source,
    /Numero tessera[\s\S]{0,200}non obbligatorio/,
    "il form deve dirlo, non lasciarlo intuire",
  );
  assert.equal(
    /id="registrationNumber"[\s\S]{0,300}required/.test(source),
    false,
    "il numero di tessera non puo essere required",
  );
});

test("le categorie secondarie si scelgono alla creazione e vengono scritte", () => {
  const dialog = readCode(DIALOG);
  const list = readCode(LIST);

  assert.match(dialog, /secondaryCategoryIds/, "il form deve raccoglierle");
  assert.ok(
    dialog.includes("categories.filter((category) => category.id !== primaryId)"),
    "la primaria non si offre anche come secondaria",
  );

  assert.match(
    list,
    /categoryMemberships/,
    "senza memberships le categorie secondarie non arrivano in archivio",
  );
  assert.match(list, /is_primary: false/);
});
