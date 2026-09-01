import { prisma } from "./prisma";
import { assertActiveClub } from "@/lib/auth/active-club-boundary";
import { normalizeAccessRole } from "@/lib/access-roles";
import { roleHasPermission } from "@/lib/permissions/catalog";
import {
  AUDIT_ACTIONS,
  recordAuditEvent,
  recordPermissionDenied,
} from "./audit";
import {
  assertEventHasRoom,
  assertEventTransition,
  findEventOverlaps,
  isWithinFieldAvailability,
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

/**
 * Il permesso di ruolo su un evento — e la riga che il rifiuto lascia.
 *
 * E `async` perche il diniego si **scrive** prima di essere lanciato
 * (`recordPermissionDenied`). Il prezzo e un `await` su ogni chiamata, e il
 * rischio di dimenticarlo — una guardia attesa a meta non ferma niente — lo
 * presidia `tests/server/guardie-attese.test.mjs`, che rilegge questo file.
 */
const assertEventsPermission = async (
  scope: EventsScope,
  permesso:
    | "events.read"
    | "events.manage"
    | "events.convoke"
    | "events.attendance"
    | "rsvp.read",
) => {
  if (!roleHasPermission(scope.activeRole, permesso)) {
    await recordPermissionDenied({
      scope,
      permission: permesso,
      resource: "club_events",
    });
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

export type TrainerEventPerimeter = {
  categoryIds: string[];
  groupIds: string[];
};

/**
 * **Il perimetro dell'allenatore: una domanda, una funzione, un proprietario.**
 *
 * ---
 *
 * ## La contraddizione che questa funzione chiude
 *
 * Il preambolo di questo file (punto 3) prometteva il perimetro riga per riga
 * su **ogni** funzione pubblica; il commento che stava qui diceva l'opposto —
 * «il gruppo resta un filtro e non un confine» — e la seconda frase vinceva,
 * perche era quella scritta nel codice: il perimetro lo applicava
 * `listClubEvents` e nessun'altra delle nove funzioni. Un allenatore che
 * conoscesse un `eventId` fuori dal proprio perimetro poteva farci appello e
 * convocazioni, perche la chiave di ruolo `events.convoke` ce l'ha (W6-22,
 * W6-23).
 *
 * **La regola e una sola, ed e questa**: in *lettura di elenco* il perimetro e
 * un **filtro** — un calendario piu corto non e un rifiuto — ma su ogni
 * **atto** (leggere una singola riga, creare, modificare, convocare, fare
 * l'appello, cancellare) e un **confine**. La ragione non e simmetria: un atto
 * fuori perimetro e un atto su atleti che non sono suoi, e la convocazione di
 * un ragazzo di un'altra squadra non e un errore di visualizzazione.
 *
 * ## Perche vive qui e non in quattro posti
 *
 * La stessa domanda — «cosa vede questo allenatore» — aveva **quattro**
 * risposte, e due divergevano: `assertTrainerCanSeeEvent` in `rsvp.ts` leggeva
 * solo `clubs.trainers`, questa leggeva anche `clubs.staff_members`. Un club
 * su tre registra i propri allenatori come staff: quelli passavano il filtro
 * degli eventi e venivano **respinti sull'RSVP dello stesso allenamento**
 * (W6-24). Adesso `rsvp.ts` e `trainer-area.ts` chiamano questa.
 */
/**
 * **Quale scheda del club e questa utenza.**
 *
 * Cerca in `clubs.trainers` **e** in `clubs.staff_members`, perche un club su
 * tre registra i propri allenatori come staff con ruolo «allenatore»:
 * cercarli in un posto solo vuol dice che meta degli allenatori non ha
 * perimetro e vede zero eventi — un silenzio che sembra «tutto a posto».
 *
 * Esportata perche il legame utenza ↔ scheda serve anche fuori dagli eventi:
 * il perimetro degli avvisi e «i miei compensi» chiedono la stessa cosa, e la
 * chiedono a questa (W6-24, W6-32).
 */
export const findClubTrainerProfile = (
  club: { trainers?: unknown; staff_members?: unknown } | null | undefined,
  userId: string,
  email?: string | null,
): Record<string, any> | null => {
  const pool = [
    ...(Array.isArray(club?.trainers) ? (club.trainers as any[]) : []),
    ...(Array.isArray(club?.staff_members) ? (club.staff_members as any[]) : []),
  ];

  const cercata = asText(email).toLowerCase();

  return (
    pool.find((entry) => {
      const source =
        entry?.data && typeof entry.data === "object" ? entry.data : {};
      const identita = [
        /*
          `entry.id` e la terza forma di legame, e mancava: un club che scrive
          la scheda dell'allenatore usando **l'identificativo dell'utenza** come
          id del profilo non veniva riconosciuto qui, mentre `rsvp.ts` lo
          riconosceva. Due proprietari, due risposte opposte sullo stesso
          ingresso.
        */
        entry?.id,
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
        (Boolean(cercata) && emails.includes(cercata))
      );
    }) || null
  );
};

export const readTrainerEventPerimeter = async (
  organizationId: string,
  userId: string,
): Promise<TrainerEventPerimeter | null> => {
  const club = await prisma.club.findUnique({
    where: { id: organizationId },
    select: { trainers: true, staff_members: true, categories: true },
  });
  if (!club) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  const profilo = findClubTrainerProfile(club, userId, user?.email);

  /*
    **Un allenatore senza riga in `clubs.trainers` non legge tutto il club.**

    Qui si restituiva l'insieme vuoto, e il chiamante applica il filtro solo
    `if (categorie.size || gruppi.size)`: un utente con ruolo `trainer` ma
    senza profilo JSON — un ruolo assegnato e la scheda mai compilata, che
    capita — leggeva **l'intero calendario del club**. La funzione gemella di
    `resources.ts`, sulla stessa domanda, restituisce `[]` e nega tutto: due
    proprietari e due risposte opposte sullo stesso ingresso, che e la classe
    del difetto D-3.

    `null` dice «non lo so», e il chiamante lo tratta come «nessun evento».
    Un perimetro che fallisce **chiuso** manda una segretaria a completare una
    scheda; un perimetro che fallisce aperto non manda nessuno da nessuna
    parte, perche nessuno se ne accorge.
  */
  if (!profilo) return null;

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

/**
 * La forma minima di un evento su cui si giudica il perimetro.
 *
 * E la riga, oppure — nella creazione — le **colonne candidate**: il perimetro
 * si verifica su cio che si sta per scrivere, non su cio che e stato scritto,
 * altrimenti un allenatore creerebbe l'allenamento della squadra di un altro e
 * lo scoprirebbe solo chi lo legge.
 */
export type TrainerPerimeterCandidate = {
  id?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  group_ids?: unknown;
};

/**
 * **Il gruppo vince sulla categoria quando l'evento lo dichiara** (ADR-0055).
 *
 * Tre casi, in quest'ordine, ed e la regola che `trainerFollowsGroup` scrive
 * gia per l'RSVP:
 *
 * 1. l'evento dichiara gruppi **e** l'allenatore ne dichiara: decide
 *    l'intersezione dei gruppi. E il caso del club multi-sede, dove il mister
 *    dei `Pulcini · Scauri` non e quello dei `Pulcini · Santi Cosma`;
 * 2. uno dei due non dichiara gruppi: si ricade sulla **categoria**, che e il
 *    comportamento precedente — un club che non ha configurato le sedi non
 *    deve perdere l'accesso da un giorno all'altro;
 * 3. niente in comune: **falso**. Un evento senza categoria e senza gruppi non
 *    e «di tutti»: e di nessuno, e un perimetro che fallisce chiuso manda una
 *    segretaria a completare una scheda, mentre uno che fallisce aperto non
 *    manda nessuno da nessuna parte.
 */
export const eventWithinTrainerPerimeter = (
  perimetro: TrainerEventPerimeter | null,
  evento: TrainerPerimeterCandidate,
) => {
  if (!perimetro) return false;

  const gruppiEvento = (
    Array.isArray(evento.group_ids) ? (evento.group_ids as unknown[]) : []
  )
    .map(asText)
    .filter(Boolean);

  if (gruppiEvento.length && perimetro.groupIds.length) {
    const suoi = new Set(perimetro.groupIds);
    return gruppiEvento.some((value) => suoi.has(value));
  }

  const categorie = new Set(
    perimetro.categoryIds.map((value) => value.toLowerCase()),
  );

  return [evento.category_id, evento.category_name]
    .map((value) => asText(value).toLowerCase())
    .filter(Boolean)
    .some((value) => categorie.has(value));
};

/**
 * Il perimetro applicato a un **atto**, e la riga che il rifiuto lascia.
 *
 * E `async` per la stessa ragione di `assertEventsPermission`: il diniego si
 * **scrive** prima di essere lanciato. Vale quindi lo stesso pericolo — una
 * guardia attesa a meta non ferma niente — e lo stesso presidio,
 * `tests/server/guardie-attese.test.mjs`.
 *
 * Accetta **piu** candidati perche la creazione in blocco ne ha molti e il
 * perimetro va letto una volta sola: la generazione di un mese di allenamenti
 * non deve rileggere il club trenta volte. Basta un candidato fuori perche
 * l'intero atto sia rifiutato — un blocco accettato a meta lascerebbe
 * l'allenatore a indovinare quali righe sono nate.
 */
const assertTrainerEventPerimeter = async (
  scope: EventsScope,
  candidati: readonly TrainerPerimeterCandidate[],
  permesso: string,
) => {
  if (normalizeAccessRole(scope.activeRole) !== "trainer") return;

  const organizationId = requireActiveOrganization(scope);
  const userId = asText(scope.userId);

  const perimetro = userId
    ? await readTrainerEventPerimeter(organizationId, userId)
    : null;

  const fuori = candidati.filter(
    (candidato) => !eventWithinTrainerPerimeter(perimetro, candidato),
  );
  if (!fuori.length) return;

  await recordPermissionDenied({
    scope,
    permission: permesso,
    resource: "club_events",
    resourceId: asText(fuori[0]?.id) || null,
    metadata: {
      motivo: perimetro
        ? "evento fuori dal perimetro dell'allenatore"
        : "nessun profilo allenatore in questo club",
      fuoriPerimetro: fuori.length,
    },
  });

  throw negato(
    perimetro
      ? "questo evento non e di una tua categoria ne di un tuo gruppo"
      : "non risulti fra gli allenatori di questo club",
  );
};

export const listClubEvents = async (
  scope: EventsScope,
  filters: ListEventsFilters = {},
) => {
  await assertEventsPermission(scope, "events.read");
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
    const perimetro = await readTrainerEventPerimeter(
      organizationId,
      scope.userId,
    );
    /*
      **Un perimetro vuoto non e «nessun perimetro».**

      Qui l'elenco resta un **filtro** — un calendario piu corto non e un
      rifiuto — ma il filtro non si spegne mai: un allenatore senza profilo, o
      con un profilo senza categorie ne gruppi, legge zero eventi e non
      l'intero calendario del club. Il giudizio riga per riga e lo stesso che
      la guardia applica agli atti: una funzione sola, cosi il calendario che
      l'allenatore vede e l'insieme degli eventi su cui puo agire.
    */
    if (!perimetro) return [];
    rows = rows.filter((row) => eventWithinTrainerPerimeter(perimetro, row));
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
  await assertEventsPermission(scope, "events.read");
  const organizationId = requireActiveOrganization(scope);
  const row = await findClubEvent(organizationId, idOrLegacyId, kind);
  if (!row) return null;

  assertActiveClub(scope, row.organization_id, "l'evento");
  await assertTrainerEventPerimeter(scope, [row], "events.read");
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

/**
 * **Il campo aperto a quell'ora** (W5-11).
 *
 * La disponibilita per giorno della settimana era dichiarata dalle strutture e
 * non la leggeva nessuno: si poteva fissare un allenamento delle 23:00 su un
 * campo che chiude alle 20:00, e a scoprirlo era chi ci andava.
 */
const assertFieldIsOpen = async (
  organizationId: string,
  candidate: {
    structure_id: string | null;
    field_id: string | null;
    starts_at: Date;
    ends_at: Date | null;
  },
) => {
  if (!candidate.structure_id && !candidate.field_id) return;

  const club = await prisma.club.findUnique({
    where: { id: organizationId },
    select: { structures: true },
  });
  const strutture = Array.isArray(club?.structures) ? club.structures : [];

  const struttura = (strutture as any[]).find(
    (voce) => asText(voce?.id) === asText(candidate.structure_id),
  );
  if (!struttura) return;

  const campi = Array.isArray(struttura.fields) ? struttura.fields : [];
  const campo = candidate.field_id
    ? campi.find((voce: any) => asText(voce?.id) === asText(candidate.field_id))
    : campi[0];
  if (!campo) return;

  if (
    !isWithinFieldAvailability(
      campo.availability,
      candidate.starts_at,
      candidate.ends_at,
    )
  ) {
    throw new Error(
      `Il campo «${asText(campo.name) || "selezionato"}» non e disponibile in quel giorno e a quell'ora`,
    );
  }
};

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
  await assertEventsPermission(scope, "events.manage");
  const organizationId = requireActiveOrganization(scope);
  const colonne = toEventColumns(normalizeEventKind(kind), input);

  /*
    Il caso legittimo resta legittimo: l'allenatore che crea l'allenamento del
    **proprio** gruppo passa di qui senza accorgersene. Cio che non passa piu e
    l'allenamento creato per la squadra di un altro — che nessuna delle nove
    funzioni fermava, e che `listClubEvents` avrebbe poi nascosto a chi l'ha
    creato, lasciandolo visibile a tutti gli altri.
  */
  await assertTrainerEventPerimeter(scope, [colonne], "events.manage");

  await assertFieldIsOpen(organizationId, {
    structure_id: colonne.structure_id,
    field_id: colonne.field_id,
    starts_at: colonne.starts_at,
    ends_at: colonne.ends_at,
  });

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
  await assertEventsPermission(scope, "events.manage");
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

  /*
    **Si giudicano tutte e due le forme**: la riga com'e e la riga come
    diventerebbe. Controllare solo la prima lascerebbe spostare un proprio
    allenamento nel gruppo di un altro; controllare solo la seconda lascerebbe
    prendere l'allenamento di un altro e portarselo nel proprio.
  */
  await assertTrainerEventPerimeter(
    scope,
    [existing, colonne],
    "events.manage",
  );

  await assertFieldIsOpen(organizationId, {
    structure_id: colonne.structure_id,
    field_id: colonne.field_id,
    starts_at: colonne.starts_at,
    ends_at: colonne.ends_at,
  });

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
  await assertEventsPermission(scope, "events.convoke");
  const organizationId = requireActiveOrganization(scope);

  const event = await findClubEvent(organizationId, idOrLegacyId);
  if (!event) throw new Error("Evento non trovato");
  assertActiveClub(scope, event.organization_id, "l'evento");
  await assertTrainerEventPerimeter(scope, [event], "events.convoke");

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
  await assertEventsPermission(scope, "events.attendance");
  const organizationId = requireActiveOrganization(scope);

  const event = await findClubEvent(organizationId, idOrLegacyId);
  if (!event) throw new Error("Evento non trovato");
  assertActiveClub(scope, event.organization_id, "l'evento");
  await assertTrainerEventPerimeter(scope, [event], "events.attendance");

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
  await assertEventsPermission(scope, "events.read");
  const organizationId = requireActiveOrganization(scope);

  const event = await findClubEvent(organizationId, idOrLegacyId);
  if (!event) return [];
  assertActiveClub(scope, event.organization_id, "l'evento");
  await assertTrainerEventPerimeter(scope, [event], "events.read");

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
  await assertEventsPermission(scope, "events.manage");
  const organizationId = requireActiveOrganization(scope);

  const event = await findClubEvent(organizationId, idOrLegacyId);
  if (!event) throw new Error("Evento non trovato");
  assertActiveClub(scope, event.organization_id, "l'evento");
  await assertTrainerEventPerimeter(scope, [event], "events.manage");

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
  await assertEventsPermission(scope, "events.manage");
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
    Il perimetro si legge **una volta** per l'intero blocco: e la ragione per
    cui la guardia accetta un elenco invece di un candidato solo. Generare un
    mese di allenamenti non deve rileggere trenta volte la scheda
    dell'allenatore.
  */
  await assertTrainerEventPerimeter(scope, righe, "events.manage");

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
