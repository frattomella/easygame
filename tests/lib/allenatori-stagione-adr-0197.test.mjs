import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeTrainerAssignmentsForSeason,
  splitTrainerAssignmentsBySeason,
} from "../../src/lib/trainers/season-assignments.ts";

/**
 * **Bug C del lotto ADR-0197 (scenario §40).** Coach Rossi allena la U15
 * Gold nella stagione A. Nasce la B, senza riporto delle assegnazioni.
 * Nella B Rossi non ha squadre: la pagina lo deve dire, non mostrare la U15
 * Gold dell'anno scorso come attuale. Assegnargli la U17 Gold nella B non
 * tocca la A; tornare sulla A mostra la U15 Gold.
 */

const A = "season-a";
const B = "season-b";
const seasons = [
  { id: B, label: "2026/27" },
  { id: A, label: "2025/26" },
];
const categories = [
  { id: "a-u15", name: "U15 Gold", seasonId: A },
  { id: "a-u17", name: "U17 Gold", seasonId: A },
  { id: "b-u15", name: "U15 Gold", seasonId: B, rolloverSourceId: "a-u15" },
  { id: "b-u17", name: "U17 Gold", seasonId: B, rolloverSourceId: "a-u17" },
];
const groups = [
  { id: "g-a-u15-nord", categoryId: "a-u15", seasonId: A },
  { id: "g-b-u15-nord", categoryId: "b-u15", seasonId: B },
];
const base = { categories, groups, seasons, legacySeasonId: A };

test("stagione B, nessun riporto: nessuna squadra attuale, la U15 Gold e storico della A", () => {
  const rossi = { categories: ["a-u15"], groupIds: ["g-a-u15-nord"] };
  const split = splitTrainerAssignmentsBySeason({ ...base, trainer: rossi, seasonId: B });
  assert.deepEqual(split.current, { categoryIds: [], groupIds: [] });
  assert.deepEqual(split.history, [
    { seasonId: A, seasonLabel: "2025/26", categoryIds: ["a-u15"], groupIds: ["g-a-u15-nord"] },
  ]);
  assert.deepEqual(split.unresolved, []);
});

test("stagione A scelta: la U15 Gold e attuale", () => {
  const rossi = { categories: ["a-u15"] };
  const split = splitTrainerAssignmentsBySeason({ ...base, trainer: rossi, seasonId: A });
  assert.deepEqual(split.current.categoryIds, ["a-u15"]);
  assert.deepEqual(split.history, []);
});

test("assegnare la U17 Gold nella B non tocca la A", () => {
  const rossi = { categories: ["a-u15"], groupIds: ["g-a-u15-nord"] };
  const merged = mergeTrainerAssignmentsForSeason({
    ...base,
    trainer: rossi,
    seasonId: B,
    categoryIds: ["b-u17"],
    groupIds: [],
  });
  assert.deepEqual(merged.categories, ["a-u15", "b-u17"], "storico della A + scelta della B");
  assert.deepEqual(merged.groupIds, ["g-a-u15-nord"]);
  assert.deepEqual(merged.rejectedCategoryIds, []);

  // Tornando sulla A si vede la U15 Gold; sulla B la U17 Gold.
  const dopo = { categories: merged.categories, groupIds: merged.groupIds };
  assert.deepEqual(splitTrainerAssignmentsBySeason({ ...base, trainer: dopo, seasonId: A }).current.categoryIds, ["a-u15"]);
  assert.deepEqual(splitTrainerAssignmentsBySeason({ ...base, trainer: dopo, seasonId: B }).current.categoryIds, ["b-u17"]);
});

test("l'editor della B non puo scrivere una categoria della A: rifiutata e detta", () => {
  const merged = mergeTrainerAssignmentsForSeason({
    ...base,
    trainer: { categories: [] },
    seasonId: B,
    categoryIds: ["a-u17", "b-u15"],
    groupIds: ["g-a-u15-nord", "g-b-u15-nord"],
  });
  assert.deepEqual(merged.categories, ["b-u15"]);
  assert.deepEqual(merged.groupIds, ["g-b-u15-nord"]);
  assert.deepEqual(merged.rejectedCategoryIds, ["a-u17"]);
  assert.deepEqual(merged.rejectedGroupIds, ["g-a-u15-nord"]);
});

test("un nome senza id non sceglie fra due stagioni che lo portano entrambe", () => {
  const perNome = { categories: [{ name: "U15 Gold" }] };
  const inB = splitTrainerAssignmentsBySeason({ ...base, trainer: perNome, seasonId: B });
  // Nella B «U15 Gold» e una sola: si riconosce.
  assert.deepEqual(inB.current.categoryIds, ["b-u15"]);
  // Con due omonime nella stessa stagione resta irrisolto.
  const doppia = [...categories, { id: "b-u15-sud", name: "U15 Gold", seasonId: B }];
  const ambiguo = splitTrainerAssignmentsBySeason({ ...base, categories: doppia, trainer: perNome, seasonId: B });
  assert.deepEqual(ambiguo.current.categoryIds, []);
  assert.deepEqual(ambiguo.unresolved, ["U15 Gold"]);
});

test("una categoria senza stagione, o di una stagione che il club non ha, e della piu vecchia", () => {
  const senza = [
    { id: "vecchia", name: "Pulcini" },
    { id: "orfana", name: "Esordienti", seasonId: "season-mai-esistita" },
  ];
  const t = { categories: ["vecchia", "orfana"] };
  assert.deepEqual(
    splitTrainerAssignmentsBySeason({ ...base, categories: senza, trainer: t, seasonId: A }).current.categoryIds,
    ["vecchia", "orfana"],
  );
  assert.deepEqual(
    splitTrainerAssignmentsBySeason({ ...base, categories: senza, trainer: t, seasonId: B }).current.categoryIds,
    [],
  );
});

test("senza perimetro (club senza stagioni) tutto e attuale", () => {
  const split = splitTrainerAssignmentsBySeason({
    ...base,
    seasons: [],
    legacySeasonId: null,
    trainer: { categories: ["a-u15", "b-u17"] },
    seasonId: null,
  });
  assert.deepEqual(split.current.categoryIds, ["a-u15", "b-u17"]);
});
