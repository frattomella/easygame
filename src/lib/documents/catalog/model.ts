import type { TemplateSubjectKind } from "../placeholders";

/**
 * Il catalogo dei modelli: la sua forma, e la responsabilita che porta con se.
 *
 * **Perche una voce di catalogo non e solo un testo** (ADR-0092). Se EasyGame
 * distribuisce un modello, EasyGame risponde di cosa c'e scritto dentro: quel
 * foglio esce con il logo del club, ma l'ha scritto il fornitore. Un catalogo
 * senza un proprietario redazionale invecchia, e un modello invecchiato che
 * porta il timbro del presidente e peggio di nessun modello.
 *
 * Ogni voce dichiara quindi **chi risponde del testo** e **quando e stato
 * riletto l'ultima volta**, e quelle due informazioni viaggiano fino alla riga
 * del club che lo adotta.
 *
 * Modulo **puro** e client-safe.
 */

/**
 * La classe redazionale, cioe chi puo mantenere il testo.
 *
 * - `A` — **GENERIC**: dice **fatti del gestionale** — chi ha versato quanto,
 *   chi ha frequentato quante ore, chi e iscritto. Il testo cambia solo se
 *   cambia il prodotto, quindi EasyGame lo puo mantenere;
 * - `B` — **FEDERATION / REGION**: moduli della federazione, della regione,
 *   della ASL. Cambiano per decisione di terzi, senza preavviso, e sono
 *   diversi in ogni provincia. **Non ne distribuiamo nessuno**, ed e la
 *   decisione del §17 del planning: il club carica il suo e lo compila con i
 *   segnaposto;
 * - `C` — **LEGAL / FISCAL**: contiene dichiarazioni di responsabilita,
 *   riferimenti normativi o effetti contrattuali. Un errore qui costa al club
 *   piu di quanto il modello gli faccia risparmiare. Serve la validazione di
 *   un professionista, e finche non c'e il modello **non si distribuisce**.
 */
export const CATALOG_CLASSES = ["A", "B", "C"] as const;
export type CatalogClass = (typeof CATALOG_CLASSES)[number];

/**
 * Lo stato di una voce di catalogo.
 *
 * `pending_review` non e «quasi pronto»: e **scritto e non validato**. Il testo
 * esiste — cosi un professionista ha qualcosa da leggere invece di un foglio
 * bianco — ma non viene proposto a nessun club. E la differenza fra un
 * catalogo onesto e un catalogo che promette.
 */
export const CATALOG_ENTRY_STATUSES = [
  "active",
  "pending_review",
  "retired",
] as const;
export type CatalogEntryStatus = (typeof CATALOG_ENTRY_STATUSES)[number];

export type CatalogEntry = {
  /** La chiave stabile: e cio che dice se un club ha gia adottato la voce. */
  key: string;
  title: string;
  /** Una riga sola: compare nell'elenco di cio che si puo adottare. */
  description: string;
  subjectKind: TemplateSubjectKind;
  catalogClass: CatalogClass;
  status: CatalogEntryStatus;
  /** Chi risponde del testo. */
  editorialOwner: string;
  /** Quando e stato riletto l'ultima volta, in `AAAA-MM-GG`. */
  lastReviewedAt: string;
  /** Perche e in quello stato, quando non e ovvio. */
  notes?: string;
  content: string;
};

/**
 * Una voce si distribuisce **solo** se e di classe A ed e attiva.
 *
 * Le due condizioni sono separate di proposito: una voce puo essere di classe
 * A e comunque non distribuibile, perche nessuno l'ha ancora riletta. E la
 * regola che impedisce al catalogo di crescere per inerzia.
 */
export const isDistributable = (entry: CatalogEntry) =>
  entry.catalogClass === "A" && entry.status === "active";
