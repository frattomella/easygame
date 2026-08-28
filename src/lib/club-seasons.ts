export type ClubSeasonStatus = "upcoming" | "active" | "archived";

export type ClubSeason = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  status: ClubSeasonStatus;
  createdAt: string;
  archivedAt?: string | null;
};

const FALLBACK_DATE = new Date();

export const SEASON_SCOPED_DATA_TYPES = new Set([
  "categories",
  // I gruppi operativi seguono le categorie: sono la coppia (categoria, sede)
  // e una categoria appartiene a una stagione. Le **sedi** invece no: un
  // impianto a Roma resta a Roma anche l'anno dopo (ADR-0038).
  "category_groups",
  "discounts",
  "expected_expenses",
  "expected_income",
  "jersey_assignments",
  "jersey_groups",
  "kit_assignments",
  "matches",
  "payment_plans",
  "procure",
  "secretariat_notes",
  "sponsor_payments",
  "trainings",
  "transactions",
  "transfers",
  "weekly_schedule",
]);

const toIsoDate = (value: Date) => value.toISOString().split("T")[0];

const parseDate = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const startTimeOf = (season: { startDate: string }) =>
  parseDate(season.startDate)?.getTime() ?? 0;

// --- stato della stagione ---------------------------------------------------

/**
 * Tre stati e non di piu (Blocco 6): **futura**, **attiva**, **archiviata**.
 *
 * `draft` era il nome storico di «non ancora cominciata» e continua ad
 * arrivare dai club creati prima: viene letto come `upcoming`, non scartato,
 * altrimenti una stagione programmata si presenterebbe come attiva.
 */
export const SEASON_STATUSES: ClubSeasonStatus[] = [
  "upcoming",
  "active",
  "archived",
];

export const SEASON_STATUS_LABELS: Record<ClubSeasonStatus, string> = {
  upcoming: "Futura",
  active: "Attiva",
  archived: "Archiviata",
};

const SEASON_STATUS_ALIASES: Record<string, ClubSeasonStatus> = {
  active: "active",
  attiva: "active",
  corrente: "active",
  current: "active",
  open: "active",
  archived: "archived",
  archiviata: "archived",
  closed: "archived",
  chiusa: "archived",
  upcoming: "upcoming",
  future: "upcoming",
  futura: "upcoming",
  draft: "upcoming",
  planned: "upcoming",
  programmata: "upcoming",
};

/**
 * Legge uno stato dichiarato. Restituisce `null` quando non e riconoscibile,
 * cosi chi normalizza puo **dedurlo dalle date** invece di inventarne uno.
 */
export const readSeasonStatus = (value: unknown): ClubSeasonStatus | null =>
  SEASON_STATUS_ALIASES[String(value || "").trim().toLowerCase()] || null;

export const normalizeSeasonStatus = (
  value: unknown,
  fallback: ClubSeasonStatus = "upcoming",
): ClubSeasonStatus => readSeasonStatus(value) || fallback;

type SeasonWithOptionalStatus = Omit<ClubSeason, "status"> & {
  status: ClubSeasonStatus | null;
};

/**
 * Rende coerente lo stato di **tutte** le stagioni rispetto a `activeSeasonId`.
 *
 * Invariante unica del modello: la stagione puntata da `activeSeasonId` e
 * l'unica `active`. Le altre non possono restare `active` — altrimenti due
 * stagioni si contenderebbero il perimetro dei dati — e diventano `archived`
 * se sono cominciate prima di quella attiva, `upcoming` se cominciano dopo.
 * Uno stato gia dichiarato e diverso da `active` viene rispettato: e una
 * scelta dell'utente, non un residuo.
 */
export const applySeasonStatuses = (
  seasons: SeasonWithOptionalStatus[],
  activeSeasonId: string | null | undefined,
): ClubSeason[] => {
  const active = seasons.find((season) => season.id === activeSeasonId) || null;
  const activeStart = active ? startTimeOf(active) : 0;

  return seasons.map((season) => {
    if (active && season.id === active.id) {
      return { ...season, status: "active", archivedAt: null } satisfies ClubSeason;
    }

    const derived: ClubSeasonStatus =
      startTimeOf(season) > activeStart ? "upcoming" : "archived";
    const status =
      !season.status || season.status === "active" ? derived : season.status;

    return {
      ...season,
      status,
      archivedAt: status === "archived" ? season.archivedAt ?? null : null,
    } satisfies ClubSeason;
  });
};

export const sortSeasonsByRecency = <T extends { startDate: string }>(
  seasons: T[],
) => [...seasons].sort((left, right) => startTimeOf(right) - startTimeOf(left));

export const buildSportsSeasonLabel = (referenceDate = FALLBACK_DATE) => {
  const currentYear = referenceDate.getFullYear();
  const startYear = referenceDate.getMonth() >= 6 ? currentYear : currentYear - 1;
  return `${startYear}/${startYear + 1}`;
};

export const buildDefaultSeason = (referenceDate = FALLBACK_DATE): ClubSeason => {
  const currentYear = referenceDate.getFullYear();
  const startYear = referenceDate.getMonth() >= 6 ? currentYear : currentYear - 1;
  const createdAt = new Date().toISOString();

  return {
    id: `season-${startYear}-${startYear + 1}`,
    label: `${startYear}/${startYear + 1}`,
    startDate: `${startYear}-07-01`,
    endDate: `${startYear + 1}-06-30`,
    status: "active",
    createdAt,
    archivedAt: null,
  };
};

export const normalizeClubSeasons = (settings: any) => {
  const fallbackSeason = buildDefaultSeason();
  const rawSeasons: unknown[] = Array.isArray(settings?.seasons)
    ? settings.seasons
    : [];

  const parsedSeasons: SeasonWithOptionalStatus[] = rawSeasons.length
    ? sortSeasonsByRecency(
        rawSeasons.map((season: any) => {
          const startDate =
            typeof season?.startDate === "string" && season.startDate
              ? season.startDate
              : fallbackSeason.startDate;
          const endDate =
            typeof season?.endDate === "string" && season.endDate
              ? season.endDate
              : fallbackSeason.endDate;

          return {
            id:
              typeof season?.id === "string" && season.id.trim()
                ? season.id.trim()
                : `season-${startDate}-${endDate}`,
            label:
              typeof season?.label === "string" && season.label.trim()
                ? season.label.trim()
                : buildSportsSeasonLabel(parseDate(startDate) || FALLBACK_DATE),
            startDate,
            endDate,
            status: readSeasonStatus(season?.status),
            createdAt:
              typeof season?.createdAt === "string" && season.createdAt
                ? season.createdAt
                : new Date().toISOString(),
            archivedAt:
              typeof season?.archivedAt === "string" ? season.archivedAt : null,
          } satisfies SeasonWithOptionalStatus;
        }),
      )
    : [fallbackSeason];

  const allowedSeasonIds = new Set(parsedSeasons.map((season) => season.id));
  const preferredActiveSeasonId =
    typeof settings?.activeSeasonId === "string" && allowedSeasonIds.has(settings.activeSeasonId)
      ? settings.activeSeasonId
      : null;

  const activeCandidate =
    parsedSeasons.find((season) => season.id === preferredActiveSeasonId) ||
    parsedSeasons.find((season) => season.status === "active") ||
    parsedSeasons.find((season) => season.status !== "archived") ||
    parsedSeasons[0];

  const seasons = applySeasonStatuses(parsedSeasons, activeCandidate.id);
  const activeSeason =
    seasons.find((season) => season.id === activeCandidate.id) || seasons[0];

  return {
    seasons,
    activeSeasonId: activeSeason.id,
    activeSeason,
    legacySeasonId: resolveLegacySeasonId(seasons),
    /*
      Un club senza stagioni salvate ne riceve **una in lettura**, sintetizzata
      qui, perche l'interfaccia non puo restare senza perimetro dei dati.
      Quella stagione non e un dato del club: chi scrive deve saperlo, o la
      prima stagione vera nasce accanto a un doppione che nessuno ha creato —
      con la stessa etichetta, e per giunta anch'esso `active`.
    */
    isFallback: rawSeasons.length === 0,
  };
};

/**
 * Stagione a cui appartengono i record creati **prima** dell'introduzione
 * delle stagioni, cioe quelli senza `seasonId`.
 *
 * E la stagione piu vecchia del club: `seasons` e ordinato dalla piu recente
 * alla piu antica. Attribuirli a una stagione sola e l'unico modo di tenere le
 * stagioni separate senza far sparire i dati storici (WP-32).
 */
export const resolveLegacySeasonId = (seasons: ClubSeason[]) =>
  seasons.length > 0 ? seasons[seasons.length - 1].id : null;

const readRecordSeasonId = (record: any) => {
  const value =
    typeof record?.seasonId === "string"
      ? record.seasonId
      : typeof record?.season_id === "string"
        ? record.season_id
        : "";

  return value.trim() || null;
};

export const isSeasonScopedDataType = (dataType: string) =>
  SEASON_SCOPED_DATA_TYPES.has(dataType);

export const applySeasonIdToRecord = (
  record: any,
  seasonId: string | null | undefined,
) => {
  if (!record || typeof record !== "object" || !seasonId) {
    return record;
  }

  return {
    ...record,
    seasonId: record.seasonId || seasonId,
  };
};

export const applySeasonIdToCollection = (
  records: any[],
  seasonId: string | null | undefined,
) =>
  (Array.isArray(records) ? records : []).map((record) =>
    applySeasonIdToRecord(record, seasonId),
  );

/**
 * Filtra una collezione sulla stagione attiva.
 *
 * I record **senza** `seasonId` sono quelli creati prima che le stagioni
 * esistessero. Non vanno scartati (sparirebbero) ne mostrati ovunque (le
 * stagioni non sarebbero piu separate): appartengono alla stagione baseline,
 * cioe la piu vecchia del club. Quando la baseline non e nota si preferisce
 * mostrarli, perche perdere dati e peggio che mostrarne troppi.
 */
export const filterCollectionBySeason = (
  dataType: string,
  records: any[],
  activeSeasonId: string | null | undefined,
  options: { legacySeasonId?: string | null; knownSeasonIds?: string[] } = {},
) => {
  if (!isSeasonScopedDataType(dataType)) {
    return Array.isArray(records) ? records : [];
  }

  if (!activeSeasonId) {
    return Array.isArray(records) ? records : [];
  }

  const legacySeasonId = options.legacySeasonId ?? null;
  const keepLegacyRecords = !legacySeasonId || legacySeasonId === activeSeasonId;

  /*
    Un `seasonId` che nomina una stagione **che il club non ha** non e un
    record di un'altra annata: e un record orfano. Succede quando la stagione
    che lo aveva marcato non e mai stata salvata — la stagione sintetizzata per
    un club che non ne ha ancora — e la prima stagione vera la sostituisce.
    Trattarlo come «di un'altra stagione» lo fa sparire da ogni schermata senza
    che nulla lo dica; trattarlo come un record senza stagione lo riporta dove
    stanno gli altri dati senza annata. Vale la regola gia scritta qui sopra:
    meglio mostrare un dato in piu che una lista vuota inspiegabile.
  */
  const knownSeasonIds = options.knownSeasonIds;
  const isKnownSeason = (seasonId: string) =>
    !knownSeasonIds || knownSeasonIds.includes(seasonId);

  return (Array.isArray(records) ? records : []).filter((record) => {
    const recordSeasonId = readRecordSeasonId(record);

    if (recordSeasonId === null || !isKnownSeason(recordSeasonId)) {
      return keepLegacyRecords;
    }

    return recordSeasonId === activeSeasonId;
  });
};

export const createSeasonDraft = (
  label: string,
  startDate: string,
  endDate: string,
  status: ClubSeasonStatus = "active",
): ClubSeason => ({
  id: `season-${startDate}-${endDate}-${Math.random().toString(36).slice(2, 7)}`,
  label: label.trim(),
  startDate,
  endDate,
  status,
  createdAt: new Date().toISOString(),
  archivedAt: null,
});

export const buildSeasonLabelFromDates = (startDate: string, endDate: string) => {
  const start = parseDate(startDate);
  const end = parseDate(endDate);

  if (!start || !end) {
    return buildSportsSeasonLabel();
  }

  return `${start.getFullYear()}/${end.getFullYear()}`;
};

export const normalizeActiveClubSeason = (club: any) => {
  const settings =
    typeof club?.settings === "object" && club.settings ? club.settings : {};
  const { activeSeason, activeSeasonId } = normalizeClubSeasons(settings);

  return {
    activeSeasonId,
    activeSeasonLabel: activeSeason.label,
  };
};

// --- creazione di una stagione ---------------------------------------------

export type SeasonInput = {
  label?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: unknown;
};

/**
 * Valida una stagione nuova contro quelle esistenti e ne restituisce il
 * record. Solleva con un messaggio in italiano: e lo stesso testo che l'API
 * rimanda al client, non serve tradurlo due volte.
 */
export const buildSeasonFromInput = (
  input: SeasonInput,
  existingSeasons: ClubSeason[] = [],
  options: { id?: string; now?: string } = {},
): ClubSeason => {
  const startDate = String(input.startDate || "").trim();
  const endDate = String(input.endDate || "").trim();

  if (!startDate || !endDate) {
    throw new Error("Indica la data di inizio e la data di fine della stagione");
  }

  const start = parseDate(startDate);
  const end = parseDate(endDate);

  if (!start || !end) {
    throw new Error("Le date della stagione non sono valide");
  }

  if (start.getTime() >= end.getTime()) {
    throw new Error("La data di fine deve essere successiva alla data di inizio");
  }

  const label =
    String(input.label || "").trim() ||
    buildSeasonLabelFromDates(toIsoDate(start), toIsoDate(end));

  const normalizedLabel = label.toLowerCase();
  if (
    existingSeasons.some(
      (season) => season.label.trim().toLowerCase() === normalizedLabel,
    )
  ) {
    throw new Error(`Esiste gia una stagione con il nome ${label}`);
  }

  if (
    existingSeasons.some(
      (season) => season.startDate === startDate && season.endDate === endDate,
    )
  ) {
    throw new Error("Esiste gia una stagione con lo stesso periodo");
  }

  const status = normalizeSeasonStatus(input.status, "upcoming");
  if (status === "archived") {
    throw new Error("Una stagione non puo nascere archiviata");
  }

  return {
    id:
      String(options.id || "").trim() ||
      `season-${startDate}-${endDate}-${Math.random().toString(36).slice(2, 7)}`,
    label,
    startDate,
    endDate,
    status,
    createdAt: options.now || new Date().toISOString(),
    archivedAt: null,
  };
};

// --- riporto fra stagioni (WP-35) ------------------------------------------

export type SeasonRolloverTypeDescriptor = {
  key: string;
  label: string;
  description: string;
  defaultSelected: boolean;
  /**
   * Dove vive il dato. `club_resource` e una collezione JSON di
   * `clubs.settings` e la clona `planSeasonRollover`; `model` e una tabella
   * dedicata, che il piano non puo toccare perche non ha la collezione in mano
   * — la porta il livello server, dopo, riusando l'`idMap` del piano.
   */
  storage?: "club_resource" | "model";
  /**
   * Tipi che devono essere riportati insieme a questo. Senza le categorie di
   * destinazione le appartenenze non avrebbero dove andare, e si scriverebbero
   * righe orfane invece di dirlo.
   */
  requires?: string[];
};

/**
 * Cosa si puo riportare: **la configurazione** della stagione, cioe cio che si
 * riscriverebbe identico a mano ogni luglio. Non i dati operativi.
 *
 * L'ordine e quello con cui l'elenco viene mostrato; il rimappaggio dei
 * riferimenti avviene dopo la clonazione di tutti i tipi, quindi non dipende
 * da questo ordine.
 */
export const SEASON_ROLLOVER_TYPES: SeasonRolloverTypeDescriptor[] = [
  {
    key: "categories",
    label: "Categorie",
    description: "Squadre e fasce d'eta, con le compatibilita fra categorie",
    defaultSelected: true,
  },
  {
    key: "discounts",
    label: "Sconti",
    description: "Riduzioni applicabili alle quote",
    defaultSelected: true,
  },
  {
    key: "payment_plans",
    label: "Piani di pagamento",
    description: "Quote, servizi e rateizzazioni, con gli sconti collegati",
    defaultSelected: true,
  },
  {
    key: "category_groups",
    label: "Gruppi operativi",
    description: "Abbinamento fra categoria e sede, con l'impianto abituale",
    defaultSelected: true,
  },
  {
    key: "jersey_groups",
    label: "Gruppi numerazione",
    description: "Raggruppamenti per l'assegnazione dei numeri di maglia",
    defaultSelected: true,
  },
  {
    key: "weekly_schedule",
    label: "Programma settimanale",
    description:
      "Struttura ricorrente degli allenamenti, senza le sedute gia generate",
    defaultSelected: false,
  },
  {
    key: "expected_income",
    label: "Entrate previste",
    description: "Voci di budget previsionale in entrata",
    defaultSelected: false,
  },
  {
    key: "expected_expenses",
    label: "Uscite previste",
    description: "Voci di budget previsionale in uscita",
    defaultSelected: false,
  },
  {
    key: "athlete_memberships",
    label: "Tesserati nelle squadre",
    description:
      "Chi rinnova entra nelle squadre della stagione nuova, con la sua sede",
    defaultSelected: true,
    storage: "model",
    requires: ["categories"],
  },
];

const ROLLOVER_TYPE_KEYS = new Set(
  SEASON_ROLLOVER_TYPES.map((entry) => entry.key),
);

/** Il tipo che porta i tesserati: sta in tabella, non in `clubs.settings`. */
export const ATHLETE_MEMBERSHIP_ROLLOVER_TYPE = "athlete_memberships";

const MODEL_ROLLOVER_TYPE_KEYS = new Set(
  SEASON_ROLLOVER_TYPES.filter((entry) => entry.storage === "model").map(
    (entry) => entry.key,
  ),
);

/**
 * I tipi che `planSeasonRollover` sa clonare da solo. Gli altri vivono in una
 * tabella e li porta il livello server.
 */
export const isClubResourceRolloverType = (dataType: string) =>
  ROLLOVER_TYPE_KEYS.has(String(dataType || "").trim()) &&
  !MODEL_ROLLOVER_TYPE_KEYS.has(String(dataType || "").trim());

/**
 * Un tipo che ne richiede un altro non si riporta da solo. Il messaggio dice
 * cosa manca invece di lasciare che il riporto produca righe orfane.
 */
export const assertRolloverTypeRequirements = (types: string[]) => {
  const selected = new Set(types);

  for (const descriptor of SEASON_ROLLOVER_TYPES) {
    if (!descriptor.requires?.length || !selected.has(descriptor.key)) {
      continue;
    }

    const missing = descriptor.requires.filter((key) => !selected.has(key));
    if (missing.length) {
      const labels = missing.map(getSeasonRolloverTypeLabel).join(", ");
      throw new Error(
        `Per riportare «${descriptor.label}» devi riportare anche: ${labels}`,
      );
    }
  }
};

export const isRolloverableDataType = (dataType: string) =>
  ROLLOVER_TYPE_KEYS.has(String(dataType || "").trim());

export const getSeasonRolloverTypeLabel = (dataType: string) =>
  SEASON_ROLLOVER_TYPES.find((entry) => entry.key === dataType)?.label ||
  dataType;

/**
 * Dati **globali del club**: non appartengono a nessuna stagione e restano
 * disponibili in tutte. Non vanno duplicati, altrimenti si moltiplicherebbero
 * a ogni stagione nuova. L'elenco esiste per poterlo dire all'utente nel
 * riepilogo, invece di lasciarglielo dedurre da un'assenza.
 */
export const SEASON_GLOBAL_DATA_TYPES = [
  { key: "trainers", label: "Allenatori e staff" },
  { key: "athletes", label: "Atleti" },
  { key: "sponsors", label: "Sponsor" },
  { key: "club_sites", label: "Sedi" },
  { key: "structures", label: "Strutture" },
  { key: "clothing_products", label: "Magazzino abbigliamento" },
  { key: "document_templates", label: "Modulistica" },
  { key: "opening_hours", label: "Orari di apertura" },
  { key: "bank_accounts", label: "Conti correnti" },
];

/**
 * Dati storici della stagione di origine: appartengono a quella stagione e la
 * nuova deve nascerne senza. Copiarli falserebbe bilanci e presenze.
 */
export const SEASON_NEVER_COPIED_DATA_TYPES = [
  { key: "trainings", label: "Allenamenti e presenze" },
  { key: "matches", label: "Gare" },
  { key: "transactions", label: "Movimenti economici" },
  { key: "transfers", label: "Trasferimenti" },
  { key: "sponsor_payments", label: "Pagamenti sponsor" },
  { key: "procure", label: "Procure" },
  { key: "secretariat_notes", label: "Note di segreteria" },
  { key: "jersey_assignments", label: "Numeri di maglia assegnati" },
  { key: "kit_assignments", label: "Kit consegnati" },
];

export const normalizeRolloverTypes = (types: unknown): string[] => {
  const requested = Array.isArray(types)
    ? types.map((type) => String(type || "").trim())
    : [];
  const selected = new Set(
    requested.filter((type) => ROLLOVER_TYPE_KEYS.has(type)),
  );

  const unknownType = requested.find(
    (type) => type && !ROLLOVER_TYPE_KEYS.has(type),
  );
  if (unknownType) {
    throw new Error(`Il tipo ${unknownType} non e riportabile fra stagioni`);
  }

  return SEASON_ROLLOVER_TYPES.filter((entry) => selected.has(entry.key)).map(
    (entry) => entry.key,
  );
};

/**
 * Chiavi il cui valore e un riferimento a un altro record stagionale. Dopo la
 * clonazione vanno riscritte con i nuovi id, altrimenti un piano di pagamento
 * della stagione nuova continuerebbe a puntare agli sconti di quella vecchia.
 */
const ROLLOVER_REFERENCE_KEYS = new Set([
  "applicableDiscountIds",
  "applicable_discount_ids",
  "categories",
  "categoryId",
  "categoryIds",
  "category_id",
  "category_ids",
  "compatibleCategoryIds",
  "compatible_category_ids",
  "discountIds",
  "discounts",
  "groupId",
  "group_id",
  "jerseyGroupId",
  "jersey_group_id",
  "paymentPlanId",
  "paymentPlanIds",
  "payment_plan_id",
  "payment_plan_ids",
  "planId",
  "plan_id",
]);

const MAX_REMAP_DEPTH = 8;

const remapReference = (
  value: any,
  idMap: Record<string, string>,
  depth: number,
): any => {
  if (typeof value === "string") {
    return idMap[value] || value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => remapReference(entry, idMap, depth + 1));
  }
  if (value && typeof value === "object" && depth < MAX_REMAP_DEPTH) {
    const next = remapDeep(value, idMap, depth + 1);
    if (typeof next.id === "string" && idMap[next.id]) {
      next.id = idMap[next.id];
    }
    return next;
  }
  return value;
};

const remapDeep = (
  value: any,
  idMap: Record<string, string>,
  depth = 0,
): any => {
  if (Array.isArray(value)) {
    return depth >= MAX_REMAP_DEPTH
      ? value
      : value.map((entry) => remapDeep(entry, idMap, depth + 1));
  }

  if (value && typeof value === "object") {
    if (depth >= MAX_REMAP_DEPTH) {
      return value;
    }

    const next: Record<string, any> = {};
    for (const [key, entry] of Object.entries(value)) {
      next[key] = ROLLOVER_REFERENCE_KEYS.has(key)
        ? remapReference(entry, idMap, depth + 1)
        : remapDeep(entry, idMap, depth + 1);
    }
    return next;
  }

  return value;
};

/**
 * Chiave d'identita di un elemento dentro il suo tipo. Serve a non duplicare
 * una categoria «Under 14» che nella stagione di destinazione e gia stata
 * creata a mano: senza, il secondo riporto ne creerebbe una seconda.
 */
const rolloverIdentityKey = (record: any) =>
  String(record?.name || record?.title || record?.label || "")
    .trim()
    .toLowerCase();

const readRolloverSourceId = (record: any) =>
  String(record?.rolloverSourceId || "").trim() || null;

export type SeasonRolloverEntry = {
  type: string;
  label: string;
  available: number;
  created: number;
  skipped: number;
};

export type SeasonRolloverPlan = {
  sourceSeasonId: string;
  targetSeasonId: string;
  entries: SeasonRolloverEntry[];
  createdTotal: number;
  skippedTotal: number;
  /** Solo i tipi con almeno una creazione: gli altri non vanno riscritti. */
  collections: Record<string, any[]>;
  /**
   * Da id della stagione di origine a id nella stagione di destinazione.
   * Comprende anche gli elementi **gia presenti** in destinazione, non solo
   * quelli creati adesso: al secondo riporto non si crea piu niente, ma chi
   * deve rimappare un riferimento ha ancora bisogno di sapere dove e finito.
   * Non esce dall'API: serve al livello server per portare i tesserati.
   */
  idMap: Record<string, string>;
};

const defaultRolloverId = (type: string) =>
  typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${type}-${Date.now().toString(16)}-${Math.random()
        .toString(16)
        .slice(2, 10)}`;

/**
 * Calcola il riporto **senza toccare il database**: prende le collezioni
 * complete, restituisce le collezioni risultanti e il riepilogo.
 *
 * Tre garanzie:
 *
 * 1. **nuovi record, nuovi id**: un elemento riportato non riusa l'id
 *    dell'originale, altrimenti le due stagioni condividerebbero la stessa
 *    riga e modificarne una cambierebbe anche l'altra;
 * 2. **idempotenza**: l'elemento clonato porta `rolloverSourceId`, quindi un
 *    secondo riporto lo riconosce e non lo ricrea;
 * 3. **riferimenti coerenti**: i puntamenti fra record riportati vengono
 *    riscritti con i nuovi id.
 */
export const planSeasonRollover = (options: {
  sourceSeasonId: string;
  targetSeasonId: string;
  types: string[];
  collections: Record<string, any[]>;
  legacySeasonId?: string | null;
  generateId?: (type: string, index: number) => string;
  now?: string;
}): SeasonRolloverPlan => {
  const {
    sourceSeasonId,
    targetSeasonId,
    collections,
    legacySeasonId = null,
    generateId = (type: string) => defaultRolloverId(type),
    now = new Date().toISOString(),
  } = options;

  const requestedTypes = normalizeRolloverTypes(options.types);
  const types = requestedTypes.filter(isClubResourceRolloverType);
  const entries: SeasonRolloverEntry[] = [];
  const idMap: Record<string, string> = {};
  const clonedByType: Record<string, any[]> = {};

  for (const type of types) {
    const collection = Array.isArray(collections[type]) ? collections[type] : [];
    const sourceItems = filterCollectionBySeason(type, collection, sourceSeasonId, {
      legacySeasonId,
    });
    const targetItems = filterCollectionBySeason(type, collection, targetSeasonId, {
      legacySeasonId,
    });

    // Da id d'origine (e da nome) all'elemento gia presente in destinazione:
    // serve a saltare cio che e gia stato riportato **e** a sapere dove e
    // finito, perche un secondo riporto non crea nulla ma deve comunque poter
    // rimappare i riferimenti.
    /*
      **Un elemento di destinazione fa da destinazione a uno solo di origine.**

      Il difetto: due categorie omonime nella stagione di origine — «Under 14» a
      Nord e «Under 14» a Sud, che su un club multi-sede sono normali —
      collassavano in una sola. La prima veniva clonata, la seconda trovava il
      clone **per nome**, non veniva creata, e l'`idMap` faceva puntare
      entrambe allo stesso id. Finche il riporto portava configurazione era
      silenzioso; da quando porta i tesserati, e mezza squadra nel posto
      sbagliato.

      La corrispondenza si risolve in **due passi**, e l'ordine conta:

      1. prima tutte quelle per `rolloverSourceId`, che sono uno a uno per
         costruzione e non ammettono discussione;
      2. poi quelle per nome, che possono scegliere solo fra cio che il primo
         passo **non** ha gia impegnato.

      Con un passo solo, un elemento gia riportato poteva essere rivendicato per
      nome da un omonimo diverso prima che il suo originale lo reclamasse: e la
      collisione che sopravviveva al **secondo** riporto, cioe al caso reale.

      Le omonime di destinazione si indicizzano **tutte**: se ce ne sono due
      con lo stesso nome, servono due origini diverse, non due volte la stessa.
    */
    const copiedTargetIdBySourceId = new Map<string, string>();
    const targetIdsByIdentity = new Map<string, string[]>();
    for (const item of targetItems) {
      const targetId = String((item as any)?.id || "").trim();
      if (!targetId) {
        continue;
      }
      const copiedFrom = readRolloverSourceId(item);
      if (copiedFrom) {
        copiedTargetIdBySourceId.set(copiedFrom, targetId);
      }
      const identity = rolloverIdentityKey(item);
      if (identity) {
        const bucket = targetIdsByIdentity.get(identity) || [];
        bucket.push(targetId);
        targetIdsByIdentity.set(identity, bucket);
      }
    }
    const existingIdentities = new Set(targetIdsByIdentity.keys());

    /** Gli elementi di destinazione gia impegnati da un'origine. */
    const takenTargetIds = new Set<string>();
    /** Da id di origine all'elemento di destinazione che gli e stato assegnato. */
    const matchedTargetIdBySourceId = new Map<string, string>();

    // Passo 1: le corrispondenze certe.
    for (const item of sourceItems) {
      const sourceId = String((item as any)?.id || "").trim();
      if (!sourceId) continue;

      const targetId = copiedTargetIdBySourceId.get(sourceId);
      if (targetId && !takenTargetIds.has(targetId)) {
        matchedTargetIdBySourceId.set(sourceId, targetId);
        takenTargetIds.add(targetId);
      }
    }

    // Passo 2: le corrispondenze per nome, fra cio che resta libero.
    for (const item of sourceItems) {
      const sourceId = String((item as any)?.id || "").trim();
      if (sourceId && matchedTargetIdBySourceId.has(sourceId)) continue;

      const identity = rolloverIdentityKey(item);
      if (!identity) continue;

      const candidate = (targetIdsByIdentity.get(identity) || []).find(
        (targetId) => !takenTargetIds.has(targetId),
      );
      if (candidate) {
        takenTargetIds.add(candidate);
        if (sourceId) {
          matchedTargetIdBySourceId.set(sourceId, candidate);
        } else {
          // Un elemento senza id non ha una chiave nell'`idMap`, ma ha comunque
          // consumato la sua destinazione: non deve essere clonato.
          (item as any).__rolloverMatched = candidate;
        }
      }
    }

    const cloned: any[] = [];

    sourceItems.forEach((item: any, index: number) => {
      const sourceId = String(item?.id || "").trim();
      const identity = rolloverIdentityKey(item);

      const alreadyThere =
        (sourceId && matchedTargetIdBySourceId.get(sourceId)) ||
        item?.__rolloverMatched ||
        null;

      if (alreadyThere) {
        if (sourceId) {
          idMap[sourceId] = alreadyThere;
        }
        delete item.__rolloverMatched;
        return;
      }

      const newId = generateId(type, index);
      const {
        archivedAt: _archivedAt,
        rolloverSourceId: _previousSourceId,
        rolloverSourceSeasonId: _previousSourceSeasonId,
        ...rest
      } = item || {};

      cloned.push({
        ...rest,
        id: newId,
        seasonId: targetSeasonId,
        rolloverSourceId: sourceId || null,
        rolloverSourceSeasonId: sourceSeasonId,
        created_at: now,
        updated_at: now,
      });

      if (sourceId) {
        idMap[sourceId] = newId;
      }
      if (identity) {
        existingIdentities.add(identity);
        // Il clone appena creato e a sua volta una destinazione occupata: un
        // omonimo successivo non puo rivendicarlo, deve avere il suo.
        const bucket = targetIdsByIdentity.get(identity) || [];
        bucket.push(newId);
        targetIdsByIdentity.set(identity, bucket);
        takenTargetIds.add(newId);
      }
    });

    clonedByType[type] = cloned;
    entries.push({
      type,
      label: getSeasonRolloverTypeLabel(type),
      available: sourceItems.length,
      created: cloned.length,
      skipped: sourceItems.length - cloned.length,
    });
  }

  const resultCollections: Record<string, any[]> = {};
  for (const type of types) {
    const cloned = clonedByType[type];
    if (!cloned.length) {
      continue;
    }

    const collection = Array.isArray(collections[type]) ? collections[type] : [];
    resultCollections[type] = [
      ...collection,
      ...cloned.map((record) => remapDeep(record, idMap)),
    ];
  }

  return {
    sourceSeasonId,
    targetSeasonId,
    entries,
    createdTotal: entries.reduce((total, entry) => total + entry.created, 0),
    skippedTotal: entries.reduce((total, entry) => total + entry.skipped, 0),
    collections: resultCollections,
    idMap,
  };
};
