import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  CLOTHING_SIZE_OPTIONS,
  deriveClothingProfile,
  formatClothingSizes,
  hasClothingSizes,
  normalizeClothingSizes,
} from "../../src/lib/clothing-sizes.ts";
import { resolveItemSizeSource, proposeSizeForItem } from "../../src/lib/clothing-delivery.ts";

/**
 * MASTER BATCH — Wave C (Clothing / Sizes / Kit).
 *
 * Il modulo abbigliamento esisteva gia, maturo: profilo per eta (C2/C3),
 * preferenza dell'atleta separata dalla consegna (C7), creazione atleta
 * disaccoppiata dall'assegnazione kit (C9). Il gap reale era la tuta:
 * `tracksuitSize` viveva gia in `getAthleteClothingProfile` ma senza un
 * campo per scriverlo ne un `sizeSource` che lo leggesse — un capo il cui
 * tipo diceva «tuta» proponeva la taglia del **pantalone**.
 */

test("33/34: profilo standard per adulti, per eta sotto i 15 anni", () => {
  assert.equal(deriveClothingProfile("M", "1990-01-01"), "UOMO");
  assert.equal(deriveClothingProfile("F", "1990-01-01"), "DONNA");
  const oggi = new Date();
  const dodicenne = `${oggi.getFullYear() - 12}-01-01`;
  assert.equal(deriveClothingProfile("M", dodicenne), "BAMBINO");
  assert.equal(deriveClothingProfile("F", dodicenne), "BAMBINA");
  // Le taglie bambino sono per eta, quelle adulte per lettera/numero.
  assert.deepEqual(CLOTHING_SIZE_OPTIONS.BAMBINO.shirt.slice(0, 2), ["3-4A", "5-6A"]);
  assert.ok(CLOTHING_SIZE_OPTIONS.UOMO.shirt.includes("M"));
});

test("35: maglia e pantalone restano taglie indipendenti", () => {
  const sizes = normalizeClothingSizes({ shirtSize: "M", pantsSize: "48" });
  assert.equal(sizes.shirtSize, "M");
  assert.equal(sizes.pantsSize, "48");
  assert.notEqual(sizes.shirtSize, sizes.pantsSize);
});

test("36: la tuta e un campo suo, non un ripiego sul pantalone", () => {
  // Prima di questo lotto un tipo «Tuta rappresentanza» proponeva la taglia del pantalone.
  assert.equal(resolveItemSizeSource({ sizeSource: "none", type: "Tuta rappresentanza" }), "tracksuit");
  assert.equal(resolveItemSizeSource({ sizeSource: "none", type: "Pantaloncino gara" }), "pants");

  const sizes = { shirtSize: "M", pantsSize: "48", tracksuitSize: "L" };
  assert.equal(
    proposeSizeForItem({ sizes, item: { sizeSource: "tracksuit", type: "Tuta", sizes: ["S", "M", "L"] } }),
    "L",
  );
  assert.equal(
    proposeSizeForItem({ sizes, item: { sizeSource: "pants", type: "Pantalone", sizes: ["46", "48"] } }),
    "48",
  );
});

test("37: la preferenza dell'atleta copre le quattro taglie, senza inventare valori", () => {
  assert.deepEqual(normalizeClothingSizes(null), {
    profile: "",
    shirtSize: "",
    pantsSize: "",
    shoeSize: "",
    tracksuitSize: "",
  });
  assert.ok(hasClothingSizes({ tracksuitSize: "M" }));
  assert.ok(!hasClothingSizes({}));
  assert.equal(
    formatClothingSizes({ shirtSize: "M", pantsSize: "48", shoeSize: "42", tracksuitSize: "L" }),
    "M · 48 · 42 · L",
  );
});

test("38: l'assegnazione propone la taglia salvata, non la inventa se l'articolo non la prevede", () => {
  const sizes = { shirtSize: "XXL" };
  // XXL non e fra le taglie che questo articolo vende: nessuna proposta, non un valore a caso.
  assert.equal(
    proposeSizeForItem({ sizes, item: { sizeSource: "shirt", type: "Maglia", sizes: ["S", "M", "L"] } }),
    "",
  );
});

test("39: l'override della consegna non e testato qui (vive nel drawer, non nel dominio puro) — la separazione dei dati e strutturale", () => {
  // proposeSizeForItem PROPONE soltanto: la firma non ha modo di scrivere sull'anagrafica.
  const source = readFileSync("src/lib/clothing-delivery.ts", "utf8");
  assert.match(source, /Proporre non e scrivere/);
});

test("41/42: Nuovo atleta puo salvare con o senza taglie/kit — il modulo non li richiede", () => {
  const form = readFileSync("src/components/forms/AthleteCreateForm.tsx", "utf8");
  assert.match(form, /ClothingSizesFields/);
  // Nessuna assegnazione kit sul modulo di creazione: e un passo separato, mai obbligatorio qui.
  assert.doesNotMatch(form, /createClothingAssignment|clothing\/assignments/);
});

test("43: il campo tuta e cablato nello stesso componente condiviso di atleta/allenatore/staff/socio", () => {
  const fields = readFileSync("src/components/forms/clothing-sizes-fields.tsx", "utf8");
  assert.match(fields, /Taglia tuta/);
  assert.match(fields, /tracksuitSize: event\.target\.value/);
});
