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
  /*
    Le comunicazioni verso le famiglie stanno nell'area gestionale, e il
    prefisso amministrativo qui sotto le restringe a proprietario e gestore: e
    lo stesso perimetro che gia protegge il sollecito degli insoluti, perche
    mandare un messaggio a nome della societa non e meno impegnativo che
    chiedere dei soldi.
  */
  "/communications",
  /*
    Consensi. Sta fra i percorsi gestionali e **non** fra quelli riservati alla
    direzione: definire un consenso e configurazione societaria, ma registrare
    che una famiglia lo ha dato — o revocato — e un gesto che la segreteria fa
    tutti i giorni con un foglio in mano (§13 del documento 35). Il permesso
    fine lo applica `src/lib/documents/permissions.ts`.
  */
  "/consensi",
  "/hub",
  "/matches",
  "/medical",
  /*
    Modulistica resta **gestionale e non riservata alla direzione**, ed e una
    decisione presa due volte.

    La Wave 3 l'aveva chiusa a proprietario e gestore per riparare `W3-14`:
    collaboratore e staff potevano riscrivere i modelli societari e non
    potevano generare un documento. Ma il difetto vero erano le **rotte**, e
    quelle adesso sono chiuse dove serve — un modello lo scrive
    `canManageDocumentTemplates`, cioe la direzione — mentre chiudere anche la
    pagina rendeva irraggiungibili quattro righe della matrice del §13:
    vedere i modelli, generare cio che non porta dati delicati, la generazione
    massiva, rileggere i propri documenti.

    L'audit di fine Wave lo ha misurato: il collaboratore vedeva la voce nel
    menu, ci cliccava, e finiva sulla dashboard **senza una parola**. Un
    permesso che il server concede e che nessuna schermata sa esercitare non e
    un permesso: e una riga di documentazione.
  */
  "/modulistica",
  "/movements",
  "/notifications",
  "/onboarding",
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
  "/sport-work",
  "/staff",
  "/structures",
  "/trainers",
  "/training",
] as const;

const MANAGEMENT_ADMIN_ONLY_PATH_PREFIXES = [
  "/communications",
  "/create-club",
  "/dashboard/access-management",
  // La configurazione iniziale scrive dati societari: stesso perimetro di
  // /organization, quindi proprietario e club manager.
  "/onboarding",
  "/organization",
  "/permissions",
  "/settings",
  /*
    Lavoro sportivo: dice quanto guadagna una persona. Il perimetro coincide
    con quello che gia protegge conti correnti e configurazione societaria, e
    lo dichiara **anche qui** e non solo nei permessi del dominio: una guardia
    di rotta che non lo sapesse lascerebbe aprire la pagina a un collaboratore,
    che poi la troverebbe piena di errori 403 invece di una frase che spiega.
  */
  "/sport-work",
] as const;

const MANAGEMENT_ADMIN_ONLY_RESOURCES = new Set([
  "access_tokens",
  "bank_accounts",
  "clubs",
  /*
    L'altra meta di W3-14. Chiudere la **pagina** senza chiudere la **rotta**
    avrebbe spostato il difetto invece di risolverlo: il CRUD generico e
    raggiungibile senza passare da nessuna schermata, ed e da li che la sonda
    a runtime ha ottenuto i suoi `200` su creazione, modifica e cancellazione.

    Le due porte rispondevano anche diversamente in lettura —
    `GET /api/v1/document_templates` dava `200` a un collaboratore,
    `GET /api/v1/clubs?fields=…` dava `403` allo stesso — e due porte che
    rispondono diversamente sulla stessa cosa sono un difetto anche quando
    nessuna delle due e sbagliata da sola.
  */
  "document_templates",
  "organizations",
  "organization_users",
  "payment_methods",
  "users",
]);

/**
 * Le risorse la cui **cancellazione** e riservata a proprietario e gestore,
 * anche quando lettura e scrittura restano aperte alla segreteria.
 *
 * **Il difetto che chiude (D-1).** `payments` e il suo alias
 * `simplified_payments` non erano fra le risorse riservate, e non dovevano
 * esserlo: la segreteria le rate le vede e le registra tutti i giorni. Ma
 * `payment_transactions.payment_id -> payments.id` e `ON DELETE CASCADE`,
 * quindi `DELETE /api/v1/simplified_payments/:id` cancellava la rata **e a
 * cascata tutti i suoi incassi, storni e rimborsi** — da un ruolo che non ha
 * il permesso di registrarne uno.
 *
 * Chiudere l'intera risorsa avrebbe spostato il difetto invece di risolverlo:
 * avrebbe tolto alla segreteria il lavoro che le compete. La distinzione che
 * serve e fra i **verbi**, ed e la stessa che il lavoro sportivo fa gia fra
 * `sport_work.manage` e `sport_work.pay`: registrare non e distruggere.
 *
 * La guardia di dominio in `resources.ts` e l'altra meta, e non e ridondante:
 * questa dice **chi**, quella dice **cosa** — una rata con storia economica
 * non si cancella nemmeno per il proprietario.
 */
const MANAGEMENT_ADMIN_ONLY_DELETE_RESOURCES = new Set([
  "athlete_payments",
  "invoices",
  "payment_transactions",
  "payments",
  "receipts",
  "simplified_payments",
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
    if (MANAGEMENT_ADMIN_ONLY_RESOURCES.has(normalizedResource)) return false;
    if (
      action === "delete" &&
      MANAGEMENT_ADMIN_ONLY_DELETE_RESOURCES.has(normalizedResource)
    ) {
      return false;
    }
    return true;
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
