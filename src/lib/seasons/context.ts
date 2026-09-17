import {
  normalizeClubSeasons,
  type ClubSeason,
} from "@/lib/club-seasons";

/**
 * **La stagione di una richiesta ha un solo risolutore** (ADR-0197).
 *
 * Prima di questo modulo «di quale stagione parliamo?» aveva cinque risposte
 * sparse per l'albero: `settings.activeSeasonId` letto a mano, l'header
 * `x-active-season-id` letto in quattro rotte con quattro regole sullo stale,
 * `resolveSeasonWindow` per data nella prima nota, la stagione **piu vecchia**
 * per i record senza annata, e nessuna stagione sugli eventi manuali. Il
 * calendario della stagione nuova mostrava quella vecchia, il pannello del
 * programma settimanale mandava voci senza stagione che il server scartava
 * come «legacy», e l'allenatore portava le squadre dell'anno prima come se
 * fossero di quest'anno.
 *
 * Qui si distinguono **cinque** modi di rispondere, e non si mescolano:
 *
 * - **attiva** — la stagione attiva del club (`settings.activeSeasonId`): il
 *   perimetro di default e quello dei lavori di sfondo (cron), che non hanno
 *   un browser davanti;
 * - **dichiarata** — la stagione che la richiesta nomina
 *   (`x-active-season-id`, o un parametro esplicito): e cio che l'interfaccia
 *   sta mostrando, ed e il perimetro di lettura **e di scrittura** di quel
 *   browser — cio che si vede e dove si scrive. Oggi coincide con l'attiva,
 *   perche la si cambia solo attivando, ma il server la tratta come una
 *   dichiarazione: vale solo se il club la ha;
 * - **della riga** — la stagione scritta sul record (`season_id`,
 *   `seasonId`): e l'autorita per lo storico e **non si sostituisce mai** con
 *   l'attiva. Chi legge una riga di ieri legge la sua stagione;
 * - **per data** — solo per righe **senza** stagione scritta, e solo quando
 *   la finestra e unica (`resolveSeasonWindow` in `accounting.ts`): due
 *   stagioni sovrapposte non decidono niente. Mai per una riga che ha la sua;
 * - **nessuna** — un club senza stagioni salvate (la stagione sintetizzata
 *   in lettura non e un dato), o un header **vuoto per scelta** (`""`), che
 *   dice «tutto il catalogo» a chi deve riconoscere un'appartenenza di
 *   un'altra annata (ADR-0196 §7).
 *
 * I record **senza** annata appartengono alla stagione piu vecchia del club
 * (`legacySeasonId`, WP-32): la regola vive in `filterCollectionBySeason` per
 * le collezioni JSON e in `recordBelongsToSeason` / `seasonWhere` per le
 * tabelle. E la stessa regola, scritta due volte perche una filtra in
 * memoria e l'altra nel database, e le prove le tengono allineate.
 */

export type SeasonContextKind = "active" | "selected" | "none";

export type SeasonContext = {
  /** Come si e arrivati alla stagione: attiva del club, dichiarata dalla richiesta, nessuna. */
  kind: SeasonContextKind;
  /** La stagione con cui la richiesta lavora. `null` = nessun perimetro. */
  seasonId: string | null;
  season: ClubSeason | null;
  activeSeasonId: string | null;
  legacySeasonId: string | null;
  knownSeasonIds: string[];
  seasons: ClubSeason[];
  /** Il club non ha stagioni salvate: niente perimetro, niente marcatura. */
  isFallback: boolean;
  /** Cio che la richiesta ha dichiarato, com'era. */
  requestedSeasonId: string | null;
  /** La richiesta nominava una stagione che il club non ha (header stale). */
  requestedUnknown: boolean;
  /** La richiesta ha chiesto esplicitamente «nessun perimetro» (header vuoto). */
  perimeterDisabled: boolean;
};

export type RequestedSeason = {
  /** Il valore dichiarato, ripulito. `null` se assente o vuoto. */
  value: string | null;
  /** `true` se la richiesta portava l'header/parametro, anche vuoto. */
  declared: boolean;
};

const SEASON_HEADER = "x-active-season-id";

/**
 * Legge la stagione dichiarata da una richiesta, da un oggetto `Headers` o da
 * un valore grezzo. Distingue **assente** (nessuna dichiarazione: vale
 * l'attiva) da **vuoto** (dichiarazione di «nessun perimetro»).
 */
export const readRequestedSeason = (
  source: Request | Headers | string | null | undefined,
): RequestedSeason => {
  if (source === undefined) {
    return { value: null, declared: false };
  }
  if (source === null) {
    return { value: null, declared: false };
  }
  if (typeof source === "string") {
    const value = source.trim();
    return { value: value || null, declared: true };
  }
  const headers = source instanceof Headers ? source : source.headers;
  const raw = headers.get(SEASON_HEADER);
  if (raw === null) {
    return { value: null, declared: false };
  }
  const value = raw.trim();
  return { value: value || null, declared: true };
};

/**
 * Costruisce il contesto di stagione dalle impostazioni del club e da cio
 * che la richiesta ha dichiarato. Pura: la lettura del club sta nel modulo
 * server.
 *
 * Regole:
 * - club senza stagioni salvate → `none`, sempre;
 * - dichiarazione vuota → `none` (perimetro disattivato per scelta);
 * - dichiarazione di una stagione che il club ha → quella (`active` se e
 *   l'attiva, `selected` altrimenti);
 * - dichiarazione di una stagione sconosciuta → **l'attiva**, con
 *   `requestedUnknown`. Prima uno stale «non filtrava niente»: su un elenco
 *   di configurazione era un dato in piu, su un calendario e la stagione
 *   scorsa mescolata a questa. L'attiva e la risposta che non perde e non
 *   mescola;
 * - nessuna dichiarazione → l'attiva.
 */
export const buildSeasonContext = (
  settings: unknown,
  requested: RequestedSeason = { value: null, declared: false },
): SeasonContext => {
  const state = normalizeClubSeasons(
    settings && typeof settings === "object" ? settings : {},
  );
  const knownSeasonIds = state.seasons.map((season) => season.id);
  const base = {
    activeSeasonId: state.isFallback ? null : state.activeSeasonId,
    legacySeasonId: state.isFallback ? null : state.legacySeasonId,
    knownSeasonIds: state.isFallback ? [] : knownSeasonIds,
    seasons: state.isFallback ? [] : state.seasons,
    isFallback: state.isFallback,
    requestedSeasonId: requested.value,
    requestedUnknown: false,
    perimeterDisabled: false,
  };

  if (state.isFallback) {
    return { ...base, kind: "none", seasonId: null, season: null };
  }

  if (requested.declared && !requested.value) {
    return {
      ...base,
      kind: "none",
      seasonId: null,
      season: null,
      perimeterDisabled: true,
    };
  }

  const active = state.activeSeason;

  if (requested.value) {
    const declared = state.seasons.find((season) => season.id === requested.value);
    if (declared) {
      return {
        ...base,
        kind: declared.id === active.id ? "active" : "selected",
        seasonId: declared.id,
        season: declared,
      };
    }
    return {
      ...base,
      kind: "active",
      seasonId: active.id,
      season: active,
      requestedUnknown: true,
    };
  }

  return { ...base, kind: "active", seasonId: active.id, season: active };
};

/**
 * Una stagione **della riga** appartiene al perimetro? La regola dei record
 * senza annata (WP-32): niente stagione, o una stagione che il club non ha
 * (orfana), vale «stagione piu vecchia». Senza perimetro passa tutto.
 */
export const recordBelongsToSeason = (
  recordSeasonId: string | null | undefined,
  context: Pick<SeasonContext, "seasonId" | "legacySeasonId" | "knownSeasonIds">,
) => {
  if (!context.seasonId) return true;
  const value = String(recordSeasonId || "").trim();
  if (!value || !context.knownSeasonIds.includes(value)) {
    return !context.legacySeasonId || context.legacySeasonId === context.seasonId;
  }
  return value === context.seasonId;
};

/**
 * La stessa regola, per una colonna `season_id` di una tabella: un frammento
 * di `where` Prisma, o `null` quando non c'e perimetro.
 */
export const seasonWhere = (
  context: Pick<SeasonContext, "seasonId" | "legacySeasonId" | "knownSeasonIds">,
  column = "season_id",
): Record<string, unknown> | null => {
  if (!context.seasonId) return null;
  const isLegacy =
    !context.legacySeasonId || context.legacySeasonId === context.seasonId;
  if (!isLegacy) {
    return { [column]: context.seasonId };
  }
  return {
    OR: [
      { [column]: context.seasonId },
      { [column]: null },
      { [column]: "" },
      ...(context.knownSeasonIds.length
        ? [{ [column]: { notIn: context.knownSeasonIds } }]
        : []),
    ],
  };
};

/**
 * La stagione da **scrivere** su una riga nuova: quella dichiarata dalla
 * richiesta se c'e (e cio che l'interfaccia mostra), altrimenti l'attiva;
 * `null` su un club senza stagioni salvate. Una riga che porta gia la sua
 * stagione la tiene: qui si compone, non si sovrascrive.
 */
export const seasonIdForNewRecord = (
  context: Pick<SeasonContext, "seasonId" | "activeSeasonId" | "perimeterDisabled" | "isFallback">,
  declaredOnRecord?: string | null,
) => {
  const own = String(declaredOnRecord || "").trim();
  if (own) return own;
  if (context.isFallback) return null;
  /* Header vuoto per scelta: niente perimetro e niente marcatura, come il registro generico (revisione A-L1). */
  if (context.perimeterDisabled) return null;
  return context.seasonId || context.activeSeasonId;
};

/**
 * L'etichetta della stagione di una riga, per chi la mostra fuori dal
 * perimetro: «2025/26» se la stagione e del club, «altra stagione» se la riga
 * nomina un id che il club non ha piu.
 */
export const seasonLabelOf = (
  seasons: readonly ClubSeason[],
  seasonId: string | null | undefined,
  legacySeasonId?: string | null,
) => {
  const value = String(seasonId || "").trim();
  const id = value || legacySeasonId || "";
  const found = seasons.find((season) => season.id === id);
  if (found) return found.label;
  return value ? "altra stagione" : null;
};
