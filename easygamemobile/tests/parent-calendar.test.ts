import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildParentCalendarItems,
  filterParentCalendarItems,
  findParentCalendarItem,
  formatEventDateRail,
  formatEventDateShort,
} from "../client/lib/parent-calendar";
import type { ParentDashboardEvent } from "../client/services/api";

const event = (
  id: string,
  date: string,
  time: string,
): ParentDashboardEvent => ({
  id,
  date,
  time,
});

test("calendario: solo allenamenti", () => {
  const trainings = [event("t1", "2026-09-12", "18:00")];
  const items = buildParentCalendarItems(trainings, []);
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "training");
});

test("calendario: solo gare", () => {
  const matches = [event("m1", "2026-09-14", "15:00")];
  const items = buildParentCalendarItems([], matches);
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "match");
});

test("calendario: combinazione allenamenti e gare, ordinati per data/ora", () => {
  const trainings = [
    event("t1", "2026-09-15", "18:00"),
    event("t2", "2026-09-10", "18:00"),
  ];
  const matches = [event("m1", "2026-09-12", "15:00")];
  const items = buildParentCalendarItems(trainings, matches);
  assert.deepEqual(
    items.map((item) => item.id),
    ["t2", "m1", "t1"],
  );
});

test("filtro calendario: all/training/match", () => {
  const items = buildParentCalendarItems(
    [event("t1", "2026-09-10", "18:00")],
    [event("m1", "2026-09-11", "15:00")],
  );
  assert.equal(filterParentCalendarItems(items, "all").length, 2);
  assert.equal(filterParentCalendarItems(items, "training").length, 1);
  assert.equal(filterParentCalendarItems(items, "match")[0].id, "m1");
});

test("trova una voce del calendario per id senza una seconda fetch", () => {
  const items = buildParentCalendarItems(
    [event("t1", "2026-09-10", "18:00")],
    [],
  );
  assert.equal(findParentCalendarItem(items, "t1")?.id, "t1");
  assert.equal(findParentCalendarItem(items, "inesistente"), null);
});

test("la rotaia data e null per una data mancante o non valida", () => {
  assert.equal(formatEventDateRail(undefined), null);
  assert.equal(formatEventDateRail("data-non-valida"), null);
  const rail = formatEventDateRail("2026-09-12");
  assert.ok(rail);
  assert.equal(rail?.dayNumber, "12");
  assert.equal(rail?.monthLabel, "set");
});

test("l'etichetta breve ricade su 'Da definire' senza una data", () => {
  assert.equal(formatEventDateShort(undefined), "Da definire");
  assert.notEqual(formatEventDateShort("2026-09-12"), "Da definire");
});
