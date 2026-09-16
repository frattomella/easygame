import { randomUUID } from "crypto";
import { reportServerError } from "./observability";
import { athleteWithinAccessScope } from "./access-scope-query";
import {
  hasHealthPermission,
  stripClinicalAthleteFields,
} from "@/lib/health/permissions";
import { canAccessClubResource } from "@/lib/access-roles";
import { roleHasPermission } from "@/lib/permissions/catalog";
import { assertActiveClub } from "@/lib/auth/active-club-boundary";
import { prisma } from "./prisma";
import { documentGuardianAt } from "@/lib/guardians/documents";
import { upsertGuardianFromFormApproval } from "./athlete-guardians";
import { createAttachment, deleteAttachment } from "./attachments";
import { parseAttachmentReference } from "@/lib/attachments";
import { createResource, lockAthleteRow, updateResource } from "./resources";
import { sendNotificationEmails } from "./email/email-service";
import {
  findPublicFormBySlug,
  loadClubFormOptions,
  resolveCompilableVersion,
  type ClubFormOptions,
  type FormsAccessScope,
  type PublicFormMatch,
} from "./forms";
import { normalizeCategoryToken, resolveCategoryReference } from "@/lib/categories/identity";
import { applyMembershipChange } from "./athlete-category-memberships";
import { MEMBERSHIP_WARNING_LABELS } from "@/lib/categories/membership-change";
import { buildSiteIndex } from "@/lib/club-sites";
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
import {
  buildAttachmentReference,
  MAX_ATTACHMENT_BYTES,
} from "@/lib/attachments";
import {
  fieldCollectsAnswer,
  fieldIsFile,
  formatAnswer,
  getSchemaSubjects,
  isEnrollmentForm,
  isFormSubmissionStatus,
  normalizeChangesRequested,
  normalizeFormSchema,
  submissionIsApprovedLike,
  submissionIsOpen,
  type FormChangesRequested,
  type FormSchema,
  type FormSubmissionFile,
  type FormSubmissionRecord,
  type FormSubmissionSource,
  type FormSubmissionStatus,
  type FormSubjectSelection,
} from "@/lib/forms/model";
import { buildDeclarations, buildSnapshotHash, normalizeDeclarations } from "./form-declarations";
import { enrollmentReceiptHashesMatch } from "@/lib/forms/enrollment-receipt";
import { consumeFormDraft } from "./form-drafts";
import { AUDIT_ACTIONS, recordAuditEvent } from "./audit";
import { sendEnrollmentChangesRequestedEmail } from "./email/email-service";
import { convertTrialAthlete, listTrialAthletes } from "./trial-athletes";
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
import {
  buildSubmissionDedupKey,
  generateEnrollmentReceiptReference,
  hashEnrollmentReceiptReference,
  type EnrollmentKind,
} from "@/lib/forms/enrollment-receipt";
import { resolveLinkedFamilyScope } from "./document-requests";
import { requestMissingDocuments } from "./enrollment-requests";
import { readClubSeasonState } from "./seasons";

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

  /*
    **E la chiave, perche il registro generico da solo non bastava.**

    La voce di catalogo dei moduli diceva `keys: []`, e
    `customRoleReachesResource` su una voce senza chiavi risponde `true`
    **incondizionatamente**: un ruolo di club con una casella sola — o con
    nessuna — leggeva ogni pratica di iscrizione online del club. Codice
    fiscale, data di nascita, indirizzo, telefono e tutori di ogni minore
    iscritto.

    La motivazione scritta era «i moduli hanno le proprie rotte di dominio», ma
    quelle rotte autorizzano **proprio** con `canAccessClubResource(role,
    "forms", …)`: il rimando era circolare, e in mezzo non c'era niente.
  */
  if (!roleHasPermission(scope.activeRole, "forms.submissions.read")) {
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
    /*
      **Una voce esclusa non e un soggetto.**

      I due lettori dei documenti scartano le voci revocate e quelle di solo
      recapito (ADR-0149); questo — che sceglie di **quale tutore** parla una
      pratica — non lo faceva. Una voce apertamente revocata diventava percio il
      soggetto di una compilazione, e da li l'approvazione ci scriveva sopra.

      E il terzo lettore posizionale, ed e il gemello che le due correzioni
      precedenti non avevano allargato: adesso i tre chiamano la **stessa**
      funzione, e allargarne uno solo non e piu possibile.
    */
    records.guardian = documentGuardianAt(
      athlete?.data,
      Number(guardianSelection.recordId),
    );
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
  /** `enrollment` | `renewal`: il contesto, non un secondo motore. */
  kind?: string | null;
  /** La stagione che la pratica dichiara, quando ne dichiara una. */
  season_id?: string | null;
  status: string;
  subjects: unknown;
  answers: unknown;
  files: unknown;
  respondent_name: string | null;
  respondent_email: string | null;
  submitted_at: Date;
  /*
    **Chi ha compilato, quando lo si sa.** E cio che distingue lo sconosciuto
    che apre un link pubblico dalla famiglia che rinnova dalla propria area: il
    trasporto (`source`) per entrambe vale `public`.
  */
  submitted_by?: string | null;
  reviewed_at: Date | null;
  review_note: string | null;
  /* ADR-0189 */
  declarations?: unknown;
  snapshot_hash?: string | null;
  revision?: number | null;
  changes_requested?: unknown;
  athlete_id?: string | null;
  trial_athlete_id?: string | null;
  archived_at?: Date | null;
  template?: { title: string } | null;
  template_version?: { version: number; schema_json: unknown } | null;
  revisions?: Array<{
    id: string;
    revision: number;
    answers: unknown;
    files: unknown;
    declarations: unknown;
    snapshot_hash: string | null;
    reason: unknown;
    submitted_at: Date;
    superseded_at: Date;
  }> | null;
};

const normalizeStatus = (value: unknown): FormSubmissionStatus => {
  const status = asText(value);
  return isFormSubmissionStatus(status) ? status : "pending";
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
        ...(asText(record.checksum) ? { checksum: asText(record.checksum) } : {}),
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
    kind: asText(row.kind) || "enrollment",
    revision: Number(row.revision) || 1,
    declarations: normalizeDeclarations(row.declarations),
    snapshotHash: asText(row.snapshot_hash),
    changesRequested: normalizeChangesRequested(row.changes_requested),
    athleteId: asText(row.athlete_id),
    trialAthleteId: asText(row.trial_athlete_id),
    archivedAt: toIso(row.archived_at),
    revisions: (row.revisions || [])
      .slice()
      .sort((a, b) => b.revision - a.revision)
      .map((r) => ({
        id: r.id,
        revision: r.revision,
        answers: r.answers && typeof r.answers === "object" ? (r.answers as Record<string, unknown>) : {},
        files: normalizeFiles(r.files),
        declarations: normalizeDeclarations(r.declarations),
        snapshotHash: asText(r.snapshot_hash),
        reason: normalizeChangesRequested(r.reason),
        submittedAt: toIso(r.submitted_at),
        supersededAt: toIso(r.superseded_at),
      })),
  };
};

const SUBMISSION_INCLUDE = {
  template: { select: { title: true } },
  template_version: { select: { version: true, schema_json: true } },
  revisions: true,
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
  /** Il gettone della bozza da cui questo invio nasce (ADR-0189 §3): si consuma. */
  draftToken?: string;
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

    /*
      Il tetto e del sistema; il club puo solo abbassarlo (`field.upload.maxBytes`).
    */
    const maxBytes = Math.min(
      MAX_PUBLIC_FORM_UPLOAD_BYTES,
      MAX_ATTACHMENT_BYTES,
      field.upload?.maxBytes || MAX_PUBLIC_FORM_UPLOAD_BYTES,
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
    /* Un campo «immagine» accetta solo immagini, anche da un mittente autenticato. */
    const soloImmagini =
      field.type === "image_upload" || field.upload?.accept === "images";
    const mimeIncoming = String(incoming.mimeType || "").toLowerCase();
    const mimeAccettato =
      field.type === "signature"
        ? TIPI_FIRMA.has(mimeIncoming)
        : soloImmagini
          ? isPublicFormUploadMimeType(mimeIncoming) && mimeIncoming.startsWith("image/")
          : !requireNarrowMimeTypes || isPublicFormUploadMimeType(incoming.mimeType);

    if (!mimeAccettato) {
      throw new FormSubmissionError(
        field.type === "signature"
          ? `«${field.label}»: la firma deve essere un'immagine.`
          : soloImmagini
            ? `«${field.label}»: carica un'immagine (JPEG, PNG, WebP o HEIC).`
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
): Promise<SubmissionReceipt> => {
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

/* ------------------------------------------------ integrazione pubblica */

/**
 * Cio che la famiglia vede quando il club ha chiesto un'integrazione
 * (ADR-0189 §4, ADR-0191 §1): la ricevuta e la credenziale — la stessa che
 * apre lo stato — e la pratica deve essere in `changes_requested`. Torna la
 * versione compilata, le risposte correnti (non i file), i campi che si
 * possono correggere e la nota. Ogni esito negativo e `null` → 404.
 */
export type PublicRevisionContext = {
  clubName: string;
  templateTitle: string;
  /** Un elenco chiuso: titolo, descrizione e campi della versione compilata — non le impostazioni. */
  schema: Pick<FormSchema, "title" | "description" | "fields">;
  /**
   * **Solo** le risposte dei campi da correggere e dei campi da cui
   * quelli dipendono (`visibleWhen`): la ricevuta apre lo stato di una
   * pratica, non la rilettura dell'anagrafica di un minore (ADR-0191 §1).
   */
  answers: Record<string, unknown>;
  /** I file gia inviati, per nome, dei soli campi da correggere. */
  files: Array<{ fieldId: string; fileName: string }>;
  allowedFieldIds: string[];
  note: string;
  revision: number;
  /** Lo slug del modulo, per le immagini di contenuto dalla rotta pubblica. */
  publicSlug: string;
};

const trovaPraticaConRicevuta = async (reference: unknown): Promise<SubmissionRow | null> => {
  const hash = hashEnrollmentReceiptReference(reference);
  if (!hash) return null;
  const row = (await (prisma as any).formSubmission.findUnique({
    where: { receipt_token_hash: hash },
    include: SUBMISSION_INCLUDE,
  })) as (SubmissionRow & { receipt_token_hash?: string | null }) | null;
  if (!row) return null;
  if (!enrollmentReceiptHashesMatch(asText(row.receipt_token_hash), hash)) return null;
  return row;
};

export const readPublicRevisionContext = async (reference: unknown): Promise<PublicRevisionContext | null> => {
  const row = await trovaPraticaConRicevuta(reference);
  if (!row || normalizeStatus(row.status) !== "changes_requested") return null;
  const richiesta = normalizeChangesRequested(row.changes_requested);
  if (!richiesta) return null;
  const schema = normalizeFormSchema(row.template_version?.schema_json);
  const [club, modello] = await Promise.all([
    prisma.club.findUnique({ where: { id: row.organization_id }, select: { name: true } }),
    (prisma as any).formTemplate.findUnique({ where: { id: row.template_id }, select: { public_slug: true, public_enabled: true } }),
  ]);
  const tutte = row.answers && typeof row.answers === "object" ? (row.answers as Record<string, unknown>) : {};
  const consentiti = new Set(richiesta.fieldIds);
  /* I campi che governano la visibilita di un campo da correggere servono al renderer. */
  for (const field of schema.fields) {
    if (consentiti.has(field.id) && field.visibleWhen) consentiti.add(field.visibleWhen.fieldId);
  }
  const answers: Record<string, unknown> = {};
  for (const id of consentiti) if (id in tutte) answers[id] = tutte[id];
  return {
    clubName: asText(club?.name),
    templateTitle: row.template?.title || schema.title,
    schema: { title: schema.title, description: schema.description, fields: schema.fields },
    answers,
    files: normalizeFiles(row.files)
      .filter((file) => richiesta.fieldIds.includes(file.fieldId))
      .map((file) => ({ fieldId: file.fieldId, fileName: file.fileName })),
    allowedFieldIds: richiesta.fieldIds,
    note: richiesta.note,
    revision: Number(row.revision) || 1,
    publicSlug: modello?.public_enabled ? asText(modello.public_slug) : "",
  };
};

/**
 * Il reinvio dopo un'integrazione richiesta.
 *
 * Si cambiano **solo** i campi elencati dal club: le altre risposte si
 * prendono dalla pratica, qualunque cosa arrivi. La copia precedente finisce
 * in `form_submission_revisions` con il motivo; la pratica porta l'ultima,
 * `revision + 1`, dichiarazioni e impronta ricalcolate, e torna `pending`.
 */
export const resubmitPublicSubmission = async (
  reference: unknown,
  input: SubmitFormInput,
): Promise<{ revision: number }> => {
  const row = await trovaPraticaConRicevuta(reference);
  if (!row || normalizeStatus(row.status) !== "changes_requested") {
    throw new FormSubmissionError("Pratica non disponibile", 404);
  }
  const richiesta = normalizeChangesRequested(row.changes_requested);
  if (!richiesta) throw new FormSubmissionError("Pratica non disponibile", 404);

  const schema = normalizeFormSchema(row.template_version?.schema_json);
  const consentiti = new Set(richiesta.fieldIds);
  const correnti = row.answers && typeof row.answers === "object" ? (row.answers as Record<string, unknown>) : {};
  const fileCorrenti = normalizeFiles(row.files);

  /* Le risposte: le correnti, con sopra **solo** i campi consentiti. */
  const unite: Record<string, unknown> = { ...correnti };
  const inArrivo = input.answers && typeof input.answers === "object" ? input.answers : {};
  for (const id of consentiti) {
    if (id in inArrivo) unite[id] = (inArrivo as Record<string, unknown>)[id];
    else delete unite[id];
  }

  /* I file: quelli correnti restano, salvo i campi consentiti che ricevono un file nuovo. */
  const fileInArrivo = input.files.filter((file) => consentiti.has(asText(file.fieldId)));
  const campiSostituiti = new Set(fileInArrivo.map((file) => asText(file.fieldId)));
  const fileConservati = fileCorrenti.filter((file) => !campiSostituiti.has(file.fieldId));

  const match: PublicFormMatch = {
    organizationId: row.organization_id,
    templateId: row.template_id,
    versionId: row.version_id,
    schema,
  } as PublicFormMatch;

  const nuoviFile = await storeSubmissionFiles({
    organizationId: row.organization_id,
    templateId: row.template_id,
    schema,
    files: fileInArrivo,
    requireNarrowMimeTypes: true,
  });
  const files = [...fileConservati, ...nuoviFile];

  const validated = validateAnswers(schema, unite, files.map((file) => file.fieldId));
  if (!validated.valid) {
    await scartaAllegati(nuoviFile);
    throw new FormSubmissionError("Controlla i campi segnalati.", 422, validated.errors);
  }

  const respondent = asText(row.respondent_name) || asText(row.respondent_email);
  /*
    Le dichiarazioni dei campi **non** corretti restano quelle dell'invio
    originale, con la loro ora (EDPB 05/2020 §108: «quando»); si rifanno solo
    quelle delle caselle che il club ha chiesto di rivedere.
  */
  const precedenti = normalizeDeclarations(row.declarations);
  const rifatte = buildDeclarations({ schema, versionId: row.version_id, answers: validated.answers, respondent });
  const declarations = rifatte.map((nuova) =>
    consentiti.has(nuova.fieldId) ? nuova : precedenti.find((d) => d.fieldId === nuova.fieldId) || nuova,
  );
  const snapshotHash = buildSnapshotHash({ versionId: row.version_id, answers: validated.answers, declarations, files });
  const revisionePrecedente = Number(row.revision) || 1;

  try {
  await prisma.$transaction(async (tx) => {
    await (tx as any).formSubmissionRevision.create({
      data: {
        organization_id: row.organization_id,
        submission_id: row.id,
        revision: revisionePrecedente,
        answers: correnti,
        files: fileCorrenti,
        declarations: row.declarations ?? null,
        snapshot_hash: row.snapshot_hash ?? null,
        reason: richiesta,
        submitted_at: row.submitted_at,
      },
    });
    const esito = await (tx as any).formSubmission.updateMany({
      where: { id: row.id, status: "changes_requested", revision: revisionePrecedente },
      data: {
        status: "pending",
        answers: validated.answers,
        files,
        declarations,
        snapshot_hash: snapshotHash,
        revision: revisionePrecedente + 1,
        changes_requested: null,
        submitted_at: new Date(),
        reviewed_at: null,
        reviewed_by: null,
      },
    });
    if (esito.count !== 1) throw new FormSubmissionError("La pratica e cambiata nel frattempo: ricarica.", 409);
  });
  } catch (errore: any) {
    /* Gli allegati appena caricati non restano orfani: nessuna pratica li cita. */
    await scartaAllegati(nuoviFile).catch(() => undefined);
    /* Due reinvii simultanei: uno solo scrive la revisione (unico su submission_id+revision). */
    if (errore?.code === "P2002") throw new FormSubmissionError("La pratica e cambiata nel frattempo: ricarica.", 409);
    throw errore;
  }

  await recordAuditEvent({
    action: AUDIT_ACTIONS.formSubmissionResubmitted,
    organizationId: row.organization_id,
    resource: "form_submissions",
    resourceId: row.id,
    metadata: { revisione: revisionePrecedente + 1, campi: richiesta.fieldIds, allegatiNuovi: nuoviFile.length },
  });

  const templateTitle = row.template?.title || schema.title;
  await notifyClub({
    organizationId: row.organization_id,
    templateTitle: `${templateTitle} (integrazione ricevuta)`,
    templateId: row.template_id,
    submissionId: row.id,
    respondentName: asText(row.respondent_name),
  }).catch(() => undefined);

  return { revision: revisionePrecedente + 1 };
};

/**
 * Cosa torna a chi ha appena inviato.
 *
 * `receiptReference` e il riferimento in chiaro, e **esiste solo qui**: in
 * archivio ne resta l'impronta. Non si puo ristampare, e non e una
 * dimenticanza — un riferimento ristampabile a richiesta sarebbe un
 * riferimento leggibile da chiunque sappia chiedere.
 */
export type SubmissionReceipt = {
  submissionId: string;
  successMessage: string;
  /** Vuoto per le compilazioni della segreteria: non le segue nessuna famiglia. */
  receiptReference: string;
};

/** La pratica gia scritta con quella chiave, se c'e. */
const trovaGemella = async (organizationId: string, dedupKey: string) =>
  dedupKey
    ? ((await (prisma as any).formSubmission.findFirst({
        where: { organization_id: organizationId, dedup_key: dedupKey },
        select: { id: true },
      })) as { id: string } | null)
    : null;

/** Gli allegati caricati da un invio che poi ha perso la corsa. */
const scartaAllegati = async (files: FormSubmissionFile[]) => {
  for (const file of files) {
    const id = parseAttachmentReference(file.reference);
    if (!id) continue;
    await deleteAttachment(id).catch((error) => {
      // Un allegato orfano non deve far fallire un invio che e andato a buon fine.
      reportServerError(error, {
      metadata: { esito: "allegato del doppio invio non rimosso" },
    });
    });
  }
};

/**
 * Cosa si risponde al secondo invio dello stesso gesto: **che e andata bene**.
 *
 * Non un errore. Un doppio clic non e uno sbaglio di chi compila, e dirgli che
 * ha sbagliato lo farebbe premere una terza volta — e la stessa ragione per cui
 * `creaRiga` degli appuntamenti restituisce la riga invece di lamentarsi.
 *
 * **Il riferimento della ricevuta esce vuoto, e non e una dimenticanza.** In
 * archivio ne vive solo l'impronta (ADR-0085): il valore in chiaro del primo
 * invio non e piu leggibile da nessuno, nemmeno da qui. Fabbricarne un secondo
 * significherebbe due credenziali per una pratica sola; derivarlo dalla chiave
 * significherebbe una credenziale che chiunque conosca le risposte sa ricalcolare.
 * Vuoto e gia una forma prevista — le compilazioni della segreteria escono cosi
 * — e chi ha visto la prima risposta il riferimento ce l'ha.
 */
const riscontroDelDuplicato = (
  gemella: { id: string },
  match: PublicFormMatch,
): SubmissionReceipt => ({
  submissionId: gemella.id,
  successMessage: match.schema.settings.successMessage,
  receiptReference: "",
});

/**
 * **Questo modulo si compila una volta sola, e per questo soggetto e gia
 * successo?** (PP-02 §J)
 *
 * La deduplicazione a finestra difende dal **gesto** ripetuto — dieci minuti,
 * stesse risposte — e continua a farlo. Questa difende dalla **compilazione**
 * ripetuta, che e un'altra cosa: fuori da quella finestra, o cambiando una
 * virgola, la stessa iscrizione si poteva rimandare tre volte, e in segreteria
 * arrivavano tre pratiche da leggere per capire quale valesse.
 *
 * **Una pratica respinta non blocca**: e proprio il caso in cui la famiglia
 * deve poter rimandare. Contano le vive — in attesa e approvate.
 *
 * **Senza un soggetto risolvibile non si vincola niente.** Una compilazione
 * pubblica di chi non e ancora in anagrafica non ha un atleta su cui contare, e
 * inventare un conteggio per indirizzo email significherebbe bloccare due
 * fratelli iscritti dallo stesso genitore. La conseguenza va detta al club: il
 * vincolo vale sul rinnovo di chi e gia in archivio.
 */
const assertNonGiaCompilato = async (
  match: PublicFormMatch,
  selections: FormSubjectSelection[],
) => {
  if (!match.schema.settings.singleSubmission) return;

  /*
    **Solo i soggetti `athlete`, e non tutti i `recordId`.**

    Il `recordId` di un tutore non e un identificativo: e la **posizione**
    nell'elenco dei guardians — `"0"`, `"1"` — ed e cosi che lo legge chi lo
    consuma. Contarlo fra i soggetti significava che la seconda famiglia in
    assoluto riceveva «questo modulo e gia stato compilato», perche quasi ogni
    compilazione indica il primo tutore.

    Il difetto viveva gia nel vaglio in memoria; portare il filtro nel database
    lo ha reso **fedele a una regola sbagliata**, ed e il verso in cui una
    correzione di prestazioni peggiora una correttezza.
  */
  const soggetti = selections
    .filter((selection) => asText(selection.subject) === "athlete")
    .map((selection) => asText(selection.recordId))
    .filter(Boolean);
  if (!soggetti.length) return;

  /*
    **Il filtro sul soggetto lo fa il database, e il vaglio lo rifa la memoria.**

    Qui c'era `take: 500` e nessun filtro sul soggetto: su un modulo di
    iscrizione di un club grande la compilazione di un atleta poteva **non**
    stare nelle ultime cinquecento, e il vincolo sarebbe caduto in silenzio —
    proprio sui club per cui serve.

    `array_contains` diventa un `@>` di Postgres, che su un array JSON accetta
    un oggetto **parziale**: la riga passa se contiene una selezione con quel
    soggetto e quell'identificativo, qualunque etichetta porti accanto.

    Il vaglio in memoria resta, e non e una ripetizione: se un domani questa
    condizione non venisse valutata — un doppio di prova che non la conosce, un
    cambio di adattatore — restituirebbe **piu** righe, non meno, e la seconda
    lettura decide comunque. Il verso in cui si sbaglia e quello sicuro.
  */
  const vive = (await (prisma as any).formSubmission.findMany({
    where: {
      organization_id: match.organizationId,
      template_id: match.templateId,
      status: { in: ["pending", "changes_requested", "approved", "converted"] },
      OR: soggetti.map((recordId) => ({
        subjects: { array_contains: [{ subject: "athlete", recordId }] },
      })),
    },
    select: { subjects: true },
  })) as Array<{ subjects: unknown }>;

  const gia = vive.some((riga) =>
    normalizeSelections(riga.subjects).some(
      (selection) =>
        asText(selection.subject) === "athlete" &&
        soggetti.includes(asText(selection.recordId)),
    ),
  );

  if (gia) {
    throw new FormSubmissionError(
      "Questo modulo e gia stato compilato e non si puo inviare di nuovo. Se serve una correzione, scrivi alla segreteria.",
      409,
      {},
    );
  }
};

const storeSubmission = async ({
  match,
  input,
  source,
  selections,
  submittedBy,
  requireNarrowMimeTypes,
  kind = "enrollment",
  seasonId = null,
}: {
  match: PublicFormMatch;
  input: SubmitFormInput;
  source: FormSubmissionSource;
  selections: FormSubjectSelection[];
  submittedBy: string | null;
  requireNarrowMimeTypes: boolean;
  kind?: EnrollmentKind;
  seasonId?: string | null;
}): Promise<SubmissionReceipt> => {
  /*
    **La chiave del doppio invio si calcola prima di toccare qualunque cosa**,
    perche il lavoro costoso — caricare gli allegati — e proprio quello che il
    secondo invio non deve rifare. Si calcola sull'ingresso grezzo: le risposte
    convalidate sarebbero identiche, e aspettare la convalida vorrebbe dire
    aver gia scritto i file.
  */
  const dedupKey = buildSubmissionDedupKey({
    templateId: match.templateId,
    versionId: match.versionId,
    respondent: submittedBy || asText(input.respondentEmail),
    answers: input.answers,
    files: (input.files || []).map((file) => ({
      fieldId: file.fieldId,
      fileName: file.fileName,
      sizeBytes: file.content?.length || 0,
    })),
    nowMs: Date.now(),
  });

  const gemella = await trovaGemella(match.organizationId, dedupKey);
  if (gemella) return riscontroDelDuplicato(gemella, match);

  /*
    Prima di caricare gli allegati, che e il lavoro costoso: un modulo gia
    compilato non deve far depositare una seconda copia di un certificato
    medico per poi rifiutare la pratica che lo citava.

    **E non vale sul desk.** `storeSubmission` e la coda comune di tre strade,
    e il vincolo era applicato a tutte e tre: la segretaria che ricompilava un
    modulo per correggere un dato per conto della famiglia riceveva l'errore
    scritto **per la famiglia** — «se serve una correzione, scrivi alla
    segreteria» — cioe l'istruzione di scrivere a se stessa, e come unica
    uscita respingere la pratica esistente. «Una volta sola» e una promessa
    fatta a chi compila da fuori, non un divieto per chi tiene il registro.
  */
  if (source !== "internal") {
    await assertNonGiaCompilato(match, selections);
  }

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

  /*
    **La prova delle dichiarazioni e l'impronta nascono con la pratica**
    (ADR-0192): il testo mostrato accanto a ogni casella legale, la risposta,
    l'ora; e l'impronta di versione, risposte, dichiarazioni e allegati.
  */
  const declarations = buildDeclarations({
    schema: match.schema,
    versionId: match.versionId,
    answers: validated.answers,
    respondent: asText(input.respondentName).slice(0, 200) || respondentEmail || "",
  });
  const snapshotHash = buildSnapshotHash({
    versionId: match.versionId,
    answers: validated.answers,
    declarations,
    files,
  });

  /*
    **La ricevuta nasce con la compilazione, non dopo.**

    Solo per cio che arriva da fuori la segreteria: una compilazione fatta
    dallo sportello non ha una famiglia che la segue da casa, e un riferimento
    emesso e mai consegnato sarebbe una credenziale in giro senza motivo.

    In chiaro esce una volta sola, nel valore di ritorno; in archivio entra
    l'impronta (ADR-0085). Chi legge il database non puo aprire la pratica di
    nessuno, ed e il punto: la lettura pubblica dello stato non ha sessione, e
    l'unica cosa che la autorizza e il riferimento che la famiglia possiede.
  */
  const receiptReference =
    source === "public" ? generateEnrollmentReceiptReference() : "";

  try {
    await (prisma as any).formSubmission.create({
      data: {
        id: submissionId,
        organization_id: match.organizationId,
        template_id: match.templateId,
        version_id: match.versionId,
        source,
        kind,
        season_id: seasonId || null,
        dedup_key: dedupKey,
        receipt_token_hash:
          hashEnrollmentReceiptReference(receiptReference) || null,
        status: "pending",
        subjects: selections,
        answers: validated.answers,
        files,
        declarations,
        snapshot_hash: snapshotHash,
        revision: 1,
        respondent_name: asText(input.respondentName).slice(0, 200) || null,
        respondent_email: respondentEmail.toLowerCase() || null,
        submitted_by: submittedBy,
      },
    });
  } catch (error: any) {
    /*
      Il controllo di prima non basta da solo: due richieste **davvero
      parallele** lo superano entrambe — leggono tutte e due «non c'e» — e solo
      qui, sull'indice unico, una delle due perde. E la stessa lezione degli
      appuntamenti: la difesa e l'indice, il controllo che lo precede serve
      soltanto a non far pagare il lavoro inutile al caso frequente.
    */
    const bersaglio = Array.isArray(error?.meta?.target)
      ? error.meta.target.join(",")
      : String(error?.meta?.target || "");

    if (error?.code !== "P2002" || !bersaglio.includes("dedup_key")) throw error;

    /*
      Chi perde ha gia caricato gli allegati, e li porta via con se: lasciarli
      vorrebbe dire che ogni doppio clic deposita per sempre una copia di un
      certificato medico che nessuna pratica cita piu.
    */
    await scartaAllegati(files);

    const vincente = await trovaGemella(match.organizationId, dedupKey);
    if (vincente) return riscontroDelDuplicato(vincente, match);
    throw error;
  }

  /*
    La bozza da cui l'invio nasce si consuma: il gettone non apre piu niente
    e la riga dice quale pratica e diventata (ADR-0191 §1).
  */
  if (asText(input.draftToken)) {
    await consumeFormDraft({
      templateId: match.templateId,
      token: asText(input.draftToken),
      submissionId,
    }).catch(() => undefined);
  }

  await recordAuditEvent({
    action: AUDIT_ACTIONS.formSubmissionReceived,
    actorUserId: submittedBy,
    organizationId: match.organizationId,
    resource: "form_submissions",
    resourceId: submissionId,
    metadata: { source, kind, version: match.versionId, dichiarazioni: declarations.length, allegati: files.length },
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
      reportServerError(error, {
      metadata: { esito: "notifica della compilazione non inviata" },
    });
    });
  }

  return {
    submissionId,
    successMessage: match.schema.settings.successMessage,
    receiptReference,
  };
};

/* ------------------------------------------------------------ il rinnovo */

export type SubmitRenewalInput = SubmitFormInput & {
  /** Lo slug pubblico del modulo con cui il club raccoglie i rinnovi. */
  publicSlug: string;
  athleteId: string;
};

/**
 * Il rinnovo inviato dalla famiglia: **lo stesso modulo, con un contesto**.
 *
 * Non e un secondo motore di iscrizione, e non deve diventarlo. Passa dalla
 * stessa `storeSubmission`, dalla stessa versione congelata del modulo, dalla
 * stessa coda della segreteria e dalla stessa approvazione umana: cambia che
 * l'atleta e gia noto — quindi la compilazione lo cita fra i soggetti e
 * l'approvazione **aggiorna** invece di creare — e che la pratica dichiara la
 * stagione a cui si riferisce.
 *
 * **Il gate e il legame, non il ruolo.** Un genitore collegato solo come
 * tutore puo non avere nessuna appartenenza al club: ogni controllo di ruolo lo
 * respingerebbe su righe che sono legittimamente sue. Lo scope lo costruisce
 * `resolveLinkedFamilyScope` dall'atleta, e il club arriva dalla riga
 * dell'atleta — **mai** dal corpo della richiesta.
 *
 * **La stagione la decide il server.** Se la nominasse il client, una famiglia
 * potrebbe intestare il proprio rinnovo alla stagione che preferisce; qui e
 * quella attiva del club, e la segreteria la conferma approvando. Il riporto
 * stagionale resta gestionale e questa funzione non lo tocca.
 *
 * **I file passano dal filtro stretto**, come per il modulo pubblico: chi
 * compila da casa non e la segreteria, e la sessione non cambia da dove arriva
 * il file.
 */
export const submitRenewalForm = async (
  userId: string,
  input: SubmitRenewalInput,
): Promise<SubmissionReceipt> => {
  const scope = await resolveLinkedFamilyScope(userId, input.athleteId);

  const match = await findPublicFormBySlug(input.publicSlug);
  if (!match || match.organizationId !== scope.activeOrganizationId) {
    /*
      Modulo inesistente, non pubblicato, chiuso, oppure **di un altro club**:
      un solo esito. Distinguere «non esiste» da «esiste ma non e tuo» direbbe
      a chi prova slug quali ha indovinato, ed e la stessa regola che il motore
      dei moduli applica gia sulla pagina pubblica.
    */
    throw new FormSubmissionError("Modulo non disponibile", 404);
  }

  const athlete = await (prisma as any).athlete.findFirst({
    where: { id: asText(input.athleteId), organization_id: match.organizationId },
  });
  if (!athlete) {
    throw new FormSubmissionError("Modulo non disponibile", 404);
  }

  /*
    **Il tipo lo decide il modulo, non la porta da cui si entra.**

    Questa funzione e la strada con cui una famiglia invia un modulo pubblicato
    *per un proprio figlio*, e per una Wave l'unico modulo che ci passava era
    il rinnovo: da li il nome, e da li `kind: "renewal"` scritto fisso. Quando
    il fascicolo ha aperto la stessa strada a **tutti** i moduli pubblicati,
    quella costante ha iniziato a mentire: un questionario di gradimento
    arrivava in segreteria come pratica di rinnovo.

    Una compilazione che non e un'iscrizione non porta nemmeno una stagione:
    la stagione e cio che una pratica di iscrizione decide, e un questionario
    non decide niente.
  */
  const iscrizione = isEnrollmentForm(match.schema);
  const seasons = iscrizione
    ? await readClubSeasonState(match.organizationId)
    : null;

  return storeSubmission({
    match,
    input,
    source: "public",
    selections: [
      {
        subject: "athlete",
        recordId: asText(athlete.id),
        label:
          `${asText(athlete.first_name)} ${asText(athlete.last_name)}`.trim(),
      },
    ],
    submittedBy: asText(userId) || null,
    requireNarrowMimeTypes: true,
    kind: iscrizione ? "renewal" : "submission",
    seasonId: seasons?.activeSeasonId || null,
  });
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
  /*
    La chiave, non la matrice del ruolo **base**: `canAccessClubResource`
    guarda il ruolo base, quindi un ruolo personalizzato con la sola casella
    della lettura passerebbe lo stesso — e la lettura e proprio cio che questa
    guardia deve smettere di accettare. I moduli hanno due chiavi, e quella che
    dice «lavoro sulle pratiche» e la seconda.
  */
  if (!roleHasPermission(scope.activeRole, "forms.submissions.review")) {
    throw denied(
      "compilare un modulo a nome della societa e di chi gestisce le pratiche",
    );
  }

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
  /**
   * Le persone in prova che potrebbero essere questa (ADR-0193): stesso nome
   * e cognome, con la data di nascita a dire se coincide. Solo in revisione,
   * mai dal pubblico; nessuna scelta automatica.
   */
  trialCandidates: TrialMatchCandidate[];
};

export type TrialMatchCandidate = {
  id: string;
  name: string;
  birthDate: string;
  sameBirthDate: boolean;
  categoryLabel: string | null;
  trialsCount: number;
  lastTrialAt: string | null;
};

const findTrialCandidates = async (
  scope: FormsAccessScope,
  organizationId: string,
  probe: ReturnType<typeof buildDuplicateProbes>[number],
): Promise<TrialMatchCandidate[]> => {
  if (!probe.firstName || !probe.lastName) return [];
  if (!roleHasPermission(scope.activeRole, "trials.read")) return [];
  const normal = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
  try {
    const rows = await listTrialAthletes(
      {
        userId: scope.userId,
        activeOrganizationId: organizationId,
        activeRole: scope.activeRole ?? null,
        allowedOrganizationIds: scope.allowedOrganizationIds,
        accessScopes: scope.accessScopes,
      },
      { status: "in_trial", q: `${probe.firstName} ${probe.lastName}` },
    );
    return rows
      .filter(
        (row) => normal(row.firstName) === normal(probe.firstName) && normal(row.lastName) === normal(probe.lastName),
      )
      .map((row) => ({
        id: row.id,
        name: row.name,
        birthDate: row.birthDate,
        sameBirthDate: Boolean(probe.birthDate) && row.birthDate === probe.birthDate.slice(0, 10),
        categoryLabel: row.categoryLabel,
        trialsCount: row.trialsCount,
        lastTrialAt: row.lastTrialAt,
      }));
  } catch {
    return [];
  }
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

  /*
    **La proposta e la gemella della precompilazione, e le mancavano le
    stesse due guardie.** (B-H5, revisione finale della Wave 6)

    `buildCompileContext` toglie il clinico a chi non ha `clinical.read` e
    chiede `athleteWithinAccessScope` prima di precompilare un modulo con la
    scheda di un atleta. Questa funzione fa la stessa cosa — legge la scheda
    scelta e la confronta con le risposte — e non chiedeva niente: il
    `recordId` arriva dal corpo (`action: "preview"`, `subjects`), l'anteprima
    non scrive e non lascia audit, e il `changeSet` porta il **valore
    attuale** di ogni campo. Un operatore recintato sulla sede Nord, con una
    compilazione qualunque in mano, otteneva nome, codice fiscale, data di
    nascita e tutori del minore della sede Sud — e con un campo legato ad
    `athlete.allergies`, il suo dato sanitario.

    Il perimetro si chiede **prima** di leggere il confronto, e la risposta e
    la stessa di ogni altra porta sul perimetro. Il clinico si toglie dal
    record prima di costruire il `changeSet`: per chi non ha la chiave il
    valore attuale di un campo clinico non esiste, come nella precompilazione.
  */
  for (const selezione of selections) {
    if (selezione.subject !== "athlete") continue;
    const idAtleta = asText(selezione.recordId);
    if (!idAtleta) continue;

    const dentro = await athleteWithinAccessScope(
      row.organization_id,
      idAtleta,
      scope,
    );
    if (!dentro) {
      throw new Error(
        "Accesso negato: questo atleta e fuori dal perimetro di sede o categoria del ruolo attivo",
      );
    }
  }

  const { records: recordsInteri } = await loadSubjectRecords(
    row.organization_id,
    selections,
  );

  /*
    **Il ruolo viaggia con il taglio** (D-AUD-4).

    Queste due chiamate erano senza ruolo, come quella dell’export
    dell’interessato: restava il solo elenco dei **vietati**, e un campo
    clinico scritto sotto un nome inventato ci passava attraverso.

    Qui non era sfruttabile — cio che esce passa da `DYNAMIC_FIELDS`, che e
    un vocabolario chiuso — ma la sicurezza veniva da **un’altra** difesa, e
    sarebbe bastato aggiungere un campo dinamico per scoprire questa.

    Una difesa che regge per una ragione che non e la sua cade il giorno in
    cui quella ragione cambia, e nessuno collega le due cose.
  */
  const records = hasHealthPermission(scope.activeRole, "clinical.read")
    ? recordsInteri
    : (Object.fromEntries(
        Object.entries(recordsInteri).map(([soggetto, riga]) => [
          soggetto,
          riga && soggetto === "athlete"
            ? { ...riga, data: stripClinicalAthleteFields((riga as any).data, scope.activeRole) }
            : riga,
        ]),
      ) as typeof recordsInteri);

  const changeSet = buildChangeSet({
    schema: submission.schema,
    answers: submission.answers,
    selections,
    records,
  });

  const duplicates: DuplicateCandidate[] = [];
  const trialCandidates: TrialMatchCandidate[] = [];
  const athleteSelection = selections.find((selection) => selection.subject === "athlete");
  for (const probe of buildDuplicateProbes(changeSet)) {
    if (probe.subject !== "athlete") continue;
    duplicates.push(
      ...(await findAthleteDuplicates(row.organization_id, probe)),
    );
    /* Una scheda gia scelta non cerca prove: la persona c'e gia. */
    if (!asText(athleteSelection?.recordId)) {
      trialCandidates.push(...(await findTrialCandidates(scope, row.organization_id, probe)));
    }
  }

  /*
    La prova delle dichiarazioni — il testo mostrato e la sua impronta — la
    vede chi ha `forms.evidence.read` (ADR-0189 §7): agli altri resta la
    risposta (spuntato o no), che e cio che serve per decidere.
  */
  const declarations = roleHasPermission(scope.activeRole, "forms.evidence.read")
    ? submission.declarations
    : submission.declarations.map((d) => ({ ...d, text: "", textHash: "" }));

  return {
    submission: { ...submission, subjects: selections, declarations },
    changeSet,
    duplicates,
    trialCandidates,
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
 * Dove va l'atleta di una domanda approvata (ADR-0194 §15).
 *
 * Il modulo chiede una **squadra** — «Pulcini · S. Cosma», o «Under 17»
 * dove la categoria non ha sedi — e l'etichetta si risolve sull'indice delle
 * collocazioni del club: categoria e sede insieme, mai una coppia che il
 * club non ha configurato. Il campo «Sede» a parte (`athlete.siteId`) non
 * scrive piu niente: era il secondo selettore indipendente, e con due
 * «Pulcini» su due sedi produceva l'atleta di S. Cosma nella squadra di
 * Scauri. Un'etichetta che nomina piu squadre non ne nomina nessuna
 * (ADR-0155): chi approva lo legge e la assegna dalla scheda.
 */
const resolveEnrollmentPlacement = (
  values: Record<string, string>,
  options: ClubFormOptions,
) => {
  const answeredCategory = asText(values["athlete.categoryName"]);
  let { target, ambiguous } = answeredCategory
    ? options.targets.fromLabel(answeredCategory)
    : { target: null, ambiguous: false };
  /*
    Un modulo pubblicato prima delle squadre chiedeva il nome nudo e la
    sede a parte: se il nome nomina piu squadre, la sede risposta le
    distingue quando ne lascia **una** (revisione ostile A7). Due categorie
    omonime nella stessa sede restano ambigue.
  */
  const answeredSite = asText(values["athlete.siteId"]);
  if (ambiguous && answeredSite) {
    const siteIndex = buildSiteIndex(options.sites);
    const siteId = siteIndex.resolveSiteId(answeredSite);
    const candidate = options.targets.targets.filter(
      (t) => normalizeCategoryToken(t.categoryName) === normalizeCategoryToken(answeredCategory) && t.siteId === siteId,
    );
    if (siteId && candidate.length === 1) {
      target = candidate[0];
      ambiguous = false;
    }
  }

  /* Ripiego per un modulo pubblicato con i soli nomi (prima delle squadre): il nome che ne nomina una sola. */
  const risolta = !target && !ambiguous && answeredCategory
    ? resolveCategoryReference(answeredCategory, answeredCategory, options.categories)
    : null;
  const category = target
    ? { id: target.categoryId, name: target.categoryName }
    : risolta?.known
      ? options.categories.find((entry) => entry.id === risolta.id) || null
      : null;

  return {
    siteId: target && !target.implicit ? target.siteId : "",
    category,
    /* Il nome che nomina piu squadre: chi approva lo deve sapere, non scoprirlo dopo (revisione ostile A15). */
    categoriaAmbigua: ambiguous || risolta?.ambiguous ? answeredCategory : "",
  };
};

/**
 * Allinea l'appartenenza categoria-sede dopo un'approvazione, **dal writer
 * del dominio** (ADR-0194 §3, revisione ostile A6/B11): il comando canonico
 * con la squadra scelta, il ruolo che l'atleta gia ha su quella categoria
 * (primaria resta primaria), o primaria se non ne ha nessuna, secondaria se
 * ne ha altre. Le altre appartenenze restano: un modulo non toglie una
 * squadra. Proiezione e audit prima/dopo li scrive il writer; la colonna
 * `athletes.category_id` la dice la primaria, non la risposta del modulo.
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
  if (!input.category) return [];

  const existing = await (prisma as any).athleteCategoryMembership.findMany({
    where: { organization_id: input.organizationId, athlete_id: input.athleteId },
    select: { category_id: true, is_primary: true },
  });
  const match = existing.find((row: any) => asText(row.category_id) === input.category!.id);
  const role: "primary" | "secondary" = match ? (match.is_primary ? "primary" : "secondary") : existing.length === 0 ? "primary" : "secondary";

  const esito = await applyMembershipChange(
    scope as never,
    {
      athleteIds: [input.athleteId],
      command: {
        kind: "assign",
        categoryId: input.category.id,
        siteId: input.siteId || undefined,
        role,
        previousPrimaryPolicy: "remove",
        otherSecondariesPolicy: "keep",
      },
    },
    { userId: scope.userId || null },
  );
  const rapporto = esito.athletes[0];
  if (!rapporto) return [];
  if (rapporto.status === "failed") {
    throw new Error(rapporto.error || "Appartenenza non scritta");
  }
  if (rapporto.status === "blocked") {
    return [`Categoria non assegnata: ${rapporto.warnings.map((w) => MEMBERSHIP_WARNING_LABELS[w] || w).join("; ")}`];
  }
  if (rapporto.status === "unchanged") return [];
  return [match ? `Sede dell'iscrizione aggiornata: ${input.category.name}` : `Atleta iscritto alla categoria ${input.category.name}${role === "secondary" ? " (secondaria)" : ""}`];
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
  /*
    ADR-0189 §4: le transizioni della pratica. `approve` scrive cio che la
    proposta mostrava (e crea o collega la scheda quando c'e un atleta);
    `request_changes` la rimanda alla famiglia con i campi da correggere;
    `archive` la chiude senza toccare l'anagrafica.
  */
  decision: "approve" | "reject" | "request_changes" | "archive";
  note?: string;
  /** I campi che la famiglia deve correggere (`request_changes`). */
  fieldIds?: unknown;
  /**
   * La persona in prova che questa pratica riconosce (ADR-0193): la scheda
   * nasce dalla conversione canonica di ADR-0188, non dal registro generico.
   */
  trialAthleteId?: string | null;
  /** La segreteria puo ricollegare un soggetto a una scheda esistente. */
  subjects?: unknown;
  /**
   * I documenti che mancano all'iscrizione, chiesti **approvando**.
   *
   * E il punto in cui iscrizione e workflow documenti si saldano. Prima
   * l'unica risposta a «manca il certificato medico» era respingere: la
   * famiglia ricompilava tutto da capo, e la segreteria riesaminava una
   * seconda pratica identica alla prima. Adesso la domanda viene accolta e il
   * documento diventa una **richiesta documentale** — che ha una scadenza, un
   * sollecito e uno stato — invece di un motivo di rifiuto.
   */
  documentRequests?: unknown;
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

  /*
    **Decidere non e leggere**, e finora lo era.

    Approvare crea atleti, appartenenze, consensi e documenti; respingere
    chiude l'iscrizione di una famiglia con il proprio nome sulla decisione. Il
    ramo di rifiuto scrive per di piu con una `prisma.formSubmission.update`
    diretta, senza passare da `resources.ts` e senza un secondo vaglio: era
    governato dal solo permesso di **lettura**, e quello — vedi sopra — non
    filtrava nessuno.
  */
  if (!roleHasPermission(scope.activeRole, "forms.submissions.review")) {
    throw denied(
      "approvare o respingere un'iscrizione e di chi gestisce le pratiche",
    );
  }

  const statoCorrente = normalizeStatus(row.status);
  if (decision.decision === "archive") {
    /*
      Archiviare chiude senza scrivere niente: si puo da ogni stato che non
      sia gia chiuso da una scheda creata, ed e l'unica transizione che non
      passa dalla presa (non scrive in anagrafica).
    */
    if (statoCorrente === "converted" || statoCorrente === "archived") {
      throw new Error("Questa pratica non si puo archiviare.");
    }
    /*
      Condizionata sullo stato **in archivio** e sulla presa (revisione ostile
      A-F4): un dialogo aperto da prima non archivia una pratica che nel
      frattempo e diventata «atleta creato», e non scavalca un'approvazione in
      corso.
    */
    const adesso = new Date();
    const archiviazione = await (prisma as any).formSubmission.updateMany({
      where: {
        id: row.id,
        status: { in: ["pending", "changes_requested", "rejected", "approved"] },
        OR: [{ reviewed_at: null }, { status: { in: ["rejected", "approved"] } }, { reviewed_at: { lt: new Date(adesso.getTime() - LEASE_ESAME_MS) } }],
      },
      data: {
        status: "archived",
        archived_at: adesso,
        reviewed_by: scope.userId || null,
        reviewed_at: adesso,
        review_note: asText(decision.note).slice(0, 2000) || row.review_note || null,
      },
    });
    if (archiviazione.count !== 1) {
      throw new Error("La pratica e cambiata nel frattempo (in esame o gia decisa): ricarica.");
    }
    const archiviata = await (prisma as any).formSubmission.findUnique({ where: { id: row.id }, include: SUBMISSION_INCLUDE });
    await recordAuditEvent({
      action: AUDIT_ACTIONS.formSubmissionArchived,
      actorUserId: scope.userId || null,
      actorRole: scope.activeRole || null,
      organizationId: row.organization_id,
      resource: "form_submissions",
      resourceId: row.id,
      metadata: { da: statoCorrente },
    });
    return { submission: serializeSubmission(archiviata), applied: [], issues: [], generatedDocumentId: null };
  }

  if (statoCorrente !== "pending") {
    throw new Error(
      statoCorrente === "changes_requested"
        ? "La pratica e in attesa dell'integrazione della famiglia."
        : "Questa compilazione e gia stata esaminata.",
    );
  }

  if (decision.decision === "request_changes" && !roleHasPermission(scope.activeRole, "forms.submissions.request_changes")) {
    throw denied("chiedere un'integrazione e di chi gestisce le pratiche");
  }
  if (decision.decision === "approve" && !roleHasPermission(scope.activeRole, "forms.submissions.convert")) {
    /*
      Approvare puo creare una scheda: chi non ha la capacita di crearla puo
      comunque approvare un modulo **senza** atleta (una raccolta di consensi),
      ma non una pratica di iscrizione. Lo si decide dopo aver letto la
      proposta, in `eseguiDecisione`; qui si lascia passare.
    */
  }

  const presa = await prendiInEsame(row.id, scope);
  try {
    return await eseguiDecisione(scope, row, decision);
  } catch (errore) {
    await rilasciaEsame(row.id, presa);
    throw errore;
  }
};

/**
 * Quanto dura la presa in esame di una compilazione prima che si consideri
 * abbandonata. Un'approvazione dura secondi; dieci minuti coprono anche un
 * processo caduto a meta, senza lasciare una pratica bloccata per sempre.
 */
const LEASE_ESAME_MS = 10 * 60_000;

/**
 * **Una compilazione si prende in esame prima di scriverla, e la si prende in
 * una scrittura sola.** (B-H4, revisione finale della Wave 6)
 *
 * **Il difetto che chiude.** Il controllo «e ancora `pending`?» stava in
 * testa e il passaggio ad `approved` in coda, con in mezzo la creazione della
 * scheda, delle appartenenze, dei consensi e delle richieste documentali.
 * Due approvazioni **simultanee** — un doppio clic, o due persone della
 * segreteria sulla stessa pratica — leggevano entrambe `pending` e scrivevano
 * entrambe: misurato `['OK','OK']`, **due schede** per lo stesso minore, con
 * appartenenze, consensi e richieste duplicati.
 *
 * Non si puo chiudere spostando `approved` in testa: se il processo cade a
 * meta la pratica deve restare `pending`, quindi riapprovabile — e il motivo
 * per cui consenso e documento precedono il cambio di stato. Serve quindi
 * una **presa**: `reviewed_at` valorizzato **su una riga ancora `pending`**
 * dice «qualcuno la sta scrivendo adesso». Si prende con un `updateMany`
 * condizionato, cioe lo stesso schema di `document-requests.ts`: Postgres
 * rivaluta il `WHERE` sulla riga bloccata, e di due richieste simultanee una
 * sola trova la riga libera. L'altra riceve un errore, non un duplicato.
 *
 * La presa si **rilascia** se la decisione fallisce, cosi la pratica torna
 * riapprovabile subito; e **scade** da sola dopo `LEASE_ESAME_MS`, cosi un
 * processo caduto senza `catch` non la blocca per sempre. Su una riga
 * `approved` o `rejected` `reviewed_at` conserva il significato di sempre:
 * quando e stata decisa.
 */
const prendiInEsame = async (id: string, scope: FormsAccessScope) => {
  const adesso = new Date();
  const presa = await (prisma as any).formSubmission.updateMany({
    where: {
      id,
      status: "pending",
      OR: [
        { reviewed_at: null },
        { reviewed_at: { lt: new Date(adesso.getTime() - LEASE_ESAME_MS) } },
      ],
    },
    data: { reviewed_at: adesso, reviewed_by: scope.userId || null },
  });

  if (presa.count !== 1) {
    throw new Error(
      "Questa compilazione e gia in esame da un'altra richiesta: attendi che finisca e ricarica.",
    );
  }

  return adesso;
};

/** Rilascia la presa solo se e ancora la propria: una presa altrui non si tocca. */
const rilasciaEsame = (id: string, presa: Date) =>
  (prisma as any).formSubmission
    .updateMany({
      where: { id, status: "pending", reviewed_at: presa },
      data: { reviewed_at: null, reviewed_by: null },
    })
    .catch(() => undefined);

/**
 * La scheda nata (o convertita) si annota sulla pratica **subito**, sotto la
 * presa in esame: se cio che segue fallisce e la presa si rilascia, il
 * secondo tentativo trova `athlete_id` e riparte da li.
 */
const annotaSchedaSullaPratica = (id: string, athleteId: string, trialAthleteId: string) =>
  (prisma as any).formSubmission.updateMany({
    where: { id, status: "pending" },
    data: { athlete_id: athleteId || null, ...(trialAthleteId ? { trial_athlete_id: trialAthleteId } : {}) },
  });

const eseguiDecisione = async (
  scope: FormsAccessScope,
  row: SubmissionRow,
  decision: ReviewDecision,
): Promise<ReviewOutcome> => {
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

  if (decision.decision === "request_changes") {
    /*
      **Integrazione richiesta** (ADR-0189 §4). I campi devono esistere nella
      versione compilata e raccogliere una risposta; senza campi ne nota non
      c'e niente da chiedere. La presa in esame si rilascia con il cambio di
      stato: `reviewed_at` torna nullo, perche la pratica non e decisa.
    */
    const schema = normalizeFormSchema(row.template_version?.schema_json);
    const richiesti = Array.from(
      new Set(
        (Array.isArray(decision.fieldIds) ? decision.fieldIds : [])
          .map((id) => asText(id))
          .filter((id) => schema.fields.some((field) => field.id === id && fieldCollectsAnswer(field.type))),
      ),
    );
    if (!richiesti.length && !note) {
      throw new Error("Indica almeno un campo da correggere o una nota per la famiglia.");
    }
    const changesRequested: FormChangesRequested = {
      fieldIds: richiesti,
      note,
      requestedAt: new Date().toISOString(),
      requestedBy: scope.userId || null,
    };
    const updated = await (prisma as any).formSubmission.update({
      where: { id: row.id },
      data: {
        status: "changes_requested",
        changes_requested: changesRequested,
        reviewed_by: null,
        reviewed_at: null,
        review_note: note || null,
      },
      include: SUBMISSION_INCLUDE,
    });
    await recordAuditEvent({
      action: AUDIT_ACTIONS.formSubmissionChangesRequested,
      actorUserId: scope.userId || null,
      actorRole: scope.activeRole || null,
      organizationId: row.organization_id,
      resource: "form_submissions",
      resourceId: row.id,
      metadata: { campi: richiesti, revisione: Number(row.revision) || 1 },
    });
    await notificaIntegrazioneRichiesta(updated, changesRequested).catch(() => undefined);
    return {
      submission: serializeSubmission(updated),
      applied: [`Integrazione richiesta alla famiglia: ${richiesti.length} ${richiesti.length === 1 ? "campo" : "campi"}`],
      issues: updated.respondent_email ? [] : ["La pratica non ha un'email: avvisa la famiglia con la ricevuta."],
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

  /*
    **Un tentativo fallito a meta non crea una seconda scheda** (revisione
    ostile A-F2). Se una approvazione precedente ha creato la scheda e poi e
    caduta (perimetro, tutore, documento), la pratica porta gia `athlete_id`:
    si riparte da quella scheda, non da una nuova.
  */
  if (!athleteId && asText(row.athlete_id)) {
    athleteId = asText(row.athlete_id);
    athleteRecord = await (prisma as any).athlete.findFirst({
      where: { id: athleteId, organization_id: organizationId },
    });
    if (!athleteRecord) athleteId = "";
  }
  if (athleteId && asText(decision.trialAthleteId)) {
    throw new Error(
      "La pratica nomina gia una scheda: non si puo anche convertire una persona in prova. Scegli una delle due strade.",
    );
  }

  const athleteChange = review.changeSet.subjects.find(
    (subject) => subject.subject === "athlete",
  );
  /* La persona in prova riconosciuta, se la pratica ne ha usata una (ADR-0193). */
  let trialUsata = "";
  const schedaEsistenteAllInizio = Boolean(athleteId);

  /*
    Sedi e categorie si leggono una volta sola, e dal club del modulo. Il
    corpo della richiesta non le nomina e non potrebbe: la segreteria approva
    una compilazione, non indica dove va messo l'atleta.
  */
  const clubOptions = await loadClubFormOptions(organizationId);
  let placement: ReturnType<typeof resolveEnrollmentPlacement> = {
    siteId: "",
    category: null,
    categoriaAmbigua: "",
  };

  /*
    Scrivere in anagrafica — la scheda, un tutore, un allenatore — e la
    capacita `forms.submissions.convert`, qualunque soggetto sia: chi ha
    solo `review` approva un modulo che non scrive nessuno.
  */
  if (review.changeSet.subjects.length && !roleHasPermission(scope.activeRole, "forms.submissions.convert")) {
    throw denied("scrivere in anagrafica da una pratica e di chi gestisce le pratiche");
  }

  if (athleteChange) {
    const values = applyValues(athleteChange);
    const patch = buildAthletePatch(values, athleteRecord?.data || {});

    placement = resolveEnrollmentPlacement(values, clubOptions);

    /*
      La sede non si scrive piu in `data.siteId` (ADR-0194 §25): e quella
      dell'appartenenza, derivata dalla squadra, e la scrive
      `syncEnrollmentMembership` sulla riga. Il nome che il catalogo dei
      campi metteva qui — `athlete.siteId` non e piu scrivibile — si toglie.
    */
    delete patch.data.siteId;

    /*
      La colonna `category_id` la scrive il writer delle appartenenze con la
      primaria (ADR-0194): dalla risposta del modulo non si scrive una
      categoria che le righe non hanno (revisione ostile A6).
    */
    delete patch.columns.category_id;
    delete patch.columns.category_name;

    if (!roleHasPermission(scope.activeRole, "forms.submissions.convert")) {
      throw denied("creare o aggiornare una scheda atleta da una pratica e di chi gestisce le pratiche");
    }

    if (!athleteId && asText(decision.trialAthleteId)) {
      /*
        **La scheda nasce dalla conversione della persona in prova**
        (ADR-0193 §2): stessa autorita di ADR-0188, stessa transazione,
        stessa idempotenza. Poi la pratica la completa con cio che ha
        raccolto, come farebbe per una scheda esistente.
      */
      const esito = await convertTrialAthlete(
        {
          userId: scope.userId,
          activeOrganizationId: organizationId,
          activeRole: scope.activeRole ?? null,
          allowedOrganizationIds: scope.allowedOrganizationIds,
          accessScopes: scope.accessScopes,
        },
        asText(decision.trialAthleteId),
        {
          create: {
            status: "active",
            categoryId: placement.category?.id || null,
            siteId: placement.siteId || null,
          },
        },
        { userId: scope.userId },
      );
      athleteId = esito.athleteId;
      trialUsata = asText(decision.trialAthleteId);
      await annotaSchedaSullaPratica(row.id, athleteId, trialUsata);
      applied.push(
        `Persona in prova convertita in atleta: ${athleteChange.recordLabel} (${esito.trial.trialsCount} ${esito.trial.trialsCount === 1 ? "prova" : "prove"} prima dell'iscrizione)`,
      );
      const { first_name: _fn, last_name: _ln, birth_date: _bd, ...restoColonne } = patch.columns as Record<string, unknown>;
      if (Object.keys(values).length) {
        /*
          La scheda nata dalla conversione porta gia dei dati (la proiezione
          delle appartenenze, i recapiti della prova, `trialOriginId`): la
          pratica li **completa**, non li sostituisce.
        */
        const nata = await (prisma as any).athlete.findUnique({ where: { id: athleteId }, select: { data: true } });
        const datiNati = nata?.data && typeof nata.data === "object" ? (nata.data as Record<string, unknown>) : {};
        const updated = await updateResource(
          "athletes",
          athleteId,
          { ...restoColonne, data: { ...datiNati, ...patch.data } },
          scope,
        );
        athleteRecord = updated as any;
      }
    } else if (!athleteId) {
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
      await annotaSchedaSullaPratica(row.id, athleteId, "");
      applied.push(`Atleta creato: ${athleteChange.recordLabel}`);
      if (placement.categoriaAmbigua) {
        applied.push(
          `Categoria non assegnata: «${placement.categoriaAmbigua}» nomina piu squadre del club, indicarla dalla scheda`,
        );
      }
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
      if (placement.categoriaAmbigua) {
        applied.push(
          `Categoria non assegnata: «${placement.categoriaAmbigua}» nomina piu squadre del club, indicarla dalla scheda`,
        );
      }
    }
  }

  if (athleteId && placement.category) {
    applied.push(
      ...(await syncEnrollmentMembership(scope, {
        organizationId,
        athleteId,
        siteId: placement.siteId,
        category: placement.category,
      })),
    );
  }
  if (athleteId && athleteChange && asText(applyValues(athleteChange)["athlete.siteId"])) {
    /* La risposta «Sede» non colloca piu nessuno: chi approva lo legge (revisione ostile B14). */
    applied.push("Risposta «Sede» non usata: la sede e quella della squadra scelta");
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

    const patch = buildGuardianPatch(
      applyValues(guardianChange),
      records.guardian || null,
    );

    /*
      **Un indirizzo dichiarato da uno sconosciuto non e una credenziale.**

      ADR-0127 fa valere l'indirizzo di contatto di un tutore come legame: la
      segreteria lo scrive, la famiglia si registra con quello, ed entra senza
      riscattare un codice. Quella decisione poggia su un presupposto che qui
      non regge — che l'indirizzo lo abbia **scritto il club**.

      Un modulo pubblico lo compila chiunque, senza sessione. Bastava conoscere
      lo slug e il nome di un minore tesserato: si dichiarava il proprio
      indirizzo nei campi `guardian.*`, la segreteria approvava, e da quel
      momento l'area famiglia di quel bambino era aperta a chi si registrava
      con quell'indirizzo. Allergie, farmaci, i byte del certificato medico, le
      ricevute, e la revoca dei consensi dati dall'altro genitore.

      Il criterio non e «chi ha compilato» ne «da quale porta»: e **chi ha
      scritto quell'indirizzo**, e l'unica compilazione di cui il presupposto
      di ADR-0127 sia vero e quella interna. Un genitore autenticato ha
      dimostrato il **proprio** legame, non quello di un terzo che dichiara.
    */
    const compilataDalClub = asText(row.source) === "internal";

    /*
      **La riga che questa compilazione stava modificando.**

      Il `recordId` di un tutore e la sua **posizione** nell'elenco, e lo dice
      gia il commento di `loadSubjectRecords`. La posizione la conserva la
      proiezione — che il modulo proprietario riscrive ordinata — quindi
      l'oggetto in quel posto porta l'identificativo della **riga**, e da li in
      poi non si ragiona piu per posizione.
    */
    const selection = review.submission.subjects.find(
      (entry) => entry.subject === "guardian",
    );
    /* Come sopra: una voce esclusa non e la riga che si sta sostituendo. */
    const rigaScelta = documentGuardianAt(
      athleteRecord?.data,
      Number(selection?.recordId),
    );

    /*
      **Cio che sedici stesure non erano riuscite a difendere, qui non c'e piu
      da difendere** (PP-02 / WP-C).

      Sparisce il registro `contactOnlyIdentities`, che era il surrogato di una
      chiave: il segno viveva sulla riga, la riga non aveva un id stabile, e
      cinque stesure del riporto in `resources.ts` non riuscivano a farlo
      sopravvivere a un salvataggio ordinario. Sparisce con lui la regola
      «non avvelenare un indirizzo gia in uso», perche una `upsert` su
      un'identita che esiste **aggiorna** invece di creare, e il segno si mette
      solo su cio che nasce.

      E sparisce `PP02-D33`: l'elenco dei tutori non si legge, non si modifica
      in memoria e non si rimanda. Cinque approvazioni concorrenti sullo stesso
      atleta scrivono cinque righe — o la stessa riga cinque volte, se nominano
      la stessa persona. La corsa non si perde perche non c'e piu uno snapshot
      da rimandare.
    */
    /* Le righe prima della scrittura: servono a dire se ne e nata una. */
    const righeTutore = (await prisma.athleteGuardian.findMany({
      where: { athlete_id: athleteId },
      select: { id: true },
    })) as Array<{ id: string }>;

    const scritta = await upsertGuardianFromFormApproval(prisma, {
      organizationId,
      athleteId,
      row: {
        /*
          **Vince l'indirizzo dichiarato, non quello della riga scelta.**

          `patch` parte dalla riga **selezionata**, e la sua proiezione porta
          `linkedUserEmail` valorizzato per ogni riga viva che non sia di solo
          recapito. Leggerlo per primo voleva dire che l'indirizzo scritto nel
          modulo non vincesse **mai**: l'`upsert` cadeva sulla chiave della
          persona gia presente e le riscriveva nome e cognome.

          Misurato da una revisione indipendente, dalla rotta vera, con una
          compilazione **pubblica** e un ruolo che porta solo le chiavi dei
          moduli: la riga della madre — identita, indirizzo, utenza — si
          ritrovava il nome di un estraneo, e da li i segnaposto
          `{{parent.N.*}}`, il destinatario fiscale di una ricevuta e i tre
          canali di notifica nominavano lui. L'audit diceva «Genitore
          aggiornato», vero alla lettera e falso per chi lo legge.

          Il corollario e che `replacesGuardianRowId` — documentato per «quando
          la modifica ne cambia l'identita, cioe l'indirizzo» — non poteva mai
          entrare in gioco, perche l'identita non cambiava mai.

          L'indirizzo del modulo viene percio per primo. Gli altri due restano
          come ripiego per le compilazioni che non ne dichiarano uno: li la
          riga scelta e l'unica cosa che dica di chi si parla.
        */
        email:
          asText(patch.email) ||
          asText(patch.linkedUserEmail) ||
          asText(patch.linked_user_email),
        firstName: asText(patch.name),
        lastName: asText(patch.surname),
        phone: asText(patch.phone),
        relationship: asText(patch.relationship),
        /*
          Il codice fiscale di un tutore arriva dal modulo di iscrizione ed e
          cio che finisce sulla ricevuta che una famiglia porta in detrazione:
          si conserva, insieme a tutto cio che la tabella non ha una colonna
          per tenere.
        */
        extra: patch as Record<string, unknown>,
      },
      contactOnly: !compilataDalClub,
      /*
        Approvare una pratica non e un atto di concessione piu di quanto lo sia
        salvare un'anagrafica: chi la compie chiede la stessa chiave. Un ruolo
        ristretto ai soli moduli si scriveva altrimenti addosso il fascicolo
        sanitario di un minore qualunque, con «Genitore aggiunto» in audit.
      */
      canGrantAccess:
        roleHasPermission(scope.activeRole, "accounts.athlete.manage") &&
        hasHealthPermission(scope.activeRole, "clinical.read"),
      replacesGuardianRowId: rigaScelta ? asText(rigaScelta.id) : null,
    });

    /*
      **La traccia dice cio che e successo, non cio che si voleva fare.**

      Quando `rigaScelta.id !== scritta.id` non e stato «aggiunto» un genitore:
      ne e stato scritto uno **al posto di un altro**, e quello di prima e
      stato cancellato. Il caso in cui la traccia diceva la cosa piu lontana
      dal vero era esattamente quello in cui una riga viva spariva, e chi
      rileggeva il registro non aveva modo di saperlo.
    */
    /*
      **«Aggiunto» solo se e nata una riga.**

      L'`upsert` cade sulla chiave dell'identita dichiarata: quando quella
      identita esiste gia, non nasce niente — la riga viene aggiornata. Senza
      confrontarlo con cio che c'era prima, la traccia diceva «Genitore
      aggiunto» proprio nel caso in cui nessuna riga era stata aggiunta, ed e il
      caso in cui una compilazione pubblica cade su un tutore gia presente:
      quello in cui leggere il registro serve di piu.
    */
    const erano = new Set(righeTutore.map((riga) => String(riga.id)));
    const nata = Boolean(scritta && !erano.has(String(scritta.id)));

    applied.push(
      rigaScelta && scritta && asText(rigaScelta.id) === scritta.id
        ? `Genitore aggiornato: ${guardianChange.recordLabel}`
        : rigaScelta
          ? `Genitore sostituito: ${guardianChange.recordLabel}`
          : nata
            ? `Genitore aggiunto: ${guardianChange.recordLabel}`
            : `Genitore aggiornato: ${guardianChange.recordLabel}`,
    );

    /*
      La scheda si rilegge perche la proiezione dentro `data` e appena cambiata,
      e cio che segue — consensi, documenti, allegati — la usa.
    */
    athleteRecord = (await prisma.athlete.findUnique({
      where: { id: athleteId },
    })) as any;
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

  /*
    Le richieste documentali vengono **prima** del passaggio a `approved`, per
    la stessa ragione di consenso e documento: un'interruzione qui in mezzo
    lascia la compilazione `pending`, quindi riapprovabile, e la riapprovazione
    non duplica perche `requestMissingDocuments` non riapre una richiesta che
    e gia aperta sullo stesso documento. Nell'ordine opposto un'interruzione
    lascerebbe una domanda approvata e un certificato che nessuno ha chiesto —
    cioe esattamente il vuoto che questa lane esiste per chiudere.

    Un errore qui **fa fallire l'approvazione**, e non finisce fra gli
    `issues`: chi non ha il permesso di chiedere un documento non deve poterlo
    chiedere di sponda, e una segreteria che crede di aver chiesto il
    certificato e non l'ha chiesto e peggio di un'approvazione da ripetere.
  */
  extras.applied.push(
    ...(await requestMissingDocuments(scope, {
      organizationId,
      athleteId,
      seasonId: asText(row.season_id),
      documents: decision.documentRequests,
    })),
  );

  /*
    `converted` quando da questa pratica e nata una scheda o ne e stata
    collegata una (ADR-0189 §1); `approved` quando ha scritto consensi e
    documenti su una scheda che gia c'era o su nessuna.
  */
  /*
    `converted` = da questa decisione e nata una scheda, o ne e stata collegata
    una che la pratica **non nominava** (ADR-0189 §4, ADR-0193 §2): il
    collegamento deciso dal club conta quanto la creazione. Una pratica gia
    intestata dall'inizio (la famiglia dall'area, il rinnovo) resta `approved`.
  */
  const nominataDallaRiga = asText(
    normalizeSelections(row.subjects).find((selection) => selection.subject === "athlete")?.recordId,
  );
  const schedaNataOCollegata =
    Boolean(athleteId) && (!schedaEsistenteAllInizio || Boolean(trialUsata) || (nominataDallaRiga !== athleteId && asText(row.athlete_id) !== athleteId));
  const statoFinale = schedaNataOCollegata ? "converted" : "approved";
  const updated = await (prisma as any).formSubmission.update({
    where: { id: row.id },
    data: {
      status: statoFinale,
      subjects: nextSubjects,
      athlete_id: athleteId || null,
      trial_athlete_id: trialUsata || null,
      reviewed_by: scope.userId || null,
      reviewed_at: new Date(),
      review_note: note || null,
    },
    include: SUBMISSION_INCLUDE,
  });
  if (statoFinale === "converted") {
    await recordAuditEvent({
      action: AUDIT_ACTIONS.formSubmissionConverted,
      actorUserId: scope.userId || null,
      actorRole: scope.activeRole || null,
      organizationId: row.organization_id,
      resource: "form_submissions",
      resourceId: row.id,
      metadata: { athleteId, trialAthleteId: trialUsata || null, schedaCreata: !schedaEsistenteAllInizio },
    });
  }

  return {
    submission: serializeSubmission(updated),
    applied: [...applied, ...extras.applied],
    issues: extras.issues,
    generatedDocumentId: extras.generatedDocumentId,
  };
};

/**
 * La famiglia viene avvisata dell'integrazione richiesta, quando ha lasciato
 * un'email: il testo e il canale sono di `src/lib/server/email/` (ADR-0191 §1).
 */
const notificaIntegrazioneRichiesta = async (
  row: SubmissionRow & { respondent_email: string | null },
  richiesta: FormChangesRequested,
) => {
  if (!row.respondent_email) return;
  const schema = normalizeFormSchema(row.template_version?.schema_json);
  await sendEnrollmentChangesRequestedEmail({
    to: row.respondent_email,
    templateTitle: row.template?.title || schema.title,
    fields: richiesta.fieldIds
      .map((id) => schema.fields.find((field) => field.id === id)?.label)
      .filter((label): label is string => Boolean(label)),
    note: richiesta.note,
  });
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

  /*
    **Un modulo puo precompilare un campo clinico, e li il permesso non
    arrivava.**

    Il vocabolario dei campi dinamici dichiara `athlete.allergies`, che punta
    a `athletes.data.allergies` — uno dei campi che `clinical.read` protegge.
    L unico cancello di questa rotta e `forms.read`: un ruolo di club a cui il
    club aveva tolto il permesso sanitario apriva un modulo con quel campo e se
    lo trovava gia compilato.

    E la stessa forma dei segnaposto documentali, chiusa una tornata fa: il
    documento — o il modulo — e la porta di servizio dell anagrafica. Si toglie
    il clinico dal **record** prima di precompilare, cosi la regola resta una e
    sta nel modulo che la possiede.
  */
  const recordsPerLaPrecompilazione = hasHealthPermission(
    scope.activeRole,
    "clinical.read",
  )
    ? records
    : Object.fromEntries(
        Object.entries(records).map(([soggetto, riga]) => [
          soggetto,
          riga
            ? { ...riga, data: stripClinicalAthleteFields((riga as any).data, scope.activeRole) }
            : riga,
        ]),
      );

  /*
    **E il perimetro di sede e categoria.**

    Il taglio clinico c'e gia — un ruolo senza `clinical.read` non riceve le
    allergie — ma il perimetro no: un operatore recintato su una sede apriva
    un modulo sul minore di un'altra e se lo trovava precompilato con nome,
    codice fiscale e tutori.

    E la stessa «porta di servizio dell'anagrafica» dei segnaposto
    documentali, che ha gia la sua guardia: qui mancava.
  */
  for (const selezione of selections) {
    if (selezione.subject !== "athlete") continue;
    const idAtleta = asText(selezione.recordId);
    if (!idAtleta) continue;

    const dentro = await athleteWithinAccessScope(
      organizationId,
      idAtleta,
      scope,
    );
    if (!dentro) {
      throw new Error(
        "Accesso negato: questo atleta e fuori dal perimetro di sede o categoria del ruolo attivo",
      );
    }
  }

  const answers = buildPrefilledAnswers(
    compilable.schema,
    recordsPerLaPrecompilazione as typeof records,
  );

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
