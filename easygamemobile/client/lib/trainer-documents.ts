/**
 * Documenti di un allenatore — specchio di sola lettura di
 * `src/lib/trainer-documents.ts`. Modulo puro (nessuna rete, nessuno stato):
 * la normalizzazione e identica al Web, perche il record che arriva da
 * `GET /api/v1/trainers` (o `staff_members`) e lo stesso. Il mobile non
 * carica o sostituisce documenti — "per caricare o sostituire rivolgiti alla
 * segreteria", come sul Web — quindi qui non c'e `upsertTrainerDocument`.
 *
 * Il download del file (`fileUrl` = `attachment:<id>`) non e implementato in
 * questo giro: richiede una richiesta autenticata a `/api/v1/attachments/:id`
 * col Bearer token e un modo di aprire il byte risultante sul dispositivo
 * (serve `expo-file-system`/`expo-sharing`, non dipendenze del progetto oggi)
 * — gap dichiarato, non dimenticato. La schermata mostra i metadati e lo
 * stato, non un pulsante che aprirebbe un link che il browser del telefono
 * non puo autenticare (il mobile usa un Bearer token, non un cookie).
 */

export type TrainerDocumentTypeId =
  | "contratto"
  | "documento-identita"
  | "certificato"
  | "assicurazione"
  | "altro";

const TYPE_LABELS: Record<TrainerDocumentTypeId, string> = {
  contratto: "Contratto",
  "documento-identita": "Documento d'identità",
  certificato: "Certificato / attestato",
  assicurazione: "Assicurazione",
  altro: "Altro",
};

export type TrainerDocument = {
  id: string;
  type: TrainerDocumentTypeId;
  typeLabel: string;
  title: string;
  fileName: string;
  fileUrl: string;
  uploadedAt: string;
  expiryDate: string;
  notes: string;
};

export type TrainerDocumentStatus =
  | "valid"
  | "expiring"
  | "expired"
  | "no-expiry"
  | "missing-file";

export const TRAINER_DOCUMENT_EXPIRY_WARNING_DAYS = 30;

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
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\s_]+/g, "-");

  if (token in TYPE_LABELS) return token as TrainerDocumentTypeId;
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
  TYPE_LABELS[normalizeTrainerDocumentType(value)];

/** Accetta anche la forma dei "contratti" precedenti (`title`, `fileName`, `uploadDate`). */
export const normalizeTrainerDocument = (
  raw: unknown,
): TrainerDocument | null => {
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

/** I documenti di un allenatore, dal più recente. */
export const normalizeTrainerDocuments = (value: unknown): TrainerDocument[] =>
  (Array.isArray(value) ? value : [])
    .map(normalizeTrainerDocument)
    .filter((document): document is TrainerDocument => Boolean(document))
    .sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt));

/**
 * Vero quando il campo contiene qualcosa di apribile — stessa regola di
 * `hasAttachment` lato Web (`src/lib/attachments.ts`), ridotta ai due segni
 * che contano per decidere lo stato "file mancante": un riferimento
 * `attachment:<id>` o un `data:` URL storico. Non serve costruire l'URL qui
 * (il download non e implementato in questo giro — vedi la nota di testa).
 */
export const hasAttachmentReference = (value: unknown) => {
  const raw = text(value);
  if (!raw) return false;
  return /^attachment:/i.test(raw) || /^data:/i.test(raw);
};

export const resolveTrainerDocumentStatus = (
  document: Pick<TrainerDocument, "expiryDate" | "fileUrl">,
  today: Date = new Date(),
): TrainerDocumentStatus => {
  if (!hasAttachmentReference(document.fileUrl)) return "missing-file";
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
