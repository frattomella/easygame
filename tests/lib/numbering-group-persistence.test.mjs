import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeClubClothingState,
  normalizeNumberingGroup,
  serializeNumberingGroup,
} from "../../src/lib/clothing-inventory-utils.ts";
import { readCategoryCompatibilityList } from "../../src/lib/category-compatibility.ts";

/**
 * Regressione Web V1 Blocco 5 - persistenza dopo il refresh.
 *
 * Gruppi numerazione e compatibilita fra categorie vivono in campi JSON del
 * club (`clubs.jersey_groups`, `clubs.categories`). Se la serializzazione e la
 * normalizzazione non sono simmetriche, la configurazione sembra salvata ma
 * sparisce al primo ricaricamento della pagina.
 */

test("un gruppo numerazione sopravvive al giro serializza/normalizza", () => {
  const group = normalizeNumberingGroup({
    id: "g1",
    name: "Prima squadra",
    categoryIds: ["cat-a", "cat-b"],
    includeCompatibleCategories: true,
    season: "2025/2026",
    minNumber: 1,
    maxNumber: 50,
    reservedNumbers: [10],
    assignedNumbers: [7],
  });

  const reloaded = normalizeNumberingGroup(
    JSON.parse(JSON.stringify(serializeNumberingGroup(group))),
  );

  assert.equal(reloaded.id, "g1");
  assert.equal(reloaded.name, "Prima squadra");
  assert.deepEqual(reloaded.categoryIds, ["cat-a", "cat-b"]);
  assert.equal(reloaded.includeCompatibleCategories, true);
  assert.equal(reloaded.season, "2025/2026");
  assert.equal(reloaded.minNumber, 1);
  assert.equal(reloaded.maxNumber, 50);
  assert.deepEqual(reloaded.reservedNumbers, [10]);
  assert.deepEqual(reloaded.assignedNumbers, [7]);
});

test("un gruppo salvato prima del flag resta valido e non include i compatibili", () => {
  const legacy = normalizeNumberingGroup({
    id: "g-legacy",
    name: "Vecchio gruppo",
    categories: ["cat-a"],
    minNumber: 0,
    maxNumber: 99,
  });

  assert.equal(legacy.includeCompatibleCategories, false);
  assert.deepEqual(legacy.categoryIds, ["cat-a"]);
});

test("i numeri riservati si leggono da qualunque forma salvata", () => {
  assert.deepEqual(
    normalizeNumberingGroup({ id: "g", reservedNumbers: [1, 2, 2] })
      .reservedNumbers,
    [1, 2],
  );
  assert.deepEqual(
    normalizeNumberingGroup({ id: "g", reserved_numbers: "3, 4" })
      .reservedNumbers,
    [3, 4],
  );
  assert.deepEqual(
    normalizeNumberingGroup({ id: "g", reservedNumbers: ["5", 6, "non-numero"] })
      .reservedNumbers,
    [5, 6],
  );
});

test("lo stato abbigliamento ricaricato conserva il flag dei gruppi", () => {
  const state = normalizeClubClothingState({
    jerseyGroups: [
      {
        id: "g1",
        name: "Gruppo",
        categoryIds: ["cat-a"],
        includeCompatibleCategories: true,
        minNumber: 1,
        maxNumber: 20,
      },
    ],
  });

  assert.equal(state.numberingGroups[0].includeCompatibleCategories, true);
});

test("la compatibilita di una categoria sopravvive al salvataggio in JSON", () => {
  const payload = {
    id: "category-1",
    name: "Under 13",
    compatibleCategoryIds: ["category-2"],
  };

  const reloaded = JSON.parse(JSON.stringify(payload));
  assert.deepEqual(readCategoryCompatibilityList(reloaded), ["category-2"]);
});
