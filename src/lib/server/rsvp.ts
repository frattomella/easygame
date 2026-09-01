import { prisma } from "./prisma";
import { formatAthleteNameLastFirst } from "@/lib/athlete-name-utils";
import { canParentAccessAthlete } from "./parent-dashboard";
import {
  AUDIT_ACTIONS,
  recordAuditEvent,
  recordPermissionDenied,
} from "./audit";
import type { OrganizationAccessScope } from "./auth";
import {
  assertCommunicationPermission,
  hasCommunicationPermission,
} from "@/lib/communications/permissions";
import { isTrainerAccessRole } from "@/lib/access-roles";
import {
  athleteMatchesAnyCategory,
  buildClubCategoryOptions,
} from "@/lib/category-utils";
import {
  eventWithinTrainerPerimeter,
  findClubEvent,
  readTrainerEventPerimeter,
} from "./events";
import {
  normalizeEventKind,
  toEventLegacyShape,
  type EventKind,
} from "@/lib/events/model";
import {
  athleteMatchesGroup,
  buildCategoryGroups,
  normalizeClubSites,
  readTrainingGroupIds,
  buildSiteIndex,
  type CategoryGroup,
} from "@/lib/club-sites";
import {
  getTrainingCategoryReferences,
  getTrainingDate,
  getTrainingStartTime,
  resolveCategoryLabelForTraining,
} from "@/lib/training-utils";
/*
  `normalizeTrainerList`, `trainerFollowsGroup` e `trainerHasCategory` non si
  importano piu: erano la **seconda** implementazione del perimetro
  dell'allenatore, quella che leggeva solo `clubs.trainers`. La risposta ora
  arriva da `events.ts` (W6-24).
*/
import {
  canAnswerRsvp,
  isCancelledEventStatus,
  normalizeRsvpStatus,
  readEventRsvpConfig,
  summarizeRsvp,
  type RsvpStatus,
  type RsvpSummary,
} from "@/lib/rsvp/model";

/**
 * L'RSVP lato server: **l'unico scrittore** di `training_attendance.rsvp_*`.
 *
 * ## L'invariante, in codice
 *
 * Nessuna scrittura di questo modulo tocca `status`, che e la **presenza**
 * registrata dall'allenatore e la colonna che
 * `src/lib/funding/attendance-measure.ts` legge per rendicontare i contributi
 * pubblici. L'`update` dell'upsert elenca solo i quattro campi `rsvp_*`; il
 * `create` deve per forza dare un valore a `status`, perche la colonna e
 * obbligatoria, e usa un valore **neutro** (vedi
 * `RSVP_NEUTRAL_ATTENDANCE_STATUS`).
 *
 * Al contrario, l'appello (`saveTrainingAttendance` in `simplified-db.ts`) non
 * scrive nessun campo `rsvp_*`: le due scritture convivono sulla stessa riga
 * senza sovrapporsi.
 *
 * ## Perche l'upsert e non un create
 *
 * La chiave unica `(organization_id, training_id, athlete_id)` esiste proprio
 * per questo: una famiglia che tocca due volte «Ci sara» — o due schede aperte,
 * o una richiesta ritentata dalla rete — deve lasciare **una** riga. Con un
 * `create` senza `where` unico si otterrebbero due risposte contraddittorie
 * sullo stesso evento, e quale delle due vince lo deciderebbe l'ordinamento di
 * una query.
 *
 * ## Chi puo rispondere
 *
 * Il legame con l'atleta — tutore dichiarato o l'atleta stesso — e il gate
 * vero, ed e quello che questo modulo verifica riusando
 * `canParentAccessAthlete`: la stessa regola con cui l'area genitore decide
 * cosa mostrare. Il permesso `rsvp.answer` viene poi chiesto alla matrice
 * condivisa sul **ruolo con cui si risponde**, cosi il giorno in cui la
 * matrice cambiasse idea la rotta si ferma senza che nessuno debba ricordarsi
 * di aggiornare anche qui.
 */

/**
 * Lo `status` con cui nasce una riga creata dalla **risposta** e non
 * dall'appello.
 *
 * `"pending"` e scelto leggendo chi consuma quella colonna:
 *
 *  - `isPresentAttendance` (misura presenze dei bandi) considera presente solo
 *    `present` / `presente`; con uno stato **non vuoto** e diverso da quelli
 *    non ricade nemmeno sul vecchio booleano `present`, quindi la riga non
 *    puo entrare in nessuna rendicontazione;
 *  - `normalizeAttendanceStatus` dell'area genitore lo classifica `unknown`,
 *    cioe «appello non ancora fatto», che e esattamente cio che e;
 *  - i conteggi presenti/assenti della dashboard famiglia lo escludono da
 *    entrambi i totali.
 *
 * La stringa vuota sarebbe stata piu ambigua: `isPresentAttendance` con
 * `status` vuoto ripiega su `record.present === true`, cioe su un campo che
 * questo modulo non controlla.
 */
export const RSVP_NEUTRAL_ATTENDANCE_STATUS = "pending";

/** Quanti giorni avanti si guarda quando il chiamante non lo dice. */
const DEFAULT_HORIZON_DAYS = 30;

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);

const asText = (value: unknown) => String(value ?? "").trim();

const sameId = (left: unknown, right: unknown) =>
  asText(left).toLowerCase() === asText(right).toLowerCase() && asText(left) !== "";

const accessDenied = (detail: string) => new Error(`Accesso negato: ${detail}`);

/* -------------------------------------------------------------- letture */

type ClubEventContext = {
  club: Record<string, any>;
  training: Record<string, any>;
  categoryOptions: ReturnType<typeof buildClubCategoryOptions>;
  groups: CategoryGroup[];
};

/*
  **La proiezione non e piu fra le colonne lette.**

  `trainings` stava qui per un solo lettore, `buildInvitations`, e portava con
  se il difetto: la colonna contiene i soli allenamenti, quindi l'elenco degli
  inviti non poteva contenere una gara nemmeno quando l'evento la chiedeva.
  Adesso gli eventi si leggono dalle righe (ADR-0098) e di questo club servono
  solo l'identita e cio che serve a collocare un atleta in una categoria o in
  un gruppo.
*/
const CLUB_SELECTION = {
  id: true,
  name: true,
  categories: true,
  club_sites: true,
  category_groups: true,
  trainers: true,
} as const;

/**
 * **L'evento a cui si risponde, letto dalla riga e non dalla proiezione.**
 *
 * Questa funzione leggeva `clubs.trainings`, che porta i soli **allenamenti**:
 * una risposta a una **gara** falliva con «Allenamento non trovato», e il
 * collaudo a runtime lo ha visto dove i test non potevano, perche il dominio
 * RSVP era gia pronto a ospitarla (ADR-0099) e nessuno lo aveva mai chiesto a
 * una gara.
 *
 * Adesso l'evento si cerca fra le righe — entrambi i tipi — e si restituisce
 * nella forma storica, che e cio che `readEventRsvpConfig` e
 * `buildEventContext` leggono. La proiezione resta per chi non e ancora
 * passato; questa strada non ci passa piu.
 */
const findTraining = async (organizationId: string, trainingId: string) => {
  const evento = await findClubEvent(organizationId, trainingId);
  return evento ? toEventLegacyShape(evento) : null;
};

const loadClub = async (organizationId: string) => {
  const club = await prisma.club.findUnique({
    where: { id: organizationId },
    select: CLUB_SELECTION,
  });

  if (!club) throw new Error("Club non trovato");
  return club as unknown as Record<string, any>;
};

const buildEventContext = (
  club: Record<string, any>,
  training: Record<string, any>,
): ClubEventContext => {
  const categoryOptions = buildClubCategoryOptions({
    clubCategories: club.categories,
  });
  const groups = buildCategoryGroups({
    categories: categoryOptions,
    sites: normalizeClubSites(club.club_sites),
    groups: club.category_groups,
  });

  return { club, training, categoryOptions, groups };
};

/**
 * Gli atleti attesi a un allenamento.
 *
 * **Prima il gruppo operativo, poi la categoria** (ADR-0055). Un allenamento
 * che dichiara i suoi gruppi riguarda solo gli atleti di quelle squadre: i
 * Pulcini di Scauri non compaiono nel «senza risposta» di un allenamento di
 * Santi Cosma. Un allenamento che non dichiara gruppi e un dato precedente e
 * ricade sulla categoria, che e cio che faceva prima.
 */
const resolveExpectedAthletes = (
  context: ClubEventContext,
  athletes: Record<string, any>[],
) => {
  const declaredGroupIds = readTrainingGroupIds(context.training);
  const siteIndex = buildSiteIndex(normalizeClubSites(context.club.club_sites));

  if (declaredGroupIds.length) {
    const groups = declaredGroupIds.map((id) => {
      const known = context.groups.find((group) => group.id === id);
      return known || { id, categoryId: "", siteId: "" };
    });

    return athletes.filter((athlete) =>
      groups.some((group) => athleteMatchesGroup(athlete, group, siteIndex)),
    );
  }

  const references = getTrainingCategoryReferences(context.training)
    .map(asText)
    .filter(Boolean);

  /*
    Un allenamento senza nessun riferimento di categoria riguarda tutti: e la
    forma con cui i club mono-categoria hanno sempre salvato i loro
    allenamenti, e restringere a zero atleti mostrerebbe un «senza risposta»
    vuoto proprio dove la funzione serve.
  */
  if (!references.length) return athletes;

  const matchingOptions = references.map((reference) => ({
    id: reference,
    name: reference,
  }));

  return athletes.filter((athlete) =>
    athleteMatchesAnyCategory(athlete, [
      ...matchingOptions,
      ...context.categoryOptions.filter((option) =>
        references.some(
          (reference) =>
            sameId(option.id, reference) || sameId(option.name, reference),
        ),
      ),
    ]),
  );
};

const loadClubAthletes = async (organizationId: string) => {
  const [athletes, memberships] = await Promise.all([
    prisma.athlete.findMany({
      where: { organization_id: organizationId },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        category_id: true,
        category_name: true,
        data: true,
      },
      orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
    }),
    prisma.athleteCategoryMembership.findMany({
      where: { organization_id: organizationId },
      select: {
        athlete_id: true,
        category_id: true,
        category_name: true,
        is_primary: true,
        site_id: true,
      },
    }),
  ]);

  const byAthlete = new Map<string, any[]>();
  memberships.forEach((membership) => {
    const key = asText(membership.athlete_id);
    if (!key) return;
    byAthlete.set(key, (byAthlete.get(key) || []).concat(membership));
  });

  return athletes.map((athlete) => ({
    ...athlete,
    category_memberships: byAthlete.get(asText(athlete.id)) || [],
  }));
};

/*
  **Il nome di una persona ha gia un proprietario.**

  Qui c'era una copia privata, e ce n'erano quattro in tutta la Wave: tre
  scrivevano «Nome Cognome», una «Cognome Nome», e nessuna leggeva le grafie
  alternative (`nome`, `cognome`, `fullName`) che il proprietario canonico
  gestisce. Lo stesso atleta compariva quindi in due ordini diversi fra
  l'email di un'automazione e l'elenco RSVP dell'allenatore, e un'anagrafica
  con i soli campi alternativi diventava «Atleta» in un messaggio e aveva il
  nome giusto ovunque altrove.
*/
const athleteDisplayName = (athlete: Record<string, any>) =>
  formatAthleteNameLastFirst(athlete);

const eventStartsAt = (training: unknown) => {
  const date = getTrainingDate(training);
  if (!date) return null;

  const time = getTrainingStartTime(training);
  const match = String(time || "").match(/(\d{1,2}):(\d{2})/);
  if (match) {
    date.setHours(Number(match[1]) || 0, Number(match[2]) || 0, 0, 0);
  }

  return date;
};

/* ------------------------------------------------------ scrittura (RSVP) */

export type AnswerRsvpInput = {
  /**
   * Il club. Se arriva dal client viene **verificato** contro il club
   * dell'atleta e non usato come filtro: un `organization_id` scelto da chi
   * chiama non deve mai decidere su quali righe si scrive (CLAUDE.md §8).
   */
  organizationId?: string | null;
  trainingId: string;
  athleteId: string;
  status: unknown;
  note?: unknown;
  userId: string;
  actorEmail?: string | null;
  now?: Date;
};

/*
  **Perche `answerRsvp` non prende uno scope.** Lo scope della sessione dice a
  quali club l'utente appartiene; qui la domanda e un'altra — «sei legato a
  questo atleta?» — e la risposta puo essere si anche senza appartenenza, per
  esempio quando e l'atleta stesso ad avere l'account. Accettare uno scope e
  poi non usarlo come gate sarebbe una promessa che il codice non mantiene;
  usarlo come gate escluderebbe chi ha diritto di rispondere. La lettura per lo
  staff, che e un'altra domanda, lo scope invece lo pretende.
*/

export type RsvpAnswerResult = {
  organizationId: string;
  trainingId: string;
  athleteId: string;
  status: RsvpStatus;
  note: string;
  answeredAt: string;
  deadline: string | null;
};

/**
 * Chi risponde e legato all'atleta? E con quale ruolo?
 *
 * Riusa `canParentAccessAthlete`, che e il proprietario della domanda «questo
 * account e collegato a questo atleta»: riscriverla qui vorrebbe dire avere
 * due idee di cosa sia un tutore, e la prima volta che una delle due cambia
 * l'area genitore e l'RSVP direbbero cose diverse.
 */
const authorizeAnsweringUser = async (userId: string, athleteId: string) => {
  const athlete = await prisma.athlete.findUnique({
    where: { id: athleteId },
    select: { id: true, organization_id: true, user_id: true, data: true },
  });

  if (!athlete) throw new Error("Atleta non trovato");

  const linked = await canParentAccessAthlete(userId, athlete.id);
  if (!linked) {
    /*
      **Qui il permesso e il legame, e il legame e l'unica cosa che nega.** Il
      controllo di ruolo che segue non puo rifiutare nessuno: il ruolo con cui
      si risponde e **derivato** dal legame appena verificato, e sia `parent`
      sia `athlete` hanno `rsvp.answer`. Percio la riga di audit del diniego
      appartiene a questo punto e non a quello: e qui che qualcuno ha provato a
      rispondere per il figlio di un altro.
    */
    await recordPermissionDenied({
      scope: {
        userId,
        activeRole: null,
        activeOrganizationId: athlete.organization_id || null,
      },
      permission: "rsvp.answer",
      resource: "club_event_participants",
      resourceId: athlete.id,
    });
    throw accessDenied("questo atleta non e collegato al tuo account");
  }

  const actingRole = sameId(athlete.user_id, userId) ? "athlete" : "parent";
  assertCommunicationPermission(actingRole, "rsvp.answer");

  return { athlete, actingRole };
};

/**
 * La risposta della famiglia.
 *
 * Cambiare risposta e la stessa operazione che darla la prima volta: finche la
 * scadenza non e passata, l'ultima parola vince. Non c'e un endpoint di
 * modifica separato perche non c'e un fatto diverso da registrare.
 */
export const answerRsvp = async ({
  organizationId,
  trainingId,
  athleteId,
  status,
  note,
  userId,
  actorEmail,
  now = new Date(),
}: AnswerRsvpInput): Promise<RsvpAnswerResult> => {
  const normalizedStatus = normalizeRsvpStatus(status);
  if (!normalizedStatus) {
    throw new Error(
      "Risposta non valida: indica se l'atleta ci sara oppure no.",
    );
  }

  const wantedTrainingId = asText(trainingId);
  const wantedAthleteId = asText(athleteId);
  if (!wantedTrainingId || !wantedAthleteId) {
    throw new Error("Allenamento o atleta mancante");
  }

  const { athlete, actingRole } = await authorizeAnsweringUser(
    userId,
    wantedAthleteId,
  );

  const resolvedOrganizationId = asText(athlete.organization_id);
  const declaredOrganizationId = asText(organizationId);
  if (declaredOrganizationId && declaredOrganizationId !== resolvedOrganizationId) {
    throw accessDenied("l'atleta non appartiene a questo club");
  }

  const club = await loadClub(resolvedOrganizationId);
  const training = await findTraining(resolvedOrganizationId, wantedTrainingId);
  if (!training) throw new Error("Evento non trovato");

  const config = readEventRsvpConfig(training, now);
  const answerability = canAnswerRsvp({
    config,
    now,
    eventStatus: asRecord(training).status,
  });

  if (!answerability.allowed) {
    throw new Error(answerability.message);
  }

  const answeredAt = new Date(now.getTime());
  const trimmedNote = asText(note).slice(0, 500);

  /*
    L'upsert sulla chiave unica: `update` **non nomina `status`**, quindi la
    presenza gia registrata dall'allenatore sopravvive alla risposta; `create`
    lo mette al valore neutro perche la colonna e obbligatoria.
  */
  /*
    **La risposta si appoggia alla riga dell'evento**, non piu a una stringa.

    `event_id` e una chiave esterna vera: una risposta non puo piu citare un
    allenamento che nel frattempo qualcuno ha fatto sparire riscrivendo l'array
    (ADR-0098).
  */
  const evento = await findClubEvent(resolvedOrganizationId, wantedTrainingId);
  if (!evento) throw new Error("Allenamento non trovato");

  await prisma.clubEventParticipant.upsert({
    where: {
      organization_id_event_id_athlete_id: {
        organization_id: resolvedOrganizationId,
        event_id: evento.id,
        athlete_id: wantedAthleteId,
      },
    },
    update: {
      rsvp_status: normalizedStatus,
      rsvp_note: trimmedNote || null,
      rsvp_at: answeredAt,
      rsvp_by_user_id: userId,
    },
    create: {
      organization_id: resolvedOrganizationId,
      event_id: evento.id,
      legacy_training_id: evento.legacy_id,
      athlete_id: wantedAthleteId,
      status: RSVP_NEUTRAL_ATTENDANCE_STATUS,
      notes: null,
      rsvp_status: normalizedStatus,
      rsvp_note: trimmedNote || null,
      rsvp_at: answeredAt,
      rsvp_by_user_id: userId,
    },
  });

  await recordAuditEvent({
    action: AUDIT_ACTIONS.rsvpAnswered,
    actorUserId: userId,
    actorEmail: actorEmail || null,
    actorRole: actingRole,
    organizationId: resolvedOrganizationId,
    resource: "club_event_participants",
    resourceId: `${wantedTrainingId}:${wantedAthleteId}`,
    metadata: {
      trainingId: wantedTrainingId,
      athleteId: wantedAthleteId,
      status: normalizedStatus,
      hasNote: Boolean(trimmedNote),
    },
  });

  return {
    organizationId: resolvedOrganizationId,
    trainingId: wantedTrainingId,
    athleteId: wantedAthleteId,
    status: normalizedStatus,
    note: trimmedNote,
    answeredAt: answeredAt.toISOString(),
    deadline: config.deadline ? config.deadline.toISOString() : null,
  };
};

/* ---------------------------------------------------- lettura per lo staff */

export type RsvpSummaryRow = {
  athleteId: string;
  athleteName: string;
  state: RsvpSummary["byAthlete"][number]["state"];
  note: string;
  answeredAt: string | null;
};

export type EventRsvpSummary = {
  organizationId: string;
  trainingId: string;
  rsvpRequired: boolean;
  deadline: string | null;
  deadlinePassed: boolean;
  totals: { yes: number; no: number; noResponse: number; expected: number };
  athletes: RsvpSummaryRow[];
};

/**
 * Il perimetro dell'allenatore, applicato all'evento e non all'elenco.
 *
 * Un allenatore vede le risposte **dei suoi gruppi operativi**: e la matrice
 * dei permessi a dire che puo leggere, e questa funzione a dire *quali*
 * (`communications/permissions.ts` lo dichiara esplicitamente). Chi gestisce
 * il club non passa di qui: vede tutto il club per definizione.
 *
 * ---
 *
 * **Perche non decide piu da sola** (W6-24).
 *
 * Qui si cercava chi sta guardando in `clubs.trainers` e basta, mentre il
 * filtro degli eventi lo cercava **anche** in `clubs.staff_members`. Un club
 * su tre registra i propri allenatori come staff: quelli vedevano
 * l'allenamento nel calendario e si sentivano rispondere «non risulti fra gli
 * allenatori di questo club» sull'RSVP dello stesso allenamento. Due
 * proprietari della stessa domanda, e due risposte opposte sullo stesso
 * ingresso.
 *
 * Adesso la domanda ha un proprietario solo — `events.ts` — e questa funzione
 * si limita a comporre il candidato e a tradurre il no in un rifiuto con la
 * riga di audit che prima non c'era.
 */
const assertTrainerCanSeeEvent = async (
  context: ClubEventContext,
  scope: OrganizationAccessScope,
  evento: { id?: string | null } | null,
) => {
  const organizationId = asText(scope.activeOrganizationId);
  const perimetro = await readTrainerEventPerimeter(
    organizationId,
    asText(scope.userId),
  );

  /*
    Si giudica la **riga** quando c'e (ADR-0098) e si ricade sulla forma
    storica quando l'allenamento e piu vecchio delle righe: le due portano lo
    stesso fatto — categoria e gruppi — con due grafie diverse.
  */
  const candidato = evento
    ? (evento as Record<string, any>)
    : {
        category_id: getTrainingCategoryReferences(context.training)
          .map(asText)
          .filter(Boolean)[0],
        group_ids: readTrainingGroupIds(context.training),
      };

  if (eventWithinTrainerPerimeter(perimetro, candidato)) return;

  await recordPermissionDenied({
    scope: {
      userId: scope?.userId,
      activeRole: scope?.activeRole,
      activeOrganizationId: scope?.activeOrganizationId,
    },
    permission: "rsvp.read",
    resource: "club_events",
    resourceId: asText(evento?.id) || null,
    metadata: {
      motivo: perimetro
        ? "evento fuori dal perimetro dell'allenatore"
        : "nessun profilo allenatore in questo club",
    },
  });

  throw accessDenied(
    perimetro
      ? "questo allenamento non e di una tua categoria ne di un tuo gruppo"
      : "non risulti fra gli allenatori di questo club",
  );
};

/**
 * Si, no e **senza risposta** con i nomi, per chi prepara l'allenamento.
 *
 * La terza colonna e la ragione per cui l'RSVP esiste: l'allenatore non ha
 * bisogno di sapere chi manca, ha bisogno di sapere **chi non ha risposto**,
 * perche e l'unica lista su cui puo ancora fare qualcosa.
 */
export const readEventRsvpSummary = async ({
  organizationId,
  trainingId,
  scope,
  now = new Date(),
}: {
  organizationId?: string | null;
  trainingId: string;
  scope: OrganizationAccessScope;
  /**
   * **Accettato e ignorato.** L'email di chi agisce serviva a riconoscere
   * l'allenatore nel profilo del club, e arrivava da chi chiama: adesso la
   * risolve il perimetro leggendo l'utenza dal database. Un'identita che il
   * chiamante puo dettare non e un'identita, e la firma resta solo per non
   * costringere le rotte a cambiare nello stesso commit.
   */
  actorEmail?: string | null;
  now?: Date;
}): Promise<EventRsvpSummary> => {
  /*
    Il diniego **lascia una riga** prima di essere lanciato: la sonda di
    sicurezza della Wave 5 aveva misurato quattordici chiavi che rifiutavano
    correttamente e non scrivevano niente. Qui non si puo mettere dentro la
    guardia — `assertCommunicationPermission` e un modulo puro, e deve
    restarlo — quindi si chiede prima, e si scrive.
  */
  if (!hasCommunicationPermission(scope?.activeRole, "rsvp.read")) {
    await recordPermissionDenied({
      scope: {
        userId: scope?.userId,
        activeRole: scope?.activeRole,
        activeOrganizationId: scope?.activeOrganizationId,
      },
      permission: "rsvp.read",
      resource: "club_events",
      resourceId: trainingId,
    });
  }
  assertCommunicationPermission(scope?.activeRole, "rsvp.read");

  /*
    **Il ruolo e il club devono parlare dello stesso club.**

    `activeRole` viene risolto sul club dell'intestazione `x-active-club-id`;
    le righe si sceglievano invece su `organizationId`, che arriva dalla query
    string, con il solo controllo «e fra quelli a cui hai accesso». Fra i due
    c'e un buco che una persona qualunque puo attraversare: chi e proprietario
    del proprio club **e genitore nel club del figlio** — la situazione piu
    ordinaria che ci sia — passava il permesso come proprietario del primo e
    leggeva il riepilogo del secondo: nomi di tutti gli atleti attesi, chi ha
    risposto, e le **note libere delle famiglie**. Come genitore, in quel club,
    non avrebbe `rsvp.read` affatto.

    E la stessa regola gia scritta in `audience.ts`, `announcements.ts`,
    `payment-links.ts` e `payment-reminders.ts`: si opera sul club **attivo**,
    e un club dichiarato che diverge e un rifiuto, non una scelta.
  */
  const declared = asText(organizationId);
  const active = asText(scope?.activeOrganizationId);

  if (!active) throw accessDenied("nessun club attivo per questa sessione");
  if (declared && declared !== active) {
    throw accessDenied(
      "si legge il club attivo, non un altro fra quelli a cui hai accesso",
    );
  }
  if (!scope.allowedOrganizationIds.includes(active)) {
    throw accessDenied("il club richiesto non e fra quelli a cui hai accesso");
  }

  const wanted = active;

  const wantedTrainingId = asText(trainingId);
  if (!wantedTrainingId) throw new Error("Allenamento mancante");

  const club = await loadClub(wanted);
  const training = await findTraining(wanted, wantedTrainingId);
  if (!training) throw new Error("Evento non trovato");

  const context = buildEventContext(club, asRecord(training));

  const evento = await findClubEvent(wanted, wantedTrainingId);

  if (isTrainerAccessRole(scope.activeRole)) {
    await assertTrainerCanSeeEvent(context, scope, evento);
  }

  const [athletes, rows] = await Promise.all([
    loadClubAthletes(wanted),
    evento
      ? prisma.clubEventParticipant.findMany({
          where: { organization_id: wanted, event_id: evento.id },
          select: {
            athlete_id: true,
            rsvp_status: true,
            rsvp_note: true,
            rsvp_at: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const expected = resolveExpectedAthletes(context, athletes);
  const namesById = new Map(
    athletes.map((athlete) => [asText(athlete.id), athleteDisplayName(athlete)]),
  );

  const summary = summarizeRsvp({
    expectedAthleteIds: expected.map((athlete) => asText(athlete.id)),
    rows,
  });
  const config = readEventRsvpConfig(context.training, now);

  return {
    organizationId: wanted,
    trainingId: wantedTrainingId,
    rsvpRequired: config.required,
    deadline: config.deadline ? config.deadline.toISOString() : null,
    deadlinePassed: config.closed,
    totals: {
      yes: summary.yes,
      no: summary.no,
      noResponse: summary.noResponse,
      expected: summary.byAthlete.length,
    },
    athletes: summary.byAthlete.map((entry) => ({
      athleteId: entry.athleteId,
      athleteName: namesById.get(entry.athleteId) || "Atleta",
      state: entry.state,
      note: entry.note,
      answeredAt: entry.answeredAt,
    })),
  };
};

/* -------------------------------------------- lettura per la famiglia / AUT */

export type RsvpInvitation = {
  organizationId: string;
  trainingId: string;
  athleteId: string;
  /**
   * Allenamento o gara.
   *
   * La famiglia deve sapere **che cosa** sta confermando: le due cose costano
   * un pomeriggio diverso, e un invito che non lo dice si conferma alla
   * leggera. Il campo esiste perche l'elenco ne contiene ormai di entrambi i
   * tipi, e chi lo mostra possa separarli senza indovinare dal titolo.
   */
  kind: EventKind;
  /** L'avversario, quando l'evento e una gara. Stringa vuota altrimenti. */
  opponent: string;
  title: string;
  categoryLabel: string;
  location: string;
  startsAt: string | null;
  time: string;
  deadline: string | null;
  /** La risposta attuale, o `no_response`. */
  state: RsvpSummary["byAthlete"][number]["state"];
  note: string;
  answeredAt: string | null;
  /** Si puo ancora rispondere (o cambiare risposta). */
  canAnswer: boolean;
  /** Perche no, quando `canAnswer` e falso. Stringa vuota altrimenti. */
  blockedMessage: string;
};

/**
 * Come si chiama, per la famiglia, l'evento a cui e invitata.
 *
 * Il titolo di un evento e facoltativo, e il ripiego era «Allenamento» per
 * tutti: una gara senza titolo — cioe la forma con cui la maggior parte delle
 * gare viene creata, perche il titolo lo si scrive di rado — arrivava alla
 * famiglia con il nome dell'altra cosa. L'avversario e la parte che rende
 * riconoscibile una gara, quindi entra nel ripiego quando c'e.
 */
const eventInvitationTitle = (
  event: Record<string, any>,
  kind: EventKind,
) => {
  const declared = asText(event.title);
  if (declared) return declared;
  if (kind !== "match") return "Allenamento";

  const opponent = asText(event.opponent);
  return opponent ? `Gara con ${opponent}` : "Gara";
};

const buildInvitations = ({
  club,
  events,
  athleteId,
  rows,
  now,
  horizonDays,
}: {
  club: Record<string, any>;
  /** Gli eventi del club nella forma storica, allenamenti **e** gare. */
  events: Record<string, any>[];
  athleteId: string;
  rows: Array<{
    training_id: string;
    rsvp_status: string | null;
    rsvp_note: string | null;
    rsvp_at: Date | null;
  }>;
  now: Date;
  horizonDays: number;
}): RsvpInvitation[] => {
  const rowsByTraining = new Map(rows.map((row) => [asText(row.training_id), row]));
  const horizon = new Date(now.getTime() + horizonDays * 24 * 60 * 60 * 1000);
  const categoryOptions = buildClubCategoryOptions({
    clubCategories: club.categories,
  });

  return asArray(events)
    .map((raw) => asRecord(raw))
    .filter((training) => {
      const config = readEventRsvpConfig(training, now);
      if (!config.required) return false;
      if (isCancelledEventStatus(training.status)) return false;

      const startsAt = eventStartsAt(training);
      if (!startsAt) return false;
      return startsAt.getTime() >= now.getTime() && startsAt.getTime() <= horizon.getTime();
    })
    .map((training) => {
      const trainingId = asText(training.id);
      const row = rowsByTraining.get(trainingId);
      const summary = summarizeRsvp({
        expectedAthleteIds: [athleteId],
        rows: row ? [{ ...row, athlete_id: athleteId }] : [],
      });
      const entry = summary.byAthlete[0];
      const config = readEventRsvpConfig(training, now);
      const answerability = canAnswerRsvp({
        config,
        now,
        eventStatus: training.status,
      });
      const startsAt = eventStartsAt(training);
      const kind = normalizeEventKind(training.kind);

      return {
        organizationId: asText(club.id),
        trainingId,
        athleteId,
        kind,
        opponent: kind === "match" ? asText(training.opponent) : "",
        title: eventInvitationTitle(training, kind),
        categoryLabel: resolveCategoryLabelForTraining(training, categoryOptions),
        location: asText(training.location),
        startsAt: startsAt ? startsAt.toISOString() : null,
        time: asText(getTrainingStartTime(training)),
        deadline: config.deadline ? config.deadline.toISOString() : null,
        state: entry.state,
        note: entry.note,
        answeredAt: entry.answeredAt,
        canAnswer: answerability.allowed,
        blockedMessage: answerability.allowed ? "" : answerability.message,
      };
    })
    .sort((left, right) => asText(left.startsAt).localeCompare(asText(right.startsAt)));
};

/**
 * Il margine con cui si allarga la finestra chiesta al database.
 *
 * A decidere quali inviti la famiglia vede resta `eventStartsAt`, che
 * ricostruisce l'istante dal **giorno e dall'ora** della forma storica: la
 * riga porta invece un istante vero. Le due letture della stessa riga possono
 * discostarsi del fuso del processo che le legge, e una finestra stretta
 * quanto l'orizzonte farebbe sparire l'evento che ci sta appena dentro.
 * Un giorno per parte e piu della differenza massima possibile.
 */
const FINESTRA_MARGINE_MS = 24 * 60 * 60 * 1000;

/**
 * **Gli eventi su cui rispondere, letti dalle righe.**
 *
 * Qui si leggeva `club.trainings`, cioe la proiezione dei soli allenamenti: il
 * dominio sapeva gia rispondere a una gara — `findTraining` le trova entrambe
 * dalla Wave 5 — ma l'elenco che la famiglia legge non gliene mostrava mai
 * una, quindi nessuna schermata poteva chiederlo. Leggere le righe e la
 * direzione di ADR-0098 e chiude la differenza fra i due tipi in un punto
 * solo, invece di aggiungere `matches` accanto a `trainings` e doverli poi
 * tenere allineati.
 *
 * `archived` resta fuori: e lo stato di un evento ricostruito perche una
 * presenza lo citava, e non e un invito che qualcuno abbia mandato.
 */
const loadRsvpEvents = async (
  organizationId: string,
  now: Date,
  horizonDays: number,
) => {
  const rows = await prisma.clubEvent.findMany({
    where: {
      organization_id: organizationId,
      status: { not: "archived" },
      starts_at: {
        gte: new Date(now.getTime() - FINESTRA_MARGINE_MS),
        lte: new Date(
          now.getTime() + horizonDays * 24 * 60 * 60 * 1000 + FINESTRA_MARGINE_MS,
        ),
      },
    },
    orderBy: { starts_at: "asc" },
  });

  return rows.map((row) => toEventLegacyShape(row));
};

const loadAthleteRsvpRows = async (
  organizationId: string,
  athleteId: string,
) => {
  const rows = await prisma.clubEventParticipant.findMany({
    where: { organization_id: organizationId, athlete_id: athleteId },
    select: {
      event_id: true,
      legacy_training_id: true,
      rsvp_status: true,
      rsvp_note: true,
      rsvp_at: true,
    },
  });

  const eventi = rows.length
    ? await prisma.clubEvent.findMany({
        where: {
          organization_id: organizationId,
          id: { in: Array.from(new Set(rows.map((row) => row.event_id))) },
        },
        select: { id: true, legacy_id: true },
      })
    : [];
  const legacyIdPerEvento = new Map(
    eventi.map((evento) => [evento.id, String(evento.legacy_id || evento.id)]),
  );

  /*
    Le schermate confrontano ancora l'identificativo storico dell'evento: la
    proiezione lo scrive nella colonna JSON, e qui lo si rimette nella forma
    che quelle attendono. Sparisce con l'ultimo lettore della colonna.
  */
  return rows.map((row) => ({
    training_id:
      legacyIdPerEvento.get(row.event_id) ||
      String(row.legacy_training_id || row.event_id),
    rsvp_status: row.rsvp_status,
    rsvp_note: row.rsvp_note,
    rsvp_at: row.rsvp_at,
  }));
};

/**
 * Gli inviti RSVP di un atleta, per l'**area genitore**.
 *
 * Comprende **allenamenti e gare**: la Wave 5 aveva dichiarato completo l'RSVP
 * sulle gare e il servizio lo reggeva, ma questo elenco leggeva la proiezione
 * dei soli allenamenti — una gara che chiedeva conferma non arrivava a
 * nessuna schermata, e la capability era irraggiungibile dal lato che conta.
 *
 * Comprende anche quelli gia risposti, perche la famiglia deve poter vedere
 * cosa ha detto e cambiare idea finche la scadenza non passa: mostrare solo i
 * pendenti farebbe sparire la risposta appena data, che e il modo piu rapido
 * per farla dare due volte.
 *
 * Autorizza con il legame all'atleta, come `answerRsvp`.
 */
export const readAthleteRsvpInvitations = async ({
  athleteId,
  userId,
  now = new Date(),
  horizonDays = DEFAULT_HORIZON_DAYS,
}: {
  athleteId: string;
  userId: string;
  now?: Date;
  horizonDays?: number;
}): Promise<RsvpInvitation[]> => {
  const wantedAthleteId = asText(athleteId);
  if (!wantedAthleteId) throw new Error("Atleta mancante");

  const { athlete } = await authorizeAnsweringUser(userId, wantedAthleteId);
  const organizationId = asText(athlete.organization_id);

  const [club, events, rows] = await Promise.all([
    loadClub(organizationId),
    loadRsvpEvents(organizationId, now, horizonDays),
    loadAthleteRsvpRows(organizationId, wantedAthleteId),
  ]);

  return buildInvitations({
    club,
    events,
    athleteId: wantedAthleteId,
    rows,
    now,
    horizonDays,
  });
};

/**
 * Gli inviti **ancora senza risposta** di un atleta.
 *
 * ## Firma stabile — la consuma l'automazione AUT-04 (lane W2-A)
 *
 * ```ts
 * listPendingRsvpForAthlete({
 *   athleteId,                    // obbligatorio
 *   organizationId?,              // opzionale: se assente si ricava dall'atleta
 *   now?: Date,                   // default: adesso
 *   horizonDays?: number,         // default: 30
 * }): Promise<RsvpInvitation[]>
 * ```
 *
 * **Non autentica**: e pensata per girare anche senza un utente, perche
 * l'invito automatico lo manda il cron e non una persona. L'autorizzazione
 * resta a carico di chi la chiama da una rotta — l'area genitore usa
 * `readAthleteRsvpInvitations`, che il legame lo verifica.
 *
 * Restituisce solo gli inviti a cui si puo **ancora** rispondere: un evento
 * scaduto o annullato non e un sollecito da mandare, e un promemoria su una
 * porta gia chiusa e solo un messaggio in piu che nessuno puo seguire.
 */
export const listPendingRsvpForAthlete = async ({
  organizationId,
  athleteId,
  now = new Date(),
  horizonDays = DEFAULT_HORIZON_DAYS,
}: {
  organizationId?: string | null;
  athleteId: string;
  now?: Date;
  horizonDays?: number;
}): Promise<RsvpInvitation[]> => {
  const wantedAthleteId = asText(athleteId);
  if (!wantedAthleteId) throw new Error("Atleta mancante");

  let resolvedOrganizationId = asText(organizationId);
  if (!resolvedOrganizationId) {
    const athlete = await prisma.athlete.findUnique({
      where: { id: wantedAthleteId },
      select: { organization_id: true },
    });
    if (!athlete) throw new Error("Atleta non trovato");
    resolvedOrganizationId = asText(athlete.organization_id);
  }

  const [club, events, rows] = await Promise.all([
    loadClub(resolvedOrganizationId),
    loadRsvpEvents(resolvedOrganizationId, now, horizonDays),
    loadAthleteRsvpRows(resolvedOrganizationId, wantedAthleteId),
  ]);

  return buildInvitations({
    club,
    events,
    athleteId: wantedAthleteId,
    rows,
    now,
    horizonDays,
  }).filter(
    (invitation) => invitation.state === "no_response" && invitation.canAnswer,
  );
};
