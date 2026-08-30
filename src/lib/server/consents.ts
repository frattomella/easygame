import { prisma } from "./prisma";
import { assertActiveClub } from "@/lib/auth/active-club-boundary";
import { AUDIT_ACTIONS, recordAuditEvent } from "./audit";
import {
  canApplyConsentDecision,
  canTransitionConsentDefinition,
  consentSubjectKey,
  deriveConsentState,
  explainConsentDecisionDenial,
  isConsentSource,
  isConsentStatus,
  isConsentSubjectKind,
  nextConsentVersion,
  normalizeConsentKey,
  validateConsentDefinitionDraft,
  validateConsentVersionDraft,
  type ConsentRecordInput,
  type ConsentState,
  type ConsentStatus,
  type ConsentSubjectKind,
} from "@/lib/consents/model";
import {
  canManageConsentDefinitions,
  canReadConsentRecords,
  canRecordConsentDecision,
} from "@/lib/documents/permissions";

/**
 * Il servizio dei consensi: **l'unico** punto in cui EasyGame legge o scrive
 * una definizione, una versione o una decisione (W3-C, ADR-0090).
 *
 * **Il confine di sicurezza e `organization_id`.** Ogni funzione riceve uno
 * scope e lo applica: nessuna riga di un altro club si legge, si modifica o si
 * cita, e il messaggio contiene «Accesso negato» perche il route handler lo
 * mappi su 403. Vale anche per la **versione**: citare la versione di un altro
 * club sarebbe il modo piu silenzioso di scrivere un consenso che dichiara un
 * testo che quel club non ha mai pubblicato.
 *
 * **Tre scritture, e nessuna e un aggiornamento di stato.**
 *
 * - una **definizione** si crea e si modifica: e configurazione societaria;
 * - una **versione** si pubblica e non si tocca mai piu. Non c'e nessun
 *   `update` su `consent_versions` in questo file, e non deve nascerne uno: e
 *   l'unica risposta possibile a «quale testo ha accettato» che resti vera dopo
 *   che l'informativa e stata corretta;
 * - una **decisione** si aggiunge. Il registro e append-only: revocare
 *   significa scrivere una riga di revoca, non cancellare l'accettazione.
 *
 * **Lo stato attuale non si legge da nessuna colonna**: lo ricava
 * `deriveConsentState` dallo storico. Una colonna di stato accanto a uno
 * storico sono due risposte alla stessa domanda, e prima o poi divergono.
 */

export type ConsentAccessScope = {
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

/* ------------------------------------------------------------- permessi */

/**
 * I tre permessi arrivano da `src/lib/documents/permissions.ts` e non da qui.
 *
 * La matrice del §13 e stata scritta **una volta** nella barriera, e questa
 * lane la importa: la Wave 2 ha imparato che quattro copie della stessa
 * matrice restano indietro in silenzio.
 */
const assertCanManage = (scope: ConsentAccessScope) => {
  if (!canManageConsentDefinitions(scope?.activeRole)) {
    throw denied("i consensi li definisce la direzione del club");
  }
};

const assertCanDecide = (scope: ConsentAccessScope) => {
  if (!canRecordConsentDecision(scope?.activeRole)) {
    throw denied("questa decisione la registra chi lavora nella segreteria del club");
  }
};

const assertCanRead = (scope: ConsentAccessScope) => {
  if (!canReadConsentRecords(scope?.activeRole)) {
    throw denied("i consensi del club li legge chi ci lavora dentro");
  }
};

/* ---------------------------------------------------------------- scope */

const ensureOrganizationAccess = (
  scope: ConsentAccessScope | undefined,
  organizationId: string | null | undefined,
) => {
  if (!scope) return;
  /* Il confine e il club **attivo**: vedi `src/lib/auth/active-club-boundary.ts`. */
  assertActiveClub(scope, organizationId, "il consenso");
};

const resolveOrganizationId = (
  scope: ConsentAccessScope | undefined,
  requested?: string | null,
) => {
  const wanted = asText(requested);

  if (!scope) {
    if (!wanted) throw new Error("Nessun club indicato per il consenso");
    return wanted;
  }

  if (wanted) {
    ensureOrganizationAccess(scope, wanted);
    return wanted;
  }

  if (scope.activeOrganizationId) return scope.activeOrganizationId;

  throw new Error("Nessun club attivo selezionato");
};

/* ------------------------------------------------------------- le righe */

type DefinitionRow = {
  id: string;
  organization_id: string;
  key: string;
  title: string;
  description: string | null;
  required: boolean;
  status: string;
  published_version: number;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

export type ConsentDefinitionSummary = {
  id: string;
  organizationId: string;
  key: string;
  title: string;
  description: string;
  required: boolean;
  status: string;
  publishedVersion: number;
  /** L'identificativo della versione che si cita adesso, se pubblicata. */
  publishedVersionId: string | null;
  publishedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ConsentVersionSummary = {
  id: string;
  definitionId: string;
  version: number;
  title: string;
  bodyText: string;
  publishedAt: string | null;
  publishedBy: string | null;
};

export type ConsentRecordSummary = {
  id: string;
  definitionId: string;
  versionId: string;
  version: number | null;
  subjectKind: string;
  subjectId: string;
  subjectLabel: string;
  status: ConsentStatus;
  decidedAt: string | null;
  decidedBy: string | null;
  source: string;
  evidenceKind: string | null;
  evidenceId: string | null;
  note: string;
};

export type ConsentSubjectState = ConsentState & {
  definitionId: string;
  definitionKey: string;
  definitionTitle: string;
  required: boolean;
  subjectKind: string;
  subjectId: string;
  subjectLabel: string;
};

/**
 * La riga della definizione, **dentro il club**, o un rifiuto.
 *
 * A differenza della bacheca — dove un annuncio di un altro club risponde
 * «non trovato» per non dire a chi prova identificativi a caso quando ha
 * indovinato — qui la risposta e «Accesso negato», come pretende il §13.3:
 * chi arriva su questa rotta ha gia una sessione e una membership, e il
 * messaggio deve dire alla segreteria che ha il club sbagliato selezionato,
 * non che il consenso non esiste.
 */
const requireDefinitionRow = async (
  scope: ConsentAccessScope,
  definitionId: string,
  organizationId?: string | null,
): Promise<DefinitionRow> => {
  const id = asText(definitionId);
  if (!id) throw new Error("Consenso non indicato");

  const clubId = resolveOrganizationId(scope, organizationId);

  const row = (await prisma.consentDefinition.findFirst({
    where: { id, organization_id: clubId },
  })) as DefinitionRow | null;

  if (!row) {
    /*
      Non si distingue «non esiste» da «e di un altro club» apposta: la
      distinzione sarebbe una sonda per capire quali identificativi sono veri.
    */
    throw denied("il consenso non appartiene a questo club");
  }

  return row;
};

const summarizeDefinition = (
  row: DefinitionRow,
  publishedVersion: { id: string; published_at: Date | null } | null,
): ConsentDefinitionSummary => ({
  id: row.id,
  organizationId: row.organization_id,
  key: row.key,
  title: row.title,
  description: asText(row.description),
  required: Boolean(row.required),
  status: asText(row.status) || "draft",
  publishedVersion: Number(row.published_version || 0),
  publishedVersionId: publishedVersion?.id || null,
  publishedAt: publishedVersion ? toIso(publishedVersion.published_at) : null,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
});

/** La riga della versione pubblicata adesso, o `null` se non ce n'e nessuna. */
const readPublishedVersionRow = async (row: DefinitionRow) => {
  const version = Number(row.published_version || 0);
  if (!version) return null;

  return (await prisma.consentVersion.findFirst({
    where: {
      definition_id: row.id,
      organization_id: row.organization_id,
      version,
    },
  })) as {
    id: string;
    version: number;
    published_at: Date | null;
  } | null;
};

/**
 * Il numero di versione di ogni versione della definizione.
 *
 * Serve alla derivazione: `onOutdatedVersion` confronta **numeri**, e la riga
 * della decisione porta solo l'identificativo. Due letture semplici invece di
 * una join, perche il numero di versioni di un consenso e piccolo e la join
 * costringerebbe ogni chiamante a conoscere la forma della relazione.
 */
const loadVersionNumbers = async (
  organizationId: string,
  definitionIds: string[],
) => {
  if (!definitionIds.length) return new Map<string, number>();

  const rows = (await prisma.consentVersion.findMany({
    where: {
      organization_id: organizationId,
      definition_id: { in: definitionIds },
    },
    select: { id: true, version: true },
  })) as Array<{ id: string; version: number }>;

  return new Map(rows.map((row) => [row.id, Number(row.version || 0)]));
};

type RecordRow = {
  id: string;
  organization_id: string;
  definition_id: string;
  version_id: string;
  subject_kind: string;
  subject_id: string;
  subject_label: string | null;
  status: string;
  decided_at: Date | null;
  decided_by: string | null;
  source: string;
  evidence_kind: string | null;
  evidence_id: string | null;
  note: string | null;
  created_at: Date;
};

const summarizeRecord = (
  row: RecordRow,
  versionNumbers: Map<string, number>,
): ConsentRecordSummary => ({
  id: row.id,
  definitionId: row.definition_id,
  versionId: row.version_id,
  version: versionNumbers.get(row.version_id) ?? null,
  subjectKind: row.subject_kind,
  subjectId: row.subject_id,
  subjectLabel: asText(row.subject_label),
  status: asText(row.status) as ConsentStatus,
  decidedAt: toIso(row.decided_at),
  decidedBy: row.decided_by || null,
  source: asText(row.source) || "manual",
  evidenceKind: row.evidence_kind || null,
  evidenceId: row.evidence_id || null,
  note: asText(row.note),
});

const toDerivationInput = (
  row: RecordRow,
  versionNumbers: Map<string, number>,
): ConsentRecordInput => ({
  id: row.id,
  definitionId: row.definition_id,
  subjectKind: row.subject_kind,
  subjectId: row.subject_id,
  versionId: row.version_id,
  version: versionNumbers.get(row.version_id) ?? null,
  status: row.status,
  decidedAt: row.decided_at,
  createdAt: row.created_at,
});

/* ------------------------------------------------------- le definizioni */

/**
 * Le definizioni del club, con lo stato pubblicato.
 *
 * Le ritirate restano fuori se non le si chiede: una definizione ritirata non
 * si propone piu, ma continua a spiegare i consensi gia raccolti.
 */
export const listConsentDefinitions = async (
  scope: ConsentAccessScope,
  options: { organizationId?: string | null; includeRetired?: boolean } = {},
): Promise<ConsentDefinitionSummary[]> => {
  assertCanRead(scope);
  const organizationId = resolveOrganizationId(scope, options.organizationId);

  const rows = (await prisma.consentDefinition.findMany({
    where: {
      organization_id: organizationId,
      ...(options.includeRetired ? {} : { status: { not: "retired" } }),
    },
    orderBy: [{ created_at: "asc" }],
  })) as DefinitionRow[];

  const versions = (await prisma.consentVersion.findMany({
    where: { organization_id: organizationId },
    select: {
      id: true,
      definition_id: true,
      version: true,
      published_at: true,
    },
  })) as Array<{
    id: string;
    definition_id: string;
    version: number;
    published_at: Date | null;
  }>;

  return rows.map((row) => {
    const published =
      versions.find(
        (version) =>
          version.definition_id === row.id &&
          Number(version.version) === Number(row.published_version || 0),
      ) || null;
    return summarizeDefinition(row, published);
  });
};

export const getConsentDefinition = async (
  scope: ConsentAccessScope,
  definitionId: string,
  options: { organizationId?: string | null } = {},
): Promise<ConsentDefinitionSummary & { versions: ConsentVersionSummary[] }> => {
  assertCanRead(scope);
  const row = await requireDefinitionRow(
    scope,
    definitionId,
    options.organizationId,
  );

  const versions = (await prisma.consentVersion.findMany({
    where: { definition_id: row.id, organization_id: row.organization_id },
    orderBy: [{ version: "desc" }],
  })) as Array<{
    id: string;
    definition_id: string;
    version: number;
    title: string;
    body_text: string;
    published_at: Date | null;
    published_by: string | null;
  }>;

  const published =
    versions.find(
      (version) => Number(version.version) === Number(row.published_version || 0),
    ) || null;

  return {
    ...summarizeDefinition(row, published),
    versions: versions.map((version) => ({
      id: version.id,
      definitionId: version.definition_id,
      version: Number(version.version),
      title: version.title,
      bodyText: version.body_text,
      publishedAt: toIso(version.published_at),
      publishedBy: version.published_by || null,
    })),
  };
};

export const createConsentDefinition = async (
  scope: ConsentAccessScope,
  input: {
    organizationId?: string | null;
    key: string;
    title: string;
    description?: string | null;
    required?: boolean;
  },
): Promise<ConsentDefinitionSummary> => {
  assertCanManage(scope);
  const organizationId = resolveOrganizationId(scope, input.organizationId);

  const key = normalizeConsentKey(input.key);
  const validation = validateConsentDefinitionDraft({
    key,
    title: input.title,
    description: input.description,
    required: input.required,
  });
  if (!validation.ok) throw new Error(validation.issues[0].message);

  /*
    La chiave e unica per club in base dati. Il controllo qui non la sostituisce
    — a due richieste insieme risponde l'indice — ma trasforma il messaggio del
    driver in una frase che dice cosa fare.
  */
  const clash = await prisma.consentDefinition.findFirst({
    where: { organization_id: organizationId, key },
    select: { id: true },
  });
  if (clash) {
    throw new Error(`Esiste gia un consenso con la chiave «${key}»`);
  }

  const created = (await prisma.consentDefinition.create({
    data: {
      organization_id: organizationId,
      key,
      title: asText(input.title),
      description: asText(input.description) || null,
      required: Boolean(input.required),
      /*
        Nasce **bozza**, e non attiva: una definizione senza testo pubblicato
        raccoglierebbe accettazioni che non citano niente.
      */
      status: "draft",
      published_version: 0,
      created_by: scope.userId || null,
    },
  })) as DefinitionRow;

  await recordAuditEvent({
    action: AUDIT_ACTIONS.consentDefinitionChanged,
    actorUserId: scope.userId,
    actorRole: scope.activeRole || null,
    organizationId,
    resource: "consent_definitions",
    resourceId: created.id,
    metadata: { chiave: key, azione: "creata" },
  });

  return summarizeDefinition(created, null);
};

export const updateConsentDefinition = async (
  scope: ConsentAccessScope,
  definitionId: string,
  patch: {
    organizationId?: string | null;
    title?: string;
    description?: string | null;
    required?: boolean;
    status?: string;
  },
): Promise<ConsentDefinitionSummary> => {
  assertCanManage(scope);
  const row = await requireDefinitionRow(
    scope,
    definitionId,
    patch.organizationId,
  );

  const data: Record<string, unknown> = {};

  if (patch.title !== undefined) {
    const title = asText(patch.title);
    if (!title) {
      throw new Error(
        "Il consenso deve avere un titolo leggibile dalla famiglia",
      );
    }
    data.title = title;
  }

  if (patch.description !== undefined) {
    data.description = asText(patch.description) || null;
  }

  if (patch.required !== undefined) {
    data.required = Boolean(patch.required);
  }

  if (patch.status !== undefined) {
    const target = asText(patch.status).toLowerCase();
    if (!canTransitionConsentDefinition(row.status, target)) {
      throw new Error(
        `Un consenso «${row.status}» non puo diventare «${target}»`,
      );
    }
    if (target === "active" && Number(row.published_version || 0) < 1) {
      throw new Error(
        "Il consenso non ha ancora un testo pubblicato: pubblica una versione per attivarlo",
      );
    }
    data.status = target;
  }

  /*
    **La chiave non si cambia.** Un modulo pubblico e un modello di documento la
    citano per nome: rinominarla spezzerebbe silenziosamente ogni riferimento
    gia scritto, e non c'e nessun modo di accorgersene guardando la definizione.
  */

  if (!Object.keys(data).length) return summarizeDefinition(row, await readPublishedVersionRow(row));

  /*
    `updateMany` con il club nel `where`: un `update` per chiave primaria
    scriverebbe anche su una riga di un altro club se l'identificativo fosse
    indovinato prima del controllo.
  */
  await prisma.consentDefinition.updateMany({
    where: { id: row.id, organization_id: row.organization_id },
    data: data as never,
  });

  const updated = { ...row, ...(data as Partial<DefinitionRow>) };

  await recordAuditEvent({
    action: AUDIT_ACTIONS.consentDefinitionChanged,
    actorUserId: scope.userId,
    actorRole: scope.activeRole || null,
    organizationId: row.organization_id,
    resource: "consent_definitions",
    resourceId: row.id,
    metadata: {
      chiave: row.key,
      azione: "modificata",
      stato: asText(updated.status),
    },
  });

  return summarizeDefinition(updated, await readPublishedVersionRow(updated));
};

/** Bozza, attivo, ritirato. Un ritiro non cancella niente. */
export const setConsentDefinitionStatus = async (
  scope: ConsentAccessScope,
  definitionId: string,
  status: string,
  options: { organizationId?: string | null } = {},
) =>
  updateConsentDefinition(scope, definitionId, {
    organizationId: options.organizationId,
    status,
  });

/* ---------------------------------------------------------- le versioni */

/**
 * Pubblica una versione: crea una riga **immutabile** e la fa diventare quella
 * corrente.
 *
 * Non esiste una funzione che modifichi una versione, e non deve nascerne una:
 * correggere l'informativa significa pubblicarne un'altra. I consensi gia
 * raccolti continuano a citare la loro — restano validi, e vengono **segnalati**
 * come dati su una versione precedente (§7.3, regola 3).
 */
export const publishConsentVersion = async (
  scope: ConsentAccessScope,
  definitionId: string,
  input: {
    organizationId?: string | null;
    title?: string | null;
    bodyText: string;
  },
): Promise<ConsentVersionSummary> => {
  assertCanManage(scope);
  const row = await requireDefinitionRow(
    scope,
    definitionId,
    input.organizationId,
  );

  const validation = validateConsentVersionDraft({
    title: input.title,
    bodyText: input.bodyText,
  });
  if (!validation.ok) throw new Error(validation.issues[0].message);

  const version = nextConsentVersion(row.published_version);

  const created = (await prisma.consentVersion.create({
    data: {
      organization_id: row.organization_id,
      definition_id: row.id,
      version,
      title: asText(input.title) || row.title,
      body_text: String(input.bodyText),
      published_by: scope.userId || null,
    },
  })) as {
    id: string;
    definition_id: string;
    version: number;
    title: string;
    body_text: string;
    published_at: Date | null;
    published_by: string | null;
  };

  await prisma.consentDefinition.updateMany({
    where: { id: row.id, organization_id: row.organization_id },
    data: {
      published_version: version,
      /*
        La pubblicazione e l'atto che attiva: una definizione ritirata non
        torna attiva da sola, perche il ritiro e una decisione del club e
        pubblicare un testo nuovo non la revoca.
      */
      ...(asText(row.status) === "draft" ? { status: "active" } : {}),
    },
  });

  await recordAuditEvent({
    action: AUDIT_ACTIONS.consentVersionPublished,
    actorUserId: scope.userId,
    actorRole: scope.activeRole || null,
    organizationId: row.organization_id,
    resource: "consent_versions",
    resourceId: created.id,
    metadata: { chiave: row.key, versione: version },
  });

  return {
    id: created.id,
    definitionId: created.definition_id,
    version: Number(created.version),
    title: created.title,
    bodyText: created.body_text,
    publishedAt: toIso(created.published_at),
    publishedBy: created.published_by || null,
  };
};

/* --------------------------------------------------------- le decisioni */

const loadRecordRows = async (
  organizationId: string,
  where: Record<string, unknown>,
) =>
  (await prisma.consentRecord.findMany({
    where: { organization_id: organizationId, ...where } as never,
    orderBy: [{ decided_at: "asc" }, { created_at: "asc" }],
  })) as unknown as RecordRow[];

/**
 * Registra una decisione: **si aggiunge una riga**, non se ne cambia una.
 *
 * Le quattro cose che si rifiutano, e perche:
 *
 * 1. una definizione non `active`: raccogliere un consenso su una bozza
 *    significa raccoglierlo su un testo che il club non ha ancora deciso;
 * 2. una versione di un altro club, o di un'altra definizione: il record
 *    dichiarerebbe un testo che il soggetto non ha mai visto;
 * 3. un soggetto fuori elenco: `athlete`, `person`, `member`, `guardian`. Un
 *    quinto valore renderebbe la vista d'insieme incompleta senza che nessuno
 *    lo sappia;
 * 4. una transizione impossibile — su tutte, revocare cio che non risulta dato.
 */
export const recordConsentDecision = async (
  scope: ConsentAccessScope,
  input: {
    organizationId?: string | null;
    definitionId: string;
    versionId?: string | null;
    subjectKind: string;
    subjectId: string;
    subjectLabel?: string | null;
    status: string;
    source?: string | null;
    evidenceKind?: string | null;
    evidenceId?: string | null;
    note?: string | null;
    decidedAt?: string | Date | null;
  },
): Promise<{ record: ConsentRecordSummary; state: ConsentSubjectState }> => {
  assertCanDecide(scope);
  const row = await requireDefinitionRow(
    scope,
    input.definitionId,
    input.organizationId,
  );

  if (asText(row.status) !== "active") {
    throw new Error(
      "Il consenso non e attivo: attivalo prima di registrare una decisione",
    );
  }

  const subjectKind = asText(input.subjectKind).toLowerCase();
  if (!isConsentSubjectKind(subjectKind)) {
    throw new Error(
      "Soggetto sconosciuto: un consenso riguarda un atleta, una persona, un socio o un tutore",
    );
  }

  const subjectId = asText(input.subjectId);
  if (!subjectId) throw new Error("Manca il soggetto del consenso");

  const status = asText(input.status).toLowerCase();
  if (!isConsentStatus(status)) {
    throw new Error(
      "Decisione sconosciuta: si registra accettazione, rifiuto o revoca",
    );
  }

  const source = asText(input.source).toLowerCase() || "manual";
  if (!isConsentSource(source)) {
    throw new Error("Sorgente sconosciuta per questa decisione");
  }

  /*
    L'evidenza e un **puntatore**: si registra da dove viene la decisione, non
    se ne fa una copia. Il tipo senza l'identificativo (o viceversa) e mezzo
    riferimento, cioe una traccia che non si puo seguire.
  */
  const evidenceKind = asText(input.evidenceKind) || null;
  const evidenceId = asText(input.evidenceId) || null;
  if (Boolean(evidenceKind) !== Boolean(evidenceId)) {
    throw new Error(
      "L'evidenza richiede sia il tipo sia l'identificativo di cio che la dimostra",
    );
  }

  let versionRow: { id: string; version: number } | null = null;

  if (asText(input.versionId)) {
    versionRow = (await prisma.consentVersion.findFirst({
      where: {
        id: asText(input.versionId),
        organization_id: row.organization_id,
        definition_id: row.id,
      },
      select: { id: true, version: true },
    })) as { id: string; version: number } | null;

    if (!versionRow) {
      throw denied(
        "la versione citata non appartiene a questo consenso o a questo club",
      );
    }
  } else {
    const published = await readPublishedVersionRow(row);
    if (!published) {
      throw new Error(
        "Il consenso non ha un testo pubblicato: non c'e niente da accettare",
      );
    }
    versionRow = { id: published.id, version: Number(published.version) };
  }

  const versionNumbers = await loadVersionNumbers(row.organization_id, [row.id]);
  const existing = await loadRecordRows(row.organization_id, {
    definition_id: row.id,
    subject_kind: subjectKind,
    subject_id: subjectId,
  });

  const current = deriveConsentState(
    existing.map((record) => toDerivationInput(record, versionNumbers)),
    { publishedVersion: row.published_version },
  );

  if (!canApplyConsentDecision(current.status, status)) {
    throw new Error(
      explainConsentDecisionDenial(current.status, status) ||
        "Questa decisione non e ammessa a partire dallo stato attuale",
    );
  }

  const decidedAt = input.decidedAt ? new Date(input.decidedAt) : new Date();
  if (Number.isNaN(decidedAt.getTime())) {
    throw new Error("La data della decisione non e valida");
  }

  /*
    **Una decisione non si data nel futuro**, e non e una pignoleria.

    Lo stato attuale e l'**ultima** decisione per data. Una accettazione
    registrata per errore con l'anno sbagliato — «2027» invece di «2026», un
    refuso, non un attacco — resta l'ultima per un anno intero: la famiglia
    revoca, l'operatore scrive la revoca, e la schermata continua a dire
    «accettato». Si puo revocare all'infinito senza effetto.

    E il modo in cui l'invariante «una revoca non cancella l'accettazione» si
    rovescia nel suo contrario: e l'accettazione a cancellare la revoca.

    Un minuto di tolleranza copre lo scarto fra l'orologio di chi scrive e
    quello del server.
  */
  const TOLLERANZA_MS = 60_000;
  if (decidedAt.getTime() > Date.now() + TOLLERANZA_MS) {
    throw new Error(
      "La data della decisione e nel futuro: una decisione si registra quando e stata presa",
    );
  }

  const created = (await prisma.consentRecord.create({
    data: {
      organization_id: row.organization_id,
      definition_id: row.id,
      version_id: versionRow.id,
      subject_kind: subjectKind,
      subject_id: subjectId,
      subject_label: asText(input.subjectLabel) || null,
      status,
      decided_at: decidedAt,
      decided_by: scope.userId || null,
      source,
      evidence_kind: evidenceKind,
      evidence_id: evidenceId,
      note: asText(input.note) || null,
    },
  })) as unknown as RecordRow;

  versionNumbers.set(versionRow.id, Number(versionRow.version));

  const state = deriveConsentState(
    [...existing, created].map((record) =>
      toDerivationInput(record, versionNumbers),
    ),
    { publishedVersion: row.published_version },
  );

  await recordAuditEvent({
    /*
      La revoca ha un'azione propria e non un metadato: e la riga che si va a
      cercare quando qualcuno chiede conto di una foto pubblicata, e cercarla
      fra tutte le decisioni non la trova.
    */
    action:
      status === "revoked"
        ? AUDIT_ACTIONS.consentRevoked
        : AUDIT_ACTIONS.consentDecisionRecorded,
    actorUserId: scope.userId,
    actorRole: scope.activeRole || null,
    organizationId: row.organization_id,
    resource: "consent_records",
    resourceId: created.id,
    metadata: {
      chiave: row.key,
      versione: Number(versionRow.version),
      decisione: status,
      soggetto: subjectKind,
      soggettoId: subjectId,
      provenienza: source,
    },
  });

  return {
    record: summarizeRecord(created, versionNumbers),
    state: {
      ...state,
      definitionId: row.id,
      definitionKey: row.key,
      definitionTitle: row.title,
      required: Boolean(row.required),
      subjectKind,
      subjectId,
      subjectLabel: asText(input.subjectLabel),
    },
  };
};

/** Lo storico completo di una definizione, il piu recente per primo. */
export const listConsentRecords = async (
  scope: ConsentAccessScope,
  definitionId: string,
  options: {
    organizationId?: string | null;
    subjectKind?: string | null;
    subjectId?: string | null;
    limit?: number;
  } = {},
): Promise<ConsentRecordSummary[]> => {
  assertCanRead(scope);
  const row = await requireDefinitionRow(
    scope,
    definitionId,
    options.organizationId,
  );

  const subjectKind = asText(options.subjectKind).toLowerCase();
  const subjectId = asText(options.subjectId);

  const rows = await loadRecordRows(row.organization_id, {
    definition_id: row.id,
    ...(subjectKind ? { subject_kind: subjectKind } : {}),
    ...(subjectId ? { subject_id: subjectId } : {}),
  });

  const versionNumbers = await loadVersionNumbers(row.organization_id, [row.id]);
  const limit = Number(options.limit || 0);
  const ordered = rows
    .map((record) => summarizeRecord(record, versionNumbers))
    .reverse();

  return limit > 0 ? ordered.slice(0, limit) : ordered;
};

/** Lo stato di un consenso per un soggetto, ricavato dallo storico. */
export const getConsentStateForSubject = async (
  scope: ConsentAccessScope,
  input: {
    organizationId?: string | null;
    definitionId: string;
    subjectKind: string;
    subjectId: string;
  },
): Promise<ConsentSubjectState> => {
  assertCanRead(scope);
  const row = await requireDefinitionRow(
    scope,
    input.definitionId,
    input.organizationId,
  );

  const subjectKind = asText(input.subjectKind).toLowerCase();
  if (!isConsentSubjectKind(subjectKind)) {
    throw new Error(
      "Soggetto sconosciuto: un consenso riguarda un atleta, una persona, un socio o un tutore",
    );
  }
  const subjectId = asText(input.subjectId);
  if (!subjectId) throw new Error("Manca il soggetto del consenso");

  const versionNumbers = await loadVersionNumbers(row.organization_id, [row.id]);
  const rows = await loadRecordRows(row.organization_id, {
    definition_id: row.id,
    subject_kind: subjectKind,
    subject_id: subjectId,
  });

  const state = deriveConsentState(
    rows.map((record) => toDerivationInput(record, versionNumbers)),
    { publishedVersion: row.published_version },
  );

  return {
    ...state,
    definitionId: row.id,
    definitionKey: row.key,
    definitionTitle: row.title,
    required: Boolean(row.required),
    subjectKind,
    subjectId,
    subjectLabel: asText(rows[rows.length - 1]?.subject_label),
  };
};

/**
 * La vista d'insieme: **chi manca e chi ha revocato**.
 *
 * Con un soggetto indicato risponde alla domanda della segreteria — «questa
 * famiglia cosa ha firmato?» — e include le definizioni **senza** nessuna
 * decisione, con stato `missing`: e quello l'elenco di cio che manca, e non
 * comparirebbe mai se si guardassero solo le righe scritte.
 *
 * Senza soggetto risponde alla domanda opposta — «chi ha revocato il consenso
 * immagini?» — raggruppando lo storico per (definizione, soggetto).
 */
export const listConsentStates = async (
  scope: ConsentAccessScope,
  options: {
    organizationId?: string | null;
    definitionId?: string | null;
    subjectKind?: string | null;
    subjectId?: string | null;
    includeRetired?: boolean;
  } = {},
): Promise<ConsentSubjectState[]> => {
  assertCanRead(scope);
  const organizationId = resolveOrganizationId(scope, options.organizationId);

  const definitionId = asText(options.definitionId);
  if (definitionId) {
    // Verifica il club prima di leggere qualunque decisione.
    await requireDefinitionRow(scope, definitionId, options.organizationId);
  }

  const definitions = (await prisma.consentDefinition.findMany({
    where: {
      organization_id: organizationId,
      ...(definitionId ? { id: definitionId } : {}),
      ...(options.includeRetired ? {} : { status: { not: "retired" } }),
    },
    orderBy: [{ created_at: "asc" }],
  })) as DefinitionRow[];

  if (!definitions.length) return [];

  const byId = new Map(definitions.map((row) => [row.id, row]));
  const versionNumbers = await loadVersionNumbers(organizationId, [
    ...byId.keys(),
  ]);

  const subjectKind = asText(options.subjectKind).toLowerCase();
  const subjectId = asText(options.subjectId);

  const rows = await loadRecordRows(organizationId, {
    definition_id: { in: [...byId.keys()] },
    ...(subjectKind ? { subject_kind: subjectKind } : {}),
    ...(subjectId ? { subject_id: subjectId } : {}),
  });

  const buckets = new Map<string, RecordRow[]>();
  for (const record of rows) {
    if (!byId.has(record.definition_id)) continue;
    const key = `${record.definition_id}|${consentSubjectKey(record.subject_kind, record.subject_id)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(record);
    else buckets.set(key, [record]);
  }

  const states: ConsentSubjectState[] = [];

  const push = (
    definition: DefinitionRow,
    kind: string,
    id: string,
    history: RecordRow[],
  ) => {
    const state = deriveConsentState(
      history.map((record) => toDerivationInput(record, versionNumbers)),
      { publishedVersion: definition.published_version },
    );
    states.push({
      ...state,
      definitionId: definition.id,
      definitionKey: definition.key,
      definitionTitle: definition.title,
      required: Boolean(definition.required),
      subjectKind: kind,
      subjectId: id,
      subjectLabel: asText(history[history.length - 1]?.subject_label),
    });
  };

  if (subjectKind && subjectId) {
    /*
      Un soggetto solo: una riga per **ogni** definizione, anche dove non c'e
      niente. E l'unico modo in cui «manca» diventa visibile.
    */
    for (const definition of definitions) {
      const key = `${definition.id}|${consentSubjectKey(subjectKind, subjectId)}`;
      push(definition, subjectKind, subjectId, buckets.get(key) || []);
    }
    return states;
  }

  for (const [key, history] of buckets) {
    const definition = byId.get(key.split("|")[0]);
    if (!definition) continue;
    push(
      definition,
      history[0].subject_kind,
      history[0].subject_id,
      history,
    );
  }

  return states;
};

export type { ConsentStatus, ConsentSubjectKind };
