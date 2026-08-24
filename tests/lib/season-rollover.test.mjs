import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeRolloverTypes,
  planSeasonRollover,
  SEASON_NEVER_COPIED_DATA_TYPES,
  SEASON_ROLLOVER_TYPES,
} from "../../src/lib/club-seasons.ts";

/**
 * WP-35 — riporto della configurazione da una stagione all'altra.
 *
 * Il pianificatore e puro: prende le collezioni complete e restituisce quelle
 * risultanti. Qui si verificano le quattro proprieta che rendono il riporto
 * sicuro da rieseguire: id nuovi, nessun duplicato, riferimenti coerenti,
 * riepilogo veritiero.
 */

const SOURCE = "s-2025";
const TARGET = "s-2026";

let counter = 0;
const generateId = (type) => `${type}-nuovo-${++counter}`;

const collections = () => ({
  categories: [
    { id: "cat-u14", name: "Under 14", seasonId: SOURCE, compatibleCategoryIds: ["cat-u16"] },
    { id: "cat-u16", name: "Under 16", seasonId: SOURCE },
    { id: "cat-vecchia", name: "Prima squadra", seasonId: "s-2024" },
  ],
  discounts: [{ id: "sc-fratelli", name: "Sconto fratelli", seasonId: SOURCE }],
  payment_plans: [
    {
      id: "pp-base",
      name: "Quota base",
      seasonId: SOURCE,
      categoryId: "cat-u14",
      applicableDiscountIds: ["sc-fratelli"],
      installments: [{ id: "rata-1", label: "Acconto", categoryIds: ["cat-u16"] }],
    },
  ],
});

const plan = (overrides = {}) => {
  counter = 0;
  return planSeasonRollover({
    sourceSeasonId: SOURCE,
    targetSeasonId: TARGET,
    types: ["categories", "discounts", "payment_plans"],
    collections: collections(),
    generateId,
    now: "2026-08-24T00:00:00.000Z",
    ...overrides,
  });
};

test("il riporto crea record nuovi, con id nuovi e la stagione di destinazione", () => {
  const risultato = plan();
  const nuoveCategorie = risultato.collections.categories.filter(
    (record) => record.seasonId === TARGET,
  );

  assert.equal(nuoveCategorie.length, 2);
  for (const categoria of nuoveCategorie) {
    assert.notEqual(
      categoria.id,
      categoria.rolloverSourceId,
      "riusare l'id farebbe condividere lo stesso record a due stagioni",
    );
    assert.equal(categoria.seasonId, TARGET);
    assert.equal(categoria.rolloverSourceSeasonId, SOURCE);
  }

  assert.equal(
    risultato.collections.categories.length,
    5,
    "gli originali restano dove sono: il riporto aggiunge, non sposta",
  );
});

test("le stagioni diverse dall'origine non vengono toccate", () => {
  const risultato = plan();
  const altra = risultato.collections.categories.find(
    (record) => record.id === "cat-vecchia",
  );

  assert.ok(altra, "una categoria di un'altra stagione non deve sparire");
  assert.equal(altra.seasonId, "s-2024");
  assert.equal(
    risultato.entries.find((entry) => entry.type === "categories").available,
    2,
    "l'origine ha due categorie, non tre",
  );
});

test("i riferimenti fra record riportati puntano ai nuovi id", () => {
  const risultato = plan();
  const mappa = Object.fromEntries(
    risultato.collections.categories
      .filter((record) => record.seasonId === TARGET)
      .map((record) => [record.rolloverSourceId, record.id]),
  );
  const nuovoSconto = risultato.collections.discounts.find(
    (record) => record.seasonId === TARGET,
  );
  const nuovoPiano = risultato.collections.payment_plans.find(
    (record) => record.seasonId === TARGET,
  );
  const nuovaU14 = risultato.collections.categories.find(
    (record) => record.rolloverSourceId === "cat-u14",
  );

  assert.equal(nuovoPiano.categoryId, mappa["cat-u14"]);
  assert.deepEqual(nuovoPiano.applicableDiscountIds, [nuovoSconto.id]);
  assert.deepEqual(
    nuovoPiano.installments[0].categoryIds,
    [mappa["cat-u16"]],
    "il rimappaggio deve scendere anche dentro le rate",
  );
  assert.deepEqual(
    nuovaU14.compatibleCategoryIds,
    [mappa["cat-u16"]],
    "le compatibilita fra categorie non devono puntare alla stagione vecchia",
  );
});

test("rieseguire il riporto non crea duplicati", () => {
  const primo = plan();
  const secondo = planSeasonRollover({
    sourceSeasonId: SOURCE,
    targetSeasonId: TARGET,
    types: ["categories", "discounts", "payment_plans"],
    collections: primo.collections,
    generateId,
    now: "2026-08-25T00:00:00.000Z",
  });

  assert.equal(secondo.createdTotal, 0);
  assert.equal(secondo.skippedTotal, primo.createdTotal);
  assert.deepEqual(
    secondo.collections,
    {},
    "senza creazioni non si riscrive nessuna collezione",
  );
});

test("un elemento gia creato a mano con lo stesso nome non viene duplicato", () => {
  const base = collections();
  base.categories.push({ id: "cat-mano", name: "under 14", seasonId: TARGET });

  const risultato = plan({ collections: base });
  const categorie = risultato.entries.find((entry) => entry.type === "categories");

  assert.equal(categorie.created, 1);
  assert.equal(categorie.skipped, 1);
  assert.equal(
    risultato.collections.categories.filter(
      (record) =>
        record.seasonId === TARGET &&
        String(record.name).toLowerCase() === "under 14",
    ).length,
    1,
  );
});

test("il riepilogo dice quanti elementi sono stati creati e quanti saltati", () => {
  const risultato = plan();

  assert.equal(risultato.createdTotal, 4);
  assert.equal(risultato.skippedTotal, 0);
  assert.deepEqual(
    risultato.entries.map((entry) => [entry.type, entry.available, entry.created]),
    [
      ["categories", 2, 2],
      ["discounts", 1, 1],
      ["payment_plans", 1, 1],
    ],
  );
});

test("i dati operativi non sono riportabili nemmeno se richiesti", () => {
  for (const { key } of SEASON_NEVER_COPIED_DATA_TYPES) {
    assert.throws(
      () => normalizeRolloverTypes([key]),
      /non e riportabile fra stagioni/,
      `${key} non deve poter essere copiato in una stagione nuova`,
    );
  }

  assert.deepEqual(
    normalizeRolloverTypes(["payment_plans", "categories"]),
    ["categories", "payment_plans"],
    "l'ordine e quello del catalogo, non quello della richiesta",
  );
  assert.deepEqual(normalizeRolloverTypes(undefined), []);
});

test("il catalogo dei tipi riportabili contiene solo configurazione stagionale", () => {
  const chiavi = SEASON_ROLLOVER_TYPES.map((entry) => entry.key);
  const vietati = SEASON_NEVER_COPIED_DATA_TYPES.map((entry) => entry.key);

  for (const vietato of vietati) {
    assert.ok(
      !chiavi.includes(vietato),
      `${vietato} e un dato storico e non puo comparire fra i riportabili`,
    );
  }
});
