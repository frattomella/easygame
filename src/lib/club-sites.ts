/**
 * Sedi, strutture e gruppi operativi.
 *
 * ## Il problema
 *
 * Lo stesso club svolge la **stessa** categoria in luoghi diversi: i Pulcini
 * si allenano a Roma e ad Aprilia. Finora l'unico modo di dirlo era duplicare
 * la categoria — `Pulcini - Roma`, `Pulcini - Aprilia` — e quella duplicazione
 * si porta dietro tutto il resto: due fasce d'anno da tenere allineate a mano,
 * due compatibilita da configurare due volte, due righe in ogni elenco che
 * ragiona per categoria, e un atleta che «cambia categoria» quando in realta
 * ha solo cambiato citta.
 *
 * ## Il modello (ADR-0038)
 *
 * Quattro concetti distinti, ognuno con una domanda sola a cui risponde:
 *
 * | Concetto | Domanda | Dove vive |
 * |---|---|---|
 * | **Categoria** | in che fascia gioca? | `categories` (invariata) |
 * | **Sede** | in che citta opera il club? | `club_sites` |
 * | **Struttura** | in che impianto? | `structures.siteId` |
 * | **Gruppo operativo** | quale squadra concreta? | `category_groups` |
 *
 * Un gruppo operativo e la coppia **(categoria, sede)**: `Pulcini` a `Roma`.
 * Non e una categoria e non ne crea una: la categoria resta una sola, con una
 * sola fascia d'anno e una sola configurazione di compatibilita.
 *
 * ## Tre proprieta volute
 *
 * 1. **niente deduzione dal nome.** Una sede non si riconosce dal suffisso di
 *    una categoria. `Pulcini - Scauri` resta una categoria che si chiama cosi,
 *    e il collegamento a una sede esiste solo se qualcuno lo configura. E la
 *    stessa scelta di ADR-0030 per la compatibilita, e per la stessa ragione:
 *    i nomi reali non sono parsabili;
 * 2. **il club mono-sede non paga niente.** Con zero o una sede configurata
 *    `isMultiSiteClub` e falsa, i gruppi restano impliciti (uno per categoria)
 *    e nessuna interfaccia mostra un filtro sede. Chi non ha il problema non
 *    vede la soluzione;
 * 3. **il dato storico non sparisce.** Un atleta, una struttura o un gruppo
 *    senza sede appartiene a **tutte** le sedi, non a nessuna: filtrare per
 *    sede non deve far scomparire cio che e stato creato prima che le sedi
 *    esistessero.
 */

import {
  normalizeAthleteCategoryMemberships,
  type AthleteCategoryMembership,
} from "./athlete-category-memberships";

export type ClubSite = {
  id: string;
  name: string;
  city: string;
  address: string;
  notes: string;
  active: boolean;
  raw?: any;
};

export type CategoryGroup = {
  id: string;
  /** Etichetta mostrata: `Pulcini · Roma`. Derivata se non configurata. */
  name: string;
  categoryId: string;
  categoryName: string;
  siteId: string;
  siteName: string;
  /** Impianto abituale del gruppo, se il club lo ha indicato. */
  structureId: string | null;
  notes: string;
  active: boolean;
  /** Vero quando il gruppo non e configurato ma dedotto dalla sola categoria. */
  implicit: boolean;
  raw?: any;
};

export type SiteIndex = {
  sites: ClubSite[];
  /** Risolve un riferimento (id o nome, qualunque maiuscola) nell'id reale. */
  resolveSiteId: (reference: unknown) => string;
  /** Nome leggibile di una sede, o il riferimento stesso se sconosciuta. */
  getSiteName: (reference: unknown) => string;
  has: (reference: unknown) => boolean;
};

/** Separatore fra categoria e sede: `Pulcini · Roma`. */
export const CATEGORY_GROUP_SEPARATOR = " · ";

/**
 * L'etichetta della sede di chi non ne ha una.
 *
 * Non e «nessuna sede»: e un dato precedente alle sedi, o un'iscrizione che
 * nessuno ha ancora collocato. Deve restare **visibile** — un elenco che lo
 * nasconde fa sparire atleti veri — e deve restare **distinto**, perche
 * metterlo dentro una sede a caso sarebbe un'invenzione (ADR-0055).
 */
export const UNASSIGNED_SITE_LABEL = "Sede non assegnata";

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const trimText = (value: unknown) => String(value ?? "").trim();

const normalizeReference = (value: unknown) => trimText(value).toLowerCase();

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = trimText(value);
    if (text) return text;
  }

  return "";
};

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);

export const normalizeClubSite = (site: any): ClubSite | null => {
  const id = firstText(site?.id, site?.siteId, site?.site_id, site?.code);
  const name = firstText(site?.name, site?.label, site?.title, site?.city);

  if (!id && !name) {
    return null;
  }

  return {
    id: id || name,
    name: name || id,
    city: firstText(site?.city, site?.comune, site?.location),
    address: firstText(site?.address, site?.indirizzo),
    notes: firstText(site?.notes, site?.note),
    active: site?.active === false ? false : true,
    raw: site,
  };
};

/**
 * Elenco sedi normalizzato, deduplicato per id **e** per nome: le due forme
 * convivono nei dati storici e una sede scritta due volte diventerebbe due
 * filtri identici.
 */
export const normalizeClubSites = (sites: unknown): ClubSite[] => {
  const byId = new Map<string, ClubSite>();
  const seenNames = new Set<string>();

  asArray(sites).forEach((entry) => {
    const site = normalizeClubSite(entry);
    if (!site) return;

    const idKey = normalizeReference(site.id);
    const nameKey = normalizeReference(site.name);

    if (byId.has(idKey)) {
      byId.set(idKey, site);
      return;
    }

    if (nameKey && seenNames.has(nameKey)) {
      return;
    }

    if (nameKey) seenNames.add(nameKey);
    byId.set(idKey, site);
  });

  return Array.from(byId.values()).sort((left, right) =>
    left.name.localeCompare(right.name, "it", { sensitivity: "base" }),
  );
};

export const serializeClubSite = (site: ClubSite) => ({
  ...(isRecord(site.raw) ? site.raw : {}),
  id: site.id,
  name: site.name,
  city: site.city,
  address: site.address,
  notes: site.notes,
  active: site.active,
});

export const getActiveClubSites = (sites: readonly ClubSite[]) =>
  sites.filter((site) => site.active);

/**
 * Un club e multi-sede quando ha **almeno due sedi attive**. Con una sola sede
 * il concetto non aggiunge informazione: tutto sta li.
 */
export const isMultiSiteClub = (sites: readonly ClubSite[]) =>
  getActiveClubSites(sites).length >= 2;

export const buildSiteIndex = (sites: readonly ClubSite[]): SiteIndex => {
  const idByReference = new Map<string, string>();
  const nameById = new Map<string, string>();

  sites.forEach((site) => {
    if (site.id) idByReference.set(normalizeReference(site.id), site.id);
    if (site.name) idByReference.set(normalizeReference(site.name), site.id);
    nameById.set(site.id, site.name || site.id);
  });

  const resolveSiteId = (reference: unknown) => {
    const text = trimText(reference);
    if (!text) return "";
    return idByReference.get(normalizeReference(text)) || text;
  };

  return {
    sites: [...sites],
    resolveSiteId,
    getSiteName: (reference: unknown) => {
      const id = resolveSiteId(reference);
      return nameById.get(id) || id;
    },
    has: (reference: unknown) => {
      const text = trimText(reference);
      return Boolean(text) && idByReference.has(normalizeReference(text));
    },
  };
};

/** Legge il riferimento sede di un record qualunque, nelle forme che i dati usano. */
export const readSiteReference = (record: unknown): string => {
  if (!isRecord(record)) {
    return "";
  }

  return firstText(
    record.siteId,
    record.site_id,
    record.sedeId,
    record.sede_id,
    isRecord(record.site) ? record.site.id || record.site.name : record.site,
    isRecord(record.payload)
      ? firstText(record.payload.siteId, record.payload.site_id)
      : "",
  );
};

export const buildCategoryGroupLabel = (
  categoryName: unknown,
  siteName: unknown,
) => {
  const category = trimText(categoryName) || "Categoria";
  const site = trimText(siteName);
  return site ? `${category}${CATEGORY_GROUP_SEPARATOR}${site}` : category;
};

export const buildCategoryGroupId = (categoryId: string, siteId: string) =>
  siteId ? `group:${categoryId}:${siteId}` : `group:${categoryId}`;

type CategoryLike = { id?: string | null; name?: string | null };

const buildCategoryLookup = (categories: readonly CategoryLike[]) => {
  const byReference = new Map<string, { id: string; name: string }>();

  categories.forEach((category) => {
    const id = trimText(category?.id);
    const name = trimText(category?.name);
    const identity = { id: id || name, name: name || id };
    if (!identity.id) return;

    if (id) byReference.set(normalizeReference(id), identity);
    if (name) byReference.set(normalizeReference(name), identity);
  });

  return byReference;
};

export const normalizeCategoryGroup = (
  group: any,
  {
    categories = [],
    siteIndex,
  }: {
    categories?: readonly CategoryLike[];
    siteIndex: SiteIndex;
  },
): CategoryGroup | null => {
  const categoryReference = firstText(
    group?.categoryId,
    group?.category_id,
    group?.category,
  );
  if (!categoryReference) {
    return null;
  }

  const lookup = buildCategoryLookup(categories);
  const identity = lookup.get(normalizeReference(categoryReference)) || {
    id: categoryReference,
    name: firstText(
      group?.categoryName,
      group?.category_name,
      categoryReference,
    ),
  };
  const siteId = siteIndex.resolveSiteId(readSiteReference(group));
  const siteName = siteId ? siteIndex.getSiteName(siteId) : "";
  const configuredName = firstText(group?.name, group?.label, group?.title);

  return {
    /*
      L'id di un gruppo si **deriva** sempre dalla coppia (categoria, sede) e
      non si legge dal record salvato. Un id arbitrario scritto in
      configurazione sarebbe una seconda identita per la stessa squadra: le
      appartenenze degli atleti, gli allenamenti e le assegnazioni degli
      allenatori ricavano il loro dalla coppia, e i due non si
      incontrerebbero mai (ADR-0055).
    */
    id: buildCategoryGroupId(identity.id, siteId),
    name: configuredName || buildCategoryGroupLabel(identity.name, siteName),
    categoryId: identity.id,
    categoryName: identity.name,
    siteId,
    siteName,
    structureId: firstText(group?.structureId, group?.structure_id) || null,
    notes: firstText(group?.notes, group?.note),
    active: group?.active === false ? false : true,
    implicit: false,
    raw: group,
  };
};

export const serializeCategoryGroup = (group: CategoryGroup) => ({
  ...(isRecord(group.raw) ? group.raw : {}),
  id: group.id,
  name: group.name,
  categoryId: group.categoryId,
  categoryName: group.categoryName,
  siteId: group.siteId,
  structureId: group.structureId,
  notes: group.notes,
  active: group.active,
});

/**
 * I gruppi operativi del club.
 *
 * Quando una categoria non ha nessun gruppo configurato si restituisce un
 * gruppo **implicito** che coincide con la categoria: cosi chi consuma questa
 * funzione ha sempre una lista completa e non deve gestire il caso «nessun
 * gruppo» con un ramo suo. E anche il motivo per cui un club mono-sede non
 * deve configurare niente per vedere le sue squadre.
 */
export const buildCategoryGroups = ({
  categories = [],
  sites = [],
  groups = [],
}: {
  categories?: readonly CategoryLike[];
  sites?: readonly ClubSite[];
  groups?: unknown;
}): CategoryGroup[] => {
  const siteIndex = buildSiteIndex(sites);
  const configured = asArray(groups)
    .map((group) => normalizeCategoryGroup(group, { categories, siteIndex }))
    .filter((group): group is CategoryGroup => Boolean(group));

  const configuredCategoryIds = new Set(
    configured.map((group) => normalizeReference(group.categoryId)),
  );

  const implicit = categories
    .map((category) => {
      const categoryId = trimText(category?.id) || trimText(category?.name);
      const categoryName = trimText(category?.name) || categoryId;

      return {
        id: buildCategoryGroupId(categoryId, ""),
        name: categoryName,
        categoryId,
        categoryName,
        siteId: "",
        siteName: "",
        structureId: null,
        notes: "",
        active: true,
        implicit: true,
      } satisfies CategoryGroup;
    })
    .filter(
      (group) =>
        Boolean(group.categoryId) &&
        !configuredCategoryIds.has(normalizeReference(group.categoryId)),
    );

  return [...configured, ...implicit].sort(
    (left, right) =>
      left.categoryName.localeCompare(right.categoryName, "it", {
        sensitivity: "base",
      }) ||
      left.siteName.localeCompare(right.siteName, "it", {
        sensitivity: "base",
      }),
  );
};

/**
 * Sedi a cui un atleta partecipa, lette dalle sue appartenenze di categoria.
 *
 * Un atleta senza sede sulle appartenenze non e «senza sede»: e un atleta di
 * un club che non ha ancora configurato le sedi, o un dato precedente. Chi
 * filtra deve trattarlo come presente ovunque, e per questo la lista vuota ha
 * un significato preciso — vedi `recordMatchesSite`.
 */
export const getAthleteSiteIds = (
  athlete: unknown,
  siteIndex?: SiteIndex,
): string[] => {
  const memberships: AthleteCategoryMembership[] =
    normalizeAthleteCategoryMemberships(athlete);
  const raw = isRecord(athlete) ? athlete : {};
  const references = new Set<string>();

  const push = (value: unknown) => {
    const resolved = siteIndex ? siteIndex.resolveSiteId(value) : trimText(value);
    if (resolved) references.add(resolved);
  };

  memberships.forEach((membership) => push(membership.siteId));
  push(readSiteReference(raw));
  if (isRecord(raw.data)) {
    push(readSiteReference(raw.data));
  }

  return Array.from(references);
};

/**
 * Un record appartiene a una sede?
 *
 * `siteId` vuoto significa «tutte le sedi» sul lato del filtro; una lista di
 * sedi vuota sul lato del record significa «nessuna sede dichiarata», e in tal
 * caso il record resta visibile. Le due regole insieme sono quel che rende il
 * filtro sede non distruttivo sul dato storico.
 */
export const recordMatchesSite = (
  recordSiteIds: readonly string[],
  siteId: string,
) => {
  const wanted = normalizeReference(siteId);
  if (!wanted) return true;
  if (!recordSiteIds.length) return true;
  return recordSiteIds.some(
    (candidate) => normalizeReference(candidate) === wanted,
  );
};

export const athleteMatchesSite = (
  athlete: unknown,
  siteId: string,
  siteIndex?: SiteIndex,
) => recordMatchesSite(getAthleteSiteIds(athlete, siteIndex), siteId);

/** Strutture di una sede; senza sede richiesta le restituisce tutte. */
export const filterStructuresBySite = <T,>(
  structures: readonly T[],
  siteId: string,
) =>
  structures.filter((structure) => {
    const reference = readSiteReference(structure);
    return recordMatchesSite(reference ? [reference] : [], siteId);
  });

export const filterCategoryGroupsBySite = (
  groups: readonly CategoryGroup[],
  siteId: string,
) =>
  groups.filter((group) =>
    recordMatchesSite(group.siteId ? [group.siteId] : [], siteId),
  );

/** Categorie svolte in una sede, senza duplicarne nessuna. */
export const getCategoryIdsForSite = (
  groups: readonly CategoryGroup[],
  siteId: string,
) =>
  Array.from(
    new Set(
      filterCategoryGroupsBySite(groups, siteId).map(
        (group) => group.categoryId,
      ),
    ),
  );

/* ==========================================================================
   Gruppi operativi: la squadra concreta, non la classificazione (ADR-0055)
   ========================================================================== */

/**
 * **La regola che decide quale delle due cose serve.**
 *
 * | Superficie | Cosa seleziona |
 * |---|---|
 * | *configurazione* — fascia d'anno, compatibilita, proprieta sportive | **categoria** |
 * | *operazione* — elenco atleti, allenamenti, presenze, convocazioni, numerazione, programma settimanale | **gruppo operativo** |
 *
 * La categoria dice in che fascia gioca un atleta; il gruppo dice con chi si
 * allena. Usare la prima dove serve il secondo e il difetto che questo livello
 * chiude: gli atleti di `Pulcini · Scauri` comparivano nell'appello di
 * `Pulcini · Santi Cosma` perche la categoria era la stessa.
 */

/**
 * L'id del gruppo operativo di un'appartenenza.
 *
 * **Una fonte sola.** `(categoryId, siteId)` non sono due filtri indipendenti
 * da comporre a mano in ogni schermata: sono le coordinate del gruppo, e
 * questa funzione e l'unico posto che le traduce. Comporle altrove vorrebbe
 * dire avere due idee di cosa sia lo stesso gruppo.
 */
export const getMembershipGroupId = (
  membership: { categoryId?: unknown; siteId?: unknown } | null | undefined,
  siteIndex?: SiteIndex,
) => {
  const categoryId = trimText(membership?.categoryId);
  if (!categoryId) return "";

  const rawSite = trimText(membership?.siteId);
  const siteId = siteIndex ? siteIndex.resolveSiteId(rawSite) : rawSite;
  return buildCategoryGroupId(categoryId, siteId);
};

/** I gruppi operativi a cui un atleta appartiene, letti dalle sue appartenenze. */
export const getAthleteGroupIds = (
  athlete: unknown,
  siteIndex?: SiteIndex,
): string[] => {
  const ids = new Set<string>();

  normalizeAthleteCategoryMemberships(athlete).forEach((membership) => {
    const id = getMembershipGroupId(membership, siteIndex);
    if (id) ids.add(id);
  });

  return Array.from(ids);
};

/**
 * Un atleta appartiene a questo gruppo operativo?
 *
 * **Non c'e nessuna indulgenza sulla sede, ed e il punto.** Un atleta di
 * `Pulcini · Scauri` non appartiene a `Pulcini · Santi Cosma`, nemmeno se la
 * categoria coincide: e esattamente la contaminazione che un elenco operativo
 * non deve avere. Chi non ha una sede dichiarata finisce nel gruppo «sede non
 * assegnata» della sua categoria, che e un gruppo suo e non tutti gli altri.
 */
export const athleteMatchesGroup = (
  athlete: unknown,
  group: Pick<CategoryGroup, "id" | "categoryId" | "siteId">,
  siteIndex?: SiteIndex,
) => getAthleteGroupIds(athlete, siteIndex).includes(group.id);

/**
 * Ordina i gruppi: **categoria, poi sede**.
 *
 * L'ordinamento che una segreteria si aspetta e quello con cui pensa alle sue
 * squadre — prima la fascia, poi il posto — ed e lo stesso in ogni elenco.
 * La sede non assegnata va in fondo alla sua categoria: e un dato da
 * sistemare, non una sede fra le altre.
 */
export const compareCategoryGroups = (
  left: Pick<CategoryGroup, "categoryName" | "siteName" | "siteId">,
  right: Pick<CategoryGroup, "categoryName" | "siteName" | "siteId">,
) => {
  const byCategory = left.categoryName.localeCompare(right.categoryName, "it", {
    sensitivity: "base",
  });
  if (byCategory !== 0) return byCategory;

  const leftUnassigned = left.siteId ? 0 : 1;
  const rightUnassigned = right.siteId ? 0 : 1;
  if (leftUnassigned !== rightUnassigned) return leftUnassigned - rightUnassigned;

  return left.siteName.localeCompare(right.siteName, "it", {
    sensitivity: "base",
  });
};

export type AthleteGroupBucket<T> = {
  group: CategoryGroup;
  athletes: T[];
};

/**
 * Gli atleti divisi per gruppo operativo.
 *
 * **Perche non basta una lista con una colonna «sede».** Perche l'elenco
 * `Pulcini` che porta dentro Scauri e Santi Cosma non e utilizzabile: chi
 * stampa l'appello, chi ordina il materiale o chi conta gli iscritti di una
 * squadra deve poter prendere *una* squadra. La colonna aggiunge
 * un'informazione; il gruppo separa un lavoro.
 *
 * **Un gruppo non configurato che ha atleti compare lo stesso.** Se il dato
 * dice che tre Pulcini si allenano a Castelforte, l'elenco lo mostra anche se
 * nessuno ha spuntato Castelforte nella configurazione della categoria:
 * nascondere atleti veri perche la configurazione e in ritardo e il modo piu
 * rapido per non accorgersi mai del ritardo.
 *
 * Una passata sola sugli atleti, con i gruppi indicizzati: e la funzione che
 * regge la pagina Atleti di un club con centinaia di iscritti e piu sedi, e
 * non deve costare categorie per gruppi per atleti.
 */
export const groupAthletesByCategoryGroup = <T>({
  athletes,
  groups,
  sites = [],
  siteIndex,
}: {
  athletes: readonly T[];
  groups: readonly CategoryGroup[];
  sites?: readonly ClubSite[];
  siteIndex?: SiteIndex;
}): AthleteGroupBucket<T>[] => {
  const index = siteIndex || buildSiteIndex(sites);
  const byId = new Map<string, AthleteGroupBucket<T>>();

  groups.forEach((group) => {
    byId.set(group.id, { group, athletes: [] });
  });

  athletes.forEach((athlete) => {
    normalizeAthleteCategoryMemberships(athlete).forEach((membership) => {
      const id = getMembershipGroupId(membership, index);
      if (!id) return;

      let bucket = byId.get(id);

      if (!bucket) {
        /*
          Il dato dice che questo atleta e li, la configurazione non lo sa
          ancora. Si crea il gruppo dal dato invece di far sparire l'atleta.
        */
        const siteId = index.resolveSiteId(membership.siteId);
        const siteName = siteId ? index.getSiteName(siteId) : "";

        bucket = {
          group: {
            id,
            name: buildCategoryGroupLabel(
              membership.categoryName,
              siteName || UNASSIGNED_SITE_LABEL,
            ),
            categoryId: membership.categoryId,
            categoryName: membership.categoryName,
            siteId,
            siteName: siteName || UNASSIGNED_SITE_LABEL,
            structureId: null,
            notes: "",
            active: true,
            implicit: true,
          },
          athletes: [],
        };
        byId.set(id, bucket);
      }

      bucket.athletes.push(athlete);
    });
  });

  return Array.from(byId.values()).sort((left, right) =>
    compareCategoryGroups(left.group, right.group),
  );
};

/**
 * I gruppi di una categoria, ricavati dalle sedi in cui e attiva.
 *
 * E cio che il modulo di creazione o modifica di una categoria salva: chi
 * spunta Scauri e Santi Cosma su `Pulcini` non deve poi andare a creare a mano
 * due gruppi. La spunta **e** il gruppo.
 *
 * **Togliere una spunta non cancella.** Un gruppo che ha avuto atleti,
 * allenamenti e presenze non si porta via: si **archivia** (`active: false`) e
 * resta leggibile. Cancellarlo lascerebbe orfano lo storico che lo cita.
 */
export const buildCategoryGroupsForSites = ({
  categoryId,
  categoryName,
  siteIds,
  sites,
  existing = [],
  structureBySite = {},
}: {
  categoryId: string;
  categoryName: string;
  siteIds: readonly string[];
  sites: readonly ClubSite[];
  /** I gruppi gia configurati per **questa** categoria. */
  existing?: readonly CategoryGroup[];
  structureBySite?: Record<string, string>;
}): CategoryGroup[] => {
  const index = buildSiteIndex(sites);
  const wanted = new Set(
    siteIds.map((siteId) => normalizeReference(index.resolveSiteId(siteId))),
  );

  const kept: CategoryGroup[] = sites
    .filter((site) => wanted.has(normalizeReference(site.id)))
    .map((site) => {
      const previous = existing.find(
        (group) =>
          normalizeReference(group.siteId) === normalizeReference(site.id),
      );

      return {
        id: previous?.id || buildCategoryGroupId(categoryId, site.id),
        name: buildCategoryGroupLabel(categoryName, site.name),
        categoryId,
        categoryName,
        siteId: site.id,
        siteName: site.name,
        structureId: structureBySite[site.id] ?? previous?.structureId ?? null,
        notes: previous?.notes || "",
        active: true,
        implicit: false,
        raw: previous?.raw,
      } satisfies CategoryGroup;
    });

  const archived: CategoryGroup[] = existing
    .filter(
      (group) => group.siteId && !wanted.has(normalizeReference(group.siteId)),
    )
    .map((group) => ({
      ...group,
      name: buildCategoryGroupLabel(categoryName, group.siteName),
      categoryName,
      active: false,
    }));

  return [...kept, ...archived];
};

/**
 * I gruppi ancora in uso: quelli attivi.
 *
 * Un gruppo archiviato non compare nelle tendine con cui si crea un
 * allenamento — la categoria li non si svolge piu — ma non sparisce dagli
 * elenchi finche c'e uno storico che lo cita.
 */
export const getActiveCategoryGroups = (groups: readonly CategoryGroup[]) =>
  groups.filter((group) => group.active);

/* --------------------------------------------------- allenamenti e gruppi */

/**
 * I gruppi operativi a cui un allenamento si riferisce.
 *
 * Un allenamento puo servirne piu d'uno — due sedi vicine che si allenano
 * insieme una volta al mese — e in quel caso resta **un** allenamento con due
 * gruppi, non due allenamenti da tenere allineati a mano.
 *
 * Un allenamento senza gruppi dichiarati e un dato precedente: chi lo legge lo
 * tratta come «tutti i gruppi delle sue categorie», che e cio che era prima.
 */
export const readTrainingGroupIds = (training: unknown): string[] => {
  if (!isRecord(training)) return [];

  const sources = [
    training.groupIds,
    training.group_ids,
    training.categoryGroupIds,
    training.category_group_ids,
    isRecord(training.payload)
      ? training.payload.groupIds ?? training.payload.group_ids
      : null,
  ];

  const ids = new Set<string>();
  sources.forEach((source) => {
    asArray(source).forEach((value) => {
      const id = trimText(value);
      if (id) ids.add(id);
    });
  });

  return Array.from(ids);
};

/**
 * Questo allenamento riguarda quel gruppo?
 *
 * Con i gruppi dichiarati la risposta e esatta. Senza — dato precedente — si
 * ricade sulla categoria, che e il comportamento di prima: un allenamento
 * storico non deve sparire dal calendario di nessuno.
 */
export const trainingMatchesGroup = (
  training: unknown,
  group: Pick<CategoryGroup, "id" | "categoryId">,
  categoryMatcher?: (training: unknown, categoryId: string) => boolean,
) => {
  const declared = readTrainingGroupIds(training);
  if (declared.length) {
    return declared.includes(group.id);
  }

  return categoryMatcher ? categoryMatcher(training, group.categoryId) : true;
};

/**
 * Gli allenamenti che possono far maturare un contributo per **questo** atleta.
 *
 * **Perche il dominio dei contributi ha bisogno di questa funzione.** Mario si
 * allena con `Pulcini · Scauri`. L'esistenza di un allenamento di
 * `Pulcini · Santi Cosma` non deve produrgli ne ore ne previsione: sono due
 * squadre diverse, e un contributo pubblico si rendiconta sulla frequenza di
 * chi ha frequentato davvero.
 *
 * **Cosa resta dentro.** Un allenamento che non dichiara nessun gruppo: e un
 * dato precedente ai gruppi, e escluderlo cancellerebbe frequenza vera da
 * stagioni gia rendicontate. Il filtro toglie solo cio che dichiara di
 * appartenere a un gruppo **altrui**.
 */
export const filterTrainingsForAthleteGroups = <T>({
  trainings,
  athleteGroupIds,
}: {
  trainings: readonly T[];
  athleteGroupIds: readonly string[];
}): T[] => {
  const owned = new Set(athleteGroupIds.filter(Boolean));

  return trainings.filter((training) => {
    const declared = readTrainingGroupIds(training);
    if (!declared.length) return true;
    return declared.some((id) => owned.has(id));
  });
};
