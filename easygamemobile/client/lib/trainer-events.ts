import type {
  ClubCategorySummary,
  Match,
  Training,
  TrainingAttendanceEntry,
} from "@/services/api";
import { formatMobileMatchLocationLabel } from "@/lib/trainer-dashboard-utils";

/**
 * Lettura/scrittura di allenamenti e gare per l'area Trainer — D-MOB-12
 * (WP13, acceptance pass autenticata). Sostituisce il registro generico su
 * `trainings`/`matches`, che il commit Web `d25934d` (2026-09-01) ha tolto
 * dal registro: da allora `GET /api/v1/trainings`/`matches` rispondono 400
 * "Unknown resource" — non solo le scritture, anche le letture, mai
 * documentato finche l'acceptance pass di WP13 non l'ha trovato su
 * staging con un account reale (le quattro schermate coinvolte
 * mostravano silenziosamente "nessun elemento", mai un errore).
 *
 * Bersaglio: `GET/POST /api/v1/events`, lo stesso registro che
 * `src/lib/events/client.ts` gia usa lato Web (`src/lib/server/events.ts`
 * e l'unico scrittore, CLAUDE.md §2 "Eventi sportivi"). Modulo puro,
 * senza dipendenze React Native: le forme di `Training`/`Match` restano
 * quelle di sempre (`@/services/api`), cosi nessuno schermo a valle
 * cambia — solo la provenienza dei dati cambia, non la forma.
 *
 * Il perimetro allenatore (categorie/gruppi assegnati) lo applica ora
 * anche il server in automatico per il ruolo "trainer"
 * (`readTrainerEventPerimeter`, niente piu flag `trainer_dashboard`
 * spoofabile dal client). Il filtro qui sotto resta per due motivi: (1)
 * difesa in profondita, mai meno restrittivo del server, mai piu
 * permissivo; (2) il ruolo "assistant" del mobile non e detto attivi lo
 * stesso perimetro server-side automatico riservato a "trainer" — restare
 * sullo stesso filtro client di sempre e la scelta che non cambia
 * comportamento per nessuno dei due ruoli.
 */

const normalizeText = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const toArray = <T = any>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

const compact = <T>(value: (T | null | undefined | false)[]) =>
  value.filter(Boolean) as T[];

const resolveCategoryId = (
  rawId: unknown,
  rawName: unknown,
  categories: ClubCategorySummary[],
) => {
  const candidates = compact([
    String(rawId || "").trim(),
    String(rawName || "").trim(),
  ]);

  for (const candidate of candidates) {
    const match = categories.find(
      (category) =>
        normalizeText(category.id) === normalizeText(candidate) ||
        normalizeText(category.name) === normalizeText(candidate),
    );
    if (match) {
      return match.id;
    }
  }

  return candidates[0] || undefined;
};

const resolveCategoryName = (
  rawId: unknown,
  rawName: unknown,
  categories: ClubCategorySummary[],
) => {
  const candidates = compact([
    String(rawName || "").trim(),
    String(rawId || "").trim(),
  ]);

  for (const candidate of candidates) {
    const match = categories.find(
      (category) =>
        normalizeText(category.id) === normalizeText(candidate) ||
        normalizeText(category.name) === normalizeText(candidate),
    );
    if (match) {
      return match.name;
    }
  }

  return candidates[0] || "Categoria";
};

/** Una riga di partecipante — `GET /api/v1/events/:id`'s `participants`, o `.../participants`. */
export interface EventParticipantRow {
  athlete_id?: string;
  athleteId?: string;
  /** Presenza: `present | absent | pending` (`src/lib/events/model.ts`). */
  status?: string | null;
  /** Convocazione: colonna distinta, `convocated | excluded | null`. */
  convocation_status?: string | null;
  notes?: string | null;
}

/**
 * Una riga di `GET /api/v1/events` (lista, forma appiattita —
 * `toEventLegacyShape` in `src/lib/events/model.ts`) o `GET
 * /api/v1/events/:id` (dettaglio, con `participants` in piu). La lista
 * porta solo i conteggi aggregati (`attendance_recorded`,
 * `attendance_present`, `convocated_count`) e gia l'elenco
 * `convocated_athlete_ids` — non l'appello riga per riga, quello arriva
 * solo dal dettaglio.
 */
export interface EventRow {
  id?: string;
  eventId?: string;
  kind?: string;
  date?: string;
  time?: string;
  endTime?: string;
  startsAt?: string;
  title?: string;
  status?: string;
  categoryId?: string;
  category_id?: string;
  category?: string;
  categoryName?: string;
  location?: string;
  opponent?: string;
  homeAway?: string | boolean;
  structureId?: string;
  structureName?: string;
  fieldId?: string;
  fieldName?: string;
  locationId?: string;
  kit?: string;
  notes?: string;
  trainers?: string[];
  organization_id?: string;
  club_id?: string;
  version?: number;
  capacity?: number;
  attendance_recorded?: number;
  attendance_present?: number;
  convocated_count?: number;
  convocated_athlete_ids?: string[];
  participants?: EventParticipantRow[];
  [key: string]: unknown;
}

const isMatchHome = (row: EventRow) => {
  if (typeof row.homeAway === "boolean") {
    return row.homeAway;
  }
  const value = normalizeText(row.homeAway);
  if (!value) {
    return true;
  }
  return value !== "away" && value !== "trasferta";
};

/** Stesso ragionamento gia in campo per gli allenamenti (`formatMobileMatchLocationLabel` lo consuma a valle, non qui: qui si passa solo il testo grezzo). */
const rowLocation = (row: EventRow) => String(row.location || "").trim();

export const mapEventRowToTraining = (
  row: EventRow,
  categories: ClubCategorySummary[],
): Training => {
  const categoryId = resolveCategoryId(
    row.categoryId ?? row.category_id,
    row.category ?? row.categoryName,
    categories,
  );
  const category = resolveCategoryName(
    categoryId,
    row.category ?? row.categoryName,
    categories,
  );

  return {
    id: String(row.id || row.eventId || "").trim(),
    clubId:
      String(row.organization_id || row.club_id || "").trim() || undefined,
    title: String(row.title || `${category} Training`).trim(),
    date: String(row.date || "").trim(),
    time: String(row.time || "").trim(),
    endTime: String(row.endTime || "").trim() || undefined,
    location: rowLocation(row) || "Luogo da definire",
    category,
    categoryId,
    coachName: toArray<string>(row.trainers)[0],
    status: (String(row.status || "scheduled").trim() ||
      "scheduled") as Training["status"],
    // Non piu "quanti ci si aspettava" (il vecchio `expectedAttendees`,
    // quasi sempre assente anche prima): "quanti segnati" su "quanti
    // marcati presenti" — due numeri coerenti fra loro, mai inventati.
    presentCount: Number(row.attendance_present) || 0,
    totalCount:
      typeof row.attendance_recorded === "number"
        ? row.attendance_recorded
        : undefined,
    notes: String(row.notes || "").trim() || undefined,
    trainerIds: toArray<string>(row.trainers),
    version: typeof row.version === "number" ? row.version : undefined,
  };
};

export const mapEventRowToMatch = (
  row: EventRow,
  categories: ClubCategorySummary[],
): Match => {
  const categoryId = resolveCategoryId(
    row.categoryId ?? row.category_id,
    row.category ?? row.categoryName,
    categories,
  );
  const category = resolveCategoryName(
    categoryId,
    row.category ?? row.categoryName,
    categories,
  );
  const isHome = isMatchHome(row);
  const opponent = String(row.opponent || "").trim() || undefined;
  const displayLocation = formatMobileMatchLocationLabel({
    structureName: row.structureName,
    fieldName: row.fieldName,
    location: rowLocation(row),
  });

  return {
    id: String(row.id || row.eventId || "").trim(),
    clubId:
      String(row.organization_id || row.club_id || "").trim() || undefined,
    date: String(row.date || "").trim(),
    time: String(row.time || "").trim(),
    homeTeam: (!isHome && opponent ? opponent : "Casa").trim() || "Casa",
    awayTeam: (isHome && opponent ? opponent : "Ospiti").trim() || "Ospiti",
    opponent,
    location: displayLocation,
    structureId: String(row.structureId || "").trim() || undefined,
    fieldId: String(row.fieldId || row.locationId || "").trim() || undefined,
    locationId: String(row.fieldId || row.locationId || "").trim() || undefined,
    kit: String(row.kit || "").trim() || undefined,
    isHome,
    category,
    categoryId,
    convokedCount:
      typeof row.convocated_count === "number"
        ? row.convocated_count
        : undefined,
    totalConvocable:
      typeof row.capacity === "number" ? row.capacity : undefined,
    /*
      **Mancava del tutto** (bug UAT "riconciliazione gare Web/Mobile"): una
      gara annullata arrivava qui com'era, e sparendo lo stato spariva anche
      il modo di saperlo — restava indistinguibile da una gara vera, con lo
      stesso invito a "Gestisci convocazioni". Il server la manda gia
      normalizzata (`toEventLegacyShape`, ADR-0098): qui si porta avanti,
      non si inventa un secondo vocabolario come fa la tabella Web.
    */
    status: (String(row.status || "scheduled").trim() ||
      "scheduled") as Match["status"],
    convocatedAthletes: toArray<string>(row.convocated_athlete_ids),
    convocationsStatus: (toArray(row.convocated_athlete_ids).length > 0
      ? "completed"
      : "none") as Match["convocationsStatus"],
    trainers: toArray<string>(row.trainers),
    version: typeof row.version === "number" ? row.version : undefined,
  };
};

/**
 * Il perimetro allenatore lato client — stessa logica di sempre (WP3),
 * ora ridondante col perimetro server-side per il ruolo "trainer" ma
 * ancora necessaria per "assistant" (vedi nota in cima al file).
 */
export interface TrainerEventScopeContext {
  role?: string | null;
  assignedCategoryIds: string[];
  trainerId?: string | null;
  trainerName?: string | null;
}

const FULL_ACCESS_ROLES = new Set(["owner", "admin"]);

export const roleHasFullClubEventAccess = (role?: string | null) =>
  FULL_ACCESS_ROLES.has(normalizeText(role));

export const filterTrainingsForTrainerScope = (
  trainings: Training[],
  scope: TrainerEventScopeContext,
): Training[] => {
  if (roleHasFullClubEventAccess(scope.role)) {
    return trainings;
  }

  return trainings.filter((training) => {
    const byCategory =
      training.categoryId &&
      scope.assignedCategoryIds.some(
        (value) => normalizeText(value) === normalizeText(training.categoryId),
      );
    const trainerIds = training.trainerIds || [];

    return (
      byCategory ||
      trainerIds.some(
        (value) => normalizeText(value) === normalizeText(scope.trainerId),
      ) ||
      normalizeText(training.coachName || "").includes(
        normalizeText(scope.trainerName || ""),
      )
    );
  });
};

export const filterMatchesForTrainerScope = (
  matches: Match[],
  scope: TrainerEventScopeContext,
): Match[] => {
  if (roleHasFullClubEventAccess(scope.role)) {
    return matches;
  }

  return matches.filter((match) => {
    const byCategory =
      match.categoryId &&
      scope.assignedCategoryIds.some(
        (value) => normalizeText(value) === normalizeText(match.categoryId),
      );

    return (
      byCategory ||
      (match.trainers || []).some((trainerName) =>
        normalizeText(trainerName).includes(
          normalizeText(scope.trainerName || ""),
        ),
      )
    );
  });
};

export const sortEventsByDateTime = <T extends { date: string; time: string }>(
  events: T[],
): T[] =>
  [...events].sort((left, right) =>
    `${left.date}T${left.time}`.localeCompare(`${right.date}T${right.time}`),
  );

/**
 * L'appello di un allenamento dai partecipanti del dettaglio
 * (`GET /api/v1/events/:id`) ai tre stati del vocabolario server
 * (`ATTENDANCE_STATUSES`: present, absent, pending): una riga `pending` —
 * o senza stato, che il server normalizza a pending — e "da segnare"
 * (`present: null`), e resta una riga: al salvataggio torna al server come
 * `pending`, non sparisce. Un atleta senza riga e ugualmente "da segnare",
 * ma non ha nulla da riscrivere (WP13, parita visiva: D-MOB-11 chiuso).
 */
export const mapParticipantsToAttendance = (
  participants: EventParticipantRow[] | undefined,
): TrainingAttendanceEntry[] =>
  toArray(participants)
    .map((entry) => ({
      athleteId: String(entry.athlete_id || entry.athleteId || "").trim(),
      present:
        entry.status === "present"
          ? true
          : entry.status === "absent"
            ? false
            : null,
      notes: String(entry.notes || "").trim(),
    }))
    .filter((entry) => Boolean(entry.athleteId));
