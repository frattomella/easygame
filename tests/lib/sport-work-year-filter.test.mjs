import assert from "node:assert/strict";
import test from "node:test";

import { toYearFilter } from "../../src/lib/sport-work/model.ts";

/**
 * Il filtro per anno, e il difetto che ha reso vuoto il registro delle uscite.
 *
 * **Cosa e successo.** Gli elenchi filtravano cosi:
 *
 *     const year = Number(filter.fiscalYear);
 *     ...(Number.isInteger(year) ? { fiscal_year: year } : {})
 *
 * Nei test passava `undefined`, e `Number(undefined)` e `NaN`: nessun filtro,
 * tutto funzionava. Ma le rotte leggono i parametri con
 * `searchParams.get("fiscal_year")`, che quando il parametro manca restituisce
 * **`null`** — e `Number(null)` non e `NaN`, e `0`, ed e un intero. Il filtro
 * diventava `fiscal_year = 0`, che non corrisponde a niente.
 *
 * Effetto in schermata: il registro delle uscite rispondeva **elenco vuoto** a
 * chiunque non chiedesse un anno esplicito, e in Movimenti non compariva
 * nessun compenso. Duemila test verdi non lo avevano visto: lo ha visto il
 * primo giro di collaudo a runtime.
 *
 * La stessa trappola vale per la stringa vuota, che pure diventa `0`, e per
 * `"  "` dopo il trim.
 */

test("null non e un anno: e l'assenza di filtro", () => {
  assert.equal(toYearFilter(null), null);
});

test("undefined non e un anno", () => {
  assert.equal(toYearFilter(undefined), null);
});

test("la stringa vuota non e un anno, nemmeno con gli spazi", () => {
  assert.equal(toYearFilter(""), null);
  assert.equal(toYearFilter("   "), null);
});

test("un anno vero passa, come numero e come stringa", () => {
  assert.equal(toYearFilter(2026), 2026);
  assert.equal(toYearFilter("2026"), 2026);
  assert.equal(toYearFilter(" 2027 "), 2027);
});

test("cio che anno non e non diventa zero: diventa nessun filtro", () => {
  assert.equal(toYearFilter("abc"), null);
  assert.equal(toYearFilter(0), null);
  assert.equal(toYearFilter(2026.5), null);
  assert.equal(toYearFilter(NaN), null);
  assert.equal(toYearFilter({}), null);
  assert.equal(toYearFilter([]), null);
});

test("un anno fuori scala non filtra: sarebbe un dato inattribuibile", () => {
  assert.equal(toYearFilter(202), null);
  assert.equal(toYearFilter(99999), null);
  assert.equal(toYearFilter(1899), null);
  assert.equal(toYearFilter(2201), null);
});
