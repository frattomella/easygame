/**
 * Il dominio del **fascicolo unico**: la richiesta di un documento, il suo
 * deposito, e lo stato che si ricava dai due (Wave 5, lane 5D, §17).
 *
 * ---
 *
 * ## Perche esiste, quando il workflow esisteva gia
 *
 * Il ciclo «il club chiede, la famiglia carica, il club accetta o rifiuta»
 * c'era per intero in `src/lib/shared-documents.ts`, e gli stati erano quelli
 * giusti. Cio che mancava non era il workflow: erano il **fatto** e la
 * **regola**. Il fatto viveva dentro `athletes.data.sharedDocuments`, un array
 * JSON dentro l'anagrafica; la regola viveva dentro due route handler, scritta
 * due volte, e nessuno dei due la poteva provare senza un database.
 *
 * Qui non c'e niente di nuovo per il prodotto: c'e la stessa regola in un
 * posto dove si puo leggere e dove un test la puo dimostrare.
 *
 * ## La proprieta che tiene in piedi tutto: lo stato si **ricava**
 *
 * `document_requests.status` non e la risposta alla domanda «a che punto e
 * questo documento?». Quella risposta e l'**ultimo deposito**, e si ricava.
 * E la stessa regola di `ConsentRecord`, dello stato di una rata e delle
 * scadenze del lavoro sportivo (ADR-0058): una colonna di stato accanto a uno
 * storico sono due risposte alla stessa domanda, e prima o poi divergono —
 * tipicamente nel giorno in cui una segreteria chiama dicendo che il
 * certificato risulta mancante mentre la famiglia lo ha caricato la settimana
 * prima.
 *
 * La colonna dice soltanto se la richiesta e ancora **in piedi**: aperta, o
 * annullata da chi l'aveva fatta. Tutto il resto lo dice
 * `deriveDocumentRequestState`.
 *
 * ## Perche il deposito e append-only
 *
 * Una decisione non si ri-decide. Rifiutare un documento e poi «cambiarlo in
 * approvato» cancellerebbe la ragione per cui la famiglia lo ha ricaricato, ed
 * e proprio quella la riga che si va a cercare mesi dopo. Un secondo esame e
 * un **secondo deposito**, non la riscrittura del primo — come una revoca di
 * consenso e una riga in piu e non una riga tolta.
 *
 * Modulo **puro** e client-safe: nessun Prisma, nessuna rete, nessun DOM. Lo
 * importano sia il servizio sia le schermate, perche «questo documento risulta
 * in verifica» deve significare la stessa cosa nei due posti.
 */

/* ----------------------------------------------------------- vocabolario */

const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();

const asText = (value: unknown) => String(value ?? "").trim();

/**
 * Lo stato **della richiesta**, cioe se e ancora in piedi.
 *
 * `fulfilled` non si scrive mai a mano: e cio che la derivazione restituisce
 * quando l'ultimo deposito e stato accettato. Compare qui perche il valore
 * esiste nella colonna — il travaso e le letture vecchie lo portano — e perche
 * chi legge questo file deve sapere che i tre valori non hanno lo stesso
 * peso: due sono decisioni di una persona, uno e un calcolo.
 */
export const DOCUMENT_REQUEST_STATUSES = [
  "open",
  "fulfilled",
  "cancelled",
] as const;
export type DocumentRequestStatus = (typeof DOCUMENT_REQUEST_STATUSES)[number];

export const isDocumentRequestStatus = (
  value: unknown,
): value is DocumentRequestStatus =>
  (DOCUMENT_REQUEST_STATUSES as readonly string[]).includes(normalize(value));

/** Lo stato **del deposito**: la decisione della segreteria, o la sua attesa. */
export const DOCUMENT_SUBMISSION_STATUSES = [
  "under_review",
  "approved",
  "rejected",
] as const;
export type DocumentSubmissionStatus =
  (typeof DOCUMENT_SUBMISSION_STATUSES)[number];

export const isDocumentSubmissionStatus = (
  value: unknown,
): value is DocumentSubmissionStatus =>
  (DOCUMENT_SUBMISSION_STATUSES as readonly string[]).includes(normalize(value));

/**
 * Da dove arriva il deposito.
 *
 * Non e decorazione, per la stessa ragione per cui la sorgente di un consenso
 * non lo e: «lo ha caricato la famiglia» e «lo ha caricato la segreteria con il
 * foglio in mano» sono due fatti diversi davanti a chi chiede conto di un
 * documento, e la riga da sola non li distingue.
 */
export const DOCUMENT_SUBMISSION_SOURCES = [
  "parent",
  "club",
  "public_form",
] as const;
export type DocumentSubmissionSource =
  (typeof DOCUMENT_SUBMISSION_SOURCES)[number];

export const isDocumentSubmissionSource = (
  value: unknown,
): value is DocumentSubmissionSource =>
  (DOCUMENT_SUBMISSION_SOURCES as readonly string[]).includes(normalize(value));

/** A chi si riferisce il fascicolo. */
export const DOCUMENT_SUBJECT_KINDS = ["athlete", "member", "person"] as const;
export type DocumentSubjectKind = (typeof DOCUMENT_SUBJECT_KINDS)[number];

export const isDocumentSubjectKind = (
  value: unknown,
): value is DocumentSubjectKind =>
  (DOCUMENT_SUBJECT_KINDS as readonly string[]).includes(normalize(value));

/**
 * Lo stato **ricavato**, che e quello che si mostra.
 *
 * `missing` non e uno stato scritto da nessuna parte: e l'assenza di depositi,
 * ed e la risposta piu frequente il giorno in cui si apre il fascicolo.
 */
export const DOCUMENT_DOSSIER_STATES = [
  "missing",
  "under_review",
  "approved",
  "rejected",
  "cancelled",
] as const;
export type DocumentDossierState = (typeof DOCUMENT_DOSSIER_STATES)[number];

/* --------------------------------------------------- la natura del documento */

/**
 * Il tipo di documento, ridotto a un identificativo confrontabile.
 *
 * La stessa riduzione di `normalizeAttachmentCategory`: senza, «Certificato
 * medico» e `certificato_medico` sarebbero due tipi diversi e la promozione in
 * `medical_certificates` scatterebbe solo per uno dei due.
 */
export const normalizeDocumentKind = (value: unknown) =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/**
 * I tipi che, una volta accettati, **diventano** un certificato medico.
 *
 * La promozione esiste perche il certificato medico ha gia una tabella con una
 * semantica propria (mancante / in scadenza / scaduto) e la sua automazione
 * notturna `AUT-03`: un certificato che restasse solo nel fascicolo sarebbe
 * valido per la segreteria e inesistente per il promemoria, cioe la peggiore
 * delle due risposte possibili (W5-27, W5-44).
 *
 * I nomi sono quelli che il prodotto scrive davvero, forma inglese degli
 * archivi piu vecchi compresa.
 */
export const MEDICAL_CERTIFICATE_DOCUMENT_KINDS = [
  "medical_certificate",
  "certificato_medico",
  "visita_medica",
] as const;

const MEDICAL_KINDS = new Set<string>(MEDICAL_CERTIFICATE_DOCUMENT_KINDS);

export const isMedicalCertificateDocumentKind = (value: unknown) =>
  MEDICAL_KINDS.has(normalizeDocumentKind(value));

/* ------------------------------------------------ transizioni della richiesta */

/**
 * Le transizioni ammesse per la richiesta.
 *
 * - da `open` si va in `cancelled` — la segreteria ritira la domanda — e in
 *   `fulfilled`, che pero **non lo scrive nessuno**: e la derivazione;
 * - da `fulfilled` si torna in `open`, e non e una stranezza: lo stato e
 *   l'ultimo deposito, e una famiglia che ricarica sopra un documento gia
 *   approvato riporta la richiesta in verifica. Vietarlo vorrebbe dire tenere
 *   «soddisfatta» una richiesta il cui ultimo deposito nessuno ha guardato;
 * - da `cancelled` non si torna indietro. Riaprire la stessa riga direbbe che
 *   il club ha chiesto una volta sola, quando ha chiesto due volte: la seconda
 *   domanda e una richiesta nuova, con la sua data e la sua scadenza.
 */
const REQUEST_TRANSITIONS: Record<DocumentRequestStatus, DocumentRequestStatus[]> =
  {
    open: ["open", "fulfilled", "cancelled"],
    fulfilled: ["fulfilled", "open"],
    cancelled: ["cancelled"],
  };

export const canTransitionDocumentRequest = (
  from: unknown,
  to: unknown,
): boolean => {
  const source = normalize(from);
  const target = normalize(to);
  if (!isDocumentRequestStatus(source) || !isDocumentRequestStatus(target)) {
    return false;
  }
  return REQUEST_TRANSITIONS[source as DocumentRequestStatus].includes(
    target as DocumentRequestStatus,
  );
};

/**
 * Perche quella transizione non si puo fare, detto a chi la sta tentando.
 *
 * Non e cosmetica: una segreteria che legge «operazione non riuscita» chiama
 * l'assistenza, una che legge «la richiesta risulta gia annullata» guarda la
 * riga che ha selezionato.
 */
export const explainDocumentRequestTransitionDenial = (
  from: unknown,
  to: unknown,
): string | null => {
  if (canTransitionDocumentRequest(from, to)) return null;

  const source = normalize(from);
  const target = normalize(to);

  if (!isDocumentRequestStatus(target)) {
    return "Stato sconosciuto per una richiesta di documento";
  }
  if (source === "cancelled") {
    return "La richiesta risulta annullata: per chiederlo di nuovo se ne crea una nuova";
  }
  if (source === "fulfilled" && target === "cancelled") {
    return "La richiesta risulta gia soddisfatta: non c'e piu niente da annullare";
  }
  return "Questa transizione non e ammessa a partire dallo stato attuale";
};

/* ------------------------------------------------- decisione su un deposito */

/**
 * Le decisioni ammesse su un deposito.
 *
 * `under_review` e l'unico stato che si puo lasciare: una decisione presa e un
 * fatto, e i fatti non si modificano. Chi ha sbagliato a rifiutare non
 * «corregge» il rifiuto — la famiglia ricarica, e nasce un deposito nuovo con
 * la sua data. E il motivo per cui la tabella e append-only.
 */
const DECISION_TRANSITIONS: Record<
  DocumentSubmissionStatus,
  DocumentSubmissionStatus[]
> = {
  under_review: ["approved", "rejected"],
  approved: [],
  rejected: [],
};

export const canDecideDocumentSubmission = (
  current: unknown,
  next: unknown,
): boolean => {
  const from = normalize(current);
  const to = normalize(next);
  if (!isDocumentSubmissionStatus(from) || !isDocumentSubmissionStatus(to)) {
    return false;
  }
  return DECISION_TRANSITIONS[from as DocumentSubmissionStatus].includes(
    to as DocumentSubmissionStatus,
  );
};

export const explainDocumentDecisionDenial = (
  current: unknown,
  next: unknown,
): string | null => {
  if (canDecideDocumentSubmission(current, next)) return null;

  const from = normalize(current);
  const to = normalize(next);

  if (to === "under_review") {
    return "Un documento non torna in verifica: la famiglia ne carica uno nuovo";
  }
  if (!isDocumentSubmissionStatus(to)) {
    return "Decisione sconosciuta: un documento si accetta o si rifiuta";
  }
  if (from === "approved") {
    return "Il documento risulta gia accettato: una decisione presa non si riscrive";
  }
  if (from === "rejected") {
    return "Il documento risulta gia rifiutato: la famiglia ne carica un altro";
  }
  return "Questa decisione non e ammessa a partire dallo stato attuale";
};

/**
 * Il motivo del rifiuto e **obbligatorio**, e quello dell'accettazione no.
 *
 * Il rifiuto e l'unica decisione che chiede alla famiglia di rifare qualcosa:
 * senza il motivo, il messaggio che arriva e «il tuo documento e stato
 * rifiutato» e la famiglia ricarica lo stesso file. Era gia la regola della
 * rotta legacy, ed e l'unica riga di quel file che qui non cambia.
 */
export const explainDocumentDecisionNoteDenial = (
  decision: unknown,
  note: unknown,
): string | null => {
  if (normalize(decision) !== "rejected") return null;
  return asText(note)
    ? null
    : "Il motivo del rifiuto e obbligatorio: senza, la famiglia ricarica lo stesso file";
};

/* ---------------------------------------------------------- la derivazione */

export type DocumentSubmissionInput = {
  id?: string | null;
  requestId?: string | null;
  status?: unknown;
  attachmentId?: string | null;
  submittedAt?: string | Date | null;
  decidedAt?: string | Date | null;
  decisionNote?: string | null;
  source?: unknown;
};

export type DocumentRequestInput = {
  id?: string | null;
  status?: unknown;
  dueDate?: string | Date | null;
  required?: boolean | null;
};

const toTime = (value: unknown) => {
  if (value instanceof Date) return value.getTime();
  const text = asText(value);
  if (!text) return 0;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const toIso = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  const text = asText(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString();
};

/**
 * I depositi dal piu vecchio al piu recente, con uno **spareggio stabile**.
 *
 * Due depositi con lo stesso istante capitano davvero — un doppio clic, o un
 * travaso che scrive dieci righe nello stesso millisecondo — e senza spareggio
 * «l'ultimo deposito» sarebbe una risposta che cambia da una query all'altra.
 * Lo spareggio e l'identificativo, che e l'unica cosa sicuramente diversa.
 */
export const sortDocumentSubmissions = (
  rows: readonly DocumentSubmissionInput[] | null | undefined,
): DocumentSubmissionInput[] =>
  [...(rows || [])].sort((left, right) => {
    const delta = toTime(left?.submittedAt) - toTime(right?.submittedAt);
    if (delta !== 0) return delta;
    return asText(left?.id).localeCompare(asText(right?.id));
  });

export const DOCUMENT_DUE_STATES = [
  "none",
  "upcoming",
  "due_soon",
  "overdue",
] as const;
export type DocumentDueState = (typeof DOCUMENT_DUE_STATES)[number];

/**
 * Quanti giorni prima della scadenza un documento e «in scadenza».
 *
 * Sette e non trenta come per gli allegati: la scadenza di un allegato e la
 * validita di un documento gia consegnato, questa e il termine entro cui una
 * famiglia deve **fare** qualcosa. Avvisare un mese prima di un adempimento di
 * cinque minuti produce un avviso che si impara a ignorare.
 */
export const DOCUMENT_REQUEST_DUE_WARNING_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * La scadenza si confronta per **giorno**, non per istante.
 *
 * Una data di scadenza letta come `2026-09-30T00:00:00.000Z` e confrontata con
 * `Date.now()` diventa scaduta alle 00:01 del giorno stesso, cioe un giorno
 * prima di quello che una famiglia legge sullo schermo. Si azzera l'orario di
 * entrambi e si contano i giorni.
 */
const dayStart = (value: Date) =>
  Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());

export type DocumentDue = {
  state: DocumentDueState;
  /** Giorni che mancano: negativo se il termine e passato, `null` senza data. */
  daysLeft: number | null;
  dueDate: string | null;
};

/**
 * Lo stato della scadenza, guardando **solo** la data.
 *
 * Chi vuole sapere se una richiesta e davvero in ritardo usa
 * `deriveDocumentRequestState`: una richiesta gia soddisfatta o annullata non
 * e in ritardo, per quanto la data sia passata.
 */
export const deriveDocumentDueState = (
  dueDate: string | Date | null | undefined,
  now: Date = new Date(),
  warningDays: number = DOCUMENT_REQUEST_DUE_WARNING_DAYS,
): DocumentDue => {
  const iso = toIso(dueDate);
  if (!iso) return { state: "none", daysLeft: null, dueDate: null };

  const scadenza = new Date(iso);
  if (Number.isNaN(scadenza.getTime())) {
    return { state: "none", daysLeft: null, dueDate: null };
  }

  const daysLeft = Math.round(
    (dayStart(scadenza) - dayStart(now)) / MS_PER_DAY,
  );

  const state: DocumentDueState =
    daysLeft < 0 ? "overdue" : daysLeft <= warningDays ? "due_soon" : "upcoming";

  return { state, daysLeft, dueDate: iso };
};

export type DocumentRequestState = {
  /** Lo stato della richiesta, **ricavato** e non letto dalla colonna. */
  status: DocumentRequestStatus;
  /** Cio che si mostra: dove sta il documento adesso. */
  dossier: DocumentDossierState;
  submissionId: string | null;
  submissionStatus: DocumentSubmissionStatus | null;
  attachmentId: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  historyCount: number;
  due: DocumentDue;
  /** Vero solo se il termine e passato **e** la richiesta e ancora aperta. */
  overdue: boolean;
};

/**
 * Lo stato corrente di una richiesta, dai suoi depositi.
 *
 * `request` puo essere `null`: e il **verso spontaneo**, cioe la famiglia che
 * carica senza che nessuno abbia chiesto. Non e un caso degradato da gestire a
 * parte — e meta del traffico reale — e trattarlo come tale eviterebbe la
 * seconda implementazione della stessa derivazione.
 */
export const deriveDocumentRequestState = (
  request: DocumentRequestInput | null | undefined,
  submissions: readonly DocumentSubmissionInput[] | null | undefined,
  options: { now?: Date } = {},
): DocumentRequestState => {
  const now = options.now || new Date();
  const ordered = sortDocumentSubmissions(submissions);
  const last = ordered[ordered.length - 1] || null;
  const due = deriveDocumentDueState(request?.dueDate, now);

  /*
    L'annullamento e l'unico caso in cui la colonna vince sulla derivazione, e
    per una ragione precisa: e una decisione di una persona, non un calcolo. Il
    deposito che fosse arrivato prima resta nello storico e resta leggibile —
    non si cancella niente — ma la richiesta non e piu in piedi.
  */
  if (normalize(request?.status) === "cancelled") {
    return {
      status: "cancelled",
      dossier: "cancelled",
      submissionId: last?.id ? String(last.id) : null,
      submissionStatus: isDocumentSubmissionStatus(last?.status)
        ? (normalize(last?.status) as DocumentSubmissionStatus)
        : null,
      attachmentId: last?.attachmentId ? String(last.attachmentId) : null,
      submittedAt: toIso(last?.submittedAt),
      decidedAt: toIso(last?.decidedAt),
      decisionNote: asText(last?.decisionNote) || null,
      historyCount: ordered.length,
      due,
      overdue: false,
    };
  }

  if (!last) {
    return {
      status: "open",
      dossier: "missing",
      submissionId: null,
      submissionStatus: null,
      attachmentId: null,
      submittedAt: null,
      decidedAt: null,
      decisionNote: null,
      historyCount: 0,
      due,
      overdue: due.state === "overdue",
    };
  }

  const submissionStatus = isDocumentSubmissionStatus(last.status)
    ? (normalize(last.status) as DocumentSubmissionStatus)
    : "under_review";

  /*
    **Solo l'accettazione soddisfa la richiesta.** Un deposito in verifica non
    la chiude — la segreteria non lo ha ancora guardato — e un rifiuto la
    riapre: era esattamente il punto in cui la colonna e lo storico
    divergevano, perche chi rifiutava aggiornava il documento e non la
    richiesta.
  */
  const status: DocumentRequestStatus =
    submissionStatus === "approved" ? "fulfilled" : "open";

  return {
    status,
    dossier: submissionStatus,
    submissionId: last.id ? String(last.id) : null,
    submissionStatus,
    attachmentId: last.attachmentId ? String(last.attachmentId) : null,
    submittedAt: toIso(last.submittedAt),
    decidedAt: toIso(last.decidedAt),
    decisionNote: asText(last.decisionNote) || null,
    historyCount: ordered.length,
    due,
    /*
      Una richiesta soddisfatta non e in ritardo, per quanto la data sia
      passata: mostrarla in rosso manderebbe la segreteria a sollecitare chi ha
      gia consegnato.
    */
    overdue: status === "open" && due.state === "overdue",
  };
};

/* ------------------------------------------------------------ il sollecito */

/**
 * Sei ore fra un sollecito e il successivo.
 *
 * Il numero non e nuovo: e quello che la rotta legacy applicava gia, ed e
 * corretto. Cambia solo il posto in cui vive — prima era una costante dentro
 * un route handler, quindi non riusabile e non provabile — e resta comunque il
 * primo dei due presidi: il secondo e la deduplica di `CommunicationDelivery`
 * (ADR-0084), che regge anche quando due operatori premono insieme.
 */
export const DOCUMENT_REMINDER_THROTTLE_HOURS = 6;

export const canRemindDocumentRequest = (
  lastRemindedAt: string | Date | null | undefined,
  now: Date = new Date(),
): boolean => {
  const last = toTime(lastRemindedAt);
  if (!last) return true;
  return now.getTime() - last >= DOCUMENT_REMINDER_THROTTLE_HOURS * 60 * 60 * 1000;
};

/**
 * Perche il sollecito non parte. `null` quando parte.
 *
 * I due dinieghi che non riguardano il tempo vengono prima, e non e un
 * dettaglio di ordine: sollecitare un documento gia consegnato e l'errore che
 * fa perdere fiducia in tutti gli altri avvisi.
 */
export const explainDocumentReminderDenial = (
  state: Pick<DocumentRequestState, "status" | "dossier">,
  lastRemindedAt: string | Date | null | undefined,
  now: Date = new Date(),
): string | null => {
  if (state?.status === "cancelled") {
    return "La richiesta risulta annullata: non c'e niente da sollecitare";
  }
  if (state?.status === "fulfilled") {
    return "Il documento risulta gia accettato: non c'e niente da sollecitare";
  }
  if (state?.dossier === "under_review") {
    return "Il documento e gia stato caricato e attende la verifica del club";
  }
  if (!canRemindDocumentRequest(lastRemindedAt, now)) {
    return `Sollecito gia inviato nelle ultime ${DOCUMENT_REMINDER_THROTTLE_HOURS} ore`;
  }
  return null;
};

/* -------------------------------------------------------------- la chiave */

/**
 * La chiave con cui si raggruppa un fascicolo per soggetto.
 *
 * Esiste per non farla comporre due volte: il servizio raggruppa, la schermata
 * confronta, e due modi di comporre la stessa chiave sono due elenchi che non
 * corrispondono.
 */
export const documentSubjectKey = (
  subjectKind: unknown,
  subjectId: unknown,
) => `${normalize(subjectKind)}:${asText(subjectId)}`;

/* ------------------------------------------------------------ validazione */

export type DocumentRequestDraft = {
  subjectKind?: unknown;
  subjectId?: unknown;
  documentKind?: unknown;
  title?: unknown;
  dueDate?: string | Date | null;
};

export type DocumentValidationIssue = { field: string; message: string };

export type DocumentValidationResult = {
  ok: boolean;
  issues: DocumentValidationIssue[];
};

/**
 * Cosa manca a una richiesta perche sia una richiesta.
 *
 * Il titolo e obbligatorio e non ricavato dal tipo: «Documento identita» e
 * «Carta d'identita del secondo genitore» sono due domande diverse, e la
 * famiglia legge il titolo, non il tipo.
 */
export const validateDocumentRequestDraft = (
  draft: DocumentRequestDraft,
): DocumentValidationResult => {
  const issues: DocumentValidationIssue[] = [];

  if (!isDocumentSubjectKind(draft?.subjectKind)) {
    issues.push({
      field: "subject_kind",
      message: `Soggetto sconosciuto: ammessi ${DOCUMENT_SUBJECT_KINDS.join(", ")}`,
    });
  }
  if (!asText(draft?.subjectId)) {
    issues.push({
      field: "subject_id",
      message: "La richiesta deve dire a chi si riferisce",
    });
  }
  if (!normalizeDocumentKind(draft?.documentKind)) {
    issues.push({
      field: "document_kind",
      message: "La richiesta deve dire che documento si chiede",
    });
  }
  if (!asText(draft?.title)) {
    issues.push({
      field: "title",
      message: "La richiesta deve avere un titolo leggibile dalla famiglia",
    });
  }

  const due = draft?.dueDate;
  if (due !== null && due !== undefined && asText(due)) {
    const parsed = new Date(asText(due));
    if (Number.isNaN(parsed.getTime())) {
      issues.push({ field: "due_date", message: "Scadenza non valida" });
    }
  }

  return { ok: issues.length === 0, issues };
};
