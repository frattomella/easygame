import { test } from "node:test";
import assert from "node:assert/strict";

import {
  classifyFetchError,
  fetchErrorMessage,
} from "../client/lib/fetch-error";

test('un diniego di dominio ("Accesso negato") si classifica forbidden, non errore generico', () => {
  assert.equal(
    classifyFetchError(
      new Error("Accesso negato: questo atleta è fuori dal perimetro"),
    ),
    "forbidden",
  );
});

test("un problema di connessione si classifica network", () => {
  assert.equal(
    classifyFetchError(new Error("Errore di connessione: fetch failed")),
    "network",
  );
  assert.equal(
    classifyFetchError(new Error("Timeout backend EasyGame")),
    "network",
  );
});

test("un errore applicativo qualunque resta 'error', mai piegato in una lista vuota", () => {
  assert.equal(
    classifyFetchError(new Error("Errore lettura appuntamento")),
    "error",
  );
  assert.equal(classifyFetchError("stringa qualunque"), "error");
  assert.equal(classifyFetchError(null), "error");
});

test("fetchErrorMessage usa il messaggio del server quando c'è, altrimenti il fallback", () => {
  assert.equal(
    fetchErrorMessage(new Error("Accesso negato"), "fallback"),
    "Accesso negato",
  );
  assert.equal(fetchErrorMessage("non un errore", "fallback"), "fallback");
  assert.equal(fetchErrorMessage(new Error(""), "fallback"), "fallback");
});
