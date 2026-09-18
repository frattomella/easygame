import { prisma } from "@/lib/server/prisma";
import { createSystemExecutionContext } from "@/lib/server/system-actor";
import { normalizeTrainerList } from "@/lib/trainer-utils";
import { buildTrainerAssignmentIndex } from "@/lib/trainers/season-assignments";
import { defaultTrainingTitle } from "@/lib/events/training-presenter";
import {
  athleteMatchesAnyCategory,
  buildClubCategoryOptions,
  resolveCategoryId,
  resolveCategoryLabel,
} from "@/lib/category-utils";
import {
  buildTrainingLocationOptions,
  findTrainingLocationOption,
  getFallbackTrainingLocationOptions,
} from "@/lib/training-location-options";
import {
  buildTrainingStart,
  dedupeTrainings,
  formatLocalDateKey,
  getTrainingCategoryReferences,
  getTrainingDate,
  getTrainingEndTime,
  getTrainingStartTime,
  isValidTimeRange,
  resolveCategoryLabelForTraining,
  resolveExplicitWeeklyScheduleDay,
  resolveTrainingWeekday,
  timeToMinutes,
} from "@/lib/training-utils";
import {
  isDateExcludedForSlot,
  parseTrainingAutomationSettings,
  shouldRunTrainingAutomation,
  type TrainingAutomationSettings,
} from "@/lib/training-automation-utils";
import { filterCollectionBySeason } from "@/lib/club-seasons";
import {
  buildSeasonContext,
  recordBelongsToSeason,
  type SeasonContext,
} from "@/lib/seasons/context";
import { toEventDay, toEventTime } from "@/lib/events/model";
import { resolveCategoryReference } from "@/lib/categories/identity";

/**
 * Limite oltre il quale "Genera fino a..." rifiuta (WP-03).
 *
 * Non c'e un massimo dichiarato altrove: la finestra automatica ha solo un
 * minimo forzato (7 giorni). Un anno e ampiamente sufficiente per pianificare
 * una stagione sportiva intera, e tiene la query di sovrapposizione e il
 * numero di righe generate dentro una dimensione che non serve misurare per
 * sapere che e ragionevole.
 */
export const MAX_MANUAL_GENERATION_DAYS_AHEAD = 366;

type AutomationRunOptions = {
  force?: boolean;
  now?: Date;
  weeklyScheduleOverride?: unknown;
  settingsOverride?: unknown;
  /**
   * **"Genera fino a..."** (WP-03): una data assoluta invece della finestra
   * relativa (`generateDaysAhead`). Usa lo stesso ciclo di generazione — non
   * un secondo generatore — e passa dallo stesso planner e dallo stesso
   * scrittore canonico.
   *
   * Quando presente, implica l'esecuzione (come `force`): e un'azione
   * esplicita di chi la chiede, non l'automazione schedulata, e non ha senso
   * risponderle «non ancora dovuta».
   */
  untilDate?: Date | string | null;
  /**
   * **La stagione dichiarata da chi chiede** (ADR-0197).
   *
   * Il pulsante «Genera» passa la stagione che il browser mostra
   * (`x-active-season-id`); il cron non passa niente e riceve la stagione
   * attiva del club. `undefined` = nessuna dichiarazione; una stringa e una
   * dichiarazione, che vale solo se il club ha quella stagione.
   */
  seasonId?: string | null;
  /**
   * **Anteprima** (WP-17): calcola cosa la generazione creerebbe — creati,
   * gia esistenti, conflitti, esclusi per campo chiuso — senza scrivere
   * niente. Usa lo stesso planner dell'esecuzione reale: la differenza e
   * solo se `createClubEventsBatch` scrive o si ferma prima.
   */
  preview?: boolean;
  /**
   * **Chi ha chiesto la generazione, quando a chiederla e una persona.**
   *
   * Questa funzione ha due chiamanti: il cron, che non ha nessuno dietro, e
   * il pulsante «Genera allenamenti», che ha una persona autenticata con un
   * ruolo e — questo e il punto — un **perimetro**.
   *
   * Trattarli uguale, come faceva la prima stesura, produceva due difetti
   * opposti e tutti e due gravi:
   *
   * 1. **l'audit diceva SISTEMA per un gesto umano.** Un club manager
   *    premeva il pulsante alle 15:04 e comparivano sessanta allenamenti
   *    attribuiti a un'automazione che non era girata. La promessa era «un
   *    registro che attribuisce a una persona cio che non ha fatto e peggio
   *    di uno assente»: il verso opposto e altrettanto illeggibile, perche
   *    rende la persona irrecuperabile;
   * 2. **il contesto di sistema lavava via il perimetro del chiamante.** Un
   *    club manager con perimetro sulla categoria U15 non puo creare un
   *    evento U17 dalla rotta degli eventi; passando di qui, con un
   *    `weeklySchedule` che nomina U17, lo creava — perche lo scope
   *    sintetico non portava nessun `accessScopes` e
   *    `assertAccessScopeOnEvent` diventava inerte.
   *
   * Quando c'e una persona si usa **il suo** scope: le sue guardie, il suo
   * perimetro, il suo nome nell'audit. Il contesto di sistema resta per chi
   * non ha nessuno dietro.
   */
  caller?: {
    scope: {
      userId?: string | null;
      activeOrganizationId?: string | null;
      activeRole?: string | null;
      allowedOrganizationIds?: string[];
      accessScopes?: readonly any[] | null;
    };
    actor?: { userId?: string | null; email?: string | null };
  };
};

type AutomationRunResult = {
  ran: boolean;
  due: boolean;
  generatedCount: number;
  generatedTrainings: Record<string, any>[];
  lastRunAt: string | null;
  settings: TrainingAutomationSettings;
  reason?: "not_due" | "missing_schedule" | "no_valid_rules" | "outside_season" | "until_out_of_range";
  /**
   * **Il programma, contato voce per voce** (ADR-0197, bug A del pilota).
   *
   * «Il programma settimanale non contiene sessioni valide da generare» era
   * l'unica risposta a quattro difetti diversi: voci di un'altra stagione,
   * voci disattivate, categorie che la stagione non ha, giorni fuori dalla
   * finestra. Qui ogni voce ha un esito e ogni esito un conteggio, con
   * qualche esempio: chi legge sa **quante** e **perche**, e cosa toccare.
   */
  diagnostics: WeeklyProgramDiagnostics;
  /**
   * Le fasce che il programma settimanale avrebbe generato e che occupano un
   * posto gia occupato: non create, «da verificare» (WP-07).
   */
  conflicts: import("./events").BatchConflict[];
  /** Fasce che esistevano gia (stessa identita: giorno, ora, campo, categoria). */
  existingCount: number;
  /** Fasce non create perche cadono quando la struttura e chiusa. */
  excludedCount: number;
  /**
   * Il dettaglio di ogni fascia esclusa: giorno, categoria, risorsa e il
   * motivo gia leggibile (ADR-0170-bis). Non solo un numero: un "Genera ora"
   * che salta una fascia deve dire **quale**, non solo quante.
   */
  excludedSlots: import("./events").BatchExclusion[];
  /** `true` se non si e scritto niente: la stessa pianificazione, mostrata invece che eseguita (WP-17). */
  preview: boolean;
  /** L'ultimo giorno fino a cui questa esecuzione ha generato, in `YYYY-MM-DD`. */
  generatedUntil: string | null;
  /**
   * Le voci del programma saltate perche la categoria non risolve sul
   * catalogo — un nome che ne nomina due, o che nessuna voce riconosce
   * (ADR-0186). Un allenamento non nasce con l'etichetta al posto
   * dell'identificativo.
   */
  unresolvedCategorySlots?: string[];
};

export type WeeklyProgramDiagnosticCode =
  | "other_season"
  | "inactive"
  | "incomplete"
  | "unknown_category"
  | "ambiguous_category"
  | "no_occurrence";

export type WeeklyProgramDiagnostics = {
  /** La stagione per cui si e generato: `null` su un club senza stagioni salvate. */
  seasonId: string | null;
  seasonLabel: string | null;
  /** Quante voci ha il programma, prima di ogni filtro. */
  totalRules: number;
  /** Quante sono generabili: della stagione, attive, con una categoria che la stagione ha. */
  validRules: number;
  invalidRules: number;
  /** Voci valide che nel periodo richiesto non hanno nessuna occorrenza (giorno passato, fuori finestra, escluse). */
  rulesWithoutOccurrence: number;
  /** Occorrenze cadute fuori dal periodo della stagione (prima dell'inizio o dopo la fine). */
  outsideSeasonCount: number;
  reasons: Array<{
    code: WeeklyProgramDiagnosticCode;
    count: number;
    label: string;
    examples: string[];
  }>;
  /**
   * Allenatori scritti sulle voci ma **non assegnati nella stagione** alla
   * squadra della voce (ADR-0198 §1): la voce resta valida e genera senza di
   * loro. `rules` = quante voci ne hanno almeno uno; `examples` = «voce: nome».
   */
  trainersNotAssigned: { rules: number; trainers: number; examples: string[] };
};

const WEEKLY_PROGRAM_DIAGNOSTIC_LABELS: Record<
  WeeklyProgramDiagnosticCode,
  (seasonLabel: string | null) => string
> = {
  other_season: (seasonLabel) =>
    seasonLabel
      ? `appartengono a un'altra stagione, non alla ${seasonLabel}`
      : "appartengono a un'altra stagione",
  inactive: () => "sono disattivate",
  incomplete: () => "sono incomplete (manca il campo o l'orario)",
  unknown_category: (seasonLabel) =>
    seasonLabel
      ? `fanno riferimento a una categoria non disponibile nella stagione ${seasonLabel}`
      : "fanno riferimento a una categoria non presente nel catalogo",
  ambiguous_category: () =>
    "nominano una categoria che corrisponde a piu squadre: serve l'identificativo",
  no_occurrence: () =>
    "non cadono nel periodo richiesto (giorno gia passato, fuori finestra o sospeso)",
};

const emptyWeeklyProgramDiagnostics = (): WeeklyProgramDiagnostics => ({
  seasonId: null,
  seasonLabel: null,
  totalRules: 0,
  validRules: 0,
  invalidRules: 0,
  rulesWithoutOccurrence: 0,
  outsideSeasonCount: 0,
  reasons: [],
  trainersNotAssigned: { rules: 0, trainers: 0, examples: [] },
});

const describeRuleForDiagnostics = (item: Record<string, any>) =>
  [
    getNonEmptyString(item.day, item.weekday),
    getNonEmptyString(item.startTime, item.start_time),
    getNonEmptyString(item.categoryName, item.category_name, item.categoryId),
  ]
    .filter(Boolean)
    .join(" · ") || String(item.id || "voce");

const isMissingCategoryMembershipTableError = (error: unknown) =>
  String((error as any)?.message || error || "")
    .toLowerCase()
    .includes("athlete_category_memberships");

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const getNonEmptyString = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) {
      return normalized;
    }
  }

  return "";
};

const dedupeStringList = (values: unknown[]) =>
  Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );

const isTrainingRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  [
    "date",
    "start_date",
    "startDate",
    "scheduled_at",
    "scheduledAt",
    "time",
    "start_time",
    "startTime",
    "category",
    "categoryId",
    "groupId",
    "category_id",
    "trainer",
    "trainerId",
    "trainer_id",
    "location",
  ].some((key) => (value as Record<string, unknown>)[key] !== undefined);

const isWeeklyScheduleRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Boolean(resolveExplicitWeeklyScheduleDay(value)) &&
  Boolean(getTrainingStartTime(value));

const toTrainingEntries = (source: unknown): Record<string, any>[] => {
  if (Array.isArray(source)) {
    return source.flatMap((entry) => toTrainingEntries(entry));
  }

  if (!source || typeof source !== "object") {
    return [];
  }

  if (isTrainingRecord(source)) {
    return [source];
  }

  const record = source as Record<string, unknown>;
  const nestedCandidates = [
    record.payload,
    record.trainings,
    record.training,
    record.items,
  ].filter((value) => value !== undefined);

  if (nestedCandidates.length > 0) {
    return nestedCandidates.flatMap((entry) => toTrainingEntries(entry));
  }

  return [];
};

const toWeeklyScheduleEntries = (source: unknown): Record<string, any>[] => {
  if (Array.isArray(source)) {
    return source.flatMap((entry) => toWeeklyScheduleEntries(entry));
  }

  if (!source || typeof source !== "object") {
    return [];
  }

  if (isWeeklyScheduleRecord(source)) {
    return [source];
  }

  const record = source as Record<string, unknown>;
  const nestedCandidates = [
    record.payload,
    record.weekly_schedule,
    record.schedule,
    record.items,
  ].filter((value) => value !== undefined);

  if (nestedCandidates.length > 0) {
    return nestedCandidates.flatMap((entry) => toWeeklyScheduleEntries(entry));
  }

  return [];
};

/**
 * **Il gruppo operativo entra nell'identità della voce** (chiude la parte di
 * D-AUD-30 su questa chiave, trovata dall'audit ostile del mandato).
 *
 * Senza `groupId`/`group_id` qui, due squadre della stessa categoria nella
 * stessa fascia fisica (stesso giorno/ora/struttura/campo — il caso ADR-0055
 * esiste apposta per questo: due sedi, stessa fascia oraria) risultavano
 * la **stessa** identità: `mergeWeeklyScheduleSources` ne scartava una in
 * silenzio come "duplicato", prima ancora che il ciclo di generazione la
 * vedesse. Non un doppione mancato: una squadra intera che smette di
 * generare allenamenti senza errore, senza avviso, senza riga di audit.
 */
const buildWeeklyScheduleIdentityKey = (item: Record<string, any>) =>
  [
    /* Due voci uguali in due stagioni sono due voci (revisione B5). */
    item.seasonId || item.season_id || "",
    item.day || "",
    item.startTime || item.start_time || item.time || "",
    item.endTime || item.end_time || "",
    item.categoryId || item.category_id || item.category || "",
    item.structureId || item.structure_id || "",
    item.locationId || item.location_id || item.location || "",
    item.groupId || item.group_id || "",
  ]
    .map((value) => String(value || "").trim())
    .join("|");

const normalizeTrainerIds = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return dedupeStringList(
      value.flatMap((entry) =>
        entry && typeof entry === "object"
          ? [
              (entry as Record<string, any>).id,
              (entry as Record<string, any>).trainerId,
              (entry as Record<string, any>).trainer_id,
            ]
          : [entry],
      ),
    );
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, any>;
    return dedupeStringList([
      record.id,
      record.user_id,
      record.linkedUserId,
      record.linked_user_id,
      record.trainerId,
      record.trainer_id,
      record.coachId,
      record.coach_id,
    ]);
  }

  return dedupeStringList([value]);
};

const normalizeWeeklyScheduleSourceItem = (item: Record<string, any>) => {
  const day = resolveExplicitWeeklyScheduleDay(item);
  const startTime = getTrainingStartTime(item);
  const endTime = getTrainingEndTime(item) || "";

  const categoryReference = getNonEmptyString(
    item.categoryId,
    item.category_id,
    item.category?.id,
    item.categoryName,
    item.category_name,
    item.category?.name,
    item.category,
    getTrainingCategoryReferences(item)[0],
  );
  const categoryId = getNonEmptyString(
    item.categoryId,
    item.category_id,
    item.category?.id,
  );
  const categoryName = resolveCategoryLabelForTraining(item, []);
  const trainerIds = dedupeStringList([
    ...normalizeTrainerIds(item.trainerIds),
    ...normalizeTrainerIds(item.trainer_ids),
    ...normalizeTrainerIds(item.trainerId),
    ...normalizeTrainerIds(item.trainer_id),
    ...normalizeTrainerIds(item.coachId),
    ...normalizeTrainerIds(item.coach_id),
    ...normalizeTrainerIds(item.trainers),
    ...normalizeTrainerIds(item.trainer),
    ...normalizeTrainerIds(item.coach),
  ]);
  const locationReference = getNonEmptyString(
    item.structureId,
    item.structure_id,
    item.locationId,
    item.location_id,
    item.fieldId,
    item.field_id,
    item.location,
    item.fieldName,
    item.field_name,
  );

  if (
    !day ||
    !startTime ||
    !endTime ||
    !isValidTimeRange(startTime, endTime) ||
    !categoryReference ||
    !locationReference
  ) {
    return null;
  }
  /*
    L'allenatore **non** rende incompleta una voce (ADR-0198 §1): chi allena
    lo dice l'assegnazione della stagione, e una voce riportata dall'anno
    scorso nasce senza allenatori apposta. Il generatore li deriva.
  */

  return {
    id: String(item.id || buildWeeklyScheduleIdentityKey(item)),
    day,
    startTime,
    endTime,
    categoryId: categoryId || categoryReference,
    categoryName: categoryName || null,
    trainerIds,
    structureId: getNonEmptyString(item.structureId, item.structure_id),
    locationId: getNonEmptyString(
      item.locationId,
      item.location_id,
      item.fieldId,
      item.field_id,
    ),
    location: getNonEmptyString(item.location, item.fieldName, item.field_name),
    /*
      **Il gruppo operativo, portato fino in fondo** (chiude D-AUD-30 sulla
      chiave di deduplica della generazione, oltre a quella del merge qui
      sopra). Prima questo campo veniva letto dal ciclo di generazione
      (`scheduleItem.groupId`) su un oggetto che non lo conteneva mai:
      sempre stringa vuota, quindi il gruppo non entrava mai davvero nella
      chiave che distingue due squadre della stessa categoria in due sedi.
    */
    groupId: getNonEmptyString(item.groupId, item.group_id) || null,
    /*
      La stagione della voce, com'e in archivio (ADR-0197): serve a dire
      «e di un'altra stagione» invece di farla sparire prima del conteggio.
    */
    seasonId: getNonEmptyString(item.seasonId, item.season_id) || null,
    /*
      **Assente vale attivo** (WP-14). Ogni voce salvata prima che questo
      flag esistesse non ha `active` nel proprio JSON: leggerla come
      disattivata spegnerebbe in silenzio l'intero programma settimanale di
      ogni club che non ha mai toccato il campo.
    */
    active: item.active === false ? false : true,
  };
};

/**
 * **La stagione non si filtra piu qui: si conta** (ADR-0197, chiude WP-13
 * nella forma in cui era stato chiuso).
 *
 * La prima stesura filtrava le voci grezze per stagione prima del merge, con
 * la regola dei record senza annata: e la regola giusta per una collezione
 * letta dall'archivio, ed e stata la causa del bug A del pilota — il
 * pannello manda il proprio stato come override, senza `seasonId`, e con
 * due stagioni tutte e quaranta le voci diventavano «legacy» di una stagione
 * che non era l'attiva. Adesso la voce normalizzata porta la sua stagione, e
 * chi genera decide voce per voce e **lo dice** nella diagnostica.
 *
 * `stampSeasonId` e per l'override: una voce che arriva dal pannello senza
 * stagione e una voce della stagione che il pannello mostra, non un record
 * del 2019.
 */
const mergeWeeklyScheduleSources = ({
  clubWeeklySchedule,
  resourceWeeklySchedule,
  stampSeasonId,
  onIncomplete,
}: {
  clubWeeklySchedule: unknown;
  resourceWeeklySchedule: unknown;
  /** Stagione da scrivere sulle voci dell'override che non ne portano una. */
  stampSeasonId?: string | null;
  /** Una voce che la normalizzazione scarta (senza allenatore, senza campo, orario non valido): si conta, non sparisce (revisione B6). */
  onIncomplete?: (item: Record<string, any>) => void;
}) => {
  const scheduleSources = [clubWeeklySchedule, resourceWeeklySchedule];
  const merged: Record<string, any>[] = [];
  const seen = new Set<string>();

  scheduleSources.forEach((source) => {
    const rawEntries = toWeeklyScheduleEntries(source);
    const scopedEntries = stampSeasonId
      ? rawEntries.map((item) =>
          getNonEmptyString(item?.seasonId, item?.season_id)
            ? item
            : { ...item, seasonId: stampSeasonId },
        )
      : rawEntries;
    scopedEntries.forEach((item) => {
      const normalizedItem = normalizeWeeklyScheduleSourceItem(item);
      if (!normalizedItem) {
        onIncomplete?.(item);
        return;
      }

      const identity = buildWeeklyScheduleIdentityKey(normalizedItem);
      if (!identity || seen.has(identity)) {
        return;
      }

      seen.add(identity);
      merged.push(normalizedItem);
    });
  });

  return merged;
};

const getResourcePayloadsByType = async (clubId: string) => {
  const items = await prisma.clubResourceItem.findMany({
    where: {
      organization_id: clubId,
      resource_type: {
        in: ["weekly_schedule", "trainings", "categories", "trainers"],
      },
    },
    select: {
      resource_type: true,
      payload: true,
    },
  });

  return items.reduce<Record<string, unknown[]>>((collection, item) => {
    const key = String(item.resource_type || "").trim();
    if (!key) {
      return collection;
    }

    if (!collection[key]) {
      collection[key] = [];
    }

    collection[key].push(item.payload);
    return collection;
  }, {});
};

const buildTrainingDuplicateKey = ({
  trainingDate,
  time,
  locationKey,
  categoryKey,
}: {
  trainingDate: string;
  time: string;
  locationKey: string;
  categoryKey: string;
}) =>
  [trainingDate, time, locationKey, categoryKey]
    .map((value) => String(value || "").trim().toLowerCase())
    .join("|");

const buildExistingTrainingKey = (
  training: Record<string, any>,
  categories: Array<{ id?: string | null; name?: string | null }> = [],
) => {
  const trainingDate = getTrainingDate(training);
  const startTime = getTrainingStartTime(training);

  if (!trainingDate || !startTime) {
    return null;
  }

  const rawCategoryReference = getNonEmptyString(
    training.categoryId,
    training.category_id,
    ...getTrainingCategoryReferences(training),
  );
  const resolvedCategory =
    resolveCategoryId(rawCategoryReference, categories) ||
    resolveCategoryLabel(rawCategoryReference, categories) ||
    rawCategoryReference;

  /*
    **Lo stesso gruppo che la candidata userebbe** (chiude D-AUD-30 anche
    qui): la chiave di un training gia esistente deve calcolarsi con la
    stessa regola di una candidata nuova, o le due non si riconoscono a
    vicenda — una squadra con gruppo operativo risulterebbe sempre "non
    ancora generata" secondo questo pre-filtro, anche quando lo e gia.
  */
  const existingGroupId = getNonEmptyString(
    Array.isArray(training.groupIds) ? training.groupIds[0] : undefined,
    Array.isArray(training.group_ids) ? training.group_ids[0] : undefined,
    training.groupId,
    training.group_id,
  );

  return buildTrainingDuplicateKey({
    trainingDate: formatLocalDateKey(trainingDate),
    time: startTime,
    locationKey: getNonEmptyString(
      training.locationId,
      training.fieldId,
      training.location_id,
      training.field_id,
      training.location,
    ),
    categoryKey: existingGroupId || resolvedCategory,
  });
};

const buildStoredAutomationSettings = (
  clubSettings: unknown,
  lastRunAt: string,
  candidateGeneratedUntil: string | null,
) => {
  const settingsRecord = isRecord(clubSettings) ? clubSettings : {};
  const currentAutomation = parseTrainingAutomationSettings(
    settingsRecord.trainingAutomation,
  );

  /*
    **Non regredisce.** Un «Genera fino a...» che copre dicembre e seguito
    dal cron notturno, che genera solo i prossimi 21 giorni: il secondo non
    deve far dimenticare cio che il primo ha gia messo in calendario. Il
    valore mostrato e il piu lontano fra i due, non l'ultimo.
  */
  const generatedUntil =
    candidateGeneratedUntil &&
    (!currentAutomation.generatedUntil ||
      candidateGeneratedUntil > currentAutomation.generatedUntil)
      ? candidateGeneratedUntil
      : currentAutomation.generatedUntil;

  return {
    ...settingsRecord,
    trainingAutomation: {
      ...currentAutomation,
      lastRunAt,
      generatedUntil,
    },
  };
};

const getDateOnly = (value: Date) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate());

const DEFAULT_CLUB_TIMEZONE = "Europe/Rome";

const resolveClubTimezone = (settings: Record<string, unknown>) => {
  const value = String(settings.timezone || "").trim();
  if (!value) return DEFAULT_CLUB_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return DEFAULT_CLUB_TIMEZONE;
  }
};

/**
 * Le cifre civili di un istante nel fuso del club, scritte come UTC: la
 * stessa convenzione con cui `toEventInstant` scrive `starts_at`. E la
 * cornice in cui il generatore confronta «adesso» e le occorrenze.
 */
export const civilDateOf = (instant: Date, timeZone: string) => {
  const parti = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const leggi = (tipo: string) => Number(parti.find((parte) => parte.type === tipo)?.value || 0);
  return new Date(Date.UTC(leggi("year"), leggi("month") - 1, leggi("day"), leggi("hour") % 24, leggi("minute"), leggi("second")));
};

/** Le cifre civili di un'occorrenza (`AAAA-MM-GG` + `HH:MM`) come UTC. */
export const civilInstantOf = (dateKey: string, time: string | null | undefined) => {
  const [anno, mese, giorno] = String(dateKey || "").split("-").map(Number);
  const minuti = timeToMinutes(time);
  if (!anno || !mese || !giorno || minuti === null) return null;
  return new Date(Date.UTC(anno, mese - 1, giorno, Math.floor(minuti / 60), minuti % 60, 0));
};

const getWeekdayLabelFromDate = (value: Date) =>
  resolveTrainingWeekday({ date: getDateOnly(value) });

/* ============================================================== WP-08 === */

export type NormalizedWeeklyScheduleSlot = NonNullable<
  ReturnType<typeof normalizeWeeklyScheduleSourceItem>
>;

export type WeeklyScheduleSlotChange = {
  slotId: string;
  changeType: "modified" | "removed";
  previous: NormalizedWeeklyScheduleSlot;
  next: NormalizedWeeklyScheduleSlot | null;
};

/**
 * I campi che spostano la fascia rispetto a cio che la generazione precedente
 * ha scritto: sono gli stessi che entrano nella chiave di deduplica
 * (`buildTrainingDuplicateKey`) piu il giorno, che decide quale weekday la
 * genera, piu il gruppo operativo — che chiude la propagazione di D-AUD-30
 * su questo meccanismo: senza `groupId`, spostare una squadra da una sede
 * a un'altra (stesso giorno/ora/campo/categoria, gruppo diverso) non
 * produceva **nessun** avviso di impatto, in silenzio. Cambiarne uno vuol
 * dire che gli eventi gia generati con la definizione precedente non
 * corrispondono piu a nessuna riga del programma.
 */
const CAMPI_CHE_SPOSTANO_LA_FASCIA = [
  "day",
  "startTime",
  "endTime",
  "structureId",
  "locationId",
  "categoryId",
  "groupId",
] as const;

const stessaFascia = (
  a: NormalizedWeeklyScheduleSlot,
  b: NormalizedWeeklyScheduleSlot,
) => CAMPI_CHE_SPOSTANO_LA_FASCIA.every((campo) => (a[campo] || "") === (b[campo] || ""));

/**
 * **Cosa e cambiato nel programma settimanale, per chi ha gia generato
 * qualcosa** (WP-08).
 *
 * Confronta due versioni del programma per `id` di voce: una voce sparita e
 * "removed", una voce rimasta ma con giorno/ora/campo/categoria diversi e
 * "modified". Una voce nuova (nessun `id` corrispondente nel programma
 * precedente) non e un cambiamento: non ha ancora generato niente.
 */
export const findWeeklyScheduleSlotChanges = (
  previousSchedule: unknown,
  nextSchedule: unknown,
): WeeklyScheduleSlotChange[] => {
  const previousSlots = toWeeklyScheduleEntries(previousSchedule)
    .map(normalizeWeeklyScheduleSourceItem)
    .filter((slot): slot is NormalizedWeeklyScheduleSlot => Boolean(slot));
  const nextSlots = toWeeklyScheduleEntries(nextSchedule)
    .map(normalizeWeeklyScheduleSourceItem)
    .filter((slot): slot is NormalizedWeeklyScheduleSlot => Boolean(slot));

  const nextById = new Map(nextSlots.map((slot) => [slot.id, slot]));

  const changes: WeeklyScheduleSlotChange[] = [];
  for (const previous of previousSlots) {
    const next = nextById.get(previous.id) || null;

    if (!next) {
      changes.push({ slotId: previous.id, changeType: "removed", previous, next: null });
      continue;
    }

    /*
      **Disattivare e trattato come "removed"** (WP-14): smette di generare
      nuove occorrenze esattamente come una voce tolta, e allo stesso modo
      non deve offrire un aggiornamento in blocco — non c'e una nuova
      definizione a cui aggiornare quelle esistenti, solo la fine della
      generazione futura.
    */
    if (previous.active !== false && next.active === false) {
      changes.push({ slotId: previous.id, changeType: "removed", previous, next: null });
      continue;
    }

    if (!stessaFascia(previous, next)) {
      changes.push({ slotId: previous.id, changeType: "modified", previous, next });
    }
  }

  return changes;
};

/**
 * Il catalogo di categorie/campi del club, caricato **una volta** per
 * l'intero calcolo di impatto — non una volta per slot cambiato (WP-20: 20
 * voci cambiate in un salvataggio non devono aprire 20 letture separate del
 * club).
 */
const loadWeeklyScheduleCatalog = async (clubId: string) => {
  const [club, resourcePayloadsByType] = await Promise.all([
    prisma.club.findUnique({
      where: { id: clubId },
      select: { categories: true, structures: true },
    }),
    getResourcePayloadsByType(clubId),
  ]);

  const categoryList = buildClubCategoryOptions({
    clubCategories: club?.categories,
    resourceCategories: resourcePayloadsByType.categories || [],
  });
  const builtLocationOptions = buildTrainingLocationOptions(
    Array.isArray(club?.structures) ? (club.structures as any[]) : [],
  );
  const locationOptions =
    builtLocationOptions.length > 0
      ? builtLocationOptions
      : getFallbackTrainingLocationOptions();

  return { categoryList, locationOptions };
};

type WeeklyScheduleCatalog = Awaited<ReturnType<typeof loadWeeklyScheduleCatalog>>;

/**
 * La stessa risoluzione che la generazione userebbe per uno slot — non
 * un'approssimazione (chiude un reperto dell'audit ostile del mandato:
 * questa funzione usava prima `categoryId`/`locationId` cosi come il
 * programma li porta, senza passare da `resolveCategoryId`/
 * `findTrainingLocationOption` come fa `runTrainingAutomationForClub`. Con
 * un riferimento non ancora canonico — una voce scritta fuori dal pannello,
 * per esempio da un import — le due strade potevano risolvere in modo
 * diverso, e l'impatto abbinava la fascia sbagliata invece di sotto-
 * riportarla).
 *
 * Il gruppo operativo, quando presente, ha la priorita sulla categoria
 * nella chiave — la stessa regola della generazione (ADR-0055, D-AUD-30).
 */
const resolveSlotOccurrenceKey = (
  slot: Pick<
    NormalizedWeeklyScheduleSlot,
    "categoryId" | "structureId" | "locationId" | "groupId"
  >,
  catalogo: WeeklyScheduleCatalog,
) => {
  const rawCategoryReference = getNonEmptyString(slot.categoryId);
  const resolvedCategoryId =
    resolveCategoryId(rawCategoryReference, catalogo.categoryList) || "";
  const resolvedCategoryLabel =
    resolveCategoryLabel(rawCategoryReference, catalogo.categoryList) ||
    rawCategoryReference;
  const categoryKey = resolvedCategoryId || resolvedCategoryLabel || rawCategoryReference;

  const location = findTrainingLocationOption(catalogo.locationOptions, {
    structureId: slot.structureId,
    fieldId: slot.locationId,
    locationId: slot.locationId,
  });

  return {
    locationKey: location?.fieldId || slot.locationId || "",
    categoryKey: slot.groupId || categoryKey,
    /** Cio che la riga scritta da questa definizione porterebbe in colonna. */
    resolvedStructureId: location?.structureId || slot.structureId || null,
    resolvedFieldId: location?.fieldId || slot.locationId || null,
    resolvedCategoryId: (resolvedCategoryId || categoryKey || null) as string | null,
  };
};

type SlotOccurrenceMatch = {
  id: string;
  status: string;
  starts_at: Date;
  ends_at: Date | null;
  structure_id: string | null;
  field_id: string | null;
  category_id: string | null;
  payload: unknown;
};

/**
 * Gli eventi futuri che le definizioni **precedenti** di piu slot hanno
 * generato — una query sola per l'intero blocco di slot cambiati (WP-20),
 * non una per slot.
 */
const findFutureEventsForPreviousSlotDefinitions = async (
  clubId: string,
  cambi: readonly WeeklyScheduleSlotChange[],
  now: Date,
  catalogo: WeeklyScheduleCatalog,
): Promise<Map<string, SlotOccurrenceMatch[]>> => {
  const startDate = getDateOnly(now);
  const endDate = getDateOnly(now);
  endDate.setDate(endDate.getDate() + MAX_MANUAL_GENERATION_DAYS_AHEAD);

  const legacyIdToSlotId = new Map<string, string>();

  for (const cambio of cambi) {
    const slot = cambio.previous;
    const { locationKey, categoryKey } = resolveSlotOccurrenceKey(slot, catalogo);

    for (
      const currentDate = new Date(startDate);
      currentDate <= endDate;
      currentDate.setDate(currentDate.getDate() + 1)
    ) {
      if (getWeekdayLabelFromDate(currentDate) !== slot.day) {
        continue;
      }

      const trainingDate = formatLocalDateKey(currentDate);
      const trainingStart = buildTrainingStart(trainingDate, slot.startTime);
      if (!trainingStart || trainingStart <= now) {
        continue;
      }

      const legacyId = `auto:${buildTrainingDuplicateKey({
        trainingDate,
        time: slot.startTime,
        locationKey,
        categoryKey,
      })}`;
      legacyIdToSlotId.set(legacyId, cambio.slotId);
    }
  }

  const risultatoPerSlot = new Map<string, SlotOccurrenceMatch[]>();
  for (const cambio of cambi) {
    risultatoPerSlot.set(cambio.slotId, []);
  }

  if (!legacyIdToSlotId.size) {
    return risultatoPerSlot;
  }

  const righe = await prisma.clubEvent.findMany({
    where: {
      organization_id: clubId,
      kind: "training",
      legacy_id: { in: [...legacyIdToSlotId.keys()] },
    },
    select: {
      id: true,
      status: true,
      starts_at: true,
      ends_at: true,
      structure_id: true,
      field_id: true,
      category_id: true,
      payload: true,
      legacy_id: true,
    },
  });

  for (const riga of righe) {
    const slotId = legacyIdToSlotId.get(riga.legacy_id || "");
    if (!slotId) continue;
    risultatoPerSlot.get(slotId)?.push(riga);
  }

  return risultatoPerSlot;
};

/**
 * Chi ha gia partecipazioni: convocazioni, presenze, risposte. Sono la
 * stessa condizione che `updateClubEvent` congela da sola (ADR-0112) — qui
 * serve **prima** di scrivere, perche il riepilogo deve poter dire "sicuro"
 * con lo stesso significato con cui l'esecuzione poi lo user (WP-17).
 *
 * Una query sola per **tutti** gli eventi trovati, di tutti gli slot
 * cambiati (WP-20) — non una per slot.
 */
const eventIdsConPartecipazioni = async (
  eventIds: readonly string[],
): Promise<Set<string>> => {
  if (!eventIds.length) {
    return new Set();
  }

  const righe = await prisma.clubEventParticipant.groupBy({
    by: ["event_id"],
    where: { event_id: { in: [...eventIds] } },
  });

  return new Set(righe.map((riga: { event_id: string }) => riga.event_id));
};

/**
 * "Sicuro" e attivo, mai modificato a mano, senza partecipazioni — **e**
 * ancora esattamente cio che la definizione precedente dello slot avrebbe
 * scritto. Quest'ultimo confronto (per valore, non solo per il segno
 * `manuallyModified`) chiude un reperto dell'audit ostile: un evento
 * generato **prima** che WP-10 esistesse non ha mai potuto ricevere quel
 * segno, e senza un secondo controllo indipendente sarebbe stato trattato
 * come "sicuro" a prescindere da una correzione manuale fatta mesi prima
 * del suo deploy. Un evento i cui valori sono ancora quelli della
 * definizione precedente e sicuro **a prescindere** dal segno; un evento i
 * cui valori sono gia diversi non lo e, **anche se** il segno manca.
 */
const classificaEventiPerSlot = (
  eventi: readonly SlotOccurrenceMatch[],
  conPartecipazioni: ReadonlySet<string>,
  slot: NormalizedWeeklyScheduleSlot,
  catalogo: WeeklyScheduleCatalog,
) => {
  const atteso = resolveSlotOccurrenceKey(slot, catalogo);

  const nonAncoraToccato = (evento: SlotOccurrenceMatch) => {
    const oraInizio = toEventTime(evento.starts_at);
    if (oraInizio !== slot.startTime) return false;

    if (slot.endTime) {
      const oraFine = evento.ends_at ? toEventTime(evento.ends_at) : "";
      if (oraFine !== slot.endTime) return false;
    }

    if ((evento.structure_id || null) !== (atteso.resolvedStructureId || null)) {
      return false;
    }
    if ((evento.field_id || null) !== (atteso.resolvedFieldId || null)) {
      return false;
    }
    if ((evento.category_id || null) !== (atteso.resolvedCategoryId || null)) {
      return false;
    }

    return true;
  };

  const attivi = eventi.filter(
    (evento) => evento.status !== "cancelled" && evento.status !== "archived",
  );
  const modificatiAMano = attivi.filter(
    (evento) => Boolean((evento.payload as any)?.manuallyModified),
  );
  const sicuri = attivi.filter(
    (evento) =>
      !(evento.payload as any)?.manuallyModified &&
      !conPartecipazioni.has(evento.id) &&
      nonAncoraToccato(evento),
  );

  return {
    matchedCount: eventi.length,
    activeCount: attivi.length,
    manuallyModifiedCount: modificatiAMano.length,
    safeEventIds: sicuri.map((evento) => evento.id),
  };
};

export type WeeklyScheduleImpactSlotSummary = {
  slotId: string;
  changeType: "modified" | "removed";
  matchedCount: number;
  activeCount: number;
  manuallyModifiedCount: number;
  safeCount: number;
};

/**
 * **"La modifica interessa X allenamenti futuri gia generati"** (WP-08).
 *
 * Non e una stima: e lo stesso calcolo che l'esecuzione poi userebbe per
 * decidere quali righe toccare (`applyWeeklyScheduleSlotChanges`), fermato
 * prima di scrivere — la stessa relazione fra anteprima ed esecuzione che
 * WP-17 tiene per la generazione.
 */
export const previewWeeklyScheduleImpact = async (
  clubId: string,
  options: { previousSchedule: unknown; nextSchedule: unknown; now?: Date },
): Promise<WeeklyScheduleImpactSlotSummary[]> => {
  const now = options.now ?? new Date();
  const cambi = findWeeklyScheduleSlotChanges(
    options.previousSchedule,
    options.nextSchedule,
  );

  if (!cambi.length) return [];

  const catalogo = await loadWeeklyScheduleCatalog(clubId);
  const eventiPerSlot = await findFutureEventsForPreviousSlotDefinitions(
    clubId,
    cambi,
    now,
    catalogo,
  );
  const conPartecipazioni = await eventIdsConPartecipazioni(
    [...eventiPerSlot.values()].flat().map((evento) => evento.id),
  );

  return cambi.map((cambio) => {
    const eventi = eventiPerSlot.get(cambio.slotId) || [];
    const classificati = classificaEventiPerSlot(
      eventi,
      conPartecipazioni,
      cambio.previous,
      catalogo,
    );

    return {
      slotId: cambio.slotId,
      changeType: cambio.changeType,
      matchedCount: classificati.matchedCount,
      activeCount: classificati.activeCount,
      manuallyModifiedCount: classificati.manuallyModifiedCount,
      safeCount: cambio.changeType === "removed" ? 0 : classificati.safeEventIds.length,
    };
  });
};

export type ApplyWeeklyScheduleImpactResult = {
  slotId: string;
  updatedCount: number;
  skippedCount: number;
  /**
   * Il motivo di ogni scarto, non solo il conteggio (chiude un reperto
   * dell'audit ostile: un `catch` cieco confondeva "un'altra persona lo ha
   * appena toccato" — atteso, concorrenza normale — con un bug, un permesso
   * o una sovrapposizione, e chi leggeva il riepilogo non poteva distinguerli).
   */
  skippedReasons: string[];
};

/**
 * **"Aggiorna anche gli allenamenti futuri non modificati"** (WP-08).
 *
 * Tocca solo cio che `previewWeeklyScheduleImpact` ha gia contato come
 * sicuro: eventi ancora attivi, generati dalla definizione precedente dello
 * slot, mai modificati a mano e ancora ai suoi valori. Passa da
 * `updateClubEvent` — lo stesso scrittore di una modifica umana qualsiasi,
 * con lo stesso scope di chi ha chiesto l'aggiornamento: il suo perimetro,
 * il suo nome nell'audit. Una voce **rimossa** non tocca niente: farlo
 * sarebbe cancellare eventi operativi senza un'azione esplicita su di loro
 * (WP-14).
 */
/*
  **Non una fila, un piccolo drappello** (WP-20, trovato dalla sonda di
  performance su Postgres reale dopo la correzione del `field_id`: 645
  eventi "sicuri" in fila, uno alla volta, hanno impiegato 173 secondi e
  7756 query — un tempo che nessuna richiesta HTTP sopravvive). Ogni evento
  passa comunque da `updateClubEvent`, lo stesso scrittore con lo stesso
  controllo di una modifica umana: qui si limita solo **quanti** ne
  procedono insieme, non cosa ciascuno controlla. Un numero basso e
  deliberato: e la stessa connessione Postgres di tutto il resto della
  richiesta, non un pool dedicato.
*/
const CONCORRENZA_APPLICAZIONE_IMPATTO = 8;

/*
  **Un tetto esplicito, non un tempo di risposta scoperto** (WP-20, stessa
  sonda). Anche con il drappello qui sopra, la sonda su Postgres reale (20
  categorie, 50 fasce, 3 strutture) misura ~10-11 eventi al secondo — il
  costo e nelle stesse verifiche di `updateClubEvent` (permesso, perimetro,
  sovrapposizione, campo chiuso) ripetute per riga, non nel numero di
  connessioni: alzare il drappello da 8 a 20 ha guadagnato meno del 10%.
  Il caso volutamente estremo della sonda — 50 fasce cambiate in un colpo
  solo con 90 giorni gia generati, 645 eventi da toccare — resta oltre il
  minuto, che nessuna richiesta HTTP sincrona sopravvive.

  200 eventi (~18-20s a questo ritmo) copre con margine la scala di
  riferimento del mandato (rotazione a 21 giorni su 50 fasce: 152 eventi) e
  una modifica tipica (poche fasce alla volta); chi la supera — un caso
  raro, un intero programma riscritto dopo aver gia generato mesi in avanti
  — riceve un rifiuto leggibile, non un timeout muto, e puo applicare il
  cambiamento a un sottoinsieme di fasce alla volta. Una soluzione che non
  abbia affatto questo tetto (una scrittura in blocco dedicata, o
  un'esecuzione fuori dalla richiesta) resta debito tecnico documentato,
  non necessario alla scala che il mandato chiede di reggere oggi.
*/
const MAX_EVENTI_APPLICAZIONE_IMPATTO = 200;

const eseguiConConcorrenzaLimitata = async <T>(
  elementi: readonly T[],
  limite: number,
  azione: (elemento: T) => Promise<void>,
): Promise<void> => {
  let indice = 0;
  const drappello = Array.from(
    { length: Math.max(1, Math.min(limite, elementi.length)) },
    async () => {
      while (indice < elementi.length) {
        const mio = indice++;
        await azione(elementi[mio]);
      }
    },
  );
  await Promise.all(drappello);
};

export const applyWeeklyScheduleSlotChanges = async (
  scope: Parameters<typeof import("./events").updateClubEvent>[0],
  clubId: string,
  attore: Parameters<typeof import("./events").updateClubEvent>[3],
  options: { previousSchedule: unknown; nextSchedule: unknown; now?: Date },
): Promise<ApplyWeeklyScheduleImpactResult[]> => {
  const now = options.now ?? new Date();
  const cambi = findWeeklyScheduleSlotChanges(
    options.previousSchedule,
    options.nextSchedule,
  ).filter((cambio) => cambio.changeType === "modified" && cambio.next);

  if (!cambi.length) return [];

  const { updateClubEvent } = await import("./events");

  const catalogo = await loadWeeklyScheduleCatalog(clubId);
  const eventiPerSlot = await findFutureEventsForPreviousSlotDefinitions(
    clubId,
    cambi,
    now,
    catalogo,
  );
  const conPartecipazioni = await eventIdsConPartecipazioni(
    [...eventiPerSlot.values()].flat().map((evento) => evento.id),
  );

  /*
    Il conteggio dei "sicuri" si calcola una volta sola, prima di scrivere
    niente: e cio che permette di rifiutare l'intera operazione con un
    messaggio leggibile quando supera il tetto, invece di scoprirlo a meta
    strada con meta eventi gia aggiornati.
  */
  const sicuriPerCambio = cambi.map((cambio) => {
    const eventi = eventiPerSlot.get(cambio.slotId) || [];
    const { safeEventIds } = classificaEventiPerSlot(
      eventi,
      conPartecipazioni,
      cambio.previous,
      catalogo,
    );
    return { cambio, safeEventIds };
  });
  const totaleSicuri = sicuriPerCambio.reduce(
    (tot, voce) => tot + voce.safeEventIds.length,
    0,
  );
  if (totaleSicuri > MAX_EVENTI_APPLICAZIONE_IMPATTO) {
    throw new Error(
      `Troppi eventi da aggiornare in una sola operazione (${totaleSicuri}, il limite e ${MAX_EVENTI_APPLICAZIONE_IMPATTO}): applica il cambiamento a un numero minore di fasce per volta.`,
    );
  }

  const risultati: ApplyWeeklyScheduleImpactResult[] = [];
  let aggiornatiTotale = 0;
  let scartatiTotale = 0;

  for (const { cambio, safeEventIds } of sicuriPerCambio) {
    const successivo = cambio.next as NormalizedWeeklyScheduleSlot;

    let updatedCount = 0;
    const skippedReasons: string[] = [];
    await eseguiConConcorrenzaLimitata(
      safeEventIds,
      CONCORRENZA_APPLICAZIONE_IMPATTO,
      async (eventId) => {
        try {
          await updateClubEvent(
            scope,
            eventId,
            {
              time: successivo.startTime,
              endTime: successivo.endTime,
              structureId: successivo.structureId,
              // `fieldId`, non solo `locationId`: vedi la nota nel loop di
              // generazione piu sopra — `toEventColumns` legge solo `fieldId`/
              // `field_id`, mai `locationId`.
              fieldId: successivo.locationId,
              locationId: successivo.locationId,
              categoryId: successivo.categoryId,
            },
            attore,
          );
          updatedCount += 1;
        } catch (errore) {
          /*
            Un evento che nel frattempo ha ricevuto una storia (appello,
            convocazione), e' stato annullato, o si e' scontrato con
            un'altra riga (campo chiuso, sovrapposizione, perimetro) non si
            tocca: `updateClubEvent` lo rifiuta da solo. Il motivo pero non
            si inghiotte piu: resta nel riepilogo, non solo nel conteggio.
          */
          skippedReasons.push(String((errore as any)?.message || errore));
        }
      },
    );

    aggiornatiTotale += updatedCount;
    scartatiTotale += safeEventIds.length - updatedCount;

    risultati.push({
      slotId: cambio.slotId,
      updatedCount,
      skippedCount: safeEventIds.length - updatedCount,
      skippedReasons,
    });
  }

  /*
    **Una riga di riepilogo per l'intera operazione** (chiude un reperto
    dell'audit ostile): prima, un'applicazione in blocco lasciava solo N
    righe di audit indistinguibili da N modifiche manuali separate, mai una
    che dicesse "questa e' stata un'applicazione in blocco, su questi slot,
    con questo esito".
  */
  const { recordAuditEvent, AUDIT_ACTIONS } = await import("./audit");
  const diSistema = (scope as any)?.system;
  await recordAuditEvent({
    action: AUDIT_ACTIONS.eventUpdated,
    actorUserId: diSistema ? null : (attore as any)?.userId || null,
    actorEmail: diSistema ? null : (attore as any)?.email || null,
    actorRole: (scope as any)?.activeRole || null,
    organizationId: clubId,
    resource: "club_events",
    resourceId: null,
    metadata: {
      operazione: "weekly_schedule.apply_impact",
      slot: cambi.length,
      aggiornati: aggiornatiTotale,
      scartati: scartatiTotale,
    },
  });

  return risultati;
};

const loadAutomationAthletes = async (clubId: string) => {
  const athletes = await prisma.athlete.findMany({
    where: { organization_id: clubId },
    select: {
      id: true,
      first_name: true,
      last_name: true,
      category_id: true,
      category_name: true,
      data: true,
    },
  });

  let memberships: Array<{
    id: string;
    organization_id: string;
    athlete_id: string;
    category_id: string;
    category_name: string | null;
    is_primary: boolean;
  }> = [];

  try {
    memberships = await prisma.athleteCategoryMembership.findMany({
      where: { organization_id: clubId },
      select: {
        id: true,
        organization_id: true,
        athlete_id: true,
        category_id: true,
        category_name: true,
        is_primary: true,
      },
    });
  } catch (error) {
    if (!isMissingCategoryMembershipTableError(error)) {
      throw error;
    }
  }

  const membershipsByAthleteId = memberships.reduce<
    Map<string, typeof memberships>
  >((collection, membership) => {
    const athleteId = String(membership?.athlete_id || "").trim();
    if (!athleteId) {
      return collection;
    }

    const current = collection.get(athleteId) || [];
    current.push(membership);
    collection.set(athleteId, current);
    return collection;
  }, new Map());

  return athletes.map((athlete) => ({
    ...athlete,
    category_memberships:
      membershipsByAthleteId.get(String(athlete.id || "").trim()) || [],
  }));
};

export async function runTrainingAutomationForClub(
  clubId: string,
  options: AutomationRunOptions = {},
): Promise<AutomationRunResult> {
  const now = options.now ? new Date(options.now) : new Date();
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: {
      id: true,
      name: true,
      settings: true,
      categories: true,
      trainings: true,
      weekly_schedule: true,
      trainers: true,
      structures: true,
      category_groups: true,
      staff_members: true,
    },
  });

  if (!club) {
    throw new Error("Club non trovato");
  }

  const resourcePayloadsByType = await getResourcePayloadsByType(clubId);
  const athletes = await loadAutomationAthletes(clubId);

  const clubSettings = isRecord(club.settings)
    ? (club.settings as Record<string, unknown>)
    : {};
  const storedSettings = parseTrainingAutomationSettings(
    clubSettings.trainingAutomation,
  );
  const effectiveSettings = parseTrainingAutomationSettings(
    isRecord(options.settingsOverride)
      ? { ...storedSettings, ...options.settingsOverride }
      : storedSettings,
  );

  /*
    **"Genera fino a..." e l'anteprima sono un'azione esplicita di chi le
    chiede** (WP-03, WP-17): non hanno senso rifiutate con «non ancora
    dovuta», che e una risposta pensata per il cron che ripassa fra un po'.
  */
  const isManualUntilRequest = options.untilDate != null || options.preview === true;
  const due = options.force || isManualUntilRequest
    ? true
    : shouldRunTrainingAutomation(effectiveSettings, now);
  if (!due) {
    return {
      ran: false,
      due: false,
      generatedCount: 0,
      generatedTrainings: [],
      lastRunAt: effectiveSettings.lastRunAt,
      settings: effectiveSettings,
      reason: "not_due",
      diagnostics: emptyWeeklyProgramDiagnostics(),
      conflicts: [],
      existingCount: 0,
      excludedCount: 0,
      excludedSlots: [],
      preview: Boolean(options.preview),
      generatedUntil: null,
    };
  }

  let untilDateOnly: Date | null = null;
  if (options.untilDate != null) {
    const parsedUntil = new Date(options.untilDate);
    if (Number.isNaN(parsedUntil.getTime())) {
      throw new Error("Data di generazione non valida");
    }

    untilDateOnly = getDateOnly(parsedUntil);
    const startOfToday = getDateOnly(now);
    const giorniRichiesti = Math.round(
      (untilDateOnly.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000),
    );

    if (giorniRichiesti < 0 || giorniRichiesti > MAX_MANUAL_GENERATION_DAYS_AHEAD) {
      return {
        ran: false,
        due: true,
        generatedCount: 0,
        generatedTrainings: [],
        lastRunAt: effectiveSettings.lastRunAt,
        settings: effectiveSettings,
        reason: "until_out_of_range",
        diagnostics: emptyWeeklyProgramDiagnostics(),
        conflicts: [],
        existingCount: 0,
        excludedCount: 0,
        excludedSlots: [],
        preview: Boolean(options.preview),
        generatedUntil: null,
      };
    }
  }

  /*
    **La stagione della generazione, dal risolutore canonico** (ADR-0197).

    Nessuna query in piu: `buildSeasonContext` e la primitiva pura sul
    `club.settings` gia in mano. Chi preme il pulsante dichiara la stagione
    che sta guardando (`options.seasonId`, da `x-active-season-id`); il cron
    non dichiara niente e riceve l'attiva. Un club senza stagioni salvate non
    filtra e non marca — la stagione sintetizzata non e un dato del club, e
    marcarci sopra un evento lo legherebbe a un identificativo che sparisce
    alla prima stagione vera.

    Attivare la stagione B non fa generare in B le regole di A: una regola
    di un'altra stagione si conta e si dice, non si genera.
  */
  const seasonContext: SeasonContext = buildSeasonContext(
    club.settings,
    options.seasonId === undefined
      ? { value: null, declared: false }
      : { value: String(options.seasonId || "").trim() || null, declared: true },
  );
  const generationSeasonId = seasonContext.seasonId;
  const generationSeasonLabel = seasonContext.season?.label ?? null;

  const hasWeeklyScheduleOverride = options.weeklyScheduleOverride !== undefined;
  const incomplete: Record<string, any>[] = [];
  const weeklyScheduleTutte = mergeWeeklyScheduleSources({
    clubWeeklySchedule:
      hasWeeklyScheduleOverride
        ? options.weeklyScheduleOverride
        : club.weekly_schedule,
    resourceWeeklySchedule: hasWeeklyScheduleOverride
      ? []
      : resourcePayloadsByType.weekly_schedule || [],
    stampSeasonId: hasWeeklyScheduleOverride ? generationSeasonId : null,
    onIncomplete: (item) => incomplete.push(item),
  });

  /* Gli esiti per voce: si riempiono qui e nel ciclo, e alla fine si contano. */
  const ruleOutcome = new Map<string, WeeklyProgramDiagnosticCode | "valid">();
  /* Gli allenatori scartati per voce (ADR-0198 §1): si riempiono nel ciclo, si contano nella diagnostica. */
  const trainersDroppedByRule = new Map<string, string[]>();
  const trainersDroppedExamples: string[] = [];
  const ruleExamples = new Map<WeeklyProgramDiagnosticCode, string[]>();
  for (const item of incomplete) {
    ruleOutcome.set(
      String(item?.id || "").trim() || describeRuleForDiagnostics(item),
      "incomplete",
    );
    const examples = ruleExamples.get("incomplete") || [];
    if (examples.length < 3) examples.push(describeRuleForDiagnostics(item));
    ruleExamples.set("incomplete", examples);
  }
  const ruleKey = (item: Record<string, any>) =>
    String(item.id || "").trim() || buildWeeklyScheduleIdentityKey(item) || describeRuleForDiagnostics(item);
  const segnaVoce = (item: Record<string, any>, code: WeeklyProgramDiagnosticCode) => {
    ruleOutcome.set(ruleKey(item), code);
    const examples = ruleExamples.get(code) || [];
    if (examples.length < 3) examples.push(describeRuleForDiagnostics(item));
    ruleExamples.set(code, examples);
  };

  const weeklySchedule = weeklyScheduleTutte.filter((item) => {
    if (!recordBelongsToSeason(item.seasonId, seasonContext)) {
      segnaVoce(item, "other_season");
      return false;
    }
    if (item.active === false) {
      segnaVoce(item, "inactive");
      return false;
    }
    ruleOutcome.set(ruleKey(item), "valid");
    return true;
  });

  const buildDiagnostics = (): WeeklyProgramDiagnostics => {
    const counts = new Map<WeeklyProgramDiagnosticCode, number>();
    let valid = 0;
    for (const outcome of ruleOutcome.values()) {
      if (outcome === "valid") {
        valid += 1;
        continue;
      }
      counts.set(outcome, (counts.get(outcome) || 0) + 1);
    }
    const noOccurrence = counts.get("no_occurrence") || 0;
    const reasons = (
      ["other_season", "inactive", "incomplete", "unknown_category", "ambiguous_category", "no_occurrence"] as const
    )
      .filter((code) => (counts.get(code) || 0) > 0)
      .map((code) => ({
        code,
        count: counts.get(code) || 0,
        label: WEEKLY_PROGRAM_DIAGNOSTIC_LABELS[code](generationSeasonLabel),
        examples: ruleExamples.get(code) || [],
      }));
    return {
      seasonId: generationSeasonId,
      seasonLabel: generationSeasonLabel,
      trainersNotAssigned: {
        rules: trainersDroppedByRule.size,
        trainers: new Set(Array.from(trainersDroppedByRule.values()).flat()).size,
        examples: trainersDroppedExamples,
      },
      totalRules: ruleOutcome.size,
      /* Una voce senza occorrenze nel periodo e valida: e il periodo che non la contiene. */
      validRules: valid + noOccurrence,
      invalidRules: ruleOutcome.size - valid - noOccurrence,
      rulesWithoutOccurrence: noOccurrence,
      outsideSeasonCount,
      reasons,
    };
  };
  let outsideSeasonCount = 0;

  if (!weeklyScheduleTutte.length && !incomplete.length) {
    return {
      ran: true,
      due: true,
      generatedCount: 0,
      generatedTrainings: [],
      lastRunAt: effectiveSettings.lastRunAt,
      settings: effectiveSettings,
      reason: "missing_schedule",
      diagnostics: buildDiagnostics(),
      conflicts: [],
      existingCount: 0,
      excludedCount: 0,
      excludedSlots: [],
      preview: Boolean(options.preview),
      generatedUntil: null,
    };
  }

  /*
    **Il catalogo della stagione, non quello del club** (ADR-0197).

    Con il catalogo intero una voce che nomina la «Under 15» dell'anno scorso
    risolveva sull'identificativo dell'anno scorso, e l'allenamento nasceva
    nella stagione nuova con la squadra vecchia — invisibile ai suoi atleti,
    che stanno nella squadra nuova. Una categoria che la stagione non ha e
    una voce da dire, non da generare.
  */
  /*
    Il filtro sta sui **grezzi**: `buildClubCategoryOptions` restituisce
    opzioni senza `seasonId`, e filtrarle dopo svuotava il catalogo di ogni
    stagione che non fosse la piu vecchia (revisione B1: con il catalogo vuoto
    ogni riferimento passava com'era, e l'allenamento nasceva con la categoria
    dell'anno scorso — il contrario di cio che la regola dice).
  */
  const dellaStagione = (records: unknown[]) =>
    generationSeasonId
      ? filterCollectionBySeason("categories", records, generationSeasonId, {
          legacySeasonId: seasonContext.legacySeasonId,
          knownSeasonIds: seasonContext.knownSeasonIds,
        })
      : records;
  const categoryList = buildClubCategoryOptions({
    clubCategories: dellaStagione(Array.isArray(club.categories) ? (club.categories as unknown[]) : []),
    resourceCategories: dellaStagione(resourcePayloadsByType.categories || []),
    athletes,
  });

  /*
    Voci senza categoria nella stagione: si dicono **prima** del ciclo sui
    giorni, cosi contano anche quando il periodo non contiene il loro giorno.
  */
  for (const item of weeklySchedule) {
    const riferimento = getNonEmptyString(
      item.categoryId,
      item.category_name,
      item.categoryName,
      item.category,
    );
    if (!categoryList.length || !riferimento) continue;
    const risolto = resolveCategoryReference(
      riferimento,
      getNonEmptyString(item.categoryName, item.category_name),
      categoryList,
    );
    if (!risolto?.known) {
      segnaVoce(item, risolto?.ambiguous ? "ambiguous_category" : "unknown_category");
    }
  }

  const validRulesCount = Array.from(ruleOutcome.values()).filter((o) => o === "valid").length;
  if (!validRulesCount) {
    return {
      ran: true,
      due: true,
      generatedCount: 0,
      generatedTrainings: [],
      lastRunAt: effectiveSettings.lastRunAt,
      settings: effectiveSettings,
      reason: "no_valid_rules",
      diagnostics: buildDiagnostics(),
      conflicts: [],
      existingCount: 0,
      excludedCount: 0,
      excludedSlots: [],
      preview: Boolean(options.preview),
      generatedUntil: null,
    };
  }
  /* Gli allenatori storici in `staff_members` sono allenatori come gli altri (revisione A2): stessa lista del client. */
  const staffAllenatori = (Array.isArray(club.staff_members) ? (club.staff_members as any[]) : []).filter(
    (staff) => staff && typeof staff === "object" && ["trainer", "allenatore"].includes(String(staff.role || staff.type || "").trim().toLowerCase()),
  );
  const trainerList = normalizeTrainerList(
    [club.trainers, ...(resourcePayloadsByType.trainers || []), staffAllenatori],
    categoryList,
  );
  /*
    **Chi allena lo dice l'assegnazione della stagione** (ADR-0198 §1). L'indice
    si costruisce sui grezzi — tutte le stagioni, tutti i gruppi — perche e
    l'unico modo di dire che un identificativo dell'anno scorso non e una
    squadra di quest'anno. Una voce con allenatori scritti li tiene solo se
    sono assegnati nella stagione alla sua squadra; una voce senza allenatori
    riceve quelli assegnati. Mai un ripiego sulla stagione precedente.
  */
  const trainerAssignments = buildTrainerAssignmentIndex({
    trainers: [
      ...(Array.isArray(club.trainers) ? (club.trainers as any[]) : []),
      ...(resourcePayloadsByType.trainers || []),
      ...staffAllenatori,
    ].filter((entry) => entry && typeof entry === "object"),
    categories: [
      ...(Array.isArray(club.categories) ? (club.categories as any[]) : []),
      ...(resourcePayloadsByType.categories || []),
    ].filter((entry) => entry && typeof entry === "object" && (entry as any).id),
    groups: (Array.isArray(club.category_groups) ? (club.category_groups as any[]) : [])
      .filter((entry) => entry && typeof entry === "object" && (entry as any).id)
      .map((entry) => ({
        id: String((entry as any).id),
        categoryId: String((entry as any).categoryId || (entry as any).category_id || ""),
        seasonId: (entry as any).seasonId || (entry as any).season_id || null,
      })),
    seasons: seasonContext.seasons,
    seasonId: generationSeasonId,
    legacySeasonId: seasonContext.legacySeasonId,
  });
  const trainerNameOf = (trainerId: string) =>
    trainerList.find((trainer) => trainer.id === trainerId)?.name || trainerId;
  /*
    Per voce, una volta: la squadra e quella **risolta** sul catalogo della
    stagione (revisione A6), non il riferimento com'e scritto. Gli
    identificativi scritti restano solo se assegnati; se nessuno lo e, la voce
    riceve gli assegnati della stagione — mai quelli dell'anno scorso
    (revisione A5). Un nome o un id che non e un allenatore del club si
    ignora e non si conta (revisione A8).
  */
  const trainersPerVoce = new Map<string, string[]>();
  const trainersForRule = (scheduleItem: Record<string, any>, groupId: string | null, resolvedCategoryId: string | null) => {
    const key = `${ruleKey(scheduleItem)}|${groupId || ""}|${resolvedCategoryId || ""}`;
    const gia = trainersPerVoce.get(key);
    if (gia) return gia;
    const target = { categoryId: resolvedCategoryId || scheduleItem.categoryId || null, groupId };
    const explicit = Array.isArray(scheduleItem.trainerIds) ? scheduleItem.trainerIds : [];
    const assegnati = trainerAssignments.assignedTo(target);
    if (!explicit.length) {
      trainersPerVoce.set(key, assegnati);
      return assegnati;
    }
    const { valid, dropped } = trainerAssignments.split(explicit, target);
    if (dropped.length) {
      const key = ruleKey(scheduleItem);
      if (!trainersDroppedByRule.has(key)) {
        trainersDroppedByRule.set(key, dropped);
        if (trainersDroppedExamples.length < 3) {
          trainersDroppedExamples.push(
            `${describeRuleForDiagnostics(scheduleItem)}: ${dropped.map(trainerNameOf).join(", ")}`,
          );
        }
      }
    }
    const effettivi = valid.length ? valid : assegnati;
    trainersPerVoce.set(key, effettivi);
    return effettivi;
  };
  const builtLocationOptions = buildTrainingLocationOptions(
    Array.isArray(club.structures) ? (club.structures as any[]) : [],
  );
  const locationOptions =
    builtLocationOptions.length > 0
      ? builtLocationOptions
      : getFallbackTrainingLocationOptions();
  const existingTrainings = [
    ...toTrainingEntries(club.trainings),
    ...(resourcePayloadsByType.trainings || []).flatMap((entry) =>
      toTrainingEntries(entry),
    ),
  ];
  const existingKeys = new Set(
    existingTrainings
      .map((training) => buildExistingTrainingKey(training, categoryList))
      .filter(Boolean) as string[],
  );
  const generatedTrainings: Record<string, any>[] = [];
  const currentStoredTrainings = dedupeTrainings(
    Array.isArray(club.trainings)
      ? club.trainings.filter(isTrainingRecord)
      : toTrainingEntries(club.trainings),
  );

  /*
    **«N giorni» sono N giorni, non N + 1** (ADR-0198 §7, pilota 2026-09-17:
    40 voci, «una settimana», 50 allenamenti). La finestra a giorni finiva
    con `<= oggi + N`, cioe da giovedi a giovedi **compresi**: otto giorni, e
    le dieci voci del giovedi nascevano due volte. La finestra rotante e
    semiaperta sull'istante: `[adesso, adesso + N × 24h)`. Ogni voce
    settimanale produce esattamente N/7 occorrenze, in qualunque ora e
    giorno si prema il pulsante. «Genera fino a…» resta com'era: una data
    scelta e inclusa per intero.
  */
  /*
    **Una sola cornice: quella civile del club** (revisione D3/D4/D7). Gli
    eventi si scrivono con le cifre civili come UTC (`toEventInstant`); il
    server di produzione gira in UTC, quello di sviluppo a Roma. Confrontare
    un istante vero con `setHours` locali sposta il confine «gia passata» di
    una o due ore a seconda della macchina. Qui `adesso` diventa le cifre
    civili del club (Europe/Rome, o il fuso del club) e ogni occorrenza si
    confronta con le proprie cifre: stessa cornice, ovunque giri. I giorni
    della finestra sono giorni **civili** (`setUTCDate` sulle cifre), non
    24 ore: al cambio d'ora N giorni restano N giorni.
  */
  const clubTimezone = resolveClubTimezone(clubSettings);
  const nowCivil = civilDateOf(now, clubTimezone);
  const startDate = new Date(nowCivil.getUTCFullYear(), nowCivil.getUTCMonth(), nowCivil.getUTCDate());
  const rollingHorizonEnd = untilDateOnly
    ? null
    : (() => {
        const end = new Date(nowCivil);
        end.setUTCDate(end.getUTCDate() + Math.max(7, effectiveSettings.generateDaysAhead));
        return end;
      })();
  const endDate = untilDateOnly
    ? new Date(untilDateOnly)
    : new Date(
        (rollingHorizonEnd as Date).getUTCFullYear(),
        (rollingHorizonEnd as Date).getUTCMonth(),
        (rollingHorizonEnd as Date).getUTCDate(),
      );
  /* L'ultimo giorno coperto per intero dalla finestra rotante (revisione D2). */
  const ultimoGiornoCoperto = rollingHorizonEnd
    ? (() => {
        const d = new Date(endDate);
        d.setDate(d.getDate() - 1);
        return d;
      })()
    : endDate;
  let existingCount = 0;
  /* Le voci del programma la cui categoria non risolve sul catalogo (ADR-0186): saltate, e dette. */
  const unresolvedCategorySlots: string[] = [];
  /* Le voci che nel periodo hanno prodotto almeno un'occorrenza (creata, esistente o esclusa). */
  const ruleWithOccurrence = new Set<string>();
  const seasonStart = seasonContext.season?.startDate || null;
  const seasonEnd = seasonContext.season?.endDate || null;

  for (
    const currentDate = new Date(startDate);
    currentDate <= endDate;
    currentDate.setDate(currentDate.getDate() + 1)
  ) {
    const currentWeekday = getWeekdayLabelFromDate(currentDate);
    if (!currentWeekday) {
      continue;
    }

    const daySchedule = weeklySchedule.filter(
      // Una regola disattivata smette di generare nuove occorrenze, e non
      // tocca quelle gia create (WP-14): il filtro sta qui, non a monte —
      // gli eventi gia esistenti restano leggibili da existingKeys.
      (item) =>
        resolveTrainingWeekday(item) === currentWeekday &&
        item.active !== false &&
        ruleOutcome.get(ruleKey(item)) === "valid",
    );

    for (const scheduleItem of daySchedule) {
      const trainingDate = formatLocalDateKey(currentDate);
      const trainingStart = buildTrainingStart(
        trainingDate,
        scheduleItem.startTime,
      );

      /* Le cifre civili dell'occorrenza, nella stessa cornice di `nowCivil`. */
      const trainingStartCivil = civilInstantOf(trainingDate, scheduleItem.startTime);
      if (!trainingStart || !trainingStartCivil || trainingStartCivil < nowCivil) {
        continue;
      }
      if (rollingHorizonEnd && trainingStartCivil >= rollingHorizonEnd) {
        continue;
      }

      /*
        **Un'occorrenza fuori dal periodo della stagione non nasce** (ADR-0197
        §10): la stagione B che finisce il 31 agosto non genera settembre, e
        una stagione futura non genera prima del suo inizio. Si conta, cosi
        «0 generati» ha una spiegazione.
      */
      if ((seasonStart && trainingDate < seasonStart) || (seasonEnd && trainingDate > seasonEnd)) {
        outsideSeasonCount += 1;
        continue;
      }

      /*
        **Una sospensione salta la data, non la regola** (WP-15): la
        settimana dopo la pausa natalizia torna a generare da sola, perche
        lo slot resta nel programma — solo quella singola occorrenza (o
        l'intervallo) non nasce. Stesso concetto per un salto singolo:
        `from === to`.
      */
      if (
        isDateExcludedForSlot(
          effectiveSettings.exclusions,
          trainingDate,
          scheduleItem.id,
        )
      ) {
        continue;
      }
      /* Un'occorrenza sospesa non e un'occorrenza (revisione B9). */
      ruleWithOccurrence.add(ruleKey(scheduleItem));

      const rawCategoryReference = getNonEmptyString(
        scheduleItem.categoryId,
        scheduleItem.category_name,
        scheduleItem.categoryName,
        scheduleItem.category,
      );
      /*
        **Un allenamento generato porta l'identificativo della categoria, o
        non nasce** (ADR-0186, revisione ostile A9). Qui `resolveCategoryId`
        restituiva il riferimento com'e quando non risolveva, e `find` per
        nome prendeva la prima omonima: con due «Pulcini» l'evento nasceva
        con `categoryId = "Pulcini"` — il difetto di Fortitudo, scritto da un
        cron. Un riferimento che il catalogo conosce si scrive con il suo
        identificativo; uno ambiguo o sconosciuto, con il catalogo in mano,
        salta la data e lo dice.
      */
      const riferimentoRisolto = resolveCategoryReference(
        rawCategoryReference,
        getNonEmptyString(scheduleItem.categoryName, scheduleItem.category_name),
        categoryList,
      );
      if (categoryList.length && rawCategoryReference && !riferimentoRisolto?.known) {
        unresolvedCategorySlots.push(
          `Voce del programma ${scheduleItem.id || ""} (${trainingDate}): la categoria «${rawCategoryReference}» ${riferimentoRisolto?.ambiguous ? "nomina piu squadre" : "non e nel catalogo"}, allenamento non generato`,
        );
        continue;
      }
      const resolvedCategoryId = riferimentoRisolto?.known
        ? riferimentoRisolto.id
        : resolveCategoryId(rawCategoryReference, categoryList) || "";
      const resolvedCategoryLabel =
        (riferimentoRisolto?.known ? riferimentoRisolto.name : "") ||
        resolveCategoryLabel(rawCategoryReference, categoryList) ||
        scheduleItem.categoryName ||
        rawCategoryReference;
      const categoryKey =
        resolvedCategoryId || resolvedCategoryLabel || rawCategoryReference;
      const categoryOption =
        categoryList.find(
          (category) => String(category?.id || "").trim() === resolvedCategoryId,
        ) || null;
      const location = findTrainingLocationOption(locationOptions, {
        structureId: scheduleItem.structureId,
        fieldId: scheduleItem.locationId,
        locationId: scheduleItem.locationId,
      });
      const scheduleGroupId = getNonEmptyString(
        scheduleItem.groupId,
        scheduleItem.group_id,
      );
      /*
        Il gruppo entra nella chiave di deduplica: due squadre della stessa
        categoria, in due sedi diverse, alla stessa ora, sono **due**
        allenamenti e non un duplicato (ADR-0055).
      */
      const duplicateKey = buildTrainingDuplicateKey({
        trainingDate,
        time: scheduleItem.startTime,
        locationKey:
          location?.fieldId || scheduleItem.locationId || scheduleItem.location || "",
        categoryKey: scheduleGroupId || categoryKey,
      });

      /* Gli allenatori della stagione, non quelli scritti sulla voce (ADR-0198 §1): si contano anche sulle occorrenze gia esistenti (revisione D10). */
      const effectiveTrainerIds = trainersForRule(scheduleItem, scheduleGroupId, resolvedCategoryId || null);

      if (existingKeys.has(duplicateKey)) {
        existingCount += 1;
        continue;
      }

      const matchingCategoryOptions = categoryOption
        ? [categoryOption]
        : categoryKey
          ? [
              {
                id: resolvedCategoryId || categoryKey,
                name: resolvedCategoryLabel || categoryKey,
              },
            ]
          : [];
      const trainerNames = effectiveTrainerIds
        .map(
          (trainerId: string) =>
            trainerList.find((trainer) => trainer.id === trainerId)?.name,
        )
        .filter(Boolean);
      /*
        **L'identificativo di un allenamento generato e la sua posizione, non
        un sorteggio.**

        Qui c'era `crypto.randomUUID()`. Con un identificativo casuale la
        chiave unica `(organization_id, kind, legacy_id)` non puo fare il
        proprio mestiere: due esecuzioni del cron sulla stessa fascia
        producono due valori diversi, `skipDuplicates` non riconosce niente, e
        nascono due allenamenti dove ce n'e uno. Sotto concorrenza — due
        istanze del cron, o il cron e il pulsante insieme — la deduplica in
        memoria (`existingKeys`) non aiuta: ognuna vede l'archivio com'era
        prima dell'altra.

        L'identita di un allenamento ricorrente e gia stata definita in questo
        file, ed e `duplicateKey`: giorno, ora, luogo, squadra. Usarla come
        identificativo storico sposta la deduplica **dentro il database**, che
        e l'unico posto che vede tutte e due le esecuzioni.

        Il valore e stabile fra esecuzioni e leggibile in un `SELECT`, ed e la
        ragione per cui non e una impronta: chi guarda una riga deve poter
        capire da quale fascia viene senza ricalcolare niente.
      */
      const trainingId = `auto:${duplicateKey}`;

      generatedTrainings.push({
        id: trainingId,
        // La stagione dell'evento e **quella della regola** (ADR-0197 §11):
        // coincide con quella della generazione perche le regole di altre
        // stagioni sono state contate e scartate prima. Un club senza
        // stagioni salvate non ne marca nessuna.
        seasonId: scheduleItem.seasonId || generationSeasonId || null,
        /* Il titolo e il tipo; la data e un campo (ADR-0198 §3). */
        title: defaultTrainingTitle(),
        date: trainingDate,
        time: scheduleItem.startTime,
        endTime: scheduleItem.endTime,
        categoryId: resolvedCategoryId || categoryKey || null,
        categories: resolvedCategoryId || categoryKey ? [resolvedCategoryId || categoryKey] : [],
        // La squadra concreta: e cio che decide chi comparira nell'appello.
        groupIds: scheduleGroupId ? [scheduleGroupId] : [],
        category:
          resolvedCategoryLabel ||
          categoryOption?.name ||
          "Categoria",
        trainerIds: effectiveTrainerIds,
        trainer:
          trainerNames.length > 0 ? trainerNames.join(", ") : "Allenatore",
        structureId:
          location?.structureId || scheduleItem.structureId || null,
        /*
          **`fieldId`, non solo `locationId`** (bug preesistente trovato
          dalla sonda di performance dell'hostile audit, su Postgres reale):
          `toEventColumns` legge `field_id` da `source.fieldId`/
          `source.field_id`, mai da `source.locationId`. Ogni allenamento
          generato scriveva quindi `field_id: null` — la struttura risultava
          occupata per intero (`findEventOverlaps` tratta "nessun campo"
          come "tutta la struttura"), e il conflitto fra due squadre su
          **campi diversi** della stessa struttura non si distingueva da un
          vero conflitto sullo stesso campo. `locationId` resta, per chi
          legge ancora questa forma storica.
        */
        fieldId: location?.fieldId || scheduleItem.locationId || null,
        locationId: location?.fieldId || scheduleItem.locationId || null,
        location: location?.name || scheduleItem.location || "Campo",
        attendees: 0,
        /*
          **Il catalogo, che questa funzione ha gia in mano** (ADR-0155,
          `D-AUD-27`). Senza, `categoryIdentity` mette ogni riferimento fra i
          **nomi** e due «Under 15» su due sedi tornano a essere una sola
          squadra: l'allenamento generato per Formia nasceva con gli attesi
          di Formia **piu** quelli di Scauri, e quel numero finisce in colonna
          e da li nel denominatore delle presenze.

          `categoryList` e in questa funzione da centosettanta righe, e la usa
          gia la chiave di deduplica: non passarla era una svista, non una
          rinuncia.
        */
        expectedAttendees: athletes.filter((athlete) =>
          athleteMatchesAnyCategory(athlete, matchingCategoryOptions, categoryList),
        ).length,
        categoryColor: "bg-blue-500 text-white",
        status: "upcoming",
        generated: true,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      });
      existingKeys.add(duplicateKey);
    }
  }

  for (const item of weeklySchedule) {
    const key = ruleKey(item);
    if (ruleOutcome.get(key) === "valid" && !ruleWithOccurrence.has(key)) {
      segnaVoce(item, "no_occurrence");
    }
  }

  const lastRunAt = now.toISOString();

  /*
    **La generazione passa dal comando canonico, e non tocca la proiezione.**

    Qui c'era `prisma.club.update({ data: { trainings: … } })`, cioe l'unica
    scrittura di `clubs.trainings` fuori da `events.ts` in tutto l'albero. Il
    registro generico quella colonna la difende in due punti
    (`CLUB_PROJECTED_FIELDS`, `assertNotDomainOwnedModel`); questa porta la
    aggirava, e le conseguenze erano due:

    * cio che generava **non aveva una riga** in `club_events`, quindi appello,
      convocazioni e RSVP rispondevano «Evento non trovato»: un allenamento
      che si vede e su cui non si puo fare niente;
    * la prima proiezione successiva — cioe il primo evento che qualcuno
      salvasse — lo **cancellava**, perche `projectEventsToClubColumn` riscrive
      la colonna per intero dalle righe. Senza errore e senza audit.

    Adesso si creano le righe e la colonna la riallinea il proprietario, che e
    l'unico verso ammesso (ADR-0098). Da qui in avanti un allenamento generato
    e un allenamento: si modifica, si annulla, si conclude, tiene l'appello e
    litiga per il campo come tutti gli altri.

    L'autorita e un contesto di sistema legato a **questo** club e con una
    capacita sola. Non e il proprietario, non e un'utenza, e l'audit lo dice.
  */
  let conflicts: import("./events").BatchConflict[] = [];
  let excludedCount = 0;
  let excludedSlots: import("./events").BatchExclusion[] = [];
  let createdCount = 0;

  if (generatedTrainings.length > 0) {
    const { createClubEventsBatch } = await import("./events");

    /*
      **Chi ha chiesto scrive.** Con una persona dietro si usa il suo scope
      — perimetro compreso — e il suo nome finisce nell'audit. Senza, il
      contesto di sistema, che non e nessuno e lo dichiara.
    */
    const scopeDiScrittura = options.caller
      ? {
          ...options.caller.scope,
          activeOrganizationId: clubId,
        }
      : {
          activeOrganizationId: clubId,
          /* Nessun ruolo: chi scrive non e una persona, e non ne finge una. */
          activeRole: null,
          allowedOrganizationIds: [clubId],
          system: createSystemExecutionContext({
            organizationId: clubId,
            job: "training-automation",
            capabilities: ["training_automation.generate"],
          }),
        };

    /*
      **Un calendario a meta e peggio di un errore solo se nessuno sa quale
      meta — e adesso lo sa.**

      Fino a qui, con una persona dietro il pulsante "Genera ora" e senza una
      data assoluta, una sola fascia su un campo chiuso rifiutava l'**intero**
      blocco: sessanta righe valide scartate per colpa di una, con un
      messaggio che nominava un solo campo e nessun giorno, nessun'ora,
      nessuna categoria — l'UAT su Fortitudo Scauri lo ha mostrato in campo
      (issue "il campo Palazzetto non e disponibile"). "Genera fino a..." e
      l'anteprima gia salvavano le righe buone e riportavano le escluse nel
      riepilogo: non c'era ragione per cui lo stesso clic, con una finestra
      piu corta, si comportasse diversamente e peggio.

      Ora tutte e tre le vie — cron, "Genera fino a...", "Genera ora" —
      salvano cio che possono e restituiscono il dettaglio di cio che non
      hanno potuto: giorno, categoria, risorsa e motivo di ogni fascia
      esclusa (`esclusiDettaglio`, la stessa forma di `conflitti`). Nessuna
      riga invalida viene comunque creata: e sempre e solo un salto, mai
      un'invenzione. Vedi ADR-0170-bis in 18-decision-log.md.
    */
    const esito = await createClubEventsBatch(
      scopeDiScrittura,
      "training",
      generatedTrainings,
      options.caller?.actor ?? {},
      {
        campoChiuso: "salta",
        soloAnteprima: options.preview,
        season: seasonContext,
      },
    );
    conflicts = esito.conflitti;
    excludedCount = esito.esclusi;
    excludedSlots = esito.esclusiDettaglio;
    createdCount = esito.righe.length;
  }

  /*
    **L'anteprima non scrive niente** (WP-17): ne le righe, ne `lastRunAt`.
    Rieseguirla o esaminarla non deve avere alcun effetto collaterale.
  */
  if (!options.preview) {
    await prisma.club.update({
      where: { id: clubId },
      data: {
        settings: buildStoredAutomationSettings(
          club.settings,
          lastRunAt,
          formatLocalDateKey(ultimoGiornoCoperto),
        ),
      },
    });
  }

  void currentStoredTrainings;

  return {
    ran: true,
    due: true,
    generatedCount: createdCount,
    /* Zero generati perche tutto cade fuori dal periodo della stagione: si dice (revisione B8). */
    ...(generatedTrainings.length === 0 && outsideSeasonCount > 0 ? { reason: "outside_season" as const } : {}),
    unresolvedCategorySlots,
    diagnostics: buildDiagnostics(),
    generatedTrainings,
    lastRunAt: options.preview ? effectiveSettings.lastRunAt : lastRunAt,
    settings: options.preview
      ? effectiveSettings
      : {
          ...effectiveSettings,
          lastRunAt,
          generatedUntil:
            effectiveSettings.generatedUntil &&
            effectiveSettings.generatedUntil > formatLocalDateKey(ultimoGiornoCoperto)
              ? effectiveSettings.generatedUntil
              : formatLocalDateKey(ultimoGiornoCoperto),
        },
    conflicts,
    existingCount,
    excludedCount,
    excludedSlots,
    preview: Boolean(options.preview),
    generatedUntil: formatLocalDateKey(ultimoGiornoCoperto),
  };
}

export async function runDueTrainingAutomationForAllClubs(now = new Date()) {
  const clubs = await prisma.club.findMany({
    select: {
      id: true,
      name: true,
      settings: true,
    },
  });

  const results: Array<{
    clubId: string;
    clubName: string;
    generatedCount: number;
    ran: boolean;
    reason?: string;
  }> = [];

  for (const club of clubs) {
    const clubSettings = isRecord(club.settings)
      ? (club.settings as Record<string, unknown>)
      : {};
    const settings = parseTrainingAutomationSettings(
      clubSettings.trainingAutomation,
    );

    if (!shouldRunTrainingAutomation(settings, now)) {
      continue;
    }

    try {
      const result = await runTrainingAutomationForClub(club.id, { now });
      results.push({
        clubId: club.id,
        clubName: club.name,
        generatedCount: result.generatedCount,
        ran: result.ran,
        reason: result.reason,
      });
    } catch (error: any) {
      results.push({
        clubId: club.id,
        clubName: club.name,
        generatedCount: 0,
        ran: false,
        reason: error?.message || "automation_error",
      });
    }
  }

  return results;
}
