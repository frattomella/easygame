import assert from "node:assert/strict";
import test from "node:test";

import { getJerseyGroupSummaries } from "../../src/lib/jersey-numbering-utils.ts";
import {
  normalizeNumberingGroup,
  serializeNumberingGroup,
} from "../../src/lib/clothing-inventory-utils.ts";

/**
 * Gruppi numerazione e sedi (ADR-0038).
 *
 * Il caso che questi test descrivono e quello reale: una societa svolge i
 * Pulcini a Roma e ad Aprilia e vuole due numerazioni indipendenti — il 10 di
 * Roma e il 10 di Aprilia non sono lo stesso numero e non devono risultare
 * duplicati l'uno dell'altro.
 *
 * Le due asimmetrie vanno tenute: un gruppo **senza** sedi non restringe
 * niente (ed e ogni gruppo esistente), un atleta **senza** sede resta dentro.
 * Un gruppo che perde atleti perche le sedi sono state introdotte lascerebbe
 * liberi dei numeri che liberi non sono.
 */

const CATEGORIES = [{ id: "cat-pulcini", name: "Pulcini" }];

const athlete = (id, lastName, siteId) => ({
  id,
  first_name: "Atleta",
  last_name: lastName,
  category_memberships: [
    {
      category_id: "cat-pulcini",
      category_name: "Pulcini",
      is_primary: true,
      ...(siteId ? { site_id: siteId } : {}),
    },
  ],
});

const group = (id, name, siteIds) => ({
  id,
  name,
  categoryIds: ["cat-pulcini"],
  includeCompatibleCategories: false,
  siteIds,
  season: "",
  minNumber: 1,
  maxNumber: 99,
  reservedNumbers: [],
  assignedNumbers: [],
});

const ATHLETES = [
  athlete("a-roma", "Rossi", "site-roma"),
  athlete("a-aprilia", "Bianchi", "site-aprilia"),
  athlete("a-storico", "Verdi", null),
];

const stateWithNumbers = (entries) => ({
  assignments: [],
  jerseyAssignments: entries.map(([athleteId, groupId, number]) => ({
    id: `${athleteId}:${groupId}`,
    athleteId,
    groupId,
    number,
  })),
});

test("un gruppo ristretto a una sede prende solo gli atleti di quella sede", () => {
  const [roma] = getJerseyGroupSummaries({
    groups: [group("g-roma", "Pulcini · Roma", ["site-roma"])],
    state: { assignments: [], jerseyAssignments: [] },
    athletes: ATHLETES,
    categories: CATEGORIES,
  });

  const ids = roma.rows.map((row) => row.athleteId).sort();

  assert.deepEqual(ids, ["a-roma", "a-storico"]);
  assert.equal(
    ids.includes("a-aprilia"),
    false,
    "l'atleta di Aprilia non e nel gruppo di Roma",
  );
});

test("l'atleta senza sede dichiarata resta in tutti i gruppi", () => {
  const [roma, aprilia] = getJerseyGroupSummaries({
    groups: [
      group("g-roma", "Pulcini · Roma", ["site-roma"]),
      group("g-aprilia", "Pulcini · Aprilia", ["site-aprilia"]),
    ],
    state: { assignments: [], jerseyAssignments: [] },
    athletes: ATHLETES,
    categories: CATEGORIES,
  });

  assert.ok(roma.rows.some((row) => row.athleteId === "a-storico"));
  assert.ok(aprilia.rows.some((row) => row.athleteId === "a-storico"));
});

test("un gruppo senza sedi copre tutte le sedi, come prima", () => {
  const [tutte] = getJerseyGroupSummaries({
    groups: [group("g-tutte", "Pulcini", [])],
    state: { assignments: [], jerseyAssignments: [] },
    athletes: ATHLETES,
    categories: CATEGORIES,
  });

  assert.equal(tutte.rows.length, 3);
});

test("lo stesso numero in due sedi non e un duplicato", () => {
  const [roma, aprilia] = getJerseyGroupSummaries({
    groups: [
      group("g-roma", "Pulcini · Roma", ["site-roma"]),
      group("g-aprilia", "Pulcini · Aprilia", ["site-aprilia"]),
    ],
    state: stateWithNumbers([
      ["a-roma", "g-roma", 10],
      ["a-aprilia", "g-aprilia", 10],
    ]),
    athletes: ATHLETES,
    categories: CATEGORIES,
  });

  assert.deepEqual(roma.duplicateNumbers, []);
  assert.deepEqual(aprilia.duplicateNumbers, []);
  assert.deepEqual(roma.usedNumbers, [10]);
  assert.deepEqual(aprilia.usedNumbers, [10]);
  assert.equal(roma.availableNumbers.includes(10), false);
  assert.equal(aprilia.availableNumbers.includes(10), false);
});

test("nella stessa sede il numero doppio resta un duplicato", () => {
  const athletes = [
    ...ATHLETES,
    athlete("a-roma-2", "Neri", "site-roma"),
  ];

  const [roma] = getJerseyGroupSummaries({
    groups: [group("g-roma", "Pulcini · Roma", ["site-roma"])],
    state: stateWithNumbers([
      ["a-roma", "g-roma", 10],
      ["a-roma-2", "g-roma", 10],
    ]),
    athletes,
    categories: CATEGORIES,
  });

  assert.deepEqual(
    roma.duplicateNumbers.map((entry) => entry.number),
    [10],
  );
});

test("l'atleta con numero ma fuori sede resta visibile: il suo numero e occupato", () => {
  const [roma] = getJerseyGroupSummaries({
    groups: [group("g-roma", "Pulcini · Roma", ["site-roma"])],
    state: stateWithNumbers([["a-aprilia", "g-roma", 7]]),
    athletes: ATHLETES,
    categories: CATEGORIES,
  });

  const row = roma.rows.find((entry) => entry.athleteId === "a-aprilia");

  assert.ok(row, "chi ha un numero nel gruppo resta in griglia");
  assert.equal(row.membership, "external");
  assert.equal(roma.availableNumbers.includes(7), false);
});

test("le righe restano ordinate per Cognome poi Nome anche con le sedi", () => {
  const [tutte] = getJerseyGroupSummaries({
    groups: [group("g-tutte", "Pulcini", [])],
    state: { assignments: [], jerseyAssignments: [] },
    athletes: ATHLETES,
    categories: CATEGORIES,
  });

  assert.deepEqual(
    tutte.rows.map((row) => row.athleteName),
    ["Bianchi Atleta", "Rossi Atleta", "Verdi Atleta"],
  );
});

test("le sedi del gruppo sopravvivono al giro di normalizzazione e serializzazione", () => {
  const normalized = normalizeNumberingGroup({
    id: "g-roma",
    name: "Pulcini · Roma",
    categoryIds: ["cat-pulcini"],
    site_ids: ["site-roma"],
    minNumber: 1,
    maxNumber: 99,
  });

  assert.deepEqual(normalized.siteIds, ["site-roma"]);
  assert.deepEqual(serializeNumberingGroup(normalized).siteIds, ["site-roma"]);
});

test("un gruppo storico senza sedi si normalizza a «tutte le sedi»", () => {
  const normalized = normalizeNumberingGroup({
    id: "g-legacy",
    name: "Prima squadra",
    categoryIds: ["cat-pulcini"],
  });

  assert.deepEqual(normalized.siteIds, []);
});
