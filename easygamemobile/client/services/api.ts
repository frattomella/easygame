import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

import {
  AuthOutcome,
  interpretAckResponse,
  interpretAuthResponse,
  interpretPasswordResetResponse,
  PasswordResetOutcome,
  ResendOutcome,
} from "@/lib/auth-flow";

const KEYS = {
  BASE_URL: "easygame_base_url",
  AUTH_TOKEN: "easygame_auth_token",
  USER: "easygame_user",
} as const;

const API_PREFIX = "/api/v1";
const REQUEST_TIMEOUT_MS = 6000;
const RETRYABLE_STATUSES = new Set([408, 429, 502, 503, 504]);

type ApiError = {
  message?: string;
  code?: string;
};

type ApiEnvelope<T> = {
  data: T;
  error: ApiError | null;
};

export interface User {
  id: string;
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  phone?: string;
  city?: string;
  roleLabel?: string;
  role?: string;
  userMetadata?: Record<string, any>;
}

type AuthSession = {
  access_token: string;
};

type VerificationPayload = {
  userId: string;
  email?: string | null;
  phone?: string | null;
  emailRequired?: boolean;
  phoneRequired?: boolean;
  emailPreviewCode?: string | null;
  phonePreviewCode?: string | null;
};

type AuthResponseData = {
  user: any;
  session: AuthSession | null;
  verification?: VerificationPayload | null;
};

export interface ClubCategorySummary {
  id: string;
  name: string;
  birthYearsLabel?: string;
  athleteCount?: number;
  trainerNames?: string[];
}

export interface Club {
  id: string;
  name: string;
  avatar?: string;
  categories?: string[];
  categoryItems?: ClubCategorySummary[];
  city?: string;
  province?: string;
  ownerLabel?: string;
  slotsUsed?: number;
  slotsTotal?: number;
  contactEmail?: string;
  contactPhone?: string;
  accentColor?: string;
  surfaceColor?: string;
  ownerId?: string | null;
}

export interface Access {
  id: string;
  clubId: string;
  clubName: string;
  clubAvatar?: string;
  role: string;
  status?: "active" | "pending";
  source?: "owned" | "assigned";
  trainerId?: string;
  linkedTrainerName?: string;
  linkedAt?: string;
  assignedCategories?: string[];
  assignedCategoryIds?: string[];
  permissions?: Record<string, any>;
  summary?: string;
}

export interface Guardian {
  id: string;
  name: string;
  surname?: string;
  relationship?: string;
  phone?: string;
  email?: string;
}

export interface RegistrationRecord {
  id: string;
  federation: string;
  number: string;
  status?: string;
  issueDate?: string;
  expiryDate?: string;
}

export interface PaymentRecord {
  id: string;
  date: string;
  description: string;
  amount: string;
  status?: string;
}

export interface AthleteDocumentRecord {
  id: string;
  name: string;
  type?: string;
  fileUrl?: string;
  issueDate?: string;
  expiryDate?: string;
}

export interface Athlete {
  id: string;
  name: string;
  clubId?: string;
  firstName?: string;
  lastName?: string;
  number: number;
  position: string;
  status: "attivo" | "infortunato" | "squalificato";
  category: string;
  categoryId?: string;
  avatar?: string;
  phone?: string;
  email?: string;
  birthDate?: string;
  city?: string;
  notes?: string;
  medicalCertExpiry?: string;
  guardians?: Guardian[];
  registrations?: RegistrationRecord[];
  payments?: PaymentRecord[];
  documents?: AthleteDocumentRecord[];
  enrollmentDocuments?: AthleteDocumentRecord[];
  identityDocuments?: AthleteDocumentRecord[];
  technicalNotes?: string;
  shirtSize?: string;
  pantsSize?: string;
  shoeSize?: string;
  clothingProfile?: string;
}

export interface TrainingAttendanceEntry {
  athleteId: string;
  present: boolean;
  notes: string;
}

export interface Training {
  id: string;
  clubId?: string;
  title: string;
  date: string;
  time: string;
  endTime?: string;
  location: string;
  category: string;
  categoryId?: string;
  coachName?: string;
  status?: "scheduled" | "inProgress" | "completed" | "cancelled";
  presentCount?: number;
  totalCount?: number;
  notes?: string;
  attendance?: TrainingAttendanceEntry[];
  trainerIds?: string[];
}

export interface Match {
  id: string;
  clubId?: string;
  date: string;
  time: string;
  homeTeam: string;
  awayTeam: string;
  opponent?: string;
  location: string;
  structureId?: string;
  fieldId?: string;
  locationId?: string;
  kit?: string;
  isHome: boolean;
  category?: string;
  categoryId?: string;
  convokedCount?: number;
  totalConvocable?: number;
  result?: {
    homeScore: number;
    awayScore: number;
  };
  convocatedAthletes?: string[];
  convocationsStatus?: "pending" | "completed" | "none";
  trainers?: string[];
}

export interface Task {
  id: string;
  clubId?: string;
  title: string;
  description?: string;
  dueDate?: string;
  completed: boolean;
  type: "reminder" | "task";
  roles?: string[];
}

/** Specchio di `src/lib/announcements/model.ts` (`Announcement`), forma "leggibile" restituita da `?mine=1`. */
export interface Announcement {
  id: string;
  title: string;
  body: string;
  status: string;
  publishAt: string | null;
  expiresAt: string | null;
  publishedAt: string | null;
  attachmentIds: string[];
  createdAt: string | null;
  updatedAt: string | null;
  deliveryId: string;
  readAt: string | null;
}

/** Specchio di `toClubAppointment` (`src/lib/appointments/projection.ts`). */
export interface ClubAppointment {
  id: string;
  organization_id: string;
  site_id: string | null;
  season_id: string | null;
  slot_id: string | null;
  starts_at: string;
  ends_at: string;
  timezone?: string;
  status: string;
  status_label: string;
  date: string;
  time: string;
  athlete_id: string | null;
  requested_by_user_id: string | null;
  assigned_to_user_id: string | null;
  reason: string;
  title: string;
  notes: string;
  internal_notes: string;
  decision_note: string;
  decided_by: string | null;
  decided_at: string | null;
  parent_appointment_id: string | null;
  version: number;
  created_at: string | null;
  updated_at: string | null;
  /** Le sole transizioni che il dominio ammette da questo stato, per questo lato — non tre bottoni fissi. */
  transitions: string[];
  actions: string[];
}

/** Specchio di `OwnCompensationStatement` (`src/lib/server/trainer-area.ts`). Elenco chiuso: niente IBAN, niente dati contributivi. */
export interface OwnCompensationStatement {
  organizationId: string;
  personId: string;
  displayName: string;
  relationships: {
    id: string;
    role: string;
    relationshipType: string;
    status: string;
    startDate: string;
    endDate: string | null;
    contractAmount: number | null;
    currency: string;
    compensationFrequency: string;
    plan: { kind: string; totalAmount: number; currency: string } | null;
  }[];
  installments: {
    id: string;
    relationshipId: string;
    sequence: number;
    label: string;
    dueDate: string;
    grossAmount: number;
    accruedAmount: number;
    paidAmount: number;
    remainingAmount: number;
    status: string;
  }[];
  declarations: {
    id: string;
    fiscalYear: number;
    externalAmount: number;
    declarationDate: string;
    status: string;
    hasOtherCoverage: boolean;
  }[];
  position: {
    year: number;
    clubGross: number;
    externalDeclared: number;
    progressive: number;
    paymentCount: number;
    lastPaymentAt: string | null;
    hasCurrentDeclaration: boolean;
  } | null;
}

/**
 * Specchio parziale di `getParentDashboardData`
 * (`src/lib/server/parent-dashboard.ts`). Tipizzato per intero solo cio che
 * questo WP consuma (Home, Calendario, RSVP); le sezioni non ancora
 * costruite lato mobile (pagamenti, documenti, iscrizione, strutture,
 * consensi, appuntamenti) restano `Record<string, unknown>` — stesso
 * payload del Web, letto cosi com'e, senza inventare una forma.
 */
export interface ParentDashboardEvent {
  id: string;
  date: string;
  time: string;
  endTime?: string;
  title?: string;
  category?: string;
  categoryName?: string;
  location?: string;
  opponent?: string;
  isHome?: boolean;
  status?: string;
  rsvpRequired?: boolean;
  [key: string]: unknown;
}

/** Una voce di `data.notifications` (payload aggregato) — scoped sull'atleta del path, mai su tutte le notifiche dell'utente. */
export interface ParentNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Una rata/quota — specchio di `NormalizedPaymentRecord`
 * (`src/lib/athlete-payment-utils.ts`, `normalizeStoredPayment`/
 * `mergeAthletePayments`). `statusKey` ha **solo** tre valori: le sfumature
 * ("Scaduto", "Parzialmente pagato"…) vivono solo nell'etichetta italiana
 * `status` — non esiste un quarto valore macchina da inventare. Lo stato si
 * legge cosi com'e, non si ricalcola da un orologio locale (regola v2.2 di
 * `PaymentCard`, §C3).
 */
export interface ParentPayment {
  id: string;
  date: string;
  dueDate: string | null;
  paidAt: string | null;
  description: string;
  type: string;
  amount: number;
  status: string;
  statusKey: "paid" | "pending" | "cancelled";
  paidAmount: number;
  method?: string | null;
  notes?: string | null;
  reference?: string | null;
  source: "athlete_json" | "athlete_payment";
  [key: string]: unknown;
}

/** `payments.online` — il canale di incasso del club, non lo stato di una singola rata (`resolveFamilyCheckoutChannel`, `src/lib/payments/family-checkout.ts`). */
export interface FamilyCheckoutState {
  available: boolean;
  blocker: "not_configured" | "temporarily_unavailable" | "nothing_due" | null;
  message: string;
}

/** Specchio di `serializeFamilyFiscalDocument` (`src/lib/server/parent-dashboard.ts`). `downloadPath` risponde HTML stampabile, non un PDF — vedi `getReceiptDownloadUrl`. */
export interface FamilyFiscalDocument {
  id: string;
  kind: "receipt" | "invoice";
  number: string;
  issueDate: string | null;
  amount: number;
  description: string;
  status: "issued" | "cancelled";
  statusLabel: string;
  athleteId: string | null;
  athleteName: string | null;
  downloadPath: string;
}

/**
 * Una voce del fascicolo documentale — specchio di `FamilyDocumentItem`
 * (`src/lib/documents/family-dossier.ts`). Stato **interamente derivato
 * server-side** (`deriveFamilyDocumentState`): il mobile legge `state`/
 * `stateLabel`/`daysLeft`/`action`, non li ricalcola mai.
 */
export interface FamilyDocumentItem {
  id: string;
  requestId: string | null;
  submissionId: string | null;
  documentKind: string;
  documentKindLabel: string;
  title: string;
  description: string;
  state:
    | "missing"
    | "overdue"
    | "under_review"
    | "approved"
    | "expired"
    | "rejected";
  stateLabel: string;
  required: boolean;
  dueDate: string | null;
  daysLeft: number | null;
  validUntil: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  rejectionReason: string | null;
  fileName: string;
  /** Vuoto se non c'e file; altrimenti `/api/parent-dashboard/<athleteId>/documents/<assetId>` — richiede Bearer, mai un link pubblico. */
  fileUrl: string;
  mimeType: string;
  action: "upload" | "replace" | "none";
  actionLabel: string;
  historyCount: number;
}

/** Specchio di `ConsentSubjectState` (`src/lib/consents/model.ts`, `deriveConsentState`). Nessun `title`/`bodyText`: il testo legale integrale non e esposto al genitore da nessuna API (vedi KB). */
export interface ConsentSubjectState {
  status: "accepted" | "rejected" | "revoked" | "missing";
  recordId: string | null;
  versionId: string | null;
  version: number | null;
  decidedAt: string | null;
  onOutdatedVersion: boolean;
  historyCount: number;
  definitionId: string;
  definitionKey: string;
  definitionTitle: string;
  required: boolean;
  subjectKind: string;
  subjectId: string;
  subjectLabel: string;
}

/** Specchio di `ConsentRecordSummary` (`src/lib/server/consents.ts`), la risposta di `POST .../consents`. */
export interface ConsentRecordSummary {
  id: string;
  definitionId: string;
  versionId: string;
  version: number | null;
  subjectKind: string;
  subjectId: string;
  subjectLabel: string;
  status: "accepted" | "rejected" | "revoked";
  decidedAt: string | null;
  decidedBy: string | null;
  source: string;
  evidenceKind: string | null;
  evidenceId: string | null;
  note: string;
}

/** Specchio di `toFamilyAppointment` (`src/lib/appointments/projection.ts`). Niente `internal_notes`: la faccia famiglia non la porta, non e nascosta lato client. */
export interface ParentAppointment {
  id: string;
  title: string;
  reason: string;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string;
  date: string;
  time: string;
  status:
    | "requested"
    | "confirmed"
    | "rejected"
    | "rescheduled"
    | "cancelled_by_family"
    | "cancelled_by_club"
    | "completed"
    | "no_show";
  status_label: string;
  notes: string;
  decision_note: string;
  person: string;
  athlete_id: string | null;
  athlete_name: string;
  slot_id: string | null;
  site_id: string | null;
  version: number;
  /** Non un elenco di transizioni come lato club — solo le due mosse che la famiglia puo fare. */
  can_reschedule: boolean;
  can_cancel: boolean;
  created_at: string | null;
  updated_at: string | null;
}

/** Specchio di `toFamilyFreeSlot`. `startsAt` e il solo campo che il server confronta per prenotare — non va mai ricostruito lato client. */
export interface ParentAppointmentFreeSlot {
  slotId: string | null;
  source: "slot" | "opening_hours";
  siteId: string | null;
  startsAt: string;
  endsAt: string;
  day: string;
  time: string;
  durationMinutes: number;
}

export interface ParentAppointmentsConfig {
  familyBookingEnabled: boolean;
  types: { id: string; name: string }[];
}

/** Specchio di `serializeParentStructure` (`src/lib/server/parent-dashboard.ts`) — whitelist chiusa, niente prezzi di noleggio o contatti interni. */
export interface ParentStructure {
  id: string;
  name: string;
  address: string;
  city: string;
  type: string;
  isPublic: boolean;
  isVisibleToMembers: boolean;
  fields: {
    id: string;
    name: string;
    ownership: "Pubblica" | "Privata";
    isBookable: boolean;
    isVisible: boolean;
    availability: Record<string, { start: string; end: string }[]>;
    pricing: { id: string; durationMinutes: number; price: number }[];
  }[];
}

/** Specchio di `StructureBooking` (`src/lib/structures-utils.ts`). Nessun annullamento lato Parent: ne il Web lo permette. */
export interface ParentStructureBooking {
  id: string;
  structureId: string;
  structureName: string;
  fieldId: string;
  fieldName: string;
  title: string;
  start: string;
  end: string;
  status: "pending" | "confirmed" | "cancelled";
  notes: string;
  amount?: number;
  paymentStatus?: "unpaid" | "paid" | "partial";
}

/** Specchio di `FamilyEnrollmentRequest` (`GET /api/v1/family/enrollment-requests`). Ogni pratica ha il proprio stato — a differenza di `data.enrollment` (una sola iscrizione), qui vive lo storico delle richieste. */
export interface FamilyEnrollmentRequest {
  id: string;
  kind: "enrollment" | "renewal" | "submission";
  kindLabel: string;
  state: "sent" | "in_review" | "approved" | "rejected";
  stateLabel: string;
  templateTitle: string;
  seasonLabel: string;
  athleteName: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string;
  pendingDocuments: {
    title: string;
    dueDate: string | null;
    required: boolean;
  }[];
}

export interface ParentDashboardData {
  user: { id: string; email: string; name: string };
  club: {
    id: string;
    name: string;
    logo_url: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    address: string | null;
    city: string | null;
    province: string | null;
    website: string | null;
    opening_hours: unknown;
    [key: string]: unknown;
  };
  /**
   * Specchio di `serializeAthleteCard` (`src/lib/server/parent-dashboard.ts`)
   * piu le due estensioni "safe" aggiunte nel payload principale — whitelist
   * dichiarata, non "tutto meno quello escluso": `data` porta **solo**
   * `address`/`medicalVisits` dal blob `athletes.data`, mai le note interne
   * o i codici che quel blob porta per altri usi. I guardian non portano
   * mai un token di accesso (`stripGuardianAccessTokens` lato server).
   */
  athlete: {
    id: string;
    organization_id?: string;
    name: string;
    first_name?: string;
    last_name?: string;
    birth_date?: string | null;
    category_id?: string | null;
    category_name?: string | null;
    categories?: {
      id: string;
      name: string;
      siteId?: string | null;
      siteName?: string | null;
      isPrimary?: boolean;
    }[];
    status?: string;
    avatar_url?: string | null;
    jersey_number?: number | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    province?: string | null;
    postal_code?: string | null;
    fiscal_code?: string | null;
    birth_place?: string | null;
    nationality?: string | null;
    gender?: string | null;
    user_id: string | null;
    data?: {
      address?: string | null;
      medicalVisits?: {
        type?: string;
        title?: string;
        date?: string;
        visitDate?: string;
      }[];
    };
    guardians: {
      id: string;
      name: string;
      surname: string;
      relationship: string | null;
      email: string | null;
      phone: string | null;
    }[];
    linkedAthletes: {
      id: string;
      organization_id: string;
      name: string;
      birth_date: string | null;
      category_name: string | null;
    }[];
  };
  health: {
    certificates: {
      id: string;
      athlete_id: string;
      type: string;
      status: string;
      issue_date: string | null;
      expiry_date: string | null;
      created_at: string | null;
      updated_at: string | null;
    }[];
    status: "valid" | "expiring" | "expired" | "missing" | string;
    statusLabel: string;
    familyState:
      | "valid"
      | "expiring"
      | "expired"
      | "missing"
      | "undated"
      | string;
    familyLabel: string;
    familyDetail: string;
    familySummary: string;
    expiryDate: string | null;
    allergies: string[];
    notes: string | null;
  };
  payments: {
    items: ParentPayment[];
    pending: number;
    paid: number;
    totalDue: number;
    totalPaid: number;
    remaining: number;
    summary: Record<string, unknown>;
    online: FamilyCheckoutState;
    receipts: FamilyFiscalDocument[];
    invoices: FamilyFiscalDocument[];
  };
  enrollment: {
    status: "enrolled" | "not_enrolled";
    notes: string;
    enrollmentDate: string | null;
    subscriptionStartDate: string | null;
    selectedPlan: string | null;
    discount: string | null;
    income: {
      expectedTotal: number;
      recordedPaid: number;
      recordedPending: number;
      residual: number;
      planName: string | null;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  documents: {
    required: FamilyDocumentItem[];
    uploaded: FamilyDocumentItem[];
  };
  trainings: {
    upcoming: ParentDashboardEvent[];
    history: ParentDashboardEvent[];
    all: ParentDashboardEvent[];
  };
  matches: {
    upcoming: ParentDashboardEvent[];
    history: ParentDashboardEvent[];
    all: ParentDashboardEvent[];
  };
  attendance: {
    present: number;
    absent: number;
    total: number;
    rate: number;
    [key: string]: unknown;
  };
  appointments: {
    config: ParentAppointmentsConfig;
    items: ParentAppointment[];
    availableSlots: ParentAppointmentFreeSlot[];
    openingHours: unknown;
  };
  structures: {
    items: ParentStructure[];
    bookings: ParentStructureBooking[];
  };
  notifications: ParentNotification[];
  notificationsUnread: number;
  analytics: {
    attendanceRate: number;
    lastAttendance: unknown[];
    nextTraining: ParentDashboardEvent | null;
    nextMatch: ParentDashboardEvent | null;
    [key: string]: unknown;
  };
}

/** Specchio di `readAthleteRsvpInvitations` (`src/lib/server/rsvp.ts`). `trainingId` e il generico id evento, anche per una gara. */
export interface RsvpInvitation {
  organizationId: string;
  trainingId: string;
  athleteId: string;
  kind: "training" | "match";
  opponent?: string;
  title?: string;
  categoryLabel?: string;
  location?: string;
  startsAt: string | null;
  time?: string;
  deadline: string | null;
  state: "yes" | "no" | "no_response";
  note?: string | null;
  answeredAt: string | null;
  canAnswer: boolean;
  blockedMessage?: string;
}

/** Specchio di `answerRsvp` (`src/lib/server/rsvp.ts`). */
export interface RsvpAnswerResult {
  organizationId: string;
  trainingId: string;
  athleteId: string;
  status: "yes" | "no";
  note: string | null;
  answeredAt: string;
  deadline: string | null;
}

/** Specchio di `listParentChildren` (`src/lib/server/parent-dashboard.ts`). */
export interface ParentChild {
  id: string;
  name: string;
  clubId: string;
  clubName: string;
  clubLogoUrl: string | null;
  categoryName: string | null;
  categories: string[];
  birthYear: number | null;
  status: "suspended" | "loan" | "inactive" | null;
  avatarUrl: string | null;
}

export type StoredContext = {
  clubId: string;
  role: string;
  accessId?: string | null;
  source?: "owned" | "assigned" | null;
};

export type MembershipOrganization = {
  id?: string;
  name?: string | null;
  logo_url?: string | null;
  creator_id?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  city?: string | null;
  province?: string | null;
  created_at?: string | null;
};

export type MembershipRecord = {
  id?: string;
  organization_id: string;
  role: string;
  is_primary?: boolean;
  organization?: MembershipOrganization | null;
  organizations?: MembershipOrganization | null;
};

const normalizeBaseUrl = (value: string) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  return withProtocol.replace(/\/+$/, "");
};

const getConfiguredDefaultBaseUrl = () => {
  const publicEnvUrl = normalizeBaseUrl(
    process.env.EXPO_PUBLIC_EASYGAME_API_URL || "",
  );
  if (publicEnvUrl) {
    return publicEnvUrl;
  }

  const expoHostCandidates = [
    (Constants as any)?.expoConfig?.hostUri,
    (Constants as any)?.manifest2?.extra?.expoClient?.hostUri,
    (Constants as any)?.manifest?.debuggerHost,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  for (const candidate of expoHostCandidates) {
    const host = candidate.split(",")[0]?.split(":")[0]?.trim();
    if (!host || host.includes("exp.direct")) {
      continue;
    }

    if (/^(localhost|127\.0\.0\.1)$/i.test(host)) {
      return "http://127.0.0.1:3001";
    }

    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
      return `http://${host}:3001`;
    }
  }

  return null;
};

const toRecord = (value: unknown) =>
  value && typeof value === "object" ? (value as Record<string, any>) : {};

export const mapAuthUser = (rawUser: any): User => {
  const userMetadata = toRecord(rawUser?.user_metadata);
  const firstName = String(userMetadata.firstName || "").trim();
  const lastName = String(userMetadata.lastName || "").trim();
  const name =
    String(userMetadata.name || "").trim() ||
    [firstName, lastName].filter(Boolean).join(" ").trim() ||
    String(rawUser?.email || "").trim() ||
    "Utente EasyGame";

  return {
    id: String(rawUser?.id || "").trim(),
    email: String(rawUser?.email || "")
      .trim()
      .toLowerCase(),
    name,
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    avatar: String(userMetadata.avatarUrl || "").trim() || undefined,
    phone: String(userMetadata.phone || "").trim() || undefined,
    city: String(userMetadata.city || "").trim() || undefined,
    role: String(rawUser?.app_metadata?.role || userMetadata.role || "").trim(),
    roleLabel: String(userMetadata.roleLabel || "").trim() || undefined,
    userMetadata,
  };
};

class EasyGameApiService {
  private baseUrl: string | null = null;
  private authToken: string | null = null;
  private userCache: User | null = null;
  private initialized = false;

  private getConfiguredBaseUrl() {
    return getConfiguredDefaultBaseUrl();
  }

  private getCandidateBaseUrls() {
    return Array.from(
      new Set(
        [this.baseUrl, this.getConfiguredBaseUrl()]
          .map((value) => normalizeBaseUrl(value || ""))
          .filter(Boolean),
      ),
    );
  }

  private async persistWinningBaseUrl(baseUrl: string) {
    const normalized = normalizeBaseUrl(baseUrl);
    if (!normalized) {
      return;
    }

    this.baseUrl = normalized;
    await SecureStore.setItemAsync(KEYS.BASE_URL, normalized);
  }

  private async ensureInit() {
    if (this.initialized) {
      return;
    }

    const storedBaseUrl = normalizeBaseUrl(
      (await SecureStore.getItemAsync(KEYS.BASE_URL)) || "",
    );
    const configuredBaseUrl = this.getConfiguredBaseUrl();

    const shouldPreferConfigured = Boolean(configuredBaseUrl);

    this.baseUrl =
      (shouldPreferConfigured ? configuredBaseUrl : storedBaseUrl) ||
      configuredBaseUrl ||
      null;

    if (shouldPreferConfigured && configuredBaseUrl) {
      await SecureStore.setItemAsync(KEYS.BASE_URL, configuredBaseUrl);
    }

    this.authToken = await SecureStore.getItemAsync(KEYS.AUTH_TOKEN);
    const storedUser = await SecureStore.getItemAsync(KEYS.USER);
    this.userCache = storedUser ? (JSON.parse(storedUser) as User) : null;
    this.initialized = true;
  }

  async setBaseUrl(url: string) {
    await this.ensureInit();
    const normalized = normalizeBaseUrl(url);
    this.baseUrl = normalized || null;

    if (normalized) {
      await SecureStore.setItemAsync(KEYS.BASE_URL, normalized);
      return;
    }

    await SecureStore.deleteItemAsync(KEYS.BASE_URL);
  }

  async getBaseUrl(): Promise<string | null> {
    await this.ensureInit();
    return this.baseUrl;
  }

  private async setAuthToken(token: string | null) {
    this.authToken = token;

    if (token) {
      await SecureStore.setItemAsync(KEYS.AUTH_TOKEN, token);
      return;
    }

    await SecureStore.deleteItemAsync(KEYS.AUTH_TOKEN);
  }

  private async setStoredUser(user: User | null) {
    this.userCache = user;

    if (user) {
      await SecureStore.setItemAsync(KEYS.USER, JSON.stringify(user));
      return;
    }

    await SecureStore.deleteItemAsync(KEYS.USER);
  }

  async getStoredUser(): Promise<User | null> {
    await this.ensureInit();
    return this.userCache;
  }

  async isLoggedIn(): Promise<boolean> {
    await this.ensureInit();
    return Boolean(this.authToken);
  }

  private async fetchWithTimeout(
    input: string,
    init: RequestInit,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async performJsonRequest(
    baseUrl: string,
    path: string,
    options: {
      method: "GET" | "POST" | "PATCH" | "DELETE";
      body?: Record<string, any> | null;
      /** Un upload multipart — mai insieme a `body`. Niente `Content-Type` esplicito: `fetch` genera il boundary da solo, impostarlo a mano lo romperebbe. */
      formData?: FormData;
      clubId?: string | null;
      query?: Record<string, string | number | boolean | null | undefined>;
      headers?: HeadersInit;
    },
  ) {
    const url = new URL(path, baseUrl);
    const { method, body, formData, clubId, query, headers } = options;

    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") {
          return;
        }
        url.searchParams.set(key, String(value));
      });
    }

    const requestHeaders: Record<string, string> = {
      Accept: "application/json",
      ...(headers as Record<string, string>),
    };

    if (this.authToken) {
      requestHeaders.Authorization = `Bearer ${this.authToken}`;
    }

    if (clubId) {
      requestHeaders["x-active-club-id"] = clubId;
    }

    if (!formData && body !== undefined && body !== null) {
      requestHeaders["Content-Type"] = "application/json";
    }

    try {
      const response = await this.fetchWithTimeout(url.toString(), {
        method,
        headers: requestHeaders,
        body: formData
          ? formData
          : body !== undefined && body !== null
            ? JSON.stringify(body)
            : undefined,
      });

      const rawText = await response.text();
      let payload: any = null;
      try {
        payload = rawText ? JSON.parse(rawText) : null;
      } catch {
        payload = null;
      }

      return {
        status: response.status,
        payload,
        rawText,
        retryAfter: response.headers.get("Retry-After"),
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return {
          status: 504,
          payload: null,
          rawText: "Timeout backend EasyGame",
          retryAfter: null,
        };
      }

      return {
        status: 503,
        payload: null,
        rawText:
          error instanceof Error
            ? `Errore di connessione: ${error.message}`
            : "Errore di connessione al backend EasyGame.",
        retryAfter: null,
      };
    }
  }

  private async request<T>(
    path: string,
    options: {
      method?: "GET" | "POST" | "PATCH" | "DELETE";
      body?: Record<string, any> | null;
      formData?: FormData;
      clubId?: string | null;
      query?: Record<string, string | number | boolean | null | undefined>;
      headers?: HeadersInit;
    } = {},
  ): Promise<T> {
    await this.ensureInit();

    if (!this.baseUrl) {
      throw new Error("Configura prima l'URL del backend EasyGame.");
    }
    let lastFailure: { status: number; payload: any; rawText: string } | null =
      null;

    for (const baseUrl of this.getCandidateBaseUrls()) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const result = await this.performJsonRequest(baseUrl, path, {
          method: options.method || "GET",
          body: options.body,
          formData: options.formData,
          clubId: options.clubId,
          query: options.query,
          headers: options.headers,
        });

        const envelope = result.payload as ApiEnvelope<T> | null;
        if (result.status >= 200 && result.status < 300 && !envelope?.error) {
          await this.persistWinningBaseUrl(baseUrl);
          return (envelope?.data ?? result.payload) as T;
        }

        lastFailure = result;
        if (!RETRYABLE_STATUSES.has(result.status)) {
          const message =
            envelope?.error?.message ||
            (typeof result.payload?.message === "string"
              ? result.payload.message
              : "") ||
            result.rawText ||
            `Errore ${result.status}`;
          throw new Error(message);
        }
      }
    }

    const envelope = lastFailure?.payload as ApiEnvelope<T> | null;
    throw new Error(
      envelope?.error?.message ||
        (typeof lastFailure?.payload?.message === "string"
          ? lastFailure.payload.message
          : "") ||
        lastFailure?.rawText ||
        "Backend EasyGame temporaneamente non disponibile.",
    );
  }

  private async fetchAuthPayload(
    path: string,
    body: Record<string, any>,
  ): Promise<{
    status: number;
    payload: ApiEnvelope<AuthResponseData> | null;
    retryAfter: string | null;
  }> {
    await this.ensureInit();

    if (!this.baseUrl) {
      throw new Error("Backend EasyGame non configurato.");
    }

    let lastResult: {
      status: number;
      payload: ApiEnvelope<AuthResponseData> | null;
      retryAfter: string | null;
    } = {
      status: 503,
      payload: null,
      retryAfter: null,
    };

    for (const baseUrl of this.getCandidateBaseUrls()) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const result = await this.performJsonRequest(baseUrl, path, {
          method: "POST",
          body,
        });

        const payload = result.payload as ApiEnvelope<AuthResponseData> | null;
        lastResult = {
          status: result.status,
          payload,
          retryAfter: result.retryAfter ?? null,
        };

        /*
          **Un payload analizzabile e una risposta vera, qualunque sia lo
          status.** Le rotte di autenticazione rispondono sempre con un corpo
          — successo (200/202), credenziali sbagliate (401), verifica
          richiesta (403), codice non valido (400) o limite di frequenza
          (429) — e ritentare una di queste non la trasforma in un'altra:
          consuma solo altro budget del limitatore, o ritarda il countdown
          che l'utente deve vedere. Si ritenta **solo** quando il backend non
          ha risposto affatto (timeout, connessione rifiutata): li il corpo
          e sempre `null`.
        */
        if (payload !== null || !RETRYABLE_STATUSES.has(result.status)) {
          await this.persistWinningBaseUrl(baseUrl);
          return lastResult;
        }
      }
    }

    return lastResult;
  }

  private async hydrateSession(data: AuthResponseData | null | undefined) {
    if (!data?.session?.access_token || !data?.user) {
      return null;
    }

    const mappedUser = mapAuthUser(data.user);
    await this.setAuthToken(data.session.access_token);
    await this.setStoredUser(mappedUser);

    return {
      user: mappedUser,
      session: data.session,
    };
  }

  /**
   * Da una risposta di `/api/v1/auth/**` a un esito che la UI sa disegnare.
   *
   * **Nessun codice di anteprima entra in questo percorso.** `emailPreviewCode`
   * e `phonePreviewCode` esistono nella risposta **solo** fuori produzione
   * (`AUTH_ALLOW_TEST_CODES=true`, mai in produzione — vedi
   * `shouldExposeVerificationPreviewCode` lato server): confermarli qui al
   * posto dell'utente renderebbe la registrazione funzionante **solo** contro
   * un backend di test, e in produzione la schermata di verifica resterebbe
   * irraggiungibile — cio che questo metodo sostituisce. L'unico uso lecito
   * di un codice di anteprima e come comodita per chi sviluppa: precompilare
   * il campo OTP nella schermata, mai spedirlo al posto della persona.
   */
  private async resolveAuthOutcome(
    status: number,
    payload: ApiEnvelope<AuthResponseData> | null,
    retryAfter: string | null,
  ): Promise<AuthOutcome> {
    const outcome = interpretAuthResponse({
      status,
      data: payload?.data ?? null,
      error: payload?.error ?? null,
      retryAfterHeader: retryAfter,
    });

    if (outcome.kind !== "authenticated") {
      return outcome;
    }

    const hydrated = await this.hydrateSession(payload?.data ?? null);
    if (!hydrated) {
      return {
        kind: "error",
        message: "Sessione non valida restituita dal backend.",
      };
    }

    return {
      kind: "authenticated",
      user: hydrated.user,
      session: hydrated.session,
    };
  }

  /** Stesso backend, stessa identita, stessa sessione della Web App. */
  async login(email: string, password: string): Promise<AuthOutcome> {
    const { status, payload, retryAfter } = await this.fetchAuthPayload(
      `${API_PREFIX}/auth/login`,
      {
        email: email.trim().toLowerCase(),
        password,
      },
    );

    return this.resolveAuthOutcome(status, payload, retryAfter);
  }

  /**
   * Crea l'account con lo stesso endpoint della Web App
   * (`POST /api/v1/auth/register`). La rotta risponde sempre `202` con
   * `session: null`: non nasce mai una sessione qui, solo un riferimento di
   * verifica e l'invio del codice via email (e via SMS se l'installazione lo
   * richiede). Il codice risultante e quindi sempre `verification_required`
   * a meno di un errore — non un `201` come si controllava prima, che
   * classificava come fallita **ogni** registrazione riuscita.
   */
  async register(input: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  }): Promise<AuthOutcome> {
    const { status, payload, retryAfter } = await this.fetchAuthPayload(
      `${API_PREFIX}/auth/register`,
      {
        email: input.email.trim().toLowerCase(),
        password: input.password,
        userData: {
          firstName: String(input.firstName || "").trim(),
          lastName: String(input.lastName || "").trim(),
          phone: String(input.phone || "").trim(),
        },
      },
    );

    return this.resolveAuthOutcome(status, payload, retryAfter);
  }

  async sendEmailVerification(userId: string): Promise<ResendOutcome> {
    const { status, payload, retryAfter } = await this.fetchAuthPayload(
      `${API_PREFIX}/auth/verify/email/send`,
      { userId },
    );
    return interpretAckResponse({
      status,
      data: payload?.data as { sent?: boolean; message?: string } | null,
      error: payload?.error ?? null,
      retryAfterHeader: retryAfter,
    });
  }

  async confirmEmailVerification(
    userId: string,
    code: string,
  ): Promise<AuthOutcome> {
    const { status, payload, retryAfter } = await this.fetchAuthPayload(
      `${API_PREFIX}/auth/verify/email/confirm`,
      { userId, code },
    );
    return this.resolveAuthOutcome(status, payload, retryAfter);
  }

  async sendPhoneVerification(userId: string): Promise<ResendOutcome> {
    const { status, payload, retryAfter } = await this.fetchAuthPayload(
      `${API_PREFIX}/auth/verify/phone/send`,
      { userId },
    );
    return interpretAckResponse({
      status,
      data: payload?.data as { sent?: boolean; message?: string } | null,
      error: payload?.error ?? null,
      retryAfterHeader: retryAfter,
    });
  }

  async confirmPhoneVerification(
    userId: string,
    code: string,
  ): Promise<AuthOutcome> {
    const { status, payload, retryAfter } = await this.fetchAuthPayload(
      `${API_PREFIX}/auth/verify/phone/confirm`,
      { userId, code },
    );
    return this.resolveAuthOutcome(status, payload, retryAfter);
  }

  /**
   * Avvia il reset password con lo stesso endpoint della Web App
   * (`POST /api/v1/auth/password/forgot`). Risponde sempre allo stesso modo,
   * esista o no l'account: non c'e niente da distinguere qui. Il
   * completamento (`/api/v1/auth/password/reset`) richiede l'identificativo
   * e il token che solo il link ricevuto via email porta — vedi il gap
   * documentato nel report di questo WP.
   */
  async forgotPassword(email: string): Promise<ResendOutcome> {
    const { status, payload, retryAfter } = await this.fetchAuthPayload(
      `${API_PREFIX}/auth/password/forgot`,
      { email: email.trim().toLowerCase() },
    );
    return interpretAckResponse({
      status,
      data: payload?.data as { sent?: boolean; message?: string } | null,
      error: payload?.error ?? null,
      retryAfterHeader: retryAfter,
    });
  }

  /**
   * Completa il reset con lo stesso endpoint della Web App
   * (`POST /api/v1/auth/password/reset`) — stesso `userId`/`token` che il
   * link porta, stessa regola sulla password, stessa revoca di tutte le
   * sessioni al successo. Nessuna logica di dominio duplicata qui: il
   * server decide, questo metodo si limita a classificare la risposta
   * (`interpretPasswordResetResponse`).
   */
  async resetPassword(
    userId: string,
    token: string,
    password: string,
  ): Promise<PasswordResetOutcome> {
    const { status, payload, retryAfter } = await this.fetchAuthPayload(
      `${API_PREFIX}/auth/password/reset`,
      { userId, token, password },
    );
    return interpretPasswordResetResponse({
      status,
      data: payload?.data as {
        reset?: boolean;
        message?: string | null;
      } | null,
      error: payload?.error ?? null,
      retryAfterHeader: retryAfter,
    });
  }

  /**
   * Registra o rinnova il token push del dispositivo
   * (`POST /api/v1/auth/device-tokens`, WP11). Al meglio: un fallimento di
   * rete non deve mai bloccare l'uso dell'app, solo lasciare il dispositivo
   * senza notifiche fino al prossimo tentativo (a ogni avvio, o quando
   * `expo-notifications` riporta un token diverso).
   */
  async registerDeviceToken(
    token: string,
    platform: "ios" | "android",
  ): Promise<boolean> {
    try {
      await this.request(`${API_PREFIX}/auth/device-tokens`, {
        method: "POST",
        body: { token, platform },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Revoca esplicita, senza fare logout (l'utente disattiva le notifiche
   * dall'app). Il logout revoca gia da solo i token della propria sessione
   * lato server — vedi `/api/v1/auth/logout`.
   */
  async revokeDeviceToken(token: string): Promise<boolean> {
    try {
      await this.request(`${API_PREFIX}/auth/device-tokens`, {
        method: "DELETE",
        body: { token },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Esce, e **revoca la sessione sul server**.
   *
   * Prima cancellava soltanto il token dal dispositivo: la riga in `sessions`
   * restava viva per i suoi quattordici giorni. Un token copiato prima
   * dell'uscita — da un backup, da un telefono restituito o smarrito, da un
   * estratto MDM — continuava quindi a valere, e «esci» non era una revoca ma
   * un gesto locale. Ed e proprio la cosa che si fa quando si perde il
   * telefono.
   *
   * La chiamata e **al meglio**: se la rete non c'e, l'uscita locale deve
   * avvenire lo stesso, perche lasciare l'utente dentro sarebbe peggio. Il
   * server, dal canto suo, fa scadere la sessione da solo.
   */
  async logout() {
    await this.ensureInit();

    try {
      await this.request(`${API_PREFIX}/auth/logout`, { method: "POST" });
    } catch {
      // Senza rete la sessione scadra da sola: l'uscita locale non si blocca.
    }

    await this.setAuthToken(null);
    await this.setStoredUser(null);
  }

  async fetchCurrentUser() {
    const data = await this.request<{ user: any }>(`${API_PREFIX}/auth/user`);
    const mappedUser = data?.user ? mapAuthUser(data.user) : null;
    await this.setStoredUser(mappedUser);
    return mappedUser;
  }

  async updateCurrentUser(input: {
    email?: string;
    password?: string;
    data?: Record<string, any>;
  }) {
    const data = await this.request<{ user: any }>(`${API_PREFIX}/auth/user`, {
      method: "PATCH",
      body: input,
    });
    const mappedUser = data?.user ? mapAuthUser(data.user) : null;
    await this.setStoredUser(mappedUser);
    return mappedUser;
  }

  async getMemberships() {
    return this.request<MembershipRecord[]>(`${API_PREFIX}/auth/memberships`);
  }

  async activateMembership(
    organizationId: string,
    options: {
      role?: string;
      membershipId?: string;
      accessKind?: "membership" | "ownership";
    } = {},
  ) {
    return this.request<MembershipRecord>(
      `${API_PREFIX}/auth/memberships/activate`,
      {
        method: "POST",
        body: {
          organization_id: organizationId,
          role: options.role,
          membership_id: options.membershipId,
          access_kind: options.accessKind,
        },
      },
    );
  }

  async redeemAccessToken(token: string) {
    return this.request<{ membership: MembershipRecord }>(
      `${API_PREFIX}/auth/access/redeem`,
      {
        method: "POST",
        body: {
          token,
        },
      },
    );
  }

  async listResource<T>(
    resource: string,
    options: {
      clubId?: string | null;
      query?: Record<string, string | number | boolean | null | undefined>;
    } = {},
  ) {
    return this.request<T[]>(`${API_PREFIX}/${resource}`, {
      method: "GET",
      clubId: options.clubId,
      query: options.query,
    });
  }

  async getResourceById<T>(
    resource: string,
    id: string,
    clubId?: string | null,
  ) {
    return this.request<T>(
      `${API_PREFIX}/${resource}/${encodeURIComponent(id)}`,
      {
        method: "GET",
        clubId,
      },
    );
  }

  async createResource<T>(
    resource: string,
    data: Record<string, any>,
    options: {
      clubId?: string | null;
      mode?: "create" | "upsert";
    } = {},
  ) {
    return this.request<T>(`${API_PREFIX}/${resource}`, {
      method: "POST",
      clubId: options.clubId,
      body: {
        mode: options.mode || "create",
        data,
      },
    });
  }

  async updateResource<T>(
    resource: string,
    id: string,
    data: Record<string, any>,
    clubId?: string | null,
  ) {
    return this.request<T>(
      `${API_PREFIX}/${resource}/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        clubId,
        body: {
          data,
        },
      },
    );
  }

  /** La bacheca di chi guarda — `GET /api/v1/announcements?mine=1`, sola lettura. */
  async getMyAnnouncements(clubId?: string | null): Promise<Announcement[]> {
    return this.request<Announcement[]>(`${API_PREFIX}/announcements`, {
      method: "GET",
      clubId,
      query: { mine: 1 },
    });
  }

  /**
   * I propri appuntamenti — `GET /api/v1/appointments`, mai un filtro `?assigned_to=`:
   * per chi ha solo `appointments.read_own` il server impone
   * `assigned_to_user_id = <chi chiede>` prima di qualunque parametro
   * (`src/lib/server/appointments.ts`). Passarne uno qui non allargherebbe
   * niente, e scriverlo suggerirebbe il contrario.
   */
  async getMyAppointments(clubId?: string | null): Promise<ClubAppointment[]> {
    return this.request<ClubAppointment[]>(`${API_PREFIX}/appointments`, {
      method: "GET",
      clubId,
    });
  }

  /**
   * Una transizione della macchina a stati degli appuntamenti — stesso
   * contratto del Web (`src/app/api/v1/appointments/[id]/route.ts`): l'azione
   * sta nel corpo, non nell'URL, e il dominio traduce lo stato di arrivo.
   */
  async updateAppointment(
    id: string,
    action: "confirm" | "reject" | "reschedule" | "cancel",
    payload: Record<string, any> = {},
    clubId?: string | null,
  ): Promise<ClubAppointment> {
    return this.request<ClubAppointment>(
      `${API_PREFIX}/appointments/${encodeURIComponent(id)}`,
      {
        method: "POST",
        clubId,
        body: { data: { action, ...payload } },
      },
    );
  }

  /**
   * I propri compensi — `GET /api/v1/sport-work/me`. `null` e l'esito
   * ordinario di un allenatore che il club non ha ancora inserito nel
   * registro del lavoro sportivo, non un errore.
   */
  async getMyCompensation(
    options: { year?: number; clubId?: string | null } = {},
  ): Promise<OwnCompensationStatement | null> {
    return this.request<OwnCompensationStatement | null>(
      `${API_PREFIX}/sport-work/me`,
      {
        method: "GET",
        clubId: options.clubId,
        query: options.year ? { year: options.year } : undefined,
      },
    );
  }

  /**
   * I figli collegati alla propria identita — `GET /api/v1/family/children`
   * (`listParentChildren`). Nessun `clubId`: e la stessa identita in tutti i
   * club, non uno scope di club da passare.
   */
  async getFamilyChildren(): Promise<ParentChild[]> {
    return this.request<ParentChild[]>(`${API_PREFIX}/family/children`, {
      method: "GET",
    });
  }

  /**
   * Il cruscotto aggregato di un figlio — `GET /api/parent-dashboard/[athleteId]`
   * (`getParentDashboardData`). Fuori da `API_PREFIX` di proposito: non e
   * sotto `/api/v1`, e lo stesso path che il Web usa da `/parent-view/[id]`.
   * Nessun `clubId`/header di club attivo: il server deriva l'organization
   * dall'atleta nel path, non da un contesto club lato client (vedi
   * `ParentContext`).
   */
  async getParentDashboard(athleteId: string): Promise<ParentDashboardData> {
    return this.request<ParentDashboardData>(
      `/api/parent-dashboard/${encodeURIComponent(athleteId)}`,
      { method: "GET" },
    );
  }

  /**
   * Gli inviti RSVP di un figlio (allenamenti e gare insieme) —
   * `GET /api/v1/rsvp?athlete_id=...` (`readAthleteRsvpInvitations`).
   */
  async getAthleteRsvpInvitations(
    athleteId: string,
  ): Promise<RsvpInvitation[]> {
    const result = await this.request<{ invitations: RsvpInvitation[] }>(
      `${API_PREFIX}/rsvp`,
      { method: "GET", query: { athlete_id: athleteId } },
    );
    return result.invitations;
  }

  /**
   * La risposta della famiglia a un invito — `POST /api/v1/rsvp`
   * (`answerRsvp`). Idempotente: rispondere di nuovo e la stessa
   * operazione di rispondere la prima volta, mai un endpoint separato per
   * "cambiare risposta". Nessun `organization_id`: il server lo verifica
   * sempre contro quello reale dell'atleta, non lo usa mai per filtrare —
   * passarlo dal client non allargherebbe niente.
   */
  async answerRsvp(input: {
    athleteId: string;
    trainingId: string;
    status: "yes" | "no";
    note?: string;
  }): Promise<RsvpAnswerResult> {
    return this.request<RsvpAnswerResult>(`${API_PREFIX}/rsvp`, {
      method: "POST",
      body: {
        athlete_id: input.athleteId,
        training_id: input.trainingId,
        status: input.status,
        note: input.note,
      },
    });
  }

  /**
   * La bacheca di un figlio, sola lettura — `GET /api/parent-dashboard/
   * [athleteId]/board` (`readAnnouncementsForUser`). Stessa forma di
   * `Announcement` gia usata dalla bacheca Trainer: e lo stesso dominio
   * annunci, letto da un punto di vista diverso.
   */
  async getParentBoard(athleteId: string): Promise<Announcement[]> {
    return this.request<Announcement[]>(
      `/api/parent-dashboard/${encodeURIComponent(athleteId)}/board`,
      { method: "GET" },
    );
  }

  /** Segna letta una singola consegna (`deliveryId`), non l'annuncio — un fratello nello stesso club ha una propria consegna. */
  async markParentBoardRead(
    athleteId: string,
    deliveryId: string,
  ): Promise<unknown> {
    return this.request(
      `/api/parent-dashboard/${encodeURIComponent(athleteId)}/board`,
      { method: "POST", body: { deliveryId } },
    );
  }

  /**
   * Segna lette una o tutte le notifiche di un figlio — `PATCH
   * /api/parent-dashboard/[athleteId]/notifications`. Le notifiche stesse
   * non hanno un GET dedicato: arrivano dentro il payload aggregato
   * (`getParentDashboard().notifications`).
   */
  async markParentNotificationsRead(
    athleteId: string,
    input: { id?: string; all?: boolean },
  ): Promise<{ updated: number }> {
    return this.request<{ updated: number }>(
      `/api/parent-dashboard/${encodeURIComponent(athleteId)}/notifications`,
      { method: "PATCH", body: input },
    );
  }

  /**
   * Avvia il pagamento di una rata — `POST /api/parent-dashboard/
   * [athleteId]/checkout` (`issuePaymentLink`). L'`url` risposto e una
   * pagina EasyGame pubblica (`/pay/<token>`), non gia una sessione Stripe
   * hosted: quella pagina fa una seconda chiamata lato client per aprirla.
   * Il mobile la apre nel browser di sistema (`WebBrowser.openBrowserAsync`,
   * gia dipendenza del progetto) — nessuna WebView, nessun deep link: dopo
   * il pagamento la pagina reindirizza su se stessa, non verso l'app.
   */
  async checkoutParentPayment(
    athleteId: string,
    paymentId: string,
  ): Promise<{ url: string; expiresAt: string }> {
    return this.request<{ url: string; expiresAt: string }>(
      `/api/parent-dashboard/${encodeURIComponent(athleteId)}/checkout`,
      { method: "POST", body: { payment_id: paymentId } },
    );
  }

  /**
   * Risolve URL assoluto e header di autorizzazione per un download
   * autenticato (documenti, ricevute) — usato da `expo-file-system`, che ha
   * bisogno dell'URL e degli header separatamente, non di questo client
   * JSON. Non e un URL condivisibile: senza l'header Bearer il server
   * risponde 401.
   */
  async resolveAuthorizedFileTarget(
    path: string,
    query?: Record<string, string | number | boolean | null | undefined>,
  ): Promise<{ url: string; headers: Record<string, string> }> {
    await this.ensureInit();
    if (!this.baseUrl) {
      throw new Error("Configura prima l'URL del backend EasyGame.");
    }

    const url = new URL(path, this.baseUrl);
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        url.searchParams.set(key, String(value));
      });
    }

    const headers: Record<string, string> = {};
    if (this.authToken) {
      headers.Authorization = `Bearer ${this.authToken}`;
    }

    return { url: url.toString(), headers };
  }

  /**
   * Il fascicolo documentale di un figlio — `data.documents.required`/
   * `.uploaded` del cruscotto aggregato sono la fonte reale (la Web app usa
   * quella, non `GET .../documents`, che e legacy/inutilizzata — vedi KB).
   * Qui restano solo upload e download, che non sono nel payload aggregato.
   */
  async uploadParentDocument(
    athleteId: string,
    file: { uri: string; name: string; mimeType: string },
    options: { requestId?: string; documentKind?: string } = {},
  ): Promise<FamilyDocumentItem> {
    const formData = new FormData();
    formData.append("file", {
      uri: file.uri,
      name: file.name,
      type: file.mimeType,
    } as unknown as Blob);
    if (options.requestId) formData.append("templateId", options.requestId);
    if (options.documentKind)
      formData.append("documentType", options.documentKind);

    return this.request<FamilyDocumentItem>(
      `/api/parent-dashboard/${encodeURIComponent(athleteId)}/documents`,
      { method: "POST", formData },
    );
  }

  /** Gli inviti/stati di consenso di un figlio — `GET .../consents` (`listConsentStates`). Una riga per ogni definizione attiva del club, anche mai decisa (`status: "missing"`). */
  async getParentConsents(athleteId: string): Promise<ConsentSubjectState[]> {
    return this.request<ConsentSubjectState[]>(
      `/api/parent-dashboard/${encodeURIComponent(athleteId)}/consents`,
      { method: "GET" },
    );
  }

  /**
   * Una decisione di consenso — `POST .../consents`. Il server resta
   * l'unico a decidere se la transizione e ammessa (matrice in
   * `src/lib/consents/model.ts`): una transizione non ammessa risponde 400,
   * mai silenziosamente accettata.
   */
  async answerParentConsent(
    athleteId: string,
    input: {
      definitionId: string;
      status: "accepted" | "rejected" | "revoked";
      note?: string;
    },
  ): Promise<{ record: ConsentRecordSummary; state: ConsentSubjectState }> {
    return this.request<{
      record: ConsentRecordSummary;
      state: ConsentSubjectState;
    }>(`/api/parent-dashboard/${encodeURIComponent(athleteId)}/consents`, {
      method: "POST",
      body: input,
    });
  }

  /**
   * Richiede un nuovo appuntamento — `POST .../appointments`. `reason` o
   * `typeId` (uno dei due, mai entrambi obbligatori: se il club ha
   * configurato dei tipi il motivo lo scrive il dominio dal nome del
   * tipo). Lo slot si passa per id (`slotId`) quando la famiglia ne
   * sceglie uno dall'elenco, altrimenti data/ora libere.
   */
  async requestParentAppointment(
    athleteId: string,
    input: {
      reason?: string;
      typeId?: string;
      startsAt?: string;
      date?: string;
      time?: string;
      siteId?: string;
      slotId?: string;
      notes?: string;
    },
  ): Promise<ParentAppointment> {
    return this.request<ParentAppointment>(
      `/api/parent-dashboard/${encodeURIComponent(athleteId)}/appointments`,
      {
        method: "POST",
        body: {
          reason: input.reason,
          type_id: input.typeId,
          starts_at: input.startsAt,
          date: input.date,
          time: input.time,
          site_id: input.siteId,
          slot_id: input.slotId,
          notes: input.notes,
        },
      },
    );
  }

  /**
   * Propone una riprogrammazione — `PATCH .../appointments`. Ammessa solo
   * finche l'appuntamento e ancora "in richiesta" (`can_reschedule`): il
   * dominio nega il resto, questo client non lo ricontrolla due volte.
   */
  async rescheduleParentAppointment(
    athleteId: string,
    appointmentId: string,
    input: {
      date?: string;
      time?: string;
      siteId?: string;
      slotId?: string;
      notes?: string;
      version?: number;
    },
  ): Promise<ParentAppointment> {
    return this.request<ParentAppointment>(
      `/api/parent-dashboard/${encodeURIComponent(athleteId)}/appointments`,
      {
        method: "PATCH",
        body: {
          id: appointmentId,
          date: input.date,
          time: input.time,
          site_id: input.siteId,
          slot_id: input.slotId,
          notes: input.notes,
          version: input.version,
        },
      },
    );
  }

  /** Disdice una propria richiesta/appuntamento — `DELETE .../appointments`. Nessun motivo richiesto dal contratto reale quando e la famiglia a disdire. */
  async cancelParentAppointment(
    athleteId: string,
    appointmentId: string,
    version?: number,
  ): Promise<ParentAppointment> {
    return this.request<ParentAppointment>(
      `/api/parent-dashboard/${encodeURIComponent(athleteId)}/appointments`,
      { method: "DELETE", body: { id: appointmentId, version } },
    );
  }

  /**
   * Prenota una struttura — `POST .../structures`. Nessun annullamento
   * lato Parent: ne il dominio lo offre (solo `POST` esiste sotto questo
   * percorso), ne il Web lo permette — il mobile non inventa un'azione che
   * il server rifiuterebbe.
   */
  async bookParentStructure(
    athleteId: string,
    input: {
      structureId: string;
      fieldId: string;
      start: string;
      end: string;
      notes?: string;
    },
  ): Promise<ParentStructureBooking> {
    return this.request<ParentStructureBooking>(
      `/api/parent-dashboard/${encodeURIComponent(athleteId)}/structures`,
      { method: "POST", body: input },
    );
  }

  /**
   * Le pratiche di iscrizione/rinnovo del figlio — `GET /api/v1/family/
   * enrollment-requests?athlete_id=...` (`listFamilyEnrollmentRequests`).
   * Ognuna porta il proprio stato (`sent`/`in_review`/`approved`/
   * `rejected`), a differenza di `data.enrollment` che descrive
   * l'iscrizione nel suo complesso. Il rinnovo vero e proprio e un motore
   * di form dinamici (`FormField`) fuori perimetro di questo batch — qui
   * solo l'elenco in sola lettura, coerente con quanto la sezione mostra
   * gia sul Web senza un modulo.
   */
  async getParentEnrollmentRequests(
    athleteId: string,
  ): Promise<FamilyEnrollmentRequest[]> {
    return this.request<FamilyEnrollmentRequest[]>(
      `${API_PREFIX}/family/enrollment-requests`,
      { method: "GET", query: { athlete_id: athleteId } },
    );
  }
}

export const api = new EasyGameApiService();
