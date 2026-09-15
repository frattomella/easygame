import { readRecordedAttendance } from "@/lib/trainer-operational-alerts";
import {
  canRecordTrainingAttendance,
  getTrainingPhase,
  timeToMinutes,
} from "@/lib/training-utils";
import { parseDateInput } from "@/lib/web/format";
import { ACTIVITY_STATUS, STATUS_UNKNOWN, type StatusSpec } from "@/lib/web/status";

/**
 * Il modello puro della pagina Allenamenti nel Web V2 (pattern «giornata
 * sportiva», mockup P4 + guideline 09 §9.3/§9.4).
 *
 * Qui vivono la forma della seduta come la pagina la tiene in mano e le
 * derivazioni che ogni superficie — la giornata, la settimana, il cassetto
 * delle presenze — legge allo stesso modo: la fase (da `getTrainingPhase`),
 * la parola di stato (da `@/lib/web/status`), «l'appello e stato fatto?»
 * (da `readRecordedAttendance`, l'unico lettore) e il verbo delle presenze.
 * Niente React, niente `window`: e testabile a secco.
 */
export interface TrainingSession {
  id: string;
  title: string;
  date: Date;
  time: string;
  endTime?: string | null;
  category: string;
  categoryId?: string | null;
  categoryReferences?: string[];
  /**
   * I **gruppi operativi** a cui l'allenamento si riferisce: le squadre vere,
   * non la fascia. Vuoto su un allenamento precedente ai gruppi, e in quel
   * caso si ricade sulla categoria (ADR-0055).
   */
  groupIds?: string[];
  historicalCategoryName?: string | null;
  /** Nomi uniti, per la lista. */
  trainer: string;
  /** Gli id veri: i record piu vecchi hanno solo `trainer`. */
  trainerIds?: string[];
  location: string;
  locationId?: string | null;
  structureId?: string | null;
  attendees: number;
  categoryColor: string;
  status: "upcoming" | "completed" | "cancelled" | "annullato" | "concluded";
  attendance?: any[];
  /**
   * **Quanti registrati e quanti presenti**, cosi come li conta il server
   * (P0-5). L'appello vive in `club_event_participants`: alle schede bastano
   * due numeri, l'elenco riga per riga lo chiede solo chi apre il registro.
   */
  attendanceRecorded?: number | null;
  attendancePresent?: number | null;
  expectedAttendees?: number;
  /**
   * **La versione su cui questa copia e stata letta** (PP-02 §O): senza, il
   * controllo ottimistico di ADR-0098 non puo mai fallire.
   */
  version?: number | null;
}

export type TrainingPhase = ReturnType<typeof getTrainingPhase>;

export type AttendanceTone = "recorded" | "missing" | "none";

/* ── Settimana ──────────────────────────────────────────────────────────── */

const DAY_MS = 86_400_000;

/** Il lunedi della settimana che contiene `date`, a mezzanotte locale. */
export const startOfWeekMonday = (date: Date): Date => {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (day.getDay() + 6) % 7;
  day.setDate(day.getDate() - offset);
  return day;
};

/** I sette giorni (lun → dom) della settimana di `date`. */
export const weekDaysOf = (date: Date): Date[] => {
  const monday = startOfWeekMonday(date);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    return day;
  });
};

export const isSameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

export const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
};

/** Le celle del mese (lun → dom, `null` fuori dal mese), come la V1. */
export const monthGridOf = (anchor: Date): Array<Date | null> => {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  const cells: Array<Date | null> = Array.from({ length: offset }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(anchor.getFullYear(), anchor.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

/** `lun 14` — la riga del rail settimanale. */
const WEEKDAYS_SHORT = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
export const formatWeekdayShort = (date: Date) => `${WEEKDAYS_SHORT[date.getDay()]} ${date.getDate()}`;

/** `mer 16 set` — il titolo di pagina. */
const MONTHS_SHORT = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
export const formatDayTitle = (date: Date) =>
  `${WEEKDAYS_SHORT[date.getDay()]} ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;

/** `14 – 20 set 2026` — il titolo della vista settimana. */
export const formatWeekTitle = (date: Date) => {
  const days = weekDaysOf(date);
  const first = days[0];
  const last = days[6];
  if (first.getMonth() === last.getMonth()) {
    return `${first.getDate()} – ${last.getDate()} ${MONTHS_SHORT[last.getMonth()]} ${last.getFullYear()}`;
  }
  return `${first.getDate()} ${MONTHS_SHORT[first.getMonth()]} – ${last.getDate()} ${MONTHS_SHORT[last.getMonth()]} ${last.getFullYear()}`;
};

/* ── Derivazioni della seduta ───────────────────────────────────────────── */

export const sessionPhase = (training: TrainingSession, now = new Date()): TrainingPhase =>
  getTrainingPhase(
    {
      date: training.date,
      time: training.time,
      endTime: training.endTime,
      status: training.status,
    },
    now,
  );

/**
 * La parola di stato (guideline 09 §9.4). `concluded` e `completed` sono la
 * stessa cosa per chi legge — la seduta e finita — e il sistema ha una sola
 * parola per dirlo: `COMPLETATO`.
 */
export const sessionStatusSpec = (phase: TrainingPhase | "completed"): StatusSpec => {
  switch (phase) {
    case "annullato":
      return ACTIVITY_STATUS.cancelled;
    case "in_progress":
      return ACTIVITY_STATUS.in_progress;
    case "concluded":
    case "completed":
      return ACTIVITY_STATUS.completed;
    default:
      return ACTIVITY_STATUS.scheduled;
  }
};

/**
 * **«L'appello e stato fatto?» ha una risposta sola** (P0-5): la da
 * `readRecordedAttendance`, che conosce le due forme in cui l'appello arriva.
 */
export const sessionAttendanceTone = (training: TrainingSession): AttendanceTone => {
  if (readRecordedAttendance(training).recorded > 0) return "recorded";
  if (canRecordTrainingAttendance(training)) return "missing";
  return "none";
};

export const attendanceStatusSpec = (tone: AttendanceTone): StatusSpec | null => {
  if (tone === "recorded") return ACTIVITY_STATUS.recorded;
  if (tone === "missing") return STATUS_UNKNOWN;
  return null;
};

/** `{presenti, totale}` come la V1: appello registrato, poi il legacy `attendees`. */
export const sessionAttendanceSummary = (training: TrainingSession) => {
  const appello = readRecordedAttendance(training);
  const present = appello.recorded
    ? appello.present
    : typeof training.attendees === "number"
      ? training.attendees
      : 0;
  const total =
    typeof training.expectedAttendees === "number" && training.expectedAttendees > 0
      ? training.expectedAttendees
      : 0;
  return { present, total, recorded: appello.recorded };
};

/** La durata in minuti da ora inizio e ora fine, `null` se manca una delle due. */
export const sessionDurationMinutes = (training: Pick<TrainingSession, "time" | "endTime">) => {
  const start = timeToMinutes(training.time);
  const end = timeToMinutes(training.endTime);
  if (start == null || end == null || end <= start) return null;
  return end - start;
};

/**
 * Il verbo delle presenze (mockup P4): `Registra presenze` finche l'appello
 * non e stato fatto, `Apri presenze` mentre la seduta e in corso, `Rivedi
 * presenze` una volta registrato. `null` = niente da fare (futuro o annullato).
 */
export const attendanceVerb = (training: TrainingSession, now = new Date()): string | null => {
  const phase = sessionPhase(training, now);
  if (phase === "annullato" || !canRecordTrainingAttendance(training, now)) return null;
  const tone = sessionAttendanceTone(training);
  if (tone === "recorded") return "Rivedi presenze";
  if (phase === "in_progress") return "Apri presenze";
  return "Registra presenze";
};

/** Quante gare (non annullate) cadono in un giorno: la nota «n gara» del rail. */
export const countMatchesOnDate = (matches: any[], date: Date): number =>
  matches.filter((match) => {
    const status = String(match?.status || "").toLowerCase();
    if (status === "cancelled" || status === "annullato" || status === "annullata") return false;
    const when = parseDateInput(match?.date ?? match?.data?.date ?? null);
    return Boolean(when && isSameDay(when, date));
  }).length;
