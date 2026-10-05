import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * **Il pannello del risultato di una gara, la parte pura.**
 *
 * Collaudo a browser del 2026-10-05: le convocazioni si aprono solo per una
 * gara in programma, e le statistiche si proponevano solo per i convocati.
 * Una gara registrata dopo, senza convocazioni, non poteva avere statistiche.
 * Ora si propone la rosa della categoria: serve sapere le categorie di un
 * atleta nelle forme che l'elenco porta.
 */

let model;

before(async () => {
  model = await import("../../src/components/matches/v2/match-result-model.ts");
});

test("le categorie di un atleta: primaria, secondarie e appartenenze, senza doppioni", () => {
  assert.deepEqual(model.athleteCategoryIds({ category_id: "c1" }), ["c1"]);
  assert.deepEqual(
    model.athleteCategoryIds({ category_id: "c1", categoryIds: ["c1", "c2"], category_memberships: [{ category_id: "c3" }, { categoryId: "c2" }] }).sort(),
    ["c1", "c2", "c3"],
  );
  assert.deepEqual(model.athleteCategoryIds({}), []);
  assert.deepEqual(model.athleteCategoryIds(null), []);
});

test("il risultato appena salvato vale sulla riga della gara fino al ricarico", () => {
  const match = { id: "m1", eventId: "e1", homeScore: null, awayScore: null };
  const applied = model.applyResultSnapshot(match, { e1: { homeScore: 70, awayScore: 78, resultStatus: "final", status: "completed" } });
  assert.equal(applied.homeScore, 70);
  assert.equal(applied.awayScore, 78);
  assert.equal(model.applyResultSnapshot(match, {}), match);
});
