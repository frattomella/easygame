import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  TRAINER_DOCUMENT_TYPES,
  getTrainerDocumentsFromRecord,
  normalizeTrainerDocument,
  normalizeTrainerDocumentType,
  normalizeTrainerDocuments,
  removeTrainerDocument,
  resolveTrainerDocumentStatus,
  trainerDocumentDownloadName,
  upsertTrainerDocument,
} from "../../src/lib/trainer-documents.ts";
import { buildAttachmentFileName } from "../../src/lib/attachment-names.ts";

/**
 * RC Fix 1, punti 6, 7 e 9 — i documenti dell'allenatore.
 *
 * Quello che si verifica qui non e «la funzione calcola bene»: e che i tre
 * percorsi che prima andavano in tre posti diversi ora ne usino **uno**, e
 * che i documenti gia registrati con il vecchio nome non spariscano.
 */

const reference = "attachment:11111111-2222-4333-8444-555555555555";
const today = new Date("2026-08-27T10:00:00Z");

test("un documento salvato con la forma vecchia continua a leggersi", () => {
  const document = normalizeTrainerDocument({
    id: "contract-1",
    title: "Contratto 2026",
    fileName: "contratto.pdf",
    fileUrl: reference,
    uploadDate: "2026-03-02",
    expiryDate: "2027-06-30",
  });

  assert.equal(document.type, "contratto");
  assert.equal(document.typeLabel, "Contratto");
  assert.equal(document.title, "Contratto 2026");
  assert.equal(document.uploadedAt, "2026-03-02");
  assert.equal(document.expiryDate, "2027-06-30");
  assert.equal(document.fileUrl, reference);
});

test("i documenti si leggono da `documents` e, se manca, da `contracts`", () => {
  const fromNew = getTrainerDocumentsFromRecord({
    documents: [{ id: "a", title: "Nuovo", fileUrl: reference }],
    contracts: [{ id: "b", title: "Vecchio", fileUrl: reference }],
  });
  assert.deepEqual(
    fromNew.map((document) => document.id),
    ["a"],
  );

  const fromLegacy = getTrainerDocumentsFromRecord({
    contracts: [{ id: "b", title: "Vecchio", fileUrl: reference }],
  });
  assert.deepEqual(
    fromLegacy.map((document) => document.id),
    ["b"],
  );

  assert.deepEqual(getTrainerDocumentsFromRecord(null), []);
  assert.deepEqual(getTrainerDocumentsFromRecord({ documents: "boh" }), []);
});

test("l'elenco arriva ordinato dal piu recente", () => {
  const documents = normalizeTrainerDocuments([
    { id: "vecchio", uploadDate: "2025-01-10", fileUrl: reference },
    { id: "recente", uploadDate: "2026-05-04", fileUrl: reference },
    { id: "mezzo", uploadDate: "2026-01-01", fileUrl: reference },
  ]);

  assert.deepEqual(
    documents.map((document) => document.id),
    ["recente", "mezzo", "vecchio"],
  );
});

test("il tipo si riconosce anche scritto a mano", () => {
  assert.equal(normalizeTrainerDocumentType("Contratto"), "contratto");
  assert.equal(normalizeTrainerDocumentType("contract"), "contratto");
  assert.equal(
    normalizeTrainerDocumentType("Documento identita"),
    "documento-identita",
  );
  assert.equal(normalizeTrainerDocumentType("polizza"), "assicurazione");
  assert.equal(
    normalizeTrainerDocumentType("qualcosa di inventato"),
    "altro",
    "un tipo sconosciuto non deve far sparire il documento",
  );
});

test("lo stato distingue scaduto, in scadenza, valido e senza file", () => {
  const at = (expiryDate, fileUrl = reference) =>
    resolveTrainerDocumentStatus({ expiryDate, fileUrl }, today);

  assert.equal(at("2026-07-01"), "expired");
  assert.equal(at("2026-08-27"), "expiring", "scade oggi: e in scadenza, non scaduto");
  assert.equal(at("2026-09-20"), "expiring");
  assert.equal(at("2027-01-01"), "valid");
  assert.equal(at(""), "no-expiry");
  assert.equal(
    at("2027-01-01", ""),
    "missing-file",
    "senza file non c'e niente da visualizzare, e va detto",
  );
});

test("sostituire un documento non ne aggiunge un secondo", () => {
  const first = {
    id: "doc-1",
    type: "contratto",
    typeLabel: "Contratto",
    title: "Contratto",
    fileName: "vecchio.pdf",
    fileUrl: reference,
    uploadedAt: "2026-01-01",
    expiryDate: "",
    notes: "",
  };

  const withOne = upsertTrainerDocument([], first);
  assert.equal(withOne.length, 1);

  const replaced = upsertTrainerDocument(withOne, {
    ...first,
    fileName: "nuovo.pdf",
    uploadedAt: "2026-08-27",
  });
  assert.equal(replaced.length, 1);
  assert.equal(replaced[0].fileName, "nuovo.pdf");
  assert.equal(replaced[0].id, "doc-1", "l'identita del documento non cambia");

  assert.deepEqual(removeTrainerDocument(replaced, "doc-1"), []);
  assert.equal(
    removeTrainerDocument(replaced, "inesistente").length,
    1,
    "eliminare un id che non c'e non deve svuotare l'elenco",
  );
});

test("il nome del download descrive documento e persona", () => {
  const document = normalizeTrainerDocument({
    id: "doc-1",
    type: "contratto",
    fileName: "scan 001.pdf",
    fileUrl: reference,
    uploadDate: "2026-03-02",
    expiryDate: "2027-06-30",
  });

  const name = buildAttachmentFileName({
    ...trainerDocumentDownloadName(document, "Mario Rossi"),
    url: document.fileUrl,
  });

  assert.match(name, /Contratto/);
  assert.match(name, /Rossi/);
  assert.equal(name.includes(" "), false, "un nome di file non porta spazi");
});

// --- che il sotto-sistema rotto non torni ------------------------------------

const SRC = path.join(process.cwd(), "src");

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
};

const SOURCES = walk(SRC).map((file) => ({
  file: path.relative(process.cwd(), file).replace(/\\/g, "/"),
  source: readFileSync(file, "utf8"),
}));

test("nessuno scrive piu sulla colonna inesistente `trainer_contracts`", () => {
  /*
    Solo il codice: nei commenti il nome deve poter comparire, altrimenti non
    si puo piu spiegare perche quel percorso e stato tolto.
  */
  const offenders = SOURCES.filter(({ source }) =>
    source
      .split("\n")
      .some(
        (line) =>
          line.includes("trainer_contracts") &&
          !/^\s*(\*|\/\/|\/\*)/.test(line),
      ),
  ).map(({ file }) => file);

  assert.deepEqual(
    offenders,
    [],
    "clubs.trainer_contracts non esiste: era il motivo per cui il caricamento non salvava niente",
  );
});

test("le due pagine dedicate ai contratti non esistono piu", () => {
  assert.equal(
    existsSync(path.join(SRC, "app/trainers/[id]/contracts")),
    false,
    "cercavano l'allenatore in clubs.members[].staff_data e rimandavano all'elenco",
  );

  const offenders = SOURCES.filter(({ source }) =>
    /\/trainers\/\$\{trainerId\}\/contracts/.test(source),
  ).map(({ file }) => file);
  assert.deepEqual(offenders, []);
});

test("i documenti dell'allenatore passano da Attachment Core", () => {
  const panel = SOURCES.find(
    ({ file }) => file === "src/components/trainer/trainer-documents-panel.tsx",
  );

  assert.ok(panel, "il pannello dei documenti deve esistere");
  assert.match(panel.source, /uploadAttachmentReference/);
  assert.match(panel.source, /replaceAttachment/);
  assert.match(panel.source, /openClientFileUrl/);
  assert.match(panel.source, /downloadAttachment/);
  assert.equal(
    /fileToDataUrl|FileReader/.test(panel.source),
    false,
    "il file non entra nel record: WP-15",
  );
});

test("ogni tipo di documento dichiara etichetta e scadenza", () => {
  assert.equal(TRAINER_DOCUMENT_TYPES.length >= 4, true);
  for (const type of TRAINER_DOCUMENT_TYPES) {
    assert.equal(typeof type.label, "string");
    assert.equal(type.label.length > 2, true);
    assert.equal(typeof type.expires, "boolean");
  }
});
