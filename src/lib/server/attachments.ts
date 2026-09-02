import { createHash } from "crypto";
import {
  athleteIdsWithinAccessScope,
  athleteWithinAccessScope,
  buildAthleteAccessScopeConditions,
} from "./access-scope-query";
import type { AccessScopeEntry } from "@/lib/roles/access-scope";
import { assertActiveClub } from "@/lib/auth/active-club-boundary";
import { prisma } from "./prisma";
import {
  MAX_ATTACHMENT_BYTES,
  buildAttachmentReference,
  buildAttachmentUrl,
  isAttachmentOwnerType,
  isMedicalCertificateAttachmentCategory,
  normalizeAttachmentCategory,
  toAttachmentDayKey,
  validateAttachmentInput,
  validateAttachmentValidity,
  type AttachmentMetadata,
} from "@/lib/attachments";

/**
 * Il servizio allegati: **l'unico** punto in cui EasyGame scrive o legge un
 * file (WP-15, ADR-0034).
 *
 * Prima di questo modulo non esisteva un punto: c'erano sei o sette posti che
 * facevano `FileReader.readAsDataURL` e infilavano il risultato in un campo
 * JSON. Non c'era autorizzazione — il file viveva dentro un record gia letto —
 * ne un limite di dimensione, ne un controllo di tipo, ne un modo di sapere
 * quanto pesasse l'archivio.
 *
 * **Provider-agnostico per costruzione.** I byte passano da un `StorageDriver`.
 * Oggi ne esiste uno solo, `database`, che li mette in una tabella dedicata;
 * il giorno in cui si sceglie un object storage se ne aggiunge un secondo e
 * **nessun chiamante cambia**, perche nessun chiamante sa dove sono i byte.
 * La scelta del provider e una decisione che costa denaro e configurazione:
 * va presa da chi paga, non da chi scrive il codice (vedi ADR-0034).
 *
 * **Il confine di sicurezza e `organization_id`.** Ogni funzione qui dentro
 * riceve uno scope e lo applica: un allegato di un altro club non si legge,
 * non si sostituisce e non si cancella, e il messaggio contiene «Accesso
 * negato» perche il route handler generico lo mappi su 403.
 */

export type AttachmentAccessScope = {
  userId: string;
  activeOrganizationId: string | null;
  allowedOrganizationIds: string[];
  /**
   * Il perimetro di sede e categoria, quando chi legge ne ha uno.
   *
   * Gli allegati non lo conoscevano affatto, e sono la **fine** di ogni catena:
   * chiunque ottenesse un identificativo — da una coda non perimetrata, da un
   * elenco, da un fascicolo — arrivava ai byte. Una revisione ostile ha
   * scaricato cosi la carta d'identita di un minore di un'altra sede.
   */
  accessScopes?: readonly AccessScopeEntry[] | null;
};

const denied = (message: string) => new Error(`Accesso negato: ${message}`);

const ensureOrganizationAccess = (
  scope: AttachmentAccessScope | undefined,
  organizationId: string | null | undefined,
) => {
  if (!scope) return;
  /* Il confine e il club **attivo**: vedi `src/lib/auth/active-club-boundary.ts`. */
  assertActiveClub(scope, organizationId, "l'allegato");
};

const resolveOrganizationId = (
  scope: AttachmentAccessScope | undefined,
  requested?: string | null,
) => {
  const wanted = String(requested || "").trim();

  if (!scope) {
    if (!wanted) throw new Error("Nessun club indicato per l'allegato");
    return wanted;
  }

  if (wanted) {
    ensureOrganizationAccess(scope, wanted);
    return wanted;
  }

  if (scope.activeOrganizationId) return scope.activeOrganizationId;

  throw new Error("Nessun club attivo selezionato");
};

/* ------------------------------------------------------------------ driver */

export type StoredBlob = { content: Buffer; storageKey: string | null };

/**
 * Dove finiscono i byte.
 *
 * Tre metodi e nient'altro: chi implementa un driver non deve conoscere
 * l'autorizzazione, i metadati o il formato del riferimento.
 */
export type StorageDriver = {
  readonly name: string;
  put(attachmentId: string, content: Buffer): Promise<{ storageKey: string | null }>;
  get(attachmentId: string, storageKey: string | null): Promise<Buffer | null>;
  remove(attachmentId: string, storageKey: string | null): Promise<void>;
};

/**
 * Driver predefinito: i byte in `attachment_blobs`.
 *
 * Non e un ripiego in attesa del provider «vero»: e la scelta corretta finche
 * l'ordine di grandezza e quello di una societa sportiva (alcune migliaia di
 * documenti). Risolve per intero il difetto misurato — il binario **non e
 * piu** nella riga che si legge per mostrare un elenco — senza introdurre un
 * accoppiamento a un servizio proprietario dell'hosting, che ADR-0007
 * vieta. Vedi ADR-0034 per le condizioni in cui conviene cambiarlo.
 */
export const databaseStorageDriver: StorageDriver = {
  name: "database",

  async put(attachmentId, content) {
    await (prisma as any).attachmentBlob.upsert({
      where: { attachment_id: attachmentId },
      update: { content },
      create: { attachment_id: attachmentId, content },
    });
    return { storageKey: null };
  },

  async get(attachmentId) {
    const row = await (prisma as any).attachmentBlob.findUnique({
      where: { attachment_id: attachmentId },
      select: { content: true },
    });
    if (!row?.content) return null;
    return Buffer.isBuffer(row.content) ? row.content : Buffer.from(row.content);
  },

  async remove(attachmentId) {
    await (prisma as any).attachmentBlob
      .delete({ where: { attachment_id: attachmentId } })
      .catch(() => {
        // Un blob gia assente non e un errore: la cancellazione e idempotente.
      });
  },
};

const DRIVERS = new Map<string, StorageDriver>([
  [databaseStorageDriver.name, databaseStorageDriver],
]);

/**
 * Registra un driver aggiuntivo.
 *
 * Esiste perche il giorno in cui si configura un object storage il codice da
 * scrivere sia **un file nuovo e una riga qui**, non una modifica sparsa. I
 * test la usano per verificare che il servizio non dipenda dal driver.
 */
export const registerStorageDriver = (driver: StorageDriver) => {
  DRIVERS.set(driver.name, driver);
};

let activeDriverName = databaseStorageDriver.name;

/** Il driver con cui si scrivono gli allegati **nuovi**. */
export const setActiveStorageDriver = (name: string) => {
  if (!DRIVERS.has(name)) {
    throw new Error(`Driver di storage sconosciuto: ${name}`);
  }
  activeDriverName = name;
};

export const getActiveStorageDriver = (): StorageDriver =>
  DRIVERS.get(activeDriverName) || databaseStorageDriver;

/**
 * Il driver con cui e stato scritto un allegato **gia esistente**.
 *
 * Si legge dalla riga, non dalla configurazione corrente: cambiare driver non
 * deve rendere illeggibile cio che e stato scritto prima.
 */
const driverFor = (storageDriver?: string | null): StorageDriver => {
  const driver = DRIVERS.get(String(storageDriver || "").trim());
  if (!driver) {
    throw new Error(
      `Allegato memorizzato con un driver non disponibile: ${storageDriver}`,
    );
  }
  return driver;
};

/* ----------------------------------------------------------------- metadata */

const toIso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : String(value || "");

/**
 * Una data di validita esce come **giorno**, non come istante.
 *
 * `valid_until` e una data: restituirla come `2026-11-30T00:00:00.000Z`
 * inviterebbe chi la legge a confrontarla con un orario, che e esattamente il
 * modo in cui una scadenza si sposta di un giorno cambiando fuso.
 */
const toDayOrNull = (value: unknown) =>
  value instanceof Date && !Number.isNaN(value.getTime())
    ? toAttachmentDayKey(value)
    : null;

export const serializeAttachment = (
  row: Record<string, any>,
): AttachmentMetadata => ({
  id: row.id,
  organizationId: row.organization_id,
  ownerType: row.owner_type,
  ownerId: row.owner_id,
  category: row.category,
  fileName: row.file_name,
  mimeType: row.mime_type,
  sizeBytes: Number(row.size_bytes || 0),
  checksum: row.checksum,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
  createdBy: row.created_by || null,
  validFrom: toDayOrNull(row.valid_from),
  validUntil: toDayOrNull(row.valid_until),
  reference: buildAttachmentReference(row.id),
  url: buildAttachmentUrl(row.id),
});

/** Le colonne dei metadati. Mai `blob`: e il punto di tutta la separazione. */
const METADATA_SELECT = {
  id: true,
  organization_id: true,
  owner_type: true,
  owner_id: true,
  category: true,
  file_name: true,
  mime_type: true,
  size_bytes: true,
  checksum: true,
  storage_driver: true,
  storage_key: true,
  valid_from: true,
  valid_until: true,
  created_by: true,
  created_at: true,
  updated_at: true,
} as const;

const CONTROL_CHARS = new RegExp(
  "[\\u0000-\\u001f\\u007f]",
  "g",
);

const sanitizeFileName = (value?: string | null) =>
  String(value || "")
    .replace(/[\\/]/g, "-")
    // I caratteri di controllo e le virgolette finirebbero in un header
    // `Content-Disposition`: togliendoli qui non c'e modo di iniettarne uno
    // caricando un file con un nome costruito apposta.
    .replace(CONTROL_CHARS, "")
    .replace(/"/g, "'")
    .trim()
    .slice(0, 200) || "documento";

const checksumOf = (content: Buffer) =>
  createHash("sha256").update(content).digest("hex");

/* ------------------------------------------------------------------ scrittura */

export type CreateAttachmentInput = {
  organizationId?: string | null;
  ownerType: string;
  ownerId: string;
  category: string;
  fileName: string;
  mimeType: string;
  content: Buffer;
  /**
   * Da quando il documento vale, e fino a quando. Entrambe **facoltative**: un
   * allegato senza date continua a funzionare identico a prima (Wave 3, W3-G).
   */
  validFrom?: string | Date | null;
  validUntil?: string | Date | null;
};

/**
 * Carica un allegato e restituisce i suoi metadati, riferimento incluso.
 *
 * Chi chiama salva `metadata.reference` nel proprio record. Non c'e nessun
 * momento in cui il file passi dentro il record.
 */
export const createAttachment = async (
  input: CreateAttachmentInput,
  scope?: AttachmentAccessScope,
): Promise<AttachmentMetadata> => {
  const organizationId = resolveOrganizationId(scope, input.organizationId);

  const ownerType = String(input.ownerType || "").trim().toLowerCase();
  if (!isAttachmentOwnerType(ownerType)) {
    throw new Error(`Tipo di proprietario non ammesso: ${input.ownerType}`);
  }

  const ownerId = String(input.ownerId || "").trim();
  if (!ownerId) {
    throw new Error("Allegato senza proprietario");
  }

  const content = input.content;
  if (!Buffer.isBuffer(content) || content.length === 0) {
    throw new Error("Il file e vuoto.");
  }

  const validation = validateAttachmentInput({
    mimeType: input.mimeType,
    sizeBytes: content.length,
    fileName: input.fileName,
  });
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const validity = validateAttachmentValidity({
    validFrom: input.validFrom,
    validUntil: input.validUntil,
  });
  if (!validity.ok) {
    throw new Error(validity.message);
  }

  const driver = getActiveStorageDriver();

  /*
    Prima la riga dei metadati, poi i byte: il blob ha una chiave esterna
    verso l'allegato, quindi l'ordine inverso non e nemmeno possibile. Se la
    scrittura dei byte fallisce si rimuove la riga, cosi non resta un allegato
    che esiste nell'elenco e non si apre.
  */
  const row = await (prisma as any).attachment.create({
    data: {
      organization_id: organizationId,
      owner_type: ownerType,
      owner_id: ownerId,
      category: String(input.category || "documento").trim().slice(0, 120),
      file_name: sanitizeFileName(input.fileName),
      mime_type: validation.mimeType,
      size_bytes: content.length,
      checksum: checksumOf(content),
      storage_driver: driver.name,
      valid_from: validity.validFrom,
      valid_until: validity.validUntil,
      created_by: scope?.userId || null,
    },
    select: METADATA_SELECT,
  });

  try {
    const { storageKey } = await driver.put(row.id, content);
    if (storageKey) {
      await (prisma as any).attachment.update({
        where: { id: row.id },
        data: { storage_key: storageKey },
      });
    }
  } catch (error) {
    await (prisma as any).attachment
      .delete({ where: { id: row.id } })
      .catch(() => {});
    throw error;
  }

  return serializeAttachment(row);
};

/**
 * Sostituisce il contenuto di un allegato mantenendone l'identita.
 *
 * L'id non cambia: il riferimento gia salvato nel record di dominio resta
 * valido. E la differenza fra «sostituisci il certificato» e «cancella e
 * ricarica», che invece lascerebbe il record a puntare al nulla per il tempo
 * che passa fra le due operazioni.
 */
/**
 * **Il perimetro arriva fino ai byte.**
 *
 * Un allegato di un atleta appartiene a quell'atleta: se l'atleta e fuori dal
 * perimetro di chi legge, i suoi byte lo sono. Prima non c'era nessun
 * controllo, e questa e la fine di ogni catena — l'identificativo si ottiene da
 * una coda, da un elenco, da un fascicolo, e chi lo ha in mano scarica.
 *
 * Gli allegati che non appartengono a un atleta non sono toccati: il perimetro
 * parla di sedi e categorie, che sono di una persona.
 */
const assertAttachmentWithinAccessScope = async (
  scope: AttachmentAccessScope | undefined,
  row: { owner_type?: string | null; owner_id?: string | null; organization_id?: string | null },
) => {
  if (!scope) return;
  if (String(row?.owner_type || "").trim().toLowerCase() !== "athlete") return;

  const atleta = String(row?.owner_id || "").trim();
  const club = String(row?.organization_id || "").trim();
  if (!atleta || !club) return;

  const dentro = await athleteWithinAccessScope(club, atleta, scope);
  if (dentro) return;

  throw denied(
    "questo documento appartiene a una persona fuori dal perimetro di sede o categoria dell'accesso",
  );
};

export const replaceAttachmentContent = async (
  id: string,
  input: {
    fileName: string;
    mimeType: string;
    content: Buffer;
    /**
     * Le date di validita del file **nuovo**.
     *
     * `undefined` significa «non le tocco», e non «cancellale»: sostituire il
     * PDF di un documento senza ripetere le date non deve far sparire la
     * scadenza. Una stringa vuota, invece, e una cancellazione voluta — e il
     * modo in cui si toglie una scadenza messa per sbaglio.
     */
    validFrom?: string | Date | null;
    validUntil?: string | Date | null;
  },
  scope?: AttachmentAccessScope,
): Promise<AttachmentMetadata> => {
  const existing = await (prisma as any).attachment.findUnique({
    where: { id },
    select: METADATA_SELECT,
  });

  if (!existing) {
    throw new Error("Allegato non trovato");
  }

  ensureOrganizationAccess(scope, existing.organization_id);
  /*
    **Il perimetro si fermava un verbo prima.**

    Misurato: la carta d'identita di un minore fuori perimetro **non si
    legge** (403 su `readAttachment`) e si poteva **sovrascrivere** con
    qualunque cosa, e **distruggere**. L'asimmetria e assurda, e nasce
    dall'aver messo la guardia sulla funzione che consegna i byte invece che
    su tutte quelle che li toccano.
  */
  await assertAttachmentWithinAccessScope(scope, existing);

  const content = input.content;
  if (!Buffer.isBuffer(content) || content.length === 0) {
    throw new Error("Il file e vuoto.");
  }

  const validation = validateAttachmentInput({
    mimeType: input.mimeType,
    sizeBytes: content.length,
    fileName: input.fileName,
  });
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  /*
    Le date si validano **insieme a quelle gia in archivio**: chi manda solo la
    nuova scadenza deve comunque scontrarsi con l'inizio di validita che c'e
    gia, o si potrebbe costruire un intervallo rovesciato in due passi.
  */
  const toccaValidFrom = input.validFrom !== undefined;
  const toccaValidUntil = input.validUntil !== undefined;

  const validity = validateAttachmentValidity({
    validFrom: toccaValidFrom ? input.validFrom : existing.valid_from,
    validUntil: toccaValidUntil ? input.validUntil : existing.valid_until,
  });
  if (!validity.ok) {
    throw new Error(validity.message);
  }

  // Si riscrive con il driver **attivo**: e il modo in cui un allegato
  // migra da un driver all'altro senza una campagna di migrazione.
  const driver = getActiveStorageDriver();
  const { storageKey } = await driver.put(id, content);

  if (existing.storage_driver !== driver.name) {
    await driverFor(existing.storage_driver)
      .remove(id, existing.storage_key)
      .catch(() => {});
  }

  const row = await (prisma as any).attachment.update({
    where: { id },
    data: {
      file_name: sanitizeFileName(input.fileName),
      mime_type: validation.mimeType,
      size_bytes: content.length,
      checksum: checksumOf(content),
      storage_driver: driver.name,
      storage_key: storageKey,
      ...(toccaValidFrom ? { valid_from: validity.validFrom } : {}),
      ...(toccaValidUntil ? { valid_until: validity.validUntil } : {}),
    },
    select: METADATA_SELECT,
  });

  return serializeAttachment(row);
};

/* ------------------------------------------------------------------ lettura */

export const getAttachmentMetadata = async (
  id: string,
  scope?: AttachmentAccessScope,
): Promise<AttachmentMetadata | null> => {
  const row = await (prisma as any).attachment.findUnique({
    where: { id },
    select: METADATA_SELECT,
  });

  if (!row) return null;
  ensureOrganizationAccess(scope, row.organization_id);
  /*
    La rotta degli allegati per identificativo si autorizza **con questa**, per PUT e
    per DELETE: lasciarla fuori dal perimetro voleva dire lasciarci fuori
    anche loro. E il nome del file nomina la persona.
  */
  await assertAttachmentWithinAccessScope(scope, row);

  return serializeAttachment(row);
};

export type AttachmentContent = {
  metadata: AttachmentMetadata;
  content: Buffer;
};

export const readAttachment = async (
  id: string,
  scope?: AttachmentAccessScope,
): Promise<AttachmentContent | null> => {
  const row = await (prisma as any).attachment.findUnique({
    where: { id },
    select: METADATA_SELECT,
  });

  if (!row) return null;
  ensureOrganizationAccess(scope, row.organization_id);
  await assertAttachmentWithinAccessScope(scope, row);

  const content = await driverFor(row.storage_driver).get(id, row.storage_key);
  if (!content) return null;

  return { metadata: serializeAttachment(row), content };
};

export const listAttachments = async (
  filter: {
    organizationId?: string | null;
    ownerType?: string | null;
    ownerId?: string | null;
    category?: string | null;
  },
  scope?: AttachmentAccessScope,
): Promise<AttachmentMetadata[]> => {
  const organizationId = resolveOrganizationId(scope, filter.organizationId);

  const where: Record<string, any> = { organization_id: organizationId };
  if (filter.ownerType) {
    where.owner_type = String(filter.ownerType).trim().toLowerCase();
  }
  if (filter.ownerId) where.owner_id = String(filter.ownerId).trim();
  if (filter.category) where.category = String(filter.category).trim();

  const rows = await (prisma as any).attachment.findMany({
    where,
    select: METADATA_SELECT,
    orderBy: { created_at: "desc" },
  });

  /*
    **Un elenco e la porta di servizio di ogni lettura per identificativo.**

    I byte erano chiusi, i nomi dei file no — e un nome di file nomina la
    persona. La riga porta anche `owner_id`, cioe l'identificativo di ogni
    atleta fuori perimetro: la chiave d'ingresso di tutte le altre porte.

    Si filtra dopo la lettura, e non nel `where`, perche il perimetro si
    calcola sulle appartenenze e non su questa tabella: l'insieme degli
    atleti ammessi si chiede una volta sola al proprietario del perimetro.
  */
  const diAtleti = rows.filter(
    (row: Record<string, any>) =>
      String(row?.owner_type || "").trim().toLowerCase() === "athlete",
  );

  if (!diAtleti.length || !buildAthleteAccessScopeConditions(scope)) {
    return rows.map((row: Record<string, any>) => serializeAttachment(row));
  }

  const ammessi = new Set(
    await athleteIdsWithinAccessScope(organizationId, scope),
  );

  return rows
    .filter((row: Record<string, any>) => {
      if (String(row?.owner_type || "").trim().toLowerCase() !== "athlete") {
        return true;
      }
      return ammessi.has(String(row?.owner_id || "").trim());
    })
    .map((row: Record<string, any>) => serializeAttachment(row));
};

/**
 * Gli allegati che scadono dentro una finestra di giorni.
 *
 * **Perche vive qui e non nel motore delle automazioni.** Attachment Core e
 * l'unico posto che interroga la tabella `attachments` (CLAUDE.md §2): una
 * query scritta dentro il valutatore notturno sarebbe la seconda, e la prima a
 * dimenticare l'esclusione del certificato medico.
 *
 * L'esclusione delle categorie mediche e **incondizionata** e non un
 * parametro: chi chiama non deve poter chiedere «anche quelle». La scadenza del
 * certificato la governa `AUT-03`, e due sorgenti per lo stesso fatto sono due
 * promemoria alla stessa famiglia.
 *
 * La finestra si appoggia all'indice `(organization_id, valid_until)`: chi
 * chiama filtra poi per anticipo esatto, che e una decisione delle regole e non
 * di questa query.
 */
export const listExpiringAttachments = async (
  filter: {
    organizationId: string;
    /** Dal giorno incluso. */
    from: Date;
    /** Al giorno incluso. */
    to: Date;
    ownerType?: string | null;
    ownerIds?: string[] | null;
    /** Le categorie scelte. Vuoto o assente = **tutte** quelle ammesse. */
    categories?: string[] | null;
  },
  scope?: AttachmentAccessScope,
): Promise<AttachmentMetadata[]> => {
  const organizationId = resolveOrganizationId(scope, filter.organizationId);

  const ownerIds = (filter.ownerIds || []).map((id) => String(id || "").trim()).filter(Boolean);
  if (filter.ownerIds && ownerIds.length === 0) return [];

  const where: Record<string, any> = {
    organization_id: organizationId,
    valid_until: { gte: filter.from, lte: filter.to },
  };

  if (filter.ownerType) {
    where.owner_type = String(filter.ownerType).trim().toLowerCase();
  }
  if (ownerIds.length > 0) {
    where.owner_id = { in: ownerIds };
  }

  const rows = await (prisma as any).attachment.findMany({
    where,
    select: METADATA_SELECT,
    orderBy: { valid_until: "asc" },
  });

  const scelte = new Set(
    (filter.categories || [])
      .map((value) => normalizeAttachmentCategory(value))
      .filter(Boolean),
  );

  return rows
    .filter(
      (row: Record<string, any>) =>
        !isMedicalCertificateAttachmentCategory(row.category) &&
        (scelte.size === 0 ||
          scelte.has(normalizeAttachmentCategory(row.category))),
    )
    .map((row: Record<string, any>) => serializeAttachment(row));
};

/* ------------------------------------------------------------- eliminazione */

export const deleteAttachment = async (
  id: string,
  scope?: AttachmentAccessScope,
): Promise<boolean> => {
  const row = await (prisma as any).attachment.findUnique({
    where: { id },
    select: METADATA_SELECT,
  });

  if (!row) return false;
  ensureOrganizationAccess(scope, row.organization_id);
  /* Cancellare e l'atto piu irreversibile dei tre: vedi `replaceAttachmentContent`. */
  await assertAttachmentWithinAccessScope(scope, row);

  await driverFor(row.storage_driver).remove(id, row.storage_key);
  await (prisma as any).attachment.delete({ where: { id } });

  return true;
};

/* -------------------------------------------------------- migrazione legacy */

/**
 * Da data URL legacy ad allegato, un file per volta.
 *
 * **Non e una migrazione di massa e non deve diventarlo.** La riscrittura in
 * blocco di un archivio di allegati e l'operazione che si scopre di aver
 * sbagliato quando un certificato medico non si apre piu e nessuno ha una
 * copia. La strategia e incrementale: un allegato migra quando qualcuno lo
 * tocca — lo sostituisce, o apre la scheda che lo contiene con la migrazione
 * abilitata — e finche non migra continua a funzionare com'e.
 *
 * Restituisce `null` quando il valore non e un data URL: cosi chi la chiama in
 * un ciclo non deve distinguere i casi.
 */
export const importLegacyDataUrl = async (
  dataUrl: string | null | undefined,
  owner: {
    organizationId?: string | null;
    ownerType: string;
    ownerId: string;
    category: string;
    fileName?: string | null;
  },
  scope?: AttachmentAccessScope,
): Promise<AttachmentMetadata | null> => {
  const raw = String(dataUrl || "").trim();
  const match = /^data:([^;,]+)(;base64)?,(.*)$/is.exec(raw);
  if (!match) return null;

  const mimeType = match[1].toLowerCase();
  const isBase64 = Boolean(match[2]);
  const body = match[3];

  const content = isBase64
    ? Buffer.from(body, "base64")
    : Buffer.from(decodeURIComponent(body), "utf8");

  if (!content.length || content.length > MAX_ATTACHMENT_BYTES) {
    return null;
  }

  return createAttachment(
    {
      organizationId: owner.organizationId,
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      category: owner.category,
      fileName: owner.fileName || `${owner.category}`,
      mimeType,
      content,
    },
    scope,
  );
};
