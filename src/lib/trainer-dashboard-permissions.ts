/**
 * Le sezioni della dashboard allenatore.
 *
 * `board`, `documents` e `appointments` sono le tre voci che la Wave 5
 * aggiunge, e nascono **accese**. Non e una svista: sono le tre superfici che
 * mostrano all'allenatore soltanto **cio che lo riguarda gia** — gli avvisi che
 * gli sono stati mandati, i propri documenti, gli appuntamenti che gli sono
 * stati assegnati — e il dato che ci passa e filtrato dal server sul suo
 * legame, non su questo interruttore. Un club che le spegnesse nasconderebbe
 * la schermata, non il dato: e quello che questo file ha gia sbagliato una
 * volta con `viewMedicalStatus`, che nascondeva le schede mentre il contenuto
 * clinico usciva comunque dalle API (D-4).
 */
export type TrainerNavigationPermissionKey =
  | "home"
  | "trainings"
  | "matches"
  | "athletes"
  | "categories"
  | "board"
  | "documents"
  | "appointments"
  | "notifications"
  | "compensation";

/**
 * I riquadri della home, e **perche non sono permessi** (W6-29).
 *
 * Le cinque chiavi erano configurabili in `/permissions` e non le leggeva
 * nessuno: cinque caselle che un club poteva spuntare senza che accadesse
 * niente. E la stessa forma del difetto W5-D01, in scala minore, e la
 * correzione e la stessa — la chiave si innesta dove agisce.
 *
 * Che l'innesto sia **nel browser** qui e corretto, e non e in contraddizione
 * con D-4: un riquadro nascosto non e un dato protetto, e queste chiavi non
 * promettono di proteggere niente. Decidono come e composta una schermata, e
 * il dato che ci passa e gia tagliato dal server sul perimetro di chi guarda.
 * Le dieci chiavi `permissions.actions.*` sono un'altra cosa — quelle
 * promettono un divieto e lo applicano solo di qua (W6-28), ed e un debito
 * aperto, non un precedente.
 */
export type TrainerWidgetPermissionKey =
  | "summary"
  | "upcomingTrainings"
  | "upcomingMatches"
  | "assignedAthletes"
  | "assignedCategories";

export type TrainerActionPermissionKey =
  | "viewTrainingDetails"
  | "manageAttendance"
  | "manageTrainingStatus"
  | "viewMatchDetails"
  | "manageConvocations"
  | "viewAthleteDetails"
  | "viewAthleteTechnicalSheet"
  | "viewAthleteContacts"
  | "viewMedicalStatus"
  | "viewEnrollmentAndPayments";

export type TrainerDashboardPermissions = {
  navigation: Record<TrainerNavigationPermissionKey, boolean>;
  widgets: Record<TrainerWidgetPermissionKey, boolean>;
  actions: Record<TrainerActionPermissionKey, boolean>;
};

export const DEFAULT_TRAINER_DASHBOARD_PERMISSIONS: TrainerDashboardPermissions =
  {
    navigation: {
      home: true,
      trainings: true,
      matches: true,
      athletes: true,
      /*
        **`categories` nasce accesa** (W6-31). Era forzata a `false` e la rotta
        rimandava alla home: una voce di menu che non si poteva accendere
        davanti a una pagina che non mostrava niente. Adesso la pagina mostra i
        gruppi e le categorie del perimetro — la voce «proprie squadre» che
        l'area allenatore non aveva — e la chiave torna a decidere qualcosa.
      */
      categories: true,
      board: true,
      documents: true,
      appointments: true,
      /*
        **`notifications` nasce accesa** (W6-30). La pagina era completa e
        raggiungibile **solo** dalla campanella: non compariva ne in questo
        elenco ne nella sidebar, quindi un allenatore che avesse chiuso il
        pannello non aveva piu un modo di tornarci.
      */
      notifications: true,
      /*
        `compensation` e la superficie che mancava a `sport_work.read_own`
        (W6-32). Nasce accesa perche mostra soltanto i **propri** compensi: il
        dato e gia ristretto dal server alla persona collegata, e spegnere la
        voce nasconderebbe la schermata, non il dato.
      */
      compensation: true,
    },
    widgets: {
      summary: true,
      upcomingTrainings: true,
      upcomingMatches: true,
      assignedAthletes: true,
      assignedCategories: true,
    },
    actions: {
      viewTrainingDetails: true,
      manageAttendance: true,
      manageTrainingStatus: true,
      viewMatchDetails: true,
      manageConvocations: true,
      viewAthleteDetails: true,
      viewAthleteTechnicalSheet: true,
      viewAthleteContacts: true,
      viewMedicalStatus: true,
      viewEnrollmentAndPayments: true,
    },
  };

const mergePermissionGroup = <T extends Record<string, boolean>>(
  defaults: T,
  overrides: unknown,
) => {
  const nextGroup = { ...defaults };
  const source =
    overrides && typeof overrides === "object"
      ? (overrides as Record<string, unknown>)
      : {};

  for (const key of Object.keys(defaults)) {
    if (typeof source[key] === "boolean") {
      nextGroup[key as keyof T] = source[key] as T[keyof T];
    }
  }

  return nextGroup;
};

export const resolveTrainerDashboardPermissions = (
  settings: unknown,
): TrainerDashboardPermissions => {
  const source =
    settings && typeof settings === "object"
      ? (settings as Record<string, unknown>)
      : {};

  const rawPermissions =
    source.trainerDashboardPermissions ||
    source.trainer_dashboard_permissions ||
    {};

  const normalizedPermissions =
    rawPermissions && typeof rawPermissions === "object"
      ? (rawPermissions as Record<string, unknown>)
      : {};

  /*
    **Niente piu forzatura su `categories`.**

    Qui si riscriveva `categories: false` dopo la fusione, cioe si ignorava la
    scelta del club: la chiave era configurabile e il suo valore veniva buttato
    via una riga dopo essere stato letto. Era il tappo su una rotta che
    rimandava alla home (W6-31); tolta la rotta finta, si toglie anche il
    tappo.
  */
  return {
    navigation: mergePermissionGroup(
      DEFAULT_TRAINER_DASHBOARD_PERMISSIONS.navigation,
      normalizedPermissions.navigation,
    ),
    widgets: mergePermissionGroup(
      DEFAULT_TRAINER_DASHBOARD_PERMISSIONS.widgets,
      normalizedPermissions.widgets,
    ),
    actions: mergePermissionGroup(
      DEFAULT_TRAINER_DASHBOARD_PERMISSIONS.actions,
      normalizedPermissions.actions,
    ),
  };
};

export const buildTrainerDashboardPermissionPayload = (
  permissions: TrainerDashboardPermissions,
) => ({
  trainerDashboardPermissions: permissions,
  trainer_dashboard_permissions: permissions,
});

export const TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY: Record<
  TrainerNavigationPermissionKey,
  string
> = {
  home: "/trainer-dashboard",
  trainings: "/trainer-dashboard/trainings",
  matches: "/trainer-dashboard/matches",
  athletes: "/trainer-dashboard/athletes",
  categories: "/trainer-dashboard/categories",
  board: "/trainer-dashboard/board",
  documents: "/trainer-dashboard/documents",
  appointments: "/trainer-dashboard/appointments",
  notifications: "/trainer-dashboard/notifications",
  compensation: "/trainer-dashboard/compensi",
};

export const getFirstAccessibleTrainerRoute = (
  permissions: TrainerDashboardPermissions,
) => {
  /*
    L'ordine e quello del menu, e ogni voce raggiungibile deve comparirci: una
    rotta esclusa da qui e una porta che il ripiego non sa aprire, ed e cosi
    che `/trainer-dashboard/notifications` e rimasta fuori dal prodotto pur
    esistendo (W6-30).
  */
  const orderedKeys: TrainerNavigationPermissionKey[] = [
    "home",
    "trainings",
    "matches",
    "athletes",
    "categories",
    "board",
    "appointments",
    "documents",
    "compensation",
    "notifications",
  ];

  const enabledKey = orderedKeys.find((key) => permissions.navigation[key]);
  return enabledKey
    ? TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY[enabledKey]
    : "/account";
};
