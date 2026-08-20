export type CanonicalAccessRole =
  | "owner"
  | "club_manager"
  | "collaborator"
  | "staff"
  | "trainer"
  | "parent"
  | "athlete";

export type AccessArea =
  | "account"
  | "management"
  | "trainer"
  | "parent"
  | "athlete"
  | "public";

export type ResourceAction = "read" | "create" | "update" | "delete";

const ROLE_ALIASES: Record<string, CanonicalAccessRole> = {
  owner: "owner",
  proprietario: "owner",
  proprietaria: "owner",
  club_creator: "owner",
  "club-creator": "owner",
  admin: "club_manager",
  administrator: "club_manager",
  amministratore: "club_manager",
  manager: "club_manager",
  club_manager: "club_manager",
  "club-manager": "club_manager",
  gestore: "club_manager",
  collaborator: "collaborator",
  collaboratore: "collaborator",
  collaboratrice: "collaborator",
  collaboratoree: "collaborator",
  member: "collaborator",
  membro: "collaborator",
  staff: "staff",
  segreteria: "staff",
  secretariat: "staff",
  secretary: "staff",
  trainer: "trainer",
  coach: "trainer",
  allenatore: "trainer",
  allenatrice: "trainer",
  parent: "parent",
  guardian: "parent",
  genitore: "parent",
  tutore: "parent",
  tutor: "parent",
  athlete: "athlete",
  atleta: "athlete",
  player: "athlete",
  giocatore: "athlete",
  giocatrice: "athlete",
};

const MANAGEMENT_ROLES = new Set<CanonicalAccessRole>([
  "owner",
  "club_manager",
  "collaborator",
  "staff",
]);

const MANAGEMENT_PATH_PREFIXES = [
  "/dashboard",
  "/athletes",
  "/categories",
  "/clothing",
  "/hub",
  "/matches",
  "/medical",
  "/modulistica",
  "/movements",
  "/notifications",
  "/organization",
  "/payments",
  "/permissions",
  "/procura",
  "/registration-management",
  "/reports",
  "/secretariat",
  "/settings",
  "/soci",
  "/sponsors",
  "/staff",
  "/structures",
  "/trainers",
  "/training",
] as const;

const MANAGEMENT_ADMIN_ONLY_PATH_PREFIXES = [
  "/create-club",
  "/dashboard/access-management",
  "/organization",
  "/permissions",
  "/settings",
] as const;

const MANAGEMENT_ADMIN_ONLY_RESOURCES = new Set([
  "access_tokens",
  "bank_accounts",
  "clubs",
  "organizations",
  "organization_users",
  "payment_methods",
  "users",
]);

const TRAINER_READ_RESOURCES = new Set([
  "athlete_category_memberships",
  "athletes",
  "categories",
  "club_resource_items",
  "matches",
  "medical_certificates",
  "notifications",
  "secretariat_notes",
  "simplified_athletes",
  "simplified_certificates",
  "simplified_notifications",
  "staff_members",
  "trainers",
  "training_attendance",
  "trainings",
]);

const TRAINER_WRITE_RESOURCES = new Set([
  "matches",
  "notifications",
  "simplified_notifications",
  "training_attendance",
  "trainings",
]);

const matchesPathPrefix = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

export const normalizeAccessRole = (
  role?: string | null,
): CanonicalAccessRole | "" => {
  const value = String(role || "")
    .trim()
    .toLowerCase();
  return ROLE_ALIASES[value] || "";
};

export const isKnownAccessRole = (role?: string | null) =>
  Boolean(normalizeAccessRole(role));

export const getAccessRoleLabel = (role?: string | null) => {
  switch (normalizeAccessRole(role)) {
    case "owner":
      return "Proprietario";
    case "club_manager":
      return "Club manager";
    case "trainer":
      return "Allenatore";
    case "athlete":
      return "Atleta";
    case "parent":
      return "Genitore";
    case "staff":
      return "Staff";
    case "collaborator":
      return "Collaboratore";
    default:
      return "Accesso non riconosciuto";
  }
};

export const isOwnerAccessRole = (role?: string | null) =>
  normalizeAccessRole(role) === "owner";

export const isClubManagerAccessRole = (role?: string | null) =>
  normalizeAccessRole(role) === "club_manager";

export const isTrainerAccessRole = (role?: string | null) =>
  normalizeAccessRole(role) === "trainer";

export const isParentAccessRole = (role?: string | null) =>
  normalizeAccessRole(role) === "parent";

export const isAthleteAccessRole = (role?: string | null) =>
  normalizeAccessRole(role) === "athlete";

export const isManagementAccessRole = (role?: string | null) => {
  const normalizedRole = normalizeAccessRole(role);
  return normalizedRole ? MANAGEMENT_ROLES.has(normalizedRole) : false;
};

export const getAccessArea = (role?: string | null): AccessArea => {
  const normalizedRole = normalizeAccessRole(role);
  if (normalizedRole && MANAGEMENT_ROLES.has(normalizedRole)) {
    return "management";
  }
  if (normalizedRole === "trainer") return "trainer";
  if (normalizedRole === "parent") return "parent";
  if (normalizedRole === "athlete") return "athlete";
  return "account";
};

export const getAccessRedirectPath = (
  role?: string | null,
  context: {
    organizationId?: string | null;
    linkedAthleteId?: string | null;
  } = {},
) => {
  const normalizedRole = normalizeAccessRole(role);
  const organizationId = String(context.organizationId || "").trim();
  const linkedAthleteId = String(context.linkedAthleteId || "").trim();

  if (normalizedRole && MANAGEMENT_ROLES.has(normalizedRole)) {
    return organizationId
      ? `/dashboard?clubId=${encodeURIComponent(organizationId)}`
      : "/account";
  }
  if (normalizedRole === "trainer") return "/trainer-dashboard";
  if (normalizedRole === "parent") {
    return linkedAthleteId
      ? `/parent-view/${encodeURIComponent(linkedAthleteId)}`
      : "/account";
  }
  if (normalizedRole === "athlete") {
    return linkedAthleteId
      ? `/athletes/${encodeURIComponent(linkedAthleteId)}/profile`
      : "/account";
  }
  return "/account";
};

export const getPathAccessArea = (pathname?: string | null): AccessArea => {
  const path = String(pathname || "").trim() || "/";
  if (matchesPathPrefix(path, "/trainer-dashboard")) return "trainer";
  if (matchesPathPrefix(path, "/parent-view")) return "parent";
  if (/^\/athletes\/[^/]+\/profile(?:\/|$)/.test(path)) return "athlete";
  if (
    matchesPathPrefix(path, "/create-club") ||
    MANAGEMENT_PATH_PREFIXES.some((prefix) => matchesPathPrefix(path, prefix))
  ) {
    return "management";
  }
  if (
    matchesPathPrefix(path, "/account") ||
    matchesPathPrefix(path, "/profile") ||
    matchesPathPrefix(path, "/token-verification")
  ) {
    return "account";
  }
  return "public";
};

export const canAccessPath = (
  role: string | null | undefined,
  pathname: string,
  context: { linkedAthleteId?: string | null } = {},
) => {
  const requiredArea = getPathAccessArea(pathname);
  const normalizedRole = normalizeAccessRole(role);

  if (requiredArea === "public" || requiredArea === "account") return true;
  if (!normalizedRole) return false;

  if (requiredArea === "management") {
    if (!MANAGEMENT_ROLES.has(normalizedRole)) return false;
    const adminOnly = MANAGEMENT_ADMIN_ONLY_PATH_PREFIXES.some((prefix) =>
      matchesPathPrefix(pathname, prefix),
    );
    return !adminOnly || ["owner", "club_manager"].includes(normalizedRole);
  }

  if (requiredArea === "trainer") return normalizedRole === "trainer";
  if (requiredArea === "parent") {
    if (normalizedRole !== "parent") return false;
    const linkedAthleteId = String(context.linkedAthleteId || "").trim();
    return (
      Boolean(linkedAthleteId) &&
      matchesPathPrefix(pathname, `/parent-view/${linkedAthleteId}`)
    );
  }
  if (requiredArea === "athlete") {
    if (MANAGEMENT_ROLES.has(normalizedRole)) return true;
    if (normalizedRole !== "athlete") return false;
    const linkedAthleteId = String(context.linkedAthleteId || "").trim();
    return (
      Boolean(linkedAthleteId) &&
      matchesPathPrefix(pathname, `/athletes/${linkedAthleteId}/profile`)
    );
  }

  return false;
};

/**
 * Autorizzazione per le API generiche del club. Parent e atleta usano endpoint
 * dedicati e non possono enumerare le risorse amministrative del club.
 */
export const canAccessClubResource = (
  role: string | null | undefined,
  resource: string,
  action: ResourceAction,
) => {
  const normalizedRole = normalizeAccessRole(role);
  const normalizedResource = String(resource || "")
    .trim()
    .toLowerCase();

  if (normalizedRole === "owner" || normalizedRole === "club_manager") {
    return true;
  }

  if (normalizedRole === "collaborator" || normalizedRole === "staff") {
    return !MANAGEMENT_ADMIN_ONLY_RESOURCES.has(normalizedResource);
  }

  if (normalizedRole === "trainer") {
    return action === "read"
      ? TRAINER_READ_RESOURCES.has(normalizedResource)
      : TRAINER_WRITE_RESOURCES.has(normalizedResource);
  }

  return false;
};

export const assertClubResourceAccess = (
  role: string | null | undefined,
  resource: string,
  action: ResourceAction,
) => {
  if (!canAccessClubResource(role, resource, action)) {
    throw new Error("Accesso negato per il ruolo attivo");
  }
};

export const canManageClubConfiguration = (role?: string | null) => {
  const normalizedRole = normalizeAccessRole(role);
  return normalizedRole === "owner" || normalizedRole === "club_manager";
};
