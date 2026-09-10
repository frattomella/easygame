import { test } from "node:test";
import assert from "node:assert/strict";

import { summarizeTrainerCategories } from "../client/lib/trainer-category-summary";
import type { Athlete, Match, Training } from "../client/services/api";

const athlete = (id: string, categoryId: string, name: string): Athlete =>
  ({
    id,
    name,
    categoryId,
    number: 0,
    position: "",
    status: "attivo",
    category: "",
  }) as Athlete;

const training = (id: string, categoryId: string): Training =>
  ({
    id,
    categoryId,
    title: "",
    date: "",
    time: "",
    location: "",
    category: "",
  }) as Training;

const match = (id: string, categoryId: string): Match =>
  ({
    id,
    categoryId,
    date: "",
    time: "",
    homeTeam: "",
    awayTeam: "",
    location: "",
    isHome: true,
  }) as Match;

test("risolve un nome leggibile per ogni categoria, non un identificativo grezzo", () => {
  const [summary] = summarizeTrainerCategories(
    [{ id: "cat-u15", name: "Under 15", birthYearsLabel: "2011-2012" }],
    [],
    [],
    [],
  );

  assert.equal(summary.id, "cat-u15");
  assert.equal(summary.name, "Under 15");
  assert.equal(summary.birthYearsLabel, "2011-2012");
});

test("conta atleti, allenamenti e gare solo della propria categoria", () => {
  const categories = [
    { id: "cat-a", name: "Under 12" },
    { id: "cat-b", name: "Under 15" },
  ];
  const athletes = [
    athlete("a1", "cat-a", "Anna"),
    athlete("a2", "cat-a", "Bruno"),
    athlete("a3", "cat-b", "Carla"),
  ];
  const trainings = [
    training("t1", "cat-a"),
    training("t2", "cat-b"),
    training("t3", "cat-b"),
  ];
  const matches = [match("m1", "cat-b")];

  const summaries = summarizeTrainerCategories(
    categories,
    athletes,
    trainings,
    matches,
  );

  const catA = summaries.find((entry) => entry.id === "cat-a")!;
  const catB = summaries.find((entry) => entry.id === "cat-b")!;

  assert.equal(catA.athleteCount, 2);
  assert.deepEqual(catA.athleteNames.sort(), ["Anna", "Bruno"]);
  assert.equal(catA.trainingCount, 1);
  assert.equal(catA.matchCount, 0);

  assert.equal(catB.athleteCount, 1);
  assert.equal(catB.trainingCount, 2);
  assert.equal(catB.matchCount, 1);
});

test("una categoria senza nulla resta a zero, non sparisce", () => {
  const [summary] = summarizeTrainerCategories(
    [{ id: "cat-vuota", name: "Under 10" }],
    [],
    [],
    [],
  );
  assert.equal(summary.athleteCount, 0);
  assert.equal(summary.trainingCount, 0);
  assert.equal(summary.matchCount, 0);
  assert.deepEqual(summary.athleteNames, []);
});
