import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { createAttachment } from "./attachments";
import { createResource, updateResource } from "./resources";
import { sendNotificationEmails } from "./email/email-service";
import {
  findPublicFormBySlug,
  loadClubFormOptions,
  resolveCompilableVersion,
  type ClubFormOptions,
  type FormsAccessScope,
  type PublicFormMatch,
} from "./forms";
import { buildSiteIndex } from "@/lib/club-sites";
import {
  buildAttachmentReference,
  MAX_ATTACHMENT_BYTES,
} from "@/lib/attachments";
import {
  fieldIsFile,
  formatAnswer,
  getSchemaSubjects,
  normalizeFormSchema,
  type FormSchema,
  type FormSubmissionFile,
  type FormSubmissionRecord,
  type FormSubmissionSource,
  type FormSubmissionStatus,
  type FormSubjectSelection,
} from "@/lib/forms/model";
import {
  FORM_SUBJECT_KEYS,
  getDynamicField,
  type FormSubjectKey,
} from "@/lib/forms/dynamic-fields";
import {
  buildChangeSet,
  buildDuplicateProbes,
  matchDuplicates,
  type DuplicateCandidate,
  type FormChangeSet,
} from "@/lib/forms/changes";
import { buildPrefilledAnswers } from "@/lib/forms/prefill";
import {
  FORM_LIMITS,
  isPublicFormUploadMimeType,
  MAX_PUBLIC_FORM_UPLOAD_BYTES,
  validateAnswers,
} from "@/lib/forms/validation";

/**
 * Le compilazioni: raccolta, coda della segreteria, approvazione.
 *
 * **La regola che tutto il resto serve a proteggere: una compilazione non
 * scrive in anagrafica.** Arriva, viene validata, e si ferma in coda. La
 * segreteria vede la proposta — cosa verrebbe aggiunto, cosa sostituito, con
 * quale valore attuale, e se somiglia a una scheda che esiste gia — e decide.
 * Solo l'approvazione scrive, e scrive passando da `resources.ts`, che e il
 * proprietario dell'accesso ai dati.
 *
 * **Perche non si scrive subito.** Un modulo pubblico e compilato da chi
 * vuole, quando vuole, dal telefono. Contiene errori di battitura, doppi
 * invii e omonimie. Scrivere direttamente vorrebbe dire che l'anagrafica di
 * un club e la somma di quello che hanno digitato duecento persone.
 */

const asText = (value: unknown) => String(value ?? "").trim();

const toIso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : asText(value);

const denied = (message: string) => new Error(`Accesso negato: ${message}`);

const ensureOrganizationAccess = (
  scope: FormsAccessScope | undefined,
  organizationId: string | null | undefined,
) => {
  if (!scope) return;
  if (!organizationId) throw denied("compilazione senza club");
  if (!scope.allowedOrganizationIds.includes(organizationId)) {
    throw denied("la compilazione appartiene a un altro club");
  }
};

const resolveOrganizationId = (
  scope: FormsAccessScope,
  requested?: string | null,
) => {
  const wanted = asText(requested);
  if (wanted) {
    ensureOrganizationAccess(scope, wanted);
    return wanted;
  }
  if (scope.activeOrganizationId) return scope.activeOrganizationId;
  throw new Error("Nessun club attivo selezionato");
};

/* ------------------------------------------------------------ soggetti */

const normalizeSelections = (value: unknown): FormSubjectSelection[] => {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const selections: FormSubjectSelection[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const subject = asText((entry as any).subject) as FormSubjectKey;
    if (!FORM_SUBJECT_KEYS.includes(subject)) continue;
    if (seen.has(subject)) continue;
    seen.add(subject);

    selections.push({
      subject,
      recordId: asText((entry as any).recordId).slice(0, 120),
      label: asText((entry as any).label).slice(0, 200),
    });
  }

  return selections;
};

/**
 * Il record di ogni soggetto scelto, oppure `null` se va creato.
 *
 * Il genitore non e un record a se: vive dentro `athletes.data.guardians`.
 * Il suo `recordId` e quindi la **posizione** nell'elenco dei tutori
 * dell'atleta selezionato — che e anche il motivo per cui, se un atleta ha
 * piu tutori, la scelta va fatta esplicitamente invece di prendere il primo.
 */
const loadSubjectRecords = async (
  organizationId: string,
  selections: FormSubjectSelection[],
) => {
  const records: Partial<Record<FormSubjectKey, Record<string, any> | null>> = {};

  const athleteSelection = selections.find(
    (selection) => selection.subject === "athlete",
  );

  let athlete: Record<string, any> | null = null;
  if (athleteSelection?.recordId) {
    athlete = await (prisma as any).athlete.findFirst({
      where: {
        id: athleteSelection.recordId,
        organization_id: organizationId,
      },
    });
  }
  if (selections.some((selection) => selection.subject === "athlete")) {
    records.athlete = athlete;
  }

  const guardianSelection = selections.find(
    (selection) => selection.subject === "guardian",
  );
  if (guardianSelection) {
    const guardians = Array.isArray(athlete?.data?.guardians)
      ? athlete!.data.guardians
      : [];
    const index = Number(guardianSelection.recordId);
    records.guardian =
      Number.isInteger(index) && index >= 0 && index < guardians.length
        ? guardians[index]
        : null;
  }

  for (const subject of ["trainer", "staff", "member"] as const) {
    const selection = selections.find((entry) => entry.subject === subject);
    if (!selection) continue;

    if (!selection.recordId) {
      records[subject] = null;
      continue;
    }

    const row = await (prisma as any).clubResourceItem.findFirst({
      where: {
        id: selection.recordId,
        organization_id: organizationId,
        resource_type: CLUB_RESOURCE_BY_SUBJECT[subject],
      },
      select: { id: true, payload: true },
    });

    records[subject] =
      row && typeof row.payload === "object" ? { ...row.payload } : null;
  }

  const needsClub = selections.some((selection) => selection.subject === "club");
  if (needsClub) {
    records.club = await (prisma as any).club.findUnique({
      where: { id: organizationId },
    });
  }

  return { records, athlete };
};

const CLUB_RESOURCE_BY_SUBJECT: Record<"trainer" | "staff" | "member", string> = {
  trainer: "trainers",
  staff: "staff_members",
  member: "members",
};

/* ---------------------------------------------------------- serializzazione */

type SubmissionRow = {
  id: string;
  organization_id: string;
  template_id: string;
  version_id: string;
  source: string;
  status: string;
  subjects: unknown;
  answers: unknown;
  files: unknown;
  respondent_name: string | null;
  respondent_email: string | null;
  submitted_at: Date;
  reviewed_at: Date | null;
  review_note: string | null;
  template?: { title: string } | null;
  template_version?: { version: number; schema_json: unknown } | null;
};

const normalizeStatus = (value: unknown): FormSubmissionStatus => {
  const status = asText(value);
  return status === "approved" || status === "rejected" ? status : "pending";
};

const normalizeSource = (value: unknown): FormSubmissionSource =>
  asText(value) === "internal" ? "internal" : "public";

const normalizeFiles = (value: unknown): FormSubmissionFile[] =>
  (Array.isArray(value) ? value : [])
    .map((entry) => {
      const record = entry && typeof entry === "object" ? (entry as any) : {};
      return {
        fieldId: asText(record.fieldId),
        fieldLabel: asText(record.fieldLabel),
        fileName: asText(record.fileName) || "allegato",
        mimeType: asText(record.mimeType),
        sizeBytes: Number(record.sizeBytes) || 0,
        reference: asText(record.reference),
      };
    })
    .filter((file) => file.reference);

const serializeSubmission = (row: SubmissionRow): FormSubmissionRecord => {
  const schema = normalizeFormSchema(row.template_version?.schema_json);

  return {
    id: row.id,
    organizationId: row.organization_id,
    templateId: row.template_id,
    templateTitle: row.template?.title || schema.title,
    version: row.template_version?.version || 0,
    source: normalizeSource(row.source),
    status: normalizeStatus(row.status),
    subjects: normalizeSelections(row.subjects),
    answers:
      row.answers && typeof row.answers === "object"
        ? (row.answers as Record<string, unknown>)
        : {},
    files: normalizeFiles(row.files),
    schema,
    respondentName: asText(row.respondent_name),
    respondentEmail: asText(row.respondent_email),
    submittedAt: toIso(row.submitted_at),
    reviewedAt: toIso(row.reviewed_at),
    reviewNote: asText(row.review_note),
  };
};

const SUBMISSION_INCLUDE = {
  template: { select: { title: true } },
  template_version: { select: { version: true, schema_json: true } },
} as const;

/* --------------------------------------------------------- invio pubblico */

export type IncomingFormFile = {
  fieldId: string;
  fileName: string;
  mimeType: string;
  content: Buffer;
};

export type SubmitFormInput = {
  answers: Record<string, unknown>;
  files: IncomingFormFile[];
  respondentName?: string;
  respondentEmail?: string;
};

export class FormSubmissionError extends Error {
  readonly status: number;
  readonly fieldErrors: Record<string, string>;

  constructor(
    message: string,
    status = 422,
    fieldErrors: Record<string, string> = {},
  ) {
    super(message);
    this.name = "FormSubmissionError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

/**
 * Salva gli allegati di una compilazione con il servizio del Blocco 8.
 *
 * `owner_type: "form"` e `owner_id` uguale all'identificativo del modulo:
 * finche la compilazione non e approvata i file appartengono al modulo, non
 * a una persona — perche la persona a cui appartengono e proprio cio che la
 * segreteria deve ancora decidere.
 */
const storeSubmissionFiles = async ({
  organizationId,
  templateId,
  schema,
  files,
  requireNarrowMimeTypes,
}: {
  organizationId: string;
  templateId: string;
  schema: FormSchema;
  files: IncomingFormFile[];
  requireNarrowMimeTypes: boolean;
}): Promise<FormSubmissionFile[]> => {
  if (files.length > FORM_LIMITS.maxFilesPerSubmission) {
    throw new FormSubmissionError(
      `Un invio puo contenere al massimo ${FORM_LIMITS.maxFilesPerSubmission} allegati.`,
      413,
    );
  }

  const fieldsById = new Map(schema.fields.map((field) => [field.id, field]));
  const stored: FormSubmissionFile[] = [];

  for (const incoming of files) {
    const field = fieldsById.get(asText(incoming.fieldId));

    /*
      Un allegato per un campo che nel modulo non e un allegato non si salva.
      Senza questo controllo il modulo pubblico diventerebbe un servizio di
      hosting: si inventa un `fieldId` e si carica quello che si vuole.
    */
    if (!field || !fieldIsFile(field.type)) continue;

    const maxBytes = Math.min(
      MAX_PUBLIC_FORM_UPLOAD_BYTES,
      MAX_ATTACHMENT_BYTES,
    );
    if (incoming.content.length > maxBytes) {
      throw new FormSubmissionError(
        `«${field.label}»: il file supera ${Math.round(maxBytes / (1024 * 1024))} MB.`,
        413,
      );
    }

    /*
      La firma arriva come PNG disegnato dal browser: non passa dal selettore
      di file e non ha senso confrontarla con l'elenco dei tipi accettati.
    */
    const checkMime = requireNarrowMimeTypes && field.type !== "signature";
    if (checkMime && !isPublicFormUploadMimeType(incoming.mimeType)) {
      throw new FormSubmissionError(
        `«${field.label}»: formato non accettato. Carica un PDF o una foto.`,
      );
    }

    const metadata = await createAttachment({
      organizationId,
      ownerType: "form",
      ownerId: templateId,
      category: "compilazione-modulo",
      fileName: incoming.fileName,
      mimeType: incoming.mimeType,
      content: incoming.content,
    });

    stored.push({
      fieldId: field.id,
      fieldLabel: field.label,
      fileName: metadata.fileName,
      mimeType: metadata.mimeType,
      sizeBytes: metadata.sizeBytes,
      reference: buildAttachmentReference(metadata.id),
    });
  }

  return stored;
};

const notifyClub = async ({
  organizationId,
  templateTitle,
  submissionId,
  templateId,
  respondentName,
}: {
  organizationId: string;
  templateTitle: string;
  submissionId: string;
  templateId: string;
  respondentName: string;
}) => {
  const club = await (prisma as any).club.findUnique({
    where: { id: organizationId },
    select: {
      creator_id: true,
      organization_users: { select: { user_id: true } },
    },
  });
  if (!club) return;

  const recipientIds: string[] = Array.from(
    new Set(
      [
        club.creator_id,
        ...club.organization_users.map((membership: any) => membership.user_id),
      ].filter(Boolean),
    ),
  );
  if (!recipientIds.length) return;

  await (prisma as any).notification.createMany({
    data: recipientIds.map((userId) => ({
      organization_id: organizationId,
      user_id: userId,
      title: "Nuova compilazione da esaminare",
      message: `${templateTitle}${respondentName ? ` — ${respondentName}` : ""}`,
      type: "form_submission",
      data: { templateId, submissionId, source: "forms" },
    })),
  });

  await sendNotificationEmails(recipientIds);
};

/**
 * Registra una compilazione arrivata dal modulo pubblico.
 *
 * Non riceve uno scope perche non c'e una sessione: l'autorizzazione qui e
 * lo slug, che identifica un modulo pubblicato e abilitato al link. Tutto il
 * resto — quale club, quale versione — lo decide il server dal modulo
 * trovato, mai il corpo della richiesta.
 */
export const submitPublicForm = async (
  publicSlug: string,
  input: SubmitFormInput,
): Promise<{ submissionId: string; successMessage: string }> => {
  const match = await findPublicFormBySlug(publicSlug);
  if (!match) {
    throw new FormSubmissionError("Modulo non disponibile", 404);
  }

  return storeSubmission({
    match,
    input,
    source: "public",
    selections: [],
    submittedBy: null,
    requireNarrowMimeTypes: true,
  });
};

const storeSubmission = async ({
  match,
  input,
  source,
  selections,
  submittedBy,
  requireNarrowMimeTypes,
}: {
  match: PublicFormMatch;
  input: SubmitFormInput;
  source: FormSubmissionSource;
  selections: FormSubjectSelection[];
  submittedBy: string | null;
  requireNarrowMimeTypes: boolean;
}) => {
  const files = await storeSubmissionFiles({
    organizationId: match.organizationId,
    templateId: match.templateId,
    schema: match.schema,
    files: input.files,
    requireNarrowMimeTypes,
  });

  const validated = validateAnswers(
    match.schema,
    input.answers,
    files.map((file) => file.fieldId),
  );

  if (!validated.valid) {
    throw new FormSubmissionError(
      "Controlla i campi segnalati.",
      422,
      validated.errors,
    );
  }

  const respondentEmail = asText(input.respondentEmail).slice(0, 200);
  if (match.schema.settings.collectRespondentEmail && !respondentEmail) {
    throw new FormSubmissionError("Indica un indirizzo email.", 422, {
      respondentEmail: "Campo obbligatorio.",
    });
  }

  const submissionId = randomUUID();

  await (prisma as any).formSubmission.create({
    data: {
      id: submissionId,
      organization_id: match.organizationId,
      template_id: match.templateId,
      version_id: match.versionId,
      source,
      status: "pending",
      subjects: selections,
      answers: validated.answers,
      files,
      respondent_name: asText(input.respondentName).slice(0, 200) || null,
      respondent_email: respondentEmail.toLowerCase() || null,
      submitted_by: submittedBy,
    },
  });

  if (match.schema.settings.notifyOnSubmit) {
    await notifyClub({
      organizationId: match.organizationId,
      templateTitle: match.schema.title,
      templateId: match.templateId,
      submissionId,
      respondentName: asText(input.respondentName),
    }).catch((error) => {
      // Una notifica che fallisce non deve far perdere la compilazione.
      console.error("Notifica compilazione non inviata:", error);
    });
  }

  return {
    submissionId,
    successMessage: match.schema.settings.successMessage,
  };
};

/**
 * Compilazione dalla segreteria, con i soggetti gia scelti.
 *
 * Passa dalla stessa coda di una compilazione pubblica: chi compila dalla
 * scheda atleta vede comunque, prima di scrivere, cosa cambierebbe. E la
 * stessa ragione per cui esiste la coda — solo che qui il passaggio dura
 * pochi secondi.
 */
export const submitInternalForm = async (
  scope: FormsAccessScope,
  input: SubmitFormInput & { templateId: string; subjects?: unknown },
) => {
  const compilable = await resolveCompilableVersion(scope, input.templateId);
  const selections = normalizeSelections(input.subjects);

  return storeSubmission({
    match: {
      templateId: compilable.row.id,
      organizationId: compilable.row.organization_id,
      versionId: compilable.versionId,
      version: compilable.version,
      schema: compilable.schema,
      club: {
        id: compilable.row.organization_id,
        name: "",
        logoUrl: "",
        contactEmail: "",
      },
    },
    input,
    source: "internal",
    selections,
    submittedBy: scope.userId || null,
    requireNarrowMimeTypes: false,
  });
};

/* ------------------------------------------------------- coda segreteria */

export type SubmissionListResult = {
  items: FormSubmissionRecord[];
  total: number;
};

export const listFormSubmissions = async (
  scope: FormsAccessScope,
  options: {
    organizationId?: string | null;
    templateId?: string | null;
    status?: string | null;
    limit?: number;
    offset?: number;
  } = {},
): Promise<SubmissionListResult> => {
  const organizationId = resolveOrganizationId(scope, options.organizationId);
  const status = asText(options.status);
  const templateId = asText(options.templateId);

  const where = {
    organization_id: organizationId,
    ...(templateId ? { template_id: templateId } : {}),
    ...(status && status !== "all" ? { status: normalizeStatus(status) } : {}),
  };

  const limit = Math.min(Math.max(Number(options.limit) || 25, 1), 100);
  const offset = Math.max(Number(options.offset) || 0, 0);

  const [rows, total] = await Promise.all([
    (prisma as any).formSubmission.findMany({
      where,
      include: SUBMISSION_INCLUDE,
      orderBy: { submitted_at: "desc" },
      skip: offset,
      take: limit,
    }),
    (prisma as any).formSubmission.count({ where }),
  ]);

  return {
    items: (rows as SubmissionRow[]).map(serializeSubmission),
    total,
  };
};

const loadSubmissionRow = async (
  scope: FormsAccessScope,
  id: string,
): Promise<SubmissionRow> => {
  const row: SubmissionRow | null = await (prisma as any).formSubmission.findUnique({
    where: { id: asText(id) },
    include: SUBMISSION_INCLUDE,
  });

  if (!row) throw new Error("Compilazione non trovata");
  ensureOrganizationAccess(scope, row.organization_id);
  return row;
};

export type SubmissionReview = {
  submission: FormSubmissionRecord;
  changeSet: FormChangeSet;
  duplicates: DuplicateCandidate[];
};

const findAthleteDuplicates = async (
  organizationId: string,
  probe: ReturnType<typeof buildDuplicateProbes>[number],
) => {
  const filters: any[] = [];
  if (probe.fiscalCode) {
    filters.push({ data: { path: ["fiscalCode"], equals: probe.fiscalCode } });
  }
  if (probe.lastName) {
    filters.push({ last_name: probe.lastName });
  }
  if (probe.email) {
    filters.push({ data: { path: ["email"], equals: probe.email } });
  }
  if (!filters.length) return [];

  const rows = await (prisma as any).athlete.findMany({
    where: { organization_id: organizationId, OR: filters },
    select: {
      id: true,
      first_name: true,
      last_name: true,
      birth_date: true,
      data: true,
    },
    take: 50,
  });

  return matchDuplicates(
    probe,
    rows.map((row: any) => ({
      id: row.id,
      label: `${row.first_name || ""} ${row.last_name || ""}`.trim(),
      fiscalCode: row.data?.fiscalCode || "",
      firstName: row.first_name || "",
      lastName: row.last_name || "",
      birthDate: toIso(row.birth_date),
      email: row.data?.email || "",
    })),
  );
};

/**
 * Cosa succederebbe approvando: la proposta e i possibili duplicati.
 *
 * E l'unica schermata che conta per la segreteria, quindi si calcola qui e
 * non nel componente: le stesse regole servono all'anteprima e alla scrittura,
 * e due implementazioni divergerebbero il giorno in cui una delle due cambia.
 */
export const reviewFormSubmission = async (
  scope: FormsAccessScope,
  id: string,
  overrideSelections?: unknown,
): Promise<SubmissionReview> => {
  const row = await loadSubmissionRow(scope, id);
  const submission = serializeSubmission(row);

  const selections = overrideSelections
    ? normalizeSelections(overrideSelections)
    : submission.subjects;

  const { records } = await loadSubjectRecords(
    row.organization_id,
    selections,
  );

  const changeSet = buildChangeSet({
    schema: submission.schema,
    answers: submission.answers,
    selections,
    records,
  });

  const duplicates: DuplicateCandidate[] = [];
  for (const probe of buildDuplicateProbes(changeSet)) {
    if (probe.subject !== "athlete") continue;
    duplicates.push(
      ...(await findAthleteDuplicates(row.organization_id, probe)),
    );
  }

  return {
    submission: { ...submission, subjects: selections },
    changeSet,
    duplicates,
  };
};

/* --------------------------------------------------------- approvazione */

const applyValues = (changes: FormChangeSet["subjects"][number]) => {
  const values: Record<string, string> = {};

  for (const change of changes.changes) {
    if (change.kind !== "add" && change.kind !== "replace") continue;
    values[change.binding] = change.proposedValue;
  }

  return values;
};

/**
 * Riporta i valori proposti nella forma del record dell'atleta.
 *
 * Il percorso lo dice il catalogo, non chi chiama: e la stessa tabella che
 * l'interfaccia usa per mostrare «Nome dell'atleta», ed e per questo che una
 * chiave inventata non puo scrivere da nessuna parte.
 */
const buildAthletePatch = (
  values: Record<string, string>,
  currentData: Record<string, any>,
) => {
  const columns: Record<string, any> = {};
  const data: Record<string, any> = { ...currentData };

  for (const [binding, value] of Object.entries(values)) {
    const definition = getDynamicField(binding);
    if (!definition || definition.subject !== "athlete" || !definition.writable) {
      continue;
    }

    if (definition.path.length === 1) {
      columns[definition.path[0]] = value;
      continue;
    }

    if (definition.path[0] === "data" && definition.path.length === 2) {
      data[definition.path[1]] = value;
    }
  }

  return { columns, data };
};

/**
 * Dove l'atleta viene iscritto: sede e categoria.
 *
 * **Perche non basta scrivere la risposta.** Il modulo raccoglie un *nome* —
 * «Palestra Nord», «Under 14» — perche e cio che una persona sa leggere e
 * scegliere. L'anagrafica lavora con identificativi. La traduzione avviene
 * qui, una volta, contro le sedi e le categorie del club **proprietario del
 * modulo**: un nome che non e in quegli elenchi non diventa niente, e non
 * c'e un percorso per cui il testo scritto da chi compila finisca in un
 * `site_id`.
 *
 * **Perche un club con una sede sola la assegna comunque.** La domanda non
 * gli e stata mostrata — sceglierla fra una non e una scelta — ma la sede
 * resta il dato giusto da scrivere: senza, l'atleta nascerebbe «senza sede»
 * in un club che di sedi ne ha una, e il giorno in cui ne apre una seconda
 * nessuno saprebbe piu dove stava.
 */
const resolveEnrollmentPlacement = (
  values: Record<string, string>,
  options: ClubFormOptions,
) => {
  const siteIndex = buildSiteIndex(options.sites);
  const answeredSite = asText(values["athlete.siteId"]);
  const resolvedSite = answeredSite ? siteIndex.resolveSiteId(answeredSite) : "";

  const siteId = siteIndex.has(resolvedSite)
    ? resolvedSite
    : options.sites.length === 1
      ? options.sites[0].id
      : "";

  const answeredCategory = asText(values["athlete.categoryName"]).toLowerCase();
  const category =
    options.categories.find(
      (entry) => entry.name.toLowerCase() === answeredCategory,
    ) || null;

  return { siteId, category };
};

/**
 * Allinea l'appartenenza categoria-sede dopo un'approvazione.
 *
 * **Cosa scrive e cosa no.** Con una categoria scelta crea o aggiorna
 * l'appartenenza a quella categoria. Con la sola sede aggiorna le
 * appartenenze che **non ne dichiarano una**: un'appartenenza gia collocata
 * e stata decisa da qualcuno che ne sapeva piu di un modulo, e sovrascriverla
 * sposterebbe un atleta di palestra senza che nessuno lo abbia chiesto.
 */
const syncEnrollmentMembership = async (
  scope: FormsAccessScope,
  input: {
    organizationId: string;
    athleteId: string;
    siteId: string;
    category: { id: string; name: string } | null;
  },
): Promise<string[]> => {
  const applied: string[] = [];

  const existing = await (prisma as any).athleteCategoryMembership.findMany({
    where: {
      organization_id: input.organizationId,
      athlete_id: input.athleteId,
    },
  });

  if (input.category) {
    const match = existing.find(
      (row: any) => asText(row.category_id) === input.category!.id,
    );

    if (match) {
      if (input.siteId && asText(match.site_id) !== input.siteId) {
        await updateResource(
          "athlete_category_memberships",
          match.id,
          { site_id: input.siteId, category_name: input.category.name },
          scope,
        );
        applied.push(`Sede dell'iscrizione aggiornata: ${input.category.name}`);
      }
    } else {
      await createResource(
        "athlete_category_memberships",
        {
          organization_id: input.organizationId,
          athlete_id: input.athleteId,
          category_id: input.category.id,
          category_name: input.category.name,
          site_id: input.siteId || null,
          is_primary: existing.length === 0,
        },
        "create",
        scope,
      );
      applied.push(`Atleta iscritto alla categoria ${input.category.name}`);
    }

    return applied;
  }

  if (!input.siteId) return applied;

  const orphans = existing.filter((row: any) => !asText(row.site_id));
  for (const row of orphans) {
    await updateResource(
      "athlete_category_memberships",
      row.id,
      { site_id: input.siteId },
      scope,
    );
  }

  if (orphans.length) {
    applied.push(`Sede assegnata a ${orphans.length} iscrizioni`);
  }

  return applied;
};

const buildGuardianPatch = (
  values: Record<string, string>,
  current: Record<string, any> | null,
) => {
  const guardian: Record<string, any> = { ...(current || {}) };

  for (const [binding, value] of Object.entries(values)) {
    const definition = getDynamicField(binding);
    if (!definition || definition.subject !== "guardian") continue;
    guardian[definition.path[0]] = value;
  }

  return guardian;
};

const buildResourcePatch = (
  subject: "trainer" | "staff" | "member",
  values: Record<string, string>,
  current: Record<string, any> | null,
) => {
  const payload: Record<string, any> = { ...(current || {}) };

  for (const [binding, value] of Object.entries(values)) {
    const definition = getDynamicField(binding);
    if (!definition || definition.subject !== subject) continue;
    payload[definition.path[0]] = value;
  }

  return payload;
};

export type ReviewDecision = {
  decision: "approve" | "reject";
  note?: string;
  /** La segreteria puo ricollegare un soggetto a una scheda esistente. */
  subjects?: unknown;
};

export type ReviewOutcome = {
  submission: FormSubmissionRecord;
  /** Cosa e stato scritto, in parole: si mostra dopo l'approvazione. */
  applied: string[];
};

/**
 * Approva o rifiuta una compilazione.
 *
 * Approvare scrive **solo** cio che la proposta mostrava: gli stessi campi,
 * gli stessi valori, calcolati dalla stessa funzione. Non c'e un secondo
 * percorso di scrittura che l'anteprima non abbia gia descritto.
 */
export const decideFormSubmission = async (
  scope: FormsAccessScope,
  id: string,
  decision: ReviewDecision,
): Promise<ReviewOutcome> => {
  const row = await loadSubmissionRow(scope, id);

  if (normalizeStatus(row.status) !== "pending") {
    throw new Error("Questa compilazione e gia stata esaminata.");
  }

  const note = asText(decision.note).slice(0, 2000);

  if (decision.decision === "reject") {
    const updated = await (prisma as any).formSubmission.update({
      where: { id: row.id },
      data: {
        status: "rejected",
        reviewed_by: scope.userId || null,
        reviewed_at: new Date(),
        review_note: note || null,
      },
      include: SUBMISSION_INCLUDE,
    });

    return { submission: serializeSubmission(updated), applied: [] };
  }

  const review = await reviewFormSubmission(scope, row.id, decision.subjects);
  const organizationId = row.organization_id;
  const applied: string[] = [];

  const { records, athlete: currentAthlete } = await loadSubjectRecords(
    organizationId,
    review.submission.subjects,
  );

  let athleteId = asText(
    review.submission.subjects.find(
      (selection) => selection.subject === "athlete",
    )?.recordId,
  );
  let athleteRecord = currentAthlete;

  const athleteChange = review.changeSet.subjects.find(
    (subject) => subject.subject === "athlete",
  );

  /*
    Sedi e categorie si leggono una volta sola, e dal club del modulo. Il
    corpo della richiesta non le nomina e non potrebbe: la segreteria approva
    una compilazione, non indica dove va messo l'atleta.
  */
  const clubOptions = await loadClubFormOptions(organizationId);
  let placement: ReturnType<typeof resolveEnrollmentPlacement> = {
    siteId: "",
    category: null,
  };

  if (athleteChange) {
    const values = applyValues(athleteChange);
    const patch = buildAthletePatch(values, athleteRecord?.data || {});

    placement = resolveEnrollmentPlacement(values, clubOptions);

    /*
      `buildAthletePatch` ha scritto in `data.siteId` il **nome** scelto,
      perche e quello che il catalogo dice di scrivere in quel percorso. Qui
      lo si sostituisce con l'identificativo: il nome di una sede cambia, il
      suo identificativo no, e ogni filtro sede risolve gli identificativi.
    */
    if (placement.siteId) {
      patch.data.siteId = placement.siteId;
    } else {
      delete patch.data.siteId;
    }

    if (placement.category) {
      patch.columns.category_id = placement.category.id;
      patch.columns.category_name = placement.category.name;
    } else {
      delete patch.columns.category_id;
      delete patch.columns.category_name;
    }

    if (!athleteId) {
      const created = await createResource(
        "athletes",
        {
          organization_id: organizationId,
          ...patch.columns,
          first_name: patch.columns.first_name || "",
          last_name: patch.columns.last_name || "",
          birth_date: patch.columns.birth_date || null,
          status: "active",
          data: patch.data,
        },
        "create",
        scope,
      );
      athleteId = asText((created as any)?.id);
      athleteRecord = created as any;
      applied.push(`Atleta creato: ${athleteChange.recordLabel}`);
    } else if (Object.keys(values).length) {
      const updated = await updateResource(
        "athletes",
        athleteId,
        { ...patch.columns, data: patch.data },
        scope,
      );
      athleteRecord = updated as any;
      applied.push(
        `Scheda atleta aggiornata: ${Object.keys(values).length} dati`,
      );
    }
  }

  if (athleteId && (placement.category || placement.siteId)) {
    applied.push(
      ...(await syncEnrollmentMembership(scope, {
        organizationId,
        athleteId,
        siteId: placement.siteId,
        category: placement.category,
      })),
    );
  }

  const guardianChange = review.changeSet.subjects.find(
    (subject) => subject.subject === "guardian",
  );

  if (guardianChange) {
    if (!athleteId) {
      throw new Error(
        "Un genitore si collega a un atleta: scegli o crea l'atleta prima di approvare.",
      );
    }

    const guardians = Array.isArray(athleteRecord?.data?.guardians)
      ? [...athleteRecord!.data.guardians]
      : [];
    const selection = review.submission.subjects.find(
      (entry) => entry.subject === "guardian",
    );
    const index = Number(selection?.recordId);
    const patch = buildGuardianPatch(
      applyValues(guardianChange),
      records.guardian || null,
    );

    if (Number.isInteger(index) && index >= 0 && index < guardians.length) {
      guardians[index] = { ...guardians[index], ...patch };
      applied.push(`Genitore aggiornato: ${guardianChange.recordLabel}`);
    } else {
      guardians.push(patch);
      applied.push(`Genitore aggiunto: ${guardianChange.recordLabel}`);
    }

    const updated = await updateResource(
      "athletes",
      athleteId,
      { data: { ...(athleteRecord?.data || {}), guardians } },
      scope,
    );
    athleteRecord = updated as any;
  }

  for (const subject of ["trainer", "staff", "member"] as const) {
    const change = review.changeSet.subjects.find(
      (entry) => entry.subject === subject,
    );
    if (!change) continue;

    const payload = buildResourcePatch(
      subject,
      applyValues(change),
      records[subject] || null,
    );
    const resource = CLUB_RESOURCE_BY_SUBJECT[subject];
    const name = `${payload.firstName || ""} ${payload.lastName || ""}`.trim();

    if (change.recordId) {
      await updateResource(resource, change.recordId, { ...payload, name }, scope);
      applied.push(`${change.subjectLabel} aggiornato: ${change.recordLabel}`);
    } else {
      await createResource(
        resource,
        { organization_id: organizationId, ...payload, name },
        "create",
        scope,
      );
      applied.push(`${change.subjectLabel} creato: ${change.recordLabel}`);
    }
  }

  /*
    Gli allegati seguono la persona: fino all'approvazione appartenevano al
    modulo, perche non si sapeva ancora di chi fossero. Non si ricaricano —
    resta lo stesso allegato, con lo stesso identificativo — si aggiunge il
    riferimento fra i documenti di iscrizione dell'atleta.
  */
  if (athleteId && review.submission.files.length) {
    const documents = Array.isArray(athleteRecord?.data?.enrollmentDocuments)
      ? [...athleteRecord!.data.enrollmentDocuments]
      : [];

    for (const file of review.submission.files) {
      documents.push({
        id: `form-${review.submission.id}-${file.fieldId}`,
        name: file.fieldLabel || file.fileName,
        type: review.submission.templateTitle,
        fileName: file.fileName,
        fileUrl: file.reference,
        uploadDate: review.submission.submittedAt,
      });
    }

    await updateResource(
      "athletes",
      athleteId,
      { data: { ...(athleteRecord?.data || {}), enrollmentDocuments: documents } },
      scope,
    );
    applied.push(
      `${review.submission.files.length} allegati collegati alla scheda`,
    );
  }

  const nextSubjects = review.submission.subjects.map((selection) =>
    selection.subject === "athlete" && athleteId
      ? { ...selection, recordId: athleteId }
      : selection,
  );

  const updated = await (prisma as any).formSubmission.update({
    where: { id: row.id },
    data: {
      status: "approved",
      subjects: nextSubjects,
      reviewed_by: scope.userId || null,
      reviewed_at: new Date(),
      review_note: note || null,
    },
    include: SUBMISSION_INCLUDE,
  });

  return { submission: serializeSubmission(updated), applied };
};

/** Un riepilogo di una riga di elenco: chi ha compilato, in due parole. */
export const describeSubmission = (submission: FormSubmissionRecord) => {
  const named =
    submission.subjects.find((selection) => selection.label)?.label ||
    submission.respondentName ||
    submission.respondentEmail;

  if (named) return named;

  const firstAnswer = submission.schema.fields
    .filter((field) => !fieldIsFile(field.type))
    .map((field) => formatAnswer(submission.answers[field.id]))
    .find((value) => value !== "—");

  return firstAnswer || "Compilazione senza nome";
};

/* ------------------------------------------------- compilazione interna */

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
  /** I soggetti gia decisi: l'atleta da cui si e aperto il modulo. */
  selections: FormSubjectSelection[];
  /** Le scelte ancora da fare, per soggetto. */
  options: Partial<Record<FormSubjectKey, CompileSubjectOption[]>>;
  answers: Record<string, unknown>;
  prefilledFieldIds: string[];
};

/**
 * Tutto cio che serve per compilare un modulo dalla scheda di una persona.
 *
 * **Perche la precompilazione la calcola il server.** I valori stanno in
 * colonne e in campi JSON dell'anagrafica, con nomi che il client non conosce
 * e non deve conoscere. Farla calcolare al browser vorrebbe dire mandargli il
 * record intero — cioe piu dati di quelli che il modulo chiede — e duplicare
 * la mappa dei percorsi in un secondo posto.
 *
 * **Perche i tutori si scelgono e non si indovinano.** Un atleta puo avere
 * madre, padre e un tutore: prendere il primo dell'elenco significa scrivere
 * il numero di telefono sbagliato su un modulo firmato.
 */
export const buildCompileContext = async (
  scope: FormsAccessScope,
  input: { templateId: string; subjects?: unknown },
): Promise<CompileContext> => {
  const compilable = await resolveCompilableVersion(scope, input.templateId);
  const organizationId = compilable.row.organization_id;
  const requested = normalizeSelections(input.subjects);
  const needed = getSchemaSubjects(compilable.schema);

  /*
    Si tengono solo i soggetti che il modulo nomina davvero: un `subjects`
    che citasse un atleta per un modulo dello staff non aprirebbe nulla, ma
    farebbe leggere un record che quel modulo non riguarda.
  */
  const selections = requested.filter((selection) =>
    needed.includes(selection.subject),
  );

  const { records, athlete } = await loadSubjectRecords(
    organizationId,
    selections,
  );

  const options: CompileContext["options"] = {};

  if (needed.includes("guardian")) {
    const guardians = Array.isArray(athlete?.data?.guardians)
      ? athlete!.data.guardians
      : [];

    options.guardian = guardians.map((guardian: any, index: number) => ({
      recordId: String(index),
      label:
        `${asText(guardian?.name)} ${asText(guardian?.surname)}`.trim() ||
        `Tutore ${index + 1}`,
      hint: asText(guardian?.relationship),
    }));
  }

  const answers = buildPrefilledAnswers(compilable.schema, records);

  return {
    templateId: compilable.row.id,
    templateTitle: compilable.schema.title,
    version: compilable.version,
    schema: compilable.schema,
    selections,
    options,
    answers,
    prefilledFieldIds: Object.keys(answers),
  };
};
