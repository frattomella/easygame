/**
 * **La coda «documenti da verificare» del club** (Wave 6, lane 6E, §5.2, W6-39).
 *
 * ---
 *
 * ## Il difetto che chiude
 *
 * `listPendingDocumentSubmissions` esiste dalla Wave 5, accetta anche l'assenza
 * di `subject_id` — cioe sa gia rispondere «tutti i depositi del club» — e ha
 * una rotta sua. **Zero componenti la chiamano.** La segreteria, per sapere se
 * qualcuno ha caricato qualcosa, doveva aprire la scheda di un atleta per
 * volta: con duecento atleti e un certificato l'anno, e un lavoro che nessuno
 * fa e che quindi non viene fatto.
 *
 * ## Perche i filtri stanno qui e non nella schermata
 *
 * Sono sei domande di dominio — «cosa e nuovo», «cosa e da integrare», «cosa e
 * scaduto» — e la stessa domanda deve avere la stessa risposta nel conteggio
 * della pastiglia e nell'elenco sotto. Scritti nella pagina sarebbero due
 * implementazioni: quella del `filter` e quella del `length`.
 *
 * Modulo **puro** e client-safe: nessun Prisma, nessuna rete, nessun DOM.
 */

import { getDocumentKindLabel, resolveDocumentKind } from "./kind-catalog";

const asText = (value: unknown) => String(value ?? "").trim();

/**
 * Lo stato di una riga della coda.
 *
 * E lo stesso vocabolario che vede la famiglia, e non e un caso: segreteria e
 * genitore devono poter dire al telefono la stessa parola sullo stesso
 * documento. La differenza fra le due schermate e cosa ci si puo **fare**, non
 * come si chiama.
 */
export type ReviewQueueState =
  | "missing"
  | "overdue"
  | "under_review"
  | "approved"
  | "rejected";

export type DocumentReviewRow = {
  /** L'identificativo della voce: la richiesta, o il deposito se spontaneo. */
  id: string;
  requestId: string | null;
  /** Il deposito su cui si decide. `null` quando non e ancora arrivato niente. */
  submissionId: string | null;
  subjectKind: string;
  subjectId: string;
  /** Il nome dell'atleta, risolto dal server: la coda si legge per persona. */
  subjectName: string;
  documentKind: string;
  documentKindLabel: string;
  title: string;
  state: ReviewQueueState;
  /** Chi ha caricato: la famiglia, la segreteria, o un modulo pubblico. */
  source: string;
  /** Il nome di chi ha caricato. Vuoto quando il deposito non e arrivato. */
  submittedByName: string;
  submittedAt: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  dueDate: string | null;
  overdue: boolean;
  fileUrl: string;
  historyCount: number;
};

/**
 * I filtri della coda.
 *
 * **`new` non e «tutto cio che non e deciso».** E il deposito che aspetta una
 * risposta: e la prima colonna di lavoro di una segreteria, e mescolarci le
 * richieste ancora senza file la renderebbe una lista di cose che non si
 * possono fare.
 */
export const REVIEW_QUEUE_FILTERS = [
  { key: "new", label: "Nuovi" },
  { key: "to_fix", label: "Da integrare" },
  { key: "certificates", label: "Certificati" },
  { key: "identity", label: "Identita" },
  { key: "overdue", label: "Scaduti" },
  { key: "approved", label: "Approvati" },
  { key: "all", label: "Tutti" },
] as const;

export type ReviewQueueFilter = (typeof REVIEW_QUEUE_FILTERS)[number]["key"];

/**
 * I tipi che la pastiglia «Identita» raccoglie.
 *
 * Sono tre e non uno: carta d'identita, tessera sanitaria e delega sono la
 * stessa pratica per chi la lavora — si guarda la foto, si confronta il nome, e
 * si accetta — e tenerle su tre pastiglie diverse vorrebbe dire tre code da
 * ventuno righe invece di una da sessanta.
 */
const TIPI_IDENTITA = new Set(["identity_document", "health_card", "delegation"]);

const TIPI_CERTIFICATO = new Set(["medical_certificate"]);

export const matchesReviewQueueFilter = (
  row: DocumentReviewRow,
  filter: ReviewQueueFilter,
): boolean => {
  const kind = resolveDocumentKind(row?.documentKind);

  switch (filter) {
    case "new":
      return row?.state === "under_review";
    case "to_fix":
      return row?.state === "rejected";
    case "certificates":
      return TIPI_CERTIFICATO.has(kind);
    case "identity":
      return TIPI_IDENTITA.has(kind);
    case "overdue":
      return Boolean(row?.overdue);
    case "approved":
      return row?.state === "approved";
    case "all":
    default:
      return true;
  }
};

export const filterReviewQueue = (
  rows: readonly DocumentReviewRow[] | null | undefined,
  filter: ReviewQueueFilter,
): DocumentReviewRow[] =>
  (rows || []).filter((row) => matchesReviewQueueFilter(row, filter));

/** Quante righe per ogni pastiglia. Un solo passaggio, una sola regola. */
export const countReviewQueue = (
  rows: readonly DocumentReviewRow[] | null | undefined,
): Record<ReviewQueueFilter, number> => {
  const conteggi = {} as Record<ReviewQueueFilter, number>;
  for (const { key } of REVIEW_QUEUE_FILTERS) {
    conteggi[key] = 0;
  }
  for (const row of rows || []) {
    for (const { key } of REVIEW_QUEUE_FILTERS) {
      if (matchesReviewQueueFilter(row, key)) conteggi[key] += 1;
    }
  }
  return conteggi;
};

/**
 * La ricerca libera: nome dell'atleta, titolo, tipo, chi ha caricato.
 *
 * Non cerca dentro il file e non ci prova: il fascicolo non indicizza contenuti,
 * e una ricerca che sembra farlo e peggio di una che dichiara di non farlo.
 */
export const searchReviewQueue = (
  rows: readonly DocumentReviewRow[] | null | undefined,
  query: string,
): DocumentReviewRow[] => {
  const testo = asText(query).toLowerCase();
  if (!testo) return [...(rows || [])];

  return (rows || []).filter((row) =>
    [
      row?.subjectName,
      row?.title,
      row?.documentKindLabel,
      getDocumentKindLabel(row?.documentKind),
      row?.submittedByName,
    ]
      .map((value) => asText(value).toLowerCase())
      .some((value) => value.includes(testo)),
  );
};

const ETICHETTE: Record<ReviewQueueState, string> = {
  missing: "In attesa di caricamento",
  overdue: "Scaduto",
  under_review: "Da verificare",
  approved: "Approvato",
  rejected: "Da integrare",
};

const CLASSI: Record<ReviewQueueState, string> = {
  missing: "border-slate-200 bg-slate-50 text-slate-700",
  overdue: "border-red-200 bg-red-50 text-red-700",
  under_review: "border-violet-200 bg-violet-50 text-violet-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-amber-200 bg-amber-50 text-amber-700",
};

export const getReviewQueueStateLabel = (state: unknown) =>
  ETICHETTE[String(state ?? "") as ReviewQueueState] || "Da verificare";

export const getReviewQueueStateClassName = (state: unknown) =>
  CLASSI[String(state ?? "") as ReviewQueueState] ||
  "border-slate-200 bg-slate-50 text-slate-700";

/**
 * Le azioni che una riga concede davvero.
 *
 * **Un pulsante che si vede e risponde 403 e un difetto quanto una porta
 * aperta.** Approvare, rifiutare e chiedere un'integrazione hanno senso solo
 * su un deposito che aspetta una decisione: su una richiesta senza file non
 * c'e niente da decidere, e su una gia decisa la tabella e append-only.
 */
export const reviewQueueActions = (row: DocumentReviewRow) => ({
  canOpen: Boolean(asText(row?.fileUrl)),
  canDecide: row?.state === "under_review" && Boolean(row?.submissionId),
  canRemind: row?.state === "missing" || row?.state === "overdue",
});
