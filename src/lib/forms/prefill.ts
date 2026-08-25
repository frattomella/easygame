/**
 * Precompilazione: cosa EasyGame sa gia e non deve richiedere.
 *
 * Quando la segreteria apre un modulo dalla scheda di un atleta, l'atleta e
 * gia scelto e il suo nome e gia in archivio. Richiederlo non e neutro: e il
 * punto in cui si introducono le differenze fra la scheda e il documento
 * stampato, perche chi compila digita «Rossi Mario» dove la scheda dice
 * «Mario Rossi».
 *
 * Puro: riceve i record gia caricati, non conosce Prisma.
 */

import {
  getDynamicField,
  readDynamicFieldValue,
  type FormSubjectKey,
} from "./dynamic-fields";
import {
  fieldCollectsAnswer,
  fieldIsFile,
  type FormSchema,
} from "./model";

export type SubjectRecords = Partial<
  Record<FormSubjectKey, Record<string, any> | null>
>;

/**
 * Le risposte iniziali per uno schema.
 *
 * Solo i campi collegati a un dato noto vengono riempiti: una domanda libera
 * resta vuota, e un allegato non si precompila mai — il file va caricato.
 * I campi a scelta si riempiono soltanto se il valore noto e fra le opzioni,
 * altrimenti la tendina mostrerebbe un valore che non puo selezionare.
 */
export const buildPrefilledAnswers = (
  schema: FormSchema,
  records: SubjectRecords,
): Record<string, unknown> => {
  const answers: Record<string, unknown> = {};

  for (const field of schema.fields) {
    if (!fieldCollectsAnswer(field.type) || fieldIsFile(field.type)) continue;

    const definition = getDynamicField(field.binding);
    if (!definition) continue;

    const record = records[definition.subject];
    if (!record) continue;

    const value = readDynamicFieldValue(definition.key, record);
    if (!value) continue;

    if (field.type === "multiple_choice") {
      const selected = field.options.filter((option) => option === value);
      if (selected.length) answers[field.id] = selected;
      continue;
    }

    if (
      (field.type === "single_choice" || field.type === "dropdown") &&
      !field.options.includes(value)
    ) {
      continue;
    }

    if (field.type === "checkbox") {
      answers[field.id] = Boolean(value);
      continue;
    }

    answers[field.id] = value;
  }

  return answers;
};

/**
 * Gli identificativi dei campi precompilati.
 *
 * La UI li segnala con una nota — «dato gia in archivio» — invece di
 * lasciarli indistinguibili da cio che l'utente ha scritto: chi compila deve
 * poter capire cosa sta confermando e cosa sta dichiarando.
 */
export const getPrefilledFieldIds = (
  schema: FormSchema,
  answers: Record<string, unknown>,
  records: SubjectRecords,
): string[] => {
  const prefilled = buildPrefilledAnswers(schema, records);

  return Object.keys(prefilled).filter(
    (fieldId) =>
      JSON.stringify(prefilled[fieldId]) === JSON.stringify(answers[fieldId]),
  );
};
