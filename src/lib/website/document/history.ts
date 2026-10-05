/**
 * **Una pila di annullamento per tutto cio che l'editor cambia** (ADR-0200 §11).
 *
 * Portata dal Website Builder GPW (`editor-history.ts` in Cedi Platform) e
 * riscritta per i tipi di EasyGame. Le tre idee restano quelle:
 *
 * 1. **una voce e lo stato *prima* di un'operazione**, e annullare e una
 *    scrittura in avanti di quello stato con la versione attuale — mai un
 *    ritorno a una versione del database. Per questo la voce porta valori e
 *    non versioni;
 * 2. **digitare e un'operazione sola**: modifiche successive allo stesso
 *    bersaglio entro `COALESCE_MS` si fondono nella prima voce, cosi
 *    venticinque passi sono venticinque cose fatte e non le ultime lettere di
 *    un titolo;
 * 3. **una modifica nuova dopo un annullamento apre un ramo**: la pila del
 *    ripristino si svuota.
 *
 * Le voci sono generiche (`T`): l'editor ci mette la pagina, il tema, la
 * navigazione — una sequenza sola, come l'operatore l'ha vissuta.
 *
 * Modulo puro.
 */

export const HISTORY_LIMIT = 40;
export const COALESCE_MS = 1200;

export type EditorHistory<T> = Readonly<{
  past: ReadonlyArray<T>;
  future: ReadonlyArray<T>;
  last: Readonly<{ key: string; at: number }> | null;
}>;

export const emptyHistory = <T>(): EditorHistory<T> => ({ past: [], future: [], last: null });

/**
 * Registra che un'operazione sta per sostituire `before`.
 *
 * @param key cio che l'operazione tocca (`block:<id>:<prop>` per la
 *   digitazione, un valore nuovo per le operazioni strutturali).
 */
export const recordHistory = <T>(
  history: EditorHistory<T>,
  before: T,
  key: string,
  now: number,
): EditorHistory<T> => {
  const coalesce =
    history.last !== null &&
    history.last.key === key &&
    now - history.last.at < COALESCE_MS &&
    history.past.length > 0;
  if (coalesce) return { ...history, future: [], last: { key, at: now } };
  return {
    past: [...history.past, before].slice(-HISTORY_LIMIT),
    future: [],
    last: { key, at: now },
  };
};

/**
 * Un passo indietro o avanti.
 *
 * @param current lo stato vivo che il passo sostituisce: va sulla pila
 *   opposta, cosi il passo si puo a sua volta annullare. `null` = la voce non
 *   e piu applicabile (per esempio la pagina e stata cancellata) e il passo
 *   non avviene.
 */
export const stepHistory = <T>(
  history: EditorHistory<T>,
  direction: "undo" | "redo",
  current: (entry: T) => T | null,
): { history: EditorHistory<T>; restore: T } | null => {
  const from = direction === "undo" ? history.past : history.future;
  const restore = from[from.length - 1];
  if (restore === undefined) return null;
  const live = current(restore);
  if (live === null) return null;
  const remaining = from.slice(0, -1);
  const opposite = [...(direction === "undo" ? history.future : history.past), live].slice(-HISTORY_LIMIT);
  return {
    history:
      direction === "undo"
        ? { past: remaining, future: opposite, last: null }
        : { past: opposite, future: remaining, last: null },
    restore,
  };
};

export const canUndo = <T>(history: EditorHistory<T>) => history.past.length > 0;
export const canRedo = <T>(history: EditorHistory<T>) => history.future.length > 0;
