import { prisma } from "./prisma";
import { assertActiveClub } from "@/lib/auth/active-club-boundary";
import { isTrainerAccessRole, normalizeAccessRole } from "@/lib/access-roles";
import { listClubEvents } from "./events";
import { toEventLegacyShape } from "@/lib/events/model";
import { sendNotificationEmails } from "./email/email-service";
import {
  attachEventParticipation,
  buildTrainerOperationalAlerts,
  getMatchConvocationDeadlineDays,
  TRAINER_OPERATIONAL_ALERT_TYPES,
  type TrainerOperationalAlert,
} from "@/lib/trainer-operational-alerts";

/**
 * **L'area dell'allenatore vista dal server.**
 *
 * ---
 *
 * ## Il difetto che questo modulo chiude
 *
 * `buildTrainerOperationalAlerts` girava **nel browser**. Il risultato veniva
 * spedito a `POST /api/v1/trainer/operational-alerts`, che lo normalizzava e
 * lo persisteva **cosi come arrivava**: titolo, testo, identificativo del
 * record e link dell'azione li dettava il client. La rotta controllava che il
 * tipo fosse uno dei due ammessi e nient'altro — quindi chiunque avesse una
 * sessione di allenatore poteva scriversi in bacheca una notifica con il testo
 * che voleva, riferita a un evento che non e nel suo perimetro, o far
 * **sparire** un avviso vero semplicemente non mandandolo (la rotta chiude
 * tutto cio che non riceve).
 *
 * Non e una questione di fiducia nell'allenatore: e che una notifica e un
 * **fatto del club**, e un fatto che il destinatario puo dettare non e un
 * fatto. Qui il contenuto lo calcola il server, dai suoi dati, con il
 * perimetro gia applicato da `listClubEvents`.
 *
 * ## Perche il calcolo resta nel modulo puro
 *
 * `src/lib/trainer-operational-alerts.ts` non si duplica: e lo **stesso**
 * modulo che disegna i badge «Presenze mancanti» e «Convocazioni mancanti»
 * dentro la dashboard. Se la regola vivesse in due posti, la pastiglia rossa
 * sulla scheda e la notifica in elenco potrebbero dire due cose diverse sullo
 * stesso allenamento — ed e esattamente il difetto che la Wave 4 ha pagato sui
 * pagamenti. Il server **chiama** la regola, non la riscrive.
 *
 * ## Cosa questo modulo NON fa
 *
 * Non legge il club per conto della dashboard — lo fa gia
 * `GET /api/v1/trainer/preferences` — e non tiene una seconda idea di chi sia
 * l'allenatore che sta guardando: il perimetro sugli eventi lo applica
 * `listClubEvents`, quello sugli atleti lo applica la stessa regola di
 * categoria che usa la schermata. Qui si mettono insieme, non si reinventano.
 */

const asText = (value: unknown) => String(value ?? "").trim();

const negato = (messaggio: string) => new Error(`Accesso negato: ${messaggio}`);

export type TrainerAreaScope = {
  userId?: string | null;
  activeOrganizationId?: string | null;
  activeRole?: string | null;
  allowedOrganizationIds?: string[];
};

/**
 * L'area dell'allenatore e dell'allenatore.
 *
 * Non e una scorciatoia sul catalogo dei permessi: e il fatto che queste
 * letture rispondono alla domanda «cosa devo fare **io** oggi». Una segretaria
 * ha la stessa informazione dalla propria dashboard, con il proprio perimetro;
 * farla passare di qui le darebbe la lista di un allenatore scelto a caso —
 * quello collegato alla sua stessa utenza, cioe nessuno.
 */
const assertTrainerArea = (scope: TrainerAreaScope) => {
  if (!isTrainerAccessRole(scope.activeRole)) {
    throw negato("area allenatore");
  }
  const organizationId = asText(scope.activeOrganizationId);
  if (!organizationId) throw negato("nessun club attivo selezionato");
  if (!asText(scope.userId)) throw negato("sessione senza utente");
  return organizationId;
};

/* ================================================ il perimetro letto ===== */

type TrainerPerimeter = {
  /** Le categorie del club, per risolvere un identificativo in un'etichetta. */
  categories: any[];
  /** Le categorie assegnate a chi sta guardando. */
  assignedCategories: any[];
  /** Gli atleti attivi del club: il taglio per categoria lo fa la regola pura. */
  athletes: any[];
  matchConvocationDeadlineDays: number;
};

const raccogliCategorie = (value: unknown): any[] =>
  Array.isArray(value)
    ? value
        .map((entry) =>
          entry && typeof entry === "object"
            ? {
                id: asText((entry as any).id ?? (entry as any).value),
                name: asText(
                  (entry as any).name ??
                    (entry as any).label ??
                    (entry as any).id,
                ),
              }
            : { id: asText(entry), name: asText(entry) },
        )
        .filter((entry) => entry.id || entry.name)
    : [];

/**
 * Il profilo allenatore collegato a questa utenza.
 *
 * Cerca **sia** in `clubs.trainers` **sia** in `clubs.staff_members`: un club
 * su tre registra i propri allenatori come staff con ruolo «allenatore», e
 * cercarli in un posto solo vuol dire che meta degli allenatori non ha
 * perimetro e vede zero avvisi — un silenzio che sembra «tutto a posto».
 */
const trovaProfilo = (club: any, userId: string, email: string | null) => {
  const pool = [
    ...(Array.isArray(club?.trainers) ? club.trainers : []),
    ...(Array.isArray(club?.staff_members) ? club.staff_members : []),
  ] as any[];

  return (
    pool.find((entry) => {
      const source =
        entry?.data && typeof entry.data === "object" ? entry.data : {};
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
        (Boolean(email) && emails.includes(asText(email).toLowerCase()))
      );
    }) || null
  );
};

const readTrainerPerimeter = async (
  organizationId: string,
  userId: string,
): Promise<TrainerPerimeter> => {
  const [club, user] = await Promise.all([
    prisma.club.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        categories: true,
        trainers: true,
        staff_members: true,
        settings: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    }),
  ]);

  if (!club) throw new Error("Club non trovato");

  const profilo = trovaProfilo(club, userId, user?.email ?? null);
  const source =
    profilo?.data && typeof profilo.data === "object" ? profilo.data : {};
  const categories = raccogliCategorie(club.categories);
  const assignedCategories = raccogliCategorie(
    Array.isArray(profilo?.categories)
      ? profilo.categories
      : Array.isArray(source?.categories)
        ? source.categories
        : [],
  );

  /*
    Gli atleti si leggono **tutti quelli attivi del club** e si tagliano dopo
    con la regola di categoria, che e la stessa che la schermata applica ai
    propri badge. Filtrarli qui in SQL vorrebbe dire una seconda idea di «e
    della mia categoria» — e le due divergerebbero al primo club che scrive la
    categoria per nome invece che per identificativo, cioe subito.
  */
  const athletes = await prisma.athlete.findMany({
    where: { organization_id: organizationId },
    select: {
      id: true,
      status: true,
      category_id: true,
      category_name: true,
      data: true,
    },
  });

  const settings =
    club.settings && typeof club.settings === "object" ? club.settings : {};

  return {
    categories,
    assignedCategories,
    athletes: athletes.filter((athlete) => {
      const stato = asText(athlete.status).toLowerCase();
      return !stato || ["active", "attivo", "enabled", "abilitato"].includes(stato);
    }),
    matchConvocationDeadlineDays: getMatchConvocationDeadlineDays(settings),
  };
};

/* ============================================= gli avvisi, dal server ==== */

/**
 * Gli avvisi operativi dell'allenatore, **calcolati qui**.
 *
 * Il perimetro sugli eventi non e un parametro: lo applica `listClubEvents`
 * sul ruolo attivo. Chiamare questa funzione con lo scope di un allenatore
 * restituisce i suoi eventi e nessun altro, e non esiste un argomento da
 * omettere per uscirne.
 */
export const computeTrainerOperationalAlerts = async (
  scope: TrainerAreaScope,
  options: { now?: Date } = {},
): Promise<TrainerOperationalAlert[]> => {
  const organizationId = assertTrainerArea(scope);
  const now = options.now ?? new Date();

  const perimetro = await readTrainerPerimeter(
    organizationId,
    asText(scope.userId),
  );

  const [allenamenti, gare] = await Promise.all([
    listClubEvents(scope as any, { kind: "training" }),
    listClubEvents(scope as any, { kind: "match" }),
  ]);

  const righe = [...allenamenti, ...gare];
  /*
    Il confine si verifica **anche** su righe gia filtrate per club: il filtro
    e una query, il confine e una regola. E la stessa cautela che la Wave 4 ha
    scritto sugli appuntamenti, per la stessa ragione — la query cambia, la
    regola no.
  */
  for (const riga of righe) {
    assertActiveClub(scope, riga.organization_id, "l'evento");
  }

  const partecipazioni = righe.length
    ? await prisma.clubEventParticipant.findMany({
        where: {
          organization_id: organizationId,
          event_id: { in: righe.map((riga) => riga.id) },
        },
      })
    : [];

  const perEvento = new Map<string, any[]>();
  for (const partecipazione of partecipazioni) {
    const chiave = asText(partecipazione.event_id);
    if (!perEvento.has(chiave)) perEvento.set(chiave, []);
    perEvento.get(chiave)?.push(partecipazione);
  }

  /*
    **La presenza si legge dalle righe, non dalla copia JSON.**

    La forma storica porta ancora `attendance` dentro il payload: e la copia
    che `saveTrainingAttendance` scriveva accanto alla tabella, e che poteva
    restare indietro. Qui viene **sovrascritta** dalle righe di
    `club_event_participants`, che sono l'unica verita sull'appello
    (ADR-0099). Se le due divergono vince la riga, e l'avviso dice il vero.
  */
  const conPartecipazione = (riga: (typeof righe)[number]) =>
    attachEventParticipation(
      toEventLegacyShape(riga),
      perEvento.get(asText(riga.id)) || [],
    );

  return buildTrainerOperationalAlerts({
    trainings: allenamenti.map(conPartecipazione),
    matches: gare.map(conPartecipazione),
    assignedAthletes: perimetro.athletes,
    assignedCategories: perimetro.assignedCategories,
    categories: perimetro.categories,
    matchConvocationDeadlineDays: perimetro.matchConvocationDeadlineDays,
    now,
  });
};

const chiaveNotifica = (notification: { data?: any }) => {
  const data =
    notification?.data && typeof notification.data === "object"
      ? notification.data
      : {};

  return asText(data.key || data.notificationKey);
};

/**
 * Allinea le notifiche persistite agli avvisi **calcolati adesso**.
 *
 * Tre gesti, in quest'ordine: si chiude il doppione (la stessa chiave scritta
 * due volte da due caricamenti concorrenti), si aggiorna o si crea cio che e
 * ancora vero, si segna risolto cio che non lo e piu. La chiave e
 * `missing-attendance:<evento>`: e per quello che una presenza registrata
 * **spegne** l'avviso invece di lasciarne una copia in elenco per sempre.
 */
export const syncTrainerOperationalAlerts = async (
  scope: TrainerAreaScope,
  options: { now?: Date } = {},
) => {
  const organizationId = assertTrainerArea(scope);
  const userId = asText(scope.userId);
  const alerts = await computeTrainerOperationalAlerts(scope, options);
  const chiaviAttive = new Set(alerts.map((alert) => alert.key));

  const esistenti = await prisma.notification.findMany({
    where: {
      organization_id: organizationId,
      user_id: userId,
      type: { in: [...TRAINER_OPERATIONAL_ALERT_TYPES] },
    },
    orderBy: { created_at: "asc" },
  });

  const perChiave = new Map<string, (typeof esistenti)[number]>();

  for (const notifica of esistenti) {
    const chiave = chiaveNotifica(notifica);
    if (!chiave) continue;

    if (!perChiave.has(chiave)) {
      perChiave.set(chiave, notifica);
      continue;
    }

    await prisma.notification.update({
      where: { id: notifica.id },
      data: {
        read: true,
        data: {
          ...(notifica.data && typeof notifica.data === "object"
            ? notifica.data
            : {}),
          resolved: true,
          resolvedAt: new Date().toISOString(),
          duplicate: true,
        },
      },
    });
  }

  for (const alert of alerts) {
    const esistente = perChiave.get(alert.key);
    const data = {
      key: alert.key,
      recordId: alert.recordId,
      actionHref: alert.actionHref,
      resolved: false,
    };

    if (esistente) {
      await prisma.notification.update({
        where: { id: esistente.id },
        data: {
          title: alert.title,
          message: alert.message,
          type: alert.type,
          read: false,
          data,
        },
      });
      continue;
    }

    await prisma.notification.create({
      data: {
        organization_id: organizationId,
        user_id: userId,
        title: alert.title,
        message: alert.message,
        type: alert.type,
        read: false,
        data,
      },
    });
    await sendNotificationEmails([userId]);
  }

  for (const notifica of esistenti) {
    const chiave = chiaveNotifica(notifica);
    if (!chiave || chiaviAttive.has(chiave)) continue;

    await prisma.notification.update({
      where: { id: notifica.id },
      data: {
        read: true,
        data: {
          ...(notifica.data && typeof notifica.data === "object"
            ? notifica.data
            : {}),
          resolved: true,
          resolvedAt: new Date().toISOString(),
        },
      },
    });
  }

  return { alerts, synced: alerts.length };
};

/** Vero se il ruolo attivo e quello per cui questo modulo esiste. */
export const isTrainerArea = (role?: string | null) =>
  normalizeAccessRole(role) === "trainer";
