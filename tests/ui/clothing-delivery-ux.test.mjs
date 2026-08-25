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
 */

const SRC = path.join(process.cwd(), "src");
const read = (relative) =>
  readFileSync(path.join(SRC, ...relative.split("/")), "utf8");

const CLOTHING_PAGE = "app/clothing/page.tsx";
const DELIVERY_DIALOG = "components/clothing/kit-delivery-dialog.tsx";

test("il modulo di assegnazione parte dalla taglia dell'anagrafica", () => {
  const source = read(CLOTHING_PAGE);

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
  assert.match(read(CLOTHING_PAGE), /size: sizeDescription\.size,/);
});

test("l'assegnazione non scrive l'anagrafica taglie", () => {
  const source = read(CLOTHING_PAGE);
  const assignmentWrites = source
    .split(/\r?\n/)
    .filter((line) => /clothingSizes|shirtSize|pantsSize|shoeSize/.test(line))
    .filter((line) => /set|update|save/i.test(line));

  assert.deepEqual(
    assignmentWrites,
    [],
    "assegnare un capo di una taglia diversa non deve riscrivere l'anagrafica",
  );
});

test("lo stato del kit mostrato in elenco e quello derivato", () => {
  const source = read(CLOTHING_PAGE);

  assert.match(source, /<KitDeliveryStateBadge/);
  assert.match(
    read(DELIVERY_DIALOG),
    /getKitDeliveryProgress\(assignment\)/,
    "il badge legge il progresso, non un campo scritto a mano",
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

test("il dialogo consegne offre i quattro stati per articolo", () => {
  const source = read(DELIVERY_DIALOG);

  assert.match(
    source,
    /const ITEM_STATES: ClothingItemState\[\] = \[\s*"to_prepare",\s*"ready",\s*"delivered",\s*"unavailable",\s*\]/,
  );
  for (const field of ["Taglia assegnata", "Quantita", "Data consegna", "Note"]) {
    assert.ok(
      source.includes(field),
      `il dialogo deve permettere di registrare «${field}»`,
    );
  }
});

test("il dialogo consegne e usabile a 375 px", () => {
  const offending = read(DELIVERY_DIALOG)
    .split(/\r?\n/)
    .filter((line) => /(?<![a-z:])grid-cols-[23]\b/.test(line))
    .filter((line) => !line.includes("TabsList"));

  assert.deepEqual(
    offending,
    [],
    "le consegne si registrano in magazzino, spesso dal telefono",
  );
});

test("il kit non chiede piu una stagione", () => {
  const source = read(CLOTHING_PAGE);
  const kitDialog = source.slice(
    source.indexOf('<TabsContent value="kit"'),
    source.indexOf('<TabsContent value="magazzino"'),
  );

  assert.equal(
    /placeholder="Stagione"/.test(kitDialog),
    false,
    "clothing_kits non e un tipo stagionale: il campo sembrava un filtro e non filtrava niente",
  );
  assert.equal(
    /<TableHead>Stagione<\/TableHead>/.test(kitDialog),
    false,
  );
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
  const source = read(CLOTHING_PAGE);

  assert.match(source, /sizeSource: itemForm\.sizeSource,/);
  assert.match(source, /id="item-size-source"/);
});
