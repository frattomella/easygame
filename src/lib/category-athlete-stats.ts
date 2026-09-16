import {
  compareAthletesByLastName,
  getAthleteDisplayName,
} from "@/lib/athlete-name-utils";
import {
  categoryIdentity,
  normalizeCategoryToken,
  sameCategory,
} from "@/lib/categories/identity";
import { isCancelledEvent } from "@/lib/events/model";
import { getConvocatedAthleteIdsFromMatch } from "@/lib/match-certificate-warnings";
import { recordMatchesCategory } from "@/lib/trainer-dashboard-helpers";
import { attachParticipationToEvents } from "@/lib/trainer-operational-alerts";

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
  /**
   * Vero per chi **oggi non e piu** in questa categoria ma ha presenze,
   * convocazioni o risposte su eventi suoi (ADR-0194 §19): la riga resta
   * nel rapporto perche la storia e della categoria in cui e successa, e
   * il lettore lo dice invece di far sparire le presenze.
   */
  formerMember: boolean;
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

/**
 * **La categoria di cui si sta facendo il conto** (D-INT-2, ADR-0155).
 *
 * Qui c'era `find` con un `||` fra identificativo e nome, cioe: davanti a due
 * «Under 15» su due sedi rispondeva **la prima**, e il blocco di report
 * usciva con dentro i due organici mescolati — mentre per l'altra categoria
 * non usciva nessun blocco.
 *
 * Adesso risolve la primitiva: se il riferimento nomina una categoria sola, e
 * quella; se ne nomina due, non ne nomina nessuna, e si ricade sul
 * riferimento cosi com'e — che non e l'identificativo di nessuna e quindi non
 * ruba l'organico a nessuna delle due.
 */
const resolveTargetCategory = (
  categoryId: string,
  categories: Array<{ id?: string | null; name?: string | null }> = [],
) => {
  const identita = categoryIdentity({ id: categoryId }, categories);

  for (const category of categories) {
    if (
      category?.id &&
      identita.identificativi.has(normalizeCategoryToken(category.id))
    ) {
      return category;
    }
  }

  return { id: categoryId, name: categoryId };
};

/**
 * **Una domanda, una risposta** (D-INT-2).
 *
 * Qui c'era un `||` fra le **due** risposte canoniche di allora:
 * `athleteMatchesCategory` senza catalogo (quindi incapace di distinguere due
 * omonime) **oppure** `recordMatchesCategory` con il catalogo. Un `||` fra una
 * regola stretta e una larga vale sempre la larga: la meta corretta non poteva
 * restringere niente, e la correzione di una delle due non si sarebbe vista.
 *
 * Adesso le due sono la stessa funzione, e questa la chiama una volta.
 */
const athleteBelongsToCategory = (
  athlete: any,
  category: { id?: string | null; name?: string | null },
  categories: Array<{ id?: string | null; name?: string | null }> = [],
) => sameCategory(athlete, category, categories);

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
  /*
    **Un evento annullato non e un evento a cui qualcuno e mancato** (P0-3,
    D-AUD-10).

    Qui gli annullati si contavano come tutti gli altri: annullarne cinque su
    venti faceva scendere il tasso di presenza di **ogni** atleta dal 100% al
    75%, e ne aggiungeva cinque al «senza risposta» — su allenamenti che non
    ci sono mai stati.

    Non e un dettaglio di visualizzazione: quel numero e cio che un allenatore
    guarda per decidere chi chiamare. La misura dei contributi gia lo faceva
    (`funding/attendance-measure.ts`), ed era l unico posto in cui la domanda
    era fatta bene: adesso la primitiva e una sola e sta nel dominio degli
    eventi.
  */
  const categoryTrainings = (Array.isArray(trainings) ? trainings : [])
    .filter((training) => !isCancelledEvent(training))
    .filter((training) => recordMatchesCategory(training, targetCategory, categories));
  const categoryMatches = (Array.isArray(matches) ? matches : [])
    .filter((match) => !isCancelledEvent(match))
    .filter((match) => recordMatchesCategory(match, targetCategory, categories));

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

  /*
    **La convocazione e una colonna, non una grafia del payload** (`D-AUD-9`).

    `getConvocatedAthleteIdsFromMatch` legge l'unione di quattordici chiavi
    dentro la gara — `convocatedAthletes`, `calledAthletes`, `selectedAthleteIds`…
    — e dopo ADR-0099 **nessuna di quelle la scrive piu nessuno**: la rosa e
    `club_event_participants.convocation_status`, con il suo scrittore
    (`saveEventConvocations`). Misurato dalla sonda
    `scripts/audit-finale-report-canonici-probe.mjs`: si convoca un atleta
    dalla rotta canonica, e la statistica per categoria dice «0 convocazioni»
    per tutti — su ogni gara, per sempre.

    Le righe questa funzione **le ha gia**: sono `attendance`, cioe le stesse
    che porta `training_attendance`, e la colonna sta su quelle. Non serve una
    seconda lettura, serve guardare la colonna giusta — e la proiezione e la
    stessa che usa la bacheca dell'allenatore, cosi le due superfici non
    possono divergere.
  */
  const matchesConRosa = attachParticipationToEvents(categoryMatches, attendance);

  const convocationsByAthlete = new Map<string, number>();
  for (const match of matchesConRosa) {
    for (const convocatedId of new Set(getConvocatedAthleteIdsFromMatch(match))) {
      convocationsByAthlete.set(
        convocatedId,
        (convocationsByAthlete.get(convocatedId) || 0) + 1,
      );
    }
  }

  /*
    **La storia non si riclassifica con l'appartenenza corrente** (ADR-0194
    §19). Una presenza o una convocazione registrata su un evento di questa
    categoria e un fatto di questa categoria, anche se oggi l'atleta e
    passato a un'altra: la riga dell'evento porta il contesto, e il rapporto
    lo legge da li. Fin qui il rapporto elencava i soli membri **correnti**,
    e un ragazzo passato da Under 15 a Under 17 perdeva a settembre le 35
    presenze Under 15 che aveva fatto. Adesso entra chi ha una riga su un
    evento della categoria, e resta chi ne e membro oggi.
  */
  const idsCorrenti = new Set(categoryAthletes.map((athlete) => getAthleteId(athlete)));
  const conStoria = (Array.isArray(athletes) ? athletes : [])
    .filter((athlete) => {
      const id = getAthleteId(athlete);
      return id && !idsCorrenti.has(id) && (presentTrainingsByAthlete.has(id) || convocationsByAthlete.has(id) || rispostiPerAtleta.has(id));
    })
    .sort(compareAthletesByLastName);
  const conMembriStorici = [...categoryAthletes, ...conStoria];

  return conMembriStorici.map((athlete) => {
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
      formerMember: !idsCorrenti.has(athleteId),
    };
  });
}
