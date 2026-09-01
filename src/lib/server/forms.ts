import { randomBytes, randomUUID } from "crypto";
import { canAccessClubResource } from "@/lib/access-roles";
import { assertActiveClub } from "@/lib/auth/active-club-boundary";
import { prisma } from "./prisma";
import {
  buildPublicFormPath,
  buildPublicSlug,
  getAnswerableFields,
  getSchemaSubjects,
  isEnrollmentForm,
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
  applyServerFieldOptions,
  buildFormOptionCatalog,
  EMPTY_FORM_OPTION_CATALOG,
  type FormOptionCatalog,
} from "@/lib/forms/field-options";
import {
  getActiveClubSites,
  normalizeClubSites,
  type ClubSite,
} from "@/lib/club-sites";
import {
  createStarterSchema,
  isStarterTemplateKey,
  type StarterTemplateKey,
} from "@/lib/forms/starter-templates";
import {
  buildFormFromCatalog,
  findFormCatalogEntry,
  isDistributableFormEntry,
} from "@/lib/forms/catalog";

/**
 * Il servizio dei moduli: **l'unico** punto in cui EasyGame legge o scrive un
 * modulo, una versione o il suo link pubblico (Modulistica V2, ADR-0039).
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
  /**
   * Il ruolo attivo, quando la sessione ce l'ha.
   *
   * Nessuna funzione di questo file lo guarda: un modulo lo gestisce chi
   * appartiene al club, e il confine e `organization_id`. Serve
   * all'approvazione (W3-F), che dopo aver scritto in anagrafica chiede a due
   * domini vicini di registrare un consenso e di generare un documento — e
   * quei due domini decidono **loro** chi puo, con la matrice del §13. Farlo
   * arrivare fin li richiede solo che il tipo lo dichiari: le rotte passano
   * gia lo scope della sessione, che lo contiene.
   */
  activeRole?: string | null;
};

const denied = (message: string) => new Error(`Accesso negato: ${message}`);

const ensureOrganizationAccess = (
  scope: FormsAccessScope | undefined,
  organizationId: string | null | undefined,
) => {
  if (!scope) return;
  /* Il confine e il club **attivo**: vedi `src/lib/auth/active-club-boundary.ts`. */
  assertActiveClub(scope, organizationId, "il modulo");

  /*
    **E il permesso, che questo modulo dichiarava e non leggeva.**

    `FormsAccessScope` porta `activeRole` dal primo giorno, e nessuna riga lo
    guardava: un genitore o un atleta poteva elencare i moduli, crearne,
    **pubblicarne** uno a nome della societa, rigenerare lo slug pubblico
    invalidando il link vivo, e cancellare. Il confine era corretto; era
    l'altra meta a mancare, e le due sono entrambe obbligatorie — vedi
    `src/lib/auth/active-club-boundary.ts`.
  */
  if (!canAccessClubResource(scope.activeRole, "forms", "read")) {
    throw denied("i moduli della societa li gestisce chi ci lavora dentro");
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

  /*
    **Il permesso non dipende da come la richiesta e scritta.**

    Il controllo di ruolo viveva dentro `ensureOrganizationAccess`, ma questa
    funzione la chiamava **solo** sul ramo in cui il chiamante nominava un
    club. Il percorso ordinario del client non lo nomina — manda solo
    l'intestazione del club attivo — e prendeva quindi il ramo sotto, dove non
    c'era nessun controllo: la porta era chiusa a chi bussava e aperta a chi
    entrava dal lato.

    Ora il club si **risolve** prima, e si giudica sempre lo stesso: quello su
    cui si sta per lavorare.
  */
  const risolto = wanted || String(scope.activeOrganizationId || "").trim();
  if (!risolto) throw new Error("Nessun club attivo selezionato");
  ensureOrganizationAccess(scope, risolto);
  return risolto;
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

/**
 * Le versioni pubblicate di **piu** moduli, in una lettura sola.
 *
 * **Il difetto che chiude (W6-49).** L'elenco dei moduli chiamava
 * `loadPublishedSchema` dentro un `for` sequenziale: venti moduli erano venti
 * viaggi verso Neon uno dopo l'altro, sommati in latenza — la stessa forma di
 * difetto che i conteggi qui sopra evitavano gia con una `groupBy`. Il
 * risultato non cambia: la mappa risponde esattamente cio che rispondeva la
 * lettura per riga, `null` compreso per una versione che manca.
 */
const loadPublishedSchemas = async (
  organizationId: string,
  rows: Array<{ id: string; published_version: number }>,
): Promise<Map<string, FormSchema | null>> => {
  const mappa = new Map<string, FormSchema | null>();
  const dapubblicate = rows.filter((row) => row.published_version > 0);
  for (const row of rows) mappa.set(row.id, null);
  if (!dapubblicate.length) return mappa;

  const versioni: Array<{ template_id: string; schema_json: unknown }> = await (
    prisma as any
  ).formTemplateVersion.findMany({
    where: {
      organization_id: organizationId,
      OR: dapubblicate.map((row) => ({
        template_id: row.id,
        version: row.published_version,
      })),
    },
    select: { template_id: true, schema_json: true },
  });

  for (const versione of versioni) {
    mappa.set(versione.template_id, normalizeFormSchema(versione.schema_json));
  }

  return mappa;
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
    /*
      Provenienza e destinazione d'uso si leggono dalla **bozza**, come il
      titolo e i soggetti qui sopra: e cio che il club sta modificando, ed e
      quello che la sua schermata deve mostrargli. Cosa valga per chi compila
      lo dice la versione pubblicata, e a quella guarda il menu del rinnovo.
    */
    catalogKey: draft.settings.catalogKey,
    isEnrollment: isEnrollmentForm(draft),
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

  /* Una lettura sola per tutte le versioni pubblicate, non una per riga. */
  const publishedByTemplate = await loadPublishedSchemas(organizationId, rows);

  return rows.map((row) =>
    summarize(
      row,
      countsByTemplate.get(row.id) || { submissions: 0, pending: 0 },
      publishedByTemplate.get(row.id) || null,
    ),
  );
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
  const options = await loadClubFormOptions(row.organization_id);

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
    optionCatalog: options.catalog,
  };
};

/* ----------------------------------------------------------- scritture */

export const createFormTemplate = async (
  scope: FormsAccessScope,
  options: { organizationId?: string | null; starter?: string | null } = {},
): Promise<FormTemplateDetail> => {
  const organizationId = resolveOrganizationId(scope, options.organizationId);

  /*
    **Adottare una voce di catalogo e creare un modulo vuoto sono lo stesso
    gesto**, e passano di qui entrambi (W6-45).

    La differenza sta in cio che finisce nelle impostazioni: una copia adottata
    porta la chiave della voce da cui viene e la sua destinazione d'uso, un
    modulo vuoto non porta niente. Non serve una seconda rotta — la copia e del
    club dal primo istante, e il catalogo non la tocca piu.

    Una voce ferma o inesistente ricade sul modulo vuoto invece di fallire: il
    corpo della richiesta dice al massimo «da cosa partire», e un nome che non
    conosciamo non e un errore di chi crea un modulo.
  */
  const entry = findFormCatalogEntry(options.starter);
  const draft =
    entry && isDistributableFormEntry(entry)
      ? buildFormFromCatalog(entry)
      : normalizeFormSchema(
          createStarterSchema(
            isStarterTemplateKey(options.starter)
              ? (options.starter as StarterTemplateKey)
              : "blank",
          ),
        );

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

/* ------------------------------------------- opzioni che possiede il club */

export type ClubFormOptions = {
  catalog: FormOptionCatalog;
  /** Le sedi **attive**: l'approvazione risolve su queste, non su tutte. */
  sites: ClubSite[];
  categories: Array<{ id: string; name: string }>;
};

const readClubCategories = (value: unknown): Array<{ id: string; name: string }> =>
  (Array.isArray(value) ? value : [])
    .map((entry: any) => ({
      id: asText(entry?.id) || asText(entry?.name),
      name: asText(entry?.name) || asText(entry?.id),
    }))
    .filter((entry) => entry.id && entry.name);

export const buildClubFormOptions = (club: {
  club_sites?: unknown;
  categories?: unknown;
} | null): ClubFormOptions => {
  if (!club) {
    return { catalog: EMPTY_FORM_OPTION_CATALOG, sites: [], categories: [] };
  }

  const sites = getActiveClubSites(normalizeClubSites(club.club_sites));
  const categories = readClubCategories(club.categories);

  return {
    catalog: buildFormOptionCatalog({
      siteNames: sites.map((site) => site.name),
      categoryNames: categories.map((category) => category.name),
    }),
    sites,
    categories,
  };
};

/**
 * Sedi e categorie del club, nella forma che serve a un modulo.
 *
 * Una lettura sola, e sempre dal club **proprietario del modulo**: il club
 * non arriva mai dalla richiesta, nemmeno per una compilazione interna.
 */
export const loadClubFormOptions = async (
  organizationId: string,
): Promise<ClubFormOptions> => {
  const club = await (prisma as any).club.findUnique({
    where: { id: organizationId },
    select: { club_sites: true, categories: true },
  });

  return buildClubFormOptions(club);
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

  /*
    Sedi e categorie passano da `loadClubFormOptions` anche qui, dove una
    lettura in piu si sarebbe potuta evitare leggendole insieme al modulo.
    Il motivo e che il modulo pubblico e il modulo interno devono vedere le
    **stesse** opzioni: due percorsi di lettura sono due occasioni perche un
    giorno smettano di coincidere, ed e il tipo di divergenza che si scopre
    da una compilazione rifiutata senza motivo apparente.
  */
  const options = await loadClubFormOptions(row.organization_id);
  const schema = applyServerFieldOptions(
    normalizeFormSchema(version.schema_json),
    options.catalog,
  );
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

  const options = await loadClubFormOptions(row.organization_id);

  return {
    row,
    versionId: version.id,
    version: version.version,
    schema: applyServerFieldOptions(
      normalizeFormSchema(version.schema_json),
      options.catalog,
    ),
  };
};
