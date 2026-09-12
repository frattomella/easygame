import { prisma } from "@/lib/server/prisma";
import { createSystemExecutionContext } from "@/lib/server/system-actor";
import { normalizeTrainerList } from "@/lib/trainer-utils";
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
  formatTrainingTitle,
  getTrainingCategoryReferences,
  getTrainingDate,
  getTrainingEndTime,
  getTrainingStartTime,
  isValidTimeRange,
  resolveCategoryLabelForTraining,
  resolveExplicitWeeklyScheduleDay,
  resolveTrainingWeekday,
} from "@/lib/training-utils";
import {
  isDateExcludedForSlot,
  parseTrainingAutomationSettings,
  shouldRunTrainingAutomation,
  type TrainingAutomationSettings,
} from "@/lib/training-automation-utils";
import {
  filterCollectionBySeason,
  normalizeClubSeasons,
} from "@/lib/club-seasons";
import { toEventDay, toEventTime } from "@/lib/events/model";

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
  reason?: "not_due" | "missing_schedule" | "until_out_of_range";
  /**
   * Le fasce che il programma settimanale avrebbe generato e che occupano un
   * posto gia occupato: non create, «da verificare» (WP-07).
   */
  conflicts: import("./events").BatchConflict[];
  /** Fasce che esistevano gia (stessa identita: giorno, ora, campo, categoria). */
  existingCount: number;
  /** Fasce non create perche cadono quando la struttura e chiusa. */
  excludedCount: number;
  /** `true` se non si e scritto niente: la stessa pianificazione, mostrata invece che eseguita (WP-17). */
  preview: boolean;
  /** L'ultimo giorno fino a cui questa esecuzione ha generato, in `YYYY-MM-DD`. */
  generatedUntil: string | null;
};

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
    !locationReference ||
    trainerIds.length === 0
  ) {
    return null;
  }

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
      **Assente vale attivo** (WP-14). Ogni voce salvata prima che questo
      flag esistesse non ha `active` nel proprio JSON: leggerla come
      disattivata spegnerebbe in silenzio l'intero programma settimanale di
      ogni club che non ha mai toccato il campo.
    */
    active: item.active === false ? false : true,
  };
};

/**
 * **La stagione si filtra sulla voce grezza, non su quella normalizzata**
 * (chiude parte di WP-13).
 *
 * `normalizeWeeklyScheduleSourceItem` ricostruisce l'oggetto e non porta
 * `seasonId` nel risultato: filtrare dopo di li significherebbe non poter
 * piu distinguere una voce della stagione scorsa da una di quella attiva.
 * Il filtro entra quindi qui, sulle voci come arrivano dalle due fonti
 * (`clubs.weekly_schedule` e `club_resource_items`), con la stessa regola
 * gia in uso nel resto del prodotto (`resources.ts`,
 * `filterCollectionBySeason`): una voce senza `seasonId` e una voce
 * precedente all'esistenza delle stagioni e resta visibile finche la
 * stagione «legacy» e quella attiva.
 */
const mergeWeeklyScheduleSources = ({
  clubWeeklySchedule,
  resourceWeeklySchedule,
  seasonFilter,
}: {
  clubWeeklySchedule: unknown;
  resourceWeeklySchedule: unknown;
  seasonFilter?: (entries: Record<string, any>[]) => Record<string, any>[];
}) => {
  const scheduleSources = [clubWeeklySchedule, resourceWeeklySchedule];
  const merged: Record<string, any>[] = [];
  const seen = new Set<string>();

  scheduleSources.forEach((source) => {
    const rawEntries = toWeeklyScheduleEntries(source);
    const scopedEntries = seasonFilter ? seasonFilter(rawEntries) : rawEntries;
    scopedEntries.forEach((item) => {
      const normalizedItem = normalizeWeeklyScheduleSourceItem(item);
      if (!normalizedItem) {
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
      conflicts: [],
      existingCount: 0,
      excludedCount: 0,
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
        conflicts: [],
        existingCount: 0,
        excludedCount: 0,
        preview: Boolean(options.preview),
        generatedUntil: null,
      };
    }
  }

  /*
    **La stagione attiva, letta dal `club.settings` gia in mano** (WP-13).

    Nessuna query in piu: `normalizeClubSeasons` e la stessa primitiva pura
    che usa `readClubSeasonState`, e qui il club e gia stato caricato per
    intero. Un club che non ha ancora salvato nessuna stagione (`isFallback`)
    non filtra e non marca — la stagione sintetizzata non e un dato del club,
    e marcarci sopra un evento lo legherebbe a un identificativo che sparisce
    alla prima stagione vera (stessa regola di `resolveRequestSeason` in
    `resources.ts`).
  */
  const seasonState = normalizeClubSeasons(club.settings);
  const activeSeasonId = seasonState.isFallback ? null : seasonState.activeSeasonId;
  const seasonFilter = activeSeasonId
    ? (entries: Record<string, any>[]) =>
        filterCollectionBySeason("weekly_schedule", entries, activeSeasonId, {
          legacySeasonId: seasonState.legacySeasonId,
          knownSeasonIds: seasonState.seasons.map((season) => season.id),
        })
    : undefined;

  const hasWeeklyScheduleOverride = options.weeklyScheduleOverride !== undefined;
  const weeklySchedule = mergeWeeklyScheduleSources({
    clubWeeklySchedule:
      hasWeeklyScheduleOverride
        ? options.weeklyScheduleOverride
        : club.weekly_schedule,
    resourceWeeklySchedule: hasWeeklyScheduleOverride
      ? []
      : resourcePayloadsByType.weekly_schedule || [],
    seasonFilter,
  });

  if (!weeklySchedule.length) {
    return {
      ran: true,
      due: true,
      generatedCount: 0,
      generatedTrainings: [],
      lastRunAt: effectiveSettings.lastRunAt,
      settings: effectiveSettings,
      reason: "missing_schedule",
      conflicts: [],
      existingCount: 0,
      excludedCount: 0,
      preview: Boolean(options.preview),
      generatedUntil: null,
    };
  }

  const categoryList = buildClubCategoryOptions({
    clubCategories: club.categories,
    resourceCategories: resourcePayloadsByType.categories || [],
    athletes,
  });
  const trainerList = normalizeTrainerList(
    [club.trainers, ...(resourcePayloadsByType.trainers || [])],
    categoryList,
  );
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

  const startDate = getDateOnly(now);
  const endDate = untilDateOnly
    ? new Date(untilDateOnly)
    : (() => {
        const rolling = getDateOnly(now);
        rolling.setDate(
          rolling.getDate() + Math.max(7, effectiveSettings.generateDaysAhead),
        );
        return rolling;
      })();
  let existingCount = 0;

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
      (item) => resolveTrainingWeekday(item) === currentWeekday && item.active !== false,
    );

    for (const scheduleItem of daySchedule) {
      const trainingDate = formatLocalDateKey(currentDate);
      const trainingStart = buildTrainingStart(
        trainingDate,
        scheduleItem.startTime,
      );

      if (!trainingStart || trainingStart <= now) {
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

      const rawCategoryReference = getNonEmptyString(
        scheduleItem.categoryId,
        scheduleItem.category_name,
        scheduleItem.categoryName,
        scheduleItem.category,
      );
      const resolvedCategoryId =
        resolveCategoryId(rawCategoryReference, categoryList) || "";
      const resolvedCategoryLabel =
        resolveCategoryLabel(rawCategoryReference, categoryList) ||
        scheduleItem.categoryName ||
        rawCategoryReference;
      const categoryKey =
        resolvedCategoryId || resolvedCategoryLabel || rawCategoryReference;
      const categoryOption =
        categoryList.find(
          (category) =>
            String(category?.id || "").trim() === resolvedCategoryId ||
            String(category?.name || "").trim() === resolvedCategoryLabel,
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
      const trainerNames = Array.isArray(scheduleItem.trainerIds)
        ? scheduleItem.trainerIds
            .map(
              (trainerId: string) =>
                trainerList.find((trainer) => trainer.id === trainerId)?.name,
            )
            .filter(Boolean)
        : [];
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
        // La stagione dell'evento e quella attiva al momento della
        // generazione: un club senza stagioni salvate non ne marca nessuna.
        seasonId: activeSeasonId || null,
        title: formatTrainingTitle(trainingDate),
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
        trainerIds: Array.isArray(scheduleItem.trainerIds)
          ? scheduleItem.trainerIds
          : [],
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
      **Un cron non puo correggere un calendario — e nemmeno "Genera fino
      a...", che non ha nessuno li per confermare riga per riga.**

      Con una persona dietro **e senza una data assoluta**, una fascia su un
      campo chiuso resta un rifiuto: e cio su cui puo agire, sull'unica
      azione che oggi genera solo pochi giorni avanti. "Genera fino a..." e
      l'anteprima coprono invece un intervallo lungo apposta, e un giorno
      chiuso non deve fermare mesi di generazione: la riga si salta e torna
      nel riepilogo come esclusa, come gia faceva il cron.
    */
    const esito = await createClubEventsBatch(
      scopeDiScrittura,
      "training",
      generatedTrainings,
      options.caller?.actor ?? {},
      {
        campoChiuso: options.caller && !isManualUntilRequest ? "rifiuta" : "salta",
        soloAnteprima: options.preview,
      },
    );
    conflicts = esito.conflitti;
    excludedCount = esito.esclusi;
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
          formatLocalDateKey(endDate),
        ),
      },
    });
  }

  void currentStoredTrainings;

  return {
    ran: true,
    due: true,
    generatedCount: createdCount,
    generatedTrainings,
    lastRunAt: options.preview ? effectiveSettings.lastRunAt : lastRunAt,
    settings: options.preview
      ? effectiveSettings
      : {
          ...effectiveSettings,
          lastRunAt,
          generatedUntil:
            effectiveSettings.generatedUntil &&
            effectiveSettings.generatedUntil > formatLocalDateKey(endDate)
              ? effectiveSettings.generatedUntil
              : formatLocalDateKey(endDate),
        },
    conflicts,
    existingCount,
    excludedCount,
    preview: Boolean(options.preview),
    generatedUntil: formatLocalDateKey(endDate),
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
