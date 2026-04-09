"use client";

import {
  getAthleteCategoryReferences as getNormalizedAthleteCategoryReferences,
  getPrimaryAthleteCategoryMembership,
  normalizeAthleteCategoryMemberships,
} from "./athlete-category-memberships";

type CategoryLike = {
  id?: string;
  name?: string;
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

  return [];
};

const findCategoryIndex = (
  categories: NormalizedCategoryOption[],
  candidate: NormalizedCategoryOption,
) => {
  const candidateId = normalizeCategoryReference(candidate.id);
  const candidateName = normalizeCategoryReference(candidate.name);

  return categories.findIndex((category) => {
    const existingId = normalizeCategoryReference(category.id);
    const existingName = normalizeCategoryReference(category.name);

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
) => {
  if (!candidate) {
    return;
  }

  const index = findCategoryIndex(categories, candidate);

  if (index === -1) {
    categories.push(candidate);
    return;
  }

  const current = categories[index];
  const currentHasDistinctId =
    normalizeCategoryReference(current.id) !==
    normalizeCategoryReference(current.name);
  const candidateHasDistinctId =
    normalizeCategoryReference(candidate.id) !==
    normalizeCategoryReference(candidate.name);

  categories[index] = {
    id:
      (candidateHasDistinctId ? candidate.id : "") ||
      (currentHasDistinctId ? current.id : "") ||
      current.id ||
      candidate.id,
    name: current.name || candidate.name || current.id || candidate.id,
    color: current.color ?? candidate.color ?? null,
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
  };
};

const sortCategoryOptions = (categories: NormalizedCategoryOption[]) =>
  categories
    .slice()
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name, "it", {
          sensitivity: "base",
        }) ||
        left.id.localeCompare(right.id, "it", {
          sensitivity: "base",
        }),
    );

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

export const buildClubCategoryOptions = ({
  clubCategories = [],
  resourceCategories = [],
  athletes = [],
}: {
  clubCategories?: unknown;
  resourceCategories?: unknown;
  athletes?: unknown;
}) => {
  const merged: NormalizedCategoryOption[] = [];

  [clubCategories, resourceCategories].forEach((source) => {
    collectCategoryOptions(source).forEach((category) =>
      mergeCategoryOption(merged, category),
    );
  });

  if (Array.isArray(athletes)) {
    athletes.forEach((athlete) => {
      normalizeAthleteCategoryMemberships(athlete).forEach((membership) =>
        mergeCategoryOption(merged, {
          id: membership.categoryId,
          name: membership.categoryName,
          color: null,
        }),
      );

      mergeCategoryOption(merged, deriveCategoryFromAthlete(athlete));
    });
  }

  return sortCategoryOptions(merged);
};

export const athleteMatchesCategory = (
  athlete: unknown,
  category: Pick<CategoryLike, "id" | "name"> | string | null | undefined,
) => {
  const athleteReferences = getAthleteCategoryReferences(athlete);
  const categoryReferences = getCategoryReferences(category);

  return categoryReferences.some((reference) =>
    athleteReferences.includes(reference),
  );
};

export const athleteMatchesAnyCategory = (
  athlete: unknown,
  categories: Array<Pick<CategoryLike, "id" | "name"> | string> = [],
) => categories.some((category) => athleteMatchesCategory(athlete, category));

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

  if (birthYearFrom !== undefined) {
    return `Nati dal ${birthYearFrom}`;
  }

  if (birthYearTo !== undefined) {
    return `Nati fino al ${birthYearTo}`;
  }

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

  const byName = categories.find(
    (category) => String(category?.name || "").trim() === value,
  );
  if (byName?.id) {
    return String(byName.id);
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

  return matches[0]?.category || null;
};
