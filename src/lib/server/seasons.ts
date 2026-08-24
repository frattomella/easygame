import { prisma } from "./prisma";
import {
  readClubResourceCollection,
  replaceClubResourceCollection,
} from "./resources";
import {
  applySeasonStatuses,
  buildSeasonFromInput,
  normalizeClubSeasons,
  normalizeRolloverTypes,
  planSeasonRollover,
  sortSeasonsByRecency,
  SEASON_ROLLOVER_TYPES,
  type ClubSeason,
  type SeasonInput,
  type SeasonRolloverPlan,
} from "../club-seasons";

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
};

export type SeasonRolloverResult = SeasonRolloverPlan & {
  applied: boolean;
  sourceSeasonLabel: string;
  targetSeasonLabel: string;
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

  const collections: Record<string, any[]> = {};
  for (const type of types) {
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

  return {
    ...plan,
    applied: !preview,
    sourceSeasonLabel: source.label,
    targetSeasonLabel: target.label,
  };
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

  const season = buildSeasonFromInput(
    { ...input, status: activate ? "active" : "upcoming" },
    state.seasons,
  );

  const nextActiveSeasonId = activate ? season.id : state.activeSeasonId;
  const savedState = await saveClubSeasons(
    organizationId,
    [season, ...state.seasons],
    nextActiveSeasonId,
  );

  let rollover: SeasonRolloverResult | null = null;
  const requestedTypes = normalizeRolloverTypes(options.rollover?.types);

  if (requestedTypes.length) {
    rollover = await runClubSeasonRollover({
      organizationId,
      sourceSeasonId:
        String(options.rollover?.sourceSeasonId || "").trim() ||
        state.activeSeasonId,
      targetSeasonId: season.id,
      types: requestedTypes,
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

  for (const descriptor of SEASON_ROLLOVER_TYPES) {
    const collection = await readClubResourceCollection(
      organizationId,
      descriptor.key,
    );

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

  return { ...state, counts };
};
