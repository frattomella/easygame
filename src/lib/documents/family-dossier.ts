/**
 * **Le tre aree del genitore**, ricavate dal fascicolo (Wave 6, lane 6E, §5.1).
 *
 * ---
 *
 * ## Il difetto che questo modulo chiude (W6-40)
 *
 * L'area famiglia mostrava due card, «Documenti richiesti» e «Documenti
 * caricati», e **erano la stessa lista frullata due volte**:
 * `parent-dashboard.ts` costruiva `requiredDocuments` come «i modelli di stampa
 * del club **piu** i caricamenti gia fatti che risultano obbligatori». Un
 * certificato consegnato a settembre compariva in tutte e due, con lo stesso
 * titolo e due stati che sembravano diversi. Il genitore lo ricaricava.
 *
 * ## La regola, in una riga
 *
 * > Una voce del fascicolo sta in **una** area sola, e l'area la decide una
 * > domanda: **la famiglia deve ancora fare qualcosa?**
 *
 * - **Sì** → `todo`. Sono le richieste senza risposta e quelle rifiutate: in
 *   tutti e due i casi il club sta aspettando un file.
 * - **No** → `archive`. Sono i file consegnati: in verifica, approvati, o
 *   approvati e ormai scaduti.
 *
 * **Perche un documento rifiutato sta fra le cose da fare e non in archivio.**
 * E la scelta che qualcuno rileggera, quindi va motivata: un rifiuto **e**
 * lavoro. Metterlo anche in archivio riprodurrebbe esattamente W6-40 — la
 * stessa carta in due elenchi — e metterlo **solo** in archivio nasconderebbe
 * l'unica cosa che la famiglia deve fare in una lista che non guarda. La riga
 * di `todo` porta con se il file rifiutato, la data e il motivo: non si perde
 * niente, e non si conta due volte.
 *
 * I depositi precedenti restano leggibili nello **storico** della voce, che
 * viaggia con lei in tutte e due le aree.
 *
 * ## La terza area non e qui
 *
 * I **moduli online** non sono file: sono compilazioni che il club pubblica e
 * il genitore riempie, e vivono nel dominio dei moduli (`forms.ts`,
 * `enrollment-requests.ts`). Questo modulo non prova a fingerli: l'area
 * famiglia li **richiama**, e la distinzione fra «un file da caricare» e «un
 * modulo da compilare» resta quella che e.
 *
 * Modulo **puro** e client-safe: nessun Prisma, nessuna rete, nessun DOM. Lo
 * importano il server che costruisce il payload e la schermata che lo mostra,
 * perche «da fare» deve voler dire la stessa cosa nei due posti.
 */

import {
  deriveDocumentDueState,
  type DocumentDossierState,
} from "./request-model";
import { getDocumentKindLabel, resolveDocumentKind } from "./kind-catalog";

const asText = (value: unknown) => String(value ?? "").trim();

/**
 * Lo stato che la famiglia legge.
 *
 * E il `DocumentDossierState` del dominio **piu** `overdue` e `expired`, che il
 * dominio calcola separatamente perche sono fatti della **data** e non del
 * deposito:
 *
 * - `overdue` — il club ha chiesto entro una data, la data e passata, il file
 *   non e arrivato;
 * - `expired` — il file c'e, e stato approvato, e la sua validita e finita. E
 *   lo stato che W6-50 dice mancare: il dominio lo calcola da sempre, e nessuna
 *   schermata sapeva nominarlo.
 */
export const FAMILY_DOCUMENT_STATES = [
  "missing",
  "overdue",
  "under_review",
  "approved",
  "expired",
  "rejected",
] as const;
export type FamilyDocumentState = (typeof FAMILY_DOCUMENT_STATES)[number];

const ETICHETTE: Record<FamilyDocumentState, string> = {
  missing: "Da caricare",
  overdue: "Scaduto",
  under_review: "Da verificare",
  approved: "Approvato",
  expired: "Scaduto",
  rejected: "Da integrare",
};

const CLASSI: Record<FamilyDocumentState, string> = {
  missing: "border-amber-200 bg-amber-50 text-amber-700",
  overdue: "border-red-200 bg-red-50 text-red-700",
  under_review: "border-violet-200 bg-violet-50 text-violet-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  expired: "border-red-200 bg-red-50 text-red-700",
  rejected: "border-red-200 bg-red-50 text-red-700",
};

export const getFamilyDocumentStateLabel = (state: unknown) =>
  ETICHETTE[String(state ?? "") as FamilyDocumentState] || "Da caricare";

export const getFamilyDocumentStateClassName = (state: unknown) =>
  CLASSI[String(state ?? "") as FamilyDocumentState] ||
  "border-slate-200 bg-slate-50 text-slate-700";

/**
 * L'unica azione che una riga propone.
 *
 * **Una CTA sola** e un requisito, non un'estetica: la card di prima ne aveva
 * fino a tre — «Scarica», «Carica», «Sostituisci» — e il genitore doveva
 * dedurre quale fosse la sua. Il download resta, ma non e l'azione: e un
 * accessorio della riga, e viaggia in un campo suo.
 */
export type FamilyDocumentAction = "upload" | "replace" | "none";

export type FamilyDocumentItem = {
  /** L'identificativo della voce: la richiesta, o il deposito se spontaneo. */
  id: string;
  requestId: string | null;
  submissionId: string | null;
  documentKind: string;
  documentKindLabel: string;
  title: string;
  /** Cosa il club si aspetta, con parole sue. Vuoto se non lo ha scritto. */
  description: string;
  state: FamilyDocumentState;
  stateLabel: string;
  required: boolean;
  /** Il termine entro cui consegnare. `null` quando non ce n'e uno. */
  dueDate: string | null;
  /** Giorni che mancano al termine: negativo se e passato. */
  daysLeft: number | null;
  /** La validita del file consegnato, quando il file ne dichiara una. */
  validUntil: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  /** Il motivo del rifiuto: e cio che dice alla famiglia cosa rifare. */
  rejectionReason: string | null;
  fileName: string;
  /** L'indirizzo da cui si scarica o si vede l'anteprima. Vuoto se non c'e. */
  fileUrl: string;
  mimeType: string;
  action: FamilyDocumentAction;
  actionLabel: string;
  /** Quanti depositi ha avuto questa voce, il corrente compreso. */
  historyCount: number;
};

export type FamilyDocumentAreas = {
  /** DA FARE: cio che il club sta aspettando. */
  todo: FamilyDocumentItem[];
  /** DOCUMENTI: l'archivio di cio che e stato consegnato. */
  archive: FamilyDocumentItem[];
};

/**
 * La forma minima di una voce del fascicolo che serve qui.
 *
 * E dichiarata invece di importare `DocumentDossierEntry` da
 * `src/lib/server/document-requests.ts`: quel modulo parla con Prisma, e questo
 * lo importano anche le schermate. Il contratto e strutturale, e il typecheck
 * lo verifica al punto di chiamata.
 */
export type FamilyDossierInput = {
  id: string;
  requestId: string | null;
  documentKind: string;
  title: string;
  description: string | null;
  required: boolean;
  dueDate: string | null;
  state: {
    status: string;
    dossier: DocumentDossierState;
    submissionId: string | null;
    attachmentId: string | null;
    submittedAt: string | null;
    decidedAt: string | null;
    decisionNote: string | null;
    historyCount: number;
    overdue: boolean;
  };
};

/** Cio che Attachment Core sa del file, e che il fascicolo non ha. */
export type FamilyDossierFile = {
  fileName?: string | null;
  mimeType?: string | null;
  url?: string | null;
  validUntil?: string | null;
};

const AZIONI: Record<FamilyDocumentAction, string> = {
  upload: "Carica",
  replace: "Ricarica",
  none: "",
};

/**
 * Lo stato della famiglia, dallo stato del dominio piu le due date.
 *
 * L'ordine dei rami non e indifferente: **il rifiuto vince su tutto**, perche e
 * l'unico che chiede di rifare qualcosa, e una scadenza passata su un documento
 * rifiutato resta comunque un documento da rifare.
 */
export const deriveFamilyDocumentState = (
  entry: FamilyDossierInput,
  file: FamilyDossierFile | null,
  now: Date,
): FamilyDocumentState => {
  const dossier = entry?.state?.dossier;

  if (dossier === "rejected") return "rejected";
  if (dossier === "under_review") return "under_review";

  if (dossier === "approved") {
    /*
      W6-50. La validita del file e un fatto suo, e non ha niente a che vedere
      con il termine di consegna: un certificato consegnato per tempo scade
      comunque un anno dopo. Senza questo ramo l'area famiglia mostrava
      «Approvato» su un certificato scaduto da mesi — che e il modo in cui un
      ragazzo scende in campo senza copertura.
    */
    const validita = deriveDocumentDueState(file?.validUntil ?? null, now);
    return validita.state === "overdue" ? "expired" : "approved";
  }

  /* Niente deposito: e mancante, e diventa «scaduto» quando il termine passa. */
  return entry?.state?.overdue ? "overdue" : "missing";
};

const azionePerStato = (state: FamilyDocumentState): FamilyDocumentAction => {
  if (state === "rejected" || state === "expired") return "replace";
  if (state === "missing" || state === "overdue") return "upload";
  /* In verifica e approvato: la famiglia non deve fare niente, e non si finge. */
  return "none";
};

const toItem = (
  entry: FamilyDossierInput,
  file: FamilyDossierFile | null,
  now: Date,
): FamilyDocumentItem => {
  const state = deriveFamilyDocumentState(entry, file, now);
  const due = deriveDocumentDueState(entry?.dueDate ?? null, now);
  const action = azionePerStato(state);
  const kind = resolveDocumentKind(entry?.documentKind);

  return {
    id: asText(entry?.id),
    requestId: entry?.requestId || null,
    submissionId: entry?.state?.submissionId || null,
    documentKind: kind,
    documentKindLabel: getDocumentKindLabel(kind),
    title: asText(entry?.title) || getDocumentKindLabel(kind),
    description: asText(entry?.description),
    state,
    stateLabel: getFamilyDocumentStateLabel(state),
    required: Boolean(entry?.required),
    dueDate: due.dueDate,
    daysLeft: due.daysLeft,
    validUntil: file?.validUntil || null,
    submittedAt: entry?.state?.submittedAt || null,
    decidedAt: entry?.state?.decidedAt || null,
    rejectionReason:
      state === "rejected" ? entry?.state?.decisionNote || null : null,
    fileName: asText(file?.fileName),
    fileUrl: asText(file?.url),
    mimeType: asText(file?.mimeType),
    action,
    actionLabel: AZIONI[action],
    historyCount: Number(entry?.state?.historyCount || 0),
  };
};

/**
 * Vero quando la famiglia deve ancora fare qualcosa.
 *
 * E l'unica domanda che separa le due aree, ed e esportata perche il test la
 * interroghi direttamente invece di dedurla dagli elenchi.
 */
export const familyMustAct = (state: FamilyDocumentState) =>
  state === "missing" || state === "overdue" || state === "rejected" ||
  state === "expired";

/**
 * Il fascicolo diviso in due aree, senza doppioni.
 *
 * `files` mappa l'identificativo dell'allegato ai metadati che Attachment Core
 * possiede e il fascicolo no — nome, tipo, indirizzo, validita. Puo mancare: la
 * riga resta, senza pulsante di download, invece di sparire.
 */
export const buildFamilyDocumentAreas = (
  entries: readonly FamilyDossierInput[] | null | undefined,
  files: ReadonlyMap<string, FamilyDossierFile> | null | undefined,
  options: { now?: Date } = {},
): FamilyDocumentAreas => {
  const now = options.now || new Date();
  const todo: FamilyDocumentItem[] = [];
  const archive: FamilyDocumentItem[] = [];

  for (const entry of entries || []) {
    /*
      Una richiesta annullata non e ne un compito ne un documento: il club ha
      ritirato la domanda. Resta in archivio nel senso dell'audit — la riga non
      si cancella — ma non ha niente da dire a una famiglia.
    */
    if (entry?.state?.status === "cancelled") continue;

    const allegato = entry?.state?.attachmentId
      ? files?.get(entry.state.attachmentId) || null
      : null;
    const item = toItem(entry, allegato, now);

    if (familyMustAct(item.state)) {
      todo.push(item);
    } else {
      archive.push(item);
    }
  }

  /*
    Le cose da fare si ordinano per **urgenza**: prima cio che ha un termine, e
    prima il termine piu vicino. Chi non ha termine viene dopo, perche non c'e
    niente che lo renda piu urgente di una scadenza.
  */
  todo.sort((left, right) => {
    const sinistra = left.daysLeft === null ? Number.MAX_SAFE_INTEGER : left.daysLeft;
    const destra = right.daysLeft === null ? Number.MAX_SAFE_INTEGER : right.daysLeft;
    if (sinistra !== destra) return sinistra - destra;
    return left.title.localeCompare(right.title);
  });

  /* L'archivio si ordina per consegna, dal piu recente: e come lo si sfoglia. */
  archive.sort((left, right) =>
    asText(right.submittedAt).localeCompare(asText(left.submittedAt)),
  );

  return { todo, archive };
};
