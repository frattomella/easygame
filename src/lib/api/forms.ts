import { apiRequest } from "./client";
import type {
  FormField,
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
  /** Cio che l'approvazione non ha potuto fare, e perche (W3-F). */
  issues?: string[];
  /** Il documento nato dall'approvazione, quando il modulo ne dichiara uno. */
  generatedDocumentId?: string | null;
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

/**
 * Un documento che manca, nella forma **esatta** che il server accetta.
 *
 * Non e una forma nuova: sono i cinque campi che `normalizeMissingDocuments`
 * legge in `src/lib/server/enrollment-requests.ts`, e da li arrivano anche i
 * valori di riserva — il titolo vuoto ricade sul tipo, `required` assente vale
 * «obbligatorio». Il tipo (`documentKind`) e cio che il fascicolo confronta:
 * viene normalizzato dal server, quindi «Certificato medico» e
 * `certificato_medico` sono lo stesso documento e la seconda richiesta non si
 * apre due volte.
 */
export type MissingDocumentRequest = {
  documentKind: string;
  title: string;
  description?: string;
  /** `AAAA-MM-GG`, oppure vuoto: una richiesta puo non avere scadenza. */
  dueDate?: string;
  required?: boolean;
};

export const decideSubmission = async (
  id: string,
  input: {
    action: "approve" | "reject";
    note?: string;
    subjects?: FormSubjectSelection[];
    /**
     * I documenti che mancano. Si chiedono **approvando**, non respingendo: e
     * il punto in cui l'iscrizione e il fascicolo documentale si saldano.
     */
    documentRequests?: MissingDocumentRequest[];
  },
) =>
  unwrap(
    await apiRequest<ReviewOutcomePayload>(
      `/api/v1/forms/submissions/${encodeURIComponent(id)}`,
      {
        method: "POST",
        body: {
          action: input.action,
          note: input.note,
          subjects: input.subjects,
          /*
            `document_requests` in snake_case, come ogni altro campo API
            (09 — Convenzioni API). La rotta legge anche `documentRequests`
            per compatibilita, ma usare qui la seconda forma vorrebbe dire due
            nomi per lo stesso campo, e il giorno in cui uno dei due cambia il
            client scriverebbe nel posto sbagliato senza errore.

            Assente quando non c'e niente da chiedere: un array vuoto sulla
            rete per dire «nulla» e cio che rende difficile leggere una
            richiesta in un log.
          */
          ...(input.documentRequests?.length
            ? {
                document_requests: input.documentRequests.map((documento) => ({
                  document_kind: documento.documentKind,
                  title: documento.title,
                  description: documento.description || "",
                  due_date: documento.dueDate || null,
                  required: documento.required !== false,
                })),
              }
            : {}),
        },
      },
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

/* ------------------------------------------------- il rinnovo, dalla famiglia */

/**
 * Il modulo di rinnovo gia riempito, come lo restituisce `buildRenewalDraft`.
 *
 * **La stagione non e un parametro.** Arriva nella risposta perche la decide
 * il server leggendo la stagione attiva del club: farla scegliere a chi
 * compila vorrebbe dire accettare da un browser il perimetro dei dati di una
 * pratica, e una domanda intestata all'annata sbagliata e peggio di una
 * domanda non inviata.
 */
export type RenewalDraft = {
  seasonId: string;
  seasonLabel: string;
  answers: Record<string, unknown>;
  /** I campi che arrivano dall'archivio: `FormRenderer` li dichiara. */
  prefilledFieldIds: string[];
  athleteId: string;
  athleteName: string;
  clubName: string;
  form: {
    title: string;
    description: string;
    fields: FormField[];
    collectRespondentEmail: boolean;
  };
};

/*
  Atleta e modulo viaggiano nella query anche sul POST, come dichiara la rotta:
  il corpo e `multipart/form-data` e dentro c'e gia il contratto del motore dei
  moduli. Un solo posto in cui si costruisce l'indirizzo, cosi le tre chiamate
  non possono divergere.

  Senza slug la stessa rotta risponde **l'elenco** dei moduli rinnovabili: e la
  stessa domanda in due momenti, «cosa posso rinnovare» e «aprimi questo».
*/
const renewalPath = (athleteId: string, publicSlug?: string) =>
  `/api/v1/family/enrollment-requests/renewal?athlete_id=${encodeURIComponent(
    athleteId,
  )}${publicSlug ? `&slug=${encodeURIComponent(publicSlug)}` : ""}`;

/**
 * Un modulo di rinnovo, come lo nomina la famiglia.
 *
 * Due campi, e sono tutti quelli che il server lascia uscire: lo slug serve ad
 * aprire il modulo, il titolo a riconoscerlo. L'identificativo interno del
 * modello, la sua versione e lo schema non passano di qui — quelli li porta
 * `fetchRenewalDraft` a modulo aperto.
 */
export type RenewalFormOption = { publicSlug: string; title: string };

/**
 * Cosa questa famiglia puo rinnovare.
 *
 * Esiste perche altrimenti lo slug poteva arrivare **solo** dal link che la
 * societa manda: il rinnovo sarebbe rimasto una funzione per chi gia sapeva
 * che c'era.
 */
export const fetchRenewalForms = async (athleteId: string) => {
  const data = unwrap(
    await apiRequest<{ forms: RenewalFormOption[] }>(renewalPath(athleteId)),
  );
  return Array.isArray(data?.forms) ? data.forms : [];
};

export const fetchRenewalDraft = async (athleteId: string, publicSlug: string) =>
  unwrap(await apiRequest<RenewalDraft>(renewalPath(athleteId, publicSlug)));

export type RenewalSubmitOutcome = {
  receipt: {
    submissionId: string;
    successMessage: string;
    receiptReference: string;
  } | null;
  /** Il messaggio generale dell'errore, vuoto quando l'invio e riuscito. */
  message: string;
  /** Gli errori campo per campo, che la rotta mette in `data.errors`. */
  fieldErrors: Record<string, string>;
};

/**
 * Invia il rinnovo.
 *
 * **Non passa da `unwrap`**, ed e l'unica funzione di questo file a non farlo:
 * quando la validazione fallisce la rotta risponde `data.errors` *insieme*
 * all'errore, e un'eccezione con il solo messaggio butterebbe via proprio cio
 * che dice a chi compila quale campo correggere — che e il motivo per cui il
 * server li calcola.
 */
export const submitRenewal = async (input: {
  athleteId: string;
  publicSlug: string;
  answers: Record<string, unknown>;
  files: Record<string, File | null>;
  respondentName?: string;
  respondentEmail?: string;
}): Promise<RenewalSubmitOutcome> => {
  const body = new FormData();
  body.append(
    "payload",
    JSON.stringify({
      answers: input.answers,
      respondentName: input.respondentName || "",
      respondentEmail: input.respondentEmail || "",
    }),
  );

  for (const [fieldId, file] of Object.entries(input.files)) {
    if (file) body.append(`file:${fieldId}`, file, file.name);
  }

  const response = await apiRequest<any>(
    renewalPath(input.athleteId, input.publicSlug),
    { method: "POST", body },
  );

  if (response.error) {
    const errors = response.data?.errors;
    return {
      receipt: null,
      message: response.error.message || "Invio del rinnovo non riuscito",
      fieldErrors:
        errors && typeof errors === "object" && !Array.isArray(errors)
          ? (errors as Record<string, string>)
          : {},
    };
  }

  return { receipt: response.data, message: "", fieldErrors: {} };
};
