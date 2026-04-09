export type AthleteCategoryMembership = {
  id: string;
  organizationId?: string | null;
  athleteId?: string | null;
  categoryId: string;
  categoryName: string;
  isPrimary: boolean;
  source: "membership" | "data" | "legacy";
};

export type AthleteCategoryRelationship = "primary" | "secondary" | "none";
export type ParticipationCategoryContext = "primary" | "secondary" | "extra";

type CategoryOptionLike = {
  id?: string | null;
  name?: string | null;
};

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeReference = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const firstNonEmptyString = (...values: unknown[]) => {
  for (const value of values) {
    const candidate = String(value || "").trim();
    if (candidate) {
      return candidate;
    }
  }

  return "";
};

const buildCategoryLookup = (categories: CategoryOptionLike[] = []) => {
  const byReference = new Map<string, { id: string; name: string }>();

  categories.forEach((category) => {
    const id = String(category?.id || "").trim();
    const name = String(category?.name || "").trim();

    if (id) {
      byReference.set(normalizeReference(id), {
        id,
        name: name || id,
      });
    }

    if (name) {
      byReference.set(normalizeReference(name), {
        id: id || name,
        name,
      });
    }
  });

  return byReference;
};

const resolveCategoryIdentity = (
  rawId: unknown,
  rawName: unknown,
  categories: CategoryOptionLike[] = [],
) => {
  const id = String(rawId || "").trim();
  const name = String(rawName || "").trim();
  const lookup = buildCategoryLookup(categories);
  const matched =
    lookup.get(normalizeReference(id)) || lookup.get(normalizeReference(name));

  return {
    categoryId: matched?.id || id || name,
    categoryName: matched?.name || name || id || "Categoria",
  };
};

const toMembership = (
  value: unknown,
  categories: CategoryOptionLike[] = [],
  source: AthleteCategoryMembership["source"] = "membership",
  primaryHint = false,
): AthleteCategoryMembership | null => {
  if (typeof value === "string") {
    const identity = resolveCategoryIdentity(value, value, categories);
    if (!identity.categoryId) {
      return null;
    }

    return {
      id: `${identity.categoryId}:${source}`,
      categoryId: identity.categoryId,
      categoryName: identity.categoryName,
      isPrimary: primaryHint,
      source,
    };
  }

  if (!isRecord(value)) {
    return null;
  }

  const identity = resolveCategoryIdentity(
    value.category_id ?? value.categoryId ?? value.id ?? value.value,
    value.category_name ??
      value.categoryName ??
      value.name ??
      value.label ??
      value.title,
    categories,
  );

  if (!identity.categoryId) {
    return null;
  }

  return {
    id: String(value.id || `${identity.categoryId}:${source}`).trim(),
    organizationId:
      firstNonEmptyString(value.organization_id, value.organizationId) || null,
    athleteId: firstNonEmptyString(value.athlete_id, value.athleteId) || null,
    categoryId: identity.categoryId,
    categoryName: identity.categoryName,
    isPrimary: Boolean(
      value.is_primary ??
        value.isPrimary ??
        value.primary ??
        value.isPrimaryCategory ??
        primaryHint,
    ),
    source,
  };
};

const pushMembership = (
  target: AthleteCategoryMembership[],
  membership: AthleteCategoryMembership | null,
) => {
  if (!membership || !membership.categoryId) {
    return;
  }

  target.push(membership);
};

const collectMemberships = (
  source: unknown,
  categories: CategoryOptionLike[] = [],
  origin: AthleteCategoryMembership["source"] = "membership",
  primaryHint = false,
) => {
  const memberships: AthleteCategoryMembership[] = [];

  if (Array.isArray(source)) {
    source.forEach((entry, index) => {
      collectMemberships(
        entry,
        categories,
        origin,
        primaryHint || index === 0,
      ).forEach((membership) => memberships.push(membership));
    });
    return memberships;
  }

  if (typeof source === "string" || isRecord(source)) {
    pushMembership(memberships, toMembership(source, categories, origin, primaryHint));

    if (isRecord(source)) {
      const nestedSources = [
        source.payload,
        source.category,
        source.categories,
        source.memberships,
        source.categoryMemberships,
        source.category_memberships,
      ].filter((value) => value !== undefined);

      nestedSources.forEach((nested) => {
        collectMemberships(nested, categories, origin, primaryHint).forEach(
          (membership) => memberships.push(membership),
        );
      });
    }
  }

  return memberships;
};

const dedupeMemberships = (memberships: AthleteCategoryMembership[]) => {
  const deduped = new Map<string, AthleteCategoryMembership>();

  memberships.forEach((membership) => {
    const key =
      normalizeReference(membership.categoryId) ||
      normalizeReference(membership.categoryName);
    if (!key) {
      return;
    }

    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, membership);
      return;
    }

    deduped.set(key, {
      ...existing,
      id: existing.id || membership.id,
      categoryId: existing.categoryId || membership.categoryId,
      categoryName: existing.categoryName || membership.categoryName,
      organizationId: existing.organizationId || membership.organizationId,
      athleteId: existing.athleteId || membership.athleteId,
      isPrimary: existing.isPrimary || membership.isPrimary,
      source: existing.source === "legacy" ? membership.source : existing.source,
    });
  });

  const values = Array.from(deduped.values());
  if (values.length === 0) {
    return values;
  }

  let primaryAssigned = false;
  return values
    .map((membership, index) => {
      if (membership.isPrimary && !primaryAssigned) {
        primaryAssigned = true;
        return membership;
      }

      if (!primaryAssigned && index === 0) {
        primaryAssigned = true;
        return {
          ...membership,
          isPrimary: true,
        };
      }

      return {
        ...membership,
        isPrimary: false,
      };
    })
    .sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary));
};

export const normalizeAthleteCategoryMemberships = (
  athleteOrMemberships: unknown,
  categories: CategoryOptionLike[] = [],
) => {
  if (Array.isArray(athleteOrMemberships)) {
    return dedupeMemberships(
      collectMemberships(athleteOrMemberships, categories, "membership"),
    );
  }

  if (!isRecord(athleteOrMemberships)) {
    return [];
  }

  const athlete = athleteOrMemberships;
  const data = isRecord(athlete.data) ? athlete.data : {};
  const memberships: AthleteCategoryMembership[] = [];

  [
    athlete.category_memberships,
    athlete.categoryMemberships,
    athlete.memberships,
    data.categoryMemberships,
    data.category_memberships,
  ].forEach((source) => {
    collectMemberships(source, categories, "membership").forEach((membership) =>
      memberships.push(membership),
    );
  });

  if (Array.isArray(athlete.categories)) {
    collectMemberships(athlete.categories, categories, "data").forEach(
      (membership) => memberships.push(membership),
    );
  }

  if (Array.isArray(data.categories)) {
    collectMemberships(data.categories, categories, "data").forEach(
      (membership) => memberships.push(membership),
    );
  }

  pushMembership(
    memberships,
    toMembership(
      {
        category_id:
          athlete.category_id ?? data.category_id ?? data.categoryId,
        category_name:
          athlete.category_name ??
          data.category_name ??
          data.categoryName ??
          athlete.category ??
          data.category,
        is_primary: true,
        athlete_id: athlete.id,
        organization_id: athlete.organization_id || athlete.club_id,
      },
      categories,
      "legacy",
      true,
    ),
  );

  return dedupeMemberships(memberships);
};

export const getPrimaryAthleteCategoryMembership = (
  athleteOrMemberships: unknown,
  categories: CategoryOptionLike[] = [],
) =>
  normalizeAthleteCategoryMemberships(athleteOrMemberships, categories).find(
    (membership) => membership.isPrimary,
  ) || null;

export const getAthleteCategoryLabels = (
  athleteOrMemberships: unknown,
  categories: CategoryOptionLike[] = [],
) =>
  normalizeAthleteCategoryMemberships(athleteOrMemberships, categories).map(
    (membership) => membership.categoryName,
  );

const getCategoryReferences = (
  category: CategoryOptionLike | string | null | undefined,
) =>
  (typeof category === "string" ? [category] : [category?.id, category?.name])
    .map(normalizeReference)
    .filter(Boolean);

export const getAthleteCategoryReferences = (
  athleteOrMemberships: unknown,
  categories: CategoryOptionLike[] = [],
) =>
  normalizeAthleteCategoryMemberships(athleteOrMemberships, categories).flatMap(
    (membership) =>
      [membership.categoryId, membership.categoryName]
        .map(normalizeReference)
        .filter(Boolean),
  );

export const getAthleteCategoryRelationship = (
  athlete: unknown,
  categories: Array<CategoryOptionLike | string> = [],
): AthleteCategoryRelationship => {
  const categoryReferences = categories.flatMap((category) =>
    getCategoryReferences(category),
  );

  if (categoryReferences.length === 0) {
    return "none";
  }

  const memberships = normalizeAthleteCategoryMemberships(athlete);
  const matched = memberships.filter((membership) =>
    [membership.categoryId, membership.categoryName]
      .map(normalizeReference)
      .filter(Boolean)
      .some((reference) => categoryReferences.includes(reference)),
  );

  if (matched.some((membership) => membership.isPrimary)) {
    return "primary";
  }

  if (matched.length > 0) {
    return "secondary";
  }

  return "none";
};

export const getParticipationCategoryContext = ({
  athlete,
  eventCategories = [],
  entry,
}: {
  athlete?: unknown;
  eventCategories?: Array<CategoryOptionLike | string>;
  entry?: Record<string, any> | null;
}): ParticipationCategoryContext => {
  const explicitType = firstNonEmptyString(
    entry?.categoryMembershipType,
    entry?.category_membership_type,
    entry?.relationshipToTrainingCategory,
    entry?.relationshipToMatchCategory,
    entry?.relationshipToEventCategory,
  ).toLowerCase();

  if (explicitType === "primary") {
    return "primary";
  }

  if (explicitType === "secondary") {
    return "secondary";
  }

  if (
    explicitType === "extra" ||
    entry?.isExtraCategory ||
    entry?.is_extra_category ||
    entry?.isManualExtra ||
    entry?.is_manual_extra
  ) {
    return "extra";
  }

  const relationship = getAthleteCategoryRelationship(athlete, eventCategories);
  if (relationship === "primary") {
    return "primary";
  }

  if (relationship === "secondary") {
    return "secondary";
  }

  return "extra";
};

export const getParticipationCategoryBadgeLabel = (
  context: ParticipationCategoryContext,
) => {
  if (context === "secondary") {
    return "Secondaria";
  }

  if (context === "extra") {
    return "Extra categoria";
  }

  return "Primaria";
};
