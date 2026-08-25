import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";
import { hashPassword } from "./auth";
import {
  getPasswordPolicyMessage,
  validatePassword,
} from "../auth/password-policy";
import { assertAnagraficaIsValid } from "./anagrafica";
import {
  buildClubCategoryOptions,
  resolveCategoryId,
  resolveCategoryLabel,
} from "../category-utils";
import {
  filterCollectionBySeason,
  isSeasonScopedDataType,
  normalizeClubSeasons,
} from "../club-seasons";

type ResourceConfig = {
  kind: "model" | "club_resource";
  delegate?: string;
  resource_type?: string;
  description: string;
  mobile_ready: boolean;
};

const CLUB_RESOURCE_TYPES = [
  "access_tokens",
  "appointments",
  "bank_accounts",
  "categories",
  "category_groups",
  "clothing_inventory",
  "clothing_kits",
  "clothing_products",
  "club_sites",
  "discounts",
  "document_templates",
  "expected_expenses",
  "expected_income",
  "jersey_assignments",
  "jersey_groups",
  "kit_assignments",
  "matches",
  "members",
  "opening_hours",
  "payment_plans",
  "procure",
  "secretariat_notes",
  "sponsor_payments",
  "sponsors",
  "staff_members",
  "trainers",
  "trainings",
  "transactions",
  "transfers",
  "weekly_schedule",
];

const CLUB_JSON_FIELDS = Array.from(
  new Set([
    ...CLUB_RESOURCE_TYPES.filter((resource) => resource !== "access_tokens"),
    "structures",
    "members",
    "dashboard_data",
  ]),
);

const MODEL_RESOURCES: Record<string, ResourceConfig> = {
  users: {
    kind: "model",
    delegate: "user",
    description: "Anagrafica utenti applicativi",
    mobile_ready: true,
  },
  clubs: {
    kind: "model",
    delegate: "club",
    description: "Club e anagrafica societaria",
    mobile_ready: true,
  },
  organizations: {
    kind: "model",
    delegate: "club",
    description: "Alias organizzazioni per compatibilita client",
    mobile_ready: true,
  },
  dashboards: {
    kind: "model",
    delegate: "dashboard",
    description: "Dashboard configurabili del club",
    mobile_ready: true,
  },
  organization_users: {
    kind: "model",
    delegate: "organizationUser",
    description: "Associazione utenti-organizzazione con ruolo",
    mobile_ready: true,
  },
  club_resource_items: {
    kind: "model",
    delegate: "clubResourceItem",
    description: "Risorse normalizzate del club",
    mobile_ready: true,
  },
  athletes: {
    kind: "model",
    delegate: "athlete",
    description: "Atleti",
    mobile_ready: true,
  },
  athlete_category_memberships: {
    kind: "model",
    delegate: "athleteCategoryMembership",
    description: "Appartenenze atleta-categoria",
    mobile_ready: true,
  },
  simplified_athletes: {
    kind: "model",
    delegate: "athlete",
    description: "Alias compatibilita atleti semplificati",
    mobile_ready: true,
  },
  medical_certificates: {
    kind: "model",
    delegate: "medicalCertificate",
    description: "Certificati medici",
    mobile_ready: true,
  },
  simplified_certificates: {
    kind: "model",
    delegate: "medicalCertificate",
    description: "Alias compatibilita certificati",
    mobile_ready: true,
  },
  payments: {
    kind: "model",
    delegate: "athletePayment",
    description: "Pagamenti quote atleti",
    mobile_ready: true,
  },
  simplified_payments: {
    kind: "model",
    delegate: "athletePayment",
    description: "Alias compatibilita pagamenti atleti",
    mobile_ready: true,
  },
  payment_methods: {
    kind: "model",
    delegate: "paymentMethod",
    description: "Metodi di pagamento configurati per il club",
    mobile_ready: true,
  },
  invoices: {
    kind: "model",
    delegate: "invoice",
    description: "Fatture emesse",
    mobile_ready: true,
  },
  receipts: {
    kind: "model",
    delegate: "receipt",
    description: "Ricevute collegate ai pagamenti",
    mobile_ready: true,
  },
  trainer_payments: {
    kind: "model",
    delegate: "trainerPayment",
    description: "Pagamenti allenatori",
    mobile_ready: true,
  },
  notifications: {
    kind: "model",
    delegate: "notification",
    description: "Notifiche utenti e club",
    mobile_ready: true,
  },
  simplified_notifications: {
    kind: "model",
    delegate: "notification",
    description: "Alias compatibilita notifiche",
    mobile_ready: true,
  },
  training_attendance: {
    kind: "model",
    delegate: "trainingAttendance",
    description: "Presenze allenamenti",
    mobile_ready: true,
  },
  assets: {
    kind: "model",
    delegate: "asset",
    description: "Asset caricati applicazione",
    mobile_ready: true,
  },
};

export const RESOURCE_CONFIG: Record<string, ResourceConfig> = {
  ...MODEL_RESOURCES,
  ...Object.fromEntries(
    CLUB_RESOURCE_TYPES.map((resource) => [
      resource,
      {
        kind: "club_resource",
        resource_type: resource,
        description: `Risorsa club: ${resource}`,
        mobile_ready: true,
      } satisfies ResourceConfig,
    ]),
  ),
};

type ResourceAccessScope = {
  userId: string;
  activeOrganizationId: string | null;
  allowedOrganizationIds: string[];
};

const ORGANIZATION_SCOPED_MODEL_RESOURCES = new Set([
  "dashboards",
  "organization_users",
  "club_resource_items",
  "athletes",
  "athlete_category_memberships",
  "simplified_athletes",
  "medical_certificates",
  "simplified_certificates",
  "payment_methods",
  "payments",
  "simplified_payments",
  "invoices",
  "receipts",
  "trainer_payments",
  "notifications",
  "simplified_notifications",
  "training_attendance",
]);

const isOrganizationScopedResource = (resource: string) =>
  RESOURCE_CONFIG[resource]?.kind === "club_resource" ||
  ORGANIZATION_SCOPED_MODEL_RESOURCES.has(resource);

const ensureOrganizationAccess = (
  scope: ResourceAccessScope | undefined,
  organizationId: string | null | undefined,
) => {
  if (!scope || !organizationId) {
    return;
  }

  if (!scope.allowedOrganizationIds.includes(organizationId)) {
    throw new Error("Accesso negato alla risorsa del club");
  }
};

const resolveScopedOrganizationId = (
  scope: ResourceAccessScope | undefined,
  requestedOrganizationId?: string | null,
) => {
  if (!scope) {
    return requestedOrganizationId || null;
  }

  if (requestedOrganizationId) {
    ensureOrganizationAccess(scope, requestedOrganizationId);
    return requestedOrganizationId;
  }

  if (scope.activeOrganizationId) {
    return scope.activeOrganizationId;
  }

  throw new Error("Nessun club attivo selezionato");
};

const resolveRecordOrganizationId = (
  resource: string,
  record: Record<string, any> | null | undefined,
) => {
  if (!record) {
    return null;
  }

  if (resource === "clubs" || resource === "organizations") {
    return record.id || null;
  }

  if (isOrganizationScopedResource(resource)) {
    return record.organization_id || record.club_id || null;
  }

  return null;
};

const assertRecordAccess = (
  resource: string,
  record: Record<string, any> | null | undefined,
  scope?: ResourceAccessScope,
) => {
  if (!scope || !record) {
    return;
  }

  ensureOrganizationAccess(
    scope,
    resolveRecordOrganizationId(resource, record),
  );
};

export const API_REGISTRY = [
  {
    name: "auth.login",
    method: "POST",
    path: "/api/v1/auth/login",
    description: "Login utente e apertura sessione web/mobile",
  },
  {
    name: "auth.register",
    method: "POST",
    path: "/api/v1/auth/register",
    description: "Registrazione utente con eventuale creazione club",
  },
  {
    name: "auth.logout",
    method: "POST",
    path: "/api/v1/auth/logout",
    description: "Chiusura sessione",
  },
  {
    name: "auth.session",
    method: "GET",
    path: "/api/v1/auth/session",
    description: "Recupero sessione corrente",
  },
  {
    name: "auth.user",
    method: "GET|PATCH",
    path: "/api/v1/auth/user",
    description: "Profilo utente autenticato",
  },
  {
    name: "auth.memberships",
    method: "GET",
    path: "/api/v1/auth/memberships",
    description: "Elenco club dell'account con ruoli e proprieta",
  },
  {
    name: "auth.memberships.activate",
    method: "POST",
    path: "/api/v1/auth/memberships/activate",
    description: "Imposta il club attivo dell'account",
  },
  {
    name: "auth.access.redeem",
    method: "POST",
    path: "/api/v1/auth/access/redeem",
    description: "Collega l'account a un club tramite token condiviso",
  },
  ...Object.entries(RESOURCE_CONFIG).flatMap(([resource, config]) => [
    {
      name: `${resource}.list`,
      method: "GET",
      path: `/api/v1/${resource}`,
      description: config.description,
    },
    {
      name: `${resource}.create`,
      method: "POST",
      path: `/api/v1/${resource}`,
      description: `Creazione ${resource}`,
    },
    {
      name: `${resource}.detail`,
      method: "GET",
      path: `/api/v1/${resource}/:id`,
      description: `Dettaglio ${resource}`,
    },
    {
      name: `${resource}.update`,
      method: "PATCH",
      path: `/api/v1/${resource}/:id`,
      description: `Aggiornamento ${resource}`,
    },
    {
      name: `${resource}.delete`,
      method: "DELETE",
      path: `/api/v1/${resource}/:id`,
      description: `Eliminazione ${resource}`,
    },
  ]),
];

const MODEL_DATE_FIELDS: Record<string, string[]> = {
  athletes: ["birth_date", "created_at", "updated_at"],
  athlete_category_memberships: ["created_at", "updated_at"],
  simplified_athletes: ["birth_date", "created_at", "updated_at"],
  medical_certificates: [
    "issue_date",
    "expiry_date",
    "created_at",
    "updated_at",
  ],
  simplified_certificates: [
    "issue_date",
    "expiry_date",
    "created_at",
    "updated_at",
  ],
  payments: ["due_date", "paid_at", "created_at", "updated_at"],
  simplified_payments: ["due_date", "paid_at", "created_at", "updated_at"],
  invoices: ["issue_date", "created_at", "updated_at"],
  receipts: ["issue_date", "created_at", "updated_at"],
  trainer_payments: ["date", "created_at", "updated_at"],
  notifications: ["created_at", "updated_at"],
  training_attendance: ["created_at", "updated_at"],
  clubs: ["created_at", "updated_at"],
  organizations: ["created_at", "updated_at"],
  dashboards: ["created_at", "updated_at"],
  organization_users: ["created_at", "updated_at"],
  users: ["created_at", "updated_at"],
  assets: ["created_at", "updated_at"],
};

const stripUndefined = (value: Record<string, any>) =>
  Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined),
  );

const toDateOrUndefined = (value: any) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const UUID_PATTERN =
  /^(?:urn:uuid:)?[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeUuid = (value: any) => {
  if (typeof value !== "string") {
    return undefined;
  }

  return value.trim().replace(/^urn:uuid:/i, "");
};

const isUuid = (value: any) =>
  typeof value === "string" && UUID_PATTERN.test(value.trim());

const buildMemberIdentity = (member: Record<string, any>) => {
  const sanitizeText = (value: any) => {
    const trimmed = String(value ?? "").trim();
    return trimmed.toLowerCase() === "undefined undefined" ? "" : trimmed;
  };
  const rawFirstName = String(
    member?.firstName ?? member?.first_name ?? "",
  ).trim();
  const rawLastName = String(
    member?.lastName ?? member?.last_name ?? member?.surname ?? "",
  ).trim();
  const explicitFullName = sanitizeText(member?.fullName ?? member?.full_name);
  const fallbackName = sanitizeText(member?.name);
  const fullName =
    explicitFullName ||
    [rawFirstName, rawLastName].filter(Boolean).join(" ").trim() ||
    fallbackName;
  const firstName =
    rawFirstName || (fullName ? fullName.split(/\s+/)[0] || "" : "");
  const lastName =
    rawLastName ||
    (fullName ? fullName.split(/\s+/).slice(1).join(" ").trim() : "");

  return {
    firstName,
    lastName,
    fullName,
  };
};

const isAccessOnlyMember = (member: Record<string, any>) => {
  const identity = buildMemberIdentity(member);

  return Boolean(member?.user_id) && !identity.fullName;
};

const normalizeClubMembers = (members: any) => {
  if (!Array.isArray(members)) {
    return members;
  }

  return members
    .filter(
      (member) =>
        member &&
        typeof member === "object" &&
        !isAccessOnlyMember(member as Record<string, any>),
    )
    .map((member) => {
      const identity = buildMemberIdentity(member as Record<string, any>);

      return stripUndefined({
        ...member,
        firstName: identity.firstName || undefined,
        lastName: identity.lastName || undefined,
        surname: identity.lastName || undefined,
        fullName: identity.fullName || undefined,
        name: identity.fullName || undefined,
      });
    });
};

const parseJsonIfString = (value: any) => {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const getClubResourceLogicalId = (
  record: Record<string, any> | null | undefined,
) => {
  const payloadId = record?.payload?.id;
  if (typeof payloadId !== "string") {
    return null;
  }

  const trimmed = payloadId.trim();
  if (!trimmed || isUuid(trimmed)) {
    return null;
  }

  return trimmed;
};

const withCompatibilityAliases = (
  resource: string,
  record: Record<string, any>,
) => {
  const next = clone(record);

  if (next.organization_id && !next.club_id) {
    next.club_id = next.organization_id;
  }

  if ((resource === "clubs" || resource === "organizations") && next.id) {
    next.organization_id = next.id;
  }

  if (
    (resource === "athletes" || resource === "simplified_athletes") &&
    next.first_name &&
    next.last_name
  ) {
    next.name = `${next.first_name} ${next.last_name}`.trim();
    if (!next.avatar && next.avatar_url) {
      next.avatar = next.avatar_url;
    }
  }

  if (
    (resource === "payments" || resource === "simplified_payments") &&
    next.athlete &&
    !next.athlete_name
  ) {
    next.athlete_name =
      `${next.athlete.first_name || ""} ${next.athlete.last_name || ""}`.trim();
  }

  if (
    resource === "medical_certificates" ||
    resource === "simplified_certificates"
  ) {
    if (!next.document_url && next.file_url) {
      next.document_url = next.file_url;
    }

    if (!next.certificateType && next.type) {
      next.certificateType = next.type;
    }
  }

  return next;
};

const serializeUser = (record: Record<string, any>) => {
  const next = clone(record);
  delete next.password_hash;

  next.club_access = Array.isArray(next.club_access)
    ? next.club_access.map((item: any) => ({
        ...item,
        club_id: item.organization_id,
      }))
    : [];

  return next;
};

const serializeClubResourceItem = (record: Record<string, any>) =>
  withCompatibilityAliases(record.resource_type, {
    id: record.id,
    organization_id: record.organization_id,
    club_id: record.organization_id,
    name: record.name,
    status: record.status,
    date: record.date,
    created_at: record.created_at,
    updated_at: record.updated_at,
    ...(typeof record.payload === "object" && record.payload
      ? record.payload
      : {}),
  });

const serializeRecord = (resource: string, record: Record<string, any>) => {
  if (!record) {
    return null;
  }

  if (resource === "users") {
    return serializeUser(record);
  }

  if (RESOURCE_CONFIG[resource]?.kind === "club_resource") {
    return serializeClubResourceItem(record);
  }

  return withCompatibilityAliases(resource, record);
};

const normalizeDates = (resource: string, input: Record<string, any>) => {
  const dateFields = MODEL_DATE_FIELDS[resource] || [];
  const next = { ...input };

  for (const field of dateFields) {
    const parsed = toDateOrUndefined(next[field]);
    if (parsed) {
      next[field] = parsed;
    } else if (next[field] === "") {
      next[field] = null;
    }
  }

  return next;
};

const normalizeCommonAliases = (input: Record<string, any>) => {
  const next = { ...input };

  if (next.club_id && !next.organization_id) {
    next.organization_id = next.club_id;
  }

  delete next.club_id;
  delete next.organizations;
  delete next.athletes;
  delete next.categories;
  delete next.trainers;
  delete next.organization;
  delete next.athlete;
  delete next.payment;
  delete next.invoice;
  delete next.receipt;

  return next;
};

const normalizeAthletePaymentInput = (input: Record<string, any>) => {
  const next = { ...input };
  const metadata = parseJsonIfString(next.data);
  next.data = metadata;

  if (!next.athlete_id && next.athleteId) {
    next.athlete_id = next.athleteId;
  }

  if (!next.organization_id && (next.organizationId || next.clubId)) {
    next.organization_id = next.organizationId || next.clubId;
  }

  if (!next.due_date && next.dueDate) {
    next.due_date = next.dueDate;
  }

  if (!next.paid_at && next.paidAt) {
    next.paid_at = next.paidAt;
  }

  if (!next.description) {
    next.description =
      firstNonEmpty(metadata?.description, next.type, metadata?.type) ||
      "Pagamento atleta";
  }

  delete next.athleteId;
  delete next.organizationId;
  delete next.clubId;
  delete next.dueDate;
  delete next.paidAt;

  return next;
};

const firstNonEmpty = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) {
      return text;
    }
  }

  return "";
};

const normalizeModelInput = async (
  resource: string,
  input: Record<string, any>,
) => {
  const preservedClubJsonFields =
    resource === "clubs" || resource === "organizations"
      ? Object.fromEntries(
          CLUB_JSON_FIELDS.filter((field) => input[field] !== undefined).map(
            (field) => [field, input[field]],
          ),
        )
      : {};

  let next = {
    ...normalizeCommonAliases(input),
    ...preservedClubJsonFields,
  };

  if (resource === "payments" || resource === "simplified_payments") {
    next = normalizeAthletePaymentInput(next);
  }

  next = normalizeDates(resource, next);
  next.settings = parseJsonIfString(next.settings);
  next.user_metadata = parseJsonIfString(next.user_metadata);
  next.data = parseJsonIfString(next.data);
  next.config = parseJsonIfString(next.config);

  if (resource === "clubs" || resource === "organizations") {
    for (const field of CLUB_JSON_FIELDS) {
      next[field] = parseJsonIfString(next[field]);
    }

    next.members = normalizeClubMembers(next.members);
  }

  if (resource === "users") {
    delete next.club_access;

    if (next.password) {
      const password = String(next.password);
      const passwordPolicy = validatePassword(password, next.email);
      if (!passwordPolicy.valid) {
        throw new Error(getPasswordPolicyMessage(passwordPolicy));
      }
      next.password_hash = await hashPassword(password);
      delete next.password;
    }

    next.user_metadata =
      typeof next.user_metadata === "object" && next.user_metadata
        ? next.user_metadata
        : {};
  }

  if (resource === "clubs" || resource === "organizations") {
    if (!next.slug && next.name) {
      next.slug = `${slugify(String(next.name))}-${Date.now().toString().slice(-6)}`;
    }
  }

  if (
    (resource === "athletes" || resource === "simplified_athletes") &&
    !next.category_name &&
    next.data?.category
  ) {
    next.category_name = next.data.category;
  }

  if (
    resource === "medical_certificates" ||
    resource === "simplified_certificates"
  ) {
    if (!next.organization_id && next.club_id) {
      next.organization_id = next.club_id;
    }

    if (!next.athlete_id && next.athleteId) {
      next.athlete_id = next.athleteId;
    }

    if (!next.type && next.certificateType) {
      next.type = next.certificateType;
    }

    if (!next.type && next.notes) {
      next.type = next.notes;
    }

    if (!next.file_url && next.fileUrl) {
      next.file_url = next.fileUrl;
    }

    if (!next.file_url && next.document_url) {
      next.file_url = next.document_url;
    }

    delete next.athleteId;
    delete next.certificateType;
    delete next.fileUrl;
    delete next.document_url;
  }

  return stripUndefined(next);
};

const syncUserClubAccess = async (user_id: string, club_access: any) => {
  if (!Array.isArray(club_access)) {
    return;
  }

  for (const access of club_access) {
    const organization_id = access?.club_id || access?.organization_id;
    if (!organization_id) {
      continue;
    }

    const role = access?.role || "member";
    const existingAccess = await prisma.organizationUser.findFirst({
      where: {
        organization_id,
        user_id,
        role,
      },
    });

    if (existingAccess) {
      await prisma.organizationUser.update({
        where: { id: existingAccess.id },
        data: {
          is_primary: Boolean(access?.is_primary ?? access?.isPrimary),
        },
      });
    } else {
      await prisma.organizationUser.create({
        data: {
          organization_id,
          user_id,
          role,
          is_primary: Boolean(access?.is_primary ?? access?.isPrimary),
        },
      });
    }
  }
};

const syncClubMembers = async (organization_id: string, members: any) => {
  if (!Array.isArray(members)) {
    return;
  }

  for (const member of members) {
    if (!member?.user_id) {
      continue;
    }

    const role = member?.role || "member";
    const existingAccess = await prisma.organizationUser.findFirst({
      where: {
        organization_id,
        user_id: member.user_id,
        role,
      },
    });

    if (existingAccess) {
      await prisma.organizationUser.update({
        where: { id: existingAccess.id },
        data: {
          is_primary: Boolean(member?.is_primary ?? member?.isPrimary),
        },
      });
    } else {
      await prisma.organizationUser.create({
        data: {
          organization_id,
          user_id: member.user_id,
          role,
          is_primary: Boolean(member?.is_primary ?? member?.isPrimary),
        },
      });
    }
  }
};

const ensureClubDashboard = async (
  organization_id: string,
  creator_id?: string | null,
  dashboard_data?: any,
) => {
  if (!dashboard_data) {
    return;
  }

  const existing = await prisma.dashboard.findFirst({
    where: {
      organization_id,
    },
  });

  if (existing) {
    return;
  }

  await prisma.dashboard.create({
    data: {
      organization_id,
      creator_id: creator_id || null,
      slug: `dashboard-${Date.now().toString().slice(-8)}`,
      settings:
        typeof dashboard_data?.settings === "string"
          ? JSON.parse(dashboard_data.settings)
          : dashboard_data?.settings || {},
    },
  });
};

const syncClubAggregateField = async (
  organization_id: string,
  resource_type: string,
) => {
  if (!CLUB_JSON_FIELDS.includes(resource_type)) {
    return;
  }

  const items = await prisma.clubResourceItem.findMany({
    where: {
      organization_id,
      resource_type,
    },
    orderBy: {
      created_at: "asc",
    },
  });

  const aggregate = items.map((item) => serializeClubResourceItem(item));
  await prisma.club.update({
    where: { id: organization_id },
    data: {
      [resource_type]: aggregate,
    },
  });
};

const newResourceItemId = () =>
  typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 14)}`;

/**
 * Riallinea `club_resource_items` a un campo JSON del club.
 *
 * Tre proprieta che prima mancavano (WP-10, WP-31):
 *
 * 1. **transazionale**: cancellazione, reinserimento e aggregato stanno nella
 *    stessa transazione. Un errore a meta non lascia piu il club senza
 *    categorie e l'aggregato disallineato;
 * 2. **identita preservata**: un elemento gia presente mantiene la sua riga
 *    (stesso `id`, stesso `created_at`), invece di riceverne una nuova a ogni
 *    salvataggio;
 * 3. **una sola scrittura di massa**: `createMany` al posto di una `create`
 *    per elemento. Salvare una categoria non costa piu N round trip.
 */
/**
 * Il cuore della sincronizzazione, **dentro** una transazione gia aperta.
 *
 * E separato dal wrapper perche un'operazione sola puo dover riscrivere piu
 * collezioni insieme: assegnare un kit tocca magazzino, assegnazioni e numeri
 * di maglia, e sono tre scritture che devono riuscire o fallire insieme. Con
 * una transazione per collezione, un errore a meta lascerebbe il magazzino
 * scalato e l'assegnazione mai registrata.
 */
const applyClubResourceSync = async (
  tx: Prisma.TransactionClient,
  organization_id: string,
  resource_type: string,
  items: any,
) => {
  const normalizedItems =
    resource_type === "members" ? normalizeClubMembers(items) : items;

  if (!Array.isArray(normalizedItems)) {
    return;
  }

  const existingItems = await tx.clubResourceItem.findMany({
    where: { organization_id, resource_type },
    orderBy: { created_at: "asc" },
  });

  const existingByKey = new Map<string, (typeof existingItems)[number]>();
  for (const existing of existingItems) {
    existingByKey.set(existing.id, existing);
    const logicalId = getClubResourceLogicalId(existing);
    if (logicalId) {
      existingByKey.set(logicalId, existing);
    }
  }

  const now = new Date();
  const rows = normalizedItems.map((item) => {
    const requestedId = String(item?.id || "").trim();
    const existing = requestedId ? existingByKey.get(requestedId) : undefined;

    return {
      id:
        existing?.id ||
        (isUuid(item?.id) ? normalizeUuid(item.id) : newResourceItemId()),
      organization_id,
      resource_type,
      name: item?.name || item?.title || null,
      status: item?.status || null,
      date: toDateOrUndefined(item?.date) || null,
      payload: item,
      created_at: existing?.created_at || now,
      updated_at: now,
    };
  });

  // L'aggregato riflette l'ordine con cui il client ha inviato gli elementi:
  // rileggerli ordinati per `created_at` sarebbe ambiguo, perche un inserimento
  // di massa condivide lo stesso istante.
  const aggregate = rows.map((row) => serializeClubResourceItem(row));

  await tx.clubResourceItem.deleteMany({
    where: { organization_id, resource_type },
  });

  if (rows.length > 0) {
    await tx.clubResourceItem.createMany({ data: rows });
  }

  if (CLUB_JSON_FIELDS.includes(resource_type)) {
    await tx.club.update({
      where: { id: organization_id },
      data: { [resource_type]: aggregate },
    });
  }
};

const syncClubResourceItemsFromField = async (
  organization_id: string,
  resource_type: string,
  items: any,
) => {
  if (!Array.isArray(resource_type === "members" ? normalizeClubMembers(items) : items)) {
    return;
  }

  await prisma.$transaction((tx) =>
    applyClubResourceSync(tx, organization_id, resource_type, items),
  );
};

const assertKnownClubResourceType = (resource_type: string) => {
  if (!CLUB_RESOURCE_TYPES.includes(resource_type)) {
    throw new Error(`Risorsa di club sconosciuta: ${resource_type}`);
  }
};

/**
 * Legge una collezione di club **senza** filtro di stagione.
 *
 * Il riporto (WP-35) ha bisogno di vedere tutte le stagioni insieme: quella di
 * origine per copiarne la configurazione e quella di destinazione per sapere
 * cosa c'e gia. Passa da qui e non da Prisma diretto perche `resources.ts` e
 * il proprietario dell'accesso ai dati di club.
 */
export const readClubResourceCollection = async (
  organization_id: string,
  resource_type: string,
) => {
  assertKnownClubResourceType(resource_type);

  const items = await prisma.clubResourceItem.findMany({
    where: { organization_id, resource_type },
    orderBy: { created_at: "asc" },
  });

  return items.map((item) => serializeClubResourceItem(item));
};

/**
 * Riscrive una collezione di club mantenendo allineati `club_resource_items` e
 * il campo JSON aggregato. Gli elementi gia esistenti conservano riga e
 * `created_at`: senza, un riporto rigenererebbe l'identita di tutte le
 * stagioni, non solo di quella nuova.
 */
export const replaceClubResourceCollection = async (
  organization_id: string,
  resource_type: string,
  items: any[],
) => {
  assertKnownClubResourceType(resource_type);

  if (!Array.isArray(items)) {
    throw new Error(`Collezione non valida per ${resource_type}`);
  }

  await syncClubResourceItemsFromField(organization_id, resource_type, items);
  return items;
};

/**
 * Riscrive **piu** collezioni di club in una transazione sola.
 *
 * Serve alle operazioni che per loro natura ne toccano diverse insieme:
 * assegnare un kit a un atleta scala il magazzino, aggiunge l'assegnazione e
 * puo assegnare un numero di maglia. Chiamare tre volte
 * `replaceClubResourceCollection` sarebbe corretto sul singolo campo e
 * sbagliato sull'operazione, perche un errore sulla seconda lascerebbe la
 * prima gia scritta: magazzino scalato per un kit che nessuno risulta avere.
 *
 * Ogni collezione mantiene la stessa garanzia della versione singola —
 * `club_resource_items` e il campo JSON aggregato restano allineati.
 */
export const replaceClubResourceCollections = async (
  organization_id: string,
  collections: Array<{ resource_type: string; items: any[] }>,
) => {
  for (const collection of collections) {
    assertKnownClubResourceType(collection.resource_type);

    if (!Array.isArray(collection.items)) {
      throw new Error(`Collezione non valida per ${collection.resource_type}`);
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const collection of collections) {
      await applyClubResourceSync(
        tx,
        organization_id,
        collection.resource_type,
        collection.items,
      );
    }
  });

  return collections;
};

const normalizeClubResourceInput = (
  resource: string,
  input: Record<string, any>,
) => {
  const next = normalizeCommonAliases(input);
  const {
    id,
    organization_id,
    created_at,
    updated_at,
    name,
    status,
    date,
    resource_type: _ignoredResourceType,
    ...payload
  } = next;
  const normalizedPayload =
    resource === "members"
      ? normalizeClubMembers([
          !isUuid(id) && typeof id === "string" && id.trim()
            ? { id: id.trim(), ...payload }
            : payload,
        ])?.[0] || payload
      : !isUuid(id) && typeof id === "string" && id.trim()
        ? { id: id.trim(), ...payload }
        : payload;

  return stripUndefined({
    id: isUuid(id) ? normalizeUuid(id) : undefined,
    organization_id,
    resource_type: resource,
    name: name || normalizedPayload.name || normalizedPayload.title || null,
    status: status || normalizedPayload.status || null,
    date: toDateOrUndefined(date || normalizedPayload.date) || null,
    payload: normalizedPayload,
    created_at: toDateOrUndefined(created_at),
    updated_at: toDateOrUndefined(updated_at),
  });
};

const findClubResourceRecord = async (
  resource: string,
  identifier: string,
  scope?: ResourceAccessScope,
) => {
  const trimmedIdentifier = String(identifier || "").trim();
  if (!trimmedIdentifier) {
    return null;
  }

  const directId = isUuid(trimmedIdentifier)
    ? normalizeUuid(trimmedIdentifier)
    : undefined;
  const organizationFilter = scope?.activeOrganizationId
    ? { organization_id: scope.activeOrganizationId }
    : scope?.allowedOrganizationIds?.length
      ? { organization_id: { in: scope.allowedOrganizationIds } }
      : {};

  return prisma.clubResourceItem.findFirst({
    where: {
      resource_type: resource,
      ...organizationFilter,
      OR: [
        ...(directId ? [{ id: directId }] : []),
        {
          payload: {
            path: ["id"],
            equals: trimmedIdentifier,
          },
        },
      ],
    },
  });
};

const buildWhereFromSearchParams = (
  resource: string,
  searchParams: URLSearchParams,
) => {
  const where: Record<string, any> = {};
  const passthrough = [
    "id",
    "email",
    "user_id",
    "organization_id",
    "athlete_id",
    "payment_id",
    "invoice_id",
    "bucket",
    "path",
    "status",
    "type",
    "role",
    "resource_type",
  ];

  for (const key of passthrough) {
    const raw = searchParams.get(key);
    if (raw) {
      where[key] = raw;
    }
  }

  const club_id = searchParams.get("club_id");
  if (club_id && !where.organization_id) {
    where.organization_id = club_id;
  }

  if (RESOURCE_CONFIG[resource]?.kind === "club_resource") {
    where.resource_type = resource;
  }

  return where;
};

/**
 * Campi su cui `?q=` cerca, per risorsa (WP-12).
 *
 * E un elenco esplicito per risorsa e non «tutte le colonne di testo»: una
 * ricerca che guarda anche il codice di accesso o le note interne restituisce
 * risultati che chi cerca non sa spiegarsi, e su Postgres costa una scansione
 * in piu per colonna.
 *
 * Una risorsa che non e in elenco ignora `?q=`: meglio una ricerca che non
 * filtra che una che filtra su un campo a caso.
 */
const SEARCHABLE_FIELDS: Record<string, string[]> = {
  athletes: ["first_name", "last_name", "access_code", "jersey_number"],
  simplified_athletes: ["first_name", "last_name", "access_code", "jersey_number"],
  users: ["email", "first_name", "last_name"],
  clubs: ["name", "slug"],
  organizations: ["name", "slug"],
  invoices: ["invoice_number"],
  receipts: ["receipt_number"],
};

/** Le risorse di club hanno il nome estratto in colonna: si cerca li. */
const CLUB_RESOURCE_SEARCHABLE_FIELDS = ["name"];

/**
 * Colonne su cui si puo ordinare, per risorsa.
 *
 * Anche questo e un elenco chiuso: `orderBy` arriva dalla query string, e
 * passarlo a Prisma senza filtrarlo vuol dire lasciare che il client scelga
 * su cosa il database deve lavorare.
 */
const SORTABLE_FIELDS: Record<string, string[]> = {
  athletes: ["last_name", "first_name", "birth_date", "status", "created_at", "updated_at"],
  simplified_athletes: ["last_name", "first_name", "birth_date", "status", "created_at", "updated_at"],
  users: ["email", "last_name", "created_at"],
  clubs: ["name", "created_at"],
  organizations: ["name", "created_at"],
};

const CLUB_RESOURCE_SORTABLE_FIELDS = ["name", "date", "status", "created_at"];

/** Oltre questo una «pagina» non e piu una pagina. */
const MAX_PAGE_SIZE = 200;

const searchableFieldsFor = (resource: string) =>
  RESOURCE_CONFIG[resource]?.kind === "club_resource"
    ? CLUB_RESOURCE_SEARCHABLE_FIELDS
    : SEARCHABLE_FIELDS[resource] || [];

const sortableFieldsFor = (resource: string) =>
  RESOURCE_CONFIG[resource]?.kind === "club_resource"
    ? CLUB_RESOURCE_SORTABLE_FIELDS
    : SORTABLE_FIELDS[resource] || [];

/**
 * Il `where` della ricerca testuale.
 *
 * `contains` con `insensitive`: chi cerca «rossi» deve trovare «Rossi». Non
 * e una ricerca full-text e non pretende di esserlo — per un archivio di
 * qualche migliaio di anagrafiche una `ILIKE` con indice sull'organizzazione
 * e la cosa giusta, e non richiede di installare niente.
 */
const buildSearchFilter = (resource: string, query: string) => {
  const fields = searchableFieldsFor(resource);
  const trimmed = query.trim();
  if (!fields.length || !trimmed) return null;

  /*
    «Mario Rossi» va cercato come due termini: cognome e nome stanno in due
    colonne diverse, e una `contains` sulla frase intera non trova mai
    niente. Ogni termine deve comparire in almeno un campo.
  */
  const terms = trimmed.split(/\s+/).filter(Boolean).slice(0, 5);

  return {
    AND: terms.map((term) => ({
      OR: fields.map((field) => ({
        [field]: { contains: term, mode: "insensitive" },
      })),
    })),
  };
};

/** Ordinamento richiesto, se e uno di quelli ammessi. */
const buildOrderBy = (resource: string, searchParams: URLSearchParams) => {
  const requested = String(searchParams.get("order_by") || "").trim();
  const direction =
    String(searchParams.get("order") || "asc").trim().toLowerCase() === "desc"
      ? "desc"
      : "asc";

  if (requested && sortableFieldsFor(resource).includes(requested)) {
    return { [requested]: direction };
  }

  return RESOURCE_CONFIG[resource]?.kind === "club_resource"
    ? { created_at: "asc" as const }
    : undefined;
};

export type ListPagination = {
  limit: number;
  offset: number;
};

/**
 * La pagina richiesta, oppure `null` per «tutto».
 *
 * **Il default resta «tutto»** e non e una svista. Ogni pagina della Web App
 * legge oggi liste intere, e un default paginato le troncherebbe in silenzio:
 * una lista di 200 atleti che ne mostra 50 senza dirlo e peggio di una lista
 * lenta. La paginazione si chiede.
 */
const resolvePagination = (
  searchParams: URLSearchParams,
): ListPagination | null => {
  const rawLimit = Number(searchParams.get("limit"));
  if (!Number.isFinite(rawLimit) || rawLimit <= 0) return null;

  const limit = Math.min(Math.floor(rawLimit), MAX_PAGE_SIZE);

  const rawPage = Number(searchParams.get("page"));
  const rawOffset = Number(searchParams.get("offset"));

  const offset =
    Number.isFinite(rawPage) && rawPage > 1
      ? (Math.floor(rawPage) - 1) * limit
      : Number.isFinite(rawOffset) && rawOffset > 0
        ? Math.floor(rawOffset)
        : 0;

  return { limit, offset };
};

const getDelegate = (resource: string) => {
  const config = RESOURCE_CONFIG[resource];
  if (!config) {
    throw new Error(`Unsupported resource: ${resource}`);
  }

  if (config.kind === "club_resource") {
    return (prisma as any).clubResourceItem;
  }

  return (prisma as any)[config.delegate as string];
};

const getModelInclude = (resource: string) => {
  if (resource === "users") {
    return {
      club_access: true,
    };
  }

  return undefined;
};

/**
 * Contesto di richiesta che non fa parte dello scope di autorizzazione.
 *
 * Oggi contiene la sola stagione attiva (`x-active-season-id`). Non e un
 * confine di sicurezza: il confine resta `organization_id`.
 */
export type ResourceRequestOptions = {
  activeSeasonId?: string | null;
};

const isSeasonScopedResource = (resource: string) =>
  RESOURCE_CONFIG[resource]?.kind === "club_resource" &&
  isSeasonScopedDataType(resource);

const loadClubSeasonState = async (organizationId: string | null) => {
  if (!organizationId) {
    return null;
  }

  const club = await prisma.club.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });

  if (!club) {
    return null;
  }

  return normalizeClubSeasons(
    club.settings && typeof club.settings === "object" ? club.settings : {},
  );
};

/**
 * Stagione da applicare alla richiesta, se e una stagione che il club ha
 * davvero. Un id stale (stagione eliminata, club cambiato) non filtra nulla:
 * meglio mostrare tutto che una lista vuota inspiegabile.
 */
const resolveRequestSeason = async (
  resource: string,
  organizationId: string | null | undefined,
  options: ResourceRequestOptions | undefined,
) => {
  const requested = String(options?.activeSeasonId || "").trim();
  if (!requested || !isSeasonScopedResource(resource)) {
    return null;
  }

  const seasonState = await loadClubSeasonState(organizationId || null);

  if (!seasonState?.seasons.some((season) => season.id === requested)) {
    return null;
  }

  return { activeSeasonId: requested, legacySeasonId: seasonState.legacySeasonId };
};

/**
 * Stampa la stagione attiva su una risorsa club che ne e soggetta.
 *
 * Senza questo, una categoria creata mentre e attiva la stagione 2026/2027
 * resterebbe senza `seasonId` e finirebbe nella stagione baseline.
 * Una stagione gia presente sul payload non viene mai sovrascritta.
 *
 * `existingSeasonId` rende la stagione **immutabile in aggiornamento**: un
 * record nato in una stagione ci resta. Spostarlo non e un'operazione che il
 * prodotto offre, e concederla al CRUD generico significherebbe che una PATCH
 * con un `seasonId` sbagliato riscrive la storia di un'annata chiusa. Chi vuole
 * lo stesso elemento in due stagioni usa il riporto, che ne crea uno nuovo.
 */
const applySeasonStamp = async (
  resource: string,
  payload: Record<string, any>,
  organizationId: string | null | undefined,
  options: ResourceRequestOptions | undefined,
  existingSeasonId?: string | null,
) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const preservedSeasonId = String(existingSeasonId || "").trim();
  if (preservedSeasonId) {
    return payload.seasonId === preservedSeasonId
      ? payload
      : { ...payload, seasonId: preservedSeasonId };
  }

  if (String(payload.seasonId || "").trim()) {
    return payload;
  }

  const season = await resolveRequestSeason(resource, organizationId, options);
  if (!season) {
    return payload;
  }

  return { ...payload, seasonId: season.activeSeasonId };
};

const CLUB_RESOURCES = new Set(["clubs", "organizations"]);

/**
 * Colonne sempre presenti in una lettura proiettata del club.
 *
 * `id` serve a indirizzare la scrittura successiva, `slug` e `name` alle
 * intestazioni, `settings` a risolvere la stagione attiva. Costano poco e
 * evitano che una proiezione dimentichi un campo di servizio.
 */
const CLUB_PROJECTION_MANDATORY_FIELDS = ["id", "slug", "name", "settings"];

/**
 * Colonne del club che una proiezione puo chiedere.
 *
 * Elenco esplicito invece dell'enum generato da Prisma: un campo sconosciuto
 * viene ignorato e la lettura degrada alle sole colonne obbligatorie, invece
 * di far fallire la query con un nome di colonna arbitrario dal client.
 */
const CLUB_PROJECTABLE_FIELDS = new Set([
  ...CLUB_JSON_FIELDS,
  ...CLUB_PROJECTION_MANDATORY_FIELDS,
  "logo_url",
  "creator_id",
  "contact_email",
  "contact_phone",
  "city",
  "province",
  "created_at",
  "updated_at",
]);

/**
 * Proiezione di colonne richiesta con `?fields=a,b,c`, onorata **solo** per
 * `clubs` e `organizations`.
 *
 * La riga di un club porta 35 colonne JSON: leggerla intera per modificarne
 * una sola significava trasferire centinaia di KB a ogni salvataggio, autosave
 * compresi (WP-31). E opt-in: senza il parametro la risposta e completa, quindi
 * nessun chiamante esistente perde campi.
 */
export const resolveClubProjection = (
  resource: string,
  searchParams: URLSearchParams,
) => {
  if (!CLUB_RESOURCES.has(resource)) {
    return undefined;
  }

  const requested = String(searchParams.get("fields") || "")
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);

  if (requested.length === 0) {
    return undefined;
  }

  const selected = new Set(
    [...CLUB_PROJECTION_MANDATORY_FIELDS, ...requested].filter((field) =>
      CLUB_PROJECTABLE_FIELDS.has(field),
    ),
  );

  return Object.fromEntries([...selected].map((field) => [field, true]));
};

/**
 * Applica la stessa proiezione alla **risposta** di una scrittura sul club.
 *
 * Senza questo, ogni PATCH restituiva la riga intera: su un autosave e il
 * trasferimento piu costoso dell'intera operazione, e il client non ne usa
 * nulla (WP-31).
 */
export const projectClubResponse = (
  resource: string,
  record: Record<string, any> | null,
  searchParams: URLSearchParams,
) => {
  const projection = resolveClubProjection(resource, searchParams);
  if (!projection || !record) {
    return record;
  }

  return Object.fromEntries(
    Object.entries(record).filter(([key]) => key in projection),
  );
};

const ATHLETE_RESOURCES = new Set(["athletes", "simplified_athletes"]);

/**
 * Chiavi di `athletes.data` che contengono collezioni di allegati.
 *
 * Gli allegati sono salvati come data URL base64 dentro il JSON dell'atleta:
 * una lista di 200 atleti trasferirebbe decine di MB per mostrare nome,
 * categoria e scadenza certificato. `view=summary` le omette; il dettaglio
 * atleta continua a ricevere il `data` completo (WP-31).
 */
const ATHLETE_SUMMARY_OMITTED_DATA_KEYS = new Set([
  "certificateFiles",
  "documents",
  "enrollmentDocuments",
  "guardians",
  "identityDocuments",
  "medicalVisits",
  "paymentHistory",
  "payments",
  "registrationDocuments",
  "registrations",
]);

/** Oltre questa soglia un data URL non e piu un valore, e un file. */
const SUMMARY_INLINE_FILE_MIN_LENGTH = 1024;

/**
 * Le chiavi che contengono la foto dell'atleta.
 *
 * Non vengono tolte come gli altri allegati: vengono **sostituite con un
 * URL**, perche la lista la foto la mostra davvero (vedi `toAvatarUrl`).
 */
const SUMMARY_AVATAR_KEYS = new Set(["avatar", "avatar_url"]);

const isInlineFileValue = (key: string, value: unknown) =>
  typeof value === "string" &&
  value.length >= SUMMARY_INLINE_FILE_MIN_LENGTH &&
  value.startsWith("data:") &&
  !SUMMARY_AVATAR_KEYS.has(key);

/**
 * La foto di un atleta, come indirizzo invece che come contenuto.
 *
 * **Il numero che ha reso necessaria questa funzione** (Blocco 8, punto E).
 * Portati gli allegati fuori dai record, la lista di 200 atleti e stata
 * rimisurata: 23,7 MB, praticamente identica a prima. `view=summary` toglieva
 * tutti gli allegati tranne l'avatar — 90 kB di base64 a testa, 18 MB per
 * club, dentro il JSON che il browser deve scaricare **tutto** prima di
 * disegnare la prima riga.
 *
 * Sostituendolo con `/api/v1/athletes/:id/avatar` la stessa lista scende a
 * poche centinaia di kB, e le foto arrivano in parallelo, in cache, e solo
 * per le righe che si guardano davvero.
 *
 * Un URL gia corto (una foto caricata altrove, o un riferimento ad allegato)
 * resta com'e: non c'e niente da guadagnare a sostituirlo.
 */
const toAvatarUrl = (recordId: string, value: unknown) => {
  const raw = String(value || "");
  if (!raw.startsWith("data:")) return value;
  if (!recordId) return value;

  return `/api/v1/athletes/${encodeURIComponent(recordId)}/avatar`;
};

const toAthleteSummaryRecord = (record: Record<string, any>) => {
  const recordId = String(record?.id || "");
  const avatarUrl = toAvatarUrl(recordId, record?.avatar_url);

  const data = record?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ...record, avatar_url: avatarUrl };
  }

  const summaryData: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (ATHLETE_SUMMARY_OMITTED_DATA_KEYS.has(key)) {
      continue;
    }

    if (SUMMARY_AVATAR_KEYS.has(key)) {
      summaryData[key] = toAvatarUrl(recordId, value);
      continue;
    }

    if (isInlineFileValue(key, value)) {
      continue;
    }

    summaryData[key] = value;
  }

  return { ...record, avatar_url: avatarUrl, data: summaryData };
};

/**
 * Proiezione leggera richiesta con `?view=summary`.
 *
 * Non e una cache: e la stessa lettura, senza i campi che la lista non usa.
 * Un valore sconosciuto di `view` non filtra nulla.
 */
const applyListView = (
  resource: string,
  records: Record<string, any>[],
  searchParams: URLSearchParams,
) => {
  if (searchParams.get("view") !== "summary") {
    return records;
  }

  if (!ATHLETE_RESOURCES.has(resource)) {
    return records;
  }

  return records.map((record) => toAthleteSummaryRecord(record));
};

const TRAINER_DASHBOARD_FILTERED_RESOURCES = new Set([
  "athletes",
  "simplified_athletes",
  "trainings",
  "matches",
]);

const toArrayValue = (value: unknown): any[] =>
  Array.isArray(value) ? value : [];

const normalizeTrainerToken = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const toObjectPayload = (value: any) =>
  value?.data && typeof value.data === "object"
    ? value.data
    : value?.payload && typeof value.payload === "object"
      ? value.payload
      : {};

const flattenTokenInput = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenTokenInput(entry));
  }

  if (typeof value === "string" && value.includes(",")) {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [value];
};

const buildCategoryTokenSet = (
  source: unknown,
  categories: Array<{ id?: string; name?: string }>,
) => {
  const tokens = new Set<string>();

  for (const entry of flattenTokenInput(source)) {
    const raw =
      entry && typeof entry === "object"
        ? String(
            (entry as any).id ||
              (entry as any).name ||
              (entry as any).category ||
              (entry as any).categoryId ||
              (entry as any).category_id ||
              "",
          ).trim()
        : String(entry || "").trim();

    if (!raw) {
      continue;
    }

    tokens.add(normalizeTrainerToken(raw));

    const resolvedId = resolveCategoryId(raw, categories);
    if (resolvedId) {
      tokens.add(normalizeTrainerToken(resolvedId));
    }

    const resolvedLabel = resolveCategoryLabel(raw, categories);
    if (resolvedLabel) {
      tokens.add(normalizeTrainerToken(resolvedLabel));
    }
  }

  return tokens;
};

const extractRecordCategoryTokens = (
  record: Record<string, any>,
  categories: Array<{ id?: string; name?: string }>,
) => {
  const source = toObjectPayload(record);

  return buildCategoryTokenSet(
    [
      record.category,
      record.category_id,
      record.categoryId,
      record.category_name,
      record.categoryName,
      record.categories,
      source.category,
      source.category_id,
      source.categoryId,
      source.category_name,
      source.categoryName,
      source.categories,
    ],
    categories,
  );
};

const hasTokenIntersection = (left: Set<string>, right: Set<string>) =>
  Array.from(left).some((token) => right.has(token));

const isTrainerLikeProfile = (profile: any) => {
  const source = toObjectPayload(profile);
  const role = normalizeTrainerToken(profile?.role || source?.role);
  return ["trainer", "allenatore", "coach"].includes(role);
};

const isProfileLinkedToUser = (
  profile: any,
  userId: string,
  userEmail?: string | null,
) => {
  const source = toObjectPayload(profile);
  const linkedCandidates = [
    profile?.linkedUserId,
    profile?.linked_user_id,
    profile?.userId,
    profile?.user_id,
    source?.linkedUserId,
    source?.linked_user_id,
    source?.userId,
    source?.user_id,
  ];
  const linkedListCandidates = [
    profile?.linkedUserIds,
    profile?.linked_user_ids,
    source?.linkedUserIds,
    source?.linked_user_ids,
  ].flatMap((entry) => flattenTokenInput(entry));
  const emailCandidates = [
    profile?.linkedUserEmail,
    profile?.linked_user_email,
    profile?.email,
    source?.linkedUserEmail,
    source?.linked_user_email,
    source?.email,
  ];
  const normalizedUserId = normalizeTrainerToken(userId);
  const normalizedUserEmail = normalizeTrainerToken(userEmail);

  return (
    linkedCandidates
      .concat(linkedListCandidates)
      .some(
        (candidate) => normalizeTrainerToken(candidate) === normalizedUserId,
      ) ||
    (Boolean(normalizedUserEmail) &&
      emailCandidates.some(
        (candidate) => normalizeTrainerToken(candidate) === normalizedUserEmail,
      ))
  );
};

const buildTrainerTokenSet = (profile: any) => {
  const source = toObjectPayload(profile);
  const tokens = [
    profile?.id,
    profile?.name,
    profile?.fullName,
    profile?.email,
    source?.id,
    source?.name,
    source?.fullName,
    source?.email,
    [source?.name, source?.surname].filter(Boolean).join(" "),
    [profile?.name, profile?.surname].filter(Boolean).join(" "),
  ];

  return new Set(
    tokens.map((entry) => normalizeTrainerToken(entry)).filter(Boolean),
  );
};

const extractRecordTrainerTokens = (record: Record<string, any>) => {
  const source = toObjectPayload(record);
  return new Set(
    [
      record.trainerId,
      record.trainer_id,
      record.trainerIds,
      record.trainer_ids,
      record.trainers,
      record.coach,
      record.coachName,
      source.trainerId,
      source.trainer_id,
      source.trainerIds,
      source.trainer_ids,
      source.trainers,
      source.coach,
      source.coachName,
    ]
      .flatMap((entry) => flattenTokenInput(entry))
      .map((entry) =>
        entry && typeof entry === "object"
          ? normalizeTrainerToken(
              (entry as any).id || (entry as any).name || (entry as any).email,
            )
          : normalizeTrainerToken(entry),
      )
      .filter(Boolean),
  );
};

const resolveTrainerDashboardFilterContext = async (
  organizationId: string,
  userId: string,
) => {
  const [club, user] = await Promise.all([
    prisma.club.findUnique({
      where: { id: organizationId },
      select: {
        categories: true,
        trainers: true,
        staff_members: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    }),
  ]);

  if (!club) {
    return null;
  }

  const trainerPool = [
    ...toArrayValue(club.trainers),
    ...toArrayValue(club.staff_members).filter(isTrainerLikeProfile),
  ];
  const categoryOptions = buildClubCategoryOptions({
    clubCategories: club.categories,
    resourceCategories: trainerPool.flatMap((profile) => {
      const source = toObjectPayload(profile);
      return [profile?.categories, source?.categories];
    }),
  });
  const trainerProfile =
    trainerPool.find((profile) =>
      isProfileLinkedToUser(profile, userId, user?.email),
    ) || null;

  if (!trainerProfile) {
    return {
      categoryOptions,
      assignedCategoryTokens: new Set<string>(),
      trainerTokens: new Set<string>(),
    };
  }

  const source = toObjectPayload(trainerProfile);
  const assignedCategoryTokens = buildCategoryTokenSet(
    [
      trainerProfile.categories,
      trainerProfile.category,
      trainerProfile.categoryId,
      trainerProfile.category_id,
      trainerProfile.categoryName,
      trainerProfile.category_name,
      source.categories,
      source.category,
      source.categoryId,
      source.category_id,
      source.categoryName,
      source.category_name,
    ],
    categoryOptions,
  );

  return {
    categoryOptions,
    assignedCategoryTokens,
    trainerTokens: buildTrainerTokenSet(trainerProfile),
  };
};

const filterTrainerDashboardRecords = async (
  resource: string,
  records: Record<string, any>[],
  searchParams: URLSearchParams,
  scope?: ResourceAccessScope,
) => {
  if (
    searchParams.get("trainer_dashboard") !== "1" ||
    !scope?.userId ||
    !scope.activeOrganizationId ||
    !TRAINER_DASHBOARD_FILTERED_RESOURCES.has(resource)
  ) {
    return records;
  }

  const context = await resolveTrainerDashboardFilterContext(
    scope.activeOrganizationId,
    scope.userId,
  );

  if (!context) {
    return [];
  }

  return records.filter((record) => {
    const matchesCategory = hasTokenIntersection(
      extractRecordCategoryTokens(record, context.categoryOptions),
      context.assignedCategoryTokens,
    );

    if (matchesCategory) {
      return true;
    }

    if (resource === "trainings" || resource === "matches") {
      return hasTokenIntersection(
        extractRecordTrainerTokens(record),
        context.trainerTokens,
      );
    }

    return false;
  });
};

export type ListResourceResult = {
  records: Record<string, any>[];
  /**
   * Presente **solo** quando la pagina e stata chiesta. Chi non la chiede
   * riceve tutto, come prima, e non deve interpretare niente di nuovo.
   */
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  } | null;
};

/**
 * Lettura di una lista, con paginazione, ricerca e ordinamento opzionali.
 *
 * **Perche il filtro non puo stare tutto nel database** (WP-12). Due filtri di
 * questa applicazione vivono fuori dalle colonne: la **stagione**, che sta
 * dentro il payload JSON e si applica confrontando la stagione attiva con
 * quella del record, e il **perimetro dell'allenatore**, che dipende dalle
 * categorie a lui assegnate. Entrambi si applicano dopo la query.
 *
 * Di conseguenza la paginazione e onesta solo quando nessuno dei due e
 * attivo. Quando lo sono, si legge tutto e si impagina in memoria — e il
 * `total` resta quello vero, cioe quello dopo i filtri, non quello del
 * database. Un conteggio che non corrisponde a cio che si vede e un difetto
 * peggiore di una query in piu.
 */
export const listResourcePage = async (
  resource: string,
  searchParams: URLSearchParams,
  scope?: ResourceAccessScope,
  options?: ResourceRequestOptions,
): Promise<ListResourceResult> => {
  const delegate = getDelegate(resource);
  const config = RESOURCE_CONFIG[resource];
  const where = buildWhereFromSearchParams(resource, searchParams);

  const searchFilter = buildSearchFilter(
    resource,
    searchParams.get("q") || searchParams.get("search") || "",
  );
  if (searchFilter) {
    Object.assign(where, searchFilter);
  }

  if (resource === "clubs" || resource === "organizations") {
    if (scope) {
      if (!scope.allowedOrganizationIds.length) {
        return { records: [], meta: null };
      }

      if (typeof where.id === "string") {
        ensureOrganizationAccess(scope, where.id);
      } else {
        where.id = { in: scope.allowedOrganizationIds };
      }
    }
  } else if (isOrganizationScopedResource(resource)) {
    where.organization_id = resolveScopedOrganizationId(
      scope,
      where.organization_id || where.club_id,
    );
    delete where.club_id;
  }

  // La stagione si risolve in parallelo alla lettura principale: e una lettura
  // indipendente e in serie aggiungerebbe un round trip a ogni lista.
  const clubProjection = resolveClubProjection(resource, searchParams);

  const pagination = resolvePagination(searchParams);
  const orderBy = buildOrderBy(resource, searchParams);

  /*
    La stagione decide se la pagina si puo chiedere al database. Va risolta
    prima, non in parallelo: sapere che c'e un filtro applicato dopo la query
    cambia la query stessa.
  */
  const season = await resolveRequestSeason(
    resource,
    where.organization_id || scope?.activeOrganizationId,
    options,
  );

  const hasPostQueryFilters =
    Boolean(season) ||
    Boolean(searchParams.get("trainer_scope") || searchParams.get("trainer_id"));

  const canPaginateInDatabase = Boolean(pagination) && !hasPostQueryFilters;

  const findManyArgs: Record<string, any> = {
    where,
    ...(clubProjection
      ? { select: clubProjection }
      : { include: getModelInclude(resource) }),
    ...(orderBy ? { orderBy } : {}),
  };

  if (canPaginateInDatabase && pagination) {
    findManyArgs.take = pagination.limit;
    findManyArgs.skip = pagination.offset;
  }

  const [records, databaseTotal] = await Promise.all([
    delegate.findMany(findManyArgs),
    canPaginateInDatabase ? delegate.count({ where }) : Promise.resolve(null),
  ]);

  const serializedRecords = records
    .map((record: Record<string, any>) => serializeRecord(resource, record))
    .filter(Boolean) as Record<string, any>[];

  const seasonScopedRecords = season
    ? filterCollectionBySeason(resource, serializedRecords, season.activeSeasonId, {
        legacySeasonId: season.legacySeasonId,
      })
    : serializedRecords;

  const trainerScopedRecords = await filterTrainerDashboardRecords(
    resource,
    seasonScopedRecords,
    searchParams,
    scope,
  );

  const viewed = applyListView(resource, trainerScopedRecords, searchParams);

  if (!pagination) {
    return { records: viewed, meta: null };
  }

  if (canPaginateInDatabase) {
    const total = Number(databaseTotal || 0);
    return {
      records: viewed,
      meta: {
        total,
        limit: pagination.limit,
        offset: pagination.offset,
        hasMore: pagination.offset + viewed.length < total,
      },
    };
  }

  /*
    Filtri applicati dopo la query: la pagina si ritaglia qui. Costa una
    lettura intera, ma il `total` e quello vero — e un conteggio che non
    corrisponde a cio che si vede e il modo piu rapido di far perdere fiducia
    in un elenco.
  */
  const total = viewed.length;
  const page = viewed.slice(
    pagination.offset,
    pagination.offset + pagination.limit,
  );

  return {
    records: page,
    meta: {
      total,
      limit: pagination.limit,
      offset: pagination.offset,
      hasMore: pagination.offset + page.length < total,
    },
  };
};

/**
 * La lettura di sempre: l'array e basta.
 *
 * Resta la forma usata da tutto cio che non chiede una pagina, perche
 * cambiare la firma di `listResource` avrebbe voluto dire toccare ogni
 * chiamante per un valore che a quasi tutti non serve.
 */
export const listResource = async (
  resource: string,
  searchParams: URLSearchParams,
  scope?: ResourceAccessScope,
  options?: ResourceRequestOptions,
) => {
  const { records } = await listResourcePage(
    resource,
    searchParams,
    scope,
    options,
  );
  return records;
};

export const getResourceById = async (
  resource: string,
  id: string,
  scope?: ResourceAccessScope,
) => {
  const delegate = getDelegate(resource);
  const config = RESOURCE_CONFIG[resource];

  let record: Record<string, any> | null = null;

  if (config.kind === "club_resource") {
    record = await findClubResourceRecord(resource, id, scope);
  } else {
    record = await delegate.findUnique({
      where: { id },
      include: getModelInclude(resource),
    });
  }

  assertRecordAccess(resource, record || null, scope);

  return record ? serializeRecord(resource, record) : null;
};

const resolveUpsertWhere = (resource: string, input: Record<string, any>) => {
  if (input.id) {
    return { id: input.id };
  }

  if (resource === "users" && input.email) {
    return { email: input.email };
  }

  /*
    Il numero di un documento e univoco **dentro un club**, non fra tutti
    (ADR-0044): la chiave e la coppia. Con la sola colonna, un upsert non
    troverebbe piu una chiave univoca — e, prima che il vincolo cambiasse,
    avrebbe potuto aggiornare la fattura di un'altra societa che per caso
    portava lo stesso numero.
  */
  if (resource === "invoices" && input.invoice_number && input.organization_id) {
    return {
      organization_id_invoice_number: {
        organization_id: input.organization_id,
        invoice_number: input.invoice_number,
      },
    };
  }

  if (resource === "receipts" && input.receipt_number && input.organization_id) {
    return {
      organization_id_receipt_number: {
        organization_id: input.organization_id,
        receipt_number: input.receipt_number,
      },
    };
  }

  if (resource === "clubs" || resource === "organizations") {
    if (input.slug) {
      return { slug: input.slug };
    }
  }

  if (resource === "assets" && input.bucket && input.path) {
    return {
      bucket_path: {
        bucket: input.bucket,
        path: input.path,
      },
    };
  }

  return null;
};

export const createResource = async (
  resource: string,
  input: Record<string, any>,
  mode: "create" | "upsert" = "create",
  scope?: ResourceAccessScope,
  options?: ResourceRequestOptions,
) => {
  const delegate = getDelegate(resource);
  const config = RESOURCE_CONFIG[resource];

  if (config.kind === "club_resource") {
    const data = normalizeClubResourceInput(resource, input);
    data.organization_id = resolveScopedOrganizationId(
      scope,
      data.organization_id || data.club_id,
    );
    const logicalId = String(input?.id || "").trim();

    if (mode === "upsert" && logicalId) {
      const existing = await findClubResourceRecord(resource, logicalId, scope);

      if (existing) {
        assertRecordAccess(resource, existing, scope);
        assertAnagraficaIsValid(resource, data, existing);
        const preservedLogicalId =
          (!isUuid(input?.id) &&
            typeof input?.id === "string" &&
            input.id.trim()) ||
          getClubResourceLogicalId(existing);
        const existingPayload =
          typeof existing.payload === "object" && existing.payload
            ? clone(existing.payload)
            : {};
        const nextPayload =
          typeof data.payload === "object" && data.payload
            ? {
                ...existingPayload,
                ...clone(data.payload),
              }
            : existingPayload;

        if (preservedLogicalId && !nextPayload.id) {
          nextPayload.id = preservedLogicalId;
        }

        // La stagione si stampa **dopo** la fusione con il payload esistente:
        // modificare una categoria mentre e attiva un'altra stagione non deve
        // spostarla di stagione.
        const stampedPayload = await applySeasonStamp(
          resource,
          nextPayload,
          data.organization_id || existing.organization_id,
          options,
        );

        const record = await delegate.update({
          where: { id: existing.id },
          data: {
            organization_id: data.organization_id || existing.organization_id,
            resource_type: resource,
            name: data.name ?? existing.name ?? nextPayload.name ?? null,
            status:
              data.status ?? existing.status ?? nextPayload.status ?? null,
            date:
              data.date ??
              existing.date ??
              toDateOrUndefined(nextPayload.date) ??
              null,
            payload: stampedPayload,
          },
        });

        if (data.organization_id || existing.organization_id) {
          await syncClubAggregateField(
            data.organization_id || existing.organization_id,
            resource,
          );
        }

        return serializeRecord(resource, record);
      }
    }

    assertAnagraficaIsValid(resource, data);

    data.payload = await applySeasonStamp(
      resource,
      data.payload,
      data.organization_id,
      options,
    );

    const record = await delegate.create({
      data,
    });

    if (data.organization_id) {
      await syncClubAggregateField(data.organization_id, resource);
    }
    return serializeRecord(resource, record);
  }

  const normalized = await normalizeModelInput(resource, input);
  assertAnagraficaIsValid(resource, normalized);

  if (resource === "clubs" || resource === "organizations") {
    if (scope?.userId && !normalized.creator_id) {
      normalized.creator_id = scope.userId;
    }
  } else if (isOrganizationScopedResource(resource)) {
    normalized.organization_id = resolveScopedOrganizationId(
      scope,
      normalized.organization_id || normalized.club_id,
    );
  }

  if (
    mode === "upsert" &&
    resource === "organization_users" &&
    normalized.organization_id &&
    normalized.user_id
  ) {
    const role = normalized.role || "member";
    const accessData: Prisma.OrganizationUserUncheckedCreateInput = {
      id: normalized.id || undefined,
      organization_id: String(normalized.organization_id),
      user_id: String(normalized.user_id),
      role: String(role),
      is_primary: Boolean(normalized.is_primary),
    };
    const existingAccess = await prisma.organizationUser.findFirst({
      where: {
        organization_id: normalized.organization_id,
        user_id: normalized.user_id,
        role,
      },
    });

    const record = existingAccess
      ? await prisma.organizationUser.update({
          where: { id: existingAccess.id },
          data: accessData,
        })
      : await prisma.organizationUser.create({
          data: accessData,
        });

    return serializeRecord(resource, record);
  }

  if (mode === "upsert") {
    const where = resolveUpsertWhere(resource, normalized);
    if (where) {
      const record = await delegate.upsert({
        where,
        update: normalized,
        create: normalized,
        include: getModelInclude(resource),
      });

      if (resource === "users") {
        await syncUserClubAccess(record.id, input.club_access);
      }

      if (resource === "clubs" || resource === "organizations") {
        await syncClubMembers(record.id, input.members);
        await ensureClubDashboard(
          record.id,
          normalized.creator_id,
          input.dashboard_data,
        );
        for (const field of CLUB_RESOURCE_TYPES) {
          if (input[field] !== undefined) {
            await syncClubResourceItemsFromField(
              record.id,
              field,
              input[field],
            );
          }
        }
      }

      return serializeRecord(resource, record);
    }
  }

  const record = await delegate.create({
    data: normalized,
    include: getModelInclude(resource),
  });

  if (resource === "users") {
    await syncUserClubAccess(record.id, input.club_access);
  }

  if (resource === "clubs" || resource === "organizations") {
    await syncClubMembers(record.id, input.members);
    await ensureClubDashboard(
      record.id,
      normalized.creator_id,
      input.dashboard_data,
    );
    for (const field of CLUB_RESOURCE_TYPES) {
      if (input[field] !== undefined) {
        await syncClubResourceItemsFromField(record.id, field, input[field]);
      }
    }
  }

  return serializeRecord(resource, record);
};

export const updateResource = async (
  resource: string,
  id: string,
  input: Record<string, any>,
  scope?: ResourceAccessScope,
  options?: ResourceRequestOptions,
) => {
  const delegate = getDelegate(resource);
  const config = RESOURCE_CONFIG[resource];

  if (config.kind === "club_resource") {
    const existing = await findClubResourceRecord(resource, id, scope);
    if (!existing) {
      throw new Error("Risorsa del club non trovata");
    }
    assertRecordAccess(resource, existing, scope);

    const normalized = normalizeClubResourceInput(resource, {
      ...input,
      id: existing.id,
    });
    const inputLogicalId =
      !isUuid(input?.id) && typeof input?.id === "string" && input.id.trim()
        ? input.id.trim()
        : null;
    const existingLogicalId = getClubResourceLogicalId(existing);
    const existingPayload =
      typeof existing.payload === "object" && existing.payload
        ? clone(existing.payload)
        : {};
    const nextPayload =
      typeof normalized.payload === "object" && normalized.payload
        ? {
            ...existingPayload,
            ...clone(normalized.payload),
          }
        : existingPayload;
    assertAnagraficaIsValid(resource, { payload: nextPayload }, existing);

    const logicalIdToPreserve = inputLogicalId || existingLogicalId;

    if (logicalIdToPreserve && !nextPayload.id) {
      nextPayload.id = logicalIdToPreserve;
    }

    const stampedPayload = await applySeasonStamp(
      resource,
      nextPayload,
      existing.organization_id,
      options,
      String((existingPayload as any)?.seasonId || "").trim() || null,
    );

    normalized.organization_id = resolveScopedOrganizationId(
      scope,
      normalized.organization_id || existing?.organization_id,
    );
    const record = await delegate.update({
      where: { id: existing.id },
      data: {
        organization_id: normalized.organization_id,
        name: normalized.name ?? existing.name ?? nextPayload.name ?? null,
        status:
          normalized.status ?? existing.status ?? nextPayload.status ?? null,
        date:
          normalized.date ??
          existing.date ??
          toDateOrUndefined(nextPayload.date) ??
          null,
        payload: stampedPayload,
      },
    });

    if (normalized.organization_id) {
      await syncClubAggregateField(normalized.organization_id, resource);
    }

    return serializeRecord(resource, record);
  }

  const normalized = await normalizeModelInput(resource, input);
  const existing = await delegate.findUnique({
    where: { id },
    include: getModelInclude(resource),
  });
  assertRecordAccess(resource, existing, scope);
  assertAnagraficaIsValid(resource, normalized, existing);

  if (isOrganizationScopedResource(resource)) {
    normalized.organization_id = resolveScopedOrganizationId(
      scope,
      normalized.organization_id || existing?.organization_id,
    );
  }
  const record = await delegate.update({
    where: { id },
    data: normalized,
    include: getModelInclude(resource),
  });

  if (resource === "users") {
    await syncUserClubAccess(record.id, input.club_access);
  }

  if (resource === "clubs" || resource === "organizations") {
    await syncClubMembers(record.id, input.members);
    await ensureClubDashboard(
      record.id,
      normalized.creator_id,
      input.dashboard_data,
    );
    for (const field of CLUB_RESOURCE_TYPES) {
      if (input[field] !== undefined) {
        await syncClubResourceItemsFromField(record.id, field, input[field]);
      }
    }
  }

  return serializeRecord(resource, record);
};

export const deleteResource = async (
  resource: string,
  id: string,
  scope?: ResourceAccessScope,
) => {
  const delegate = getDelegate(resource);
  const config = RESOURCE_CONFIG[resource];

  if (config.kind === "club_resource") {
    const existing = await findClubResourceRecord(resource, id, scope);
    if (!existing) {
      throw new Error("Risorsa del club non trovata");
    }
    assertRecordAccess(resource, existing, scope);
    const record = await delegate.delete({
      where: { id: existing.id },
    });

    if (existing?.organization_id) {
      await syncClubAggregateField(existing.organization_id, resource);
    }
    return serializeRecord(resource, record);
  }

  const existing = await delegate.findUnique({
    where: { id },
    include: getModelInclude(resource),
  });
  assertRecordAccess(resource, existing, scope);

  const record = await delegate.delete({
    where: { id },
    include: getModelInclude(resource),
  });

  return serializeRecord(resource, record);
};
