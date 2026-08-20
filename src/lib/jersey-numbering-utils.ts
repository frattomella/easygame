import type {
  ClothingAssignment,
  ClothingState,
  JerseyNumberAssignment,
  NumberingGroup,
} from "@/lib/clothing-inventory-utils";

const ACTIVE_ASSIGNMENT_STATUSES = new Set([
  "reserved",
  "assigned",
  "delivered",
  "to_order",
  "ordered",
  "in_production",
  "received",
]);

export type JerseyNumberRecord = {
  id: string;
  athleteId: string;
  groupId: string | null;
  number: number | null;
  assignmentId?: string | null;
  itemId?: string | null;
  kitId?: string | null;
  source: "jersey_assignment" | "clothing_assignment";
};

export type JerseyGroupAthleteRow = {
  athleteId: string;
  athlete: any | null;
  athleteName: string;
  categoryLabel: string;
  records: JerseyNumberRecord[];
  numbers: number[];
  duplicateNumbers: number[];
  hasNumber: boolean;
};

export type JerseyGroupSummary = {
  group: NumberingGroup;
  rows: JerseyGroupAthleteRow[];
  usedNumbers: number[];
  missingRows: JerseyGroupAthleteRow[];
  duplicateNumbers: Array<{
    number: number;
    athleteIds: string[];
  }>;
  availableNumbers: number[];
  randomAvailableNumber: number | null;
};

const normalizeText = (value: unknown) => String(value || "").trim();

const toNumberOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getAthleteName = (athlete: any) =>
  [
    athlete?.first_name,
    athlete?.last_name,
    athlete?.firstName,
    athlete?.lastName,
    athlete?.name,
    athlete?.surname,
  ]
    .map(normalizeText)
    .filter(Boolean)
    .slice(0, athlete?.name && athlete?.surname ? 2 : 4)
    .join(" ")
    .trim() ||
  normalizeText(athlete?.displayName) ||
  normalizeText(athlete?.id) ||
  "Atleta";

const getAthleteCategoryValues = (athlete: any) => {
  const values = new Set<string>();
  const data = athlete?.data && typeof athlete.data === "object" ? athlete.data : {};

  [
    athlete?.category_id,
    athlete?.categoryId,
    athlete?.category,
    data?.category_id,
    data?.categoryId,
    data?.category,
  ].forEach((value) => {
    const text = normalizeText(value);
    if (text) values.add(text);
  });

  [athlete?.category_name, athlete?.categoryName, data?.categoryName].forEach(
    (value) => {
      const text = normalizeText(value);
      if (text) values.add(text);
    },
  );

  const categories = Array.isArray(athlete?.categories)
    ? athlete.categories
    : Array.isArray(data?.categories)
      ? data.categories
      : [];
  categories.forEach((value: any) => {
    const text = normalizeText(value?.id || value?.name || value);
    if (text) values.add(text);
  });

  const memberships = Array.isArray(athlete?.categoryMemberships)
    ? athlete.categoryMemberships
    : Array.isArray(data?.categoryMemberships)
      ? data.categoryMemberships
      : [];
  memberships.forEach((membership: any) => {
    [membership?.categoryId, membership?.category_id, membership?.categoryName]
      .map(normalizeText)
      .filter(Boolean)
      .forEach((value) => values.add(value));
  });

  return values;
};

const categoryLabelForAthlete = (
  athlete: any,
  categories: Array<{ id?: string | null; name?: string | null }> = [],
) => {
  const values = getAthleteCategoryValues(athlete);
  const matched = categories.find(
    (category) =>
      values.has(normalizeText(category.id)) ||
      values.has(normalizeText(category.name)),
  );

  return (
    normalizeText(matched?.name) ||
    normalizeText(athlete?.category_name) ||
    normalizeText(athlete?.categoryName) ||
    normalizeText(athlete?.data?.categoryName) ||
    "-"
  );
};

export const getJerseyNumberRecords = (
  state: Pick<ClothingState, "assignments" | "jerseyAssignments">,
): JerseyNumberRecord[] => {
  const directRecords = state.jerseyAssignments.map(
    (assignment: JerseyNumberAssignment) => ({
      id: assignment.id,
      athleteId: assignment.athleteId,
      groupId: assignment.groupId || null,
      number: toNumberOrNull(assignment.number),
      assignmentId: assignment.assignmentId || null,
      itemId: assignment.itemId || null,
      kitId: assignment.kitId || null,
      source: "jersey_assignment" as const,
    }),
  );

  const assignmentRecords = state.assignments
    .filter((assignment: ClothingAssignment) =>
      ACTIVE_ASSIGNMENT_STATUSES.has(assignment.status),
    )
    .flatMap((assignment: ClothingAssignment) =>
      assignment.items
        .map((item) => ({
          id: `${assignment.id}:${item.id}:number`,
          athleteId: assignment.athleteId,
          groupId: item.numberingGroupId || assignment.numberingGroupId || null,
          number: toNumberOrNull(item.number),
          assignmentId: assignment.id,
          itemId: item.itemId,
          kitId: assignment.kitId || null,
          source: "clothing_assignment" as const,
        }))
        .filter((record) => record.number !== null),
    );

  return [...directRecords, ...assignmentRecords];
};

export const getJerseyGroupSummary = ({
  group,
  state,
  athletes,
  categories = [],
}: {
  group: NumberingGroup;
  state: Pick<ClothingState, "assignments" | "jerseyAssignments">;
  athletes: any[];
  categories?: Array<{ id?: string | null; name?: string | null }>;
}): JerseyGroupSummary => {
  const records = getJerseyNumberRecords(state).filter(
    (record) => record.groupId === group.id,
  );
  const recordsByAthleteId = new Map<string, JerseyNumberRecord[]>();
  records.forEach((record) => {
    if (!recordsByAthleteId.has(record.athleteId)) {
      recordsByAthleteId.set(record.athleteId, []);
    }
    recordsByAthleteId.get(record.athleteId)?.push(record);
  });

  const groupCategoryValues = new Set(
    group.categoryIds.map(normalizeText).filter(Boolean),
  );
  const groupAthletes = athletes.filter((athlete) => {
    if (!groupCategoryValues.size) return true;
    const athleteCategories = getAthleteCategoryValues(athlete);
    return Array.from(groupCategoryValues).some((value) =>
      athleteCategories.has(value),
    );
  });
  const athleteById = new Map(
    athletes.map((athlete) => [normalizeText(athlete.id), athlete]),
  );
  const rowAthleteIds = new Set([
    ...groupAthletes.map((athlete) => normalizeText(athlete.id)),
    ...Array.from(recordsByAthleteId.keys()),
  ]);

  const numberAthleteIds = new Map<number, Set<string>>();
  records.forEach((record) => {
    if (record.number === null) return;
    if (!numberAthleteIds.has(record.number)) {
      numberAthleteIds.set(record.number, new Set());
    }
    numberAthleteIds.get(record.number)?.add(record.athleteId);
  });

  const duplicateNumberValues = new Set(
    Array.from(numberAthleteIds.entries())
      .filter(([, athleteIds]) => athleteIds.size > 1)
      .map(([number]) => number),
  );

  const rows = Array.from(rowAthleteIds)
    .filter(Boolean)
    .map((athleteId) => {
      const athlete = athleteById.get(athleteId) || null;
      const athleteRecords = recordsByAthleteId.get(athleteId) || [];
      const numbers = athleteRecords
        .map((record) => record.number)
        .filter((number): number is number => number !== null);

      return {
        athleteId,
        athlete,
        athleteName: getAthleteName(athlete || { id: athleteId }),
        categoryLabel: categoryLabelForAthlete(athlete, categories),
        records: athleteRecords,
        numbers,
        duplicateNumbers: numbers.filter((number) =>
          duplicateNumberValues.has(number),
        ),
        hasNumber: numbers.length > 0,
      };
    })
    .sort((left, right) => left.athleteName.localeCompare(right.athleteName));

  const usedNumbers = Array.from(numberAthleteIds.keys()).sort((a, b) => a - b);
  const availableNumbers = Array.from(
    { length: Math.max(0, group.maxNumber - group.minNumber + 1) },
    (_, index) => group.minNumber + index,
  ).filter(
    (number) =>
      !numberAthleteIds.has(number) && !group.reservedNumbers.includes(number),
  );

  return {
    group,
    rows,
    usedNumbers,
    missingRows: rows.filter((row) => !row.hasNumber),
    duplicateNumbers: Array.from(numberAthleteIds.entries())
      .filter(([, athleteIds]) => athleteIds.size > 1)
      .map(([number, athleteIds]) => ({
        number,
        athleteIds: Array.from(athleteIds),
      })),
    availableNumbers,
    randomAvailableNumber: availableNumbers.length
      ? availableNumbers[Math.floor(Math.random() * availableNumbers.length)]
      : null,
  };
};

export const getAthleteJerseyNumberSummary = ({
  athleteId,
  state,
  groups,
}: {
  athleteId: string;
  state: Pick<ClothingState, "assignments" | "jerseyAssignments">;
  groups: NumberingGroup[];
}) => {
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const records = getJerseyNumberRecords(state).filter(
    (record) => record.athleteId === athleteId,
  );
  const duplicateRecords = records.filter((record) => {
    if (record.number === null || !record.groupId) return false;
    const matches = getJerseyNumberRecords(state).filter(
      (entry) =>
        entry.groupId === record.groupId &&
        entry.number === record.number &&
        entry.athleteId !== athleteId,
    );
    return matches.length > 0;
  });

  return {
    records,
    primaryRecord: records.find((record) => record.number !== null) || null,
    groupNameForRecord: (record: JerseyNumberRecord) =>
      (record.groupId && groupById.get(record.groupId)?.name) || "Senza gruppo",
    duplicateRecords,
  };
};
