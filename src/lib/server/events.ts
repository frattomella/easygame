import { prisma } from "./prisma";
import { assertActiveClub } from "@/lib/auth/active-club-boundary";
import { normalizeAccessRole } from "@/lib/access-roles";
import { roleHasPermission } from "@/lib/permissions/catalog";
import { AUDIT_ACTIONS, recordAuditEvent } from "./audit";
import {
  assertEventHasRoom,
  assertEventTransition,
  findEventOverlaps,
  normalizeConvocationStatus,
  normalizeEventKind,
  normalizeEventStatus,
  toEventColumns,
  toEventLegacyShape,
  type EventKind,
} from "@/lib/events/model";

/**
 * **L'unica strada per creare, modificare o annullare un evento sportivo.**
 *
 * ---
 *
 * ## Perche esiste
 *
 * Allenamenti e gare vivevano in due colonne JSON del club, riscritte per
 * intero da chiunque avesse il permesso di scrivere il club. Da quel singolo
 * fatto discendevano sette conseguenze — nessuna chiave esterna, nessun
 * permesso per riga, nessun audit, nessun vincolo, due segretarie che si
 * sovrascrivono, la convocazione come chiave di dizionario, l'RSVP senza
 * un identificativo su cui appoggiarsi — e ADR-0098 le chiude tutte con lo
 * stesso mattone: **l'evento e una riga**.
 *
 * ## La proiezione, e perche non e una doppia scrittura
 *
 * Novantadue punti del codice leggono ancora `clubs.trainings` e
 * `clubs.matches` nella forma storica. Le due colonne restano, ma diventano una
 * **proiezione in sola lettura con un solo scrittore: questo modulo**. Nessuno
 * le scrive piu direttamente — `resources.ts` lo rifiuta — e spariscono a
 * scaglioni man mano che i lettori passano agli eventi.
 *
 * La differenza con la doppia scrittura di prima non e sottile: prima c'erano
 * due scrittori indipendenti e l'ultimo vinceva in silenzio. Adesso c'e una
 * fonte, e una copia che qualcuno mantiene.
 *
 * ## La procedura, per ogni funzione pubblica
 *
 * 1. il permesso, dal catalogo (`events.read` / `events.manage` / …);
 * 2. il confine, riga per riga, con `assertActiveClub` — mai il confronto con
 *    `allowedOrganizationIds` (ADR-0094);
 * 3. per l'allenatore, il **perimetro**: i propri gruppi e le proprie
 *    categorie. Un permesso concesso al ruolo non e un permesso su ogni riga;
 * 4. l'audit, con l'identificativo dell'evento — che prima non esisteva.
 */

const asText = (value: unknown) => String(value ?? "").trim();

const negato = (messaggio: string) => new Error(`Accesso negato: ${messaggio}`);

export type EventsScope = {
  userId?: string | null;
  activeOrganizationId?: string | null;
  activeRole?: string | null;
  allowedOrganizationIds?: string[];
};

type Attore = {
  userId?: string | null;
  email?: string | null;
};

const assertEventsPermission = (
  scope: EventsScope,
  permesso:
    | "events.read"
    | "events.manage"
    | "events.convoke"
    | "events.attendance"
    | "rsvp.read",
) => {
  if (!roleHasPermission(scope.activeRole, permesso)) {
    throw negato(`il ruolo attivo non puo ${permesso}`);
  }
};

const requireActiveOrganization = (scope: EventsScope) => {
  const organizationId = asText(scope.activeOrganizationId);
  if (!organizationId) {
    throw negato("nessun club attivo selezionato");
  }
  return organizationId;
};

/* ========================================================== letture ====== */

export type ListEventsFilters = {
  kind?: EventKind | "all";
  from?: Date | string | null;
  to?: Date | string | null;
  seasonId?: string | null;
  siteId?: string | null;
  categoryId?: string | null;
  groupId?: string | null;
  status?: string | null;
  includeCancelled?: boolean;
  take?: number;
};

/**
 * Il perimetro dell'allenatore sugli eventi.
 *
 * Un allenamento non e il dato di nessuno — e il calendario di una squadra —
 * quindi qui il gruppo resta un **filtro** e non un confine (W5-69): la
 * distinzione fra le due cose la fa la natura del dato, non l'abitudine.
 */
const trainerEventFilter = async (
  organizationId: string,
  userId: string,
): Promise<{ categoryIds: string[]; groupIds: string[] } | null> => {
  const club = await prisma.club.findUnique({
    where: { id: organizationId },
    select: { trainers: true, staff_members: true, categories: true },
  });
  if (!club) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  const pool = [
    ...(Array.isArray(club.trainers) ? club.trainers : []),
    ...(Array.isArray(club.staff_members) ? club.staff_members : []),
  ] as any[];

  const profilo = pool.find((entry) => {
    const source = entry?.data && typeof entry.data === "object" ? entry.data : {};
    const identita = [
      entry?.linkedUserId,
      entry?.linked_user_id,
      entry?.userId,
      entry?.user_id,
      source?.linkedUserId,
      source?.userId,
    ].map(asText);
    const emails = [entry?.email, entry?.linkedUserEmail, source?.email].map(
      (value) => asText(value).toLowerCase(),
    );

    return (
      identita.includes(asText(userId)) ||
      (Boolean(user?.email) && emails.includes(asText(user?.email).toLowerCase()))
    );
  });

  if (!profilo) return { categoryIds: [], groupIds: [] };

  const source =
    profilo?.data && typeof profilo.data === "object" ? profilo.data : {};
  const raccogli = (value: unknown): string[] =>
    Array.isArray(value)
      ? value
          .map((entry) =>
            entry && typeof entry === "object"
              ? asText((entry as any).id ?? (entry as any).value)
              : asText(entry),
          )
          .filter(Boolean)
      : [];

  return {
    categoryIds: Array.from(
      new Set([
        ...raccogli(profilo?.categories),
        ...raccogli(source?.categories),
      ]),
    ),
    groupIds: Array.from(
      new Set([
        ...raccogli(profilo?.groups),
        ...raccogli(profilo?.groupIds),
        ...raccogli(source?.groups),
        ...raccogli(source?.groupIds),
      ]),
    ),
  };
};

export const listClubEvents = async (
  scope: EventsScope,
  filters: ListEventsFilters = {},
) => {
  assertEventsPermission(scope, "events.read");
  const organizationId = requireActiveOrganization(scope);

  const where: Record<string, any> = { organization_id: organizationId };

  if (filters.kind && filters.kind !== "all") {
    where.kind = normalizeEventKind(filters.kind);
  }
  if (filters.seasonId) where.season_id = asText(filters.seasonId);
  if (filters.siteId) where.site_id = asText(filters.siteId);
  if (filters.categoryId) where.category_id = asText(filters.categoryId);
  if (filters.status) where.status = normalizeEventStatus(filters.status);
  else if (!filters.includeCancelled) where.status = { not: "archived" };

  if (filters.from || filters.to) {
    where.starts_at = {};
    if (filters.from) where.starts_at.gte = new Date(filters.from);
    if (filters.to) where.starts_at.lte = new Date(filters.to);
  }

  let rows = await prisma.clubEvent.findMany({
    where,
    orderBy: { starts_at: "asc" },
    take: filters.take && filters.take > 0 ? Math.min(filters.take, 2000) : 2000,
  });

  if (normalizeAccessRole(scope.activeRole) === "trainer" && scope.userId) {
    const perimetro = await trainerEventFilter(organizationId, scope.userId);
    if (!perimetro) return [];

    const categorie = new Set(
      perimetro.categoryIds.map((value) => value.toLowerCase()),
    );
    const gruppi = new Set(perimetro.groupIds);

    if (categorie.size || gruppi.size) {
      rows = rows.filter((row) => {
        const categoria = [row.category_id, row.category_name]
          .map((value) => asText(value).toLowerCase())
          .filter(Boolean);
        const suoiGruppi = Array.isArray(row.group_ids)
          ? (row.group_ids as string[])
          : [];

        return (
          categoria.some((value) => categorie.has(value)) ||
          suoiGruppi.some((value) => gruppi.has(value))
        );
      });
    }
  }

  if (filters.groupId) {
    const wanted = asText(filters.groupId);
    rows = rows.filter((row) =>
      (Array.isArray(row.group_ids) ? (row.group_ids as string[]) : []).includes(
        wanted,
      ),
    );
  }

  return rows;
};

/**
 * Un evento, cercato **sia** per identificativo di riga sia per quello storico.
 *
 * I due convivono per tutta la transizione: una notifica scritta il mese scorso
 * cita l'identificativo dell'array JSON, e deve continuare a trovare la riga.
 */
export const findClubEvent = async (
  organizationId: string,
  idOrLegacyId: string,
  kind?: EventKind,
) => {
  const wanted = asText(idOrLegacyId);
  if (!wanted) return null;

  const uuidLike =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      wanted,
    );

  if (uuidLike) {
    const byId = await prisma.clubEvent.findFirst({
      where: {
        id: wanted,
        organization_id: organizationId,
        ...(kind ? { kind } : {}),
      },
    });
    if (byId) return byId;
  }

  return prisma.clubEvent.findFirst({
    where: {
      organization_id: organizationId,
      legacy_id: wanted,
      ...(kind ? { kind } : {}),
    },
  });
};

export const readClubEvent = async (
  scope: EventsScope,
  idOrLegacyId: string,
  kind?: EventKind,
) => {
  assertEventsPermission(scope, "events.read");
  const organizationId = requireActiveOrganization(scope);
  const row = await findClubEvent(organizationId, idOrLegacyId, kind);
  if (!row) return null;

  assertActiveClub(scope, row.organization_id, "l'evento");
  return row;
};

/* ================================================== la proiezione ======== */

/**
 * Riallinea `clubs.trainings` o `clubs.matches` alle righe.
 *
 * **Il verso e uno solo**: dalle righe alla colonna. La colonna non torna mai
 * indietro verso le righe — quello era il difetto D-1, dove la
 * rigenerazione dell'aggregato cancellava cio che non era mai passato dalle
 * righe.
 */
const projectEventsToClubColumn = async (
  organizationId: string,
  kind: EventKind,
) => {
  const rows = await prisma.clubEvent.findMany({
    where: { organization_id: organizationId, kind, status: { not: "archived" } },
    orderBy: { starts_at: "asc" },
  });

  const aggregato = rows.map((row) => toEventLegacyShape(row));

  await prisma.club.update({
    where: { id: organizationId },
    data: { [kind === "match" ? "matches" : "trainings"]: aggregato as any },
  });
};

/** Esposta per il collaudo e per i riallineamenti una tantum. */
export const reprojectClubEvents = async (organizationId: string) => {
  await projectEventsToClubColumn(organizationId, "training");
  await projectEventsToClubColumn(organizationId, "match");
};

/* ========================================================= scritture ===== */

const assertNoOverlap = async (
  organizationId: string,
  candidate: {
    id?: string;
    structure_id: string | null;
    field_id: string | null;
    site_id: string | null;
    starts_at: Date;
    ends_at: Date | null;
  },
) => {
  if (!candidate.structure_id && !candidate.field_id && !candidate.site_id) {
    return;
  }

  const giorno = new Date(candidate.starts_at);
  const inizioGiorno = new Date(giorno);
  inizioGiorno.setUTCHours(0, 0, 0, 0);
  const fineGiorno = new Date(giorno);
  fineGiorno.setUTCHours(23, 59, 59, 999);

  const altri = await prisma.clubEvent.findMany({
    where: {
      organization_id: organizationId,
      starts_at: { gte: inizioGiorno, lte: fineGiorno },
      status: { not: "cancelled" },
      ...(candidate.id ? { id: { not: candidate.id } } : {}),
    },
    select: {
      id: true,
      structure_id: true,
      field_id: true,
      site_id: true,
      starts_at: true,
      ends_at: true,
      status: true,
      title: true,
    },
  });

  const conflitti = findEventOverlaps(candidate, altri);
  if (conflitti.length) {
    const primo = altri.find((row) => row.id === conflitti[0].id);
    throw new Error(
      `Il campo e gia occupato in quell'orario da «${primo?.title || "un altro evento"}»`,
    );
  }
};

export const createClubEvent = async (
  scope: EventsScope,
  kind: EventKind,
  input: unknown,
  attore: Attore = {},
) => {
  assertEventsPermission(scope, "events.manage");
  const organizationId = requireActiveOrganization(scope);
  const colonne = toEventColumns(normalizeEventKind(kind), input);

  await assertNoOverlap(organizationId, {
    structure_id: colonne.structure_id,
    field_id: colonne.field_id,
    site_id: colonne.site_id,
    starts_at: colonne.starts_at,
    ends_at: colonne.ends_at,
  });

  const row = await prisma.clubEvent.create({
    data: {
      organization_id: organizationId,
      ...colonne,
      group_ids: colonne.group_ids ?? undefined,
      trainer_ids: colonne.trainer_ids ?? undefined,
      payload: colonne.payload as any,
      created_by: attore.userId || null,
    },
  });

  await projectEventsToClubColumn(organizationId, row.kind as EventKind);

  await recordAuditEvent({
    action: AUDIT_ACTIONS.eventCreated,
    actorUserId: attore.userId || null,
    actorEmail: attore.email || null,
    actorRole: scope.activeRole || null,
    organizationId,
    resource: "club_events",
    resourceId: row.id,
    metadata: { kind: row.kind, startsAt: row.starts_at.toISOString() },
  });

  return row;
};

/**
 * La modifica, con **controllo ottimistico**.
 *
 * Due segretarie che salvano insieme non si sovrascrivono piu: la seconda
 * fallisce invece di vincere. Prima l'operazione era «leggi l'array intero,
 * modificalo, riscrivilo», e la seconda scrittura faceva sparire la prima
 * senza un errore.
 */
export const updateClubEvent = async (
  scope: EventsScope,
  idOrLegacyId: string,
  input: unknown,
  attore: Attore = {},
  options: { expectedVersion?: number | null } = {},
) => {
  assertEventsPermission(scope, "events.manage");
  const organizationId = requireActiveOrganization(scope);

  const existing = await findClubEvent(organizationId, idOrLegacyId);
  if (!existing) throw new Error("Evento non trovato");
  assertActiveClub(scope, existing.organization_id, "l'evento");

  const source = input && typeof input === "object" ? (input as any) : {};
  const merged = {
    ...(existing.payload && typeof existing.payload === "object"
      ? existing.payload
      : {}),
    id: existing.legacy_id ?? existing.id,
    date: existing.starts_at.toISOString(),
    ...source,
  };

  const colonne = toEventColumns(existing.kind as EventKind, merged);
  assertEventTransition(existing.status, colonne.status);

  await assertNoOverlap(organizationId, {
    id: existing.id,
    structure_id: colonne.structure_id,
    field_id: colonne.field_id,
    site_id: colonne.site_id,
    starts_at: colonne.starts_at,
    ends_at: colonne.ends_at,
  });

  const attesa =
    options.expectedVersion === undefined || options.expectedVersion === null
      ? existing.version
      : Number(options.expectedVersion);

  const aggiornati = await prisma.clubEvent.updateMany({
    where: { id: existing.id, version: attesa },
    data: {
      ...colonne,
      legacy_id: existing.legacy_id,
      group_ids: colonne.group_ids ?? undefined,
      trainer_ids: colonne.trainer_ids ?? undefined,
      payload: colonne.payload as any,
      version: { increment: 1 },
    },
  });

  if (aggiornati.count === 0) {
    throw new Error(
      "L'evento e stato modificato da qualcun altro: ricarica la pagina e riprova",
    );
  }

  await projectEventsToClubColumn(organizationId, existing.kind as EventKind);

  await recordAuditEvent({
    action:
      colonne.status === "cancelled" && existing.status !== "cancelled"
        ? AUDIT_ACTIONS.eventCancelled
        : AUDIT_ACTIONS.eventUpdated,
    actorUserId: attore.userId || null,
    actorEmail: attore.email || null,
    actorRole: scope.activeRole || null,
    organizationId,
    resource: "club_events",
    resourceId: existing.id,
    metadata: {
      kind: existing.kind,
      statusFrom: existing.status,
      statusTo: colonne.status,
    },
  });

  return prisma.clubEvent.findUnique({ where: { id: existing.id } });
};

/* ====================================================== convocazioni ===== */

export type ConvocationInput = {
  athleteId: string;
  status?: unknown;
  isExtraCategory?: boolean;
};

/**
 * La convocazione come **fatto**, non come chiave di dizionario.
 *
 * Prima viveva dentro il payload della gara in dieci grafie diverse, e a un
 * campo di dizionario non si puo dare un permesso, una notifica ne un audit.
 * Adesso e una colonna su una riga che dice chi, quando e per quale evento.
 *
 * **Non tocca ne la presenza ne la risposta della famiglia**: sono tre colonne
 * dello stesso fatto con tre scrittori distinti (ADR-0086, esteso da
 * ADR-0099). Una promessa non diventa mai una presenza.
 */
export const saveEventConvocations = async (
  scope: EventsScope,
  idOrLegacyId: string,
  entries: readonly ConvocationInput[],
  attore: Attore = {},
) => {
  assertEventsPermission(scope, "events.convoke");
  const organizationId = requireActiveOrganization(scope);

  const event = await findClubEvent(organizationId, idOrLegacyId);
  if (!event) throw new Error("Evento non trovato");
  assertActiveClub(scope, event.organization_id, "l'evento");

  const normalizzate = entries
    .map((entry) => ({
      athleteId: asText(entry.athleteId),
      status: normalizeConvocationStatus(entry.status ?? "convocated"),
      isExtraCategory: Boolean(entry.isExtraCategory),
    }))
    .filter((entry) => entry.athleteId && entry.status);

  const convocati = normalizzate.filter(
    (entry) => entry.status === "convocated",
  );
  assertEventHasRoom(event.capacity, 0, convocati.length);

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    /*
      Chi non compare piu nell'elenco torna **indeciso**, non «escluso»:
      togliere un nome da una lista non e la stessa cosa che dire a un ragazzo
      che non gioca, e lo stato deve saper distinguere le due cose.
    */
    await tx.clubEventParticipant.updateMany({
      where: {
        organization_id: organizationId,
        event_id: event.id,
        athlete_id: { notIn: normalizzate.map((entry) => entry.athleteId) },
      },
      data: { convocation_status: null, convocated_at: null, convocated_by: null },
    });

    for (const entry of normalizzate) {
      await tx.clubEventParticipant.upsert({
        where: {
          organization_id_event_id_athlete_id: {
            organization_id: organizationId,
            event_id: event.id,
            athlete_id: entry.athleteId,
          },
        },
        update: {
          convocation_status: entry.status,
          convocated_at: now,
          convocated_by: attore.userId || null,
          is_extra_category: entry.isExtraCategory,
        },
        create: {
          organization_id: organizationId,
          event_id: event.id,
          athlete_id: entry.athleteId,
          legacy_training_id: event.legacy_id,
          status: "pending",
          convocation_status: entry.status,
          convocated_at: now,
          convocated_by: attore.userId || null,
          is_extra_category: entry.isExtraCategory,
        },
      });
    }

    await tx.clubEvent.update({
      where: { id: event.id },
      data: { convocation_status: "completed", version: { increment: 1 } },
    });
  });

  await projectEventsToClubColumn(organizationId, event.kind as EventKind);

  await recordAuditEvent({
    action: AUDIT_ACTIONS.eventConvocationsSaved,
    actorUserId: attore.userId || null,
    actorEmail: attore.email || null,
    actorRole: scope.activeRole || null,
    organizationId,
    resource: "club_event_participants",
    resourceId: event.id,
    metadata: { convocati: convocati.length, totale: normalizzate.length },
  });

  return prisma.clubEventParticipant.findMany({
    where: { organization_id: organizationId, event_id: event.id },
    orderBy: { athlete_id: "asc" },
  });
};

/* ========================================================== presenze ===== */

export type AttendanceInput = {
  athleteId: string;
  status: string;
  notes?: string | null;
};

/**
 * L'appello.
 *
 * **Una sola scrittura, in un solo posto.** Prima
 * `saveTrainingAttendance` scriveva lo stesso fatto in tre posti — la tabella,
 * `clubs.trainings[].attendance` e `club_resource_items.payload.attendance` —
 * e le due schermate dell'allenatore rileggevano la **copia JSON** mentre la
 * rendicontazione dei contributi pubblici leggeva la **tabella**. Erano due
 * verita sullo stesso appello, e nessuno poteva accorgersene guardandone una.
 *
 * Non tocca ne la convocazione ne la risposta della famiglia.
 */
export const saveEventAttendance = async (
  scope: EventsScope,
  idOrLegacyId: string,
  entries: readonly AttendanceInput[],
  attore: Attore = {},
) => {
  assertEventsPermission(scope, "events.attendance");
  const organizationId = requireActiveOrganization(scope);

  const event = await findClubEvent(organizationId, idOrLegacyId);
  if (!event) throw new Error("Evento non trovato");
  assertActiveClub(scope, event.organization_id, "l'evento");

  const normalizzate = entries
    .map((entry) => ({
      athleteId: asText(entry.athleteId),
      status: asText(entry.status).toLowerCase() || "pending",
      notes: asText(entry.notes) || null,
    }))
    .filter((entry) => entry.athleteId);

  await prisma.$transaction(async (tx) => {
    for (const entry of normalizzate) {
      await tx.clubEventParticipant.upsert({
        where: {
          organization_id_event_id_athlete_id: {
            organization_id: organizationId,
            event_id: event.id,
            athlete_id: entry.athleteId,
          },
        },
        update: { status: entry.status, notes: entry.notes },
        create: {
          organization_id: organizationId,
          event_id: event.id,
          athlete_id: entry.athleteId,
          legacy_training_id: event.legacy_id,
          status: entry.status,
          notes: entry.notes,
        },
      });
    }
  });

  await recordAuditEvent({
    action: AUDIT_ACTIONS.eventAttendanceRecorded,
    actorUserId: attore.userId || null,
    actorEmail: attore.email || null,
    actorRole: scope.activeRole || null,
    organizationId,
    resource: "club_event_participants",
    resourceId: event.id,
    metadata: { registrate: normalizzate.length },
  });

  return prisma.clubEventParticipant.findMany({
    where: { organization_id: organizationId, event_id: event.id },
    orderBy: { athlete_id: "asc" },
  });
};

export const listEventParticipants = async (
  scope: EventsScope,
  idOrLegacyId: string,
) => {
  assertEventsPermission(scope, "events.read");
  const organizationId = requireActiveOrganization(scope);

  const event = await findClubEvent(organizationId, idOrLegacyId);
  if (!event) return [];
  assertActiveClub(scope, event.organization_id, "l'evento");

  return prisma.clubEventParticipant.findMany({
    where: { organization_id: organizationId, event_id: event.id },
    orderBy: { athlete_id: "asc" },
  });
};

/**
 * **Cancellare un evento: solo se non ha una storia.**
 *
 * Un evento a cui qualcuno ha risposto, su cui e stato fatto l'appello o per
 * cui e stata salvata una convocazione **non si cancella**: si annulla, e la
 * storia resta leggibile. E la stessa regola con cui la Wave 4 ha difeso le
 * rate con storia economica — la distinzione non e fra i ruoli, e fra cio che
 * ha lasciato una traccia e cio che non ne ha lasciata.
 *
 * Serve alla rigenerazione del programma settimanale, che ripulisce cio che ha
 * generato e non ancora avuto luogo.
 */
export const deleteClubEvent = async (
  scope: EventsScope,
  idOrLegacyId: string,
  attore: Attore = {},
) => {
  assertEventsPermission(scope, "events.manage");
  const organizationId = requireActiveOrganization(scope);

  const event = await findClubEvent(organizationId, idOrLegacyId);
  if (!event) throw new Error("Evento non trovato");
  assertActiveClub(scope, event.organization_id, "l'evento");

  const partecipanti = await prisma.clubEventParticipant.count({
    where: { organization_id: organizationId, event_id: event.id },
  });

  if (partecipanti > 0) {
    throw new Error(
      "Questo evento ha gia una storia — presenze, convocazioni o risposte delle famiglie: si annulla, non si cancella",
    );
  }

  await prisma.clubEvent.delete({ where: { id: event.id } });
  await projectEventsToClubColumn(organizationId, event.kind as EventKind);

  await recordAuditEvent({
    action: AUDIT_ACTIONS.eventCancelled,
    actorUserId: attore.userId || null,
    actorEmail: attore.email || null,
    actorRole: scope.activeRole || null,
    organizationId,
    resource: "club_events",
    resourceId: event.id,
    metadata: { kind: event.kind, cancellato: true },
  });

  return { id: event.id };
};

/**
 * La creazione in blocco, per la generazione dal programma settimanale.
 *
 * Una sola proiezione alla fine invece di una per evento: generare un mese di
 * allenamenti riscriveva la colonna del club trenta volte, ed era la ragione
 * per cui la generazione impiegava secondi.
 */
export const createClubEventsBatch = async (
  scope: EventsScope,
  kind: EventKind,
  inputs: readonly unknown[],
  attore: Attore = {},
) => {
  assertEventsPermission(scope, "events.manage");
  const organizationId = requireActiveOrganization(scope);

  const righe = [] as any[];
  for (const input of inputs) {
    const colonne = toEventColumns(normalizeEventKind(kind), input);
    righe.push({
      organization_id: organizationId,
      ...colonne,
      group_ids: colonne.group_ids ?? undefined,
      trainer_ids: colonne.trainer_ids ?? undefined,
      payload: colonne.payload as any,
      created_by: attore.userId || null,
    });
  }

  if (!righe.length) return [];

  /*
    `skipDuplicates` sulla chiave (club, tipo, identificativo storico): la
    generazione e **ripetibile**, e rilanciarla su un intervallo che si
    sovrappone non deve produrre doppioni. Prima la deduplicazione era una
    `Set` di chiavi costruita nel browser, e valeva finche nessun altro
    salvava nello stesso momento.
  */
  await prisma.clubEvent.createMany({ data: righe, skipDuplicates: true });
  await projectEventsToClubColumn(organizationId, kind);

  await recordAuditEvent({
    action: AUDIT_ACTIONS.eventCreated,
    actorUserId: attore.userId || null,
    actorEmail: attore.email || null,
    actorRole: scope.activeRole || null,
    organizationId,
    resource: "club_events",
    resourceId: null,
    metadata: { kind, generati: righe.length },
  });

  return prisma.clubEvent.findMany({
    where: {
      organization_id: organizationId,
      kind,
      legacy_id: {
        in: righe
          .map((riga) => riga.legacy_id)
          .filter((value): value is string => Boolean(value)),
      },
    },
  });
};

export { toEventLegacyShape };
