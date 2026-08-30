import { randomUUID } from "crypto";
import { canAccessClubResource } from "@/lib/access-roles";
import { assertActiveClub } from "@/lib/auth/active-club-boundary";
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
import {
  listConsentDefinitions,
  listConsentRecords,
  recordConsentDecision,
} from "./consents";
import {
  loadPublishableVersion,
  recordGeneratedDocument,
} from "./document-templates";
import { resolveDocumentForSubject } from "./document-placeholders";
import { renderFilledDocumentHtml } from "@/lib/documents/document-view";
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
  buildSubmissionDocumentBatchId,
  collectConsentDeclarations,
  consentSubjectKindForFormSubject,
  describeFormSubject,
  documentSubjectKindForFormSubject,
  FORM_SUBMISSION_EVIDENCE_KIND,
  pickApprovedSubject,
  type ApprovedSubject,
} from "@/lib/forms/outcomes";
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
  /* Il confine e il club **attivo**: vedi `src/lib/auth/active-club-boundary.ts`. */
  assertActiveClub(scope, organizationId, "la compilazione");

  /*
    E il permesso, come per i moduli. Una compilazione porta nome, cognome,
    codice fiscale, tutori e i file caricati: e la lettura piu delicata del
    dominio, e non aveva nessuna porta.
  */
  if (!canAccessClubResource(scope.activeRole, "forms", "read")) {
    throw denied("le compilazioni della societa le legge chi ci lavora dentro");
  }
};

const resolveOrganizationId = (
  scope: FormsAccessScope,
  requested?: string | null,
) => {
  const wanted = asText(requested);
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
  const risolto = wanted || asText(scope.activeOrganizationId);
  if (!risolto) throw new Error("Nessun club attivo selezionato");
  ensureOrganizationAccess(scope, risolto);
  return risolto;
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
      La firma arriva come immagine disegnata dal browser: non passa dal
      selettore di file, e confrontarla con l'elenco dei documenti accettati
      (PDF, foto, scansioni) non avrebbe senso.

      Ma «non quell'elenco» non vuol dire «nessun elenco». Il controllo era
      saltato del tutto, e chi compila un modulo pubblico decide come si chiama
      la parte multipart: bastava nominarla `file:<idCampoFirma>` per dichiarare
      qualunque tipo. Non ne usciva uno stored XSS — `createAttachment`
      rivalida su un elenco piu ampio che non contiene ne HTML ne SVG, e cio
      che non e visualizzabile in linea viene servito come allegato con
      `nosniff` — ma allargava i tipi accettati da sette a quindici passando da
      una porta che non doveva aprirsi.

      Una firma e un'immagine, e sono queste due.
    */
    const TIPI_FIRMA = new Set(["image/png", "image/jpeg"]);
    const mimeAccettato =
      field.type === "signature"
        ? TIPI_FIRMA.has(String(incoming.mimeType || "").toLowerCase())
        : !requireNarrowMimeTypes || isPublicFormUploadMimeType(incoming.mimeType);

    if (!mimeAccettato) {
      throw new FormSubmissionError(
        field.type === "signature"
          ? `«${field.label}»: la firma deve essere un'immagine.`
          : `«${field.label}»: formato non accettato. Carica un PDF o una foto.`,
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
      organization_users: { select: { user_id: true, role: true } },
    },
  });
  if (!club) return;

  /*
    **La compilazione la esamina chi esamina i moduli, non tutto il club.**

    `organization_users` non veniva filtrato per ruolo, e quella tabella
    contiene anche genitori e allenatori — il riscatto di un token di accesso
    ci scrive dentro il ruolo che il token nomina. Una compilazione anonima
    arrivava quindi nella bacheca di **ogni** tesserato, con una email a testa.

    Erano tre cose insieme: il nome dichiarato da chi compila un modulo
    pubblico veniva diffuso a tutte le famiglie del club invece che alla sola
    segreteria; chiunque conoscesse lo slug — che e il link di iscrizione, e
    si da a tutti — aveva un canale di testo verso quelle bacheche; e una
    richiesta produceva N email con la reputazione SMTP del club.

    Il destinatario giusto e chi puo leggere i moduli, che e la stessa domanda
    che governa la schermata delle compilazioni.
  */
  const recipientIds: string[] = Array.from(
    new Set(
      [
        club.creator_id,
        ...club.organization_users
          .filter((membership: any) =>
            canAccessClubResource(membership.role, "forms", "read"),
          )
          .map((membership: any) => membership.user_id),
      ].filter(Boolean),
    ),
  );
  if (!recipientIds.length) return;

  /*
    Il nome arriva dal corpo di una richiesta anonima. Resta utile alla
    segreteria — dice chi ha compilato — ma entra come **una riga sola e
    corta**: senza a capo non puo fingersi un messaggio del sistema, e
    accorciato non e piu lo spazio per scriverne uno.
  */
  const nomeInBacheca = String(respondentName || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);

  await (prisma as any).notification.createMany({
    data: recipientIds.map((userId) => ({
      organization_id: organizationId,
      user_id: userId,
      title: "Nuova compilazione da esaminare",
      message: `${templateTitle}${nomeInBacheca ? ` — ${nomeInBacheca}` : ""}`,
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

/* ------------------------------------ cio che l'approvazione produce oltre */

/**
 * Consensi e documento: le due cose che l'approvazione fa **dopo** aver
 * scritto in anagrafica (W3-F).
 *
 * ## Perche non fanno fallire l'approvazione
 *
 * L'anagrafica e il fatto principale, e il consenso e il documento ne sono la
 * conseguenza. Una definizione ritirata ieri, un modello mai pubblicato, un
 * codice fiscale che il risolutore non trova: sono tutte cose che si
 * correggono e si rifanno, mentre un'approvazione persa costringe la famiglia
 * a ricompilare. Quindi ogni intoppo diventa una riga di `issues`, che la
 * segreteria legge subito dopo aver approvato, e l'approvazione riesce.
 *
 * ## Perche l'idempotenza si ottiene in due modi diversi
 *
 * **Il documento e un indice.** `generated_documents` ha il vincolo unico
 * `(organization_id, batch_id, subject_kind, subject_id)`, e la compilazione
 * gli fornisce un `batch_id` deterministico (`form:<id>`): riapprovare,
 * ricaricare o ritentare dopo un errore a meta finisce sullo stesso `upsert`,
 * e la seconda volta non scrive niente. La difesa e **nel database**, che e
 * l'unico posto dove regge anche a due richieste concorrenti.
 *
 * **Il consenso e un controllo applicativo, e non puo essere altro.** Il
 * registro dei consensi e **append-only per scelta di dominio** (ADR-0090):
 * un'accettazione ripetuta e legittima e non e un doppione — e cio che accade
 * ogni volta che il club ripubblica l'informativa e ricontatta le famiglie.
 * Un indice unico su (definizione, soggetto, stato) vieterebbe proprio quel
 * caso vero. Cio che va evitato e piu ristretto: **due decisioni che citano la
 * stessa evidenza**, cioe la stessa compilazione contata due volte. Per questo
 * si guarda lo storico gia derivato per quella (definizione, soggetto) e si
 * cerca l'evidenza prima di scrivere. E un controllo piu debole di un indice —
 * due approvazioni davvero simultanee della stessa compilazione potrebbero
 * passarci in mezzo — ma quel caso e gia impedito a monte: la seconda trova la
 * compilazione in stato `approved` e si ferma.
 */
type ApprovalExtras = {
  applied: string[];
  issues: string[];
  generatedDocumentId: string | null;
};

/**
 * Il ruolo da passare ai domini vicini quando si approva una compilazione.
 *
 * **Vale solo se il club della compilazione e quello attivo.** Il confine dei
 * moduli e `allowedOrganizationIds` — tutti i club a cui l utente appartiene —
 * mentre `activeRole` e il ruolo del club **attivo**: chi ha due societa puo
 * approvare una compilazione della prima tenendo attiva la seconda, e i due
 * valori non parlano piu della stessa cosa.
 *
 * E la stessa forma del difetto che l audit ha trovato nel motore documentale,
 * dove il ruolo di un club valeva sui documenti di un altro. Qui la si chiude
 * al contrario: **niente ruolo**, quindi nessuna generazione con dati delicati
 * e nessun consenso registrato per conto di qualcuno. L approvazione riesce
 * comunque — l anagrafica e il fatto principale — e cio che non si e potuto
 * fare compare fra gli avvisi.
 */
const roleForNeighbours = (
  scope: FormsAccessScope,
  organizationId: string,
) =>
  asText(scope.activeOrganizationId) === asText(organizationId)
    ? (scope.activeRole ?? null)
    : null;

const consentScopeOf = (
  scope: FormsAccessScope,
  organizationId: string,
) => ({
  userId: scope.userId,
  activeOrganizationId: organizationId,
  activeRole: roleForNeighbours(scope, organizationId),
  allowedOrganizationIds: scope.allowedOrganizationIds,
});

/**
 * Registra i consensi dichiarati dai campi della compilazione.
 *
 * La definizione si cerca **fra quelle di questo club**: una chiave che nomina
 * la definizione di un'altra societa non si trova, e la spunta non diventa
 * niente. Non e una svista che si compensa altrove — e il confine, e passa da
 * `listConsentDefinitions`, che e il proprietario.
 */
const applyConsentDeclarations = async ({
  scope,
  organizationId,
  submission,
  subject,
}: {
  scope: FormsAccessScope;
  organizationId: string;
  submission: FormSubmissionRecord;
  subject: ApprovedSubject;
}): Promise<{ applied: string[]; issues: string[] }> => {
  const applied: string[] = [];
  const issues: string[] = [];

  const declarations = collectConsentDeclarations(
    submission.schema,
    submission.answers,
  );
  if (!declarations.length) return { applied, issues };

  const subjectKind = consentSubjectKindForFormSubject(subject.subject);
  if (!subjectKind) {
    issues.push(
      `I consensi del modulo non sono stati registrati: un «${describeFormSubject(
        subject.subject,
      )}» non e un soggetto a cui si intesta un consenso.`,
    );
    return { applied, issues };
  }

  const consentScope = consentScopeOf(scope, organizationId);

  let definitions;
  try {
    definitions = await listConsentDefinitions(consentScope, {
      organizationId,
    });
  } catch (error: any) {
    issues.push(
      `I consensi del modulo non sono stati registrati: ${asText(error?.message) || "errore sconosciuto"}`,
    );
    return { applied, issues };
  }

  /*
    Una `source` che dice il vero. Il dominio dei consensi distingue la spunta
    della famiglia sul link pubblico da quella che la segreteria registra
    compilando lei il modulo, e la distinzione non e decorazione: chi rilegge
    il registro fra un anno deve poter pesare l'evidenza senza aprirla.
  */
  const source =
    submission.source === "internal" ? "internal_form" : "public_form";

  for (const declaration of declarations) {
    const definition = definitions.find(
      (entry) => entry.key === declaration.consentKey,
    );

    if (!definition) {
      issues.push(
        `«${declaration.fieldLabel}»: nessun consenso con chiave «${declaration.consentKey}» in questo club. La spunta resta nella compilazione e non e diventata un consenso.`,
      );
      continue;
    }

    if (definition.status !== "active") {
      issues.push(
        `«${declaration.fieldLabel}»: il consenso «${definition.title}» non e attivo. La spunta non e stata registrata.`,
      );
      continue;
    }

    try {
      /*
        L'idempotenza applicativa: si cerca **questa** compilazione fra le
        evidenze gia registrate per questa definizione e questo soggetto. Vedi
        il commento in testa alla sezione per il perche qui non ci sia un
        indice.
      */
      const history = await listConsentRecords(consentScope, definition.id, {
        organizationId,
        subjectKind,
        subjectId: subject.recordId,
      });

      const alreadyRecorded = history.some(
        (record) =>
          record.evidenceKind === FORM_SUBMISSION_EVIDENCE_KIND &&
          record.evidenceId === submission.id,
      );
      if (alreadyRecorded) continue;

      await recordConsentDecision(consentScope, {
        organizationId,
        definitionId: definition.id,
        /*
          La versione **pubblicata al momento dell'approvazione**, non quella
          in vigore quando il modulo e stato compilato: e il testo che il club
          dichiara valido adesso, ed e l'unico che sappia rispondere a «cosa ha
          accettato». Se manca, `recordConsentDecision` rifiuta, ed e giusto:
          non c'e niente da accettare.
        */
        versionId: definition.publishedVersionId,
        subjectKind,
        subjectId: subject.recordId,
        subjectLabel: subject.label || null,
        status: declaration.accepted ? "accepted" : "rejected",
        source,
        evidenceKind: FORM_SUBMISSION_EVIDENCE_KIND,
        evidenceId: submission.id,
        note: `Modulo «${submission.templateTitle}» — ${declaration.fieldLabel}`,
      });

      applied.push(
        declaration.accepted
          ? `Consenso registrato: ${definition.title}`
          : `Consenso rifiutato, e registrato come tale: ${definition.title}`,
      );
    } catch (error: any) {
      issues.push(
        `«${declaration.fieldLabel}»: ${asText(error?.message) || "consenso non registrato"}`,
      );
    }
  }

  return { applied, issues };
};

/**
 * Genera il documento che il modulo dichiara, se lo dichiara.
 *
 * Il modello arriva dalle impostazioni della **versione compilata**, non dalla
 * bozza del modulo: cio che esce da una compilazione di marzo lo ha deciso il
 * modulo di marzo.
 */
const generateSubmissionDocument = async ({
  scope,
  organizationId,
  submission,
  subject,
}: {
  scope: FormsAccessScope;
  organizationId: string;
  submission: FormSubmissionRecord;
  subject: ApprovedSubject;
}): Promise<{ documentId: string | null; applied: string[]; issues: string[] }> => {
  const templateId = asText(submission.schema.settings.documentTemplateId);
  if (!templateId) return { documentId: null, applied: [], issues: [] };

  const documentScope = {
    userId: scope.userId,
    activeOrganizationId: organizationId,
    allowedOrganizationIds: scope.allowedOrganizationIds,
    role: roleForNeighbours(scope, organizationId),
  };

  try {
    /*
      Il modello si carica passando dal suo proprietario: un identificativo di
      un'altra societa risponde «Accesso negato», e un modello mai pubblicato
      dice che non e mai stato pubblicato. Nessuna delle due cose la decide
      questo file.
    */
    const { version } = await loadPublishableVersion(documentScope, templateId);

    const declared = asText(version.subject_kind) || "athlete";
    const wanted = documentSubjectKindForFormSubject(subject.subject);

    /*
      Il soggetto del documento deve essere quello che il **modello** dichiara,
      con la stessa regola della generazione singola: un modello da atleta su
      un socio produrrebbe un foglio con tutti i campi della persona bianchi, e
      nessuno saprebbe perche.
    */
    if (!wanted || wanted !== declared) {
      throw new Error(
        `Questo modello parla di «${declared}»: la compilazione ha approvato un «${describeFormSubject(
          subject.subject,
        )}»`,
      );
    }

    const resolved = await resolveDocumentForSubject({
      template: {
        id: asText(version.template_id),
        title: asText(version.title),
        content: String(version.content_html || ""),
      },
      organizationId,
      subject: { kind: wanted, id: subject.recordId },
      seasonId: null,
      scope: {
        userId: scope.userId,
        activeOrganizationId: organizationId,
        allowedOrganizationIds: scope.allowedOrganizationIds,
      },
    });

    const document = await recordGeneratedDocument(documentScope, {
      organizationId,
      templateId: asText(version.template_id),
      versionId: asText(version.id),
      subjectKind: wanted,
      subjectId: subject.recordId,
      subjectLabel: resolved.recipientName || subject.label || null,
      seasonId: null,
      valuesSnapshot: resolved.values,
      contentHtml: renderFilledDocumentHtml({
        title: resolved.title,
        bodyHtml: resolved.html,
        issuer: resolved.issuer,
      }),
      unresolved: resolved.unresolved,
      missing: resolved.missing,
      warnings: resolved.warnings,
      sensitivity: version.sensitivity || [],
      /* Vedi `buildSubmissionDocumentBatchId`: e qui che vive l'idempotenza. */
      batchId: buildSubmissionDocumentBatchId(submission.id),
    });

    return {
      documentId: document.id,
      applied: [`Documento generato: ${document.templateTitle || resolved.title}`],
      issues: [],
    };
  } catch (error: any) {
    /*
      Nessuna entita orfana: o si arriva a `recordGeneratedDocument` con tutto
      risolto, o non si e scritta nessuna riga. Cio che fallisce prima —
      modello di un altro club, modello non pubblicato, soggetto che il
      risolutore non trova — lascia il database com'era e diventa una riga di
      esito.
    */
    return {
      documentId: null,
      applied: [],
      issues: [
        `Documento non generato: ${asText(error?.message) || "errore sconosciuto"}`,
      ],
    };
  }
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
  /**
   * Cosa **non** e stato scritto, e perche.
   *
   * Un consenso non registrato o un documento non generato non fanno fallire
   * l'approvazione (vedi la sezione precedente), ma tacerli sarebbe peggio: la
   * segreteria crederebbe di aver raccolto un consenso che non ha.
   */
  issues: string[];
  /**
   * Il documento nato da questa approvazione, quando il modulo ne dichiara uno.
   *
   * Non c'e una colonna che lo colleghi alla compilazione, e non serve: il
   * documento porta `batch_id = form:<id della compilazione>`, che e il
   * riferimento — deterministico, e con un vincolo unico sopra.
   */
  generatedDocumentId: string | null;
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

    return {
      submission: serializeSubmission(updated),
      applied: [],
      issues: [],
      generatedDocumentId: null,
    };
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

  /*
    Chi e stato creato o aggiornato, per soggetto. Serve a consenso e documento
    (W3-F): entrambi si intestano a una persona, e la persona e quella che
    questa approvazione ha scritto — non quella che il corpo della richiesta
    dice, che qui non arriva mai.
  */
  const writtenRecordIds: Partial<Record<FormSubjectKey, string>> = {};
  if (athleteId) writtenRecordIds.athlete = athleteId;

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
      writtenRecordIds[subject] = change.recordId;
      applied.push(`${change.subjectLabel} aggiornato: ${change.recordLabel}`);
    } else {
      const created = await createResource(
        resource,
        { organization_id: organizationId, ...payload, name },
        "create",
        scope,
      );
      const createdId = asText((created as any)?.id);
      if (createdId) writtenRecordIds[subject] = createdId;
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

  /*
    La compilazione conserva **chi e diventata**: ogni soggetto che
    l'approvazione ha scritto entra nei `subjects`, anche quando non c'era
    nessuna selezione — che e il caso normale di una compilazione pubblica,
    dove la persona non esisteva ancora.

    Non e cosmetica per la coda: e cio che rende ripetibile un'approvazione
    interrotta a meta. Senza, un nuovo tentativo ripartirebbe da «nessun
    atleta scelto» e ne creerebbe un secondo — e con lui un secondo consenso e
    un secondo documento, perche entrambi si intestano al soggetto.
  */
  const nextSubjects: FormSubjectSelection[] = review.submission.subjects.map(
    (selection) => {
      const written = writtenRecordIds[selection.subject];
      return written ? { ...selection, recordId: written } : selection;
    },
  );

  for (const [subject, recordId] of Object.entries(writtenRecordIds) as Array<
    [FormSubjectKey, string]
  >) {
    if (nextSubjects.some((selection) => selection.subject === subject)) continue;
    nextSubjects.push({
      subject,
      recordId,
      label:
        review.changeSet.subjects.find((entry) => entry.subject === subject)
          ?.recordLabel || "",
    });
  }

  /*
    Consenso e documento vengono **prima** del passaggio a `approved`, e non
    dopo. Se il processo si interrompe qui in mezzo la compilazione resta
    `pending`, quindi riapprovabile — e riapprovare non duplica niente, perche
    l'idempotenza delle due scritture e gia stata risolta a monte. Nell'ordine
    opposto, un'interruzione lascerebbe una compilazione approvata che non si
    puo piu riprovare, cioe un consenso perso in silenzio.
  */
  const extras: ApprovalExtras = {
    applied: [],
    issues: [],
    generatedDocumentId: null,
  };

  const approvedSubject = pickApprovedSubject(
    (Object.entries(writtenRecordIds) as Array<[FormSubjectKey, string]>).map(
      ([subject, recordId]) => ({
        subject,
        recordId,
        label:
          review.changeSet.subjects.find((entry) => entry.subject === subject)
            ?.recordLabel || "",
      }),
    ),
  );

  if (approvedSubject) {
    const consents = await applyConsentDeclarations({
      scope,
      organizationId,
      submission: review.submission,
      subject: approvedSubject,
    });
    extras.applied.push(...consents.applied);
    extras.issues.push(...consents.issues);

    const document = await generateSubmissionDocument({
      scope,
      organizationId,
      submission: review.submission,
      subject: approvedSubject,
    });
    extras.applied.push(...document.applied);
    extras.issues.push(...document.issues);
    extras.generatedDocumentId = document.documentId;
  } else if (
    collectConsentDeclarations(review.submission.schema, review.submission.answers)
      .length ||
    asText(review.submission.schema.settings.documentTemplateId)
  ) {
    extras.issues.push(
      "Nessuna persona creata o aggiornata da questa compilazione: non c'e nessuno a cui intestare il consenso o il documento.",
    );
  }

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

  return {
    submission: serializeSubmission(updated),
    applied: [...applied, ...extras.applied],
    issues: extras.issues,
    generatedDocumentId: extras.generatedDocumentId,
  };
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
