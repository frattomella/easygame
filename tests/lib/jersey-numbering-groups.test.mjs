import assert from "node:assert/strict";
import test from "node:test";

import {
  buildJerseyNumberIndex,
  getAthleteJerseyNumberSummary,
  getJerseyGroupSummaries,
} from "../../src/lib/jersey-numbering-utils.ts";
import { buildClubCategoryOptions } from "../../src/lib/category-utils.ts";

/**
 * Regressione Web V1 Blocco 5 - gruppi numerazione.
 *
 * I tre difetti coperti qui sono quelli osservati in produzione d'uso:
 *
 * 1. atleti assenti dai gruppi quando la categoria e registrata con una forma
 *    diversa (solo nome, maiuscole diverse, membership snake_case);
 * 2. nome atleta stampato due volte, perche l'API espone sia
 *    `first_name`/`last_name` sia l'alias `name`;
 * 3. gruppi calcolati uno a uno, ognuno rileggendo l'intero stato.
 */

const CATEGORIES = [
  {
    id: "cat-scauri",
    name: "Pulcini - Scauri",
    compatibleCategoryIds: ["cat-cosma"],
  },
  { id: "cat-cosma", name: "Pulcini - S. Cosma" },
];

// Riproduce la forma con cui l'API espone un atleta: campi snake_case piu
// l'alias `name` aggiunto da `withCompatibilityAliases`.
const apiAthlete = (id, firstName, lastName, extra = {}) => ({
  id,
  first_name: firstName,
  last_name: lastName,
  name: `${firstName} ${lastName}`,
  ...extra,
});

const emptyState = { assignments: [], jerseyAssignments: [] };

const group = (id, name, categoryIds, overrides = {}) => ({
  id,
  name,
  categoryIds,
  includeCompatibleCategories: false,
  season: "",
  minNumber: 1,
  maxNumber: 99,
  reservedNumbers: [],
  assignedNumbers: [],
  ...overrides,
});

test("il nome dell'atleta non viene stampato due volte", () => {
  const [summary] = getJerseyGroupSummaries({
    groups: [group("g1", "Scauri", ["cat-scauri"])],
    state: emptyState,
    athletes: [
      apiAthlete("a1", "Mario", "Rossi", {
        category_id: "cat-scauri",
        category_name: "Pulcini - Scauri",
      }),
    ],
    categories: CATEGORIES,
  });

  assert.equal(summary.rows.length, 1);
  assert.equal(summary.rows[0].athleteName, "Rossi Mario");
});

test("un atleta la cui categoria e registrata solo per nome entra nel gruppo", () => {
  const [summary] = getJerseyGroupSummaries({
    groups: [group("g1", "S. Cosma", ["cat-cosma"])],
    state: emptyState,
    athletes: [
      // Nessun `category_id`, nome con maiuscole diverse: e il dato storico
      // che prima faceva sparire l'atleta dal gruppo.
      apiAthlete("a1", "Anna", "Verdi", {
        category_name: "pulcini - s. cosma",
      }),
    ],
    categories: CATEGORIES,
  });

  assert.deepEqual(
    summary.rows.map((row) => row.athleteName),
    ["Verdi Anna"],
  );
});

test("le categorie con nomi simili restano gruppi distinti", () => {
  const athletes = [
    apiAthlete("a1", "Mario", "Rossi", {
      category_id: "cat-scauri",
      category_name: "Pulcini - Scauri",
    }),
    apiAthlete("a2", "Anna", "Verdi", {
      category_id: "cat-cosma",
      category_name: "Pulcini - S. Cosma",
    }),
  ];

  const summaries = getJerseyGroupSummaries({
    groups: [
      group("g1", "Scauri", ["cat-scauri"]),
      group("g2", "S. Cosma", ["cat-cosma"]),
    ],
    state: emptyState,
    athletes,
    categories: buildClubCategoryOptions({
      clubCategories: CATEGORIES,
      athletes,
    }),
  });

  assert.deepEqual(
    summaries.map((summary) => summary.rows.map((row) => row.athleteName)),
    [["Rossi Mario"], ["Verdi Anna"]],
  );
});

test("le categorie compatibili entrano nel gruppo solo se il gruppo lo chiede", () => {
  const athletes = [
    apiAthlete("a1", "Mario", "Rossi", {
      category_id: "cat-scauri",
      category_name: "Pulcini - Scauri",
    }),
  ];

  const [chiuso, aperto] = getJerseyGroupSummaries({
    groups: [
      group("g1", "S. Cosma", ["cat-cosma"]),
      group("g2", "S. Cosma esteso", ["cat-cosma"], {
        includeCompatibleCategories: true,
      }),
    ],
    state: emptyState,
    athletes,
    categories: CATEGORIES,
  });

  assert.deepEqual(chiuso.rows, []);
  assert.deepEqual(
    aperto.rows.map((row) => [row.athleteName, row.membership]),
    [["Rossi Mario", "compatible"]],
  );
  // L'eleggibilita non cambia la categoria mostrata: resta la sua.
  assert.equal(aperto.rows[0].categoryLabel, "Pulcini - Scauri");
});

test("le righe sono ordinate per Cognome poi Nome", () => {
  const [summary] = getJerseyGroupSummaries({
    groups: [group("g1", "Tutti", [])],
    state: emptyState,
    athletes: [
      apiAthlete("a1", "Marco", "Rossi"),
      apiAthlete("a2", "Anna", "rossi"),
      apiAthlete("a3", "Zeno", "Bianchi"),
    ],
    categories: CATEGORIES,
  });

  assert.deepEqual(
    summary.rows.map((row) => row.athleteName),
    ["Bianchi Zeno", "rossi Anna", "Rossi Marco"],
  );
});

test("un atleta con numero ma fuori dalle categorie resta visibile", () => {
  const state = {
    assignments: [],
    jerseyAssignments: [
      { id: "j1", athleteId: "a9", groupId: "g1", number: 7 },
    ],
  };

  const [summary] = getJerseyGroupSummaries({
    groups: [group("g1", "Scauri", ["cat-scauri"])],
    state,
    athletes: [apiAthlete("a9", "Luca", "Neri", { category_id: "cat-cosma" })],
    categories: CATEGORIES,
  });

  assert.deepEqual(
    summary.rows.map((row) => [row.athleteName, row.membership, row.numbers]),
    [["Neri Luca", "external", [7]]],
  );
  assert.deepEqual(summary.usedNumbers, [7]);
  assert.ok(!summary.availableNumbers.includes(7));
});

test("i numeri duplicati nel gruppo vengono segnalati", () => {
  const state = {
    assignments: [],
    jerseyAssignments: [
      { id: "j1", athleteId: "a1", groupId: "g1", number: 10 },
      { id: "j2", athleteId: "a2", groupId: "g1", number: 10 },
    ],
  };

  const [summary] = getJerseyGroupSummaries({
    groups: [group("g1", "Tutti", [])],
    state,
    athletes: [
      apiAthlete("a1", "Mario", "Rossi"),
      apiAthlete("a2", "Anna", "Verdi"),
    ],
    categories: CATEGORIES,
  });

  assert.deepEqual(
    summary.duplicateNumbers.map((entry) => entry.number),
    [10],
  );
  summary.rows.forEach((row) => assert.deepEqual(row.duplicateNumbers, [10]));
});

test("i numeri riservati non risultano disponibili", () => {
  const [summary] = getJerseyGroupSummaries({
    groups: [
      group("g1", "Tutti", [], {
        minNumber: 1,
        maxNumber: 5,
        reservedNumbers: [3],
      }),
    ],
    state: emptyState,
    athletes: [],
    categories: CATEGORIES,
  });

  assert.deepEqual(summary.availableNumbers, [1, 2, 4, 5]);
});

test("l'indice dei numeri si costruisce con una sola scansione dello stato", () => {
  const state = {
    assignments: [
      {
        id: "as1",
        athleteId: "a1",
        status: "assigned",
        numberingGroupId: "g1",
        items: [{ id: "i1", itemId: "maglia", number: 4 }],
      },
      {
        id: "as2",
        athleteId: "a2",
        status: "cancelled",
        numberingGroupId: "g1",
        items: [{ id: "i2", itemId: "maglia", number: 5 }],
      },
    ],
    jerseyAssignments: [
      { id: "j1", athleteId: "a3", groupId: "g1", number: 9 },
      { id: "j2", athleteId: "a4", groupId: "g2", number: 9 },
    ],
  };

  const index = buildJerseyNumberIndex(state);

  // L'assegnazione annullata non entra: non occupa un numero.
  assert.deepEqual(
    (index.byGroupId.get("g1") || []).map((record) => record.number).sort(),
    [4, 9],
  );
  assert.deepEqual(
    (index.byAthleteId.get("a3") || []).map((record) => record.number),
    [9],
  );
});

test("il riepilogo per atleta trova i duplicati senza rileggere lo stato per record", () => {
  const state = {
    assignments: [],
    jerseyAssignments: [
      { id: "j1", athleteId: "a1", groupId: "g1", number: 10 },
      { id: "j2", athleteId: "a2", groupId: "g1", number: 10 },
      { id: "j3", athleteId: "a1", groupId: "g2", number: 11 },
    ],
  };

  const summary = getAthleteJerseyNumberSummary({
    athleteId: "a1",
    state,
    groups: [group("g1", "Primo", []), group("g2", "Secondo", [])],
  });

  assert.equal(summary.records.length, 2);
  assert.deepEqual(
    summary.duplicateRecords.map((record) => record.number),
    [10],
  );
  assert.equal(summary.groupNameForRecord(summary.records[0]), "Primo");
});
