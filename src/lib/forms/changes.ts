/**
 * Da una compilazione a una modifica dell'anagrafica.
 *
 * **Perche una compilazione non scrive mai da sola.** Un modulo pubblico e
 * compilato da un genitore, di sera, dal telefono, e contiene errori di
 * battitura, doppi invii e omonimie. Se quelle risposte finissero direttamente
 * nella scheda dell'atleta, l'anagrafica del club diventerebbe la somma di
 * quello che hanno scritto duecento persone. Quindi: una compilazione e una
 * **proposta**. La segreteria vede cosa cambierebbe, e approva.
 *
 * Questo file calcola la proposta. E puro: riceve le risposte e i record gia
 * caricati, restituisce l'elenco delle differenze. Chi scrive davvero e
 * `src/lib/server/form-submissions.ts`, e scrive solo cio che si legge qui.
 */

import {
  getDynamicField,
  readDynamicFieldValue,
  FORM_SUBJECTS,
  type FormSubjectKey,
} from "./dynamic-fields";
import {
  fieldCollectsAnswer,
  fieldIsFile,
  formatAnswer,
  type FormSchema,
  type FormSubjectSelection,
} from "./model";

export type FormFieldChangeKind =
  /** Il dato non c'era: si aggiunge. */
  | "add"
  /** Il dato c'era ed era diverso: si sostituisce. */
  | "replace"
  /** Il dato c'era ed e identico: non si tocca. */
  | "unchanged"
  /** La risposta e vuota: non si cancella nulla. */
  | "empty";

export type FormFieldChange = {
  fieldId: string;
  binding: string;
  /** «Telefono del genitore»: l'unica forma che si mostra. */
  label: string;
  currentValue: string;
  proposedValue: string;
  kind: FormFieldChangeKind;
};

export type FormSubjectChange = {
  subject: FormSubjectKey;
  subjectLabel: string;
  /** `create` quando il soggetto non esiste ancora in anagrafica. */
  mode: "create" | "update";
  recordId: string;
  /** Come si chiama il soggetto: «Mario Rossi», oppure «Nuovo atleta». */
  recordLabel: string;
  changes: FormFieldChange[];
};

export type FormChangeSet = {
  subjects: FormSubjectChange[];
  /** Le risposte che non sono collegate a nessun dato: restano nel modulo. */
  unmappedAnswers: Array<{ fieldId: string; label: string; value: string }>;
};

const asText = (value: unknown) => String(value ?? "").trim();

/**
 * Calcola cosa cambierebbe approvando questa compilazione.
 *
 * `records` contiene, per ogni soggetto, il record attuale — oppure `null` se
 * il soggetto va creato. Nel secondo caso ogni risposta non vuota e un `add`:
 * non c'e nulla da sovrascrivere.
 */
export const buildChangeSet = ({
  schema,
  answers,
  selections,
  records,
}: {
  schema: FormSchema;
  answers: Record<string, unknown>;
  selections: FormSubjectSelection[];
  records: Partial<Record<FormSubjectKey, Record<string, any> | null>>;
}): FormChangeSet => {
  const bySubject = new Map<FormSubjectKey, FormFieldChange[]>();
  const unmappedAnswers: FormChangeSet["unmappedAnswers"] = [];

  for (const field of schema.fields) {
    if (!fieldCollectsAnswer(field.type)) continue;

    const definition = getDynamicField(field.binding);

    if (!definition || !definition.writable) {
      /*
        I campi senza collegamento e quelli di sola lettura (i dati della
        societa) restano dove sono: nella compilazione. Mostrarli comunque
        serve a chi approva — «cosa ha risposto» e una domanda legittima
        anche per una domanda libera.
      */
      if (!fieldIsFile(field.type)) {
        const value = formatAnswer(answers[field.id]);
        if (value !== "—") {
          unmappedAnswers.push({
            fieldId: field.id,
            label: field.label,
            value,
          });
        }
      }
      continue;
    }

    const subject = definition.subject;
    if (!FORM_SUBJECTS[subject].writable) continue;

    const proposedValue = asText(
      Array.isArray(answers[field.id])
        ? (answers[field.id] as unknown[]).join(", ")
        : answers[field.id],
    );
    const record = records[subject] || null;
    const currentValue = readDynamicFieldValue(definition.key, record);

    const kind: FormFieldChangeKind = !proposedValue
      ? "empty"
      : !currentValue
        ? "add"
        : currentValue === proposedValue
          ? "unchanged"
          : "replace";

    const list = bySubject.get(subject) || [];
    list.push({
      fieldId: field.id,
      binding: definition.key,
      label: definition.label,
      currentValue,
      proposedValue,
      kind,
    });
    bySubject.set(subject, list);
  }

  const selectionOf = (subject: FormSubjectKey) =>
    selections.find((selection) => selection.subject === subject) || null;

  const subjects: FormSubjectChange[] = [];

  for (const [subject, changes] of bySubject) {
    const selection = selectionOf(subject);
    const record = records[subject] || null;
    const definition = FORM_SUBJECTS[subject];

    subjects.push({
      subject,
      subjectLabel: definition.label,
      mode: record ? "update" : "create",
      recordId: record ? asText(selection?.recordId) : "",
      recordLabel:
        asText(selection?.label) ||
        describeSubjectFromChanges(subject, changes) ||
        `Nuovo ${definition.label.toLowerCase()}`,
      changes,
    });
  }

  return { subjects, unmappedAnswers };
};

/**
 * Un nome leggibile ricavato dalle risposte, per un soggetto che non esiste
 * ancora. Senza, la segreteria leggerebbe «Nuovo atleta» dieci volte di
 * seguito e non saprebbe quale iscrizione sta approvando.
 */
const describeSubjectFromChanges = (
  subject: FormSubjectKey,
  changes: FormFieldChange[],
) => {
  const valueOf = (suffix: string) =>
    asText(
      changes.find((change) => change.binding.endsWith(`.${suffix}`))
        ?.proposedValue,
    );

  const first = valueOf("firstName") || valueOf("name");
  const last = valueOf("lastName") || valueOf("surname");
  const full = [first, last].filter(Boolean).join(" ");

  return full || valueOf("email") || "";
};

/** Vero se la proposta cambierebbe davvero qualcosa. */
export const changeSetHasWrites = (changeSet: FormChangeSet) =>
  changeSet.subjects.some((subject) =>
    subject.changes.some(
      (change) => change.kind === "add" || change.kind === "replace",
    ),
  );

/* -------------------------------------------------------- duplicati */

export type DuplicateProbe = {
  subject: FormSubjectKey;
  fiscalCode: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  email: string;
  phone: string;
};

/**
 * Gli elementi con cui si cerca un duplicato, estratti dalle risposte.
 *
 * **Perche il codice fiscale non basta.** Un genitore che iscrive il figlio
 * spesso non lo ha sottomano e lascia il campo vuoto; e chi lo scrive lo
 * sbaglia. Quindi si cerca su tre livelli — codice fiscale, nome piu data di
 * nascita, email — e si mostra alla segreteria *perche* due schede si
 * somigliano, invece di decidere al posto suo.
 */
export const buildDuplicateProbes = (
  changeSet: FormChangeSet,
): DuplicateProbe[] =>
  changeSet.subjects
    .filter((subject) => subject.subject === "athlete" || subject.mode === "create")
    .map((subject) => {
      const valueOf = (suffix: string) =>
        asText(
          subject.changes.find((change) =>
            change.binding.endsWith(`.${suffix}`),
          )?.proposedValue,
        );

      return {
        subject: subject.subject,
        fiscalCode: valueOf("fiscalCode").toUpperCase(),
        firstName: valueOf("firstName") || valueOf("name"),
        lastName: valueOf("lastName") || valueOf("surname"),
        birthDate: valueOf("birthDate"),
        email: valueOf("email").toLowerCase(),
        phone: valueOf("phone"),
      };
    })
    .filter(
      (probe) =>
        probe.fiscalCode ||
        (probe.firstName && probe.lastName) ||
        probe.email,
    );

export type DuplicateMatchReason =
  | "fiscal_code"
  | "name_and_birth_date"
  | "email";

export const DUPLICATE_MATCH_LABELS: Record<DuplicateMatchReason, string> = {
  fiscal_code: "Stesso codice fiscale",
  name_and_birth_date: "Stesso nome, cognome e data di nascita",
  email: "Stessa email",
};

export type DuplicateCandidate = {
  subject: FormSubjectKey;
  recordId: string;
  label: string;
  reasons: DuplicateMatchReason[];
};

/**
 * Confronta la proposta con i record gia in archivio.
 *
 * Riceve i candidati gia caricati dal server — non fa query — cosi la regola
 * di somiglianza si puo provare senza database.
 */
export const matchDuplicates = (
  probe: DuplicateProbe,
  candidates: Array<{
    id: string;
    label: string;
    fiscalCode?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    birthDate?: string | null;
    email?: string | null;
  }>,
): DuplicateCandidate[] => {
  const normalized = (value?: string | null) => asText(value).toLowerCase();

  return candidates
    .map((candidate) => {
      const reasons: DuplicateMatchReason[] = [];

      if (
        probe.fiscalCode &&
        normalized(candidate.fiscalCode) === probe.fiscalCode.toLowerCase()
      ) {
        reasons.push("fiscal_code");
      }

      if (
        probe.firstName &&
        probe.lastName &&
        normalized(candidate.firstName) === probe.firstName.toLowerCase() &&
        normalized(candidate.lastName) === probe.lastName.toLowerCase() &&
        (!probe.birthDate ||
          asText(candidate.birthDate).slice(0, 10) === probe.birthDate)
      ) {
        reasons.push("name_and_birth_date");
      }

      if (probe.email && normalized(candidate.email) === probe.email) {
        reasons.push("email");
      }

      return {
        subject: probe.subject,
        recordId: candidate.id,
        label: candidate.label,
        reasons,
      };
    })
    .filter((candidate) => candidate.reasons.length > 0);
};
