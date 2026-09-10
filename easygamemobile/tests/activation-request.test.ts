import { test } from "node:test";
import assert from "node:assert/strict";

import { buildActivationRequest } from "../client/lib/activation-request";

test("un club di proprietà si attiva per identità del club, senza ruolo ne tessera", () => {
  const request = buildActivationRequest("owner", null, "owned");
  assert.deepEqual(request, {
    role: undefined,
    membershipId: undefined,
    accessKind: "ownership",
  });
});

test("un accesso assegnato porta il ruolo e, se noto, l'id preciso della tessera", () => {
  const request = buildActivationRequest(
    "trainer",
    "membership_42",
    "assigned",
  );
  assert.deepEqual(request, {
    role: "trainer",
    membershipId: "membership_42",
    accessKind: "membership",
  });
});

test("un accesso assegnato senza id di tessera invia comunque il ruolo", () => {
  // La stessa persona puo avere piu ruoli sullo stesso club (ADR-0102): senza
  // l'id preciso, il ruolo resta l'unico modo di scegliere la tessera giusta.
  const request = buildActivationRequest("parent", null, "assigned");
  assert.deepEqual(request, {
    role: "parent",
    membershipId: undefined,
    accessKind: "membership",
  });
});

test("un gettone di ruolo personalizzato passa cosi com'è: il server lo rinormalizza", () => {
  const request = buildActivationRequest(
    "custom:trainer:preparatore#events.manage",
    "membership_7",
    "assigned",
  );
  assert.equal(request.role, "custom:trainer:preparatore#events.manage");
  assert.equal(request.membershipId, "membership_7");
  assert.equal(request.accessKind, "membership");
});
