export type PaymentStatus = "Pagato" | "In attesa" | "Scaduto";

export type StructurePayment = {
  id: string;
  date: string;
  description: string;
  type: "Quota" | "Iscrizione" | "Abbigliamento" | "Trasferta" | "Altro";
  amount: number;
  status: PaymentStatus;
};

export type FieldPricing = {
  id: string;
  durationMinutes: number;
  price: number;
};

export type AvailabilitySlot = { start: string; end: string };

export type FieldAvailabilityV2 = Record<string, AvailabilitySlot[]>;

export type FieldOwnership = "Pubblica" | "Privata";

export type StructureField = {
  id: string;
  name: string;
  ownership: FieldOwnership;
  inRent: boolean;
  isBookable: boolean;
  isVisible: boolean;
  availability: FieldAvailabilityV2;
  pricing: FieldPricing[];
};

export type StructureBookingStatus = "pending" | "confirmed" | "cancelled";

export type StructureBooking = {
  id: string;
  structureId: string;
  fieldId?: string;
  fieldName?: string;
  title: string;
  start: string;
  end: string;
  status: StructureBookingStatus;
  bookedByType?: "club" | "athlete" | "parent" | "staff" | "trainer" | "external";
  bookedById?: string;
  bookedByName?: string;
  athleteId?: string;
  athleteName?: string;
  parentId?: string;
  amount?: number;
  paymentStatus?: "unpaid" | "paid" | "partial";
  notes?: string;
  createdAt: string;
};

export type StructureRent = {
  enabled?: boolean;
  amount?: number;
  frequency?: string;
  dueDay?: number;
  contractStart?: string;
  contractEnd?: string;
  notes?: string;
};

export type ClubStructure = {
  id: string;
  name: string;
  address: string;
  /**
   * Sede a cui l'impianto appartiene (ADR-0038). Vuota su un club mono-sede e
   * su tutte le strutture create prima delle sedi: in quel caso la struttura
   * resta visibile con qualunque filtro sede.
   */
  siteId: string;
  isPublic: boolean;
  isVisibleToMembers: boolean;
  /**
   * **La struttura si puo prenotare dall'area famiglia.**
   *
   * W6-54. Fino alla Wave 6 questo interruttore non esisteva, e la
   * prenotabilita di una struttura era la somma di tre valori che nascono
   * tutti a `true`: `isVisibleToMembers`, e per ogni campo `isVisible` e
   * `isBookable`. Una struttura creata senza toccare niente era quindi
   * prenotabile, e un club che voleva il contrario poteva solo nasconderla.
   *
   * Chi cercava l'interruttore trovava «Affittabile», che significa un'altra
   * cosa — il contratto d'affitto della struttura, con importo, cadenza e
   * giorno di scadenza — e che infatti nessuna riga del percorso famiglia
   * legge. Da qui la segnalazione: «la struttura non e prenotabile e il
   * genitore vede lo stesso il modulo».
   *
   * Il ripiego e `true` perche e il comportamento che i club hanno oggi: chi
   * non ha mai avuto un interruttore non puo aver espresso una scelta.
   */
  isBookableByMembers: boolean;
  /** Il contratto d'affitto della struttura. **Non** e la prenotabilita. */
  isRentable: boolean;
  payments: StructurePayment[];
  fields: StructureField[];
  city?: string;
  type?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  notes?: string;
  rent?: StructureRent;
  bookings?: StructureBooking[];
};

export const WEEK_DAYS: { key: string; label: string }[] = [
  { key: "Lun", label: "Lunedi" },
  { key: "Mar", label: "Martedi" },
  { key: "Mer", label: "Mercoledi" },
  { key: "Gio", label: "Giovedi" },
  { key: "Ven", label: "Venerdi" },
  { key: "Sab", label: "Sabato" },
  { key: "Dom", label: "Domenica" },
];

export function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function formatDate(dateString?: string) {
  if (!dateString) return "-";
  try {
    const [y, m, d] = dateString.split("-").map((value) => parseInt(value, 10));
    if (!y || !m || !d) return dateString;
    return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
  } catch {
    return dateString;
  }
}

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }

  return "";
};

export function normalizeAvailability(input: any): FieldAvailabilityV2 {
  if (!input) {
    return WEEK_DAYS.reduce((acc, day) => {
      acc[day.key] = [];
      return acc;
    }, {} as FieldAvailabilityV2);
  }

  if (typeof input === "object" && !Array.isArray(input) && !input.days) {
    const out: FieldAvailabilityV2 = {};
    for (const day of WEEK_DAYS) {
      const raw = input[day.key];
      out[day.key] = Array.isArray(raw)
        ? raw
            .map((slot: any) => ({
              start: String(slot?.start || "").slice(0, 5),
              end: String(slot?.end || "").slice(0, 5),
            }))
            .filter((slot: AvailabilitySlot) => slot.start && slot.end)
        : [];
    }
    return out;
  }

  const days: string[] = Array.isArray(input.days) ? input.days : [];
  const startTime = String(input.startTime || "18:00").slice(0, 5);
  const endTime = String(input.endTime || "22:00").slice(0, 5);
  const out = normalizeAvailability(null);

  days.forEach((day) => {
    if (out[day]) out[day] = [{ start: startTime, end: endTime }];
  });

  return out;
}

export function normalizeField(raw: any): StructureField {
  return {
    id: raw?.id || uid("field"),
    name: firstText(raw?.name) || "Campo",
    ownership: raw?.ownership === "Privata" ? "Privata" : "Pubblica",
    inRent: typeof raw?.inRent === "boolean" ? raw.inRent : false,
    isBookable: typeof raw?.isBookable === "boolean" ? raw.isBookable : true,
    isVisible: typeof raw?.isVisible === "boolean" ? raw.isVisible : true,
    availability: normalizeAvailability(raw?.availability),
    pricing: Array.isArray(raw?.pricing)
      ? raw.pricing.map((price: any) => ({
          id: price?.id || uid("price"),
          durationMinutes: Number(price?.durationMinutes ?? 60),
          price: Number(price?.price ?? 0),
        }))
      : [],
  };
}

export function normalizePayment(raw: any): StructurePayment {
  return {
    id: raw?.id || uid("payment"),
    date: raw?.date || new Date().toISOString().split("T")[0],
    description: firstText(raw?.description),
    type:
      raw?.type === "Iscrizione" ||
      raw?.type === "Abbigliamento" ||
      raw?.type === "Trasferta" ||
      raw?.type === "Altro"
        ? raw.type
        : "Quota",
    amount: Number(raw?.amount ?? 0),
    status:
      raw?.status === "In attesa" || raw?.status === "Scaduto"
        ? raw.status
        : "Pagato",
  };
}

export function normalizeBooking(raw: any, structureId: string): StructureBooking {
  const status = ["confirmed", "cancelled"].includes(String(raw?.status))
    ? raw.status
    : "pending";

  return {
    id: raw?.id || uid("booking"),
    structureId: raw?.structureId || structureId,
    fieldId: firstText(raw?.fieldId),
    fieldName: firstText(raw?.fieldName),
    title: firstText(raw?.title) || "Prenotazione",
    start: firstText(raw?.start),
    end: firstText(raw?.end),
    status,
    bookedByType: raw?.bookedByType || "club",
    bookedById: firstText(raw?.bookedById),
    bookedByName: firstText(raw?.bookedByName),
    athleteId: firstText(raw?.athleteId),
    athleteName: firstText(raw?.athleteName),
    parentId: firstText(raw?.parentId),
    amount: raw?.amount === undefined || raw?.amount === "" ? undefined : Number(raw.amount),
    paymentStatus: ["paid", "partial"].includes(String(raw?.paymentStatus))
      ? raw.paymentStatus
      : "unpaid",
    notes: firstText(raw?.notes),
    createdAt: firstText(raw?.createdAt) || new Date().toISOString(),
  };
}

export function normalizeStructure(raw: any): ClubStructure {
  const structureId = raw?.id || uid("structure");
  const rent = raw?.rent && typeof raw.rent === "object" ? raw.rent : {};

  return {
    id: structureId,
    name: firstText(raw?.name),
    address: firstText(raw?.address),
    siteId: firstText(raw?.siteId, raw?.site_id),
    city: firstText(raw?.city),
    type: firstText(raw?.type),
    contactName: firstText(raw?.contactName),
    contactPhone: firstText(raw?.contactPhone),
    contactEmail: firstText(raw?.contactEmail),
    notes: firstText(raw?.notes),
    isPublic: typeof raw?.isPublic === "boolean" ? raw.isPublic : true,
    isVisibleToMembers:
      typeof raw?.isVisibleToMembers === "boolean" ? raw.isVisibleToMembers : true,
    isBookableByMembers:
      typeof raw?.isBookableByMembers === "boolean"
        ? raw.isBookableByMembers
        : true,
    isRentable: typeof raw?.isRentable === "boolean" ? raw.isRentable : false,
    rent: {
      enabled:
        typeof rent.enabled === "boolean"
          ? rent.enabled
          : typeof raw?.isRentable === "boolean"
            ? raw.isRentable
            : false,
      amount: Number(rent.amount ?? 0),
      frequency: firstText(rent.frequency) || "mensile",
      dueDay: Number(rent.dueDay ?? 1),
      contractStart: firstText(rent.contractStart),
      contractEnd: firstText(rent.contractEnd),
      notes: firstText(rent.notes),
    },
    payments: Array.isArray(raw?.payments) ? raw.payments.map(normalizePayment) : [],
    fields: Array.isArray(raw?.fields) ? raw.fields.map(normalizeField) : [],
    bookings: Array.isArray(raw?.bookings)
      ? raw.bookings.map((booking: any) => normalizeBooking(booking, structureId))
      : [],
  };
}

export function findStructureById(structures: ClubStructure[], id: string) {
  return structures.find((structure) => String(structure.id) === String(id));
}

export function hasBookingConflict(
  bookings: StructureBooking[],
  candidateBooking: StructureBooking,
) {
  const candidateFieldId = String(candidateBooking.fieldId || "");
  const candidateStart = new Date(candidateBooking.start).getTime();
  const candidateEnd = new Date(candidateBooking.end).getTime();

  if (!candidateFieldId || !candidateStart || !candidateEnd || candidateStart >= candidateEnd) {
    return false;
  }

  return (bookings || []).some((booking) => {
    if (booking.id === candidateBooking.id) return false;
    if (booking.status === "cancelled") return false;
    if (!["pending", "confirmed"].includes(booking.status)) return false;
    if (String(booking.fieldId || "") !== candidateFieldId) return false;

    const start = new Date(booking.start).getTime();
    const end = new Date(booking.end).getTime();
    if (!start || !end || start >= end) return false;

    return candidateStart < end && candidateEnd > start;
  });
}

export function getVisibleBookableStructures(structures: ClubStructure[]) {
  return (structures || [])
    .map(normalizeStructure)
    /*
      W6-54. Due domande diverse, due filtri: `isVisibleToMembers` decide se la
      famiglia **vede** la struttura, `isBookableByMembers` se la puo
      **prenotare**. Prima esisteva solo la prima, e un club che voleva
      mostrare un impianto senza aprirlo alle prenotazioni non aveva modo di
      dirlo.
    */
    .filter((structure) => structure.isVisibleToMembers === true)
    .filter((structure) => structure.isBookableByMembers === true)
    .map((structure) => ({
      ...structure,
      fields: structure.fields
        .filter(
          (field) => field.isVisible === true && field.isBookable === true,
        )
        /*
          W6-55. Una tariffa a zero non e una tariffa gratuita: e una tariffa
          che il club non ha ancora scritto. Ogni campo nuovo ne nasceva con
          due, e la famiglia leggeva «60 min - € 0,00», che sembra una
          promessa. Qui — sul solo percorso famiglia, perche al club le sue
          righe restano modificabili — le righe senza importo si tolgono, e la
          schermata dice «Tariffe non pubblicate».
        */
        .map((field) => ({
          ...field,
          pricing: field.pricing.filter(
            (price) => Number.isFinite(price.price) && price.price > 0,
          ),
        })),
    }))
    .filter((structure) => structure.fields.length > 0);
}

