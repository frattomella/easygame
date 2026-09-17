import type { ClubSeason } from "@/lib/club-seasons";

/**
 * **L'allenatore e del club; la sua squadra e della stagione** (ADR-0197 §17).
 *
 * La scheda di un allenatore vive in `clubs.trainers` (dato globale del club,
 * `SEASON_GLOBAL_DATA_TYPES`) e porta `categories` e `groupIds`: elenchi di
 * identificativi di categorie e gruppi operativi, che sono **di una
 * stagione**. L'assegnazione e quindi gia stagionale per costruzione — una
 * categoria appartiene a una stagione sola — ma nessun lettore lo sapeva: la
 * pagina Allenatori risolveva gli identificativi sul catalogo di **tutte** le
 * stagioni e mostrava «Under 14 Gold» dell'anno scorso come squadra di
 * quest'anno (bug C del pilota, 2026-09-17).
 *
 * Qui l'elenco si spacca per stagione: **attuali** sono le assegnazioni che
 * appartengono alla stagione scelta; le altre sono **storico**, etichettate
 * con la loro stagione, e non diventano mai attuali da sole. Un riferimento
 * che nessun catalogo riconosce — un nome, un id scomparso — non e attuale e
 * **non si perde**: chi scrive lo rimanda com'era (`unresolved`). Un nome
 * che nomina una squadra in piu di una stagione non sceglie (ADR-0155,
 * revisione A-M1/D-H2): resta irrisolto finche qualcuno non lo scrive come
 * identificativo.
 *
 * Nessuna migrazione: la forma in archivio non cambia. Cambia chi la legge.
 */

export type SeasonAssignmentCategory = {
  id: string;
  name?: string | null;
  seasonId?: string | null;
  season_id?: string | null;
};
export type SeasonAssignmentGroup = {
  id: string;
  categoryId: string;
  seasonId?: string | null;
};

export type TrainerAssignmentsForSeason = {
  /** La stagione su cui si e spaccato. */
  seasonId: string | null;
  current: {
    categoryIds: string[];
    groupIds: string[];
    /** I riferimenti **com'erano in archivio** che sono risolti su queste categorie/gruppi (per toglierli, revisione E4/D-L2). */
    rawCategoryRefs: unknown[];
    rawGroupRefs: string[];
  };
  /** Assegnazioni di altre stagioni, per stagione: storico, mai «attuale». */
  history: Array<{
    seasonId: string;
    seasonLabel: string;
    categoryIds: string[];
    groupIds: string[];
    rawCategoryRefs: unknown[];
    rawGroupRefs: string[];
  }>;
  /** Riferimenti che nessun catalogo riconosce: nomi, id spariti, nomi che nominano piu stagioni. Si conservano com'erano. */
  unresolved: string[];
  unresolvedRaw: unknown[];
  unresolvedGroupRaw: string[];
};

type SplitInput = {
  trainer: { categories?: unknown; groupIds?: unknown; group_ids?: unknown } | null | undefined;
  /** Il catalogo di **tutte** le stagioni (senza perimetro). */
  categories: readonly SeasonAssignmentCategory[];
  /** I gruppi operativi di tutte le stagioni. */
  groups?: readonly SeasonAssignmentGroup[];
  seasons: readonly Pick<ClubSeason, "id" | "label">[];
  /** La stagione scelta: `null` = nessun perimetro (tutto e attuale). */
  seasonId: string | null;
  legacySeasonId: string | null;
};

const text = (value: unknown) => String(value ?? "").trim();

const readCategoryRefs = (raw: unknown): Array<{ id: string; name: string; raw: unknown }> => {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list
    .map((entry) =>
      typeof entry === "string"
        ? { id: entry.trim(), name: "", raw: entry }
        : { id: text((entry as any)?.id), name: text((entry as any)?.name), raw: entry },
    )
    .filter((entry) => entry.id || entry.name);
};

export const readTrainerGroupRefs = (trainer: SplitInput["trainer"]): string[] => {
  const raw = Array.isArray(trainer?.groupIds)
    ? trainer?.groupIds
    : Array.isArray((trainer as any)?.group_ids)
      ? (trainer as any).group_ids
      : [];
  return (raw as unknown[]).map(text).filter(Boolean);
};

/**
 * La stagione di una categoria: la sua, o la piu vecchia del club se non ne
 * ha una o ne nomina una che il club non ha (regola dei record senza annata,
 * WP-32). Legge le due grafie, come `filterCollectionBySeason` (revisione D-L4).
 */
export const seasonOfCategory = (
  category: { seasonId?: string | null; season_id?: string | null } | null | undefined,
  knownSeasonIds: ReadonlySet<string> | readonly string[],
  legacySeasonId: string | null,
) => {
  const value = text(category?.seasonId) || text(category?.season_id);
  const known = Array.isArray(knownSeasonIds)
    ? knownSeasonIds.includes(value)
    : (knownSeasonIds as ReadonlySet<string>).has(value);
  return value && known ? value : legacySeasonId;
};

type Bucket = { categoryIds: string[]; groupIds: string[]; rawCategoryRefs: unknown[]; rawGroupRefs: string[] };
const emptyBucket = (): Bucket => ({ categoryIds: [], groupIds: [], rawCategoryRefs: [], rawGroupRefs: [] });

export const splitTrainerAssignmentsBySeason = (
  input: SplitInput,
): TrainerAssignmentsForSeason => {
  const knownSeasonIds = new Set(input.seasons.map((season) => season.id));
  const labelOf = (seasonId: string) =>
    input.seasons.find((season) => season.id === seasonId)?.label || seasonId;
  const categoryById = new Map(
    input.categories.map((category) => [text(category.id), category] as const),
  );
  const groupById = new Map(
    (input.groups || []).map((group) => [text(group.id), group] as const),
  );

  const perStagione = new Map<string, Bucket>();
  const bucket = (seasonId: string) => {
    const found = perStagione.get(seasonId);
    if (found) return found;
    const created = emptyBucket();
    perStagione.set(seasonId, created);
    return created;
  };
  const unresolved: string[] = [];
  const unresolvedRaw: unknown[] = [];
  const unresolvedGroupRaw: string[] = [];
  const seen = new Set<string>();

  for (const ref of readCategoryRefs(input.trainer?.categories)) {
    let category = ref.id ? categoryById.get(ref.id) : undefined;
    if (!category) {
      /*
        Un nome (o un id che non e un id): vale solo se **in tutto il club** lo
        porta una categoria sola. Fra due stagioni che hanno entrambe una
        «Under 15» il nome non sceglie, e resta com'era (ADR-0155).
      */
      const nome = (ref.name || ref.id).toLowerCase();
      const omonime = input.categories.filter(
        (candidate) => text(candidate.name).toLowerCase() === nome,
      );
      if (omonime.length === 1) category = omonime[0];
    }
    if (!category) {
      unresolved.push(ref.id || ref.name);
      unresolvedRaw.push(ref.raw);
      continue;
    }
    const id = text(category.id);
    if (seen.has(`c:${id}`)) continue;
    seen.add(`c:${id}`);
    const season = seasonOfCategory(category, knownSeasonIds, input.legacySeasonId) || "";
    const target = bucket(season);
    target.categoryIds.push(id);
    target.rawCategoryRefs.push(ref.raw);
  }

  for (const groupId of readTrainerGroupRefs(input.trainer)) {
    const group = groupById.get(groupId);
    if (!group) {
      unresolved.push(groupId);
      unresolvedGroupRaw.push(groupId);
      continue;
    }
    if (seen.has(`g:${groupId}`)) continue;
    seen.add(`g:${groupId}`);
    const category = categoryById.get(text(group.categoryId));
    const season =
      (text(group.seasonId) && knownSeasonIds.has(text(group.seasonId)) ? text(group.seasonId) : null) ||
      seasonOfCategory(category, knownSeasonIds, input.legacySeasonId) ||
      "";
    const target = bucket(season);
    target.groupIds.push(groupId);
    target.rawGroupRefs.push(groupId);
  }

  if (!input.seasonId) {
    const all = emptyBucket();
    for (const entry of perStagione.values()) {
      all.categoryIds.push(...entry.categoryIds);
      all.groupIds.push(...entry.groupIds);
      all.rawCategoryRefs.push(...entry.rawCategoryRefs);
      all.rawGroupRefs.push(...entry.rawGroupRefs);
    }
    return { seasonId: null, current: all, history: [], unresolved, unresolvedRaw, unresolvedGroupRaw };
  }

  const current = perStagione.get(input.seasonId) || emptyBucket();
  const history = Array.from(perStagione.entries())
    .filter(([seasonId]) => seasonId && seasonId !== input.seasonId)
    .map(([seasonId, entry]) => ({
      seasonId,
      seasonLabel: labelOf(seasonId),
      ...entry,
    }));

  return { seasonId: input.seasonId, current, history, unresolved, unresolvedRaw, unresolvedGroupRaw };
};

/**
 * Le assegnazioni da **scrivere** dopo una modifica fatta nella stagione
 * scelta: cio che l'editor ha spuntato per quella stagione, piu lo storico
 * delle altre stagioni **intatto** — com'era, grafia compresa — e i
 * riferimenti irrisolti, che non sono di nessuno e non si buttano
 * (revisione D-M1). Un editor che mostra solo le squadre della stagione non
 * deve cancellare quelle dell'anno scorso salvando.
 */
export const mergeTrainerAssignmentsForSeason = (
  input: SplitInput & { categoryIds: readonly string[]; groupIds?: readonly string[] },
) => {
  const split = splitTrainerAssignmentsBySeason(input);
  const knownSeasonIds = new Set(input.seasons.map((season) => season.id));
  const categoryById = new Map(
    input.categories.map((category) => [text(category.id), category] as const),
  );
  const inSeason = (id: string) => {
    const category = categoryById.get(id);
    if (!category) return false;
    return !input.seasonId || seasonOfCategory(category, knownSeasonIds, input.legacySeasonId) === input.seasonId;
  };
  const groupById = new Map((input.groups || []).map((group) => [text(group.id), group] as const));
  const groupInSeason = (id: string) => {
    const group = groupById.get(id);
    if (!group) return false;
    if (!input.seasonId) return true;
    const category = categoryById.get(text(group.categoryId));
    const season =
      (text(group.seasonId) && knownSeasonIds.has(text(group.seasonId)) ? text(group.seasonId) : null) ||
      seasonOfCategory(category, knownSeasonIds, input.legacySeasonId);
    return season === input.seasonId;
  };

  const historyCategoryRefs = split.history.flatMap((entry) => entry.rawCategoryRefs);
  const historyGroupIds = split.history.flatMap((entry) => entry.groupIds);
  const selectedCategoryIds = Array.from(new Set(input.categoryIds.map(text).filter(Boolean))).filter(inSeason);
  const selectedGroupIds = Array.from(new Set((input.groupIds || []).map(text).filter(Boolean))).filter(groupInSeason);

  return {
    categories: [...historyCategoryRefs, ...split.unresolvedRaw, ...selectedCategoryIds],
    groupIds: [...historyGroupIds, ...split.unresolvedGroupRaw, ...selectedGroupIds],
    /* Cio che l'editor ha chiesto e la stagione non ha: rifiutato, e detto. */
    rejectedCategoryIds: input.categoryIds.map(text).filter((id) => id && !inSeason(id)),
    rejectedGroupIds: (input.groupIds || []).map(text).filter((id) => id && !groupInSeason(id)),
    unresolved: split.unresolved,
  };
};
