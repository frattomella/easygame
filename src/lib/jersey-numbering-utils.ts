/**
 * Numeri di maglia e gruppi numerazione.
 *
 * Il modulo risponde a una domanda sola: dato un gruppo numerazione, **quali
 * atleti ne fanno parte e con che numero**. Tre scelte che vale la pena
 * conoscere prima di modificarlo:
 *
 * 1. **il riconoscimento della categoria non e riscritto qui**. Chi appartiene
 *    a una categoria lo dice `athlete-category-memberships`, chi e utilizzabile
 *    in una categoria adiacente lo dice `category-compatibility`. Prima questo
 *    file aveva la sua lettura privata delle categorie, confrontava le
 *    stringhe **rispettando le maiuscole** e ignorava le membership in
 *    snake_case: gli atleti la cui categoria era registrata con una forma
 *    diversa sparivano dai gruppi senza alcun errore;
 * 2. **il nome dell'atleta non e ricomposto qui**. Lo formatta
 *    `athlete-name-utils` (Cognome poi Nome). La composizione locale
 *    concatenava tutti i campi nome trovati e, poiche l'API espone sia
 *    `first_name`/`last_name` sia l'alias `name`, stampava «Mario Rossi Mario
 *    Rossi»;
 * 3. **gli indici si costruiscono una volta**. `buildJerseyNumberIndex`
 *    scorre le assegnazioni una sola volta per tutti i gruppi: prima ogni
 *    gruppo rileggeva l'intero stato, e il riepilogo per atleta rileggeva lo
 *    stato una volta per record.
 */

import type {
  ClothingAssignment,
  ClothingState,
  JerseyNumberAssignment,
  NumberingGroup,
} from "@/lib/clothing-inventory-utils";
import {
  buildCategoryCompatibilityIndex,
  buildCategoryIdSet,
  getAthleteCategoryEligibility,
  getEligibilityKindForSet,
  type AthleteCategoryEligibility,
  type CategoryCompatibilityIndex,
  type CategoryCompatibilityInput,
  type CategoryEligibilityKind,
} from "@/lib/category-compatibility";
import { formatAthleteNameLastFirst } from "@/lib/athlete-name-utils";
import { compareNameValues } from "@/lib/sorting";

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

/**
 * Come una riga e finita nel gruppo.
 *
 * `external` copre il caso reale in cui un atleta ha un numero assegnato nel
 * gruppo pur non appartenendo (piu) a nessuna delle sue categorie: il numero
 * va mostrato comunque, altrimenti resterebbe occupato e invisibile.
 */
export type JerseyGroupMembershipKind =
  | Exclude<CategoryEligibilityKind, "none">
  | "external";

export type JerseyGroupAthleteRow = {
  athleteId: string;
  athlete: any | null;
  athleteName: string;
  categoryLabel: string;
  membership: JerseyGroupMembershipKind;
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

/**
 * Indice delle assegnazioni numero, costruito una volta e condiviso da tutti
 * i gruppi della pagina.
 */
export type JerseyNumberIndex = {
  records: JerseyNumberRecord[];
  byGroupId: Map<string, JerseyNumberRecord[]>;
  byAthleteId: Map<string, JerseyNumberRecord[]>;
};

const normalizeText = (value: unknown) => String(value || "").trim();

const toNumberOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

const pushToBucket = <T>(map: Map<string, T[]>, key: string, value: T) => {
  const bucket = map.get(key);
  if (bucket) {
    bucket.push(value);
  } else {
    map.set(key, [value]);
  }
};

/**
 * Costruisce gli indici per gruppo e per atleta con una sola scansione dello
 * stato. Con N assegnazioni e G gruppi il costo passa da O(N x G) a O(N + G).
 */
export const buildJerseyNumberIndex = (
  state: Pick<ClothingState, "assignments" | "jerseyAssignments">,
): JerseyNumberIndex => {
  const records = getJerseyNumberRecords(state);
  const byGroupId = new Map<string, JerseyNumberRecord[]>();
  const byAthleteId = new Map<string, JerseyNumberRecord[]>();

  records.forEach((record) => {
    if (record.groupId) {
      pushToBucket(byGroupId, record.groupId, record);
    }
    if (record.athleteId) {
      pushToBucket(byAthleteId, record.athleteId, record);
    }
  });

  return { records, byGroupId, byAthleteId };
};

/**
 * Etichetta di categoria da mostrare in griglia: la categoria **primaria**
 * dell'atleta, non la prima che capita fra quelle configurate.
 */
const categoryLabelForEligibility = (
  eligibility: AthleteCategoryEligibility,
  index: CategoryCompatibilityIndex,
) => {
  const primary = eligibility.primaryCategoryId
    ? index.getCategoryName(eligibility.primaryCategoryId)
    : "";
  if (primary) {
    return primary;
  }

  const first = eligibility.memberCategoryIds[0];
  return first ? index.getCategoryName(first) : "-";
};

type GroupSummaryContext = {
  index: JerseyNumberIndex;
  categoryIndex: CategoryCompatibilityIndex;
  athleteById: Map<string, any>;
  eligibilityByAthleteId: Map<string, AthleteCategoryEligibility>;
  /**
   * Nome «Cognome Nome» gia composto. E anche la chiave di ordinamento: si
   * calcola una volta per atleta invece che a ogni confronto di `sort`, dove
   * ricomporlo dominava il costo del riepilogo.
   */
  displayNameByAthleteId: Map<string, string>;
  athletes: any[];
};

const buildGroupSummary = (
  group: NumberingGroup,
  context: GroupSummaryContext,
): JerseyGroupSummary => {
  const {
    index,
    categoryIndex,
    athleteById,
    eligibilityByAthleteId,
    displayNameByAthleteId,
    athletes,
  } = context;

  const records = index.byGroupId.get(group.id) || [];
  const recordsByAthleteId = new Map<string, JerseyNumberRecord[]>();
  records.forEach((record) => {
    pushToBucket(recordsByAthleteId, record.athleteId, record);
  });

  const groupCategoryIds = Array.from(
    new Set(
      group.categoryIds
        .map((value) => categoryIndex.resolveCategoryId(value))
        .filter(Boolean),
    ),
  );
  const includeCompatible = Boolean(group.includeCompatibleCategories);
  // L'insieme si normalizza una volta per gruppo, non una volta per atleta.
  const groupCategoryIdSet = buildCategoryIdSet(groupCategoryIds);

  const numberAthleteIds = new Map<number, Set<string>>();
  records.forEach((record) => {
    if (record.number === null) return;
    const athleteIds = numberAthleteIds.get(record.number);
    if (athleteIds) {
      athleteIds.add(record.athleteId);
    } else {
      numberAthleteIds.set(record.number, new Set([record.athleteId]));
    }
  });

  const duplicateNumberValues = new Set(
    Array.from(numberAthleteIds.entries())
      .filter(([, athleteIds]) => athleteIds.size > 1)
      .map(([number]) => number),
  );

  const membershipByAthleteId = new Map<string, JerseyGroupMembershipKind>();

  athletes.forEach((athlete) => {
    const athleteId = normalizeText(athlete?.id);
    if (!athleteId) return;

    // Un gruppo senza categorie configurate copre tutto il club: e la
    // convenzione gia in uso e va preservata.
    if (!groupCategoryIds.length) {
      membershipByAthleteId.set(athleteId, "primary");
      return;
    }

    const eligibility = eligibilityByAthleteId.get(athleteId);
    if (!eligibility) return;

    const kind = getEligibilityKindForSet({
      eligibility,
      categoryIdSet: groupCategoryIdSet,
      includeCompatible,
    });

    if (kind !== "none") {
      membershipByAthleteId.set(athleteId, kind);
    }
  });

  // Un atleta con un numero assegnato resta in griglia anche se non e (piu)
  // nelle categorie del gruppo: il suo numero e comunque occupato.
  recordsByAthleteId.forEach((_records, athleteId) => {
    if (!membershipByAthleteId.has(athleteId)) {
      membershipByAthleteId.set(athleteId, "external");
    }
  });

  const rows = Array.from(membershipByAthleteId.entries())
    .map(([athleteId, membership]) => {
      const athlete = athleteById.get(athleteId) || null;
      const athleteRecords = recordsByAthleteId.get(athleteId) || [];
      const numbers = athleteRecords
        .map((record) => record.number)
        .filter((number): number is number => number !== null);
      const eligibility = eligibilityByAthleteId.get(athleteId);

      return {
        athleteId,
        athlete,
        athleteName:
          displayNameByAthleteId.get(athleteId) || "Atleta non trovato",
        categoryLabel: eligibility
          ? categoryLabelForEligibility(eligibility, categoryIndex)
          : "-",
        membership,
        records: athleteRecords,
        numbers,
        duplicateNumbers: numbers.filter((number) =>
          duplicateNumberValues.has(number),
        ),
        hasNumber: numbers.length > 0,
      };
    })
    .sort(
      (left, right) =>
        compareNameValues(left.athleteName, right.athleteName) ||
        (left.athleteId < right.athleteId ? -1 : 1),
    );

  const usedNumbers = Array.from(numberAthleteIds.keys()).sort((a, b) => a - b);
  const reservedNumbers = new Set(group.reservedNumbers);
  const availableNumbers = Array.from(
    { length: Math.max(0, group.maxNumber - group.minNumber + 1) },
    (_, offset) => group.minNumber + offset,
  ).filter(
    (number) => !numberAthleteIds.has(number) && !reservedNumbers.has(number),
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

const buildSummaryContext = ({
  state,
  athletes,
  categories,
  index,
  categoryIndex,
}: {
  state: Pick<ClothingState, "assignments" | "jerseyAssignments">;
  athletes: any[];
  categories: readonly CategoryCompatibilityInput[];
  index?: JerseyNumberIndex;
  categoryIndex?: CategoryCompatibilityIndex;
}): GroupSummaryContext => {
  const resolvedCategoryIndex =
    categoryIndex || buildCategoryCompatibilityIndex(categories);
  const athleteById = new Map<string, any>();
  const eligibilityByAthleteId = new Map<string, AthleteCategoryEligibility>();
  const displayNameByAthleteId = new Map<string, string>();

  athletes.forEach((athlete) => {
    const athleteId = normalizeText(athlete?.id);
    if (!athleteId) return;
    athleteById.set(athleteId, athlete);
    displayNameByAthleteId.set(athleteId, formatAthleteNameLastFirst(athlete));
    // L'eleggibilita si calcola una volta per atleta, non una volta per
    // (atleta, gruppo): normalizzare le membership e la parte cara.
    eligibilityByAthleteId.set(
      athleteId,
      getAthleteCategoryEligibility({ athlete, index: resolvedCategoryIndex }),
    );
  });

  return {
    index: index || buildJerseyNumberIndex(state),
    categoryIndex: resolvedCategoryIndex,
    athleteById,
    eligibilityByAthleteId,
    displayNameByAthleteId,
    athletes,
  };
};

/**
 * Riepilogo di **tutti** i gruppi in una passata sola. E la forma da preferire
 * quando i gruppi sono piu di uno.
 */
export const getJerseyGroupSummaries = ({
  groups,
  state,
  athletes,
  categories = [],
}: {
  groups: readonly NumberingGroup[];
  state: Pick<ClothingState, "assignments" | "jerseyAssignments">;
  athletes: any[];
  categories?: readonly CategoryCompatibilityInput[];
}): JerseyGroupSummary[] => {
  const context = buildSummaryContext({ state, athletes, categories });
  return groups.map((group) => buildGroupSummary(group, context));
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
  categories?: readonly CategoryCompatibilityInput[];
}): JerseyGroupSummary =>
  buildGroupSummary(
    group,
    buildSummaryContext({ state, athletes, categories }),
  );

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
  const index = buildJerseyNumberIndex(state);
  const records = index.byAthleteId.get(athleteId) || [];

  // Prima ogni record rileggeva l'intero stato per cercare i duplicati: con
  // l'indice il confronto e una lettura di mappa.
  const duplicateRecords = records.filter((record) => {
    if (record.number === null || !record.groupId) return false;
    return (index.byGroupId.get(record.groupId) || []).some(
      (entry) =>
        entry.number === record.number && entry.athleteId !== athleteId,
    );
  });

  return {
    records,
    primaryRecord: records.find((record) => record.number !== null) || null,
    groupNameForRecord: (record: JerseyNumberRecord) =>
      (record.groupId && groupById.get(record.groupId)?.name) || "Senza gruppo",
    duplicateRecords,
  };
};
