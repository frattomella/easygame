/**
 * Il CAP di un comune, quando e univoco: modello puro.
 *
 * Il dataset (`src/data/cap-ipa.json`) e generato da
 * `scripts/build-cap-dataset.mjs` dall'Indice della Pubblica Amministrazione
 * (AgID, CC BY 4.0, aggiornamento giornaliero), unito all'archivio ISTAT dei
 * comuni sul codice catastale.
 *
 * Qui non si legge nessun file: questo modulo sa solo *come* si interroga un
 * elenco di CAP. Chi lo chiama gli passa i dati — il server dal JSON, i test
 * da un elenco ridotto scritto a mano. E la stessa separazione di
 * `comuni-model.ts`, ed e cio che rende la ricerca verificabile senza
 * caricare 7.888 righe.
 *
 * **La regola che questo modulo esiste per far rispettare.** IPA osserva il
 * CAP della *sede* di ogni amministrazione, non «i CAP del comune». Per un
 * comune con un solo CAP l'osservazione e il CAP; per una citta grande e un
 * sottoinsieme dei suoi. Quindi:
 *
 * - dove l'osservazione e unica, si risponde con il CAP;
 * - dove non lo e, si risponde **`ambiguous`** e non si dice quale, perche un
 *   sottoinsieme presentato come elenco sembrerebbe completo;
 * - dove non c'e osservazione, si risponde `unknown`.
 *
 * Un CAP non si costruisce mai: o e nell'elenco, o si dice che non c'e. E lo
 * stesso divieto che vale per il codice catastale (ADR-0027, ADR-0032).
 */

/** Forma compatta con cui il dataset e serializzato: `[catastale, cap]`. */
export type CapTuple = [string, string];

export type CapIndex = {
  /** Codice catastale → CAP, solo dove l'osservazione e unica. */
  byBelfiore: Map<string, string>;
  /** Codici catastali dei comuni con piu CAP osservati. */
  ambiguous: Set<string>;
};

export type CapLookup =
  /** Un CAP solo: si puo proporre. */
  | { status: "unique"; cap: string }
  /** Piu CAP: il comune ne ha piu d'uno, e non si sa quale sia il suo. */
  | { status: "ambiguous" }
  /** Nessuna osservazione: il dataset non sa niente di questo comune. */
  | { status: "unknown" };

const normalizeBelfiore = (value?: string | null) =>
  String(value || "").trim().toUpperCase();

export const buildCapIndex = (
  unique: CapTuple[] = [],
  ambiguous: string[] = [],
): CapIndex => {
  const byBelfiore = new Map<string, string>();

  for (const entry of unique) {
    const belfiore = normalizeBelfiore(entry?.[0]);
    const cap = String(entry?.[1] || "").trim();
    if (/^[A-Z]\d{3}$/.test(belfiore) && /^\d{5}$/.test(cap)) {
      byBelfiore.set(belfiore, cap);
    }
  }

  return {
    byBelfiore,
    ambiguous: new Set(
      ambiguous.map(normalizeBelfiore).filter((code) => /^[A-Z]\d{3}$/.test(code)),
    ),
  };
};

/**
 * Il CAP di un comune dal suo codice catastale.
 *
 * I tre esiti non sono intercambiabili e chi chiama deve distinguerli:
 * `unique` si puo scrivere in un campo, `ambiguous` e `unknown` no — ma per
 * ragioni diverse, e all'operatore si dice quale delle due.
 */
export const lookupCap = (
  index: CapIndex,
  belfiore?: string | null,
): CapLookup => {
  const code = normalizeBelfiore(belfiore);
  if (!code) return { status: "unknown" };

  const cap = index.byBelfiore.get(code);
  if (cap) return { status: "unique", cap };

  if (index.ambiguous.has(code)) return { status: "ambiguous" };

  return { status: "unknown" };
};

/**
 * Il CAP da proporre, o stringa vuota.
 *
 * Comodita per chi deve solo riempire un campo e tratta i due modi di non
 * sapere allo stesso modo. Chi deve *spiegare* all'operatore perche il campo
 * non si e riempito usa `lookupCap`.
 */
export const suggestCap = (index: CapIndex, belfiore?: string | null): string => {
  const result = lookupCap(index, belfiore);
  return result.status === "unique" ? result.cap : "";
};
