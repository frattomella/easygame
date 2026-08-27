import assert from "node:assert/strict";
import test from "node:test";

import {
  availableExportScopes,
  defaultExportScope,
  describeSelection,
  exportScopeLabel,
  pruneSelection,
  resolveScopeRows,
  selectionHeaderState,
  toggleManySelection,
  toggleSelection,
} from "../../src/lib/list-selection.ts";

/**
 * Selezione multipla negli elenchi di persone (RC Fix 2, punti 6-10).
 *
 * L'elenco Atleti selezionava e agiva sulla selezione da tempo; allenatori,
 * staff e soci avevano l'export PDF e basta, e quell'export prendeva **sempre
 * tutto**. Chi voleva il tesserino di quattro allenatori stampava quaranta
 * pagine.
 *
 * Portare il pattern su tre schermate copiandolo tre volte avrebbe prodotto
 * quattro versioni allineate il giorno del rilascio. Le regole stanno qui, e
 * qui si collaudano.
 */

const rows = [
  { id: "a", name: "Anna" },
  { id: "b", name: "Bruno" },
  { id: "c", name: "Carla" },
  { id: "d", name: "Dario" },
];
const idOf = (row) => row.id;

test("una spunta aggiunge, e toglierla toglie", () => {
  let selection = new Set();
  selection = toggleSelection(selection, "a", true);
  selection = toggleSelection(selection, "b", true);

  assert.deepEqual([...selection].sort(), ["a", "b"]);

  selection = toggleSelection(selection, "a", false);
  assert.deepEqual([...selection], ["b"]);
});

test("«seleziona tutti visibili» agisce solo sui visibili", () => {
  let selection = new Set(["d"]);
  selection = toggleManySelection(selection, ["a", "b"], true);

  assert.deepEqual(
    [...selection].sort(),
    ["a", "b", "d"],
    "chi era selezionato e non e visibile resta selezionato",
  );

  selection = toggleManySelection(selection, ["a", "b"], false);
  assert.deepEqual([...selection], ["d"]);
});

/**
 * Lo stato indeterminato non e un vezzo: una spunta piena su un elenco
 * selezionato a meta dice una cosa falsa, e chi la toglie si aspetta di
 * deselezionare meta.
 */
test("la casella in testa distingue nessuno, alcuni e tutti", () => {
  const ids = ["a", "b", "c"];

  assert.equal(selectionHeaderState(new Set(), ids), false);
  assert.equal(selectionHeaderState(new Set(["a"]), ids), "indeterminate");
  assert.equal(selectionHeaderState(new Set(["a", "b", "c"]), ids), true);
  assert.equal(
    selectionHeaderState(new Set(["a", "b", "c"]), []),
    false,
    "senza righe non c'e niente da selezionare",
  );
});

/**
 * La regola che conta piu di tutte: «selezionati» significa **esattamente** i
 * selezionati. Un export con dentro una persona che nessuno ha scelto e un
 * documento che poi esce dal club.
 */
test("l'ambito «selezionati» non e intersecato con il filtro", () => {
  const filtered = [rows[0], rows[1]];
  const selected = new Set(["a", "d"]);

  const result = resolveScopeRows({
    scope: "selected",
    rows,
    filteredRows: filtered,
    selectedIds: selected,
    idOf,
  });

  assert.deepEqual(
    result.map(idOf),
    ["a", "d"],
    "Dario e selezionato anche se il filtro non lo mostra piu",
  );
});

test("gli altri due ambiti sono il filtro e l'elenco intero", () => {
  const filtered = [rows[0], rows[1]];

  assert.deepEqual(
    resolveScopeRows({
      scope: "filtered",
      rows,
      filteredRows: filtered,
      selectedIds: new Set(),
      idOf,
    }).map(idOf),
    ["a", "b"],
  );

  assert.deepEqual(
    resolveScopeRows({
      scope: "all",
      rows,
      filteredRows: filtered,
      selectedIds: new Set(),
      idOf,
    }).map(idOf),
    ["a", "b", "c", "d"],
  );
});

/**
 * Si offrono solo gli ambiti che vogliono dire qualcosa di diverso dagli
 * altri. Sull'elenco Soci, che di filtri non ne ha, «risultato filtrato»
 * sarebbe una seconda voce «tutti» con un altro nome.
 */
test("gli ambiti offerti dipendono da cosa c'e davvero", () => {
  assert.deepEqual(
    availableExportScopes({ selectedCount: 0, filteredCount: 4, totalCount: 4 }),
    ["all"],
    "senza selezione e senza filtri attivi resta un ambito solo",
  );

  assert.deepEqual(
    availableExportScopes({ selectedCount: 0, filteredCount: 2, totalCount: 4 }),
    ["filtered", "all"],
  );

  assert.deepEqual(
    availableExportScopes({ selectedCount: 2, filteredCount: 2, totalCount: 4 }),
    ["selected", "filtered", "all"],
  );

  assert.deepEqual(
    availableExportScopes({ selectedCount: 0, filteredCount: 0, totalCount: 0 }),
    [],
    "su un elenco vuoto non si esporta niente",
  );
});

/**
 * Il PDF di quaranta pagine a chi ne aveva scelte quattro: e questo che il
 * primo ambito evita.
 */
test("con una selezione attiva il primo ambito e sempre «selezionati»", () => {
  const scopes = availableExportScopes({
    selectedCount: 4,
    filteredCount: 40,
    totalCount: 120,
  });

  assert.equal(defaultExportScope(scopes), "selected");
  assert.equal(exportScopeLabel("selected", 4), "Esporta selezionati (4)");
  assert.equal(
    defaultExportScope(availableExportScopes({
      selectedCount: 0,
      filteredCount: 40,
      totalCount: 120,
    })),
    "filtered",
  );
});

test("il conteggio si legge al singolare quando e uno", () => {
  const nouns = { one: "allenatore", many: "allenatori" };

  assert.equal(describeSelection(1, nouns), "1 allenatore selezionato");
  assert.equal(describeSelection(3, nouns), "3 allenatori selezionati");
});

/**
 * Dopo una cancellazione, una selezione che tiene l'id di una riga sparita
 * mostra un conteggio che non corrisponde a niente.
 */
test("la selezione si ripulisce di cio che non esiste piu", () => {
  const pruned = pruneSelection(new Set(["a", "b", "z"]), ["a", "c"]);

  assert.deepEqual([...pruned], ["a"]);
});
