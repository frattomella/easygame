/**
 * Compatibilita fra categorie: chi puo essere utilizzato dove.
 *
 * ## Il problema
 *
 * Una societa ha bisogno di dire «gli atleti dell'Under 13 possono essere
 * utilizzati anche in Under 14». Prima non c'era modo di dirlo: l'unica
 * relazione fra atleta e categoria era l'appartenenza, e ogni tentativo di
 * dedurre la vicinanza dai nomi («Under 13» accanto a «Under 14») cade con le
 * categorie personalizzate, che nel prodotto reale si chiamano «Pulcini -
 * Scauri» o «Prima squadra femminile».
 *
 * ## Il modello (ADR-0030)
 *
 * La compatibilita e una **configurazione esplicita della categoria**, non una
 * deduzione. Ogni categoria porta `compatibleCategoryIds`: l'elenco delle
 * categorie in cui i **suoi** atleti possono essere utilizzati.
 *
 * Tre proprieta volute:
 *
 * 1. **esplicita** - nessun accostamento per somiglianza di nome, nessuna
 *    inferenza dagli anni di nascita: vale solo cio che l'utente ha
 *    configurato;
 * 2. **orientata** - «U13 verso U14» dice che gli atleti U13 sono utilizzabili
 *    in U14, non il contrario. Le due direzioni si configurano separatamente;
 * 3. **non transitiva** - se U13 e compatibile con U14 e U14 con U15, un
 *    atleta U13 **non** diventa eleggibile per U15. Si guarda un solo salto,
 *    mai la chiusura transitiva. E il requisito esplicito del prodotto.
 *
 * ## Tre concetti tenuti separati
 *
 * | Concetto | Dove vive | Significato |
 * |---|---|---|
 * | Categoria primaria | `athlete_category_memberships.is_primary` | la categoria dell'atleta |
 * | Appartenenza secondaria | `athlete_category_memberships` | l'atleta e iscritto anche qui |
 * | Eleggibilita compatibile | calcolata qui, **mai persistita** | l'atleta potrebbe essere usato qui |
 *
 * L'eleggibilita non e un'appartenenza: non crea membership, non cambia la
 * categoria primaria e non fa entrare nessuno in un gruppo da sola. Chi la
 * vuole (oggi i gruppi numerazione) deve chiederla esplicitamente.
 */

import {
  normalizeAthleteCategoryMemberships,
  type AthleteCategoryMembership,
} from "./athlete-category-memberships";

export type CategoryCompatibilityInput = {
  id?: string | null;
  name?: string | null;
  compatibleCategoryIds?: unknown;
  compatible_category_ids?: unknown;
  compatibleCategories?: unknown;
  compatible_categories?: unknown;
};

/**
 * Relazione fra un atleta e un insieme di categorie.
 *
 * - `primary`: e la sua categoria principale;
 * - `secondary`: vi appartiene, ma non come categoria principale;
 * - `compatible`: non vi appartiene, ma una delle sue categorie la dichiara
 *   compatibile;
 * - `none`: nessuna relazione.
 */
export type CategoryEligibilityKind =
  | "primary"
  | "secondary"
  | "compatible"
  | "none";

export type CategoryCompatibilityIndex = {
  /** Risolve un riferimento (id o nome, qualunque maiuscola) nell'id reale. */
  resolveCategoryId: (reference: unknown) => string;
  /** Nome leggibile di una categoria, o il riferimento stesso se sconosciuta. */
  getCategoryName: (reference: unknown) => string;
  /** Categorie in cui gli atleti di `reference` possono essere utilizzati. */
  getCompatibleCategoryIds: (reference: unknown) => string[];
  /** Categorie i cui atleti possono essere utilizzati in `reference`. */
  getSourceCategoryIds: (reference: unknown) => string[];
};

const normalizeReference = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const trimText = (value: unknown) => String(value ?? "").trim();

/**
 * Estrae la lista di riferimenti compatibili da una categoria, accettando le
 * forme che i dati possono avere: array di stringhe, array di oggetti, stringa
 * separata da virgole, chiavi snake_case.
 */
export const readCategoryCompatibilityList = (
  category: CategoryCompatibilityInput | null | undefined,
): string[] => {
  const raw =
    category?.compatibleCategoryIds ??
    category?.compatible_category_ids ??
    category?.compatibleCategories ??
    category?.compatible_categories;

  const collect = (value: unknown): string[] => {
    if (Array.isArray(value)) {
      return value.flatMap(collect);
    }

    if (typeof value === "string") {
      return value.split(",").map(trimText).filter(Boolean);
    }

    if (value && typeof value === "object") {
      const record = value as Record<string, any>;
      const single = trimText(
        record.id ?? record.categoryId ?? record.category_id ?? record.name,
      );
      return single ? [single] : [];
    }

    return [];
  };

  return Array.from(new Set(collect(raw)));
};

/**
 * Costruisce l'indice di compatibilita dall'elenco categorie del club.
 *
 * Va costruito **una volta** e riusato: risolvere i riferimenti a ogni
 * confronto costerebbe una scansione dell'elenco categorie per atleta.
 */
export const buildCategoryCompatibilityIndex = (
  categories: readonly CategoryCompatibilityInput[] = [],
): CategoryCompatibilityIndex => {
  const idByReference = new Map<string, string>();
  const nameById = new Map<string, string>();

  categories.forEach((category) => {
    const id = trimText(category?.id);
    const name = trimText(category?.name);
    const canonicalId = id || name;

    if (!canonicalId) {
      return;
    }

    if (id) idByReference.set(normalizeReference(id), canonicalId);
    if (name) idByReference.set(normalizeReference(name), canonicalId);
    nameById.set(canonicalId, name || id || canonicalId);
  });

  const resolveCategoryId = (reference: unknown) => {
    const text = trimText(reference);
    if (!text) return "";
    return idByReference.get(normalizeReference(text)) || text;
  };

  const outbound = new Map<string, string[]>();
  const inbound = new Map<string, string[]>();

  categories.forEach((category) => {
    const sourceId = resolveCategoryId(category?.id || category?.name);
    if (!sourceId) {
      return;
    }

    const targets = Array.from(
      new Set(
        readCategoryCompatibilityList(category)
          .map((reference) => resolveCategoryId(reference))
          .filter((target) => Boolean(target) && target !== sourceId),
      ),
    );

    if (!targets.length) {
      return;
    }

    outbound.set(sourceId, targets);
    targets.forEach((target) => {
      const sources = inbound.get(target);
      if (sources) {
        if (!sources.includes(sourceId)) sources.push(sourceId);
      } else {
        inbound.set(target, [sourceId]);
      }
    });
  });

  return {
    resolveCategoryId,
    getCategoryName: (reference: unknown) => {
      const id = resolveCategoryId(reference);
      return nameById.get(id) || id;
    },
    // Copia difensiva: l'indice e condiviso da tutti i gruppi di una pagina e
    // non deve poter essere mutato da chi lo consuma.
    getCompatibleCategoryIds: (reference: unknown) => [
      ...(outbound.get(resolveCategoryId(reference)) || []),
    ],
    getSourceCategoryIds: (reference: unknown) => [
      ...(inbound.get(resolveCategoryId(reference)) || []),
    ],
  };
};

export type AthleteCategoryEligibility = {
  /** Id della categoria principale, stringa vuota se l'atleta non ne ha. */
  primaryCategoryId: string;
  /** Tutte le categorie a cui l'atleta appartiene davvero. */
  memberCategoryIds: string[];
  /** Categorie in cui l'atleta e utilizzabile senza appartenervi. */
  compatibleCategoryIds: string[];
  memberships: AthleteCategoryMembership[];
  /**
   * Le stesse informazioni gia normalizzate per il confronto. Servono a chi
   * valuta lo stesso atleta contro molti insiemi di categorie (i gruppi
   * numerazione di una pagina): senza, ogni confronto rinormalizzerebbe le
   * stesse stringhe.
   */
  keys: {
    primary: string;
    members: Set<string>;
    compatible: Set<string>;
  };
};

/**
 * Normalizza un elenco di categorie in un insieme confrontabile. Va calcolato
 * una volta per gruppo, non una volta per atleta.
 */
export const buildCategoryIdSet = (categoryIds: readonly string[] = []) =>
  new Set(categoryIds.map(normalizeReference).filter(Boolean));

/**
 * Calcola per un atleta i tre insiemi che il modello tiene separati: categoria
 * primaria, appartenenze effettive, eleggibilita per compatibilita.
 *
 * L'eleggibilita non contiene mai le categorie di appartenenza: i due insiemi
 * sono disgiunti, cosi chi li consuma puo etichettare le righe senza doverli
 * sottrarre a mano.
 */
export const getAthleteCategoryEligibility = ({
  athlete,
  index,
}: {
  athlete: unknown;
  index: CategoryCompatibilityIndex;
}): AthleteCategoryEligibility => {
  const memberships = normalizeAthleteCategoryMemberships(athlete);
  const memberCategoryIds: string[] = [];
  const seenMembers = new Set<string>();

  memberships.forEach((membership) => {
    const id = index.resolveCategoryId(membership.categoryId);
    const key = normalizeReference(id);
    if (!key || seenMembers.has(key)) {
      return;
    }
    seenMembers.add(key);
    memberCategoryIds.push(id);
  });

  const primaryMembership = memberships.find(
    (membership) => membership.isPrimary,
  );
  const primaryCategoryId = primaryMembership
    ? index.resolveCategoryId(primaryMembership.categoryId)
    : "";

  const compatibleCategoryIds: string[] = [];
  const seenCompatible = new Set<string>();

  memberCategoryIds.forEach((categoryId) => {
    // Un solo salto: `getCompatibleCategoryIds` non viene mai riapplicata al
    // proprio risultato. E qui che vive la non transitivita del modello.
    index.getCompatibleCategoryIds(categoryId).forEach((target) => {
      const key = normalizeReference(target);
      if (!key || seenMembers.has(key) || seenCompatible.has(key)) {
        return;
      }
      seenCompatible.add(key);
      compatibleCategoryIds.push(target);
    });
  });

  return {
    primaryCategoryId,
    memberCategoryIds,
    compatibleCategoryIds,
    memberships,
    keys: {
      primary: normalizeReference(primaryCategoryId),
      members: seenMembers,
      compatible: seenCompatible,
    },
  };
};

const hasAny = (candidates: Set<string>, wanted: Set<string>) => {
  // Si scorre l'insieme piu piccolo: un atleta ha poche categorie, un gruppo
  // puo averne molte (o viceversa).
  const [small, large] =
    candidates.size <= wanted.size ? [candidates, wanted] : [wanted, candidates];
  for (const value of small) {
    if (large.has(value)) return true;
  }
  return false;
};

/**
 * Come `getEligibilityKind`, ma con l'insieme di categorie gia normalizzato.
 * E la forma da usare in un ciclo su molti atleti.
 */
export const getEligibilityKindForSet = ({
  eligibility,
  categoryIdSet,
  includeCompatible = false,
}: {
  eligibility: AthleteCategoryEligibility;
  categoryIdSet: Set<string>;
  includeCompatible?: boolean;
}): CategoryEligibilityKind => {
  if (!categoryIdSet.size) {
    return "none";
  }

  if (eligibility.keys.primary && categoryIdSet.has(eligibility.keys.primary)) {
    return "primary";
  }

  if (hasAny(eligibility.keys.members, categoryIdSet)) {
    return "secondary";
  }

  if (includeCompatible && hasAny(eligibility.keys.compatible, categoryIdSet)) {
    return "compatible";
  }

  return "none";
};

/**
 * Relazione fra un atleta gia analizzato e un insieme di categorie.
 *
 * `includeCompatible` decide se l'eleggibilita conta: di default no, perche
 * l'eleggibilita non e un'appartenenza e chi la vuole deve chiederla.
 */
export const getEligibilityKind = ({
  eligibility,
  categoryIds,
  includeCompatible = false,
}: {
  eligibility: AthleteCategoryEligibility;
  categoryIds: readonly string[];
  includeCompatible?: boolean;
}): CategoryEligibilityKind =>
  getEligibilityKindForSet({
    eligibility,
    categoryIdSet: buildCategoryIdSet(categoryIds),
    includeCompatible,
  });

export const CATEGORY_ELIGIBILITY_LABELS: Record<
  Exclude<CategoryEligibilityKind, "none">,
  string
> = {
  primary: "Primaria",
  secondary: "Secondaria",
  compatible: "Compatibile",
};
