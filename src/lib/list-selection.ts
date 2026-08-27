/**
 * Selezione multipla in un elenco, e su cosa agisce.
 *
 * ## Il difetto che questo modulo chiude (RC Fix 2, punti 6-10)
 *
 * L'elenco Atleti sa selezionare righe e agire sulla selezione da tempo.
 * Allenatori, staff e soci no: avevano l'export PDF e basta, e quell'export
 * prendeva **sempre tutto l'elenco filtrato**. Chi voleva il tesserino di
 * quattro allenatori stampava un PDF di quaranta pagine, oppure lo faceva a
 * mano.
 *
 * Portare il pattern degli Atleti sulle altre tre schermate copiandolo tre
 * volte avrebbe prodotto quattro implementazioni allineate il giorno del
 * rilascio e divergenti al primo cambiamento. E gia successo con il telefono,
 * con la capitalizzazione e con il codice fiscale.
 *
 * ## Cosa c'e qui, e perche e puro
 *
 * Le regole della selezione — cosa vuol dire «tutti visibili», su quali righe
 * agisce un'azione, quali opzioni di export ha senso offrire — sono decisioni,
 * non markup. Stanno in un modulo senza React perche si possano collaudare
 * senza montare una pagina, e perche le quattro schermate ne condividano una
 * sola versione.
 *
 * ## La regola che conta piu di tutte
 *
 * **«Selezionati» significa esattamente i selezionati.** Non i selezionati
 * ancora visibili dopo l'ultimo filtro, non i selezionati della pagina
 * corrente: quelli che qualcuno ha spuntato. Un export che ne contenesse anche
 * uno solo di piu sarebbe un documento con dentro una persona che nessuno ha
 * scelto — e su un elenco di anagrafiche quel documento poi esce dal club.
 */

/** Su cosa agisce un'operazione di massa. */
export type SelectionScope = "selected" | "filtered" | "all";

/** Stato della casella «seleziona tutti»: la terza opzione esiste. */
export type SelectionHeaderState = boolean | "indeterminate";

const asSet = (values: Iterable<string>) => new Set(values);

/** Aggiunge o toglie una riga. Restituisce sempre un insieme nuovo. */
export const toggleSelection = (
  current: ReadonlySet<string>,
  id: string,
  checked: boolean,
): Set<string> => {
  const next = asSet(current);
  if (checked) next.add(id);
  else next.delete(id);
  return next;
};

/** Aggiunge o toglie un gruppo di righe: e «seleziona tutti visibili». */
export const toggleManySelection = (
  current: ReadonlySet<string>,
  ids: readonly string[],
  checked: boolean,
): Set<string> => {
  const next = asSet(current);
  for (const id of ids) {
    if (checked) next.add(id);
    else next.delete(id);
  }
  return next;
};

/**
 * Come deve apparire la casella in testa alla colonna.
 *
 * Lo stato indeterminato non e un vezzo: senza, una spunta piena su un elenco
 * di cui e selezionata meta dice una cosa falsa, e chi la toglie si aspetta di
 * deselezionare meta e ne deseleziona tutto.
 */
export const selectionHeaderState = (
  current: ReadonlySet<string>,
  ids: readonly string[],
): SelectionHeaderState => {
  if (!ids.length) return false;
  const selected = ids.filter((id) => current.has(id)).length;
  if (selected === 0) return false;
  if (selected === ids.length) return true;
  return "indeterminate";
};

/**
 * Le righe su cui agisce un'operazione, per ambito.
 *
 * `selected` **non** interseca con il filtro: chi ha spuntato quattro persone
 * e poi ha ristretto la ricerca vuole ancora quelle quattro. Se il filtro
 * potesse toglierne una, «selezionati» sarebbe un nome per qualcos'altro.
 */
export const resolveScopeRows = <T>({
  scope,
  rows,
  filteredRows,
  selectedIds,
  idOf,
}: {
  scope: SelectionScope;
  /** Tutte le righe caricate. */
  rows: readonly T[];
  /** Le righe che passano i filtri correnti. */
  filteredRows: readonly T[];
  selectedIds: ReadonlySet<string>;
  idOf: (row: T) => string;
}): T[] => {
  if (scope === "selected") {
    return rows.filter((row) => selectedIds.has(idOf(row)));
  }
  if (scope === "filtered") return [...filteredRows];
  return [...rows];
};

/**
 * Quali ambiti di export offrire, adesso.
 *
 * - **selezionati** solo se c'e una selezione. Offrirlo vuoto sarebbe un
 *   pulsante che non fa niente;
 * - **risultato filtrato** solo se i filtri stanno davvero togliendo qualcosa.
 *   Su un elenco senza filtri attivi sarebbe una seconda voce «tutti» con un
 *   altro nome — ed e il caso dei Soci, che di filtri non ne hanno;
 * - **tutti** sempre, se c'e qualcosa.
 *
 * L'ordine e quello: il primo e la scelta giusta quando una selezione c'e, e
 * l'ordine di un menu e cio che la gente legge come suggerimento.
 */
export const availableExportScopes = ({
  selectedCount,
  filteredCount,
  totalCount,
}: {
  selectedCount: number;
  filteredCount: number;
  totalCount: number;
}): SelectionScope[] => {
  const scopes: SelectionScope[] = [];
  if (selectedCount > 0) scopes.push("selected");
  if (filteredCount > 0 && filteredCount < totalCount) scopes.push("filtered");
  if (totalCount > 0) scopes.push("all");
  return scopes;
};

/**
 * L'ambito da proporre per primo.
 *
 * Con una selezione attiva e **sempre** «selezionati». E la regola che evita
 * il PDF di quaranta pagine a chi ne aveva scelte quattro: un menu che
 * propone «tutti» quando una selezione esiste sta suggerendo la cosa
 * sbagliata.
 */
export const defaultExportScope = (
  scopes: readonly SelectionScope[],
): SelectionScope => scopes[0] || "all";

const SCOPE_LABELS: Record<SelectionScope, string> = {
  selected: "Esporta selezionati",
  filtered: "Esporta risultato filtrato",
  all: "Esporta tutti",
};

export const exportScopeLabel = (scope: SelectionScope, count: number) =>
  `${SCOPE_LABELS[scope]} (${count})`;

/** «3 allenatori selezionati», con il plurale giusto. */
export const describeSelection = (
  count: number,
  nouns: { one: string; many: string },
) => `${count} ${count === 1 ? nouns.one : nouns.many} ${count === 1 ? "selezionato" : "selezionati"}`;

/**
 * Toglie dalla selezione cio che non esiste piu.
 *
 * Serve dopo una cancellazione o una rilettura: una selezione che tiene l'id
 * di una riga sparita mostra un conteggio che non corrisponde a niente, e
 * un'azione di massa su quell'id fallirebbe senza spiegazioni.
 */
export const pruneSelection = (
  current: ReadonlySet<string>,
  availableIds: readonly string[],
): Set<string> => {
  const available = new Set(availableIds);
  const next = new Set<string>();
  for (const id of current) {
    if (available.has(id)) next.add(id);
  }
  return next;
};
