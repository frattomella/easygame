import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCategoryCompatibilityIndex,
  getAthleteCategoryEligibility,
  getEligibilityKind,
  readCategoryCompatibilityList,
} from "../../src/lib/category-compatibility.ts";
import { buildClubCategoryOptions } from "../../src/lib/category-utils.ts";

/**
 * Regressione Web V1 Blocco 5 - modello di compatibilita fra categorie
 * (ADR-0030).
 *
 * Il modello e esplicito, orientato e non transitivo: qui si verifica che
 * resti tale anche con categorie personalizzate, il caso che rompe qualunque
 * deduzione basata sul nome.
 */

const CATEGORIES = [
  {
    id: "cat-u13",
    name: "Under 13",
    compatibleCategoryIds: ["cat-u14"],
  },
  {
    id: "cat-u14",
    name: "Under 14",
    compatibleCategoryIds: ["cat-u15"],
  },
  { id: "cat-u15", name: "Under 15" },
];

const athleteInCategory = (categoryId, categoryName) => ({
  id: "atleta-1",
  first_name: "Mario",
  last_name: "Rossi",
  category_id: categoryId,
  category_name: categoryName,
});

test("la compatibilita si legge da tutte le forme in cui puo essere salvata", () => {
  assert.deepEqual(readCategoryCompatibilityList({ compatibleCategoryIds: ["a", "b"] }), [
    "a",
    "b",
  ]);
  assert.deepEqual(
    readCategoryCompatibilityList({ compatible_category_ids: "a, b" }),
    ["a", "b"],
  );
  assert.deepEqual(
    readCategoryCompatibilityList({ compatibleCategories: [{ id: "a" }, { name: "b" }] }),
    ["a", "b"],
  );
  assert.deepEqual(readCategoryCompatibilityList({}), []);
  assert.deepEqual(readCategoryCompatibilityList(null), []);
});

test("l'eleggibilita e orientata: vale dalla categoria dichiarante verso quella dichiarata", () => {
  const index = buildCategoryCompatibilityIndex(CATEGORIES);

  const u13 = getAthleteCategoryEligibility({
    athlete: athleteInCategory("cat-u13", "Under 13"),
    index,
  });
  assert.deepEqual(u13.compatibleCategoryIds, ["cat-u14"]);

  const u14 = getAthleteCategoryEligibility({
    athlete: athleteInCategory("cat-u14", "Under 14"),
    index,
  });
  // U14 dichiara U15, non U13: la direzione inversa non e implicita.
  assert.deepEqual(u14.compatibleCategoryIds, ["cat-u15"]);
});

test("l'eleggibilita non e transitiva: U13 non arriva a U15", () => {
  const index = buildCategoryCompatibilityIndex(CATEGORIES);
  const eligibility = getAthleteCategoryEligibility({
    athlete: athleteInCategory("cat-u13", "Under 13"),
    index,
  });

  assert.equal(
    getEligibilityKind({
      eligibility,
      categoryIds: ["cat-u14"],
      includeCompatible: true,
    }),
    "compatible",
  );

  assert.equal(
    getEligibilityKind({
      eligibility,
      categoryIds: ["cat-u15"],
      includeCompatible: true,
    }),
    "none",
  );
});

test("senza richiesta esplicita l'eleggibilita non conta come appartenenza", () => {
  const index = buildCategoryCompatibilityIndex(CATEGORIES);
  const eligibility = getAthleteCategoryEligibility({
    athlete: athleteInCategory("cat-u13", "Under 13"),
    index,
  });

  assert.equal(
    getEligibilityKind({ eligibility, categoryIds: ["cat-u14"] }),
    "none",
  );
  assert.equal(
    getEligibilityKind({ eligibility, categoryIds: ["cat-u13"] }),
    "primary",
  );
});

test("categoria primaria, appartenenze e eleggibilita restano insiemi distinti", () => {
  const index = buildCategoryCompatibilityIndex(CATEGORIES);
  const eligibility = getAthleteCategoryEligibility({
    athlete: {
      id: "atleta-2",
      first_name: "Luca",
      last_name: "Bianchi",
      category_memberships: [
        { category_id: "cat-u13", category_name: "Under 13", is_primary: true },
        { category_id: "cat-u15", category_name: "Under 15", is_primary: false },
      ],
    },
    index,
  });

  assert.equal(eligibility.primaryCategoryId, "cat-u13");
  assert.deepEqual(eligibility.memberCategoryIds.sort(), ["cat-u13", "cat-u15"]);
  // U14 arriva dalla compatibilita di U13; U15 e gia appartenenza e non viene
  // ripetuto fra le eleggibilita.
  assert.deepEqual(eligibility.compatibleCategoryIds, ["cat-u14"]);

  assert.equal(
    getEligibilityKind({ eligibility, categoryIds: ["cat-u15"] }),
    "secondary",
  );
});

test("la compatibilita funziona con categorie personalizzate e riferimenti per nome", () => {
  const custom = [
    {
      id: "cat-scauri",
      name: "Pulcini - Scauri",
      // Riferimento per nome e con maiuscole diverse: deve risolvere lo stesso.
      compatibleCategoryIds: ["pulcini - s. cosma"],
    },
    { id: "cat-cosma", name: "Pulcini - S. Cosma" },
  ];
  const index = buildCategoryCompatibilityIndex(custom);

  assert.deepEqual(index.getCompatibleCategoryIds("cat-scauri"), ["cat-cosma"]);
  assert.deepEqual(index.getSourceCategoryIds("cat-cosma"), ["cat-scauri"]);
  assert.deepEqual(index.getCompatibleCategoryIds("cat-cosma"), []);
});

test("una categoria non puo essere compatibile con se stessa", () => {
  const index = buildCategoryCompatibilityIndex([
    { id: "cat-a", name: "Alfa", compatibleCategoryIds: ["cat-a", "Alfa", "cat-b"] },
    { id: "cat-b", name: "Beta" },
  ]);

  assert.deepEqual(index.getCompatibleCategoryIds("cat-a"), ["cat-b"]);
});

test("la compatibilita sopravvive alla normalizzazione delle opzioni categoria", () => {
  const options = buildClubCategoryOptions({
    clubCategories: CATEGORIES,
    athletes: [athleteInCategory("cat-u13", "Under 13")],
  });

  const u13 = options.find((option) => option.id === "cat-u13");
  assert.deepEqual(u13.compatibleCategoryIds, ["cat-u14"]);
});
