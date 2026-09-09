import assert from "node:assert/strict";
import test from "node:test";

import {
  applyRegistrationEdit,
  buildRegistrationId,
  findRegistrationIndex,
} from "../../src/lib/athletes/registration-edits.ts";

/**
 * **H3 e L2 — due difetti che vivevano dentro una pagina da settemila righe.**
 *
 * Nessuna prova li vedeva perche non c'era niente da eseguire: erano
 * espressioni in mezzo a un gestore. Estrarli non e stato un abbellimento —
 * e cio che li ha resi misurabili.
 */

test("H3 · due righe senza identificativo non sono la stessa riga", () => {
  /*
    `String(undefined) === "undefined"`: con due tesseramenti storici privi di
    `id` — quelli scritti prima che l'id esistesse — il confronto per
    identificativo cadeva sempre sul primo, e la sostituzione li riscriveva
    **tutti e due** con lo stesso oggetto. Un tesseramento spariva.
  */
  const fip = { federation: "FIP", number: "1" };
  const fipav = { federation: "FIPAV", number: "2" };
  const righe = [fip, fipav];

  assert.equal(findRegistrationIndex(righe, fip), 0);
  assert.equal(
    findRegistrationIndex(righe, fipav),
    1,
    "la seconda non deve risolvere sulla prima",
  );
});

test("H3 · correggere la seconda non tocca la prima", () => {
  const fip = { federation: "FIP", number: "1" };
  const fipav = { federation: "FIPAV", number: "2" };
  const righe = [fip, fipav];

  const corretta = { federation: "FIPAV", number: "2-bis" };
  const dopo = applyRegistrationEdit(
    righe,
    findRegistrationIndex(righe, fipav),
    corretta,
  );

  assert.equal(dopo.length, 2);
  assert.equal(dopo[0].federation, "FIP", "la prima resta com'era");
  assert.equal(dopo[1].number, "2-bis");
});

test("H3 · con gli identificativi si riconosce per identificativo", () => {
  const righe = [
    { id: "reg-1", federation: "FIP" },
    { id: "reg-2", federation: "FIPAV" },
  ];

  assert.equal(findRegistrationIndex(righe, { id: "reg-2" }), 1);
});

test("H3 · una riga che non c'e non ne corregge un'altra", () => {
  const righe = [{ id: "reg-1" }];

  assert.equal(findRegistrationIndex(righe, { id: "reg-9" }), -1);
  assert.equal(findRegistrationIndex(righe, null), -1);
});

test("in aggiunta si accoda, e non si perde niente", () => {
  const righe = [{ id: "reg-1" }];
  const dopo = applyRegistrationEdit(righe, -1, { id: "reg-2" });

  assert.equal(dopo.length, 2);
  assert.equal(dopo[0].id, "reg-1");
});

test("L2 · due identificativi generati insieme non si scontrano", () => {
  /*
    `Date.now()` da solo si scontra fra due righe aggiunte nello stesso
    millisecondo, e l'identificativo e cio su cui la modifica e la
    cancellazione lavorano: due tesseramenti con lo stesso id sono due righe
    che si correggono a vicenda.
  */
  const identificativi = new Set(
    Array.from({ length: 500 }, () => buildRegistrationId()),
  );

  assert.equal(identificativi.size, 500);
});
