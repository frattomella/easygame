"use client";

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

const YEAR_PATTERN = /(\d{4})\D+(\d{4})/;

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
