/**
 * Il modello dei moduli — Modulistica V2.
 *
 * **Cosa e cambiato rispetto alla prima versione.** I moduli vivevano dentro
 * `clubs.document_templates`, lo stesso campo JSON dei modelli di stampa:
 * salvare una risposta riscriveva l'intero array del club, e trovare un
 * modulo pubblico voleva dire un `@>` su tutta la tabella `clubs`. Un modulo
 * ora e una riga, una versione pubblicata e una riga, una compilazione e una
 * riga. Vedi ADR-0039.
 *
 * **Cosa e cambiato per chi costruisce un modulo.** Il vecchio editor apriva
 * ogni impostazione di ogni campo tutte insieme: tipo, placeholder, opzioni,
 * min, max, tipi di file, dimensione massima, obbligatorieta, per ognuno dei
 * diciassette tipi. Qui un campo ha cinque proprieta e ne mostra soltanto
 * quelle che il suo tipo usa davvero.
 *
 * Questo file e **puro**: nessun import da `@/lib/server`, nessuna chiamata di
 * rete, nessun Prisma. Lo usano il builder, il modulo pubblico, il servizio e
 * i test.
 */

import { buildAttachmentUrl, parseAttachmentReference } from "@/lib/attachments";
import {
  isValidConsentKey,
  normalizeConsentKey,
} from "@/lib/consents/model";
import {
  collectSubjectsFromBindings,
  getDynamicField,
  type FormSubjectKey,
} from "./dynamic-fields";

/* ------------------------------------------------------------------ stati */

export type FormStatus = "draft" | "published" | "archived";

export const FORM_STATUS_LABELS: Record<FormStatus, string> = {
  draft: "Bozza",
  published: "Pubblicato",
  archived: "Archiviato",
};

/**
 * Gli stati di una pratica (ADR-0189).
 *
 * `approved` scrive consensi e documenti ma non crea schede; `converted` e la
 * pratica da cui e nata, o a cui e stata collegata, una scheda atleta.
 * `changes_requested` e la pratica tornata alla famiglia con un elenco di
 * cose da correggere; il reinvio la riporta a `pending` con una revisione in
 * piu. `archived` chiude senza toccare l'anagrafica.
 */
export const FORM_SUBMISSION_STATUSES = [
  "pending",
  "changes_requested",
  "approved",
  "converted",
  "rejected",
  "archived",
] as const;

export type FormSubmissionStatus = (typeof FORM_SUBMISSION_STATUSES)[number];

export const FORM_SUBMISSION_STATUS_LABELS: Record<
  FormSubmissionStatus,
  string
> = {
  pending: "Da revisionare",
  changes_requested: "Integrazione richiesta",
  approved: "Approvata",
  converted: "Atleta creato",
  rejected: "Rifiutata",
  archived: "Archiviata",
};

export const isFormSubmissionStatus = (value: unknown): value is FormSubmissionStatus =>
  FORM_SUBMISSION_STATUSES.includes(String(value ?? "") as FormSubmissionStatus);

/** La pratica e ancora aperta: qualcuno deve fare qualcosa. */
export const submissionIsOpen = (status: string) =>
  status === "pending" || status === "changes_requested";

/** La pratica si e chiusa bene: approvata, con o senza scheda. */
export const submissionIsApprovedLike = (status: string) =>
  status === "approved" || status === "converted";

/**
 * Cio che il club ha chiesto di correggere (stato `changes_requested`).
 * I campi non elencati non si possono cambiare al reinvio.
 */
export type FormChangesRequested = {
  fieldIds: string[];
  note: string;
  requestedAt: string;
  requestedBy: string | null;
};

/**
 * La semantica legale di una casella (ADR-0192). Una casella senza
 * `legalKind` e una domanda si/no e basta.
 */
export const FORM_LEGAL_KINDS = [
  "",
  "acknowledgement",
  "required_acceptance",
  "optional_consent",
  "authorization",
] as const;

export type FormLegalKind = (typeof FORM_LEGAL_KINDS)[number];

export const FORM_LEGAL_KIND_LABELS: Record<Exclude<FormLegalKind, "">, string> = {
  acknowledgement: "Presa visione",
  required_acceptance: "Accettazione richiesta",
  optional_consent: "Consenso facoltativo",
  authorization: "Autorizzazione",
};

export const FORM_LEGAL_KIND_HINTS: Record<Exclude<FormLegalKind, "">, string> = {
  acknowledgement: "Dichiara di aver letto (informativa, regolamento). Non e un consenso.",
  required_acceptance: "Senza questa accettazione non si va avanti (condizioni, patto associativo). Non e la base giuridica del trattamento.",
  optional_consent: "Un consenso separato per una finalita (immagini, comunicazioni). Mai obbligatorio, sempre revocabile.",
  authorization: "Una dichiarazione del genitore o tutore (uscita autonoma, trasporto).",
};

/**
 * La prova di una dichiarazione, salvata nella pratica all'invio (ADR-0192):
 * il testo mostrato, la sua impronta, la versione, la risposta, l'ora, il
 * metodo.
 */
export type FormDeclaration = {
  fieldId: string;
  legalKind: Exclude<FormLegalKind, "">;
  consentKey: string;
  label: string;
  text: string;
  textHash: string;
  versionId: string;
  answer: boolean;
  at: string;
  method: "web_checkbox";
  respondent: string;
};

/** Da dove arriva una compilazione. */
export type FormSubmissionSource = "public" | "internal";

export const FORM_SUBMISSION_SOURCE_LABELS: Record<
  FormSubmissionSource,
  string
> = {
  public: "Modulo pubblico",
  internal: "Compilato in segreteria",
};

/* ------------------------------------------------------------------ campi */

export type FormFieldType =
  | "short_text"
  | "long_text"
  | "number"
  | "date"
  | "email"
  | "phone"
  | "single_choice"
  | "multiple_choice"
  | "dropdown"
  | "checkbox"
  | "file_upload"
  | "image_upload"
  | "signature"
  | "section"
  | "content";

export type FormFieldTypeDefinition = {
  value: FormFieldType;
  label: string;
  /** Una riga sola: compare nel menu «Aggiungi campo». */
  hint: string;
  /** Il campo ha un elenco di opzioni da scrivere. */
  hasOptions: boolean;
  /** Il campo accetta un testo di esempio dentro la casella. */
  hasPlaceholder: boolean;
  /**
   * Il campo raccoglie una risposta. Le sezioni no: sono intestazioni, non si
   * compilano, non si possono rendere obbligatorie e non finiscono fra le
   * risposte salvate.
   */
  collectsAnswer: boolean;
};

/**
 * I tipi di campo, nell'ordine in cui compaiono nel menu.
 *
 * Sono dodici piu la sezione. La prima versione ne aveva diciassette, fra cui
 * «divisore», «link video» e «consenso/privacy»: il divisore e una sezione
 * senza titolo, il link video e un testo breve, e il consenso e una casella di
 * spunta obbligatoria con una descrizione. Tre tipi in meno da spiegare, zero
 * funzioni in meno.
 */
export const FORM_FIELD_TYPES: FormFieldTypeDefinition[] = [
  { value: "short_text", label: "Testo breve", hint: "Una riga: nome, codice, numero di tessera", hasOptions: false, hasPlaceholder: true, collectsAnswer: true },
  { value: "long_text", label: "Testo lungo", hint: "Piu righe: note, indirizzo esteso, motivazioni", hasOptions: false, hasPlaceholder: true, collectsAnswer: true },
  { value: "number", label: "Numero", hint: "Solo cifre", hasOptions: false, hasPlaceholder: true, collectsAnswer: true },
  { value: "date", label: "Data", hint: "Calendario", hasOptions: false, hasPlaceholder: false, collectsAnswer: true },
  { value: "email", label: "Email", hint: "Indirizzo di posta, validato", hasOptions: false, hasPlaceholder: true, collectsAnswer: true },
  { value: "phone", label: "Telefono", hint: "Numero di telefono", hasOptions: false, hasPlaceholder: true, collectsAnswer: true },
  { value: "single_choice", label: "Scelta singola", hint: "Un'opzione fra quelle elencate", hasOptions: true, hasPlaceholder: false, collectsAnswer: true },
  { value: "multiple_choice", label: "Scelta multipla", hint: "Piu opzioni fra quelle elencate", hasOptions: true, hasPlaceholder: false, collectsAnswer: true },
  { value: "dropdown", label: "Menu a tendina", hint: "Un'opzione, in un elenco richiudibile", hasOptions: true, hasPlaceholder: false, collectsAnswer: true },
  { value: "checkbox", label: "Casella da spuntare", hint: "Si o no. Con obbligatoria diventa un consenso", hasOptions: false, hasPlaceholder: false, collectsAnswer: true },
  { value: "file_upload", label: "Documento da caricare", hint: "PDF o foto di un documento", hasOptions: false, hasPlaceholder: false, collectsAnswer: true },
  { value: "image_upload", label: "Immagine da caricare", hint: "Solo immagini: fototessera, foto del documento", hasOptions: false, hasPlaceholder: false, collectsAnswer: true },
  { value: "signature", label: "Firma disegnata", hint: "Un'evidenza grafica tracciata con dito o mouse: non e una firma digitale", hasOptions: false, hasPlaceholder: false, collectsAnswer: true },
  { value: "section", label: "Sezione", hint: "Un titolo che separa: non si compila", hasOptions: false, hasPlaceholder: false, collectsAnswer: false },
  { value: "content", label: "Testo formattato", hint: "Titoli, paragrafi, elenchi, link, tabelle, immagini: il testo legale e le istruzioni", hasOptions: false, hasPlaceholder: false, collectsAnswer: false },
];

const FIELD_TYPE_BY_VALUE = new Map(
  FORM_FIELD_TYPES.map((definition) => [definition.value, definition]),
);

export const getFieldTypeDefinition = (
  type?: string | null,
): FormFieldTypeDefinition =>
  FIELD_TYPE_BY_VALUE.get(String(type || "") as FormFieldType) ||
  FIELD_TYPE_BY_VALUE.get("short_text")!;

export const getFieldTypeLabel = (type?: string | null) =>
  getFieldTypeDefinition(type).label;

export const fieldCollectsAnswer = (type?: string | null) =>
  getFieldTypeDefinition(type).collectsAnswer;

export const fieldHasOptions = (type?: string | null) =>
  getFieldTypeDefinition(type).hasOptions;

/** I tipi il cui valore e un file, quindi un allegato e non una risposta. */
export const fieldIsFile = (type?: string | null) =>
  type === "file_upload" || type === "image_upload" || type === "signature";

/** Le famiglie di file che un campo di caricamento accetta. */
export const FORM_UPLOAD_ACCEPTS = ["documents", "images"] as const;
export type FormUploadAccept = (typeof FORM_UPLOAD_ACCEPTS)[number];

export type FormFieldUpload = {
  accept: FormUploadAccept;
  /** Byte massimi per file; il tetto del sistema resta `MAX_PUBLIC_FORM_UPLOAD_BYTES`. */
  maxBytes: number;
};

/** «Se X vale Y mostra questo campo» (ADR-0190 §1): una condizione sola. */
export type FormVisibilityRule = {
  fieldId: string;
  equals: string;
};

export type FormField = {
  id: string;
  type: FormFieldType;
  label: string;
  description: string;
  required: boolean;
  placeholder: string;
  options: string[];
  /**
   * La chiave del catalogo dei dati EasyGame, oppure stringa vuota.
   *
   * Quando c'e, il campo non e solo una domanda: e *quel* dato di *quel*
   * soggetto, precompilabile e riversabile in anagrafica.
   */
  binding: string;
  /**
   * La chiave della `consent_definition` che questa spunta esprime, oppure
   * stringa vuota.
   *
   * **Perche non basta la casella obbligatoria.** Una spunta resta dentro
   * `form_submissions.answers`: e la risposta a una domanda di marzo, non uno
   * stato della persona che si possa interrogare o revocare. Dichiarando la
   * chiave, all'approvazione la spunta diventa un `consent_record` che cita il
   * testo pubblicato — che e l'unica forma in cui un consenso si dimostra
   * (ADR-0090).
   *
   * Solo una `checkbox` la porta: «spuntato / non spuntato» e l'unica risposta
   * che si traduce in «accettato / rifiutato» senza interpretare niente.
   */
  consentKey: string;
  /** La semantica legale di una casella (ADR-0192); vuoto per una domanda si/no. */
  legalKind: FormLegalKind;
  /** L'HTML sanificato di un blocco `content`; vuoto per gli altri tipi. */
  content: string;
  /** Visibile solo se un altro campo vale un certo valore; `null` = sempre. */
  visibleWhen: FormVisibilityRule | null;
  /** Le regole di caricamento di un `file_upload`/`image_upload`; `null` per gli altri. */
  upload: FormFieldUpload | null;
};

export type FormSettings = {
  /** Cosa legge chi ha appena inviato. */
  successMessage: string;
  /** Data oltre la quale il modulo pubblico non accetta piu risposte. */
  closeAt: string;
  /** Chiedere un indirizzo email a chi compila il modulo pubblico. */
  collectRespondentEmail: boolean;
  /** Notificare la segreteria a ogni invio. */
  notifyOnSubmit: boolean;
  /**
   * **Si compila una volta sola** (PP-02 §J).
   *
   * Fin qui l'unica difesa contro un secondo invio era la deduplicazione a
   * finestra: dieci minuti, e con le **stesse** risposte. Fuori da quella
   * finestra, o cambiando una virgola, una famiglia poteva rimandare la stessa
   * iscrizione tre volte, e in segreteria arrivavano tre pratiche da leggere
   * per capire quale valesse.
   *
   * La finestra resta e continua a fare il proprio mestiere — il doppio clic —
   * perche sono due difese diverse: quella difende dal **gesto** ripetuto,
   * questa dalla **compilazione** ripetuta.
   *
   * Vale per soggetto: «una volta sola» significa «una volta per atleta», non
   * «una volta per club». Un modulo senza un soggetto risolvibile — la
   * compilazione pubblica di chi non e ancora in anagrafica — non e vincolato,
   * perche non c'e niente su cui contare, e va detto invece di lasciarlo
   * credere.
   */
  singleSubmission: boolean;
  /**
   * Il modello di documento che l'approvazione rende, oppure stringa vuota.
   *
   * Sta nelle impostazioni — cioe **dentro la versione** — e non in una
   * colonna del modulo: quale foglio esce da una compilazione fa parte di cio
   * che quella compilazione significava, come le domande. Cambiare modello
   * domani non deve riscrivere la storia di cio che e uscito ieri.
   */
  documentTemplateId: string;
  /**
   * **A cosa serve questo modulo**, quando il club lo dichiara.
   *
   * `""` significa «non dichiarato», e non e la stessa cosa di `"generic"`:
   * i moduli scritti prima che questa impostazione esistesse non hanno detto
   * niente, e trattarli come «altro» li farebbe sparire tutti insieme dal
   * menu del rinnovo — cioe spegnerebbe una funzione che oggi lavora. Per
   * quelli si **deduce** dai campi (`isEnrollmentForm`), e la deduzione e
   * precisa: un modulo che non raccoglie l'atleta non ha niente da rinnovare.
   *
   * Sta nelle impostazioni — cioe **dentro la versione**, come
   * `documentTemplateId` — perche «questa compilazione era un'iscrizione»
   * fa parte di cio che quella compilazione significava. Non e una colonna
   * nuova: `FormSubmission.kind` resta l'autorita sull'**atto**
   * (`enrollment` contro `renewal`), questa dice a cosa serve il **modulo**.
   */
  purpose: FormPurpose;
  /**
   * La voce del catalogo EasyGame da cui il modulo e nato, o stringa vuota.
   *
   * **Provenienza, non proprieta**: un modulo adottato e del club, si
   * modifica liberamente e il catalogo non lo tocca piu. La chiave resta per
   * due ragioni sole — dire da quale modello viene, e non riproporre due
   * volte la stessa cosa. E la stessa regola di `catalog_key` sui modelli di
   * documento (ADR-0092).
   */
  catalogKey: string;
};

/**
 * A cosa serve un modulo.
 *
 * Due valori e l'assenza, non tre stati equivalenti: vedi `FormSettings`.
 * `enrollment` copre iscrizione **e** rinnovo, perche sono lo stesso modulo
 * compilato in due momenti — la differenza la porta la compilazione.
 */
export const FORM_PURPOSES = ["", "enrollment", "generic"] as const;
export type FormPurpose = (typeof FORM_PURPOSES)[number];

/**
 * Il contenuto di un modulo: cio che si pubblica e cio di cui si conserva la
 * versione. Titolo e descrizione stanno qui dentro perche cambiano il
 * significato di una compilazione tanto quanto i campi.
 */
export type FormSchema = {
  title: string;
  description: string;
  fields: FormField[];
  settings: FormSettings;
};

/* --------------------------------------------------------- normalizzazione */

const asText = (value: unknown) => String(value ?? "").trim();

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = asText(value);
    if (text) return text;
  }
  return "";
};

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** Un identificativo di campo. Stabile una volta creato: le risposte lo citano. */
export const createFieldId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `f_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  }
  return `f_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
};

export const DEFAULT_FORM_SETTINGS: FormSettings = {
  successMessage: "Modulo inviato correttamente. Grazie!",
  closeAt: "",
  collectRespondentEmail: true,
  notifyOnSubmit: true,
  documentTemplateId: "",
  purpose: "",
  catalogKey: "",
  singleSubmission: false,
};

export const normalizeFormField = (value: unknown): FormField => {
  const record = asRecord(value);
  const rawType = asText(record.type) as FormFieldType;
  const type = FIELD_TYPE_BY_VALUE.has(rawType) ? rawType : "short_text";
  const definition = getFieldTypeDefinition(type);

  /*
    Un binding che non e nel catalogo si scarta invece di conservarlo: e
    l'unico modo per cui una chiave inventata da un client non sopravviva
    fino al momento in cui la si userebbe per scrivere in anagrafica.
  */
  const binding = getDynamicField(record.binding)?.key || "";

  /*
    Stessa politica del binding: una chiave che non e una chiave valida si
    scarta invece di conservarla. Qui in piu si scarta anche quando il tipo di
    campo non e una casella — cambiare il tipo di un campo che dichiarava un
    consenso deve togliere la dichiarazione, non lasciarla appesa a un campo
    di testo dove «spuntato» non vuol dire niente.
  */
  const consentKey =
    type === "checkbox" && isValidConsentKey(record.consentKey)
      ? normalizeConsentKey(record.consentKey)
      : "";

  /*
    La semantica legale vive solo su una casella; un valore fuori dal
    vocabolario si scarta. Un consenso facoltativo **non e mai obbligatorio**
    (EDPB 05/2020: un consenso condizionato non e libero): il modello lo
    rifiuta qui, prima che il builder possa anche solo salvarlo.
  */
  const legalKind: FormLegalKind =
    type === "checkbox" && FORM_LEGAL_KINDS.includes(asText(record.legalKind) as FormLegalKind)
      ? (asText(record.legalKind) as FormLegalKind)
      : "";

  const visibleWhenRecord = asRecord(record.visibleWhen);
  const visibleWhen: FormVisibilityRule | null =
    asText(visibleWhenRecord.fieldId) && asText(visibleWhenRecord.equals) !== undefined && asText(visibleWhenRecord.fieldId) !== firstText(record.id)
      ? { fieldId: asText(visibleWhenRecord.fieldId), equals: asText(visibleWhenRecord.equals) }
      : null;

  const uploadRecord = asRecord(record.upload);
  const upload: FormFieldUpload | null =
    type === "file_upload" || type === "image_upload"
      ? {
          accept:
            type === "image_upload"
              ? "images"
              : FORM_UPLOAD_ACCEPTS.includes(asText(uploadRecord.accept) as FormUploadAccept)
                ? (asText(uploadRecord.accept) as FormUploadAccept)
                : "documents",
          maxBytes: clampUploadBytes(uploadRecord.maxBytes),
        }
      : null;

  const required =
    definition.collectsAnswer && legalKind !== "optional_consent"
      ? Boolean(record.required)
      : legalKind === "required_acceptance"
        ? true
        : false;

  return {
    id: firstText(record.id) || createFieldId(),
    type,
    label:
      firstText(record.label, record.title) ||
      (definition.collectsAnswer ? "Domanda senza titolo" : "Sezione"),
    description: asText(record.description),
    required: legalKind === "required_acceptance" ? true : required,
    placeholder: definition.hasPlaceholder ? asText(record.placeholder) : "",
    options: definition.hasOptions
      ? asArray(record.options).map(asText).filter(Boolean)
      : [],
    binding,
    consentKey,
    legalKind,
    /*
      Il contenuto lo sanifica il server prima di salvarlo (`sanitizeRichHtml`,
      ADR-0190 §3); qui si conserva e si limita, perche questo modulo e puro.
    */
    content: type === "content" ? String(record.content ?? "").slice(0, MAX_CONTENT_HTML_CHARS) : "",
    visibleWhen,
    upload,
  };
};

/** Un blocco di contenuto: 60k caratteri di HTML, cioe molte pagine di testo. */
export const MAX_CONTENT_HTML_CHARS = 60_000;

/** Il tetto di un allegato pubblico, in byte, come lo dichiara la validazione. */
const UPLOAD_MAX_BYTES_CEILING = 8 * 1024 * 1024;

const clampUploadBytes = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return UPLOAD_MAX_BYTES_CEILING;
  return Math.min(Math.max(Math.round(n), 256 * 1024), UPLOAD_MAX_BYTES_CEILING);
};

/**
 * Un campo e visibile con queste risposte? Chi lo nasconde lo rende anche
 * non obbligatorio e non ne accetta la risposta: lo decide il server con la
 * stessa funzione del renderer.
 */
export const isFieldVisible = (
  field: Pick<FormField, "visibleWhen">,
  answers: Record<string, unknown>,
): boolean => {
  if (!field.visibleWhen) return true;
  const raw = answers[field.visibleWhen.fieldId];
  const wanted = field.visibleWhen.equals;
  if (Array.isArray(raw)) return raw.map((v) => String(v)).includes(wanted);
  if (typeof raw === "boolean") return String(raw) === wanted || (raw && wanted === "si");
  return String(raw ?? "").trim() === wanted;
};

/** Le caselle con una semantica legale: quelle di cui la pratica conserva la prova. */
export const getLegalFields = (schema: Pick<FormSchema, "fields">) =>
  schema.fields.filter((field) => field.type === "checkbox" && field.legalKind);

export const normalizeFormSettings = (value: unknown): FormSettings => {
  const record = asRecord(value);

  return {
    successMessage:
      firstText(record.successMessage) || DEFAULT_FORM_SETTINGS.successMessage,
    closeAt: asText(record.closeAt),
    collectRespondentEmail:
      record.collectRespondentEmail === undefined
        ? DEFAULT_FORM_SETTINGS.collectRespondentEmail
        : Boolean(record.collectRespondentEmail),
    notifyOnSubmit:
      record.notifyOnSubmit === undefined
        ? DEFAULT_FORM_SETTINGS.notifyOnSubmit
        : Boolean(record.notifyOnSubmit),
    singleSubmission:
      record.singleSubmission === undefined
        ? DEFAULT_FORM_SETTINGS.singleSubmission
        : Boolean(record.singleSubmission),
    documentTemplateId: asText(record.documentTemplateId).slice(0, 120),
    /*
      Un valore sconosciuto torna a «non dichiarato», non a «altro»: e la
      stessa politica del binding e della chiave di consenso qui sopra — cio
      che non e nel vocabolario si scarta, e la deduzione riprende il suo
      posto invece di lasciare in giro una dichiarazione inventata.
    */
    purpose: FORM_PURPOSES.includes(asText(record.purpose) as FormPurpose)
      ? (asText(record.purpose) as FormPurpose)
      : "",
    catalogKey: asText(record.catalogKey).slice(0, 120),
  };
};

/**
 * Rende utilizzabile qualunque cosa arrivi: una riga del database, il corpo di
 * una richiesta, una bozza salvata da una versione precedente del builder.
 *
 * Gli identificativi duplicati si riscrivono. Due campi con lo stesso `id`
 * significherebbero due domande che condividono la stessa risposta, e il
 * modo in cui ci si arriva — duplicare un campo dimenticando di rigenerare
 * l'id — non e ipotetico.
 */
export const normalizeFormSchema = (value: unknown): FormSchema => {
  const record = asRecord(value);
  const seen = new Set<string>();

  const fields = asArray(record.fields).map((rawField) => {
    const field = normalizeFormField(rawField);
    if (seen.has(field.id)) {
      return { ...field, id: createFieldId() };
    }
    seen.add(field.id);
    return field;
  });

  return {
    title: firstText(record.title) || "Modulo senza titolo",
    description: asText(record.description),
    fields,
    settings: normalizeFormSettings(record.settings),
  };
};

/* --------------------------------------------------------- link pubblico */

export const slugifyFormTitle = (value: string) => {
  const slug = asText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

  return slug || "modulo";
};

/**
 * La parte imprevedibile dello slug pubblico.
 *
 * Il link di un modulo di iscrizione si manda su WhatsApp a duecento
 * famiglie: e per definizione semi-pubblico. Ma «semi-pubblico» non vuol dire
 * indovinabile — `/forms/iscrizione-2026` di un club qualunque si prova a
 * mano. Con 48 bit di suffisso non si prova a mano, e lo slug resta
 * leggibile: `/forms/iscrizione-2026-3f9a1c7d5b2e`.
 *
 * Non e un segreto crittografico e non sostituisce l'autorizzazione: le
 * risposte gia inviate non si leggono da questo URL, si leggono solo dalla
 * segreteria autenticata.
 */
export const PUBLIC_SLUG_SUFFIX_LENGTH = 12;

export const isSecurePublicSlug = (value: string) =>
  new RegExp(`-[0-9a-f]{${PUBLIC_SLUG_SUFFIX_LENGTH}}$`).test(asText(value));

export const buildPublicSlug = (title: string, suffix: string) => {
  const normalized = asText(suffix)
    .toLowerCase()
    .replace(/[^0-9a-f]/g, "")
    .slice(0, PUBLIC_SLUG_SUFFIX_LENGTH)
    .padEnd(PUBLIC_SLUG_SUFFIX_LENGTH, "0");

  return `${slugifyFormTitle(title)}-${normalized}`;
};

export const buildPublicFormPath = (publicSlug: string) =>
  `/forms/${asText(publicSlug)}`;

/* -------------------------------------------------------- forma sul filo */

export type FormSubjectSelection = {
  subject: FormSubjectKey;
  /**
   * L'identificativo del record scelto, quando il soggetto esiste gia.
   * Vuoto per una compilazione pubblica: chi si iscrive non e ancora in
   * anagrafica, ed e la segreteria a decidere se creare o collegare.
   */
  recordId: string;
  /** Come chiamarlo nell'interfaccia: «Mario Rossi». */
  label: string;
};

export type FormTemplateSummary = {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  status: FormStatus;
  publicSlug: string;
  publicPath: string;
  /** I soggetti coinvolti, dedotti dai campi della bozza. */
  subjects: FormSubjectKey[];
  /** La versione pubblicata. Zero se il modulo non e mai stato pubblicato. */
  publishedVersion: number;
  /** Vero se la bozza differisce dall'ultima versione pubblicata. */
  hasUnpublishedChanges: boolean;
  fieldCount: number;
  submissionCount: number;
  pendingCount: number;
  /**
   * Da quale modello consigliato viene, o stringa vuota.
   *
   * Serve alla scheda per dirlo — un modulo nato da un modello era
   * indistinguibile da uno scritto a mano (W6-45) — e all'elenco dei modelli
   * per non riproporre cio che il club ha gia adottato.
   */
  catalogKey: string;
  /** Vero se il modulo serve a iscrivere o rinnovare: vedi `isEnrollmentForm`. */
  isEnrollment: boolean;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
};

export type FormTemplateDetail = FormTemplateSummary & {
  /** Cio che si sta modificando. */
  draft: FormSchema;
  /** Cio che il pubblico vede adesso, se il modulo e pubblicato. */
  published: FormSchema | null;
  /**
   * Sedi e categorie del club, al momento della lettura.
   *
   * Non fanno parte del modulo: servono all'anteprima per mostrare le stesse
   * voci che vedra chi compila. Senza, l'anteprima mostrerebbe una tendina
   * vuota proprio dove il modulo pubblicato ne mostra una piena — cioe
   * mentirebbe sull'unica cosa che l'anteprima esiste per dire.
   */
  optionCatalog?: Record<string, string[]>;
};

export type FormSubmissionFile = {
  fieldId: string;
  fieldLabel: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /**
   * Dove sta il file. Due forme, una sola funzione che le risolve:
   * `attachment:<uuid>` per il servizio allegati (tutto cio che arriva da
   * qui in avanti) e `asset:<uuid>` per i file dei moduli online della
   * prima versione, che restano dove sono invece di essere travasati.
   */
  reference: string;
};

/**
 * L'URL da cui il browser legge un allegato di una compilazione.
 *
 * Esiste per non avere due componenti che indovinano un percorso: chi mostra
 * un file chiede qui, e il giorno in cui i file legacy verranno travasati
 * cambia solo questa funzione. Entrambi gli endpoint sono autenticati e
 * verificano il club: nessuno dei due e raggiungibile dal modulo pubblico.
 */
export const LEGACY_FORM_ASSET_PREFIX = "asset:";

export const resolveSubmissionFileUrl = (reference: string) => {
  const value = asText(reference);

  const attachmentId = parseAttachmentReference(value);
  if (attachmentId) return buildAttachmentUrl(attachmentId);

  if (value.startsWith(LEGACY_FORM_ASSET_PREFIX)) {
    return `/api/forms/assets/${encodeURIComponent(
      value.slice(LEGACY_FORM_ASSET_PREFIX.length),
    )}`;
  }

  return "";
};

export type FormSubmissionRecord = {
  id: string;
  organizationId: string;
  templateId: string;
  templateTitle: string;
  version: number;
  source: FormSubmissionSource;
  status: FormSubmissionStatus;
  subjects: FormSubjectSelection[];
  answers: Record<string, unknown>;
  files: FormSubmissionFile[];
  /**
   * Il modulo com'era al momento dell'invio.
   *
   * Non e una copia dentro la compilazione: e lo schema della **versione**
   * citata da `version`, che e una riga immutabile e non si modifica mai.
   * Chi legge una risposta di marzo la legge con le domande di marzo.
   * Vedi ADR-0040.
   */
  schema: FormSchema;
  respondentName: string;
  respondentEmail: string;
  submittedAt: string;
  reviewedAt: string;
  reviewNote: string;
  /* ADR-0189: la pratica. */
  kind: string;
  revision: number;
  declarations: FormDeclaration[];
  snapshotHash: string;
  changesRequested: FormChangesRequested | null;
  athleteId: string;
  trialAthleteId: string;
  archivedAt: string;
  /** Le copie precedenti, dalla piu recente; vuoto se mai reinviata. */
  revisions: FormSubmissionRevisionSummary[];
};

export type FormSubmissionRevisionSummary = {
  id: string;
  revision: number;
  answers: Record<string, unknown>;
  files: FormSubmissionFile[];
  declarations: FormDeclaration[];
  snapshotHash: string;
  reason: FormChangesRequested | null;
  submittedAt: string;
  supersededAt: string;
};

export const normalizeChangesRequested = (value: unknown): FormChangesRequested | null => {
  const record = asRecord(value);
  const fieldIds = asArray(record.fieldIds).map(asText).filter(Boolean);
  if (!fieldIds.length && !asText(record.note)) return null;
  return {
    fieldIds,
    note: asText(record.note).slice(0, 2000),
    requestedAt: asText(record.requestedAt),
    requestedBy: asText(record.requestedBy) || null,
  };
};

/* ------------------------------------------------------------ derivazioni */

/** I soggetti coinvolti da uno schema. */
export const getSchemaSubjects = (schema: FormSchema): FormSubjectKey[] =>
  collectSubjectsFromBindings(schema.fields.map((field) => field.binding));

/**
 * **Questo modulo serve a iscrivere o a rinnovare un atleta?**
 *
 * E la domanda che il menu del rinnovo della famiglia deve saper fare: fino a
 * ieri non la faceva, e un questionario di gradimento compariva fra i moduli
 * «da rinnovare» (W6-46). La risposta ha due strade, in quest'ordine:
 *
 * 1. **cio che il club ha dichiarato**, se lo ha dichiarato. E configurazione,
 *    non codice: nessun elenco di titoli, nessuna euristica sul nome;
 * 2. **la deduzione**, per i moduli scritti prima che la dichiarazione
 *    esistesse. Un modulo si puo rinnovare solo se raccoglie l'atleta —
 *    altrimenti non c'e niente da precompilare e l'approvazione non ha una
 *    riga di anagrafica da toccare. E la condizione minima, non una
 *    somiglianza.
 *
 * Il verso in cui sbaglia e voluto: la deduzione puo far comparire un modulo
 * di troppo, mai far sparire un rinnovo che oggi funziona. Chi vuole
 * l'esattezza dichiara.
 */
export const isEnrollmentForm = (schema: FormSchema) => {
  if (schema.settings.purpose === "enrollment") return true;
  if (schema.settings.purpose === "generic") return false;
  return getSchemaSubjects(schema).includes("athlete");
};

/** I campi che raccolgono una risposta: le sezioni restano fuori. */
export const getAnswerableFields = (schema: FormSchema) =>
  schema.fields.filter((field) => fieldCollectsAnswer(field.type));

/**
 * Vero se due schemi dicono la stessa cosa.
 *
 * Serve per «ci sono modifiche non pubblicate?». Il confronto e strutturale e
 * non passa da `JSON.stringify` sull'oggetto intero: l'ordine delle chiavi di
 * un oggetto letto dal database non e garantito uguale a quello di un oggetto
 * costruito in memoria, e un falso «hai modifiche da pubblicare» a ogni
 * caricamento sarebbe peggio di nessun indicatore.
 */
export const schemasAreEqual = (left: FormSchema, right: FormSchema) =>
  serializeSchemaForComparison(left) === serializeSchemaForComparison(right);

const serializeSchemaForComparison = (schema: FormSchema) =>
  JSON.stringify([
    schema.title,
    schema.description,
    schema.fields.map((field) => [
      field.id,
      field.type,
      field.label,
      field.description,
      field.required,
      field.placeholder,
      field.options,
      field.binding,
      field.consentKey,
    ]),
    /*
      **Le impostazioni si elencano a mano, e una mancava.**

      `DEFAULT_FORM_SETTINGS` ne dichiara otto; qui ne erano elencate sette, e
      l'ottava — `singleSubmission` — e proprio l'interruttore «si compila una
      volta sola». Il confronto diceva percio che due schemi identici in tutto
      tranne quel campo erano **uguali**: la bozza non veniva salvata, la
      schermata non segnalava modifiche da pubblicare, e `publishFormTemplate`
      non creava nessuna versione.

      Il club spuntava la casella, leggeva che era tutto a posto, e il vincolo
      non arrivava mai in produzione: `assertNonGiaCompilato` legge dalla
      versione **pubblicata**, che quella casella non l'aveva. Un modulo di
      iscrizione si poteva rimandare quante volte si voleva.

      Si costruisce percio dalle **chiavi dei valori predefiniti**, non da un
      elenco scritto a mano: una impostazione nuova entra nel confronto da sola,
      e la nona non ripetera la storia dell'ottava.
    */
    Object.keys(DEFAULT_FORM_SETTINGS).map(
      (chiave) => (schema.settings as Record<string, unknown>)[chiave],
    ),
  ]);

/** Vero se il modulo ha superato la data di chiusura. */
export const isFormClosed = (schema: FormSchema, now = new Date()) => {
  const closeAt = asText(schema.settings.closeAt);
  if (!closeAt) return false;
  const closeDate = new Date(closeAt);
  if (Number.isNaN(closeDate.getTime())) return false;
  return closeDate.getTime() < now.getTime();
};

/** Come si legge una risposta in un riepilogo. */
export const formatAnswer = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(", ") || "—";
  if (typeof value === "boolean") return value ? "Si" : "No";
  const text = asText(value);
  return text || "—";
};

export { asText as formsAsText, firstText as formsFirstText };
