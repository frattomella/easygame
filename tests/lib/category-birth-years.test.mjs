import assert from "node:assert/strict";
import test from "node:test";

import {
  findCategoryForBirthDate,
  formatCategoryBirthYears,
  normalizeCategoryBirthYears,
} from "../../src/lib/category-utils.ts";

/**
 * Regressione WP-32 — categorie di un solo anno.
 *
 * Il secondo anno di nascita e facoltativo: quando manca, la categoria copre
 * il solo anno indicato. Prima una categoria senza `birthYearTo` non era
 * salvabile e, se gia presente nei dati, non catturava nessun atleta.
 */

test("un solo anno indicato definisce una categoria di un anno", () => {
  assert.deepEqual(normalizeCategoryBirthYears({ birthYearFrom: 2015 }), {
    birthYearFrom: 2015,
    birthYearTo: 2015,
  });

  assert.deepEqual(normalizeCategoryBirthYears({ birthYearTo: 2015 }), {
    birthYearFrom: 2015,
    birthYearTo: 2015,
  });
});

test("l'etichetta di una categoria di un anno dice l'anno", () => {
  assert.equal(
    formatCategoryBirthYears({ birthYearFrom: 2015 }),
    "Nati nel 2015",
  );
  assert.equal(
    formatCategoryBirthYears({ birthYearFrom: 2014, birthYearTo: 2015 }),
    "Nati dal 2014 al 2015",
  );
});

test("una categoria di un anno cattura gli atleti di quell'anno", () => {
  const categories = [
    { id: "under-2015", name: "Under 2015", birthYearFrom: 2015 },
    { id: "under-misto", name: "Misto", birthYearFrom: 2013, birthYearTo: 2014 },
  ];

  assert.equal(
    findCategoryForBirthDate("2015-04-12", categories)?.id,
    "under-2015",
  );
  assert.equal(
    findCategoryForBirthDate("2014-01-05", categories)?.id,
    "under-misto",
  );
  assert.equal(findCategoryForBirthDate("2011-01-05", categories), null);
});

test("a parita di anno vince l'intervallo piu stretto", () => {
  const categories = [
    { id: "largo", name: "Largo", birthYearFrom: 2013, birthYearTo: 2016 },
    { id: "stretto", name: "Stretto", birthYearFrom: 2015 },
  ];

  assert.equal(
    findCategoryForBirthDate("2015-09-30", categories)?.id,
    "stretto",
  );
});

test("anni invertiti restano un intervallo valido", () => {
  assert.deepEqual(
    normalizeCategoryBirthYears({ birthYearFrom: 2016, birthYearTo: 2014 }),
    { birthYearFrom: 2014, birthYearTo: 2016 },
  );
});

test("senza anni la categoria resta senza intervallo", () => {
  assert.deepEqual(normalizeCategoryBirthYears({}), {
    birthYearFrom: undefined,
    birthYearTo: undefined,
  });
  assert.equal(formatCategoryBirthYears({}), "Anni di nascita non definiti");
});
