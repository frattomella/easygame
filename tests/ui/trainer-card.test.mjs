import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Blocco 7, punto 4 — audit della scheda Allenatore.
 *
 * Sono test sul sorgente: il progetto non ha un renderer di componenti (vedi
 * 15 — Testing). Ogni caso qui sotto e un difetto trovato davvero, non una
 * regola inventata a posteriori.
 */

const SRC = path.join(process.cwd(), "src");
const read = (file) => readFileSync(path.join(SRC, file), "utf8");

const readCode = (file) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const TRAINER_CARD = "app/trainers/[id]/page.tsx";
const TRAINER_NEW = "app/trainers/new/page.tsx";
const TRAINER_EDIT = "app/trainers/[id]/edit/page.tsx";
const EDIT_TRAINING = "components/forms/EditTrainingForm.tsx";
const CONTRACTS_UPLOAD = "app/trainers/[id]/contracts/upload/page.tsx";

// --- dati societari ----------------------------------------------------------

test("«Ruolo» non e piu nei dati societari dell'allenatore", () => {
  const source = readCode(TRAINER_CARD);

  assert.equal(
    /<h3[^>]*>Ruolo<\/h3>/.test(source),
    false,
    "su una scheda allenatore il ruolo vale sempre «Allenatore»",
  );
  assert.equal(
    /<Label>Ruolo<\/Label>/.test(source),
    false,
    "e non deve nemmeno essere modificabile da qui",
  );
});

test("la data di inizio si puo modificare", () => {
  const source = readCode(TRAINER_CARD);

  assert.match(
    source,
    /<Label>Data di Inizio<\/Label>[\s\S]{0,400}editFormData\.startDate/,
    "esisteva solo come testo in sola lettura",
  );
});

/**
 * La data di inizio si e sempre chiamata in due modi: `hireDate` nel record
 * scritto alla creazione, `startDate` in quello scritto dalla modifica. La
 * scheda leggeva solo il primo e salvava solo il secondo, quindi la modifica
 * tornava indietro al refresh.
 */
test("la data di inizio si legge e si scrive con entrambe le chiavi", () => {
  const source = readCode(TRAINER_CARD);

  assert.match(
    source,
    /trainerData\.startDate \|\| trainerData\.hireDate/,
    "in lettura vince la chiave piu recente",
  );
  assert.match(
    source,
    /normalizedUpdateData\.hireDate = normalizedUpdateData\.startDate/,
    "in scrittura restano allineate",
  );
});

/**
 * `trainers/[id]/edit` leggeva `birthYear` **prima** di `birthDate` e la
 * riscriveva come 1° gennaio: bastava aprire la modifica e salvare perche la
 * data di nascita diventasse fittizia — e con essa il codice fiscale.
 */
test("la data di nascita non viene degradata ad anno", () => {
  const source = readCode(TRAINER_EDIT);

  assert.match(
    source,
    /birthDate:\s*\n?\s*trainerFound\.birthDate \|\|/,
    "la data vera viene prima dell'anno",
  );
  assert.match(source, /birthDate: trainerData\.birthDate \|\| null/);
});

test("la creazione chiede data di nascita e sesso, non il solo anno", () => {
  const source = readCode(TRAINER_NEW);

  assert.match(source, /birthDate: string;/);
  assert.match(source, /gender: string;/);
  assert.match(
    source,
    /<AssistedFiscalCodeField/,
    "senza data e sesso il codice fiscale non si puo calcolare",
  );
});

// --- contratti ---------------------------------------------------------------

/**
 * «ID del club non trovato» all'aggiunta di un contratto: la pagina cercava il
 * club **solo** in `?clubId=`, e la scheda allenatore la apriva senza quel
 * parametro.
 */
test("il link ai contratti porta il club, e la pagina ha comunque i ripieghi", () => {
  assert.match(
    readCode(TRAINER_CARD),
    /clubId \? `\?clubId=\$\{encodeURIComponent\(clubId\)\}` : ""/,
    "la scheda deve passare il club nel link",
  );

  assert.match(
    readCode(CONTRACTS_UPLOAD),
    /resolveActiveClubId\(/,
    "e la pagina non deve dipendere solo dalla query",
  );
});

// --- modifica allenamento ----------------------------------------------------

/**
 * Il form di creazione permette piu allenatori e piu categorie; quello di
 * modifica aveva una tendina singola e nessuna categoria. Un allenamento con
 * tre allenatori, aperto e salvato, ne usciva con uno.
 */
test("la modifica di un allenamento permette la selezione multipla", () => {
  const source = readCode(EDIT_TRAINING);

  assert.match(source, /trainerIds: string\[\];/);
  assert.match(source, /categories: string\[\];/);
  assert.equal(
    /trainerId: string;/.test(source),
    false,
    "l'allenatore singolo era la causa della perdita di dati",
  );
  assert.match(
    source,
    /toggleId\("trainerIds"/,
    "gli allenatori si spuntano, come nella creazione",
  );
  assert.match(source, /toggleId\("categories"/);
});

test("il salvataggio della modifica scrive tutti gli allenatori e le categorie", () => {
  const source = readCode("app/training/page.tsx");

  assert.match(source, /trainerIds: updatedTraining\.trainerIds/);
  assert.match(source, /categories: updatedTraining\.categories/);
  assert.equal(
    /trainerIds: updatedTraining\.trainerId\s*\n?\s*\?/.test(source),
    false,
    "non si riduce piu l'elenco a un solo id",
  );
});

// --- numero di tessera -------------------------------------------------------

/**
 * Blocco 7, punto 9. Un tesseramento si registra **prima** che la federazione
 * emetta il numero: pretenderlo costringeva a inventarlo, e un numero
 * inventato su un tesseramento e peggio di un campo vuoto.
 */
test("il numero di tessera non e obbligatorio", () => {
  const athlete = readCode("app/athletes/[id]/page.tsx");

  assert.equal(
    /!newRegistration\.federation \|\| !newRegistration\.number/.test(athlete),
    false,
    "la federazione resta obbligatoria, il numero no",
  );
  assert.match(athlete, /!newRegistration\.federation\b/);
  assert.equal(
    /<Label>Numero Tessera \*<\/Label>/.test(athlete),
    false,
    "e l'asterisco non deve dire il contrario",
  );
});

test("nessuna schermata di persona rende obbligatorio un numero di tessera", () => {
  for (const file of [
    TRAINER_NEW,
    "app/staff/new/page.tsx",
    "app/soci/new/page.tsx",
  ]) {
    const source = readCode(file);
    assert.equal(
      /(membershipNumber|cardNumber)[^;]{0,80}obbligator/i.test(source),
      false,
      `${file}: il numero di tessera resta facoltativo`,
    );
  }
});
