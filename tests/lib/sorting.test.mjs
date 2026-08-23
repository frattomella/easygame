import assert from "node:assert/strict";
import test from "node:test";

import {
  compareNameValues,
  sortByName,
  sortByNameKeys,
} from "../../src/lib/sorting.ts";
import {
  compareAthletesByLastName,
  sortPeopleByLastName,
} from "../../src/lib/athlete-name-utils.ts";

/**
 * Regressione Web V1 Blocco 5 - ordinamento nominale centralizzato.
 *
 * Prima ogni pagina si scriveva il proprio `localeCompare`: locale, opzioni e
 * trattamento dei valori vuoti cambiavano da elenco a elenco.
 */

test("l'ordinamento ignora le maiuscole", () => {
  assert.deepEqual(
    sortByName(
      [{ name: "rossi" }, { name: "Bianchi" }, { name: "aMATO" }],
      (item) => item.name,
    ).map((item) => item.name),
    ["aMATO", "Bianchi", "rossi"],
  );
});

test("i numeri nei nomi si ordinano come numeri", () => {
  assert.deepEqual(
    sortByName(
      [{ name: "Under 10" }, { name: "Under 9" }, { name: "Under 15" }],
      (item) => item.name,
    ).map((item) => item.name),
    ["Under 9", "Under 10", "Under 15"],
  );
});

test("i valori vuoti finiscono in fondo, non in testa", () => {
  assert.deepEqual(
    sortByName(
      [{ name: "" }, { name: "Zeta" }, { name: null }, { name: "Alfa" }],
      (item) => item.name,
    ).map((item) => item.name),
    ["Alfa", "Zeta", "", null],
  );

  assert.ok(compareNameValues("", "Alfa") > 0);
  assert.ok(compareNameValues("Alfa", "") < 0);
  assert.equal(compareNameValues("", ""), 0);
});

test("l'ordinamento e stabile a parita di nome", () => {
  const input = [
    { name: "Rossi", id: 1 },
    { name: "rossi", id: 2 },
    { name: "ROSSI", id: 3 },
  ];

  assert.deepEqual(
    sortByName(input, (item) => item.name).map((item) => item.id),
    [1, 2, 3],
  );
});

test("sortByName non muta la collezione di partenza", () => {
  const input = [{ name: "Zeta" }, { name: "Alfa" }];
  const sorted = sortByName(input, (item) => item.name);

  assert.equal(input[0].name, "Zeta");
  assert.notEqual(sorted, input);
});

test("sortByNameKeys usa la seconda chiave solo a parita di prima", () => {
  assert.deepEqual(
    sortByNameKeys(
      [
        { last: "Rossi", first: "Marco" },
        { last: "Rossi", first: "Anna" },
        { last: "Bianchi", first: "Zeno" },
      ],
      (item) => [item.last, item.first],
    ).map((item) => `${item.last} ${item.first}`),
    ["Bianchi Zeno", "Rossi Anna", "Rossi Marco"],
  );
});

test("le persone si ordinano per Cognome poi Nome", () => {
  const people = [
    { first_name: "Marco", last_name: "Rossi" },
    { first_name: "Anna", last_name: "rossi" },
    { first_name: "Zeno", last_name: "Bianchi" },
  ];

  assert.deepEqual(
    sortPeopleByLastName(people).map(
      (person) => `${person.last_name} ${person.first_name}`,
    ),
    ["Bianchi Zeno", "rossi Anna", "Rossi Marco"],
  );
});

test("il comparatore persone accetta anche camelCase e il solo nome completo", () => {
  assert.ok(
    compareAthletesByLastName(
      { firstName: "Anna", lastName: "Bianchi" },
      { first_name: "Marco", last_name: "Rossi" },
    ) < 0,
  );

  // Senza cognome separato resta l'etichetta: non si indovina dove finisca il
  // cognome dentro un campo unico.
  assert.ok(
    compareAthletesByLastName({ name: "Anna Bianchi" }, { name: "Zeno Verdi" }) <
      0,
  );
});
