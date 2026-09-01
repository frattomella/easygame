import assert from "node:assert/strict";
import test from "node:test";

import {
  DOCUMENT_DOSSIER_STATES,
  DOCUMENT_REMINDER_THROTTLE_HOURS,
  DOCUMENT_REQUEST_STATUSES,
  DOCUMENT_SUBJECT_KINDS,
  DOCUMENT_SUBMISSION_SOURCES,
  DOCUMENT_SUBMISSION_STATUSES,
  canDecideDocumentSubmission,
  canRemindDocumentRequest,
  canTransitionDocumentRequest,
  deriveDocumentDueState,
  deriveDocumentRequestState,
  documentSubjectKey,
  explainDocumentDecisionDenial,
  explainDocumentDecisionNoteDenial,
  explainDocumentReminderDenial,
  explainDocumentRequestTransitionDenial,
  isMedicalCertificateDocumentKind,
  sortDocumentSubmissions,
  validateDocumentRequestDraft,
} from "../../src/lib/documents/request-model.ts";

/**
 * Il dominio del fascicolo, provato senza database.
 *
 * Le quattro proprieta che vanno **dimostrate** e non affermate, perche sono
 * le quattro che l'archivio precedente non aveva:
 *
 * 1. **lo stato si ricava.** Non e la colonna: e l'ultimo deposito. Se la
 *    derivazione sbaglia, sbaglia ovunque — nella schermata della segreteria,
 *    in quella della famiglia e nel giro notturno dei solleciti;
 * 2. **una decisione presa non si riscrive.** Il difetto che si vuole rendere
 *    impossibile e correggere un rifiuto invece di chiedere un file nuovo:
 *    porterebbe via il motivo per cui la famiglia aveva ricaricato;
 * 3. **una richiesta soddisfatta non e in ritardo.** Un ritardo calcolato
 *    sulla sola data manda a sollecitare chi ha gia consegnato, ed e cosi che
 *    si smette di leggere gli avvisi;
 * 4. **il diniego dice cosa fare.** Una segreteria che legge «operazione non
 *    riuscita» chiama l'assistenza; una che legge «la richiesta risulta
 *    annullata» guarda la riga che ha selezionato.
 */

const deposito = (overrides = {}) => ({
  id: "dep-1",
  requestId: "req-1",
  status: "under_review",
  attachmentId: "att-1",
  submittedAt: "2026-09-01T10:00:00.000Z",
  decidedAt: null,
  decisionNote: null,
  source: "parent",
  ...overrides,
});

const richiesta = (overrides = {}) => ({
  id: "req-1",
  status: "open",
  dueDate: null,
  required: true,
  ...overrides,
});

const ADESSO = new Date("2026-09-01T12:00:00.000Z");

/* =================================================== il vocabolario ====== */

test("il vocabolario e chiuso, e dice cose diverse con parole diverse", () => {
  assert.deepEqual(
    [...DOCUMENT_REQUEST_STATUSES],
    ["open", "fulfilled", "cancelled"],
  );
  assert.deepEqual(
    [...DOCUMENT_SUBMISSION_STATUSES],
    ["under_review", "approved", "rejected"],
  );
  assert.deepEqual(
    [...DOCUMENT_SUBMISSION_SOURCES],
    ["parent", "club", "public_form"],
  );
  assert.deepEqual([...DOCUMENT_SUBJECT_KINDS], ["athlete", "member", "person"]);
  assert.deepEqual(
    [...DOCUMENT_DOSSIER_STATES],
    ["missing", "under_review", "approved", "rejected", "cancelled"],
  );
});

/* ================================= le transizioni della richiesta ======== */

test("una richiesta annullata non si riapre", () => {
  assert.equal(canTransitionDocumentRequest("cancelled", "open"), false);
  assert.equal(canTransitionDocumentRequest("cancelled", "fulfilled"), false);
  assert.match(
    explainDocumentRequestTransitionDenial("cancelled", "open"),
    /se ne crea una nuova/,
    "il diniego deve dire cosa fare: chiedere di nuovo e una richiesta nuova",
  );
});

test("una richiesta gia soddisfatta non si annulla", () => {
  assert.equal(canTransitionDocumentRequest("fulfilled", "cancelled"), false);
  assert.match(
    explainDocumentRequestTransitionDenial("fulfilled", "cancelled"),
    /gia soddisfatta/,
  );
});

test("una richiesta soddisfatta torna aperta se arriva un deposito nuovo", () => {
  /*
    Non e una stranezza: lo stato e l'ultimo deposito, e una famiglia che
    ricarica sopra un documento approvato riporta la richiesta in verifica.
    Vietarlo terrebbe «soddisfatta» una richiesta il cui ultimo file nessuno ha
    guardato.
  */
  assert.equal(canTransitionDocumentRequest("fulfilled", "open"), true);
});

test("uno stato che non esiste non e una transizione", () => {
  assert.equal(canTransitionDocumentRequest("open", "archiviata"), false);
  assert.equal(canTransitionDocumentRequest(null, "open"), false);
  assert.match(
    explainDocumentRequestTransitionDenial("open", "archiviata"),
    /sconosciuto/,
  );
});

/* ======================================= la decisione sul deposito ======= */

test("una decisione presa non si riscrive", () => {
  assert.equal(canDecideDocumentSubmission("approved", "rejected"), false);
  assert.equal(canDecideDocumentSubmission("rejected", "approved"), false);
  assert.equal(canDecideDocumentSubmission("approved", "approved"), false);
  assert.match(
    explainDocumentDecisionDenial("rejected", "approved"),
    /ne carica un altro/,
    "il verso giusto e un deposito nuovo, non la correzione del vecchio",
  );
});

test("un documento non torna in verifica", () => {
  assert.equal(canDecideDocumentSubmission("approved", "under_review"), false);
  assert.equal(
    canDecideDocumentSubmission("under_review", "under_review"),
    false,
  );
  assert.match(
    explainDocumentDecisionDenial("under_review", "under_review"),
    /ne carica uno nuovo/,
  );
});

test("in verifica si accetta e si rifiuta, e nient'altro", () => {
  assert.equal(canDecideDocumentSubmission("under_review", "approved"), true);
  assert.equal(canDecideDocumentSubmission("under_review", "rejected"), true);
  assert.equal(canDecideDocumentSubmission("under_review", "boh"), false);
  assert.match(explainDocumentDecisionDenial("under_review", "boh"), /sconosciuta/);
});

test("il rifiuto senza motivo e negato, l'accettazione senza motivo no", () => {
  assert.match(
    explainDocumentDecisionNoteDenial("rejected", "   "),
    /ricarica lo stesso file/,
  );
  assert.equal(explainDocumentDecisionNoteDenial("rejected", "scaduto"), null);
  assert.equal(explainDocumentDecisionNoteDenial("approved", ""), null);
});

/* ================================================== la derivazione ======= */

test("senza depositi la richiesta e aperta e il documento manca", () => {
  const stato = deriveDocumentRequestState(richiesta(), [], { now: ADESSO });
  assert.equal(stato.status, "open");
  assert.equal(stato.dossier, "missing");
  assert.equal(stato.submissionId, null);
  assert.equal(stato.historyCount, 0);
});

test("vince l'ultimo deposito, non il primo", () => {
  const stato = deriveDocumentRequestState(
    richiesta(),
    [
      deposito({
        id: "dep-1",
        status: "rejected",
        submittedAt: "2026-09-01T09:00:00.000Z",
        decisionNote: "illeggibile",
      }),
      deposito({
        id: "dep-2",
        status: "approved",
        submittedAt: "2026-09-01T11:00:00.000Z",
      }),
    ],
    { now: ADESSO },
  );

  assert.equal(stato.status, "fulfilled", "solo l'accettazione soddisfa");
  assert.equal(stato.dossier, "approved");
  assert.equal(stato.submissionId, "dep-2");
  assert.equal(stato.historyCount, 2, "il rifiuto resta nello storico");
  assert.equal(
    stato.decisionNote,
    null,
    "il motivo del rifiuto superato non si trascina sul deposito accettato",
  );
});

test("un rifiuto riapre la richiesta: il club aspetta ancora", () => {
  const stato = deriveDocumentRequestState(
    richiesta(),
    [deposito({ status: "rejected", decisionNote: "scaduto" })],
    { now: ADESSO },
  );
  assert.equal(stato.status, "open");
  assert.equal(stato.dossier, "rejected");
  assert.equal(stato.decisionNote, "scaduto");
});

test("un deposito in verifica non soddisfa la richiesta", () => {
  const stato = deriveDocumentRequestState(richiesta(), [deposito()], {
    now: ADESSO,
  });
  assert.equal(stato.status, "open", "nessuno lo ha ancora guardato");
  assert.equal(stato.dossier, "under_review");
});

test("l'annullamento vince sulla derivazione, e non cancella lo storico", () => {
  const stato = deriveDocumentRequestState(
    richiesta({ status: "cancelled" }),
    [deposito({ status: "approved" })],
    { now: ADESSO },
  );
  assert.equal(stato.status, "cancelled");
  assert.equal(stato.dossier, "cancelled");
  assert.equal(stato.historyCount, 1, "il deposito resta leggibile");
  assert.equal(stato.overdue, false);
});

test("il deposito spontaneo si deriva anche senza richiesta", () => {
  const stato = deriveDocumentRequestState(null, [deposito({ requestId: null })], {
    now: ADESSO,
  });
  assert.equal(stato.dossier, "under_review");
  assert.equal(stato.status, "open");
  assert.equal(stato.due.state, "none");
});

test("a parita di istante l'ordine e stabile, non quello di arrivo", () => {
  const stesso = "2026-09-01T10:00:00.000Z";
  const ordinati = sortDocumentSubmissions([
    deposito({ id: "dep-b", submittedAt: stesso }),
    deposito({ id: "dep-a", submittedAt: stesso }),
  ]);
  assert.deepEqual(
    ordinati.map((riga) => riga.id),
    ["dep-a", "dep-b"],
    "senza spareggio «l'ultimo deposito» cambierebbe da una query all'altra",
  );
});

/* ==================================================== la scadenza ======== */

test("la scadenza si conta per giorno, non per istante", () => {
  assert.equal(
    deriveDocumentDueState("2026-09-01", ADESSO).state,
    "due_soon",
    "il giorno stesso non e ancora scaduto, anche se sono le dodici",
  );
  assert.equal(deriveDocumentDueState("2026-09-01", ADESSO).daysLeft, 0);
  assert.equal(deriveDocumentDueState("2026-08-30", ADESSO).state, "overdue");
  assert.equal(deriveDocumentDueState("2026-09-05", ADESSO).state, "due_soon");
  assert.equal(deriveDocumentDueState("2026-10-30", ADESSO).state, "upcoming");
  assert.equal(deriveDocumentDueState(null, ADESSO).state, "none");
  assert.equal(deriveDocumentDueState("non-una-data", ADESSO).state, "none");
});

test("una richiesta soddisfatta non e in ritardo, per quanto la data sia passata", () => {
  const stato = deriveDocumentRequestState(
    richiesta({ dueDate: "2026-08-01" }),
    [deposito({ status: "approved" })],
    { now: ADESSO },
  );
  assert.equal(stato.due.state, "overdue", "la data e passata davvero");
  assert.equal(
    stato.overdue,
    false,
    "sollecitare chi ha gia consegnato e il modo di far ignorare gli avvisi",
  );
});

test("una richiesta aperta con la data passata e in ritardo", () => {
  const stato = deriveDocumentRequestState(
    richiesta({ dueDate: "2026-08-01" }),
    [],
    { now: ADESSO },
  );
  assert.equal(stato.overdue, true);
});

/* ==================================================== il sollecito ======= */

test("non si sollecita due volte nella stessa mezza giornata", () => {
  const unOraFa = new Date(ADESSO.getTime() - 60 * 60 * 1000).toISOString();
  assert.equal(canRemindDocumentRequest(unOraFa, ADESSO), false);

  const setteOreFa = new Date(
    ADESSO.getTime() - (DOCUMENT_REMINDER_THROTTLE_HOURS + 1) * 60 * 60 * 1000,
  ).toISOString();
  assert.equal(canRemindDocumentRequest(setteOreFa, ADESSO), true);
  assert.equal(canRemindDocumentRequest(null, ADESSO), true);
});

test("non si sollecita un documento gia consegnato, ne una richiesta chiusa", () => {
  const inVerifica = deriveDocumentRequestState(richiesta(), [deposito()], {
    now: ADESSO,
  });
  assert.match(
    explainDocumentReminderDenial(inVerifica, null, ADESSO),
    /attende la verifica/,
  );

  const soddisfatta = deriveDocumentRequestState(
    richiesta(),
    [deposito({ status: "approved" })],
    { now: ADESSO },
  );
  assert.match(
    explainDocumentReminderDenial(soddisfatta, null, ADESSO),
    /gia accettato/,
  );

  const annullata = deriveDocumentRequestState(
    richiesta({ status: "cancelled" }),
    [],
    { now: ADESSO },
  );
  assert.match(
    explainDocumentReminderDenial(annullata, null, ADESSO),
    /annullata/,
  );
});

test("il sollecito di una richiesta aperta e mai sollecitata passa", () => {
  const aperta = deriveDocumentRequestState(richiesta(), [], { now: ADESSO });
  assert.equal(explainDocumentReminderDenial(aperta, null, ADESSO), null);

  const unOraFa = new Date(ADESSO.getTime() - 60 * 60 * 1000).toISOString();
  assert.match(
    explainDocumentReminderDenial(aperta, unOraFa, ADESSO),
    /ultime 6 ore/,
  );
});

/* ================================================== la validazione ======= */

test("una richiesta senza soggetto, senza tipo o senza titolo non e una richiesta", () => {
  const esito = validateDocumentRequestDraft({});
  assert.equal(esito.ok, false);
  assert.deepEqual(
    esito.issues.map((issue) => issue.field).sort(),
    ["document_kind", "subject_id", "subject_kind", "title"],
  );
});

test("un soggetto inventato viene rifiutato, e una data storta anche", () => {
  const esito = validateDocumentRequestDraft({
    subjectKind: "sponsor",
    subjectId: "x",
    documentKind: "identity_document",
    title: "Carta d'identita",
    dueDate: "trenta febbraio",
  });
  assert.equal(esito.ok, false);
  assert.deepEqual(
    esito.issues.map((issue) => issue.field).sort(),
    ["due_date", "subject_kind"],
  );
});

test("una richiesta completa passa", () => {
  const esito = validateDocumentRequestDraft({
    subjectKind: "athlete",
    subjectId: "atleta-1",
    documentKind: "Certificato medico",
    title: "Certificato medico agonistico",
    dueDate: "2026-10-01",
  });
  assert.deepEqual(esito, { ok: true, issues: [] });
});

/* =========================================== il certificato medico ======= */

test("il certificato medico si riconosce comunque sia scritto", () => {
  assert.equal(isMedicalCertificateDocumentKind("Certificato medico"), true);
  assert.equal(isMedicalCertificateDocumentKind("medical-certificate"), true);
  assert.equal(isMedicalCertificateDocumentKind("visita medica"), true);
  /*
    E soltanto quello: promuovere una carta d'identita in
    `medical_certificates` creerebbe una scadenza clinica che non esiste, con
    il promemoria notturno che la insegue.
  */
  assert.equal(isMedicalCertificateDocumentKind("identity_document"), false);
  assert.equal(isMedicalCertificateDocumentKind(""), false);
});

test("la chiave del soggetto si compone in un modo solo", () => {
  assert.equal(documentSubjectKey("Athlete", " atleta-1 "), "athlete:atleta-1");
});
