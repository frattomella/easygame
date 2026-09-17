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
 * che nessun catalogo riconosce — un nome, un id scomparso — non e attuale:
 * un nome che oggi nomina una squadra di ogni stagione non dice quale
 * (ADR-0155).
 *
 * Nessuna migrazione: la forma in archivio non cambia. Cambia chi la legge.
 */

export type SeasonAssignmentCategory = { id: string; name?: string | null; seasonId?: string | null };
export type SeasonAssignmentGroup = {
  id: string;
  categoryId: string;
  seasonId?: string | null;
};

export type TrainerAssignmentsForSeason = {
  /** La stagione su cui si e spaccato. */
  seasonId: string | null;
  current: { categoryIds: string[]; groupIds: string[] };
  /** Assegnazioni di altre stagioni, per stagione: storico, mai «attuale». */
  history: Array<{
    seasonId: string;
    seasonLabel: string;
    categoryIds: string[];
    groupIds: string[];
  }>;
  /** Riferimenti che nessun catalogo riconosce: nomi, id spariti. */
  unresolved: string[];
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

const readCategoryRefs = (raw: unknown): Array<{ id: string; name: string }> => {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list
    .map((entry) =>
      typeof entry === "string"
        ? { id: entry.trim(), name: "" }
        : { id: text((entry as any)?.id), name: text((entry as any)?.name) },
    )
    .filter((entry) => entry.id || entry.name);
};

const readGroupRefs = (trainer: SplitInput["trainer"]): string[] => {
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
 * WP-32).
 */
export const seasonOfCategory = (
  category: { seasonId?: string | null } | null | undefined,
  knownSeasonIds: ReadonlySet<string> | readonly string[],
  legacySeasonId: string | null,
) => {
  const value = text(category?.seasonId);
  const known = Array.isArray(knownSeasonIds)
    ? knownSeasonIds.includes(value)
    : (knownSeasonIds as ReadonlySet<string>).has(value);
  return value && known ? value : legacySeasonId;
};

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

  const perStagione = new Map<string, { categoryIds: string[]; groupIds: string[] }>();
  const bucket = (seasonId: string) => {
    const found = perStagione.get(seasonId);
    if (found) return found;
    const created = { categoryIds: [], groupIds: [] };
    perStagione.set(seasonId, created);
    return created;
  };
  const unresolved: string[] = [];
  const seen = new Set<string>();

  for (const ref of readCategoryRefs(input.trainer?.categories)) {
    let category = ref.id ? categoryById.get(ref.id) : undefined;
    if (!category && ref.name) {
      /*
        Un nome senza id: si accetta solo se nella **stagione scelta** lo
        porta una categoria sola. Fra due stagioni che hanno entrambe una
        «Under 15» il nome non sceglie (ADR-0155).
      */
      const omonime = input.categories.filter(
        (candidate) =>
          text(candidate.name).toLowerCase() === ref.name.toLowerCase() &&
          seasonOfCategory(candidate, knownSeasonIds, input.legacySeasonId) === input.seasonId,
      );
      if (omonime.length === 1) category = omonime[0];
    }
    if (!category && ref.id && !ref.name) {
      const omonime = input.categories.filter(
        (candidate) =>
          text(candidate.name).toLowerCase() === ref.id.toLowerCase() &&
          seasonOfCategory(candidate, knownSeasonIds, input.legacySeasonId) === input.seasonId,
      );
      if (omonime.length === 1) category = omonime[0];
    }
    if (!category) {
      unresolved.push(ref.id || ref.name);
      continue;
    }
    const id = text(category.id);
    if (seen.has(`c:${id}`)) continue;
    seen.add(`c:${id}`);
    const season = seasonOfCategory(category, knownSeasonIds, input.legacySeasonId) || "";
    bucket(season).categoryIds.push(id);
  }

  for (const groupId of readGroupRefs(input.trainer)) {
    const group = groupById.get(groupId);
    if (!group) {
      unresolved.push(groupId);
      continue;
    }
    if (seen.has(`g:${groupId}`)) continue;
    seen.add(`g:${groupId}`);
    const category = categoryById.get(text(group.categoryId));
    const season =
      (text(group.seasonId) && knownSeasonIds.has(text(group.seasonId)) ? text(group.seasonId) : null) ||
      seasonOfCategory(category, knownSeasonIds, input.legacySeasonId) ||
      "";
    bucket(season).groupIds.push(groupId);
  }

  if (!input.seasonId) {
    const all = { categoryIds: [] as string[], groupIds: [] as string[] };
    for (const entry of perStagione.values()) {
      all.categoryIds.push(...entry.categoryIds);
      all.groupIds.push(...entry.groupIds);
    }
    return { seasonId: null, current: all, history: [], unresolved };
  }

  const current = perStagione.get(input.seasonId) || { categoryIds: [], groupIds: [] };
  const history = Array.from(perStagione.entries())
    .filter(([seasonId]) => seasonId && seasonId !== input.seasonId)
    .map(([seasonId, entry]) => ({
      seasonId,
      seasonLabel: labelOf(seasonId),
      categoryIds: entry.categoryIds,
      groupIds: entry.groupIds,
    }));

  return { seasonId: input.seasonId, current, history, unresolved };
};

/**
 * Le assegnazioni da **scrivere** dopo una modifica fatta nella stagione
 * scelta: cio che l'editor ha spuntato per quella stagione, piu lo storico
 * delle altre stagioni **intatto**. Un editor che mostra solo le squadre
 * della stagione non deve cancellare quelle dell'anno scorso salvando.
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

  const historyCategoryIds = split.history.flatMap((entry) => entry.categoryIds);
  const historyGroupIds = split.history.flatMap((entry) => entry.groupIds);
  const selectedCategoryIds = Array.from(new Set(input.categoryIds.map(text).filter(Boolean))).filter(inSeason);
  const selectedGroupIds = Array.from(new Set((input.groupIds || []).map(text).filter(Boolean))).filter(groupInSeason);

  return {
    categories: [...historyCategoryIds, ...selectedCategoryIds],
    groupIds: [...historyGroupIds, ...selectedGroupIds],
    /* Cio che l'editor ha chiesto e la stagione non ha: rifiutato, e detto. */
    rejectedCategoryIds: input.categoryIds.map(text).filter((id) => id && !inSeason(id)),
    rejectedGroupIds: (input.groupIds || []).map(text).filter((id) => id && !groupInSeason(id)),
  };
};
