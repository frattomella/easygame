/**
 * **Come si presenta un allenamento, in un posto solo** (ADR-0198 §3).
 *
 * L'identita visiva e il **tipo** — «Allenamento» — con la categoria in un
 * badge separato; la data e l'ora sono campi propri, mostrati accanto. Prima
 * il titolo lo faceva la data: il generatore scriveva «Giovedì 17 Settembre»
 * e quattro schermate (Allenamenti, Dashboard, Calendario, scheda atleta)
 * inventavano quattro titoli. La data **resta nel dominio** (`date`,
 * `starts_at`, `ends_at`): serve al calendario, allo storico, alla ricerca,
 * alle presenze, agli export. Cambia il titolo a schermo, non il dato.
 *
 * Un titolo scritto a mano che **non** e una data — «Tecnica portieri» —
 * non si butta: e la nota dell'allenamento (`trainingDisplayNote`), sotto
 * il titolo. Un titolo che e una data, o il generico di prima, non dice
 * niente che il campo data non dica gia.
 *
 * Modulo puro: nessun React, nessuna rete.
 */

export const TRAINING_TYPE_LABEL = "Allenamento";

const text = (value: unknown) => String(value ?? "").trim();

const GIORNI = "(lunedi|lunedì|martedi|martedì|mercoledi|mercoledì|giovedi|giovedì|venerdi|venerdì|sabato|domenica)";
const MESI =
  "(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)";

/**
 * Le **sole** forme che una data faceva da titolo — quella del vecchio
 * generatore («Giovedì 17 Settembre», con o senza anno), una data secca
 * («17/09/2026», «17-09», «2026-09-17») e «Allenamento» seguito da una data.
 * Il titolo **intero** deve essere una data: «Under 14/15 insieme», «Recupero
 * del 3/9» o «Sabato mattina» sono note di chi le ha scritte e restano
 * (revisione D1). Flag \`u\`: le lettere accentate non spezzano la parola.
 */
const SEP = "[\\s,.]+";
const DATE_LIKE = [
  new RegExp(`^${GIORNI}${SEP}\\d{1,2}${SEP}${MESI}(${SEP}\\d{4})?$`, "iu"),
  new RegExp(`^(allenamento${SEP})?\\d{1,2}[/-]\\d{1,2}([/-]\\d{2,4})?$`, "iu"),
  new RegExp(`^(allenamento${SEP})?\\d{4}-\\d{2}-\\d{2}$`, "iu"),
  new RegExp(`^(allenamento${SEP})?\\d{1,2}${SEP}${MESI}(${SEP}\\d{4})?$`, "iu"),
];

/** Vero se il titolo e ricavato dalla data: non dice niente che il campo data non dica. */
export const isDateDerivedTitle = (title: unknown) => {
  const value = text(title);
  if (!value) return false;
  return DATE_LIKE.some((pattern) => pattern.test(value));
};

/** Vero se il titolo e il generico di prima («Allenamento», «Training», vuoto). */
export const isGenericTrainingTitle = (title: unknown) => {
  const value = text(title).toLowerCase();
  return !value || value === TRAINING_TYPE_LABEL.toLowerCase() || value === "training" || value === "allenamenti";
};

const readStoredTitle = (training: unknown) => {
  if (!training || typeof training !== "object") return "";
  const record = training as Record<string, any>;
  const source = record.data && typeof record.data === "object" ? record.data : {};
  return text(record.title) || text(source.title);
};

/** Il titolo a schermo di un allenamento: sempre il tipo. */
export const trainingDisplayTitle = (_training: unknown) => TRAINING_TYPE_LABEL;

/** La nota: un titolo scritto a mano che non e una data e non e il generico; altrimenti `null`. */
export const trainingDisplayNote = (training: unknown): string | null => {
  const stored = readStoredTitle(training);
  if (isGenericTrainingTitle(stored) || isDateDerivedTitle(stored)) return null;
  return stored;
};

/** Il titolo con cui un allenamento **si scrive** quando nessuno ne ha scelto uno. */
export const defaultTrainingTitle = () => TRAINING_TYPE_LABEL;
