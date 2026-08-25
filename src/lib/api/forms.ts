import { apiRequest } from "./client";
import type {
  FormSchema,
  FormSubjectSelection,
  FormSubmissionRecord,
  FormTemplateDetail,
  FormTemplateSummary,
} from "../forms/model";
import type { DuplicateCandidate, FormChangeSet } from "../forms/changes";

/**
 * Trasporto dei moduli. Sta qui e non nei componenti: nessun `fetch` diretto
 * a `/api` da un componente (CLAUDE.md, sezione 2).
 *
 * L'unica eccezione e il modulo pubblico, che parla con `/api/public/...`
 * senza sessione e senza gli header del club attivo: passare da `apiRequest`
 * gli attaccherebbe un `x-active-club-id` letto dal browser di chi compila,
 * che non e nessuno.
 */

type Envelope<T> = { data: T; error: { message: string } | null };

const unwrap = <T>(envelope: Envelope<T>) => {
  if (envelope.error) throw new Error(envelope.error.message);
  return envelope.data;
};

export type SubmissionReviewPayload = {
  submission: FormSubmissionRecord;
  changeSet: FormChangeSet;
  duplicates: DuplicateCandidate[];
};

export type ReviewOutcomePayload = {
  submission: FormSubmissionRecord;
  applied: string[];
};

/* -------------------------------------------------------------- moduli */

export const fetchFormTemplates = async (options: { includeArchived?: boolean } = {}) =>
  unwrap(
    await apiRequest<FormTemplateSummary[]>(
      `/api/v1/forms${options.includeArchived ? "?include_archived=1" : ""}`,
    ),
  );

export const fetchFormTemplate = async (id: string) =>
  unwrap(
    await apiRequest<FormTemplateDetail>(`/api/v1/forms/${encodeURIComponent(id)}`),
  );

export const createFormTemplate = async (starter: string) =>
  unwrap(
    await apiRequest<FormTemplateDetail>("/api/v1/forms", {
      method: "POST",
      body: { starter },
    }),
  );

const patchTemplate = async (id: string, body: Record<string, unknown>) =>
  unwrap(
    await apiRequest<FormTemplateDetail>(
      `/api/v1/forms/${encodeURIComponent(id)}`,
      { method: "PATCH", body },
    ),
  );

export const saveFormDraft = async (id: string, schema: FormSchema) =>
  patchTemplate(id, { action: "save_draft", schema });

export const publishForm = async (id: string) =>
  patchTemplate(id, { action: "publish" });

export const unpublishForm = async (id: string) =>
  patchTemplate(id, { action: "unpublish" });

export const archiveForm = async (id: string) =>
  patchTemplate(id, { action: "archive" });

export const restoreForm = async (id: string) =>
  patchTemplate(id, { action: "restore" });

export const duplicateForm = async (id: string) =>
  patchTemplate(id, { action: "duplicate" });

export const regenerateFormLink = async (id: string) =>
  patchTemplate(id, { action: "regenerate_slug" });

export const setFormPublicAccess = async (id: string, enabled: boolean) =>
  patchTemplate(id, { action: "set_public_access", enabled });

export const deleteForm = async (id: string) =>
  unwrap(
    await apiRequest<{ deleted: boolean; archived: boolean }>(
      `/api/v1/forms/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),
  );

/* --------------------------------------------------- compilazione guidata */

export type CompileSubjectOption = {
  recordId: string;
  label: string;
  hint: string;
};

export type CompileContext = {
  templateId: string;
  templateTitle: string;
  version: number;
  schema: FormSchema;
  selections: FormSubjectSelection[];
  options: Partial<Record<string, CompileSubjectOption[]>>;
  answers: Record<string, unknown>;
  prefilledFieldIds: string[];
};

export const fetchCompileContext = async (
  templateId: string,
  subjects: FormSubjectSelection[],
) =>
  unwrap(
    await apiRequest<CompileContext>(
      `/api/v1/forms/${encodeURIComponent(templateId)}/compile?subjects=${encodeURIComponent(
        JSON.stringify(subjects),
      )}`,
    ),
  );

/* -------------------------------------------------------- compilazioni */

export const fetchFormSubmissions = async (options: {
  templateId?: string;
  status?: string;
  limit?: number;
  offset?: number;
} = {}) => {
  const params = new URLSearchParams();
  if (options.templateId) params.set("template_id", options.templateId);
  if (options.status) params.set("status", options.status);
  if (options.limit) params.set("limit", String(options.limit));
  if (options.offset) params.set("offset", String(options.offset));

  const query = params.toString();
  return unwrap(
    await apiRequest<{ items: FormSubmissionRecord[]; total: number }>(
      `/api/v1/forms/submissions${query ? `?${query}` : ""}`,
    ),
  );
};

export const fetchSubmissionReview = async (id: string) =>
  unwrap(
    await apiRequest<SubmissionReviewPayload>(
      `/api/v1/forms/submissions/${encodeURIComponent(id)}`,
    ),
  );

export const previewSubmissionReview = async (
  id: string,
  subjects: FormSubjectSelection[],
) =>
  unwrap(
    await apiRequest<SubmissionReviewPayload>(
      `/api/v1/forms/submissions/${encodeURIComponent(id)}`,
      { method: "POST", body: { action: "preview", subjects } },
    ),
  );

export const decideSubmission = async (
  id: string,
  input: {
    action: "approve" | "reject";
    note?: string;
    subjects?: FormSubjectSelection[];
  },
) =>
  unwrap(
    await apiRequest<ReviewOutcomePayload>(
      `/api/v1/forms/submissions/${encodeURIComponent(id)}`,
      { method: "POST", body: input },
    ),
  );

/**
 * Compila un modulo dalla segreteria.
 *
 * Multipart, come l'invio pubblico: e la stessa richiesta, con in piu i
 * soggetti gia scelti. `apiRequest` lascia passare un `FormData` senza
 * toccarlo e ci attacca gli header del club attivo.
 */
export const submitInternalForm = async (input: {
  templateId: string;
  subjects: FormSubjectSelection[];
  answers: Record<string, unknown>;
  files: Record<string, File | null>;
  respondentName?: string;
}) => {
  const body = new FormData();
  body.append(
    "payload",
    JSON.stringify({
      templateId: input.templateId,
      subjects: input.subjects,
      answers: input.answers,
      respondentName: input.respondentName || "",
    }),
  );

  for (const [fieldId, file] of Object.entries(input.files)) {
    if (file) body.append(`file:${fieldId}`, file, file.name);
  }

  return unwrap(
    await apiRequest<{ submissionId: string; successMessage: string }>(
      "/api/v1/forms/submissions",
      { method: "POST", body },
    ),
  );
};
