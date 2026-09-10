import { test } from "node:test";
import assert from "node:assert/strict";

import { getAthletePositionCaption } from "../client/lib/mobile-ui";

test("le quattro sigle di ruolo riconosciute, a prescindere dal maiuscolo/minuscolo", () => {
  assert.equal(getAthletePositionCaption("Portiere"), "POR");
  assert.equal(getAthletePositionCaption("difensore centrale"), "DIF");
  assert.equal(getAthletePositionCaption("Centrocampista"), "CEN");
  assert.equal(getAthletePositionCaption("ATTACCANTE"), "ATT");
});

test("mediano ricade su centrocampo, come da vocabolario del club", () => {
  assert.equal(getAthletePositionCaption("Mediano"), "CEN");
});

test("un ruolo libero non riconosciuto usa le sue prime tre lettere, mai un placeholder fisso", () => {
  assert.equal(getAthletePositionCaption("Libero"), "LIB");
});

test("vuoto o assente non genera una sigla — la didascalia resta nascosta a monte", () => {
  assert.equal(getAthletePositionCaption(""), "");
  assert.equal(getAthletePositionCaption(undefined), "");
  assert.equal(getAthletePositionCaption(null), "");
});
