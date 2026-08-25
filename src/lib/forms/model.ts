/**
 * Il modello dei moduli — Modulistica V2.
 *
 * **Cosa e cambiato rispetto alla prima versione.** I moduli vivevano dentro
 * `clubs.document_templates`, lo stesso campo JSON dei modelli di stampa:
 * salvare una risposta riscriveva l'intero array del club, e trovare un
 * modulo pubblico voleva dire un `@>` su tutta la tabella `clubs`. Un modulo
 * ora e una riga, una versione pubblicata e una riga, una compilazione e una
 * riga. Vedi ADR-0035.
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

export type FormSubmissionStatus = "pending" | "approved" | "rejected";

export const FORM_SUBMISSION_STATUS_LABELS: Record<
  FormSubmissionStatus,
  string
> = {
  pending: "Da esaminare",
  approved: "Approvata",
  rejected: "Rifiutata",
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
  | "signature"
  | "section";

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
  { value: "file_upload", label: "Allegato", hint: "Documento o foto da caricare", hasOptions: false, hasPlaceholder: false, collectsAnswer: true },
  { value: "signature", label: "Firma", hint: "Firma tracciata con dito o mouse", hasOptions: false, hasPlaceholder: false, collectsAnswer: true },
  { value: "section", label: "Sezione", hint: "Un titolo che separa: non si compila", hasOptions: false, hasPlaceholder: false, collectsAnswer: false },
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
  type === "file_upload" || type === "signature";

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
};

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

  return {
    id: firstText(record.id) || createFieldId(),
    type,
    label:
      firstText(record.label, record.title) ||
      (definition.collectsAnswer ? "Domanda senza titolo" : "Sezione"),
    description: asText(record.description),
    required: definition.collectsAnswer ? Boolean(record.required) : false,
    placeholder: definition.hasPlaceholder ? asText(record.placeholder) : "",
    options: definition.hasOptions
      ? asArray(record.options).map(asText).filter(Boolean)
      : [],
    binding,
  };
};

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
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
};

export type FormTemplateDetail = FormTemplateSummary & {
  /** Cio che si sta modificando. */
  draft: FormSchema;
  /** Cio che il pubblico vede adesso, se il modulo e pubblicato. */
  published: FormSchema | null;
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
export const resolveSubmissionFileUrl = (reference: string) => {
  const value = asText(reference);

  if (value.startsWith("attachment:")) {
    return `/api/v1/attachments/${encodeURIComponent(value.slice("attachment:".length))}`;
  }
  if (value.startsWith("asset:")) {
    return `/api/forms/assets/${encodeURIComponent(value.slice("asset:".length))}`;
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
   * Vedi ADR-0036.
   */
  schema: FormSchema;
  respondentName: string;
  respondentEmail: string;
  submittedAt: string;
  reviewedAt: string;
  reviewNote: string;
};

/* ------------------------------------------------------------ derivazioni */

/** I soggetti coinvolti da uno schema. */
export const getSchemaSubjects = (schema: FormSchema): FormSubjectKey[] =>
  collectSubjectsFromBindings(schema.fields.map((field) => field.binding));

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
    ]),
    [
      schema.settings.successMessage,
      schema.settings.closeAt,
      schema.settings.collectRespondentEmail,
      schema.settings.notifyOnSubmit,
    ],
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
