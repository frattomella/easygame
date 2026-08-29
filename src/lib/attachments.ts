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
  /*
    Lavoro sportivo. Due proprietari e non uno perche i documenti si dividono
    in due gruppi che scadono in momenti diversi: quelli del **rapporto** —
    contratto, comunicazioni, mandato — finiscono con il rapporto; quelli
    della **persona** — documento d'identita, autocertificazione, coordinate
    bancarie — le restano addosso anche quando cambia societa.

    Stanno in questa lista e non in un archivio proprio: CLAUDE.md vieta un
    secondo sistema di allegati, e avrebbe ragione anche se non lo vietasse.
    `owner_type` e polimorfico dal primo giorno proprio per questo.
  */
  "sport_work_relationship",
  "sport_work_person",
  /*
    L'allegato di un annuncio della bacheca (Wave 2, G-08): il modulo del
    torneo, il calendario in PDF. Il proprietario e l'**annuncio** e non il
    club, perche e l'annuncio a decidere chi puo vederlo — il suo pubblico e
    quello dell'audience engine, non tutti quelli che vedono la configurazione
    societaria.
  */
  "announcement",
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
  /**
   * Da quando il documento vale, come giorno `AAAA-MM-GG`. `null` = non
   * dichiarata.
   */
  validFrom: string | null;
  /**
   * Fino a quando il documento vale. `null` = **non scade**, e non e un
   * errore: la maggior parte degli allegati di una segreteria non ha una
   * scadenza e non deve averla.
   *
   * Lo **stato** (valido / in scadenza / scaduto) non e qui e non e una
   * colonna: si ricava con `deriveAttachmentValidity`.
   */
  validUntil: string | null;
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

/* ---------------------------------------------------------- la validita */

/**
 * La validita di un documento (Wave 3, W3-G).
 *
 * **Perche lo stato non e una colonna.** Un documento e valido, in scadenza o
 * scaduto a seconda di **oggi**: scriverlo vorrebbe dire tenerlo aggiornato, e
 * nessun giro notturno puo garantirlo per ogni riga di ogni club. E la stessa
 * regola che governa lo stato di una rata e quello di una scadenza del lavoro
 * sportivo — si ricava, non si imposta (ADR-0036). Qui ci sono solo le **due
 * date**; lo stato lo produce `deriveAttachmentValidity` quando serve.
 *
 * **Perche l'aritmetica dei giorni e scritta qui e non importata.** La gemella
 * canonica e `daysBetween` in `src/lib/automations/rules.ts`, ancorata a
 * mezzanotte UTC per la stessa ragione e con la stessa dimostrazione. Non la si
 * importa perche quel modulo tira dentro il catalogo dei segnaposto e i modelli
 * di messaggio, e questo file lo importa **ogni** schermata con un campo di
 * caricamento: la validita di un documento non deve costare al browser il
 * motore delle automazioni. Le due funzioni sono confrontate da un test.
 */

/** Mezzanotte **UTC**: due istanti dello stesso giorno sono lo stesso giorno. */
const attachmentStartOfDay = (value: Date) =>
  new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );

/**
 * Giorni interi fra due giorni di calendario, positivo se `to` e nel futuro.
 *
 * Ancorata a UTC: una scadenza in EasyGame e una **data**, non un istante, e
 * misurarla con la mezzanotte locale del processo darebbe un giorno di
 * differenza a New York — cioe un promemoria che non parte mai, perche
 * l'occorrenza non si recupera all'indietro.
 */
export const attachmentDaysBetween = (from: Date, to: Date) =>
  Math.round(
    (attachmentStartOfDay(to).getTime() - attachmentStartOfDay(from).getTime()) /
      86400000,
  );

/** `2026-11-30`: il giorno, in una forma che ordina e si legge. */
export const toAttachmentDayKey = (value: Date) =>
  attachmentStartOfDay(value).toISOString().slice(0, 10);

/**
 * Una data di validita, letta da cio che arriva dal form o dall'archivio.
 *
 * Restituisce `null` sia per «assente» sia per «illeggibile»: chi deve
 * distinguere i due casi usa `validateAttachmentValidity`, che dice **quale**
 * valore non e una data. Un giorno puro (`2026-11-30`) resta quel giorno,
 * perche JavaScript lo legge gia come mezzanotte UTC.
 */
export const parseAttachmentValidityDate = (
  value?: string | Date | null,
): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : attachmentStartOfDay(value);
  }

  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : attachmentStartOfDay(parsed);
};

/**
 * Entro quanti giorni una scadenza si considera imminente, quando chi chiede
 * non lo dichiara.
 *
 * E la soglia con cui l'anagrafica colora una riga, non una regola di
 * prodotto: un'automazione porta la **sua** — quella che il club ha
 * configurato — e non deve poter essere annullata da una costante scritta qui.
 */
export const ATTACHMENT_EXPIRY_WARNING_DAYS = 30;

/**
 * Gli stati in cui un documento puo trovarsi.
 *
 * `unknown` non e un errore: e un allegato **senza scadenza dichiarata**, che
 * e la condizione normale della maggior parte dei file di una segreteria.
 * Chiamarlo «valido» sarebbe una promessa che nessuno ha fatto.
 */
export const ATTACHMENT_VALIDITY_STATES = [
  "valid",
  "expiring",
  "expired",
  "not_yet_valid",
  "unknown",
] as const;

export type AttachmentValidityState =
  (typeof ATTACHMENT_VALIDITY_STATES)[number];

export const ATTACHMENT_VALIDITY_LABELS: Record<
  AttachmentValidityState,
  string
> = {
  valid: "Valido",
  expiring: "In scadenza",
  expired: "Scaduto",
  not_yet_valid: "Non ancora valido",
  unknown: "Senza scadenza",
};

export type AttachmentValidity = {
  state: AttachmentValidityState;
  /** Il giorno da cui vale, `AAAA-MM-GG`, oppure `null`. */
  validFrom: string | null;
  /** Il giorno fino a cui vale, `AAAA-MM-GG`, oppure `null`. */
  validUntil: string | null;
  /**
   * Giorni da oggi alla scadenza. Negativo se e passata, `null` se non c'e.
   * Zero e l'**ultimo giorno buono**, non il primo giorno scaduto.
   */
  daysToExpiry: number | null;
};

export type AttachmentValidityInput = {
  validFrom?: string | Date | null;
  validUntil?: string | Date | null;
};

/**
 * Lo stato di validita, ricavato dalle due date e da oggi.
 *
 * **`valid_until` e inclusiva**: e «fino a quando il documento vale», quindi il
 * giorno stesso della scadenza il documento vale ancora ed e «in scadenza»; e
 * scaduto dal giorno dopo. E la lettura opposta a quella del certificato
 * medico, dove il giorno della scadenza conta gia come scaduto — li la
 * differenza e voluta e documentata in `automations.ts`, perche un atleta con
 * il certificato in scadenza quel giorno **non puo scendere in campo**, mentre
 * un attestato BLSD vale fino a sera.
 *
 * L'ordine dei controlli non e casuale: «non ancora valido» viene prima di
 * tutto perche e un fatto piu forte — un documento che entra in vigore fra un
 * mese non e «valido», qualunque cosa dica la sua scadenza.
 */
export const deriveAttachmentValidity = (
  input: AttachmentValidityInput,
  now: Date = new Date(),
  options: { expiringWithinDays?: number } = {},
): AttachmentValidity => {
  const from = parseAttachmentValidityDate(input.validFrom);
  const until = parseAttachmentValidityDate(input.validUntil);

  const soglia = Number.isFinite(Number(options.expiringWithinDays))
    ? Math.max(0, Math.trunc(Number(options.expiringWithinDays)))
    : ATTACHMENT_EXPIRY_WARNING_DAYS;

  const base = {
    validFrom: from ? toAttachmentDayKey(from) : null,
    validUntil: until ? toAttachmentDayKey(until) : null,
  };

  if (from && attachmentDaysBetween(now, from) > 0) {
    return {
      ...base,
      state: "not_yet_valid",
      daysToExpiry: until ? attachmentDaysBetween(now, until) : null,
    };
  }

  if (!until) {
    return { ...base, state: "unknown", daysToExpiry: null };
  }

  const daysToExpiry = attachmentDaysBetween(now, until);

  if (daysToExpiry < 0) {
    return { ...base, state: "expired", daysToExpiry };
  }

  return {
    ...base,
    state: daysToExpiry <= soglia ? "expiring" : "valid",
    daysToExpiry,
  };
};

export type AttachmentValidityValidation =
  | { ok: true; validFrom: Date | null; validUntil: Date | null }
  | { ok: false; message: string };

const dayForHumans = (value: Date) => {
  const day = String(value.getUTCDate()).padStart(2, "0");
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${value.getUTCFullYear()}`;
};

/**
 * Le due date sono scrivibili?
 *
 * Un intervallo rovesciato non e un dato da normalizzare in silenzio: «vale dal
 * 1 dicembre fino al 30 novembre» e quasi sempre un mese digitato al posto di
 * un altro, e accettarlo produrrebbe un documento **sempre scaduto** che
 * nessuno capisce perche lo sia. Il messaggio dice cosa fare, non solo cosa e
 * andato storto.
 */
export const validateAttachmentValidity = (
  input: AttachmentValidityInput,
): AttachmentValidityValidation => {
  const rawFrom = input.validFrom instanceof Date ? "" : String(input.validFrom ?? "").trim();
  const rawUntil =
    input.validUntil instanceof Date ? "" : String(input.validUntil ?? "").trim();

  const validFrom = parseAttachmentValidityDate(input.validFrom);
  const validUntil = parseAttachmentValidityDate(input.validUntil);

  if (rawFrom && !validFrom) {
    return {
      ok: false,
      message: `Inizio validita non valido: «${rawFrom}». Indica un giorno nel formato AAAA-MM-GG.`,
    };
  }

  if (rawUntil && !validUntil) {
    return {
      ok: false,
      message: `Scadenza non valida: «${rawUntil}». Indica un giorno nel formato AAAA-MM-GG.`,
    };
  }

  if (validFrom && validUntil && validUntil.getTime() < validFrom.getTime()) {
    return {
      ok: false,
      message: `La scadenza (${dayForHumans(validUntil)}) e precedente all'inizio della validita (${dayForHumans(validFrom)}). Correggi una delle due date.`,
    };
  }

  return { ok: true, validFrom, validUntil };
};

/* ------------------------------------------------------- le categorie */

/**
 * La `category` di un allegato, ridotta a un identificativo confrontabile.
 *
 * E la stessa riduzione che `certificate-attachment-field.tsx` applica al tipo
 * di documento prima di caricarlo («Primo soccorso» -> `primo-soccorso`):
 * senza, un filtro configurato scrivendo «BLSD» non troverebbe gli allegati
 * salvati come `blsd`.
 */
export const normalizeAttachmentCategory = (value?: string | null) =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * Le categorie la cui scadenza e **gia governata dal certificato medico**.
 *
 * Il certificato medico ha la sua fonte (`medical_certificates.expiry_date`),
 * la sua semantica (mancante / in scadenza / scaduto) e la sua automazione,
 * `AUT-03`, che gira ogni notte da Wave 2. Se l'innesco documentale guardasse
 * anche questi allegati, la stessa scadenza avrebbe **due sorgenti** e la
 * famiglia riceverebbe due promemoria per lo stesso fatto — con due testi
 * diversi, perche i due modelli sono diversi.
 *
 * La difesa e strutturale e sta qui, in un modulo puro, invece che in una
 * condizione dentro il valutatore: la stessa lista esclude le categorie dalla
 * configurazione (non si possono scegliere) **e** dalla valutazione (non
 * producono occorrenze anche se una regola vecchia le nominasse).
 *
 * I nomi sono quelli che il prodotto scrive davvero: `certificato-medico` dal
 * caricamento della scheda atleta, `visita-medica` dalle visite mediche, e la
 * forma inglese che compare negli archivi piu vecchi.
 */
export const MEDICAL_CERTIFICATE_ATTACHMENT_CATEGORIES = [
  "certificato-medico",
  "visita-medica",
  "medical-certificate",
] as const;

const MEDICAL_CATEGORY_SET = new Set<string>(
  MEDICAL_CERTIFICATE_ATTACHMENT_CATEGORIES,
);

/** Vero quando la scadenza di quell'allegato la governa gia `AUT-03`. */
export const isMedicalCertificateAttachmentCategory = (
  value?: string | null,
) => MEDICAL_CATEGORY_SET.has(normalizeAttachmentCategory(value));

/**
 * Le categorie che il prodotto genera oggi per un atleta, come suggerimento.
 *
 * **Non e un elenco chiuso.** La `category` resta una stringa libera — la
 * scrive chi carica — e un filtro puo nominarne una che non e qui. Serve solo
 * a far scegliere invece che ricordare: chi configura la regola dei BLSD non
 * deve indovinare come e scritto il trattino.
 */
export const SUGGESTED_ATTACHMENT_CATEGORIES = [
  "blsd",
  "primo-soccorso",
  "antincendio",
  "tesseramento",
  "documento-identita",
  "assicurazione",
  "compilazione-modulo",
] as const;
