import {
  compareAthletesByLastName,
  getAthleteDisplayName,
} from "@/lib/athlete-name-utils";
import { athleteMatchesCategory } from "@/lib/category-utils";
import { getConvocatedAthleteIdsFromMatch } from "@/lib/match-certificate-warnings";
import { recordMatchesCategory } from "@/lib/trainer-dashboard-helpers";

export type CategoryAthleteStat = {
  categoryId: string;
  categoryName: string;
  athleteId: string;
  athleteName: string;
  athlete: any;
  convocations: number;
  totalMatches: number;
  presences: number;
  totalTrainings: number;
  convocationRate: number;
  presenceRate: number;
  /**
   * **Gli eventi che chiedevano una conferma e non l'hanno ricevuta** (W5-09).
   *
   * Non e «assente»: e il silenzio, che e un fatto diverso e piu urgente —
   * l'assente lo sai, il silenzioso e quello che devi chiamare. Prima non era
   * calcolabile affatto, perche nessun evento chiedeva mai una conferma
   * (W5-05) e la risposta non aveva un evento a cui appoggiarsi (ADR-0098).
   */
  noResponse: number;
  rsvpRequested: number;
};

const PRESENT_STATUSES = new Set(["present", "presente", "yes", "true"]);

const normalizeValue = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const normalizeId = (value: unknown) => String(value || "").trim();

const getAthleteId = (athlete: any) =>
  normalizeId(athlete?.id || athlete?.athleteId || athlete?.athlete_id);

const getTrainingId = (training: any) =>
  normalizeId(training?.id || training?.trainingId || training?.training_id);

const getAttendanceTrainingId = (entry: any) =>
  normalizeId(entry?.trainingId || entry?.training_id || entry?.training?.id);

const getAttendanceAthleteId = (entry: any) =>
  normalizeId(entry?.athleteId || entry?.athlete_id || entry?.id);

const isPresentAttendanceEntry = (entry: any) => {
  const status = normalizeValue(entry?.status);
  return entry?.present === true || entry?.is_present === true || PRESENT_STATUSES.has(status);
};

/**
 * Le presenze raggruppate per allenamento, calcolate **una volta sola**.
 *
 * **Il difetto che chiude, e qui era il peggiore.** Le presenze di un atleta
 * si contavano con `categoryTrainings.filter(...)` **dentro** un
 * `categoryAthletes.map(...)`, e ogni giro rileggeva l'intero elenco delle
 * presenze del club. Con trenta atleti, cento allenamenti e centoventottomila
 * righe di presenza sono trecentottantaquattro milioni di confronti per una
 * sola categoria. Nessuno se ne accorge su un club di settanta atleti.
 */
const attendanceIndexCache = new WeakMap<any[], Map<string, any[]>>();

const getAttendanceByTrainingId = (attendance: any[]) => {
  const cached = attendanceIndexCache.get(attendance);
  if (cached) return cached;

  const index = new Map<string, any[]>();
  for (const entry of attendance) {
    const trainingId = getAttendanceTrainingId(entry);
    if (!trainingId) continue;

    const bucket = index.get(trainingId);
    if (bucket) bucket.push(entry);
    else index.set(trainingId, [entry]);
  }

  attendanceIndexCache.set(attendance, index);
  return index;
};

const getTrainingAttendanceEntries = (training: any, attendance: any[] = []) => {
  const trainingId = getTrainingId(training);
  const embeddedEntries = Array.isArray(training?.attendance)
    ? training.attendance
    : [];
  const externalEntries = trainingId
    ? getAttendanceByTrainingId(attendance).get(trainingId) || []
    : [];

  return [...embeddedEntries, ...externalEntries];
};

const resolveTargetCategory = (
  categoryId: string,
  categories: Array<{ id?: string | null; name?: string | null }> = [],
) => {
  const normalizedCategoryId = normalizeValue(categoryId);
  const matchedCategory = categories.find(
    (category) =>
      normalizeValue(category?.id) === normalizedCategoryId ||
      normalizeValue(category?.name) === normalizedCategoryId,
  );

  return (
    matchedCategory || {
      id: categoryId,
      name: categoryId,
    }
  );
};

const athleteBelongsToCategory = (
  athlete: any,
  category: { id?: string | null; name?: string | null },
  categories: Array<{ id?: string | null; name?: string | null }> = [],
) =>
  athleteMatchesCategory(athlete, {
    id: normalizeId(category?.id),
    name: normalizeId(category?.name),
  }) || recordMatchesCategory(athlete, category, categories);

export function calculateCategoryAthleteStats(
  categoryId: string,
  athletes: any[] = [],
  trainings: any[] = [],
  attendance: any[] = [],
  matches: any[] = [],
  categories: Array<{ id?: string | null; name?: string | null }> = [],
): CategoryAthleteStat[] {
  const targetCategory = resolveTargetCategory(categoryId, categories);
  const targetCategoryId = normalizeId(targetCategory?.id || categoryId);
  const targetCategoryName = normalizeId(
    targetCategory?.name || targetCategory?.id || categoryId,
  );
  const categoryAthletes = (Array.isArray(athletes) ? athletes : [])
    .filter((athlete) =>
      athleteBelongsToCategory(athlete, targetCategory, categories),
    )
    .sort(compareAthletesByLastName);
  const categoryTrainings = (Array.isArray(trainings) ? trainings : []).filter(
    (training) => recordMatchesCategory(training, targetCategory, categories),
  );
  const categoryMatches = (Array.isArray(matches) ? matches : []).filter((match) =>
    recordMatchesCategory(match, targetCategory, categories),
  );

  /*
    Presenze e convocazioni si contano **prima**, per tutti gli atleti insieme.

    Il ciclo di prima faceva, per ogni atleta, un giro su tutti gli
    allenamenti e dentro un giro su tutte le presenze di quell'allenamento —
    che sono una per atleta. Era atleti x allenamenti x atleti: raddoppiando
    la categoria il lavoro quadruplicava, e un solo indice per allenamento non
    bastava a toglierlo. Qui si scorre ogni riga una volta, e poi si legge.
  */
  const presentTrainingsByAthlete = new Map<string, Set<string>>();
  categoryTrainings.forEach((training, index) => {
    // Un allenamento senza id resta distinguibile dagli altri: contarne due
    // come uno solo abbasserebbe le presenze di chi c'era.
    const trainingKey = getTrainingId(training) || `#${index}`;

    for (const entry of getTrainingAttendanceEntries(training, attendance)) {
      if (!isPresentAttendanceEntry(entry)) continue;

      const entryAthleteId = getAttendanceAthleteId(entry);
      if (!entryAthleteId) continue;

      const bucket = presentTrainingsByAthlete.get(entryAthleteId);
      if (bucket) bucket.add(trainingKey);
      else presentTrainingsByAthlete.set(entryAthleteId, new Set([trainingKey]));
    }
  });

  /*
    Il silenzio si conta sugli eventi che una conferma l'hanno **chiesta**:
    contarlo su tutti direbbe che ogni famiglia tace su ogni allenamento, che e
    vero e non serve a nessuno.
  */
  const eventiConRsvp = categoryTrainings.filter((training: any) =>
    Boolean(training?.rsvpRequired ?? training?.rsvp_required ?? false),
  );
  const rispostiPerAtleta = new Map<string, Set<string>>();
  eventiConRsvp.forEach((training: any, index: number) => {
    const trainingKey = getTrainingId(training) || `#rsvp-${index}`;
    for (const entry of getTrainingAttendanceEntries(training, attendance)) {
      const stato = normalizeValue(entry?.rsvp_status ?? entry?.rsvpStatus);
      if (!stato) continue;

      const entryAthleteId = getAttendanceAthleteId(entry);
      if (!entryAthleteId) continue;

      const bucket = rispostiPerAtleta.get(entryAthleteId);
      if (bucket) bucket.add(trainingKey);
      else rispostiPerAtleta.set(entryAthleteId, new Set([trainingKey]));
    }
  });

  const convocationsByAthlete = new Map<string, number>();
  for (const match of categoryMatches) {
    for (const convocatedId of new Set(getConvocatedAthleteIdsFromMatch(match))) {
      convocationsByAthlete.set(
        convocatedId,
        (convocationsByAthlete.get(convocatedId) || 0) + 1,
      );
    }
  }

  return categoryAthletes.map((athlete) => {
    const athleteId = getAthleteId(athlete);
    const convocations = convocationsByAthlete.get(athleteId) || 0;
    const presences = presentTrainingsByAthlete.get(athleteId)?.size || 0;
    const totalMatches = categoryMatches.length;
    const totalTrainings = categoryTrainings.length;

    return {
      categoryId: targetCategoryId,
      categoryName: targetCategoryName,
      athleteId,
      athleteName: getAthleteDisplayName(athlete),
      athlete,
      convocations,
      totalMatches,
      presences,
      totalTrainings,
      convocationRate: totalMatches
        ? Math.round((convocations / totalMatches) * 100)
        : 0,
      presenceRate: totalTrainings
        ? Math.round((presences / totalTrainings) * 100)
        : 0,
      rsvpRequested: eventiConRsvp.length,
      noResponse: Math.max(
        0,
        eventiConRsvp.length - (rispostiPerAtleta.get(athleteId)?.size || 0),
      ),
    };
  });
}
