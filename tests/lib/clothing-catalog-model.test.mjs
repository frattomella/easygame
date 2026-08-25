import assert from "node:assert/strict";
import test from "node:test";

import {
  getAvailableInventoryForItem,
  normalizeClothingItem,
  normalizeClothingKit,
  serializeClothingItem,
  serializeClothingKit,
} from "../../src/lib/clothing-inventory-utils.ts";

/**
 * Il catalogo abbigliamento non conosce le categorie sportive (Blocco A, 14).
 *
 * **Il difetto, e perche i test della UI non bastavano.** Il Workstream B
 * aveva tolto dal form del kit il campo «Stagione» e il Blocco A ha tolto
 * «Categorie compatibili» da articoli e kit. Un test che guarda solo il JSX
 * verifica che il campo non si veda — e un campo che non si vede ma continua
 * a esistere nel modello, a salvarsi e a comparire in una colonna d'export e
 * *nascosto*, non rimosso. Questi test guardano il modello.
 *
 * **Perche il concetto era sbagliato.** La compatibilita fra categorie e una
 * regola sportiva — chi puo giocare con chi — e vive in
 * `category-compatibility.ts`, dove i gruppi di numerazione la usano davvero.
 * Un catalogo di magazzino non ha eleggibilita sportiva: una maglia taglia M
 * non e «incompatibile» con i Pulcini. Applicarla produceva una tendina in
 * cui meta delle voci comparivano disabilitate con la scritta «Categoria non
 * compatibile», e un magazzino che risultava vuoto per una ragione inventata.
 */

// --- il modello ------------------------------------------------------------

test("un articolo letto da un record legacy non porta con se le categorie", () => {
  const item = normalizeClothingItem({
    id: "item-1",
    name: "Maglia gara",
    sizes: ["S", "M", "L"],
    compatibleCategoryIds: ["cat-pulcini", "cat-esordienti"],
  });

  assert.equal("compatibleCategoryIds" in item, false);
  assert.equal(item.name, "Maglia gara");
  assert.deepEqual(item.sizes, ["S", "M", "L"]);
});

test("un kit letto da un record legacy non porta con se stagione ne categorie", () => {
  const kit = normalizeClothingKit({
    id: "kit-1",
    name: "Kit gara",
    season: "2025/2026",
    compatibleCategoryIds: ["cat-pulcini"],
    components: [],
  });

  assert.equal("season" in kit, false);
  assert.equal("compatibleCategoryIds" in kit, false);
  assert.equal(kit.name, "Kit gara");
});

// --- la scrittura ----------------------------------------------------------

test("salvare un articolo ripulisce il record dalle chiavi ritirate", () => {
  const item = normalizeClothingItem({
    id: "item-1",
    name: "Pantaloncino",
    compatibleCategoryIds: ["cat-pulcini"],
    compatible_category_ids: ["cat-pulcini"],
    fornitore: "Acme",
  });

  const record = serializeClothingItem(item);

  assert.equal("compatibleCategoryIds" in record, false);
  assert.equal("compatible_category_ids" in record, false);
  /*
    Le chiavi che il modello non conosce restano: sono cio che tiene in vita
    i record scritti da versioni precedenti. Si ripuliscono solo le due che
    erano un concetto sbagliato.
  */
  assert.equal(record.fornitore, "Acme");
});

test("salvare un kit ripulisce stagione e categorie, un record per volta", () => {
  const kit = normalizeClothingKit({
    id: "kit-1",
    name: "Kit allenamento",
    season: "2025/2026",
    compatibleCategoryIds: ["cat-pulcini"],
    note: "consegna a settembre",
    components: [],
  });

  const record = serializeClothingKit(kit);

  assert.equal("season" in record, false);
  assert.equal("compatibleCategoryIds" in record, false);
  assert.equal(record.note, "consegna a settembre");
  assert.equal(record.name, "Kit allenamento");
});

// --- il magazzino ----------------------------------------------------------

const item = normalizeClothingItem({
  id: "item-1",
  name: "Maglia gara",
  sizes: ["S", "M"],
});

const inventory = [
  {
    id: "stock-1",
    itemId: "item-1",
    stockType: "single_unit",
    size: "M",
    status: "available",
  },
  {
    id: "stock-2",
    itemId: "item-1",
    stockType: "single_unit",
    size: "S",
    status: "available",
  },
  {
    id: "stock-3",
    itemId: "item-2",
    stockType: "single_unit",
    size: "M",
    status: "available",
  },
];

test("il magazzino di un articolo si filtra per taglia, non per categoria", () => {
  const available = getAvailableInventoryForItem({
    item,
    inventory,
    size: "M",
  });

  assert.deepEqual(
    available.map((stock) => stock.id),
    ["stock-1"],
  );
});

test("senza filtri il magazzino elenca tutti i pezzi di quell'articolo", () => {
  const available = getAvailableInventoryForItem({ item, inventory });

  assert.deepEqual(
    available.map((stock) => stock.id),
    ["stock-1", "stock-2"],
  );
});

/**
 * La regressione precisa: prima questa chiamata restituiva **zero righe**.
 *
 * L'articolo dichiarava categorie compatibili diverse da quelle dell'atleta,
 * e `getCompatibleInventoryForAthlete` usciva subito con un elenco vuoto. Per
 * la segreteria il magazzino sembrava esaurito.
 */
test("il magazzino non e mai vuoto per una ragione sportiva", () => {
  const legacyItem = normalizeClothingItem({
    id: "item-1",
    name: "Maglia gara",
    compatibleCategoryIds: ["cat-nessuno-di-questi"],
  });

  const available = getAvailableInventoryForItem({
    item: legacyItem,
    inventory,
  });

  assert.equal(available.length, 2);
});
