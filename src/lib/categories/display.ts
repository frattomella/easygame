/**
 * **Come si scrive una categoria quando il suo nome ne nomina due.**
 *
 * ---
 *
 * ## Perche esiste
 *
 * ADR-0155 ha tolto la **fusione**: per il codice l'Under 15 di Formia non e
 * piu l'Under 15 di Scauri. A schermo pero le due restavano due voci con la
 * stessa scritta — in un menu a tendina, in un filtro, in un'intestazione — e
 * chi sceglieva non sapeva quale stesse scegliendo. La decisione stessa lo
 * dichiarava come lavoro aperto, e il debito lo ha registrato come `D-INT-3`
 * nominando gia il rimedio: **la sede si accosta in un punto solo, non in dieci
 * schermate**.
 *
 * Questo e quel punto.
 *
 * ## La regola
 *
 * 1. **L'identita resta l'identificativo.** Questo modulo produce *etichette*.
 *    Nessuno sceglie, filtra o confronta una categoria da cio che esce di qui:
 *    l'etichetta serve a leggerla, non a riconoscerla. Chi confronta passa da
 *    `sameCategory`; chi risolve, da `resolveCategoryReference`.
 *
 * 2. **La sede si accosta solo quando serve.** Accostarla sempre —
 *    «Pulcini (Roma)» in un club che ha una sede sola — e rumore su ogni riga
 *    di ogni schermata per un'ambiguita che non esiste. L'ambiguita si calcola
 *    dove si disegna, cioe qui, e sull'insieme che si sta mostrando.
 *
 * 3. **Se la sede non distingue, non si scrive.** Due omonime che vivono nella
 *    stessa sede, o una categoria che gira su due sedi, non si separano con la
 *    sede: aggiungerla darebbe due scritte ancora uguali, oppure una scritta
 *    falsa. In quel caso l'etichetta resta il nome nudo, e a distinguere ci
 *    pensa cio che la schermata ha gia (l'ordine, il gruppo, la fascia d'eta).
 *
 * ## Cosa non fa
 *
 * Non conosce le appartenenze di un atleta, non decide eleggibilita e non
 * ordina niente: l'ordine canonico e `sortCategoryOptions` (D-INT-9). Non
 * sostituisce `buildCategoryGroupLabel`, che scrive il **gruppo operativo**
 * (`Pulcini · Roma`) — li la sede fa parte del nome della cosa, sempre, perche
 * il gruppo *e* la coppia (ADR-0038). Qui la sede e una disambiguazione, e per
 * questo e fra parentesi e non dopo un separatore.
 */

import { normalizeCategoryToken } from "@/lib/categories/identity";

export type CategoryDisplayEntry = {
  id?: string | null;
  name?: string | null;
};

export type CategoryGroupLike = {
  categoryId?: string | null;
  siteId?: string | null;
  siteName?: string | null;
  active?: boolean;
};

export type CategoryDisplay = {
  /** L'identificativo: l'unica cosa con cui si sceglie. */
  readonly id: string;
  /** Il nome della categoria, nudo. */
  readonly name: string;
  /** La sede, valorizzata **solo** quando serve a distinguere due omonime. */
  readonly site: string;
  /** `Under 15 (Formia)` quando serve, `Under 15` quando non serve. */
  readonly label: string;
  /** Vero quando il nome, da solo, ne nomina piu di una. */
  readonly ambiguous: boolean;
};

export type CategoryDisplayIndex = {
  readonly describe: (reference: unknown) => CategoryDisplay;
  readonly label: (reference: unknown) => string;
  /** Vero quando almeno un nome del catalogo ne nomina piu di uno. */
  readonly hasHomonyms: boolean;
};

const trim = (value: unknown) => String(value ?? "").trim();

/**
 * **Le sedi su cui gira una categoria**, dai gruppi operativi del club.
 *
 * Una categoria non porta una sede: la coppia (categoria, sede) e il **gruppo**
 * (ADR-0038). Percio la sede di una categoria e quella dei suoi gruppi — e
 * quando i gruppi sono due, la categoria non ha *una* sede e la
 * disambiguazione per sede non e disponibile.
 */
const sedePerCategoria = (groups: readonly CategoryGroupLike[]) => {
  const perCategoria = new Map<string, Set<string>>();
  const nomi = new Map<string, string>();

  for (const group of Array.isArray(groups) ? groups : []) {
    if (group?.active === false) continue;

    const categoryId = normalizeCategoryToken(group?.categoryId);
    const siteId = trim(group?.siteId);
    if (!categoryId || !siteId) continue;

    const bucket = perCategoria.get(categoryId) || new Set<string>();
    bucket.add(siteId);
    perCategoria.set(categoryId, bucket);

    const siteName = trim(group?.siteName);
    if (siteName && !nomi.has(siteId)) nomi.set(siteId, siteName);
  }

  return (categoryId: string) => {
    const sedi = perCategoria.get(normalizeCategoryToken(categoryId));
    /*
      Zero sedi: la categoria non e su nessun gruppo, non c'e niente da
      accostare. Due o piu: gira su piu sedi, e nominarne una sarebbe falso.
    */
    if (!sedi || sedi.size !== 1) return "";

    const [siteId] = Array.from(sedi);
    return nomi.get(siteId) || siteId;
  };
};

/**
 * **L'indice si costruisce una volta per schermata, non una per riga.**
 *
 * L'ambiguita e una proprieta dell'**insieme** — «questo nome ne nomina due
 * fra quelle che sto mostrando» — quindi non si puo rispondere guardando una
 * categoria per volta. Ricalcolarla a ogni cella costerebbe un giro sul
 * catalogo per riga su elenchi da duecento atleti.
 */
export const buildCategoryDisplayIndex = ({
  categories = [],
  groups = [],
}: {
  categories?: readonly CategoryDisplayEntry[];
  groups?: readonly CategoryGroupLike[];
} = {}): CategoryDisplayIndex => {
  const voci = (Array.isArray(categories) ? categories : []).filter((voce) =>
    trim(voce?.id),
  );

  const quanteConQuestoNome = new Map<string, number>();
  for (const voce of voci) {
    const nome = normalizeCategoryToken(voce?.name);
    if (!nome) continue;
    quanteConQuestoNome.set(nome, (quanteConQuestoNome.get(nome) || 0) + 1);
  }

  const sedeDi = sedePerCategoria(groups);

  const perId = new Map<string, CategoryDisplayEntry>();
  for (const voce of voci) {
    perId.set(normalizeCategoryToken(voce.id), voce);
  }

  /*
    **Una sede si accosta solo se distingue davvero.**

    Non basta che la categoria ne abbia una sola: deve essere una sola **e non
    di qualcun altro con lo stesso nome**. Due «Under 15» che vivono tutte e due
    a Roma, scritte «Under 15 (Roma)» due volte, sono ancora due voci identiche
    — con in piu la promessa implicita di essere state disambiguate, che e
    peggio del nome nudo perche invita a fidarsi.

    Si conta quindi quante omonime rivendicano ciascuna sede, e la parentesi si
    apre solo dove quel conto fa uno.
  */
  const quanteOmonimeInQuestaSede = new Map<string, number>();
  for (const voce of voci) {
    const nome = normalizeCategoryToken(voce?.name);
    if (!nome || (quanteConQuestoNome.get(nome) || 0) < 2) continue;

    const sede = sedeDi(trim(voce.id));
    if (!sede) continue;

    const chiave = `${nome}::${normalizeCategoryToken(sede)}`;
    quanteOmonimeInQuestaSede.set(
      chiave,
      (quanteOmonimeInQuestaSede.get(chiave) || 0) + 1,
    );
  }

  const sedeCheDistingue = (id: string, name: string) => {
    const sede = sedeDi(id);
    if (!sede) return "";

    const chiave = `${normalizeCategoryToken(name)}::${normalizeCategoryToken(sede)}`;
    return (quanteOmonimeInQuestaSede.get(chiave) || 0) === 1 ? sede : "";
  };

  const describe = (reference: unknown): CategoryDisplay => {
    /*
      **L'identificativo per cercare, il nome per ripiegare** (revisione
      ostile, H4).

      La prima stesura leggeva un solo valore e, quando il catalogo non lo
      riconosceva, lo restituiva **com'e** come nome: a schermo compariva
      `category-1757…` al posto di «Scoiattoli». Non era un caso limite —
      succedeva a ogni primo disegno della scheda atleta, perche il catalogo
      arriva da una lettura asincrona, e restava per sempre su una categoria
      tolta dal catalogo.

      Peggio, il ramo sugli oggetti leggeva `.id` per primo: su
      un'appartenenza `.id` e l'identificativo **della riga**, non della
      categoria, e usciva l'uuid della riga.
    */
    const perCercare = trim(
      typeof reference === "object" && reference
        ? (reference as any).categoryId ??
            (reference as any).category_id ??
            (reference as any).id
        : reference,
    );

    const perLeggere = trim(
      typeof reference === "object" && reference
        ? (reference as any).categoryName ??
            (reference as any).category_name ??
            (reference as any).name
        : "",
    );

    const grezzo = perCercare || perLeggere;
    const voce = perId.get(normalizeCategoryToken(perCercare));

    if (!voce) {
      /*
        Un riferimento che il catalogo non conosce si mostra com'e. Non e un
        errore: e il club che non ha mai aperto la pagina delle categorie, o
        una colonna storica mai bonificata. Nessuna sede da accostare, perche
        non si sa a quale categoria appartenga.
      */
      /*
        Il catalogo non lo conosce: si mostra il **nome** se il chiamante ce
        l'ha, e il valore com'e solo quando non c'e altro. Un identificativo a
        schermo non e un'etichetta: e un difetto che si legge.
      */
      const etichetta = perLeggere || grezzo;

      return {
        id: grezzo,
        name: etichetta,
        site: "",
        label: etichetta,
        ambiguous: false,
      };
    }

    const id = trim(voce.id);
    const name = trim(voce.name) || id;
    const ambiguous = (quanteConQuestoNome.get(normalizeCategoryToken(name)) || 0) > 1;
    const site = ambiguous ? sedeCheDistingue(id, name) : "";

    return {
      id,
      name,
      site,
      label: site ? `${name} (${site})` : name,
      ambiguous,
    };
  };

  const hasHomonyms = Array.from(quanteConQuestoNome.values()).some(
    (quante) => quante > 1,
  );

  return {
    describe,
    label: (reference: unknown) => describe(reference).label,
    hasHomonyms,
  };
};

/**
 * La scorciatoia per chi ha una categoria sola da scrivere e non tiene un
 * indice. Costruisce e butta: va bene per un'intestazione, **non** dentro un
 * `map` su duecento righe.
 */
export const describeCategoryForDisplay = (
  reference: unknown,
  options: {
    categories?: readonly CategoryDisplayEntry[];
    groups?: readonly CategoryGroupLike[];
  } = {},
): CategoryDisplay => buildCategoryDisplayIndex(options).describe(reference);
