/**
 * Validazione dei moduli: dello schema quando lo si salva, delle risposte
 * quando qualcuno compila.
 *
 * **Perche la validazione delle risposte sta qui e non nel componente.** Il
 * modulo pubblico e raggiungibile con un `curl`. Tutto cio che il browser
 * impedisce — un campo obbligatorio vuoto, un'opzione che non e nell'elenco,
 * un testo da due megabyte — deve essere impedito di nuovo dal server, e
 * dallo **stesso** codice, altrimenti le due regole divergono e la differenza
 * la scopre chi compila.
 *
 * **Perche i limiti sono numeri e non «ragionevolezza».** Un modulo pubblico
 * e una porta aperta: senza un tetto sul numero di campi, sulla lunghezza di
 * una risposta e sul numero di allegati, una singola richiesta puo scrivere
 * quanto si vuole nel database del club. I limiti sono generosi rispetto
 * all'uso reale e stretti rispetto all'abuso.
 */

import {
  fieldCollectsAnswer,
  fieldIsFile,
  getAnswerableFields,
  type FormField,
  type FormSchema,
} from "./model";
import { hasServerOptions } from "./field-options";
import { getDynamicField } from "./dynamic-fields";

/* ------------------------------------------------------------------ limiti */

export const FORM_LIMITS = {
  /** Campi in un modulo. Oltre, non e un modulo: e un questionario. */
  maxFields: 120,
  maxTitleLength: 160,
  maxDescriptionLength: 2000,
  maxFieldLabelLength: 300,
  maxFieldDescriptionLength: 1000,
  maxOptions: 60,
  maxOptionLength: 200,
  /** Una risposta di testo lungo. Circa quattro cartelle. */
  maxAnswerLength: 8000,
  /** Voci selezionate in una scelta multipla. */
  maxSelectedOptions: 60,
  /** Allegati in una singola compilazione. */
  maxFilesPerSubmission: 10,
  /** Byte del corpo JSON di un invio pubblico, allegati esclusi. */
  maxSubmissionBodyBytes: 256 * 1024,
} as const;

/**
 * I tipi di file che un modulo **pubblico** accetta.
 *
 * E un sottoinsieme di quelli che il servizio allegati permette: da un
 * mittente autenticato si accetta anche un foglio di calcolo, da chiunque
 * abbia il link si accettano documenti e fotografie e basta.
 */
export const PUBLIC_FORM_UPLOAD_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

const PUBLIC_UPLOAD_MIME_SET = new Set<string>(PUBLIC_FORM_UPLOAD_MIME_TYPES);

export const isPublicFormUploadMimeType = (value?: string | null) =>
  PUBLIC_UPLOAD_MIME_SET.has(String(value || "").trim().toLowerCase());

/** Dimensione massima di un allegato caricato da un modulo pubblico: 8 MB. */
export const MAX_PUBLIC_FORM_UPLOAD_BYTES = 8 * 1024 * 1024;

/* ------------------------------------------------------------------ schema */

export type SchemaValidationResult = {
  valid: boolean;
  /** Messaggi in italiano, gia mostrabili. */
  errors: string[];
};

const asText = (value: unknown) => String(value ?? "").trim();

/**
 * Verifica che uno schema sia salvabile.
 *
 * Non e la stessa cosa di «pubblicabile»: una bozza puo avere un campo scelta
 * senza opzioni, perche la si sta scrivendo. Quello lo controlla
 * `validateSchemaForPublish`.
 */
export const validateSchema = (schema: FormSchema): SchemaValidationResult => {
  const errors: string[] = [];

  if (!asText(schema.title)) {
    errors.push("Il modulo deve avere un titolo.");
  }
  if (asText(schema.title).length > FORM_LIMITS.maxTitleLength) {
    errors.push(`Il titolo supera ${FORM_LIMITS.maxTitleLength} caratteri.`);
  }
  if (asText(schema.description).length > FORM_LIMITS.maxDescriptionLength) {
    errors.push(
      `La descrizione supera ${FORM_LIMITS.maxDescriptionLength} caratteri.`,
    );
  }
  if (schema.fields.length > FORM_LIMITS.maxFields) {
    errors.push(
      `Un modulo puo avere al massimo ${FORM_LIMITS.maxFields} campi.`,
    );
  }

  const seenIds = new Set<string>();

  for (const field of schema.fields) {
    if (seenIds.has(field.id)) {
      errors.push(`Due campi hanno lo stesso identificativo: ${field.label}.`);
    }
    seenIds.add(field.id);

    if (!asText(field.label)) {
      errors.push("Ogni campo deve avere un'etichetta.");
    }
    if (asText(field.label).length > FORM_LIMITS.maxFieldLabelLength) {
      errors.push(`L'etichetta di «${field.label.slice(0, 40)}» e troppo lunga.`);
    }
    if (
      asText(field.description).length > FORM_LIMITS.maxFieldDescriptionLength
    ) {
      errors.push(`La descrizione di «${field.label}» e troppo lunga.`);
    }
    if (field.options.length > FORM_LIMITS.maxOptions) {
      errors.push(
        `«${field.label}» ha piu di ${FORM_LIMITS.maxOptions} opzioni.`,
      );
    }
    if (field.options.some((option) => option.length > FORM_LIMITS.maxOptionLength)) {
      errors.push(`Un'opzione di «${field.label}» e troppo lunga.`);
    }

    /*
      Il binding e gia stato ripulito da `normalizeFormField`: se qui c'e un
      valore che il catalogo non conosce, qualcuno ha costruito lo schema
      senza passare dalla normalizzazione. Vale la pena accorgersene.
    */
    if (field.binding && !getDynamicField(field.binding)) {
      errors.push(`«${field.label}» e collegato a un dato che non esiste.`);
    }
  }

  return { valid: errors.length === 0, errors };
};

/** Verifica che uno schema sia pubblicabile: sara compilato da qualcuno. */
export const validateSchemaForPublish = (
  schema: FormSchema,
): SchemaValidationResult => {
  const base = validateSchema(schema);
  const errors = [...base.errors];

  if (getAnswerableFields(schema).length === 0) {
    errors.push("Un modulo senza campi da compilare non si pubblica.");
  }

  for (const field of schema.fields) {
    /*
      Un campo le cui opzioni le mette il server — sede, categoria — non le
      ha nello schema **per costruzione**: pretenderle qui impedirebbe di
      pubblicare proprio il modulo di iscrizione, che e il caso per cui quei
      campi esistono.
    */
    if (hasServerOptions(field)) continue;

    if (fieldCollectsAnswer(field.type) && field.options.length === 0) {
      if (
        field.type === "single_choice" ||
        field.type === "multiple_choice" ||
        field.type === "dropdown"
      ) {
        errors.push(`«${field.label}» non ha opzioni fra cui scegliere.`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
};

/* ---------------------------------------------------------------- risposte */

export type AnswerValidationResult = {
  valid: boolean;
  /** Errori per identificativo di campo: la UI li mostra sotto la domanda. */
  errors: Record<string, string>;
  /**
   * Le risposte ripulite: solo campi esistenti, valori del tipo giusto, testi
   * tagliati al limite. E **questo** che si salva, non cio che e arrivato.
   */
  answers: Record<string, unknown>;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/* Numeri italiani e internazionali: cifre, spazi, punti, trattini, un +. */
const PHONE_PATTERN = /^\+?[0-9][0-9\s.\-/()]{4,24}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isEmpty = (value: unknown) => {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "boolean") return value === false;
  return asText(value).length === 0;
};

const sanitizeSingleValue = (field: FormField, value: unknown) => {
  const text = asText(value).slice(0, FORM_LIMITS.maxAnswerLength);
  return { text };
};

/**
 * Valida e ripulisce le risposte a uno schema.
 *
 * `filledFieldIds` sono i campi per cui e stato caricato un file: la
 * validazione degli allegati avviene prima, perche i byte non passano da qui.
 */
export const validateAnswers = (
  schema: FormSchema,
  rawAnswers: Record<string, unknown>,
  filledFileFieldIds: string[] = [],
): AnswerValidationResult => {
  const errors: Record<string, string> = {};
  const answers: Record<string, unknown> = {};
  const withFile = new Set(filledFileFieldIds);

  for (const field of schema.fields) {
    if (!fieldCollectsAnswer(field.type)) continue;

    const raw = rawAnswers[field.id];

    if (fieldIsFile(field.type)) {
      /*
        Un allegato non ha una «risposta»: o il file c'e o non c'e. Il valore
        che arrivasse in `answers` per un campo file si scarta, cosi nessuno
        puo scrivere un URL arbitrario al posto di un caricamento.
      */
      if (field.required && !withFile.has(field.id)) {
        errors[field.id] = "Allega il file richiesto.";
      }
      continue;
    }

    if (isEmpty(raw)) {
      if (field.required) {
        errors[field.id] =
          field.type === "checkbox"
            ? "Devi spuntare questa casella."
            : "Campo obbligatorio.";
      }
      continue;
    }

    switch (field.type) {
      case "checkbox": {
        answers[field.id] = Boolean(raw);
        break;
      }

      case "number": {
        const { text } = sanitizeSingleValue(field, raw);
        if (!/^-?\d+([.,]\d+)?$/.test(text)) {
          errors[field.id] = "Inserisci un numero.";
          break;
        }
        answers[field.id] = text.replace(",", ".");
        break;
      }

      case "email": {
        const { text } = sanitizeSingleValue(field, raw);
        if (!EMAIL_PATTERN.test(text)) {
          errors[field.id] = "Indirizzo email non valido.";
          break;
        }
        answers[field.id] = text.toLowerCase();
        break;
      }

      case "phone": {
        const { text } = sanitizeSingleValue(field, raw);
        if (!PHONE_PATTERN.test(text)) {
          errors[field.id] = "Numero di telefono non valido.";
          break;
        }
        answers[field.id] = text;
        break;
      }

      case "date": {
        const { text } = sanitizeSingleValue(field, raw);
        const iso = text.length > 10 ? text.slice(0, 10) : text;
        if (!DATE_PATTERN.test(iso) || Number.isNaN(new Date(iso).getTime())) {
          errors[field.id] = "Data non valida.";
          break;
        }
        answers[field.id] = iso;
        break;
      }

      case "single_choice":
      case "dropdown": {
        const { text } = sanitizeSingleValue(field, raw);
        if (!field.options.includes(text)) {
          errors[field.id] = "Scegli una delle opzioni proposte.";
          break;
        }
        answers[field.id] = text;
        break;
      }

      case "multiple_choice": {
        const selected = (Array.isArray(raw) ? raw : [raw])
          .map((entry) => asText(entry))
          .filter(Boolean);

        if (selected.length > FORM_LIMITS.maxSelectedOptions) {
          errors[field.id] = "Troppe opzioni selezionate.";
          break;
        }
        const unknown = selected.filter(
          (entry) => !field.options.includes(entry),
        );
        if (unknown.length) {
          errors[field.id] = "Scegli fra le opzioni proposte.";
          break;
        }
        answers[field.id] = selected;
        break;
      }

      default: {
        const { text } = sanitizeSingleValue(field, raw);
        answers[field.id] = text;
        break;
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors, answers };
};
