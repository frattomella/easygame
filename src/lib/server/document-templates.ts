import { randomUUID } from "node:crypto";
import {
  athleteIdsWithinAccessScope,
  athleteWithinAccessScope,
  buildAthleteAccessScopeConditions,
} from "./access-scope-query";
import type { AccessScopeEntry } from "@/lib/roles/access-scope";

import { prisma } from "./prisma";
import {
  canGenerateDocumentWithSensitivity,
  canReadGeneratedDocument,
  explainGenerationDenial,
} from "@/lib/documents/permissions";
import {
  canTransitionGeneratedDocument,
  canTransitionTemplate,
  isGeneratedDocumentStatus,
  isTemplateStatus,
  nextTemplateVersion,
  requiresSignedAttachment,
  validateTemplateDraft,
  type GeneratedDocumentStatus,
  type TemplateStatus,
} from "@/lib/documents/template-model";
import {
  isTemplateSubjectKind,
  type TemplateSubjectKind,
} from "@/lib/documents/placeholders";

/**
 * I modelli di documento, le loro versioni e i documenti che ne nascono.
 *
 * **E l'unico file che scrive `document_templates_v2`,
 * `document_template_versions` e `generated_documents`** (CLAUDE.md §2). Chi
 * genera, chi elenca, chi stampa: tutti passano di qui.
 *
 * ## Perche esiste (ADR-0088)
 *
 * Fino alla Wave 3 un modello era un oggetto dentro `clubs.document_templates`,
 * un array JSON sulla riga del club, scritto in place. Le conseguenze erano
 * tutte misurabili e tutte cattive:
 *
 * - **nessuna versione**: correggere un modello riscriveva anche i documenti
 *   gia consegnati, perche non ne esisteva una copia;
 * - **due forme nella stessa colonna**: `/modulistica` scriveva
 *   `{ id, title, content }`, il CRUD generico scriveva `{ id, name, payload }`.
 *   Un modello creato dall'API compariva nella pagina senza titolo e senza
 *   testo;
 * - **nessun autore attendibile**: `createdAt` lo metteva il client;
 * - **cresceva dentro la riga del club**: ogni lettura del club trascinava
 *   l'HTML di tutti i modelli.
 *
 * E la stessa situazione da cui i moduli online sono usciti con ADR-0039 e
 * ADR-0040, e la forma qui e deliberatamente la stessa: bozza sulla riga,
 * versioni immutabili accanto, e chi le cita.
 *
 * ## Le invarianti, e chi le fa rispettare
 *
 * Sono elencate in `DOCUMENT_ENGINE_INVARIANTS`
 * (`src/lib/documents/template-model.ts`). Due non dipendono da questo file
 * perche **le fa rispettare il database**, ed e il posto giusto:
 * `generated_documents` referenzia modello e versione con `ON DELETE RESTRICT`,
 * quindi cancellare cio che un documento cita non e possibile nemmeno per
 * sbaglio, nemmeno da una query scritta a mano.
 *
 * ## Il confine
 *
 * `organization_id`, come per ogni risorsa di club: un identificativo di
 * un'altra societa risponde «Accesso negato» — mai il messaggio dell'ORM. Il
 * club non arriva dall'indirizzo: arriva dallo scope della sessione.
 */

export type DocumentTemplateScope = {
  userId: string;
  activeOrganizationId: string | null;
  /**
   * Il perimetro di sede e categoria.
   *
   * `resolveDocumentPlaceholders` nega di **generare** un documento su un
   * atleta fuori perimetro, con la motivazione «il documento e la porta di
   * servizio dell'anagrafica». La riga gia prodotta contiene gli stessi
   * campi in `content_html` e in `values_snapshot`, e si rileggeva senza
   * quel controllo: misurato, nome, indirizzo e codice fiscale di un minore
   * di un'altra sede.
   */
  accessScopes?: readonly AccessScopeEntry[] | null;
  /**
   * I club a cui l'utente appartiene.
   *
   * **Non e il confine**, e non va usato come tale: il confine e
   * `activeOrganizationId`, perche e a quello che si riferisce il `role`.
   * Resta qui perche la forma dello scope e quella di tutto il resto del
   * server, e cambiarla renderebbe questo dominio diverso dagli altri.
   */
  allowedOrganizationIds: string[];
  /**
   * Il ruolo **nel club attivo**.
   *
   * **Obbligatorio, e non per pignoleria.** Quando era opzionale, ogni
   * controllo di permesso di questo file era scritto
   * `if (scope.role !== undefined)`: un chiamante che si fosse dimenticato il
   * campo non avrebbe avuto **nessun** controllo, in silenzio. Un permesso che
   * fallisce aperto e peggio di un permesso assente, perche sembra esserci.
   * Adesso chi lo dimentica non compila.
   */
  role: string | null;
};

const denied = (message: string) => new Error(`Accesso negato: ${message}`);

const asText = (value: unknown) => String(value ?? "").trim();

const toIso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : asText(value);

/**
 * Il confine, ed e il **club attivo** — non l'insieme dei club accessibili.
 *
 * **Il difetto che questa funzione ha avuto, e che l'audit ha misurato.**
 * Confrontava con `allowedOrganizationIds`, cioe con tutti i club a cui
 * l'utente appartiene. Ma `scope.role` e il ruolo **nel club attivo**, e i due
 * insiemi non coincidono mai per chi ha piu di un club. Chiunque puo crearsi
 * una societa e diventarne proprietario: bastava mandare
 * `x-active-club-id: <la mia>` insieme all'identificativo di un modello **di
 * un'altra**, e il permesso veniva concesso con il ruolo sbagliato. Un
 * collaboratore riprendeva cosi la scrittura sui modelli che §13 gli aveva
 * tolto — cancellazione e pubblicazione comprese — e un allenatore leggeva
 * documenti con gli importi.
 *
 * La regola giusta e una sola: **la riga deve appartenere al club attivo**. Se
 * si vuole lavorare su un altro club, si cambia club, e il ruolo viene
 * risolto di nuovo per quello — che e cio che fa gia il dominio dei consensi.
 */
const ensureOrganizationAccess = (
  scope: DocumentTemplateScope | undefined,
  organizationId: string | null | undefined,
) => {
  if (!scope) return;
  if (!organizationId) throw denied("documento senza club");

  const active = asText(scope.activeOrganizationId);
  if (!active) throw denied("nessun club attivo");
  if (active !== asText(organizationId)) {
    throw notFound();
  }
};

/**
 * La risposta a «non esiste» e a «e di un altro club» deve essere **la
 * stessa stringa**.
 *
 * Il commento c era gia e diceva la cosa giusta; le due stringhe erano
 * diverse, e la differenza e un oracolo: chi prova identificativi a caso
 * impara quali esistono, che e meta di cio che gli serve.
 */
const notFound = () => denied("non trovato, o non appartiene al club attivo");

const resolveOrganizationId = (
  scope: DocumentTemplateScope | undefined,
  requested?: string | null,
) => {
  const wanted = asText(requested);

  if (!scope) {
    if (!wanted) throw new Error("Nessun club indicato");
    return wanted;
  }

  if (wanted) {
    ensureOrganizationAccess(scope, wanted);
    return wanted;
  }

  if (scope.activeOrganizationId) return scope.activeOrganizationId;

  throw new Error("Nessun club attivo selezionato");
};

/* ------------------------------------------------------------ le letture */

export type DocumentTemplateSummary = {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  subjectKind: TemplateSubjectKind;
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
  /** Quanti documenti sono nati da questo modello: dice se si puo cancellare. */
  generatedCount: number;
  /** La bozza differisce dall'ultima versione pubblicata? */
  hasUnpublishedChanges: boolean;
  /** Cosa il modello chiedera, e quanto e delicato: dalla versione pubblicata. */
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

const subjectOf = (value: unknown): TemplateSubjectKind =>
  isTemplateSubjectKind(value)
    ? (asText(value).toLowerCase() as TemplateSubjectKind)
    : "athlete";

const statusOf = (value: unknown): TemplateStatus =>
  isTemplateStatus(value) ? (asText(value).toLowerCase() as TemplateStatus) : "draft";

/**
 * La versione pubblicata dice ancora quello che dice la bozza?
 *
 * **Il soggetto conta quanto il testo, e dimenticarlo costava caro.** Quando
 * il confronto guardava solo titolo e contenuto, cambiare **solo** il soggetto
 * non creava una versione: la riga del modello diceva «atleta», la versione
 * pubblicata diceva «persona», la schermata abilitava la generazione leggendo
 * la riga e il server la rifiutava leggendo la versione. E `hasUnpublishedChanges`
 * restava falso, quindi la schermata non proponeva nemmeno di ripubblicare:
 * il modello restava ingenerabile senza via d uscita.
 */
const publishedMatchesDraft = (row: any, published: any) =>
  asText(published.content_html) === asText(row.draft_content) &&
  asText(published.title) === asText(row.title) &&
  subjectOf(published.subject_kind) === subjectOf(row.subject_kind);
const summarize = (
  row: any,
  extra: {
    generatedCount: number;
    publishedVersionRow: any | null;
  },
): DocumentTemplateSummary => {
  const published = extra.publishedVersionRow;
  return {
    id: row.id,
    organizationId: row.organization_id,
    title: asText(row.title),
    description: asText(row.description),
    subjectKind: subjectOf(row.subject_kind),
    status: statusOf(row.status),
    publishedVersion: Number(row.published_version || 0),
    publishedAt: row.published_at ? toIso(row.published_at) : null,
    catalogKey: row.catalog_key ? asText(row.catalog_key) : null,
    catalogClass: row.catalog_class ? asText(row.catalog_class) : null,
    editorialOwner: row.editorial_owner ? asText(row.editorial_owner) : null,
    lastReviewedAt: row.last_reviewed_at ? toIso(row.last_reviewed_at) : null,
    editorialNotes: row.editorial_notes ? asText(row.editorial_notes) : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    generatedCount: extra.generatedCount,
    /*
      Il confronto e sul testo, non su una data: un salvataggio che non cambia
      niente non deve accendere «ci sono modifiche non pubblicate», o
      l'avviso smette di significare qualcosa e si impara a ignorarlo.
    */
    hasUnpublishedChanges: published
      ? !publishedMatchesDraft(row, published)
      : asText(row.draft_content).length > 0,
    placeholderKeys: published?.placeholder_keys ?? [],
    sensitivity: published?.sensitivity ?? [],
  };
};

const loadTemplateRow = async (
  scope: DocumentTemplateScope,
  id: string,
) => {
  const templateId = asText(id);
  if (!templateId) throw new Error("Modello non indicato");

  const row = await (prisma as any).documentTemplate.findUnique({
    where: { id: templateId },
  });

  /*
    Un modello che non esiste e un modello di un altro club danno la **stessa**
    risposta. Distinguerli direbbe a chi prova identificativi a caso quali
    esistono, che e meta di cio che serve a chi ci prova.
  */
  if (!row) throw notFound();
  ensureOrganizationAccess(scope, row.organization_id);

  return row;
};

const loadPublishedVersion = async (row: any) => {
  if (!row?.published_version) return null;
  return (prisma as any).documentTemplateVersion.findUnique({
    where: {
      template_id_version: {
        template_id: row.id,
        version: Number(row.published_version),
      },
    },
  });
};

export const listDocumentTemplates = async (
  scope: DocumentTemplateScope,
  options: {
    organizationId?: string | null;
    includeRetired?: boolean;
    subjectKind?: string | null;
  } = {},
): Promise<DocumentTemplateSummary[]> => {
  const organizationId = resolveOrganizationId(scope, options.organizationId);

  const where: Record<string, any> = { organization_id: organizationId };
  if (!options.includeRetired) where.status = { not: "retired" };
  if (isTemplateSubjectKind(options.subjectKind)) {
    where.subject_kind = asText(options.subjectKind).toLowerCase();
  }

  const rows = await (prisma as any).documentTemplate.findMany({
    where,
    orderBy: [{ status: "asc" }, { title: "asc" }],
  });

  if (!rows.length) return [];

  /*
    Due letture in blocco invece di due per riga: un elenco di trenta modelli
    faceva sessanta query, ed e il difetto N+1 che la Wave 2 ha gia pagato
    altrove. `groupBy` e `findMany` con `in` bastano.
  */
  const ids = rows.map((row: any) => row.id);

  const [counts, publishedVersions] = await Promise.all([
    (prisma as any).generatedDocument.groupBy({
      by: ["template_id"],
      where: { organization_id: organizationId, template_id: { in: ids } },
      _count: { _all: true },
    }),
    (prisma as any).documentTemplateVersion.findMany({
      where: { template_id: { in: ids } },
      select: {
        template_id: true,
        version: true,
        title: true,
        content_html: true,
        placeholder_keys: true,
        sensitivity: true,
      },
    }),
  ]);

  const countByTemplate = new Map<string, number>(
    (counts || []).map((entry: any) => [
      entry.template_id,
      Number(entry?._count?._all || 0),
    ]),
  );

  const publishedByTemplate = new Map<string, any>();
  for (const row of rows) {
    const wanted = Number(row.published_version || 0);
    if (!wanted) continue;
    const found = (publishedVersions || []).find(
      (version: any) =>
        version.template_id === row.id && Number(version.version) === wanted,
    );
    if (found) publishedByTemplate.set(row.id, found);
  }

  return rows.map((row: any) =>
    summarize(row, {
      generatedCount: countByTemplate.get(row.id) || 0,
      publishedVersionRow: publishedByTemplate.get(row.id) || null,
    }),
  );
};

export const getDocumentTemplate = async (
  scope: DocumentTemplateScope,
  id: string,
): Promise<DocumentTemplateDetail> => {
  const row = await loadTemplateRow(scope, id);

  const [generatedCount, versions] = await Promise.all([
    (prisma as any).generatedDocument.count({
      where: { organization_id: row.organization_id, template_id: row.id },
    }),
    (prisma as any).documentTemplateVersion.findMany({
      where: { template_id: row.id },
      orderBy: { version: "desc" },
    }),
  ]);

  const published =
    (versions || []).find(
      (version: any) => Number(version.version) === Number(row.published_version),
    ) || null;

  return {
    ...summarize(row, { generatedCount, publishedVersionRow: published }),
    draftContent: asText(row.draft_content),
    versions: (versions || []).map((version: any) => ({
      id: version.id,
      version: Number(version.version),
      title: asText(version.title),
      publishedAt: toIso(version.published_at),
      publishedBy: version.published_by || null,
      placeholderKeys: version.placeholder_keys || [],
      sensitivity: version.sensitivity || [],
    })),
  };
};

/* ----------------------------------------------------------- le scritture */

export type CreateDocumentTemplateInput = {
  organizationId?: string | null;
  title: string;
  description?: string | null;
  subjectKind?: string | null;
  content?: string | null;
  /** Da quale voce di catalogo nasce, quando nasce da una. */
  catalogKey?: string | null;
  catalogClass?: string | null;
  editorialOwner?: string | null;
  editorialNotes?: string | null;
  lastReviewedAt?: string | Date | null;
};

export const createDocumentTemplate = async (
  scope: DocumentTemplateScope,
  input: CreateDocumentTemplateInput,
): Promise<DocumentTemplateDetail> => {
  const organizationId = resolveOrganizationId(scope, input.organizationId);
  const title = asText(input.title);
  if (!title) throw new Error("Il modello deve avere un titolo");

  const id = randomUUID();

  await (prisma as any).documentTemplate.create({
    data: {
      id,
      organization_id: organizationId,
      title,
      description: asText(input.description) || null,
      subject_kind: subjectOf(input.subjectKind),
      draft_content: String(input.content ?? ""),
      status: "draft",
      published_version: 0,
      catalog_key: asText(input.catalogKey) || null,
      catalog_class: asText(input.catalogClass) || null,
      editorial_owner: asText(input.editorialOwner) || null,
      editorial_notes: asText(input.editorialNotes) || null,
      last_reviewed_at: input.lastReviewedAt
        ? new Date(input.lastReviewedAt)
        : null,
      created_by: scope.userId || null,
    },
  });

  return getDocumentTemplate(scope, id);
};

export const updateDocumentTemplateDraft = async (
  scope: DocumentTemplateScope,
  id: string,
  input: {
    title?: string | null;
    description?: string | null;
    subjectKind?: string | null;
    content?: string | null;
    editorialOwner?: string | null;
    editorialNotes?: string | null;
    lastReviewedAt?: string | Date | null;
  },
): Promise<DocumentTemplateDetail> => {
  const row = await loadTemplateRow(scope, id);

  const data: Record<string, any> = {};

  if (input.title !== undefined) {
    const title = asText(input.title);
    if (!title) throw new Error("Il modello deve avere un titolo");
    data.title = title;
  }
  if (input.description !== undefined) {
    data.description = asText(input.description) || null;
  }
  if (input.subjectKind !== undefined) {
    if (!isTemplateSubjectKind(input.subjectKind)) {
      throw new Error(
        "Il modello deve dire di chi parla: club, atleta, persona o socio",
      );
    }
    data.subject_kind = asText(input.subjectKind).toLowerCase();
  }
  if (input.content !== undefined) {
    data.draft_content = String(input.content ?? "");
  }
  if (input.editorialOwner !== undefined) {
    data.editorial_owner = asText(input.editorialOwner) || null;
  }
  if (input.editorialNotes !== undefined) {
    data.editorial_notes = asText(input.editorialNotes) || null;
  }
  if (input.lastReviewedAt !== undefined) {
    data.last_reviewed_at = input.lastReviewedAt
      ? new Date(input.lastReviewedAt)
      : null;
  }

  if (Object.keys(data).length) {
    await (prisma as any).documentTemplate.update({
      where: { id: row.id },
      data,
    });
  }

  return getDocumentTemplate(scope, row.id);
};

/**
 * Pubblica la bozza: e l'atto che crea una versione.
 *
 * **Ripubblicare senza modifiche non crea una versione.** Versioni tutte
 * uguali farebbero smettere al numero di dire qualcosa: «la sedicesima» deve
 * significare che il testo e cambiato quindici volte, non che qualcuno ha
 * premuto salva quindici volte. E la stessa scelta di `publishFormTemplate`.
 */
export const publishDocumentTemplate = async (
  scope: DocumentTemplateScope,
  id: string,
): Promise<DocumentTemplateDetail> => {
  const row = await loadTemplateRow(scope, id);

  const validation = validateTemplateDraft({
    title: asText(row.title),
    content: asText(row.draft_content),
    subjectKind: subjectOf(row.subject_kind),
  });

  if (!validation.ok) {
    /*
      Il primo problema, non tutti: chi pubblica ne corregge uno per volta, e
      un elenco di dodici righe davanti a un editor non si legge. Gli altri
      restano in `issues` per chi vuole mostrarli.
    */
    const first = validation.issues[0];
    const error: any = new Error(first.message);
    error.issues = validation.issues;
    throw error;
  }

  const published = await loadPublishedVersion(row);
  const unchanged = published && publishedMatchesDraft(row, published);

  const now = new Date();

  if (unchanged) {
    /*
      Anche senza versione nuova, pubblicare **attiva**: e il gesto con cui un
      modello ritirato torna disponibile senza cambiare una virgola.
    */
    if (statusOf(row.status) !== "active") {
      await (prisma as any).documentTemplate.update({
        where: { id: row.id },
        data: { status: "active", published_at: now },
      });
    }
    return getDocumentTemplate(scope, row.id);
  }

  const version = nextTemplateVersion(row.published_version);

  await (prisma as any).$transaction([
    (prisma as any).documentTemplateVersion.create({
      data: {
        organization_id: row.organization_id,
        template_id: row.id,
        version,
        title: asText(row.title),
        content_html: asText(row.draft_content),
        placeholder_keys: validation.placeholderKeys,
        sensitivity: validation.sensitivity,
        subject_kind: subjectOf(row.subject_kind),
        published_at: now,
        published_by: scope.userId || null,
      },
    }),
    (prisma as any).documentTemplate.update({
      where: { id: row.id },
      data: {
        published_version: version,
        published_at: now,
        status: "active",
      },
    }),
  ]);

  return getDocumentTemplate(scope, row.id);
};

export const setDocumentTemplateStatus = async (
  scope: DocumentTemplateScope,
  id: string,
  status: string,
): Promise<DocumentTemplateDetail> => {
  const row = await loadTemplateRow(scope, id);
  const target = asText(status).toLowerCase();

  if (!isTemplateStatus(target)) {
    throw new Error(`Stato non ammesso per un modello: ${status}`);
  }

  if (!canTransitionTemplate(statusOf(row.status), target)) {
    throw new Error(
      `Un modello «${statusOf(row.status)}» non puo diventare «${target}»`,
    );
  }

  if (target === "active" && !Number(row.published_version || 0)) {
    throw new Error(
      "Un modello si attiva pubblicandolo: senza una versione non c'e niente da generare",
    );
  }

  await (prisma as any).documentTemplate.update({
    where: { id: row.id },
    data: { status: target },
  });

  return getDocumentTemplate(scope, row.id);
};

/**
 * Cancella un modello — **solo** se non ha mai prodotto niente.
 *
 * Il database lo impedirebbe comunque (`ON DELETE RESTRICT` su
 * `generated_documents`), ma un vincolo di integrita produce un errore
 * dell'ORM, e un errore dell'ORM davanti a una segreteria e un errore che
 * nessuno sa leggere. Qui la stessa regola viene detta in italiano, prima.
 */
export const deleteDocumentTemplate = async (
  scope: DocumentTemplateScope,
  id: string,
) => {
  const row = await loadTemplateRow(scope, id);

  const generated = await (prisma as any).generatedDocument.count({
    where: { organization_id: row.organization_id, template_id: row.id },
  });

  if (generated > 0) {
    throw new Error(
      `Questo modello ha gia prodotto ${generated} document${generated === 1 ? "o" : "i"}: si ritira, non si cancella, o quei documenti non saprebbero piu spiegarsi`,
    );
  }

  await (prisma as any).documentTemplate.delete({ where: { id: row.id } });
  // Il club della riga cancellata: e cio che l audit deve registrare.
  return { id: row.id, organizationId: row.organization_id as string };
};

/* --------------------------------------------------- i documenti generati */

export type GeneratedDocumentSummary = {
  /**
   * Vero quando la riga esisteva **gia** dentro questo lotto e non e stata
   * riscritta.
   *
   * Senza questo campo l'upsert restituiva la riga vecchia in silenzio: una
   * segreteria che correggeva un codice fiscale e ripeteva la fetta otteneva
   * lo stesso documento di prima, ancora con il campo bianco, e non aveva
   * nessun modo di accorgersene. Per «rigenera solo i falliti» va bene ed e
   * voluto; per chiunque altro era una trappola.
   */
  reused?: boolean;
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
  status: GeneratedDocumentStatus;
  signedAttachmentId: string | null;
  signedAt: string | null;
  batchId: string | null;
  generatedBy: string | null;
  generatedAt: string;
};

const summarizeGenerated = (row: any): GeneratedDocumentSummary => ({
  id: row.id,
  organizationId: row.organization_id,
  templateId: row.template_id,
  versionId: row.version_id,
  templateTitle: asText(row.template?.title || row.version?.title),
  version: Number(row.version?.version || 0),
  subjectKind: asText(row.subject_kind),
  subjectId: asText(row.subject_id),
  subjectLabel: row.subject_label ? asText(row.subject_label) : null,
  seasonId: row.season_id ? asText(row.season_id) : null,
  unresolved: row.unresolved || [],
  missing: row.missing || [],
  warnings: row.warnings || [],
  sensitivity: row.sensitivity || [],
  protocolNumber: row.protocol_number ? asText(row.protocol_number) : null,
  status: (asText(row.status) || "generated") as GeneratedDocumentStatus,
  signedAttachmentId: row.signed_attachment_id || null,
  signedAt: row.signed_at ? toIso(row.signed_at) : null,
  batchId: row.batch_id ? asText(row.batch_id) : null,
  generatedBy: row.generated_by || null,
  generatedAt: toIso(row.generated_at),
});

export type RecordGeneratedDocumentInput = {
  organizationId?: string | null;
  templateId: string;
  versionId: string;
  subjectKind: string;
  subjectId: string;
  subjectLabel?: string | null;
  seasonId?: string | null;
  valuesSnapshot: Record<string, string>;
  contentHtml: string;
  unresolved?: string[];
  missing?: string[];
  warnings?: string[];
  sensitivity?: string[];
  batchId?: string | null;
};

/**
 * Scrive il documento generato.
 *
 * **Perche conserva la propria resa** (ADR-0089). Congelare versione e valori
 * basterebbe **solo se il risolutore non cambiasse mai**. Cambiera: e appena
 * cambiato in questa Wave. Una colonna di testo costa poco e toglie di mezzo
 * un'intera classe di dubbi — un documento rilasciato a marzo si rilegge a
 * novembre identico, qualunque cosa sia successa nel frattempo al codice.
 *
 * **L'idempotenza del lotto** e l'indice unico
 * `(organization_id, batch_id, subject_kind, subject_id)`. In PostgreSQL un
 * indice unico non vincola le righe con un `NULL`: una generazione singola
 * (`batchId` assente) resta quindi libera di ripetersi — due attestazioni
 * chieste due volte sono due documenti — mentre dentro un lotto lo stesso
 * soggetto compare una volta sola. E cio che permette a un nuovo tentativo di
 * rigenerare **solo** i falliti.
 */
export const recordGeneratedDocument = async (
  scope: DocumentTemplateScope,
  input: RecordGeneratedDocumentInput,
): Promise<GeneratedDocumentSummary> => {
  const organizationId = resolveOrganizationId(scope, input.organizationId);

  const version = await (prisma as any).documentTemplateVersion.findUnique({
    where: { id: asText(input.versionId) },
  });

  if (!version || version.organization_id !== organizationId) {
    throw notFound();
  }
  if (version.template_id !== asText(input.templateId)) {
    throw new Error("La versione indicata non appartiene a questo modello");
  }

  const sensitivity = input.sensitivity ?? version.sensitivity ?? [];

  /*
    Il permesso si controlla **anche qui** e non solo nella rotta: questa
    funzione la chiamano la generazione singola, il lotto e la modulistica
    pubblica, e tre chiamanti che si ricordano da soli di chiedere il permesso
    sono tre occasioni di dimenticarselo.
  */
  const refusal = explainGenerationDenial(scope.role, sensitivity);
  if (refusal) throw new Error(refusal);

  const batchId = asText(input.batchId) || null;

  const data = {
    organization_id: organizationId,
    template_id: asText(input.templateId),
    version_id: version.id,
    subject_kind: asText(input.subjectKind),
    subject_id: asText(input.subjectId),
    subject_label: asText(input.subjectLabel) || null,
    season_id: asText(input.seasonId) || null,
    values_snapshot: input.valuesSnapshot ?? {},
    content_html: String(input.contentHtml ?? ""),
    unresolved: input.unresolved ?? [],
    missing: input.missing ?? [],
    warnings: input.warnings ?? [],
    sensitivity,
    batch_id: batchId,
    status: "generated",
    generated_by: scope.userId || null,
  };

  if (!batchId) {
    const created = await (prisma as any).generatedDocument.create({ data });
    return { ...summarizeGenerated({ ...created, version }), reused: false };
  }

  /*
    Dentro un lotto la riga si scrive **una volta sola**, e riprovare non
    fallisce: `upsert` sull'indice del lotto rende il nuovo tentativo
    innocuo su cio che era gia riuscito, che e esattamente cio che serve a
    «rigenera solo i tre falliti».
  */
  const chiaveLotto = {
    generated_documents_batch_subject: {
      organization_id: organizationId,
      batch_id: batchId,
      template_id: data.template_id,
      subject_kind: data.subject_kind,
      subject_id: data.subject_id,
    },
  };

  /*
    Se c'era gia lo si chiede **prima**, e non lo si deduce da un orologio.

    La prima versione ricavava `reused` confrontando la data di generazione
    della riga con l'istante della chiamata: due orologi diversi — quello di
    Postgres e quello dell'applicazione — e su Vercel piu Neon non sono lo
    stesso. Una riga appena **creata** poteva risultare riusata, cioe un dato
    sbagliato mostrato a chi lo legge.

    Una lettura in piu per documento, sull'indice del lotto: e il prezzo di
    una risposta che si puo credere.
  */
  const esistente = await (prisma as any).generatedDocument.findUnique({
    where: chiaveLotto,
    select: { id: true },
  });

  const created = await (prisma as any).generatedDocument.upsert({
    where: chiaveLotto,
    create: data,
    update: {},
  });

  const reused = Boolean(esistente);

  return { ...summarizeGenerated({ ...created, version }), reused };
};

export const listGeneratedDocuments = async (
  scope: DocumentTemplateScope,
  options: {
    organizationId?: string | null;
    templateId?: string | null;
    subjectKind?: string | null;
    subjectId?: string | null;
    batchId?: string | null;
    limit?: number;
  } = {},
): Promise<GeneratedDocumentSummary[]> => {
  const organizationId = resolveOrganizationId(scope, options.organizationId);

  const where: Record<string, any> = { organization_id: organizationId };
  if (asText(options.templateId)) where.template_id = asText(options.templateId);
  if (asText(options.subjectKind)) where.subject_kind = asText(options.subjectKind);
  if (asText(options.subjectId)) where.subject_id = asText(options.subjectId);
  if (asText(options.batchId)) where.batch_id = asText(options.batchId);

  /*
    Il perimetro sull'elenco: si chiede al proprietario l'insieme degli
    atleti ammessi e si stringe il `where`. Chi non ha un perimetro non e
    toccato, ed e la regola dichiarata — zero righe vuol dire tutto il club.
  */
  if (buildAthleteAccessScopeConditions(scope)) {
    const ammessi = await athleteIdsWithinAccessScope(organizationId, scope);
    where.OR = [
      { subject_kind: { not: "athlete" } },
      { subject_id: { in: ammessi } },
    ];
  }

  const rows = await (prisma as any).generatedDocument.findMany({
    where,
    orderBy: { generated_at: "desc" },
    take: Math.min(Math.max(Number(options.limit || 200), 1), 500),
    /*
      `content_html` **non** entra in un elenco. E il campo piu grande della
      riga e nessuna lista lo mostra: portarlo via costerebbe megabyte per
      dire trenta titoli — lo stesso difetto per cui i modelli sono usciti
      dalla riga del club.
    */
    select: {
      id: true,
      organization_id: true,
      template_id: true,
      version_id: true,
      subject_kind: true,
      subject_id: true,
      subject_label: true,
      season_id: true,
      unresolved: true,
      missing: true,
      warnings: true,
      sensitivity: true,
      protocol_number: true,
      status: true,
      signed_attachment_id: true,
      signed_at: true,
      batch_id: true,
      generated_by: true,
      generated_at: true,
      template: { select: { title: true } },
      version: { select: { version: true, title: true } },
    },
  });

  const summaries: GeneratedDocumentSummary[] = (rows || []).map(
    summarizeGenerated,
  );

  /*
    Il filtro di lettura si applica **dopo** la query e non dentro, perche
    dipende da due cose che una `where` non sa mettere insieme: la classe
    sensibile del documento e chi lo ha prodotto. Il costo e trascurabile —
    l'elenco e gia limitato — e il guadagno e che la regola vive in un posto
    solo (`canReadGeneratedDocument`).
  */
  if (scope.role === undefined) return summaries;

  return summaries.filter((document) =>
    canReadGeneratedDocument(
      scope.role,
      { sensitivity: document.sensitivity, generated_by: document.generatedBy },
      scope.userId,
    ),
  );
};

export type GeneratedDocumentDetail = GeneratedDocumentSummary & {
  contentHtml: string;
  valuesSnapshot: Record<string, string>;
};

export const getGeneratedDocument = async (
  scope: DocumentTemplateScope,
  id: string,
): Promise<GeneratedDocumentDetail> => {
  const documentId = asText(id);
  if (!documentId) throw new Error("Documento non indicato");

  const row = await (prisma as any).generatedDocument.findUnique({
    where: { id: documentId },
    include: {
      template: { select: { title: true } },
      version: { select: { version: true, title: true } },
    },
  });

  if (!row) throw notFound();
  ensureOrganizationAccess(scope, row.organization_id);

  /* Stessa ragione dell'elenco: e la porta per identificativo. */
  if (String(row.subject_kind || "").trim().toLowerCase() === "athlete") {
    const dentro = await athleteWithinAccessScope(
      row.organization_id,
      String(row.subject_id || "").trim(),
      scope,
    );
    if (!dentro) {
      throw denied(
        "questo documento riguarda una persona fuori dal perimetro di sede o categoria del ruolo attivo",
      );
    }
  }

  if (
    !canReadGeneratedDocument(
      scope.role,
      { sensitivity: row.sensitivity || [], generated_by: row.generated_by },
      scope.userId,
    )
  ) {
    throw denied("questo documento contiene dati che il tuo ruolo non vede");
  }

  return {
    ...summarizeGenerated(row),
    contentHtml: String(row.content_html || ""),
    valuesSnapshot: (row.values_snapshot as Record<string, string>) || {},
  };
};

/**
 * Porta avanti lo stato di un documento.
 *
 * «Firmato» pretende l'allegato con la copia rientrata: senza, sarebbe una
 * spunta, cioe esattamente cio che ADR-0091 dice di non fare.
 */
export const advanceGeneratedDocument = async (
  scope: DocumentTemplateScope,
  id: string,
  input: { status: string; signedAttachmentId?: string | null },
): Promise<GeneratedDocumentSummary> => {
  const documentId = asText(id);
  const row = await (prisma as any).generatedDocument.findUnique({
    where: { id: documentId },
    include: { version: { select: { version: true, title: true } } },
  });

  if (!row) throw notFound();
  ensureOrganizationAccess(scope, row.organization_id);

  /*
    **Chi non puo leggerlo non puo nemmeno toccarlo.** Prima qui bastava
    appartenere ai ruoli di segreteria: chi non poteva aprire un'attestazione
    con gli importi poteva comunque archiviarla, e la risposta gli restituiva
    il nome del soggetto e le classi sensibili. Un permesso di scrittura piu
    largo di quello di lettura non e mai stato una scelta: era una svista.
  */
  if (
    !canReadGeneratedDocument(
      scope.role,
      { sensitivity: row.sensitivity || [], generated_by: row.generated_by },
      scope.userId,
    )
  ) {
    throw denied("questo documento contiene dati che il tuo ruolo non vede");
  }

  const target = asText(input.status).toLowerCase();
  if (!isGeneratedDocumentStatus(target)) {
    throw new Error(`Stato non ammesso per un documento: ${input.status}`);
  }

  if (!canTransitionGeneratedDocument(asText(row.status), target)) {
    throw new Error(
      `Un documento «${asText(row.status)}» non puo diventare «${target}»`,
    );
  }

  const signedAttachmentId = asText(input.signedAttachmentId) || null;

  if (requiresSignedAttachment(target)) {
    if (!signedAttachmentId) {
      throw new Error(
        "Per dire «firmato» serve la copia firmata: caricala e riprova",
      );
    }

    /*
      **E la copia firmata deve esistere, e deve essere di questo club.**
      Prima l'identificativo veniva conservato cosi com'era: bastava mandare un
      UUID inventato per portare un documento in «firmato», e lo stato che
      ADR-0091 definisce come «e rientrata una copia» diventava esattamente
      quella spunta che l'ADR dice di non fare. La colonna non ha una chiave
      esterna — un allegato si puo cancellare, e il documento storico non deve
      diventare incancellabile per questo — quindi il controllo va fatto qui.
    */
    const attachment = await (prisma as any).attachment.findFirst({
      where: { id: signedAttachmentId, organization_id: row.organization_id },
      select: { id: true },
    });

    if (!attachment) {
      throw denied(
        "la copia firmata indicata non esiste, o appartiene a un altro club",
      );
    }
  }

  const updated = await (prisma as any).generatedDocument.update({
    where: { id: row.id },
    data: {
      status: target,
      signed_attachment_id: requiresSignedAttachment(target)
        ? signedAttachmentId
        : row.signed_attachment_id,
      signed_at: requiresSignedAttachment(target) ? new Date() : row.signed_at,
    },
    include: { version: { select: { version: true, title: true } } },
  });

  return summarizeGenerated(updated);
};

/**
 * La versione con cui generare, per un modello.
 *
 * Restituisce **sempre** una versione pubblicata: generare da una bozza non
 * pubblicata e possibile solo in anteprima, e l'anteprima non scrive nessuna
 * riga.
 */
export const loadPublishableVersion = async (
  scope: DocumentTemplateScope,
  templateId: string,
) => {
  const row = await loadTemplateRow(scope, templateId);

  if (statusOf(row.status) === "retired") {
    throw new Error(
      "Questo modello e stato ritirato: non produce documenti nuovi",
    );
  }

  const version = await loadPublishedVersion(row);
  if (!version) {
    throw new Error(
      "Questo modello non e mai stato pubblicato: pubblicalo e riprova",
    );
  }

  if (!canGenerateDocumentWithSensitivity(scope.role, version.sensitivity || [])) {
    throw new Error(
      explainGenerationDenial(scope.role, version.sensitivity || []) ||
        "Accesso negato",
    );
  }

  return { template: row, version };
};
