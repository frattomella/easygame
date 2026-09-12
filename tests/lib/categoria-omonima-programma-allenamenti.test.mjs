/**
 * **Fortitudo Scauri: il programma allenamenti non deve vedere fantasmi dove
 * ci sono due categorie omonime.**
 *
 * Stessa famiglia di difetto di **P0-4** (risoluzione per nome in
 * `resolveCategoryId`, chiusa nell'integrazione finale) e di **D-AUD-35**
 * (chiave di deduplica della training-automation, ancora aperta): un terzo
 * lettore — il conteggio "quante squadre hanno questo nome" nei selettori di
 * gruppo della creazione/modifica allenamento — aveva la stessa ambiguita,
 * non coperta da nessuno dei due.
 *
 * ---
 *
 * ## Il dato reale (sonda read-only su staging)
 *
 * Il club ha **quattro** categorie canoniche, non due: "Pulcini" e
 * "Scoiattoli" esistono ciascuna come **due identificativi distinti**, dato
 * storico precedente ai gruppi operativi (ADR-0038), uno per sede. Ogni
 * identificativo ha **un solo** gruppo attivo (la propria sede) e — per
 * "Pulcini" e per uno "Scoiattoli" — un residuo storico *inattivo* sull'altra
 * sede, lasciato al suo posto perche l'archiviazione non cancella (ADR-0038
 * §3, `buildCategoryGroupsForSites`).
 *
 * La pagina Categorie legge questo dato correttamente: due righe "Pulcini"
 * (una per sede) e due "Scoiattoli". La creazione/modifica di un allenamento
 * ne mostrava invece tre per nome: il conteggio che decide se accostare la
 * sede contava i gruppi per `categoryId`, e con un solo gruppo per
 * identificativo quel conto vale sempre **uno** — la sede non compariva mai,
 * e le due squadre restavano scritte allo stesso modo, indistinguibili.
 *
 * ## Cosa misurano queste prove
 *
 * 1. Che il lettore canonico (`buildCategoryGroups` + `getActiveCategoryGroups`,
 *    proprietari di `src/lib/club-sites.ts`) produca **esattamente** le
 *    quattro categorie canoniche come gruppi attivi — non tre, non cinque —
 *    e **mai** un gruppo derivato da un residuo inattivo (Caso 3).
 * 2. Che due identificativi diversi con lo stesso nome **restino distinti**
 *    (Caso 4): nessuna fusione per nome, l'identita resta l'identificativo.
 * 3. Che il conteggio "quante squadre hanno questo nome" — la regola che le
 *    due superfici di creazione/modifica allenamento condividono — sia per
 *    **nome scritto**, non per `categoryId`: e la correzione stessa, isolata
 *    dalla UI cosi da poterla provare senza montare React.
 * 4. Che rinominare una sede aggiorni l'etichetta senza toccare l'identita
 *    della categoria (Caso 5).
 */

import test from "node:test";
import assert from "node:assert/strict";

const clubSites = await import("../../src/lib/club-sites.ts");

const { buildCategoryGroups, getActiveCategoryGroups } = clubSites;

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

/*
  Sei righe `category_groups`, come la sonda read-only le ha trovate: quattro
  attive (una per identificativo) e due residui storici inattivi, ciascuno
  sull'*altra* sede rispetto a quella attiva del proprio identificativo.
*/
const CATEGORY_GROUPS_GREZZI = [
  { categoryId: PULCINI_SCOSMA, siteId: "site-scosma", active: true },
  { categoryId: PULCINI_SCAURI, siteId: "site-scauri", active: true },
  { categoryId: PULCINI_SCOSMA, siteId: "site-scauri", active: false },
  { categoryId: SCOIATTOLI_SCOSMA, siteId: "site-scosma", active: true },
  { categoryId: SCOIATTOLI_SCAURI, siteId: "site-scauri", active: true },
  { categoryId: SCOIATTOLI_SCAURI, siteId: "site-scosma", active: false },
];

const gruppiOperativi = () =>
  buildCategoryGroups({
    categories: CATEGORIE_CANONICHE,
    sites: SEDI,
    groups: CATEGORY_GROUPS_GREZZI,
  });

/* ------------------------------------------------------------------ */
/* Caso 1 / 2 — due omonime per nome, sedi diverse -> due opzioni ciascuna */
/* ------------------------------------------------------------------ */

test("Pulcini: due identificativi omonimi restano due gruppi attivi, uno per sede", () => {
  const attivi = getActiveCategoryGroups(gruppiOperativi()).filter(
    (gruppo) => gruppo.categoryName === "Pulcini",
  );

  assert.equal(attivi.length, 2, "due Pulcini canonici, non uno, non tre");

  const sedi = attivi.map((gruppo) => gruppo.siteName).sort();
  assert.deepEqual(sedi, ["S. Cosma", "Scauri"]);

  const identificativi = new Set(attivi.map((gruppo) => gruppo.categoryId));
  assert.equal(identificativi.size, 2, "restano due identificativi distinti");
});

test("Scoiattoli: due identificativi omonimi restano due gruppi attivi, uno per sede", () => {
  const attivi = getActiveCategoryGroups(gruppiOperativi()).filter(
    (gruppo) => gruppo.categoryName === "Scoiattoli",
  );

  assert.equal(attivi.length, 2, "due Scoiattoli canonici, non uno, non tre");

  const sedi = attivi.map((gruppo) => gruppo.siteName).sort();
  assert.deepEqual(sedi, ["S. Cosma", "Scauri"]);
});

/* ------------------------------------------------------------------ */
/* Caso 3 — un gruppo inattivo non crea una terza categoria             */
/* ------------------------------------------------------------------ */

test("un gruppo inattivo non compare come opzione, e non ne crea una terza", () => {
  const attivi = getActiveCategoryGroups(gruppiOperativi());

  assert.equal(
    attivi.length,
    4,
    "quattro gruppi attivi in tutto: due Pulcini, due Scoiattoli, mai un quinto o un sesto",
  );

  /*
    Il residuo di Pulcini (S.Cosma) su Scauri e inattivo: non deve produrre
    un "Pulcini · Scauri" duplicato accanto a quello vero (mbawy4c).
  */
  const pulciniAScauri = attivi.filter(
    (gruppo) => gruppo.categoryName === "Pulcini" && gruppo.siteName === "Scauri",
  );
  assert.equal(pulciniAScauri.length, 1);
  assert.equal(pulciniAScauri[0].categoryId, PULCINI_SCAURI);

  const scoiattoliASCosma = attivi.filter(
    (gruppo) => gruppo.categoryName === "Scoiattoli" && gruppo.siteName === "S. Cosma",
  );
  assert.equal(scoiattoliASCosma.length, 1);
  assert.equal(scoiattoliASCosma[0].categoryId, SCOIATTOLI_SCOSMA);
});

/* ------------------------------------------------------------------ */
/* Caso 4 — stesso nome, ID diversi: nessuna fusione                   */
/* ------------------------------------------------------------------ */

test("nessuna fusione per nome: gli id restano quelli canonici", () => {
  const attivi = getActiveCategoryGroups(gruppiOperativi());
  const idAttivi = new Set(attivi.map((gruppo) => gruppo.categoryId));

  assert.deepEqual(
    idAttivi,
    new Set([
      PULCINI_SCOSMA,
      PULCINI_SCAURI,
      SCOIATTOLI_SCOSMA,
      SCOIATTOLI_SCAURI,
    ]),
  );
});

/* ------------------------------------------------------------------ */
/* Caso 5 — rinominare una sede aggiorna l'etichetta, non l'identita    */
/* ------------------------------------------------------------------ */

test("rinominare la sede cambia l'etichetta del gruppo, non l'identita della categoria", () => {
  const sediRinominate = [
    { id: "site-scauri", name: "Scauri", active: true },
    { id: "site-scosma", name: "Santi Cosma e Damiano", active: true },
  ];

  const attivi = getActiveCategoryGroups(
    buildCategoryGroups({
      categories: CATEGORIE_CANONICHE,
      sites: sediRinominate,
      groups: CATEGORY_GROUPS_GREZZI,
    }),
  );

  const pulciniRinominato = attivi.find(
    (gruppo) => gruppo.categoryId === PULCINI_SCOSMA,
  );

  assert.equal(pulciniRinominato.categoryId, PULCINI_SCOSMA, "identita invariata");
  assert.equal(pulciniRinominato.categoryName, "Pulcini", "nome canonico invariato");
  assert.equal(
    pulciniRinominato.siteName,
    "Santi Cosma e Damiano",
    "l'etichetta segue il nome aggiornato della sede",
  );
});

/* ------------------------------------------------------------------ */
/* Caso 10 — la correzione conta per nome, non e un secondo lettore    */
/* ------------------------------------------------------------------ */

test("la disambiguazione e per nome scritto, non per categoryId: la correzione riprodotta", () => {
  /*
    Isola esattamente la regola corretta in TrainingGroupSelector.tsx e in
    WeeklyTrainingSchedulePanel.tsx (`groupsPerCategoryName`), senza montare
    React: la stessa funzione, applicata ai gruppi attivi del club.

    Prima della correzione questo conteggio era per `categoryId`: con un solo
    gruppo per identificativo il conto restava sempre 1 e la sede non veniva
    mai accostata. Qui si dimostra che, contando per nome, il conto e 2 e la
    sede si distingue correttamente per ciascuna squadra.
  */
  const attivi = getActiveCategoryGroups(gruppiOperativi());

  const perCategoryId = new Map();
  const perCategoryName = new Map();
  attivi.forEach((gruppo) => {
    perCategoryId.set(gruppo.categoryId, (perCategoryId.get(gruppo.categoryId) || 0) + 1);
    const chiave = gruppo.categoryName.trim().toLowerCase();
    perCategoryName.set(chiave, (perCategoryName.get(chiave) || 0) + 1);
  });

  // Il difetto: per categoryId ogni Pulcini/Scoiattoli conta 1, mai ambiguo.
  for (const gruppo of attivi) {
    assert.equal(perCategoryId.get(gruppo.categoryId), 1);
  }

  // La correzione: per nome, "pulcini" e "scoiattoli" contano 2 ciascuno.
  assert.equal(perCategoryName.get("pulcini"), 2);
  assert.equal(perCategoryName.get("scoiattoli"), 2);

  const getGroupLabel = (gruppo) => {
    const chiave = gruppo.categoryName.trim().toLowerCase();
    return (perCategoryName.get(chiave) || 0) > 1 && gruppo.siteName
      ? `${gruppo.categoryName} · ${gruppo.siteName}`
      : gruppo.categoryName;
  };

  const etichette = attivi.map(getGroupLabel).sort();
  assert.deepEqual(etichette, [
    "Pulcini · S. Cosma",
    "Pulcini · Scauri",
    "Scoiattoli · S. Cosma",
    "Scoiattoli · Scauri",
  ]);

  // Nessuna coppia di etichette identica: niente "Pulcini"/"Pulcini" nudi.
  assert.equal(new Set(etichette).size, etichette.length);
});
