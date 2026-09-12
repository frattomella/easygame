import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * **Un ruolo personalizzato puo generare gli allenamenti, se la casella e
 * spuntata** (WP-19).
 *
 * Prima, `canManageClubConfigurationAsActor` rifiutava **ogni** ruolo
 * personalizzato a prescindere dalle caselle: un club che avesse costruito
 * «Segreteria allenamenti» a partire dal gestore non poteva generare, e
 * nessuna casella dell'editor poteva rimediare perche la chiave non
 * esisteva. Stessa forma di difetto gia chiusa su `funding.manage`
 * (`tests/server/annullamento-voucher.test.mjs`).
 */

let hasTrainingAutomationPermission;
let canManageTrainingAutomationAsActor;
let encodeCustomRoleToken;

before(async () => {
  ({
    hasTrainingAutomationPermission,
    canManageTrainingAutomationAsActor,
  } = await import("../../src/lib/training-automation-permissions.ts"));
  ({ encodeCustomRoleToken } = await import("../../src/lib/access-roles.ts"));
});

test("WP-19 · i ruoli canonici: solo owner e club_manager generano", () => {
  assert.equal(canManageTrainingAutomationAsActor("owner"), true);
  assert.equal(canManageTrainingAutomationAsActor("club_manager"), true);
  assert.equal(canManageTrainingAutomationAsActor("collaborator"), false);
  assert.equal(canManageTrainingAutomationAsActor("staff"), false);
  assert.equal(canManageTrainingAutomationAsActor("trainer"), false);
  assert.equal(canManageTrainingAutomationAsActor("parent"), false);
  assert.equal(canManageTrainingAutomationAsActor("athlete"), false);
});

test("WP-19 · un ruolo personalizzato senza la chiave non genera", () => {
  const senzaChiave = encodeCustomRoleToken("custom:club_manager:segreteria", [
    "events.read",
  ]);

  assert.equal(canManageTrainingAutomationAsActor(senzaChiave), false);
});

test("WP-19 · un ruolo personalizzato con la chiave genera", () => {
  const conChiave = encodeCustomRoleToken(
    "custom:club_manager:segreteria-allenamenti",
    ["events.read", "training_automation.manage"],
  );

  assert.equal(canManageTrainingAutomationAsActor(conChiave), true);
});

test("WP-19 · un allenatore non riceve la capacita solo perche gestisce le presenze", () => {
  // Un ruolo personalizzato basato su trainer non puo generare, anche
  // forzando la chiave: la base non ha canManageClubConfiguration, e
  // narrowDomainPermission rifiuta prima di guardare le caselle.
  const trainerConChiaveForzata = encodeCustomRoleToken(
    "custom:trainer:allenatore-capo",
    ["events.manage", "training_automation.manage"],
  );

  assert.equal(
    canManageTrainingAutomationAsActor(trainerConChiaveForzata),
    false,
  );
});

test("WP-19 · hasTrainingAutomationPermission e la stessa funzione dietro il nome comodo", () => {
  const conChiave = encodeCustomRoleToken("custom:owner:direzione", [
    "training_automation.manage",
  ]);

  assert.equal(
    hasTrainingAutomationPermission(conChiave, "training_automation.manage"),
    canManageTrainingAutomationAsActor(conChiave),
  );
});
