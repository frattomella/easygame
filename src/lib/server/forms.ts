import { randomBytes, randomUUID } from "crypto";
import { prisma } from "./prisma";
import {
  buildPublicFormPath,
  buildPublicSlug,
  getAnswerableFields,
  getSchemaSubjects,
  isFormClosed,
  normalizeFormSchema,
  PUBLIC_SLUG_SUFFIX_LENGTH,
  schemasAreEqual,
  type FormSchema,
  type FormStatus,
  type FormTemplateDetail,
  type FormTemplateSummary,
} from "@/lib/forms/model";
import { validateSchema, validateSchemaForPublish } from "@/lib/forms/validation";
import {
  createStarterSchema,
  isStarterTemplateKey,
  type StarterTemplateKey,
} from "@/lib/forms/starter-templates";

/**
 * Il servizio dei moduli: **l'unico** punto in cui EasyGame legge o scrive un
 * modulo, una versione o il suo link pubblico (Modulistica V2, ADR-0035).
 *
 * **Il confine di sicurezza e `organization_id`.** Ogni funzione riceve uno
 * scope e lo applica: nessuna riga di un altro club si legge, si modifica o si
 * pubblica, e il messaggio contiene «Accesso negato» perche il route handler
 * lo mappi su 403.
 *
 * **Due eccezioni allo scope, entrambe deliberate.**
 * `findPublicFormBySlug` non riceve uno scope: e la funzione che serve il
 * modulo pubblico, che per definizione viene aperto da chi non ha una
 * sessione. Restituisce **solo** la versione pubblicata di un modulo
 * pubblicato e abilitato al link, e mai le compilazioni gia raccolte.
 *
 * **Perche la bozza e la versione sono separate.** Modificare un modulo gia
 * in uso non deve cambiare il significato delle risposte gia arrivate. Il
 * builder scrive su `draft`; pubblicare congela `draft` in una riga
 * immutabile di `form_template_versions`, ed e quella che il pubblico compila.
 */

export type FormsAccessScope = {
  userId: string;
  activeOrganizationId: string | null;
  allowedOrganizationIds: string[];
};

const denied = (message: string) => new Error(`Accesso negato: ${message}`);

const ensureOrganizationAccess = (
  scope: FormsAccessScope | undefined,
  organizationId: string | null | undefined,
) => {
  if (!scope) return;
  if (!organizationId) throw denied("modulo senza club");
  if (!scope.allowedOrganizationIds.includes(organizationId)) {
    throw denied("il modulo appartiene a un altro club");
  }
};

const resolveOrganizationId = (
  scope: FormsAccessScope | undefined,
  requested?: string | null,
) => {
  const wanted = String(requested || "").trim();

  if (!scope) {
    if (!wanted) throw new Error("Nessun club indicato per il modulo");
    return wanted;
  }

  if (wanted) {
    ensureOrganizationAccess(scope, wanted);
    return wanted;
  }

  if (scope.activeOrganizationId) return scope.activeOrganizationId;

  throw new Error("Nessun club attivo selezionato");
};

const asText = (value: unknown) => String(value ?? "").trim();

const toIso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : asText(value);

/**
 * Il suffisso casuale dello slug pubblico.
 *
 * `randomBytes`, non `Math.random`: uno slug indovinabile e un modulo di
 * iscrizione compilabile da chiunque provi qualche variante del nome del
 * club, e non ce ne accorgerebbe nessuno.
 */
const newSlugSuffix = () =>
  randomBytes(Math.ceil(PUBLIC_SLUG_SUFFIX_LENGTH / 2))
    .toString("hex")
    .slice(0, PUBLIC_SLUG_SUFFIX_LENGTH);

/**
 * Uno slug libero. Lo `unique` sulla colonna e l'autorita: qui si evita solo
 * di andarci a sbattere, e si riprova se due richieste arrivano insieme.
 */
const buildFreeSlug = async (title: string) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = buildPublicSlug(title, newSlugSuffix());
    const taken = await (prisma as any).formTemplate.findUnique({
      where: { public_slug: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }

  return buildPublicSlug(title, newSlugSuffix());
};

const TEMPLATE_SELECT = {
  id: true,
  organization_id: true,
  title: true,
  description: true,
  status: true,
  public_slug: true,
  public_enabled: true,
  draft: true,
  published_version: true,
  published_at: true,
  created_at: true,
  updated_at: true,
} as const;

type TemplateRow = {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  status: string;
  public_slug: string;
  public_enabled: boolean;
  draft: unknown;
  published_version: number;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

const normalizeStatus = (value: unknown): FormStatus => {
  const status = asText(value);
  return status === "published" || status === "archived" ? status : "draft";
};

const loadPublishedSchema = async (
  templateId: string,
  version: number,
): Promise<FormSchema | null> => {
  if (!version) return null;

  const row = await (prisma as any).formTemplateVersion.findUnique({
    where: { template_id_version: { template_id: templateId, version } },
    select: { schema_json: true },
  });

  return row ? normalizeFormSchema(row.schema_json) : null;
};

const summarize = (
  row: TemplateRow,
  counts: { submissions: number; pending: number },
  published: FormSchema | null,
): FormTemplateSummary => {
  const draft = normalizeFormSchema(row.draft);

  return {
    id: row.id,
    organizationId: row.organization_id,
    title: draft.title || row.title,
    description: draft.description || asText(row.description),
    status: normalizeStatus(row.status),
    publicSlug: row.public_slug,
    publicPath: row.public_enabled ? buildPublicFormPath(row.public_slug) : "",
    subjects: getSchemaSubjects(draft),
    publishedVersion: row.published_version,
    hasUnpublishedChanges: published
      ? !schemasAreEqual(draft, published)
      : row.published_version > 0,
    fieldCount: getAnswerableFields(draft).length,
    submissionCount: counts.submissions,
    pendingCount: counts.pending,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    publishedAt: toIso(row.published_at),
  };
};

/* ------------------------------------------------------------- letture */

export const listFormTemplates = async (
  scope: FormsAccessScope,
  options: { organizationId?: string | null; includeArchived?: boolean } = {},
): Promise<FormTemplateSummary[]> => {
  const organizationId = resolveOrganizationId(scope, options.organizationId);

  const rows: TemplateRow[] = await (prisma as any).formTemplate.findMany({
    where: {
      organization_id: organizationId,
      ...(options.includeArchived ? {} : { status: { not: "archived" } }),
    },
    select: TEMPLATE_SELECT,
    orderBy: { updated_at: "desc" },
  });

  /*
    I conteggi in una query sola: una `count` per modulo trasformerebbe un
    elenco di venti moduli in quarantuno round trip verso Neon.
  */
  const grouped: Array<{ template_id: string; status: string; _count: { _all: number } }> =
    rows.length
      ? await (prisma as any).formSubmission.groupBy({
          by: ["template_id", "status"],
          where: {
            organization_id: organizationId,
            template_id: { in: rows.map((row) => row.id) },
          },
          _count: { _all: true },
        })
      : [];

  const countsByTemplate = new Map<string, { submissions: number; pending: number }>();
  for (const entry of grouped) {
    const current = countsByTemplate.get(entry.template_id) || {
      submissions: 0,
      pending: 0,
    };
    const amount = entry._count?._all || 0;
    current.submissions += amount;
    if (entry.status === "pending") current.pending += amount;
    countsByTemplate.set(entry.template_id, current);
  }

  const summaries: FormTemplateSummary[] = [];
  for (const row of rows) {
    const published = await loadPublishedSchema(row.id, row.published_version);
    summaries.push(
      summarize(
        row,
        countsByTemplate.get(row.id) || { submissions: 0, pending: 0 },
        published,
      ),
    );
  }

  return summaries;
};

const loadTemplateRow = async (
  scope: FormsAccessScope | undefined,
  id: string,
): Promise<TemplateRow> => {
  const row: TemplateRow | null = await (prisma as any).formTemplate.findUnique({
    where: { id: asText(id) },
    select: TEMPLATE_SELECT,
  });

  if (!row) throw new Error("Modulo non trovato");
  ensureOrganizationAccess(scope, row.organization_id);
  return row;
};

export const getFormTemplate = async (
  scope: FormsAccessScope,
  id: string,
): Promise<FormTemplateDetail> => {
  const row = await loadTemplateRow(scope, id);
  const published = await loadPublishedSchema(row.id, row.published_version);

  const [submissions, pending] = await Promise.all([
    (prisma as any).formSubmission.count({
      where: { organization_id: row.organization_id, template_id: row.id },
    }),
    (prisma as any).formSubmission.count({
      where: {
        organization_id: row.organization_id,
        template_id: row.id,
        status: "pending",
      },
    }),
  ]);

  return {
    ...summarize(row, { submissions, pending }, published),
    draft: normalizeFormSchema(row.draft),
    published,
  };
};

/* ----------------------------------------------------------- scritture */

export const createFormTemplate = async (
  scope: FormsAccessScope,
  options: { organizationId?: string | null; starter?: string | null } = {},
): Promise<FormTemplateDetail> => {
  const organizationId = resolveOrganizationId(scope, options.organizationId);
  const starter: StarterTemplateKey = isStarterTemplateKey(options.starter)
    ? options.starter
    : "blank";

  const draft = normalizeFormSchema(createStarterSchema(starter));
  const id = randomUUID();

  await (prisma as any).formTemplate.create({
    data: {
      id,
      organization_id: organizationId,
      title: draft.title,
      description: draft.description || null,
      status: "draft",
      public_slug: await buildFreeSlug(draft.title),
      public_enabled: true,
      draft,
      published_version: 0,
      created_by: scope.userId || null,
    },
  });

  return getFormTemplate(scope, id);
};

export const updateFormTemplateDraft = async (
  scope: FormsAccessScope,
  id: string,
  rawSchema: unknown,
): Promise<FormTemplateDetail> => {
  const row = await loadTemplateRow(scope, id);
  const draft = normalizeFormSchema(rawSchema);

  const validation = validateSchema(draft);
  if (!validation.valid) {
    throw new Error(validation.errors[0]);
  }

  await (prisma as any).formTemplate.update({
    where: { id: row.id },
    data: {
      title: draft.title,
      description: draft.description || null,
      draft,
    },
  });

  return getFormTemplate(scope, row.id);
};

/**
 * Pubblica la bozza.
 *
 * Se la bozza e identica all'ultima versione pubblicata non se ne crea una
 * nuova: ripubblicare senza modifiche produrrebbe versioni tutte uguali, e
 * il numero di versione smetterebbe di dire qualcosa.
 */
export const publishFormTemplate = async (
  scope: FormsAccessScope,
  id: string,
): Promise<FormTemplateDetail> => {
  const row = await loadTemplateRow(scope, id);
  const draft = normalizeFormSchema(row.draft);

  const validation = validateSchemaForPublish(draft);
  if (!validation.valid) {
    throw new Error(validation.errors[0]);
  }

  const published = await loadPublishedSchema(row.id, row.published_version);
  const unchanged = published ? schemasAreEqual(draft, published) : false;
  const nextVersion = unchanged
    ? row.published_version
    : row.published_version + 1;
  const now = new Date();

  if (!unchanged) {
    await (prisma as any).formTemplateVersion.create({
      data: {
        organization_id: row.organization_id,
        template_id: row.id,
        version: nextVersion,
        schema_json: draft,
        published_at: now,
        published_by: scope.userId || null,
      },
    });
  }

  await (prisma as any).formTemplate.update({
    where: { id: row.id },
    data: {
      status: "published",
      published_version: nextVersion,
      published_at: now,
    },
  });

  return getFormTemplate(scope, row.id);
};

/**
 * Riporta il modulo in bozza.
 *
 * Le versioni gia pubblicate restano: cancellarle renderebbe illeggibili le
 * compilazioni che le citano. Il link pubblico smette di rispondere, ed e
 * tutto cio che «togliere dalla pubblicazione» deve significare.
 */
export const setFormTemplateStatus = async (
  scope: FormsAccessScope,
  id: string,
  status: FormStatus,
): Promise<FormTemplateDetail> => {
  const row = await loadTemplateRow(scope, id);

  if (status === "published") {
    return publishFormTemplate(scope, row.id);
  }

  await (prisma as any).formTemplate.update({
    where: { id: row.id },
    data: { status },
  });

  return getFormTemplate(scope, row.id);
};

export const setFormTemplatePublicAccess = async (
  scope: FormsAccessScope,
  id: string,
  enabled: boolean,
): Promise<FormTemplateDetail> => {
  const row = await loadTemplateRow(scope, id);

  await (prisma as any).formTemplate.update({
    where: { id: row.id },
    data: { public_enabled: Boolean(enabled) },
  });

  return getFormTemplate(scope, row.id);
};

/**
 * Rigenera il link pubblico.
 *
 * Serve quando un link e finito dove non doveva: il vecchio smette
 * immediatamente di rispondere. E anche il modo per dare un suffisso casuale
 * ai moduli travasati dalla prima versione, che ne erano privi.
 */
export const regenerateFormTemplateSlug = async (
  scope: FormsAccessScope,
  id: string,
): Promise<FormTemplateDetail> => {
  const row = await loadTemplateRow(scope, id);
  const draft = normalizeFormSchema(row.draft);

  await (prisma as any).formTemplate.update({
    where: { id: row.id },
    data: { public_slug: await buildFreeSlug(draft.title) },
  });

  return getFormTemplate(scope, row.id);
};

export const duplicateFormTemplate = async (
  scope: FormsAccessScope,
  id: string,
): Promise<FormTemplateDetail> => {
  const row = await loadTemplateRow(scope, id);
  const source = normalizeFormSchema(row.draft);
  const draft: FormSchema = { ...source, title: `${source.title} (copia)` };
  const newId = randomUUID();

  await (prisma as any).formTemplate.create({
    data: {
      id: newId,
      organization_id: row.organization_id,
      title: draft.title,
      description: draft.description || null,
      status: "draft",
      public_slug: await buildFreeSlug(draft.title),
      public_enabled: true,
      draft,
      published_version: 0,
      created_by: scope.userId || null,
    },
  });

  return getFormTemplate(scope, newId);
};

/**
 * Cancella un modulo — solo se non ha raccolto niente.
 *
 * Un modulo con compilazioni si archivia, non si cancella: ogni compilazione
 * cita la versione con cui e stata compilata, e senza quella riga la risposta
 * diventa un elenco di identificativi senza domande.
 */
export const deleteFormTemplate = async (
  scope: FormsAccessScope,
  id: string,
): Promise<{ deleted: boolean; archived: boolean }> => {
  const row = await loadTemplateRow(scope, id);

  const submissions = await (prisma as any).formSubmission.count({
    where: { organization_id: row.organization_id, template_id: row.id },
  });

  if (submissions > 0) {
    await (prisma as any).formTemplate.update({
      where: { id: row.id },
      data: { status: "archived" },
    });
    return { deleted: false, archived: true };
  }

  await (prisma as any).formTemplate.delete({ where: { id: row.id } });
  return { deleted: true, archived: false };
};

/* -------------------------------------------------------- lato pubblico */

export type PublicFormMatch = {
  templateId: string;
  organizationId: string;
  versionId: string;
  version: number;
  schema: FormSchema;
  club: {
    id: string;
    name: string;
    logoUrl: string;
    contactEmail: string;
  };
};

/**
 * Il modulo dietro uno slug pubblico.
 *
 * Restituisce `null` — e chi chiama risponde 404 — in tutti i casi in cui il
 * modulo non e compilabile: slug inesistente, modulo in bozza o archiviato,
 * link disabilitato, nessuna versione pubblicata, modulo chiuso per data.
 * **Un solo esito per tutti**: distinguere «non esiste» da «esiste ma e in
 * bozza» direbbe a chi prova gli slug quali ha indovinato.
 */
export const findPublicFormBySlug = async (
  publicSlug: string,
  now = new Date(),
): Promise<PublicFormMatch | null> => {
  const slug = asText(publicSlug);
  if (!slug) return null;

  const row = await (prisma as any).formTemplate.findUnique({
    where: { public_slug: slug },
    select: {
      id: true,
      organization_id: true,
      status: true,
      public_enabled: true,
      published_version: true,
      organization: {
        select: {
          id: true,
          name: true,
          logo_url: true,
          contact_email: true,
        },
      },
    },
  });

  if (!row) return null;
  if (row.status !== "published") return null;
  if (!row.public_enabled) return null;
  if (!row.published_version) return null;

  const version = await (prisma as any).formTemplateVersion.findUnique({
    where: {
      template_id_version: {
        template_id: row.id,
        version: row.published_version,
      },
    },
    select: { id: true, version: true, schema_json: true },
  });

  if (!version) return null;

  const schema = normalizeFormSchema(version.schema_json);
  if (isFormClosed(schema, now)) return null;

  return {
    templateId: row.id,
    organizationId: row.organization_id,
    versionId: version.id,
    version: version.version,
    schema,
    club: {
      id: row.organization?.id || row.organization_id,
      name: row.organization?.name || "",
      logoUrl: row.organization?.logo_url || "",
      contactEmail: row.organization?.contact_email || "",
    },
  };
};

/**
 * La versione con cui si compila adesso, per una compilazione interna.
 *
 * Compilare usa sempre una versione pubblicata: e la pubblicazione a
 * congelare il significato delle domande. Un modulo mai pubblicato non si
 * compila, e il messaggio lo dice.
 */
export const resolveCompilableVersion = async (
  scope: FormsAccessScope,
  templateId: string,
): Promise<{ row: TemplateRow; versionId: string; version: number; schema: FormSchema }> => {
  const row = await loadTemplateRow(scope, templateId);

  if (!row.published_version) {
    throw new Error(
      "Il modulo non e ancora pubblicato: pubblicalo per poterlo compilare.",
    );
  }

  const version = await (prisma as any).formTemplateVersion.findUnique({
    where: {
      template_id_version: {
        template_id: row.id,
        version: row.published_version,
      },
    },
    select: { id: true, version: true, schema_json: true },
  });

  if (!version) {
    throw new Error("La versione pubblicata del modulo non e disponibile.");
  }

  return {
    row,
    versionId: version.id,
    version: version.version,
    schema: normalizeFormSchema(version.schema_json),
  };
};
