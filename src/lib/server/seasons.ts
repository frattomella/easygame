import { prisma } from "./prisma";
import type { AccessScopeEntry } from "@/lib/roles/access-scope";
import {
  readClubResourceCollection,
  replaceClubResourceCollection,
} from "./resources";
import {
  applySeasonStatuses,
  assertRolloverTypeRequirements,
  buildSeasonFromInput,
  filterCollectionBySeason,
  getSeasonRolloverTypeLabel,
  isClubResourceRolloverType,
  normalizeClubSeasons,
  normalizeRolloverTypes,
  planSeasonRollover,
  sortSeasonsByRecency,
  ATHLETE_MEMBERSHIP_ROLLOVER_TYPE,
  TRAINER_ASSIGNMENT_ROLLOVER_TYPE,
  SEASON_ROLLOVER_TYPES,
  type ClubSeason,
  type SeasonInput,
  type SeasonRolloverPlan,
} from "../club-seasons";
import {
  countAthletesWithoutTeam,
  countSeasonMemberships,
  listSeasonRoster,
  runAthleteMembershipRollover,
  type SeasonMembershipRolloverSummary,
  type SeasonRoster,
} from "./season-memberships";
import { splitTrainerAssignmentsBySeason } from "@/lib/trainers/season-assignments";

/**
 * Gestione delle stagioni sportive di un club (Blocco 6).
 *
 * Perche un modulo a se e non `resources.ts`: una stagione non e una risorsa
 * CRUD. Vive in `clubs.settings.seasons`, ha un'invariante propria (una sola
 * stagione attiva) e la sua creazione puo trascinarsi dietro un riporto di
 * dati. Tenerlo isolato serve anche al vincolo Cedi (ADR-0007): la logica di
 * dominio deve poter uscire da Next.js senza portarsi via il CRUD generico.
 *
 * L'accesso alle collezioni di club passa comunque da `resources.ts`: scrivere
 * `clubs.<campo>` a mano disallineerebbe `club_resource_items`.
 */

export type ClubSeasonState = {
  seasons: ClubSeason[];
  activeSeasonId: string;
  activeSeason: ClubSeason;
  legacySeasonId: string | null;
  /** `true` se `seasons` non viene dal club ma dalla stagione sintetizzata. */
  isFallback: boolean;
};

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const loadClubSettings = async (organizationId: string) => {
  const club = await prisma.club.findFirst({
    where: { id: organizationId },
    select: { id: true, settings: true },
  });

  if (!club) {
    throw new Error("Club non trovato");
  }

  return isRecord(club.settings) ? club.settings : {};
};

export const readClubSeasonState = async (
  organizationId: string,
): Promise<ClubSeasonState> => {
  const settings = await loadClubSettings(organizationId);
  return normalizeClubSeasons(settings);
};

/**
 * Scrive stagioni e stagione attiva, riapplicando l'invariante prima di
 * salvare: cosi lo stato incoerente non arriva mai al database, nemmeno se il
 * chiamante ha sbagliato a comporre l'elenco.
 */
const saveClubSeasons = async (
  organizationId: string,
  seasons: ClubSeason[],
  activeSeasonId: string,
): Promise<ClubSeasonState> => {
  const settings = await loadClubSettings(organizationId);
  const coherentSeasons = applySeasonStatuses(
    sortSeasonsByRecency(seasons),
    activeSeasonId,
  );

  const nextSettings = {
    ...settings,
    seasons: coherentSeasons,
    activeSeasonId,
  };

  await prisma.club.update({
    where: { id: organizationId },
    data: { settings: nextSettings as never },
  });

  return normalizeClubSeasons(nextSettings);
};

/**
 * Toglie una stagione dalle impostazioni, senza toccare la stagione attiva
 * (ADR-0197 §33): chi elimina l attiva riceve un rifiuto a monte, e qui non
 * si sceglie mai un attiva al posto suo. Le difese sul contenuto stanno in
 * `season-delete.ts`; questa funzione e l unica scrittura di
 * `settings.seasons` per una rimozione, come vuole CLAUDE.md §2.
 */
export const removeClubSeason = async (
  organizationId: string,
  seasonId: string,
): Promise<ClubSeasonState> => {
  const state = await readClubSeasonState(organizationId);
  const season = findSeason(state, seasonId);
  if (!season) {
    throw new Error("Stagione non trovata");
  }
  if (season.id === state.activeSeasonId) {
    throw new Error(
      "Prima di eliminare questa stagione, imposta un altra stagione come attiva",
    );
  }
  return saveClubSeasons(
    organizationId,
    state.seasons.filter((entry) => entry.id !== season.id),
    state.activeSeasonId,
  );
};

const findSeason = (state: ClubSeasonState, seasonId: string) =>
  state.seasons.find((season) => season.id === String(seasonId || "").trim()) ||
  null;

export type SeasonRolloverRequest = {
  sourceSeasonId?: string | null;
  types?: unknown;
  /**
   * I tesserati riconfermati: **l'elenco e la sola autorita** (ADR-0196).
   *
   * Quando «Tesserati nelle squadre» e fra i tipi, l'elenco e obbligatorio,
   * anche vuoto: `[]` porta zero persone. `null` o assente **non** vale
   * «tutti»: prima lo valeva, e un chiamante che ometteva il campo si vedeva
   * riportare l'intera stagione senza averlo chiesto. Riportare e un'azione
   * esplicita: chi non e nell'elenco resta dov'e.
   */
  athleteIds?: unknown;
};

/**
 * `idMap` resta dentro il server: e la mappa fra id di categorie e serve a
 * portare i tesserati, non a chi legge il riepilogo.
 */
export type SeasonTrainerRolloverSummary = {
  /** Se il tipo era fra quelli chiesti. */
  requested: boolean;
  /** Allenatori con almeno un'assegnazione nella stagione di origine. */
  trainersWithAssignments: number;
  /** Allenatori a cui e stata aggiunta almeno un'assegnazione nuova. */
  trainersUpdated: number;
  /** Assegnazioni (categorie + gruppi) scritte nella stagione di destinazione. */
  assignmentsCreated: number;
  /** Assegnazioni gia presenti in destinazione. */
  assignmentsExisting: number;
  /** Riferimenti di origine senza corrispondenza in destinazione: si dicono, non si indovinano. */
  unmapped: Array<{ trainerId: string; trainerName: string; reference: string }>;
};

export type SeasonRolloverResult = Omit<SeasonRolloverPlan, "idMap"> & {
  applied: boolean;
  sourceSeasonLabel: string;
  targetSeasonLabel: string;
  /** Le assegnazioni degli allenatori, sempre dichiarate (ADR-0197 §19). */
  trainers: SeasonTrainerRolloverSummary;
  /**
   * I tesserati, **sempre** dichiarati. Anche quando non se ne porta nessuno:
   * il difetto che la Wave 1 chiude non e solo che non venivano riportati, e
   * che nessuno lo diceva.
   */
  athletes: SeasonMembershipRolloverSummary;
};

/**
 * L'elenco dei riconfermati, quando i tesserati sono fra i tipi da portare.
 *
 * Restituisce sempre un elenco: assente o `null` si rifiuta, perche l'unica
 * lettura onesta di «non mi hai detto chi» e «non so chi», non «tutti».
 * Quando i tesserati non si portano l'elenco non serve e non si legge.
 */
const normalizeConfirmedAthleteIds = (
  value: unknown,
  requested: boolean,
): string[] | null => {
  if (!requested) {
    return null;
  }
  if (value === null || value === undefined) {
    throw new Error(
      "Indica quali tesserati riportare nella stagione nuova: un elenco, anche vuoto. Senza elenco non se ne riporta nessuno",
    );
  }
  if (!Array.isArray(value)) {
    throw new Error("L'elenco dei tesserati riconfermati non e valido");
  }

  return Array.from(
    new Set(value.map((id) => String(id || "").trim()).filter(Boolean)),
  );
};

const readCategoryIds = (
  collection: any[],
  seasonId: string,
  legacySeasonId: string | null,
) =>
  filterCollectionBySeason("categories", collection, seasonId, {
    legacySeasonId,
  })
    .map((category: any) => String(category?.id || "").trim())
    .filter(Boolean);

const readCategoryNames = (
  collection: any[],
  seasonId: string,
  legacySeasonId: string | null,
) => {
  const names: Record<string, string> = {};
  for (const category of filterCollectionBySeason(
    "categories",
    collection,
    seasonId,
    { legacySeasonId },
  )) {
    const id = String((category as any)?.id || "").trim();
    if (id) {
      names[id] = String((category as any)?.name || "").trim();
    }
  }
  return names;
};

const trainerDisplayName = (trainer: any) =>
  String(
    trainer?.name ||
      [trainer?.firstName || trainer?.first_name, trainer?.lastName || trainer?.last_name]
        .filter(Boolean)
        .join(" ") ||
      trainer?.id ||
      "",
  ).trim();

/**
 * **Il riporto delle assegnazioni degli allenatori** (ADR-0197 §19).
 *
 * Per ogni allenatore si prendono le categorie e i gruppi **della stagione
 * di origine** (spaccatura per stagione, la stessa che usa la pagina) e si
 * cercano nella mappa del riporto: un'origine che ha una destinazione si
 * aggiunge all'elenco, una che non ce l'ha si dichiara in `unmapped`. Le
 * assegnazioni delle altre stagioni restano com'erano: storico.
 *
 * Nessun nome: la mappa e per identificativo, e viene dal piano che ha
 * clonato le categorie — o le ha ritrovate, a un secondo riporto.
 */
const runTrainerAssignmentRollover = async (options: {
  organizationId: string;
  sourceSeasonId: string;
  targetSeasonId: string;
  idMap: Record<string, string>;
  categoryCollection: any[];
  groupCollection: any[];
  seasons: ClubSeason[];
  legacySeasonId: string | null;
  requested: boolean;
  preview: boolean;
}): Promise<SeasonTrainerRolloverSummary> => {
  const summary: SeasonTrainerRolloverSummary = {
    requested: options.requested,
    trainersWithAssignments: 0,
    trainersUpdated: 0,
    assignmentsCreated: 0,
    assignmentsExisting: 0,
    unmapped: [],
  };

  const trainers = await readClubResourceCollection(options.organizationId, "trainers");
  const groups = options.groupCollection.map((group: any) => ({
    id: String(group?.id || "").trim(),
    categoryId: String(group?.categoryId || group?.category_id || "").trim(),
    seasonId: group?.seasonId ?? null,
  }));
  const next: any[] = [];
  let changed = false;

  for (const trainer of trainers) {
    const daOrigine = splitTrainerAssignmentsBySeason({
      trainer,
      categories: options.categoryCollection,
      groups,
      seasons: options.seasons,
      seasonId: options.sourceSeasonId,
      legacySeasonId: options.legacySeasonId,
    }).current;
    const haAssegnazioni = daOrigine.categoryIds.length + daOrigine.groupIds.length > 0;
    if (haAssegnazioni) summary.trainersWithAssignments += 1;

    if (!options.requested || !haAssegnazioni) {
      next.push(trainer);
      continue;
    }

    const categorieAttuali = new Set(
      (Array.isArray(trainer?.categories) ? trainer.categories : []).map((entry: any) =>
        String(typeof entry === "string" ? entry : entry?.id || "").trim(),
      ),
    );
    const gruppiAttuali = new Set(
      (Array.isArray(trainer?.groupIds) ? trainer.groupIds : []).map((id: any) => String(id || "").trim()),
    );
    const nuoveCategorie: string[] = [];
    const nuoviGruppi: string[] = [];

    for (const sourceId of daOrigine.categoryIds) {
      const targetId = options.idMap[sourceId];
      if (!targetId) {
        summary.unmapped.push({ trainerId: String(trainer.id), trainerName: trainerDisplayName(trainer), reference: sourceId });
        continue;
      }
      if (categorieAttuali.has(targetId)) {
        summary.assignmentsExisting += 1;
        continue;
      }
      categorieAttuali.add(targetId);
      nuoveCategorie.push(targetId);
    }
    for (const sourceId of daOrigine.groupIds) {
      const targetId = options.idMap[sourceId];
      if (!targetId) {
        summary.unmapped.push({ trainerId: String(trainer.id), trainerName: trainerDisplayName(trainer), reference: sourceId });
        continue;
      }
      if (gruppiAttuali.has(targetId)) {
        summary.assignmentsExisting += 1;
        continue;
      }
      gruppiAttuali.add(targetId);
      nuoviGruppi.push(targetId);
    }

    if (!nuoveCategorie.length && !nuoviGruppi.length) {
      next.push(trainer);
      continue;
    }

    summary.trainersUpdated += 1;
    summary.assignmentsCreated += nuoveCategorie.length + nuoviGruppi.length;
    changed = true;
    const categorie = Array.isArray(trainer?.categories) ? trainer.categories : [];
    next.push({
      ...trainer,
      categories: [...categorie, ...nuoveCategorie],
      ...(nuoviGruppi.length
        ? { groupIds: [...(Array.isArray(trainer?.groupIds) ? trainer.groupIds : []), ...nuoviGruppi] }
        : {}),
    });
  }

  if (changed && !options.preview) {
    await replaceClubResourceCollection(options.organizationId, "trainers", next);
  }

  return summary;
};

/**
 * Riporta la configurazione da una stagione all'altra.
 *
 * `preview` calcola e non scrive: e cio che alimenta il riepilogo mostrato
 * prima della conferma, quindi il numero annunciato e lo stesso che verra
 * creato, non una stima.
 */
export const runClubSeasonRollover = async (options: {
  organizationId: string;
  sourceSeasonId: string;
  targetSeasonId: string;
  types: unknown;
  athleteIds?: unknown;
  preview?: boolean;
}): Promise<SeasonRolloverResult> => {
  const { organizationId, preview = false } = options;
  const state = await readClubSeasonState(organizationId);

  const source = findSeason(state, options.sourceSeasonId);
  const target = findSeason(state, options.targetSeasonId);

  if (!source) {
    throw new Error("Stagione di origine non trovata");
  }
  if (!target) {
    throw new Error("Stagione di destinazione non trovata");
  }
  if (source.id === target.id) {
    throw new Error(
      "Origine e destinazione devono essere due stagioni diverse",
    );
  }
  if (target.status === "archived") {
    throw new Error(
      "Non si possono riportare dati in una stagione archiviata: riattivala prima",
    );
  }

  const types = normalizeRolloverTypes(options.types);
  if (!types.length) {
    throw new Error("Seleziona almeno un tipo di dato da riportare");
  }
  assertRolloverTypeRequirements(types);
  /*
    L'elenco si valida **prima** di scrivere le collezioni: un riporto dei
    tesserati senza elenco si ferma qui, con le categorie ancora intatte.
  */
  const carriesAthletes = types.includes(ATHLETE_MEMBERSHIP_ROLLOVER_TYPE);
  const confirmedAthleteIds = normalizeConfirmedAthleteIds(
    options.athleteIds,
    carriesAthletes,
  );

  const collections: Record<string, any[]> = {};
  for (const type of types.filter(isClubResourceRolloverType)) {
    collections[type] = await readClubResourceCollection(organizationId, type);
  }

  const plan = planSeasonRollover({
    sourceSeasonId: source.id,
    targetSeasonId: target.id,
    types,
    collections,
    legacySeasonId: state.legacySeasonId,
  });

  if (!preview) {
    for (const [type, items] of Object.entries(plan.collections)) {
      await replaceClubResourceCollection(organizationId, type, items);
    }
  }

  // I tesserati si contano sempre, anche quando non si portano: e il silenzio
  // di prima il difetto. Le categorie servono comunque, quindi la collezione si
  // legge anche se non e fra i tipi scelti.
  const categoryCollection =
    plan.collections.categories ||
    collections.categories ||
    (await readClubResourceCollection(organizationId, "categories"));

  const sourceCategoryIds = readCategoryIds(
    categoryCollection,
    source.id,
    state.legacySeasonId,
  );
  const targetCategoryNameById = readCategoryNames(
    categoryCollection,
    target.id,
    state.legacySeasonId,
  );
  const categoryIdMap: Record<string, string> = {};
  for (const sourceCategoryId of sourceCategoryIds) {
    const mapped = plan.idMap[sourceCategoryId];
    if (mapped) {
      categoryIdMap[sourceCategoryId] = mapped;
    }
  }

  const athletes = await runAthleteMembershipRollover({
    organizationId,
    sourceCategoryIds,
    categoryIdMap,
    targetCategoryNameById,
    confirmedAthleteIds,
    requested: carriesAthletes,
    preview,
  });

  /*
    Gli allenatori si contano sempre e si portano solo se chiesto: la mappa
    e quella del piano (categorie e gruppi), che a un secondo riporto ritrova
    le destinazioni gia create.
  */
  const carriesTrainers = types.includes(TRAINER_ASSIGNMENT_ROLLOVER_TYPE);
  const groupCollection =
    plan.collections.category_groups ||
    collections.category_groups ||
    (await readClubResourceCollection(organizationId, "category_groups"));
  const trainers = await runTrainerAssignmentRollover({
    organizationId,
    sourceSeasonId: source.id,
    targetSeasonId: target.id,
    idMap: plan.idMap,
    categoryCollection,
    groupCollection,
    seasons: state.seasons,
    legacySeasonId: state.legacySeasonId,
    requested: carriesTrainers,
    preview,
  });

  const { idMap: _idMap, ...publicPlan } = plan;

  return {
    ...publicPlan,
    entries: [
      ...publicPlan.entries,
      {
        /*
          La voce conta **appartenenze**, come tutte le altre voci del
          riepilogo: `available` sono le appartenenze della stagione di
          origine, `created` quelle scritte adesso, e `skipped` la differenza —
          che comprende sia chi non e stato riconfermato sia cio che c'era gia.
          Contare persone qui rendeva `skipped` una cosa diversa da quella che
          significa in ogni altra riga, e al secondo riporto la tabella
          dichiarava «0 creati, 0 saltati» su 180 appartenenze gia presenti.
          Il dettaglio per persona resta in `athletes`.
        */
        type: ATHLETE_MEMBERSHIP_ROLLOVER_TYPE,
        label: getSeasonRolloverTypeLabel(ATHLETE_MEMBERSHIP_ROLLOVER_TYPE),
        available: athletes.sourceMemberships,
        created: athletes.created,
        skipped: Math.max(0, athletes.sourceMemberships - athletes.created),
      },
      ...(carriesTrainers
        ? [
            {
              type: TRAINER_ASSIGNMENT_ROLLOVER_TYPE,
              label: getSeasonRolloverTypeLabel(TRAINER_ASSIGNMENT_ROLLOVER_TYPE),
              available: trainers.trainersWithAssignments,
              created: trainers.trainersUpdated,
              skipped: Math.max(0, trainers.trainersWithAssignments - trainers.trainersUpdated),
            },
          ]
        : []),
    ],
    createdTotal:
      publicPlan.createdTotal + athletes.created + (carriesTrainers ? trainers.trainersUpdated : 0),
    skippedTotal:
      publicPlan.skippedTotal +
      Math.max(0, athletes.sourceMemberships - athletes.created) +
      (carriesTrainers ? Math.max(0, trainers.trainersWithAssignments - trainers.trainersUpdated) : 0),
    applied: !preview,
    sourceSeasonLabel: source.label,
    targetSeasonLabel: target.label,
    athletes,
    trainers,
  };
};

/**
 * L'elenco di riconferma: chi c'era nella stagione di origine e in quale
 * squadra. E la schermata che il riporto mostra prima di scrivere.
 */
export const readSeasonRoster = async (options: {
  organizationId: string;
  seasonId: string;
  accessScopes?: readonly AccessScopeEntry[] | null;
}): Promise<SeasonRoster & { seasonId: string; seasonLabel: string }> => {
  const { organizationId } = options;
  const state = await readClubSeasonState(organizationId);
  const season = findSeason(state, options.seasonId);

  if (!season) {
    throw new Error("Stagione di origine non trovata");
  }

  const categoryCollection = await readClubResourceCollection(
    organizationId,
    "categories",
  );
  const sourceCategoryIds = readCategoryIds(
    categoryCollection,
    season.id,
    state.legacySeasonId,
  );
  const categoryNameById = readCategoryNames(
    categoryCollection,
    season.id,
    state.legacySeasonId,
  );

  // Ogni categoria della stagione di origine avra una destinazione: riportare i
  // tesserati **richiede** di riportare le categorie
  // (`assertRolloverTypeRequirements`), e una categoria gia copiata la ritrova
  // l'`idMap`. Un'appartenenza resta senza destinazione solo se la sua
  // categoria non appartiene piu alla stagione di origine, e in quel caso non
  // entra nemmeno in questo elenco.
  const roster = await listSeasonRoster({
    accessScopes: options.accessScopes,
    organizationId,
    sourceCategoryIds,
    categoryNameById,
  });

  return { ...roster, seasonId: season.id, seasonLabel: season.label };
};

export type CreateClubSeasonResult = {
  season: ClubSeason;
  state: ClubSeasonState;
  rollover: SeasonRolloverResult | null;
};

/**
 * Crea una stagione e, se richiesto, ne popola la configurazione partendo da
 * un'altra stagione. La stagione nasce `upcoming` salvo richiesta esplicita di
 * attivarla: aprire per sbaglio il perimetro dei dati su una stagione vuota e
 * il modo piu rapido di far sembrare che il club abbia perso tutto.
 */
export const createClubSeason = async (options: {
  organizationId: string;
  input: SeasonInput;
  activate?: boolean;
  rollover?: SeasonRolloverRequest | null;
}): Promise<CreateClubSeasonResult> => {
  const { organizationId, input, activate = false } = options;
  const state = await readClubSeasonState(organizationId);

  /*
    Su un club che non ha ancora stagioni, `state.seasons` contiene la stagione
    **sintetizzata** in lettura, non un dato salvato. Portarla nella scrittura
    creava un doppione con la stessa etichetta di quella appena scelta, e —
    non passando da `applySeasonStatuses` sul valore giusto — lasciava due
    stagioni `active` nel database. La prima stagione di un club e la sua sola
    stagione: nasce attiva, perche non c'e niente da cui ereditare il
    perimetro.
  */
  /*
    **Il riporto si valida prima di scrivere la stagione.**

    Prima non era cosi, e l'audit di fine Wave lo ha trovato: la stagione
    veniva salvata — e attivata, se richiesto — e solo dopo si scopriva che i
    tipi chiesti non stavano in piedi. Chi lasciava spuntato «Tesserati nelle
    squadre» (che nasce selezionato) e toglieva «Categorie» vedeva un errore, e
    intanto il club si ritrovava una stagione **nuova, vuota e attiva**:
    esattamente cio che il commento qui sopra dice di voler evitare.

    Validare costa niente e va fatto quando non si e ancora scritto niente.
  */
  const requestedTypes = normalizeRolloverTypes(options.rollover?.types);

  /*
    Chiedere un riporto senza dire cosa riportare rispondeva `200` con
    `rollover: null` e non faceva niente, in silenzio (W1-13). L'interfaccia
    manda sempre i tipi, quindi non si vedeva; un chiamante API otteneva un
    no-op che sembrava riuscito. Ora chi chiede un riporto vuoto se lo sente
    dire.
  */
  if (options.rollover && !requestedTypes.length) {
    throw new Error("Seleziona almeno un tipo di dato da riportare");
  }
  const sourceSeasonId =
    String(options.rollover?.sourceSeasonId || "").trim() ||
    state.activeSeasonId;

  if (requestedTypes.length) {
    assertRolloverTypeRequirements(requestedTypes);
    normalizeConfirmedAthleteIds(
      options.rollover?.athleteIds,
      requestedTypes.includes(ATHLETE_MEMBERSHIP_ROLLOVER_TYPE),
    );
    /*
      **Anche l'origine si verifica prima di scrivere** (revisione ostile
      ADR-0196 A2). Prima la stagione nasceva — e veniva attivata — e solo
      dopo `runClubSeasonRollover` scopriva che l'origine non esisteva: 400
      con una stagione nuova, vuota, attiva e senza riga di audit. Su un club
      senza stagioni salvate l'origine sarebbe la stagione **sintetizzata**,
      che dopo il salvataggio non c'e piu: non c'e niente da cui riportare.
    */
    if (state.isFallback) {
      throw new Error(
        "Questo club non ha ancora una stagione salvata da cui riportare: crea la prima stagione senza riporto",
      );
    }
    if (!findSeason(state, sourceSeasonId)) {
      throw new Error("Stagione di origine non trovata");
    }
  }

  const previousSeasons = state.isFallback ? [] : state.seasons;
  const shouldActivate = activate || previousSeasons.length === 0;

  const season = buildSeasonFromInput(
    { ...input, status: shouldActivate ? "active" : "upcoming" },
    previousSeasons,
  );

  const nextActiveSeasonId = shouldActivate ? season.id : state.activeSeasonId;
  const savedState = await saveClubSeasons(
    organizationId,
    [season, ...previousSeasons],
    nextActiveSeasonId,
  );

  let rollover: SeasonRolloverResult | null = null;

  if (requestedTypes.length) {
    rollover = await runClubSeasonRollover({
      organizationId,
      sourceSeasonId,
      targetSeasonId: season.id,
      types: requestedTypes,
      athleteIds: options.rollover?.athleteIds,
    });
  }

  return {
    season: findSeason(savedState, season.id) || season,
    state: savedState,
    rollover,
  };
};

export type SeasonStatusAction = "activate" | "archive";

export type SetClubSeasonStatusResult = {
  season: ClubSeason;
  state: ClubSeasonState;
};

/**
 * Cambia lo stato di una stagione.
 *
 * Archiviare la stagione attiva e **vietato**: lascerebbe il club senza
 * perimetro dei dati. Chi vuole chiudere l'annata attiva ne attiva prima
 * un'altra, e questa passa ad archiviata da sola.
 */
export const setClubSeasonStatus = async (options: {
  organizationId: string;
  seasonId: string;
  action: SeasonStatusAction;
  now?: string;
}): Promise<SetClubSeasonStatusResult> => {
  const { organizationId, seasonId, action } = options;
  const now = options.now || new Date().toISOString();
  const state = await readClubSeasonState(organizationId);
  const season = findSeason(state, seasonId);

  if (!season) {
    throw new Error("Stagione non trovata");
  }

  if (action === "activate") {
    if (season.id === state.activeSeasonId) {
      throw new Error(`La stagione ${season.label} e gia attiva`);
    }

    const savedState = await saveClubSeasons(
      organizationId,
      state.seasons,
      season.id,
    );

    return {
      season: findSeason(savedState, season.id) || season,
      state: savedState,
    };
  }

  if (action === "archive") {
    if (season.id === state.activeSeasonId) {
      throw new Error(
        "Non si puo archiviare la stagione attiva: attivane un'altra e questa verra archiviata",
      );
    }
    if (season.status === "archived") {
      throw new Error(`La stagione ${season.label} e gia archiviata`);
    }

    const nextSeasons = state.seasons.map((entry) =>
      entry.id === season.id
        ? { ...entry, status: "archived" as const, archivedAt: now }
        : entry,
    );

    const savedState = await saveClubSeasons(
      organizationId,
      nextSeasons,
      state.activeSeasonId,
    );

    return {
      season: findSeason(savedState, season.id) || season,
      state: savedState,
    };
  }

  throw new Error(`Azione sulla stagione non riconosciuta: ${action}`);
};

/**
 * Quante voci riportabili contiene ogni stagione. Serve alla procedura guidata
 * per dire «12 categorie, 3 piani» prima della conferma, invece di far
 * scoprire il contenuto a copia avvenuta.
 */
export const summarizeSeasonContents = async (organizationId: string) => {
  const state = await readClubSeasonState(organizationId);
  const counts: Record<string, Record<string, number>> = {};

  for (const season of state.seasons) {
    counts[season.id] = {};
  }

  let categoryCollection: any[] = [];

  for (const descriptor of SEASON_ROLLOVER_TYPES) {
    if (!isClubResourceRolloverType(descriptor.key)) {
      // I tesserati non stanno in una collezione di club: si contano dopo,
      // dalle appartenenze.
      continue;
    }

    const collection = await readClubResourceCollection(
      organizationId,
      descriptor.key,
    );
    if (descriptor.key === "categories") {
      categoryCollection = collection;
    }

    for (const season of state.seasons) {
      const isLegacySeason = state.legacySeasonId === season.id;
      const total = collection.filter((record: any) => {
        const recordSeasonId = String(
          record?.seasonId || record?.season_id || "",
        ).trim();
        return recordSeasonId
          ? recordSeasonId === season.id
          : isLegacySeason;
      }).length;

      counts[season.id][descriptor.key] = total;
    }
  }

  // Quanti tesserati ha ogni stagione, e quanti atleti attivi sono rimasti
  // senza squadra in quella attiva: e l'avviso che il club deve vedere il
  // giorno dopo il cambio di stagione, non scoprire da solo a settembre.
  const membershipCounts = await countSeasonMemberships({
    organizationId,
    seasons: state.seasons.map((season) => ({
      id: season.id,
      categoryIds: readCategoryIds(
        categoryCollection,
        season.id,
        state.legacySeasonId,
      ),
    })),
  });

  for (const season of state.seasons) {
    counts[season.id][ATHLETE_MEMBERSHIP_ROLLOVER_TYPE] =
      membershipCounts.bySeason[season.id] || 0;
  }

  /* Quanti allenatori hanno una squadra in ogni stagione (ADR-0197 §19). */
  const trainerCollection = await readClubResourceCollection(organizationId, "trainers");
  const groupCollection = await readClubResourceCollection(organizationId, "category_groups");
  for (const season of state.seasons) {
    counts[season.id][TRAINER_ASSIGNMENT_ROLLOVER_TYPE] = trainerCollection.filter((trainer: any) => {
      const current = splitTrainerAssignmentsBySeason({
        trainer,
        categories: categoryCollection,
        groups: groupCollection.map((group: any) => ({
          id: String(group?.id || ""),
          categoryId: String(group?.categoryId || group?.category_id || ""),
          seasonId: group?.seasonId ?? null,
        })),
        seasons: state.seasons,
        seasonId: season.id,
        legacySeasonId: state.legacySeasonId,
      }).current;
      return current.categoryIds.length + current.groupIds.length > 0;
    }).length;
  }

  const activeCategoryIds = readCategoryIds(
    categoryCollection,
    state.activeSeasonId,
    state.legacySeasonId,
  );
  const athletesWithoutTeam = await countAthletesWithoutTeam({
    organizationId,
    categoryIds: activeCategoryIds,
  });

  return { ...state, counts, athletesWithoutTeam };
};
