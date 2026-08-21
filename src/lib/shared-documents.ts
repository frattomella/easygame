export type SharedDocumentRole = "club" | "parent";

export type SharedDocumentStatus =
  | "required"
  | "uploaded"
  | "under_review"
  | "approved"
  | "rejected";

export type SharedDocumentType =
  | "medical_certificate"
  | "enrollment"
  | "identity_document"
  | "privacy"
  | "membership"
  | "payment_receipt"
  | "other";

export type SharedDocument = {
  id: string;
  organizationId: string;
  athleteId?: string;
  parentUserId?: string;
  uploadedByUserId?: string;
  uploadedByRole: SharedDocumentRole;
  title: string;
  description?: string;
  documentType: SharedDocumentType;
  fileUrl?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  status: SharedDocumentStatus;
  required: boolean;
  dueDate?: string;
  rejectionReason?: string;
  visibleToParent: boolean;
  assetId?: string;
  uploadedAt?: string;
  lastReminderAt?: string;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
  data?: Record<string, any>;
};

export const SHARED_DOCUMENT_TYPES: Array<{
  value: SharedDocumentType;
  label: string;
}> = [
  { value: "medical_certificate", label: "Certificato medico" },
  { value: "enrollment", label: "Iscrizione" },
  { value: "identity_document", label: "Documento identita" },
  { value: "privacy", label: "Privacy" },
  { value: "membership", label: "Tesseramento" },
  { value: "payment_receipt", label: "Ricevuta pagamento" },
  { value: "other", label: "Altro" },
];

export const asRecord = (value: unknown): Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

export const asArray = <T = any>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

export const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }

  return "";
};

export const toIsoString = (value: unknown) => {
  const text = firstText(value);
  if (!text) return "";
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toISOString();
};

const normalizeToken = (value: unknown) =>
  firstText(value)
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

export const normalizeSharedDocumentStatus = (
  value: unknown,
): SharedDocumentStatus => {
  const token = normalizeToken(value);

  if (["required", "richiesto", "missing", "mancante"].includes(token)) {
    return "required";
  }

  if (["under_review", "in_verifica", "verifica", "pending_review"].includes(token)) {
    return "under_review";
  }

  if (["approved", "approvato", "valid", "validato"].includes(token)) {
    return "approved";
  }

  if (["rejected", "rifiutato", "respinto"].includes(token)) {
    return "rejected";
  }

  return "uploaded";
};

export const normalizeSharedDocumentType = (value: unknown): SharedDocumentType => {
  const token = normalizeToken(value);

  if (["medical_certificate", "certificato_medico", "certificate"].includes(token)) {
    return "medical_certificate";
  }
  if (["enrollment", "iscrizione", "registration"].includes(token)) {
    return "enrollment";
  }
  if (["identity_document", "documento_identita", "identity", "id"].includes(token)) {
    return "identity_document";
  }
  if (["privacy", "gdpr"].includes(token)) {
    return "privacy";
  }
  if (["membership", "tesseramento"].includes(token)) {
    return "membership";
  }
  if (["payment_receipt", "ricevuta", "receipt"].includes(token)) {
    return "payment_receipt";
  }

  return "other";
};

export const getSharedDocumentTypeLabel = (value: unknown) =>
  SHARED_DOCUMENT_TYPES.find(
    (option) => option.value === normalizeSharedDocumentType(value),
  )?.label || "Altro";

export const getSharedDocumentStatusLabel = (status: unknown) => {
  switch (normalizeSharedDocumentStatus(status)) {
    case "required":
      return "Richiesto";
    case "uploaded":
      return "Caricato";
    case "under_review":
      return "In verifica";
    case "approved":
      return "Approvato";
    case "rejected":
      return "Rifiutato";
    default:
      return "Caricato";
  }
};

export const getSharedDocumentStatusClassName = (status: unknown) => {
  switch (normalizeSharedDocumentStatus(status)) {
    case "required":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "uploaded":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "under_review":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "approved":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "rejected":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
};

export const normalizeSharedDocument = (
  value: unknown,
  index = 0,
  defaults: Partial<SharedDocument> = {},
): SharedDocument => {
  const record = asRecord(value);
  const nowIso = new Date().toISOString();
  const id =
    firstText(record.id, record.documentId, record.document_id, record.assetId, record.asset_id) ||
    `shared-document-${index}`;
  const status = normalizeSharedDocumentStatus(record.status || defaults.status);
  const required = Boolean(record.required ?? defaults.required ?? status === "required");
  const uploadedByRole =
    normalizeToken(record.uploadedByRole || record.uploaded_by_role || record.source) ===
    "parent"
      ? "parent"
      : "club";
  const visibleToParent = Boolean(
    record.visibleToParent ??
      record.visible_to_parent ??
      defaults.visibleToParent ??
      uploadedByRole === "parent",
  );

  return {
    id,
    organizationId: firstText(
      record.organizationId,
      record.organization_id,
      defaults.organizationId,
    ),
    athleteId: firstText(record.athleteId, record.athlete_id, defaults.athleteId),
    parentUserId: firstText(
      record.parentUserId,
      record.parent_user_id,
      defaults.parentUserId,
    ),
    uploadedByUserId: firstText(
      record.uploadedByUserId,
      record.uploaded_by_user_id,
      defaults.uploadedByUserId,
    ),
    uploadedByRole,
    title:
      firstText(record.title, record.name, record.label, defaults.title) ||
      "Documento",
    description: firstText(record.description, record.notes, defaults.description),
    documentType: normalizeSharedDocumentType(
      record.documentType || record.document_type || record.type || defaults.documentType,
    ),
    fileUrl: firstText(record.fileUrl, record.file_url, record.url, defaults.fileUrl),
    fileName: firstText(record.fileName, record.file_name, defaults.fileName),
    mimeType: firstText(record.mimeType, record.mime_type, defaults.mimeType),
    size:
      Number(record.size ?? record.fileSize ?? record.file_size ?? defaults.size) || 0,
    status,
    required,
    dueDate: firstText(record.dueDate, record.due_date, defaults.dueDate),
    rejectionReason: firstText(
      record.rejectionReason,
      record.rejection_reason,
      defaults.rejectionReason,
    ),
    visibleToParent,
    assetId: firstText(record.assetId, record.asset_id, defaults.assetId),
    uploadedAt: toIsoString(
      record.uploadedAt || record.uploaded_at || defaults.uploadedAt,
    ),
    lastReminderAt: toIsoString(
      record.lastReminderAt || record.last_reminder_at || defaults.lastReminderAt,
    ),
    archived: Boolean(record.archived ?? record.deleted ?? defaults.archived),
    createdAt:
      toIsoString(record.createdAt || record.created_at || defaults.createdAt) ||
      nowIso,
    updatedAt:
      toIsoString(record.updatedAt || record.updated_at || defaults.updatedAt) ||
      nowIso,
    data: {
      ...asRecord(record.data),
      templateId: firstText(record.templateId, record.template_id, record.data?.templateId),
      template_id: firstText(record.templateId, record.template_id, record.data?.template_id),
    },
  };
};

export const getSharedDocumentsFromAthlete = (
  athlete: any,
  options: { includeArchived?: boolean } = {},
) => {
  const data = asRecord(athlete?.data);
  const organizationId = firstText(
    athlete?.organization_id,
    athlete?.organizationId,
    athlete?.club_id,
    athlete?.clubId,
  );
  const athleteId = firstText(athlete?.id);
  const rawDocuments = [
    ...asArray(data.sharedDocuments),
    ...asArray(data.shared_documents),
    ...asArray(data.parentDocuments).map((document) => ({
      ...asRecord(document),
      uploadedByRole: "parent",
      visibleToParent: true,
    })),
    ...asArray(data.parent_documents).map((document) => ({
      ...asRecord(document),
      uploadedByRole: "parent",
      visibleToParent: true,
    })),
    ...asArray(data.documents).filter((document) => {
      const source = normalizeToken(
        asRecord(document).source || asRecord(document).scope,
      );
      return (
        Boolean(asRecord(document).visibleToParent) ||
        ["parent", "guardian", "athlete"].includes(source)
      );
    }),
  ];

  const seen = new Set<string>();
  return rawDocuments
    .map((document, index) =>
      normalizeSharedDocument(document, index, {
        organizationId,
        athleteId,
      }),
    )
    .filter((document) => {
      if (!options.includeArchived && document.archived) return false;
      const key = document.id || document.assetId;
      if (!key) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

export const serializeSharedDocument = (document: SharedDocument) => ({
  id: document.id,
  organizationId: document.organizationId,
  organization_id: document.organizationId,
  athleteId: document.athleteId || null,
  athlete_id: document.athleteId || null,
  parentUserId: document.parentUserId || null,
  parent_user_id: document.parentUserId || null,
  uploadedByUserId: document.uploadedByUserId || null,
  uploaded_by_user_id: document.uploadedByUserId || null,
  uploadedByRole: document.uploadedByRole,
  uploaded_by_role: document.uploadedByRole,
  title: document.title,
  description: document.description || "",
  documentType: document.documentType,
  document_type: document.documentType,
  fileUrl: document.fileUrl || "",
  file_url: document.fileUrl || "",
  fileName: document.fileName || "",
  file_name: document.fileName || "",
  mimeType: document.mimeType || "",
  mime_type: document.mimeType || "",
  size: document.size || 0,
  status: document.status,
  required: Boolean(document.required),
  dueDate: document.dueDate || "",
  due_date: document.dueDate || "",
  rejectionReason: document.rejectionReason || "",
  rejection_reason: document.rejectionReason || "",
  visibleToParent: Boolean(document.visibleToParent),
  visible_to_parent: Boolean(document.visibleToParent),
  assetId: document.assetId || "",
  asset_id: document.assetId || "",
  uploadedAt: document.uploadedAt || "",
  uploaded_at: document.uploadedAt || "",
  lastReminderAt: document.lastReminderAt || "",
  last_reminder_at: document.lastReminderAt || "",
  archived: Boolean(document.archived),
  createdAt: document.createdAt,
  created_at: document.createdAt,
  updatedAt: document.updatedAt,
  updated_at: document.updatedAt,
  data: document.data || {},
});

export const upsertSharedDocument = (
  documents: SharedDocument[],
  nextDocument: SharedDocument,
) => {
  const index = documents.findIndex((document) => document.id === nextDocument.id);
  if (index < 0) {
    return [...documents, nextDocument];
  }

  return documents.map((document, documentIndex) =>
    documentIndex === index ? nextDocument : document,
  );
};
