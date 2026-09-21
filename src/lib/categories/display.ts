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
 * Questo e quel punto. Lo consumano la Web corrente e il redesign V2 **con lo
 * stesso indice**: la presentazione puo cambiare, la semantica no (ADR-0185).
 *
 * ## La regola
 *
 * 1. **L'identita resta l'identificativo.** Questo modulo produce *etichette*.
 *    Nessuno sceglie, filtra o confronta una categoria da cio che esce di qui:
 *    l'etichetta serve a leggerla, non a riconoscerla. Chi confronta passa da
 *    `sameCategory`; chi risolve, da `resolveCategoryReference`.
 *
 * 2. **La sede si accosta solo quando serve.** Accostarla sempre —
 *    «Pulcini · Roma» in un club che ha una sede sola — e rumore su ogni riga
 *    di ogni schermata per un'ambiguita che non esiste. L'ambiguita si calcola
 *    dove si disegna, cioe qui, e sull'insieme che si sta mostrando.
 *
 * 3. **Se la sede non distingue, non si scrive.** Due omonime che vivono nella
 *    stessa sede, o una categoria che gira su due sedi, non si separano con la
 *    sede: aggiungerla darebbe due scritte ancora uguali, oppure una scritta
 *    falsa. In quel caso l'etichetta resta il nome nudo, e a distinguere ci
 *    pensa cio che la schermata ha gia (l'ordine, il gruppo, la fascia d'eta).
 *
 * 4. **La sede si scrive con il suo nome, mai con il suo identificativo.**
 *    Un `siteId` e un fatto dell'archivio, non un'etichetta: si risolve sul
 *    catalogo delle sedi (`sites`) o sul `siteName` che il gruppo gia porta.
 *    Se non si risolve, a schermo va `UNKNOWN_SITE_LABEL` — e **solo** quando
 *    la sede serviva a distinguere: altrimenti il nome nudo basta. Qui c'era
 *    `nomi.get(siteId) || siteId`, e la scheda atleta scriveva
 *    «Pulcini (site-1787776326508-a61cb7)» a ogni club con due Pulcini.
 *
 * ## Cosa non fa
 *
 * Non conosce le appartenenze di un atleta, non decide eleggibilita e non
 * ordina niente: l'ordine canonico e `sortCategoryOptions` (D-INT-9). Non
 * sostituisce `buildCategoryGroupLabel`, che scrive il **gruppo operativo**
 * (`Pulcini · Roma`) — li la sede fa parte del nome della cosa, sempre, perche
 * il gruppo *e* la coppia (ADR-0038). Qui la sede e una disambiguazione, e
 * compare solo dove il nome da solo non basta. Il separatore e lo stesso,
 * perche a schermo «Pulcini · Scauri» deve leggersi allo stesso modo da
 * qualunque parte arrivi.
 */

import { normalizeCategoryToken } from "@/lib/categories/identity";
import { formatCategoryBirthYearRange } from "@/lib/category-utils";

/** Separatore fra categoria e sede: `Pulcini · Scauri`. Unico per tutto il prodotto. */
export const CATEGORY_SITE_SEPARATOR = " · ";

/**
 * L'etichetta di una sede che l'archivio cita ma il catalogo non conosce.
 *
 * Diversa da `UNASSIGNED_SITE_LABEL` («Sede non assegnata», `club-sites`):
 * li la sede manca, qui c'e un riferimento che non si sa leggere. Un
 * identificativo tecnico a schermo non e un'etichetta: e un difetto che si
 * legge. Compare solo dove la sede serviva a distinguere due omonime.
 */
export const UNKNOWN_SITE_LABEL = "Sede non disponibile";

/**
 * L'etichetta di una categoria che il catalogo **non conosce** quando il
 * catalogo c'e (D-RD-17 a).
 *
 * Con un catalogo in mano un riferimento sconosciuto e un identificativo
 * stantio — una categoria tolta, una colonna mai bonificata — e scriverlo
 * com'e mette `category-1757…` a schermo. Senza catalogo non si distingue un
 * nome da un identificativo, e il riferimento resta com'e: e il club che
 * lavora con i soli nomi. Se il chiamante ha un **nome** da leggere, quello
 * vince sempre: e un'etichetta, non un identificativo.
 */
export const UNKNOWN_CATEGORY_LABEL = "Categoria non disponibile";

/**
 * Il ruolo di un'appartenenza, per chi lo scrive accanto alla categoria.
 *
 * Non passa per `CATEGORY_SITE_SEPARATOR`: «Pulcini · Scauri · Primaria»
 * fa leggere il ruolo come una terza sede (D-RD-17 c). Il ruolo e un dato
 * dell'appartenenza, non della categoria, e sta in un elemento suo.
 */
export const MEMBERSHIP_ROLE_LABELS = Object.freeze({
  primary: "Primaria",
  secondary: "Secondaria",
});

export const membershipRoleLabel = (isPrimary: boolean) =>
  isPrimary ? MEMBERSHIP_ROLE_LABELS.primary : MEMBERSHIP_ROLE_LABELS.secondary;

export type CategoryDisplayEntry = {
  id?: string | null;
  name?: string | null;
  ageRange?: string | null;
  birthYearFrom?: number | string | null;
  birthYearTo?: number | string | null;
  birth_year_from?: number | string | null;
  birth_year_to?: number | string | null;
};

export type CategoryGroupLike = {
  categoryId?: string | null;
  siteId?: string | null;
  siteName?: string | null;
  active?: boolean;
};

/** Una voce del catalogo sedi: basta id e nome, `ClubSite` va bene com'e. */
export type SiteDisplayEntry = {
  id?: string | null;
  name?: string | null;
};

export type CategoryDisplay = {
  /** L'identificativo: l'unica cosa con cui si sceglie. */
  readonly id: string;
  /** Il nome della categoria, nudo. */
  readonly name: string;
  /** La sede, valorizzata **solo** quando serve a distinguere due omonime. Mai un identificativo. */
  readonly site: string;
  /** `Under 15 · Formia` quando serve, `Under 15` quando non serve. */
  readonly label: string;
  /** Vero quando il nome, da solo, ne nomina piu di una. */
  readonly ambiguous: boolean;
  /** `2016-2017`, o `2017` se coincidono; vuota se la categoria non le porta. */
  readonly birthYears: string;
  /**
   * L'etichetta per un menu di **selezione**: `label` con le annate fra
   * parentesi quando ci sono — `Pulcini · Scauri (2016-2017)`. Mai una
   * parentesi vuota: se `birthYears` e vuota, `optionLabel === label`
   * (mandato multi-stagione A1/A2).
   */
  readonly optionLabel: string;
};

export type CategoryDisplayIndex = {
  readonly describe: (reference: unknown) => CategoryDisplay;
  readonly label: (reference: unknown) => string;
  /** L'etichetta di selezione con le annate — vedi `CategoryDisplay.optionLabel`. */
  readonly optionLabel: (reference: unknown) => string;
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
 *
 * Il nome della sede si legge dal catalogo `sites` quando c'e, altrimenti dal
 * `siteName` che il gruppo porta (e cio che `buildCategoryGroups` produce).
 * Un gruppo letto grezzo dall'archivio — `clubs.category_groups` porta solo
 * `siteId` — senza catalogo sedi non ha un nome da mostrare: la sede resta
 * **nota per identita** (serve a contare le omonime per sede) ma **senza
 * etichetta**, e a schermo va `UNKNOWN_SITE_LABEL`, mai il `siteId`.
 */
const sedePerCategoria = (
  groups: readonly CategoryGroupLike[],
  sites: readonly SiteDisplayEntry[],
) => {
  const perCategoria = new Map<string, Set<string>>();
  const nomi = new Map<string, string>();

  for (const site of Array.isArray(sites) ? sites : []) {
    const siteId = trim(site?.id);
    const siteName = trim(site?.name);
    if (siteId && siteName) nomi.set(siteId, siteName);
  }

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

  return (categoryId: string): { siteId: string; siteName: string } => {
    const sedi = perCategoria.get(normalizeCategoryToken(categoryId));
    /*
      Zero sedi: la categoria non e su nessun gruppo, non c'e niente da
      accostare. Due o piu: gira su piu sedi, e nominarne una sarebbe falso.
    */
    if (!sedi || sedi.size !== 1) return { siteId: "", siteName: "" };

    const [siteId] = Array.from(sedi);
    return { siteId, siteName: nomi.get(siteId) || "" };
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
  sites = [],
}: {
  categories?: readonly CategoryDisplayEntry[];
  groups?: readonly CategoryGroupLike[];
  /** Il catalogo sedi del club: risolve i `siteId` dei gruppi letti grezzi. */
  sites?: readonly SiteDisplayEntry[];
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

  const sedeDi = sedePerCategoria(groups, sites);

  const perId = new Map<string, CategoryDisplayEntry>();
  for (const voce of voci) {
    perId.set(normalizeCategoryToken(voce.id), voce);
  }

  /*
    **Una sede si accosta solo se distingue davvero.**

    Non basta che la categoria ne abbia una sola: deve essere una sola **e non
    di qualcun altro con lo stesso nome**. Due «Under 15» che vivono tutte e due
    a Roma, scritte «Under 15 · Roma» due volte, sono ancora due voci identiche
    — con in piu la promessa implicita di essere state disambiguate, che e
    peggio del nome nudo perche invita a fidarsi.

    Si conta quindi quante omonime rivendicano ciascuna sede — per
    **identificativo** di sede, non per nome: due sedi omonime sono due sedi —
    e l'etichetta si accosta solo dove quel conto fa uno.
  */
  const quanteOmonimeInQuestaSede = new Map<string, number>();
  for (const voce of voci) {
    const nome = normalizeCategoryToken(voce?.name);
    if (!nome || (quanteConQuestoNome.get(nome) || 0) < 2) continue;

    const { siteId } = sedeDi(trim(voce.id));
    if (!siteId) continue;

    const chiave = `${nome}::${siteId}`;
    quanteOmonimeInQuestaSede.set(
      chiave,
      (quanteOmonimeInQuestaSede.get(chiave) || 0) + 1,
    );
  }

  const sedeCheDistingue = (id: string, name: string) => {
    const { siteId, siteName } = sedeDi(id);
    if (!siteId) return "";

    const chiave = `${normalizeCategoryToken(name)}::${siteId}`;
    if ((quanteOmonimeInQuestaSede.get(chiave) || 0) !== 1) return "";

    /*
      La sede distingue, ma non ha un nome che si sappia leggere: si dice
      che manca, non si scrive l'identificativo (regola 4).
    */
    return siteName || UNKNOWN_SITE_LABEL;
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

    const nomeDato = trim(
      typeof reference === "object" && reference
        ? (reference as any).categoryName ??
            (reference as any).category_name ??
            (reference as any).name
        : "",
    );
    /*
      **Un nome uguale al riferimento non e un nome** (revisione ostile A2):
      il normalizzatore, senza catalogo, mette l'identificativo anche in
      `categoryName`; letto come nome, un `category-1757…` uscirebbe a
      schermo dalla porta di servizio. Se il nome dato e a sua volta un
      identificativo del catalogo, si risolve come tale.
    */
    const perLeggere =
      nomeDato && normalizeCategoryToken(nomeDato) === normalizeCategoryToken(perCercare)
        ? ""
        : nomeDato;

    const grezzo = perCercare || perLeggere;
    const voce =
      perId.get(normalizeCategoryToken(perCercare)) ||
      (!perCercare ? perId.get(normalizeCategoryToken(perLeggere)) : undefined);

    if (!voce) {
      /*
        Il catalogo non lo conosce: si mostra il **nome** se il chiamante ce
        l'ha. Senza un nome, il valore com'e **solo** quando il catalogo e
        vuoto — il club che non ha mai aperto la pagina delle categorie; con
        il catalogo in mano un riferimento che nessuna voce riconosce e un
        identificativo, e a schermo va `UNKNOWN_CATEGORY_LABEL`, non
        `category-1757…` (D-RD-17 a). Nessuna sede da accostare, perche non
        si sa a quale categoria appartenga.
      */
      const etichetta =
        perLeggere || (voci.length ? UNKNOWN_CATEGORY_LABEL : grezzo);

      return {
        id: grezzo,
        name: etichetta,
        site: "",
        label: etichetta,
        ambiguous: false,
        birthYears: "",
        optionLabel: etichetta,
      };
    }

    const id = trim(voce.id);
    const name = trim(voce.name) || id;
    const ambiguous = (quanteConQuestoNome.get(normalizeCategoryToken(name)) || 0) > 1;
    const site = ambiguous ? sedeCheDistingue(id, name) : "";
    const label = site ? `${name}${CATEGORY_SITE_SEPARATOR}${site}` : name;
    const birthYears = formatCategoryBirthYearRange(voce as any);

    return {
      id,
      name,
      site,
      label,
      ambiguous,
      birthYears,
      optionLabel: birthYears ? `${label} (${birthYears})` : label,
    };
  };

  const hasHomonyms = Array.from(quanteConQuestoNome.values()).some(
    (quante) => quante > 1,
  );

  return {
    describe,
    label: (reference: unknown) => describe(reference).label,
    optionLabel: (reference: unknown) => describe(reference).optionLabel,
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
    sites?: readonly SiteDisplayEntry[];
  } = {},
): CategoryDisplay => buildCategoryDisplayIndex(options).describe(reference);
