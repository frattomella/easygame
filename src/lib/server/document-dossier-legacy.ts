import { prisma } from "./prisma";
import { assertActiveClub } from "@/lib/auth/active-club-boundary";
import { getAttachmentMetadata } from "./attachments";
import {
  getDocumentDossier,
  type DocumentDossierEntry,
  type DocumentDossierScope,
} from "./document-requests";
import {
  getSharedDocumentsFromAthlete,
  normalizeSharedDocumentType,
  serializeSharedDocument,
  type SharedDocumentStatus,
} from "@/lib/shared-documents";

/**
 * **Il ponte di lettura fra il fascicolo nuovo e l'archivio storico**, per una
 * release e non di piu (Wave 5, lane 5D, §17).
 *
 * ---
 *
 * ## Perche esiste, e perche e un file a parte
 *
 * Le due rotte legacy — `/api/athletes/:id/documents` e
 * `/api/parent-dashboard/:id/documents` — sono in uso oggi, con una interfaccia
 * che parla la forma di `SharedDocument`. Le loro **scritture** passano da
 * `document-requests.ts` da subito; le loro **letture** devono continuare a
 * mostrare anche cio che sta ancora in `athletes.data.sharedDocuments`, o il
 * giorno del rilascio meta del fascicolo sparirebbe dagli occhi della
 * segreteria senza che nessun dato sia stato perso davvero.
 *
 * Sta in un file suo perche e **cio che si cancella**: la lane 5J rimuove
 * `src/lib/shared-documents.ts`, le due rotte e questo ponte insieme. Un
 * modulo separato rende quella cancellazione una riga di `git rm` invece di una
 * pulizia dentro il servizio nuovo — che e il modo in cui una compatibilita
 * temporanea diventa permanente.
 *
 * ## Cosa questo ponte **non** fa
 *
 * Non travasa. Il passaggio delle righe storiche verso `document_requests`,
 * `document_submissions` e `attachments` e un'operazione una tantum, con un
 * conteggio prima e dopo: farla di nascosto a ogni lettura vorrebbe dire
 * riscrivere un archivio di documenti senza che nessuno stia guardando.
 *
 * Percio una riga storica qui e **in sola lettura**, e ogni tentativo di
 * deciderla o annullarla riceve un messaggio che lo dice.
 */

const asText = (value: unknown) => String(value ?? "").trim();

/** Lo stato ricavato, tradotto nel vocabolario che l'interfaccia legge oggi. */
const toLegacyStatus = (entry: DocumentDossierEntry): SharedDocumentStatus => {
  switch (entry.state.dossier) {
    case "under_review":
      return "under_review";
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    default:
      /*
        Una richiesta senza depositi e «richiesta»; una annullata pure, ma esce
        con `archived: true` e l'interfaccia non la mostra. Il vocabolario
        vecchio non ha un valore per l'annullamento, e inventarne uno qui
        vorrebbe dire insegnarlo a una schermata che sta per sparire.
      */
      return "required";
  }
};

export type LegacySharedDocument = ReturnType<typeof serializeSharedDocument> & {
  /** Vero per le righe che vivono ancora nell'archivio storico. */
  legacy: boolean;
};

const toSharedShape = async (
  scope: DocumentDossierScope,
  entry: DocumentDossierEntry,
): Promise<LegacySharedDocument> => {
  const allegato = entry.state.attachmentId
    ? await getAttachmentMetadata(entry.state.attachmentId, scope)
    : null;

  const ultimo = entry.submissions[entry.submissions.length - 1] || null;

  return {
    ...serializeSharedDocument({
      id: entry.id,
      organizationId: entry.organizationId,
      athleteId: entry.subjectId,
      uploadedByUserId: ultimo?.submittedBy || "",
      uploadedByRole: ultimo?.source === "parent" ? "parent" : "club",
      title: entry.title,
      description: entry.description || "",
      documentType: normalizeSharedDocumentType(entry.documentKind),
      fileUrl: entry.state.attachmentId
        ? allegato?.url || ""
        : "",
      fileName: allegato?.fileName || "",
      mimeType: allegato?.mimeType || "",
      size: Number(allegato?.sizeBytes || 0),
      status: toLegacyStatus(entry),
      required: entry.required,
      dueDate: entry.dueDate || "",
      /* Il motivo del rifiuto: e cio che dice alla famiglia cosa rifare. */
      rejectionReason:
        entry.state.dossier === "rejected" ? entry.state.decisionNote || "" : "",
      visibleToParent: true,
      assetId: entry.state.attachmentId || "",
      uploadedAt: entry.state.submittedAt || "",
      lastReminderAt: entry.lastRemindedAt || "",
      archived: entry.state.status === "cancelled",
      createdAt: entry.createdAt || new Date().toISOString(),
      updatedAt: entry.updatedAt || entry.createdAt || new Date().toISOString(),
      data: {},
    }),
    legacy: false,
  };
};

/**
 * Il fascicolo di un atleta come lo leggono le rotte legacy: **le righe nuove
 * unite a quelle storiche**, senza doppioni.
 *
 * Il permesso e il confine li applica `getDocumentDossier` — ruolo per il club,
 * legame per la famiglia — e non vengono ripetuti qui: due copie della stessa
 * guardia sono il modo in cui la seconda resta indietro.
 *
 * L'archivio storico viene letto **dopo**, e solo per l'atleta gia autorizzato:
 * e la stessa riga di anagrafica che la rotta caricava prima.
 */
export const listAthleteDocumentsWithLegacy = async (
  scope: DocumentDossierScope,
  athleteId: string,
  options: { includeArchived?: boolean } = {},
): Promise<LegacySharedDocument[]> => {
  const entries = await getDocumentDossier(scope, {
    subjectKind: "athlete",
    subjectId: athleteId,
    includeCancelled: Boolean(options.includeArchived),
  });

  const nuovi: LegacySharedDocument[] = [];
  for (const entry of entries) {
    nuovi.push(await toSharedShape(scope, entry));
  }

  const athlete = await prisma.athlete.findFirst({
    where: {
      id: asText(athleteId),
      organization_id: String(scope.activeOrganizationId || ""),
    },
    select: { id: true, organization_id: true, data: true },
  });

  const storici = athlete
    ? getSharedDocumentsFromAthlete(athlete, {
        includeArchived: Boolean(options.includeArchived),
      })
    : [];

  /*
    Un identificativo gia presente fra le righe nuove vince: e cio che accadra
    dopo il travaso, quando la stessa carta esistera nei due posti per il tempo
    che passa fra la scrittura e la ripulitura dell'array JSON.
  */
  const visti = new Set(nuovi.map((documento) => documento.id));

  return [
    ...nuovi,
    ...storici
      .filter((documento) => !visti.has(documento.id))
      .map((documento) => ({
        ...serializeSharedDocument(documento),
        legacy: true,
      })),
  ];
};

/**
 * L'allegato di una voce del fascicolo nuovo, dato l'identificativo che la
 * schermata vecchia ha in mano.
 *
 * Serve alla rotta che consegna il **file** (`/documents/:id/file`): quella
 * rotta cerca ancora in `Asset`, e per un documento entrato dal fascicolo
 * nuovo non troverebbe niente — il pulsante «Visualizza» risponderebbe 404 su
 * un documento che esiste.
 *
 * **Il permesso non si verifica qui**: lo ha gia applicato la rotta, ed e lo
 * stesso che governava questo endpoint prima. Qui si applica il **confine**,
 * che va applicato comunque e riga per riga.
 */
export const resolveDossierAttachmentId = async (
  scope: DocumentDossierScope,
  athleteId: string,
  documentId: string,
): Promise<string | null> => {
  const id = asText(documentId);
  const organizationId = String(scope.activeOrganizationId || "");
  if (!id || !organizationId) return null;

  const depositi = await prisma.documentSubmission.findMany({
    where: {
      organization_id: organizationId,
      subject_kind: "athlete",
      subject_id: asText(athleteId),
      /*
        L'identificativo puo essere quello della richiesta, del deposito o
        dell'allegato: sono i tre che la schermata puo aver messo nella riga, e
        indovinare quale sia costerebbe una lettura in piu per ognuno.
      */
      OR: [{ request_id: id }, { id }, { attachment_id: id }],
    },
    orderBy: { submitted_at: "desc" },
    take: 1,
  });

  const deposito = depositi[0];
  if (!deposito) return null;

  assertActiveClub(scope, deposito.organization_id, "il documento");
  return deposito.attachment_id || null;
};

/**
 * Il messaggio con cui una scrittura su una riga storica viene rifiutata.
 *
 * Non e un errore tecnico ed e scritto per chi lo legge sullo schermo: dice
 * che il documento esiste, che non e stato perso, e cosa lo rendera di nuovo
 * modificabile.
 */
export const legacyDocumentReadOnly = (documentId: string) =>
  new Error(
    `Il documento ${asText(documentId)} appartiene all'archivio storico ed e in sola lettura: ` +
      "entra nel fascicolo nuovo con il travaso della Wave 5, e da li si potra accettare, rifiutare e sollecitare",
  );

/**
 * Vero se quell'identificativo esiste **solo** nell'archivio storico.
 *
 * Si chiede prima di ogni scrittura delle due rotte legacy: senza, il rifiuto
 * arriverebbe come «richiesta non trovata», e chi lo legge penserebbe di aver
 * perso il documento.
 */
export const isLegacyOnlyDocument = async (
  scope: DocumentDossierScope,
  documentId: string,
): Promise<boolean> => {
  const id = asText(documentId);
  if (!id) return false;

  const organizationId = String(scope.activeOrganizationId || "");
  if (!organizationId) return false;

  /*
    **L'identificativo storico conta quanto quello nuovo.**

    Le righe nate dal travaso hanno un `id` proprio, e le due rotte storiche
    confrontano ancora quello che il documento aveva dentro
    `athletes.data.sharedDocuments`. Guardando solo `id` un documento **gia
    travasato** risultava «solo storico» — cioe in sola lettura — per sempre: il
    travaso lo aveva salvato e nessuno riusciva piu a toccarlo.

    `legacy_id` esiste esattamente per questo (migrazione
    `20260901120000_wave5_fascicolo_travaso`).
  */
  const [richiesta, deposito] = await Promise.all([
    prisma.documentRequest.findFirst({
      where: {
        organization_id: organizationId,
        OR: [{ id }, { legacy_id: id }],
      },
      select: { id: true },
    }),
    prisma.documentSubmission.findFirst({
      where: {
        organization_id: organizationId,
        OR: [{ id }, { legacy_id: id }],
      },
      select: { id: true },
    }),
  ]);

  return !richiesta && !deposito;
};

/**
 * L'identificativo **di riga** di un documento, dato quello che la schermata ha
 * in mano — che puo essere ancora quello storico.
 *
 * Restituisce `null` quando il documento vive solo nell'archivio storico: chi
 * chiama lo distingue da «non trovato», che direbbe a una famiglia di aver
 * perso una carta che invece c'e.
 */
export const resolveDocumentRowId = async (
  scope: DocumentDossierScope,
  documentId: string,
): Promise<string | null> => {
  const id = asText(documentId);
  const organizationId = String(scope.activeOrganizationId || "");
  if (!id || !organizationId) return null;

  const richiesta = await prisma.documentRequest.findFirst({
    where: { organization_id: organizationId, OR: [{ id }, { legacy_id: id }] },
    select: { id: true },
  });
  if (richiesta) return richiesta.id;

  const deposito = await prisma.documentSubmission.findFirst({
    where: { organization_id: organizationId, OR: [{ id }, { legacy_id: id }] },
    select: { id: true },
  });

  return deposito?.id || null;
};
