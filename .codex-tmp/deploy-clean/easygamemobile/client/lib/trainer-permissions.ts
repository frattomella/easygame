export type TrainerNavigationPermissionKey =
  | "home"
  | "trainings"
  | "matches"
  | "athletes"
  | "categories";

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
      categories: true,
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
  const source: Record<string, unknown> =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
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
  const normalizedNavigation = {
    ...navigation,
    categories:
      typeof navigation?.categories === "boolean"
        ? navigation.categories
        : true,
  };
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
      normalizedNavigation,
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
