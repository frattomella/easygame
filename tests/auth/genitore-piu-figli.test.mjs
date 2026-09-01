import assert from "node:assert/strict";
import test from "node:test";

import {
  canAccessPath,
  collectLinkedAthleteIds,
  getAccessRedirectPath,
} from "../../src/lib/access-roles.ts";

/**
 * **D-3 — un genitore con piu figli non raggiungeva il secondo.**
 *
 * La guardia d'area ammetteva **un solo** percorso, `/parent-view/<primo>`,
 * perche `linkedAthleteId` era un valore singolo e chi lo calcolava faceva un
 * `athletes.find(...)`. La home genitore disegnava correttamente il bottone di
 * ogni figlio; il clic sul secondo finiva contro la guardia e rimbalzava sul
 * primo.
 *
 * Due scenari del collaudo — «piu figli per Parent» e «Parent con figli in
 * categorie differenti» — non erano eseguibili affatto.
 */

const PRIMO = "atleta-uno";
const SECONDO = "atleta-due";
const ALTRUI = "atleta-di-un-altra-famiglia";

test("il genitore raggiunge ognuno dei propri figli, non solo il primo", () => {
  const contesto = { linkedAthleteIds: [PRIMO, SECONDO] };

  assert.equal(canAccessPath("parent", `/parent-view/${PRIMO}`, contesto), true);
  assert.equal(
    canAccessPath("parent", `/parent-view/${SECONDO}`, contesto),
    true,
    "il secondo figlio e raggiungibile quanto il primo",
  );
  assert.equal(
    canAccessPath("parent", `/parent-view/${PRIMO}/payments`, contesto),
    true,
    "le sottopagine seguono il figlio",
  );
});

test("il genitore non raggiunge il figlio di un'altra famiglia", () => {
  assert.equal(
    canAccessPath("parent", `/parent-view/${ALTRUI}`, {
      linkedAthleteIds: [PRIMO, SECONDO],
    }),
    false,
  );
  assert.equal(
    canAccessPath("parent", `/parent-view/${ALTRUI}`, { linkedAthleteIds: [] }),
    false,
    "senza legame non si entra nell'area famiglia",
  );
});

test("il figlio in un'altra societa resta un figlio", () => {
  /*
    Il selettore della home mostra i figli di **tutte** le societa. La guardia
    risponde alla domanda «e uno dei miei», che riguarda la persona: il confine
    vero lo rifa il server a ogni lettura.
  */
  assert.equal(
    canAccessPath("parent", `/parent-view/${SECONDO}`, {
      linkedAthleteIds: [PRIMO, SECONDO],
    }),
    true,
  );
});

test("la forma singolare continua a valere per le sessioni gia aperte", () => {
  assert.equal(
    canAccessPath("parent", `/parent-view/${PRIMO}`, {
      linkedAthleteId: PRIMO,
    }),
    true,
  );
  assert.deepEqual(
    collectLinkedAthleteIds({
      linkedAthleteId: PRIMO,
      linkedAthleteIds: [SECONDO, PRIMO, "", null],
    }),
    [SECONDO, PRIMO],
    "le due grafie confluiscono, senza duplicati e senza vuoti",
  );
});

test("l'atleta apre la propria scheda e non quella dei fratelli", () => {
  assert.equal(
    canAccessPath("athlete", `/athletes/${PRIMO}/profile`, {
      linkedAthleteIds: [PRIMO],
    }),
    true,
  );
  assert.equal(
    canAccessPath("athlete", `/athletes/${SECONDO}/profile`, {
      linkedAthleteIds: [PRIMO],
    }),
    false,
  );
});

test("con piu figli l atterraggio chiede di scegliere, con uno solo entra", () => {
  /*
    W6-12. **Questo test descriveva il difetto, non la regola.**

    «Un percorso solo» significava atterrare sul **primo** figlio senza aver
    chiesto niente, e per cambiarlo bisognava sapere che esistevano due
    pastiglie sulla Home e due pulsanti sul Calendario: le altre undici pagine
    dell area famiglia non avevano nessun selettore. Un genitore con due figli
    apriva «Pagamenti» e leggeva degli importi senza aver mai scelto di chi.

    Con un figlio solo la scelta non esiste e non si chiede: sarebbe un clic in
    piu tutti i giorni.
  */
  assert.equal(
    getAccessRedirectPath("parent", {
      organizationId: "club-a",
      linkedAthleteIds: [SECONDO, PRIMO],
    }),
    "/parent-view",
  );
  assert.equal(
    getAccessRedirectPath("parent", {
      organizationId: "club-a",
      linkedAthleteIds: [SECONDO],
    }),
    `/parent-view/${SECONDO}`,
    "con un figlio solo non c e niente da scegliere",
  );
  assert.equal(
    getAccessRedirectPath("parent", { organizationId: "club-a" }),
    "/account",
    "senza figli risolti non si atterra in un'area vuota",
  );
});
