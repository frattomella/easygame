import { ACTIVITY_STATUS, CALLUP_STATUS, type StatusSpec } from "@/lib/web/status";
import { isSameDay } from "@/components/training/v2/training-page-model";
import { getConvocatedAthleteIdsFromMatch } from "@/lib/match-certificate-warnings";

/**
 * Il modello puro della pagina Gare nel Web V2 (pattern «giornata sportiva»,
 * guideline 09 §9.3/§9.4, audit `wave-d-gare-calendario.md` §1).
 *
 * Qui vive cio che la V1 teneva dentro `src/app/matches/page.tsx` come
 * funzioni di modulo: la forma della gara, lo stato **derivato** dal confine
 * orario, l'orario di inizio e di fine letti dal campo unico `"HH:MM - HH:MM"`,
 * il riepilogo delle convocazioni, il filtro sui messaggi d'errore del server
 * e il controllo dei conflitti di programmazione. Niente React, niente
 * `window`: e testabile a secco.
 */
export interface MatchRecord {
  id: string;
  title: string;
  date: Date;
  /** `"16:30 - 18:00"` — un solo campo, la fine e sempre esplicita (fix `ac8312a`). */
  time: string;
  category: string;
  categoryId: string;
  opponent: string;
  location: string;
  /** Nomi degli allenatori (la forma storica porta i nomi, non gli id). */
  trainers: string[];
  notes?: string;
  categoryColor: string;
  status: "upcoming" | "completed" | "cancelled";
  convocationsStatus?: "pending" | "completed" | "none";
  convocatedAthletes?: string[];
  [key: string]: any;
}

export type MatchStatusSource = {
  status?: unknown;
  date?: unknown;
  time?: unknown;
};

const CANCELLED_MATCH_STATUSES = new Set(["cancelled", "annullata", "annullato"]);

const COMPLETED_MATCH_STATUSES = new Set([
  "completed",
  "complete",
  "conclusa",
  "concluso",
  "passata",
]);

export const normalizeMatchStatus = (status: unknown): MatchRecord["status"] => {
  const normalized = String(status || "")
    .trim()
    .toLowerCase();
  if (CANCELLED_MATCH_STATUSES.has(normalized)) return "cancelled";
  if (COMPLETED_MATCH_STATUSES.has(normalized)) return "completed";
  return "upcoming";
};

/** Tutti gli `HH:MM` del campo orario, nell'ordine in cui compaiono. */
export const matchTimesOf = (time: unknown): string[] =>
  String(time || "").match(/\d{1,2}:\d{2}/g) || [];

export const matchStartTime = (match: Pick<MatchRecord, "time">): string =>
  matchTimesOf(match.time)[0] || "";

export const matchEndTime = (match: Pick<MatchRecord, "time">): string | null =>
  matchTimesOf(match.time)[1] || null;

/**
 * Il confine dopo il quale la gara e conclusa: la fine se c'e, altrimenti
 * l'inizio, altrimenti la fine del giorno — come la V1.
 */
export const getMatchBoundaryDate = (match: MatchStatusSource): Date | null => {
  const date = new Date(match.date as any);
  if (Number.isNaN(date.getTime())) return null;

  const timeMatches = matchTimesOf(match.time);
  const boundaryTime = timeMatches[timeMatches.length > 1 ? 1 : 0];

  if (!boundaryTime) {
    date.setHours(23, 59, 59, 999);
    return date;
  }

  const [hours, minutes] = boundaryTime.split(":").map(Number);
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return date;
};

export const getEffectiveMatchStatus = (
  match: MatchStatusSource,
  now: Date = new Date(),
): MatchRecord["status"] => {
  const normalizedStatus = normalizeMatchStatus(match.status);
  if (normalizedStatus === "cancelled") return "cancelled";

  const boundaryDate = getMatchBoundaryDate(match);
  if (boundaryDate && boundaryDate < now) return "completed";

  return normalizedStatus === "completed" ? "completed" : "upcoming";
};

/**
 * La parola di stato (guideline 09 §9.4). La V1 diceva «In Programma ·
 * Conclusa · Annullata»; il sistema ha una parola per ciascuna.
 */
export const matchStatusSpec = (status: MatchRecord["status"]): StatusSpec => {
  switch (status) {
    case "cancelled":
      return ACTIVITY_STATUS.cancelled;
    case "completed":
      return ACTIVITY_STATUS.completed;
    default:
      return ACTIVITY_STATUS.scheduled;
  }
};

/** Le azioni di gestione (convocazioni, modifica, annulla) valgono solo in programma. */
export const canManageMatch = (match: MatchStatusSource, now: Date = new Date()) =>
  getEffectiveMatchStatus(match, now) === "upcoming";

/** `isHome !== false` come la V1: una gara senza il campo e in casa. */
export const isHomeMatch = (match: { isHome?: unknown; homeAway?: unknown; [key: string]: unknown }) => {
  if (match.isHome === false) return false;
  const homeAway = String(match.homeAway || "").trim().toLowerCase();
  if (homeAway === "away" || homeAway === "trasferta") return false;
  return true;
};

/* ── Convocazioni ───────────────────────────────────────────────────────── */

export type ConvocationTone = "saved" | "pending" | "missing" | "none";

/**
 * **Il conteggio lo fa il server** (P0-6): `convocated_count` arriva dalla
 * rotta canonica; il payload e il ripiego per le gare che non l'hanno.
 */
export const convocatedCountOf = (match: MatchRecord): number =>
  Number.isFinite(Number(match.convocated_count))
    ? Number(match.convocated_count)
    : getConvocatedAthleteIdsFromMatch(match).length;

export const convocationTone = (match: MatchRecord, now: Date = new Date()): ConvocationTone => {
  const status = String(match.convocationsStatus || "").toLowerCase();
  if (status === "completed") return "saved";
  if (status === "pending") return "pending";
  if (canManageMatch(match, now)) return "missing";
  return "none";
};

/** La stessa parola della tabella V1: Completate · In corso · Mancanti. */
export const convocationWord = (tone: ConvocationTone): string =>
  tone === "saved" ? "Completate" : tone === "pending" ? "In corso" : tone === "missing" ? "Mancanti" : "—";

/** Il verbo del pulsante primario della riga. */
export const convocationVerb = (match: MatchRecord, now: Date = new Date()): string | null => {
  if (!canManageMatch(match, now)) return null;
  return convocationTone(match, now) === "saved" ? "Apri convocazioni" : "Convocazioni";
};

export type RsvpAnswer = "yes" | "no" | "no_response";

/**
 * La risposta di una famiglia (guideline 09 §9.4, Call-up): «senza risposta»
 * e una pillola, perche e l'unica su cui si puo ancora fare qualcosa; «ci
 * sara» / «non ci sara» sono parole, perche non sono una presenza (ADR-0086).
 */
export const rsvpAnswerSpec = (state: RsvpAnswer | null | undefined): StatusSpec | null =>
  state === "no_response" ? CALLUP_STATUS.no_answer : null;

export const rsvpAnswerWord = (state: RsvpAnswer | null | undefined): string | null =>
  state === "yes" ? "ci sarà" : state === "no" ? "non ci sarà" : null;

/** La pillola dello stato di convocazione di un atleta. */
export const callupSpec = (convocated: boolean): StatusSpec =>
  convocated ? CALLUP_STATUS.called : CALLUP_STATUS.not_called;

/* ── Giorni ─────────────────────────────────────────────────────────────── */

export const isMatchOnDate = (match: Pick<MatchRecord, "date">, day: Date) =>
  match.date instanceof Date && !Number.isNaN(match.date.getTime()) && isSameDay(match.date, day);

/** Cronologico, con l'inizio come spareggio: l'ordine della giornata. */
export const compareMatchesByStart = (left: MatchRecord, right: MatchRecord) => {
  const byDate = left.date.getTime() - right.date.getTime();
  if (byDate !== 0) return byDate;
  return matchStartTime(left).localeCompare(matchStartTime(right));
};

/**
 * L'ordine della tabella V1: prima le gare in programma per data crescente,
 * poi le altre per data decrescente.
 */
export const compareMatchesForList = (left: MatchRecord, right: MatchRecord, now: Date = new Date()) => {
  const leftStatus = getEffectiveMatchStatus(left, now);
  const rightStatus = getEffectiveMatchStatus(right, now);
  if (leftStatus === "upcoming" && rightStatus !== "upcoming") return -1;
  if (leftStatus !== "upcoming" && rightStatus === "upcoming") return 1;
  const leftDate = left.date.getTime();
  const rightDate = right.date.getTime();
  return leftStatus === "upcoming" ? leftDate - rightDate : rightDate - leftDate;
};

/* ── Errori del server ──────────────────────────────────────────────────── */

/**
 * **Il messaggio reale, quando e sicuro mostrarlo** (bug UAT «creazione nuova
 * gara fallisce»). Un messaggio di dominio e gia italiano, una riga, pensato
 * per chi non legge codice; un errore di rete o uno stack non deve arrivare
 * com'e.
 */
export const isReadableBusinessErrorMessage = (message: string) => {
  const trimmed = message.trim();
  if (!trimmed || trimmed.length > 300) return false;
  if (/\n/.test(trimmed)) return false;
  if (
    /^(TypeError|ReferenceError|SyntaxError|RangeError|EvalError|URIError|Prisma[A-Za-z]*Error|Error):/i.test(
      trimmed,
    )
  ) {
    return false;
  }
  if (/\bat\s+[\w.$]+\s*\(/.test(trimmed)) return false;
  return true;
};

export const GENERIC_MATCH_SAVE_ERROR =
  "Errore nell'aggiunta della gara. Riprova o contatta l'assistenza se il problema persiste.";

export const GENERIC_MATCH_EDIT_ERROR =
  "Errore nella modifica della gara. Riprova o contatta l'assistenza se il problema persiste.";

export const GENERIC_MATCH_DELETE_ERROR =
  "Errore nell'eliminazione della gara. Riprova o contatta l'assistenza se il problema persiste.";

export const GENERIC_MATCH_CANCEL_ERROR =
  "Errore nell'annullamento della gara. Riprova o contatta l'assistenza se il problema persiste.";

export const GENERIC_MATCH_RESTORE_ERROR =
  "Errore nel ripristino della gara. Riprova o contatta l'assistenza se il problema persiste.";

export const getReadableMatchErrorMessage = (
  error: unknown,
  fallback: string = GENERIC_MATCH_SAVE_ERROR,
) => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return isReadableBusinessErrorMessage(message) ? message : fallback;
};

/* ── Conflitti di programmazione ────────────────────────────────────────── */

const parseTimeRange = (timeStr: string) => {
  const [start, end] = String(timeStr || "").split(" - ");
  return { start: start?.trim() || "", end: end?.trim() || "" };
};

const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

/** Durata presunta quando manca la fine: tre ore, come la V1. */
const ASSUMED_MATCH_HOURS = 3;

const endOrAssumed = (start: string, end?: string) => {
  if (end) return end;
  const [hours, minutes] = start.split(":").map(Number);
  return `${String((hours || 0) + ASSUMED_MATCH_HOURS).padStart(2, "0")}:${String(minutes || 0).padStart(2, "0")}`;
};

export const matchTimesOverlap = (time1: string, time2: string) => {
  const first = parseTimeRange(time1);
  const second = parseTimeRange(time2);
  if (!first.start || !second.start) return false;
  const start1 = toMinutes(first.start);
  const end1 = toMinutes(endOrAssumed(first.start, first.end));
  const start2 = toMinutes(second.start);
  const end2 = toMinutes(endOrAssumed(second.start, second.end));
  return start1 < end2 && start2 < end1;
};

export type ScheduleConflicts = {
  trainerConflicts: MatchRecord[];
  categoryConflicts: MatchRecord[];
};

/**
 * I conflitti della V1: stesso giorno, gare non annullate, sovrapposizione
 * oraria (durata presunta di tre ore senza la fine), per **allenatore in
 * comune** e per **categoria in comune**.
 */
export const findScheduleConflicts = ({
  matches,
  candidate,
  trainers,
  ignoreId,
}: {
  matches: MatchRecord[];
  candidate: { date: Date; time: string; trainerIds: string[]; categoryIds: string[] };
  trainers: Array<{ id: string; name: string }>;
  ignoreId?: string | null;
}): ScheduleConflicts => {
  const dayMatches = matches.filter((match) => {
    if (ignoreId && (match.id === ignoreId || match.eventId === ignoreId)) return false;
    if (getEffectiveMatchStatus(match) === "cancelled") return false;
    return isMatchOnDate(match, candidate.date);
  });

  const candidateTrainerNames = new Set(
    candidate.trainerIds
      .map((id) => trainers.find((trainer) => trainer.id === id)?.name)
      .filter(Boolean) as string[],
  );

  const trainerConflicts = dayMatches.filter(
    (match) =>
      (match.trainers || []).some((name) => candidateTrainerNames.has(name)) &&
      matchTimesOverlap(match.time, candidate.time),
  );

  const categoryConflicts = dayMatches.filter(
    (match) =>
      candidate.categoryIds.includes(match.categoryId) &&
      matchTimesOverlap(match.time, candidate.time),
  );

  return { trainerConflicts, categoryConflicts };
};

export const hasScheduleConflicts = (conflicts: ScheduleConflicts) =>
  conflicts.trainerConflicts.length > 0 || conflicts.categoryConflicts.length > 0;

/**
 * La descrizione del conflitto per la conferma (le stesse informazioni della
 * V1, senza emoji e senza maiuscole urlate).
 */
export const describeScheduleConflicts = (conflicts: ScheduleConflicts): string[] => {
  const lines: string[] = [];
  if (conflicts.trainerConflicts.length) {
    lines.push(
      `Allenatori già impegnati: ${conflicts.trainerConflicts
        .map((match) => `${match.title} (${match.time})`)
        .join(", ")}.`,
    );
  }
  if (conflicts.categoryConflicts.length) {
    lines.push(
      `Categorie già impegnate: ${conflicts.categoryConflicts
        .map((match) => `${match.title} (${match.time})`)
        .join(", ")}.`,
    );
  }
  lines.push("I conflitti sono calcolati considerando una durata di 3 ore per partita.");
  return lines;
};
