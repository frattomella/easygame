import type { StatusSpec } from "@/lib/web/status";
import { CERTIFICATE_STATUS } from "@/lib/web/status";
import {
  REVIEW_QUEUE_FILTERS,
  matchesReviewQueueFilter,
  type DocumentReviewRow,
  type ReviewQueueFilter,
  type ReviewQueueState,
} from "@/lib/documents/review-queue";
import type { ViewDef } from "@/components/web/datagrid/types";

/**
 * Il modello della coda «documenti da verificare» per il Web V2 (audit
 * `docs/redesign/audit/wave-e-documenti.md`).
 *
 * Le **regole** restano nel dominio (`src/lib/documents/review-queue.ts`):
 * quale riga passa quale filtro, quali azioni una riga concede, cosa cerca
 * la ricerca. Qui vive solo cio che serve alla griglia: le viste ricavate
 * dai sette filtri, le pillole di stato con la parola della V1, l'etichetta
 * della fonte.
 */

const spec = (label: string, weight: StatusSpec["weight"], hue: StatusSpec["hue"]): StatusSpec =>
  Object.freeze({ label, weight, hue });

/**
 * Le parole della coda, le stesse della V1 (`ETICHETTE` in `review-queue.ts`)
 * e della famiglia: segreteria e genitore devono poter dire al telefono la
 * stessa parola sullo stesso documento. `src/lib/web/status.ts` non le ha
 * tutte («Da integrare», «In attesa di caricamento», «Da verificare»): la
 * spec locale ha la stessa forma `{label, weight, hue}` ed e segnalata nel
 * rapporto perche il lead la promuova.
 */
export const REVIEW_QUEUE_STATUS: Record<ReviewQueueState, StatusSpec> = Object.freeze({
  missing: spec("IN ATTESA DI CARICAMENTO", "quiet", "neutral"),
  overdue: CERTIFICATE_STATUS.expired,
  under_review: spec("DA VERIFICARE", "solid", "amber"),
  approved: spec("APPROVATO", "solid", "green"),
  rejected: spec("DA INTEGRARE", "outline", "amber"),
});

export const reviewQueueStatusSpec = (state: unknown): StatusSpec =>
  REVIEW_QUEUE_STATUS[String(state ?? "") as ReviewQueueState] || REVIEW_QUEUE_STATUS.under_review;

/** Chi ha caricato: la famiglia, la segreteria, o un modulo pubblico. */
export const REVIEW_SOURCE_LABELS: Record<string, string> = {
  parent: "Famiglia",
  club: "Segreteria",
  public_form: "Modulo pubblico",
};

export const reviewSourceLabel = (source: string | null | undefined): string => {
  const key = String(source || "").trim();
  if (!key) return "";
  return REVIEW_SOURCE_LABELS[key] || key;
};

/** Il filtro «Coda» della griglia: le sette pastiglie della V1, «Tutti» escluso. */
export const REVIEW_QUEUE_FILTER_OPTIONS = REVIEW_QUEUE_FILTERS.filter((voce) => voce.key !== "all");

export const isReviewQueueFilter = (value: unknown): value is ReviewQueueFilter =>
  REVIEW_QUEUE_FILTERS.some((voce) => voce.key === value);

/**
 * Le viste della griglia nascono dalle pastiglie della V1: «Nuovi» e la
 * prima colonna di lavoro di una segreteria ed e la vista predefinita, come
 * lo era il filtro `new`. «Scaduti» porta la tinta di un problema.
 */
export const REVIEW_QUEUE_VIEWS: ViewDef[] = REVIEW_QUEUE_FILTER_OPTIONS.map((voce) => ({
  id: voce.key,
  label: voce.label,
  filters: { queue: voce.key },
  builtIn: true,
  isDefault: voce.key === "new",
  tone: voce.key === "overdue" ? "red" : voce.key === "to_fix" ? "amber" : "neutral",
}));

export const rowPassesQueueFilter = (row: DocumentReviewRow, value: unknown): boolean =>
  isReviewQueueFilter(value) ? matchesReviewQueueFilter(row, value) : true;

/** La chiave di riga: la richiesta, o il deposito se spontaneo. */
export const reviewRowId = (row: DocumentReviewRow): string => `${row.id}:${row.submissionId || "vuoto"}`;

/** L'identificativo su cui il server decide: il deposito, o la richiesta. */
export const reviewDecisionTarget = (row: DocumentReviewRow): string => row.submissionId || row.id;

export type ReviewDecision = "approved" | "rejected";
