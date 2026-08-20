import assert from "node:assert/strict";
import test from "node:test";
import { classifyMembershipResponse } from "../../src/lib/auth/membership-load-result.ts";

test("una risposta valida vuota rappresenta un account senza accessi", () => {
  assert.deepEqual(
    classifyMembershipResponse({ data: [], error: null }),
    { kind: "success", memberships: [] },
  );
});

test("un errore API non viene trasformato in una lista vuota", () => {
  assert.deepEqual(
    classifyMembershipResponse({
      data: null,
      error: { status: 503, message: "Servizio non disponibile" },
    }),
    { kind: "error", message: "Servizio non disponibile" },
  );
});

test("401 e richieste annullate restano casi distinti", () => {
  assert.deepEqual(
    classifyMembershipResponse({
      data: null,
      error: { status: 401, message: "Sessione non valida" },
    }),
    { kind: "unauthorized" },
  );
  assert.deepEqual(
    classifyMembershipResponse({
      data: null,
      error: { code: "REQUEST_ABORTED", message: "Richiesta annullata" },
    }),
    { kind: "aborted" },
  );
});
