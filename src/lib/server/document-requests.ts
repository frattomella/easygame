import { prisma } from "./prisma";
import {
  assertActiveClub,
  resolveActiveClubId,
} from "@/lib/auth/active-club-boundary";
import { AUDIT_ACTIONS, recordAuditEvent } from "./audit";
import { createAttachment, getAttachmentMetadata } from "./attachments";
import { createClubNotifications } from "./club-notifications";
import { sendNotificationEmails } from "./email/email-service";
import { canParentAccessAthlete } from "./parent-dashboard";
import { isManagementAccessRole } from "@/lib/access-roles";
import { buildAttachmentUrl } from "@/lib/attachments";
import { roleHasPermission } from "@/lib/permissions/catalog";
import {
  canDecideDocumentSubmission,
  canTransitionDocumentRequest,
  deriveDocumentRequestState,
  explainDocumentDecisionDenial,
  explainDocumentDecisionNoteDenial,
  explainDocumentReminderDenial,
  explainDocumentRequestTransitionDenial,
  isDocumentSubjectKind,
  isDocumentSubmissionSource,
  isMedicalCertificateDocumentKind,
  normalizeDocumentKind,
  validateDocumentRequestDraft,
  type DocumentRequestState,
  type DocumentSubjectKind,
  type DocumentSubmissionSource,
} from "@/lib/documents/request-model";

/**
 * Il servizio del **fascicolo unico**: l'unico punto in cui EasyGame scrive una
 * richiesta di documento, un deposito o la sua decisione (Wave 5, lane 5D,
 * `AU-5` / `D-H`).
 *
 * ---
 *
 * ## Il difetto che chiude, e perche non era il workflow
 *
 * Il ciclo esisteva gia e funzionava. Quello che non esisteva era un posto in
 * cui vivesse: i byte stavano in `Asset` come base64 — una tabella **senza
 * `organization_id`**, dove il confine multi-tenant era il prefisso di una
 * stringa di percorso — e il fatto stava in `athletes.data.sharedDocuments`,
 * un array JSON scritto con `prisma.athlete.update` diretto che aggirava
 * `resources.ts`. Accettare o rifiutare il documento di un minore non lasciava
 * **nessuna** traccia, e nessuna delle due rotte aveva un test.
 *
 * ## Le quattro regole, in ordine, per ogni funzione pubblica
 *
 * 1. **il permesso**, dal catalogo (`src/lib/permissions/catalog.ts`), mai
 *    ricavato da un elenco di ruoli scritto qui;
 * 2. **il confine, riga per riga**, con `assertActiveClub`. Mai il confronto
 *    con `allowedOrganizationIds`: e la forma che ha fatto leggere l'IBAN di
 *    un'altra societa a un genitore (ADR-0094);
 * 3. per **genitore e atleta il gate e il legame**, non il ruolo. I due
 *    permessi non sono lo stesso permesso: `roleHasPermission` risponde `false`
 *    per loro, ed e il verso giusto in cui sbagliare;
 * 4. **l'audit** su richiesta, deposito e decisione, con il motivo nel
 *    metadato.
 *
 * ## Cio che non si scrive
 *
 * `document_requests.status` **non porta lo stato del documento**. Porta
 * soltanto se la richiesta e in piedi: `open`, oppure `cancelled` quando
 * qualcuno la ritira. `fulfilled` non lo scrive nessuna riga di questo file —
 * lo **ricava** `deriveDocumentRequestState` dall'ultimo deposito, come per
 * `ConsentRecord`, per lo stato di una rata e per le scadenze del lavoro
 * sportivo (ADR-0058).
 *
 * I byte non li scrive nemmeno: passano da Attachment Core (ADR-0034), che
 * resta l'unico archivio. Qui si scrive il **collegamento**.
 */

export type DocumentDossierScope = {
  userId: string;
  activeOrganizationId: string | null;
  /** Il ruolo con cui si sta operando: da `resolveOrganizationScopeForUser`. */
  activeRole?: string | null;
  allowedOrganizationIds: string[];
};

const denied = (message: string) => new Error(`Accesso negato: ${message}`);

const asText = (value: unknown) => String(value ?? "").trim();

const toIso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : asText(value) || null;

/* --------------------------------------------------------------- permessi */

/**
 * Il permesso **di ruolo**, e basta.
 *
 * Vale per chiedere e per decidere: sono atti della societa, e la matrice del
 * §12 non li concede per legame a nessuno.
 */
const assertRolePermission = (
  scope: DocumentDossierScope,
  key: string,
  spiegazione: string,
) => {
  if (!roleHasPermission(scope?.activeRole, key)) {
    throw denied(spiegazione);
  }
};

/**
 * Il permesso **per legame**, quando il ruolo non basta.
 *
 * Un genitore non compare fra i ruoli di `documents.submit_own` e
 * `documents.read_dossier`, e non deve comparirci: il suo accesso nasce dal
 * legame con l'atleta, e il legame lo risolve `canParentAccessAthlete` —
 * l'unica funzione che sa quali atleti sono davvero di quell'account.
 *
 * Il legame vale **solo** per un soggetto `athlete`: non esiste un legame
 * famiglia-socio o famiglia-collaboratore, e concederlo per analogia aprirebbe
 * il fascicolo di un adulto a chi ha un figlio nella stessa societa.
 */
const assertSubjectAccess = async (
  scope: DocumentDossierScope,
  key: string,
  subjectKind: unknown,
  subjectId: unknown,
  spiegazione: string,
) => {
  if (roleHasPermission(scope?.activeRole, key)) return;

  const kind = String(subjectKind ?? "").trim().toLowerCase();
  if (kind === "athlete" && asText(subjectId)) {
    const legato = await canParentAccessAthlete(scope.userId, asText(subjectId));
    if (legato) return;
  }

  throw denied(spiegazione);
};

/**
 * Lo scope di una famiglia, costruito dal **legame** e non dalla membership.
 *
 * Serve perche un genitore collegato solo come tutore **puo non avere nessuna
 * appartenenza al club**: `resolveOrganizationScopeForUser` gli restituirebbe
 * un club attivo nullo, o peggio quello sbagliato se ha figli in due societa, e
 * ogni `assertActiveClub` fallirebbe su righe che sono legittimamente sue. E la
 * stessa constatazione gia scritta per l'RSVP: «i due permessi non sono lo
 * stesso permesso».
 *
 * Il club non arriva dal client: arriva dalla riga dell'atleta, raggiunta
 * **dopo** aver verificato il legame. Il ruolo resta `null` di proposito, cosi
 * `roleHasPermission` risponde `false` e l'unica strada aperta resta il legame.
 */
export const resolveLinkedFamilyScope = async (
  userId: string,
  athleteId: string,
): Promise<DocumentDossierScope> => {
  const id = asText(athleteId);
  const legato = id ? await canParentAccessAthlete(asText(userId), id) : false;
  if (!legato) {
    throw denied("questo atleta non risulta collegato a questo account");
  }

  const athlete = await prisma.athlete.findUnique({
    where: { id },
    select: { id: true, organization_id: true },
  });
  if (!athlete) {
    throw denied("l'atleta non e stato trovato");
  }

  return {
    userId: asText(userId),
    activeOrganizationId: athlete.organization_id,
    activeRole: null,
    allowedOrganizationIds: [athlete.organization_id],
  };
};

/* ------------------------------------------------------------- le righe */

type RequestRow = {
  id: string;
  organization_id: string;
  subject_kind: string;
  subject_id: string;
  document_kind: string;
  title: string;
  description: string | null;
  required: boolean;
  due_date: Date | null;
  season_id: string | null;
  status: string;
  last_reminded_at: Date | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

type SubmissionRow = {
  id: string;
  organization_id: string;
  request_id: string | null;
  subject_kind: string;
  subject_id: string;
  document_kind: string;
  attachment_id: string | null;
  submitted_by: string | null;
  submitted_at: Date;
  source: string;
  status: string;
  decided_by: string | null;
  decided_at: Date | null;
  decision_note: string | null;
};

export type DocumentSubmissionView = {
  id: string;
  organizationId: string;
  requestId: string | null;
  subjectKind: string;
  subjectId: string;
  documentKind: string;
  attachmentId: string | null;
  attachmentUrl: string | null;
  submittedBy: string | null;
  submittedAt: string | null;
  source: string;
  status: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
};

export type DocumentDossierEntry = {
  /** L'identificativo della richiesta, oppure del deposito se e spontaneo. */
  id: string;
  organizationId: string;
  requestId: string | null;
  subjectKind: string;
  subjectId: string;
  documentKind: string;
  title: string;
  description: string | null;
  required: boolean;
  dueDate: string | null;
  seasonId: string | null;
  lastRemindedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** Lo stato **ricavato**: non e la colonna. */
  state: DocumentRequestState;
  submissions: DocumentSubmissionView[];
};

const serializeSubmission = (row: SubmissionRow): DocumentSubmissionView => ({
  id: row.id,
  organizationId: row.organization_id,
  requestId: row.request_id || null,
  subjectKind: row.subject_kind,
  subjectId: row.subject_id,
  documentKind: row.document_kind,
  attachmentId: row.attachment_id || null,
  attachmentUrl: row.attachment_id ? buildAttachmentUrl(row.attachment_id) : null,
  submittedBy: row.submitted_by || null,
  submittedAt: toIso(row.submitted_at),
  source: row.source,
  status: row.status,
  decidedBy: row.decided_by || null,
  decidedAt: toIso(row.decided_at),
  decisionNote: row.decision_note || null,
});

const toDerivationInput = (rows: SubmissionRow[]) =>
  rows.map((row) => ({
    id: row.id,
    requestId: row.request_id,
    status: row.status,
    attachmentId: row.attachment_id,
    submittedAt: row.submitted_at,
    decidedAt: row.decided_at,
    decisionNote: row.decision_note,
    source: row.source,
  }));

const serializeEntry = (
  request: RequestRow | null,
  submissions: SubmissionRow[],
  now?: Date,
): DocumentDossierEntry => {
  const ordinati = [...submissions].sort(
    (left, right) => left.submitted_at.getTime() - right.submitted_at.getTime(),
  );
  const primo = ordinati[0] || null;
  const state = deriveDocumentRequestState(
    request
      ? {
          id: request.id,
          status: request.status,
          dueDate: request.due_date,
          required: request.required,
        }
      : null,
    toDerivationInput(ordinati),
    { now },
  );

  return {
    id: request?.id || primo?.id || "",
    organizationId: request?.organization_id || primo?.organization_id || "",
    requestId: request?.id || null,
    subjectKind: request?.subject_kind || primo?.subject_kind || "",
    subjectId: request?.subject_id || primo?.subject_id || "",
    documentKind: request?.document_kind || primo?.document_kind || "",
    /*
      Un deposito spontaneo non ha un titolo scritto da nessuno: il tipo di
      documento e tutto cio che si sa, e inventare un titolo qui vorrebbe dire
      mostrarne uno diverso da quello che la famiglia ha visto caricando.
    */
    title: request?.title || primo?.document_kind || "Documento consegnato",
    description: request?.description || null,
    required: request ? Boolean(request.required) : false,
    dueDate: toIso(request?.due_date),
    seasonId: request?.season_id || null,
    lastRemindedAt: toIso(request?.last_reminded_at),
    createdAt: toIso(request?.created_at || primo?.submitted_at),
    updatedAt: toIso(request?.updated_at || primo?.submitted_at),
    state,
    submissions: ordinati.map(serializeSubmission),
  };
};

/* ------------------------------------------------------- lettura di base */

const loadRequest = async (
  scope: DocumentDossierScope,
  requestId: string,
): Promise<RequestRow> => {
  const row = (await prisma.documentRequest.findUnique({
    where: { id: asText(requestId) },
  })) as RequestRow | null;

  /*
    La riga che non c'e e la riga di un altro club danno lo stesso messaggio, di
    proposito: distinguerle direbbe a chi indovina un identificativo che quella
    richiesta esiste davvero.
  */
  if (!row) throw denied("la richiesta non e stata trovata, o non e di questo club");
  assertActiveClub(scope, row.organization_id, "la richiesta");
  return row;
};

const loadSubmissionsFor = async (
  organizationId: string,
  requestIds: string[],
): Promise<SubmissionRow[]> => {
  if (requestIds.length === 0) return [];
  return (await prisma.documentSubmission.findMany({
    where: { organization_id: organizationId, request_id: { in: requestIds } },
    orderBy: { submitted_at: "asc" },
  })) as unknown as SubmissionRow[];
};

/* ---------------------------------------------------- soggetti e famiglie */

/**
 * L'atleta del club attivo, o niente.
 *
 * Serve a due cose insieme: verificare che il soggetto esista **dentro questo
 * club** — senza, si potrebbe aprire una richiesta verso l'atleta di un'altra
 * societa — e recuperare i genitori a cui la notifica va indirizzata.
 */
const loadAthleteOfClub = async (organizationId: string, athleteId: string) =>
  prisma.athlete.findFirst({
    where: { id: asText(athleteId), organization_id: organizationId },
    select: {
      id: true,
      organization_id: true,
      first_name: true,
      last_name: true,
      user_id: true,
      data: true,
    },
  });

const asRecord = (value: unknown): Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

/**
 * Gli account a cui una notifica di famiglia deve arrivare.
 *
 * Sono l'account dell'atleta e quelli dei tutori collegati. La notifica si
 * scrive **una per destinatario**: `user_id: null` significa «di tutti» per
 * l'area genitore, ed e cosi che la richiesta di un documento — con il nome
 * del minore — finiva nella bacheca di ogni altra famiglia
 * (`club-notifications.ts`).
 */
const resolveFamilyRecipients = (athlete: any): string[] => {
  const data = asRecord(athlete?.data);
  const tutori = Array.isArray(data.guardians) ? data.guardians : [];
  const collegati = tutori
    .flatMap((guardian: any) => [
      asRecord(guardian).linkedUserId,
      asRecord(guardian).linked_user_id,
      asRecord(guardian).userId,
      asRecord(guardian).user_id,
    ])
    .map((value: unknown) => asText(value))
    .filter(Boolean);

  return Array.from(
    new Set([asText(athlete?.user_id), ...collegati].filter(Boolean)),
  ) as string[];
};

const notifyFamily = async (
  athlete: any,
  notifica: { title: string; message: string; type: string; entryId: string },
) => {
  const destinatari = resolveFamilyRecipients(athlete);
  if (destinatari.length === 0) return 0;

  await prisma.notification.createMany({
    data: destinatari.map((userId) => ({
      organization_id: athlete.organization_id,
      user_id: userId,
      title: notifica.title,
      message: notifica.message,
      type: notifica.type,
      read: false,
      data: {
        athleteId: athlete.id,
        documentId: notifica.entryId,
        source: "document_requests",
      },
    })),
  });
  await sendNotificationEmails(destinatari);

  return destinatari.length;
};

const nomeAtleta = (athlete: any) =>
  `${asText(athlete?.first_name)} ${asText(athlete?.last_name)}`.trim() ||
  "L'atleta";

/* ---------------------------------------------------------- la richiesta */

export type CreateDocumentRequestInput = {
  organizationId?: string | null;
  subjectKind: unknown;
  subjectId: unknown;
  documentKind: unknown;
  title: unknown;
  description?: string | null;
  required?: boolean | null;
  dueDate?: string | Date | null;
  seasonId?: string | null;
};

/**
 * Il club chiede un documento a una famiglia o a un collaboratore.
 *
 * Non carica niente e non crea nessun allegato: crea il **fatto** che quel
 * documento e stato chiesto, con la sua scadenza. Il file arriva dopo, con un
 * deposito.
 */
export const createDocumentRequest = async (
  scope: DocumentDossierScope,
  input: CreateDocumentRequestInput,
  request?: Request,
): Promise<DocumentDossierEntry> => {
  assertRolePermission(
    scope,
    "documents.request",
    "un documento lo chiede chi lavora nella segreteria del club",
  );

  const organizationId = resolveActiveClubId(
    scope,
    input.organizationId,
    "la richiesta",
  );

  const validazione = validateDocumentRequestDraft({
    subjectKind: input.subjectKind,
    subjectId: input.subjectId,
    documentKind: input.documentKind,
    title: input.title,
    dueDate: input.dueDate,
  });
  if (!validazione.ok) {
    throw new Error(validazione.issues.map((issue) => issue.message).join("; "));
  }

  const subjectKind = String(input.subjectKind)
    .trim()
    .toLowerCase() as DocumentSubjectKind;
  const subjectId = asText(input.subjectId);

  /*
    Il soggetto deve esistere **in questo club**. Per l'atleta lo si verifica
    davvero; per socio e persona non c'e ancora una tabella da interrogare — il
    libro soci scrive eventi, non anagrafiche — e il confine resta quello del
    club attivo piu il permesso di ruolo. E una copertura minore, ed e detta
    qui invece che lasciata credere.
  */
  const athlete =
    subjectKind === "athlete"
      ? await loadAthleteOfClub(organizationId, subjectId)
      : null;
  if (subjectKind === "athlete" && !athlete) {
    throw denied("l'atleta non e stato trovato, o non e di questo club");
  }

  const created = (await prisma.documentRequest.create({
    data: {
      organization_id: organizationId,
      subject_kind: subjectKind,
      subject_id: subjectId,
      document_kind: normalizeDocumentKind(input.documentKind),
      title: asText(input.title).slice(0, 200),
      description: asText(input.description) || null,
      required: input.required === undefined ? true : Boolean(input.required),
      due_date: input.dueDate ? new Date(asText(input.dueDate)) : null,
      season_id: asText(input.seasonId) || null,
      status: "open",
      created_by: scope.userId || null,
    },
  })) as unknown as RequestRow;

  if (athlete) {
    await notifyFamily(athlete, {
      title: "Documento richiesto",
      message: `Il club richiede: ${created.title}`,
      type: "document_required",
      entryId: created.id,
    });
  }

  await recordAuditEvent({
    action: AUDIT_ACTIONS.documentRequestCreated,
    actorUserId: scope.userId,
    actorRole: scope.activeRole,
    organizationId,
    resource: "document_requests",
    resourceId: created.id,
    request,
    metadata: {
      subjectKind,
      subjectId,
      documentKind: created.document_kind,
      required: created.required,
      dueDate: toIso(created.due_date),
    },
  });

  return serializeEntry(created, []);
};

/**
 * La segreteria ritira la richiesta.
 *
 * **Non cancella niente**: i depositi restano, e restano leggibili. Cancellare
 * la riga porterebbe via anche la prova che il documento era stato chiesto,
 * che e la meta della storia che serve quando qualcuno contesta un'esclusione.
 */
export const cancelDocumentRequest = async (
  scope: DocumentDossierScope,
  requestId: string,
  options: { reason?: string | null } = {},
  request?: Request,
): Promise<DocumentDossierEntry> => {
  assertRolePermission(
    scope,
    "documents.request",
    "una richiesta di documento la ritira chi puo farla",
  );

  const row = await loadRequest(scope, requestId);
  const submissions = await loadSubmissionsFor(row.organization_id, [row.id]);
  const stato = deriveDocumentRequestState(
    { id: row.id, status: row.status, dueDate: row.due_date },
    toDerivationInput(submissions),
  );

  if (!canTransitionDocumentRequest(stato.status, "cancelled")) {
    throw new Error(
      explainDocumentRequestTransitionDenial(stato.status, "cancelled") ||
        "La richiesta non si puo annullare",
    );
  }

  const updated = (await prisma.documentRequest.update({
    where: { id: row.id },
    data: { status: "cancelled" },
  })) as unknown as RequestRow;

  await recordAuditEvent({
    action: AUDIT_ACTIONS.documentRequestCancelled,
    actorUserId: scope.userId,
    actorRole: scope.activeRole,
    organizationId: row.organization_id,
    resource: "document_requests",
    resourceId: row.id,
    request,
    metadata: {
      subjectKind: row.subject_kind,
      subjectId: row.subject_id,
      documentKind: row.document_kind,
      /* Il motivo nel metadato: senza, «perche e sparita» resta senza risposta. */
      reason: asText(options.reason) || null,
    },
  });

  return serializeEntry(updated, submissions);
};

/**
 * Il sollecito, con la stessa soglia di sei ore della rotta legacy.
 *
 * `last_reminded_at` non e la difesa: e il primo dei due presidi, e regge il
 * secondo clic della stessa persona. Quello che regge due operatori
 * contemporanei e la deduplica di `CommunicationDelivery` (ADR-0084), che vive
 * nel canale e non qui.
 */
export const remindDocumentRequest = async (
  scope: DocumentDossierScope,
  requestId: string,
  request?: Request,
): Promise<DocumentDossierEntry> => {
  assertRolePermission(
    scope,
    "documents.request",
    "un documento lo sollecita chi lo ha chiesto",
  );

  const row = await loadRequest(scope, requestId);
  const submissions = await loadSubmissionsFor(row.organization_id, [row.id]);
  const stato = deriveDocumentRequestState(
    { id: row.id, status: row.status, dueDate: row.due_date },
    toDerivationInput(submissions),
  );

  const diniego = explainDocumentReminderDenial(stato, row.last_reminded_at);
  if (diniego) throw new Error(diniego);

  const updated = (await prisma.documentRequest.update({
    where: { id: row.id },
    data: { last_reminded_at: new Date() },
  })) as unknown as RequestRow;

  if (row.subject_kind === "athlete") {
    const athlete = await loadAthleteOfClub(row.organization_id, row.subject_id);
    if (athlete) {
      await notifyFamily(athlete, {
        title: "Promemoria documento",
        message: `Ricordati di caricare: ${row.title}`,
        type: "document_reminder",
        entryId: row.id,
      });
    }
  }

  await recordAuditEvent({
    action: AUDIT_ACTIONS.documentRequestReminded,
    actorUserId: scope.userId,
    actorRole: scope.activeRole,
    organizationId: row.organization_id,
    resource: "document_requests",
    resourceId: row.id,
    request,
    metadata: {
      subjectKind: row.subject_kind,
      subjectId: row.subject_id,
      documentKind: row.document_kind,
    },
  });

  return serializeEntry(updated, submissions);
};

/* ----------------------------------------------------------- il deposito */

export type DocumentFileInput = {
  fileName: string;
  mimeType: string;
  content: Buffer;
  validFrom?: string | null;
  validUntil?: string | null;
};

export type SubmitDocumentInput = {
  organizationId?: string | null;
  requestId?: string | null;
  subjectKind?: unknown;
  subjectId?: unknown;
  documentKind?: unknown;
  source?: unknown;
  file: DocumentFileInput;
};

/**
 * Il proprietario dell'allegato, dedotto dal soggetto.
 *
 * `person` non ha un `owner_type` proprio in Attachment Core e ricade su
 * `other`, che e il piu chiuso: lo governa chi amministra il club
 * (`attachment-permissions.ts`). Sbagliare verso il piu chiuso e l'unico verso
 * accettabile.
 */
const ownerTypeFor = (subjectKind: string) =>
  subjectKind === "athlete" ? "athlete" : subjectKind === "member" ? "member" : "other";

/**
 * Deposita un documento: **anche spontaneo**.
 *
 * Il verso spontaneo — la famiglia carica senza che nessuno abbia chiesto — non
 * e un caso degradato: e meta del traffico reale, e ha `request_id` nullo.
 * Passa dalla stessa coda e dalla stessa decisione, perche due percorsi
 * diversi sarebbero due code, e la seconda e quella che nessuno guarda.
 */
export const submitDocument = async (
  scope: DocumentDossierScope,
  input: SubmitDocumentInput,
  request?: Request,
): Promise<DocumentDossierEntry> => {
  const organizationId = resolveActiveClubId(
    scope,
    input.organizationId,
    "il documento",
  );

  const richiesta = asText(input.requestId)
    ? await loadRequest(scope, asText(input.requestId))
    : null;

  const subjectKind = String(
    richiesta?.subject_kind ?? input.subjectKind ?? "",
  )
    .trim()
    .toLowerCase();
  const subjectId = asText(richiesta?.subject_id ?? input.subjectId);
  const documentKind = normalizeDocumentKind(
    richiesta?.document_kind ?? input.documentKind,
  );

  if (!isDocumentSubjectKind(subjectKind) || !subjectId) {
    throw new Error("Il documento deve dire a chi si riferisce");
  }
  if (!documentKind) {
    throw new Error("Il documento deve dichiarare di che tipo e");
  }

  await assertSubjectAccess(
    scope,
    "documents.submit_own",
    subjectKind,
    subjectId,
    "questo documento lo consegna chi ne risponde, o la famiglia collegata all'atleta",
  );

  /*
    Depositare su una richiesta annullata scriverebbe un documento che nessuno
    andra a guardare: la coda della segreteria e fatta di richieste in piedi.
  */
  if (richiesta && richiesta.status === "cancelled") {
    throw new Error("La richiesta risulta annullata: non accetta piu depositi");
  }

  const athlete =
    subjectKind === "athlete"
      ? await loadAthleteOfClub(organizationId, subjectId)
      : null;
  if (subjectKind === "athlete" && !athlete) {
    throw denied("l'atleta non e stato trovato, o non e di questo club");
  }

  const source: DocumentSubmissionSource = isDocumentSubmissionSource(input.source)
    ? (String(input.source).trim().toLowerCase() as DocumentSubmissionSource)
    : "parent";

  /*
    I byte passano da Attachment Core e da nessun'altra parte (ADR-0034): e la
    ragione per cui questa lane non introduce un secondo archivio, ed e anche
    l'unico punto in cui tipo, dimensione e nome del file vengono validati.
  */
  const allegato = await createAttachment(
    {
      organizationId,
      ownerType: ownerTypeFor(subjectKind),
      ownerId: subjectId,
      category: documentKind,
      fileName: input.file?.fileName,
      mimeType: input.file?.mimeType,
      content: input.file?.content,
      validFrom: input.file?.validFrom ?? null,
      validUntil: input.file?.validUntil ?? null,
    },
    scope,
  );

  const created = (await prisma.documentSubmission.create({
    data: {
      organization_id: organizationId,
      request_id: richiesta?.id || null,
      subject_kind: subjectKind,
      subject_id: subjectId,
      document_kind: documentKind,
      attachment_id: allegato.id,
      submitted_by: scope.userId || null,
      source,
      status: "under_review",
    },
  })) as unknown as SubmissionRow;

  /*
    Chi va avvisato dipende da chi ha caricato, e non e simmetrico: il deposito
    della famiglia apre un lavoro per la segreteria, quello della segreteria e
    un documento che la famiglia deve poter vedere.
  */
  if (source === "club") {
    if (athlete) {
      await notifyFamily(athlete, {
        title: "Nuovo documento disponibile",
        message: `Il club ha condiviso: ${richiesta?.title || documentKind}`,
        type: "document_shared",
        entryId: richiesta?.id || created.id,
      });
    }
  } else {
    await createClubNotifications({
      clubId: organizationId,
      title: "Documento consegnato",
      message: `${nomeAtleta(athlete)} ha consegnato: ${richiesta?.title || documentKind}`,
      type: "document_uploaded",
      data: {
        subjectKind,
        subjectId,
        documentId: richiesta?.id || created.id,
        submissionId: created.id,
        source: "document_requests",
      },
      /*
        Il perimetro e l'area gestionale: il messaggio nomina un minore e il
        documento che lo riguarda. Allenatori e altre famiglie no.
      */
      audience: (role) => isManagementAccessRole(role),
    });
  }

  await recordAuditEvent({
    action: AUDIT_ACTIONS.documentSubmissionReceived,
    actorUserId: scope.userId,
    actorRole: scope.activeRole,
    organizationId,
    resource: "document_submissions",
    resourceId: created.id,
    request,
    metadata: {
      requestId: richiesta?.id || null,
      subjectKind,
      subjectId,
      documentKind,
      source,
      attachmentId: allegato.id,
      sizeBytes: allegato.sizeBytes,
      mimeType: allegato.mimeType,
    },
  });

  const submissions = richiesta
    ? await loadSubmissionsFor(organizationId, [richiesta.id])
    : [created];

  return serializeEntry(richiesta, submissions);
};

/* --------------------------------------------------------- la decisione */

const loadSubmission = async (
  scope: DocumentDossierScope,
  submissionId: string,
): Promise<SubmissionRow> => {
  const id = asText(submissionId);

  let row = (await prisma.documentSubmission.findUnique({
    where: { id },
  })) as SubmissionRow | null;

  /*
    Si accetta anche l'identificativo della **richiesta**, e non per comodita:
    e cio che la schermata ha in mano quando mostra una riga del fascicolo. In
    quel caso si decide sull'ultimo deposito, che e l'unico in verifica.
  */
  if (!row) {
    const perRichiesta = (await prisma.documentSubmission.findMany({
      where: { request_id: id },
      orderBy: { submitted_at: "desc" },
      take: 1,
    })) as unknown as SubmissionRow[];
    row = perRichiesta[0] || null;
  }

  if (!row) {
    throw denied("il documento non e stato trovato, o non e di questo club");
  }
  assertActiveClub(scope, row.organization_id, "il documento");
  return row;
};

/**
 * Accetta o rifiuta un documento consegnato.
 *
 * All'accettazione di un certificato medico **promuove** una riga in
 * `medical_certificates`: un certificato che restasse solo nel fascicolo
 * sarebbe valido per la segreteria e inesistente per il promemoria notturno
 * `AUT-03`, cioe la peggiore delle due risposte possibili (W5-27, W5-44).
 */
export const decideDocumentSubmission = async (
  scope: DocumentDossierScope,
  submissionId: string,
  decisione: { decision: unknown; note?: string | null },
  request?: Request,
): Promise<DocumentDossierEntry> => {
  assertRolePermission(
    scope,
    "documents.review",
    "un documento lo accetta o lo rifiuta chi lavora nella segreteria del club",
  );

  const row = await loadSubmission(scope, submissionId);
  const decision = String(decisione?.decision ?? "").trim().toLowerCase();

  if (!canDecideDocumentSubmission(row.status, decision)) {
    throw new Error(
      explainDocumentDecisionDenial(row.status, decision) ||
        "Questa decisione non e ammessa",
    );
  }

  const motivo = explainDocumentDecisionNoteDenial(decision, decisione?.note);
  if (motivo) throw new Error(motivo);

  const updated = (await prisma.documentSubmission.update({
    where: { id: row.id },
    data: {
      status: decision,
      decided_by: scope.userId || null,
      decided_at: new Date(),
      decision_note: asText(decisione?.note) || null,
    },
  })) as unknown as SubmissionRow;

  /*
    **La richiesta non viene toccata.** `fulfilled` non si scrive: lo ricava
    `deriveDocumentRequestState` da questa riga. Scriverlo qui creerebbe la
    seconda risposta alla stessa domanda, e sarebbe quella che resta indietro
    il giorno in cui la famiglia ricarica sopra un documento gia approvato.
  */
  const richiesta = row.request_id
    ? ((await prisma.documentRequest.findUnique({
        where: { id: row.request_id },
      })) as RequestRow | null)
    : null;

  let promosso: string | null = null;
  if (decision === "approved") {
    promosso = await promoteMedicalCertificate(scope, updated);
  }

  if (row.subject_kind === "athlete") {
    const athlete = await loadAthleteOfClub(row.organization_id, row.subject_id);
    if (athlete) {
      const titolo = richiesta?.title || row.document_kind;
      await notifyFamily(
        athlete,
        decision === "approved"
          ? {
              title: "Documento approvato",
              message: `Il documento "${titolo}" e stato approvato.`,
              type: "document_approved",
              entryId: richiesta?.id || row.id,
            }
          : {
              title: "Documento rifiutato",
              message: `Il documento "${titolo}" e stato rifiutato: ${asText(decisione?.note)}`,
              type: "document_rejected",
              entryId: richiesta?.id || row.id,
            },
      );
    }
  }

  await recordAuditEvent({
    action: AUDIT_ACTIONS.documentSubmissionDecided,
    actorUserId: scope.userId,
    actorRole: scope.activeRole,
    organizationId: row.organization_id,
    resource: "document_submissions",
    resourceId: row.id,
    request,
    metadata: {
      requestId: row.request_id || null,
      subjectKind: row.subject_kind,
      subjectId: row.subject_id,
      documentKind: row.document_kind,
      decision,
      /*
        Il motivo sta nel metadato e non solo nella riga: e la prima cosa che
        viene chiesta quando una famiglia contesta un rifiuto, e la riga puo
        essere superata da un deposito successivo.
      */
      reason: asText(decisione?.note) || null,
      medicalCertificateId: promosso,
    },
  });

  const submissions = row.request_id
    ? await loadSubmissionsFor(row.organization_id, [row.request_id])
    : [updated];

  return serializeEntry(richiesta, submissions);
};

/**
 * Il certificato medico accettato diventa una riga di `medical_certificates`.
 *
 * `status` **non si scrive** (W5-44): lo stato di un certificato — valido, in
 * scadenza, scaduto, mancante — si ricava dalla data di scadenza e da oggi,
 * come lo stato di una rata. Una colonna che dice «valido» accanto a una data
 * gia passata e il modo in cui un ragazzo scende in campo senza copertura.
 *
 * La promozione e idempotente sul file: due decisioni sullo stesso allegato
 * non producono due certificati, che vorrebbero dire due scadenze per lo
 * stesso documento e due promemoria alla stessa famiglia.
 */
const promoteMedicalCertificate = async (
  scope: DocumentDossierScope,
  submission: SubmissionRow,
): Promise<string | null> => {
  if (submission.subject_kind !== "athlete") return null;
  if (!isMedicalCertificateDocumentKind(submission.document_kind)) return null;
  if (!submission.attachment_id) return null;

  const fileUrl = buildAttachmentUrl(submission.attachment_id);

  const esistente = await prisma.medicalCertificate.findFirst({
    where: {
      organization_id: submission.organization_id,
      athlete_id: submission.subject_id,
      file_url: fileUrl,
    },
    select: { id: true },
  });
  if (esistente) return esistente.id;

  /* Le date di validita sono quelle **del file**, e Attachment Core le possiede. */
  const allegato = await getAttachmentMetadata(submission.attachment_id, scope);

  const created = await prisma.medicalCertificate.create({
    data: {
      organization_id: submission.organization_id,
      athlete_id: submission.subject_id,
      type: submission.document_kind,
      issue_date: allegato?.validFrom ? new Date(allegato.validFrom) : null,
      expiry_date: allegato?.validUntil ? new Date(allegato.validUntil) : null,
      file_url: fileUrl,
      notes: null,
      data: {
        source: "document_submissions",
        submissionId: submission.id,
        requestId: submission.request_id,
        attachmentId: submission.attachment_id,
      },
    },
    select: { id: true },
  });

  return created.id;
};

/* ------------------------------------------------------------- letture */

export type DossierFilter = {
  organizationId?: string | null;
  subjectKind?: unknown;
  subjectId?: unknown;
  documentKind?: unknown;
  /** `open` esclude annullate e soddisfatte: e la coda della segreteria. */
  onlyOpen?: boolean;
  includeCancelled?: boolean;
};

/**
 * Il fascicolo di un soggetto: richieste con i loro depositi, piu i depositi
 * spontanei, ordinati dal piu recente.
 */
export const getDocumentDossier = async (
  scope: DocumentDossierScope,
  filter: DossierFilter,
  options: { now?: Date } = {},
): Promise<DocumentDossierEntry[]> => {
  const organizationId = resolveActiveClubId(
    scope,
    filter.organizationId,
    "il fascicolo",
  );

  const subjectKind = String(filter.subjectKind ?? "").trim().toLowerCase();
  const subjectId = asText(filter.subjectId);

  await assertSubjectAccess(
    scope,
    "documents.read_dossier",
    subjectKind,
    subjectId,
    "il fascicolo di una persona lo vede chi lavora nel club, o la famiglia collegata all'atleta",
  );

  const where: Record<string, any> = { organization_id: organizationId };
  if (subjectKind) where.subject_kind = subjectKind;
  if (subjectId) where.subject_id = subjectId;
  if (filter.documentKind) {
    where.document_kind = normalizeDocumentKind(filter.documentKind);
  }

  const [requests, submissions] = await Promise.all([
    prisma.documentRequest.findMany({
      where,
      orderBy: { created_at: "desc" },
    }) as unknown as Promise<RequestRow[]>,
    prisma.documentSubmission.findMany({
      where,
      orderBy: { submitted_at: "asc" },
    }) as unknown as Promise<SubmissionRow[]>,
  ]);

  /*
    Il confine si verifica **riga per riga** anche dopo aver filtrato per
    club: il filtro dice cosa si e chiesto, questo dice cosa si e ottenuto, e
    sono due cose diverse il giorno in cui qualcuno sbaglia un `where`.
  */
  for (const row of requests) {
    assertActiveClub(scope, row.organization_id, "la richiesta");
  }
  for (const row of submissions) {
    assertActiveClub(scope, row.organization_id, "il documento");
  }

  const perRichiesta = new Map<string, SubmissionRow[]>();
  const spontanei: SubmissionRow[] = [];
  for (const row of submissions) {
    if (!row.request_id) {
      spontanei.push(row);
      continue;
    }
    const elenco = perRichiesta.get(row.request_id) || [];
    elenco.push(row);
    perRichiesta.set(row.request_id, elenco);
  }

  const entries = [
    ...requests.map((row) =>
      serializeEntry(row, perRichiesta.get(row.id) || [], options.now),
    ),
    /* Un deposito spontaneo e una voce a se: non ha una richiesta da soddisfare. */
    ...spontanei.map((row) => serializeEntry(null, [row], options.now)),
  ];

  const visibili = filter.includeCancelled
    ? entries
    : entries.filter((entry) => entry.state.status !== "cancelled");

  return (filter.onlyOpen
    ? visibili.filter((entry) => entry.state.status === "open")
    : visibili
  ).sort((left, right) =>
    asText(right.createdAt).localeCompare(asText(left.createdAt)),
  );
};

/**
 * Le richieste del club, per la coda della segreteria.
 *
 * Senza soggetto e una lettura di club, e la concede il **ruolo**: una
 * famiglia che chiedesse l'elenco senza filtro chiederebbe il fascicolo di
 * tutti.
 */
export const listDocumentRequests = async (
  scope: DocumentDossierScope,
  filter: DossierFilter = {},
  options: { now?: Date } = {},
): Promise<DocumentDossierEntry[]> => {
  if (!asText(filter.subjectId)) {
    assertRolePermission(
      scope,
      "documents.read_dossier",
      "l'elenco delle richieste del club lo vede chi ci lavora dentro",
    );
  }
  return getDocumentDossier(scope, filter, options);
};

/**
 * La coda «da verificare»: i depositi che aspettano una decisione.
 *
 * La legge chi puo decidere, e non chi puo leggere un fascicolo: sono due
 * domande diverse, e questa e una coda di lavoro.
 */
export const listPendingDocumentSubmissions = async (
  scope: DocumentDossierScope,
  filter: { organizationId?: string | null; subjectId?: unknown } = {},
): Promise<DocumentSubmissionView[]> => {
  assertRolePermission(
    scope,
    "documents.review",
    "la coda dei documenti da verificare la vede chi li verifica",
  );

  const organizationId = resolveActiveClubId(
    scope,
    filter.organizationId,
    "la coda dei documenti",
  );

  const where: Record<string, any> = {
    organization_id: organizationId,
    status: "under_review",
  };
  if (asText(filter.subjectId)) where.subject_id = asText(filter.subjectId);

  const rows = (await prisma.documentSubmission.findMany({
    where,
    orderBy: { submitted_at: "asc" },
  })) as unknown as SubmissionRow[];

  for (const row of rows) {
    assertActiveClub(scope, row.organization_id, "il documento");
  }

  return rows.map(serializeSubmission);
};

/** Una singola voce del fascicolo, per la rotta di dettaglio. */
export const getDocumentRequest = async (
  scope: DocumentDossierScope,
  requestId: string,
  options: { now?: Date } = {},
): Promise<DocumentDossierEntry> => {
  const row = await loadRequest(scope, requestId);

  await assertSubjectAccess(
    scope,
    "documents.read_dossier",
    row.subject_kind,
    row.subject_id,
    "questa richiesta la vede chi lavora nel club, o la famiglia collegata all'atleta",
  );

  const submissions = await loadSubmissionsFor(row.organization_id, [row.id]);
  return serializeEntry(row, submissions, options.now);
};
