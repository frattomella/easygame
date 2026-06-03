export type OnlineFormStatus = "draft" | "published" | "archived";

export type OnlineFormFieldType =
  | "short_text"
  | "long_text"
  | "number"
  | "email"
  | "phone"
  | "date"
  | "single_choice"
  | "multiple_choice"
  | "checkbox"
  | "dropdown"
  | "file_upload"
  | "image"
  | "video"
  | "signature"
  | "section"
  | "divider"
  | "consent";

export type OnlineFormField = {
  id: string;
  type: OnlineFormFieldType;
  label: string;
  description?: string;
  required: boolean;
  options?: string[];
  placeholder?: string;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    acceptedFileTypes?: string[];
    maxFileSizeMb?: number;
  };
};

export type OnlineFormSettings = {
  collectEmail?: boolean;
  allowMultipleResponses?: boolean;
  requireParentSignature?: boolean;
  notifyClubOnSubmit?: boolean;
  successMessage?: string;
  closeAt?: string;
};

export type OnlineForm = {
  id: string;
  type: "online_form";
  organizationId: string;
  organization_id?: string;
  title: string;
  description?: string;
  status: OnlineFormStatus;
  publicSlug: string;
  public_slug?: string;
  requiresAuth: boolean;
  requires_auth?: boolean;
  linkedAthleteId?: string;
  linked_athlete_id?: string;
  categoryIds?: string[];
  category_ids?: string[];
  fields: OnlineFormField[];
  settings: OnlineFormSettings;
  createdAt: string;
  created_at?: string;
  updatedAt: string;
  updated_at?: string;
};

export type OnlineFormSubmissionStatus =
  | "submitted"
  | "reviewed"
  | "approved"
  | "rejected";

export type OnlineFormSubmissionFile = {
  fieldId: string;
  fieldLabel?: string;
  fileName: string;
  fileUrl: string;
  assetId?: string;
  mimeType?: string;
  size?: number;
};

export type OnlineFormSubmission = {
  id: string;
  type: "online_form_submission";
  organizationId: string;
  organization_id?: string;
  formId: string;
  form_id?: string;
  athleteId?: string;
  athlete_id?: string;
  parentUserId?: string;
  parent_user_id?: string;
  respondentName?: string;
  respondent_name?: string;
  respondentEmail?: string;
  respondent_email?: string;
  answers: Record<string, any>;
  files?: OnlineFormSubmissionFile[];
  submittedAt: string;
  submitted_at?: string;
  status: OnlineFormSubmissionStatus;
};

export type OnlineFormBundle = {
  forms: OnlineForm[];
  submissions: OnlineFormSubmission[];
};

export const ONLINE_FORM_STORAGE_TYPE = "online_form";
export const ONLINE_FORM_SUBMISSION_STORAGE_TYPE = "online_form_submission";

export const ONLINE_FORM_FIELD_OPTIONS: Array<{
  value: OnlineFormFieldType;
  label: string;
}> = [
  { value: "short_text", label: "Testo breve" },
  { value: "long_text", label: "Testo lungo" },
  { value: "number", label: "Numero" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Telefono" },
  { value: "date", label: "Data" },
  { value: "single_choice", label: "Scelta singola" },
  { value: "multiple_choice", label: "Scelta multipla" },
  { value: "checkbox", label: "Checkbox" },
  { value: "dropdown", label: "Menu a tendina" },
  { value: "file_upload", label: "Upload file" },
  { value: "image", label: "Foto/immagine" },
  { value: "video", label: "Link video" },
  { value: "signature", label: "Firma" },
  { value: "section", label: "Sezione" },
  { value: "divider", label: "Divisore" },
  { value: "consent", label: "Consenso/privacy" },
];

export const ONLINE_FORM_STATUS_LABELS: Record<OnlineFormStatus, string> = {
  draft: "Bozza",
  published: "Pubblicato",
  archived: "Archiviato",
};

export const ONLINE_FORM_SUBMISSION_STATUS_LABELS: Record<
  OnlineFormSubmissionStatus,
  string
> = {
  submitted: "Inviata",
  reviewed: "Esaminata",
  approved: "Approvata",
  rejected: "Rifiutata",
};

const CHOICE_FIELD_TYPES = new Set<OnlineFormFieldType>([
  "single_choice",
  "multiple_choice",
  "dropdown",
]);

const FILE_FIELD_TYPES = new Set<OnlineFormFieldType>([
  "file_upload",
  "image",
  "signature",
]);

const READ_ONLY_FIELD_TYPES = new Set<OnlineFormFieldType>([
  "section",
  "divider",
]);

export const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const asArray = <T = any>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

export const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }

  return "";
};

const toIsoString = (value: unknown, fallback = new Date().toISOString()) => {
  const text = firstText(value);
  if (!text) return fallback;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toISOString();
};

const normalizeStatus = (value: unknown): OnlineFormStatus => {
  const status = firstText(value).toLowerCase();
  if (status === "published" || status === "archived") return status;
  return "draft";
};

const normalizeSubmissionStatus = (
  value: unknown,
): OnlineFormSubmissionStatus => {
  const status = firstText(value).toLowerCase();
  if (status === "reviewed" || status === "approved" || status === "rejected") {
    return status;
  }
  return "submitted";
};

export const slugifyOnlineFormTitle = (value: string) => {
  const slug = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return slug || "modulo";
};

export const createClientId = (prefix: string) => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const buildUniquePublicSlug = (
  title: string,
  forms: OnlineForm[],
  currentFormId?: string,
) => {
  const base = slugifyOnlineFormTitle(title);
  const used = new Set(
    forms
      .filter((form) => form.id !== currentFormId)
      .map((form) => form.publicSlug)
      .filter(Boolean),
  );

  if (!used.has(base)) return base;

  let index = 2;
  while (used.has(`${base}-${index}`)) {
    index += 1;
  }

  return `${base}-${index}`;
};

export const isChoiceField = (fieldType: OnlineFormFieldType) =>
  CHOICE_FIELD_TYPES.has(fieldType);

export const isFileField = (fieldType: OnlineFormFieldType) =>
  FILE_FIELD_TYPES.has(fieldType);

export const isReadOnlyField = (fieldType: OnlineFormFieldType) =>
  READ_ONLY_FIELD_TYPES.has(fieldType);

export const getFieldTypeLabel = (value: OnlineFormFieldType) =>
  ONLINE_FORM_FIELD_OPTIONS.find((option) => option.value === value)?.label ||
  "Campo";

export const getStatusBadgeClassName = (status: OnlineFormStatus) => {
  switch (status) {
    case "published":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "archived":
      return "border-slate-200 bg-slate-100 text-slate-600";
    default:
      return "border-amber-200 bg-amber-50 text-amber-700";
  }
};

export const getSubmissionStatusClassName = (
  status: OnlineFormSubmissionStatus,
) => {
  switch (status) {
    case "reviewed":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "approved":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "rejected":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-amber-200 bg-amber-50 text-amber-700";
  }
};

export const normalizeOnlineFormField = (
  value: unknown,
  index = 0,
): OnlineFormField => {
  const record = isRecord(value) ? value : {};
  const rawType = firstText(record.type) as OnlineFormFieldType;
  const type = ONLINE_FORM_FIELD_OPTIONS.some((option) => option.value === rawType)
    ? rawType
    : "short_text";
  const options = asArray(record.options)
    .map((option) => firstText(option))
    .filter(Boolean);
  const validation = isRecord(record.validation) ? record.validation : {};

  return {
    id: firstText(record.id) || createClientId(`field-${index}`),
    type,
    label: firstText(record.label, record.title, record.name) || "Domanda",
    description: firstText(record.description, record.helpText),
    required: Boolean(record.required),
    options: isChoiceField(type) ? options : undefined,
    placeholder: firstText(record.placeholder),
    validation: {
      min:
        validation.min === undefined || validation.min === null
          ? undefined
          : Number(validation.min),
      max:
        validation.max === undefined || validation.max === null
          ? undefined
          : Number(validation.max),
      pattern: firstText(validation.pattern) || undefined,
      acceptedFileTypes: asArray(validation.acceptedFileTypes)
        .map((item) => firstText(item).toLowerCase())
        .filter(Boolean),
      maxFileSizeMb:
        validation.maxFileSizeMb === undefined ||
        validation.maxFileSizeMb === null
          ? undefined
          : Number(validation.maxFileSizeMb),
    },
  };
};

export const normalizeOnlineForm = (
  value: unknown,
  organizationId = "",
  index = 0,
): OnlineForm => {
  const record = isRecord(value) ? value : {};
  const nowIso = new Date().toISOString();
  const title = firstText(record.title, record.name) || "Modulo online";
  const id = firstText(record.id) || createClientId(`online-form-${index}`);
  const createdAt = toIsoString(record.createdAt || record.created_at, nowIso);
  const updatedAt = toIsoString(record.updatedAt || record.updated_at, createdAt);
  const settings = isRecord(record.settings) ? record.settings : {};

  return {
    id,
    type: ONLINE_FORM_STORAGE_TYPE,
    organizationId: firstText(
      record.organizationId,
      record.organization_id,
      organizationId,
    ),
    organization_id: firstText(
      record.organizationId,
      record.organization_id,
      organizationId,
    ),
    title,
    description: firstText(record.description),
    status: normalizeStatus(record.status),
    publicSlug:
      firstText(record.publicSlug, record.public_slug) ||
      `${slugifyOnlineFormTitle(title)}-${id.slice(-6)}`,
    public_slug:
      firstText(record.publicSlug, record.public_slug) ||
      `${slugifyOnlineFormTitle(title)}-${id.slice(-6)}`,
    requiresAuth: Boolean(record.requiresAuth ?? record.requires_auth ?? false),
    requires_auth: Boolean(record.requiresAuth ?? record.requires_auth ?? false),
    linkedAthleteId: firstText(record.linkedAthleteId, record.linked_athlete_id),
    linked_athlete_id: firstText(
      record.linkedAthleteId,
      record.linked_athlete_id,
    ),
    categoryIds: asArray(record.categoryIds || record.category_ids)
      .map((item) => firstText(item))
      .filter(Boolean),
    category_ids: asArray(record.categoryIds || record.category_ids)
      .map((item) => firstText(item))
      .filter(Boolean),
    fields: asArray(record.fields).map(normalizeOnlineFormField),
    settings: {
      collectEmail: Boolean(settings.collectEmail),
      allowMultipleResponses: Boolean(settings.allowMultipleResponses),
      requireParentSignature: Boolean(settings.requireParentSignature),
      notifyClubOnSubmit: Boolean(settings.notifyClubOnSubmit),
      successMessage:
        firstText(settings.successMessage) ||
        "Risposta inviata correttamente. Grazie!",
      closeAt: firstText(settings.closeAt),
    },
    createdAt,
    created_at: createdAt,
    updatedAt,
    updated_at: updatedAt,
  };
};

export const serializeOnlineForm = (form: OnlineForm): OnlineForm => {
  const normalized = normalizeOnlineForm(form, form.organizationId);

  return {
    ...normalized,
    type: ONLINE_FORM_STORAGE_TYPE,
    organization_id: normalized.organizationId,
    public_slug: normalized.publicSlug,
    requires_auth: normalized.requiresAuth,
    linked_athlete_id: normalized.linkedAthleteId || "",
    category_ids: normalized.categoryIds || [],
    created_at: normalized.createdAt,
    updated_at: normalized.updatedAt,
  };
};

export const normalizeOnlineFormSubmission = (
  value: unknown,
  organizationId = "",
  index = 0,
): OnlineFormSubmission => {
  const record = isRecord(value) ? value : {};
  const nowIso = new Date().toISOString();
  const submittedAt = toIsoString(
    record.submittedAt || record.submitted_at,
    nowIso,
  );

  return {
    id: firstText(record.id) || createClientId(`submission-${index}`),
    type: ONLINE_FORM_SUBMISSION_STORAGE_TYPE,
    organizationId: firstText(
      record.organizationId,
      record.organization_id,
      organizationId,
    ),
    organization_id: firstText(
      record.organizationId,
      record.organization_id,
      organizationId,
    ),
    formId: firstText(record.formId, record.form_id),
    form_id: firstText(record.formId, record.form_id),
    athleteId: firstText(record.athleteId, record.athlete_id),
    athlete_id: firstText(record.athleteId, record.athlete_id),
    parentUserId: firstText(record.parentUserId, record.parent_user_id),
    parent_user_id: firstText(record.parentUserId, record.parent_user_id),
    respondentName: firstText(record.respondentName, record.respondent_name),
    respondent_name: firstText(record.respondentName, record.respondent_name),
    respondentEmail: firstText(record.respondentEmail, record.respondent_email),
    respondent_email: firstText(record.respondentEmail, record.respondent_email),
    answers: isRecord(record.answers) ? record.answers : {},
    files: asArray(record.files).map((file) => {
      const fileRecord = isRecord(file) ? file : {};
      return {
        fieldId: firstText(fileRecord.fieldId, fileRecord.field_id),
        fieldLabel: firstText(fileRecord.fieldLabel, fileRecord.field_label),
        fileName: firstText(fileRecord.fileName, fileRecord.file_name),
        fileUrl: firstText(fileRecord.fileUrl, fileRecord.file_url),
        assetId: firstText(fileRecord.assetId, fileRecord.asset_id),
        mimeType: firstText(fileRecord.mimeType, fileRecord.mime_type),
        size: Number(fileRecord.size) || 0,
      };
    }),
    submittedAt,
    submitted_at: submittedAt,
    status: normalizeSubmissionStatus(record.status),
  };
};

export const serializeOnlineFormSubmission = (
  submission: OnlineFormSubmission,
): OnlineFormSubmission => {
  const normalized = normalizeOnlineFormSubmission(
    submission,
    submission.organizationId,
  );

  return {
    ...normalized,
    type: ONLINE_FORM_SUBMISSION_STORAGE_TYPE,
    organization_id: normalized.organizationId,
    form_id: normalized.formId,
    athlete_id: normalized.athleteId || "",
    parent_user_id: normalized.parentUserId || "",
    respondent_name: normalized.respondentName || "",
    respondent_email: normalized.respondentEmail || "",
    submitted_at: normalized.submittedAt,
  };
};

export const getDocumentTemplatesFromClub = (value: unknown) =>
  asArray(value).filter((item) => {
    const record = isRecord(item) ? item : {};
    const type = firstText(record.type, record.kind);
    return (
      type !== ONLINE_FORM_STORAGE_TYPE &&
      type !== ONLINE_FORM_SUBMISSION_STORAGE_TYPE
    );
  });

export const getOnlineFormsFromClub = (
  value: unknown,
  organizationId = "",
): OnlineForm[] =>
  asArray(value)
    .filter((item) => firstText(isRecord(item) ? item.type : "") === ONLINE_FORM_STORAGE_TYPE)
    .map((item, index) => normalizeOnlineForm(item, organizationId, index));

export const getOnlineFormSubmissionsFromClub = (
  value: unknown,
  organizationId = "",
  formId?: string,
): OnlineFormSubmission[] =>
  asArray(value)
    .filter(
      (item) =>
        firstText(isRecord(item) ? item.type : "") ===
        ONLINE_FORM_SUBMISSION_STORAGE_TYPE,
    )
    .map((item, index) =>
      normalizeOnlineFormSubmission(item, organizationId, index),
    )
    .filter((submission) => !formId || submission.formId === formId);

export const getOnlineFormById = (
  value: unknown,
  formId: string,
  organizationId = "",
) =>
  getOnlineFormsFromClub(value, organizationId).find(
    (form) => form.id === formId,
  ) || null;

export const getOnlineFormBySlug = (
  value: unknown,
  publicSlug: string,
  organizationId = "",
) =>
  getOnlineFormsFromClub(value, organizationId).find(
    (form) => form.publicSlug === publicSlug,
  ) || null;

export const splitOnlineFormBundle = (
  value: unknown,
  organizationId = "",
): OnlineFormBundle => ({
  forms: getOnlineFormsFromClub(value, organizationId),
  submissions: getOnlineFormSubmissionsFromClub(value, organizationId),
});

export const mergeOnlineFormBundleIntoDocumentTemplates = (
  currentItems: unknown,
  bundle: OnlineFormBundle,
) => {
  const documents = getDocumentTemplatesFromClub(currentItems);
  return [
    ...documents,
    ...bundle.forms.map(serializeOnlineForm),
    ...bundle.submissions.map(serializeOnlineFormSubmission),
  ];
};

export const createEmptyOnlineForm = (
  organizationId: string,
  forms: OnlineForm[] = [],
): OnlineForm => {
  const nowIso = new Date().toISOString();
  const id = createClientId("online-form");
  const title = "Nuovo modulo";

  return {
    id,
    type: ONLINE_FORM_STORAGE_TYPE,
    organizationId,
    organization_id: organizationId,
    title,
    description: "",
    status: "draft",
    publicSlug: buildUniquePublicSlug(title, forms, id),
    public_slug: buildUniquePublicSlug(title, forms, id),
    requiresAuth: false,
    requires_auth: false,
    fields: [
      {
        id: createClientId("field"),
        type: "short_text",
        label: "Nome e cognome",
        required: true,
      },
    ],
    settings: {
      collectEmail: true,
      allowMultipleResponses: true,
      requireParentSignature: false,
      notifyClubOnSubmit: true,
      successMessage: "Risposta inviata correttamente. Grazie!",
      closeAt: "",
    },
    createdAt: nowIso,
    created_at: nowIso,
    updatedAt: nowIso,
    updated_at: nowIso,
  };
};

export const createBaseEnrollmentOnlineForm = (
  organizationId: string,
  forms: OnlineForm[] = [],
): OnlineForm => {
  const nowIso = new Date().toISOString();
  const id = createClientId("online-form");
  const title = "Modulo iscrizione base";

  return {
    id,
    type: ONLINE_FORM_STORAGE_TYPE,
    organizationId,
    organization_id: organizationId,
    title,
    description:
      "Raccogli dati atleta, contatti genitore, documenti e firma per una nuova iscrizione.",
    status: "draft",
    publicSlug: buildUniquePublicSlug(title, forms, id),
    public_slug: buildUniquePublicSlug(title, forms, id),
    requiresAuth: false,
    requires_auth: false,
    fields: [
      { id: createClientId("field"), type: "section", label: "Dati atleta", required: false },
      { id: createClientId("field"), type: "short_text", label: "Nome atleta", required: true },
      { id: createClientId("field"), type: "short_text", label: "Cognome atleta", required: true },
      { id: createClientId("field"), type: "date", label: "Data nascita", required: true },
      { id: createClientId("field"), type: "short_text", label: "Codice fiscale", required: false },
      { id: createClientId("field"), type: "dropdown", label: "Categoria richiesta", required: false, options: ["Primi calci", "Pulcini", "Esordienti", "Giovanissimi", "Allievi", "Altro"] },
      { id: createClientId("field"), type: "section", label: "Dati genitore", required: false },
      { id: createClientId("field"), type: "short_text", label: "Nome genitore", required: true },
      { id: createClientId("field"), type: "short_text", label: "Cognome genitore", required: true },
      { id: createClientId("field"), type: "email", label: "Email genitore", required: true },
      { id: createClientId("field"), type: "phone", label: "Telefono genitore", required: true },
      { id: createClientId("field"), type: "long_text", label: "Indirizzo", required: false },
      { id: createClientId("field"), type: "consent", label: "Consenso privacy", description: "Dichiaro di aver letto l'informativa privacy e autorizzo il trattamento dei dati.", required: true },
      { id: createClientId("field"), type: "file_upload", label: "Documento identita", required: false, validation: { acceptedFileTypes: ["application/pdf", "image/jpeg", "image/png"], maxFileSizeMb: 10 } },
      { id: createClientId("field"), type: "file_upload", label: "Certificato medico", required: false, validation: { acceptedFileTypes: ["application/pdf", "image/jpeg", "image/png"], maxFileSizeMb: 10 } },
      { id: createClientId("field"), type: "signature", label: "Firma genitore", required: true },
    ],
    settings: {
      collectEmail: true,
      allowMultipleResponses: true,
      requireParentSignature: true,
      notifyClubOnSubmit: true,
      successMessage: "Iscrizione inviata correttamente. Il club la esaminera a breve.",
      closeAt: "",
    },
    createdAt: nowIso,
    created_at: nowIso,
    updatedAt: nowIso,
    updated_at: nowIso,
  };
};

export const isOnlineFormClosed = (form: OnlineForm, now = new Date()) => {
  const closeAt = firstText(form.settings?.closeAt);
  if (!closeAt) return false;
  const closeDate = new Date(closeAt);
  if (Number.isNaN(closeDate.getTime())) return false;
  return closeDate.getTime() < now.getTime();
};

export const validateOnlineFormAnswers = (
  form: OnlineForm,
  answers: Record<string, any>,
  files: OnlineFormSubmissionFile[] = [],
) => {
  const errors: Record<string, string> = {};
  const filesByField = new Set(files.map((file) => file.fieldId));

  for (const field of form.fields) {
    if (!field.required || isReadOnlyField(field.type)) continue;

    const value = answers[field.id];
    const hasFile = filesByField.has(field.id);
    const hasAnswer = Array.isArray(value)
      ? value.length > 0
      : typeof value === "boolean"
        ? value
        : firstText(value).length > 0;

    if (isFileField(field.type)) {
      if (!hasFile && !hasAnswer) {
        errors[field.id] = "Campo obbligatorio";
      }
      continue;
    }

    if (!hasAnswer) {
      errors[field.id] = "Campo obbligatorio";
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
};

export const formatAnswerValue = (value: any) => {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Si" : "No";
  if (value === undefined || value === null || value === "") return "-";
  return String(value);
};
