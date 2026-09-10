import { test } from "node:test";
import assert from "node:assert/strict";

import {
  canApplyConsentDecision,
  resolveConsentActions,
} from "../client/lib/parent-consents";

test("missing: puo accettare o rifiutare, mai revocare", () => {
  assert.equal(canApplyConsentDecision("missing", "accepted"), true);
  assert.equal(canApplyConsentDecision("missing", "rejected"), true);
  assert.equal(canApplyConsentDecision("missing", "revoked"), false);
});

test("accepted: puo solo confermare di nuovo o revocare", () => {
  assert.equal(canApplyConsentDecision("accepted", "accepted"), true);
  assert.equal(canApplyConsentDecision("accepted", "revoked"), true);
  assert.equal(canApplyConsentDecision("accepted", "rejected"), false);
});

test("revoked: si puo sempre ri-accettare, mai ri-revocare o rifiutare", () => {
  assert.equal(canApplyConsentDecision("revoked", "accepted"), true);
  assert.equal(canApplyConsentDecision("revoked", "revoked"), false);
  assert.equal(canApplyConsentDecision("revoked", "rejected"), false);
});

test("rejected: puo accettare o restare rifiutato, mai revocare cio che non ha mai accettato", () => {
  assert.equal(canApplyConsentDecision("rejected", "accepted"), true);
  assert.equal(canApplyConsentDecision("rejected", "rejected"), true);
  assert.equal(canApplyConsentDecision("rejected", "revoked"), false);
});

test("azioni della riga: 'Accetto' e 'Revoca' seguono esattamente la matrice", () => {
  assert.deepEqual(resolveConsentActions("missing"), {
    canAccept: true,
    canRevoke: false,
  });
  assert.deepEqual(resolveConsentActions("accepted"), {
    canAccept: true,
    canRevoke: true,
  });
  assert.deepEqual(resolveConsentActions("revoked"), {
    canAccept: true,
    canRevoke: false,
  });
});
