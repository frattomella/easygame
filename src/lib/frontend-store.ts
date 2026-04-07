type AuthMetadata = Record<string, any>;

type LocalAuthUserRecord = {
  id: string;
  email: string;
  password: string;
  user_metadata: AuthMetadata;
  created_at: string;
  updated_at: string;
  email_confirmed_at?: string;
};

type LocalStore = {
  authUsers: LocalAuthUserRecord[];
  tables: Record<string, any[]>;
  storage: Record<string, Record<string, string>>;
};

type MockUser = Omit<LocalAuthUserRecord, "password"> & {
  app_metadata: Record<string, any>;
  aud: string;
};

type MockSession = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  expires_at: number;
  user: MockUser;
};

type QueryFilter =
  | { type: "eq"; column: string; value: any }
  | { type: "neq"; column: string; value: any }
  | { type: "in"; column: string; value: any[] }
  | { type: "lte"; column: string; value: any }
  | { type: "match"; value: Record<string, any> }
  | { type: "or"; value: string };

type QueryAction = "select" | "insert" | "update" | "delete" | "upsert";

type RealtimeHandler = {
  id: string;
  table?: string;
  event: string;
  callback: (payload: any) => void;
};

type SelectToken =
  | { type: "wildcard" }
  | { type: "field"; value: string }
  | { type: "relation"; relation: string; columns: string };

const STORE_KEY = "easygame.frontend-store.v1";
const SESSION_KEY = "easygame.frontend-session.v1";

const DEMO_IDS = {
  clubCreator: "3b9d31c4-5d3e-47bc-9e9b-0f205adc7c01",
  trainer: "3b9d31c4-5d3e-47bc-9e9b-0f205adc7c02",
  athleteUser: "3b9d31c4-5d3e-47bc-9e9b-0f205adc7c03",
  parent: "3b9d31c4-5d3e-47bc-9e9b-0f205adc7c04",
  organization: "61b0cb79-e17c-47e3-9eca-352e3d5ec801",
  dashboard: "c2542d67-f2ff-44e4-aa77-8b4434ef5a01",
  categoryUnder15: "89b77cc9-c4d8-4c86-b1c9-1fa84f1f0901",
  categoryUnder17: "89b77cc9-c4d8-4c86-b1c9-1fa84f1f0902",
  athleteOne: "9a7678b5-286d-43cb-8f89-7c2e4f3f3c01",
  athleteTwo: "9a7678b5-286d-43cb-8f89-7c2e4f3f3c02",
  athleteThree: "9a7678b5-286d-43cb-8f89-7c2e4f3f3c03",
};

let memoryStore: LocalStore | null = null;
let memorySession: MockSession | null = null;

const authListeners = new Set<
  (event: string, session: MockSession | null) => void
>();
const realtimeHandlers = new Map<string, RealtimeHandler[]>();

const isBrowser = () => typeof window !== "undefined";

const clone = <T>(value: T): T => {
  if (value === undefined || value === null) {
    return value;
  }

  return JSON.parse(JSON.stringify(value));
};

const nowIso = () => new Date().toISOString();

const generateId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `mock-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
};

const getNestedValue = (row: any, column: string) => {
  if (!row || !column) return undefined;

  if (column.includes(".")) {
    return column
      .split(".")
      .reduce(
        (value, segment) =>
          value !== null && value !== undefined ? value[segment] : undefined,
        row,
      );
  }

  return row[column];
};

const toComparableValue = (value: any) => {
  if (value === undefined) return null;
  return value;
};

const createAuthUser = ({
  id,
  email,
  password,
  metadata,
}: {
  id: string;
  email: string;
  password: string;
  metadata: AuthMetadata;
}): LocalAuthUserRecord => ({
  id,
  email,
  password,
  user_metadata: metadata,
  created_at: nowIso(),
  updated_at: nowIso(),
  email_confirmed_at: nowIso(),
});

const createDefaultClubRecord = ({
  id,
  creatorId,
  name,
}: {
  id: string;
  creatorId: string;
  name: string;
}) => ({
  id,
  name,
  creator_id: creatorId,
  logo_url: null,
  created_at: nowIso(),
  updated_at: nowIso(),
  address: "Via dello Sport 10",
  city: "Roma",
  postal_code: "00100",
  region: "Lazio",
  province: "RM",
  contact_email: "info@easygame.it",
  contact_phone: "+39 06 1234567",
  payment_pin: "1234",
});

const createSeedStore = (): LocalStore => {
  const clubCreator = createAuthUser({
    id: DEMO_IDS.clubCreator,
    email: "demo@easygame.it",
    password: "password123",
    metadata: {
      name: "Demo Club",
      firstName: "Demo",
      lastName: "Club",
      role: "club_creator",
      isClubCreator: true,
      organizationName: "EasyGame FC",
    },
  });

  const trainer = createAuthUser({
    id: DEMO_IDS.trainer,
    email: "trainer@easygame.it",
    password: "password123",
    metadata: {
      name: "Luca Trainer",
      firstName: "Luca",
      lastName: "Trainer",
      role: "trainer",
    },
  });

  const athlete = createAuthUser({
    id: DEMO_IDS.athleteUser,
    email: "athlete@easygame.it",
    password: "password123",
    metadata: {
      name: "Giulia Athlete",
      firstName: "Giulia",
      lastName: "Athlete",
      role: "athlete",
    },
  });

  const parent = createAuthUser({
    id: DEMO_IDS.parent,
    email: "parent@easygame.it",
    password: "password123",
    metadata: {
      name: "Paolo Parent",
      firstName: "Paolo",
      lastName: "Parent",
      role: "parent",
    },
  });

  const organization = {
    id: DEMO_IDS.organization,
    name: "EasyGame FC",
    slug: "easygame-fc",
    creator_id: DEMO_IDS.clubCreator,
    logo_url: null,
    created_at: nowIso(),
    updated_at: nowIso(),
    city: "Roma",
    country: "Italy",
    contact_email: "info@easygame.it",
    contact_phone: "+39 06 1234567",
  };

  const clubRecord = {
    ...createDefaultClubRecord({
      id: DEMO_IDS.organization,
      creatorId: DEMO_IDS.clubCreator,
      name: "EasyGame FC",
    }),
    categories: [
      {
        id: DEMO_IDS.categoryUnder15,
        name: "Under 15",
        color: "#2563eb",
      },
      {
        id: DEMO_IDS.categoryUnder17,
        name: "Under 17",
        color: "#16a34a",
      },
    ],
    trainings: [
      {
        id: "training-demo-1",
        title: "Allenamento Under 15",
        category: "Under 15",
        date: new Date(Date.now() + 86400000).toISOString(),
        time: "18:00",
        location: "Campo Centrale",
        status: "scheduled",
      },
      {
        id: "training-demo-2",
        title: "Allenamento Under 17",
        category: "Under 17",
        date: new Date(Date.now() + 172800000).toISOString(),
        time: "19:30",
        location: "Palestra A",
        status: "scheduled",
      },
    ],
    appointments: [
      {
        id: "appointment-demo-1",
        title: "Riunione staff",
        date: nowIso(),
        time: "17:00",
        description: "Allineamento settimanale con allenatori e segreteria.",
      },
    ],
    secretariat_notes: [
      {
        id: "note-demo-1",
        content: "Aggiornare modulistica nuovi iscritti.",
        date: nowIso(),
        expiryDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        notificationEnabled: true,
      },
    ],
    clothing_kits: [],
    kit_assignments: [],
    clothing_products: [],
    clothing_inventory: [],
    jersey_groups: [],
    jersey_assignments: [],
    staff_members: [],
    trainers: [],
    sponsors: [],
    secretariat: [],
    structures: [],
    payments: [],
    matches: [
      {
        id: "match-demo-1",
        title: "EasyGame FC vs Tigers",
        date: nowIso(),
        time: "16:00",
        opponent: "Tigers",
        location: "Stadio Comunale",
        category: "Under 17",
        status: "scheduled",
      },
    ],
  };

  return {
    authUsers: [clubCreator, trainer, athlete, parent],
    tables: {
      organizations: [organization],
      clubs: [clubRecord],
      dashboards: [
        {
          id: DEMO_IDS.dashboard,
          organization_id: DEMO_IDS.organization,
          creator_id: DEMO_IDS.clubCreator,
          slug: "dashboard-demo",
          settings: {
            theme: "default",
            layout: "standard",
            widgets: ["metrics", "activities", "trainings", "certifications"],
          },
          created_at: nowIso(),
        },
      ],
      organization_users: [
        {
          id: generateId(),
          organization_id: DEMO_IDS.organization,
          user_id: DEMO_IDS.clubCreator,
          role: "owner",
          is_primary: true,
          created_at: nowIso(),
        },
        {
          id: generateId(),
          organization_id: DEMO_IDS.organization,
          user_id: DEMO_IDS.trainer,
          role: "trainer",
          is_primary: false,
          created_at: nowIso(),
        },
        {
          id: generateId(),
          organization_id: DEMO_IDS.organization,
          user_id: DEMO_IDS.parent,
          role: "parent",
          is_primary: false,
          created_at: nowIso(),
        },
      ],
      users: [
        {
          id: DEMO_IDS.clubCreator,
          email: clubCreator.email,
          first_name: "Demo",
          last_name: "Club",
          phone: "+39 333 0000001",
          token_verification_id: "demo-club-token",
          club_access: [
            {
              club_id: DEMO_IDS.organization,
              role: "owner",
              is_primary: true,
            },
          ],
        },
        {
          id: DEMO_IDS.trainer,
          email: trainer.email,
          first_name: "Luca",
          last_name: "Trainer",
          phone: "+39 333 0000002",
          token_verification_id: "demo-trainer-token",
          club_access: [
            {
              club_id: DEMO_IDS.organization,
              role: "trainer",
              is_primary: true,
            },
          ],
        },
        {
          id: DEMO_IDS.athleteUser,
          email: athlete.email,
          first_name: "Giulia",
          last_name: "Athlete",
          phone: "+39 333 0000003",
          token_verification_id: "demo-athlete-token",
          club_access: [
            {
              club_id: DEMO_IDS.organization,
              role: "athlete",
              is_primary: true,
            },
          ],
        },
        {
          id: DEMO_IDS.parent,
          email: parent.email,
          first_name: "Paolo",
          last_name: "Parent",
          phone: "+39 333 0000004",
          token_verification_id: "demo-parent-token",
          club_access: [
            {
              club_id: DEMO_IDS.organization,
              role: "parent",
              is_primary: true,
            },
          ],
        },
      ],
      categories: [
        {
          id: DEMO_IDS.categoryUnder15,
          club_id: DEMO_IDS.organization,
          name: "Under 15",
          description: "Gruppo agonistico Under 15",
          color: "#2563eb",
        },
        {
          id: DEMO_IDS.categoryUnder17,
          club_id: DEMO_IDS.organization,
          name: "Under 17",
          description: "Gruppo agonistico Under 17",
          color: "#16a34a",
        },
      ],
      athletes: [
        {
          id: DEMO_IDS.athleteOne,
          user_id: DEMO_IDS.athleteUser,
          club_id: DEMO_IDS.organization,
          name: "Giulia Athlete",
          jersey_number: 10,
          category_id: DEMO_IDS.categoryUnder17,
        },
      ],
      simplified_athletes: [
        {
          id: DEMO_IDS.athleteOne,
          club_id: DEMO_IDS.organization,
          user_id: DEMO_IDS.athleteUser,
          first_name: "Giulia",
          last_name: "Athlete",
          birth_date: "2010-04-10",
          data: {
            status: "active",
            category: DEMO_IDS.categoryUnder17,
            jerseyNumber: 10,
          },
        },
        {
          id: DEMO_IDS.athleteTwo,
          club_id: DEMO_IDS.organization,
          first_name: "Matteo",
          last_name: "Rossi",
          birth_date: "2011-07-21",
          data: {
            status: "active",
            category: DEMO_IDS.categoryUnder15,
            jerseyNumber: 8,
          },
        },
        {
          id: DEMO_IDS.athleteThree,
          club_id: DEMO_IDS.organization,
          first_name: "Elena",
          last_name: "Verdi",
          birth_date: "2009-01-18",
          data: {
            status: "inactive",
            category: DEMO_IDS.categoryUnder17,
            jerseyNumber: 17,
          },
        },
      ],
      medical_certificates: [
        {
          id: generateId(),
          organization_id: DEMO_IDS.organization,
          athlete_id: DEMO_IDS.athleteOne,
          expiry_date: new Date(Date.now() + 12 * 86400000)
            .toISOString()
            .split("T")[0],
        },
        {
          id: generateId(),
          organization_id: DEMO_IDS.organization,
          athlete_id: DEMO_IDS.athleteTwo,
          expiry_date: new Date(Date.now() - 3 * 86400000)
            .toISOString()
            .split("T")[0],
        },
      ],
      simplified_notifications: [
        {
          id: generateId(),
          user_id: DEMO_IDS.clubCreator,
          title: "Certificato in scadenza",
          message: "Il certificato di Giulia Athlete scade tra 12 giorni.",
          type: "certificate",
          read: false,
          created_at: nowIso(),
          data: {},
        },
        {
          id: generateId(),
          user_id: null,
          title: "Allenamento confermato",
          message: "La seduta di domani alle 18:00 è stata confermata.",
          type: "training",
          read: false,
          created_at: new Date(Date.now() - 3600000).toISOString(),
          data: {},
        },
      ],
      notifications: [],
      payment_methods: [
        {
          id: generateId(),
          organization_id: DEMO_IDS.organization,
          type: "bank_transfer",
          name: "Bonifico bancario",
          iban: "IT60X0542811101000000123456",
          is_active: true,
          display_order: 1,
        },
      ],
      payments: [],
      simplified_payments: [],
      trainings: [
        {
          id: "training-row-1",
          organization_id: DEMO_IDS.organization,
          title: "Allenamento Under 15",
          category_id: DEMO_IDS.categoryUnder15,
          date: new Date(Date.now() + 86400000).toISOString(),
          time: "18:00",
          location: "Campo Centrale",
          status: "scheduled",
        },
        {
          id: "training-row-2",
          organization_id: DEMO_IDS.organization,
          title: "Allenamento Under 17",
          category_id: DEMO_IDS.categoryUnder17,
          date: new Date(Date.now() + 172800000).toISOString(),
          time: "19:30",
          location: "Palestra A",
          status: "scheduled",
        },
      ],
      training_attendance: [],
      simplified_certificates: [],
    },
    storage: {},
  };
};

const getSessionUser = (user: LocalAuthUserRecord): MockUser => ({
  id: user.id,
  email: user.email,
  user_metadata: clone(user.user_metadata),
  created_at: user.created_at,
  updated_at: user.updated_at,
  email_confirmed_at: user.email_confirmed_at,
  app_metadata: { provider: "frontend-local", providers: ["frontend-local"] },
  aud: "authenticated",
});

const createSessionForUser = (user: LocalAuthUserRecord): MockSession => ({
  access_token: `frontend-access-${generateId()}`,
  refresh_token: `frontend-refresh-${generateId()}`,
  token_type: "bearer",
  expires_in: 60 * 60 * 24 * 30,
  expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  user: getSessionUser(user),
});

const getStore = (): LocalStore => {
  if (!isBrowser()) {
    if (!memoryStore) {
      memoryStore = createSeedStore();
    }
    return memoryStore;
  }

  const raw = window.localStorage.getItem(STORE_KEY);
  if (!raw) {
    const seeded = createSeedStore();
    window.localStorage.setItem(STORE_KEY, JSON.stringify(seeded));
    memoryStore = seeded;
    return seeded;
  }

  try {
    const parsed = JSON.parse(raw) as LocalStore;
    memoryStore = parsed;
    return parsed;
  } catch {
    const seeded = createSeedStore();
    window.localStorage.setItem(STORE_KEY, JSON.stringify(seeded));
    memoryStore = seeded;
    return seeded;
  }
};

const saveStore = (store: LocalStore) => {
  memoryStore = store;
  if (isBrowser()) {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
  }
};

const getSession = (): MockSession | null => {
  if (!isBrowser()) {
    return memorySession ? clone(memorySession) : null;
  }

  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as MockSession;
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
};

const saveSession = (session: MockSession | null) => {
  memorySession = session ? clone(session) : null;

  if (isBrowser()) {
    if (!session) {
      window.localStorage.removeItem(SESSION_KEY);
    } else {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }
  }
};

const emitAuthState = (event: string, session: MockSession | null) => {
  authListeners.forEach((listener) => {
    try {
      listener(event, session ? clone(session) : null);
    } catch (error) {
      console.error("Auth listener error:", error);
    }
  });
};

const splitTopLevel = (value: string) => {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of value) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;

    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
};

const parseSelect = (value?: string | null): SelectToken[] => {
  if (!value || value === "*") {
    return [{ type: "wildcard" }];
  }

  return splitTopLevel(value).map((part) => {
    if (part === "*") {
      return { type: "wildcard" } as SelectToken;
    }

    const relationMatch = part.match(/^([a-zA-Z0-9_]+)\((.*)\)$/);
    if (relationMatch) {
      return {
        type: "relation",
        relation: relationMatch[1],
        columns: relationMatch[2] || "*",
      } as SelectToken;
    }

    return { type: "field", value: part } as SelectToken;
  });
};

const getRelatedRecord = (
  store: LocalStore,
  currentTable: string,
  row: any,
  relation: string,
) => {
  if (!row) return null;

  if (row[relation]) {
    return row[relation];
  }

  const relationTable =
    relation === "athletes" && !store.tables.athletes?.length
      ? "simplified_athletes"
      : relation;

  const foreignKeyCandidates = [
    `${relation.replace(/s$/, "")}_id`,
    `${relation}_id`,
    relation === "organizations" ? "organization_id" : "",
    relation === "athletes" ? "athlete_id" : "",
    relation === "categories" ? "category_id" : "",
  ].filter(Boolean);

  const foreignKey = foreignKeyCandidates.find((candidate) => row[candidate]);

  if (!foreignKey) {
    if (relation === "organizations" && currentTable === "organization_users") {
      return (
        store.tables.organizations?.find(
          (item) => item.id === row.organization_id,
        ) || null
      );
    }
    return null;
  }

  return (
    store.tables[relationTable]?.find((item) => item.id === row[foreignKey]) ||
    null
  );
};

const applySelect = (
  store: LocalStore,
  table: string,
  row: any,
  selectClause?: string | null,
) => {
  const tokens = parseSelect(selectClause);
  if (!row) return null;

  const includesWildcard = tokens.some((token) => token.type === "wildcard");
  const result = includesWildcard ? clone(row) : {};

  tokens.forEach((token) => {
    if (token.type === "field") {
      result[token.value] = clone(getNestedValue(row, token.value));
      return;
    }

    if (token.type === "relation") {
      const related = getRelatedRecord(store, table, row, token.relation);
      result[token.relation] = related
        ? applySelect(store, token.relation, related, token.columns)
        : null;
    }
  });

  return result;
};

const applyFilters = (rows: any[], filters: QueryFilter[]) => {
  return rows.filter((row) =>
    filters.every((filter) => {
      if (filter.type === "eq") {
        return (
          toComparableValue(getNestedValue(row, filter.column)) ===
          toComparableValue(filter.value)
        );
      }

      if (filter.type === "neq") {
        return (
          toComparableValue(getNestedValue(row, filter.column)) !==
          toComparableValue(filter.value)
        );
      }

      if (filter.type === "in") {
        return filter.value.includes(getNestedValue(row, filter.column));
      }

      if (filter.type === "lte") {
        return (
          String(toComparableValue(getNestedValue(row, filter.column))) <=
          String(toComparableValue(filter.value))
        );
      }

      if (filter.type === "match") {
        return Object.entries(filter.value).every(
          ([column, value]) =>
            toComparableValue(getNestedValue(row, column)) ===
            toComparableValue(value),
        );
      }

      if (filter.type === "or") {
        return splitTopLevel(filter.value).some((segment) => {
          const cleaned = segment.trim();
          if (!cleaned) return false;

          const [column, operator, ...valueParts] = cleaned.split(".");
          const parsedValue = valueParts.join(".");
          const currentValue = getNestedValue(row, column);

          if (operator === "eq") {
            return String(toComparableValue(currentValue)) === parsedValue;
          }

          if (operator === "is" && parsedValue === "null") {
            return currentValue === null || currentValue === undefined;
          }

          return false;
        });
      }

      return true;
    }),
  );
};

const sortRows = (
  rows: any[],
  column?: string,
  ascending: boolean = true,
) => {
  if (!column) return rows;

  return [...rows].sort((left, right) => {
    const leftValue = getNestedValue(left, column);
    const rightValue = getNestedValue(right, column);

    if (leftValue === rightValue) return 0;

    if (leftValue === undefined || leftValue === null) {
      return ascending ? 1 : -1;
    }

    if (rightValue === undefined || rightValue === null) {
      return ascending ? -1 : 1;
    }

    if (leftValue > rightValue) {
      return ascending ? 1 : -1;
    }

    return ascending ? -1 : 1;
  });
};

const ensureTable = (store: LocalStore, table: string) => {
  if (!store.tables[table]) {
    store.tables[table] = [];
  }

  return store.tables[table];
};

const syncOrganizationMirror = (store: LocalStore, organizationId: string) => {
  const organization = ensureTable(store, "organizations").find(
    (item) => item.id === organizationId,
  );
  if (!organization) return;

  const clubs = ensureTable(store, "clubs");
  const existingClub = clubs.find((item) => item.id === organizationId);

  if (existingClub) {
    existingClub.name = organization.name;
    existingClub.logo_url = organization.logo_url ?? existingClub.logo_url;
    existingClub.updated_at = nowIso();
    return;
  }

  clubs.push(
    createDefaultClubRecord({
      id: organization.id,
      creatorId: organization.creator_id || DEMO_IDS.clubCreator,
      name: organization.name,
    }),
  );
};

const syncUserClubAccess = (store: LocalStore, organizationUser: any) => {
  if (!organizationUser?.user_id || !organizationUser?.organization_id) return;

  const users = ensureTable(store, "users");
  const targetUser = users.find((user) => user.id === organizationUser.user_id);
  if (!targetUser) return;

  const currentAccess = Array.isArray(targetUser.club_access)
    ? targetUser.club_access
    : [];
  const existingIndex = currentAccess.findIndex(
    (access: any) => access.club_id === organizationUser.organization_id,
  );
  const nextAccess = {
    club_id: organizationUser.organization_id,
    role: organizationUser.role || "member",
    is_primary: Boolean(organizationUser.is_primary),
  };

  if (existingIndex >= 0) {
    currentAccess[existingIndex] = nextAccess;
  } else {
    currentAccess.push(nextAccess);
  }

  targetUser.club_access = currentAccess;
};

const notifyRealtime = ({
  event,
  table,
  newRow,
  oldRow,
}: {
  event: string;
  table: string;
  newRow?: any;
  oldRow?: any;
}) => {
  realtimeHandlers.forEach((handlers) => {
    handlers.forEach((handler) => {
      const eventMatches =
        handler.event === "*" ||
        handler.event === event ||
        (handler.event === "postgres_changes" && Boolean(event));
      const tableMatches = !handler.table || handler.table === table;

      if (!eventMatches || !tableMatches) return;

      try {
        handler.callback({
          eventType: event,
          schema: "public",
          table,
          new: newRow ? clone(newRow) : null,
          old: oldRow ? clone(oldRow) : null,
        });
      } catch (error) {
        console.error("Realtime listener error:", error);
      }
    });
  });
};

class LocalQueryBuilder {
  private action: QueryAction = "select";
  private filters: QueryFilter[] = [];
  private selectClause: string | null = "*";
  private payload: any = null;
  private singleResult = false;
  private orderBy?: { column: string; ascending: boolean };
  private rowLimit?: number;

  constructor(private readonly table: string) {}

  select(columns: string = "*") {
    this.selectClause = columns;
    return this;
  }

  insert(payload: any) {
    this.action = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: any) {
    this.action = "update";
    this.payload = payload;
    return this;
  }

  upsert(payload: any) {
    this.action = "upsert";
    this.payload = payload;
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push({ type: "eq", column, value });
    return this;
  }

  neq(column: string, value: any) {
    this.filters.push({ type: "neq", column, value });
    return this;
  }

  in(column: string, value: any[]) {
    this.filters.push({ type: "in", column, value });
    return this;
  }

  lte(column: string, value: any) {
    this.filters.push({ type: "lte", column, value });
    return this;
  }

  match(value: Record<string, any>) {
    this.filters.push({ type: "match", value });
    return this;
  }

  or(value: string) {
    this.filters.push({ type: "or", value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = {
      column,
      ascending: options?.ascending !== false,
    };
    return this;
  }

  limit(value: number) {
    this.rowLimit = value;
    return this;
  }

  single() {
    this.singleResult = true;
    return this;
  }

  maybeSingle() {
    this.singleResult = true;
    return this;
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: any) => TResult2 | PromiseLike<TResult2>)
      | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?:
      | ((reason: any) => TResult | PromiseLike<TResult>)
      | null,
  ) {
    return this.execute().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null) {
    return this.execute().finally(onfinally ?? undefined);
  }

  private async execute() {
    const store = clone(getStore());
    const tableRows = ensureTable(store, this.table);

    try {
      let affectedRows: any[] = [];

      if (this.action === "select") {
        affectedRows = applyFilters(tableRows, this.filters);
        affectedRows = sortRows(
          affectedRows,
          this.orderBy?.column,
          this.orderBy?.ascending,
        );
        if (typeof this.rowLimit === "number") {
          affectedRows = affectedRows.slice(0, this.rowLimit);
        }
      }

      if (this.action === "insert") {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
        affectedRows = rows.map((item) => {
          const nextRow = {
            id: item?.id || generateId(),
            created_at: item?.created_at || nowIso(),
            updated_at: item?.updated_at || nowIso(),
            ...clone(item),
          };
          tableRows.push(nextRow);

          if (this.table === "organizations") {
            syncOrganizationMirror(store, nextRow.id);
          }
          if (this.table === "organization_users") {
            syncUserClubAccess(store, nextRow);
          }

          notifyRealtime({
            event: "INSERT",
            table: this.table,
            newRow: nextRow,
          });
          return nextRow;
        });

        saveStore(store);
      }

      if (this.action === "update") {
        const rowsToUpdate = applyFilters(tableRows, this.filters);
        affectedRows = rowsToUpdate.map((row) => {
          const oldRow = clone(row);
          Object.assign(row, clone(this.payload), { updated_at: nowIso() });

          if (this.table === "organizations") {
            syncOrganizationMirror(store, row.id);
          }

          notifyRealtime({
            event: "UPDATE",
            table: this.table,
            newRow: row,
            oldRow,
          });
          return clone(row);
        });

        saveStore(store);
      }

      if (this.action === "delete") {
        const rowsToDelete = applyFilters(tableRows, this.filters);
        const idsToDelete = new Set(rowsToDelete.map((row) => row.id));
        affectedRows = rowsToDelete.map((row) => clone(row));
        store.tables[this.table] = tableRows.filter((row) => !idsToDelete.has(row.id));

        affectedRows.forEach((row) =>
          notifyRealtime({
            event: "DELETE",
            table: this.table,
            oldRow: row,
          }),
        );

        saveStore(store);
      }

      if (this.action === "upsert") {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
        affectedRows = rows.map((item) => {
          const match = tableRows.find((row) => {
            if (item?.id && row.id === item.id) return true;
            if (item?.email && row.email === item.email) return true;
            if (
              item?.organization_id &&
              item?.user_id &&
              row.organization_id === item.organization_id &&
              row.user_id === item.user_id
            ) {
              return true;
            }
            return false;
          });

          if (match) {
            const oldRow = clone(match);
            Object.assign(match, clone(item), { updated_at: nowIso() });
            notifyRealtime({
              event: "UPDATE",
              table: this.table,
              newRow: match,
              oldRow,
            });
            if (this.table === "organizations") {
              syncOrganizationMirror(store, match.id);
            }
            if (this.table === "organization_users") {
              syncUserClubAccess(store, match);
            }
            return clone(match);
          }

          const nextRow = {
            id: item?.id || generateId(),
            created_at: item?.created_at || nowIso(),
            updated_at: item?.updated_at || nowIso(),
            ...clone(item),
          };
          tableRows.push(nextRow);
          if (this.table === "organizations") {
            syncOrganizationMirror(store, nextRow.id);
          }
          if (this.table === "organization_users") {
            syncUserClubAccess(store, nextRow);
          }
          notifyRealtime({
            event: "INSERT",
            table: this.table,
            newRow: nextRow,
          });
          return nextRow;
        });

        saveStore(store);
      }

      const projectedRows = affectedRows.map((row) =>
        applySelect(store, this.table, row, this.selectClause),
      );
      const data = this.singleResult ? projectedRows[0] || null : projectedRows;

      return { data, error: null };
    } catch (error: any) {
      return {
        data: this.singleResult ? null : [],
        error: {
          message: error?.message || "Frontend store error",
        },
      };
    }
  }
}

const syncAuthUserToPublicUser = (
  store: LocalStore,
  authUser: LocalAuthUserRecord,
  password: string,
) => {
  const users = ensureTable(store, "users");
  const existingUser = users.find((user) => user.id === authUser.id);
  const metadata = authUser.user_metadata || {};

  if (existingUser) {
    existingUser.email = authUser.email;
    existingUser.first_name =
      metadata.firstName || existingUser.first_name || metadata.name || "";
    existingUser.last_name = metadata.lastName || existingUser.last_name || "";
    existingUser.phone = metadata.phone || existingUser.phone || null;
    existingUser.password = password;
    return;
  }

  users.push({
    id: authUser.id,
    email: authUser.email,
    first_name: metadata.firstName || "",
    last_name: metadata.lastName || "",
    phone: metadata.phone || null,
    password,
    token_verification_id: `token-${generateId()}`,
    club_access: [],
  });
};

const fileToDataUrl = async (file: File | Blob | any) => {
  if (!isBrowser()) {
    return "";
  }

  if (typeof file === "string") {
    return file;
  }

  if (file instanceof Blob) {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  return "";
};

export const createFrontendSupabaseClient = () => ({
  from(table: string) {
    return new LocalQueryBuilder(table);
  },

  auth: {
    async signInWithPassword({
      email,
      password,
    }: {
      email: string;
      password: string;
    }) {
      const store = clone(getStore());
      const user = store.authUsers.find(
        (record) =>
          record.email.toLowerCase() === email.toLowerCase() &&
          record.password === password,
      );

      if (!user) {
        return {
          data: { user: null, session: null },
          error: {
            name: "AuthApiError",
            message: "Invalid login credentials",
          },
        };
      }

      const session = createSessionForUser(user);
      saveSession(session);
      emitAuthState("SIGNED_IN", session);

      return {
        data: { user: session.user, session },
        error: null,
      };
    },

    async signUp({
      email,
      password,
      options,
    }: {
      email: string;
      password: string;
      options?: { data?: AuthMetadata };
    }) {
      const store = clone(getStore());
      const alreadyExists = store.authUsers.some(
        (record) => record.email.toLowerCase() === email.toLowerCase(),
      );

      if (alreadyExists) {
        return {
          data: { user: null, session: null },
          error: {
            message: "User already registered",
          },
        };
      }

      const authUser = createAuthUser({
        id: generateId(),
        email,
        password,
        metadata: options?.data || {},
      });

      store.authUsers.push(authUser);
      syncAuthUserToPublicUser(store, authUser, password);
      saveStore(store);

      const session = createSessionForUser(authUser);
      saveSession(session);
      emitAuthState("SIGNED_IN", session);

      return {
        data: {
          user: session.user,
          session,
        },
        error: null,
      };
    },

    async signOut() {
      saveSession(null);
      emitAuthState("SIGNED_OUT", null);

      return {
        error: null,
      };
    },

    async getSession() {
      return {
        data: {
          session: getSession(),
        },
        error: null,
      };
    },

    async getUser() {
      const session = getSession();
      return {
        data: {
          user: session?.user || null,
        },
        error: null,
      };
    },

    async updateUser({
      password,
      data,
    }: {
      password?: string;
      data?: AuthMetadata;
    }) {
      const session = getSession();
      if (!session) {
        return {
          data: { user: null },
          error: {
            message: "No active session",
          },
        };
      }

      const store = clone(getStore());
      const user = store.authUsers.find((record) => record.id === session.user.id);
      if (!user) {
        return {
          data: { user: null },
          error: {
            message: "User not found",
          },
        };
      }

      if (password) {
        user.password = password;
      }

      if (data) {
        user.user_metadata = {
          ...user.user_metadata,
          ...data,
        };
      }

      user.updated_at = nowIso();
      syncAuthUserToPublicUser(store, user, user.password);
      saveStore(store);

      const nextSession = createSessionForUser(user);
      saveSession(nextSession);
      emitAuthState("USER_UPDATED", nextSession);

      return {
        data: {
          user: nextSession.user,
        },
        error: null,
      };
    },

    onAuthStateChange(
      callback: (event: string, session: MockSession | null) => void,
    ) {
      authListeners.add(callback);
      return {
        data: {
          subscription: {
            unsubscribe: () => authListeners.delete(callback),
          },
        },
        error: null,
      };
    },

    async exchangeCodeForSession() {
      return {
        data: {
          session: getSession(),
        },
        error: null,
      };
    },
  },

  channel(name: string) {
    const channelHandlers: RealtimeHandler[] = [];
    const channelApi = {
      on: (
        event: string,
        filter: { table?: string; event?: string },
        callback: (payload: any) => void,
      ) => {
        channelHandlers.push({
          id: generateId(),
          event: filter.event || event,
          table: filter.table,
          callback,
        });
        return channelApi;
      },
      subscribe: () => {
        realtimeHandlers.set(name, [
          ...(realtimeHandlers.get(name) || []),
          ...channelHandlers,
        ]);

        return {
          unsubscribe: () => {
            const existing = realtimeHandlers.get(name) || [];
            const handlerIds = new Set(channelHandlers.map((handler) => handler.id));
            realtimeHandlers.set(
              name,
              existing.filter((handler) => !handlerIds.has(handler.id)),
            );
          },
        };
      },
    };

    return channelApi;
  },

  removeChannel(channel: { unsubscribe?: () => void }) {
    channel?.unsubscribe?.();
  },

  storage: {
    from(bucket: string) {
      return {
        upload: async (path: string, file: File | Blob | any) => {
          const store = clone(getStore());
          const dataUrl = await fileToDataUrl(file);

          if (!store.storage[bucket]) {
            store.storage[bucket] = {};
          }

          store.storage[bucket][path] = dataUrl;
          saveStore(store);

          return {
            data: {
              path,
              fullPath: path,
            },
            error: null,
          };
        },

        getPublicUrl: (path: string) => {
          const store = getStore();
          return {
            data: {
              publicUrl: store.storage[bucket]?.[path] || "",
            },
          };
        },
      };
    },
  },
});

export const getFrontendStoreSnapshot = () => clone(getStore());
