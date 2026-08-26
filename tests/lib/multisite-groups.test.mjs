import assert from "node:assert/strict";
import test from "node:test";

import {
  athleteMatchesGroup,
  buildCategoryGroupId,
  buildCategoryGroups,
  buildCategoryGroupsForSites,
  buildSiteIndex,
  compareCategoryGroups,
  filterTrainingsForAthleteGroups,
  getActiveCategoryGroups,
  getAthleteGroupIds,
  getMembershipGroupId,
  groupAthletesByCategoryGroup,
  normalizeClubSites,
  readTrainingGroupIds,
  trainingMatchesGroup,
  UNASSIGNED_SITE_LABEL,
} from "../../src/lib/club-sites.ts";

/**
 * Gruppi operativi (ADR-0055).
 *
 * Il difetto che questo livello chiude non e la mancanza di un filtro: e che
 * `Pulcini` fosse **una lista sola** anche quando erano due squadre. Chi
 * stampa l'appello di Scauri non deve trovarsi davanti i Pulcini di Santi
 * Cosma, e chi conta le ore per un contributo non deve contargli allenamenti
 * a cui non poteva essere.
 *
 * Le proprieta difese qui sono tre:
 *
 * 1. **niente contaminazione fra gruppi.** Un atleta di una sede non compare
 *    mai negli elenchi di un'altra;
 * 2. **niente sparizioni.** Chi non ha una sede dichiarata finisce in un
 *    gruppo suo, visibile, non nel nulla;
 * 3. **il club mono-sede non paga niente.** Con una squadra per categoria le
 *    etichette restano i nomi delle categorie.
 */

const SITES = normalizeClubSites([
  { id: "site-scauri", name: "Scauri", city: "Scauri" },
  { id: "site-santi", name: "Santi Cosma", city: "Santi Cosma" },
  { id: "site-castelforte", name: "Castelforte", city: "Castelforte" },
]);

const CATEGORIES = [
  { id: "cat-pulcini", name: "Pulcini" },
  { id: "cat-esordienti", name: "Esordienti" },
];

const GROUPS = [
  { id: "grp-pulcini-scauri", categoryId: "cat-pulcini", siteId: "site-scauri" },
  { id: "grp-pulcini-santi", categoryId: "cat-pulcini", siteId: "site-santi" },
];

const atleta = (id, cognome, siteId, categoryId = "cat-pulcini") => ({
  id,
  first_name: "Mario",
  last_name: cognome,
  category_memberships: [
    {
      category_id: categoryId,
      category_name: categoryId === "cat-pulcini" ? "Pulcini" : "Esordienti",
      is_primary: true,
      site_id: siteId,
    },
  ],
});

const ROSSI = atleta("a-1", "Rossi", "site-scauri");
const BIANCHI = atleta("a-2", "Bianchi", "site-scauri");
const VERDI = atleta("a-3", "Verdi", "site-santi");
const NERI = atleta("a-4", "Neri", "site-santi");
/** Dato precedente alle sedi: nessuna sede dichiarata. */
const LEGACY = atleta("a-5", "Antichi", "");

const siteIndex = buildSiteIndex(SITES);

const groups = () =>
  buildCategoryGroups({
    categories: CATEGORIES,
    sites: SITES,
    groups: GROUPS,
  });

/* ------------------------------------------- l'appartenenza e il gruppo */

test("il gruppo di un'appartenenza e la coppia categoria-sede", () => {
  assert.equal(
    getMembershipGroupId(
      { categoryId: "cat-pulcini", siteId: "site-scauri" },
      siteIndex,
    ),
    buildCategoryGroupId("cat-pulcini", "site-scauri"),
  );
});

test("il gruppo si risolve anche dal nome della sede", () => {
  assert.equal(
    getMembershipGroupId({ categoryId: "cat-pulcini", siteId: "Scauri" }, siteIndex),
    getMembershipGroupId(
      { categoryId: "cat-pulcini", siteId: "site-scauri" },
      siteIndex,
    ),
    "una fonte sola per la stessa squadra, comunque sia scritta la sede",
  );
});

test("senza categoria non c'e gruppo", () => {
  assert.equal(getMembershipGroupId({ categoryId: "", siteId: "site-scauri" }), "");
});

test("un atleta appartiene al gruppo della sua sede, e solo a quello", () => {
  const scauri = groups().find((group) => group.siteId === "site-scauri");
  const santi = groups().find((group) => group.siteId === "site-santi");

  assert.equal(athleteMatchesGroup(ROSSI, scauri, siteIndex), true);
  assert.equal(
    athleteMatchesGroup(ROSSI, santi, siteIndex),
    false,
    "stessa categoria, altra squadra: non e la sua",
  );
});

test("le appartenenze multiple restano tutte", () => {
  const doppio = {
    id: "a-9",
    category_memberships: [
      {
        category_id: "cat-pulcini",
        category_name: "Pulcini",
        is_primary: true,
        site_id: "site-scauri",
      },
      {
        category_id: "cat-esordienti",
        category_name: "Esordienti",
        is_primary: false,
        site_id: "site-santi",
      },
    ],
  };

  const ids = getAthleteGroupIds(doppio, siteIndex);

  assert.equal(ids.length, 2);
  assert.ok(ids.includes(buildCategoryGroupId("cat-pulcini", "site-scauri")));
  assert.ok(ids.includes(buildCategoryGroupId("cat-esordienti", "site-santi")));
});

/* --------------------------------------------- gli elenchi si separano */

test("una categoria in due sedi produce due elenchi distinti", () => {
  const buckets = groupAthletesByCategoryGroup({
    athletes: [ROSSI, BIANCHI, VERDI, NERI],
    groups: groups(),
    siteIndex,
  });

  const scauri = buckets.find((bucket) => bucket.group.siteId === "site-scauri");
  const santi = buckets.find((bucket) => bucket.group.siteId === "site-santi");

  assert.deepEqual(
    scauri.athletes.map((athlete) => athlete.last_name),
    ["Rossi", "Bianchi"],
  );
  assert.deepEqual(
    santi.athletes.map((athlete) => athlete.last_name),
    ["Verdi", "Neri"],
  );
});

test("l'atleta di Scauri non compare fra quelli di Santi Cosma", () => {
  const buckets = groupAthletesByCategoryGroup({
    athletes: [ROSSI, VERDI],
    groups: groups(),
    siteIndex,
  });

  const santi = buckets.find((bucket) => bucket.group.siteId === "site-santi");

  assert.equal(
    santi.athletes.some((athlete) => athlete.id === ROSSI.id),
    false,
  );
});

test("l'atleta di Santi Cosma non compare fra quelli di Scauri", () => {
  const buckets = groupAthletesByCategoryGroup({
    athletes: [ROSSI, VERDI],
    groups: groups(),
    siteIndex,
  });

  const scauri = buckets.find((bucket) => bucket.group.siteId === "site-scauri");

  assert.equal(
    scauri.athletes.some((athlete) => athlete.id === VERDI.id),
    false,
  );
});

test("chi non ha sede finisce in un gruppo suo, e resta visibile", () => {
  const buckets = groupAthletesByCategoryGroup({
    athletes: [ROSSI, VERDI, LEGACY],
    groups: groups(),
    siteIndex,
  });

  const senzaSede = buckets.find(
    (bucket) => !bucket.group.siteId && bucket.group.categoryId === "cat-pulcini",
  );

  assert.ok(senzaSede, "il dato storico non sparisce");
  assert.equal(senzaSede.group.siteName, UNASSIGNED_SITE_LABEL);
  assert.deepEqual(
    senzaSede.athletes.map((athlete) => athlete.id),
    [LEGACY.id],
  );

  const scauri = buckets.find((bucket) => bucket.group.siteId === "site-scauri");
  assert.equal(
    scauri.athletes.some((athlete) => athlete.id === LEGACY.id),
    false,
    "senza sede non vuol dire in tutte le sedi, quando si tratta di elenchi",
  );
});

test("un gruppo non configurato che ha atleti compare lo stesso", () => {
  const castelforte = atleta("a-6", "Nuovi", "site-castelforte");

  const buckets = groupAthletesByCategoryGroup({
    athletes: [ROSSI, castelforte],
    groups: groups(),
    siteIndex,
  });

  const trovato = buckets.find(
    (bucket) => bucket.group.siteId === "site-castelforte",
  );

  assert.ok(trovato, "il dato vince sulla configurazione in ritardo");
  assert.equal(trovato.group.siteName, "Castelforte");
});

test("un club mono-sede vede una lista per categoria, senza sede", () => {
  const monoSede = normalizeClubSites([{ id: "site-unica", name: "Sede" }]);
  const soloIndex = buildSiteIndex(monoSede);

  const buckets = groupAthletesByCategoryGroup({
    athletes: [atleta("a-7", "Soli", "")],
    groups: buildCategoryGroups({ categories: CATEGORIES, sites: monoSede }),
    siteIndex: soloIndex,
  });

  const conAtleti = buckets.filter((bucket) => bucket.athletes.length > 0);

  assert.equal(conAtleti.length, 1);
  assert.equal(conAtleti[0].group.name, "Pulcini", "nessun suffisso di sede");
});

/* ------------------------------------------------------- ordinamento */

test("i gruppi si ordinano per categoria e poi per sede", () => {
  const ordinati = [
    { categoryName: "Pulcini", siteName: "Santi Cosma", siteId: "s2" },
    { categoryName: "Esordienti", siteName: "Scauri", siteId: "s1" },
    { categoryName: "Pulcini", siteName: "Scauri", siteId: "s1" },
  ].sort(compareCategoryGroups);

  assert.deepEqual(
    ordinati.map((group) => `${group.categoryName} ${group.siteName}`),
    ["Esordienti Scauri", "Pulcini Santi Cosma", "Pulcini Scauri"],
  );
});

test("la sede non assegnata va in fondo alla sua categoria", () => {
  const ordinati = [
    { categoryName: "Pulcini", siteName: UNASSIGNED_SITE_LABEL, siteId: "" },
    { categoryName: "Pulcini", siteName: "Scauri", siteId: "s1" },
  ].sort(compareCategoryGroups);

  assert.equal(ordinati[0].siteName, "Scauri");
  assert.equal(ordinati[1].siteId, "");
});

/* ---------------------------------------- creazione e archiviazione */

test("spuntare due sedi su una categoria produce due gruppi, non due categorie", () => {
  const risultato = buildCategoryGroupsForSites({
    categoryId: "cat-pulcini",
    categoryName: "Pulcini",
    siteIds: ["site-scauri", "site-santi"],
    sites: SITES,
  });

  assert.equal(risultato.length, 2);
  assert.deepEqual(
    risultato.map((group) => group.name).sort(),
    ["Pulcini · Santi Cosma", "Pulcini · Scauri"],
  );
  assert.ok(
    risultato.every((group) => group.categoryId === "cat-pulcini"),
    "la categoria resta una sola",
  );
});

test("abilitare una terza sede aggiunge il terzo gruppo e lascia gli altri", () => {
  const primi = buildCategoryGroupsForSites({
    categoryId: "cat-pulcini",
    categoryName: "Pulcini",
    siteIds: ["site-scauri", "site-santi"],
    sites: SITES,
  });

  const dopo = buildCategoryGroupsForSites({
    categoryId: "cat-pulcini",
    categoryName: "Pulcini",
    siteIds: ["site-scauri", "site-santi", "site-castelforte"],
    sites: SITES,
    existing: primi,
  });

  assert.equal(dopo.length, 3);
  assert.equal(
    dopo.filter((group) => group.active).length,
    3,
    "nessuno dei precedenti viene archiviato",
  );
});

test("togliere una sede archivia il gruppo invece di cancellarlo", () => {
  const primi = buildCategoryGroupsForSites({
    categoryId: "cat-pulcini",
    categoryName: "Pulcini",
    siteIds: ["site-scauri", "site-santi"],
    sites: SITES,
  });

  const dopo = buildCategoryGroupsForSites({
    categoryId: "cat-pulcini",
    categoryName: "Pulcini",
    siteIds: ["site-scauri"],
    sites: SITES,
    existing: primi,
  });

  const archiviato = dopo.find((group) => group.siteId === "site-santi");

  assert.ok(archiviato, "lo storico che lo cita resterebbe orfano");
  assert.equal(archiviato.active, false);
  assert.equal(getActiveCategoryGroups(dopo).length, 1);
});

test("un gruppo archiviato conserva il proprio id", () => {
  const primi = buildCategoryGroupsForSites({
    categoryId: "cat-pulcini",
    categoryName: "Pulcini",
    siteIds: ["site-santi"],
    sites: SITES,
  });

  const dopo = buildCategoryGroupsForSites({
    categoryId: "cat-pulcini",
    categoryName: "Pulcini",
    siteIds: [],
    sites: SITES,
    existing: primi,
  });

  assert.equal(dopo[0].id, primi[0].id, "gli allenamenti lo citano per id");
});

/* -------------------------------------------------- allenamenti */

test("un allenamento dichiara i gruppi a cui si riferisce", () => {
  assert.deepEqual(readTrainingGroupIds({ groupIds: ["g-1", "g-2"] }), [
    "g-1",
    "g-2",
  ]);
  assert.deepEqual(readTrainingGroupIds({ group_ids: ["g-1"] }), ["g-1"]);
  assert.deepEqual(readTrainingGroupIds({ payload: { groupIds: ["g-3"] } }), [
    "g-3",
  ]);
  assert.deepEqual(readTrainingGroupIds({}), []);
});

test("un allenamento riguarda solo i gruppi che dichiara", () => {
  const scauri = groups().find((group) => group.siteId === "site-scauri");
  const santi = groups().find((group) => group.siteId === "site-santi");
  const allenamento = { groupIds: [santi.id] };

  assert.equal(trainingMatchesGroup(allenamento, santi), true);
  assert.equal(trainingMatchesGroup(allenamento, scauri), false);
});

test("un allenamento multi-gruppo resta un allenamento solo", () => {
  const scauri = groups().find((group) => group.siteId === "site-scauri");
  const santi = groups().find((group) => group.siteId === "site-santi");
  const allenamento = { id: "t-1", groupIds: [scauri.id, santi.id] };

  assert.equal(trainingMatchesGroup(allenamento, scauri), true);
  assert.equal(trainingMatchesGroup(allenamento, santi), true);
});

test("un allenamento senza gruppi ricade sulla categoria", () => {
  const scauri = groups().find((group) => group.siteId === "site-scauri");
  const matcher = (training, categoryId) =>
    training.categoryId === categoryId;

  assert.equal(
    trainingMatchesGroup({ categoryId: "cat-pulcini" }, scauri, matcher),
    true,
    "un allenamento storico non sparisce dal calendario",
  );
  assert.equal(
    trainingMatchesGroup({ categoryId: "cat-esordienti" }, scauri, matcher),
    false,
  );
});

/* --------------------------------- gli allenamenti che contano davvero */

test("gli allenamenti di un'altra squadra non entrano nel conteggio", () => {
  const scauriId = buildCategoryGroupId("cat-pulcini", "site-scauri");
  const santiId = buildCategoryGroupId("cat-pulcini", "site-santi");

  const rimasti = filterTrainingsForAthleteGroups({
    trainings: [
      { id: "t-scauri", groupIds: [scauriId] },
      { id: "t-santi", groupIds: [santiId] },
      { id: "t-entrambi", groupIds: [scauriId, santiId] },
    ],
    athleteGroupIds: [scauriId],
  });

  assert.deepEqual(
    rimasti.map((training) => training.id),
    ["t-scauri", "t-entrambi"],
  );
});

test("un allenamento senza gruppi resta nel conteggio", () => {
  const rimasti = filterTrainingsForAthleteGroups({
    trainings: [{ id: "t-storico" }],
    athleteGroupIds: [buildCategoryGroupId("cat-pulcini", "site-scauri")],
  });

  assert.deepEqual(
    rimasti.map((training) => training.id),
    ["t-storico"],
    "escluderlo cancellerebbe frequenza vera da stagioni gia rendicontate",
  );
});

test("un atleta senza gruppi dichiarati non perde gli allenamenti storici", () => {
  const rimasti = filterTrainingsForAthleteGroups({
    trainings: [{ id: "t-storico" }, { id: "t-nuovo", groupIds: ["g-x"] }],
    athleteGroupIds: [],
  });

  assert.deepEqual(
    rimasti.map((training) => training.id),
    ["t-storico"],
  );
});
