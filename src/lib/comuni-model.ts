/**
 * Archivio dei comuni italiani: modello puro.
 *
 * Il dataset (`src/data/comuni-istat.json`) e generato da
 * `scripts/build-comuni-dataset.mjs` a partire dall'elenco ufficiale ISTAT
 * delle unita amministrative territoriali, che nella stessa riga porta
 * denominazione, sigla della provincia e **codice catastale (Belfiore)**.
 *
 * Qui non si legge nessun file: questo modulo sa solo *come* si indicizza e
 * si cerca un elenco di comuni. Chi lo chiama gli passa i dati — il server
 * dal JSON, i test da un elenco ridotto scritto a mano. E la stessa
 * separazione che ha `italian-registry.ts`, ed e cio che rende la ricerca
 * verificabile senza caricare 8.000 righe.
 *
 * **Il codice catastale non si indovina mai** (ADR-0027, aggiornato nel
 * Blocco 7): prima non c'era tabella e lo forniva l'utente; ora c'e una
 * tabella ufficiale e lo fornisce lei. Cio che non e mai cambiato e che
 * nessuna funzione qui dentro *costruisce* un codice: o lo trova nell'elenco,
 * o dice che non c'e.
 */

import { findProvince, stripDiacritics } from "./italian-registry";

export type Comune = {
  /** Denominazione italiana, come la scrive ISTAT. */
  name: string;
  /** Sigla automobilistica della provincia, due lettere. */
  province: string;
  /** Codice catastale (Belfiore): una lettera e tre cifre. */
  belfiore: string;
  /** Denominazione nell'altra lingua ufficiale, dove esiste (Alto Adige). */
  otherName?: string;
};

/** Forma compatta con cui il dataset e serializzato su disco. */
export type ComuneTuple = [string, string, string, string?];

export type ComuneMatch = Comune & {
  /** Nome della provincia, per mostrarlo senza una seconda ricerca. */
  provinceName: string;
  region: string;
  /**
   * CAP del comune, **solo dove ce n'e uno solo**.
   *
   * Lo aggiunge il server da un dataset separato (`cap-model.ts`): questo
   * modulo continua a non sapere niente dei CAP, che hanno una fonte diversa
   * dall'archivio ISTAT e una regola diversa. Vuoto non significa «nessun
   * CAP»: significa «non uno solo», e `postalCodeStatus` dice quale dei due
   * modi di non sapere e.
   */
  postalCode?: string;
  postalCodeStatus?: "unique" | "ambiguous" | "unknown";
};

/**
 * Chiave di confronto: senza accenti, senza punteggiatura, senza spazi.
 *
 * Serve perche gli stessi comuni si scrivono in molti modi — «Sant'Angelo»,
 * «S. Angelo», «SANTANGELO» — e chi digita in segreteria non deve indovinare
 * l'apostrofo giusto.
 */
export const normalizeComuneName = (value?: string | null) =>
  stripDiacritics(String(value || ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

/** Come sopra, ma tiene gli spazi: serve per il confronto per parola. */
const normalizeWords = (value?: string | null) =>
  stripDiacritics(String(value || ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const decodeComune = (tuple: ComuneTuple): Comune => ({
  name: tuple[0],
  province: tuple[1],
  belfiore: tuple[2],
  ...(tuple[3] ? { otherName: tuple[3] } : {}),
});

const decorate = (comune: Comune): ComuneMatch => {
  const province = findProvince(comune.province);
  return {
    ...comune,
    provinceName: province?.name || comune.province,
    region: province?.region || "",
  };
};

export type ComuneIndex = {
  all: ComuneMatch[];
  byBelfiore: Map<string, ComuneMatch>;
  /** Piu comuni possono avere lo stesso nome in province diverse. */
  byName: Map<string, ComuneMatch[]>;
  /** Chiave `nome|SIGLA`: identifica un comune senza ambiguita. */
  byNameAndProvince: Map<string, ComuneMatch>;
};

export const buildComuneIndex = (
  tuples: readonly ComuneTuple[],
): ComuneIndex => {
  const all: ComuneMatch[] = [];
  const byBelfiore = new Map<string, ComuneMatch>();
  const byName = new Map<string, ComuneMatch[]>();
  const byNameAndProvince = new Map<string, ComuneMatch>();

  for (const tuple of tuples) {
    const comune = decorate(decodeComune(tuple));
    all.push(comune);
    byBelfiore.set(comune.belfiore, comune);

    for (const label of [comune.name, comune.otherName]) {
      if (!label) continue;
      const key = normalizeComuneName(label);
      if (!key) continue;

      const bucket = byName.get(key);
      if (bucket) {
        if (!bucket.includes(comune)) bucket.push(comune);
      } else {
        byName.set(key, [comune]);
      }
      byNameAndProvince.set(`${key}|${comune.province}`, comune);
    }
  }

  return { all, byBelfiore, byName, byNameAndProvince };
};

/**
 * Il comune di un codice catastale, se esiste.
 *
 * Torna `null` per i codici che l'elenco non contiene: comuni soppressi e
 * stati esteri (i codici `Z***`). Non e un errore ed e importante che non lo
 * diventi — chi e nato a Zurigo o in un comune accorpato nel 2018 ha un codice
 * fiscale perfettamente valido che questa tabella non sa spiegare.
 */
export const findComuneByBelfiore = (
  index: ComuneIndex,
  code?: string | null,
): ComuneMatch | null => {
  const candidate = String(code || "").trim().toUpperCase();
  return index.byBelfiore.get(candidate) || null;
};

/**
 * Il comune di un nome, ristretto alla provincia quando e nota.
 *
 * Senza provincia, un nome ambiguo (ce ne sono: «Castro», «Livo», «Samone»)
 * non torna niente invece di tornare il primo: scegliere per conto dell'utente
 * significherebbe scrivere un codice catastale sbagliato in un codice fiscale.
 */
export const findComuneByName = (
  index: ComuneIndex,
  name?: string | null,
  province?: string | null,
): ComuneMatch | null => {
  const key = normalizeComuneName(name);
  if (!key) return null;

  const provinceCode = findProvince(province)?.code || "";
  if (provinceCode) {
    return index.byNameAndProvince.get(`${key}|${provinceCode}`) || null;
  }

  const matches = index.byName.get(key);
  return matches && matches.length === 1 ? matches[0] : null;
};

/** Tutti gli omonimi di un nome, in province diverse. */
export const findComuniByName = (
  index: ComuneIndex,
  name?: string | null,
): ComuneMatch[] => {
  const key = normalizeComuneName(name);
  if (!key) return [];
  return index.byName.get(key) || [];
};

export const DEFAULT_COMUNE_SEARCH_LIMIT = 12;

/**
 * Ricerca per la tendina.
 *
 * L'ordine e quello che rende utile un elenco corto: prima le corrispondenze
 * esatte, poi i nomi che *cominciano* per quello che si sta digitando, poi
 * quelli in cui la stringa compare come inizio di una parola successiva
 * («Terme» trova «Abano Terme»), infine il resto. A parita, ordine
 * alfabetico — cosi il risultato non dipende dall'ordine del file.
 *
 * Accetta anche il codice catastale e la sigla di provincia come query: in
 * segreteria si arriva al comune da tutt'e tre le strade.
 */
export const searchComuni = (
  index: ComuneIndex,
  query?: string | null,
  options: { limit?: number; province?: string | null } = {},
): ComuneMatch[] => {
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_COMUNE_SEARCH_LIMIT, 50));
  const provinceFilter = findProvince(options.province)?.code || "";
  const raw = String(query || "").trim();

  if (!raw) return [];

  const compact = normalizeComuneName(raw);
  const words = normalizeWords(raw);
  if (!compact) return [];

  // Un codice catastale e inequivocabile: se corrisponde, e quello.
  const byCode = findComuneByBelfiore(index, raw);
  if (byCode && (!provinceFilter || byCode.province === provinceFilter)) {
    return [byCode];
  }

  const scored: { comune: ComuneMatch; rank: number; label: string }[] = [];

  for (const comune of index.all) {
    if (provinceFilter && comune.province !== provinceFilter) continue;

    let best = Number.POSITIVE_INFINITY;

    for (const label of [comune.name, comune.otherName]) {
      if (!label) continue;
      const compactLabel = normalizeComuneName(label);
      const wordLabel = normalizeWords(label);

      let rank: number;
      if (compactLabel === compact) rank = 0;
      else if (compactLabel.startsWith(compact)) rank = 1;
      else if (wordLabel.includes(` ${words}`)) rank = 2;
      else if (compactLabel.includes(compact)) rank = 3;
      else continue;

      if (rank < best) best = rank;
    }

    if (best === Number.POSITIVE_INFINITY) continue;
    scored.push({ comune, rank: best, label: comune.name });
  }

  scored.sort(
    (left, right) =>
      left.rank - right.rank || left.label.localeCompare(right.label, "it"),
  );

  return scored.slice(0, limit).map((entry) => entry.comune);
};

export type BelfioreOrigin = "italiano" | "estero-o-soppresso" | "malformato";

/**
 * Che cosa e un codice catastale che non sta nell'elenco.
 *
 * `Z***` sono gli stati esteri, che ISTAT pubblica in un file separato non
 * incluso qui. Tutto il resto ben formato ma assente e quasi sempre un comune
 * soppresso: entrambi i casi restano leciti e non vanno segnalati come errore.
 */
export const classifyBelfiore = (
  index: ComuneIndex,
  code?: string | null,
): BelfioreOrigin => {
  const candidate = String(code || "").trim().toUpperCase();
  if (!/^[A-Z]\d{3}$/.test(candidate)) return "malformato";
  return index.byBelfiore.has(candidate) ? "italiano" : "estero-o-soppresso";
};
