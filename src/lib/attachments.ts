/**
 * Allegati: il contratto unico, lato modello.
 *
 * **Il difetto strutturale che questo modulo apre la strada a chiudere**
 * (WP-15, D13). Fino al Blocco 7 un allegato di EasyGame era una stringa
 * `data:application/pdf;base64,…` **dentro** il record JSON dell'atleta, del
 * contratto o del certificato. Tre conseguenze, tutte misurate:
 *
 * 1. una lista di 200 atleti trasferiva decine di MB — `view=summary` (WP-31)
 *    l'ha nascosto, non risolto: i file sono ancora nel record;
 * 2. base64 costa il 33% in piu del binario, e Postgres lo tiene in TOAST
 *    dentro la stessa riga che si legge per mostrare un nome e una categoria;
 * 3. un allegato non aveva **identita**: nessun tipo MIME affidabile, nessuna
 *    dimensione, nessun autore, nessuna data. Il nome del download andava
 *    indovinato.
 *
 * **La forma nuova.** Un allegato e una riga della tabella `attachments`, con
 * i suoi metadati, e il record di dominio ne conserva **solo un riferimento**:
 *
 *     attachment:2f1c…-…-…            (una stringa, come prima)
 *
 * Il campo resta quindi una `string`, esattamente come i data URL che
 * sostituisce: nessun call site cambia forma, nessuna migrazione di schema
 * JSON, e i due formati convivono per tutto il tempo che serve.
 *
 * **Provider-agnostico per costruzione.** Questo modulo non sa dove stiano i
 * byte. Il driver di memorizzazione e una decisione del server
 * (`src/lib/server/attachments.ts`): oggi una tabella dedicata, domani un
 * object storage, senza che il client se ne accorga.
 */

/** Prefisso del riferimento. Corto, leggibile, non confondibile con un URL. */
export const ATTACHMENT_REFERENCE_PREFIX = "attachment:";

/** Percorso dell'API che serve i byte. Un URL http normale, non un `data:`. */
export const ATTACHMENT_ENDPOINT = "/api/v1/attachments";

/**
 * Tipi accettati.
 *
 * E un elenco chiuso di proposito: un allegato di una segreteria sportiva e un
 * documento o una foto. Accettare qualunque cosa vorrebbe dire ospitare
 * eseguibili e archivi in un endpoint autenticato ma condiviso fra soci,
 * genitori e allenatori.
 */
export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "image/tiff",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

const ALLOWED_MIME_SET = new Set<string>(ALLOWED_ATTACHMENT_MIME_TYPES);

/**
 * Dimensione massima di un singolo allegato: 10 MB.
 *
 * Non e un limite tecnico del driver, e un limite di prodotto. Un certificato
 * medico scansionato sta in 1-2 MB; oltre i 10 c'e quasi sempre una foto non
 * ridimensionata, e accettarla significa farla riscaricare a ogni apertura
 * della scheda.
 */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * A chi appartiene un allegato.
 *
 * Non e una tassonomia dei documenti: e la **risorsa** che lo possiede, cioe
 * cio che decide chi puo vederlo. La natura del documento sta in `category`.
 */
export const ATTACHMENT_OWNER_TYPES = [
  "athlete",
  "trainer",
  "staff",
  "member",
  "club",
  "guardian",
  "form",
  "other",
] as const;

export type AttachmentOwnerType = (typeof ATTACHMENT_OWNER_TYPES)[number];

const OWNER_TYPE_SET = new Set<string>(ATTACHMENT_OWNER_TYPES);

export const isAttachmentOwnerType = (
  value?: string | null,
): value is AttachmentOwnerType =>
  OWNER_TYPE_SET.has(String(value || "").trim().toLowerCase());

/** Metadati di un allegato, come li restituisce l'API. Mai i byte. */
export type AttachmentMetadata = {
  id: string;
  organizationId: string;
  ownerType: string;
  ownerId: string;
  /** «medical-certificate», «blsd», «identity-document»… */
  category: string;
  /** Il nome con cui il file e stato caricato. */
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** sha256 esadecimale del contenuto: permette di riconoscere un duplicato. */
  checksum: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  /** Riferimento da salvare nel record di dominio. */
  reference: string;
  /** URL da cui il browser puo leggerlo. */
  url: string;
};

/** Costruisce il riferimento da salvare nel record. */
export const buildAttachmentReference = (id: string) =>
  `${ATTACHMENT_REFERENCE_PREFIX}${String(id || "").trim()}`;

/**
 * L'id dentro un riferimento, oppure stringa vuota.
 *
 * Accetta sia il riferimento (`attachment:<id>`) sia l'URL dell'endpoint
 * (`/api/v1/attachments/<id>`): il secondo capita quando un valore e stato
 * copiato da un `href` invece che dal campo.
 */
export const parseAttachmentReference = (value?: string | null): string => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (raw.toLowerCase().startsWith(ATTACHMENT_REFERENCE_PREFIX)) {
    return raw.slice(ATTACHMENT_REFERENCE_PREFIX.length).trim();
  }

  const fromUrl = new RegExp(`^${ATTACHMENT_ENDPOINT}/([^/?#]+)`).exec(raw);
  return fromUrl ? decodeURIComponent(fromUrl[1]) : "";
};

export const isAttachmentReference = (value?: string | null) =>
  Boolean(parseAttachmentReference(value));

/** L'URL da cui leggere i byte di un allegato. */
export const buildAttachmentUrl = (
  id: string,
  options: { download?: string | null } = {},
) => {
  const base = `${ATTACHMENT_ENDPOINT}/${encodeURIComponent(String(id || "").trim())}`;
  const download = String(options.download || "").trim();
  return download
    ? `${base}?download=${encodeURIComponent(download)}`
    : base;
};

/**
 * Le tre forme in cui un allegato puo presentarsi oggi.
 *
 * `legacy-inline` e il data URL nel record: **continua a funzionare**, non e
 * un errore e non va segnalato all'utente. E lo stato di un archivio che non
 * e ancora stato migrato, non un difetto di quel singolo allegato.
 */
export type AttachmentSourceKind =
  | "empty"
  | "reference"
  | "legacy-inline"
  | "remote";

export type AttachmentSource = {
  kind: AttachmentSourceKind;
  /** Id dell'allegato, solo per `reference`. */
  id: string;
  /** Dove il browser deve puntare per leggerlo. Vuoto per `empty`. */
  href: string;
  /** Il MIME che si riesce a dedurre senza chiedere al server. */
  mimeType: string;
};

const readMimeFromDataUrl = (url: string): string => {
  const match = /^data:([^;,]+)[;,]/i.exec(url);
  return match ? match[1].toLowerCase() : "";
};

/**
 * Classifica il valore di un campo allegato.
 *
 * **Una sola funzione decide.** Il difetto ricorrente dei blocchi precedenti
 * era che ogni pulsante «Visualizza» rifaceva a modo suo la domanda «che cosa
 * ho in mano»: chi con `startsWith("data:")`, chi con `includes("base64")`,
 * chi non se la poneva. Qui la risposta e una.
 */
export const resolveAttachmentSource = (
  value?: string | null,
): AttachmentSource => {
  const raw = String(value || "").trim();
  if (!raw) {
    return { kind: "empty", id: "", href: "", mimeType: "" };
  }

  const referenceId = parseAttachmentReference(raw);
  if (referenceId) {
    return {
      kind: "reference",
      id: referenceId,
      href: buildAttachmentUrl(referenceId),
      mimeType: "",
    };
  }

  if (/^data:/i.test(raw)) {
    return {
      kind: "legacy-inline",
      id: "",
      href: raw,
      mimeType: readMimeFromDataUrl(raw),
    };
  }

  return { kind: "remote", id: "", href: raw, mimeType: "" };
};

/** Vero quando il campo contiene qualcosa di apribile. */
export const hasAttachment = (value?: string | null) =>
  resolveAttachmentSource(value).kind !== "empty";

export type AttachmentValidationResult =
  | { ok: true; mimeType: string; sizeBytes: number }
  | { ok: false; message: string };

const humanSize = (bytes: number) => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${bytes} byte`;
};

/**
 * Il file caricato e accettabile?
 *
 * Vale sia sul client (per dirlo prima di caricare 10 MB) sia sul server (dove
 * e l'unico controllo che conta). Il messaggio e in italiano e dice **cosa
 * fare**, non solo cosa e andato storto.
 */
export const validateAttachmentInput = (input: {
  mimeType?: string | null;
  sizeBytes?: number | null;
  fileName?: string | null;
}): AttachmentValidationResult => {
  const mimeType = String(input.mimeType || "").trim().toLowerCase();
  const sizeBytes = Number(input.sizeBytes || 0);

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, message: "Il file e vuoto." };
  }

  if (sizeBytes > MAX_ATTACHMENT_BYTES) {
    return {
      ok: false,
      message: `Il file supera il limite di ${humanSize(MAX_ATTACHMENT_BYTES)} (${humanSize(sizeBytes)}). Riducilo o caricalo in PDF.`,
    };
  }

  if (!mimeType) {
    return {
      ok: false,
      message: "Non riesco a riconoscere il tipo del file.",
    };
  }

  if (!ALLOWED_MIME_SET.has(mimeType)) {
    return {
      ok: false,
      message: `Tipo di file non ammesso (${mimeType}). Sono accettati PDF, immagini e documenti Office.`,
    };
  }

  return { ok: true, mimeType, sizeBytes };
};

/** L'elenco dei tipi, nella forma che vuole l'attributo `accept`. */
export const ATTACHMENT_ACCEPT_ATTRIBUTE =
  ALLOWED_ATTACHMENT_MIME_TYPES.join(",");
