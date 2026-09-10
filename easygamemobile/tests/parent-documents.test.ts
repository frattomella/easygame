import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DOCUMENT_STATE_TINT,
  DOCUMENT_STATE_VARIANT,
  resolveDocumentDensity,
  resolveDocumentIcon,
} from "../client/lib/parent-documents";
import type { FamilyDocumentItem } from "../client/services/api";

test("ogni stato del server ha un tint e una variante StatusPill definiti", () => {
  const states: FamilyDocumentItem["state"][] = [
    "missing",
    "overdue",
    "under_review",
    "approved",
    "expired",
    "rejected",
  ];
  for (const state of states) {
    assert.ok(DOCUMENT_STATE_TINT[state]);
    assert.ok(DOCUMENT_STATE_VARIANT[state]);
  }
});

test("gli stati problematici usano la variante destructive", () => {
  assert.equal(DOCUMENT_STATE_VARIANT.overdue, "destructive");
  assert.equal(DOCUMENT_STATE_VARIANT.expired, "destructive");
  assert.equal(DOCUMENT_STATE_VARIANT.rejected, "destructive");
});

test("icona per tipo documento: certificato medico e tessera sanitaria -> medkit", () => {
  assert.equal(resolveDocumentIcon("medical_certificate"), "medkit-outline");
  assert.equal(resolveDocumentIcon("health_card"), "medkit-outline");
});

test("icona per tipo documento: documento d'identita -> card", () => {
  assert.equal(resolveDocumentIcon("identity_document"), "card-outline");
});

test("icona per tipo documento sconosciuto -> icona neutra, mai un errore", () => {
  assert.equal(
    resolveDocumentIcon("qualcosa-di-nuovo"),
    "document-text-outline",
  );
});

test("densita: un documento richiesto con una nota diventa una scheda", () => {
  assert.equal(
    resolveDocumentDensity({
      required: true,
      description: "Serve entro il 30 settembre",
    }),
    "card",
  );
});

test("densita: senza nota di requisito resta una riga, anche se richiesto", () => {
  assert.equal(
    resolveDocumentDensity({ required: true, description: "" }),
    "row",
  );
});

test("densita: un documento non richiesto resta sempre una riga", () => {
  assert.equal(
    resolveDocumentDensity({ required: false, description: "Nota" }),
    "row",
  );
});
