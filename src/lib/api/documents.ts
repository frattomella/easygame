import { apiRequest } from "./client";

/**
 * Accesso client ai modelli di documento e ai documenti generati.
 *
 * Passa da `apiRequest` come tutto il resto: nessun `fetch` diretto a `/api`
 * dai componenti (regola di ownership in CLAUDE.md).
 *
 * **Perche non passa piu da `simplified-db`.** Fino alla Wave 3 i modelli si
 * leggevano e si scrivevano con `getClubData`/`addClubData`, cioe leggendo e
 * riscrivendo una colonna JSON della riga del club: due schede aperte
 * insieme si sovrascrivevano a vicenda, e l'HTML di tutti i modelli viaggiava
 * a ogni lettura. Adesso ogni gesto e una richiesta che riguarda **un**
 * modello.
 */

export type TemplateSubject = "club" | "athlete" | "person" | "member";
export type TemplateStatus = "draft" | "active" | "retired";

export type DocumentTemplateSummary = {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  subjectKind: TemplateSubject;
  status: TemplateStatus;
  publishedVersion: number;
  publishedAt: string | null;
  catalogKey: string | null;
  catalogClass: string | null;
  editorialOwner: string | null;
  lastReviewedAt: string | null;
  editorialNotes: string | null;
  createdAt: string;
  updatedAt: string;
  generatedCount: number;
  hasUnpublishedChanges: boolean;
  placeholderKeys: string[];
  sensitivity: string[];
};

export type DocumentTemplateDetail = DocumentTemplateSummary & {
  draftContent: string;
  versions: Array<{
    id: string;
    version: number;
    title: string;
    publishedAt: string;
    publishedBy: string | null;
    placeholderKeys: string[];
    sensitivity: string[];
  }>;
};

export type GeneratedDocumentSummary = {
  id: string;
  organizationId: string;
  templateId: string;
  versionId: string;
  templateTitle: string;
  version: number;
  subjectKind: string;
  subjectId: string;
  subjectLabel: string | null;
  seasonId: string | null;
  unresolved: string[];
  missing: string[];
  warnings: string[];
  sensitivity: string[];
  protocolNumber: string | null;
  status: string;
  signedAttachmentId: string | null;
  signedAt: string | null;
  batchId: string | null;
  generatedBy: string | null;
  generatedAt: string;
  /**
   * Vero quando la riga esisteva **gia** dentro questo lotto.
   *
   * Serve a chi riprende un lotto: «cinquanta documenti» e «cinquanta ce n'erano
   * gia» sono due risposte diverse, e senza questo campo la seconda si
   * travestiva da prima.
   */
  reused?: boolean;
};

/** Il problema che impedisce di pubblicare, detto con la chiave che lo causa. */
export type TemplateIssue = {
  field: string;
  message: string;
  key?: string;
};

const TEMPLATES = "/api/v1/documents/templates";
const GENERATED = "/api/v1/documents/generated";
const CATALOG = "/api/v1/documents/catalog";

/**
 * Una voce del catalogo di piattaforma, come la racconta la rotta.
 *
 * Le tre informazioni che sembrano di servizio — classe redazionale, chi
 * risponde del testo, quando e stato riletto — sono il **punto** di ADR-0092 e
 * non un dettaglio da nascondere: un modello distribuito da noi esce con il
 * timbro del presidente, e un club ha diritto di sapere chi lo mantiene e da
 * quanto tempo nessuno lo rilegge.
 */
export type DocumentCatalogEntry = {
  key: string;
  title: string;
  description: string;
  subjectKind: TemplateSubject;
  /** `A` — le uniche che si distribuiscono. Vedi `src/lib/documents/catalog/`. */
  catalogClass: string;
  editorialOwner: string;
  /** `AAAA-MM-GG`. */
  lastReviewedAt: string;
  adopted: boolean;
  adoptedTemplateId: string | null;
};

/**
 * Cosa il club puo adottare, e cosa ha gia.
 *
 * L'elenco lo compone il server: cio che non si distribuisce non compare
 * nemmeno, perche una voce ferma e una voce che non esiste devono dare la
 * stessa risposta.
 */
export const listDocumentCatalog = async () => {
  const response = await apiRequest<DocumentCatalogEntry[]>(CATALOG);
  return {
    entries: Array.isArray(response.data) ? response.data : [],
    error: response.error?.message || null,
  };
};

/**
 * Adotta una voce: da qui in poi la copia **e del club**.
 *
 * Non e «creare un modello con lo stesso testo». La rotta scrive anche da dove
 * viene (`catalogKey`), di che classe e, chi ne risponde e quando e stato
 * riletto, registra l'audit del catalogo e la consegna **gia pubblicata** —
 * una voce di catalogo e stata scritta per essere usata. Rifarlo a mano con
 * `createDocumentTemplate` produrrebbe una copia impoverita e muta, ed e
 * esattamente cio che il pulsante «Aggiungi attestazione» faceva.
 */
export const adoptCatalogEntry = async (key: string) => {
  const response = await apiRequest<DocumentTemplateDetail>(CATALOG, {
    method: "POST",
    body: { key },
  });
  return { template: response.data || null, error: response.error?.message || null };
};

export const listDocumentTemplates = async (options: {
  includeRetired?: boolean;
  subjectKind?: TemplateSubject | null;
} = {}) => {
  const params = new URLSearchParams();
  if (options.includeRetired) params.set("include_retired", "1");
  if (options.subjectKind) params.set("subject_kind", options.subjectKind);
  const query = params.toString();

  const response = await apiRequest<DocumentTemplateSummary[]>(
    query ? `${TEMPLATES}?${query}` : TEMPLATES,
  );
  return {
    templates: Array.isArray(response.data) ? response.data : [],
    error: response.error?.message || null,
  };
};

export const getDocumentTemplate = async (id: string) => {
  const response = await apiRequest<DocumentTemplateDetail>(
    `${TEMPLATES}/${encodeURIComponent(id)}`,
  );
  return { template: response.data || null, error: response.error?.message || null };
};

export const createDocumentTemplate = async (input: {
  title: string;
  description?: string;
  subjectKind?: TemplateSubject;
  content?: string;
  catalogKey?: string;
  catalogClass?: string;
  editorialOwner?: string;
  editorialNotes?: string;
}) => {
  const response = await apiRequest<DocumentTemplateDetail>(TEMPLATES, {
    method: "POST",
    body: {
      title: input.title,
      description: input.description ?? "",
      subject_kind: input.subjectKind ?? "athlete",
      content: input.content ?? "",
      catalog_key: input.catalogKey,
      catalog_class: input.catalogClass,
      editorial_owner: input.editorialOwner,
      editorial_notes: input.editorialNotes,
    },
  });
  return { template: response.data || null, error: response.error?.message || null };
};

export const saveDocumentTemplateDraft = async (
  id: string,
  input: {
    title?: string;
    description?: string;
    subjectKind?: TemplateSubject;
    content?: string;
    status?: TemplateStatus;
  },
) => {
  const body: Record<string, unknown> = {};
  if (input.title !== undefined) body.title = input.title;
  if (input.description !== undefined) body.description = input.description;
  if (input.subjectKind !== undefined) body.subject_kind = input.subjectKind;
  if (input.content !== undefined) body.content = input.content;
  if (input.status !== undefined) body.status = input.status;

  const response = await apiRequest<DocumentTemplateDetail>(
    `${TEMPLATES}/${encodeURIComponent(id)}`,
    { method: "PATCH", body },
  );
  return { template: response.data || null, error: response.error?.message || null };
};

/**
 * Pubblica: l'atto che crea una versione.
 *
 * Quando non si puo, l'errore porta `issues` — l'elenco dei segnaposto che
 * impediscono la pubblicazione, ognuno con la sua chiave. Mostrarli e il punto:
 * «non si puo pubblicare» senza dire quale parola e sbagliata manda una
 * segreteria a chiamare l'assistenza.
 */
export const publishDocumentTemplate = async (id: string) => {
  const response = await apiRequest<DocumentTemplateDetail>(
    `${TEMPLATES}/${encodeURIComponent(id)}/publish`,
    { method: "POST", body: {} },
  );
  const issues = ((response.error as any)?.issues || []) as TemplateIssue[];
  return {
    template: response.data || null,
    error: response.error?.message || null,
    issues,
  };
};

export const deleteDocumentTemplate = async (id: string) => {
  const response = await apiRequest<{ id: string }>(
    `${TEMPLATES}/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  return { ok: !response.error, error: response.error?.message || null };
};

export type GenerationOutcome = {
  batchId: string | null;
  templateId: string;
  versionId: string;
  requested: number;
  /** Quanti dei prodotti erano gia nel lotto. */
  reused?: number;
  produced: GeneratedDocumentSummary[];
  failed: Array<{
    subject: { kind: string; id: string };
    reason: string;
  }>;
};

/**
 * Genera uno o piu documenti.
 *
 * Uno o cento e la stessa chiamata: la generazione singola e un lotto da uno.
 * `batchId` serve solo quando il lotto puo essere ripreso — ed e quello che
 * rende un nuovo tentativo capace di rigenerare **solo** i falliti.
 */
export const generateDocuments = async (input: {
  templateId: string;
  subjects: Array<{ kind: string; id: string }>;
  seasonId?: string | null;
  batchId?: string | null;
}) => {
  const response = await apiRequest<GenerationOutcome>(GENERATED, {
    method: "POST",
    body: {
      template_id: input.templateId,
      season_id: input.seasonId || undefined,
      batch_id: input.batchId || undefined,
      subjects: input.subjects,
    },
  });
  return { outcome: response.data || null, error: response.error?.message || null };
};

export type GeneratedDocumentDetail = GeneratedDocumentSummary & {
  contentHtml: string;
  valuesSnapshot: Record<string, string>;
};

/**
 * Un documento gia generato, **com'era**.
 *
 * **Perche e una chiamata a se e non un campo dell'elenco.** `contentHtml` e il
 * campo piu grande della riga, e nessuna lista lo mostra: portarlo dentro
 * `listGeneratedDocuments` costerebbe megabyte per dire trenta titoli — lo
 * stesso difetto per cui i modelli sono usciti dalla riga del club. Si legge
 * quando qualcuno vuole davvero **quel** documento: aprirlo, o metterlo in un
 * fascicolo.
 *
 * Non rigenera niente: restituisce la resa conservata (ADR-0089).
 */
export const getGeneratedDocument = async (id: string) => {
  const response = await apiRequest<GeneratedDocumentDetail>(
    `${GENERATED}/${encodeURIComponent(id)}`,
  );
  return {
    document: response.data || null,
    error: response.error?.message || null,
  };
};

export const listGeneratedDocuments = async (
  options: {
    templateId?: string;
    subjectKind?: string;
    subjectId?: string;
    batchId?: string;
    limit?: number;
  } = {},
) => {
  const params = new URLSearchParams();
  if (options.templateId) params.set("template_id", options.templateId);
  if (options.subjectKind) params.set("subject_kind", options.subjectKind);
  if (options.subjectId) params.set("subject_id", options.subjectId);
  if (options.batchId) params.set("batch_id", options.batchId);
  if (options.limit) params.set("limit", String(options.limit));
  const query = params.toString();

  const response = await apiRequest<GeneratedDocumentSummary[]>(
    query ? `${GENERATED}?${query}` : GENERATED,
  );
  return {
    documents: Array.isArray(response.data) ? response.data : [],
    error: response.error?.message || null,
  };
};

export type FilledPreview = {
  templateId: string;
  versionId: string;
  version: number;
  sensitivity: string[];
  title: string;
  html: string;
  values: Record<string, string>;
  unresolved: string[];
  missing: string[];
  warnings: string[];
};

/** L'anteprima. Non scrive niente: e la differenza con `generateDocuments`. */
export const previewFilledDocument = async (input: {
  templateId: string;
  athleteId: string;
  seasonId?: string | null;
}) => {
  const params = new URLSearchParams({
    templateId: input.templateId,
    athleteId: input.athleteId,
  });
  if (input.seasonId) params.set("seasonId", input.seasonId);

  const response = await apiRequest<FilledPreview>(
    `/api/v1/documents/filled?${params.toString()}`,
  );
  return { preview: response.data || null, error: response.error?.message || null };
};
