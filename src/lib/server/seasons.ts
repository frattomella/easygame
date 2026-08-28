import { prisma } from "./prisma";
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

const findSeason = (state: ClubSeasonState, seasonId: string) =>
  state.seasons.find((season) => season.id === String(seasonId || "").trim()) ||
  null;

export type SeasonRolloverRequest = {
  sourceSeasonId?: string | null;
  types?: unknown;
  /**
   * I tesserati riconfermati. `null` o assente significa «tutti quelli che la
   * stagione di origine propone»: e la scelta di partenza dell'elenco, non un
   * automatismo nascosto — chi non rinnova lo si toglie.
   */
  athleteIds?: unknown;
};

/**
 * `idMap` resta dentro il server: e la mappa fra id di categorie e serve a
 * portare i tesserati, non a chi legge il riepilogo.
 */
export type SeasonRolloverResult = Omit<SeasonRolloverPlan, "idMap"> & {
  applied: boolean;
  sourceSeasonLabel: string;
  targetSeasonLabel: string;
  /**
   * I tesserati, **sempre** dichiarati. Anche quando non se ne porta nessuno:
   * il difetto che la Wave 1 chiude non e solo che non venivano riportati, e
   * che nessuno lo diceva.
   */
  athletes: SeasonMembershipRolloverSummary;
};

const normalizeConfirmedAthleteIds = (value: unknown): string[] | null => {
  if (value === null || value === undefined) {
    return null;
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
    confirmedAthleteIds: normalizeConfirmedAthleteIds(options.athleteIds),
    requested: types.includes(ATHLETE_MEMBERSHIP_ROLLOVER_TYPE),
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
    ],
    createdTotal: publicPlan.createdTotal + athletes.created,
    skippedTotal:
      publicPlan.skippedTotal +
      Math.max(0, athletes.sourceMemberships - athletes.created),
    applied: !preview,
    sourceSeasonLabel: source.label,
    targetSeasonLabel: target.label,
    athletes,
  };
};

/**
 * L'elenco di riconferma: chi c'era nella stagione di origine e in quale
 * squadra. E la schermata che il riporto mostra prima di scrivere.
 */
export const readSeasonRoster = async (options: {
  organizationId: string;
  seasonId: string;
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
  if (requestedTypes.length) {
    assertRolloverTypeRequirements(requestedTypes);
    normalizeConfirmedAthleteIds(options.rollover?.athleteIds);
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
      sourceSeasonId:
        String(options.rollover?.sourceSeasonId || "").trim() ||
        state.activeSeasonId,
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
