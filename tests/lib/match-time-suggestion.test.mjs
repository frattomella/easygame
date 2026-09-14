import assert from "node:assert/strict";
import test from "node:test";

import {
  DURATA_GARA_SUGGERITA_MINUTI,
  sommaMinuti,
  suggerisciIntervalloGara,
} from "../../src/lib/matches/match-time-suggestion.ts";

/**
 * **La fine indicativa di una gara, quando l'utente scrive solo l'inizio**
 * (bug UAT "giovedi 17 alle 19:00 il campo non e disponibile").
 *
 * Senza un orario di fine, il dominio indovina una sessione a cavallo
 * della notte che spesso supera la chiusura reale del campo — una gara
 * delle 19:00 su un campo aperto fino alle 23:00 veniva rifiutata come «non
 * disponibile» anche se 19:00 e chiaramente dentro l'orario. Questi test
 * difendono la proposta client-side (+90 minuti, modificabile) che tiene
 * `time` sempre un intervallo esplicito prima che la richiesta parta — il
 * test end-to-end che l'intervallo cosi prodotto viene accettato e
 * persistito e in `tests/server/gara-conflitto-disponibilita.test.mjs`.
 */

test("DURATA_GARA_SUGGERITA_MINUTI e un default UX (90), non una costante nascosta altrove", () => {
  assert.equal(DURATA_GARA_SUGGERITA_MINUTI, 90);
});

test("sommaMinuti aggiunge minuti dentro lo stesso giorno", () => {
  assert.equal(sommaMinuti("19:00", 90), "20:30");
  assert.equal(sommaMinuti("08:00", 60), "09:00");
  assert.equal(sommaMinuti("13:05", 25), "13:30");
});

test("sommaMinuti avvolge oltre la mezzanotte", () => {
  assert.equal(sommaMinuti("23:00", 90), "00:30");
  assert.equal(sommaMinuti("23:59", 1), "00:00");
});

test("suggerisciIntervalloGara completa un solo orario di inizio", () => {
  assert.equal(suggerisciIntervalloGara("19:00"), "19:00 - 20:30");
  assert.equal(suggerisciIntervalloGara(" 8:30 "), "8:30 - 10:00");
});

test("suggerisciIntervalloGara non tocca un intervallo gia scritto", () => {
  assert.equal(suggerisciIntervalloGara("19:00 - 21:00"), "19:00 - 21:00");
  assert.equal(suggerisciIntervalloGara("19:00-21:00"), "19:00-21:00");
});

test("suggerisciIntervalloGara non tocca un valore vuoto o non riconoscibile", () => {
  assert.equal(suggerisciIntervalloGara(""), "");
  assert.equal(suggerisciIntervalloGara("   "), "   ");
  assert.equal(suggerisciIntervalloGara("sera"), "sera");
  // Un dato ancora a meta (l'utente sta scrivendo l'ora) non si completa a caso.
  assert.equal(suggerisciIntervalloGara("19"), "19");
  assert.equal(suggerisciIntervalloGara("19:"), "19:");
});
