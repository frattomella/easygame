import {
  sameAnyCategory,
  sameCategory,
  type CategoryCatalogEntry,
} from "@/lib/categories/identity";
import {
  getAthleteCategoryReferences as getNormalizedAthleteCategoryReferences,
  getPrimaryAthleteCategoryMembership,
  normalizeAthleteCategoryMemberships,
} from "./athlete-category-memberships";
import { readCategoryCompatibilityList } from "./category-compatibility";

type CategoryLike = {
  id?: string | null;
  name?: string | null;
  ageRange?: string | null;
  birthYearFrom?: number | string | null;
  birthYearTo?: number | string | null;
  birth_year_from?: number | string | null;
  birth_year_to?: number | string | null;
};

export const UNCATEGORIZED_CATEGORY_ID = "__uncategorized__";
export type NormalizedCategoryOption = {
  id: string;
  name: string;
  color?: string | null;
  /**
   * Categorie in cui gli atleti di questa categoria possono essere utilizzati.
   * Viaggia insieme all'opzione perche chi costruisce l'elenco categorie e
   * anche chi poi deve valutare la compatibilita (gruppi numerazione): senza
   * di essa la configurazione andrebbe persa nella normalizzazione.
   * Vedi `@/lib/category-compatibility`.
   */
  compatibleCategoryIds: string[];
  /**
   * **Il posto di questa categoria nell'ordine del club** (D-INT-9).
   *
   * L'ordine con cui una societa pensa alle proprie squadre non e
   * alfabetico: e per eta, o per importanza, o per come sono nate. Prima
   * ogni schermata ordinava per **nome**, quindi «Allievi» veniva prima di
   * «Under 14» e un club che pensa per fasce d'eta rileggeva le proprie
   * squadre mescolate.
   *
   * Non serve una colonna: l'ordine e gia scritto, ed e quello dell'array
   * `clubs.categories`. Quello che mancava era **leggerlo** invece di
   * buttarlo via. Qui viaggia con l'opzione, cosi ogni consumatore ordina
   * allo stesso modo senza doversi ricordare come.
   *
   * Una categoria che il catalogo non conosce — derivata da una scheda, o
   * di un club senza anagrafica — non ha un posto: va in fondo, e li si
   * ordina per nome, che e il ripiego onesto quando non c'e niente da
   * rispettare.
   */
  sortOrder?: number | null;
  /**
   * **Il club l'ha configurata, o esiste solo perche una scheda la cita?**
   * (pilota Fortitudo Scauri).
   *
   * Vero quando questa voce viene da `clubCategories` o `resourceCategories`
   * — l'anagrafica che il club ha scritto. Falso **solo** quando esiste
   * esclusivamente perche l'appartenenza di un atleta porta un riferimento
   * (`category_id`/`category_name`) che il catalogo del club non conosce e
   * che non combacia per nome con nessuna voce configurata: un dato legacy,
   * spesso un'etichetta scritta per errore dove serviva un identificativo
   * (es. `"Pulcini - S. Cosma"`), non una squadra che il club abbia deciso
   * di avere.
   *
   * Questa distinzione esiste **solo** per non far sparire l'atleta da
   * elenchi e report — vedi il commento su `deriveCategoryFromAthlete` — non
   * per offrire la voce come unita operativa selezionabile. Chi costruisce
   * un elenco di **gruppi** da assegnare a un allenamento o a una gara
   * (`buildCategoryGroups`, in `@/lib/club-sites`) scarta le voci con
   * `configured: false` prima di generarne una implicita: altrimenti un
   * riferimento legacy diventerebbe una terza squadra selezionabile,
   * indistinguibile a schermo da quelle vere.
   *
   * Assente (non `false`) per ogni voce costruita fuori da
   * `buildClubCategoryOptions` — test, script, elenchi scritti a mano — che
   * continuano a valere come "configurata", cioe il comportamento di prima.
   */
  configured?: boolean;
  /**
   * **I nomi con cui questa categoria e stata scritta in passato** (ADR-0185).
   *
   * Appresi dalle appartenenze che portano l'identificativo vero **e** un nome
   * diverso da quello corrente: una riga `{ j8liup8, "Pulcini - S. Cosma" }`
   * dice che «Pulcini» si chiamava cosi prima di una rinomina. Un riferimento
   * storico con il solo nome «Pulcini - S. Cosma» nomina allora **lei**, e non
   * diventa una terza voce del catalogo. Evidenza, non identita: nessuno
   * sceglie una categoria da qui, e `resolveCategoryReference` li legge con la
   * stessa regola dei nomi — se ne nomina due, non ne nomina nessuna.
   */
  aliases?: string[];
};

const YEAR_PATTERN = /(\d{4})\D+(\d{4})/;
const normalizeCategoryReference = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();
const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const firstNonEmptyString = (...values: unknown[]) => {
  for (const value of values) {
    const candidate = String(value || "").trim();
    if (candidate) {
      return candidate;
    }
  }

  return "";
};

/**
 * Il posto dichiarato da una categoria, se ce l ha.
 *
 * Le grafie sono tre perche il record arriva da tre strade: la colonna del
 * club, la riga di risorsa con il suo `payload`, e cio che una schermata
 * costruisce a mano.
 *
 * **Esportata perche il posto ha un lettore solo** (D-INT-9). La pagina
 * Categorie — quella in cui il club **decide** l'ordine — ne aveva scritto
 * uno suo, che guardava due grafie su quattro; e il suo modello di vista
 * costruisce un oggetto chiuso in cui `sortOrder` non entrava affatto,
 * quindi dopo un ricaricamento l'ordine appena scelto spariva. Lo stato
 * ottimistico faceva sembrare che funzionasse: il difetto si vedeva solo
 * alla seconda apertura.
 */
export const readCategorySortOrder = (value: Record<string, unknown>): number | null => {
  const grezzo =
    (value as any)?.sortOrder ??
    (value as any)?.sort_order ??
    (value as any)?.payload?.sortOrder ??
    (value as any)?.payload?.sort_order;

  const numero = Number(grezzo);
  return Number.isFinite(numero) ? numero : null;
};

const toCategoryOption = (
  value: Record<string, unknown>,
): NormalizedCategoryOption | null => {
  const id = firstNonEmptyString(
    value.id,
    value.categoryId,
    value.category_id,
    value.value,
    value.code,
  );
  const name = firstNonEmptyString(
    value.name,
    value.label,
    value.categoryName,
    value.category_name,
    value.title,
  );
  const color =
    firstNonEmptyString(
      value.color,
      value.categoryColor,
      value.category_color,
    ) || null;

  if (!id && !name) {
    return null;
  }

  return {
    id: id || name,
    name: name || id || "Categoria",
    color,
    compatibleCategoryIds: readCategoryCompatibilityList(value as any),
    /*
      **Il posto dichiarato vince su quello di fatto** (D-INT-9).

      Una categoria puo portarsi dietro il proprio `sortOrder`: e quello che
      la pagina delle categorie scrive quando qualcuno riordina. Se non ce
      l ha, il posto glielo da la posizione nell array — cioe l ordine di
      creazione, che e cio che il prodotto faceva prima di questa riga e resta
      il ripiego giusto.
    */
    sortOrder: readCategorySortOrder(value),
  };
};

const collectCategoryOptions = (
  source: unknown,
): NormalizedCategoryOption[] => {
  if (Array.isArray(source)) {
    return source.flatMap((entry) => collectCategoryOptions(entry));
  }

  if (typeof source === "string") {
    return source
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => ({
        id: entry,
        name: entry,
        color: null,
        compatibleCategoryIds: [],
        sortOrder: null,
      }));
  }

  if (!isRecord(source)) {
    return [];
  }

  if (isRecord(source.payload)) {
    const payloadCategories = collectCategoryOptions(source.payload);
    if (payloadCategories.length > 0) {
      return payloadCategories;
    }
  }

  const directCategory = toCategoryOption(source);
  if (directCategory) {
    return [directCategory];
  }

  const nestedCandidates = [source.categories, source.category].filter(
    (value) => value !== undefined,
  );

  if (nestedCandidates.length > 0) {
    return nestedCandidates.flatMap((entry) => collectCategoryOptions(entry));
  }

  const mappedCategories = Object.entries(source).flatMap(([key, value]) => {
    const fallbackId = String(key || "").trim();

    if (!fallbackId) {
      return [];
    }

    if (isRecord(value)) {
      return collectCategoryOptions({
        ...value,
        id: value.id || value.categoryId || value.category_id || fallbackId,
      });
    }

    if (typeof value === "string") {
      const name = value.trim();
      return name
        ? [
            {
              id: fallbackId,
              name,
              color: null,
              compatibleCategoryIds: [],
            },
          ]
        : [];
    }

    return [];
  });

  if (mappedCategories.length > 0) {
    return mappedCategories;
  }

  return [];
};

const findCategoryIndex = (
  categories: NormalizedCategoryOption[],
  candidate: NormalizedCategoryOption,
  /**
   * **Da dove viene questa voce.**
   *
   * `configurata` e cio che il club ha scritto nell’anagrafica categorie:
   * e autorita, e due voci configurate con lo stesso nome sono **due**
   * squadre (ADR-0155).
   *
   * `derivata` e cio che si ricava da una scheda atleta. Una scheda che
   * porta un `category_id` che il catalogo non conosce piu — dopo un
   * rinomina, una ricreazione, un import — non e una categoria nuova: e un
   * riferimento vecchio alla stessa. Trattarla come autorita la faceva
   * entrare nel catalogo come **seconda** «Under 15», e da li la regola
   * dell’ambiguita cancellava il nome da tutti e due i lati: quell’atleta
   * spariva da appello, calendario di famiglia, RSVP e report.
   *
   * Misurato da una revisione indipendente sulla remediation stessa: la
   * scheda si avvelenava da sola, perche era lei a produrre l’omonima che
   * poi la escludeva.
   */
  origine: "configurata" | "derivata" = "configurata",
) => {
  const candidateId = normalizeCategoryReference(candidate.id);
  const candidateName = normalizeCategoryReference(candidate.name);

  /*
    **Un'identita vera non si fonde con un'altra identita vera** (ADR-0155).

    Questa funzione esiste per riunire la **stessa** categoria che arriva da
    piu fonti, e alcune di quelle fonti portano solo il nome: quando manca
    l'identificativo, `normalizeCategoryOption` ci mette il nome, e il nome
    diventa l'unica cosa su cui riunirle.

    Il confronto per nome era pero incondizionato, e questo era la fusione di
    P0-4 un piano piu su di dove e stata corretta. Due categorie di un club
    multi-sede che si chiamano tutte e due «Under 15» — con **due
    identificativi veri e diversi** — venivano riunite in una voce sola, e
    l'altra spariva dal catalogo. Da li in giu il danno e doppio, e il secondo
    e peggiore del primo:

    * la difesa di `extractCategoryIdentity` non puo piu accendersi, perche il
      catalogo che riceve non contiene piu due omonime: `perNome.length` vale
      al massimo uno per costruzione;
    * un allenamento che dichiara la categoria **sparita** viene attribuito
      all'altra, perche il suo `category_name` risolve sull'unica voce
      rimasta. Non e piu una fusione: e uno scambio.

    La regola e percio: se tutti e due sanno dire chi sono, si riuniscono solo
    quando lo dicono **allo stesso modo**. Il nome resta l'unica strada quando
    almeno uno dei due non ha un identificativo suo — che e il caso per cui
    questa funzione e nata.
  */
  const candidateHasOwnId = !!candidateId && candidateId !== candidateName;

  return categories.findIndex((category) => {
    const existingId = normalizeCategoryReference(category.id);
    const existingName = normalizeCategoryReference(category.name);
    const existingHasOwnId = !!existingId && existingId !== existingName;

    if (candidateHasOwnId && existingHasOwnId) {
      if (candidateId === existingId) return true;

      /*
        Due identita vere e diverse: sono due squadre, **a meno che** questa
        non venga da una scheda atleta. Un riferimento vecchio si riconosce
        dal nome e si riunisce alla voce configurata che lo porta: non
        entra nel catalogo come seconda omonima, e quindi non rende ambiguo
        il nome per nessuno.
      */
      if (origine !== "derivata") return false;
      return !!candidateName && candidateName === existingName;
    }

    /*
      Una candidata derivata **senza** identificativo suo si riconosce anche
      in un nome storico della voce configurata (ADR-0185): e la riga scritta
      con la sola etichetta di prima della rinomina, non una squadra nuova.
    */
    if (
      origine === "derivata" &&
      !candidateHasOwnId &&
      !!candidateName &&
      (category.aliases || []).some(
        (alias) => normalizeCategoryReference(alias) === candidateName,
      )
    ) {
      return true;
    }

    return (
      (!!candidateId &&
        (candidateId === existingId || candidateId === existingName)) ||
      (!!candidateName &&
        (candidateName === existingId || candidateName === existingName))
    );
  });
};

const mergeCategoryOption = (
  categories: NormalizedCategoryOption[],
  candidate: NormalizedCategoryOption | null,
  origine: "configurata" | "derivata" = "configurata",
) => {
  if (!candidate) {
    return;
  }

  const index = findCategoryIndex(categories, candidate, origine);

  if (index === -1) {
    /*
      Una voce nuova nata da una candidata "derivata" che non ha trovato
      nessuna configurata a cui riunirsi non e mai configurata: esiste solo
      perche una scheda la cita (D-AUD-37/38, pilota Fortitudo Scauri). Vedi
      `configured` sul tipo.
    */
    categories.push({
      ...candidate,
      aliases: [...(candidate.aliases || [])],
      configured: origine === "configurata",
    });
    return;
  }

  const current = categories[index];
  const currentHasDistinctId =
    normalizeCategoryReference(current.id) !==
    normalizeCategoryReference(current.name);
  const candidateHasDistinctId =
    normalizeCategoryReference(candidate.id) !==
    normalizeCategoryReference(candidate.name);

  /*
    **Un nome diverso portato da una voce identificata e un alias, non un
    nome nuovo** (ADR-0185). La voce configurata tiene il proprio nome; il
    nome con cui una riga la cita entra fra gli alias, cosi un riferimento
    storico con quella sola etichetta la ritrova invece di diventare una
    terza voce.
  */
  const aliases = new Set<string>([
    ...(current.aliases || []),
    ...(candidate.aliases || []),
  ]);
  const nomeCorrente = current.name || candidate.name;
  /*
    Un alias che coincide con il nome **corrente** di un'altra voce non si
    apprende: e il presente di quella, non il passato di questa, e renderebbe
    ambiguo un nome che oggi nomina una categoria sola (revisione ostile H2).
  */
  const eIlNomeCorrenteDiUnAltra = (nome: string) =>
    categories.some(
      (voce, indice) =>
        indice !== index &&
        normalizeCategoryReference(voce.name) === normalizeCategoryReference(nome),
    );
  if (
    candidate.name &&
    normalizeCategoryReference(candidate.name) !==
      normalizeCategoryReference(nomeCorrente) &&
    normalizeCategoryReference(candidate.name) !==
      normalizeCategoryReference(current.id) &&
    !eIlNomeCorrenteDiUnAltra(candidate.name)
  ) {
    aliases.add(candidate.name);
  }
  for (const alias of Array.from(aliases)) {
    if (eIlNomeCorrenteDiUnAltra(alias)) aliases.delete(alias);
  }

  categories[index] = {
    /*
      **Una voce derivata non porta il proprio identificativo dentro il
      catalogo.** Se lo facesse, il riferimento vecchio di una scheda
      diventerebbe l’identita della categoria configurata, e ogni altro
      lettore comincerebbe a chiamarla con un nome che il club non ha piu.
    */
    id:
      (origine === "derivata"
        ? (currentHasDistinctId ? current.id : "") ||
          (candidateHasDistinctId ? candidate.id : "")
        : (candidateHasDistinctId ? candidate.id : "") ||
          (currentHasDistinctId ? current.id : "")) ||
      current.id ||
      candidate.id,
    name: current.name || candidate.name || current.id || candidate.id,
    color: current.color ?? candidate.color ?? null,
    // La compatibilita e configurata solo sull'anagrafica categorie: quando la
    // stessa categoria arriva da piu fonti si tiene l'unione, cosi non dipende
    // da quale fonte e stata letta per prima.
    compatibleCategoryIds: Array.from(
      new Set([
        ...(current.compatibleCategoryIds || []),
        ...(candidate.compatibleCategoryIds || []),
      ]),
    ),
    /*
      Il posto lo da il catalogo del club, mai una voce derivata da una
      scheda: quella non sa dove il club voglia vedere la squadra.
    */
    sortOrder:
      typeof current.sortOrder === "number"
        ? current.sortOrder
        : (candidate.sortOrder ?? null),
    /*
      Una volta configurata resta configurata: una fusione "derivata"
      successiva non la retrocede. Assente su `current` conta come
      configurata (ripiego per chi costruisce l'elenco senza questo campo).
    */
    configured: (current.configured ?? true) || origine === "configurata",
    aliases: Array.from(aliases),
  };
};

const deriveCategoryFromAthlete = (
  athlete: unknown,
): NormalizedCategoryOption | null => {
  const primaryMembership = getPrimaryAthleteCategoryMembership(athlete);
  if (primaryMembership) {
    return {
      id: primaryMembership.categoryId,
      name: primaryMembership.categoryName,
      color: null,
      compatibleCategoryIds: [],
    };
  }

  if (!isRecord(athlete)) {
    return null;
  }

  const data = isRecord(athlete.data) ? athlete.data : {};
  const id = firstNonEmptyString(
    athlete.category_id,
    data.category_id,
    data.categoryId,
  );
  const name = firstNonEmptyString(
    athlete.category_name,
    data.category_name,
    data.categoryName,
  );
  const fallback = firstNonEmptyString(athlete.category, data.category, name, id);

  if (!id && !name && !fallback) {
    return null;
  }

  return {
    id: id || fallback || name,
    name: name || fallback || id || "Categoria",
    color: null,
    compatibleCategoryIds: [],
  };
};

/**
 * **L'ordine canonico delle categorie** (D-INT-9).
 *
 * Prima il posto che il club ha dato loro, poi — solo per chi un posto non
 * ce l'ha — il nome. Il nome resta l'ultimo criterio e non il primo: e la
 * differenza fra rispettare una scelta e imporne una.
 *
 * Chi non ha un posto va **in fondo**, e non in mezzo: sono le categorie
 * che il catalogo del club non conosce, e metterle fra le altre
 * suggerirebbe che il club le abbia ordinate cosi.
 */
const sortCategoryOptions = (categories: NormalizedCategoryOption[]) =>
  categories.slice().sort((left, right) => {
    const sinistra =
      typeof left.sortOrder === "number" ? left.sortOrder : Number.MAX_SAFE_INTEGER;
    const destra =
      typeof right.sortOrder === "number" ? right.sortOrder : Number.MAX_SAFE_INTEGER;

    if (sinistra !== destra) return sinistra - destra;

    return (
      left.name.localeCompare(right.name, "it", { sensitivity: "base" }) ||
      left.id.localeCompare(right.id, "it", { sensitivity: "base" })
    );
  });

const getCategoryReferences = (
  category: Pick<CategoryLike, "id" | "name"> | string | null | undefined,
) =>
  (typeof category === "string"
    ? [category]
    : [category?.id, category?.name]
  )
    .map(normalizeCategoryReference)
    .filter(Boolean);

const getAthleteCategoryReferences = (athlete: unknown) => {
  const membershipReferences = getNormalizedAthleteCategoryReferences(athlete);
  if (membershipReferences.length > 0) {
    return membershipReferences;
  }

  if (!isRecord(athlete)) {
    return [];
  }

  const data = isRecord(athlete.data) ? athlete.data : {};

  return [
    athlete.category_id,
    athlete.category_name,
    athlete.category,
    data.category_id,
    data.categoryId,
    data.category_name,
    data.categoryName,
    data.category,
  ]
    .map(normalizeCategoryReference)
    .filter(Boolean);
};

export function buildClubCategoryOptions({
  clubCategories = [],
  resourceCategories = [],
  athletes = [],
}: {
  clubCategories?: unknown;
  resourceCategories?: unknown;
  athletes?: unknown;
}): NormalizedCategoryOption[] {
  const merged: NormalizedCategoryOption[] = [];

  /*
    **L'ordine e quello dell'array, e si legge qui** (D-INT-9).

    `clubs.categories` e gia una sequenza, e la sequenza e la scelta del
    club. Il posto si assegna mentre si raccoglie, perche dopo la fusione
    l'informazione da quale posizione veniva una voce non c'e piu.
  */
  let posto = 0;
  [clubCategories, resourceCategories].forEach((source) => {
    collectCategoryOptions(source).forEach((category) => {
      mergeCategoryOption(merged, {
        ...category,
        sortOrder:
          typeof category.sortOrder === "number" ? category.sortOrder : posto,
      });
      posto += 1;
    });
  });

  /*
    **Un club senza anagrafica ha per catalogo i nomi che usa** (revisione
    ostile H1). Se nessuna sorgente configurata ha prodotto una voce, le voci
    derivate dalle schede sono l'unico catalogo che esiste: marcarle
    `configured: false` le toglierebbe da ogni selettore e il club non
    potrebbe piu assegnare una categoria a nessuno. La distinzione serve a
    non far passare un'etichetta storica per una squadra **accanto** a quelle
    vere, non a spegnere un club che le squadre le ha solo per nome.
  */
  const origineDerivata: "configurata" | "derivata" =
    merged.length === 0 ? "configurata" : "derivata";

  if (Array.isArray(athletes)) {
    /*
      **Prima chi sa dire chi e, poi chi porta solo un nome** (ADR-0185).

      Le voci derivate si fondono in due passate perche l'ordine degli atleti
      in archivio non e un fatto del dominio. Una riga identificata insegna
      un alias («j8liup8 si chiamava "Pulcini - S. Cosma"»); una riga con il
      solo nome «Pulcini - S. Cosma» deve trovarlo gia appreso, o diventa una
      terza voce a seconda di quale atleta si legge per primo.
    */
    const candidate: NormalizedCategoryOption[] = [];
    athletes.forEach((athlete) => {
      normalizeAthleteCategoryMemberships(athlete).forEach((membership) =>
        candidate.push({
          id: membership.categoryId,
          name: membership.categoryName,
          color: null,
          compatibleCategoryIds: [],
          aliases: membership.storedCategoryName
            ? [membership.storedCategoryName]
            : [],
        }),
      );

      const derivata = deriveCategoryFromAthlete(athlete);
      if (derivata) candidate.push(derivata);
    });

    const conIdentificativo = (voce: NormalizedCategoryOption) =>
      normalizeCategoryReference(voce.id) !== normalizeCategoryReference(voce.name);

    candidate
      .filter(conIdentificativo)
      .forEach((voce) => mergeCategoryOption(merged, voce, origineDerivata));
    candidate
      .filter((voce) => !conIdentificativo(voce))
      .forEach((voce) => mergeCategoryOption(merged, voce, origineDerivata));
  }

  return sortCategoryOptions(merged);
}

/**
 * **Le categorie fra cui si puo scegliere** (ADR-0185).
 *
 * `buildClubCategoryOptions` tiene anche le voci nate **solo** perche una
 * scheda le cita (`configured: false`): servono a non far sparire quell'atleta
 * da elenchi e report, non a offrire la voce come squadra. Ogni selettore —
 * la primaria e le secondarie della scheda atleta, il cambio categoria in
 * blocco, i filtri che scrivono — passa da qui: un'etichetta storica non e
 * un'opzione, e offrirla creerebbe la terza «Pulcini» che il club non ha.
 *
 * E la stessa regola con cui `buildCategoryGroups` non promuove una voce
 * derivata a gruppo implicito, applicata al lato che sceglie.
 */
export const selectableCategoryOptions = <
  T extends { configured?: boolean | null },
>(
  options: readonly T[],
): T[] =>
  (Array.isArray(options) ? options : []).filter(
    (option) => option?.configured !== false,
  );

/**
 * **Questo atleta e di questa categoria?**
 *
 * ---
 *
 * ## La correzione (D-INT-2, ADR-0155)
 *
 * Qui c'era la seconda delle due risposte canoniche alla stessa domanda, e
 * faceva la stessa cosa nello stesso modo sbagliato dell'altra: metteva
 * l'identificativo di una categoria e la sua **etichetta** nello stesso elenco
 * — su tutti e due i lati — e intersecava. Con due categorie omonime su due
 * sedi l'intersezione e non vuota, e le due squadre diventavano una.
 *
 * Adesso delega alla primitiva del dominio. Le due risposte canoniche sono
 * **una**, e le regole stanno li (`src/lib/categories/identity.ts`).
 *
 * ## Il `catalog`, e perche e opzionale
 *
 * Disambiguare due omonime si puo solo con il catalogo del club in mano: senza,
 * «Under 15» e una parola e basta. Il parametro e in coda e ha un valore
 * predefinito perche i chiamanti sono quattordici e non tutti hanno il
 * catalogo a portata — e chi non ce l'ha continua a funzionare **esattamente
 * come prima**, sul ripiego per nome.
 *
 * Non e un compromesso mascherato: senza catalogo l'ambiguita non e
 * conoscibile, e fingere di risolverla sarebbe peggio che ripiegare. Chi
 * distingue due sedi il catalogo lo passa, e `scripts/censimento-eleggibilita.mjs`
 * dice chi ancora non lo fa.
 */
export const athleteMatchesCategory = (
  athlete: unknown,
  category: Pick<CategoryLike, "id" | "name"> | string | null | undefined,
  catalog: readonly CategoryCatalogEntry[] = [],
) => sameCategory(athlete, category, catalog);

export const athleteMatchesAnyCategory = (
  athlete: unknown,
  categories: Array<Pick<CategoryLike, "id" | "name"> | string> = [],
  catalog: readonly CategoryCatalogEntry[] = [],
) => sameAnyCategory(athlete, categories, catalog);

const toNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const normalizeCategoryBirthYears = (category: CategoryLike) => {
  let birthYearFrom =
    toNumber(category.birthYearFrom) ?? toNumber(category.birth_year_from);
  let birthYearTo =
    toNumber(category.birthYearTo) ?? toNumber(category.birth_year_to);

  if (
    (birthYearFrom === undefined || birthYearTo === undefined) &&
    typeof category.ageRange === "string"
  ) {
    const match = category.ageRange.match(YEAR_PATTERN);
    if (match) {
      birthYearFrom = birthYearFrom ?? Number(match[1]);
      birthYearTo = birthYearTo ?? Number(match[2]);
    }
  }

  // Una categoria puo coprire un solo anno di nascita: il secondo anno e
  // opzionale e, quando manca, coincide con il primo. Cosi «2015» e una
  // categoria valida e non un intervallo aperto.
  if (birthYearFrom !== undefined && birthYearTo === undefined) {
    birthYearTo = birthYearFrom;
  } else if (birthYearTo !== undefined && birthYearFrom === undefined) {
    birthYearFrom = birthYearTo;
  }

  if (
    birthYearFrom !== undefined &&
    birthYearTo !== undefined &&
    birthYearFrom > birthYearTo
  ) {
    return {
      birthYearFrom: birthYearTo,
      birthYearTo: birthYearFrom,
    };
  }

  return {
    birthYearFrom,
    birthYearTo,
  };
};

export const formatCategoryBirthYears = (category: CategoryLike) => {
  const { birthYearFrom, birthYearTo } = normalizeCategoryBirthYears(category);

  if (birthYearFrom !== undefined && birthYearTo !== undefined) {
    if (birthYearFrom === birthYearTo) {
      return `Nati nel ${birthYearFrom}`;
    }

    return `Nati dal ${birthYearFrom} al ${birthYearTo}`;
  }

  // Non esiste il caso «solo uno dei due anni»: `normalizeCategoryBirthYears`
  // completa l'anno mancante con quello presente.

  if (typeof category.ageRange === "string" && category.ageRange.trim()) {
    return category.ageRange.trim();
  }

  return "Anni di nascita non definiti";
};

export const resolveCategoryId = (raw: unknown, categories: CategoryLike[]) => {
  if (!raw) return null;

  const value = String(raw).trim();
  if (!value) return null;

  const byId = categories.find((category) => String(category?.id || "") === value);
  if (byId?.id) {
    return String(byId.id);
  }

  /*
    **Un nome che ne nomina due non ne nomina nessuna** (P0-4, Fortitudo).

    Qui c'era `find`, che prende la **prima**. Un club con due categorie che si
    chiamano tutte e due «Under 15» — una a Scauri, una a Formia, che e la
    configurazione ordinaria di una societa multi-sede — vedeva quindi ogni
    riferimento per nome cadere sempre sulla stessa, in silenzio: le due
    squadre si fondevano, e l'allenatore della seconda si trovava davanti gli
    atleti della prima.

    Il nome non e un identificativo, e quando ne nomina piu di una la risposta
    onesta non e «la prima»: e «non lo so». Si restituisce il valore com'e, che
    non e l'identificativo di nessuna categoria e percio non ne apre nessuna.
    Chi deve distinguerle passa l'identificativo, ed e cio che ogni scrittura
    recente gia fa.
  */
  const perNome = categories.filter(
    (category) => String(category?.name || "").trim() === value,
  );
  if (perNome.length === 1 && perNome[0]?.id) {
    return String(perNome[0].id);
  }

  return value;
};

export const resolveCategoryLabel = (raw: unknown, categories: CategoryLike[]) => {
  if (!raw) return "Senza categoria";

  const value = String(raw).trim();
  if (!value) return "Senza categoria";

  const byId = categories.find((category) => String(category?.id || "") === value);
  if (byId?.name) {
    return String(byId.name);
  }

  const byName = categories.find(
    (category) => String(category?.name || "").trim() === value,
  );
  if (byName?.name) {
    return String(byName.name);
  }

  return value;
};

export const findCategoryForBirthDate = (
  birthDate: string | null | undefined,
  categories: CategoryLike[],
) => {
  if (!birthDate) {
    return null;
  }

  const birthYear = new Date(birthDate).getFullYear();
  if (!Number.isFinite(birthYear)) {
    return null;
  }

  const matches = categories
    .map((category) => ({
      category,
      ...normalizeCategoryBirthYears(category),
    }))
    .filter(
      ({ birthYearFrom, birthYearTo }) =>
        birthYearFrom !== undefined &&
        birthYearTo !== undefined &&
        birthYear >= birthYearFrom &&
        birthYear <= birthYearTo,
    )
    .sort((left, right) => {
      const leftRange =
        (left.birthYearTo as number) - (left.birthYearFrom as number);
      const rightRange =
        (right.birthYearTo as number) - (right.birthYearFrom as number);

      if (leftRange !== rightRange) {
        return leftRange - rightRange;
      }

      return (right.birthYearFrom as number) - (left.birthYearFrom as number);
    });

  /*
    **Due categorie con la stessa fascia d'eta sono due squadre, non una**
    (D-RD-17 b). Due «Pulcini» su due sedi hanno gli stessi anni di nascita:
    prendere la prima assegnava ogni bambino importato senza etichetta alla
    stessa sede, in silenzio. Se la fascia piu stretta e contesa, la data di
    nascita non decide, e si risponde «non lo so».
  */
  const [prima, seconda] = matches;
  if (
    prima &&
    seconda &&
    prima.birthYearFrom === seconda.birthYearFrom &&
    prima.birthYearTo === seconda.birthYearTo
  ) {
    return null;
  }

  return prima?.category || null;
};
