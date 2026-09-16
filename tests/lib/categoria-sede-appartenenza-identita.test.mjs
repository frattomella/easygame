import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  buildClubCategoryOptions,
  selectableCategoryOptions,
} from "../../src/lib/category-utils.ts";
import {
  buildCategoryGroups,
  buildSiteIndex,
  getActiveCategoryGroups,
  normalizeClubSites,
} from "../../src/lib/club-sites.ts";
import {
  CATEGORY_SITE_SEPARATOR,
  UNKNOWN_SITE_LABEL,
  buildCategoryDisplayIndex,
} from "../../src/lib/categories/display.ts";
import {
  resolveCategoryReference,
  sameCategory,
} from "../../src/lib/categories/identity.ts";
import {
  collectDanglingAthleteCategoryReferences,
  normalizeAthleteCategoryMemberships,
} from "../../src/lib/athlete-category-memberships.ts";

/**
 * **ADR-0185 — categoria, sede, gruppo e appartenenza sono quattro identita,
 * e l'etichetta non e nessuna delle quattro.**
 *
 * Il caso e quello del club pilota Fortitudo Scauri, ricostruito qui con gli
 * stessi identificativi: due «Pulcini» configurate (una per sede, dato storico
 * precedente ai gruppi), un gruppo storico inattivo, e in
 * `athlete_category_memberships` la riga gemella con il solo nome
 * `"Pulcini - S. Cosma"` che un difetto gia corretto ha scritto accanto alla
 * riga vera.
 *
 * Ogni prova qui sotto e un sintomo visto a schermo, o il suo controspecchio.
 */

const PULCINI_SCOSMA = "category-1787321890187-j8liup8";
const PULCINI_SCAURI = "category-1787322040142-mbawy4c";
const SCOIATTOLI_SCOSMA = "category-1787321995353-gtepjl2";
const SCOIATTOLI_SCAURI = "category-1787322075994-4rruavw";
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
  { id: SCOIATTOLI_SCAURI, name: "Scoiattoli", sortOrder: 5 },
  { id: UNDER13, name: "Under 13 Silver", sortOrder: 6 },
  { id: SERIE_C, name: "Serie C", sortOrder: 15 },
];

const SEDI_GREZZE = [
  { id: SITE_SCOSMA, name: "S. Cosma", city: "S. Cosma e Damiano", active: true },
  { id: SITE_SCAURI, name: "Scauri", city: "Minturno", active: true },
];

/** Come sta in `clubs.category_groups`: `siteId` senza `siteName`. */
const GRUPPI_GREZZI = [
  { categoryId: PULCINI_SCOSMA, siteId: SITE_SCOSMA, active: true, name: "Pulcini · S. Cosma" },
  { categoryId: PULCINI_SCOSMA, siteId: SITE_SCAURI, active: false, name: "Pulcini · Scauri" },
  { categoryId: PULCINI_SCAURI, siteId: SITE_SCAURI, active: true, name: "Pulcini · Scauri" },
  { categoryId: SCOIATTOLI_SCOSMA, siteId: SITE_SCOSMA, active: true },
  { categoryId: SCOIATTOLI_SCAURI, siteId: SITE_SCAURI, active: true },
  { categoryId: SCOIATTOLI_SCAURI, siteId: SITE_SCOSMA, active: false },
  { categoryId: AQUILOTTI, siteId: SITE_SCAURI, active: true },
  { categoryId: SERIE_C, siteId: SITE_SCAURI, active: true },
];

const sedi = normalizeClubSites(SEDI_GREZZE);

/** L'atleta di Pulcini · S. Cosma con la riga gemella storica accanto. */
const atletaConGemella = (id = "athlete-parasmo") => ({
  id,
  category_id: PULCINI_SCOSMA,
  category_name: "Pulcini - S. Cosma",
  data: {
    categories: ["Pulcini - S. Cosma", "Pulcini - S. Cosma"],
    categoryMemberships: [
      { category_id: PULCINI_SCOSMA, category_name: "Pulcini - S. Cosma", is_primary: true, site_id: SITE_SCOSMA },
    ],
  },
  category_memberships: [
    { id: "row-legacy", category_id: "Pulcini - S. Cosma", category_name: "Pulcini - S. Cosma", is_primary: false, site_id: null },
    { id: "row-vera", category_id: PULCINI_SCOSMA, category_name: "Pulcini - S. Cosma", is_primary: true, site_id: SITE_SCOSMA },
  ],
});

/** L'atleta mai migrato: tutte le righe con il solo nome, una ambigua. */
const atletaSoloNomi = {
  id: "athlete-migliaccio",
  category_id: "Pulcini - S. Cosma",
  category_name: "Pulcini - S. Cosma",
  data: { categories: ["Pulcini - S. Cosma", "Pulcini", "Under 13 Silver"] },
  category_memberships: [
    { id: "r1", category_id: "Pulcini - S. Cosma", category_name: "Pulcini - S. Cosma", is_primary: true, site_id: null },
    { id: "r2", category_id: "Pulcini", category_name: "Pulcini", is_primary: false, site_id: null },
  ],
};

const catalogoFortitudo = () =>
  buildClubCategoryOptions({
    clubCategories: CATEGORIE,
    athletes: [atletaConGemella(), atletaConGemella("athlete-2"), atletaSoloNomi],
  });

/* ------------------------------------------------------------------ */
/* 1, 9 — due Pulcini su due sedi: esattamente due, e non collassano    */
/* ------------------------------------------------------------------ */

test("Pulcini/Scauri e Pulcini/S. Cosma sono esattamente due identita operative", () => {
  const opzioni = selectableCategoryOptions(catalogoFortitudo());
  const pulcini = opzioni.filter((voce) => voce.name === "Pulcini");

  assert.deepEqual(
    pulcini.map((voce) => voce.id).sort(),
    [PULCINI_SCOSMA, PULCINI_SCAURI].sort(),
  );

  const gruppi = getActiveCategoryGroups(
    buildCategoryGroups({ categories: opzioni, sites: sedi, groups: GRUPPI_GREZZI }),
  ).filter((gruppo) => gruppo.categoryName === "Pulcini");

  assert.deepEqual(
    gruppi.map((gruppo) => gruppo.name).sort(),
    ["Pulcini · S. Cosma", "Pulcini · Scauri"],
    "due squadre, due opzioni, nessuna terza",
  );
});

test("due omonime con sedi differenti restano due anche per il confronto", () => {
  assert.equal(
    sameCategory({ category_id: PULCINI_SCOSMA }, { category_id: PULCINI_SCAURI }, CATEGORIE),
    false,
  );
  assert.equal(
    sameCategory({ category_id: PULCINI_SCOSMA }, { category_id: PULCINI_SCOSMA }, CATEGORIE),
    true,
  );
});

/* ------------------------------------------------------------------ */
/* 2, 3, 10, 11 — la sede si scrive per nome, mai per identificativo    */
/* ------------------------------------------------------------------ */

test("le due Pulcini si leggono «Pulcini · S. Cosma» e «Pulcini · Scauri»", () => {
  const gruppi = buildCategoryGroups({ categories: CATEGORIE, sites: sedi, groups: GRUPPI_GREZZI });
  const indice = buildCategoryDisplayIndex({ categories: CATEGORIE, groups: gruppi });

  assert.equal(indice.label(PULCINI_SCOSMA), `Pulcini${CATEGORY_SITE_SEPARATOR}S. Cosma`);
  assert.equal(indice.label(PULCINI_SCAURI), `Pulcini${CATEGORY_SITE_SEPARATOR}Scauri`);
  assert.equal(indice.label(SERIE_C), "Serie C", "un nome univoco resta nudo");
});

test("i gruppi letti grezzi si risolvono sul catalogo sedi, e nessun site-… arriva a schermo", () => {
  /* Il cablaggio della scheda atleta prima della correzione: gruppi senza siteName. */
  const indice = buildCategoryDisplayIndex({
    categories: CATEGORIE,
    groups: GRUPPI_GREZZI,
    sites: sedi,
  });

  assert.equal(indice.label(PULCINI_SCOSMA), "Pulcini · S. Cosma");
  assert.equal(indice.label(PULCINI_SCAURI), "Pulcini · Scauri");
  for (const voce of CATEGORIE) {
    assert.doesNotMatch(indice.label(voce.id), /site-\d/, "mai un identificativo tecnico");
  }
});

test("un siteId che nessun catalogo risolve non compare mai come testo", () => {
  const indice = buildCategoryDisplayIndex({ categories: CATEGORIE, groups: GRUPPI_GREZZI });

  for (const voce of CATEGORIE) {
    assert.doesNotMatch(indice.label(voce.id), /site-\d/);
  }
  assert.equal(
    indice.label(PULCINI_SCOSMA),
    `Pulcini${CATEGORY_SITE_SEPARATOR}${UNKNOWN_SITE_LABEL}`,
    "dove la sede serviva a distinguere si dice che manca, non si scrive l'id",
  );
  assert.equal(indice.label(AQUILOTTI), "Aquilotti", "dove non serviva, il nome nudo");
});

test("l'indice delle sedi non restituisce mai il riferimento sconosciuto com'e", () => {
  const indice = buildSiteIndex(sedi);

  assert.equal(indice.getSiteName(SITE_SCOSMA), "S. Cosma");
  assert.equal(indice.getSiteName("site-0000000000000-zzzzzz"), UNKNOWN_SITE_LABEL);
  assert.equal(indice.getSiteName(""), "");
});

/* ------------------------------------------------------------------ */
/* 4, 12 — un'etichetta storica non e una categoria                     */
/* ------------------------------------------------------------------ */

test("la riga legacy «Pulcini - S. Cosma» non crea una terza opzione di catalogo", () => {
  const opzioni = catalogoFortitudo();

  assert.equal(
    opzioni.some((voce) => voce.id === "Pulcini - S. Cosma" || voce.name === "Pulcini - S. Cosma"),
    false,
    "il nome stantio e un alias della categoria vera, non una voce nuova",
  );
  const scosma = opzioni.find((voce) => voce.id === PULCINI_SCOSMA);
  assert.ok(scosma.aliases.includes("Pulcini - S. Cosma"));
  assert.equal(selectableCategoryOptions(opzioni).length, CATEGORIE.length);
});

test("l'alias si apprende a prescindere dall'ordine di lettura degli atleti", () => {
  const primaLegacy = buildClubCategoryOptions({
    clubCategories: CATEGORIE,
    athletes: [atletaSoloNomi, atletaConGemella()],
  });
  const primaVera = buildClubCategoryOptions({
    clubCategories: CATEGORIE,
    athletes: [atletaConGemella(), atletaSoloNomi],
  });

  for (const opzioni of [primaLegacy, primaVera]) {
    assert.equal(opzioni.filter((voce) => voce.configured === false).length, 0);
  }
});

test("una voce derivata senza corrispondenza resta fuori dalle scelte e dai gruppi", () => {
  const opzioni = buildClubCategoryOptions({
    clubCategories: CATEGORIE,
    athletes: [{ id: "x", category_id: "Giovanissimi 2011", category_name: "Giovanissimi 2011" }],
  });

  const fantasma = opzioni.find((voce) => voce.name === "Giovanissimi 2011");
  assert.equal(fantasma.configured, false, "resta nel catalogo per non far sparire l'atleta dagli elenchi");
  assert.equal(selectableCategoryOptions(opzioni).includes(fantasma), false);
  assert.equal(
    buildCategoryGroups({ categories: opzioni, sites: sedi, groups: [] }).some(
      (gruppo) => gruppo.categoryName === "Giovanissimi 2011",
    ),
    false,
  );
});

/* ------------------------------------------------------------------ */
/* 5, 6, 7, 13 — primaria e secondarie dell'atleta                      */
/* ------------------------------------------------------------------ */

test("la riga gemella con il solo nome si fonde sulla primaria anche con il catalogo in mano", () => {
  const catalogo = catalogoFortitudo();
  const appartenenze = normalizeAthleteCategoryMemberships(atletaConGemella(), catalogo);

  assert.equal(appartenenze.length, 1, "nessuna «Pulcini · Secondaria»");
  assert.equal(appartenenze[0].categoryId, PULCINI_SCOSMA);
  assert.equal(appartenenze[0].categoryName, "Pulcini");
  assert.equal(appartenenze[0].storedCategoryName, "Pulcini - S. Cosma");
  assert.equal(appartenenze[0].siteId, SITE_SCOSMA);
  assert.equal(appartenenze[0].isPrimary, true);
});

test("senza catalogo la riga con il solo nome non ruba la primaria alla riga vera", () => {
  const atleta = {
    id: "a",
    category_id: AQUILOTTI,
    category_name: "Aquilotti",
    categories: ["Aquilotti", "Aquilotti"],
    categoryMemberships: [
      { category_id: AQUILOTTI, category_name: "Aquilotti", is_primary: true },
      { category_id: "Aquilotti", category_name: "Aquilotti", is_primary: false },
    ],
    category_memberships: [
      { category_id: "Aquilotti", category_name: "Aquilotti", is_primary: false, site_id: null },
      { category_id: AQUILOTTI, category_name: "Aquilotti", is_primary: true, site_id: SITE_SCAURI },
    ],
  };

  const appartenenze = normalizeAthleteCategoryMemberships(atleta);
  assert.equal(appartenenze.length, 1);
  assert.equal(appartenenze[0].categoryId, AQUILOTTI, "vince l'identita, non l'ordine di lettura");
  assert.equal(appartenenze[0].isPrimary, true);
  assert.equal(appartenenze[0].siteId, SITE_SCAURI);
});

test("un'etichetta che ne nomina due non diventa una secondaria", () => {
  const atleta = {
    id: "nicolas",
    category_id: SCOIATTOLI_SCOSMA,
    category_name: "Scoiattoli",
    data: { categories: ["Scoiattoli", "Scoiattoli"] },
    category_memberships: [
      { category_id: SCOIATTOLI_SCOSMA, category_name: "Scoiattoli", is_primary: true, site_id: SITE_SCOSMA },
    ],
  };

  const appartenenze = normalizeAthleteCategoryMemberships(atleta, CATEGORIE);
  assert.equal(appartenenze.length, 1, "nessuna «Scoiattoli · Secondaria»");
  assert.equal(appartenenze[0].categoryId, SCOIATTOLI_SCOSMA);

  const pendenti = collectDanglingAthleteCategoryReferences(atleta, CATEGORIE);
  assert.equal(pendenti.length, 0, "un'etichetta della proiezione si riconosce nella riga, non e un pendente");
});

test("una secondaria reale e diversa compare una volta sola, con la propria sede", () => {
  const atleta = {
    id: "nicolas",
    category_id: SCOIATTOLI_SCOSMA,
    category_name: "Scoiattoli",
    data: { categories: ["Scoiattoli", "Scoiattoli S. Cosma", "Scoiattoli"] },
    category_memberships: [
      { category_id: "Scoiattoli S. Cosma", category_name: "Scoiattoli S. Cosma", is_primary: false, site_id: null },
      { category_id: SCOIATTOLI_SCOSMA, category_name: "Scoiattoli", is_primary: true, site_id: SITE_SCOSMA },
      { category_id: SCOIATTOLI_SCAURI, category_name: "Scoiattoli", is_primary: false, site_id: SITE_SCAURI },
    ],
  };

  const appartenenze = normalizeAthleteCategoryMemberships(atleta, CATEGORIE);
  assert.deepEqual(
    appartenenze.map((voce) => [voce.categoryId, voce.isPrimary, voce.siteId]),
    [
      [SCOIATTOLI_SCOSMA, true, SITE_SCOSMA],
      [SCOIATTOLI_SCAURI, false, SITE_SCAURI],
    ],
  );

  const pendenti = collectDanglingAthleteCategoryReferences(atleta, CATEGORIE);
  assert.deepEqual(
    pendenti.map((voce) => [voce.membership.categoryId, voce.reason]),
    [["Scoiattoli S. Cosma", "dangling"]],
    "la riga che il catalogo non conosce esce fra i pendenti, non a schermo",
  );
});

test("l'atleta con i soli nomi risolve la primaria sull'alias e scarta il nome ambiguo", () => {
  const catalogo = catalogoFortitudo();
  const appartenenze = normalizeAthleteCategoryMemberships(atletaSoloNomi, catalogo);

  assert.equal(appartenenze[0].categoryId, PULCINI_SCOSMA);
  assert.equal(appartenenze[0].isPrimary, true);
  assert.equal(
    appartenenze.some((voce) => voce.categoryId === "Pulcini"),
    false,
    "«Pulcini» ne nomina due: non e un'appartenenza",
  );

  const pendenti = collectDanglingAthleteCategoryReferences(atletaSoloNomi, catalogo);
  assert.ok(pendenti.some((voce) => voce.membership.categoryId === "Pulcini" && voce.reason === "ambiguous"));
});

test("una primaria che il catalogo non conosce resta, e nessuna secondaria sale al suo posto", () => {
  const atleta = {
    id: "orfano",
    category_memberships: [
      { category_id: "Categoria cancellata", category_name: "Categoria cancellata", is_primary: true, site_id: null },
      { category_id: AQUILOTTI, category_name: "Aquilotti", is_primary: false, site_id: null },
    ],
  };

  const appartenenze = normalizeAthleteCategoryMemberships(atleta, CATEGORIE);
  assert.deepEqual(
    appartenenze.map((voce) => [voce.categoryId, voce.isPrimary]),
    [["Categoria cancellata", true], [AQUILOTTI, false]],
  );
});

test("round-trip: cio che esce rientra identico, senza appartenenze fantasma", () => {
  const catalogo = catalogoFortitudo();
  const prima = normalizeAthleteCategoryMemberships(atletaConGemella(), catalogo);
  const serializzate = prima.map((voce) => ({
    category_id: voce.categoryId,
    category_name: voce.categoryName,
    is_primary: voce.isPrimary,
    site_id: voce.siteId || null,
  }));

  const dopo = normalizeAthleteCategoryMemberships(serializzate, catalogo);
  assert.deepEqual(
    dopo.map((voce) => [voce.categoryId, voce.isPrimary, voce.siteId]),
    prima.map((voce) => [voce.categoryId, voce.isPrimary, voce.siteId]),
  );
  assert.equal(dopo.length, 1);
});

/* ------------------------------------------------------------------ */
/* 8 — un gruppo storico inattivo non e un'opzione                      */
/* ------------------------------------------------------------------ */

test("il gruppo inattivo Pulcini(j8liup8) · Scauri non e selezionabile e non presta la sede", () => {
  const gruppi = buildCategoryGroups({ categories: CATEGORIE, sites: sedi, groups: GRUPPI_GREZZI });
  const attivi = getActiveCategoryGroups(gruppi);

  assert.equal(
    attivi.some((gruppo) => gruppo.categoryId === PULCINI_SCOSMA && gruppo.siteId === SITE_SCAURI),
    false,
  );
  const indice = buildCategoryDisplayIndex({ categories: CATEGORIE, groups: gruppi });
  assert.equal(indice.label(PULCINI_SCOSMA), "Pulcini · S. Cosma", "una sola sede attiva, ed e quella");
});

/* ------------------------------------------------------------------ */
/* 14 — l'identita e l'identificativo                                   */
/* ------------------------------------------------------------------ */

test("un gruppo che cita la categoria per nome ambiguo non finisce sull'ultima omonima", () => {
  const gruppi = buildCategoryGroups({
    categories: CATEGORIE,
    sites: sedi,
    groups: [{ categoryId: "Pulcini", siteId: SITE_SCAURI, active: true }],
  });
  const configurato = gruppi.find((gruppo) => !gruppo.implicit);

  assert.equal(configurato.categoryId, "Pulcini", "il riferimento resta com'e: non nomina nessuna delle due");
  assert.equal(
    gruppi.filter((gruppo) => gruppo.categoryName === "Pulcini" && gruppo.implicit).length,
    2,
    "le due Pulcini vere restano entrambe, con il proprio gruppo implicito",
  );
});

test("l'ambiguita si conta per identificativi distinti, non per righe", () => {
  const catalogo = [
    { id: AQUILOTTI, name: "Aquilotti" },
    { id: AQUILOTTI, name: "Aquilotti" },
    { id: AQUILOTTI, name: "Aquilotti" },
  ];
  const risolto = resolveCategoryReference("Aquilotti", "Aquilotti", catalogo);

  assert.equal(risolto.known, true);
  assert.equal(risolto.ambiguous, false);
  assert.equal(risolto.id, AQUILOTTI);
});

test("un alias risponde come un nome, con la stessa regola sull'ambiguita", () => {
  const catalogo = [
    { id: PULCINI_SCOSMA, name: "Pulcini", aliases: ["Pulcini - S. Cosma"] },
    { id: PULCINI_SCAURI, name: "Pulcini" },
  ];

  assert.equal(resolveCategoryReference("Pulcini - S. Cosma", "", catalogo).id, PULCINI_SCOSMA);
  assert.equal(resolveCategoryReference("Pulcini", "", catalogo).ambiguous, true);

  const dueConLoStessoAlias = [
    { id: PULCINI_SCOSMA, name: "Pulcini", aliases: ["Vecchio nome"] },
    { id: PULCINI_SCAURI, name: "Pulcini", aliases: ["Vecchio nome"] },
  ];
  assert.equal(resolveCategoryReference("Vecchio nome", "", dueConLoStessoAlias).known, false);
});

/* ------------------------------------------------------------------ */
/* Parita Web corrente / Web V2: un helper solo, e i consumer lo usano  */
/* ------------------------------------------------------------------ */

test("Web corrente e Web V2 leggono la stessa etichetta dallo stesso indice", () => {
  const gruppi = buildCategoryGroups({ categories: CATEGORIE, sites: sedi, groups: GRUPPI_GREZZI });
  const indice = buildCategoryDisplayIndex({ categories: CATEGORIE, groups: gruppi, sites: sedi });

  /*
    Non esistono due formatter: `CategoryLabel` (montato dalla scheda V2 e
    dalle pagine V1 ancora in uso) chiede l'etichetta a **questo** indice. La
    parita si prova quindi sul cablaggio, non duplicando l'asserzione.
  */
  assert.equal(indice.label(PULCINI_SCAURI), "Pulcini · Scauri");
  assert.equal(indice.label(PULCINI_SCOSMA), "Pulcini · S. Cosma");

  const senzaCommenti = (testo) =>
    testo.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  const consumer = [
    "src/components/categories/category-label.tsx",
    "src/components/athletes/profile/v2/AthleteRecordHeader.tsx",
    "src/components/athletes/profile/v2/AthleteActivitySections.tsx",
    "src/components/athletes/v2/AthleteCategoryMembershipEditor.tsx",
    "src/components/trainer/trainer-dashboard-context.tsx",
    "src/app/athletes/page.tsx",
    "src/app/matches/page.tsx",
    "src/app/calendar/page.tsx",
  ];
  for (const file of consumer) {
    const codice = senzaCommenti(readFileSync(file, "utf8"));
    assert.match(
      codice,
      /buildCategoryDisplayIndex|<CategoryLabel|buildMembershipTargetIndex|MembershipTargetIndex/,
      `${file} deve passare dall'indice canonico`,
    );
    assert.doesNotMatch(codice, /\(\$\{[^}\n]*site(Id|Name)[^}\n]*\}\)/, `${file} costruisce a mano «Nome (Sede)»`);
    assert.doesNotMatch(codice, /\.replace\(\s*["']site-/, `${file} ripulisce un identificativo invece di risolverlo`);
  }

  const label = readFileSync("src/components/categories/category-label.tsx", "utf8");
  assert.match(label, /CATEGORY_SITE_SEPARATOR/, "la resa usa il separatore del dominio");
  assert.doesNotMatch(label, /\(\{descritta\.site\}\)/, "niente parentesi: «Pulcini · Scauri»");
});

test("i selettori della scheda atleta offrono solo le squadre configurate (ADR-0194: l'editor condiviso sceglie fra le collocazioni)", () => {
  const editor = readFileSync("src/components/athletes/v2/AthleteCategoryMembershipEditor.tsx", "utf8");
  assert.match(editor, /index\.targets\.map\(\(t\) => \(\{ value: t\.id, label: t\.label \}\)\)/, "le opzioni sono le collocazioni dell'indice");
  const collocazione = readFileSync("src/lib/categories/placement.ts", "utf8");
  assert.match(collocazione, /voce\?\.configured !== false/, "una voce nata da una scheda non e una scelta (ADR-0185 §4)");
  assert.match(collocazione, /if \(group\?\.active === false\) continue;/, "un gruppo disattivato non e una scelta");
});
