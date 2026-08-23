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
