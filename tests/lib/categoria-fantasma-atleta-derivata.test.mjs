import assert from "node:assert/strict";
import test from "node:test";

const categoryUtils = await import("../../src/lib/category-utils.ts");
const clubSites = await import("../../src/lib/club-sites.ts");

const { buildClubCategoryOptions } = categoryUtils;
const { buildCategoryGroups, getActiveCategoryGroups } = clubSites;

/**
 * **Un riferimento legacy nell'appartenenza di un atleta non deve mai
 * diventare un gruppo operativo selezionabile.**
 *
 * ---
 *
 * ## Da dove viene questa prova
 *
 * Cercando la terza opzione riportata su staging ("Pulcini" compare tre
 * volte) e stata esaminata la sonda read-only su `athlete_category_memberships`
 * del club pilota: nove atleti portano, per quel che dovrebbe essere una
 * appartenenza sola, **due righe** — una con l'identificativo canonico
 * corretto (`category-...-j8liup8`) e `category_name` gia corrotto in
 * `"Pulcini - S. Cosma"`, una seconda con **anche `category_id` uguale a
 * quella stessa etichetta**.
 *
 * Quella coppia, per questi nove atleti, **si autoripara**: `dedupeMemberships`
 * (in `@/lib/athlete-category-memberships`) costruisce un catalogo implicito
 * dalle righe della **stessa** appartenenza che portano un identificativo
 * vero, e lo usa per riconoscere che la riga con il solo nome e la stessa
 * squadra — la seconda riga si fonde nella prima, l'identificativo vero
 * vince, e nessuna voce fantasma nasce da questi nove atleti (misurato con
 * una sonda dedicata: `normalizeAthleteCategoryMemberships` restituisce
 * un'unica appartenenza con `categoryId` reale).
 *
 * ## Il difetto che resta, e che questa prova isola
 *
 * L'autoriparazione funziona **solo se** l'atleta porta anche la riga con
 * l'identificativo vero. Un atleta la cui **unica** appartenenza cita il
 * riferimento corrotto — senza nessuna riga gemella da cui imparare l'id
 * reale — non ha niente da cui autoripararsi: `buildClubCategoryOptions`
 * (parametro `athletes`, usato da `getClubCategories()` e quindi dal
 * selettore di gruppo della creazione allenamento) crea allora una voce
 * **nuova** nel catalogo delle categorie, con id e nome uguali al
 * riferimento corrotto. Senza nessun `category_groups` che la citi,
 * `buildCategoryGroups` la promuoveva a gruppo **implicito** — una terza
 * opzione selezionabile, indistinguibile a schermo da una squadra vera.
 *
 * E lo stesso destino di qualunque riferimento che non combaci per
 * `categoryId` **e** non combaci per nome con nessuna categoria configurata:
 * capita con un import parziale, un rollover di stagione che non rimappa
 * tutto, o — piu banalmente — un atleta scritto prima che la seconda riga
 * "buona" venga registrata.
 *
 * ## La correzione
 *
 * `NormalizedCategoryOption` porta ora `configured`: vero per ogni voce che
 * viene da `clubCategories`/`resourceCategories` (l'anagrafica del club),
 * falso **solo** per una voce nata esclusivamente da una fusione "derivata"
 * senza corrispondenza. `buildCategoryGroups` scarta le voci
 * `configured: false` prima di generare un gruppo implicito: l'atleta resta
 * visibile ovunque cerchi la sua categoria per nome o label (nessuna riga
 * rimossa da `categories`), ma quel riferimento non diventa mai un'unita
 * operativa selezionabile.
 */

const PULCINI_SCOSMA = "category-1787321890187-j8liup8";
const PULCINI_SCAURI = "category-1787322040142-mbawy4c";
const SCOIATTOLI_SCOSMA = "category-1787321995353-gtepjl2";
const SCOIATTOLI_SCAURI = "category-1787322075994-4rruavw";

const CATEGORIE_CANONICHE = [
  { id: PULCINI_SCOSMA, name: "Pulcini" },
  { id: PULCINI_SCAURI, name: "Pulcini" },
  { id: SCOIATTOLI_SCOSMA, name: "Scoiattoli" },
  { id: SCOIATTOLI_SCAURI, name: "Scoiattoli" },
];

const SEDI = [
  { id: "site-scauri", name: "Scauri", active: true },
  { id: "site-scosma", name: "S. Cosma", active: true },
];

const CATEGORY_GROUPS_GREZZI = [
  { categoryId: PULCINI_SCOSMA, siteId: "site-scosma", active: true },
  { categoryId: PULCINI_SCAURI, siteId: "site-scauri", active: true },
  { categoryId: PULCINI_SCOSMA, siteId: "site-scauri", active: false },
  { categoryId: SCOIATTOLI_SCOSMA, siteId: "site-scosma", active: true },
  { categoryId: SCOIATTOLI_SCAURI, siteId: "site-scauri", active: true },
  { categoryId: SCOIATTOLI_SCAURI, siteId: "site-scosma", active: false },
];

/*
  L'unica appartenenza dell'atleta cita **solo** il riferimento corrotto:
  nessuna riga gemella con l'identificativo vero da cui autoripararsi. E il
  caso che l'autoriparazione di `dedupeMemberships` non copre.
*/
const atletaConSoloRiferimentoCorrotto = (id, categoryId, categoryName) => ({
  id,
  category_memberships: [
    { category_id: categoryId, category_name: categoryName, site_id: null },
  ],
});

const ATLETI = [
  atletaConSoloRiferimentoCorrotto("orfano-pulcini", "Pulcini - S. Cosma", "Pulcini - S. Cosma"),
  atletaConSoloRiferimentoCorrotto("orfano-scoiattoli", "Scoiattoli S. Cosma", "Scoiattoli S. Cosma"),
];

const gruppiOperativiReali = (athletes = ATLETI) => {
  const categorie = buildClubCategoryOptions({
    clubCategories: CATEGORIE_CANONICHE,
    resourceCategories: [],
    athletes,
  });

  return buildCategoryGroups({
    categories: categorie,
    sites: SEDI,
    groups: CATEGORY_GROUPS_GREZZI,
  });
};

/* ------------------------------------------------------------------ */
/* Il riferimento legacy resta nel catalogo (l'atleta non deve sparire) */
/* ------------------------------------------------------------------ */

test("il riferimento legacy resta nel catalogo delle categorie, marcato non configurato", () => {
  const categorie = buildClubCategoryOptions({
    clubCategories: CATEGORIE_CANONICHE,
    resourceCategories: [],
    athletes: ATLETI,
  });

  const fantasmaPulcini = categorie.find((c) => c.id === "Pulcini - S. Cosma");
  assert.ok(fantasmaPulcini, "il riferimento legacy non deve sparire dal catalogo");
  assert.equal(fantasmaPulcini.configured, false);

  const fantasmaScoiattoli = categorie.find((c) => c.id === "Scoiattoli S. Cosma");
  assert.ok(fantasmaScoiattoli);
  assert.equal(fantasmaScoiattoli.configured, false);

  // Le quattro categorie vere restano configurate.
  for (const id of [PULCINI_SCOSMA, PULCINI_SCAURI, SCOIATTOLI_SCOSMA, SCOIATTOLI_SCAURI]) {
    const reale = categorie.find((c) => c.id === id);
    assert.ok(reale, `${id} deve restare nel catalogo`);
    assert.equal(reale.configured, true, `${id} deve restare configurata`);
  }
});

/* ------------------------------------------------------------------ */
/* Il fantasma NON diventa un gruppo selezionabile                    */
/* ------------------------------------------------------------------ */

test("il fantasma non diventa un terzo gruppo Pulcini selezionabile", () => {
  const attivi = getActiveCategoryGroups(gruppiOperativiReali());
  const pulcini = attivi.filter((g) => g.categoryName === "Pulcini");

  assert.equal(pulcini.length, 2, "solo i due gruppi reali, non tre");
  assert.deepEqual(
    pulcini.map((g) => g.siteName).sort(),
    ["S. Cosma", "Scauri"],
  );
  assert.ok(
    !attivi.some((g) => g.categoryName === "Pulcini - S. Cosma"),
    "nessun gruppo con il nome corrotto",
  );
});

test("il fantasma non diventa un terzo gruppo Scoiattoli selezionabile", () => {
  const attivi = getActiveCategoryGroups(gruppiOperativiReali());
  const scoiattoli = attivi.filter((g) => g.categoryName === "Scoiattoli");

  assert.equal(scoiattoli.length, 2, "solo i due gruppi reali, non tre");
  assert.ok(
    !attivi.some((g) => g.categoryName === "Scoiattoli S. Cosma"),
    "nessun gruppo con il nome corrotto",
  );
});

test("il totale dei gruppi attivi resta quattro, esattamente come senza atleti", () => {
  const conAtleti = getActiveCategoryGroups(gruppiOperativiReali());

  const senzaAtleti = getActiveCategoryGroups(
    buildCategoryGroups({
      categories: buildClubCategoryOptions({
        clubCategories: CATEGORIE_CANONICHE,
        resourceCategories: [],
      }),
      sites: SEDI,
      groups: CATEGORY_GROUPS_GREZZI,
    }),
  );

  assert.equal(conAtleti.length, 4);
  assert.equal(senzaAtleti.length, 4);
  assert.deepEqual(
    conAtleti.map((g) => g.id).sort(),
    senzaAtleti.map((g) => g.id).sort(),
    "un atleta con un riferimento legacy non deve cambiare l'elenco dei gruppi",
  );
});

/* ------------------------------------------------------------------ */
/* Le etichette finali restano esattamente le quattro attese           */
/* ------------------------------------------------------------------ */

test("le etichette finali sono esattamente le quattro attese, senza doppioni", () => {
  const attivi = getActiveCategoryGroups(gruppiOperativiReali());

  const groupsPerCategoryName = new Map();
  attivi.forEach((g) => {
    const key = g.categoryName.trim().toLowerCase();
    groupsPerCategoryName.set(key, (groupsPerCategoryName.get(key) || 0) + 1);
  });

  const getGroupLabel = (g) => {
    const key = g.categoryName.trim().toLowerCase();
    return (groupsPerCategoryName.get(key) || 0) > 1 && g.siteName
      ? `${g.categoryName} · ${g.siteName}`
      : g.categoryName;
  };

  const etichette = attivi.map(getGroupLabel).sort();

  assert.deepEqual(etichette, [
    "Pulcini · S. Cosma",
    "Pulcini · Scauri",
    "Scoiattoli · S. Cosma",
    "Scoiattoli · Scauri",
  ]);
  assert.equal(new Set(etichette).size, 4, "nessuna etichetta duplicata");
});

/* ------------------------------------------------------------------ */
/* Il pattern reale (con la riga gemella) si autoripara da solo         */
/* ------------------------------------------------------------------ */

test("un atleta con anche la riga con l'id vero si autorepara senza bisogno di questa correzione", () => {
  const atletaConEntrambeLeRighe = {
    id: "pulcino-con-riga-gemella",
    category_memberships: [
      {
        category_id: PULCINI_SCOSMA,
        category_name: "Pulcini - S. Cosma",
        site_id: null,
      },
      {
        category_id: "Pulcini - S. Cosma",
        category_name: "Pulcini - S. Cosma",
        site_id: null,
      },
    ],
  };

  const categorie = buildClubCategoryOptions({
    clubCategories: CATEGORIE_CANONICHE,
    resourceCategories: [],
    athletes: [atletaConEntrambeLeRighe],
  });

  assert.ok(
    !categorie.some((c) => c.id === "Pulcini - S. Cosma"),
    "con la riga gemella l'identificativo vero vince, e non nasce nessuna voce nuova",
  );
});
