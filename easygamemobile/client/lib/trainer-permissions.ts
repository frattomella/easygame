/**
 * Specchio mobile di `src/lib/trainer-dashboard-permissions.ts`.
 *
 * **Le dieci chiavi di navigazione, non cinque.** Il mobile ne conosceva
 * solo cinque (home/trainings/matches/athletes/categories) e forzava
 * `categories: false` dopo la fusione — esattamente il tappo che il Web ha
 * tolto con W6-31 (la pagina Squadre/Categorie oggi mostra davvero i gruppi
 * del perimetro). Un club che configura i permessi da `/permissions` scrive
 * un oggetto a dieci chiavi: il mobile che ne legge cinque non e "un
 * sottoinsieme prudente", ignora la scelta del club sulle altre cinque
 * (board, documents, appointments, notifications, compensation) e riscrive
 * sempre `categories` al valore sbagliato.
 *
 * `widgets` resta con i nomi storici del mobile (`todayTrainings`/
 * `todayMatches`), diversi da quelli del Web (`upcomingTrainings`/
 * `upcomingMatches`): sono gia letti cosi da `TrainerHomeDashboardScreen`,
 * che questo giro non tocca. La normalizzazione qui sotto accetta entrambi i
 * nomi in ingresso e continua a restituire quelli storici.
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

export type TrainerWidgetPermissionKey =
  | "summary"
  | "todayTrainings"
  | "todayMatches"
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
      /* Nasce accesa, come lato Web (W6-31): niente piu forzatura a `false`. */
      categories: true,
      board: true,
      documents: true,
      appointments: true,
      notifications: true,
      compensation: true,
    },
    widgets: {
      summary: true,
      todayTrainings: true,
      todayMatches: true,
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
      viewEnrollmentAndPayments: false,
    },
  };

type PartialPermissionGroup = Record<string, unknown> | null | undefined;

const mergePermissionGroup = <T extends Record<string, boolean>>(
  defaults: T,
  overrides: PartialPermissionGroup,
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
  input: unknown,
): TrainerDashboardPermissions => {
  const outer: Record<string, unknown> =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  /*
    **Il chiamante passa `clubs.settings`, non gia l'oggetto permessi.**
    Prima questa funzione leggeva `source.navigation` direttamente
    sull'ingresso: su `clubs.settings` — cio che `resolveMobilePermissions`
    le passa davvero — quella chiave non esiste mai (vive un livello sotto,
    in `settings.trainerDashboardPermissions.navigation`), quindi
    `navigation` risultava sempre `undefined` e la fusione ricadeva **sempre**
    sui valori di default: qualunque scelta di un club su `/permissions` per
    home/allenamenti/gare/atleti non aveva **nessun** effetto sul mobile.
    Lo stesso spacchettamento del Web (`trainer-dashboard-permissions.ts`),
    qui perche prima mancava.
  */
  const source: Record<string, unknown> = (() => {
    const nested =
      outer.trainerDashboardPermissions || outer.trainer_dashboard_permissions;
    if (nested && typeof nested === "object") {
      return nested as Record<string, unknown>;
    }
    /*
      Se l'ingresso e gia l'oggetto permessi (nessuna delle due chiavi
      annidate presente, ma `navigation`/`widgets`/`actions` si') si accetta
      anche quella forma: non c'e oggi un secondo chiamante che la usi, ma
      non c'e ragione di renderla piu fragile di quanto serva.
    */
    return outer;
  })();
  const navigation =
    source.navigation && typeof source.navigation === "object"
      ? (source.navigation as Record<string, unknown>)
      : undefined;
  const widgets =
    source.widgets && typeof source.widgets === "object"
      ? (source.widgets as Record<string, unknown>)
      : undefined;
  const actions =
    source.actions && typeof source.actions === "object"
      ? (source.actions as Record<string, unknown>)
      : undefined;
  /*
    Il Web scrive `upcomingTrainings`/`upcomingMatches`; il mobile legge da
    sempre `todayTrainings`/`todayMatches`. Si accetta il nome che arriva
    davvero dal club (quello del Web) senza smettere di restituire quello
    storico, che e cio che `TrainerHomeDashboardScreen` gia si aspetta.
  */
  const normalizedWidgets = {
    ...widgets,
    todayTrainings:
      typeof widgets?.todayTrainings === "boolean"
        ? widgets.todayTrainings
        : widgets?.upcomingTrainings,
    todayMatches:
      typeof widgets?.todayMatches === "boolean"
        ? widgets.todayMatches
        : widgets?.upcomingMatches,
  };

  return {
    navigation: mergePermissionGroup(
      DEFAULT_TRAINER_DASHBOARD_PERMISSIONS.navigation,
      navigation,
    ),
    widgets: mergePermissionGroup(
      DEFAULT_TRAINER_DASHBOARD_PERMISSIONS.widgets,
      normalizedWidgets,
    ),
    actions: mergePermissionGroup(
      DEFAULT_TRAINER_DASHBOARD_PERMISSIONS.actions,
      actions,
    ),
  };
};
