import { normalizeOpeningHours } from "@/lib/opening-hours-utils";

/**
 * **L'appuntamento: il dominio puro.**
 *
 * Qui non c'e Prisma, non c'e rete, non c'e DOM. Ci sono tre cose che prima
 * non esistevano da nessuna parte:
 *
 * 1. la **macchina a stati** e chi puo muoverla. Prima nessun codice scriveva
 *    `confirmed` ne `rejected`: le etichette vivevano solo nel formatter
 *    generico, una richiesta restava in attesa per sempre e l'unica risposta
 *    possibile della segreteria era cancellarla (W5-47);
 * 2. la **disponibilita come dato**. Prima c'era il solo orario di apertura,
 *    uno per tutto il club: due famiglie potevano chiedere lo stesso orario e
 *    la segreteria inserirne un terzo sopra, senza che nessuno se ne
 *    accorgesse (W5-49). Quando un club non configura slot si ricade sugli
 *    orari di apertura — che e cio che il prodotto faceva fin qui, e che qui
 *    resta come **ripiego dichiarato**, non come unica strada;
 * 3. l'**istante assoluto**. Prima giorno e ora erano due stringhe separate,
 *    interpretate nel fuso del server: il giorno della settimana di una
 *    richiesta si calcolava in ora locale del processo, e un appuntamento
 *    delle 09:00 poteva cadere il giorno prima a seconda di dove girava il
 *    codice (W5-53). L'istante e uno; il fuso e dichiarato accanto e serve a
 *    **ricostruirlo** e a mostrarlo.
 *
 * Cio che questo modulo **non** decide: chi sei e su quale club stai
 * lavorando. Quello e il permesso e il confine, e stanno in
 * `src/lib/server/appointments.ts`.
 */

/* ======================================================== gli stati ====== */

export const APPOINTMENT_STATUSES = [
  "requested",
  "confirmed",
  "rejected",
  "rescheduled",
  "cancelled_by_family",
  "cancelled_by_club",
  "completed",
  "no_show",
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/**
 * Gli stati **vivi**, cioe quelli che occupano un posto.
 *
 * Sono esattamente i due su cui il database tiene l'indice unico parziale
 * `appointments_slot_vivo_unico`: la doppia prenotazione la impedisce lui, non
 * questo modulo. Qui servono per **non proporre** un orario gia preso — che e
 * una cortesia verso chi prenota, non un presidio.
 */
export const LIVE_APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  "requested",
  "confirmed",
];

/** I due lati che possono muovere uno stato. */
export type AppointmentSide = "club" | "family";

const asText = (value: unknown) => String(value ?? "").trim();

const asToken = (value: unknown) => asText(value).toLowerCase();

/**
 * Le grafie con cui lo stato di un appuntamento e stato scritto fin qui.
 *
 * `pending` era la sola grafia che la famiglia produceva, e la segreteria non
 * ne produceva nessuna: il suo inserimento non aveva **nessuno** stato. Un
 * valore assente diventa `requested`, che e il nome dello stato nella macchina
 * ed e cio che la migrazione ha gia scritto nelle righe travasate.
 *
 * `cancelled` senza autore diventa `cancelled_by_club`: e la sola
 * cancellazione che il prodotto sapeva fare, e la faceva la segreteria.
 * Indovinare un autore diverso sarebbe riscrivere la storia.
 */
export const normalizeAppointmentStatus = (value: unknown): AppointmentStatus => {
  const token = asToken(value);
  if (["confirmed", "confermato", "confermata"].includes(token)) {
    return "confirmed";
  }
  if (["rejected", "rifiutato", "rifiutata"].includes(token)) return "rejected";
  if (["rescheduled", "riprogrammato", "riprogrammata"].includes(token)) {
    return "rescheduled";
  }
  if (
    ["cancelled_by_family", "annullato_famiglia", "cancelled_by_parent"].includes(
      token,
    )
  ) {
    return "cancelled_by_family";
  }
  if (
    ["cancelled_by_club", "cancelled", "canceled", "annullato", "annullata"].includes(
      token,
    )
  ) {
    return "cancelled_by_club";
  }
  if (["completed", "completato", "completata", "concluso"].includes(token)) {
    return "completed";
  }
  if (["no_show", "no-show", "assente"].includes(token)) return "no_show";
  return "requested";
};

export const isLiveAppointmentStatus = (value: unknown) =>
  LIVE_APPOINTMENT_STATUSES.includes(normalizeAppointmentStatus(value));

/**
 * **Chi puo diventare cosa, e per mano di chi.**
 *
 * Le due domande sono una sola: dire «da `requested` si va a `confirmed`»
 * senza dire **chi** ce lo porta e cio che permetteva a una famiglia di
 * confermarsi da sola l'appuntamento che aveva appena chiesto.
 *
 * Le tre regole che le caselle vuote esprimono, e che sono la ragione della
 * tabella:
 *
 *   * un appuntamento **confermato non si rifiuta**: si annulla, e l'annullo
 *     dice chi lo ha deciso. Il rifiuto e la risposta a una richiesta, e a una
 *     richiesta gia accolta non si risponde due volte;
 *   * la famiglia riprogramma **solo finche e in richiesta**. Su un
 *     appuntamento gia confermato la famiglia annulla e ne chiede un altro:
 *     spostare un impegno che la segreteria ha gia messo in agenda non e una
 *     cosa che si fa senza dirlo;
 *   * `completed` e `no_show` sono la chiusura di un appuntamento **avvenuto o
 *     mancato**, e la constata chi era in segreteria. Da una richiesta mai
 *     confermata non si passa: non c'e nessun appuntamento a cui non essersi
 *     presentati.
 */
const TRANSIZIONI: Readonly<
  Record<
    AppointmentStatus,
    Readonly<Partial<Record<AppointmentStatus, readonly AppointmentSide[]>>>
  >
> = {
  requested: {
    confirmed: ["club"],
    rejected: ["club"],
    rescheduled: ["club", "family"],
    cancelled_by_family: ["family"],
    cancelled_by_club: ["club"],
  },
  confirmed: {
    rescheduled: ["club"],
    cancelled_by_family: ["family"],
    cancelled_by_club: ["club"],
    completed: ["club"],
    no_show: ["club"],
  },
  /*
    I sei stati terminali. Una riga chiusa non si riapre: la riprogrammazione
    **crea una riga nuova** e chiude la vecchia, cosi la storia resta leggibile
    invece di essere sovrascritta in luogo.
  */
  rejected: {},
  rescheduled: {},
  cancelled_by_family: {},
  cancelled_by_club: {},
  completed: {},
  no_show: {},
};

export const canTransitionAppointment = (
  from: unknown,
  to: unknown,
  side: AppointmentSide,
) => {
  const partenza = normalizeAppointmentStatus(from);
  const arrivo = normalizeAppointmentStatus(to);
  if (partenza === arrivo) return false;
  return Boolean(TRANSIZIONI[partenza][arrivo]?.includes(side));
};

export const assertAppointmentTransition = (
  from: unknown,
  to: unknown,
  side: AppointmentSide,
) => {
  if (!canTransitionAppointment(from, to, side)) {
    throw new Error(
      `Transizione non ammessa: un appuntamento ${normalizeAppointmentStatus(from)} non diventa ${normalizeAppointmentStatus(to)}${
        side === "family" ? " per mano della famiglia" : " dalla segreteria"
      }`,
    );
  }
};

/** Le mosse disponibili da uno stato, per disegnare i pulsanti giusti. */
export const listAppointmentTransitions = (
  from: unknown,
  side: AppointmentSide,
): AppointmentStatus[] => {
  const partenza = normalizeAppointmentStatus(from);
  return (Object.keys(TRANSIZIONI[partenza]) as AppointmentStatus[]).filter(
    (arrivo) => TRANSIZIONI[partenza][arrivo]?.includes(side),
  );
};

/* ================================================== l'istante ============ */

export const DEFAULT_APPOINTMENT_TIMEZONE = "Europe/Rome";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})/;
const TIME_ONLY = /^(\d{1,2}):(\d{2})/;

const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

const formatterFor = (timeZone: string) => {
  const zona = asText(timeZone) || DEFAULT_APPOINTMENT_TIMEZONE;
  const cached = FORMATTERS.get(zona);
  if (cached) return cached;

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zona,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    /*
      Un fuso che non esiste **non** ricade sul fuso del server: sarebbe
      esattamente il difetto che questo modulo chiude, con la differenza che
      nessuno se ne accorgerebbe piu perche il campo sembrerebbe dichiarato.
    */
    throw new Error(`Fuso orario non riconosciuto: ${zona}`);
  }

  FORMATTERS.set(zona, formatter);
  return formatter;
};

type CampiZonati = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const zonedFields = (instant: Date, timeZone: string): CampiZonati => {
  const parti = formatterFor(timeZone).formatToParts(instant);
  const valore = (type: string) =>
    Number(parti.find((parte) => parte.type === type)?.value || "0");

  /*
    A mezzanotte il formattatore americano scrive `24` invece di `00`: senza
    questa riga il giorno successivo comincerebbe alle 24:00 del precedente, e
    ogni slot di mezzanotte finirebbe nel giorno sbagliato.
  */
  const ora = valore("hour");

  return {
    year: valore("year"),
    month: valore("month"),
    day: valore("day"),
    hour: ora === 24 ? 0 : ora,
    minute: valore("minute"),
    second: valore("second"),
  };
};

/**
 * Lo scarto fra il fuso dichiarato e UTC, **in quell'istante**.
 *
 * Non e una costante del fuso: e ora legale per meta anno. Calcolarlo una
 * volta sola e riusarlo era il modo in cui gli appuntamenti si spostavano di
 * un'ora due volte l'anno.
 */
export const zonedOffsetMinutes = (instant: Date, timeZone: string) => {
  const campi = zonedFields(instant, timeZone);
  const comeSeUtc = Date.UTC(
    campi.year,
    campi.month - 1,
    campi.day,
    campi.hour,
    campi.minute,
    campi.second,
  );
  return Math.round((comeSeUtc - instant.getTime()) / 60000);
};

/**
 * Da «giorno» + «ora» **nel fuso dichiarato** a un istante assoluto.
 *
 * I due passaggi non sono uno di troppo: lo scarto si legge su un istante, e
 * l'istante e proprio cio che si sta cercando. Il primo passaggio ne trova uno
 * abbastanza vicino da avere lo scarto giusto, il secondo lo corregge. E la
 * sola forma che non sbaglia l'ora nelle due notti in cui l'orologio si sposta.
 */
export const toAppointmentInstant = (
  day: unknown,
  time: unknown,
  timeZone: string = DEFAULT_APPOINTMENT_TIMEZONE,
): Date | null => {
  const giorno = DATE_ONLY.exec(asText(day));
  if (!giorno) return null;

  const ora = TIME_ONLY.exec(asText(time) || "00:00");
  if (!ora) return null;

  const ore = Number(ora[1]);
  const minuti = Number(ora[2]);
  if (ore > 23 || minuti > 59) return null;

  const naive = Date.UTC(
    Number(giorno[1]),
    Number(giorno[2]) - 1,
    Number(giorno[3]),
    ore,
    minuti,
    0,
    0,
  );
  if (Number.isNaN(naive)) return null;

  const primo = new Date(naive - zonedOffsetMinutes(new Date(naive), timeZone) * 60000);
  const secondo = new Date(naive - zonedOffsetMinutes(primo, timeZone) * 60000);
  return secondo;
};

/** Il giorno di un istante nel fuso dichiarato, nella forma `YYYY-MM-DD`. */
export const toZonedDay = (
  instant: Date | string | null | undefined,
  timeZone: string = DEFAULT_APPOINTMENT_TIMEZONE,
) => {
  if (!instant) return "";
  const data = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(data.getTime())) return "";
  const campi = zonedFields(data, timeZone);
  return `${String(campi.year).padStart(4, "0")}-${String(campi.month).padStart(2, "0")}-${String(campi.day).padStart(2, "0")}`;
};

/** L'ora di un istante nel fuso dichiarato, nella forma `HH:MM`. */
export const toZonedTime = (
  instant: Date | string | null | undefined,
  timeZone: string = DEFAULT_APPOINTMENT_TIMEZONE,
) => {
  if (!instant) return "";
  const data = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(data.getTime())) return "";
  const campi = zonedFields(data, timeZone);
  return `${String(campi.hour).padStart(2, "0")}:${String(campi.minute).padStart(2, "0")}`;
};

/**
 * Il giorno della settimana **nel fuso dichiarato**, 0 = domenica.
 *
 * Prima si calcolava con `new Date(...).getDay()`, cioe in ora locale del
 * processo: su un server in UTC un appuntamento del lunedi alle 00:30 italiane
 * risultava di domenica, e la validazione contro gli orari di apertura
 * guardava il giorno sbagliato.
 */
export const toZonedWeekday = (
  instant: Date | string | null | undefined,
  timeZone: string = DEFAULT_APPOINTMENT_TIMEZONE,
) => {
  const giorno = toZonedDay(instant, timeZone);
  if (!giorno) return null;
  return new Date(`${giorno}T00:00:00.000Z`).getUTCDay();
};

const dayKeyToWeekday = (value: string) =>
  [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ].indexOf(value);

const timeToMinutes = (value: unknown) => {
  const match = TIME_ONLY.exec(asText(value));
  if (!match) return null;
  const ore = Number(match[1]);
  const minuti = Number(match[2]);
  if (ore > 23 || minuti > 59) return null;
  return ore * 60 + minuti;
};

const minutesToTime = (value: number) =>
  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;

/* ================================================= la disponibilita ====== */

export type AppointmentSlotRule = {
  id?: string | null;
  site_id?: string | null;
  assigned_to_user_id?: string | null;
  weekday?: number | null;
  specific_date?: Date | string | null;
  start_time: string;
  end_time: string;
  duration_minutes?: number | null;
  valid_from?: Date | string | null;
  valid_until?: Date | string | null;
  active?: boolean | null;
};

export type BusyAppointment = {
  id?: string | null;
  starts_at: Date | string;
  status?: unknown;
  assigned_to_user_id?: string | null;
  slot_id?: string | null;
};

/**
 * **W6-56: un posto e preso oppure e libero. Non c'e un terzo caso.**
 *
 * Qui c'erano `capacity`, `taken` e `remaining`, e i residui si calcolavano
 * come `capienza - presi`. Il conto era **inerte** con `capacity = 1` — il
 * default, e in produzione l'unico valore esistente, perche nessuna schermata
 * ne ha mai scritta un'altra — e **bugiardo** con valori maggiori: l'indice
 * unico parziale `appointments_slot_vivo_unico` sta su
 * `(club, operatore, inizio)` e non conosce la capienza, quindi con
 * `capacity: 2` questo modulo proponeva due prenotazioni sullo stesso istante
 * e la seconda, legittima, riceveva un `P2002` tradotto in «quell'orario e
 * appena stato preso» — che era falso, e detto a chi aveva appena visto il
 * posto libero.
 *
 * Rendere vera la capienza avrebbe voluto dire toccare **il presidio piu
 * delicato del dominio** (ADR-0101: la doppia prenotazione la impedisce il
 * database, non il codice) per abilitare una funzione che nessuna schermata sa
 * ancora chiedere. Si toglie: con `1` i due comportamenti coincidono, e la
 * rimozione non cambia nessun risultato osservabile.
 */
export type FreeAppointmentSlot = {
  slotId: string | null;
  /** `slot` quando la regola e configurata, `opening_hours` quando e il ripiego. */
  source: "slot" | "opening_hours";
  siteId: string | null;
  assignedToUserId: string | null;
  startsAt: Date;
  endsAt: Date;
  day: string;
  time: string;
  durationMinutes: number;
  /** Vero quando un appuntamento **vivo** occupa gia questo istante. */
  taken: boolean;
};

const DURATA_PREDEFINITA = 30;

/** Il numero di giorni che una singola interrogazione puo coprire. */
const FINESTRA_MASSIMA_GIORNI = 92;

const sameOperator = (left: unknown, right: unknown) =>
  asText(left) === asText(right);

/**
 * Gli orari di apertura come regole di disponibilita: **il ripiego**.
 *
 * Non e la stessa cosa di uno slot configurato, e la differenza si vede nel
 * campo `source`: un club che non ha dichiarato la propria agenda continua a
 * ricevere richieste dentro l'orario di segreteria — che e cio che il prodotto
 * faceva prima — ma chi legge sa che nessuno ha detto quanto dura un
 * colloquio ne quante persone si possono ricevere insieme.
 */
export const openingHoursToSlotRules = (
  openingHours: unknown,
  options: { durationMinutes?: number; siteId?: string | null } = {},
): AppointmentSlotRule[] => {
  const giorni = normalizeOpeningHours(openingHours);
  const durata = Number(options.durationMinutes) > 0
    ? Number(options.durationMinutes)
    : DURATA_PREDEFINITA;

  const regole: AppointmentSlotRule[] = [];

  for (const giorno of giorni) {
    if (giorno.closed || giorno.slots.length === 0) continue;

    /*
      La chiave `general` esiste quando gli orari sono una stringa sola, senza
      distinzione fra i giorni: vale per tutta la settimana, ed e la forma piu
      diffusa fra i club che non hanno mai aperto quella schermata.
    */
    const weekdays =
      giorno.key === "general"
        ? [0, 1, 2, 3, 4, 5, 6]
        : [dayKeyToWeekday(giorno.key)].filter((value) => value >= 0);

    for (const weekday of weekdays) {
      for (const fascia of giorno.slots) {
        regole.push({
          id: null,
          site_id: options.siteId ?? null,
          assigned_to_user_id: null,
          weekday,
          specific_date: null,
          start_time: fascia.start,
          end_time: fascia.end,
          duration_minutes: durata,
          active: true,
        });
      }
    }
  }

  return regole;
};

const regolaValeNelGiorno = (
  regola: AppointmentSlotRule,
  giorno: string,
  weekday: number,
) => {
  if (regola.specific_date) {
    const data = regola.specific_date;
    const testo =
      data instanceof Date ? data.toISOString().slice(0, 10) : asText(data).slice(0, 10);
    return testo === giorno;
  }
  return Number(regola.weekday) === weekday;
};

const dentroValidita = (regola: AppointmentSlotRule, giorno: string) => {
  const limite = (value: Date | string | null | undefined) => {
    if (!value) return "";
    return value instanceof Date
      ? value.toISOString().slice(0, 10)
      : asText(value).slice(0, 10);
  };
  const da = limite(regola.valid_from);
  const a = limite(regola.valid_until);
  if (da && giorno < da) return false;
  if (a && giorno > a) return false;
  return true;
};

/**
 * Gli slot liberi in un intervallo.
 *
 * Sottrae gli appuntamenti **vivi**: un rifiuto, una cancellazione o una
 * riprogrammazione liberano il posto senza che nessuno cancelli la riga, che e
 * la ragione per cui l'indice unico in base dati e parziale e non pieno.
 *
 * Quando nessuna regola e configurata per il perimetro chiesto, e solo allora,
 * si ricade sugli orari di apertura.
 */
export const computeFreeAppointmentSlots = (input: {
  rules?: readonly AppointmentSlotRule[];
  openingHours?: unknown;
  busy?: readonly BusyAppointment[];
  from: Date | string;
  to: Date | string;
  timeZone?: string;
  siteId?: string | null;
  assignedToUserId?: string | null;
  /** Gli slot gia passati non si propongono. */
  now?: Date | null;
  includeFull?: boolean;
}): FreeAppointmentSlot[] => {
  const timeZone = asText(input.timeZone) || DEFAULT_APPOINTMENT_TIMEZONE;
  const da = input.from instanceof Date ? input.from : new Date(input.from);
  const a = input.to instanceof Date ? input.to : new Date(input.to);
  if (Number.isNaN(da.getTime()) || Number.isNaN(a.getTime()) || a < da) {
    return [];
  }

  const sedeChiesta = asText(input.siteId);
  const operatoreChiesto = asText(input.assignedToUserId);

  const pertinente = (regola: AppointmentSlotRule) => {
    /*
      Una regola senza sede vale per tutte le sedi, e una senza operatore e di
      segreteria: filtrarle via quando si chiede una sede o un operatore
      preciso significherebbe non proporre mai gli slot del club che non ha
      ancora dichiarato le proprie sedi.
    */
    if (sedeChiesta && asText(regola.site_id) && asText(regola.site_id) !== sedeChiesta) {
      return false;
    }
    if (
      operatoreChiesto &&
      asText(regola.assigned_to_user_id) &&
      asText(regola.assigned_to_user_id) !== operatoreChiesto
    ) {
      return false;
    }
    return true;
  };

  const dichiarate = (input.rules || []).filter(pertinente);
  const attive = dichiarate.filter((regola) => regola.active !== false);
  const ripiego =
    attive.length === 0
      ? openingHoursToSlotRules(input.openingHours, { siteId: input.siteId ?? null })
      : [];
  const regole = attive.length ? attive : ripiego;
  if (!regole.length) return [];

  /*
    Le chiusure straordinarie: una riga con una data e `active = false`. Sono
    dichiarate come regole ma non producono slot — tolgono il giorno. Senza
    questo passaggio una chiusura per festivita sarebbe indistinguibile da una
    riga cancellata.
  */
  const chiusure = new Set(
    dichiarate
      .filter((regola) => regola.active === false && regola.specific_date)
      .map((regola) =>
        regola.specific_date instanceof Date
          ? regola.specific_date.toISOString().slice(0, 10)
          : asText(regola.specific_date).slice(0, 10),
      ),
  );

  const occupati = (input.busy || []).filter((riga) =>
    isLiveAppointmentStatus(riga.status ?? "requested"),
  );

  const liberi: FreeAppointmentSlot[] = [];
  const giornoIniziale = toZonedDay(da, timeZone);
  const giornoFinale = toZonedDay(a, timeZone);

  for (let indice = 0; indice < FINESTRA_MASSIMA_GIORNI; indice += 1) {
    const cursore = new Date(
      new Date(`${giornoIniziale}T12:00:00.000Z`).getTime() + indice * 86400000,
    );
    const giorno = cursore.toISOString().slice(0, 10);
    if (giorno > giornoFinale) break;
    if (chiusure.has(giorno)) continue;

    const weekday = new Date(`${giorno}T00:00:00.000Z`).getUTCDay();

    for (const regola of regole) {
      if (regola.active === false) continue;
      if (!dentroValidita(regola, giorno)) continue;
      if (!regolaValeNelGiorno(regola, giorno, weekday)) continue;

      const inizio = timeToMinutes(regola.start_time);
      const fine = timeToMinutes(regola.end_time);
      if (inizio === null || fine === null || fine <= inizio) continue;

      const durata =
        Number(regola.duration_minutes) > 0
          ? Number(regola.duration_minutes)
          : DURATA_PREDEFINITA;

      for (let minuto = inizio; minuto + durata <= fine; minuto += durata) {
        const startsAt = toAppointmentInstant(giorno, minutesToTime(minuto), timeZone);
        if (!startsAt) continue;
        if (startsAt < da || startsAt > a) continue;
        if (input.now && startsAt <= input.now) continue;

        /*
          `some` e non `filter(...).length`: la domanda che l'indice unico
          parziale sa rispondere e «c'e gia una riga viva su questo istante per
          questo operatore?», e quella e la sola domanda a cui questo calcolo
          deve dare la stessa risposta del database (W6-56).
        */
        const preso = occupati.some((riga) => {
          const quando =
            riga.starts_at instanceof Date ? riga.starts_at : new Date(riga.starts_at);
          if (Number.isNaN(quando.getTime())) return false;
          if (quando.getTime() !== startsAt.getTime()) return false;
          return sameOperator(riga.assigned_to_user_id, regola.assigned_to_user_id);
        });

        if (preso && !input.includeFull) continue;

        liberi.push({
          slotId: asText(regola.id) || null,
          source: ripiego.length ? "opening_hours" : "slot",
          siteId: asText(regola.site_id) || null,
          assignedToUserId: asText(regola.assigned_to_user_id) || null,
          startsAt,
          endsAt: new Date(startsAt.getTime() + durata * 60000),
          day: giorno,
          time: minutesToTime(minuto),
          durationMinutes: durata,
          taken: preso,
        });
      }
    }
  }

  return liberi.sort((sinistra, destra) => {
    const scarto = sinistra.startsAt.getTime() - destra.startsAt.getTime();
    if (scarto !== 0) return scarto;
    return asText(sinistra.slotId).localeCompare(asText(destra.slotId));
  });
};

/**
 * Vero se un istante cade su uno degli slot liberi calcolati.
 *
 * E la validazione della richiesta: la famiglia sceglie **uno slot libero**,
 * non una data qualunque. Prima la sola difesa era l'orario di apertura, e due
 * famiglie potevano chiedere la stessa mezz'ora.
 */
export const findFreeSlotAt = (
  liberi: readonly FreeAppointmentSlot[],
  startsAt: Date,
  options: { siteId?: string | null; assignedToUserId?: string | null } = {},
) =>
  liberi.find(
    (slot) =>
      slot.startsAt.getTime() === startsAt.getTime() &&
      (!asText(options.siteId) || sameOperator(slot.siteId, options.siteId)) &&
      (!asText(options.assignedToUserId) ||
        sameOperator(slot.assignedToUserId, options.assignedToUserId)),
  ) || null;

/**
 * **Il nome dell'azione che porta a uno stato, per il lato che la compie.**
 *
 * W6-51. Il dominio parla di **stati** — `confirmed`, `rejected` — e la rotta
 * parla di **azioni** — `confirm`, `reject`. Sono due vocabolari diversi, ed e
 * corretto che lo siano: la rotta accetta un'azione proprio perche il client
 * non debba scegliere lo stato di arrivo.
 *
 * Cio che non era corretto e che la traduzione non esistesse. La segreteria
 * riceveva gli stati da `listAppointmentTransitions` e li confrontava con i
 * nomi delle azioni: `"confirmed" !== "confirm"`, quindi i rami erano **sempre**
 * falsi e il dialogo mostrava solo «Chiudi». Il dominio sapeva confermare, il
 * database aveva la riga, la rotta rispondeva — e nessuno poteva premere il
 * pulsante, perche il pulsante non veniva disegnato.
 *
 * La traduzione vive qui, accanto alla macchina a stati, e non nelle
 * schermate: due schermate che la scrivessero per conto proprio tornerebbero a
 * poter divergere, che e esattamente com'e nato il difetto.
 */
const AZIONE_PER_ARRIVO: Readonly<Partial<Record<AppointmentStatus, string>>> = {
  confirmed: "confirm",
  rejected: "reject",
  rescheduled: "reschedule",
  cancelled_by_club: "cancel",
  cancelled_by_family: "cancel",
  completed: "complete",
  no_show: "no-show",
};

export const appointmentActionForStatus = (arrivo: unknown): string | null =>
  AZIONE_PER_ARRIVO[normalizeAppointmentStatus(arrivo)] ?? null;

/**
 * Le **azioni** disponibili da uno stato per un lato: e la forma che una
 * schermata puo confrontare con i propri pulsanti senza tradurre niente.
 */
export const listAppointmentActions = (
  from: unknown,
  side: AppointmentSide,
): string[] => {
  const azioni = listAppointmentTransitions(from, side)
    .map((arrivo) => AZIONE_PER_ARRIVO[arrivo])
    .filter((azione): azione is string => Boolean(azione));
  return [...new Set(azioni)];
};
