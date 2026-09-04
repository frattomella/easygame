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
  const startTime = String(input.startTime || "").slice(0, 5);
  const endTime = String(input.endTime || "").slice(0, 5);
  const out = normalizeAvailability(null);

  /*
    **PP-02 §L. Gli orari non si inventano piu.**

    Qui c'erano due ripieghi — `"18:00"` e `"22:00"` — e finche nessuno
    confrontava la fascia con una richiesta erano innocui: servivano a
    disegnare qualcosa. Da quando `isWithinFieldAvailability` **vincola**, un
    campo con la sola forma storica `{ days: [...] }` e senza orari
    diventerebbe aperto solo dalle diciotto alle ventidue, e la famiglia
    leggerebbe un rifiuto che nomina orari che il club non ha mai scritto.

    E la stessa lezione di W6-D03: il silenzio non e una scelta, e riempirlo
    con un valore plausibile lo trasforma in una scelta che nessuno ha fatto.
    Senza orari la giornata resta **senza fasce**, cioe senza vincolo.
  */
  if (!startTime || !endTime) return out;

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


/* ==================================================================== */
/*  PP-02 §L — la fascia dichiarata vale anche sulla rotta              */
/* ==================================================================== */

/**
 * Il fuso in cui si leggono le fasce di disponibilita di un campo.
 *
 * Una fascia e scritta `18:00`-`22:00`: e un orario **locale**, non un istante.
 * La prenotazione arriva invece come istante assoluto, perche il browser
 * compone `new Date("2027-03-01T18:00")` e lo manda in ISO. Per confrontarle
 * serve dichiarare in che fuso «18:00» e le diciotto — ed e lo stesso fuso che
 * il dominio degli appuntamenti dichiara da sempre.
 */
export const DEFAULT_STRUCTURE_TIMEZONE = "Europe/Rome";

/** Il giorno della settimana come lo scrive `WEEK_DAYS`, e l'ora locale. */
const WEEKDAY_KEY_BY_EN: Record<string, string> = {
  Mon: "Lun",
  Tue: "Mar",
  Wed: "Mer",
  Thu: "Gio",
  Fri: "Ven",
  Sat: "Sab",
  Sun: "Dom",
};

export function describeInstantForAvailability(
  value: Date,
  timeZone: string = DEFAULT_STRUCTURE_TIMEZONE,
) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(value);

  const read = (type: string) =>
    parts.find((part) => part.type === type)?.value || "";

  return {
    dayKey: WEEKDAY_KEY_BY_EN[read("weekday")] || "",
    /*
      **La data, e non solo il nome del giorno.**

      Il confronto guardava `dayKey`, che si ripete ogni sette giorni: una
      prenotazione dal lunedi al lunedi **successivo** passava, perche i due
      «Lun» sono lo stesso nome. E con la finestra della mezzanotte passava
      anche il lunedi 18:00 → mercoledi 00:00, trenta ore, che la rotta non
      limita in nessun altro modo.
    */
    date: `${read("year")}-${read("month")}-${read("day")}`,
    minutes: Number(read("hour")) * 60 + Number(read("minute")),
  };
}

const toMinutes = (value: string) => {
  const [hours, minutes] = String(value || "")
    .split(":")
    .map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
};

/**
 * **La prenotazione sta dentro una fascia dichiarata?**
 *
 * PP-02 §L. Il divieto sulla prenotabilita esisteva gia sulla rotta (W6-54); la
 * **disponibilita** no: la schermata mostrava le fasce e il modulo lasciava
 * scegliere data e ora libere, con due `<input>`. Una famiglia poteva chiedere
 * il campo alle tre di notte, e il server accettava — poi qualcuno in segreteria
 * avrebbe dovuto rifiutare a mano una richiesta che non doveva potersi fare.
 *
 * **Un campo che non dichiara nessuna fascia non e vincolato**, e non e una
 * dimenticanza: e la lezione di W6-D03. Chi non ha mai compilato quel riquadro
 * non ha espresso una scelta, e trasformare il silenzio in «chiuso sempre»
 * spegnerebbe le prenotazioni di ogni club che non lo ha configurato — cioe
 * romperebbe una funzione per farne rispettare una che nessuno ha impostato. La
 * conseguenza va detta ai club: finche le fasce non ci sono, l'orario non e
 * vincolato.
 *
 * **Una prenotazione che scavalca la mezzanotte e fuori**, perche una fascia
 * appartiene a un giorno e non ce n'e nessuna che possa contenerla.
 */
/**
 * Il giorno di calendario successivo a `YYYY-MM-DD`.
 *
 * Passa da `Date.UTC`, che non conosce fusi ne ora legale: qui non si sta
 * spostando un istante, si sta girando una pagina del calendario.
 */
const giornoSuccessivo = (data: string) => {
  const [anno, mese, giorno] = data.split("-").map(Number);
  if (!anno || !mese || !giorno) return "";

  const dopo = new Date(Date.UTC(anno, mese - 1, giorno + 1));
  return `${dopo.getUTCFullYear()}-${String(dopo.getUTCMonth() + 1).padStart(2, "0")}-${String(dopo.getUTCDate()).padStart(2, "0")}`;
};

export function isWithinFieldAvailability(
  field: Pick<StructureField, "availability">,
  start: Date,
  end: Date,
  timeZone: string = DEFAULT_STRUCTURE_TIMEZONE,
): boolean {
  const availability = normalizeAvailability(field?.availability);
  const fasce = Object.values(availability).flat();
  if (!fasce.length) return true;

  const inizio = describeInstantForAvailability(start, timeZone);
  const fine = describeInstantForAvailability(end, timeZone);

  if (!inizio.dayKey || !inizio.date) return false;

  /*
    **La mezzanotte chiude la giornata, non ne apre un'altra — ma solo quella
    dopo.**

    Una prenotazione che finisce alle 00:00 non scavalca niente: e l'ultimo
    istante della sera, e il calendario la scrive gia sul giorno seguente. La
    prima stesura di questa finestra chiedeva soltanto «un giorno diverso, e
    mezzanotte», e su quel «diverso» passavano trenta ore: lunedi 18:00 →
    mercoledi 00:00. Adesso il giorno seguente e **calcolato**, non dedotto dal
    nome.

    E si calcola **sul calendario**, non aggiungendo ventiquattro ore
    all'istante: nella notte in cui l'orologio va avanti quelle ventiquattro
    ore scavalcano il giorno seguente e atterrano su quello dopo ancora, e una
    prenotazione 23:00 → 00:00 dentro una fascia dichiarata veniva rifiutata.
    Un giorno l'anno, e nessuno avrebbe saputo dire perche.
  */
  const dataSeguente = giornoSuccessivo(inizio.date);

  const stessoGiorno = fine.date === inizio.date;
  const mezzanotteSeguente = fine.date === dataSeguente && fine.minutes === 0;

  if (!stessoGiorno && !mezzanotteSeguente) return false;
  const fineMinuti = mezzanotteSeguente ? 24 * 60 : fine.minutes;

  return (availability[inizio.dayKey] || []).some((slot) => {
    const da = toMinutes(slot.start);
    const a = toMinutes(slot.end);
    if (da === null || a === null) return false;
    /*
      Una fascia che finisce a `00:00` chiude a mezzanotte — tranne quando
      **comincia** a mezzanotte: `00:00`-`00:00` e come si scrive una fascia
      lasciata a zero, e leggerla «aperto tutto il giorno» aprirebbe il campo
      alle tre di notte a chi non ha configurato niente.
    */
    const fineFascia = a === 0 && da > 0 ? 24 * 60 : a;
    if (fineFascia <= da) return false;
    return inizio.minutes >= da && fineMinuti <= fineFascia;
  });
}

/**
 * Le fasce di un campo, scritte come le legge una persona.
 *
 * Serve al messaggio di rifiuto: «fuori dagli orari» senza dire **quali** e un
 * rifiuto che non si puo correggere.
 */
export function describeFieldAvailability(
  field: Pick<StructureField, "availability">,
): string {
  const availability = normalizeAvailability(field?.availability);

  return WEEK_DAYS.map((day) => {
    const slots = availability[day.key] || [];
    if (!slots.length) return "";
    return `${day.key} ${slots.map((slot) => `${slot.start}-${slot.end}`).join(", ")}`;
  })
    .filter(Boolean)
    .join(" · ");
}

/**
 * **L'istante di un giorno e un'ora, letti nel fuso dichiarato.**
 *
 * PP-02 §L. Il modulo della famiglia componeva
 * `new Date("2027-03-01T18:00")`, che Node e il browser interpretano nel fuso
 * **del dispositivo**. La fascia si valida invece in `Europe/Rome`: per un
 * genitore all'estero — o semplicemente con il telefono su un altro fuso — le
 * due cose non erano lo stesso orario, e la schermata mostrava «Lun
 * 18:00-22:00» rifiutando poi le 21:30 che quella fascia contiene.
 *
 * Il verso opposto era peggio: le 17:30 di Londra passavano, e il club si
 * trovava in agenda le 18:30.
 *
 * Non serve una libreria: si prende l'istante come se fosse UTC, si guarda in
 * che ora lo rende il fuso di destinazione, e si corregge della differenza.
 *
 * **Le iterazioni sono due, e la seconda non e una cerimonia.** Misurato: con
 * una sola, il 28 marzo 2027 alle 01:30 a Roma tornava 00:30. La prima stima
 * cade oltre il salto dell'ora legale, prende l'offset **sbagliato** — quello
 * di dopo — e sbaglia di un'ora. La seconda passata ricalcola l'offset
 * sull'istante corretto e chiude, perche a quel punto i due stanno dallo stesso
 * lato della transizione.
 *
 * Resta un caso senza risposta giusta, e vale la pena dirlo: **l'ora che non
 * esiste** — le 02:30 del giorno in cui l'orologio salta da 02:00 a 03:00. Non
 * c'e nessun istante che la renda, e la funzione restituisce il primo istante
 * successivo, come qualunque libreria.
 *
 * **E lo fa scegliendo, non per fortuna.** La prima stesura lo dichiarava e
 * basta, e a Roma era vero perche l'iterazione capitava dalla parte giusta.
 * Misurato altrove non lo era: a New York le 02:30 del 14 marzo 2027 tornavano
 * **01:30**, e a Santiago le 00:30 del 5 settembre tornavano le 23:30 **del
 * giorno prima** — una prenotazione chiesta per un giorno finiva in agenda su
 * quello precedente. Quando la stima non si chiude, le candidate sono due, una
 * per ciascuno dei due offset a cavallo del salto: si prende la **piu tarda**,
 * che e l'istante subito dopo il buco in tutti e due i versi.
 */
export function instantFromLocalTime(
  day: string,
  time: string,
  timeZone: string = DEFAULT_STRUCTURE_TIMEZONE,
): Date | null {
  const giorno = String(day || "").trim().slice(0, 10);
  const ora = String(time || "").trim().slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(giorno) || !/^\d{2}:\d{2}$/.test(ora)) {
    return null;
  }

  const comeUtc = new Date(`${giorno}T${ora}:00.000Z`);
  if (Number.isNaN(comeUtc.getTime())) return null;

  const formato = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  /** Quanto il fuso sposta l'orologio, all'istante dato. */
  const scarto = (istante: Date) => {
    const parti = formato.formatToParts(istante);
    const leggi = (tipo: string) =>
      Number(parti.find((parte) => parte.type === tipo)?.value || "0");

    const reso = Date.UTC(
      leggi("year"),
      leggi("month") - 1,
      leggi("day"),
      leggi("hour") === 24 ? 0 : leggi("hour"),
      leggi("minute"),
    );

    return reso - istante.getTime();
  };

  const primaStima = new Date(comeUtc.getTime() - scarto(comeUtc));
  const secondaStima = new Date(comeUtc.getTime() - scarto(primaStima));

  /*
    Se la seconda stima rende l'ora chiesta, e quella: i due offset stanno dallo
    stesso lato della transizione e il conto ha chiuso.
  */
  if (scarto(secondaStima) === comeUtc.getTime() - secondaStima.getTime()) {
    return secondaStima;
  }

  /*
    Altrimenti l'ora **non esiste**, e le due stime sono le due candidate a
    cavallo del salto: la piu tarda e il primo istante dopo il buco. Senza
    questa riga il verso dipendeva dal segno dell'offset del fuso.
  */
  return new Date(Math.max(primaStima.getTime(), secondaStima.getTime()));
}
