import {
  DEFAULT_APPOINTMENT_TIMEZONE,
  listAppointmentTransitions,
  normalizeAppointmentStatus,
  toZonedDay,
  toZonedTime,
  type AppointmentStatus,
} from "./model";

/**
 * **Le due facce di un appuntamento, e perche sono due.**
 *
 * `internal_notes` e il campo in cui la segreteria scrive cio che riguarda la
 * famiglia ma non si dice alla famiglia. Finche l'appuntamento era un elemento
 * di un array JSON, «non mostrarlo» era una decisione che prendeva la
 * schermata: bastava una seconda schermata — o la stessa risposta letta con
 * gli strumenti di sviluppo del browser — perche uscisse comunque.
 *
 * Qui la proiezione verso la famiglia **non ha** quel campo: non e nascosto,
 * non c'e. E la stessa forma con cui il prodotto tiene fuori `password_hash`
 * dalle risposte (CLAUDE.md §8), e vale per la stessa ragione.
 *
 * Modulo **puro**: nessun Prisma, nessuna rete, nessun DOM.
 */

type RigaAppuntamento = {
  id: string;
  organization_id: string;
  site_id?: string | null;
  season_id?: string | null;
  slot_id?: string | null;
  starts_at: Date;
  ends_at: Date;
  timezone?: string | null;
  status: string;
  athlete_id?: string | null;
  requested_by_user_id?: string | null;
  assigned_to_user_id?: string | null;
  reason: string;
  notes?: string | null;
  internal_notes?: string | null;
  decision_note?: string | null;
  decided_by?: string | null;
  decided_at?: Date | null;
  parent_appointment_id?: string | null;
  version?: number | null;
  created_at?: Date | null;
  updated_at?: Date | null;
};

const iso = (value: Date | null | undefined) =>
  value instanceof Date ? value.toISOString() : value ? String(value) : null;

/**
 * Le etichette italiane degli otto stati.
 *
 * Stavano nel formatter generico e coprivano tre stati su otto: una richiesta
 * rifiutata veniva mostrata con il nome tecnico della colonna, e una
 * riprogrammata non aveva nessun nome.
 */
export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  requested: "In attesa di risposta",
  confirmed: "Confermato",
  rejected: "Rifiutato",
  rescheduled: "Riprogrammato",
  cancelled_by_family: "Annullato dalla famiglia",
  cancelled_by_club: "Annullato dalla segreteria",
  completed: "Concluso",
  no_show: "Assente",
};

export const appointmentStatusLabel = (value: unknown) =>
  APPOINTMENT_STATUS_LABELS[normalizeAppointmentStatus(value)];

/** La faccia interna: tutto, comprese le note che restano in segreteria. */
export const toClubAppointment = (row: RigaAppuntamento) => {
  const timezone = row.timezone || DEFAULT_APPOINTMENT_TIMEZONE;
  const status = normalizeAppointmentStatus(row.status);

  return {
    id: row.id,
    organization_id: row.organization_id,
    site_id: row.site_id ?? null,
    season_id: row.season_id ?? null,
    slot_id: row.slot_id ?? null,
    starts_at: iso(row.starts_at),
    ends_at: iso(row.ends_at),
    timezone,
    date: toZonedDay(row.starts_at, timezone),
    time: toZonedTime(row.starts_at, timezone),
    status,
    status_label: APPOINTMENT_STATUS_LABELS[status],
    athlete_id: row.athlete_id ?? null,
    requested_by_user_id: row.requested_by_user_id ?? null,
    assigned_to_user_id: row.assigned_to_user_id ?? null,
    reason: row.reason,
    title: row.reason,
    notes: row.notes ?? "",
    internal_notes: row.internal_notes ?? "",
    decision_note: row.decision_note ?? "",
    decided_by: row.decided_by ?? null,
    decided_at: iso(row.decided_at ?? null),
    parent_appointment_id: row.parent_appointment_id ?? null,
    version: row.version ?? 1,
    created_at: iso(row.created_at ?? null),
    updated_at: iso(row.updated_at ?? null),
    transitions: listAppointmentTransitions(status, "club"),
  };
};

/**
 * La faccia della famiglia.
 *
 * Porta `date` e `time` perche le schermate dell'area genitore leggono ancora
 * quei due campi, e porta accanto l'istante: la forma storica sparisce quando
 * le schermate saranno passate, non prima. Porta soprattutto due cose che
 * prima non arrivavano mai: lo **stato vero** e il **motivo** di un rifiuto.
 */
export const toFamilyAppointment = (
  row: RigaAppuntamento,
  extra: { athleteName?: string | null; person?: string | null } = {},
) => {
  const timezone = row.timezone || DEFAULT_APPOINTMENT_TIMEZONE;
  const status = normalizeAppointmentStatus(row.status);
  const mosse = listAppointmentTransitions(status, "family");

  return {
    id: row.id,
    title: row.reason,
    reason: row.reason,
    starts_at: iso(row.starts_at),
    ends_at: iso(row.ends_at),
    timezone,
    date: toZonedDay(row.starts_at, timezone),
    time: toZonedTime(row.starts_at, timezone),
    status,
    status_label: APPOINTMENT_STATUS_LABELS[status],
    notes: row.notes ?? "",
    /*
      `decision_note` e il motivo del rifiuto, e alla famiglia **serve**: era
      la sola cosa che rendeva utile una risposta negativa, e non arrivava
      perche non c'era nessuna risposta negativa da nessuna parte.
    */
    decision_note: row.decision_note ?? "",
    person: extra.person ?? "",
    athlete_id: row.athlete_id ?? null,
    athlete_name: extra.athleteName ?? "",
    requested_by_user_id: row.requested_by_user_id ?? null,
    slot_id: row.slot_id ?? null,
    site_id: row.site_id ?? null,
    version: row.version ?? 1,
    can_reschedule: mosse.includes("rescheduled"),
    can_cancel: mosse.includes("cancelled_by_family"),
    created_at: iso(row.created_at ?? null),
    updated_at: iso(row.updated_at ?? null),
  };
};

export type ClubAppointmentView = ReturnType<typeof toClubAppointment>;
export type FamilyAppointmentView = ReturnType<typeof toFamilyAppointment>;
