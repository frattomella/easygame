import { prisma } from "./prisma";
import { formatAthleteNameLastFirst } from "@/lib/athlete-name-utils";
import { canParentAccessAthlete } from "./parent-dashboard";
import { AUDIT_ACTIONS, recordAuditEvent } from "./audit";
import type { OrganizationAccessScope } from "./auth";
import { assertCommunicationPermission } from "@/lib/communications/permissions";
import { isTrainerAccessRole } from "@/lib/access-roles";
import {
  athleteMatchesAnyCategory,
  buildClubCategoryOptions,
} from "@/lib/category-utils";
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
import {
  normalizeTrainerList,
  trainerFollowsGroup,
  trainerHasCategory,
} from "@/lib/trainer-utils";
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

const CLUB_SELECTION = {
  id: true,
  name: true,
  trainings: true,
  categories: true,
  club_sites: true,
  category_groups: true,
  trainers: true,
} as const;

const findTraining = (club: { trainings?: unknown }, trainingId: string) =>
  asArray(club?.trainings).find((training) =>
    sameId(asRecord(training).id, trainingId),
  ) || null;

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
  const training = findTraining(club, wantedTrainingId);
  if (!training) throw new Error("Allenamento non trovato");

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
  await prisma.trainingAttendance.upsert({
    where: {
      organization_id_training_id_athlete_id: {
        organization_id: resolvedOrganizationId,
        training_id: wantedTrainingId,
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
      training_id: wantedTrainingId,
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
    resource: "training_attendance",
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
 */
const assertTrainerCanSeeEvent = (
  context: ClubEventContext,
  scope: OrganizationAccessScope,
  actorEmail?: string | null,
) => {
  const trainers = normalizeTrainerList(
    context.club.trainers,
    context.categoryOptions,
  );
  const email = asText(actorEmail).toLowerCase();
  const me = trainers.find(
    (trainer) =>
      sameId(trainer.id, scope.userId) || (email && trainer.email === email),
  );

  if (!me) {
    throw accessDenied(
      "non risulti fra gli allenatori di questo club",
    );
  }

  const declaredGroupIds = readTrainingGroupIds(context.training);

  /*
    Un allenamento **senza** gruppi dichiarati e un dato precedente ai gruppi
    operativi: si ricade sulla categoria, che e il comportamento di prima. Non
    si passa da `trainerFollowsGroup` in questo ramo, perche quella funzione
    con un gruppo dal nome vuoto direbbe di no a ogni allenatore che i suoi
    gruppi li ha dichiarati — cioe negherebbe l'accesso proprio a chi ha
    configurato meglio il club.
  */
  if (!declaredGroupIds.length) {
    const references = getTrainingCategoryReferences(context.training)
      .map(asText)
      .filter(Boolean);

    // Nessuna categoria dichiarata: l'allenamento riguarda tutti, come altrove.
    if (!references.length) return;

    const follows = references.some((reference) =>
      trainerHasCategory(
        me,
        { id: reference, name: reference },
        context.categoryOptions,
      ),
    );

    if (!follows) {
      throw accessDenied("questo allenamento non e di una tua categoria");
    }

    return;
  }

  const groups = declaredGroupIds.map(
    (id) =>
      context.groups.find((group) => group.id === id) || {
        id,
        categoryId: "",
        categoryName: "",
      },
  );

  const follows = groups.some((group) =>
    trainerFollowsGroup(me, group, context.categoryOptions),
  );

  if (!follows) {
    throw accessDenied("questo allenamento non e di un tuo gruppo");
  }
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
  actorEmail,
  now = new Date(),
}: {
  organizationId?: string | null;
  trainingId: string;
  scope: OrganizationAccessScope;
  actorEmail?: string | null;
  now?: Date;
}): Promise<EventRsvpSummary> => {
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
  const training = findTraining(club, wantedTrainingId);
  if (!training) throw new Error("Allenamento non trovato");

  const context = buildEventContext(club, asRecord(training));

  if (isTrainerAccessRole(scope.activeRole)) {
    assertTrainerCanSeeEvent(context, scope, actorEmail);
  }

  const [athletes, rows] = await Promise.all([
    loadClubAthletes(wanted),
    prisma.trainingAttendance.findMany({
      where: { organization_id: wanted, training_id: wantedTrainingId },
      select: {
        athlete_id: true,
        rsvp_status: true,
        rsvp_note: true,
        rsvp_at: true,
      },
    }),
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

const buildInvitations = ({
  club,
  athleteId,
  rows,
  now,
  horizonDays,
}: {
  club: Record<string, any>;
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

  return asArray(club.trainings)
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

      return {
        organizationId: asText(club.id),
        trainingId,
        athleteId,
        title: asText(training.title) || "Allenamento",
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

const loadAthleteRsvpRows = (organizationId: string, athleteId: string) =>
  prisma.trainingAttendance.findMany({
    where: { organization_id: organizationId, athlete_id: athleteId },
    select: {
      training_id: true,
      rsvp_status: true,
      rsvp_note: true,
      rsvp_at: true,
    },
  });

/**
 * Gli inviti RSVP di un atleta, per l'**area genitore**.
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

  const [club, rows] = await Promise.all([
    loadClub(organizationId),
    loadAthleteRsvpRows(organizationId, wantedAthleteId),
  ]);

  return buildInvitations({
    club,
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

  const [club, rows] = await Promise.all([
    loadClub(resolvedOrganizationId),
    loadAthleteRsvpRows(resolvedOrganizationId, wantedAthleteId),
  ]);

  return buildInvitations({
    club,
    athleteId: wantedAthleteId,
    rows,
    now,
    horizonDays,
  }).filter(
    (invitation) => invitation.state === "no_response" && invitation.canAnswer,
  );
};
