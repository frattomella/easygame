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

import { isWithinFieldAvailability as isWithinStructureFieldAvailability } from "@/lib/structures-utils";

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
/**
 * **La fine di un evento, anche quando scavalca la mezzanotte.**
 *
 * Vive qui e non dentro `toEventColumns` perche la stessa domanda la fanno
 * il conflitto di struttura e il calcolo della durata: due risposte
 * diverse sarebbero due eventi diversi a seconda di chi guarda.
 */
const UN_GIORNO_MS = 24 * 60 * 60 * 1000;

/**
 * **Quanto puo durare un evento che scavalca la mezzanotte.**
 *
 * Serve un limite, e sceglierlo e la parte che conta. Senza, ogni ora di fine
 * che precede quella d'inizio diventerebbe «la notte dopo»: `18:00 → 17:00`,
 * che e un refuso di chi compila, si trasformerebbe in una sessione di
 * ventitre ore — e la sovrapposizione di struttura la vedrebbe occupare il
 * campo per un giorno intero.
 *
 * Sei ore separano i due casi con margine da entrambi i lati: un allenamento
 * o una gara che finisce dopo mezzanotte finisce entro le quattro del mattino,
 * e un refuso di orario produce quasi sempre una durata molto piu lunga.
 *
 * Oltre il limite si resta a `null`, che e cio che il prodotto faceva prima e
 * che nessuno ha mai segnalato come un problema: e il verso giusto in cui
 * sbagliare, perche una durata inventata sporca il conflitto di struttura e la
 * misura dei contributi.
 */
const MASSIMA_SCAVALCATA_MS = 6 * 60 * 60 * 1000;

export const resolveEndsAt = (
  startsAt: Date | null | undefined,
  endsAt: Date | null | undefined,
): Date | null => {
  if (!startsAt || !endsAt) return null;
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return null;
  }

  if (endsAt > startsAt) return endsAt;

  const scavalcata = new Date(endsAt.getTime() + UN_GIORNO_MS);
  const durata = scavalcata.getTime() - startsAt.getTime();

  return durata > 0 && durata <= MASSIMA_SCAVALCATA_MS ? scavalcata : null;
};

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
/** Le due ore di un intervallo scritto come una sola stringa: `"19:30 - 21:00"`. */
const TIME_RANGE = /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/;

/**
 * **La seconda ora di un intervallo, quando non c'e un campo di fine
 * separato** (bug UAT "creazione nuova gara fallisce": il campo «Palazzetto»
 * rifiutava una gara 19:30-21:00 interamente dentro il proprio orario
 * 13:00-23:00).
 *
 * `AddTrainingForm` manda `time`/`endTime` come due input separati, e
 * `toEventColumns` li legge entrambi correttamente. `AddMatchForm` invece
 * ha un solo campo libero — l'utente digita `"19:30 - 21:00"` in una sola
 * casella — e senza questa lettura la fine non arrivava **mai**: `endsAt`
 * restava a `00:00` (nessun match nel campo mancante), e `resolveEndsAt`
 * la trattava come una sessione che scavalca la notte, allungando la
 * durata reale fino a mezzanotte. Un campo aperto fino alle 23:00 rifiutava
 * quindi qualunque gara la cui fine "indovinata" (mezzanotte) superasse
 * quell'orario — anche quando l'orario vero, scritto proprio li nello
 * stesso campo, ci stava benissimo.
 *
 * Non e un parser specifico delle gare: vive nel modello condiviso apposta,
 * cosi qualunque chiamante che scriva l'intervallo in una stringa sola
 * (invece di due campi) ottiene la stessa interpretazione — un solo posto
 * che sa leggere "inizio - fine", non uno per tipo di evento.
 */
const secondTimeFromRange = (value: unknown): string => {
  const match = TIME_RANGE.exec(asText(value));
  return match ? match[2] : "";
};

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
  /** Tutte le categorie, la primaria per prima. Mai `null`: al piu vuoto. */
  category_ids: string[];
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

/**
 * Le categorie di un evento: la primaria davanti, le altre dietro, senza
 * ripetizioni.
 *
 * La primaria si mette per prima **anche quando l'elenco la contiene gia**,
 * perche l'ordine e cio che distingue «la categoria dell'evento» dalle altre in
 * ogni schermata che ne stampa una sola.
 */
const mergeCategoryIds = (
  primaria: string,
  altre: readonly string[] | null,
): string[] => {
  const viste = new Set<string>();
  const risultato: string[] = [];
  for (const valore of [primaria, ...(altre ?? [])]) {
    const pulito = asText(valore);
    if (!pulito || viste.has(pulito)) continue;
    viste.add(pulito);
    risultato.push(pulito);
  }
  return risultato;
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
    firstText(
      source.endTime,
      source.end_time,
      source.endsAt,
      source.ends_at,
      secondTimeFromRange(source.time),
      secondTimeFromRange(source.startTime),
      secondTimeFromRange(source.start_time),
    ),
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
    /*
      **La primaria per prima, e poi le altre** (PP-01 §A).

      Prima l'evento dichiarava una categoria e le altre restavano dentro
      `payload`, dove nessuna query poteva vederle. Qui si raccolgono tutte le
      grafie che i moduli usano — `categories`, `categoryIds`, `category_ids` —
      e si mette davanti la primaria, che e l'unica che i lettori storici
      leggono.
    */
    category_ids: mergeCategoryIds(
      firstText(source.categoryId, source.category_id),
      toIdList(source.categories) ??
        toIdList(source.categoryIds) ??
        toIdList(source.category_ids),
    ),
    group_ids:
      toIdList(source.groupIds) ??
      toIdList(source.group_ids) ??
      toIdList(source.groups),
    starts_at: startsAt,
    /*
      **Un evento che finisce dopo mezzanotte finisce il giorno dopo.**

      La riga diceva `endsAt > startsAt ? endsAt : null`, e su un 22:00 →
      00:30 l’ora di fine cade **prima** di quella d’inizio nello stesso
      giorno: la fine si buttava via, e l’evento diventava di un’ora. Da li
      il conflitto di struttura non vedeva le due ore e mezza vere, e la
      durata usata per i contributi era sbagliata per difetto.

      Una fine che precede l’inizio di meno di un giorno e la stessa
      notte: si sposta avanti di ventiquattr’ore. Una che lo precede di
      piu e un dato sbagliato, e resta `null` — indovinare li vorrebbe
      dire inventare una durata.
    */
    ends_at: resolveEndsAt(startsAt, endsAt),
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
    /*
      L'archivio del dato di partenza — **meno le istruzioni della richiesta**.
      `allowOverlap` dice «ho visto l'avviso e confermo», ed e una cosa che
      qualcuno ha fatto una volta: conservarla dentro l'evento la farebbe
      riapparire come se fosse una proprieta dell'allenamento, e la modifica
      successiva la rispedirebbe da sola.
    */
    payload: (({ allowOverlap: _confermato, ...resto }) => resto)(source),
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
  category_ids?: readonly string[] | null;
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
    /*
      La forma storica porta `categories`, ed e da li che le schermate leggono
      le categorie di un allenamento. Prima arrivava dal `payload` — cioe
      sopravviveva solo finche nessuno riscriveva quella colonna; adesso viene
      dalla colonna, che e la fonte.
    */
    categories: Array.isArray(row.category_ids) ? row.category_ids : [],
    categoryIds: Array.isArray(row.category_ids) ? row.category_ids : [],
    category_ids: Array.isArray(row.category_ids) ? row.category_ids : [],
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

/* --------------------------------- cosa si puo ancora cambiare, e quando -- */

/**
 * **Un evento concluso si modifica, ma non tutto** (PP-01 §B).
 *
 * Fin qui c'erano due meta-verita. Il client nascondeva «Modifica» a un evento
 * concluso — quindi la segreteria non poteva correggere un titolo sbagliato — e
 * il server non aveva **nessuna** guardia: chi passava dall'API cambiava data,
 * campo, categorie e capienza di un evento su cui le presenze erano gia state
 * registrate, e nessuno se ne accorgeva.
 *
 * La linea non passa fra «concluso» e «in programma»: passa fra cio che ha
 * lasciato una traccia e cio che non ne ha lasciata — la stessa distinzione con
 * cui ADR-0098 decide che un evento con storia **si annulla e non si cancella**.
 *
 * ## Cosa si puo sempre cambiare
 *
 * Titolo, note, allenatori. Sono descrizioni: correggerle non cambia il
 * significato di una presenza gia registrata.
 *
 * ## Cosa si congela quando l'evento ha una storia
 *
 * Istante, durata, luogo, categorie, gruppi, capienza e regole di risposta.
 * Ognuno di questi cambia **il significato delle righe gia scritte**:
 *
 * - spostare la data ridata ogni presenza — e le presenze alimentano la
 *   rendicontazione dei contributi pubblici (`attendance-measure`);
 * - cambiare categoria o gruppo sposta l'appello sulla squadra sbagliata;
 * - abbassare la capienza sotto il numero dei convocati la rende una regola che
 *   i dati gia violano;
 * - riaprire l'RSVP su un evento passato chiede una promessa su una cosa
 *   avvenuta.
 *
 * «Avere una storia» significa: almeno una riga di partecipazione — convocato,
 * presente o risposta della famiglia. Un evento concluso **senza** nessuna riga
 * non ha niente da proteggere, e resta modificabile per intero: e il caso
 * dell'allenamento che nessuno ha segnato.
 */
export const CAMPI_SEMPRE_MODIFICABILI = [
  "title",
  "notes",
  "trainer_ids",
] as const;

const CAMPI_CONGELATI_DA_UNA_STORIA = [
  ["starts_at", "l'istante"],
  ["ends_at", "la fine"],
  ["site_id", "la sede"],
  ["structure_id", "la struttura"],
  ["field_id", "il campo"],
  ["category_id", "la categoria"],
  ["category_ids", "le categorie"],
  ["group_ids", "i gruppi"],
  ["capacity", "la capienza"],
  ["rsvp_required", "la richiesta di conferma"],
  ["rsvp_deadline", "il termine per confermare"],
] as const;

const stessoValore = (a: unknown, b: unknown) => {
  if (a instanceof Date || b instanceof Date) {
    const x = a instanceof Date ? a.getTime() : a ? new Date(a as any).getTime() : null;
    const y = b instanceof Date ? b.getTime() : b ? new Date(b as any).getTime() : null;
    return x === y;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    const x = Array.isArray(a) ? a.map((v) => asText(v)) : [];
    const y = Array.isArray(b) ? b.map((v) => asText(v)) : [];
    return x.length === y.length && x.every((v, i) => v === y[i]);
  }
  if (a === null || a === undefined) return b === null || b === undefined;
  return a === b;
};

/**
 * I campi congelati che la modifica sta cambiando davvero.
 *
 * Torna un elenco di **etichette**, non di nomi di colonna: il messaggio che ne
 * esce lo legge una persona.
 */
export const campiCongelatiToccati = (
  esistente: Record<string, any>,
  prossimo: Record<string, any>,
) =>
  CAMPI_CONGELATI_DA_UNA_STORIA.filter(
    ([campo]) => !stessoValore(esistente?.[campo], prossimo?.[campo]),
  ).map(([, etichetta]) => etichetta);

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
  /*
    **«Tutta la struttura» occupa anche i suoi campi** (D-AUD-12).

    Il luogo era un token concatenato confrontato per uguaglianza, quindi
    `s1||site1` — la struttura intera — e `s1|f1|site1` — un suo campo —
    erano posti diversi. Prenotare la palestra dalle 18 alle 20 e poi il
    campo 1 di quella palestra dalle 19 alle 21 non produceva nessun
    avviso, ed e il caso ordinario del torneo interno.

    Il confronto e ora su due assi: **il posto** (struttura o sede) deve
    coincidere, e i **campi** collidono quando sono lo stesso oppure
    quando uno dei due non e dichiarato — perche «nessun campo» vuol dire
    tutta la struttura, non «un campo che non e nessuno degli altri».
  */
  const posto = (event: EventOverlapCandidate) =>
    [asToken(event.structure_id), asToken(event.site_id)].join("|");

  const postoCandidato = posto(candidate);
  if (postoCandidato === "|" && !asToken(candidate.field_id)) return [];

  const campoCandidato = asToken(candidate.field_id);

  const stessoPosto = (other: EventOverlapCandidate) => {
    if (posto(other) !== postoCandidato) return false;

    const campoAltro = asToken(other.field_id);
    if (!campoCandidato || !campoAltro) return true;
    return campoAltro === campoCandidato;
  };

  const inizio = instantOf(candidate.starts_at);
  const fine = instantOf(candidate.ends_at) || inizio + 60 * 60 * 1000;
  if (Number.isNaN(inizio)) return [];

  return others.filter((other) => {
    if (other.id && candidate.id && other.id === candidate.id) return false;
    if (normalizeEventStatus(other.status) === "cancelled") return false;
    if (!stessoPosto(other)) return false;

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

/**
 * **Il campo e aperto a quell'ora?** (W5-11)
 *
 * Le strutture dichiarano gia la disponibilita per giorno della settimana
 * (`normalizeAvailability` in `structures-utils.ts`), e nessuno la leggeva mai
 * al momento di creare un allenamento: si poteva fissare un allenamento delle
 * 23:00 su un campo che chiude alle 20:00, e a scoprirlo era chi ci andava.
 *
 * **Un campo che non dichiara nessuna fascia non e un campo chiuso**: e un
 * campo su cui il club non ha detto niente, e restringere a zero un dato
 * assente e il modo piu rapido per rendere inutilizzabile una funzione nuova.
 *
 * Le chiavi dei giorni sono quelle di `WEEK_DAYS` — `Lun`…`Dom` — e restano
 * dove sono: questo modulo le riceve, non le conosce.
 */
const CHIAVI_GIORNO = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

export const weekdayKeyOf = (value: Date | string) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return CHIAVI_GIORNO[date.getUTCDay()] || "";
};

const minutiDi = (orario: string) => {
  const match = TIME_ONLY.exec(asText(orario));
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

/**
 * **La disponibilita di un campo ha un proprietario, e non e questo file** —
 * ma questo file e `club_events`, e `club_events` non ha un fuso orario.
 *
 * Ne esistevano due implementazioni, sullo stesso dato, con risposte
 * opposte: questa leggeva l'istante in **UTC** (`toISOString`, `getUTCDay`),
 * quella di `structures-utils.ts` — che l'area famiglia usa **direttamente**,
 * mai passando da qui (vedi `parent-dashboard-pages.tsx` e
 * `app/api/parent-dashboard/[athleteId]/structures/route.ts`) — in
 * `Europe/Rome`. La correzione di allora ha fatto delegare questa funzione a
 * quella, per avere una risposta sola invece di due implementazioni
 * divergenti — ma ha anche ereditato il suo fuso di default, ed e li che
 * l'unificazione si e fermata a meta.
 *
 * **Il fuso giusto non e una proprieta della funzione, e una proprieta di
 * come il chiamante ha costruito il suo istante.** L'area famiglia passa un
 * vero UTC (`instantFromLocalTime` lo calcola apposta, perche il dispositivo
 * di una famiglia puo stare altrove rispetto al campo): per quello,
 * `Europe/Rome` e la conversione corretta, ed e infatti quella che usa
 * chiamando `structures-utils.ts` **senza passare da qui**.
 *
 * `club_events` invece non converte mai niente: `toEventInstant`, qualche
 * riga sopra in questo stesso file, scrive `starts_at`/`ends_at` con
 * `setUTCHours(ora, minuti, 0, 0)` — le cifre digitate diventano
 * letteralmente le cifre UTC in colonna — e `toEventDay`/`toEventTime` le
 * rileggono cosi per mostrarle ovunque nell'app. Convertire quello stesso
 * istante in `Europe/Rome` qui applica un fuso vero a un valore che non lo
 * ha mai avuto: un allenamento digitato 19:30-21:30 (dentro un campo aperto
 * 13:00-23:00, per chi lo amministra) diventava, riletto in `Europe/Rome` a
 * settembre (UTC+2), le 21:30-23:30 — fuori da quella stessa fascia. E la
 * causa reale, verificata sui dati dello staging del pilota Fortitudo
 * Scauri, dietro la segnalazione "il campo «Palazzetto» non e disponibile in
 * quel giorno e a quell'ora" su una fascia interamente dentro l'orario di
 * apertura.
 *
 * Questa funzione ha oggi **un solo chiamante** (`src/lib/server/events.ts`,
 * verificato: l'area famiglia non passa piu da qui), quindi la risposta
 * giusta non e un parametro in piu da propagare ovunque: e allineare qui,
 * una volta sola, alla convenzione che `club_events` gia usa per tutto il
 * resto — le cifre UTC lette cosi come sono, senza nessuna conversione.
 */
export const isWithinFieldAvailability = (
  availability: unknown,
  startsAt: Date | string,
  endsAt?: Date | string | null,
) => {
  const inizio = startsAt instanceof Date ? startsAt : new Date(startsAt);
  if (Number.isNaN(inizio.getTime())) return true;

  const fine = endsAt
    ? endsAt instanceof Date
      ? endsAt
      : new Date(endsAt)
    : inizio;

  return isWithinStructureFieldAvailability(
    { availability } as never,
    inizio,
    Number.isNaN(fine.getTime()) ? inizio : fine,
    "UTC",
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

/**
 * **Lo stato di una presenza ha un vocabolario, come la convocazione**
 * (PP-03 §7).
 *
 * Non ce l'aveva. `saveEventAttendance` scriveva
 * `asText(entry.status).toLowerCase() || "pending"`, cioe **qualunque testo**
 * il client mandasse — mentre la convocazione, tre metodi piu sopra, passava
 * gia da `normalizeConvocationStatus`. Due campi gemelli sulla stessa riga,
 * uno con un vocabolario e uno senza.
 *
 * Le due conseguenze, misurate da una revisione ostile:
 *
 * - `isPresentAttendance` (`funding/attendance-measure.ts`) conta `present` e
 *   `presente`. Un appello scritto in una **terza** grafia si salvava senza un
 *   errore e **non contava** per la rendicontazione dei contributi pubblici:
 *   il club dichiarava all'ente meno ore di quelle fatte, e nessuno lo
 *   segnalava.
 * - la colonna finisce in schermate ed export, e accettava un payload
 *   arbitrario e senza lunghezza massima.
 *
 * Le grafie riconosciute sono quelle che il prodotto ha davvero scritto in
 * dieci anni di schermate italiane e inglesi. Cio che non e riconosciuto
 * **non si indovina**: torna `null`, e chi scrive rifiuta. Un valore
 * silenziosamente riscritto sarebbe un appello che dice una cosa diversa da
 * quella che l'allenatore ha segnato.
 */
export const ATTENDANCE_STATUSES = ["present", "absent", "pending"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const normalizeAttendanceStatus = (
  value: unknown,
): AttendanceStatus | null => {
  const token = asToken(value);
  if (!token) return "pending";
  if (["present", "presente", "presenti", "p", "yes", "true", "1"].includes(token)) {
    return "present";
  }
  if (
    ["absent", "assente", "assenti", "a", "no", "false", "0"].includes(token)
  ) {
    return "absent";
  }
  if (["pending", "attesa", "in_attesa", "unknown"].includes(token)) {
    return "pending";
  }
  return null;
};

/* ------------------------- i tre campi dell'RSVP, dal form alle colonne --- */

/**
 * **La forma che il form dell'evento maneggia**, e la sua traduzione.
 *
 * Sta qui e non accanto al componente perche e dominio puro, e perche un test
 * non puo importare un `.tsx`: il runner del repository esegue i sorgenti con
 * lo stripping dei tipi, che non conosce JSX. La regola generale e la stessa
 * che vale per ogni altro dominio — la logica in un modulo, la schermata sopra.
 */
export type EventRsvpValue = {
  rsvpRequired: boolean;
  rsvpDeadline: string;
  capacity: string;
};

export const EMPTY_EVENT_RSVP: EventRsvpValue = {
  rsvpRequired: false,
  rsvpDeadline: "",
  capacity: "",
};

/**
 * **La scadenza senza la richiesta di conferma non viene scritta.**
 *
 * Un evento che non chiede conferma con una scadenza dichiarata e uno stato in
 * cui nessuno sa cosa succede al passaggio della data.
 */
export const toEventRsvpPayload = (value: EventRsvpValue) => ({
  rsvpRequired: Boolean(value.rsvpRequired),
  rsvpDeadline:
    value.rsvpRequired && value.rsvpDeadline
      ? new Date(value.rsvpDeadline).toISOString()
      : null,
  capacity: value.capacity ? Number(value.capacity) : null,
});

export const fromEventRsvpPayload = (event: any): EventRsvpValue => {
  const deadline = event?.rsvpDeadline || event?.rsvp_deadline || "";
  return {
    rsvpRequired: Boolean(event?.rsvpRequired ?? event?.rsvp_required ?? false),
    /* `datetime-local` vuole `YYYY-MM-DDTHH:MM`, senza fuso e senza secondi. */
    rsvpDeadline: deadline ? String(deadline).slice(0, 16) : "",
    capacity:
      event?.capacity === null || event?.capacity === undefined
        ? ""
        : String(event.capacity),
  };
};

/**
 * **Un evento annullato, in tutte le grafie che l'archivio porta.**
 *
 * ---
 *
 * ## Perche vive qui
 *
 * Viveva in `funding/attendance-measure.ts`, che e il modulo che produce un
 * numero verso un ente pubblico — e per questo era **l'unico** posto in cui la
 * domanda era fatta bene. Chi contava presenze e convocazioni per i report di
 * club non la faceva affatto: annullare cinque allenamenti su venti faceva
 * scendere il tasso di presenza di ogni atleta dal 100% al 75%, e gli
 * aggiungeva cinque «senza risposta» a eventi che non ci sono mai stati.
 *
 * Lo stato di un evento e del dominio degli eventi, e la domanda «e annullato?»
 * ha una risposta sola. Le grafie sono quattro (`cancelled`, `canceled`,
 * `annullato`, `annullata`), e confrontarle a mano in tre posti e il modo in
 * cui due di quei posti ne perdono una.
 *
 * ## Uno stato assente non e un annullamento
 *
 * Le anagrafiche storiche non portano `status`, e negarle tutte sarebbe il
 * verso opposto dello stesso errore: un club che perde vent'anni di
 * allenamenti dai propri report.
 */
export const isCancelledEvent = (event: unknown) => {
  const record = (event || {}) as Record<string, unknown>;
  const stato = record.status ?? record.state ?? record.stato;
  if (stato === undefined || stato === null || stato === "") return false;
  return normalizeEventStatus(stato) === "cancelled";
};
