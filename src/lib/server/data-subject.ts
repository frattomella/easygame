import { createHash } from "node:crypto";

import { prisma } from "./prisma";
import { assertActiveClub } from "@/lib/auth/active-club-boundary";
import { canManageClubConfiguration } from "@/lib/access-roles";
import { roleHasPermission } from "@/lib/permissions/catalog";
import { AUDIT_ACTIONS, recordAuditEvent, recordPermissionDenied } from "./audit";
import { deleteAttachment, listAttachments } from "./attachments";
import { anonymizeDeliveriesForSubject } from "./communication-deliveries";
import {
  hasHealthPermission,
  stripClinicalAthleteFields,
  stripGuardianAccessTokens,
  stripClinicalCertificateFields,
} from "@/lib/health/permissions";

/**
 * **I diritti dell'interessato: portare via i propri dati, e farli sparire.**
 *
 * ## Perche questo modulo e nuovo, e perche non appartiene a nessun dominio
 *
 * Una persona non e una tabella. I dati di un atleta vivono su tabelle con una
 * chiave esterna — dove il database sa dove sono — e su **sei indici
 * polimorfi**, dove il database non lo sa:
 *
 * | Indice | Tabella | Che cosa ci vive |
 * |---|---|---|
 * | `owner_type` / `owner_id` | `attachments` | i file: documenti d'identita, certificati |
 * | `subject_kind` / `subject_id` | `consent_records` | a cosa ha detto di si |
 * | `subject_kind` / `subject_id` | `document_requests` | cosa il club gli ha chiesto |
 * | `subject_kind` / `subject_id` | `document_submissions` | cosa ha consegnato |
 * | `subject_kind` / `subject_id` | `generated_documents` | cosa il club gli ha emesso |
 * | `subjects` (JSON) | `form_submissions` | il modulo compilato, per esteso |
 *
 * Nessuna di queste sei ha una chiave esterna verso `athletes`. Cancellare un
 * atleta le lascia **tutte** in piedi: dopo la cancellazione i dati del minore
 * restano in archivio e non c'e piu niente che li leghi a niente — cioe il
 * caso peggiore, perche il dato resta e la possibilita di trovarlo no.
 *
 * A queste si aggiungono due colonne che citano un atleta **senza** chiave
 * esterna — `club_event_participants.athlete_id` e `payment_links.athlete_id` —
 * e una lista: `communication_deliveries.athlete_ids`.
 *
 * Attraversare tutto questo non e il lavoro degli eventi, ne dei documenti, ne
 * dei consensi: e un lavoro che li attraversa. Per questo il modulo e nuovo
 * (§7 del piano della Wave 6), e per questo e **l'unico** posto in cui si
 * scrive «tutti i posti in cui vive una persona».
 *
 * ## Le tre classi, e perche non sono una
 *
 * - **`delete`** — dati che esistono solo per il servizio erogato a quella
 *   persona. Spariscono.
 * - **`anonymize`** — righe che devono restare perche qualcun altro le
 *   consulta (un documento emesso, una consegna gia partita), ma che non
 *   devono piu **nominare** nessuno.
 * - **`retain`** — righe che una societa e **tenuta** a conservare: incassi,
 *   fatture, ricevute, contributi liquidati da un ente. Non si cancellano e non
 *   si anonimizzano, perche sono la prova di un movimento di denaro verso una
 *   persona identificata. Compaiono nel riepilogo con il motivo: chi chiede la
 *   cancellazione ha diritto di sapere cosa **non** viene cancellato, e perche.
 *
 * ## I minori
 *
 * Il dato di un minore non si cancella in silenzio. `previewDataSubjectErasure`
 * produce il **riepilogo di cio che verra distrutto** e un gettone che ne e
 * l'impronta; `eraseDataSubject` senza quel gettone rifiuta. Non e un
 * meccanismo di sicurezza — chi puo cancellare puo comunque chiedere prima il
 * riepilogo — e un meccanismo che rende **impossibile cancellare senza aver
 * visto**, che e la cosa che serviva davvero.
 */

/* ------------------------------------------------------------------ scope */

export type DataSubjectScope = {
  userId: string;
  activeOrganizationId: string | null;
  allowedOrganizationIds: string[];
  activeRole?: string | null;
};

const denied = (message: string) => new Error(`Accesso negato: ${message}`);

const asText = (value: unknown) => String(value ?? "").trim();

/**
 * **Solo l'atleta, in V1.**
 *
 * Gli altri soggetti dei consensi — `person`, `member`, `guardian` — non hanno
 * una tabella propria: un tutore vive dentro `athletes.data.guardians`, e
 * cancellarlo significa riscrivere l'anagrafica di un altro. E un lavoro
 * diverso, e farlo a meta sarebbe peggio che dichiararlo.
 */
export const DATA_SUBJECT_KINDS = ["athlete"] as const;
export type DataSubjectKind = (typeof DATA_SUBJECT_KINDS)[number];

export type DataSubjectRef = {
  organizationId?: string | null;
  subjectKind?: string | null;
  subjectId: string;
};

const resolveOrganizationId = (
  scope: DataSubjectScope | undefined,
  requested?: string | null,
) => {
  const wanted = asText(requested);

  if (!scope) {
    if (!wanted) throw new Error("Nessun club indicato");
    return wanted;
  }

  if (wanted) {
    assertActiveClub(scope, wanted, "i dati della persona");
    return wanted;
  }

  if (scope.activeOrganizationId) return scope.activeOrganizationId;
  throw new Error("Nessun club attivo selezionato");
};

/**
 * **Chi puo esportare e chi puo cancellare.**
 *
 * La stessa porta, e non e una semplificazione: entrambe le operazioni portano
 * fuori — o distruggono — l'intero fascicolo di una persona, comprese le
 * categorie che un operatore di segreteria non vede nemmeno una alla volta.
 * Passa da `canManageClubConfiguration`, cioe proprietario e gestore, e la
 * riga di audit dice chi e stato.
 */
const assertCanDispose = async (
  scope: DataSubjectScope | undefined,
  organizationId: string,
  /*
    Una o **piu** chiavi, e basta averne una.

    L'inventario non ha una chiave propria: e la meta in lettura dello stesso
    diritto, e chi puo esportare o cancellare deve poter vedere cosa. Dargliene
    una terza avrebbe significato che un club che concede l'export senza
    l'inventario rompe l'export, perche l'export legge l'inventario per primo:
    tre caselle per due diritti, e una combinazione che non funziona.

    L'audit registra la **prima**, che e quella che nomina l'atto.
  */
  permission: string | readonly string[],
  subjectId: string,
) => {
  /*
    **Uno scope assente nega.**

    Qui c'era `if (!scope) return`, cioe: senza scope si passa. E la stessa
    forma che `14-security.md` §6-octies classifica come difetto di classe 1 —
    una guardia che, non sapendo, lascia fare — e questa protegge l'export **e**
    la cancellazione di una persona. Oggi l'unico chiamante lo passa sempre, ma
    «oggi c'e un solo chiamante» e la premessa che ogni difetto di questa
    famiglia ha avuto prima di diventare raggiungibile.
  */
  if (!scope) {
    throw new Error(
      "Accesso negato: questa operazione richiede una sessione con un club attivo",
    );
  }
  /*
    **Il ruolo non basta piu, e serve anche la chiave.**

    Qui c'era solo `canManageClubConfiguration`, che guarda il **ruolo base**:
    `normalizeAccessRole` di un gettone `custom:club_manager:...` risponde
    `club_manager`, quindi ogni ruolo personalizzato costruito su quella base
    portava con se l'export e la **cancellazione irreversibile** del fascicolo
    di una persona, spesso di un minore. E non era togliibile: la chiave non
    esisteva, quindi nell'editor non c'era una casella da spegnere.

    Le due condizioni sono in **AND**, e la seconda non sostituisce la prima:
    il ruolo base dice chi puo *in astratto* trattare il fascicolo di una
    persona — la direzione — e la chiave dice se **questo** ruolo lo puo
    ancora. Un ruolo personalizzato a cui il club l'ha tolta riceve
    «Accesso negato», e il diniego lascia la sua riga.

    Le due chiavi sono di direzione, quindi un ruolo che le porta lo puo
    assegnare **solo il proprietario**: la cancellazione dei dati di una
    persona non si delega di rimbalzo.
  */
  const chiavi = Array.isArray(permission)
    ? (permission as readonly string[])
    : [permission as string];

  if (
    canManageClubConfiguration(scope.activeRole) &&
    chiavi.some((chiave) => roleHasPermission(scope.activeRole, chiave))
  ) {
    return;
  }

  await recordPermissionDenied({
    scope: {
      userId: scope.userId,
      activeRole: scope.activeRole || null,
      activeOrganizationId: organizationId,
    },
    permission: chiavi[0],
    resource: "data_subject",
    resourceId: subjectId,
  });

  throw denied(
    "il fascicolo completo di una persona lo tratta la direzione del club",
  );
};

const requireAthlete = async (organizationId: string, subjectId: string) => {
  const id = asText(subjectId);
  if (!id) throw new Error("Manca la persona");

  const athlete = await (prisma as any).athlete.findFirst({
    where: { id, organization_id: organizationId },
  });

  if (!athlete) throw new Error("Persona non trovata in questo club");
  return athlete;
};

/* -------------------------------------------------------------- inventario */

export type DataSubjectDisposal = "delete" | "anonymize" | "retain";

export type DataSubjectSlice = {
  /** Il nome fisico della tabella: e cosi che si ritrova in `RETENTION.md`. */
  table: string;
  label: string;
  /** Come ci si arriva. `polymorphic` e `json` sono quelle che si perdevano. */
  index: "foreign_key" | "polymorphic" | "json" | "column";
  count: number;
  disposal: DataSubjectDisposal;
  /** Obbligatorio quando `disposal` e `retain`. */
  reason?: string;
};

export type DataSubjectInventory = {
  organizationId: string;
  subjectKind: DataSubjectKind;
  subjectId: string;
  subjectLabel: string;
  /**
   * Vero quando la data di nascita dice che la persona e minorenne, e `null`
   * quando la data non c'e. **`null` si tratta come minore**: in una societa
   * sportiva un'anagrafica senza data di nascita e quasi sempre un ragazzo
   * inserito in fretta, e il default prudente costa una conferma in piu.
   */
  isMinor: boolean;
  slices: DataSubjectSlice[];
  totals: {
    rows: number;
    toDelete: number;
    toAnonymize: number;
    retained: number;
  };
  /** L'impronta del piano: vedi `eraseDataSubject`. */
  confirmationToken: string;
};

const MINOR_AGE = 18;

const isMinorAt = (birthDate: unknown, now: Date) => {
  if (!birthDate) return true;
  const born = new Date(birthDate as any);
  if (Number.isNaN(born.getTime())) return true;

  const eighteen = new Date(born);
  eighteen.setFullYear(eighteen.getFullYear() + MINOR_AGE);
  return eighteen.getTime() > now.getTime();
};

/**
 * Le compilazioni che nominano questa persona.
 *
 * `form_submissions.subjects` e un JSON — `FormSubjectSelection[]` — e Postgres
 * non ha un indice che risponda a «quali contengono questo `recordId`». Si
 * legge quindi per club e si filtra in memoria. **E deliberato e va detto**:
 * questa funzione gira quando qualcuno esercita un diritto, cioe qualche volta
 * l'anno, non a ogni richiesta.
 */
const readFormSubmissionsForSubject = async (
  organizationId: string,
  subjectId: string,
) => {
  const rows = await (prisma as any).formSubmission.findMany({
    where: { organization_id: organizationId },
  });

  const mie: any[] = [];
  const condivise: any[] = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const subjects = Array.isArray(row?.subjects) ? row.subjects : [];
    const cita = subjects.some(
      (subject: any) => asText(subject?.recordId) === subjectId,
    );
    if (!cita) continue;

    /*
      Una compilazione che riguarda **solo** questa persona si cancella. Una
      che ne riguarda anche altre no: le risposte sono un testo unico, e
      cancellarla toglierebbe a un'altra famiglia il proprio modulo. Quella
      resta, la citazione sparisce, e la riga finisce nel residuo con il
      motivo: e un lavoro che una persona deve guardare, non un caso che il
      codice puo decidere da solo.
    */
    const altri = subjects.filter(
      (subject: any) => asText(subject?.recordId) !== subjectId,
    );
    if (altri.length === 0) mie.push(row);
    else condivise.push(row);
  }

  return { mie, condivise };
};

const digestOf = (slices: DataSubjectSlice[], subjectId: string) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        subjectId,
        slices.map((slice) => [slice.table, slice.count, slice.disposal]),
      ]),
    )
    .digest("hex")
    .slice(0, 32);

/**
 * **Il riepilogo di cio che verra distrutto.**
 *
 * E la funzione che il §15.3 del piano chiede per i minori, ed e utile per
 * chiunque: nessuno dovrebbe premere «cancella» senza vedere l'elenco.
 */
export const previewDataSubjectErasure = async (
  scope: DataSubjectScope | undefined,
  ref: DataSubjectRef,
  now = new Date(),
): Promise<DataSubjectInventory> => {
  const organizationId = resolveOrganizationId(scope, ref.organizationId);
  const subjectKind = (asText(ref.subjectKind) || "athlete").toLowerCase();

  if (!DATA_SUBJECT_KINDS.includes(subjectKind as DataSubjectKind)) {
    throw new Error(
      "In questa versione l'esercizio dei diritti riguarda un atleta",
    );
  }

  const subjectId = asText(ref.subjectId);
  await assertCanDispose(
    scope,
    organizationId,
    ["data_subject.export", "data_subject.erase"],
    subjectId,
  );

  const athlete = await requireAthlete(organizationId, subjectId);

  /*
    `catch` e non `?.`: una tabella che una lane sorella sta ancora
    introducendo (`athlete_account_invites`, lane 6C) non deve far fallire il
    riepilogo di una cancellazione. Zero righe e la risposta giusta, e il
    conteggio ricomparira da solo il giorno in cui la tabella c'e.
  */
  const conta = async (delegate: string, where: Record<string, unknown>) => {
    try {
      return Number((await (prisma as any)[delegate].count({ where })) || 0);
    } catch {
      return 0;
    }
  };

  const [
    certificati,
    allegati,
    consensi,
    richieste,
    depositi,
    documentiEmessi,
    partecipazioni,
    appartenenze,
    appuntamenti,
    linkPagamento,
    consegne,
    inviti,
    rate,
    incassi,
    fatture,
    ricevute,
    bandi,
  ] = await Promise.all([
    conta("medicalCertificate", { athlete_id: subjectId }),
    conta("attachment", {
      organization_id: organizationId,
      owner_type: "athlete",
      owner_id: subjectId,
    }),
    conta("consentRecord", {
      organization_id: organizationId,
      subject_kind: "athlete",
      subject_id: subjectId,
    }),
    conta("documentRequest", {
      organization_id: organizationId,
      subject_kind: "athlete",
      subject_id: subjectId,
    }),
    conta("documentSubmission", {
      organization_id: organizationId,
      subject_kind: "athlete",
      subject_id: subjectId,
    }),
    conta("generatedDocument", {
      organization_id: organizationId,
      subject_kind: "athlete",
      subject_id: subjectId,
    }),
    conta("clubEventParticipant", {
      organization_id: organizationId,
      athlete_id: subjectId,
    }),
    conta("athleteCategoryMembership", { athlete_id: subjectId }),
    conta("appointment", {
      organization_id: organizationId,
      athlete_id: subjectId,
    }),
    conta("paymentLink", {
      organization_id: organizationId,
      athlete_id: subjectId,
    }),
    conta("communicationDelivery", {
      organization_id: organizationId,
      athlete_ids: { has: subjectId },
    }),
    conta("athleteAccountInvite", {
      organization_id: organizationId,
      athlete_id: subjectId,
    }),
    conta("athletePayment", { athlete_id: subjectId }),
    conta("paymentTransaction", { athlete_id: subjectId }),
    conta("invoice", { athlete_id: subjectId }),
    conta("receipt", { athlete_id: subjectId }),
    conta("fundingEnrollment", { athlete_id: subjectId }),
  ]);

  const moduli = await readFormSubmissionsForSubject(organizationId, subjectId);

  const slices: DataSubjectSlice[] = [
    {
      table: "medical_certificates",
      label: "Certificati medici",
      index: "foreign_key",
      count: Number(certificati || 0),
      disposal: "delete",
    },
    {
      table: "attachments",
      label: "File depositati (documenti, certificati, foto)",
      index: "polymorphic",
      count: Number(allegati || 0),
      disposal: "delete",
    },
    {
      table: "consent_records",
      label: "Registro dei consensi",
      index: "polymorphic",
      count: Number(consensi || 0),
      disposal: "delete",
    },
    {
      table: "document_requests",
      label: "Richieste documentali",
      index: "polymorphic",
      count: Number(richieste || 0),
      disposal: "delete",
    },
    {
      table: "document_submissions",
      label: "Consegne documentali",
      index: "polymorphic",
      count: Number(depositi || 0),
      disposal: "delete",
    },
    {
      table: "form_submissions",
      label: "Moduli compilati che riguardano solo questa persona",
      index: "json",
      count: moduli.mie.length,
      disposal: "delete",
    },
    {
      table: "form_submissions (condivisi)",
      label: "Moduli compilati che riguardano anche altri",
      index: "json",
      count: moduli.condivise.length,
      disposal: "anonymize",
      reason:
        "Le risposte sono un testo unico: si toglie la citazione della persona, il resto va riletto da un operatore",
    },
    {
      table: "generated_documents",
      label: "Documenti emessi dalla societa",
      index: "polymorphic",
      count: Number(documentiEmessi || 0),
      disposal: "anonymize",
      reason: "Un documento emesso resta, ma smette di nominare la persona",
    },
    {
      table: "club_event_participants",
      label: "Convocazioni, risposte e presenze",
      index: "column",
      count: Number(partecipazioni || 0),
      disposal: "delete",
    },
    {
      table: "athlete_category_memberships",
      label: "Appartenenze alle categorie",
      index: "foreign_key",
      count: Number(appartenenze || 0),
      disposal: "delete",
    },
    {
      table: "appointments",
      label: "Appuntamenti con la segreteria",
      index: "foreign_key",
      count: Number(appuntamenti || 0),
      disposal: "delete",
    },
    {
      table: "payment_links",
      label: "Link di pagamento emessi",
      index: "column",
      count: Number(linkPagamento || 0),
      disposal: "delete",
    },
    {
      table: "athlete_account_invites",
      label: "Inviti all'accesso dell'atleta",
      index: "foreign_key",
      count: Number(inviti || 0),
      disposal: "delete",
    },
    {
      table: "communication_deliveries",
      label: "Registro delle comunicazioni inviate",
      index: "column",
      count: Number(consegne || 0),
      disposal: "anonymize",
      reason:
        "La consegna e gia avvenuta: resta il fatto, sparisce il destinatario",
    },
    {
      table: "athletes",
      label: "Anagrafica dell'atleta",
      index: "foreign_key",
      count: 1,
      disposal: "anonymize",
      reason:
        "La riga resta come segnaposto finche esistono movimenti di denaro che la citano",
    },
    {
      table: "athlete_payments",
      label: "Rate e quote",
      index: "foreign_key",
      count: Number(rate || 0),
      disposal: "retain",
      reason: "Posizione economica: la societa e tenuta a conservarla",
    },
    {
      table: "payment_transactions",
      label: "Incassi",
      index: "foreign_key",
      count: Number(incassi || 0),
      disposal: "retain",
      reason: "Movimento di denaro: si conserva, non si cancella e non si storna qui",
    },
    {
      table: "invoices",
      label: "Fatture",
      index: "foreign_key",
      count: Number(fatture || 0),
      disposal: "retain",
      reason: "Documento fiscale emesso: obbligo di conservazione",
    },
    {
      table: "receipts",
      label: "Ricevute",
      index: "foreign_key",
      count: Number(ricevute || 0),
      disposal: "retain",
      reason: "Documento fiscale emesso: obbligo di conservazione",
    },
    {
      table: "funding_enrollments",
      label: "Iscrizioni a bandi e contributi",
      index: "foreign_key",
      count: Number(bandi || 0),
      disposal: "retain",
      reason:
        "Attribuzione di denaro pubblico: la rendicontazione all'ente la cita",
    },
  ];

  const somma = (disposal: DataSubjectDisposal) =>
    slices
      .filter((slice) => slice.disposal === disposal)
      .reduce((total, slice) => total + slice.count, 0);

  return {
    organizationId,
    subjectKind: "athlete",
    subjectId,
    subjectLabel:
      `${asText(athlete.first_name)} ${asText(athlete.last_name)}`.trim() ||
      "Atleta",
    isMinor: isMinorAt(athlete.birth_date, now),
    slices,
    totals: {
      rows: slices.reduce((total, slice) => total + slice.count, 0),
      toDelete: somma("delete"),
      toAnonymize: somma("anonymize"),
      retained: somma("retain"),
    },
    confirmationToken: digestOf(slices, subjectId),
  };
};

/* ------------------------------------------------------------------ export */

export type DataSubjectExport = {
  generatedAt: string;
  organizationId: string;
  /**
   * Vero quando chi ha esportato non ha `clinical.read`: il contenuto clinico
   * e stato tolto. **Si dichiara**, non si tace: un export che non dice cosa
   * non contiene viene creduto completo da chi lo riceve.
   */
  clinicalContentOmitted: boolean;
  subject: { kind: DataSubjectKind; id: string; label: string };
  inventory: DataSubjectInventory;
  sections: Record<string, unknown[]>;
};

/**
 * **Portare via i propri dati.**
 *
 * Un oggetto solo, con una sezione per tabella. Le sezioni si chiamano come le
 * tabelle e non come le schermate: chi riceve l'export deve poterlo confrontare
 * con `RETENTION.md`, e i nomi delle schermate cambiano.
 *
 * **Nessun byte.** Gli allegati compaiono come elenco di metadati — nome, tipo,
 * dimensione, impronta — e non come contenuto: mettere dentro un JSON i file di
 * un'anagrafica produce un oggetto che nessuno riesce a spostare, e i byte si
 * scaricano dalla loro rotta uno per uno.
 */
export const exportDataSubject = async (
  scope: DataSubjectScope | undefined,
  ref: DataSubjectRef,
  now = new Date(),
): Promise<DataSubjectExport> => {
  const inventory = await previewDataSubjectErasure(scope, ref, now);
  const { organizationId, subjectId } = inventory;

  await assertCanDispose(
    scope,
    organizationId,
    "data_subject.export",
    subjectId,
  );

  const moduli = await readFormSubmissionsForSubject(organizationId, subjectId);

  const [
    athlete,
    certificati,
    allegati,
    consensi,
    richieste,
    depositi,
    documentiEmessi,
    partecipazioni,
    appartenenze,
    appuntamenti,
    consegne,
    rate,
    incassi,
    fatture,
    ricevute,
    bandi,
  ] = await Promise.all([
    requireAthlete(organizationId, subjectId),
    (prisma as any).medicalCertificate.findMany({
      where: { athlete_id: subjectId },
    }),
    listAttachments(
      { organizationId, ownerType: "athlete", ownerId: subjectId },
      scope
        ? {
            userId: scope.userId,
            activeOrganizationId: scope.activeOrganizationId,
            allowedOrganizationIds: scope.allowedOrganizationIds,
          }
        : undefined,
    ),
    (prisma as any).consentRecord.findMany({
      where: {
        organization_id: organizationId,
        subject_kind: "athlete",
        subject_id: subjectId,
      },
    }),
    (prisma as any).documentRequest.findMany({
      where: {
        organization_id: organizationId,
        subject_kind: "athlete",
        subject_id: subjectId,
      },
    }),
    (prisma as any).documentSubmission.findMany({
      where: {
        organization_id: organizationId,
        subject_kind: "athlete",
        subject_id: subjectId,
      },
    }),
    (prisma as any).generatedDocument.findMany({
      where: {
        organization_id: organizationId,
        subject_kind: "athlete",
        subject_id: subjectId,
      },
    }),
    (prisma as any).clubEventParticipant.findMany({
      where: { organization_id: organizationId, athlete_id: subjectId },
    }),
    (prisma as any).athleteCategoryMembership.findMany({
      where: { athlete_id: subjectId },
    }),
    (prisma as any).appointment.findMany({
      where: { organization_id: organizationId, athlete_id: subjectId },
    }),
    (prisma as any).communicationDelivery.findMany({
      where: {
        organization_id: organizationId,
        athlete_ids: { has: subjectId },
      },
    }),
    (prisma as any).athletePayment.findMany({ where: { athlete_id: subjectId } }),
    (prisma as any).paymentTransaction.findMany({
      where: { athlete_id: subjectId },
    }),
    (prisma as any).invoice.findMany({ where: { athlete_id: subjectId } }),
    (prisma as any).receipt.findMany({ where: { athlete_id: subjectId } }),
    (prisma as any).fundingEnrollment.findMany({
      where: { athlete_id: subjectId },
    }),
  ]);

  await recordAuditEvent({
    action: AUDIT_ACTIONS.dataSubjectExported,
    outcome: "success",
    actorUserId: scope?.userId || null,
    actorRole: scope?.activeRole || null,
    organizationId,
    resource: "data_subject",
    resourceId: subjectId,
    metadata: { rows: inventory.totals.rows, minor: inventory.isMinor },
  });

  /*
    **Il contenuto clinico non esce da qui a chi non ha la chiave.**

    L'export usciva con le righe intere di `medical_certificates` — che
    portano `notes` e `data`, cioe allergie, patologie, farmaci, gruppo
    sanguigno — e con la riga intera dell'atleta. L'unico controllo era
    `canManageClubConfiguration`, che guarda il **ruolo** e non consulta
    nessuna chiave.

    Con i ruoli personalizzati della Wave 6 la conseguenza si vede: uno slug
    `custom:club_manager:...` si normalizza su `club_manager`, quindi un ruolo
    a cui il club ha **tolto** `clinical.read` esportava comunque il fascicolo
    clinico completo. La regola del dominio (`src/lib/health/permissions.ts`)
    e che lo **stato** del certificato e operativo e il **contenuto** e a
    default negato: qui valeva solo la prima meta.

    L'omissione viene **dichiarata** invece che taciuta: un export che tace cosa
    non contiene e peggio di uno che lo dice, perche chi lo riceve lo crede
    completo. E la stessa ragione per cui gli allegati escono come metadato con
    scritto che i byte stanno altrove.
  */
  const puoLeggereIlClinico = hasHealthPermission(
    scope?.activeRole,
    "clinical.read",
  );

  const atletaProiettato = puoLeggereIlClinico
    ? athlete
    : { ...athlete, data: stripClinicalAthleteFields(athlete?.data) };

  /*
    **E la credenziale non esce nemmeno da qui, a nessuno.**

    Il taglio sopra e clinico e dipende da `clinical.read`; il gettone del
    tutore non e clinico e non dipende da niente. Misurato: un ruolo con
    `data_subject.export` e senza chiave clinica riceveva un export in cui le
    allergie erano tolte **e il gettone c'era** — nella stessa risposta.

    Qui la regola e piu stretta che altrove e deve esserlo: questo file si
    **consegna** a una famiglia. Una credenziale viva dentro un export e una
    credenziale consegnata a chi non doveva averla, senza nemmeno un attacco.
  */
  atletaProiettato.data = stripGuardianAccessTokens(atletaProiettato.data);

  const certificatiProiettati = puoLeggereIlClinico
    ? certificati
    : (certificati as Record<string, any>[]).map((riga) =>
        stripClinicalCertificateFields(riga),
      );

  return {
    generatedAt: now.toISOString(),
    organizationId,
    /** Vero quando chi esporta non ha `clinical.read`: l'export lo dichiara. */
    clinicalContentOmitted: !puoLeggereIlClinico,
    subject: {
      kind: "athlete",
      id: subjectId,
      label: inventory.subjectLabel,
    },
    inventory,
    sections: {
      athletes: [atletaProiettato],
      medical_certificates: certificatiProiettati,
      attachments: allegati,
      consent_records: consensi,
      document_requests: richieste,
      document_submissions: depositi,
      generated_documents: documentiEmessi,
      form_submissions: [...moduli.mie, ...moduli.condivise],
      club_event_participants: partecipazioni,
      athlete_category_memberships: appartenenze,
      appointments: appuntamenti,
      communication_deliveries: consegne,
      athlete_payments: rate,
      payment_transactions: incassi,
      invoices: fatture,
      receipts: ricevute,
      funding_enrollments: bandi,
    },
  };
};

/* ------------------------------------------------------------ cancellazione */

/** Il testo con cui una riga smette di nominare qualcuno. */
export const ANONYMIZED_LABEL = "[dato cancellato]";

export type DataSubjectErasureReport = {
  organizationId: string;
  subjectId: string;
  erasedAt: string;
  deleted: Record<string, number>;
  anonymized: Record<string, number>;
  retained: DataSubjectSlice[];
  /** Cio che una persona deve guardare a mano. Puo essere vuoto. */
  manualReview: Array<{ table: string; id: string; why: string }>;
};

/**
 * **Cancella, anonimizza, e dichiara cosa resta.**
 *
 * `confirmationToken` e l'impronta del riepilogo prodotto da
 * `previewDataSubjectErasure`: se l'inventario e cambiato da quando e stato
 * mostrato — un certificato caricato nel frattempo, una fattura emessa — il
 * gettone non corrisponde e la cancellazione **non parte**. E la stessa idea
 * del controllo di versione su una modifica concorrente, applicata alla cosa
 * che non si puo annullare.
 *
 * **Non e in una transazione, e va detto.** Gli allegati passano da
 * `attachments.ts` perche i byte hanno un solo proprietario (ADR-0034), e il
 * driver di archiviazione non partecipa a una transazione del database. Una
 * cancellazione interrotta a meta lascia quindi **meno** dati, mai di piu: e
 * l'unico verso in cui un'interruzione e accettabile, e ripetere l'operazione
 * la completa.
 */
export const eraseDataSubject = async (
  scope: DataSubjectScope | undefined,
  ref: DataSubjectRef & {
    confirmationToken: string;
    /** Obbligatorio quando l'inventario dice `isMinor`. */
    acknowledgeMinor?: boolean;
    reason?: string;
  },
  now = new Date(),
): Promise<DataSubjectErasureReport> => {
  const inventory = await previewDataSubjectErasure(scope, ref, now);
  const { organizationId, subjectId } = inventory;

  await assertCanDispose(scope, organizationId, "data_subject.erase", subjectId);

  if (asText(ref.confirmationToken) !== inventory.confirmationToken) {
    throw new Error(
      "Il riepilogo di cio che verra cancellato e cambiato, o non e stato letto: " +
        "richiedilo di nuovo e conferma quello.",
    );
  }

  if (inventory.isMinor && ref.acknowledgeMinor !== true) {
    throw new Error(
      "Questa persona risulta minorenne: la cancellazione richiede una conferma esplicita " +
        "di aver letto cosa verra distrutto.",
    );
  }

  const deleted: Record<string, number> = {};
  const anonymized: Record<string, number> = {};
  const manualReview: DataSubjectErasureReport["manualReview"] = [];

  const conta = (bucket: Record<string, number>, table: string, n: unknown) => {
    bucket[table] = (bucket[table] || 0) + Number(n || 0);
  };

  /*
    **I file per primi.** Sono l'unica cosa che vive fuori dal database, e
    l'unica che una riga cancellata renderebbe irraggiungibile: togliere prima
    la riga e poi il blob significa, se qualcosa si interrompe in mezzo, un
    blob che nessuno sa piu di avere.
  */
  const allegati = await listAttachments(
    { organizationId, ownerType: "athlete", ownerId: subjectId },
    scope
      ? {
          userId: scope.userId,
          activeOrganizationId: scope.activeOrganizationId,
          allowedOrganizationIds: scope.allowedOrganizationIds,
        }
      : undefined,
  );

  for (const allegato of allegati) {
    await deleteAttachment(
      allegato.id,
      scope
        ? {
            userId: scope.userId,
            activeOrganizationId: scope.activeOrganizationId,
            allowedOrganizationIds: scope.allowedOrganizationIds,
          }
        : undefined,
    );
    conta(deleted, "attachments", 1);
  }

  const cancella = async (
    table: string,
    delegate: string,
    where: Record<string, unknown>,
  ) => {
    const result = await (prisma as any)[delegate].deleteMany({ where });
    conta(deleted, table, result?.count || 0);
  };

  await cancella("medical_certificates", "medicalCertificate", {
    athlete_id: subjectId,
  });
  await cancella("consent_records", "consentRecord", {
    organization_id: organizationId,
    subject_kind: "athlete",
    subject_id: subjectId,
  });
  /*
    Prima i depositi e poi le richieste: un deposito cita la richiesta, e
    l'ordine inverso lascerebbe la cancellazione a decidere il database.
  */
  await cancella("document_submissions", "documentSubmission", {
    organization_id: organizationId,
    subject_kind: "athlete",
    subject_id: subjectId,
  });
  await cancella("document_requests", "documentRequest", {
    organization_id: organizationId,
    subject_kind: "athlete",
    subject_id: subjectId,
  });
  await cancella("club_event_participants", "clubEventParticipant", {
    organization_id: organizationId,
    athlete_id: subjectId,
  });
  await cancella("athlete_category_memberships", "athleteCategoryMembership", {
    athlete_id: subjectId,
  });
  await cancella("appointments", "appointment", {
    organization_id: organizationId,
    athlete_id: subjectId,
  });
  await cancella("payment_links", "paymentLink", {
    organization_id: organizationId,
    athlete_id: subjectId,
  });

  try {
    await cancella("athlete_account_invites", "athleteAccountInvite", {
      organization_id: organizationId,
      athlete_id: subjectId,
    });
  } catch {
    /* La tabella e della lane 6C: se non c'e ancora, non e un errore. */
  }

  const moduli = await readFormSubmissionsForSubject(organizationId, subjectId);

  for (const submission of moduli.mie) {
    await (prisma as any).formSubmission.delete({ where: { id: submission.id } });
    conta(deleted, "form_submissions", 1);
  }

  for (const submission of moduli.condivise) {
    const subjects = (Array.isArray(submission.subjects)
      ? submission.subjects
      : []
    ).map((subject: any) =>
      asText(subject?.recordId) === subjectId
        ? { ...subject, recordId: "", label: ANONYMIZED_LABEL }
        : subject,
    );

    await (prisma as any).formSubmission.update({
      where: { id: submission.id },
      data: { subjects },
    });
    conta(anonymized, "form_submissions", 1);
    manualReview.push({
      table: "form_submissions",
      id: String(submission.id),
      why: "La compilazione riguarda anche altre persone: le risposte vanno rilette a mano",
    });
  }

  const documenti = await (prisma as any).generatedDocument.updateMany({
    where: {
      organization_id: organizationId,
      subject_kind: "athlete",
      subject_id: subjectId,
    },
    data: { subject_label: ANONYMIZED_LABEL },
  });
  conta(anonymized, "generated_documents", documenti?.count || 0);

  /*
    **Il registro delle consegne lo tocca il suo proprietario.**

    L'anonimizzazione scritta qui dentro lasciava in chiaro `recipient_key` —
    che porta l'indirizzo email normalizzato, non un identificativo — e
    `subject`, che e testo composto da un modello e puo nominare chiunque.
    Sono le due colonne che questo modulo non sapeva di dover trattare, ed e
    esattamente cio che l'ownership esiste per evitare: chi conosce la forma di
    una riga e chi la scrive tutti i giorni.

    `anonymizeDeliveriesForSubject` dichiara cosa resta e perche: la consegna
    e una prova di adempimento, e il fatto — quando e partita, su quale canale,
    con quale esito — non e un dato di nessuno.
  */
  const consegne = await anonymizeDeliveriesForSubject({
    organizationId,
    athleteId: subjectId,
    label: ANONYMIZED_LABEL,
  });
  conta(anonymized, "communication_deliveries", consegne.anonymized);

  for (const riga of consegne.manualReview) {
    manualReview.push({
      table: "communication_deliveries",
      id: riga.id,
      why: riga.why,
    });
  }

  /*
    **L'anagrafica resta come segnaposto.** Cancellare la riga la porterebbe
    via insieme a `athlete_id` di rate, incassi, fatture e ricevute — che sono
    `SetNull`, quindi resterebbero senza sapere piu di chi sono. Un movimento
    di denaro senza beneficiario e esattamente cio che le guardie fiscali di
    `resources.ts` esistono per impedire.

    `data` si azzera per intero e non campo per campo: e un dizionario libero,
    e negli anni ci e finito dentro di tutto — tutori, indirizzi, note. Un
    elenco di chiavi da ripulire sarebbe incompleto il giorno dopo.
  */
  await (prisma as any).athlete.update({
    where: { id: subjectId },
    data: {
      first_name: ANONYMIZED_LABEL,
      last_name: "",
      birth_date: null,
      avatar_url: null,
      access_code: null,
      jersey_number: null,
      user_id: null,
      status: "inactive",
      data: { anonymizedAt: now.toISOString() },
    },
  });
  conta(anonymized, "athletes", 1);

  const retained = inventory.slices.filter(
    (slice) => slice.disposal === "retain" && slice.count > 0,
  );

  await recordAuditEvent({
    action: AUDIT_ACTIONS.dataSubjectErased,
    outcome: "success",
    actorUserId: scope?.userId || null,
    actorRole: scope?.activeRole || null,
    organizationId,
    resource: "data_subject",
    resourceId: subjectId,
    metadata: {
      minor: inventory.isMinor,
      reason: asText(ref.reason) || null,
      deleted,
      anonymized,
      retained: retained.map((slice) => `${slice.table}:${slice.count}`),
      manualReview: manualReview.length,
    },
  });

  return {
    organizationId,
    subjectId,
    erasedAt: now.toISOString(),
    deleted,
    anonymized,
    retained,
    manualReview,
  };
};

/* ------------------------------------------------------------- la guardia */

/**
 * **Un dato personale non resta orfano** — gemella delle guardie fiscali di
 * `resources.ts`.
 *
 * Le guardie che esistono su `deleteResource` sono **tutte** sul denaro:
 * `assertPaymentHasNoEconomicHistory`, `assertDocumentNotIssued`,
 * `assertAthleteHasNoSettledFunding`, `assertClubHasNoFiscalHistory`. Nessuna
 * e sulla persona, e la forma del difetto e la stessa che la prima di quelle
 * guardie ha chiuso: **le guardie sono scritte sul nome della risorsa, e
 * Postgres distrugge per raggiungibilita**. Solo che qui e peggio, perche gli
 * indici polimorfi non sono raggiungibili nemmeno da Postgres: cancellare un
 * atleta non li tocca affatto, e i dati del minore restano in archivio slegati
 * da tutto.
 *
 * Questa guardia non impedisce di cancellare: impedisce di cancellare
 * **prima**. La strada resta aperta e passa da `eraseDataSubject`, che quei
 * dati li percorre.
 *
 * **Dove va innestata** (`src/lib/server/resources.ts`, `deleteResource`,
 * subito dopo `assertAthleteHasNoSettledFunding`, riga 5836 a HEAD):
 *
 *     await assertPersonalDataDisposed(resource, existing?.id);
 *
 * Quel file e conteso, quindi la lane 6I lo progetta e lo dichiara, e
 * l'innesto lo fa chi ne e proprietario.
 */
export const assertPersonalDataDisposed = async (
  resource: string,
  athleteId: string,
  organizationId?: string | null,
) => {
  if (resource !== "athletes" && resource !== "simplified_athletes") return;
  const subjectId = asText(athleteId);
  if (!subjectId) return;

  /*
    **La guardia conta con lo stesso filtro con cui l'inventario elenca.**

    Contava per solo `subject_id`, mentre `previewDataSubjectErasure` filtra
    per club su tutte le stesse tabelle. Non era una fuga — un conteggio non
    consegna righe, e gli identificativi sono opachi — ma le due letture
    rispondevano a domande diverse sulla stessa cosa: la guardia poteva vedere
    righe che l'inventario non avrebbe mostrato, e chi si fosse fidato del
    secondo per soddisfare la prima non ci sarebbe riuscito senza capire
    perche.

    E anche la regola 1 di CLAUDE.md §8, che non ha eccezioni annotate:
    nessuna query club-scoped senza filtro `organization_id`.
  */
  const club = asText(organizationId);
  const perClub = club ? { organization_id: club } : {};

  /*
    **Le quattro che si cancellano, e non le altre.**

    `generated_documents` non e qui: un documento emesso non si cancella, si
    **anonimizza** — resta, e smette di nominare qualcuno. Contarlo qui
    renderebbe la guardia insuperabile, perche nessun percorso la potrebbe mai
    soddisfare.

    `form_submissions` non e qui per una ragione diversa e meno soddisfacente:
    il legame vive dentro un JSON, e Postgres non ha un indice che risponda a
    «quali compilazioni contengono questo identificativo». Cercarle vorrebbe
    dire leggere tutte le compilazioni di ogni club a ogni cancellazione di
    anagrafica. `eraseDataSubject` le percorre — e il posto giusto, perche li
    il club e noto e l'operazione e rara — ma questa guardia non le vede, e
    dirlo e meglio che far finta di coprirle.
  */
  const [allegati, consensi, richieste, depositi] = await Promise.all([
    (prisma as any).attachment.count({
      where: { ...perClub, owner_type: "athlete", owner_id: subjectId },
    }),
    (prisma as any).consentRecord.count({
      where: { ...perClub, subject_kind: "athlete", subject_id: subjectId },
    }),
    (prisma as any).documentRequest.count({
      where: { ...perClub, subject_kind: "athlete", subject_id: subjectId },
    }),
    (prisma as any).documentSubmission.count({
      where: { ...perClub, subject_kind: "athlete", subject_id: subjectId },
    }),
  ]);

  const residui = [
    ["file depositati", Number(allegati || 0)],
    ["consensi registrati", Number(consensi || 0)],
    ["richieste documentali", Number(richieste || 0)],
    ["consegne documentali", Number(depositi || 0)],
  ].filter(([, count]) => Number(count) > 0) as Array<[string, number]>;

  if (residui.length === 0) return;

  throw new Error(
    "Questa persona ha dati che non spariscono cancellando l'anagrafica (" +
      residui.map(([label, count]) => `${count} ${label}`).join(", ") +
      "): resterebbero in archivio senza piu niente che li leghi a nessuno. " +
      "Usa la cancellazione dei dati personali, che li percorre uno per uno.",
  );
};
