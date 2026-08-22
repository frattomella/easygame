import assert from "node:assert/strict";
import test from "node:test";

import {
  filterCollectionBySeason,
  normalizeClubSeasons,
  resolveLegacySeasonId,
} from "../../src/lib/club-seasons.ts";

/**
 * Regressione WP-32 — separazione delle stagioni.
 *
 * Due difetti opposti convivevano: le risorse di stagioni diverse si vedevano
 * tutte insieme, e i record creati prima delle stagioni sparivano del tutto.
 */

const settingsWithSeasons = () => ({
  activeSeasonId: "season-2026-2027",
  seasons: [
    {
      id: "season-2026-2027",
      label: "2026/2027",
      startDate: "2026-07-01",
      endDate: "2027-06-30",
      status: "active",
    },
    {
      id: "season-2025-2026",
      label: "2025/2026",
      startDate: "2025-07-01",
      endDate: "2026-06-30",
      status: "archived",
    },
  ],
});

test("la stagione baseline e la piu vecchia del club", () => {
  const { seasons, legacySeasonId, activeSeasonId } = normalizeClubSeasons(
    settingsWithSeasons(),
  );

  assert.equal(seasons.length, 2);
  assert.equal(activeSeasonId, "season-2026-2027");
  assert.equal(legacySeasonId, "season-2025-2026");
  assert.equal(resolveLegacySeasonId(seasons), "season-2025-2026");
});

test("cambiando stagione i dati dell'altra stagione non si vedono", () => {
  const { activeSeasonId, legacySeasonId } = normalizeClubSeasons(
    settingsWithSeasons(),
  );

  const categories = [
    { id: "cat-corrente", seasonId: "season-2026-2027" },
    { id: "cat-vecchia", seasonId: "season-2025-2026" },
  ];

  const visible = filterCollectionBySeason("categories", categories, activeSeasonId, {
    legacySeasonId,
  });

  assert.deepEqual(
    visible.map((category) => category.id),
    ["cat-corrente"],
  );
});

test("i record senza stagione appartengono alla baseline, non a tutte", () => {
  const { legacySeasonId } = normalizeClubSeasons(settingsWithSeasons());
  const records = [
    { id: "legacy" },
    { id: "corrente", seasonId: "season-2026-2027" },
  ];

  const inActiveSeason = filterCollectionBySeason(
    "categories",
    records,
    "season-2026-2027",
    { legacySeasonId },
  );
  const inBaselineSeason = filterCollectionBySeason(
    "categories",
    records,
    "season-2025-2026",
    { legacySeasonId },
  );

  assert.deepEqual(
    inActiveSeason.map((record) => record.id),
    ["corrente"],
    "un record legacy non deve comparire in una stagione successiva",
  );
  assert.deepEqual(
    inBaselineSeason.map((record) => record.id),
    ["legacy"],
    "un record legacy non deve sparire: vive nella stagione baseline",
  );
});

test("senza baseline nota i record legacy restano visibili", () => {
  const records = [{ id: "legacy" }, { id: "altra", seasonId: "season-x" }];

  const visible = filterCollectionBySeason("categories", records, "season-y");

  assert.deepEqual(
    visible.map((record) => record.id),
    ["legacy"],
    "perdere dati e peggio che mostrarne troppi",
  );
});

test("i tipi non soggetti a stagione non vengono filtrati", () => {
  const records = [{ id: "a", seasonId: "season-x" }, { id: "b" }];

  const visible = filterCollectionBySeason("staff_members", records, "season-y", {
    legacySeasonId: "season-z",
  });

  assert.equal(visible.length, 2);
});

test("senza stagione attiva il comportamento e invariato", () => {
  const records = [{ id: "a", seasonId: "season-x" }, { id: "b" }];

  assert.equal(filterCollectionBySeason("categories", records, null).length, 2);
  assert.equal(filterCollectionBySeason("categories", records, "").length, 2);
});

test("un club senza stagioni configurate ne ottiene una sola, che e anche la baseline", () => {
  const state = normalizeClubSeasons({});

  assert.equal(state.seasons.length, 1);
  assert.equal(state.legacySeasonId, state.activeSeasonId);

  const records = [{ id: "legacy" }];
  assert.equal(
    filterCollectionBySeason("categories", records, state.activeSeasonId, {
      legacySeasonId: state.legacySeasonId,
    }).length,
    1,
    "il club a stagione singola non deve perdere nulla",
  );
});
