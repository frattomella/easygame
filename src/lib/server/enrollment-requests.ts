import { prisma } from "./prisma";
import {
  createDocumentRequest,
  resolveLinkedFamilyScope,
} from "./document-requests";
import { getParentLinkedAthletes } from "./parent-dashboard";
import { findPublicFormBySlug } from "./forms";
import { readClubSeasonState } from "./seasons";
import { deriveDocumentRequestState } from "@/lib/documents/request-model";
import {
  buildPublicEnrollmentView,
  buildRenewalDraftAnswers,
  deriveFamilyEnrollmentState,
  ENROLLMENT_KIND_LABELS,
  FAMILY_ENROLLMENT_STATE_LABELS,
  hashEnrollmentReceiptReference,
  enrollmentReceiptHashesMatch,
  normalizeEnrollmentKind,
  submissionBelongsToFamily,
  type FamilyPendingDocument,
  type PublicEnrollmentView,
  type RenewalDraft,
} from "@/lib/forms/enrollment-receipt";
import type { FormSchema } from "@/lib/forms/model";
import type { SubjectRecords } from "@/lib/forms/prefill";

/**
 * **Il riscontro sulla domanda**: cosa la famiglia puo leggere della propria
 * iscrizione, e come il club chiede il documento che manca senza respingerla
 * (Wave 5, lane 5G, §16).
 *
 * ---
 *
 * ## Cosa questo file **non** fa, e non deve fare
 *
 * Non scrive compilazioni: il proprietario resta `form-submissions.ts`. Non
 * scrive richieste documentali: il proprietario resta `document-requests.ts`,
 * e qui si **chiama**, perche un secondo modo di chiedere un documento sarebbe
 * un secondo fascicolo. Non crea anagrafiche: la regola d'oro non si tocca —
 * `prisma.athlete.create` non esiste in tutto `src/`, e un'iscrizione online
 * resta una proposta finche un operatore non la approva (ADR-0040).
 *
 * Non incassa (G-37). La domanda produce una **pratica**, non un movimento:
 * chi vuole far pagare all'iscrizione emette un link di pagamento dopo
 * l'approvazione, che e un dominio con il suo registro e le sue regole.
 *
 * ## Le due porte, e perche sono due
 *
 * 1. **la ricevuta**, per chi non ha un account. Nessuna sessione, un
 *    riferimento opaco, sola lettura, un elenco chiuso di campi;
 * 2. **l'area genitore**, per chi ce l'ha. Il gate e il **legame** con
 *    l'atleta, mai il ruolo: un tutore puo non avere nessuna appartenenza al
 *    club, e `roleHasPermission` risponde `false` per lui — che e il verso
 *    giusto in cui sbagliare.
 *
 * Non esiste una terza porta: la ricevuta non consente di **modificare**
 * niente. Un canale pubblico di scrittura ricorrente, che permetterebbe a chi
 * non ha un account di aggiungere un allegato dopo l'invio, va progettato a
 * parte (`W2-09`) — e va progettato, non aggiunto qui per comodita.
 */

const asText = (value: unknown) => String(value ?? "").trim();

const toIso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : asText(value) || null;

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

/* ------------------------------------------------- i documenti in attesa */

type PendingRequestRow = {
  id: string;
  title: string;
  status: string;
  due_date: Date | null;
  required: boolean;
  document_kind: string;
};

type PendingSubmissionRow = {
  id: string;
  request_id: string | null;
  status: string;
  attachment_id: string | null;
  submitted_at: Date;
  decided_at: Date | null;
  decision_note: string | null;
  source: string;
};

/**
 * Le richieste documentali ancora aperte su un atleta, con l'ultimo deposito
 * gia guardato.
 *
 * **Perche non basta `status = "open"`.** La colonna dice soltanto se la
 * richiesta e in piedi: `fulfilled` non lo scrive nessuno, si **ricava**
 * dall'ultimo deposito (ADR-0058). Contare le righe `open` senza guardare i
 * depositi direbbe alla famiglia «manca il certificato» il giorno dopo che
 * l'ha caricato e la segreteria l'ha accettato.
 */
const loadPendingDocuments = async (
  organizationId: string,
  athleteId: string,
): Promise<FamilyPendingDocument[]> => {
  if (!athleteId) return [];

  const requests = (await prisma.documentRequest.findMany({
    where: {
      organization_id: organizationId,
      subject_kind: "athlete",
      subject_id: athleteId,
      status: "open",
    },
    orderBy: { created_at: "asc" },
  })) as unknown as PendingRequestRow[];

  if (!requests.length) return [];

  const submissions = (await prisma.documentSubmission.findMany({
    where: {
      organization_id: organizationId,
      request_id: { in: requests.map((request) => request.id) },
    },
    orderBy: { submitted_at: "asc" },
  })) as unknown as PendingSubmissionRow[];

  const perRichiesta = new Map<string, PendingSubmissionRow[]>();
  for (const submission of submissions) {
    const key = asText(submission.request_id);
    if (!key) continue;
    perRichiesta.set(key, [...(perRichiesta.get(key) || []), submission]);
  }

  return requests
    .filter((request) => {
      /*
        Lo stato lo **ricava** il proprietario del fascicolo, non un confronto
        scritto qui. Un secondo calcolo di «e stato consegnato?» sarebbe una
        seconda verita sullo stesso documento, e le due divergerebbero il
        giorno in cui una rifiuta e l'altra no.
      */
      const stato = deriveDocumentRequestState(
        {
          id: request.id,
          status: request.status,
          dueDate: request.due_date,
          required: request.required,
        },
        (perRichiesta.get(request.id) || []).map((submission) => ({
          id: submission.id,
          requestId: submission.request_id,
          status: submission.status,
          attachmentId: submission.attachment_id,
          submittedAt: submission.submitted_at,
          decidedAt: submission.decided_at,
          decisionNote: submission.decision_note,
          source: submission.source,
        })),
      );

      return stato.dossier !== "approved" && stato.dossier !== "cancelled";
    })
    .map((request) => ({
      title: asText(request.title),
      dueDate: toIso(request.due_date),
      required: Boolean(request.required),
    }));
};

/** L'atleta a cui una compilazione e intestata, se ne ha gia uno. */
const athleteOfSubjects = (subjects: unknown) =>
  (Array.isArray(subjects) ? subjects : [])
    .map((entry) => asRecord(entry))
    .filter((entry) => asText(entry.subject) === "athlete")
    .map((entry) => asText(entry.recordId))
    .find(Boolean) || "";

/* ------------------------------------------------------- la lettura pubblica */

type EnrollmentRow = {
  id: string;
  organization_id: string;
  kind: string | null;
  season_id: string | null;
  status: string;
  subjects: unknown;
  submitted_by: string | null;
  submitted_at: Date;
  reviewed_at: Date | null;
  review_note: string | null;
  receipt_token_hash: string | null;
  template_id: string;
  version_id: string;
};

/**
 * Lo stato di una domanda, per chi ha **solo** il riferimento.
 *
 * Restituisce `null` — e la rotta risponde 404 — per ogni esito negativo:
 * riferimento vuoto, sconosciuto, o che punta a una pratica sparita. Un solo
 * esito, e nessun messaggio che distingua i casi: il club non si nomina
 * nemmeno per dire «non e di questo club», perche quella frase da sola
 * confermerebbe che il riferimento esiste da qualche altra parte.
 *
 * **Nessuno scope, e non e una dimenticanza.** Il riferimento *e*
 * l'autorizzazione, come per il link di pagamento: filtrare anche per club
 * sarebbe impossibile — chi legge non ha nessun club — e cercare l'impronta
 * globalmente non apre niente, perche l'impronta non e indovinabile.
 */
export const readPublicEnrollmentStatus = async (
  reference: unknown,
): Promise<PublicEnrollmentView | null> => {
  const hash = hashEnrollmentReceiptReference(reference);
  if (!hash) return null;

  const row = (await (prisma as any).formSubmission.findUnique({
    where: { receipt_token_hash: hash },
  })) as EnrollmentRow | null;

  if (!row) return null;

  /*
    Il confronto a tempo costante sull'impronta gia trovata: la ricerca per
    chiave unica ha gia deciso, ma il verso in cui si sbaglia qui deve restare
    lo stesso dei link di pagamento — nessuna riga di questo dominio confronta
    una credenziale con `===`.
  */
  if (!enrollmentReceiptHashesMatch(asText(row.receipt_token_hash), hash)) {
    return null;
  }

  const [club, template, stagioni] = await Promise.all([
    prisma.club.findUnique({
      where: { id: row.organization_id },
      select: { name: true },
    }),
    (prisma as any).formTemplate.findUnique({
      where: { id: row.template_id },
      select: { title: true },
    }),
    readClubSeasonState(row.organization_id).catch(() => null),
  ]);

  const pendingDocuments = await loadPendingDocuments(
    row.organization_id,
    athleteOfSubjects(row.subjects),
  );

  const stagione = stagioni?.seasons.find(
    (season) => season.id === asText(row.season_id),
  );

  return buildPublicEnrollmentView({
    kind: row.kind,
    status: row.status,
    clubName: club?.name,
    templateTitle: template?.title,
    seasonLabel: stagione?.label,
    submittedAt: toIso(row.submitted_at),
    reviewedAt: toIso(row.reviewed_at),
    reviewNote: row.review_note,
    pendingDocuments,
  });
};

/* --------------------------------------------------------- l'area genitore */

export type FamilyEnrollmentRequest = {
  /**
   * L'identificativo della compilazione. Esce **solo** di qui e non dalla
   * ricevuta: qui c'e una sessione e un legame verificato, li c'e un estraneo
   * con un link.
   */
  id: string;
  kind: string;
  kindLabel: string;
  state: string;
  stateLabel: string;
  templateTitle: string;
  seasonLabel: string;
  athleteName: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string;
  pendingDocuments: FamilyPendingDocument[];
};

/**
 * Le domande di iscrizione e rinnovo di **questa** famiglia.
 *
 * Il gate e `resolveLinkedFamilyScope`: verifica il legame con l'atleta e
 * ricava il club **dalla riga dell'atleta**, mai dal client. Un genitore di un
 * altro club non arriva nemmeno alla query.
 *
 * **Perche il filtro finale e in memoria.** I soggetti di una compilazione
 * vivono in una colonna JSON senza indice, e l'unico modo di interrogarli in
 * SQL sarebbe un `array_contains` sulla forma esatta dell'oggetto — che si
 * rompe alla prima chiave aggiunta a `FormSubjectSelection`. Ma la ragione
 * vera e un'altra: quel filtro **e** l'autorizzazione, e
 * `submissionBelongsToFamily` la tiene in una funzione pura e provabile invece
 * che sparsa fra una clausola `where` e un `.filter`.
 */
export const listFamilyEnrollmentRequests = async (
  userId: string,
  athleteId: string,
): Promise<FamilyEnrollmentRequest[]> => {
  const scope = await resolveLinkedFamilyScope(userId, athleteId);
  const organizationId = asText(scope.activeOrganizationId);

  /*
    Gli atleti collegati, non il solo richiesto: un rinnovo intestato a un
    secondo figlio della stessa famiglia e una pratica di questa famiglia, e
    farla sparire perche la schermata mostrava l'altro figlio sarebbe la stessa
    assenza di riscontro che questa lane chiude. Il confine resta il club dello
    scope: gli atleti collegati in **altre** societa non entrano.
  */
  const collegati = await getParentLinkedAthletes(asText(userId));
  const athleteIds = collegati
    .filter((athlete: any) => asText(athlete.organization_id) === organizationId)
    .map((athlete: any) => asText(athlete.id))
    .filter(Boolean);

  const nomi = new Map(
    collegati.map((athlete: any) => [
      asText(athlete.id),
      `${asText(athlete.first_name)} ${asText(athlete.last_name)}`.trim(),
    ]),
  );

  /*
    Il tetto e dichiarato invece che lasciato credere: si guardano le ultime
    cinquecento pratiche del club, che coprono largamente una stagione anche
    di una societa grande. Non e una paginazione — una famiglia non ne ha
    cinquecento — ed e li per non far leggere l'intera coda di un club a ogni
    apertura dell'area genitore.
  */
  const rows = (await (prisma as any).formSubmission.findMany({
    where: { organization_id: organizationId },
    orderBy: { submitted_at: "desc" },
    take: 500,
  })) as EnrollmentRow[];

  const mie = rows.filter((row) =>
    submissionBelongsToFamily(
      {
        submittedBy: row.submitted_by,
        subjects: (Array.isArray(row.subjects) ? row.subjects : []) as any[],
      },
      { userId: asText(userId), athleteIds },
    ),
  );

  if (!mie.length) return [];

  const titoli = new Map<string, string>();
  const modelli = await (prisma as any).formTemplate.findMany({
    where: {
      organization_id: organizationId,
      id: { in: Array.from(new Set(mie.map((row) => row.template_id))) },
    },
    select: { id: true, title: true },
  });
  for (const modello of modelli as Array<{ id: string; title: string }>) {
    titoli.set(modello.id, asText(modello.title));
  }

  const stagioni = await readClubSeasonState(organizationId).catch(() => null);

  const viste: FamilyEnrollmentRequest[] = [];
  for (const row of mie) {
    const atleta = athleteOfSubjects(row.subjects);
    const pendingDocuments = await loadPendingDocuments(organizationId, atleta);
    const kind = normalizeEnrollmentKind(row.kind);
    const state = deriveFamilyEnrollmentState({
      status: row.status,
      openDocumentRequests: pendingDocuments.length,
    });

    viste.push({
      id: row.id,
      kind,
      kindLabel: ENROLLMENT_KIND_LABELS[kind],
      state,
      stateLabel: FAMILY_ENROLLMENT_STATE_LABELS[state],
      templateTitle: titoli.get(row.template_id) || "",
      seasonLabel:
        stagioni?.seasons.find((season) => season.id === asText(row.season_id))
          ?.label || "",
      athleteName: nomi.get(atleta) || "",
      submittedAt: toIso(row.submitted_at),
      reviewedAt: toIso(row.reviewed_at),
      reviewNote: asText(row.review_note),
      pendingDocuments,
    });
  }

  return viste;
};

/* ------------------------------------------------------------ il rinnovo */

export type RenewalDraftView = RenewalDraft & {
  athleteId: string;
  athleteName: string;
  clubName: string;
  form: {
    title: string;
    description: string;
    fields: FormSchema["fields"];
    collectRespondentEmail: boolean;
  };
};

/**
 * Il modulo di rinnovo gia riempito con cio che il club sa gia.
 *
 * **Il tutore precompilato e chi sta compilando**, non il primo dell'elenco.
 * Un atleta puo avere due tutori con indirizzi e telefoni diversi: riempire
 * con «il primo» significa presentare al padre i recapiti della madre e
 * lasciargli confermare i dati di qualcun altro. Se l'account non corrisponde
 * a nessun tutore in scheda, i campi del tutore restano vuoti — chiedere e
 * meno grave che indovinare.
 *
 * Sede e categoria non si toccano: le mette il server quando il modulo si apre
 * (ADR-0043), e le opzioni arrivano dallo stesso `findPublicFormBySlug` che
 * serve la pagina pubblica. Due percorsi di lettura sarebbero due occasioni
 * perche un giorno smettano di coincidere.
 */
export const buildRenewalDraft = async (
  userId: string,
  input: { athleteId: string; publicSlug: string },
): Promise<RenewalDraftView> => {
  const scope = await resolveLinkedFamilyScope(userId, input.athleteId);
  const organizationId = asText(scope.activeOrganizationId);

  const match = await findPublicFormBySlug(input.publicSlug);
  if (!match || match.organizationId !== organizationId) {
    /* Un solo esito negativo, come sulla pagina pubblica. */
    throw new Error("Modulo non trovato");
  }

  const athlete = await prisma.athlete.findFirst({
    where: { id: asText(input.athleteId), organization_id: organizationId },
  });
  if (!athlete) throw new Error("Modulo non trovato");

  const guardians = Array.isArray(asRecord(athlete.data).guardians)
    ? asRecord(athlete.data).guardians
    : [];
  const tutore =
    guardians.find((guardian: any) =>
      [
        asRecord(guardian).linkedUserId,
        asRecord(guardian).linked_user_id,
        asRecord(guardian).userId,
        asRecord(guardian).user_id,
      ]
        .map((value) => asText(value))
        .includes(asText(userId)),
    ) || null;

  const records: SubjectRecords = { athlete: athlete as any, guardian: tutore };
  const stagioni = await readClubSeasonState(organizationId).catch(() => null);

  const draft = buildRenewalDraftAnswers({
    schema: match.schema,
    records,
    seasonId: stagioni?.activeSeasonId,
    seasonLabel: stagioni?.activeSeason?.label,
  });

  return {
    ...draft,
    athleteId: asText(athlete.id),
    athleteName:
      `${asText(athlete.first_name)} ${asText(athlete.last_name)}`.trim(),
    clubName: match.club.name,
    form: {
      title: match.schema.title,
      description: match.schema.description,
      fields: match.schema.fields,
      collectRespondentEmail: match.schema.settings.collectRespondentEmail,
    },
  };
};

/* --------------------------------------------- il documento che manca */

export type MissingDocumentInput = {
  documentKind: unknown;
  title: unknown;
  description?: unknown;
  dueDate?: unknown;
  required?: unknown;
};

const normalizeMissingDocuments = (value: unknown): MissingDocumentInput[] =>
  (Array.isArray(value) ? value : [])
    .map((entry) => asRecord(entry))
    .filter((entry) => asText(entry.documentKind || entry.document_kind))
    .slice(0, 10)
    .map((entry) => ({
      documentKind: asText(entry.documentKind || entry.document_kind),
      title: asText(entry.title).slice(0, 200),
      description: asText(entry.description) || null,
      dueDate: entry.dueDate ?? entry.due_date ?? null,
      required: entry.required === undefined ? true : Boolean(entry.required),
    }));

/**
 * Approvando, il club chiede cio che manca **invece di respingere**.
 *
 * Il difetto che chiude e concreto: l'unica risposta a «manca il certificato
 * medico» era il rifiuto, e il rifiuto costa alla famiglia una compilazione da
 * rifare e alla segreteria una seconda pratica identica alla prima da
 * riesaminare. Un documento mancante non e un'iscrizione sbagliata: e un
 * documento mancante, e ha gia un dominio che lo sa gestire — con scadenza,
 * sollecito, deposito e verifica.
 *
 * **Non e un secondo modo di chiedere un documento**: chiama
 * `createDocumentRequest`, che resta l'unico scrittore del fascicolo, applica
 * il permesso `documents.request` e scrive l'audit. Qui sopra c'e solo la
 * normalizzazione dell'input e la regola di non ripetersi.
 *
 * **Non chiede niente se non c'e un atleta.** Una richiesta documentale si
 * intesta a una persona, e la persona nasce dall'approvazione: se
 * l'approvazione non ne ha scritta nessuna non c'e nessuno a cui chiedere, e
 * inventare un soggetto sarebbe peggio che non chiedere.
 */
export const requestMissingDocuments = async (
  scope: {
    userId: string;
    activeOrganizationId: string | null;
    activeRole?: string | null;
    allowedOrganizationIds: string[];
  },
  input: {
    organizationId: string;
    athleteId: string;
    seasonId?: string | null;
    documents: unknown;
  },
): Promise<string[]> => {
  const documenti = normalizeMissingDocuments(input.documents);
  if (!documenti.length) return [];

  const athleteId = asText(input.athleteId);
  if (!athleteId) {
    throw new Error(
      "Nessun atleta scritto da questa approvazione: non c'e nessuno a cui chiedere il documento.",
    );
  }

  /*
    Le richieste gia aperte sullo stesso documento non si ripetono. Serve
    all'idempotenza dell'approvazione — che puo essere ritentata dopo
    un'interruzione — e serve alla famiglia: due righe «Certificato medico» nel
    fascicolo si leggono come due certificati da consegnare.
  */
  const aperte = (await prisma.documentRequest.findMany({
    where: {
      organization_id: input.organizationId,
      subject_kind: "athlete",
      subject_id: athleteId,
      status: "open",
    },
    select: { document_kind: true },
  })) as unknown as Array<{ document_kind: string }>;

  const gia = new Set(aperte.map((request) => asText(request.document_kind)));
  const applied: string[] = [];

  for (const documento of documenti) {
    if (gia.has(asText(documento.documentKind))) continue;

    const creata = await createDocumentRequest(scope, {
      organizationId: input.organizationId,
      subjectKind: "athlete",
      subjectId: athleteId,
      documentKind: documento.documentKind,
      title: asText(documento.title) || asText(documento.documentKind),
      description: asText(documento.description) || null,
      required: Boolean(documento.required),
      dueDate: (documento.dueDate as any) || null,
      seasonId: asText(input.seasonId) || null,
    });

    gia.add(asText(documento.documentKind));
    applied.push(`Documento richiesto alla famiglia: ${creata.title}`);
  }

  return applied;
};
