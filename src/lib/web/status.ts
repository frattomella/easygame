/**
 * Il sistema di stato del Web V2 (guideline 09 §9.4).
 *
 * Otto livelli semantici, quattro pesi visivi, **una parola sempre presente**.
 * Un componente non riscrive mai un'etichetta: la prende da qui, cosi la stessa
 * situazione non ha mai due dizioni. Un valore che l'API non manda rende
 * `NON REGISTRATO`, mai una cella vuota.
 *
 * Modulo puro, testato in `tests/web/status.test.mjs`.
 */

export type StatusWeight = "quiet" | "outline" | "solid" | "urgent";
export type StatusHue = "neutral" | "green" | "amber" | "red" | "blue" | "orange";

export type StatusSpec = {
  /** L'etichetta italiana, gia in maiuscolo. */
  label: string;
  weight: StatusWeight;
  hue: StatusHue;
};

export const spec = (label: string, weight: StatusWeight, hue: StatusHue): StatusSpec =>
  Object.freeze({ label, weight, hue });

/** Lo stato «non lo so»: quieto, neutro, e dice che manca un dato. */
export const STATUS_UNKNOWN: StatusSpec = spec("NON REGISTRATO", "quiet", "neutral");

/* ── Persona (atleta, allenatore, staff, socio) ─────────────────────────── */
export const PERSON_STATUS = Object.freeze({
  active: spec("ATTIVO", "solid", "green"),
  suspended: spec("SOSPESO", "urgent", "red"),
  on_loan: spec("IN PRESTITO", "outline", "blue"),
  inactive: spec("DISATTIVATO", "quiet", "neutral"),
  archived: spec("ARCHIVIATO", "quiet", "neutral"),
  draft: spec("BOZZA", "quiet", "neutral"),
  on_leave: spec("IN CONGEDO", "outline", "amber"),
} as const);

/* ── Certificato / documento ────────────────────────────────────────────── */
export const CERTIFICATE_STATUS = Object.freeze({
  valid: spec("VALIDO", "solid", "green"),
  expiring: spec("IN SCADENZA", "outline", "amber"),
  expired: spec("SCADUTO", "urgent", "red"),
  missing: spec("MANCANTE", "urgent", "red"),
  pending_approval: spec("DA APPROVARE", "solid", "amber"),
  in_regola: spec("IN REGOLA", "solid", "green"),
  to_sign: spec("DA FIRMARE", "outline", "amber"),
} as const);

/* ── Fascicolo documentale della famiglia (W6-50, `lib/documents/family-dossier`) ── */
export const DOSSIER_STATUS = Object.freeze({
  missing: spec("DA CARICARE", "outline", "amber"),
  overdue: spec("SCADUTO", "urgent", "red"),
  under_review: spec("DA VERIFICARE", "outline", "blue"),
  approved: spec("APPROVATO", "solid", "green"),
  expired: spec("SCADUTO", "urgent", "red"),
  rejected: spec("DA INTEGRARE", "urgent", "red"),
} as const);

/* ── Appuntamento (ADR-0101: otto stati, sei terminali) ───────────────────── */
export const APPOINTMENT_STATUS = Object.freeze({
  requested: spec("RICHIESTO", "outline", "amber"),
  confirmed: spec("CONFERMATO", "solid", "blue"),
  completed: spec("CONCLUSO", "solid", "green"),
  rejected: spec("RIFIUTATO", "urgent", "red"),
  cancelled_by_family: spec("ANNULLATO DALLA FAMIGLIA", "urgent", "red"),
  cancelled_by_club: spec("ANNULLATO DAL CLUB", "urgent", "red"),
  no_show: spec("NON PRESENTATO", "urgent", "red"),
  rescheduled: spec("RIPROGRAMMATO", "quiet", "neutral"),
} as const);

/* ── Persona in prova (ADR-0188) ─────────────────────────────────────────── */
export const TRIAL_STATUS = Object.freeze({
  in_trial: spec("IN PROVA", "outline", "amber"),
  enrolled: spec("ISCRITTO", "solid", "green"),
  declined: spec("NON PROSEGUE", "quiet", "neutral"),
} as const);

/* ── Denaro ─────────────────────────────────────────────────────────────── */
export const MONEY_STATUS = Object.freeze({
  paid: spec("INCASSATO", "solid", "green"),
  partial: spec("PARZIALE", "solid", "amber"),
  pending: spec("IN ATTESA", "solid", "amber"),
  overdue: spec("SCADUTO", "urgent", "red"),
  cancelled: spec("ANNULLATO", "quiet", "neutral"),
  refunded: spec("RIMBORSATO", "quiet", "neutral"),
  reversed: spec("STORNATO", "quiet", "neutral"),
  settled: spec("SALDATA", "solid", "green"),
  /** Denaro **in uscita** gia pagato (compensi, rimborsi): «incassato» mentirebbe sul verso. */
  paid_out: spec("PAGATO", "solid", "green"),
} as const);

/* ── Attivita (allenamento, gara, appuntamento) ─────────────────────────── */
/**
 * Le prenotazioni di una struttura (`StructureBookingStatus`): richiesta,
 * confermata dal club, annullata. Non e un appuntamento e non e un incasso:
 * «confermata» qui e verde pieno, e non va cercata negli alias generici.
 */
export const BOOKING_STATUS = Object.freeze({
  pending: spec("IN ATTESA", "outline", "amber"),
  confirmed: spec("CONFERMATA", "solid", "green"),
  cancelled: spec("ANNULLATA", "quiet", "neutral"),
} as const);

export const ACTIVITY_STATUS = Object.freeze({
  completed: spec("COMPLETATO", "solid", "green"),
  in_progress: spec("IN CORSO", "solid", "blue"),
  scheduled: spec("PROGRAMMATO", "quiet", "neutral"),
  cancelled: spec("ANNULLATO", "quiet", "neutral"),
  not_recorded: spec("NON REGISTRATO", "quiet", "neutral"),
  recorded: spec("REGISTRATO", "solid", "green"),
  match: spec("GARA", "solid", "orange"),
  training: spec("ALLENAMENTO", "solid", "blue"),
} as const);

/* ── Iscrizione ─────────────────────────────────────────────────────────── */
export const ENROLMENT_STATUS = Object.freeze({
  active: spec("ATTIVA", "solid", "green"),
  incomplete: spec("INCOMPLETA", "solid", "amber"),
  to_fix: spec("DA SISTEMARE", "solid", "amber"),
  rejected: spec("RIFIUTATA", "urgent", "red"),
  closed: spec("CHIUSA", "quiet", "neutral"),
  suspended: spec("SOSPESA", "urgent", "red"),
} as const);

/* ── Pratica di iscrizione vista dalla famiglia (`lib/forms/enrollment-receipt`) ── */
export const ENROLMENT_REQUEST_STATUS = Object.freeze({
  sent: spec("INVIATA", "quiet", "neutral"),
  in_review: spec("IN LAVORAZIONE", "outline", "amber"),
  changes_requested: spec("INTEGRAZIONE RICHIESTA", "solid", "orange"),
  approved: spec("APPROVATA", "solid", "green"),
  rejected: spec("RESPINTA", "urgent", "red"),
  archived: spec("ARCHIVIATA", "quiet", "neutral"),
} as const);

/* ── Consenso (accettato, revocato, rifiutato, da decidere) ─────────────── */
export const CONSENT_STATUS = Object.freeze({
  accepted: spec("ACCETTATO", "solid", "green"),
  revoked: spec("REVOCATO", "quiet", "neutral"),
  rejected: spec("RIFIUTATO", "urgent", "red"),
  pending: spec("DA DECIDERE", "outline", "amber"),
} as const);

/* ── Lettura (bacheca, notifiche) ───────────────────────────────────────── */
export const READ_STATUS = Object.freeze({
  read: spec("LETTO", "quiet", "neutral"),
  unread: spec("DA LEGGERE", "solid", "blue"),
  rsvp_required: spec("CONFERMA RICHIESTA", "outline", "blue"),
} as const);

/* ── Libro soci (posizione associativa derivata dagli eventi) ───────────── */
/**
 * Le parole del libro soci (`src/lib/members/model.ts`, `MEMBER_STATUS_LABELS`).
 * Nessuna di quelle di persona o di iscrizione dice «dimesso», «decaduto»,
 * «escluso» o «non socio»: sono qualifiche del registro, non della scheda.
 * `admitted` e la stessa parola di `PERSON_STATUS.active`, apposta: essere
 * socio attivo e essere una persona attiva si pronunciano uguali.
 * `card_active`/`card_inactive` sono la scheda di chi **non e ancora nel
 * libro**: dicono che la scheda e in uso, non che la persona e socia.
 */
export const MEMBERSHIP_STATUS = Object.freeze({
  admitted: PERSON_STATUS.active,
  reinstated: spec("RIAMMESSO", "solid", "green"),
  resigned: spec("DIMESSO", "quiet", "neutral"),
  lapsed: spec("DECADUTO", "outline", "amber"),
  expelled: spec("ESCLUSO", "urgent", "red"),
  none: spec("NON SOCIO", "quiet", "neutral"),
  card_active: spec("SCHEDA ATTIVA", "outline", "green"),
  card_inactive: spec("SCHEDA NON ATTIVA", "quiet", "neutral"),
} as const);

/* ── Convocazione / presenza ────────────────────────────────────────────── */
export const CALLUP_STATUS = Object.freeze({
  called: spec("CONVOCATO", "solid", "blue"),
  not_called: spec("NON CONVOCATO", "quiet", "neutral"),
  no_answer: spec("SENZA RISPOSTA", "outline", "amber"),
  present: spec("PRESENTE", "solid", "green"),
  absent: spec("ASSENTE", "urgent", "red"),
  justified: spec("GIUSTIFICATO", "outline", "amber"),
  to_mark: spec("DA SEGNARE", "quiet", "neutral"),
} as const);

/* ── Account EasyGame ───────────────────────────────────────────────────── */
export const ACCOUNT_STATUS = Object.freeze({
  linked: spec("COLLEGATO", "solid", "green"),
  invited: spec("INVITATO", "outline", "amber"),
  none: spec("SENZA ACCESSO", "quiet", "neutral"),
  revoked: spec("REVOCATO", "quiet", "neutral"),
} as const);

/**
 * Risolve un valore dell'API in uno stato del sistema. Accetta le grafie che
 * il prodotto usa oggi (inglese e italiano, maiuscole e minuscole, con spazi o
 * trattini) e rende `STATUS_UNKNOWN` per cio che non riconosce: mai un errore,
 * mai una cella vuota.
 */
const ALIASES: Record<string, StatusSpec> = {
  // persona
  active: PERSON_STATUS.active,
  attivo: PERSON_STATUS.active,
  attiva: PERSON_STATUS.active,
  suspended: PERSON_STATUS.suspended,
  sospeso: PERSON_STATUS.suspended,
  sospesa: PERSON_STATUS.suspended,
  on_loan: PERSON_STATUS.on_loan,
  loan: PERSON_STATUS.on_loan,
  "in prestito": PERSON_STATUS.on_loan,
  prestito: PERSON_STATUS.on_loan,
  inactive: PERSON_STATUS.inactive,
  disattivato: PERSON_STATUS.inactive,
  disabled: PERSON_STATUS.inactive,
  archived: PERSON_STATUS.archived,
  archiviato: PERSON_STATUS.archived,
  draft: PERSON_STATUS.draft,
  bozza: PERSON_STATUS.draft,
  // certificato
  valid: CERTIFICATE_STATUS.valid,
  valido: CERTIFICATE_STATUS.valid,
  expiring: CERTIFICATE_STATUS.expiring,
  expiring_soon: CERTIFICATE_STATUS.expiring,
  "in scadenza": CERTIFICATE_STATUS.expiring,
  expired: CERTIFICATE_STATUS.expired,
  scaduto: CERTIFICATE_STATUS.expired,
  missing: CERTIFICATE_STATUS.missing,
  mancante: CERTIFICATE_STATUS.missing,
  none: CERTIFICATE_STATUS.missing,
  pending_approval: CERTIFICATE_STATUS.pending_approval,
  "da approvare": CERTIFICATE_STATUS.pending_approval,
  // denaro
  paid: MONEY_STATUS.paid,
  pagato: MONEY_STATUS.paid,
  pagata: MONEY_STATUS.paid,
  incassato: MONEY_STATUS.paid,
  partial: MONEY_STATUS.partial,
  parziale: MONEY_STATUS.partial,
  "parzialmente pagata": MONEY_STATUS.partial,
  pending: MONEY_STATUS.pending,
  "in attesa": MONEY_STATUS.pending,
  overdue: MONEY_STATUS.overdue,
  scaduta: MONEY_STATUS.overdue,
  cancelled: MONEY_STATUS.cancelled,
  canceled: MONEY_STATUS.cancelled,
  annullato: MONEY_STATUS.cancelled,
  annullata: MONEY_STATUS.cancelled,
  refunded: MONEY_STATUS.refunded,
  rimborsato: MONEY_STATUS.refunded,
  reversed: MONEY_STATUS.reversed,
  stornato: MONEY_STATUS.reversed,
  paid_out: MONEY_STATUS.paid_out,
  on_leave: PERSON_STATUS.on_leave,
  "in congedo": PERSON_STATUS.on_leave,
  leave: PERSON_STATUS.on_leave,
  // attivita
  completed: ACTIVITY_STATUS.completed,
  completato: ACTIVITY_STATUS.completed,
  in_progress: ACTIVITY_STATUS.in_progress,
  "in corso": ACTIVITY_STATUS.in_progress,
  scheduled: ACTIVITY_STATUS.scheduled,
  /* «upcoming» e la parola dell'area famiglia per un evento futuro (parent-dashboard.ts). */
  upcoming: ACTIVITY_STATUS.scheduled,
  "in programma": ACTIVITY_STATUS.scheduled,
  programmato: ACTIVITY_STATUS.scheduled,
  planned: ACTIVITY_STATUS.scheduled,
  not_recorded: ACTIVITY_STATUS.not_recorded,
  "non registrato": ACTIVITY_STATUS.not_recorded,
  recorded: ACTIVITY_STATUS.recorded,
  registrato: ACTIVITY_STATUS.recorded,
  // convocazione / presenza
  called: CALLUP_STATUS.called,
  convocato: CALLUP_STATUS.called,
  convoked: CALLUP_STATUS.called,
  not_called: CALLUP_STATUS.not_called,
  "non convocato": CALLUP_STATUS.not_called,
  no_answer: CALLUP_STATUS.no_answer,
  "senza risposta": CALLUP_STATUS.no_answer,
  present: CALLUP_STATUS.present,
  presente: CALLUP_STATUS.present,
  absent: CALLUP_STATUS.absent,
  assente: CALLUP_STATUS.absent,
  justified: CALLUP_STATUS.justified,
  giustificato: CALLUP_STATUS.justified,
  // libro soci
  ammesso: MEMBERSHIP_STATUS.admitted,
  riammesso: MEMBERSHIP_STATUS.reinstated,
  dimesso: MEMBERSHIP_STATUS.resigned,
  decaduto: MEMBERSHIP_STATUS.lapsed,
  espulso: MEMBERSHIP_STATUS.expelled,
  escluso: MEMBERSHIP_STATUS.expelled,
  mai_ammesso: MEMBERSHIP_STATUS.none,
  "non socio": MEMBERSHIP_STATUS.none,
  // account
  linked: ACCOUNT_STATUS.linked,
  collegato: ACCOUNT_STATUS.linked,
  invited: ACCOUNT_STATUS.invited,
  invitato: ACCOUNT_STATUS.invited,
  revoked: ACCOUNT_STATUS.revoked,
  revocato: ACCOUNT_STATUS.revoked,
};

export const resolveStatus = (
  value: string | null | undefined,
  fallback: StatusSpec = STATUS_UNKNOWN,
): StatusSpec => {
  if (!value) return fallback;
  const key = String(value).trim().toLowerCase().replace(/[-\s]+/g, " ");
  return ALIASES[key] || ALIASES[key.replace(/ /g, "_")] || fallback;
};

/**
 * Lo stato di un certificato a partire dalla scadenza: la logica che ogni
 * schermata riscriveva a modo suo. `expiringWithinDays` e la soglia «in
 * scadenza» (30 nel prodotto).
 */
export const certificateStatusFromExpiry = (
  daysUntilExpiry: number | null,
  options: { expiringWithinDays?: number } = {},
): StatusSpec => {
  const threshold = options.expiringWithinDays ?? 30;
  if (daysUntilExpiry == null) return CERTIFICATE_STATUS.missing;
  if (daysUntilExpiry < 0) return CERTIFICATE_STATUS.expired;
  if (daysUntilExpiry <= threshold) return CERTIFICATE_STATUS.expiring;
  return CERTIFICATE_STATUS.valid;
};
