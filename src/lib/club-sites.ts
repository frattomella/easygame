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
    id: firstText(group?.id) || buildCategoryGroupId(identity.id, siteId),
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
