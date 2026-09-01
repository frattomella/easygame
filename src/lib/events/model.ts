/**
 * **L'evento sportivo: il dominio puro.**
 *
 * Qui non c'e Prisma, non c'e rete, non c'e DOM. Ci sono gli stati, le
 * transizioni, la traduzione da e verso la forma JSON che il prodotto ha usato
 * fin qui, e i due controlli che una colonna JSON non poteva fare: la
 * sovrapposizione sul campo e la capienza.
 *
 * **Perche la traduzione vive qui.** Novantadue punti del codice leggono
 * ancora `clubs.trainings` e `clubs.matches` nella loro forma storica. Farli
 * migrare tutti insieme sarebbe un diff di migliaia di righe in cui nessun
 * errore sarebbe visibile. La riga e la verita; la forma storica e una
 * **proiezione** con **un solo scrittore**, e sparisce a scaglioni.
 *
 * La differenza rispetto a prima non e sottile: prima c'erano due scrittori
 * indipendenti sulla stessa collezione e l'ultimo vinceva in silenzio. Adesso
 * c'e una fonte, e una copia che qualcuno mantiene.
 */

export const EVENT_KINDS = ["training", "match"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const EVENT_STATUSES = [
  "scheduled",
  "cancelled",
  "completed",
  "archived",
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const CONVOCATION_STATUSES = ["convocated", "excluded"] as const;
export type ConvocationStatus = (typeof CONVOCATION_STATUSES)[number];

const asText = (value: unknown) => String(value ?? "").trim();

const asToken = (value: unknown) => asText(value).toLowerCase();

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = asText(value);
    if (text) return text;
  }
  return "";
};

export const normalizeEventKind = (value: unknown): EventKind =>
  asToken(value) === "match" ? "match" : "training";

/**
 * Le grafie con cui lo stato di un evento e stato scritto in dieci anni di
 * schermate italiane e inglesi. Nessuna si perde; tutte confluiscono in una
 * delle quattro.
 */
export const normalizeEventStatus = (value: unknown): EventStatus => {
  const token = asToken(value);
  if (["cancelled", "canceled", "annullato", "annullata"].includes(token)) {
    return "cancelled";
  }
  if (
    ["completed", "complete", "concluso", "conclusa", "concluded"].includes(
      token,
    )
  ) {
    return "completed";
  }
  if (["archived", "archiviato", "archiviata"].includes(token)) {
    return "archived";
  }
  return "scheduled";
};

/**
 * Chi puo diventare cosa.
 *
 * `archived` non e una destinazione: e lo stato che la migrazione assegna a un
 * evento ricostruito perche una presenza lo citava e la colonna JSON non lo
 * aveva piu. Da li non si torna indietro, perche non c'e un evento vero a cui
 * tornare.
 */
const TRANSITIONS: Record<EventStatus, readonly EventStatus[]> = {
  scheduled: ["cancelled", "completed"],
  cancelled: ["scheduled"],
  completed: ["scheduled"],
  archived: [],
};

export const canTransitionEvent = (from: unknown, to: unknown) => {
  const source = normalizeEventStatus(from);
  const target = normalizeEventStatus(to);
  if (source === target) return true;
  return TRANSITIONS[source].includes(target);
};

export const assertEventTransition = (from: unknown, to: unknown) => {
  if (!canTransitionEvent(from, to)) {
    throw new Error(
      `Transizione non ammessa: un evento ${normalizeEventStatus(from)} non diventa ${normalizeEventStatus(to)}`,
    );
  }
};

/* ------------------------------------------------- date e ore ------------ */

const DATE_ONLY = /^(\d{4}-\d{2}-\d{2})/;
const TIME_ONLY = /(\d{1,2}):(\d{2})/;

/**
 * Da «giorno» + «ora» a un **istante**.
 *
 * Prima erano due stringhe separate, interpretate nel fuso del server: un
 * allenamento delle 18:00 salvato da un browser e riletto da un processo
 * notturno poteva spostarsi di un'ora due volte l'anno. L'istante e uno; il
 * fuso e dichiarato accanto e serve a **mostrarlo**, non a ricostruirlo.
 */
export const toEventInstant = (
  date: unknown,
  time?: unknown,
): Date | null => {
  const rawDate = asText(date);
  if (!rawDate) return null;

  const dateMatch = DATE_ONLY.exec(rawDate);
  if (!dateMatch) return null;

  const timeMatch = TIME_ONLY.exec(asText(time));
  const hours = timeMatch ? Number(timeMatch[1]) : 0;
  const minutes = timeMatch ? Number(timeMatch[2]) : 0;

  if (hours > 23 || minutes > 59) return null;

  const instant = new Date(`${dateMatch[1]}T00:00:00.000Z`);
  if (Number.isNaN(instant.getTime())) return null;

  instant.setUTCHours(hours, minutes, 0, 0);
  return instant;
};

/** Il giorno di un istante, nella forma `YYYY-MM-DD`. */
export const toEventDay = (value: Date | string | null | undefined) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

/** L'ora di un istante, nella forma `HH:MM`. */
export const toEventTime = (value: Date | string | null | undefined) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(11, 16);
};

/* ------------------------------------- dalla forma storica alle colonne --- */

export type EventColumns = {
  kind: EventKind;
  legacy_id: string | null;
  title: string | null;
  status: EventStatus;
  season_id: string | null;
  site_id: string | null;
  structure_id: string | null;
  field_id: string | null;
  category_id: string | null;
  category_name: string | null;
  group_ids: string[] | null;
  starts_at: Date;
  ends_at: Date | null;
  location: string | null;
  opponent: string | null;
  home_away: string | null;
  capacity: number | null;
  rsvp_required: boolean;
  rsvp_deadline: Date | null;
  convocation_status: string | null;
  notes: string | null;
  trainer_ids: string[] | null;
  payload: Record<string, any>;
};

const toIdList = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null;
  const ids = value
    .map((entry) =>
      entry && typeof entry === "object"
        ? asText((entry as any).id ?? (entry as any).value)
        : asText(entry),
    )
    .filter(Boolean);
  return ids.length ? Array.from(new Set(ids)) : null;
};

const toPositiveInt = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
};

/**
 * Traduce un elemento della vecchia collezione JSON — o il corpo di una
 * richiesta scritta nella stessa forma — nelle colonne dell'evento.
 *
 * Se `date` non e leggibile la funzione **fallisce**: la migrazione poteva
 * permettersi di conservare un dato rotto rendendolo visibile, una scrittura
 * nuova no. Un evento senza un istante non e un evento.
 */
export const toEventColumns = (
  kind: EventKind,
  input: unknown,
  options: { requireDate?: boolean } = {},
): EventColumns => {
  const source = asRecord(input);
  const startsAt = toEventInstant(
    firstText(
      source.date,
      source.startsAt,
      source.starts_at,
      source.matchDate,
      source.match_date,
      source.scheduledAt,
      source.scheduled_at,
    ),
    firstText(source.time, source.startTime, source.start_time),
  );

  if (!startsAt) {
    if (options.requireDate === false) {
      throw new Error("Giorno dell'evento non valido");
    }
    throw new Error("Giorno e ora dell'evento sono obbligatori");
  }

  const endsAt = toEventInstant(
    firstText(
      source.date,
      source.startsAt,
      source.starts_at,
      source.matchDate,
      source.match_date,
    ),
    firstText(source.endTime, source.end_time, source.endsAt, source.ends_at),
  );

  const deadline = firstText(source.rsvpDeadline, source.rsvp_deadline);
  const parsedDeadline = deadline ? new Date(deadline) : null;

  return {
    kind,
    legacy_id: firstText(source.id) || null,
    title: firstText(source.title, source.name) || null,
    status: normalizeEventStatus(source.status),
    season_id: firstText(source.seasonId, source.season_id) || null,
    site_id: firstText(source.siteId, source.site_id) || null,
    structure_id: firstText(source.structureId, source.structure_id) || null,
    field_id: firstText(source.fieldId, source.field_id) || null,
    category_id: firstText(source.categoryId, source.category_id) || null,
    category_name:
      firstText(source.categoryName, source.category_name, source.category) ||
      null,
    group_ids:
      toIdList(source.groupIds) ??
      toIdList(source.group_ids) ??
      toIdList(source.groups),
    starts_at: startsAt,
    ends_at: endsAt && endsAt > startsAt ? endsAt : null,
    location: firstText(source.location, source.venue) || null,
    opponent: firstText(source.opponent, source.opponentName) || null,
    home_away: firstText(source.homeAway, source.home_away) || null,
    capacity: toPositiveInt(
      source.capacity ?? source.expectedAttendees ?? source.expected_attendees,
    ),
    rsvp_required: Boolean(source.rsvpRequired ?? source.rsvp_required ?? false),
    rsvp_deadline:
      parsedDeadline && !Number.isNaN(parsedDeadline.getTime())
        ? parsedDeadline
        : null,
    convocation_status:
      firstText(
        source.convocationsStatus,
        source.convocations_status,
        source.convocationStatus,
      ) || null,
    notes: firstText(source.notes, source.description) || null,
    trainer_ids:
      toIdList(source.trainers) ??
      toIdList(source.trainerIds) ??
      toIdList(source.trainer_ids) ??
      (firstText(source.trainerId, source.trainer_id)
        ? [firstText(source.trainerId, source.trainer_id)]
        : null),
    payload: source,
  };
};

/* ------------------------------------- dalle colonne alla forma storica --- */

export type EventRowLike = {
  id: string;
  organization_id: string;
  kind: string;
  legacy_id?: string | null;
  title?: string | null;
  status: string;
  season_id?: string | null;
  site_id?: string | null;
  structure_id?: string | null;
  field_id?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  group_ids?: unknown;
  starts_at: Date | string;
  ends_at?: Date | string | null;
  timezone?: string | null;
  location?: string | null;
  opponent?: string | null;
  home_away?: string | null;
  capacity?: number | null;
  rsvp_required?: boolean | null;
  rsvp_deadline?: Date | string | null;
  convocation_status?: string | null;
  notes?: string | null;
  trainer_ids?: unknown;
  payload?: unknown;
  version?: number | null;
  updated_at?: Date | string | null;
};

/**
 * La forma che il prodotto ha sempre letto, ricostruita **dalle colonne**.
 *
 * Il payload d'origine fa da base — cosi nessun campo che nessuno ha ancora
 * mappato si perde — e le colonne lo **sovrascrivono**, perche la riga e la
 * verita. L'identificativo resta quello storico finche esiste: novantadue
 * punti del codice lo confrontano con quello scritto altrove, e cambiarlo
 * sotto di loro sarebbe una migrazione silenziosa.
 */
export const toEventLegacyShape = (row: EventRowLike) => {
  const payload = asRecord(row.payload);
  const startsAt =
    row.starts_at instanceof Date ? row.starts_at : new Date(row.starts_at);

  return {
    ...payload,
    id: asText(row.legacy_id) || row.id,
    eventId: row.id,
    kind: normalizeEventKind(row.kind),
    date: toEventDay(startsAt),
    time: toEventTime(startsAt),
    start_time: toEventTime(startsAt),
    startTime: toEventTime(startsAt),
    end_time: row.ends_at ? toEventTime(row.ends_at) : payload.end_time ?? "",
    endTime: row.ends_at ? toEventTime(row.ends_at) : payload.endTime ?? "",
    startsAt: startsAt.toISOString(),
    endsAt: row.ends_at ? new Date(row.ends_at).toISOString() : null,
    timezone: row.timezone || "Europe/Rome",
    title: row.title ?? payload.title ?? "",
    status: row.status,
    seasonId: row.season_id ?? null,
    season_id: row.season_id ?? null,
    siteId: row.site_id ?? null,
    site_id: row.site_id ?? null,
    structureId: row.structure_id ?? null,
    structure_id: row.structure_id ?? null,
    fieldId: row.field_id ?? null,
    field_id: row.field_id ?? null,
    categoryId: row.category_id ?? null,
    category_id: row.category_id ?? null,
    category: row.category_name ?? payload.category ?? "",
    categoryName: row.category_name ?? null,
    category_name: row.category_name ?? null,
    groupIds: Array.isArray(row.group_ids) ? row.group_ids : [],
    location: row.location ?? "",
    opponent: row.opponent ?? "",
    homeAway: row.home_away ?? null,
    capacity: row.capacity ?? null,
    rsvpRequired: Boolean(row.rsvp_required),
    rsvp_required: Boolean(row.rsvp_required),
    rsvpDeadline: row.rsvp_deadline
      ? new Date(row.rsvp_deadline).toISOString()
      : null,
    convocationsStatus: row.convocation_status ?? null,
    notes: row.notes ?? payload.notes ?? "",
    trainers: Array.isArray(row.trainer_ids) ? row.trainer_ids : [],
    version: row.version ?? 1,
    updated_at:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : (row.updated_at ?? null),
  };
};

/* ------------------------------------------------- i due controlli nuovi -- */

export type EventOverlapCandidate = {
  id?: string;
  structure_id?: string | null;
  field_id?: string | null;
  site_id?: string | null;
  starts_at: Date | string;
  ends_at?: Date | string | null;
  status?: string;
};

const instantOf = (value: Date | string | null | undefined) =>
  value ? new Date(value).getTime() : Number.NaN;

/**
 * Due eventi non stanno sullo **stesso campo** alla stessa ora.
 *
 * Non e un vincolo del database perche «stesso campo» dipende da una
 * configurazione che i club scrivono in modi diversi — e un vincolo che
 * rifiutasse un salvataggio per un campo scritto in due grafie sarebbe peggio
 * del problema. E percio un controllo di dominio, con un elenco esplicito di
 * cio che conta come «stesso posto»: struttura, campo, sede.
 *
 * Un evento annullato non occupa niente.
 */
export const findEventOverlaps = (
  candidate: EventOverlapCandidate,
  others: readonly EventOverlapCandidate[],
) => {
  const luogo = (event: EventOverlapCandidate) =>
    [
      asToken(event.structure_id),
      asToken(event.field_id),
      asToken(event.site_id),
    ].join("|");

  const luogoCandidato = luogo(candidate);
  if (luogoCandidato === "||") return [];

  const inizio = instantOf(candidate.starts_at);
  const fine = instantOf(candidate.ends_at) || inizio + 60 * 60 * 1000;
  if (Number.isNaN(inizio)) return [];

  return others.filter((other) => {
    if (other.id && candidate.id && other.id === candidate.id) return false;
    if (normalizeEventStatus(other.status) === "cancelled") return false;
    if (luogo(other) !== luogoCandidato) return false;

    const altroInizio = instantOf(other.starts_at);
    if (Number.isNaN(altroInizio)) return false;
    const altraFine = instantOf(other.ends_at) || altroInizio + 60 * 60 * 1000;

    return inizio < altraFine && altroInizio < fine;
  });
};

/**
 * La capienza: il numero e il conteggio, **non la coda**.
 *
 * Una lista d'attesa ha regole di priorita che nessuno ha ancora dichiarato, e
 * inventarle qui vorrebbe dire deciderle di nascosto.
 */
export const isEventFull = (
  capacity: number | null | undefined,
  convocatedCount: number,
) => Boolean(capacity && capacity > 0 && convocatedCount >= capacity);

export const assertEventHasRoom = (
  capacity: number | null | undefined,
  convocatedCount: number,
  incoming: number,
) => {
  if (!capacity || capacity <= 0) return;
  if (convocatedCount + incoming <= capacity) return;

  throw new Error(
    `Capienza superata: l'evento ammette ${capacity} partecipanti e ne risulterebbero ${convocatedCount + incoming}`,
  );
};

export const normalizeConvocationStatus = (
  value: unknown,
): ConvocationStatus | null => {
  const token = asToken(value);
  if (["convocated", "convocato", "called", "yes", "true"].includes(token)) {
    return "convocated";
  }
  if (
    ["excluded", "escluso", "not_called", "no", "false"].includes(token)
  ) {
    return "excluded";
  }
  return null;
};
