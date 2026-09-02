/**
 * **Il perimetro di un'assegnazione** (Wave 6, lane 6G, §9.3 del piano).
 *
 * Modulo **puro**: nessun Prisma, nessuna rete, nessun DOM.
 *
 * ---
 *
 * ## Zero righe = tutto il club
 *
 * E la scelta che rende la migrazione additiva, e va detta prima di tutto il
 * resto: chi oggi non ha nessuno scope continua domani a vedere tutto. Un
 * perimetro vuoto non e «nessun accesso», e «nessuna restrizione». La forma
 * opposta — dover elencare le sedi di ogni membership esistente — avrebbe
 * spento l'accesso a tutti la notte del rilascio.
 *
 * ## Perche sede e categoria, e non «gruppo»
 *
 * Il gruppo operativo e la **coppia** (categoria, sede) — ADR-0055 — e non e
 * un'entita: darglielo come scope significherebbe crearne una. Il piano lo
 * dichiara fra le cose che non si fanno (§8). Due assi indipendenti, e
 * l'intersezione la calcola chi legge.
 */

export const ACCESS_SCOPE_KINDS = ["site", "category"] as const;

export type AccessScopeKind = (typeof ACCESS_SCOPE_KINDS)[number];

export type AccessScopeEntry = {
  kind: AccessScopeKind;
  value: string;
};

export const isAccessScopeKind = (
  value: string | null | undefined,
): value is AccessScopeKind =>
  ACCESS_SCOPE_KINDS.includes(String(value || "").trim() as AccessScopeKind);

/**
 * Normalizza e deduplica un elenco di scope, scartando ogni voce malformata.
 *
 * Scarta invece di sollevare perche questa funzione la usano sia la scrittura
 * sia la lettura: in scrittura il chiamante verifica il risultato — se ha
 * chiesto tre perimetri e ne tornano due, la richiesta e sbagliata — mentre in
 * lettura una riga corrotta in archivio non deve far esplodere una sessione.
 */
export const normalizeAccessScopes = (
  entries: readonly { kind?: string | null; value?: string | null }[] | null | undefined,
): AccessScopeEntry[] => {
  if (!Array.isArray(entries)) return [];

  const visti = new Set<string>();
  const risultato: AccessScopeEntry[] = [];

  for (const entry of entries) {
    const kind = String(entry?.kind || "").trim().toLowerCase();
    const value = String(entry?.value || "").trim();
    if (!isAccessScopeKind(kind) || !value) continue;

    const chiave = `${kind}::${value}`;
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    risultato.push({ kind, value });
  }

  return risultato;
};

/**
 * Vero se la riga sta dentro il perimetro dell'assegnazione.
 *
 * I due assi sono in **AND** fra loro e in **OR** dentro se stessi: «le sedi di
 * Scauri e Santi Cosma, categoria Pulcini» significa Pulcini in una di quelle
 * due sedi. Un asse senza nessuna voce non restringe, e una riga che non porta
 * il valore dell'asse ristretto **non passa**: se qualcuno ha dichiarato che
 * quella persona vede solo una sede, un dato senza sede non e «di tutte le
 * sedi», e un dato di cui non si sa dire dove sia.
 */
export const accessScopeAllows = (
  scopes: readonly AccessScopeEntry[] | null | undefined,
  row: { siteId?: string | null; categoryId?: string | null },
) => {
  const elenco = normalizeAccessScopes(scopes);
  if (!elenco.length) return true;

  const sedi = elenco.filter((entry) => entry.kind === "site");
  const categorie = elenco.filter((entry) => entry.kind === "category");

  if (sedi.length) {
    const sede = String(row.siteId || "").trim();
    if (!sede || !sedi.some((entry) => entry.value === sede)) return false;
  }

  if (categorie.length) {
    const categoria = String(row.categoryId || "").trim();
    if (!categoria || !categorie.some((entry) => entry.value === categoria)) {
      return false;
    }
  }

  return true;
};

/**
 * **Un perimetro non si allarga concedendolo a qualcun altro.**
 *
 * `updateAssignmentScopes` vieta gia di cambiare il **proprio** perimetro, e
 * il commento accanto racconta perche. Ma il perimetro non faceva parte del
 * soffitto di una concessione: `assertMayGrantRole` confronta le **chiavi** e
 * mai gli **scope**.
 *
 * Misurato: un `club_manager` recintato sulla sede Nord concedeva a una
 * seconda utenza un `club_manager` **senza perimetro**, e da quel momento
 * leggeva tutto il club per interposta persona. E la stessa lezione gia
 * scritta per le chiavi — «l'auto-assegnazione era vietata; concederlo a un
 * complice no» — un asse piu in la.
 *
 * La regola tiene conto della semantica dei due assi, che sono in **AND** fra
 * loro: chi restringe la sede deve concedere una sede, e sceglierla fra le
 * proprie. Restringere anche la categoria e lecito — e piu stretto. Non
 * nominare affatto un asse che si ha ristretto **non** lo e: zero righe su un
 * asse significa «tutto il club», che e piu largo.
 *
 * Chi non ha un perimetro non e toccato: concede quello che vuole.
 */
export const accessScopeContains = (
  concedente: readonly AccessScopeEntry[] | null | undefined,
  concesso: readonly AccessScopeEntry[] | null | undefined,
) => {
  const mio = normalizeAccessScopes(concedente);
  if (!mio.length) return true;

  const suo = normalizeAccessScopes(concesso);

  for (const kind of ACCESS_SCOPE_KINDS) {
    const miei = mio.filter((entry) => entry.kind === kind).map((e) => e.value);
    if (!miei.length) continue;

    const suoi = suo.filter((entry) => entry.kind === kind).map((e) => e.value);
    if (!suoi.length) return false;
    if (suoi.some((valore) => !miei.includes(valore))) return false;
  }

  return true;
};

/** I valori di un asse, per costruire un filtro `in` senza ripetere la forma. */
export const accessScopeValues = (
  scopes: readonly AccessScopeEntry[] | null | undefined,
  kind: AccessScopeKind,
) =>
  normalizeAccessScopes(scopes)
    .filter((entry) => entry.kind === kind)
    .map((entry) => entry.value);
