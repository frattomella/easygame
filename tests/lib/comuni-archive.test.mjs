import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildComuneIndex,
  classifyBelfiore,
  findComuneByBelfiore,
  findComuneByName,
  findComuniByName,
  normalizeComuneName,
  searchComuni,
} from "../../src/lib/comuni-model.ts";
import { computeCodiceFiscale } from "../../src/lib/italian-registry.ts";

/**
 * Blocco 7 — archivio dei comuni italiani.
 *
 * ADR-0027 diceva «i comuni non si inventano» e per questo il codice catastale
 * lo digitava l'operatore. Ora c'e una tabella ufficiale ISTAT e il codice si
 * cerca. Il divieto non e caduto: e diventato verificabile, ed e questo file a
 * verificarlo.
 *
 * Due livelli di test:
 *
 * 1. il **modello**, su un elenco minuscolo scritto qui sotto: cosi la logica
 *    di ricerca e leggibile e non dipende da 7.896 righe;
 * 2. il **dataset reale**, di cui si controllano le invarianti strutturali —
 *    e l'unico modo di accorgersi che una rigenerazione ha rotto qualcosa.
 */

/** Comuni veri, scelti per i casi che contano. */
const FIXTURE = [
  ["Abano Terme", "PD", "A001"],
  ["Bolzano", "BZ", "A952", "Bozen"],
  ["Castro", "BG", "C337"],
  ["Castro", "LE", "M261"],
  ["Milano", "MI", "F205"],
  ["Sant'Angelo Lodigiano", "LO", "I274"],
];

const index = buildComuneIndex(FIXTURE);

// --- normalizzazione ---------------------------------------------------------

test("il nome si confronta senza accenti, apostrofi e spazi", () => {
  assert.equal(normalizeComuneName("Sant'Angelo Lodigiano"), "santangelolodigiano");
  assert.equal(normalizeComuneName("SANT ANGELO  LODIGIANO"), "santangelolodigiano");
  assert.equal(normalizeComuneName("Forlì"), "forli");
  assert.equal(normalizeComuneName("   "), "");
});

// --- ricerca -----------------------------------------------------------------

test("la ricerca mette prima l'esatto, poi i prefissi", () => {
  const results = searchComuni(index, "castro").map((comune) => comune.belfiore);
  assert.deepEqual(results, ["C337", "M261"], "i due omonimi, in ordine stabile");

  const milano = searchComuni(index, "mila");
  assert.equal(milano.length, 1);
  assert.equal(milano[0].name, "Milano");
});

test("la ricerca trova anche una parola successiva del nome", () => {
  const results = searchComuni(index, "terme");
  assert.equal(results.length, 1);
  assert.equal(results[0].name, "Abano Terme");
});

test("la ricerca trova il nome nell'altra lingua ufficiale", () => {
  const results = searchComuni(index, "bozen");
  assert.equal(results.length, 1);
  assert.equal(results[0].name, "Bolzano");
  assert.equal(results[0].belfiore, "A952");
});

test("un codice catastale come query risolve direttamente", () => {
  const results = searchComuni(index, "F205");
  assert.deepEqual(
    results.map((comune) => comune.name),
    ["Milano"],
  );
});

test("il filtro provincia restringe gli omonimi", () => {
  const results = searchComuni(index, "castro", { province: "LE" });
  assert.deepEqual(
    results.map((comune) => comune.belfiore),
    ["M261"],
  );
});

test("una query troppo corta o vuota non restituisce tutto l'archivio", () => {
  assert.deepEqual(searchComuni(index, ""), []);
  assert.deepEqual(searchComuni(index, "   "), []);
});

test("la ricerca porta con se provincia e regione", () => {
  const [milano] = searchComuni(index, "milano");
  assert.equal(milano.province, "MI");
  assert.equal(milano.provinceName, "Milano");
  assert.equal(milano.region, "Lombardia");
});

// --- lookup ------------------------------------------------------------------

test("un nome ambiguo senza provincia non sceglie per conto dell'utente", () => {
  assert.equal(findComuneByName(index, "Castro"), null);
  assert.equal(findComuneByName(index, "Castro", "BG").belfiore, "C337");
  assert.equal(findComuniByName(index, "Castro").length, 2);
});

test("il codice catastale si legge dall'archivio, mai si costruisce", () => {
  assert.equal(findComuneByBelfiore(index, "F205").name, "Milano");
  assert.equal(findComuneByBelfiore(index, "f205").name, "Milano");
  assert.equal(findComuneByBelfiore(index, "Z999"), null);
});

test("un codice assente non e un errore: e estero o soppresso", () => {
  assert.equal(classifyBelfiore(index, "F205"), "italiano");
  assert.equal(classifyBelfiore(index, "Z133"), "estero-o-soppresso");
  assert.equal(classifyBelfiore(index, "H501"), "estero-o-soppresso");
  assert.equal(classifyBelfiore(index, "XX"), "malformato");
  assert.equal(classifyBelfiore(index, ""), "malformato");
});

// --- il dataset reale --------------------------------------------------------

const dataset = JSON.parse(
  readFileSync(path.join(process.cwd(), "src/data/comuni-istat.json"), "utf8"),
);

test("il dataset dichiara la fonte da cui e stato generato", () => {
  assert.match(dataset.source.url, /^https:\/\/www\.istat\.it\//);
  assert.match(dataset.source.sha256, /^[0-9a-f]{64}$/);
  assert.equal(dataset.source.rows, dataset.comuni.length);
});

test("il dataset ha una riga per comune, con codice catastale unico", () => {
  assert.ok(
    dataset.comuni.length > 7000 && dataset.comuni.length < 8600,
    `numero di comuni fuori scala: ${dataset.comuni.length}`,
  );

  const belfiore = new Set();
  for (const [name, province, code] of dataset.comuni) {
    assert.ok(name, "ogni comune ha una denominazione");
    assert.match(province, /^[A-Z]{2}$/, `sigla provincia di ${name}`);
    assert.match(code, /^[A-Z]\d{3}$/, `codice catastale di ${name}`);
    assert.equal(belfiore.has(code), false, `codice duplicato: ${code}`);
    belfiore.add(code);
  }
});

test("ogni comune appartiene a una provincia che il registro conosce", () => {
  const realIndex = buildComuneIndex(dataset.comuni);
  const orfani = realIndex.all.filter((comune) => !comune.region);
  assert.deepEqual(
    orfani.map((comune) => `${comune.name} (${comune.province})`),
    [],
    "una sigla sconosciuta lascerebbe la regione vuota",
  );
});

/**
 * Il punto di tutto l'archivio: da qui in poi il codice catastale entra in un
 * codice fiscale. Se questa catena si rompe, EasyGame produce identificativi
 * falsi in silenzio — che e esattamente cio che ADR-0027 voleva impedire.
 */
test("dal comune si arriva a un codice fiscale corretto", () => {
  const realIndex = buildComuneIndex(dataset.comuni);
  const milano = findComuneByName(realIndex, "Milano", "MI");
  assert.equal(milano.belfiore, "F205");

  const result = computeCodiceFiscale({
    firstName: "Mario",
    lastName: "Rossi",
    birthDate: "1980-01-01",
    gender: "M",
    belfioreCode: milano.belfiore,
  });

  assert.equal(result.ok, true);
  assert.equal(result.value, "RSSMRA80A01F205X");
});

test("i comuni con due nomi ufficiali sono cercabili in entrambe le lingue", () => {
  const realIndex = buildComuneIndex(dataset.comuni);
  const byItalian = searchComuni(realIndex, "Bolzano", { limit: 5 });
  const byGerman = searchComuni(realIndex, "Bozen", { limit: 5 });

  assert.equal(byItalian[0].belfiore, "A952");
  assert.equal(byGerman[0].belfiore, "A952");
});
