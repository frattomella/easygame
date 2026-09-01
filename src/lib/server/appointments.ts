import { prisma } from "./prisma";
import { assertActiveClub } from "@/lib/auth/active-club-boundary";
import { isManagementAccessRole, normalizeAccessRole } from "@/lib/access-roles";
import { roleHasPermission } from "@/lib/permissions/catalog";
import { AUDIT_ACTIONS, recordAuditEvent } from "./audit";
import { createClubNotifications } from "./club-notifications";
import { sendNotificationEmails } from "./email/email-service";
import { canParentAccessAthlete } from "./parent-dashboard";
import {
  assertAppointmentTransition,
  computeFreeAppointmentSlots,
  DEFAULT_APPOINTMENT_TIMEZONE,
  findFreeSlotAt,
  isLiveAppointmentStatus,
  normalizeAppointmentStatus,
  toAppointmentInstant,
  toZonedDay,
  toZonedTime,
  type AppointmentSide,
  type AppointmentStatus,
} from "@/lib/appointments/model";
import {
  toClubAppointment,
  toFamilyAppointment,
} from "@/lib/appointments/projection";

/**
 * **L'unico scrittore degli appuntamenti e della disponibilita.**
 *
 * ---
 *
 * ## Perche esiste
 *
 * L'appuntamento viveva in `clubs.appointments`, una colonna JSON senza
 * proprietario. Da quel fatto solo discendeva tutto il resto: la logica stava
 * in un route handler e in una pagina client — gli errori 2 e 3 di CLAUDE.md
 * §11 — i due scrittori usavano due forme diverse dello stesso oggetto, e
 * **quello della segreteria cancellava quello della famiglia** (D-1). Nessun
 * codice scriveva `confirmed`: una richiesta restava in attesa per sempre, e
 * l'unica risposta possibile era cancellarla senza avvisare nessuno.
 *
 * ## La procedura, per ogni funzione pubblica, in quest'ordine
 *
 * 1. il **permesso**, dal catalogo (`appointments.read` / `read_own` /
 *    `request` / `manage`), con la stringa `Accesso negato` nel messaggio;
 * 2. il **confine**, riga per riga, con `assertActiveClub` — mai il confronto
 *    con `allowedOrganizationIds` (ADR-0094);
 * 3. per genitore e atleta il gate e il **legame**, non il ruolo:
 *    `canParentAccessAthlete`, e il club non arriva mai dal client — si deriva
 *    dal legame;
 * 4. per l'allenatore il **perimetro**: i soli appuntamenti che gli sono stati
 *    assegnati. Un permesso concesso al ruolo non e un permesso su ogni riga;
 * 5. `version` per il **controllo ottimistico**: due operatori che confermano
 *    insieme non si sovrascrivono, il secondo fallisce;
 * 6. l'**audit** su ogni transizione, e la notifica alla parte che non l'ha
 *    decisa.
 *
 * ## Cosa questo modulo NON fa
 *
 * Non impedisce la doppia prenotazione in codice: la impedisce il database,
 * con l'indice unico parziale `appointments_slot_vivo_unico`. Qui si
 * **intercetta** il suo rifiuto (`P2002`) e lo si traduce in una frase che una
 * segretaria puo leggere. Riscrivere quel controllo in memoria vorrebbe dire
 * riaprire proprio la corsa che l'indice chiude.
 */

const asText = (value: unknown) => String(value ?? "").trim();

const negato = (messaggio: string) => new Error(`Accesso negato: ${messaggio}`);

const CONFLITTO_VERSIONE =
  "L'appuntamento e stato aggiornato da qualcun altro: ricarica la pagina e riprova";

export type AppointmentsScope = {
  userId?: string | null;
  activeOrganizationId?: string | null;
  activeRole?: string | null;
  allowedOrganizationIds?: string[];
};

type Attore = {
  userId?: string | null;
  email?: string | null;
};

type ChiaveAppuntamento =
  | "appointments.read"
  | "appointments.read_own"
  | "appointments.request"
  | "appointments.manage";

const assertAppointmentsPermission = (
  scope: AppointmentsScope,
  permesso: ChiaveAppuntamento,
) => {
  if (!roleHasPermission(scope.activeRole, permesso)) {
    throw negato(`il ruolo attivo non puo ${permesso}`);
  }
};

const requireActiveOrganization = (scope: AppointmentsScope) => {
  const organizationId = asText(scope.activeOrganizationId);
  if (!organizationId) throw negato("nessun club attivo selezionato");
  return organizationId;
};

/**
 * Il perimetro dell'allenatore, riga per riga.
 *
 * Nella matrice della Wave 5 `appointments.manage` per il trainer e `◐`:
 * concesso, ma sui **soli appuntamenti assegnati a lui**. Il colloquio con la
 * famiglia di un atleta del proprio gruppo lo puo confermare e riprogrammare;
 * l'agenda della segreteria no. Senza questa riga il simbolo della matrice
 * sarebbe una promessa che nessuno mantiene.
 */
const assertPerimetro = (scope: AppointmentsScope, row: { assigned_to_user_id: string | null }) => {
  if (normalizeAccessRole(scope.activeRole) !== "trainer") return;
  if (!asText(row.assigned_to_user_id) || asText(row.assigned_to_user_id) !== asText(scope.userId)) {
    throw negato("questo appuntamento non e assegnato a te");
  }
};

/* ========================================================== letture ====== */

export type ListAppointmentsFilters = {
  status?: string | string[] | null;
  siteId?: string | null;
  assignedToUserId?: string | null;
  athleteId?: string | null;
  from?: Date | string | null;
  to?: Date | string | null;
  take?: number;
};

/**
 * La coda di lavoro della segreteria.
 *
 * `appointments.read` e la coda intera; chi ha soltanto `read_own` — cioe
 * l'allenatore — legge i propri, e il filtro **non e opzionale**: non si
 * accende su un parametro scelto da chi chiama (e il difetto D-5, che qui non
 * si ripete).
 */
export const listAppointments = async (
  scope: AppointmentsScope,
  filters: ListAppointmentsFilters = {},
) => {
  const puoLeggereTutto = roleHasPermission(scope.activeRole, "appointments.read");
  if (!puoLeggereTutto) {
    assertAppointmentsPermission(scope, "appointments.read_own");
  }
  const organizationId = requireActiveOrganization(scope);

  const where: Record<string, any> = { organization_id: organizationId };

  if (!puoLeggereTutto) {
    const proprio = asText(scope.userId);
    if (!proprio) throw negato("sessione senza utente");
    where.assigned_to_user_id = proprio;
  } else if (filters.assignedToUserId) {
    where.assigned_to_user_id = asText(filters.assignedToUserId);
  }

  if (filters.status) {
    const stati = (Array.isArray(filters.status) ? filters.status : [filters.status])
      .map((value) => normalizeAppointmentStatus(value))
      .filter(Boolean);
    if (stati.length === 1) where.status = stati[0];
    else if (stati.length > 1) where.status = { in: stati };
  }
  if (filters.siteId) where.site_id = asText(filters.siteId);
  if (filters.athleteId) where.athlete_id = asText(filters.athleteId);
  if (filters.from || filters.to) {
    where.starts_at = {};
    if (filters.from) where.starts_at.gte = new Date(filters.from);
    if (filters.to) where.starts_at.lte = new Date(filters.to);
  }

  const rows = await prisma.appointment.findMany({
    where,
    orderBy: { starts_at: "asc" },
    take: filters.take && filters.take > 0 ? Math.min(filters.take, 2000) : 2000,
  });

  /*
    Il confine si verifica **anche** su una lista gia filtrata per club: il
    filtro e una query, il confine e una regola, e la Wave 4 ha imparato che
    quando le due cose coincidono per costruzione e solo questione di tempo
    prima che qualcuno cambi la query.
  */
  for (const row of rows) assertActiveClub(scope, row.organization_id, "l'appuntamento");

  return rows;
};

export const readAppointment = async (scope: AppointmentsScope, id: string) => {
  const puoLeggereTutto = roleHasPermission(scope.activeRole, "appointments.read");
  if (!puoLeggereTutto) {
    assertAppointmentsPermission(scope, "appointments.read_own");
  }
  const organizationId = requireActiveOrganization(scope);

  const row = await prisma.appointment.findFirst({
    where: { id: asText(id), organization_id: organizationId },
  });
  if (!row) return null;

  assertActiveClub(scope, row.organization_id, "l'appuntamento");
  if (!puoLeggereTutto) assertPerimetro(scope, row);

  return row;
};

/* ================================================== la disponibilita ===== */

const leggiRegole = async (organizationId: string) =>
  prisma.appointmentSlot.findMany({
    where: { organization_id: organizationId },
    orderBy: [{ weekday: "asc" }, { start_time: "asc" }],
  });

const leggiOrariDiApertura = async (organizationId: string) => {
  const club = await prisma.club.findUnique({
    where: { id: organizationId },
    select: { opening_hours: true },
  });
  return club?.opening_hours ?? null;
};

const leggiOccupati = async (
  organizationId: string,
  from: Date,
  to: Date,
) => {
  const rows = await prisma.appointment.findMany({
    where: {
      organization_id: organizationId,
      starts_at: { gte: from, lte: to },
    },
    select: {
      id: true,
      starts_at: true,
      status: true,
      assigned_to_user_id: true,
      slot_id: true,
    },
  });
  return rows.filter((row) => isLiveAppointmentStatus(row.status));
};

export type AvailabilityQuery = {
  from: Date | string;
  to: Date | string;
  siteId?: string | null;
  assignedToUserId?: string | null;
  timezone?: string | null;
  now?: Date | null;
  /**
   * La riga che si sta spostando **non occupa se stessa**.
   *
   * Senza questa esclusione, riprogrammare cambiando solo la sede o
   * l'operatore risponderebbe «quell'orario e occupato» indicando come
   * occupante l'appuntamento che si sta spostando.
   */
  excludeAppointmentId?: string | null;
};

/** Il calcolo condiviso: lo usano la coda della segreteria e l'area famiglia. */
const calcolaDisponibilita = async (
  organizationId: string,
  query: AvailabilityQuery,
) => {
  const from = query.from instanceof Date ? query.from : new Date(query.from);
  const to = query.to instanceof Date ? query.to : new Date(query.to);
  const [regole, orari, occupati] = await Promise.all([
    leggiRegole(organizationId),
    leggiOrariDiApertura(organizationId),
    leggiOccupati(organizationId, from, to),
  ]);

  const escluso = asText(query.excludeAppointmentId);

  return computeFreeAppointmentSlots({
    rules: regole as any,
    openingHours: orari,
    busy: escluso ? occupati.filter((row) => row.id !== escluso) : occupati,
    from,
    to,
    timeZone: asText(query.timezone) || DEFAULT_APPOINTMENT_TIMEZONE,
    siteId: query.siteId ?? null,
    assignedToUserId: query.assignedToUserId ?? null,
    now: query.now ?? null,
  });
};

export const listFreeAppointmentSlots = async (
  scope: AppointmentsScope,
  query: AvailabilityQuery,
) => {
  if (
    !roleHasPermission(scope.activeRole, "appointments.read") &&
    !roleHasPermission(scope.activeRole, "appointments.read_own") &&
    !roleHasPermission(scope.activeRole, "appointments.request")
  ) {
    throw negato("il ruolo attivo non puo vedere la disponibilita");
  }
  const organizationId = requireActiveOrganization(scope);
  return calcolaDisponibilita(organizationId, query);
};

/* ============================================ la creazione di una riga === */

export type AppointmentInput = {
  athleteId?: string | null;
  siteId?: string | null;
  seasonId?: string | null;
  slotId?: string | null;
  assignedToUserId?: string | null;
  startsAt?: Date | string | null;
  date?: string | null;
  time?: string | null;
  durationMinutes?: number | null;
  timezone?: string | null;
  reason?: string | null;
  notes?: string | null;
  internalNotes?: string | null;
  idempotencyKey?: string | null;
  /** Solo con `appointments.manage`: il desk mette in agenda un appuntamento gia confermato. */
  confirmed?: boolean;
  /** Solo con `appointments.manage`: la segreteria inserisce fuori dagli slot pubblicati. */
  outsideAvailability?: boolean;
};

const risolviIstante = (input: AppointmentInput, timezone: string) => {
  if (input.startsAt) {
    const istante =
      input.startsAt instanceof Date ? input.startsAt : new Date(input.startsAt);
    if (!Number.isNaN(istante.getTime())) return istante;
  }
  return toAppointmentInstant(input.date, input.time, timezone);
};

/**
 * `create`, con il rifiuto del database tradotto in una frase leggibile.
 *
 * Il **doppio clic** non produce due appuntamenti: la seconda scrittura viola
 * `appointments_organization_id_idempotency_key_key` e qui si restituisce la
 * riga gia scritta invece di un errore — un secondo invio dello stesso gesto
 * non e un errore dell'utente, e trattarlo come tale gli farebbe premere il
 * pulsante una terza volta.
 */
const creaRiga = async (data: Record<string, any>) => {
  try {
    const row = await prisma.appointment.create({ data: data as any });
    return { row, duplicato: false };
  } catch (error: any) {
    if (error?.code !== "P2002") throw error;

    const bersaglio = Array.isArray(error?.meta?.target)
      ? error.meta.target.join(",")
      : String(error?.meta?.target || "");

    if (bersaglio.includes("idempotency_key") && data.idempotency_key) {
      const esistente = await prisma.appointment.findFirst({
        where: {
          organization_id: data.organization_id,
          idempotency_key: data.idempotency_key,
        },
      });
      if (esistente) return { row: esistente, duplicato: true };
    }

    throw new Error(
      "Quell'orario e appena stato preso: scegli un altro slot fra quelli liberi",
    );
  }
};

/**
 * La riga gia scritta con quella chiave, se c'e.
 *
 * Si guarda **prima** della disponibilita: al secondo clic lo slot risulta
 * occupato dal proprio stesso appuntamento, e senza questo passaggio la
 * risposta sarebbe «quell'orario non e piu disponibile» — cioe la bugia piu
 * confondente possibile, detta a chi ha appena prenotato.
 */
const trovaPerChiave = async (organizationId: string, chiave: string) =>
  chiave
    ? prisma.appointment.findFirst({
        where: { organization_id: organizationId, idempotency_key: chiave },
      })
    : null;

const chiaveIdempotenza = (
  fornita: unknown,
  soggetto: string,
  istante: Date,
) => {
  const testo = asText(fornita);
  if (testo) return testo;
  /*
    Senza una chiave dichiarata se ne deriva una dal gesto: stesso soggetto,
    stesso istante. Due clic sullo stesso pulsante producono la stessa chiave,
    e la seconda scrittura trova la prima. Una famiglia che volesse davvero due
    appuntamenti per lo stesso figlio nello stesso minuto non e un caso che
    esiste.
  */
  return `auto:${soggetto}:${istante.toISOString()}`;
};

/* ==================================================== le transizioni ===== */

type EsitoTransizione = {
  before: AppointmentStatus;
  row: any;
};

/**
 * Il cuore: una transizione, con il controllo ottimistico dentro.
 *
 * Il `where` porta **anche lo stato di partenza**, e non solo la versione: due
 * operatori che confermano insieme leggono la stessa riga alla stessa versione,
 * e senza lo stato nel filtro il secondo `updateMany` toccherebbe una riga gia
 * confermata dicendo di aver fatto qualcosa.
 */
const applicaTransizione = async (
  scope: AppointmentsScope,
  row: any,
  to: AppointmentStatus,
  side: AppointmentSide,
  patch: Record<string, any> = {},
  expectedVersion?: number | null,
): Promise<EsitoTransizione> => {
  const before = normalizeAppointmentStatus(row.status);
  assertAppointmentTransition(before, to, side);

  const attesa =
    expectedVersion === undefined || expectedVersion === null
      ? Number(row.version ?? 1)
      : Number(expectedVersion);

  const aggiornati = await prisma.appointment.updateMany({
    where: {
      id: row.id,
      organization_id: row.organization_id,
      status: before,
      version: attesa,
    },
    data: { ...patch, status: to, version: { increment: 1 } },
  });

  if (aggiornati.count === 0) throw new Error(CONFLITTO_VERSIONE);

  const aggiornata = await prisma.appointment.findFirst({
    where: { id: row.id, organization_id: row.organization_id },
  });

  return { before, row: aggiornata };
};

/* ================================================ audit e notifiche ====== */

const traccia = async (
  scope: AppointmentsScope,
  attore: Attore,
  action: string,
  row: any,
  metadata: Record<string, unknown>,
) => {
  await recordAuditEvent({
    action,
    actorUserId: attore.userId || null,
    actorEmail: attore.email || null,
    actorRole: scope.activeRole || null,
    organizationId: row?.organization_id || scope.activeOrganizationId || null,
    resource: "appointments",
    resourceId: row?.id || null,
    metadata,
  });
};

/**
 * La notifica alla famiglia, **indirizzata**.
 *
 * Una riga per destinatario e mai `user_id: null`: nel modello significa «di
 * societa», e l'area genitore lo legge come «di tutti». La richiesta di
 * appuntamento di una famiglia — con dentro il nome del minore e il motivo
 * scritto a mano — finiva nella bacheca di ogni altra famiglia del club, ed e
 * il difetto che la Wave 4 ha chiuso su questi stessi due scrittori.
 *
 * `internal_notes` non compare nel `data`: la proiezione verso la famiglia non
 * ha quel campo, e questa notifica usa la proiezione.
 */
const avvisaFamiglia = async (
  row: any,
  titolo: string,
  messaggio: string,
  options: { email?: boolean } = {},
) => {
  const destinatario = asText(row?.requested_by_user_id);
  if (!destinatario) return 0;

  await prisma.notification.createMany({
    data: [
      {
        organization_id: row.organization_id,
        user_id: destinatario,
        title: titolo,
        message: messaggio,
        type: "appointment_update",
        read: false,
        data: {
          appointmentId: row.id,
          status: normalizeAppointmentStatus(row.status),
          startsAt:
            row.starts_at instanceof Date
              ? row.starts_at.toISOString()
              : String(row.starts_at || ""),
          decisionNote: asText(row.decision_note) || null,
        } as any,
      },
    ],
  });

  /*
    L'email solo su conferma e rifiuto: sono i due eventi che una famiglia deve
    sapere senza aprire l'applicazione. Il testo e quello generico — «hai una
    nuova notifica» — e non e una scelta di comodo: mettere l'orario e il nome
    del minore in una casella di posta e la stessa fuga che si e appena chiusa
    sulla bacheca.
  */
  if (options.email) {
    await sendNotificationEmails([destinatario]).catch(() => undefined);
  }

  return 1;
};

const avvisaClub = async (
  row: any,
  titolo: string,
  messaggio: string,
) =>
  createClubNotifications({
    clubId: row.organization_id,
    title: titolo,
    message: messaggio,
    type: "appointment_request",
    data: {
      appointmentId: row.id,
      status: normalizeAppointmentStatus(row.status),
      startsAt:
        row.starts_at instanceof Date
          ? row.starts_at.toISOString()
          : String(row.starts_at || ""),
      athleteId: row.athlete_id || null,
    },
    audience: (role) => isManagementAccessRole(role),
  }).catch(() => 0);

/* ==================================== le scritture lato club ============= */

/**
 * La richiesta, o l'inserimento dal desk.
 *
 * Il desk che mette in agenda un appuntamento gia preso al telefono lo crea
 * **confermato**, e ha bisogno di `appointments.manage` per farlo: creare una
 * richiesta e rispondere a una richiesta sono due permessi diversi, e lasciarli
 * coincidere e cio che permetteva a chiunque potesse chiedere di darsi la
 * risposta da solo.
 */
export const createAppointment = async (
  scope: AppointmentsScope,
  input: AppointmentInput,
  attore: Attore = {},
) => {
  assertAppointmentsPermission(scope, "appointments.request");
  const organizationId = requireActiveOrganization(scope);

  const confermato = Boolean(input.confirmed);
  const fuoriDaSlot = Boolean(input.outsideAvailability);
  if (
    (confermato || fuoriDaSlot) &&
    !roleHasPermission(scope.activeRole, "appointments.manage")
  ) {
    throw negato(
      "il ruolo attivo non puo confermare un appuntamento ne inserirlo fuori dagli slot",
    );
  }

  const timezone = asText(input.timezone) || DEFAULT_APPOINTMENT_TIMEZONE;
  const reason = asText(input.reason);
  if (!reason) throw new Error("Il motivo dell'appuntamento e obbligatorio");

  const startsAt = risolviIstante(input, timezone);
  if (!startsAt) throw new Error("Giorno e orario dell'appuntamento non validi");

  const durata =
    Number(input.durationMinutes) > 0 ? Number(input.durationMinutes) : 30;

  const soggetto = asText(input.athleteId) || asText(attore.userId) || "desk";
  const chiave = chiaveIdempotenza(input.idempotencyKey, soggetto, startsAt);
  const gia = await trovaPerChiave(organizationId, chiave);
  if (gia) return gia;

  if (!fuoriDaSlot) {
    const liberi = await calcolaDisponibilita(organizationId, {
      from: startsAt,
      to: new Date(startsAt.getTime() + 60000),
      siteId: input.siteId ?? null,
      assignedToUserId: input.assignedToUserId ?? null,
      timezone,
    });
    if (!findFreeSlotAt(liberi, startsAt, { assignedToUserId: input.assignedToUserId })) {
      throw new Error(
        "L'orario scelto non e fra quelli disponibili: scegli uno slot libero",
      );
    }
  }

  const data = {
    organization_id: organizationId,
    site_id: asText(input.siteId) || null,
    season_id: asText(input.seasonId) || null,
    slot_id: asText(input.slotId) || null,
    starts_at: startsAt,
    ends_at: new Date(startsAt.getTime() + durata * 60000),
    timezone,
    status: confermato ? "confirmed" : "requested",
    athlete_id: asText(input.athleteId) || null,
    requested_by_user_id: asText(attore.userId) || null,
    assigned_to_user_id: asText(input.assignedToUserId) || null,
    reason,
    notes: asText(input.notes) || null,
    internal_notes: asText(input.internalNotes) || null,
    decision_note: null,
    decided_by: confermato ? asText(attore.userId) || null : null,
    decided_at: confermato ? new Date() : null,
    parent_appointment_id: null,
    idempotency_key: chiave,
    version: 1,
    created_by: asText(attore.userId) || null,
  };

  const { row, duplicato } = await creaRiga(data);
  if (duplicato) return row;

  await traccia(scope, attore, AUDIT_ACTIONS.appointmentRequested, row, {
    status: row.status,
    startsAt: startsAt.toISOString(),
    dalDesk: true,
  });

  return row;
};

const caricaPerScrittura = async (scope: AppointmentsScope, id: string) => {
  assertAppointmentsPermission(scope, "appointments.manage");
  const organizationId = requireActiveOrganization(scope);

  const row = await prisma.appointment.findFirst({
    where: { id: asText(id), organization_id: organizationId },
  });
  if (!row) throw new Error("Appuntamento non trovato");

  assertActiveClub(scope, row.organization_id, "l'appuntamento");
  assertPerimetro(scope, row);
  return row;
};

export const confirmAppointment = async (
  scope: AppointmentsScope,
  id: string,
  options: { note?: string | null; assignedToUserId?: string | null; expectedVersion?: number | null } = {},
  attore: Attore = {},
) => {
  const row = await caricaPerScrittura(scope, id);

  const esito = await applicaTransizione(
    scope,
    row,
    "confirmed",
    "club",
    {
      decision_note: asText(options.note) || null,
      decided_by: asText(attore.userId) || null,
      decided_at: new Date(),
      ...(options.assignedToUserId !== undefined
        ? { assigned_to_user_id: asText(options.assignedToUserId) || null }
        : {}),
    },
    options.expectedVersion,
  );

  await traccia(scope, attore, AUDIT_ACTIONS.appointmentConfirmed, esito.row, {
    statusFrom: esito.before,
    statusTo: "confirmed",
  });

  await avvisaFamiglia(
    esito.row,
    "Appuntamento confermato",
    `La segreteria ha confermato l'appuntamento del ${toZonedDay(esito.row.starts_at, esito.row.timezone)} alle ${toZonedTime(esito.row.starts_at, esito.row.timezone)}.`,
    { email: true },
  );

  return esito.row;
};

/**
 * Il rifiuto, **con il motivo**.
 *
 * Il motivo e obbligatorio: una risposta negativa senza spiegazione e cio che
 * si otteneva prima cancellando la richiesta, e la famiglia non riceveva
 * nemmeno quella.
 */
export const rejectAppointment = async (
  scope: AppointmentsScope,
  id: string,
  options: { note?: string | null; expectedVersion?: number | null } = {},
  attore: Attore = {},
) => {
  const row = await caricaPerScrittura(scope, id);
  const motivo = asText(options.note);
  if (!motivo) throw new Error("Il motivo del rifiuto e obbligatorio");

  const esito = await applicaTransizione(
    scope,
    row,
    "rejected",
    "club",
    {
      decision_note: motivo,
      decided_by: asText(attore.userId) || null,
      decided_at: new Date(),
    },
    options.expectedVersion,
  );

  await traccia(scope, attore, AUDIT_ACTIONS.appointmentRejected, esito.row, {
    statusFrom: esito.before,
    statusTo: "rejected",
  });

  await avvisaFamiglia(
    esito.row,
    "Appuntamento non accolto",
    `La segreteria non ha potuto accogliere la richiesta: ${motivo}`,
    { email: true },
  );

  return esito.row;
};

export const cancelAppointment = async (
  scope: AppointmentsScope,
  id: string,
  options: { note?: string | null; expectedVersion?: number | null } = {},
  attore: Attore = {},
) => {
  const row = await caricaPerScrittura(scope, id);

  const esito = await applicaTransizione(
    scope,
    row,
    "cancelled_by_club",
    "club",
    {
      decision_note: asText(options.note) || null,
      decided_by: asText(attore.userId) || null,
      decided_at: new Date(),
    },
    options.expectedVersion,
  );

  await traccia(scope, attore, AUDIT_ACTIONS.appointmentCancelled, esito.row, {
    statusFrom: esito.before,
    statusTo: "cancelled_by_club",
    /*
      L'autore sta **nello stato**, non in un campo accanto: `cancelled_by_club`
      e `cancelled_by_family` sono due stati diversi perche sono due fatti
      diversi, e un solo `cancelled` con un campo «chi» accanto e cio che
      rendeva impossibile sapere chi avesse disdetto.
    */
    autore: "club",
  });

  await avvisaFamiglia(
    esito.row,
    "Appuntamento annullato",
    `La segreteria ha annullato l'appuntamento del ${toZonedDay(esito.row.starts_at, esito.row.timezone)}.`,
  );

  return esito.row;
};

/** Concluso o assente: la constata chi era in segreteria, e non avvisa nessuno. */
export const closeAppointment = async (
  scope: AppointmentsScope,
  id: string,
  outcome: "completed" | "no_show",
  options: { note?: string | null; expectedVersion?: number | null } = {},
  attore: Attore = {},
) => {
  const row = await caricaPerScrittura(scope, id);

  const esito = await applicaTransizione(
    scope,
    row,
    outcome,
    "club",
    {
      internal_notes: asText(options.note) || row.internal_notes || null,
      decided_by: asText(attore.userId) || null,
      decided_at: new Date(),
    },
    options.expectedVersion,
  );

  await traccia(scope, attore, AUDIT_ACTIONS.appointmentClosed, esito.row, {
    statusFrom: esito.before,
    statusTo: outcome,
  });

  return esito.row;
};

/**
 * **La riprogrammazione crea una riga nuova e chiude la vecchia.**
 *
 * La data non si muta in luogo. Non e una preferenza di stile: mutandola,
 * l'audit direbbe «modificato» senza dire da quando a quando, e la riga vecchia
 * — quella che la famiglia ha in mano nella notifica che ha gia ricevuto —
 * sparirebbe. Cosi invece restano due righe legate da
 * `parent_appointment_id`, e la storia si legge in avanti.
 */
export const rescheduleAppointment = async (
  scope: AppointmentsScope,
  id: string,
  input: AppointmentInput & { note?: string | null; expectedVersion?: number | null },
  attore: Attore = {},
) => {
  const row = await caricaPerScrittura(scope, id);
  return riprogramma(scope, row, input, "club", attore, {
    userId: attore.userId,
    email: attore.email,
  });
};

const riprogramma = async (
  scope: AppointmentsScope,
  row: any,
  input: AppointmentInput & { note?: string | null; expectedVersion?: number | null },
  side: AppointmentSide,
  attore: Attore,
  autore: Attore,
) => {
  const timezone = asText(input.timezone) || row.timezone || DEFAULT_APPOINTMENT_TIMEZONE;
  const startsAt = risolviIstante(input, timezone);
  if (!startsAt) throw new Error("Giorno e orario dell'appuntamento non validi");

  const durata =
    Number(input.durationMinutes) > 0
      ? Number(input.durationMinutes)
      : Math.max(
          15,
          Math.round(
            (new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime()) / 60000,
          ) || 30,
        );

  const assegnato =
    input.assignedToUserId !== undefined
      ? asText(input.assignedToUserId) || null
      : row.assigned_to_user_id || null;

  if (!input.outsideAvailability) {
    const liberi = await calcolaDisponibilita(row.organization_id, {
      from: startsAt,
      to: new Date(startsAt.getTime() + 60000),
      siteId: input.siteId ?? row.site_id ?? null,
      assignedToUserId: assegnato,
      timezone,
      excludeAppointmentId: row.id,
    });
    if (!findFreeSlotAt(liberi, startsAt, { assignedToUserId: assegnato })) {
      throw new Error(
        "L'orario scelto non e fra quelli disponibili: scegli uno slot libero",
      );
    }
  }

  /*
    Prima si chiude la vecchia, poi si crea la nuova: nell'ordine inverso le
    due righe sarebbero **entrambe vive** sullo stesso operatore per il tempo
    che passa fra le due scritture, e l'indice unico parziale rifiuterebbe la
    nuova quando l'orario non cambia — che e proprio il caso in cui si sposta
    solo la sede o l'operatore.
  */
  const esito = await applicaTransizione(
    scope,
    row,
    "rescheduled",
    side,
    {
      decision_note: asText(input.note) || null,
      decided_by: asText(autore.userId) || null,
      decided_at: new Date(),
    },
    input.expectedVersion,
  );

  const { row: nuova } = await creaRiga({
    organization_id: row.organization_id,
    site_id: input.siteId !== undefined ? asText(input.siteId) || null : row.site_id,
    season_id: row.season_id,
    slot_id: asText(input.slotId) || null,
    starts_at: startsAt,
    ends_at: new Date(startsAt.getTime() + durata * 60000),
    timezone,
    status: "requested",
    athlete_id: row.athlete_id,
    requested_by_user_id: row.requested_by_user_id,
    assigned_to_user_id: assegnato,
    reason: asText(input.reason) || row.reason,
    notes: input.notes !== undefined ? asText(input.notes) || null : row.notes,
    /*
      Le note interne **non** si copiano sulla riga nuova: sono il commento
      della segreteria su una decisione presa, e trascinarle su un altro
      appuntamento le farebbe leggere come se riguardassero quello.
    */
    internal_notes: null,
    decision_note: null,
    decided_by: null,
    decided_at: null,
    parent_appointment_id: row.id,
    idempotency_key: chiaveIdempotenza(
      input.idempotencyKey,
      `riprogramma:${row.id}`,
      startsAt,
    ),
    version: 1,
    created_by: asText(autore.userId) || null,
  });

  await traccia(scope, attore, AUDIT_ACTIONS.appointmentRescheduled, esito.row, {
    statusFrom: esito.before,
    statusTo: "rescheduled",
    nuovoAppuntamento: nuova.id,
    nuovoInizio: startsAt.toISOString(),
    lato: side,
  });

  if (side === "club") {
    await avvisaFamiglia(
      nuova,
      "Appuntamento riprogrammato",
      `La segreteria propone il ${toZonedDay(startsAt, timezone)} alle ${toZonedTime(startsAt, timezone)}.`,
    );
  } else {
    await avvisaClub(
      nuova,
      "Richiesta appuntamento riprogrammata",
      `Una famiglia ha proposto un nuovo orario: ${toZonedDay(startsAt, timezone)} alle ${toZonedTime(startsAt, timezone)}.`,
    );
  }

  return { closed: esito.row, created: nuova };
};

/* ================================================ la configurazione ====== */

export type AppointmentSlotInput = {
  siteId?: string | null;
  assignedToUserId?: string | null;
  weekday?: number | null;
  specificDate?: Date | string | null;
  startTime?: string | null;
  endTime?: string | null;
  durationMinutes?: number | null;
  capacity?: number | null;
  validFrom?: Date | string | null;
  validUntil?: Date | string | null;
  active?: boolean;
  notes?: string | null;
};

export const listAppointmentSlots = async (scope: AppointmentsScope) => {
  if (
    !roleHasPermission(scope.activeRole, "appointments.read") &&
    !roleHasPermission(scope.activeRole, "appointments.manage")
  ) {
    throw negato("il ruolo attivo non puo vedere la disponibilita configurata");
  }
  const organizationId = requireActiveOrganization(scope);
  const rows = await leggiRegole(organizationId);
  for (const row of rows) assertActiveClub(scope, row.organization_id, "lo slot");
  return rows;
};

const colonneSlot = (input: AppointmentSlotInput) => {
  const start = asText(input.startTime);
  const end = asText(input.endTime);
  if (!/^\d{1,2}:\d{2}$/.test(start) || !/^\d{1,2}:\d{2}$/.test(end)) {
    throw new Error("Orario di inizio e di fine non validi");
  }
  if (end <= start) throw new Error("L'orario di fine deve seguire quello di inizio");

  const weekday =
    input.weekday === null || input.weekday === undefined
      ? null
      : Number(input.weekday);
  const specifica = input.specificDate ? new Date(input.specificDate) : null;

  /*
    Una regola senza giorno della settimana **ne** data specifica varrebbe
    ovunque e in nessun posto: e la forma con cui si configura per sbaglio
    un'agenda che non propone mai niente, e non lascia capire perche.
  */
  if (weekday === null && !specifica) {
    throw new Error(
      "Uno slot deve dichiarare un giorno della settimana oppure una data",
    );
  }
  if (weekday !== null && (weekday < 0 || weekday > 6)) {
    throw new Error("Il giorno della settimana va da 0 (domenica) a 6 (sabato)");
  }

  return {
    site_id: asText(input.siteId) || null,
    assigned_to_user_id: asText(input.assignedToUserId) || null,
    weekday,
    specific_date: specifica,
    start_time: start,
    end_time: end,
    duration_minutes:
      Number(input.durationMinutes) > 0 ? Number(input.durationMinutes) : 30,
    capacity: Number(input.capacity) > 0 ? Number(input.capacity) : 1,
    valid_from: input.validFrom ? new Date(input.validFrom) : null,
    valid_until: input.validUntil ? new Date(input.validUntil) : null,
    active: input.active === undefined ? true : Boolean(input.active),
    notes: asText(input.notes) || null,
  };
};

export const createAppointmentSlot = async (
  scope: AppointmentsScope,
  input: AppointmentSlotInput,
  attore: Attore = {},
) => {
  assertAppointmentsPermission(scope, "appointments.manage");
  const organizationId = requireActiveOrganization(scope);

  const row = await prisma.appointmentSlot.create({
    data: {
      organization_id: organizationId,
      ...colonneSlot(input),
      created_by: asText(attore.userId) || null,
    } as any,
  });

  await traccia(scope, attore, AUDIT_ACTIONS.appointmentSlotChanged, row, {
    operazione: "create",
  });

  return row;
};

export const updateAppointmentSlot = async (
  scope: AppointmentsScope,
  id: string,
  input: AppointmentSlotInput,
  attore: Attore = {},
) => {
  assertAppointmentsPermission(scope, "appointments.manage");
  const organizationId = requireActiveOrganization(scope);

  const esistente = await prisma.appointmentSlot.findFirst({
    where: { id: asText(id), organization_id: organizationId },
  });
  if (!esistente) throw new Error("Slot non trovato");
  assertActiveClub(scope, esistente.organization_id, "lo slot");

  await prisma.appointmentSlot.updateMany({
    where: { id: esistente.id, organization_id: organizationId },
    data: colonneSlot({
      siteId: input.siteId ?? esistente.site_id,
      assignedToUserId: input.assignedToUserId ?? esistente.assigned_to_user_id,
      weekday: input.weekday === undefined ? esistente.weekday : input.weekday,
      specificDate:
        input.specificDate === undefined ? esistente.specific_date : input.specificDate,
      startTime: input.startTime ?? esistente.start_time,
      endTime: input.endTime ?? esistente.end_time,
      durationMinutes: input.durationMinutes ?? esistente.duration_minutes,
      capacity: input.capacity ?? esistente.capacity,
      validFrom: input.validFrom === undefined ? esistente.valid_from : input.validFrom,
      validUntil:
        input.validUntil === undefined ? esistente.valid_until : input.validUntil,
      active: input.active === undefined ? esistente.active : input.active,
      notes: input.notes ?? esistente.notes,
    }) as any,
  });

  await traccia(scope, attore, AUDIT_ACTIONS.appointmentSlotChanged, esistente, {
    operazione: "update",
  });

  return prisma.appointmentSlot.findFirst({
    where: { id: esistente.id, organization_id: organizationId },
  });
};

/**
 * Togliere uno slot **non** cancella gli appuntamenti presi su di esso.
 *
 * La chiave esterna e `SET NULL`, e la riga dell'appuntamento resta: chi ha
 * gia un colloquio in agenda non lo perde perche la segreteria ha cambiato
 * orario di ricevimento.
 */
export const deleteAppointmentSlot = async (
  scope: AppointmentsScope,
  id: string,
  attore: Attore = {},
) => {
  assertAppointmentsPermission(scope, "appointments.manage");
  const organizationId = requireActiveOrganization(scope);

  const esistente = await prisma.appointmentSlot.findFirst({
    where: { id: asText(id), organization_id: organizationId },
  });
  if (!esistente) throw new Error("Slot non trovato");
  assertActiveClub(scope, esistente.organization_id, "lo slot");

  await prisma.appointmentSlot.deleteMany({
    where: { id: esistente.id, organization_id: organizationId },
  });

  await traccia(scope, attore, AUDIT_ACTIONS.appointmentSlotChanged, esistente, {
    operazione: "delete",
  });

  return { id: esistente.id };
};

/* ============================================ le scritture della famiglia = */

export type FamilyAppointmentContext = {
  scope: AppointmentsScope;
  athleteId: string;
  organizationId: string;
  userId: string;
  athleteName: string;
  personName: string;
};

/**
 * Il contesto della famiglia: **il club si deriva dal legame**.
 *
 * Non arriva dal client, e non e negoziabile: il gate di un genitore non e il
 * ruolo, e `canParentAccessAthlete` e l'unico risolutore che questa area usa.
 * Lo scope che ne esce ha per club attivo quello dell'atleta, cosi
 * `assertActiveClub` continua a valere anche qui — e vale su un valore che il
 * chiamante non ha scelto.
 */
export const resolveFamilyAppointmentContext = async (
  userId: string,
  athleteId: string,
): Promise<FamilyAppointmentContext | null> => {
  const utente = asText(userId);
  const atleta = asText(athleteId);
  if (!utente || !atleta) return null;

  if (!(await canParentAccessAthlete(utente, atleta))) return null;

  const row = await prisma.athlete.findFirst({
    where: { id: atleta },
    select: { id: true, organization_id: true, first_name: true, last_name: true },
  });
  if (!row) return null;

  const persona = await prisma.user.findUnique({
    where: { id: utente },
    select: { first_name: true, last_name: true, email: true },
  });

  return {
    scope: {
      userId: utente,
      activeOrganizationId: row.organization_id,
      activeRole: "parent",
      allowedOrganizationIds: [row.organization_id],
    },
    athleteId: row.id,
    organizationId: row.organization_id,
    userId: utente,
    athleteName: `${row.first_name || ""} ${row.last_name || ""}`.trim(),
    personName:
      `${persona?.first_name || ""} ${persona?.last_name || ""}`.trim() ||
      persona?.email ||
      "",
  };
};

/**
 * **La congiunzione che chiude W5-54.**
 *
 * `isParentAppointment` accettava la riga se l'atleta corrispondeva
 * **oppure** se l'utente richiedente corrispondeva. Due condizioni in
 * alternativa: dal contesto del figlio A si toccava una richiesta nata per il
 * figlio B — bastava conoscerne l'identificativo, e la risposta della propria
 * dashboard lo conteneva. Adesso servono **entrambe**.
 */
const assertRigaDellaFamiglia = (ctx: FamilyAppointmentContext, row: any) => {
  assertActiveClub(ctx.scope, row?.organization_id, "l'appuntamento");
  const stessoAtleta = asText(row?.athlete_id) === asText(ctx.athleteId);
  const stessoAutore = asText(row?.requested_by_user_id) === asText(ctx.userId);
  if (!stessoAtleta || !stessoAutore) {
    throw negato("l'appuntamento non e stato trovato per questo atleta");
  }
};

/**
 * Gli appuntamenti del figlio selezionato.
 *
 * Il filtro di lettura e il **legame con quel figlio**: un appuntamento che la
 * segreteria ha preso lei per il minore si deve vedere, anche se non lo ha
 * chiesto il genitore. Toccarlo e un'altra cosa, e chiede la congiunzione.
 */
export const listFamilyAppointments = async (ctx: FamilyAppointmentContext) => {
  const rows = await prisma.appointment.findMany({
    where: { organization_id: ctx.organizationId, athlete_id: ctx.athleteId },
    orderBy: { starts_at: "desc" },
    take: 200,
  });

  for (const row of rows) assertActiveClub(ctx.scope, row.organization_id, "l'appuntamento");

  return rows.map((row) =>
    toFamilyAppointment(row as any, {
      athleteName: ctx.athleteName,
      person: ctx.personName,
    }),
  );
};

export const listFamilyFreeSlots = async (
  ctx: FamilyAppointmentContext,
  query: Omit<AvailabilityQuery, "assignedToUserId">,
) => calcolaDisponibilita(ctx.organizationId, { ...query, now: query.now ?? new Date() });

export const requestFamilyAppointment = async (
  ctx: FamilyAppointmentContext,
  input: AppointmentInput,
) => {
  const timezone = asText(input.timezone) || DEFAULT_APPOINTMENT_TIMEZONE;
  const reason = asText(input.reason);
  if (!reason) throw new Error("Il motivo dell'appuntamento e obbligatorio");

  const startsAt = risolviIstante(input, timezone);
  if (!startsAt) throw new Error("Giorno e orario dell'appuntamento non validi");

  const chiave = chiaveIdempotenza(input.idempotencyKey, ctx.athleteId, startsAt);
  const gia = await trovaPerChiave(ctx.organizationId, chiave);
  if (gia) {
    return toFamilyAppointment(gia as any, {
      athleteName: ctx.athleteName,
      person: ctx.personName,
    });
  }

  /*
    La famiglia sceglie **uno slot libero**, non una data qualunque: e il senso
    di tutta la lane. `outsideAvailability` non si legge nemmeno, perche non e
    un permesso che una famiglia possa avere.
  */
  const liberi = await calcolaDisponibilita(ctx.organizationId, {
    from: startsAt,
    to: new Date(startsAt.getTime() + 60000),
    siteId: input.siteId ?? null,
    timezone,
  });
  const slot = findFreeSlotAt(liberi, startsAt);
  if (!slot) {
    throw new Error(
      "L'orario scelto non e piu disponibile: scegli uno slot fra quelli liberi",
    );
  }

  const { row, duplicato } = await creaRiga({
    organization_id: ctx.organizationId,
    site_id: slot.siteId,
    season_id: asText(input.seasonId) || null,
    slot_id: slot.slotId,
    starts_at: startsAt,
    ends_at: slot.endsAt,
    timezone,
    status: "requested",
    athlete_id: ctx.athleteId,
    requested_by_user_id: ctx.userId,
    assigned_to_user_id: slot.assignedToUserId,
    reason,
    notes: asText(input.notes) || null,
    internal_notes: null,
    decision_note: null,
    decided_by: null,
    decided_at: null,
    parent_appointment_id: null,
    idempotency_key: chiave,
    version: 1,
    created_by: ctx.userId,
  });

  if (!duplicato) {
    await traccia(ctx.scope, { userId: ctx.userId }, AUDIT_ACTIONS.appointmentRequested, row, {
      status: "requested",
      startsAt: startsAt.toISOString(),
      dalDesk: false,
    });

    await avvisaClub(
      row,
      "Nuova richiesta appuntamento",
      `${ctx.personName || "Un genitore"} ha richiesto un appuntamento per ${ctx.athleteName}.`,
    );
  }

  return toFamilyAppointment(row as any, {
    athleteName: ctx.athleteName,
    person: ctx.personName,
  });
};

export const rescheduleFamilyAppointment = async (
  ctx: FamilyAppointmentContext,
  id: string,
  input: AppointmentInput & { expectedVersion?: number | null },
) => {
  const row = await prisma.appointment.findFirst({
    where: { id: asText(id), organization_id: ctx.organizationId },
  });
  if (!row) throw new Error("Richiesta appuntamento non trovata");
  assertRigaDellaFamiglia(ctx, row);

  const esito = await riprogramma(
    ctx.scope,
    row,
    { ...input, outsideAvailability: false },
    "family",
    { userId: ctx.userId },
    { userId: ctx.userId },
  );

  return toFamilyAppointment(esito.created as any, {
    athleteName: ctx.athleteName,
    person: ctx.personName,
  });
};

export const cancelFamilyAppointment = async (
  ctx: FamilyAppointmentContext,
  id: string,
  options: { expectedVersion?: number | null } = {},
) => {
  const row = await prisma.appointment.findFirst({
    where: { id: asText(id), organization_id: ctx.organizationId },
  });
  if (!row) throw new Error("Richiesta appuntamento non trovata");
  assertRigaDellaFamiglia(ctx, row);

  const esito = await applicaTransizione(
    ctx.scope,
    row,
    "cancelled_by_family",
    "family",
    { decided_by: ctx.userId, decided_at: new Date() },
    options.expectedVersion,
  );

  await traccia(ctx.scope, { userId: ctx.userId }, AUDIT_ACTIONS.appointmentCancelled, esito.row, {
    statusFrom: esito.before,
    statusTo: "cancelled_by_family",
    autore: "family",
  });

  await avvisaClub(
    esito.row,
    "Richiesta appuntamento annullata",
    `${ctx.personName || "Un genitore"} ha annullato l'appuntamento per ${ctx.athleteName}.`,
  );

  return toFamilyAppointment(esito.row as any, {
    athleteName: ctx.athleteName,
    person: ctx.personName,
  });
};

export { toClubAppointment, toFamilyAppointment };
