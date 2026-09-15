import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  buildClubCategoryOptions,
  selectableCategoryOptions,
} from "../../src/lib/category-utils.ts";
import {
  buildCategoryGroups,
  getActiveCategoryGroups,
  labelCategoryGroupOptions,
  normalizeClubSites,
} from "../../src/lib/club-sites.ts";
import { CATEGORY_SITE_SEPARATOR } from "../../src/lib/categories/display.ts";
import { resolveCategoryReference } from "../../src/lib/categories/identity.ts";
import {
  collectDanglingAthleteCategoryReferences,
  normalizeAthleteCategoryMemberships,
} from "../../src/lib/athlete-category-memberships.ts";

/**
 * **ADR-0185, il secondo giro: cio che la revisione ostile ha trovato.**
 *
 * Tre revisori in sola lettura sulla prima stesura — identita/fantasmi,
 * appartenenze, parita Web corrente/V2 — e otto difetti gravi fra i tre.
 * Ogni prova qui sotto e uno di quei difetti, riprodotto prima e chiuso dopo.
 */

const PULCINI_SCOSMA = "category-1787321890187-j8liup8";
const PULCINI_SCAURI = "category-1787322040142-mbawy4c";
const SCOIATTOLI_SCOSMA = "category-1787321995353-gtepjl2";
const AQUILOTTI = "category-1787322161361-2ugcyol";
const SERIE_C = "category-1787322675613-r4f23mo";
const UNDER13 = "category-1787322273552-y4sumd1";
const SITE_SCOSMA = "site-1787776326508-a61cb7";
const SITE_SCAURI = "site-1787751563239-86e93b";

const CATEGORIE = [
  { id: PULCINI_SCOSMA, name: "Pulcini", sortOrder: 0 },
  { id: SCOIATTOLI_SCOSMA, name: "Scoiattoli", sortOrder: 1 },
  { id: PULCINI_SCAURI, name: "Pulcini", sortOrder: 2 },
  { id: AQUILOTTI, name: "Aquilotti", sortOrder: 3 },
  { id: UNDER13, name: "Under 13 Silver", sortOrder: 6 },
  { id: SERIE_C, name: "Serie C", sortOrder: 15 },
];
const sedi = normalizeClubSites([
  { id: SITE_SCOSMA, name: "S. Cosma", active: true },
  { id: SITE_SCAURI, name: "Scauri", active: true },
]);
const GRUPPI = [
  { categoryId: PULCINI_SCOSMA, siteId: SITE_SCOSMA, active: true },
  { categoryId: PULCINI_SCAURI, siteId: SITE_SCAURI, active: true },
  { categoryId: SERIE_C, siteId: SITE_SCAURI, active: true },
];

const atletaConGemella = (id = "athlete-parasmo") => ({
  id,
  category_id: PULCINI_SCOSMA,
  category_name: "Pulcini - S. Cosma",
  data: { categories: ["Pulcini - S. Cosma", "Pulcini - S. Cosma"] },
  category_memberships: [
    { id: "row-legacy", category_id: "Pulcini - S. Cosma", category_name: "Pulcini - S. Cosma", is_primary: false, site_id: null },
    { id: "row-vera", category_id: PULCINI_SCOSMA, category_name: "Pulcini - S. Cosma", is_primary: true, site_id: SITE_SCOSMA },
  ],
});

/* ------------------------------------------------------------------ */
/* Identita / fantasmi                                                  */
/* ------------------------------------------------------------------ */

test("un club senza anagrafica ha per catalogo i nomi che usa, e li puo scegliere", () => {
  const opzioni = buildClubCategoryOptions({
    clubCategories: [],
    athletes: [
      { id: "a", category: "Pulcini" },
      { id: "b", category_id: "Esordienti", category_name: "Esordienti" },
    ],
  });

  assert.equal(selectableCategoryOptions(opzioni).length, 2, "chi ha le squadre solo per nome non perde i selettori");
  assert.equal(buildCategoryGroups({ categories: opzioni, sites: [], groups: [] }).length, 2);
});

test("un alias uguale al nome corrente di un'altra categoria non avvelena quel nome", () => {
  const opzioni = buildClubCategoryOptions({
    clubCategories: CATEGORIE,
    athletes: [
      { id: "x", category_memberships: [{ category_id: AQUILOTTI, category_name: "Serie C", is_primary: true }] },
    ],
  });

  const aquilotti = opzioni.find((voce) => voce.id === AQUILOTTI);
  assert.equal((aquilotti.aliases || []).includes("Serie C"), false, "il presente di una non e il passato di un'altra");
  assert.equal(resolveCategoryReference("Serie C", "", opzioni).id, SERIE_C);

  const conAlias = [
    { id: AQUILOTTI, name: "Aquilotti", aliases: ["Serie C"] },
    { id: SERIE_C, name: "Serie C" },
  ];
  assert.equal(resolveCategoryReference("Serie C", "", conAlias).id, SERIE_C, "il nome corrente vince sull'alias");
});

test("una voce non configurata non e un'identita: il pendente resta pendente anche con il catalogo reale", () => {
  const atleta = {
    id: "nicolas",
    category_memberships: [
      { category_id: "Scoiattoli S. Cosma", category_name: "Scoiattoli S. Cosma", is_primary: false, site_id: null },
      { category_id: SCOIATTOLI_SCOSMA, category_name: "Scoiattoli", is_primary: true, site_id: SITE_SCOSMA },
    ],
  };
  const catalogoReale = buildClubCategoryOptions({ clubCategories: CATEGORIE, athletes: [atleta] });
  assert.ok(catalogoReale.some((voce) => voce.configured === false), "la voce fantasma c'e, per gli elenchi");

  assert.equal(normalizeAthleteCategoryMemberships(atleta, catalogoReale).length, 1, "nessuna «Scoiattoli S. Cosma · Secondaria»");
  assert.deepEqual(
    collectDanglingAthleteCategoryReferences(atleta, catalogoReale).map((voce) => voce.reason),
    ["dangling"],
  );
});

/* ------------------------------------------------------------------ */
/* Appartenenze                                                         */
/* ------------------------------------------------------------------ */

test("club migrato a meta: la colonna resta la primaria quando nessuna riga lo dichiara, in qualunque ordine", () => {
  const righe = [
    { category_id: UNDER13, category_name: "Under 13 Silver", is_primary: false, site_id: null },
    { category_id: AQUILOTTI, category_name: "Aquilotti", is_primary: false, site_id: null },
  ];
  for (const ordine of [righe, [...righe].reverse()]) {
    const atleta = { id: "c2", category_id: PULCINI_SCOSMA, category_name: "Pulcini", site_id: SITE_SCOSMA, category_memberships: ordine };
    for (const catalogo of [CATEGORIE, []]) {
      const appartenenze = normalizeAthleteCategoryMemberships(atleta, catalogo);
      const primaria = appartenenze.find((voce) => voce.isPrimary);
      assert.equal(primaria.categoryId, PULCINI_SCOSMA, "la colonna e l'unica dichiarazione, e resta");
      assert.equal(primaria.siteId, SITE_SCOSMA);
      assert.equal(appartenenze.length, 3);
    }
  }
});

test("una proiezione in data.categoryMemberships non ruba la primaria alla riga dichiarata", () => {
  const atleta = {
    id: "rollover",
    data: { categoryMemberships: [{ category_id: UNDER13, category_name: "Under 13 Silver", is_primary: true }] },
    category_memberships: [
      { category_id: UNDER13, category_name: "Under 13 Silver", is_primary: false, site_id: null },
      { category_id: AQUILOTTI, category_name: "Aquilotti", is_primary: true, site_id: SITE_SCAURI },
    ],
  };
  for (const catalogo of [CATEGORIE, []]) {
    const primaria = normalizeAthleteCategoryMemberships(atleta, catalogo).find((voce) => voce.isPrimary);
    assert.equal(primaria.categoryId, AQUILOTTI, "le righe comandano, la cache segue");
  }
});

test("un'etichetta di data.categories che non ritrova nessuna riga tace, non diventa una riga", () => {
  const atleta = {
    id: "stale",
    data: { categories: ["Under 13 Silver"] },
    category_memberships: [{ category_id: AQUILOTTI, category_name: "Aquilotti", is_primary: true, site_id: null }],
  };
  for (const catalogo of [CATEGORIE, []]) {
    assert.equal(normalizeAthleteCategoryMemberships(atleta, catalogo).length, 1);
  }
});

test("il nome com'era sulla riga sopravvive al giro nel browser e al salvataggio", () => {
  const catalogo = buildClubCategoryOptions({ clubCategories: CATEGORIE, athletes: [atletaConGemella()] });
  const prima = normalizeAthleteCategoryMemberships(atletaConGemella(), catalogo);
  assert.equal(prima[0].storedCategoryName, "Pulcini - S. Cosma");

  const rimandate = normalizeAthleteCategoryMemberships(
    prima.map((voce) => ({
      category_id: voce.categoryId,
      category_name: voce.categoryName,
      stored_category_name: voce.storedCategoryName,
      is_primary: voce.isPrimary,
      site_id: voce.siteId,
    })),
  );
  assert.equal(rimandate[0].storedCategoryName, "Pulcini - S. Cosma", "l'alias non si perde: le gemelle di altri atleti ne hanno bisogno");
  assert.equal(rimandate[0].siteId, SITE_SCOSMA);
});

test("fra la riga gemella e la riga vera sopravvivono la sede e la riga vera, in qualunque ordine", () => {
  const vera = { id: "r-vera", category_id: PULCINI_SCOSMA, category_name: "Pulcini - S. Cosma", is_primary: true, site_id: SITE_SCOSMA };
  const gemella = { id: "r-gemella", category_id: "Pulcini - S. Cosma", category_name: "Pulcini - S. Cosma", is_primary: false, site_id: SITE_SCAURI };
  for (const righe of [[vera, gemella], [gemella, vera]]) {
    const [sola] = normalizeAthleteCategoryMemberships({ id: "o", category_memberships: righe });
    assert.equal(sola.id, "r-vera");
    assert.equal(sola.siteId, SITE_SCOSMA);
  }
});

test("una categoria cancellata dal catalogo e pendente anche se la riga porta un identificativo", () => {
  const atleta = {
    id: "orfano",
    category_memberships: [
      { category_id: AQUILOTTI, category_name: "Aquilotti", is_primary: true, site_id: null },
      { category_id: "category-cancellata", category_name: "Under 21", is_primary: false, site_id: null },
    ],
  };
  assert.deepEqual(normalizeAthleteCategoryMemberships(atleta, CATEGORIE).map((voce) => voce.categoryId), [AQUILOTTI]);
  assert.deepEqual(
    collectDanglingAthleteCategoryReferences(atleta, CATEGORIE).map((voce) => [voce.membership.categoryId, voce.reason]),
    [["category-cancellata", "dangling"]],
  );
});

/* ------------------------------------------------------------------ */
/* Parita Web corrente / V2                                             */
/* ------------------------------------------------------------------ */

test("le opzioni gruppo si scrivono con una regola sola: la sede dove il nome si legge due volte", () => {
  const gruppi = getActiveCategoryGroups(buildCategoryGroups({ categories: CATEGORIE, sites: sedi, groups: GRUPPI }));
  const etichetta = labelCategoryGroupOptions(gruppi);
  assert.deepEqual(
    gruppi.filter((gruppo) => gruppo.categoryName === "Pulcini").map(etichetta).sort(),
    ["Pulcini · S. Cosma", "Pulcini · Scauri"],
  );
  assert.equal(etichetta(gruppi.find((gruppo) => gruppo.categoryName === "Serie C")), "Serie C");

  const dueSedi = labelCategoryGroupOptions([
    { categoryName: "Aquilotti", siteName: "Scauri" },
    { categoryName: "Aquilotti", siteName: "" },
  ]);
  assert.equal(dueSedi({ categoryName: "Aquilotti", siteName: "" }), `Aquilotti${CATEGORY_SITE_SEPARATOR}Sede non assegnata`);

  const senzaCommenti = (testo) => testo.replace(/\/\*[\s\S]*?\*\//g, " ");
  for (const file of [
    "src/app/athletes/page.tsx",
    "src/components/training/TrainingGroupSelector.tsx",
    "src/components/dashboard/WeeklyTrainingSchedulePanel.tsx",
  ]) {
    const codice = senzaCommenti(readFileSync(file, "utf8"));
    assert.match(codice, /(label|describe)CategoryGroupOptions\(/, `${file} chiede l'etichetta del gruppo al modulo proprietario`);
    assert.doesNotMatch(codice, /groupsPerCategoryName|groupCountByCategory/, `${file} non conta in casa`);
  }
});

test("la scheda atleta manda le appartenenze solo dal cassetto che le modifica, e conserva il nome storico", () => {
  const pagina = readFileSync("src/app/athletes/[id]/page.tsx", "utf8");
  assert.match(pagina, /editingSection === "general" \? editFormData : fuoriDalleCategorie/);
  assert.match(pagina, /stored_category_name: membership\.storedCategoryName/);

  const db = readFileSync("src/lib/simplified-db.ts", "utf8");
  assert.match(db, /category_name: membership\.storedCategoryName \|\| membership\.categoryName,/);
});

test("l'area famiglia e l'area atleta leggono l'etichetta canonica scritta dal server", () => {
  const server = readFileSync("src/lib/server/parent-dashboard.ts", "utf8");
  assert.match(server, /normalizeAthleteCategoryMemberships\(athlete, catalogo\)/);
  assert.match(server, /buildCategoryDisplayIndex\(\{/);
  for (const file of [
    "src/app/parent-view/page.tsx",
    "src/components/parent-dashboard/parent-dashboard-pages.tsx",
    "src/components/athlete/athlete-area-pages.tsx",
  ]) {
    const codice = readFileSync(file, "utf8");
    assert.match(codice, /categoria\.label \|\| categoria\.name/, `${file} legge label`);
    assert.doesNotMatch(codice, /\$\{categoria\.name\} \(\$\{categoria\.siteName\}\)/, `${file} non compone «Nome (Sede)»`);
  }
});

test("i selettori che offrono categorie passano dalle configurate e dall'indice", () => {
  const casi = [
    ["src/app/trainers/[id]/page.tsx", /categoryLabel=\{\(categoryId\) => categoryDisplay\.label\(categoryId\)\}/],
    ["src/app/trainers/new/page.tsx", /label: categoryDisplay\.label\(category\.id\)/],
    ["src/app/trainers/page.tsx", /label: categoryDisplay\.label\(category\.id\)/],
    ["src/app/training/page.tsx", /selectableCategoryOptions\(categories\)\.map/],
    ["src/components/medical/v2/certificate-grid-model.ts", /selectableCategoryOptions\(categoryOptions\)\.map/],
    ["src/components/clothing/v2/group-drawer.tsx", /selectableCategoryOptions\(categoryOptions\)\.map/],
    ["src/components/clothing/v2/assignments-grid.tsx", /getAthletePrimaryCategoryId\(athleteOf\(row\), categories\) === value/],
  ];
  for (const [file, atteso] of casi) {
    assert.match(readFileSync(file, "utf8"), atteso, file);
  }
});
