import { todayLocalDateOnly } from "@/lib/date-only";
import { hasBookingConflict, uid, type ClubStructure, type StructureBooking, type StructureBookingStatus } from "@/lib/structures-utils";

/**
 * Il modello puro delle prenotazioni della scheda struttura: il modulo, le
 * sue validazioni e la lettura del calendario. E la logica di
 * `StructureBookingsSection` V1, senza React.
 *
 * **La stessa lettura, per la data e per l'ora** (bug UAT «date-only
 * timezone shift»). `toDateTime` converte un giorno+ora **locale** in un
 * istante UTC vero — la convenzione di questa sezione, diversa da quella
 * letterale di `club_events`, e non e questo il punto da cambiare. La
 * lettura inversa usa gli accessori locali sia per la data (`localDateKey`)
 * sia per l'ora (`toTimeString`): due accessori diversi sullo stesso istante
 * raccontano fusi diversi, e vicino alla mezzanotte sbagliano di un giorno.
 */
export type BookingForm = {
  id: string;
  fieldId: string;
  title: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  status: StructureBookingStatus;
  bookedByName: string;
  amount: string;
  paymentStatus: "unpaid" | "paid" | "partial";
  notes: string;
};

export const emptyBookingForm = (): BookingForm => {
  const today = todayLocalDateOnly();
  return {
    id: "",
    fieldId: "",
    title: "Prenotazione campo",
    startDate: today,
    startTime: "18:00",
    endDate: today,
    endTime: "19:00",
    status: "pending",
    bookedByName: "",
    amount: "",
    paymentStatus: "unpaid",
    notes: "",
  };
};

export const localDateKey = (date: Date) =>
  [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");

export const toDateTime = (date: string, time: string) => {
  if (!date || !time) return "";
  const instant = new Date(`${date}T${time}`);
  return Number.isNaN(instant.getTime()) ? "" : instant.toISOString();
};

export const fromIso = (value: string) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return { date: "", time: "" };
  return { date: localDateKey(date), time: date.toTimeString().slice(0, 5) };
};

export const bookingFormFrom = (booking: StructureBooking): BookingForm => {
  const start = fromIso(booking.start);
  const end = fromIso(booking.end);
  return {
    id: booking.id,
    fieldId: booking.fieldId || "",
    title: booking.title,
    startDate: start.date,
    startTime: start.time,
    endDate: end.date,
    endTime: end.time,
    status: booking.status,
    bookedByName: booking.bookedByName || "",
    amount: booking.amount === undefined ? "" : String(booking.amount).replace(".", ","),
    paymentStatus: booking.paymentStatus || "unpaid",
    notes: booking.notes || "",
  };
};

/** Il modulo precompilato su un giorno del calendario, sul primo campo. */
export const bookingFormForDate = (structure: Pick<ClubStructure, "fields">, date: Date): BookingForm => {
  const key = localDateKey(date);
  return { ...emptyBookingForm(), fieldId: structure.fields[0]?.id || "", startDate: key, endDate: key };
};

export type BookingFormError = { id?: string; label: string };

/**
 * Le tre validazioni della V1, con gli stessi messaggi: campo, titolo e orari
 * obbligatori; fine dopo inizio; nessun conflitto sullo stesso campo con una
 * prenotazione viva (`hasBookingConflict`, che ignora le annullate).
 */
export const buildBooking = (
  structure: ClubStructure,
  form: BookingForm,
  idPrefix = "booking",
): { booking: StructureBooking; errors: [] } | { booking: null; errors: BookingFormError[] } => {
  const field = structure.fields.find((item) => item.id === form.fieldId);
  const start = toDateTime(form.startDate, form.startTime);
  const end = toDateTime(form.endDate, form.endTime);
  const bookings = structure.bookings || [];

  if (!field || !form.title.trim() || !start || !end) {
    return {
      booking: null,
      errors: [{ id: !field ? `${idPrefix}-field` : !form.title.trim() ? `${idPrefix}-title` : `${idPrefix}-start-date`, label: "Campo, titolo e orari sono obbligatori" }],
    };
  }
  if (new Date(start).getTime() >= new Date(end).getTime()) {
    return { booking: null, errors: [{ id: `${idPrefix}-end-time`, label: "L'orario di fine deve essere successivo all'inizio" }] };
  }

  const amountText = String(form.amount || "").trim().replace(",", ".");
  const amount = amountText ? Number(amountText) : undefined;
  if (amount !== undefined && !Number.isFinite(amount)) {
    return { booking: null, errors: [{ id: `${idPrefix}-amount`, label: "Importo non valido" }] };
  }

  /*
    In modifica si conservano i campi che il modulo non mostra — chi ha
    chiesto la prenotazione (`bookedByType`, atleta, genitore) e quando —
    cosi la conferma della segreteria non cancella la firma della famiglia.
  */
  const existing = bookings.find((item) => item.id === form.id);
  const booking: StructureBooking = {
    id: form.id || uid("booking"),
    structureId: structure.id,
    fieldId: field.id,
    fieldName: field.name,
    title: form.title.trim(),
    start,
    end,
    status: form.status,
    bookedByType: existing?.bookedByType || "club",
    bookedById: existing?.bookedById,
    bookedByName: form.bookedByName,
    athleteId: existing?.athleteId,
    athleteName: existing?.athleteName,
    parentId: existing?.parentId,
    amount,
    paymentStatus: form.paymentStatus,
    notes: form.notes,
    createdAt: existing?.createdAt || new Date().toISOString(),
  };

  if (hasBookingConflict(bookings, booking)) {
    return { booking: null, errors: [{ id: `${idPrefix}-start-time`, label: "Slot gia occupato per questo campo" }] };
  }

  return { booking, errors: [] };
};

/* ── Calendario mensile ──────────────────────────────────────────────────── */

export const WEEKDAY_SHORT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export const addMonths = (date: Date, amount: number) => new Date(date.getFullYear(), date.getMonth() + amount, 1);

export const monthLabel = (date: Date) => date.toLocaleDateString("it-IT", { month: "long", year: "numeric" });

/** Sei settimane da lunedi, come la V1. */
export const getCalendarDays = (monthDate: Date) => {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const firstMondayOffset = (firstDay.getDay() + 6) % 7;
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstMondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
};

export const bookingDateKey = (booking: Pick<StructureBooking, "start">) => {
  const date = new Date(booking.start);
  return Number.isNaN(date.getTime()) ? "" : localDateKey(date);
};

export const bookingTimeLabel = (booking: Pick<StructureBooking, "start" | "end">) => {
  const format = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "--:--" : date.toTimeString().slice(0, 5);
  };
  return `${format(booking.start)}–${format(booking.end)}`;
};

export const sortBookings = (bookings: readonly StructureBooking[]) =>
  [...bookings].sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime());
