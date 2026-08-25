/**
 * Misura le funzioni critiche del Workstream B su uno scenario realistico.
 *
 * Lo scenario non e «grande»: e quello di una societa vera di media
 * dimensione — 240 atleti, tre sedi, dodici categorie, nove gruppi
 * numerazione, un kit da quattro pezzi a testa. Serve a rispondere a una
 * domanda sola: **il costo cresce con gli atleti o con il loro quadrato?**
 *
 * Si esegue con:
 *
 *   node --experimental-strip-types \n *     --import ./tests/helpers/register-hooks.mjs \n *     scripts/measure-multisite-performance.mjs
 *
 * Il gancio serve: i moduli misurati importano con alias `@/` e senza
 * estensione, che Node da solo non risolve. Senza, lo script muore
 * sull'import invece di misurare, ed e cosi che una misura smette di essere
 * rifacibile — vedi il gemello measure-athletes-payload.mjs, che il gancio lo
 * documentava gia.
 *
 * Non tocca il database e non legge `.env`: costruisce i dati in memoria.
 */

import { getJerseyGroupSummaries } from "../src/lib/jersey-numbering-utils.ts";
import { buildCategoryGroups, normalizeClubSites } from "../src/lib/club-sites.ts";
import { getKitDeliveryProgress } from "../src/lib/clothing-delivery.ts";
import { normalizeClubClothingState } from "../src/lib/clothing-inventory-utils.ts";

const SITES = normalizeClubSites([
  { id: "site-roma", name: "Roma" },
  { id: "site-aprilia", name: "Aprilia" },
  { id: "site-latina", name: "Latina" },
]);

const CATEGORY_COUNT = 12;
const KIT_ITEMS = ["maglia", "pantaloncino", "felpa", "borsa"];

const buildCategories = () =>
  Array.from({ length: CATEGORY_COUNT }, (_, index) => ({
    id: `cat-${index}`,
    name: `Categoria ${index}`,
    // Ogni categoria e compatibile con la successiva: un salto solo, mai la
    // chiusura transitiva.
    compatibleCategoryIds: index + 1 < CATEGORY_COUNT ? [`cat-${index + 1}`] : [],
  }));

const buildGroupsConfig = (categories) =>
  categories.flatMap((category) =>
    SITES.map((site) => ({
      id: `group-${category.id}-${site.id}`,
      categoryId: category.id,
      siteId: site.id,
    })),
  );

const buildAthletes = (count) =>
  Array.from({ length: count }, (_, index) => {
    const category = `cat-${index % CATEGORY_COUNT}`;
    const site = SITES[index % SITES.length].id;

    return {
      id: `athlete-${index}`,
      first_name: `Nome${index}`,
      last_name: `Cognome${String(index).padStart(4, "0")}`,
      category_memberships: [
        {
          category_id: category,
          category_name: `Categoria ${index % CATEGORY_COUNT}`,
          is_primary: true,
          site_id: site,
        },
      ],
    };
  });

const buildNumberingGroups = (count) =>
  Array.from({ length: count }, (_, index) => ({
    id: `numbering-${index}`,
    name: `Numerazione ${index}`,
    categoryIds: [`cat-${index % CATEGORY_COUNT}`],
    includeCompatibleCategories: index % 3 === 0,
    siteIds: [SITES[index % SITES.length].id],
    minNumber: 1,
    maxNumber: 99,
    reservedNumbers: [],
    assignedNumbers: [],
  }));

const buildAssignments = (athletes) =>
  athletes.map((athlete, index) => ({
    id: `assignment-${index}`,
    athleteId: athlete.id,
    status: "assigned",
    kitId: "kit-gara",
    kitName: "Kit Gara",
    numberingGroupId: `numbering-${index % 9}`,
    items: KIT_ITEMS.map((itemId, itemIndex) => ({
      id: `assignment-${index}-item-${itemIndex}`,
      itemId,
      name: itemId,
      quantity: 1,
      number: (index % 99) + 1,
      numberingGroupId: `numbering-${index % 9}`,
      status:
        itemIndex === 0 || itemIndex === 1
          ? "delivered"
          : itemIndex === 2
            ? "ready"
            : "unavailable",
    })),
  }));

/**
 * Il riscaldamento e separato dalla misura di proposito: senza, il secondo
 * scenario misurerebbe codice gia compilato dal primo e il rapporto fra i due
 * direbbe piu sul JIT che sull'algoritmo.
 */
const WARMUP_ITERATIONS = 30;
const MEASURE_ITERATIONS = 30;

const warmup = (run) => {
  for (let index = 0; index < WARMUP_ITERATIONS; index += 1) run();
};

const measure = (label, run) => {
  const started = process.hrtime.bigint();
  for (let index = 0; index < MEASURE_ITERATIONS; index += 1) run();
  const elapsed =
    Number(process.hrtime.bigint() - started) / 1e6 / MEASURE_ITERATIONS;
  if (label) console.log(`${label.padEnd(52)} ${elapsed.toFixed(2)} ms`);
  return elapsed;
};

const scenario = (athleteCount) => {
  const categories = buildCategories();
  const athletes = buildAthletes(athleteCount);
  const groupsConfig = buildGroupsConfig(categories);
  const numberingGroups = buildNumberingGroups(9);
  const state = normalizeClubClothingState({
    products: KIT_ITEMS.map((id) => ({ id, name: id, type: id })),
    kits: [{ id: "kit-gara", name: "Kit Gara", components: KIT_ITEMS }],
    inventory: [],
    assignments: buildAssignments(athletes),
    jerseyGroups: numberingGroups,
    jerseyAssignments: [],
  });

  return { categories, athletes, groupsConfig, state };
};

const buildProbes = (athleteCount) => {
  const { categories, athletes, groupsConfig, state } = scenario(athleteCount);

  return {
    athleteCount,
    assignmentCount: state.assignments.length,
    probes: {
      groupsTime: {
        label: "buildCategoryGroups",
        run: () =>
          buildCategoryGroups({ categories, sites: SITES, groups: groupsConfig }),
      },
      summariesTime: {
        label: "getJerseyGroupSummaries (9 gruppi)",
        run: () =>
          getJerseyGroupSummaries({
            groups: state.numberingGroups,
            state,
            athletes,
            categories,
          }),
      },
      deliveryTime: {
        label: "getKitDeliveryProgress (tutti i kit)",
        run: () =>
          state.assignments.map((assignment) =>
            getKitDeliveryProgress(assignment),
          ),
      },
    },
  };
};

const PROBE_KEYS = ["groupsTime", "summariesTime", "deliveryTime"];

const scenarios = [buildProbes(240), buildProbes(480)];

// Tutti gli scenari si riscaldano prima che se ne misuri uno: altrimenti il
// secondo misurerebbe codice gia compilato dal primo.
scenarios.forEach((entry) =>
  PROBE_KEYS.forEach((key) => warmup(entry.probes[key].run)),
);

const results = scenarios.map((entry) => {
  console.log(
    `\n--- ${entry.athleteCount} atleti · ${SITES.length} sedi · ${CATEGORY_COUNT} categorie · ${entry.assignmentCount} kit ---`,
  );

  return Object.fromEntries(
    PROBE_KEYS.map((key) => [
      key,
      measure(entry.probes[key].label, entry.probes[key].run),
    ]),
  );
});

const [small, large] = results;

console.log("\n--- Scaling raddoppiando gli atleti ---");
for (const key of PROBE_KEYS) {
  const ratio = large[key] / Math.max(small[key], 0.0001);
  console.log(
    `${key.padEnd(20)} x${ratio.toFixed(2)}  ${
      ratio < 3 ? "lineare" : "SOSPETTO: verificare"
    }`,
  );
}
