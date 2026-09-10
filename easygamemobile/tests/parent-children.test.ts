import { test } from "node:test";
import assert from "node:assert/strict";

import {
  groupChildrenByClub,
  isCrossClubSwitch,
  resolveChildAccentIndex,
  resolveSelectedChildId,
  sortParentChildren,
} from "../client/lib/parent-children";
import type { ParentChild } from "../client/services/api";

const child = (
  id: string,
  name: string,
  clubId: string,
  clubName: string,
): ParentChild => ({
  id,
  name,
  clubId,
  clubName,
  clubLogoUrl: null,
  categoryName: null,
  categories: [],
  birthYear: null,
  status: null,
  avatarUrl: null,
});

test("nessun figlio: nessuna selezione, nessun errore", () => {
  assert.equal(resolveSelectedChildId([], null), null);
  assert.equal(resolveSelectedChildId([], "qualsiasi"), null);
});

test("un solo figlio: si seleziona sempre da solo, anche senza scelta salvata", () => {
  const marco = child("a1", "Marco", "c1", "ASD Uno");
  assert.equal(resolveSelectedChildId([marco], null), "a1");
  assert.equal(resolveSelectedChildId([marco], "id-inesistente"), "a1");
});

test("piu figli: una scelta salvata ancora valida vince", () => {
  const children = [
    child("a1", "Marco", "c1", "ASD Uno"),
    child("a2", "Giulia", "c1", "ASD Uno"),
  ];
  assert.equal(resolveSelectedChildId(children, "a2"), "a2");
});

test("piu figli senza scelta valida: ricade sul primo in ordine stabile, mai su nessuno", () => {
  const children = [
    child("a2", "Giulia", "c1", "ASD Uno"),
    child("a1", "Marco", "c1", "ASD Uno"),
  ];
  // Nessuna scelta salvata
  assert.equal(resolveSelectedChildId(children, null), "a2"); // Giulia < Marco alfabeticamente
  // Scelta salvata per un figlio scollegato (revocato, non piu tra i linkedAthletes)
  assert.equal(resolveSelectedChildId(children, "id-scollegato"), "a2");
});

test("figli su club diversi: l'ordinamento e stabile per nome poi club", () => {
  const children = [
    child("a1", "Marco", "c2", "ASD Due"),
    child("a2", "Marco", "c1", "ASD Uno"),
  ];
  const sorted = sortParentChildren(children);
  assert.deepEqual(
    sorted.map((c) => c.id),
    ["a1", "a2"],
  );
});

test("cambio figlio: raggruppamento per club preserva l'ordine stabile", () => {
  const children = [
    child("a1", "Marco", "c2", "ASD Due"),
    child("a2", "Giulia", "c1", "ASD Uno"),
    child("a3", "Anna", "c1", "ASD Uno"),
  ];
  const groups = groupChildrenByClub(children);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].clubId, "c1");
  assert.deepEqual(
    groups[0].children.map((c) => c.id),
    ["a3", "a2"],
  );
  assert.equal(groups[1].clubId, "c2");
});

test("cambio figlio tra club diversi viene riconosciuto come cross-club", () => {
  const children = [
    child("a1", "Marco", "c1", "ASD Uno"),
    child("a2", "Giulia", "c2", "ASD Due"),
  ];
  assert.equal(isCrossClubSwitch(children, "a1", "a2"), true);
  assert.equal(isCrossClubSwitch(children, "a1", "a1"), false);
  assert.equal(isCrossClubSwitch(children, null, "a2"), false);
});

test("l'accento di un figlio e stabile e ciclico su 4 valori", () => {
  const children = [
    child("a1", "Anna", "c1", "ASD Uno"),
    child("a2", "Bruno", "c1", "ASD Uno"),
    child("a3", "Carlo", "c1", "ASD Uno"),
    child("a4", "Dario", "c1", "ASD Uno"),
    child("a5", "Elena", "c1", "ASD Uno"),
  ];
  assert.equal(resolveChildAccentIndex(children, "a1"), 0);
  assert.equal(resolveChildAccentIndex(children, "a4"), 3);
  assert.equal(resolveChildAccentIndex(children, "a5"), 0); // ciclo su 4 accenti
  assert.equal(resolveChildAccentIndex(children, "id-inesistente"), 0);
});
