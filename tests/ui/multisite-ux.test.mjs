import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * UX multi-sede (ADR-0036).
 *
 * La proprieta da difendere non e «c'e un filtro sede»: e che **il club
 * mono-sede non veda niente di tutto questo**. Un menu con una voce sola non
 * informa, occupa spazio e a 375 px lo toglie a cio che serve.
 *
 * Come per le altre invarianti statiche (vedi `responsive-invariants`), questi
 * test non sostituiscono l'apertura della pagina: verificano la classe di
 * difetti che si introduce senza accorgersene, cioe montare il concetto di
 * sede dove non c'e nessuna sede.
 */

const SRC = path.join(process.cwd(), "src");
const read = (relative) =>
  readFileSync(path.join(SRC, ...relative.split("/")), "utf8");

const SITE_UI = [
  "components/sites/site-filter.tsx",
  "components/sites/club-sites-section.tsx",
  "components/sites/category-groups-editor.tsx",
];

test("il filtro sede non si monta se il club non e multi-sede", () => {
  const source = read("components/sites/site-filter.tsx");

  assert.match(
    source,
    /if \(!isMultiSiteClub\(sites\)\) \{\s*return null;/,
    "la decisione sta nel componente, cosi ogni pagina la eredita",
  );
});

test("le pagine che filtrano per sede usano il componente, non una tendina propria", () => {
  for (const file of ["app/categories/page.tsx", "app/structures/page.tsx"]) {
    const source = read(file);
    assert.match(
      source,
      /<SiteFilter/,
      `${file} deve montare SiteFilter e non una tendina sede propria`,
    );
  }
});

test("la struttura porta la sede, e senza sede resta visibile", () => {
  const utils = read("lib/structures-utils.ts");
  assert.match(utils, /siteId: firstText\(raw\?\.siteId, raw\?\.site_id\)/);

  const page = read("app/structures/page.tsx");
  assert.match(
    page,
    /filterStructuresBySite\(structures, siteFilter\)/,
    "il filtro passa dal modulo proprietario, che tiene la regola sul dato storico",
  );
});

test("nessuna griglia delle schermate sede resta a due colonne a 375 px", () => {
  const offenders = [];

  for (const file of SITE_UI) {
    const offending = read(file)
      .split(/\r?\n/)
      .filter((line) => /(?<![a-z:])grid-cols-[23]\b/.test(line))
      .filter((line) => !line.includes("TabsList"));

    if (offending.length) {
      offenders.push(`${file}: ${offending[0].trim().slice(0, 80)}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "usare grid-cols-1 sm:grid-cols-2: a 375 px due colonne non ci stanno",
  );
});

test("una sede con strutture collegate non si elimina, si disattiva", () => {
  const source = read("components/sites/club-sites-section.tsx");

  assert.match(
    source,
    /if \(structureCountBySiteId\[site\.id\]\) \{\s*return;/,
    "eliminarla lascerebbe le strutture con un riferimento morto",
  );
  assert.match(source, /disabled=\{disabled \|\| structureCount > 0\}/);
});

test("l'editor dei gruppi scrive gruppi, non categorie", () => {
  const source = read("components/sites/category-groups-editor.tsx");

  assert.match(source, /buildCategoryGroupId\(categoryId, site\.id\)/);
  assert.match(source, /buildCategoryGroupLabel\(categoryName, site\.name\)/);
  assert.equal(
    /setCategories|createCategory|categories\.push/.test(source),
    false,
    "spuntare una sede non deve creare una categoria",
  );
});
