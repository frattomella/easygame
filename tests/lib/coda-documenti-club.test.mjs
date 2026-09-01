import assert from "node:assert/strict";
import test from "node:test";

import {
  REVIEW_QUEUE_FILTERS,
  countReviewQueue,
  filterReviewQueue,
  getReviewQueueStateLabel,
  matchesReviewQueueFilter,
  reviewQueueActions,
  searchReviewQueue,
} from "../../src/lib/documents/review-queue.ts";

/**
 * **La coda della segreteria: i filtri, e cosa un pulsante puo fare**
 * (Wave 6, lane 6E, W6-39).
 *
 * I filtri stanno in un modulo puro e non nella schermata per una ragione
 * sola: la stessa domanda deve avere la stessa risposta nel conteggio della
 * pastiglia e nell'elenco sotto. Scritti nella pagina sarebbero due
 * implementazioni — quella del `filter` e quella del `length` — e la seconda
 * resterebbe indietro.
 */

const riga = (overrides = {}) => ({
  id: overrides.id || "r1",
  requestId: overrides.requestId ?? "r1",
  submissionId: overrides.submissionId ?? null,
  subjectKind: "athlete",
  subjectId: overrides.subjectId || "atleta-1",
  subjectName: overrides.subjectName || "Mario Rossi",
  documentKind: overrides.documentKind || "medical_certificate",
  documentKindLabel: overrides.documentKindLabel || "Certificato medico",
  title: overrides.title || "Certificato medico agonistico",
  state: overrides.state || "under_review",
  source: overrides.source || "parent",
  submittedByName: overrides.submittedByName || "Anna Rossi",
  submittedAt: overrides.submittedAt ?? "2026-08-30T09:00:00.000Z",
  decidedAt: null,
  decisionNote: overrides.decisionNote ?? null,
  dueDate: overrides.dueDate ?? null,
  overdue: overrides.overdue ?? false,
  fileUrl: overrides.fileUrl ?? "/api/v1/attachments/a1",
  historyCount: 1,
});

test("«Nuovi» sono i depositi che aspettano una decisione, non tutto l'aperto", () => {
  const righe = [
    riga({ id: "nuovo", state: "under_review", submissionId: "d1" }),
    riga({ id: "mai-arrivato", state: "missing", submissionId: null, fileUrl: "" }),
    riga({ id: "approvato", state: "approved", submissionId: "d2" }),
  ];

  assert.deepEqual(
    filterReviewQueue(righe, "new").map((row) => row.id),
    ["nuovo"],
  );
});

test("«Da integrare» sono i rifiutati, che e la stessa transizione", () => {
  /*
    Il dominio non ha uno stato «da integrare» accanto a «rifiutato», e non
    deve averlo: sarebbero due risposte alla stessa domanda. «Chiedi
    integrazione» **e** un rifiuto con il motivo, che il server pretende.
  */
  const righe = [
    riga({ id: "da-rifare", state: "rejected", decisionNote: "Illeggibile" }),
    riga({ id: "nuovo", state: "under_review" }),
  ];

  assert.deepEqual(
    filterReviewQueue(righe, "to_fix").map((row) => row.id),
    ["da-rifare"],
  );
  assert.equal(getReviewQueueStateLabel("rejected"), "Da integrare");
});

test("«Identita» raccoglie carta, tessera sanitaria e delega", () => {
  const righe = [
    riga({ id: "carta", documentKind: "identity_document" }),
    riga({ id: "tessera", documentKind: "health_card" }),
    riga({ id: "delega", documentKind: "delegation" }),
    riga({ id: "certificato", documentKind: "medical_certificate" }),
  ];

  assert.deepEqual(
    filterReviewQueue(righe, "identity").map((row) => row.id),
    ["carta", "tessera", "delega"],
  );
  assert.deepEqual(
    filterReviewQueue(righe, "certificates").map((row) => row.id),
    ["certificato"],
  );
});

test("il filtro riconosce anche una scrittura storica del tipo", () => {
  const riga_ = riga({ documentKind: "certificato_medico" });
  assert.equal(matchesReviewQueueFilter(riga_, "certificates"), true);
});

test("«Scaduti» guarda il ritardo, che il dominio ha gia calcolato", () => {
  const righe = [
    riga({ id: "in-ritardo", state: "missing", overdue: true }),
    riga({ id: "in-tempo", state: "missing", overdue: false }),
  ];

  assert.deepEqual(
    filterReviewQueue(righe, "overdue").map((row) => row.id),
    ["in-ritardo"],
  );
});

test("il conteggio delle pastiglie e lo stesso filtro, non un secondo conto", () => {
  const righe = [
    riga({ id: "a", state: "under_review", documentKind: "medical_certificate" }),
    riga({ id: "b", state: "rejected", documentKind: "identity_document" }),
    riga({ id: "c", state: "approved", documentKind: "health_card" }),
    riga({ id: "d", state: "missing", overdue: true, documentKind: "delegation" }),
  ];

  const conteggi = countReviewQueue(righe);
  for (const { key } of REVIEW_QUEUE_FILTERS) {
    assert.equal(
      conteggi[key],
      filterReviewQueue(righe, key).length,
      `la pastiglia ${key} conta piu o meno righe di quante l'elenco ne mostri`,
    );
  }
  assert.equal(conteggi.all, 4);
});

test("la ricerca guarda atleta, documento, tipo e chi ha caricato", () => {
  const righe = [
    riga({ id: "a", subjectName: "Mario Rossi" }),
    riga({ id: "b", subjectName: "Luca Bianchi", submittedByName: "Elena Bianchi" }),
  ];

  assert.deepEqual(
    searchReviewQueue(righe, "bianchi").map((row) => row.id),
    ["b"],
  );
  assert.deepEqual(
    searchReviewQueue(righe, "certificato").map((row) => row.id),
    ["a", "b"],
  );
  // Una ricerca vuota non e un filtro: rende tutto.
  assert.equal(searchReviewQueue(righe, "  ").length, 2);
});

test("si decide solo su un deposito che aspetta, e mai su uno gia deciso", () => {
  assert.equal(
    reviewQueueActions(riga({ state: "under_review", submissionId: "d1" }))
      .canDecide,
    true,
  );
  // Append-only: una decisione presa non si riscrive.
  assert.equal(
    reviewQueueActions(riga({ state: "approved", submissionId: "d1" })).canDecide,
    false,
  );
  assert.equal(
    reviewQueueActions(riga({ state: "rejected", submissionId: "d1" })).canDecide,
    false,
  );
  // Senza deposito non c'e niente da decidere: si sollecita.
  const senzaFile = riga({ state: "missing", submissionId: null, fileUrl: "" });
  assert.equal(reviewQueueActions(senzaFile).canDecide, false);
  assert.equal(reviewQueueActions(senzaFile).canOpen, false);
  assert.equal(reviewQueueActions(senzaFile).canRemind, true);
});
