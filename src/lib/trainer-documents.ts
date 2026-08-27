/**
 * Documenti di un allenatore.
 *
 * **Il difetto che questo modulo chiude** (RC Fix 1, punti 6, 7 e 9). I
 * documenti dell'allenatore erano un sotto-sistema a se, e non funzionava
 * nessuno dei tre gesti:
 *
 * - **caricare**: `addTrainerContract` leggeva e riscriveva
 *   `clubs.trainer_contracts`, una colonna **che non esiste**. La proiezione
 *   del server la scartava in lettura e la scrittura non aveva dove andare:
 *   il documento non veniva salvato da nessuna parte;
 * - **visualizzare**: la pagina `/trainers/:id/contracts` cercava
 *   l'allenatore dentro `clubs.members[].staff_data`, mentre gli allenatori
 *   stanno in `clubs.trainers`. Non trovandolo mostrava «Allenatore non
 *   trovato» e rimandava all'elenco — il difetto riferito come «Visualizza
 *   riporta indietro»;
 * - **rileggere**: la scheda allenatore leggeva `trainers[].contracts`, cioe
 *   un terzo posto ancora, che nessuno scriveva.
 *
 * Tre percorsi, tre posti diversi, zero coerenza. Qui ce n'e **uno**: il
 * documento e una voce dentro il record dell'allenatore e i byte stanno in
 * Attachment Core, come per certificati e allegati degli atleti. Il record
 * conserva solo il riferimento `attachment:<id>` — che e esattamente il
 * contratto documentato in `src/lib/attachments.ts`, non una seconda logica
 * documentale.
 *
 * Il modulo e **puro**: nessun DOM, nessuna rete. Quello che scrive e legge
 * lo decide chi lo usa.
 */

import { hasAttachment } from "./attachments";

export type TrainerDocumentTypeId =
  | "contratto"
  | "documento-identita"
  | "certificato"
  | "assicurazione"
  | "altro";

export type TrainerDocumentType = {
  id: TrainerDocumentTypeId;
  label: string;
  /** Un documento di questo tipo scade quasi sempre. */
  expires: boolean;
};

export const TRAINER_DOCUMENT_TYPES: TrainerDocumentType[] = [
  { id: "contratto", label: "Contratto", expires: true },
  { id: "documento-identita", label: "Documento d'identita", expires: true },
  { id: "certificato", label: "Certificato / attestato", expires: true },
  { id: "assicurazione", label: "Assicurazione", expires: true },
  { id: "altro", label: "Altro", expires: false },
];

const TYPE_BY_ID = new Map(TRAINER_DOCUMENT_TYPES.map((type) => [type.id, type]));

export type TrainerDocument = {
  id: string;
  /** Categoria dell'allegato: e anche la `category` di Attachment Core. */
  type: TrainerDocumentTypeId;
  typeLabel: string;
  title: string;
  fileName: string;
  /** `attachment:<id>`, oppure un data URL per i documenti anteriori a WP-15. */
  fileUrl: string;
  uploadedAt: string;
  expiryDate: string;
  notes: string;
};

/**
 * Stato di un documento.
 *
 * `missing-file` non e un errore dell'utente: e il documento registrato prima
 * che i file venissero davvero conservati. Dirlo per quello che e — «il file
 * non c'e, ricaricalo» — e piu utile che mostrare un pulsante Visualizza che
 * non apre niente.
 */
export type TrainerDocumentStatus =
  | "valid"
  | "expiring"
  | "expired"
  | "no-expiry"
  | "missing-file";

/** Giorni entro i quali una scadenza si considera imminente. */
export const TRAINER_DOCUMENT_EXPIRY_WARNING_DAYS = 30;

const text = (value: unknown) => String(value ?? "").trim();

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const trimmed = text(value);
    if (trimmed) return trimmed;
  }
  return "";
};

const toIsoDay = (value: unknown) => {
  const raw = text(value);
  if (!raw) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toISOString().slice(0, 10);
};

export const normalizeTrainerDocumentType = (
  value: unknown,
): TrainerDocumentTypeId => {
  const token = text(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_]+/g, "-");

  if (TYPE_BY_ID.has(token as TrainerDocumentTypeId)) {
    return token as TrainerDocumentTypeId;
  }
  if (token === "contract" || token === "contratti") return "contratto";
  if (
    token === "identita" ||
    token === "documento" ||
    token === "carta-identita" ||
    token === "identity-document"
  ) {
    return "documento-identita";
  }
  if (token === "attestato" || token === "certificate") return "certificato";
  if (token === "polizza" || token === "insurance") return "assicurazione";

  return "altro";
};

export const trainerDocumentTypeLabel = (value: unknown) =>
  TYPE_BY_ID.get(normalizeTrainerDocumentType(value))?.label || "Altro";

/**
 * Una voce salvata diventa un documento.
 *
 * Accetta anche la forma dei «contratti» precedenti (`title`, `fileName`,
 * `uploadDate`): quei record erano gia in archivio in qualche club e buttarli
 * via avrebbe fatto sparire dei documenti dalla scheda.
 */
export const normalizeTrainerDocument = (raw: unknown): TrainerDocument | null => {
  if (!raw || typeof raw !== "object") return null;

  const record = raw as Record<string, any>;
  const type = normalizeTrainerDocumentType(
    firstText(record.type, record.documentType, record.category, "contratto"),
  );
  const fileName = firstText(record.fileName, record.file_name, record.name);
  const title = firstText(record.title, record.name, fileName) || "Documento";
  const id =
    firstText(record.id) ||
    `trainer-doc-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return {
    id,
    type,
    typeLabel: trainerDocumentTypeLabel(type),
    title,
    fileName: fileName || title,
    fileUrl: firstText(record.fileUrl, record.file_url, record.url),
    uploadedAt: toIsoDay(
      firstText(
        record.uploadedAt,
        record.uploaded_at,
        record.uploadDate,
        record.upload_date,
        record.created_at,
        record.date,
      ),
    ),
    expiryDate: toIsoDay(
      firstText(record.expiryDate, record.expiry_date, record.scadenza),
    ),
    notes: firstText(record.notes, record.description),
  };
};

/** I documenti di un allenatore, dal piu recente. */
export const normalizeTrainerDocuments = (value: unknown): TrainerDocument[] =>
  (Array.isArray(value) ? value : [])
    .map(normalizeTrainerDocument)
    .filter((document): document is TrainerDocument => Boolean(document))
    .sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt));

/**
 * Dove sono i documenti dentro il record dell'allenatore.
 *
 * `contracts` e il nome che usavano le schermate precedenti: si continua a
 * leggerlo, perche e li che finivano le voci registrate finora.
 */
export const getTrainerDocumentsFromRecord = (trainer: unknown) => {
  const record =
    trainer && typeof trainer === "object" ? (trainer as Record<string, any>) : {};

  const stored = Array.isArray(record.documents)
    ? record.documents
    : Array.isArray(record.contracts)
      ? record.contracts
      : [];

  return normalizeTrainerDocuments(stored);
};

export const resolveTrainerDocumentStatus = (
  document: Pick<TrainerDocument, "expiryDate" | "fileUrl">,
  today: Date = new Date(),
): TrainerDocumentStatus => {
  if (!hasAttachment(document.fileUrl)) return "missing-file";
  if (!document.expiryDate) return "no-expiry";

  const expiry = new Date(`${document.expiryDate}T00:00:00Z`);
  if (Number.isNaN(expiry.getTime())) return "no-expiry";

  const reference = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const days = Math.floor((expiry.getTime() - reference) / 86400000);

  if (days < 0) return "expired";
  if (days <= TRAINER_DOCUMENT_EXPIRY_WARNING_DAYS) return "expiring";
  return "valid";
};

export const TRAINER_DOCUMENT_STATUS_LABELS: Record<
  TrainerDocumentStatus,
  string
> = {
  valid: "Valido",
  expiring: "In scadenza",
  expired: "Scaduto",
  "no-expiry": "Senza scadenza",
  "missing-file": "File mancante",
};

export const TRAINER_DOCUMENT_STATUS_CLASSES: Record<
  TrainerDocumentStatus,
  string
> = {
  valid: "border-emerald-200 bg-emerald-50 text-emerald-700",
  expiring: "border-amber-200 bg-amber-50 text-amber-800",
  expired: "border-red-200 bg-red-50 text-red-700",
  "no-expiry": "border-slate-200 bg-slate-100 text-slate-600",
  "missing-file": "border-slate-200 bg-slate-100 text-slate-600",
};

/**
 * Inserisce o sostituisce un documento, restituendo l'elenco completo.
 *
 * Sostituire per `id` invece di aggiungere sempre in coda e quello che rende
 * «Sostituisci» un'operazione e non due: il riferimento all'allegato resta lo
 * stesso, quindi non esiste l'istante in cui la riga punta a un file
 * cancellato.
 */
export const upsertTrainerDocument = (
  documents: unknown,
  document: TrainerDocument,
): TrainerDocument[] => {
  const current = normalizeTrainerDocuments(documents);
  const index = current.findIndex((entry) => entry.id === document.id);
  const next =
    index >= 0
      ? current.map((entry, position) =>
          position === index ? document : entry,
        )
      : [...current, document];

  return normalizeTrainerDocuments(next);
};

export const removeTrainerDocument = (
  documents: unknown,
  documentId: string,
): TrainerDocument[] =>
  normalizeTrainerDocuments(documents).filter(
    (document) => document.id !== text(documentId),
  );

/** Il nome con cui il documento deve arrivare a chi lo scarica. */
export const trainerDocumentDownloadName = (
  document: Pick<TrainerDocument, "typeLabel" | "fileName" | "expiryDate" | "uploadedAt">,
  trainerName: string,
) => ({
  documentType: document.typeLabel,
  fullName: text(trainerName) || null,
  date: document.expiryDate || document.uploadedAt || null,
  fileName: document.fileName || null,
});
