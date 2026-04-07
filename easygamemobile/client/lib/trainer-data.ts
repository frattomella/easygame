type TrainerCategoryLike =
  | string
  | {
      id?: string | null;
      name?: string | null;
    }
  | null
  | undefined;

type ClubCategoryLike = {
  id?: string | null;
  name?: string | null;
};

const normalizeValue = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const toCategoryEntries = (rawCategories: unknown): TrainerCategoryLike[] => {
  if (Array.isArray(rawCategories)) {
    return rawCategories.flatMap((entry) => toCategoryEntries(entry));
  }

  if (
    rawCategories &&
    typeof rawCategories === "object" &&
    !("id" in (rawCategories as Record<string, unknown>)) &&
    !("name" in (rawCategories as Record<string, unknown>))
  ) {
    const source = rawCategories as Record<string, unknown>;
    const candidates = [
      source.categories,
      source.category,
      source.categoryId,
      source.category_id,
      source.categoryName,
      source.category_name,
    ].filter((value) => value !== undefined);

    if (candidates.length > 0) {
      return candidates.flatMap((entry) => toCategoryEntries(entry));
    }
  }

  if (typeof rawCategories === "string") {
    return rawCategories
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (
    rawCategories &&
    typeof rawCategories === "object" &&
    ("id" in (rawCategories as Record<string, unknown>) ||
      "name" in (rawCategories as Record<string, unknown>))
  ) {
    return [rawCategories as TrainerCategoryLike];
  }

  return [];
};

const findMatchingCategory = (
  rawId: string,
  rawName: string,
  clubCategories: ClubCategoryLike[],
) =>
  clubCategories.find((category) => {
    const categoryId = normalizeValue(category?.id);
    const categoryName = normalizeValue(category?.name);

    return (
      (!!rawId &&
        (categoryId === normalizeValue(rawId) ||
          categoryName === normalizeValue(rawId))) ||
      (!!rawName &&
        (categoryId === normalizeValue(rawName) ||
          categoryName === normalizeValue(rawName)))
    );
  });

export const normalizeTrainerCategories = (
  rawCategories: TrainerCategoryLike[] | unknown,
  clubCategories: ClubCategoryLike[] = [],
) => {
  const entries = toCategoryEntries(rawCategories);
  const normalized: { id: string; name: string }[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const rawId =
      typeof entry === "string" ? entry.trim() : String(entry?.id || "").trim();
    const rawName =
      typeof entry === "string" ? "" : String(entry?.name || "").trim();
    const match = findMatchingCategory(rawId, rawName, clubCategories);
    const id = String(match?.id || rawId || rawName || "").trim();
    const name = String(match?.name || rawName || rawId || "").trim();

    if (!id && !name) {
      continue;
    }

    const key = normalizeValue(id || name);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push({
      id: id || name,
      name: name || id || "Categoria",
    });
  }

  return normalized;
};

export const getTrainerCategoryIds = (
  rawCategories: TrainerCategoryLike[] | unknown,
  clubCategories: ClubCategoryLike[] = [],
) =>
  normalizeTrainerCategories(rawCategories, clubCategories).map(
    (category) => category.id,
  );

export const getTrainerDisplayName = (trainer: any) => {
  const directName = String(trainer?.name || trainer?.fullName || "").trim();

  if (directName) {
    return directName;
  }

  const firstName = String(
    trainer?.firstName || trainer?.first_name || trainer?.nome || "",
  ).trim();
  const lastName = String(
    trainer?.lastName ||
      trainer?.last_name ||
      trainer?.surname ||
      trainer?.cognome ||
      "",
  ).trim();

  return [firstName, lastName].filter(Boolean).join(" ").trim() || "Allenatore";
};

export const normalizeTrainerLookupValue = normalizeValue;
