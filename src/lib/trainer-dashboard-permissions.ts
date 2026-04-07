export type TrainerNavigationPermissionKey =
  | "home"
  | "trainings"
  | "matches"
  | "athletes"
  | "categories";

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
      categories: true,
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
};

export const getFirstAccessibleTrainerRoute = (
  permissions: TrainerDashboardPermissions,
) => {
  const orderedKeys: TrainerNavigationPermissionKey[] = [
    "home",
    "trainings",
    "matches",
    "athletes",
    "categories",
  ];

  const enabledKey = orderedKeys.find((key) => permissions.navigation[key]);
  return enabledKey
    ? TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY[enabledKey]
    : "/account";
};
