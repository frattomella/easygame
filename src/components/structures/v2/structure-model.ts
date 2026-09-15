import { MONEY_STATUS, type StatusSpec } from "@/lib/web/status";
import { joinMeta } from "@/lib/web/format";
import { buildSiteIndex, type ClubSite } from "@/lib/club-sites";
import {
  normalizeAvailability,
  uid,
  WEEK_DAYS,
  type AvailabilitySlot,
  type ClubStructure,
  type PaymentStatus,
  type StructureBooking,
  type StructureBookingStatus,
  type StructureField,
} from "@/lib/structures-utils";

/**
 * Il modello puro delle pagine Strutture V2 (`/structures`,
 * `/structures/[id]`): etichette, stati, riepiloghi e la fabbrica del campo.
 * Niente React, niente `window`: testato dai test statici di parita.
 *
 * I dati restano quelli di `@/lib/structures-utils` (condiviso con eventi,
 * area famiglia e server: qui si legge soltanto).
 */

/* ── Aree della scheda ───────────────────────────────────────────────────── */
export type StructureArea = "struttura" | "campi" | "tariffe" | "prenotazioni";

export const STRUCTURE_AREAS: Array<{ value: StructureArea; label: string }> = [
  { value: "struttura", label: "Struttura" },
  { value: "campi", label: "Campi e disponibilità" },
  { value: "tariffe", label: "Tariffe e affitti" },
  { value: "prenotazioni", label: "Prenotazioni" },
];

/** `?tab=` della scheda; i nomi delle sei tab V1 restano link validi. */
export const resolveStructureArea = (value: string | null | undefined): StructureArea => {
  const key = String(value || "").trim().toLowerCase();
  if (key === "campi" || key === "fields") return "campi";
  if (key === "tariffe" || key === "pricing" || key === "rent" || key === "affitti") return "tariffe";
  if (key === "prenotazioni" || key === "bookings") return "prenotazioni";
  return "struttura";
};

/* ── Stati (una parola, sempre) ──────────────────────────────────────────── */
const spec = (label: string, weight: StatusSpec["weight"], hue: StatusSpec["hue"]): StatusSpec =>
  Object.freeze({ label, weight, hue });

/** Visibilita della struttura per atleti e genitori. */
export const STRUCTURE_VISIBILITY: Record<"visible" | "hidden", StatusSpec> = Object.freeze({
  visible: spec("VISIBILE AI TESSERATI", "solid", "green"),
  hidden: spec("NON VISIBILE", "quiet", "neutral"),
});

/** Prenotabilita dall'area famiglia (W6-54: un interruttore suo). */
export const STRUCTURE_BOOKABILITY: Record<"bookable" | "closed", StatusSpec> = Object.freeze({
  bookable: spec("PRENOTABILE", "outline", "blue"),
  closed: spec("NON PRENOTABILE", "quiet", "neutral"),
});

/** Lo stato di una prenotazione (`pending` · `confirmed` · `cancelled`). */
export const BOOKING_STATUS: Record<StructureBookingStatus, StatusSpec> = Object.freeze({
  pending: spec("IN ATTESA", "solid", "amber"),
  confirmed: spec("CONFERMATA", "solid", "green"),
  cancelled: spec("ANNULLATA", "quiet", "neutral"),
});

export const BOOKING_STATUS_OPTIONS: Array<{ value: StructureBookingStatus; label: string }> = [
  { value: "pending", label: "In attesa" },
  { value: "confirmed", label: "Confermata" },
  { value: "cancelled", label: "Annullata" },
];

export const bookingStatusSpec = (status: string | null | undefined): StatusSpec =>
  BOOKING_STATUS[(status as StructureBookingStatus) in BOOKING_STATUS ? (status as StructureBookingStatus) : "pending"];

/** Il pagamento di una prenotazione: denaro **in entrata**. */
export const BOOKING_PAYMENT_STATUS: Record<"unpaid" | "partial" | "paid", StatusSpec> = Object.freeze({
  unpaid: spec("NON PAGATO", "quiet", "neutral"),
  partial: MONEY_STATUS.partial,
  paid: MONEY_STATUS.paid,
});

export const BOOKING_PAYMENT_OPTIONS: Array<{ value: "unpaid" | "partial" | "paid"; label: string }> = [
  { value: "unpaid", label: "Non pagato" },
  { value: "partial", label: "Parziale" },
  { value: "paid", label: "Pagato" },
];

export const bookingPaymentSpec = (status: string | null | undefined): StatusSpec =>
  status === "paid" ? BOOKING_PAYMENT_STATUS.paid : status === "partial" ? BOOKING_PAYMENT_STATUS.partial : BOOKING_PAYMENT_STATUS.unpaid;

/**
 * Il pagamento d'affitto: denaro **in uscita**, quindi «PAGATO» e non
 * «INCASSATO» (`MONEY_STATUS.paid_out`). I valori restano quelli della V1
 * (`Pagato` · `In attesa` · `Scaduto`).
 */
export const rentPaymentSpec = (status: PaymentStatus | string | null | undefined): StatusSpec => {
  if (status === "Pagato") return MONEY_STATUS.paid_out;
  if (status === "Scaduto") return MONEY_STATUS.overdue;
  return MONEY_STATUS.pending;
};

export const RENT_PAYMENT_STATUS_OPTIONS: Array<{ value: PaymentStatus; label: string }> = [
  { value: "Pagato", label: "Pagato" },
  { value: "In attesa", label: "In attesa" },
  { value: "Scaduto", label: "Scaduto" },
];

export const FIELD_OWNERSHIP_OPTIONS = [
  { value: "Pubblica", label: "Pubblica" },
  { value: "Privata", label: "Privata" },
] as const;

/* ── Fabbriche ───────────────────────────────────────────────────────────── */

/**
 * Un campo nuovo. W6-55: **non** nasce con tariffe a zero — «€ 0,00» non
 * significa gratis, significa che nessuno ha ancora scritto un importo, e la
 * famiglia leggerebbe una promessa che il club non ha fatto.
 */
export const newField = (): StructureField => ({
  id: uid("field"),
  name: "Nuovo campo",
  ownership: "Pubblica",
  inRent: false,
  isBookable: true,
  isVisible: true,
  availability: normalizeAvailability({
    days: ["Lun", "Mer", "Ven"],
    startTime: "18:00",
    endTime: "22:00",
  }),
  pricing: [],
});

/** La fascia che «Aggiungi fascia» propone, come nella V1. */
export const newSlot = (): AvailabilitySlot => ({ start: "18:00", end: "22:00" });

/** La durata di una tariffa: 15–240 minuti, ripiego 60 (il contatore V1). */
export const clampDuration = (value: unknown, min = 15, max = 240) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 60;
  return Math.min(max, Math.max(min, parsed));
};

/* ── Etichette e riepiloghi ──────────────────────────────────────────────── */

export const structureDisplayName = (structure: Pick<ClubStructure, "name"> | null | undefined) =>
  String(structure?.name || "").trim() || "Struttura senza nome";

export const structureAddressLine = (structure: Pick<ClubStructure, "address" | "city"> | null | undefined) =>
  joinMeta(structure?.address, structure?.city) || "";

/** Il nome della sede di una struttura, se ne ha una e la sede esiste. */
export const structureSiteName = (structure: Pick<ClubStructure, "siteId">, sites: readonly ClubSite[]): string => {
  const siteId = String(structure.siteId || "").trim();
  if (!siteId) return "";
  const index = buildSiteIndex(sites);
  return index.has(siteId) ? index.getSiteName(siteId) : "";
};

/** `18:00–22:00` (trattino lungo, come le date del sistema). */
export const slotLabel = (slot: AvailabilitySlot) => `${slot.start}–${slot.end}`;

/**
 * Le fasce di un campo per giorno, scritte come le legge una persona:
 * `Lun 18:00–22:00 · Mer 18:00–22:00`. Vuoto quando il campo non dichiara
 * nessuna fascia (e allora l'orario **non e vincolato**, PP-02 §L).
 */
export const describeFieldSlots = (field: Pick<StructureField, "availability">): string =>
  WEEK_DAYS.map((day) => {
    const slots = field.availability?.[day.key] || [];
    if (!slots.length) return "";
    return `${day.key} ${slots.map(slotLabel).join(", ")}`;
  })
    .filter(Boolean)
    .join(" · ");

const toMinutes = (value: string) => {
  const [h, m] = String(value || "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
};

/**
 * Gli orari della struttura per la colonna dell'elenco: l'**unione** delle
 * fasce di tutti i suoi campi, giorno per giorno, con le fasce contigue fuse.
 * Una struttura senza campi o senza fasce rende una stringa vuota: e la
 * cella scrive «—», perche nessuno ha dichiarato niente.
 */
export const describeStructureHours = (structure: Pick<ClubStructure, "fields">): string =>
  WEEK_DAYS.map((day) => {
    const ranges: Array<{ da: number; a: number; slot: AvailabilitySlot }> = [];
    for (const field of structure.fields || []) {
      for (const slot of field.availability?.[day.key] || []) {
        const da = toMinutes(slot.start);
        const a = toMinutes(slot.end);
        if (da === null || a === null) continue;
        // Una fascia notturna (22:00–02:00) vale fino al giorno dopo.
        ranges.push({ da, a: a <= da && da > 0 ? a + 24 * 60 : a, slot });
      }
    }
    if (!ranges.length) return "";
    const merged = ranges
      .sort((x, y) => x.da - y.da)
      .reduce<Array<{ da: number; a: number }>>((list, range) => {
        const last = list[list.length - 1];
        if (last && range.da <= last.a) {
          last.a = Math.max(last.a, range.a);
          return list;
        }
        list.push({ da: range.da, a: range.a });
        return list;
      }, []);
    const write = (minutes: number) => {
      const m = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
      return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    };
    return `${day.key} ${merged.map((r) => `${write(r.da)}–${write(r.a)}`).join(", ")}`;
  })
    .filter(Boolean)
    .join(" · ");

/** «2 campi · 3 fasce» per la riga meta di un campo o di una struttura. */
export const countFieldSlots = (field: Pick<StructureField, "availability">) =>
  Object.values(field.availability || {}).reduce((total, slots) => total + (slots?.length || 0), 0);

export const pluralize = (count: number, singular: string, plural: string) =>
  `${count} ${count === 1 ? singular : plural}`;

/* ── Prenotazioni ────────────────────────────────────────────────────────── */

/**
 * Le prenotazioni della famiglia in attesa della segreteria: arrivano dalla
 * rotta `parent-dashboard/[athleteId]/structures` con `status: "pending"`.
 */
export const countPendingBookings = (structure: Pick<ClubStructure, "bookings">) =>
  (structure.bookings || []).filter((booking) => booking.status === "pending").length;

/** La prenotazione l'ha chiesta la famiglia, non la segreteria. */
export const isFamilyBooking = (booking: Pick<StructureBooking, "bookedByType">) =>
  booking.bookedByType === "athlete" || booking.bookedByType === "parent";

export const bookingWhoLabel = (booking: StructureBooking) =>
  booking.bookedByName || booking.athleteName || (booking.bookedByType === "club" ? "Segreteria" : "");

/**
 * I colori distinti per campo del calendario V1, sulle tonalita del sistema
 * (mai il rosso, che e uno stato). L'ordine e quello dei campi della struttura.
 */
export const FIELD_TONES = ["blue", "green", "amber", "orange", "navy", "neutral"] as const;

export const fieldTone = (fieldId: string, fieldIds: readonly string[]): (typeof FIELD_TONES)[number] => {
  const index = Math.max(0, fieldIds.indexOf(fieldId));
  return FIELD_TONES[index % FIELD_TONES.length];
};

/* ── Avvisi della scheda ─────────────────────────────────────────────────── */
export type StructureAlert = {
  id: "no-fields" | "pending-bookings" | "no-slots" | "overdue-rent";
  severity: "danger" | "warning";
  text: string;
  area: StructureArea;
};

export const computeStructureAlerts = (structure: ClubStructure | null | undefined): StructureAlert[] => {
  if (!structure) return [];
  const alerts: StructureAlert[] = [];
  const bookableFields = structure.fields.filter((field) => field.isVisible && field.isBookable);
  if (structure.isVisibleToMembers && structure.isBookableByMembers && !bookableFields.length) {
    alerts.push({
      id: "no-fields",
      severity: "warning",
      text: "Nessun campo visibile e prenotabile: la famiglia vede la struttura ma non può prenotare.",
      area: "campi",
    });
  }
  const pending = countPendingBookings(structure);
  if (pending) {
    alerts.push({
      id: "pending-bookings",
      severity: "warning",
      text: `${pluralize(pending, "prenotazione", "prenotazioni")} in attesa di conferma.`,
      area: "prenotazioni",
    });
  }
  const withoutSlots = bookableFields.filter((field) => countFieldSlots(field) === 0);
  if (withoutSlots.length) {
    alerts.push({
      id: "no-slots",
      severity: "warning",
      text: `${pluralize(withoutSlots.length, "campo prenotabile senza fasce orarie", "campi prenotabili senza fasce orarie")}: l'orario non è vincolato.`,
      area: "campi",
    });
  }
  const overdue = structure.payments.filter((payment) => payment.status === "Scaduto").length;
  if (overdue) {
    alerts.push({
      id: "overdue-rent",
      severity: "danger",
      text: `${pluralize(overdue, "pagamento d'affitto scaduto", "pagamenti d'affitto scaduti")}.`,
      area: "tariffe",
    });
  }
  return alerts;
};

/* ── Eventi che usano la struttura (per la conferma distruttiva) ─────────── */

/**
 * Conta gli allenamenti e le gare che indicano la struttura come luogo.
 * Legge le proiezioni storiche (`clubs.trainings`, `clubs.matches`), che
 * portano `structureId`/`structure_id`: e un conteggio per la conferma, non
 * un vincolo — la V1 li lasciava con un riferimento orfano senza dirlo.
 */
export const countEventsUsingStructure = (events: readonly unknown[], structureId: string) => {
  const wanted = String(structureId || "").trim();
  if (!wanted) return 0;
  return events.filter((event) => {
    const source = event && typeof event === "object" ? (event as Record<string, unknown>) : {};
    const reference = String(source.structureId || source.structure_id || "").trim();
    return reference === wanted;
  }).length;
};

/** `/structures/…?clubId=` come la V1 lo componeva, senza il parametro se manca. */
export const withClubId = (path: string, clubId?: string | null) =>
  clubId ? `${path}${path.includes("?") ? "&" : "?"}clubId=${encodeURIComponent(clubId)}` : path;
