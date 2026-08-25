/**
 * Ordinamento nominale centralizzato della Web App.
 *
 * Prima di questo modulo ogni pagina si scriveva il proprio `localeCompare`,
 * con locale, opzioni e gestione dei valori vuoti diverse: due elenchi degli
 * stessi atleti potevano risultare ordinati in modo diverso. Qui c'e un solo
 * collator per tutta l'applicazione.
 *
 * Caratteristiche del confronto:
 *
 * - **locale italiano**, cosi gli accenti si collocano dove se li aspetta un
 *   utente italiano;
 * - **case-insensitive** (`sensitivity: "base"`): «rossi» e «Rossi» sono lo
 *   stesso punto di ordinamento;
 * - **numerico**: «Under 9» precede «Under 10» invece di seguirlo;
 * - **valori vuoti in fondo**: una riga senza nome non si piazza davanti a
 *   tutte le altre;
 * - **stabile**: due nomi che il collator considera uguali (differiscono solo
 *   per maiuscole o accenti) restano nell'ordine di partenza. Per questo il
 *   confronto **non** ricade su un ordinamento binario: separare «Rossi» da
 *   «rossi» renderebbe l'esito imprevedibile per chi legge, e impedirebbe alle
 *   chiavi successive (il nome dopo il cognome) di entrare in gioco.
 *
 * **Dove NON usarlo.** Negli elenchi in cui l'ordine ha un significato
 * funzionale — date, rate, scadenze, cronologia, priorita, classifiche,
 * sequenze configurate a mano — l'ordinamento alfabetico e una regressione,
 * non un miglioramento. Vedi `docs/knowledge-base/10-ui-ux-conventions.md`.
 */

const NAME_SORT_LOCALE = "it";

const collator = new Intl.Collator(NAME_SORT_LOCALE, {
  sensitivity: "base",
  numeric: true,
});

const toComparableText = (value: unknown) => String(value ?? "").trim();

/**
 * Confronto alfabetico fra due valori nominali.
 *
 * Restituisce un numero negativo, zero o positivo come qualunque comparatore
 * passato a `Array.prototype.sort`.
 */
export const compareNameValues = (left: unknown, right: unknown) => {
  const leftText = toComparableText(left);
  const rightText = toComparableText(right);

  if (!leftText && !rightText) return 0;
  if (!leftText) return 1;
  if (!rightText) return -1;

  return collator.compare(leftText, rightText);
};

/**
 * Confronto su piu chiavi nominali: la seconda decide solo quando la prima
 * pareggia. Usato per «Cognome poi Nome».
 */
export const compareNameValueLists = (
  left: readonly unknown[],
  right: readonly unknown[],
) => {
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const result = compareNameValues(left[index], right[index]);
    if (result !== 0) {
      return result;
    }
  }

  return 0;
};

/**
 * Ordina una collezione per nome senza mutare l'originale.
 *
 * La stabilita e garantita esplicitamente con l'indice di partenza: non si
 * dipende dalla stabilita di `Array.prototype.sort` del motore.
 */
export const sortByName = <T>(
  items: readonly T[] | null | undefined,
  getName: (item: T) => unknown,
): T[] => {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (left, right) =>
        compareNameValues(getName(left.item), getName(right.item)) ||
        left.index - right.index,
    )
    .map((entry) => entry.item);
};

/**
 * Come `sortByName`, ma con piu chiavi in cascata (es. cognome poi nome).
 */
export const sortByNameKeys = <T>(
  items: readonly T[] | null | undefined,
  getKeys: (item: T) => readonly unknown[],
): T[] => {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (left, right) =>
        compareNameValueLists(getKeys(left.item), getKeys(right.item)) ||
        left.index - right.index,
    )
    .map((entry) => entry.item);
};

// --- ordinamento cronologico -------------------------------------------------

/**
 * Elenchi di eventi nel tempo: pagamenti, rate, bonifici, contratti, ricevute.
 *
 * L'alfabetico qui e una regressione (vedi sopra), ma «non alfabetico» non
 * vuol dire «nessun ordine»: prima del Blocco 7 alcuni di questi elenchi
 * comparivano nell'ordine in cui erano stati scritti nel JSON — cioe
 * nell'ordine in cui erano stati inseriti, che per una segreteria non
 * significa niente.
 *
 * **La direzione predefinita e decrescente**: in un registro amministrativo si
 * guarda l'ultimo movimento, non il primo. L'ascendente resta per gli elenchi
 * che si leggono come una scaletta — le rate di un piano, che si pagano in
 * ordine.
 *
 * Le voci senza data vanno **in fondo** in entrambe le direzioni: una riga
 * senza data non e ne recente ne vecchia, e metterla in cima la farebbe
 * sembrare l'ultimo movimento.
 */

const toTimestamp = (value: unknown): number | null => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const parsed = new Date(raw).getTime();
  return Number.isNaN(parsed) ? null : parsed;
};

export type DateAccessor<T> = (item: T) => unknown;

const compareTimestamps = (
  left: number | null,
  right: number | null,
  direction: "asc" | "desc",
) => {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return direction === "asc" ? left - right : right - left;
};

/** Comparatore cronologico su una data letta da `getDate`. */
export const compareByDate = <T>(
  getDate: DateAccessor<T>,
  direction: "asc" | "desc" = "desc",
) => (left: T, right: T) =>
  compareTimestamps(toTimestamp(getDate(left)), toTimestamp(getDate(right)), direction);

/**
 * Copia ordinata dal piu recente al meno recente.
 *
 * Non ordina in posto: `Array.prototype.sort` muta, e mutare un array che
 * viene da uno stato React e un difetto silenzioso.
 */
export const sortByDateDesc = <T>(items: T[], getDate: DateAccessor<T>): T[] =>
  [...items].sort(compareByDate(getDate, "desc"));

/** Copia ordinata dal meno recente al piu recente. */
export const sortByDateAsc = <T>(items: T[], getDate: DateAccessor<T>): T[] =>
  [...items].sort(compareByDate(getDate, "asc"));

/**
 * La data di un record di pagamento, qualunque nome abbia.
 *
 * I payload non hanno schema e negli anni hanno usato tutte queste chiavi. Si
 * prende la prima valorizzata, nell'ordine in cui conta per un registro: la
 * data di incasso batte la scadenza, che batte la data di creazione.
 */
export const paymentDateOf = (payment: any): string =>
  String(
    payment?.paidAt ||
      payment?.paid_at ||
      payment?.date ||
      payment?.dueDate ||
      payment?.due_date ||
      payment?.uploadDate ||
      payment?.createdAt ||
      payment?.created_at ||
      "",
  );
