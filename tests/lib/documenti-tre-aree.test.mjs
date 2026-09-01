import assert from "node:assert/strict";
import test from "node:test";

import {
  DOCUMENT_KINDS,
  DOCUMENT_KIND_OPTIONS,
  getDocumentKindLabel,
  isCanonicalDocumentKind,
  resolveDocumentKind,
} from "../../src/lib/documents/kind-catalog.ts";
import {
  buildFamilyDocumentAreas,
  deriveFamilyDocumentState,
  familyMustAct,
  getFamilyDocumentStateLabel,
} from "../../src/lib/documents/family-dossier.ts";
import {
  getSharedDocumentStatusLabel,
  normalizeSharedDocumentStatus,
} from "../../src/lib/shared-documents.ts";

/**
 * **Le tre aree del genitore, e il catalogo che le nomina** (Wave 6, lane 6E).
 *
 * Cio che questi test presidiano, e perche:
 *
 * - **un documento gia caricato non compare in due elenchi** (W6-40). Era il
 *   difetto: «richieste» e «archivio» erano la stessa lista frullata due volte,
 *   e il genitore ricaricava quello che aveva gia consegnato;
 * - **un tipo canonico non si perde** (W6-47). Il catalogo viveva nel file che
 *   la lane 5J cancella, e non conosceva ne la tessera sanitaria ne la delega:
 *   due documenti che una segreteria chiede tutte le settimane;
 * - **lo stato «scaduto» esiste** (W6-50). Il dominio lo calcolava da sempre e
 *   nessuna etichetta sapeva nominarlo.
 */

/* ------------------------------------------------------------ il catalogo */

test("il catalogo conosce tessera sanitaria e delega", () => {
  assert.equal(isCanonicalDocumentKind("health_card"), true);
  assert.equal(isCanonicalDocumentKind("delegation"), true);

  // E le si raggiunge con le parole che una segreteria scrive davvero.
  assert.equal(resolveDocumentKind("Tessera sanitaria"), "health_card");
  assert.equal(resolveDocumentKind("delega"), "delegation");
  assert.equal(resolveDocumentKind("Delega ritiro"), "delegation");
});

test("le chiavi del catalogo sono uniche e gia normalizzate", () => {
  const chiavi = DOCUMENT_KINDS.map((entry) => entry.key);
  assert.equal(new Set(chiavi).size, chiavi.length);

  for (const chiave of chiavi) {
    // Una chiave che non e la propria forma normalizzata sarebbe una chiave che
    // il servizio riscrive scrivendola: due valori per lo stesso tipo.
    assert.equal(resolveDocumentKind(chiave), chiave);
  }
  assert.equal(DOCUMENT_KIND_OPTIONS.length, DOCUMENT_KINDS.length);
});

test("gli alias storici arrivano tutti alla stessa chiave", () => {
  for (const scrittura of [
    "medical_certificate",
    "Certificato medico",
    "certificato_medico",
    "visita medica",
  ]) {
    assert.equal(resolveDocumentKind(scrittura), "medical_certificate");
  }

  for (const scrittura of ["Documento identita", "carta d'identita", "id"]) {
    assert.equal(resolveDocumentKind(scrittura), "identity_document");
  }
});

test("un tipo fuori catalogo resta se stesso e non diventa «Altro»", () => {
  /*
    Diventare `other` renderebbe la riga filtrabile solo da chi ne conosce la
    stringa esatta, e l'elenco «Altro» conterebbe cose che altro non sono.
  */
  assert.equal(resolveDocumentKind("nulla_osta_federale"), "nulla_osta_federale");
  assert.equal(getDocumentKindLabel("nulla_osta_federale"), "Nulla osta federale");
  assert.equal(getDocumentKindLabel(""), "Altro");
});

/* --------------------------------------------------------- lo stato «scaduto» */

test("W6-50: «scaduto» ha un'etichetta, e la conoscono tutte e due le strade", () => {
  assert.equal(normalizeSharedDocumentStatus("expired"), "expired");
  assert.equal(normalizeSharedDocumentStatus("overdue"), "expired");
  assert.equal(normalizeSharedDocumentStatus("scaduto"), "expired");
  assert.equal(getSharedDocumentStatusLabel("expired"), "Scaduto");

  assert.equal(getFamilyDocumentStateLabel("expired"), "Scaduto");
  assert.equal(getFamilyDocumentStateLabel("overdue"), "Scaduto");
});

/* ----------------------------------------------------------- le due aree */

const ORA = new Date("2026-09-01T12:00:00.000Z");

const voce = (overrides = {}) => ({
  id: overrides.id || "voce",
  requestId: overrides.requestId ?? "voce",
  documentKind: overrides.documentKind || "medical_certificate",
  title: overrides.title ?? "Certificato medico",
  description: overrides.description ?? null,
  required: overrides.required ?? true,
  dueDate: overrides.dueDate ?? null,
  state: {
    status: overrides.status || "open",
    dossier: overrides.dossier || "missing",
    submissionId: overrides.submissionId ?? null,
    attachmentId: overrides.attachmentId ?? null,
    submittedAt: overrides.submittedAt ?? null,
    decidedAt: overrides.decidedAt ?? null,
    decisionNote: overrides.decisionNote ?? null,
    historyCount: overrides.historyCount ?? 0,
    overdue: overrides.overdue ?? false,
  },
});

test("W6-40: un documento gia caricato non compare in due elenchi", () => {
  const aree = buildFamilyDocumentAreas(
    [
      voce({ id: "in-verifica", dossier: "under_review", submissionId: "d1" }),
      voce({ id: "approvato", dossier: "approved", submissionId: "d2" }),
      voce({ id: "mancante", dossier: "missing" }),
    ],
    new Map(),
    { now: ORA },
  );

  const daFare = aree.todo.map((item) => item.id);
  const archivio = aree.archive.map((item) => item.id);

  assert.deepEqual(daFare, ["mancante"]);
  assert.deepEqual(archivio.sort(), ["approvato", "in-verifica"]);

  // L'invariante, detta com'e: **nessun identificativo sta in tutte e due**.
  const doppioni = daFare.filter((id) => archivio.includes(id));
  assert.deepEqual(doppioni, []);
});

test("un rifiuto e lavoro, non archivio, e porta con se il motivo", () => {
  const aree = buildFamilyDocumentAreas(
    [
      voce({
        id: "rifiutato",
        dossier: "rejected",
        submissionId: "d1",
        attachmentId: "a1",
        decisionNote: "Il certificato e scaduto",
        submittedAt: "2026-08-01T09:00:00.000Z",
      }),
    ],
    new Map([["a1", { fileName: "certificato.pdf", url: "/api/x" }]]),
    { now: ORA },
  );

  assert.equal(aree.archive.length, 0);
  assert.equal(aree.todo.length, 1);
  assert.equal(aree.todo[0].state, "rejected");
  assert.equal(aree.todo[0].stateLabel, "Da integrare");
  assert.equal(aree.todo[0].rejectionReason, "Il certificato e scaduto");
  // Il file rifiutato resta consultabile dalla riga: non si perde niente.
  assert.equal(aree.todo[0].fileName, "certificato.pdf");
  assert.equal(aree.todo[0].action, "replace");
});

test("una richiesta annullata non e ne un compito ne un documento", () => {
  const aree = buildFamilyDocumentAreas(
    [voce({ id: "ritirata", status: "cancelled", dossier: "cancelled" })],
    new Map(),
    { now: ORA },
  );

  assert.deepEqual(aree.todo, []);
  assert.deepEqual(aree.archive, []);
});

test("un approvato scaduto torna fra le cose da fare, e lo dice", () => {
  const scaduto = voce({
    id: "certificato",
    dossier: "approved",
    submissionId: "d1",
    attachmentId: "a1",
    submittedAt: "2025-09-01T09:00:00.000Z",
  });

  const stato = deriveFamilyDocumentState(
    scaduto,
    { validUntil: "2026-06-30" },
    ORA,
  );
  assert.equal(stato, "expired");
  assert.equal(familyMustAct(stato), true);

  const aree = buildFamilyDocumentAreas(
    [scaduto],
    new Map([["a1", { validUntil: "2026-06-30" }]]),
    { now: ORA },
  );
  assert.deepEqual(aree.archive, []);
  assert.equal(aree.todo[0].stateLabel, "Scaduto");
  assert.equal(aree.todo[0].actionLabel, "Ricarica");
});

test("lo stesso file, ancora valido, resta in archivio", () => {
  const aree = buildFamilyDocumentAreas(
    [
      voce({
        id: "certificato",
        dossier: "approved",
        submissionId: "d1",
        attachmentId: "a1",
        submittedAt: "2026-08-01T09:00:00.000Z",
      }),
    ],
    new Map([["a1", { validUntil: "2027-06-30", fileName: "cert.pdf" }]]),
    { now: ORA },
  );

  assert.equal(aree.todo.length, 0);
  assert.equal(aree.archive[0].state, "approved");
  assert.equal(aree.archive[0].validUntil, "2027-06-30");
});

test("le cose da fare si ordinano per urgenza, non per titolo", () => {
  const aree = buildFamilyDocumentAreas(
    [
      voce({ id: "senza-termine", title: "Aaa senza termine" }),
      voce({ id: "fra-un-mese", title: "Zzz fra un mese", dueDate: "2026-10-01" }),
      voce({
        id: "gia-scaduto",
        title: "Mmm gia scaduto",
        dueDate: "2026-08-01",
        overdue: true,
      }),
    ],
    new Map(),
    { now: ORA },
  );

  assert.deepEqual(
    aree.todo.map((item) => item.id),
    ["gia-scaduto", "fra-un-mese", "senza-termine"],
  );
  assert.equal(aree.todo[0].state, "overdue");
});

test("una CTA sola per riga, e nessuna dove non c'e niente da fare", () => {
  const aree = buildFamilyDocumentAreas(
    [
      voce({ id: "mancante" }),
      voce({ id: "in-verifica", dossier: "under_review", submissionId: "d1" }),
    ],
    new Map(),
    { now: ORA },
  );

  assert.equal(aree.todo[0].action, "upload");
  assert.equal(aree.todo[0].actionLabel, "Carica");
  assert.equal(aree.archive[0].action, "none");
  assert.equal(aree.archive[0].actionLabel, "");
});

test("il tipo canonico arriva fino alla riga che il genitore legge", () => {
  const aree = buildFamilyDocumentAreas(
    [voce({ id: "tessera", documentKind: "tessera_sanitaria", title: "" })],
    new Map(),
    { now: ORA },
  );

  assert.equal(aree.todo[0].documentKind, "health_card");
  assert.equal(aree.todo[0].documentKindLabel, "Tessera sanitaria");
  // Senza titolo si mostra il tipo, non una stringa vuota.
  assert.equal(aree.todo[0].title, "Tessera sanitaria");
});
