import assert from "node:assert/strict";
import test from "node:test";
import { agree, allOf, noneOf, nounGender, theOnlyOne } from "../../src/lib/web/nouns.ts";

/**
 * Le frasi che la griglia costruisce intorno al nome della cosa devono
 * accordarsi: «Nessun modello» e non «Nessuna modello».
 */

test("il genere si ricava dalla desinenza e si puo dichiarare", () => {
  assert.equal(nounGender({ singular: "modello", plural: "modelli" }), "m");
  assert.equal(nounGender({ singular: "riga", plural: "righe" }), "f");
  assert.equal(nounGender({ singular: "operazione", plural: "operazioni" }), "f");
  assert.equal(nounGender({ singular: "voce", plural: "voci" }), "f");
  assert.equal(nounGender({ singular: "provider", plural: "provider" }), "m");
  assert.equal(nounGender({ singular: "membro dello staff", plural: "membri dello staff" }), "m");
  assert.equal(nounGender({ singular: "atleta", plural: "atleti", gender: "m" }), "m");
});

test("«nessuno» segue le regole dell'articolo", () => {
  assert.equal(noneOf({ singular: "modello", plural: "modelli" }), "Nessun modello");
  assert.equal(noneOf({ singular: "sconto", plural: "sconti" }), "Nessuno sconto");
  assert.equal(noneOf({ singular: "riga", plural: "righe" }), "Nessuna riga");
  assert.equal(noneOf({ singular: "operazione", plural: "operazioni" }), "Nessun'operazione");
  assert.equal(noneOf({ singular: "atleta", plural: "atleti", gender: "m" }), "Nessun atleta");
});

test("le altre frasi si accordano", () => {
  assert.equal(theOnlyOne({ singular: "avviso", plural: "avvisi" }), "l'unico avviso");
  assert.equal(theOnlyOne({ singular: "nota", plural: "note" }), "l'unica nota");
  assert.equal(allOf({ singular: "avviso", plural: "avvisi" }, "12"), "tutti i 12");
  assert.equal(allOf({ singular: "nota", plural: "note" }, "12"), "tutte le 12");
  assert.equal(agree({ singular: "avviso", plural: "avvisi" }, 3, "filtrat"), "filtrati");
  assert.equal(agree({ singular: "nota", plural: "note" }, 1, "filtrat"), "filtrata");
});
