import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Il contratto del DataGrid che le pagine migrate usano davvero: cio che una
 * pagina chiede alla griglia deve esistere nella griglia, e le regole di
 * `10-handoff.md` §10.5 restano scritte nel sorgente.
 */
const read = (file) => readFileSync(path.join(process.cwd(), file), "utf8");
const types = read("src/components/web/datagrid/types.ts");
const state = read("src/components/web/datagrid/useGridState.ts");
const grid = read("src/components/web/datagrid/DataGrid.tsx");

test("il contratto espone cio che le pagine hanno chiesto", () => {
  for (const prop of ["rowLabel?:", "totalCount?:", "onQueryChange?:", "onFiltersChange?:", "onViewChange?:", "requestedViewId?:", "initialFilters?:", "serverTotal?:"]) {
    assert.ok(types.includes(prop), `manca ${prop}`);
  }
  assert.match(types, /onRun: \(rows: Row\[\], scope: \{ all: boolean \}\)/, "l'ambito «tutti» arriva all'azione di massa");
});

test("un deep link con filtri vince sulla vista ricordata, una volta sola", () => {
  assert.match(state, /initialFilters && activeFilterEntries\(initialFilters\)\.length/);
  assert.match(state, /setActiveViewIdState\(ALL_VIEW_ID\);\s*setFilterState\(\{ \.\.\.initialFilters \}\)/);
});

test("la vista predefinita del modulo si applica al primo ingresso", () => {
  assert.match(state, /readPreference<string \| null>\(module, "view", null\)/);
  assert.match(state, /\(v \? candidates\.find\(\(x\) => x\.id === v\) : undefined\) \|\| defaultView/);
});

test("la riga nomina di chi sono le azioni, e lo stato filtrato-vuoto non offre la creazione", () => {
  assert.match(grid, /Altre azioni per \$\{rowLabel\(row\)\}/);
  assert.match(grid, /Nessun risultato con questi filtri/);
  assert.match(grid, /Azzera i filtri/);
  assert.equal(/window\.confirm|window\.prompt|alert\(/.test(grid), false);
});
