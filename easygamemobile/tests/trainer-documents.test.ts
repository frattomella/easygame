import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeTrainerDocuments,
  normalizeTrainerDocumentType,
  resolveTrainerDocumentStatus,
  trainerDocumentTypeLabel,
} from "../client/lib/trainer-documents";

test("un documento senza file allegato è 'missing-file', anche con una scadenza futura", () => {
  const status = resolveTrainerDocumentStatus({
    expiryDate: "2099-01-01",
    fileUrl: "",
  });
  assert.equal(status, "missing-file");
});

test("un documento con file e senza scadenza è 'no-expiry'", () => {
  const status = resolveTrainerDocumentStatus({
    expiryDate: "",
    fileUrl: "attachment:abc-123",
  });
  assert.equal(status, "no-expiry");
});

test("scaduto, in scadenza, valido: i tre confini a 0 e 30 giorni", () => {
  const today = new Date("2026-06-15T12:00:00Z");

  assert.equal(
    resolveTrainerDocumentStatus(
      { expiryDate: "2026-06-14", fileUrl: "attachment:x" },
      today,
    ),
    "expired",
  );
  assert.equal(
    resolveTrainerDocumentStatus(
      { expiryDate: "2026-06-15", fileUrl: "attachment:x" },
      today,
    ),
    "expiring",
  );
  assert.equal(
    resolveTrainerDocumentStatus(
      { expiryDate: "2026-07-15", fileUrl: "attachment:x" },
      today,
    ),
    "expiring",
  );
  assert.equal(
    resolveTrainerDocumentStatus(
      { expiryDate: "2026-07-16", fileUrl: "attachment:x" },
      today,
    ),
    "valid",
  );
});

test("un data: URL storico conta come file presente", () => {
  const status = resolveTrainerDocumentStatus({
    expiryDate: "",
    fileUrl: "data:application/pdf;base64,AAAA",
  });
  assert.equal(status, "no-expiry");
});

test("il tipo si riconosce anche dalle forme storiche (contract, polizza, identita)", () => {
  assert.equal(normalizeTrainerDocumentType("contract"), "contratto");
  assert.equal(normalizeTrainerDocumentType("polizza"), "assicurazione");
  assert.equal(normalizeTrainerDocumentType("identita"), "documento-identita");
  assert.equal(normalizeTrainerDocumentType("qualcosa-di-mai-visto"), "altro");
  assert.equal(trainerDocumentTypeLabel("contract"), "Contratto");
});

test("normalizeTrainerDocuments ordina dal più recente e scarta le voci vuote", () => {
  const documents = normalizeTrainerDocuments([
    { id: "a", title: "Vecchio", uploadedAt: "2024-01-01" },
    { id: "b", title: "Nuovo", uploadedAt: "2026-01-01" },
    null,
    "non un documento",
  ]);

  assert.equal(documents.length, 2);
  assert.equal(documents[0].id, "b");
  assert.equal(documents[1].id, "a");
});

test("accetta anche la forma storica dei 'contratti' (title, fileName, uploadDate)", () => {
  const [document] = normalizeTrainerDocuments([
    {
      title: "Contratto 2026",
      fileName: "contratto.pdf",
      uploadDate: "2026-01-10",
      fileUrl: "attachment:xyz",
    },
  ]);

  assert.equal(document.title, "Contratto 2026");
  assert.equal(document.fileName, "contratto.pdf");
  assert.equal(document.uploadedAt, "2026-01-10");
});
