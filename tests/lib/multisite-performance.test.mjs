import assert from "node:assert/strict";
import test from "node:test";

import { getJerseyGroupSummaries } from "../../src/lib/jersey-numbering-utils.ts";
import { getKitDeliveryProgress } from "../../src/lib/clothing-delivery.ts";
import { normalizeClubClothingState } from "../../src/lib/clothing-inventory-utils.ts";

/**
 * Il costo cresce con gli atleti, non con il loro quadrato.
 *
 * Non e un benchmark e non fissa una soglia in millisecondi: su una macchina
 * carica qualunque soglia assoluta e rumore. Misura il **rapporto** fra due
 * scenari, uno doppio dell'altro. Un algoritmo lineare raddoppia, uno
 * quadratico quadruplica, e la soglia sta in mezzo con margine.
 *
 * La classe di regressione che intercetta e concreta: ricalcolare le
 * appartenenze o le sedi di un atleta **dentro** il ciclo sui gruppi invece
 * che una volta sola. Con 12 gruppi e 480 atleti non si nota da un test
 * funzionale; si nota da uno smartphone in palestra.
 *
 * Lo scenario di riferimento e in `scripts/measure-multisite-performance.mjs`,
 * che stampa anche i tempi assoluti.
 */

const SITES = ["site-roma", "site-aprilia", "site-latina"];
const CATEGORY_COUNT = 12;
const GROUP_COUNT = 9;
const KIT_ITEMS = ["maglia", "pantaloncino", "felpa", "borsa"];

/** Raddoppiando l'ingresso: lineare ~2x, quadratico ~4x. La soglia sta in mezzo. */
const MAX_SCALING_RATIO = 3;

const buildCategories = () =>
  Array.from({ length: CATEGORY_COUNT }, (_, index) => ({
    id: `cat-${index}`,
    name: `Categoria ${index}`,
    compatibleCategoryIds:
      index + 1 < CATEGORY_COUNT ? [`cat-${index + 1}`] : [],
  }));

const buildAthletes = (count) =>
  Array.from({ length: count }, (_, index) => ({
    id: `athlete-${index}`,
    first_name: `Nome${index}`,
    last_name: `Cognome${String(index).padStart(4, "0")}`,
    category_memberships: [
      {
        category_id: `cat-${index % CATEGORY_COUNT}`,
        category_name: `Categoria ${index % CATEGORY_COUNT}`,
        is_primary: true,
        site_id: SITES[index % SITES.length],
      },
    ],
  }));

const buildScenario = (athleteCount) => {
  const categories = buildCategories();
  const athletes = buildAthletes(athleteCount);
  const state = normalizeClubClothingState({
    products: KIT_ITEMS.map((id) => ({ id, name: id, type: id })),
    kits: [{ id: "kit-gara", name: "Kit Gara", components: KIT_ITEMS }],
    inventory: [],
    assignments: athletes.map((athlete, index) => ({
      id: `assignment-${index}`,
      athleteId: athlete.id,
      status: "assigned",
      kitId: "kit-gara",
      numberingGroupId: `numbering-${index % GROUP_COUNT}`,
      items: KIT_ITEMS.map((itemId, itemIndex) => ({
        id: `assignment-${index}-item-${itemIndex}`,
        itemId,
        name: itemId,
        number: (index % 99) + 1,
        numberingGroupId: `numbering-${index % GROUP_COUNT}`,
        status: itemIndex < 2 ? "delivered" : itemIndex === 2 ? "ready" : "unavailable",
      })),
    })),
    jerseyGroups: Array.from({ length: GROUP_COUNT }, (_, index) => ({
      id: `numbering-${index}`,
      name: `Numerazione ${index}`,
      categoryIds: [`cat-${index % CATEGORY_COUNT}`],
      includeCompatibleCategories: index % 3 === 0,
      siteIds: [SITES[index % SITES.length]],
      minNumber: 1,
      maxNumber: 99,
    })),
    jerseyAssignments: [],
  });

  return { categories, athletes, state };
};

const ITERATIONS = 20;

const timeOf = (run) => {
  const started = process.hrtime.bigint();
  for (let index = 0; index < ITERATIONS; index += 1) run();
  return Number(process.hrtime.bigint() - started) / 1e6 / ITERATIONS;
};

/**
 * Misura il rapporto fra due scenari **dopo** aver riscaldato entrambi, e
 * tiene il risultato migliore su tre giri: una schedulazione sfortunata non
 * deve far fallire una build.
 */
const scalingRatio = (small, large) => {
  for (let round = 0; round < 3; round += 1) {
    timeOf(small);
    timeOf(large);
  }

  let best = Infinity;
  for (let round = 0; round < 3; round += 1) {
    const smallTime = Math.max(timeOf(small), 0.001);
    const largeTime = timeOf(large);
    best = Math.min(best, largeTime / smallTime);
  }

  return best;
};

test("il riepilogo dei gruppi numerazione cresce linearmente con gli atleti", () => {
  const small = buildScenario(200);
  const large = buildScenario(400);

  const summarize = ({ categories, athletes, state }) =>
    getJerseyGroupSummaries({
      groups: state.numberingGroups,
      state,
      athletes,
      categories,
    });

  // Prima la correttezza: un rapporto misurato su un risultato vuoto non
  // dimostra niente.
  const summaries = summarize(large);
  assert.equal(summaries.length, GROUP_COUNT);
  assert.ok(
    summaries.some((summary) => summary.rows.length > 0),
    "i gruppi devono contenere atleti",
  );

  const ratio = scalingRatio(
    () => summarize(small),
    () => summarize(large),
  );

  assert.ok(
    ratio < MAX_SCALING_RATIO,
    `raddoppiando gli atleti il costo si moltiplica per ${ratio.toFixed(2)}: ` +
      "qualcosa e stato spostato dentro il ciclo sui gruppi",
  );
});

test("il progresso di consegna cresce linearmente con i kit", () => {
  const small = buildScenario(200);
  const large = buildScenario(400);

  const progressOf = ({ state }) =>
    state.assignments.map((assignment) => getKitDeliveryProgress(assignment));

  assert.equal(progressOf(large).length, 400);
  assert.equal(progressOf(large)[0].label, "2/4 consegnati · 1 non disponibile");

  const ratio = scalingRatio(
    () => progressOf(small),
    () => progressOf(large),
  );

  assert.ok(
    ratio < MAX_SCALING_RATIO,
    `raddoppiando i kit il costo si moltiplica per ${ratio.toFixed(2)}`,
  );
});
