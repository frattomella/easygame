import assert from "node:assert/strict";
import test from "node:test";

import {
  athleteMatchesSite,
  buildCategoryGroupLabel,
  buildCategoryGroups,
  buildSiteIndex,
  filterCategoryGroupsBySite,
  filterStructuresBySite,
  getAthleteSiteIds,
  getCategoryIdsForSite,
  isMultiSiteClub,
  normalizeClubSites,
  serializeCategoryGroup,
} from "../../src/lib/club-sites.ts";
import {
  buildCategoryCompatibilityIndex,
  getAthleteCategoryEligibility,
  getEligibilityKind,
} from "../../src/lib/category-compatibility.ts";
import { normalizeAthleteCategoryMemberships } from "../../src/lib/athlete-category-memberships.ts";

/**
 * Multi-sede (ADR-0036).
 *
 * Il difetto che questo modello chiude e la duplicazione semantica della
 * categoria: `Pulcini - Roma` e `Pulcini - Aprilia` erano due categorie, con
 * due fasce d'anno e due compatibilita da tenere allineate a mano. Qui la
 * categoria resta **una**, e cio che si moltiplica e il gruppo operativo.
 */

const SITES = [
  { id: "site-roma", name: "Roma", city: "Roma" },
  { id: "site-aprilia", name: "Aprilia", city: "Aprilia" },
];

const CATEGORIES = [
  { id: "cat-pulcini", name: "Pulcini", compatibleCategoryIds: ["cat-esordienti"] },
  { id: "cat-esordienti", name: "Esordienti" },
];

const GROUPS = [
  { id: "grp-roma", categoryId: "cat-pulcini", siteId: "site-roma" },
  { id: "grp-aprilia", categoryId: "cat-pulcini", siteId: "site-aprilia" },
];

const athleteInSite = (id, siteId, categoryId = "cat-pulcini") => ({
  id,
  first_name: "Mario",
  last_name: id.toUpperCase(),
  category_memberships: [
    {
      category_id: categoryId,
      category_name: categoryId === "cat-pulcini" ? "Pulcini" : "Esordienti",
      is_primary: true,
      site_id: siteId,
    },
  ],
});

test("la stessa categoria in due sedi resta una sola categoria", () => {
  const groups = buildCategoryGroups({
    categories: CATEGORIES,
    sites: SITES,
    groups: GROUPS,
  });

  const pulciniGroups = groups.filter(
    (group) => group.categoryId === "cat-pulcini",
  );

  assert.equal(pulciniGroups.length, 2);
  assert.deepEqual(
    new Set(pulciniGroups.map((group) => group.categoryId)),
    new Set(["cat-pulcini"]),
  );
  assert.deepEqual(
    pulciniGroups.map((group) => group.name),
    ["Pulcini · Aprilia", "Pulcini · Roma"],
  );
});

test("l'etichetta del gruppo e categoria piu sede, e senza sede resta la categoria", () => {
  assert.equal(buildCategoryGroupLabel("Pulcini", "Roma"), "Pulcini · Roma");
  assert.equal(buildCategoryGroupLabel("Pulcini", ""), "Pulcini");
});

test("una categoria senza gruppi configurati produce un gruppo implicito", () => {
  const groups = buildCategoryGroups({
    categories: CATEGORIES,
    sites: SITES,
    groups: GROUPS,
  });

  const esordienti = groups.find(
    (group) => group.categoryId === "cat-esordienti",
  );

  assert.ok(esordienti);
  assert.equal(esordienti.implicit, true);
  assert.equal(esordienti.siteId, "");
  assert.equal(esordienti.name, "Esordienti");
});

test("il club mono-sede non e multi-sede e non vede il concetto", () => {
  assert.equal(isMultiSiteClub(normalizeClubSites([])), false);
  assert.equal(
    isMultiSiteClub(normalizeClubSites([{ id: "site-roma", name: "Roma" }])),
    false,
  );
  assert.equal(isMultiSiteClub(normalizeClubSites(SITES)), true);
});

test("una sede disattivata non rende il club multi-sede", () => {
  const sites = normalizeClubSites([
    { id: "site-roma", name: "Roma" },
    { id: "site-aprilia", name: "Aprilia", active: false },
  ]);

  assert.equal(sites.length, 2);
  assert.equal(isMultiSiteClub(sites), false);
});

test("le sedi si deduplicano per nome, non solo per id", () => {
  const sites = normalizeClubSites([
    { id: "site-roma", name: "Roma" },
    { id: "roma-2", name: "roma" },
  ]);

  assert.equal(sites.length, 1);
  assert.equal(sites[0].id, "site-roma");
});

test("l'indice sedi risolve id e nome, con qualunque maiuscola", () => {
  const index = buildSiteIndex(normalizeClubSites(SITES));

  assert.equal(index.resolveSiteId("APRILIA"), "site-aprilia");
  assert.equal(index.resolveSiteId("site-roma"), "site-roma");
  assert.equal(index.getSiteName("aprilia"), "Aprilia");
  assert.equal(index.has("Latina"), false);
});

test("l'atleta e assegnato alla sede della sua appartenenza", () => {
  const index = buildSiteIndex(normalizeClubSites(SITES));
  const romano = athleteInSite("a1", "site-roma");
  const apriliano = athleteInSite("a2", "site-aprilia");

  assert.deepEqual(getAthleteSiteIds(romano, index), ["site-roma"]);
  assert.equal(athleteMatchesSite(romano, "site-roma", index), true);
  assert.equal(athleteMatchesSite(romano, "site-aprilia", index), false);
  assert.equal(athleteMatchesSite(apriliano, "site-aprilia", index), true);
});

test("un atleta senza sede dichiarata resta visibile in ogni sede", () => {
  const legacy = {
    id: "a3",
    category_id: "cat-pulcini",
    category_name: "Pulcini",
  };

  assert.deepEqual(getAthleteSiteIds(legacy), []);
  assert.equal(athleteMatchesSite(legacy, "site-roma"), true);
  assert.equal(athleteMatchesSite(legacy, "site-aprilia"), true);
});

test("il filtro senza sede non toglie niente", () => {
  const romano = athleteInSite("a1", "site-roma");
  assert.equal(athleteMatchesSite(romano, ""), true);
});

test("la sede dell'appartenenza sopravvive alla normalizzazione", () => {
  const [membership] = normalizeAthleteCategoryMemberships(
    athleteInSite("a1", "site-roma"),
  );

  assert.equal(membership.categoryId, "cat-pulcini");
  assert.equal(membership.siteId, "site-roma");
});

test("le strutture si filtrano per sede e quelle senza sede restano", () => {
  const structures = [
    { id: "s1", name: "PalaRoma", siteId: "site-roma" },
    { id: "s2", name: "PalaAprilia", siteId: "site-aprilia" },
    { id: "s3", name: "Campo storico" },
  ];

  assert.deepEqual(
    filterStructuresBySite(structures, "site-roma").map(
      (structure) => structure.id,
    ),
    ["s1", "s3"],
  );
  assert.equal(filterStructuresBySite(structures, "").length, 3);
});

test("i gruppi di una sede includono i gruppi impliciti", () => {
  const groups = buildCategoryGroups({
    categories: CATEGORIES,
    sites: SITES,
    groups: GROUPS,
  });

  assert.deepEqual(
    filterCategoryGroupsBySite(groups, "site-roma").map((group) => group.name),
    ["Esordienti", "Pulcini · Roma"],
  );
  assert.deepEqual(getCategoryIdsForSite(groups, "site-aprilia"), [
    "cat-esordienti",
    "cat-pulcini",
  ]);
});

test("la compatibilita resta esplicita, orientata e non transitiva con piu sedi", () => {
  const categories = [
    { id: "cat-pulcini", name: "Pulcini", compatibleCategoryIds: ["cat-esordienti"] },
    { id: "cat-esordienti", name: "Esordienti", compatibleCategoryIds: ["cat-giovanissimi"] },
    { id: "cat-giovanissimi", name: "Giovanissimi" },
  ];
  const index = buildCategoryCompatibilityIndex(categories);
  const eligibility = getAthleteCategoryEligibility({
    athlete: athleteInSite("a1", "site-aprilia"),
    index,
  });

  // Un salto: utilizzabile in Esordienti.
  assert.equal(
    getEligibilityKind({
      eligibility,
      categoryIds: ["cat-esordienti"],
      includeCompatible: true,
    }),
    "compatible",
  );

  // Due salti: mai. La sede non cambia la regola.
  assert.equal(
    getEligibilityKind({
      eligibility,
      categoryIds: ["cat-giovanissimi"],
      includeCompatible: true,
    }),
    "none",
  );

  // E senza chiederlo, l'eleggibilita non e un'appartenenza.
  assert.equal(
    getEligibilityKind({ eligibility, categoryIds: ["cat-esordienti"] }),
    "none",
  );
});

test("il gruppo serializzato non porta la sede dentro il nome della categoria", () => {
  const group = buildCategoryGroups({
    categories: CATEGORIES,
    sites: SITES,
    groups: [GROUPS[0]],
  }).find((entry) => entry.categoryId === "cat-pulcini");
  const serialized = serializeCategoryGroup(group);

  assert.equal(serialized.categoryId, "cat-pulcini");
  assert.equal(serialized.categoryName, "Pulcini");
  assert.equal(serialized.siteId, "site-roma");
  assert.equal(serialized.name, "Pulcini · Roma");
});
