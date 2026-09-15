import type { ClubAppointment } from "@/lib/api/appointments-client";
import type { ReminderTargetType } from "@/lib/reminder-targeting";
import { ACTIVITY_STATUS, CALLUP_STATUS, MONEY_STATUS, PERSON_STATUS, type StatusSpec } from "@/lib/web/status";
import { formatLocalDateOnly } from "@/lib/date-only";
import { parseDateInput } from "@/lib/web/format";

/**
 * Il modello puro della Segreteria V2: le stesse forme di dati della V1
 * (`clubs.opening_hours`, `clubs.secretariat_notes`, la proiezione
 * `toClubAppointment`) e le funzioni che la pagina V1 teneva in linea
 * (`parseTimeRange`, `buildTimeRange`, `buildAppointmentSlots`, la
 * normalizzazione di note e nominativi). Nessuna scrittura: le scritture
 * restano in `page.tsx`, che usa gli stessi verbi della V1.
 */

/* ── Il club nell'intestazione, come ovunque ─────────────────────────────── */
export const intestazioniClub = (organizationId?: string | null): Record<string, string> =>
  organizationId ? { "x-active-club-id": String(organizationId) } : {};

/* ── Orari di apertura ───────────────────────────────────────────────────── */
export type OpeningDayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

export type OpeningDay = { morning: string; afternoon: string; morningStaff: string; afternoonStaff: string };

export type OpeningHours = Record<OpeningDayKey, OpeningDay>;

export const OPENING_DAYS: ReadonlyArray<{ key: OpeningDayKey; label: string }> = [
  { key: "monday", label: "Lunedì" },
  { key: "tuesday", label: "Martedì" },
  { key: "wednesday", label: "Mercoledì" },
  { key: "thursday", label: "Giovedì" },
  { key: "friday", label: "Venerdì" },
  { key: "saturday", label: "Sabato" },
  { key: "sunday", label: "Domenica" },
];

/** `getDay()` → chiave del giorno (0 = domenica). */
const DAY_KEY_BY_INDEX: OpeningDayKey[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export const emptyOpeningDay = (): OpeningDay => ({ morning: "", afternoon: "", morningStaff: "", afternoonStaff: "" });

export const emptyOpeningHours = (): OpeningHours => ({
  monday: emptyOpeningDay(),
  tuesday: emptyOpeningDay(),
  wednesday: emptyOpeningDay(),
  thursday: emptyOpeningDay(),
  friday: emptyOpeningDay(),
  saturday: emptyOpeningDay(),
  sunday: emptyOpeningDay(),
});

/** La riga salvata puo mancare di qualche giorno o campo: si completa. */
export const normalizeOpeningHours = (value: unknown): OpeningHours => {
  const base = emptyOpeningHours();
  const record = value && typeof value === "object" ? (value as Record<string, any>) : {};
  for (const { key } of OPENING_DAYS) {
    const day = record[key] && typeof record[key] === "object" ? record[key] : {};
    base[key] = {
      morning: String(day.morning || ""),
      afternoon: String(day.afternoon || ""),
      morningStaff: String(day.morningStaff || ""),
      afternoonStaff: String(day.afternoonStaff || ""),
    };
  }
  return base;
};

export const parseTimeRange = (timeRange?: string) => {
  const [start = "", end = ""] = String(timeRange || "").trim().split("-", 2);
  return { start, end };
};

export const buildTimeRange = (start?: string, end?: string) => {
  if (!start && !end) return "";
  return `${start || ""}-${end || ""}`;
};

/** Gli slot di 30 minuti di una fascia `HH:MM-HH:MM` (la V1 li proponeva al desk). */
export const buildAppointmentSlots = (timeRange: string) => {
  const match = String(timeRange || "").trim().match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
  if (!match) return [];
  const [, startHour, startMin, endHour, endMin] = match;
  const startTime = parseInt(startHour, 10) * 60 + parseInt(startMin, 10);
  const endTime = parseInt(endHour, 10) * 60 + parseInt(endMin, 10);
  const slots: string[] = [];
  for (let time = startTime; time < endTime; time += 30) {
    const hours = Math.floor(time / 60);
    const minutes = time % 60;
    slots.push(`${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`);
  }
  return slots;
};

/** Gli slot del desk per un giorno `YYYY-MM-DD`, divisi in mattina e pomeriggio. */
export const deskSlotsForDate = (openingHours: OpeningHours, dateOnly: string) => {
  const date = parseDateInput(dateOnly);
  if (!date) return { morning: [] as string[], afternoon: [] as string[], dayLabel: "" };
  const key = DAY_KEY_BY_INDEX[date.getDay()];
  const hours = openingHours[key];
  return {
    morning: buildAppointmentSlots(hours.morning),
    afternoon: buildAppointmentSlots(hours.afternoon),
    dayLabel: OPENING_DAYS.find((d) => d.key === key)?.label.toLowerCase() || "",
  };
};

/** Quanti giorni hanno almeno una fascia dichiarata. */
export const countOpenDays = (openingHours: OpeningHours) =>
  OPENING_DAYS.filter(({ key }) => buildAppointmentSlots(openingHours[key].morning).length || buildAppointmentSlots(openingHours[key].afternoon).length).length;

/* ── Note e promemoria ───────────────────────────────────────────────────── */
export type SecretariatNote = {
  id: string;
  content: string;
  date: Date;
  expiryDate?: Date;
  notificationEnabled: boolean;
  isAllDay: boolean;
  notificationTime: string;
  targetType: ReminderTargetType;
  targetId: string;
  targetLabel: string;
};

/** La stessa normalizzazione della V1: grafie storiche comprese. */
export const normalizeNote = (note: Record<string, any>): SecretariatNote => ({
  ...note,
  id: String(note.id),
  content: String(note.content ?? ""),
  date: new Date(note.date),
  expiryDate: note.expiryDate ? new Date(note.expiryDate) : undefined,
  notificationEnabled: note.notificationEnabled || false,
  isAllDay: note.isAllDay !== false,
  notificationTime: note.notificationTime || "",
  targetType: (note.targetType || note.target_type || "club_dashboard") as ReminderTargetType,
  targetId: String(note.targetId || note.target_id || note.trainerId || note.staffMemberId || note.memberId || "").trim(),
  targetLabel: String(note.targetLabel || note.target_label || note.trainerName || note.staffMemberName || note.memberName || "").trim(),
});

export const NOTE_TARGET_OPTIONS: ReadonlyArray<{ value: ReminderTargetType; label: string }> = [
  { value: "club_dashboard", label: "Interno dashboard club" },
  { value: "all_trainers", label: "Tutti gli allenatori" },
  { value: "trainer", label: "Allenatore specifico" },
  { value: "staff_member", label: "Membro staff specifico" },
  { value: "member", label: "Socio specifico" },
];

export const noteTargetLabel = (type: ReminderTargetType) => NOTE_TARGET_OPTIONS.find((o) => o.value === type)?.label || type;

/** Le tre destinazioni che vogliono un destinatario. */
export const NOTE_TARGET_NEEDS_PERSON: readonly ReminderTargetType[] = ["trainer", "staff_member", "member"];

export const noteNeedsRecipient = (type: ReminderTargetType) => NOTE_TARGET_NEEDS_PERSON.includes(type);

/**
 * La scadenza in forma `YYYY-MM-DD` per il campo data. La V1 salvava
 * `new Date("YYYY-MM-DD")` (mezzanotte UTC) e la rileggeva con
 * `toISOString().split("T")[0]`: si conserva la stessa coppia, cosi una nota
 * scritta prima e dopo la migrazione dice lo stesso giorno.
 */
export const noteExpiryInputValue = (expiryDate?: Date) => (expiryDate && !Number.isNaN(expiryDate.getTime()) ? expiryDate.toISOString().split("T")[0] : "");

export const noteExpiryFromInput = (value: string) => (value ? new Date(value) : undefined);

/** Giorno civile della scadenza, per confronti con «oggi». */
export const noteExpiryDayKey = (note: SecretariatNote) => noteExpiryInputValue(note.expiryDate);

export const isNoteExpired = (note: SecretariatNote, today = formatLocalDateOnly(new Date())) => {
  const key = noteExpiryDayKey(note);
  return Boolean(key) && key < today;
};

/** Una riga di notifica: `08:00` (giornata intera) oppure `30 min prima delle HH:MM`. */
export const noteNotificationSummary = (note: SecretariatNote) => {
  if (!note.notificationEnabled) return null;
  if (note.isAllDay || !note.notificationTime) return "Notifica alle 08:00";
  return `Notifica 30 min prima delle ${note.notificationTime}`;
};

/* ── Persone (nominativi e destinatari) ──────────────────────────────────── */
export type PersonOption = { id: string; label: string; athleteLabel?: string };

export type SecretariatPeople = {
  staff: PersonOption[];
  trainers: PersonOption[];
  members: PersonOption[];
  athletes: PersonOption[];
  /** Atleti, tutori, staff e allenatori, deduplicati per etichetta (V1). */
  nominativi: PersonOption[];
};

const fullNameOf = (record: any, ...keys: string[]) => {
  for (const key of keys) {
    const value = String(record?.[key] || "").trim();
    if (value) return value;
  }
  return "";
};

/** Le stesse normalizzazioni della V1, in un posto solo. */
export const buildSecretariatPeople = (input: { staff: unknown; athletes: unknown; trainers: unknown; members: unknown }): SecretariatPeople => {
  const staff: PersonOption[] = (Array.isArray(input.staff) ? input.staff : []).map((row: any) => ({
    id: String(row?.id || `staff-${Date.now()}-${Math.random()}`),
    name: row?.name || "Nome non disponibile",
  })).map((row) => ({ id: row.id, label: String(row.name) }));

  const athletesRaw = (Array.isArray(input.athletes) ? input.athletes : [])
    .map((athlete: any) => {
      const label = [String(athlete?.first_name || "").trim(), String(athlete?.last_name || "").trim()].filter(Boolean).join(" ").trim();
      if (!athlete?.id || !label) return null;
      return { id: String(athlete.id), label, guardians: Array.isArray(athlete?.data?.guardians) ? athlete.data.guardians : [] };
    })
    .filter(Boolean) as Array<{ id: string; label: string; guardians: any[] }>;

  const trainers: PersonOption[] = (Array.isArray(input.trainers) ? input.trainers : [])
    .map((trainer: any) => {
      const label = String(trainer?.name || [trainer?.firstName, trainer?.lastName].filter(Boolean).join(" ") || "").trim();
      if (!trainer?.id || !label) return null;
      return { id: String(trainer.id), label };
    })
    .filter(Boolean) as PersonOption[];

  const members: PersonOption[] = (Array.isArray(input.members) ? input.members : [])
    .map((member: any) => {
      const label = String(fullNameOf(member, "fullName", "name") || [member?.firstName, member?.lastName].filter(Boolean).join(" ") || "").trim();
      if (!member?.id || !label) return null;
      return { id: String(member.id), label };
    })
    .filter(Boolean) as PersonOption[];

  const athletePeople: PersonOption[] = athletesRaw.map((athlete) => ({ id: `athlete-${athlete.id}`, label: athlete.label, athleteLabel: athlete.label }));
  const guardianPeople: PersonOption[] = athletesRaw.flatMap((athlete) =>
    athlete.guardians
      .map((guardian: any, index: number) => {
        const label = [String(guardian?.name || "").trim(), String(guardian?.surname || "").trim()].filter(Boolean).join(" ").trim();
        if (!label) return null;
        return { id: `guardian-${athlete.id}-${guardian?.id || index}`, label, athleteLabel: athlete.label };
      })
      .filter(Boolean) as PersonOption[],
  );
  const staffPeople: PersonOption[] = staff.map((row) => ({ id: `staff-${row.id}`, label: row.label }));
  const trainerPeople: PersonOption[] = trainers.map((row) => ({ id: `trainer-${row.id}`, label: row.label }));

  const nominativi = [...athletePeople, ...guardianPeople, ...staffPeople, ...trainerPeople].filter(
    (person, index, array) => array.findIndex((entry) => entry.label.toLowerCase() === person.label.toLowerCase()) === index,
  );

  return {
    staff,
    trainers,
    members,
    athletes: athletesRaw.map((athlete) => ({ id: athlete.id, label: athlete.label })),
    nominativi,
  };
};

export const reminderTargetOptions = (people: SecretariatPeople, targetType: ReminderTargetType): PersonOption[] => {
  switch (targetType) {
    case "trainer":
      return people.trainers;
    case "staff_member":
      return people.staff;
    case "member":
      return people.members;
    default:
      return [];
  }
};

/* ── Appuntamenti ────────────────────────────────────────────────────────── */
/**
 * Le parole degli otto stati dell'appuntamento, nella forma di
 * `src/lib/web/status.ts` (`{label, weight, hue}`). Il sistema non le ha
 * ancora: «IN ATTESA» e «COMPLETATO»/«ASSENTE» sono gia sue, le altre cinque
 * sono locali finche il lead non le promuove (rapporto §3).
 */
const spec = (label: string, weight: StatusSpec["weight"], hue: StatusSpec["hue"]): StatusSpec => Object.freeze({ label, weight, hue });

export const APPOINTMENT_STATUS_SPEC: Readonly<Record<string, StatusSpec>> = Object.freeze({
  requested: MONEY_STATUS.pending, // «IN ATTESA», solido ambra
  confirmed: spec("CONFERMATO", "solid", "green"),
  rejected: spec("RIFIUTATO", "urgent", "red"),
  rescheduled: spec("RIPROGRAMMATO", "quiet", "neutral"),
  cancelled_by_family: spec("ANNULLATO DALLA FAMIGLIA", "quiet", "neutral"),
  cancelled_by_club: spec("ANNULLATO DALLA SEGRETERIA", "quiet", "neutral"),
  completed: ACTIVITY_STATUS.completed,
  no_show: CALLUP_STATUS.absent,
});

export const appointmentStatusSpec = (status: string | null | undefined): StatusSpec =>
  APPOINTMENT_STATUS_SPEC[String(status || "")] || PERSON_STATUS.draft;

/** Gli stati vivi (occupano un posto) e quelli chiusi. */
export const isLiveAppointment = (appointment: ClubAppointment) => appointment.status === "requested" || appointment.status === "confirmed";

export const APPOINTMENT_STATUS_FILTER_OPTIONS: ReadonlyArray<{ value: string; label: string; tone?: "amber" | "green" | "red" | "neutral" }> = [
  { value: "requested", label: "In attesa di risposta", tone: "amber" },
  { value: "confirmed", label: "Confermato", tone: "green" },
  { value: "completed", label: "Concluso" },
  { value: "no_show", label: "Assente" },
  { value: "rescheduled", label: "Riprogrammato" },
  { value: "rejected", label: "Rifiutato" },
  { value: "cancelled_by_club", label: "Annullato dalla segreteria" },
  { value: "cancelled_by_family", label: "Annullato dalla famiglia" },
];

/** Il nominativo scritto dal desk in `internal_notes` («Nominativo: …»). */
export const appointmentPersonName = (appointment: ClubAppointment) => {
  const notes = String(appointment.internal_notes || "");
  const match = notes.match(/Nominativo:\s*(.+)/i);
  return match ? match[1].trim() : "";
};

export const appointmentDay = (appointment: ClubAppointment) => parseDateInput(appointment.date);

export const isAppointmentOnDay = (appointment: ClubAppointment, date: Date) => {
  const day = appointmentDay(appointment);
  return Boolean(day && isSameDay(day, date));
};

/* ── Giorni e settimane (lun → dom) ──────────────────────────────────────── */
export const startOfWeekMonday = (date: Date): Date => {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (day.getDay() + 6) % 7; // lunedi = 0, domenica = 6
  day.setDate(day.getDate() - offset);
  return day;
};

export const weekDaysOf = (date: Date): Date[] => {
  const monday = startOfWeekMonday(date);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    return day;
  });
};

export const isSameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();

export const isInWeekOf = (date: Date, anchor: Date) => {
  const days = weekDaysOf(anchor);
  return days.some((day) => isSameDay(day, date));
};

export const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
};

const WEEKDAYS_SHORT = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
const MONTHS_SHORT = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

/** `mer 16` */
export const formatWeekdayShort = (date: Date) => `${WEEKDAYS_SHORT[date.getDay()]} ${date.getDate()}`;

/** `14 – 20 set 2026` */
export const formatWeekTitle = (date: Date) => {
  const days = weekDaysOf(date);
  const first = days[0];
  const last = days[6];
  if (first.getMonth() === last.getMonth()) {
    return `${first.getDate()} – ${last.getDate()} ${MONTHS_SHORT[last.getMonth()]} ${last.getFullYear()}`;
  }
  return `${first.getDate()} ${MONTHS_SHORT[first.getMonth()]} – ${last.getDate()} ${MONTHS_SHORT[last.getMonth()]} ${last.getFullYear()}`;
};

/** `mercoledì 16 settembre 2026` — il titolo del giorno, come la V1. */
export const formatDayLong = (date: Date) => date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/* ── Aree della pagina ───────────────────────────────────────────────────── */
export type SecretariatArea = "appuntamenti" | "note" | "orari";

export const SECRETARIAT_AREAS: ReadonlyArray<{ value: SecretariatArea; label: string }> = [
  { value: "appuntamenti", label: "Appuntamenti" },
  { value: "note", label: "Note e promemoria" },
  { value: "orari", label: "Orari di apertura" },
];

export const isSecretariatArea = (value: string | null | undefined): value is SecretariatArea =>
  value === "appuntamenti" || value === "note" || value === "orari";

export type AgendaScope = "day" | "week" | "all";
