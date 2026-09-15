import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Abbigliamento: assegnazione, taglie e consegne.
 *
 * Tre difetti che questi test tengono chiusi, tutti osservati in uso:
 *
 * 1. la taglia salvata in anagrafica veniva **mostrata** nel modulo di
 *    assegnazione e poi non usata: le tendine partivano vuote;
 * 2. lo stato del kit era uno solo, quindi una consegna parziale non era
 *    rappresentabile;
 * 3. il kit aveva un campo stagione che non filtrava niente, perche
 *    `clothing_kits` non e un tipo stagionale.
 *
 * Dal Web V2 (Wave E) la pagina e divisa in moduli sotto
 * `components/clothing/v2/`: i test leggono il file in cui ogni regola vive
 * ora, con lo stesso intento di prima.
 */

const SRC = path.join(process.cwd(), "src");
const read = (relative) =>
  readFileSync(path.join(SRC, ...relative.split("/")), "utf8");

const CLOTHING_PAGE = "app/clothing/page.tsx";
const ASSIGNMENT_DRAWER = "components/clothing/v2/assignment-drawer.tsx";
const DELIVERY_DRAWER = "components/clothing/v2/kit-delivery-drawer.tsx";
const ASSIGNMENTS_GRID = "components/clothing/v2/assignments-grid.tsx";
const KIT_DRAWER = "components/clothing/v2/kit-drawer.tsx";
const ITEM_DRAWER = "components/clothing/v2/item-drawer.tsx";
const GROUP_DRAWER = "components/clothing/v2/group-drawer.tsx";
const NUMBERING_AREA = "components/clothing/v2/numbering-area.tsx";

test("il modulo di assegnazione parte dalla taglia dell'anagrafica", () => {
  const source = read(ASSIGNMENT_DRAWER);

  assert.match(
    source,
    /const proposedSizeByItemId = useMemo/,
    "la proposta si calcola una volta per atleta, non per riga",
  );
  assert.match(
    source,
    /value=\{sizeDescription\.size\}/,
    "la tendina taglia mostra la proposta, non una stringa vuota",
  );
  assert.match(
    source,
    /size: draft\.size \|\| proposedSizeByItemId\[item\.id\] \|\| ""/,
    "cio che si vede nella tendina deve essere cio che si salva",
  );
});

test("la taglia proposta filtra anche lo stock di magazzino", () => {
  assert.match(read(ASSIGNMENT_DRAWER), /size: sizeDescription\.size,/);
});

test("l'assegnazione non scrive l'anagrafica taglie", () => {
  for (const file of [CLOTHING_PAGE, ASSIGNMENT_DRAWER, DELIVERY_DRAWER]) {
    const assignmentWrites = read(file)
      .split(/\r?\n/)
      .filter((line) => /clothingSizes|shirtSize|pantsSize|shoeSize/.test(line))
      .filter((line) => /set|update|save/i.test(line));

    assert.deepEqual(
      assignmentWrites,
      [],
      `${file}: assegnare un capo di una taglia diversa non deve riscrivere l'anagrafica`,
    );
  }
});

test("lo stato del kit mostrato in elenco e quello derivato", () => {
  assert.match(read(ASSIGNMENTS_GRID), /<KitDeliveryStatePill/);
  assert.match(
    read(DELIVERY_DRAWER),
    /getKitDeliveryProgress\(assignment\)/,
    "la pillola legge il progresso, non un campo scritto a mano",
  );
});

test("le consegne non passano dal cambio di stato globale", () => {
  const source = read(CLOTHING_PAGE);
  const saver = source.slice(
    source.indexOf("const saveKitDeliveries"),
    source.indexOf("const updateAssignmentStatus"),
  );

  assert.ok(saver.length > 0, "saveKitDeliveries deve esistere");
  assert.equal(
    /updateClothingAssignmentStatus/.test(saver),
    false,
    "quella funzione riscrive tutti gli articoli con lo stesso stato: e cio che le consegne parziali devono smettere di fare",
  );
});

test("il cassetto consegne offre i quattro stati per articolo", () => {
  const source = read(DELIVERY_DRAWER);

  assert.match(
    source,
    /const ITEM_STATES: ClothingItemState\[\] = \[\s*"to_prepare",\s*"ready",\s*"delivered",\s*"unavailable",\s*\]/,
  );
  for (const field of ["Taglia assegnata", "Quantita", "Data consegna", "Note"]) {
    assert.ok(
      source.includes(field),
      `il cassetto deve permettere di registrare «${field}»`,
    );
  }
});

test("il cassetto consegne e usabile a 375 px", () => {
  const offending = read(DELIVERY_DRAWER)
    .split(/\r?\n/)
    .filter((line) => /(?<![a-z:])grid-cols-[23]\b/.test(line));

  assert.deepEqual(
    offending,
    [],
    "le consegne si registrano in magazzino, spesso dal telefono",
  );
});

test("il kit non chiede piu una stagione", () => {
  const kitDrawer = read(KIT_DRAWER);

  assert.equal(
    /Stagione/.test(kitDrawer.replace(/\/\*[\s\S]*?\*\//g, "")),
    false,
    "clothing_kits non e un tipo stagionale: il campo sembrava un filtro e non filtrava niente",
  );

  /*
    Non basta che il campo non si veda. Restava nel tipo, nello stato del
    form e nella serializzazione: un valore sempre vuoto che finiva nel
    record e in una colonna d'export (Blocco A, punto 14). Il modello e
    verificato in tests/lib/clothing-catalog-model.test.mjs; qui si verifica
    che la pagina non lo scriva piu.
  */
  const page = read(CLOTHING_PAGE);
  assert.equal(
    /season: (kitForm|form)\.season/.test(page),
    false,
    "la stagione del kit era nascosta dal form, non rimossa dal salvataggio",
  );
  assert.equal(
    /season: kit\.season \|\| ""/.test(page),
    false,
    "la stagione del kit torna nel form riaprendo un kit esistente",
  );
});

/**
 * La compatibilita di categoria non appartiene al catalogo (Blocco A, 14).
 *
 * Era una regola sportiva — chi puo giocare con chi, che vive in
 * `category-compatibility.ts` e serve ai gruppi di numerazione — applicata a
 * un magazzino, dove non significa niente.
 */
test("articoli e kit non dichiarano categorie compatibili", () => {
  for (const file of [CLOTHING_PAGE, ITEM_DRAWER, KIT_DRAWER, ASSIGNMENT_DRAWER]) {
    const code = read(file)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    assert.equal(
      /compatibleCategoryIds/.test(code),
      false,
      `${file} porta ancora le categorie compatibili del catalogo`,
    );
    assert.equal(
      /Categorie compatibili"|label="Categorie compatibili/.test(code),
      false,
      `${file}: il form del catalogo chiede ancora una compatibilita che non ha`,
    );
    assert.equal(
      /Categoria non compatibile/.test(code),
      false,
      `${file}: le tendine disabilitano ancora le voci per una regola sportiva`,
    );
  }
});

/**
 * Quel che **non** e stato toccato: la compatibilita fra categorie.
 *
 * I gruppi di numerazione continuano a offrirla, esplicita e orientata
 * (Blocco A, punto 15).
 */
test("i gruppi numerazione conservano la compatibilita fra categorie", () => {
  assert.match(read(GROUP_DRAWER), /form\.includeCompatibleCategories/);
  assert.match(read(NUMBERING_AREA), /Categorie compatibili incluse/);
});

test("il catalogo articoli resta globale e le assegnazioni restano stagionali", async () => {
  const { SEASON_SCOPED_DATA_TYPES } = await import(
    "../../src/lib/club-seasons.ts"
  );

  assert.equal(SEASON_SCOPED_DATA_TYPES.has("clothing_products"), false);
  assert.equal(SEASON_SCOPED_DATA_TYPES.has("clothing_kits"), false);
  assert.equal(SEASON_SCOPED_DATA_TYPES.has("kit_assignments"), true);
});

test("l'articolo dichiara da quale taglia dell'anagrafica prende", () => {
  assert.match(read(CLOTHING_PAGE), /sizeSource: form\.sizeSource,/);
  assert.match(read(ITEM_DRAWER), /id="item-size-source"/);
});
