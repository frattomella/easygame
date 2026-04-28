"use client";

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
export type NormalizedTrainerViewModel = {
  id: string;
  name: string;
  email: string;
  phone: string;
  categories: { id: string; name: string }[];
  salary: string;
  avatar?: string;
  status: "active" | "suspended";
};

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const firstDefinedValue = (...values: unknown[]) => {
  for (const value of values) {
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
};

const firstNonEmptyString = (...values: unknown[]) => {
  for (const value of values) {
    const candidate = String(value || "").trim();
    if (candidate) {
      return candidate;
    }
  }

  return "";
};

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

const normalizeValue = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const toTrainerEntries = (source: unknown): Record<string, any>[] => {
  if (Array.isArray(source)) {
    return source.flatMap((entry) => toTrainerEntries(entry));
  }

  if (!isRecord(source)) {
    return [];
  }

  if (isRecord(source.payload)) {
    const payloadEntries = toTrainerEntries(source.payload);
    if (payloadEntries.length > 0) {
      return payloadEntries;
    }
  }

  const looksLikeTrainer = [
    "id",
    "name",
    "fullName",
    "firstName",
    "first_name",
    "lastName",
    "last_name",
    "surname",
    "cognome",
    "email",
    "phone",
    "categories",
    "role",
  ].some((key) => source[key] !== undefined);

  if (looksLikeTrainer) {
    return [source];
  }

  const nestedCandidates = [
    source.trainers,
    source.trainer,
    source.staff_members,
    source.staff,
    source.members,
  ].filter((value) => value !== undefined);

  if (nestedCandidates.length > 0) {
    return nestedCandidates.flatMap((entry) => toTrainerEntries(entry));
  }

  return [];
};

const normalizeTrainerStatus = (value: unknown): "active" | "suspended" => {
  const normalized = normalizeValue(value);

  if (["suspended", "inactive", "disabled"].includes(normalized)) {
    return "suspended";
  }

  return "active";
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
      (!!rawId && (categoryId === normalizeValue(rawId) || categoryName === normalizeValue(rawId))) ||
      (!!rawName &&
        (categoryId === normalizeValue(rawName) || categoryName === normalizeValue(rawName)))
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
) => normalizeTrainerCategories(rawCategories, clubCategories).map((category) => category.id);

export const trainerHasCategory = (
  trainer: { categories?: TrainerCategoryLike[] | unknown } | null | undefined,
  category: ClubCategoryLike | null | undefined,
  clubCategories: ClubCategoryLike[] = [],
) => {
  if (!trainer || !category) {
    return false;
  }

  const targetId = normalizeValue(category.id);
  const targetName = normalizeValue(category.name);

  return normalizeTrainerCategories(trainer.categories, clubCategories).some(
    (assignedCategory) => {
      const assignedId = normalizeValue(assignedCategory.id);
      const assignedName = normalizeValue(assignedCategory.name);

      return (
        (!!targetId &&
          (assignedId === targetId || assignedName === targetId)) ||
        (!!targetName &&
          (assignedId === targetName || assignedName === targetName))
      );
    },
  );
};

export const getAssociatedTrainerIds = (
  trainers: Array<{
    id?: string | null;
    categories?: TrainerCategoryLike[] | unknown;
  }> = [],
  selectedCategoryIds: string[] = [],
  clubCategories: ClubCategoryLike[] = [],
) => {
  const categories = selectedCategoryIds
    .map((categoryId) => {
      const rawValue = String(categoryId || "").trim();
      if (!rawValue) {
        return null;
      }

      const match = findMatchingCategory(rawValue, rawValue, clubCategories);
      return match || { id: rawValue, name: rawValue };
    })
    .filter(Boolean) as ClubCategoryLike[];

  const seen = new Set<string>();

  return trainers
    .filter((trainer) => {
      const trainerId = String(trainer?.id || "").trim();
      if (!trainerId || seen.has(trainerId)) {
        return false;
      }

      const isAssociated = categories.some((category) =>
        trainerHasCategory(trainer, category, clubCategories),
      );

      if (isAssociated) {
        seen.add(trainerId);
      }

      return isAssociated;
    })
    .map((trainer) => String(trainer?.id || "").trim())
    .filter(Boolean);
};

export const normalizeTrainerList = (
  sources: unknown,
  clubCategories: ClubCategoryLike[] = [],
): NormalizedTrainerViewModel[] => {
  const entries = toTrainerEntries(sources);
  const normalized: NormalizedTrainerViewModel[] = [];

  for (const entry of entries) {
    const rawCategories = firstDefinedValue(
      entry.categories,
      entry.categoryIds,
      entry.category_ids,
      entry.categoryId,
      entry.category_id,
      entry.categoryName,
      entry.category_name,
      entry.category,
    );
    const categories = normalizeTrainerCategories(rawCategories, clubCategories);
    const rawLabel = firstNonEmptyString(
      entry.name,
      entry.fullName,
      entry.firstName,
      entry.first_name,
      entry.nome,
      entry.lastName,
      entry.last_name,
      entry.surname,
      entry.cognome,
    );
    const email = firstNonEmptyString(
      entry.email,
      entry.mail,
      entry.linkedUserEmail,
      entry.linked_user_email,
    ).toLowerCase();
    const id = firstNonEmptyString(
      entry.id,
      entry.trainerId,
      entry.trainer_id,
      entry.user_id,
      entry.linkedUserId,
      entry.linked_user_id,
      email,
      rawLabel,
    );

    if (!id && !rawLabel && !email) {
      continue;
    }

    const candidate: NormalizedTrainerViewModel = {
      id: id || email || rawLabel,
      name: rawLabel ? getTrainerDisplayName(entry) : email || "Allenatore",
      email,
      phone: firstNonEmptyString(
        entry.phone,
        entry.phoneNumber,
        entry.phone_number,
        entry.telefono,
      ),
      categories,
      salary:
        String(firstDefinedValue(entry.salary, entry.compensation, "0") || "0").trim() ||
        "0",
      avatar:
        firstNonEmptyString(
          entry.avatar,
          entry.avatar_url,
          entry.photo,
          entry.photo_url,
          entry.image,
        ) || undefined,
      status: normalizeTrainerStatus(entry.status),
    };

    const candidateKey = normalizeValue(
      candidate.id || candidate.email || candidate.name,
    );
    if (!candidateKey) {
      continue;
    }

    const existingIndex = normalized.findIndex((trainer) => {
      const existingKeys = [
        normalizeValue(trainer.id),
        normalizeValue(trainer.email),
        normalizeValue(trainer.name),
      ].filter(Boolean);

      return existingKeys.includes(candidateKey);
    });

    if (existingIndex === -1) {
      normalized.push(candidate);
      continue;
    }

    const current = normalized[existingIndex];
    normalized[existingIndex] = {
      id: current.id || candidate.id,
      name:
        current.name && normalizeValue(current.name) !== "allenatore"
          ? current.name
          : candidate.name || current.name,
      email: current.email || candidate.email,
      phone: current.phone || candidate.phone,
      categories: normalizeTrainerCategories(
        [...current.categories, ...candidate.categories],
        clubCategories,
      ),
      salary: current.salary || candidate.salary,
      avatar: current.avatar || candidate.avatar,
      status:
        current.status === "suspended" || candidate.status === "suspended"
          ? "suspended"
          : "active",
    };
  }

  return normalized;
};

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
