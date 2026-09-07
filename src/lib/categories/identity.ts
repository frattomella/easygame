/**
 * **Chi e questa categoria, e quando due riferimenti nominano la stessa.**
 *
 * ---
 *
 * ## Perche esiste un modulo apposta
 *
 * «Quali atleti appartengono a questa categoria?» aveva **due** risposte
 * canoniche nell'albero, piu cinque copie private:
 *
 * * `athleteMatchesCategory` (`category-utils.ts`), che serve RSVP,
 *   convocazioni, statistiche, abbigliamento e cinque schermate;
 * * `recordMatchesCategory` (`trainer-dashboard-helpers.ts`), che serve le
 *   bacheche dell'allenatore, gli avvisi operativi e i report;
 * * e le copie in `training/page.tsx` (due), `matches/page.tsx`,
 *   `parent-dashboard.ts` e `category-athlete-stats.ts`.
 *
 * Tutte facevano la stessa cosa nello stesso modo sbagliato: mettevano
 * l'identificativo di una categoria e la sua **etichetta** nello stesso
 * insieme, e intersecavano. Con due categorie omonime su due sedi — la
 * configurazione ordinaria di una societa multi-sede — quell'intersezione e
 * non vuota, e per il prodotto le due squadre erano una sola.
 *
 * Correggerne una lasciava le altre. E la stessa forma per cui il dominio dei
 * tutori ha smesso di lasciare le proprie regole nei consumatori: **le regole
 * di un dominio stanno in una primitiva, non in ogni consumatore** (ADR-0153).
 *
 * ## La regola (ADR-0155)
 *
 * L'identita di una categoria e il suo **identificativo**. Il nome e
 * un'etichetta: serve a leggerla, non a riconoscerla.
 *
 * 1. un valore diventa un identificativo se il catalogo del club lo riconosce
 *    — per identificativo, oppure per un nome che ne nomina **una sola**;
 * 2. un nome che ne nomina due non entra da nessuna parte: sceglierne una
 *    sarebbe la fusione di prima con un passaggio in meno;
 * 3. il ripiego sui nomi resta — un club che non ha mai aperto la pagina delle
 *    categorie non ha un catalogo, e i suoi record portano solo etichette — ma
 *    vale **solo quando almeno uno dei due lati non porta identificativi**.
 *
 * ## Cio che questo modulo non fa
 *
 * Non risolve **etichette**: a dire come si scrive una categoria resta
 * `resolveCategoryLabel`, e li due omonime danno giustamente la stessa scritta.
 * Non conosce la compatibilita fra categorie, che e configurazione esplicita e
 * vive in `category-compatibility.ts` (ADR-0030).
 *
 * E non importa `category-utils.ts`: la risoluzione la fa da se sul catalogo
 * che riceve. Non e una scelta di stile — e cio che tiene il grafo aciclico,
 * visto che `category-utils.ts` importa **questo**.
 */

export type CategoryCatalogEntry = {
  id?: string | null;
  name?: string | null;
};

/** La forma normale di un riferimento: senza spazi ai bordi, minuscolo. */
export const normalizeCategoryToken = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const asSource = (record: any) =>
  record?.data && typeof record.data === "object" ? record.data : {};

const flatten = (value: any): any[] => {
  if (Array.isArray(value)) return value.flatMap((entry) => flatten(entry));

  /*
    Una stringa con le virgole e un elenco scritto a mano: e la forma che
    prende una colonna libera compilata da una segreteria, e va spezzata o
    l'intera riga diventa un token solo che non combacia con niente.
  */
  if (typeof value === "string" && value.includes(",")) {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [value];
};

/**
 * **Da una voce escono l'identificativo e il nome, non il primo dei due.**
 *
 * La prima stesura prendeva il **primo** valore non vuoto di una lista di
 * dieci grafie. Su un'appartenenza `{ category_id, category_name }` usciva
 * quindi il solo identificativo, e il nome spariva: per un club **senza
 * catalogo** — che sul nome ci vive, perche e tutto cio che ha — quell'atleta
 * smetteva di corrispondere alla propria categoria.
 *
 * Non l'ha trovato una rilettura: l'ha trovata la prova del controspecchio,
 * quella che misura che i club senza catalogo continuino a funzionare come
 * prima. Era li apposta.
 *
 * Escono entrambi. Con un catalogo in mano non cambia niente — l'identificativo
 * risolve, e il nome o risolve sullo stesso o e ambiguo e viene scartato —
 * mentre senza catalogo il nome torna a essere l'unica strada che c'e.
 */
const readEntry = (value: any): string[] => {
  if (typeof value !== "object" || !value) {
    return [String(value || "").trim()];
  }

  return [
    value.categoryId,
    value.category_id,
    value.category,
    value.categoryName,
    value.category_name,
    value.name,
    value.label,
    value.title,
    value.id,
    value.value,
  ]
    .map((voce) => String(voce ?? "").trim())
    .filter(Boolean);
};

/**
 * **Tutti i riferimenti a categoria che questo record porta, in forma normale.**
 *
 * Volutamente largo: legge le grafie della riga e quelle di `data`, gli
 * elenchi, le appartenenze e le colonne storiche. Un riferimento che sfugge e
 * un atleta che sparisce da una squadra; uno di troppo lo scarta la
 * risoluzione qui sotto, che il catalogo lo interroga davvero.
 */
export const collectCategoryTokens = (record: any): Set<string> => {
  const source = asSource(record);

  const grezzi = [
    record?.id,
    record?.name,
    record?.category,
    record?.category_id,
    record?.category_name,
    record?.categoryId,
    record?.categoryName,
    record?.categoryIds,
    record?.category_ids,
    record?.selectedCategories,
    record?.selectedCategoryIds,
    record?.memberships,
    record?.categoryMemberships,
    record?.category_memberships,
    source?.id,
    source?.name,
    source?.category,
    source?.category_id,
    source?.category_name,
    source?.categoryId,
    source?.categoryName,
    source?.categoryIds,
    source?.category_ids,
    source?.selectedCategories,
    source?.selectedCategoryIds,
    source?.memberships,
    source?.categoryMemberships,
    source?.category_memberships,
    record?.categories,
    source?.categories,
  ]
    .flatMap((value) => flatten(value))
    .flatMap(readEntry)
    .filter(Boolean);

  const tokens = new Set<string>();
  for (const grezzo of grezzi) tokens.add(normalizeCategoryToken(grezzo));
  tokens.delete("");
  return tokens;
};

export type CategoryIdentity = {
  /** Cio che il catalogo riconosce: la vera identita. */
  readonly identificativi: ReadonlySet<string>;
  /** Cio che non riconosce: vale come ripiego, e solo fra pari. */
  readonly nomi: ReadonlySet<string>;
};

/**
 * **Che cosa nomina questo record: identificativi da una parte, nomi
 * dall'altra.**
 *
 * La separazione **e** la correzione. Finche i due vivono nello stesso insieme
 * ogni consumatore puo confonderli di nuovo, ed e esattamente cio che sette
 * consumatori facevano.
 */
export const categoryIdentity = (
  record: any,
  catalog: readonly CategoryCatalogEntry[] = [],
): CategoryIdentity => {
  const identificativi = new Set<string>();
  const nomi = new Set<string>();

  const conosciute = catalog.filter((voce) => voce?.id);

  for (const grezzo of collectCategoryTokens(record)) {
    const perId = conosciute.find(
      (voce) => normalizeCategoryToken(voce.id) === grezzo,
    );
    if (perId?.id) {
      identificativi.add(normalizeCategoryToken(perId.id));
      continue;
    }

    const perNome = conosciute.filter(
      (voce) => normalizeCategoryToken(voce.name) === grezzo,
    );
    if (perNome.length === 1) {
      identificativi.add(normalizeCategoryToken(perNome[0].id));
      continue;
    }

    /* Ambiguo nel catalogo: non nomina nessuna categoria, e non entra. */
    if (perNome.length > 1) continue;

    nomi.add(grezzo);
  }

  return { identificativi, nomi };
};

/**
 * **Questi due riferimenti nominano la stessa categoria?**
 *
 * L'unica funzione che risponde, e da cui passano tutti: l'atleta contro la
 * categoria, l'allenamento contro la squadra, la gara contro il gruppo.
 */
export const sameCategory = (
  left: any,
  right: any,
  catalog: readonly CategoryCatalogEntry[] = [],
) => {
  const a = categoryIdentity(left, catalog);
  const b = categoryIdentity(right, catalog);

  for (const id of b.identificativi) {
    if (a.identificativi.has(id)) return true;
  }

  /*
    Se tutti e due i lati sanno dire chi sono, la risposta e gia stata data:
    due identificativi diversi sono due categorie diverse, e un'etichetta che
    il catalogo non conosce non le unisce.
  */
  if (a.identificativi.size && b.identificativi.size) return false;

  for (const nome of b.nomi) {
    if (a.nomi.has(nome)) return true;
  }

  return false;
};

/** Lo stesso, contro un elenco. */
export const sameAnyCategory = (
  record: any,
  categories: readonly any[] = [],
  catalog: readonly CategoryCatalogEntry[] = [],
) =>
  (Array.isArray(categories) ? categories : []).some((categoria) =>
    sameCategory(record, categoria, catalog),
  );
