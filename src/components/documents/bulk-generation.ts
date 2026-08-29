/**
 * Il lotto di generazione documentale: le sue regole, senza React e senza rete.
 *
 * **Perche non sta dentro il dialogo.** Le tre cose che in un lotto si possono
 * davvero rompere — quanti soggetti stanno in una chiamata, quale
 * identificativo porta l'intero lotto, cosa resta da fare dopo che qualcuno ha
 * ricaricato la pagina — non hanno niente a che vedere con il disegno di una
 * finestra, e collaudarle montando un dialogo vorrebbe dire non collaudarle.
 *
 * **Da dove viene la forma.** E l'invio a lotti di Wave 2
 * (`BULK_BATCH_SIZE` in `src/lib/server/communications.ts`, e il
 * `communication_id` conservato dalla pagina Comunicazioni): un identificativo
 * dichiarato dal client, conservato per la durata della scheda, che rende
 * innocuo il secondo tentativo. L'unico numero diverso e la dimensione della
 * fetta — cinquanta e non duecento, perche qui ogni elemento e una risoluzione
 * di segnaposto con letture di cassa e presenze, non una riga di posta.
 */

import { MAX_GENERATION_BATCH } from "@/lib/documents/template-model";

/**
 * Quanti soggetti stanno in **una** chiamata.
 *
 * Non e un numero di questa schermata: e `MAX_GENERATION_BATCH`, il tetto che
 * la rotta usa per **rifiutare**. Ricopiarlo qui vorrebbe dire due numeri che
 * un giorno divergono, e la divergenza si vedrebbe solo oltre il cinquantunesimo
 * atleta — cioe in produzione, su un lotto grande, con la segreteria che
 * aspetta. Il modulo di dominio lo dichiara apposta client-safe.
 */
export const BULK_GENERATION_SLICE = MAX_GENERATION_BATCH;

/**
 * Dove vive il lotto in corso.
 *
 * `sessionStorage` e la durata giusta, per la stessa ragione della
 * comunicazione in Wave 2: il lotto che sto generando appartiene a questa
 * scheda, e chiuderla significa davvero ricominciare. In uno stato di React
 * non sopravviverebbe a un F5, e ripartire con un identificativo nuovo
 * significherebbe rigenerare da capo i primi cinquanta.
 */
export const BULK_BATCH_STORAGE_KEY = "easygame.documents.bulk-batch.v1";

export type BulkSubject = {
  id: string;
  /** Il nome, congelato: serve nell'esito anche per chi e fallito. */
  label: string;
};

export type BulkFailure = {
  id: string;
  label: string;
  /** Il motivo che ha detto il server, non una riscrittura ottimista. */
  reason: string;
};

/** Chi e stato prodotto ma con dei campi rimasti bianchi. */
export type BulkBlank = {
  id: string;
  label: string;
  keys: string[];
};

export type BulkBatchState = {
  batchId: string;
  templateId: string;
  templateTitle: string;
  subjectKind: string;
  seasonId: string | null;
  subjects: BulkSubject[];
  /** Gli id dei documenti prodotti: e da qui che nasce il fascicolo. */
  producedIds: string[];
  /**
   * Quanti, fra i prodotti, **c'erano gia** in questo lotto.
   *
   * «Cinquanta documenti» e «cinquanta ce n'erano gia» sono due risposte
   * diverse, e chi riprende un lotto ha diritto di sapere quale delle due e
   * successa: senza, una ripresa sembra un lavoro fatto due volte.
   */
  reusedCount: number;
  /** I soggetti gia serviti da una fetta chiusa, riusciti o falliti. */
  servedSubjectIds: string[];
  failures: BulkFailure[];
  blanks: BulkBlank[];
};

const asText = (value: unknown) => String(value ?? "").trim();

/**
 * L'identificativo del lotto, generato **una volta sola** al suo avvio.
 *
 * `randomUUID` non c'e su ogni browser in cui questa pagina gira: il ripiego
 * non deve essere elegante, deve solo non collidere con il lotto di cinque
 * minuti fa nella stessa scheda.
 */
export const newBatchId = () =>
  typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `batch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Le fette, mai piu grandi del tetto.
 *
 * Il parametro esiste per i test: e comunque limitato al tetto, perche una
 * fetta piu grande la rifiuterebbe il server.
 */
export const sliceSubjects = (
  subjects: readonly BulkSubject[],
  size: number = BULK_GENERATION_SLICE,
): BulkSubject[][] => {
  const step = Math.max(1, Math.min(Math.floor(size) || 1, BULK_GENERATION_SLICE));
  const slices: BulkSubject[][] = [];

  for (let index = 0; index < subjects.length; index += step) {
    slices.push(subjects.slice(index, index + step));
  }

  return slices;
};

/** Quante chiamate servono per N soggetti. E cio che si dice all'utente. */
export const sliceCount = (
  total: number,
  size: number = BULK_GENERATION_SLICE,
) => {
  const step = Math.max(1, Math.min(Math.floor(size) || 1, BULK_GENERATION_SLICE));
  return Math.max(0, Math.ceil(Math.max(0, total) / step));
};

export const startBatch = (input: {
  templateId: string;
  templateTitle: string;
  subjectKind: string;
  seasonId: string | null;
  subjects: readonly BulkSubject[];
}): BulkBatchState => {
  const seen = new Set<string>();
  const subjects: BulkSubject[] = [];

  for (const subject of input.subjects) {
    const id = asText(subject?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    subjects.push({ id, label: asText(subject?.label) });
  }

  return {
    batchId: newBatchId(),
    templateId: asText(input.templateId),
    templateTitle: asText(input.templateTitle),
    subjectKind: asText(input.subjectKind) || "athlete",
    seasonId: input.seasonId || null,
    subjects,
    producedIds: [],
    reusedCount: 0,
    servedSubjectIds: [],
    failures: [],
    blanks: [],
  };
};

/** Cosa resta da fare: e questo che rende ripartibile il lotto. */
export const pendingSubjects = (state: BulkBatchState): BulkSubject[] => {
  const served = new Set(state.servedSubjectIds);
  return state.subjects.filter((subject) => !served.has(subject.id));
};

export const batchProgress = (state: BulkBatchState) => {
  const total = state.subjects.length;
  const served = Math.min(state.servedSubjectIds.length, total);

  return {
    total,
    served,
    percent: total ? Math.round((served / total) * 100) : 0,
    done: total > 0 && served >= total,
  };
};

/**
 * Cio che una fetta ha lasciato: si somma, non si sostituisce.
 *
 * Una fetta non sa niente delle altre, e l'esito di un lotto e la somma delle
 * sue fette: sovrascrivere qui vorrebbe dire perdere i falliti della prima
 * appena parte la seconda, cioe consegnare novantasette documenti dicendo che
 * sono cento.
 */
export const applySliceOutcome = (
  state: BulkBatchState,
  outcome: {
    produced: Array<{
      id: string;
      subjectId: string;
      label: string;
      missing: string[];
      /** Vero quando la riga esisteva gia in questo lotto. */
      reused?: boolean;
    }>;
    failed: Array<{ subjectId: string; reason: string }>;
  },
): BulkBatchState => {
  const labelOf = (subjectId: string) =>
    state.subjects.find((subject) => subject.id === subjectId)?.label || subjectId;

  const producedIds = [...state.producedIds];
  let reusedCount = state.reusedCount;
  const blanks = [...state.blanks];
  const served = new Set(state.servedSubjectIds);

  for (const document of outcome.produced) {
    if (!producedIds.includes(document.id)) producedIds.push(document.id);
    if (document.reused) reusedCount += 1;
    served.add(document.subjectId);

    if (document.missing.length) {
      blanks.push({
        id: document.subjectId,
        label: document.label || labelOf(document.subjectId),
        keys: document.missing,
      });
    }
  }

  const failures = [...state.failures];
  for (const failure of outcome.failed) {
    served.add(failure.subjectId);
    failures.push({
      id: failure.subjectId,
      label: labelOf(failure.subjectId),
      reason: failure.reason,
    });
  }

  return {
    ...state,
    producedIds,
    reusedCount,
    blanks,
    failures,
    servedSubjectIds: Array.from(served),
  };
};

/**
 * Riprova **solo** i falliti, con lo stesso `batchId`.
 *
 * Lo stesso identificativo e il punto: l'indice unico
 * `(organization_id, batch_id, subject_kind, subject_id)` fa si che i
 * novantasette gia prodotti non si duplichino nemmeno se qualcuno li
 * rispedisse. Qui pero non si rispediscono: tornano in coda solo i tre che
 * hanno fallito, e i loro motivi si azzerano perche stanno per essere
 * riscritti.
 */
export const retryFailures = (state: BulkBatchState): BulkBatchState => {
  const retrying = new Set(state.failures.map((failure) => failure.id));

  return {
    ...state,
    failures: [],
    servedSubjectIds: state.servedSubjectIds.filter((id) => !retrying.has(id)),
  };
};

const looksLikeBatch = (value: any): value is BulkBatchState =>
  Boolean(
    value &&
      typeof value === "object" &&
      typeof value.batchId === "string" &&
      value.batchId &&
      typeof value.templateId === "string" &&
      Array.isArray(value.subjects),
  );

export const readStoredBatch = (): BulkBatchState | null => {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(BULK_BATCH_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!looksLikeBatch(parsed)) return null;

    return {
      ...parsed,
      subjects: parsed.subjects.filter((subject: any) => subject?.id),
      producedIds: Array.isArray(parsed.producedIds) ? parsed.producedIds : [],
      reusedCount: Number(parsed.reusedCount) || 0,
      servedSubjectIds: Array.isArray(parsed.servedSubjectIds)
        ? parsed.servedSubjectIds
        : [],
      failures: Array.isArray(parsed.failures) ? parsed.failures : [],
      blanks: Array.isArray(parsed.blanks) ? parsed.blanks : [],
    };
  } catch {
    /* Sessione senza storage, o riga illeggibile: si riparte da zero. */
    return null;
  }
};

export const writeStoredBatch = (state: BulkBatchState) => {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(BULK_BATCH_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /*
      La ripresa degrada, non sparisce: senza storage il lotto resta corretto
      finche la pagina non viene ricaricata, e i doppioni li impedisce comunque
      il database.
    */
  }
};

export const clearStoredBatch = () => {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(BULK_BATCH_STORAGE_KEY);
  } catch {
    /* Come sopra. */
  }
};
