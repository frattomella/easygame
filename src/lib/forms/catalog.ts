import { normalizeFormSchema, type FormPurpose, type FormSchema } from "./model";
import { createStarterSchema, type StarterTemplateKey } from "./starter-templates";

/**
 * **I modelli di modulo che EasyGame consiglia**, e la loro adozione.
 *
 * **Il difetto che chiude (W6-45).** I tre modelli di partenza erano voci di
 * un menu a tendina sotto «Nuovo modulo»: una volta creati, un modulo nato da
 * «Iscrizione online» era **indistinguibile** da uno scritto a mano, e il club
 * non aveva modo di sapere da dove venisse ne di ritrovare il modello. Peggio:
 * un elenco che mescola «cio che il club ha» e «cio che il club potrebbe
 * prendere» risponde male a entrambe le domande.
 *
 * **Perche questa forma e non un'invenzione nuova.** Il pattern «catalogo
 * adottabile» esiste gia in questo repository per i modelli di documento
 * (`src/lib/documents/catalog/`, ADR-0092) e funziona: una voce dichiara di
 * che **classe** e, **chi risponde** del testo e **quando** e stata riletta
 * l'ultima volta; adottarla ne crea una **copia del club**, gia sua, e la
 * chiave della voce resta sulla copia solo per dire da dove viene. Qui si
 * replica quella forma, con lo stesso vocabolario, invece di inventarne una
 * seconda per i moduli.
 *
 * **Perche i tipi sono ridefiniti e non importati.** Il catalogo dei documenti
 * appartiene a un altro dominio, con un altro proprietario. Due parole uguali
 * costano meno di un import che lega moduli e documenti l'uno all'altro:
 * quando un giorno una delle due classi cambiera, cambiera per una ragione che
 * riguarda un dominio solo.
 *
 * Modulo **puro** e client-safe: e testo e struttura, versionato con il
 * repository. Non conosce ne Prisma ne la rete.
 */

/**
 * La classe redazionale, cioe chi puo mantenere il contenuto della voce.
 *
 * - `A` — dice **fatti del gestionale**: i campi sono quelli che EasyGame sa
 *   gia leggere e scrivere in anagrafica. Cambia solo se cambia il prodotto;
 * - `B` — modulo di un ente terzo (federazione, regione, ASL). Cambia per
 *   decisione di altri, senza preavviso, ed e diverso in ogni provincia:
 *   **non ne distribuiamo nessuno**;
 * - `C` — contiene dichiarazioni di responsabilita o riferimenti normativi.
 *   Serve la validazione di un professionista, e finche non c'e la voce
 *   resta ferma.
 */
export const FORM_CATALOG_CLASSES = ["A", "B", "C"] as const;
export type FormCatalogClass = (typeof FORM_CATALOG_CLASSES)[number];

/**
 * Lo stato di una voce.
 *
 * `pending_review` non e «quasi pronta»: e **scritta e non validata**. Il
 * testo esiste — cosi chi deve rileggerlo ha qualcosa da leggere invece di un
 * foglio bianco — ma non viene proposto a nessun club.
 */
export const FORM_CATALOG_STATUSES = [
  "active",
  "pending_review",
  "retired",
] as const;
export type FormCatalogStatus = (typeof FORM_CATALOG_STATUSES)[number];

export type FormCatalogEntry = {
  /** La chiave stabile: e cio che dice se un club ha gia adottato la voce. */
  key: string;
  title: string;
  /** Una riga sola: compare nell'elenco di cio che si puo adottare. */
  description: string;
  catalogClass: FormCatalogClass;
  status: FormCatalogStatus;
  /** Chi risponde del contenuto. */
  editorialOwner: string;
  /** Quando e stato riletto l'ultima volta, in `AAAA-MM-GG`. */
  lastReviewedAt: string;
  /** A cosa serve il modulo che ne nasce: lo dichiara la voce, non il club. */
  purpose: FormPurpose;
  /** Da quale schema di partenza si costruisce la copia del club. */
  starter: StarterTemplateKey;
};

/** Chi risponde del contenuto delle voci che distribuiamo. */
const REDAZIONE = "EasyGame — redazione di prodotto";

/** La data dell'ultima rilettura del catalogo. */
const REVISIONE = "2026-09-01";

/**
 * Il catalogo, e le due voci che lo compongono.
 *
 * **«Modulo vuoto» non e qui**, ed e la differenza che il difetto chiedeva di
 * fare: un foglio bianco non e un modello consigliato, e restare l'unica voce
 * sotto «Nuovo modulo» e esattamente cio che deve essere. Il catalogo elenca
 * cio che qualcuno ha **scritto** e di cui qualcuno **risponde**.
 *
 * Il catalogo non cresce senza un proprietario: aggiungere una voce e una
 * decisione con un costo ricorrente, non una riga di contenuto.
 */
export const FORM_CATALOG: FormCatalogEntry[] = [
  {
    key: "online_enrollment",
    title: "Iscrizione online",
    description:
      "Dati dell'atleta, contatti del genitore, documenti e consenso. Pensato per il link pubblico, e il modulo che la famiglia ricompila a ogni rinnovo.",
    catalogClass: "A",
    status: "active",
    editorialOwner: REDAZIONE,
    lastReviewedAt: REVISIONE,
    /*
      Dichiarato, non dedotto: e il modulo che deve comparire alla famiglia
      sotto «cosa vuoi rinnovare», e dirlo qui evita che la deduzione debba
      indovinarlo.
    */
    purpose: "enrollment",
    starter: "online_enrollment",
  },
  {
    key: "medical_consent",
    title: "Consenso e certificato medico",
    description:
      "Richiesta del certificato medico sportivo con il consenso al trattamento dei dati sanitari.",
    catalogClass: "A",
    status: "active",
    editorialOwner: REDAZIONE,
    lastReviewedAt: REVISIONE,
    /*
      **Non e un modulo di iscrizione**, benche raccolga nome e data di
      nascita dell'atleta: chi lo compila e gia iscritto. Senza questa riga la
      deduzione lo farebbe comparire nel menu del rinnovo — ed e proprio il
      caso per cui la dichiarazione esplicita esiste.
    */
    purpose: "generic",
    starter: "medical_consent",
  },
];

/**
 * Una voce si distribuisce **solo** se e di classe A ed e attiva.
 *
 * Le due condizioni sono separate di proposito: una voce puo essere di classe
 * A e comunque non distribuibile, perche nessuno l'ha ancora riletta.
 */
export const isDistributableFormEntry = (entry: FormCatalogEntry) =>
  entry.catalogClass === "A" && entry.status === "active";

export const DISTRIBUTABLE_FORM_CATALOG = FORM_CATALOG.filter(
  isDistributableFormEntry,
);

export const findFormCatalogEntry = (
  key?: string | null,
): FormCatalogEntry | null =>
  FORM_CATALOG.find((entry) => entry.key === String(key ?? "").trim()) || null;

/**
 * La copia del club che nasce da una voce.
 *
 * Provenienza e destinazione d'uso finiscono nelle **impostazioni**, cioe
 * dentro la versione che verra pubblicata: da quel momento sono parte di cio
 * che quel modulo dichiarava di essere, e restano vere anche se domani la voce
 * di catalogo cambia.
 */
export const buildFormFromCatalog = (entry: FormCatalogEntry): FormSchema => {
  const schema = createStarterSchema(entry.starter);

  return normalizeFormSchema({
    ...schema,
    settings: {
      ...schema.settings,
      purpose: entry.purpose,
      catalogKey: entry.key,
    },
  });
};
