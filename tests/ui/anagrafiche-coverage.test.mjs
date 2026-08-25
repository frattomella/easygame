import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Il sistema anagrafico e completo? (Blocco 8, punto A)
 *
 * Il Blocco 7 aveva introdotto il campo telefono condiviso, la
 * capitalizzazione e il codice fiscale assistito — ma solo nei **moduli di
 * creazione**. Chi apriva una scheda esistente e correggeva un numero
 * ritrovava il campo di testo libero di prima: due comportamenti diversi per
 * lo stesso dato, a seconda di come ci si era arrivati.
 *
 * Questi test elencano le superfici una per una. Un elenco esplicito e piu
 * noioso di una regola generica, ed e l'unico modo perche l'aggiunta di una
 * sesta anagrafica non passi inosservata: chi la aggiunge deve venire qui.
 */

const SRC = path.join(process.cwd(), "src");
const read = (relative) =>
  readFileSync(path.join(SRC, ...relative.split("/")), "utf8");

/** Tutte le superfici in cui una persona ha un recapito telefonico. */
const PHONE_SURFACES = [
  ["app/athletes/[id]/page.tsx", "scheda atleta (atleta e genitore)"],
  ["app/trainers/[id]/page.tsx", "scheda allenatore"],
  ["app/staff/[id]/page.tsx", "scheda staff"],
  ["app/soci/[id]/page.tsx", "scheda socio"],
  ["app/organization/page.tsx", "scheda club"],
  ["app/trainers/new/page.tsx", "nuovo allenatore"],
  ["app/staff/new/page.tsx", "nuovo staff"],
  ["app/soci/new/page.tsx", "nuovo socio"],
  ["components/forms/AthleteQuickCreateDialog.tsx", "nuovo atleta"],
];

test("il campo telefono condiviso e su ogni anagrafica, creazione e modifica", () => {
  for (const [file, label] of PHONE_SURFACES) {
    const source = read(file);
    assert.match(
      source,
      /<PhoneField/,
      `${label} (${file}) deve usare PhoneField, non un input libero`,
    );
  }
});

test("nessuna anagrafica ha piu un input di telefono fatto in casa", () => {
  for (const [file, label] of PHONE_SURFACES) {
    const source = read(file);

    /*
      Un `<Input>` il cui valore e un campo `phone`. Il campo condiviso monta
      il proprio `<Input type="tel">` dentro di se, ma questi file non lo
      contengono: montano il componente.
    */
    const homemade =
      /<Input\s[^>]*value=\{[^}]*(phone|Phone)\b/.test(source);

    assert.equal(
      homemade,
      false,
      `${label} (${file}): resta un campo telefono scritto a mano`,
    );
  }
});

/** Le superfici in cui si scrive un nome, un cognome o un indirizzo. */
const CAPITALIZATION_SURFACES = [
  ["app/athletes/[id]/page.tsx", "scheda atleta"],
  ["app/trainers/[id]/page.tsx", "scheda allenatore"],
  ["app/staff/[id]/page.tsx", "scheda staff"],
  ["app/soci/[id]/page.tsx", "scheda socio"],
  ["app/organization/page.tsx", "scheda club"],
  ["app/trainers/new/page.tsx", "nuovo allenatore"],
  ["app/staff/new/page.tsx", "nuovo staff"],
  ["app/soci/new/page.tsx", "nuovo socio"],
  ["components/forms/AthleteQuickCreateDialog.tsx", "nuovo atleta"],
];

test("la capitalizzazione condivisa e su ogni anagrafica", () => {
  for (const [file, label] of CAPITALIZATION_SURFACES) {
    assert.match(
      read(file),
      /<CapitalizedInput/,
      `${label} (${file}) deve usare CapitalizedInput sui campi nominali`,
    );
  }
});

/**
 * Il codice fiscale, ovunque lo si chieda a una persona fisica.
 *
 * La scheda club e esclusa dal calcolo ma non dal campo: il legale
 * rappresentante ha un codice fiscale che si puo verificare, non calcolare,
 * perche il form non raccoglie data di nascita e sesso.
 */
const FISCAL_CODE_SURFACES = [
  ["app/athletes/[id]/page.tsx", "scheda atleta (atleta e genitore)"],
  ["app/trainers/[id]/page.tsx", "scheda allenatore"],
  ["app/staff/[id]/page.tsx", "scheda staff"],
  ["app/trainers/new/page.tsx", "nuovo allenatore"],
  ["app/staff/new/page.tsx", "nuovo staff"],
  ["app/soci/new/page.tsx", "nuovo socio"],
  ["components/forms/AthleteQuickCreateDialog.tsx", "nuovo atleta"],
  ["app/organization/page.tsx", "scheda club"],
];

test("il codice fiscale e sempre assistito, mai un campo nudo", () => {
  for (const [file, label] of FISCAL_CODE_SURFACES) {
    assert.match(
      read(file),
      /<AssistedFiscalCodeField/,
      `${label} (${file}) deve usare AssistedFiscalCodeField`,
    );
  }
});

/**
 * Il codice catastale non si digita piu.
 *
 * `onBelfioreCodeChange` e cio che accende la ricerca del comune dentro il
 * campo: senza, resta la casella da quattro caratteri che nessuno ha in
 * testa. La scheda club e l'eccezione dichiarata — il legale rappresentante
 * non ha un comune di nascita in anagrafica.
 */
test("dove si calcola un codice fiscale, il comune si cerca", () => {
  for (const [file, label] of FISCAL_CODE_SURFACES) {
    if (file === "app/organization/page.tsx") continue;

    assert.match(
      read(file),
      /onBelfioreCodeChange=/,
      `${label} (${file}): senza la ricerca del comune il codice catastale torna a mano`,
    );
  }
});

/**
 * Il sesso serve al codice fiscale, e serve **normalizzato**.
 *
 * Nelle schede di allenatore e staff era un campo di testo libero: ci finiva
 * «M», «maschio», «Maschile», e il calcolo non poteva funzionare su tre
 * grafie diverse dello stesso dato.
 */
test("il sesso e una scelta, non testo libero, dove serve al codice fiscale", () => {
  for (const file of [
    "app/trainers/[id]/page.tsx",
    "app/staff/[id]/page.tsx",
  ]) {
    const source = read(file);
    const freeText =
      /<Input\s+value=\{editFormData\.gender[^}]*\}/.test(source);

    assert.equal(freeText, false, `${file}: il sesso e ancora testo libero`);
    assert.match(
      source,
      /<option value="M">Maschio<\/option>/,
      `${file}: manca la scelta esplicita del sesso`,
    );
  }
});

/* ------------------------------------------- lettura documenti (Blocco 8, C) */

/**
 * Dove si compila un'anagrafica a partire da un documento.
 *
 * Il Blocco 7 aveva costruito il flusso; il Blocco 8 lo porta anche sul
 * **genitore/tutore**, che era l'anagrafica rimasta fuori — e non per una
 * ragione tecnica: un genitore ha un documento d'identita come chiunque
 * altro, e trascriverlo a mano e lo stesso lavoro che si e tolto agli altri.
 */
const DOCUMENT_READER_SURFACES = [
  ["components/forms/AthleteQuickCreateDialog.tsx", "nuovo atleta"],
  ["app/trainers/new/page.tsx", "nuovo allenatore"],
  ["app/staff/new/page.tsx", "nuovo staff"],
  ["app/soci/new/page.tsx", "nuovo socio"],
  ["app/athletes/[id]/page.tsx", "genitore/tutore"],
];

test("la lettura documenti e su tutte le anagrafiche di persona", () => {
  for (const [file, label] of DOCUMENT_READER_SURFACES) {
    assert.match(
      read(file),
      /<DocumentExtractionField/,
      `${label} (${file}) deve poter compilare da un documento`,
    );
  }
});

/**
 * La regola che non cambia mai: **si propone, non si scrive.**
 *
 * Un OCR sbaglia, e in un'anagrafica sportiva un dato sbagliato che nessuno
 * ha guardato finisce su un tesseramento. Se un giorno il componente
 * applicasse da solo, questo test lo direbbe.
 */
test("nessuna superficie applica i dati letti senza passare dalla conferma", () => {
  const field = read("components/forms/document-extraction-field.tsx");

  assert.match(
    field,
    /disabled=\{!accepted\.size\}/,
    "il pulsante «Applica» deve dipendere da una scelta esplicita",
  );
  assert.match(
    field,
    /acceptExtractedFields\(result\.fields, Array\.from\(accepted\)\)/,
    "si applicano solo i campi accettati, non tutto il risultato",
  );

  for (const [file, label] of DOCUMENT_READER_SURFACES) {
    const source = read(file);
    const mounts = source.match(/<DocumentExtractionField[\s\S]*?\/>/g) || [];

    for (const mount of mounts) {
      assert.match(
        mount,
        /onApply=/,
        `${label}: il campo deve ricevere onApply, non scrivere da solo`,
      );
      assert.match(
        mount,
        /currentValues=/,
        `${label}: senza currentValues non si sa cosa si sta per sovrascrivere`,
      );
    }
  }
});
