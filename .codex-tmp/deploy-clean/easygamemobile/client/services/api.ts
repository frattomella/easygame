import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

const KEYS = {
  BASE_URL: "easygame_base_url",
  AUTH_TOKEN: "easygame_auth_token",
  USER: "easygame_user",
} as const;

const API_PREFIX = "/api/v1";
const REQUEST_TIMEOUT_MS = 6000;
const RETRYABLE_STATUSES = new Set([408, 429, 502, 503, 504]);
const STATIC_FALLBACK_BASE_URLS = [
  "https://easygame-staging.vercel.app",
];

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

const isEphemeralTunnelUrl = (value: string | null | undefined) => {
  const normalized = normalizeBaseUrl(value || "");
  if (!normalized) {
    return false;
  }

  try {
    const { hostname } = new URL(normalized);
    return (
      hostname.endsWith(".lhr.life") ||
      hostname.endsWith(".localhost.run") ||
      hostname === "localhost.run" ||
      hostname.endsWith(".loca.lt")
    );
  } catch {
    return false;
  }
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
    email: String(rawUser?.email || "").trim().toLowerCase(),
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
        [
          this.baseUrl,
          this.getConfiguredBaseUrl(),
          ...STATIC_FALLBACK_BASE_URLS,
        ]
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
      clubId?: string | null;
      query?: Record<string, string | number | boolean | null | undefined>;
      headers?: HeadersInit;
    },
  ) {
    const url = new URL(path, baseUrl);
    const { method, body, clubId, query, headers } = options;

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

    if (body !== undefined && body !== null) {
      requestHeaders["Content-Type"] = "application/json";
    }

    try {
      const response = await this.fetchWithTimeout(url.toString(), {
        method,
        headers: requestHeaders,
        body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
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
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return {
          status: 504,
          payload: null,
          rawText: "Timeout backend EasyGame",
        };
      }

      return {
        status: 503,
        payload: null,
        rawText:
          error instanceof Error
            ? `Errore di connessione: ${error.message}`
            : "Errore di connessione al backend EasyGame.",
      };
    }
  }

  private async request<T>(
    path: string,
    options: {
      method?: "GET" | "POST" | "PATCH" | "DELETE";
      body?: Record<string, any> | null;
      clubId?: string | null;
      query?: Record<string, string | number | boolean | null | undefined>;
      headers?: HeadersInit;
    } = {},
  ): Promise<T> {
    await this.ensureInit();

    if (!this.baseUrl) {
      throw new Error("Configura prima l'URL del backend EasyGame.");
    }
    let lastFailure: { status: number; payload: any; rawText: string } | null = null;

    for (const baseUrl of this.getCandidateBaseUrls()) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const result = await this.performJsonRequest(baseUrl, path, {
          method: options.method || "GET",
          body: options.body,
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
  }> {
    await this.ensureInit();

    if (!this.baseUrl) {
      throw new Error("Backend EasyGame non configurato.");
    }

    let lastResult: { status: number; payload: ApiEnvelope<AuthResponseData> | null } = {
      status: 503,
      payload: null,
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
        };

        if (result.status === 200 || result.status === 403) {
          await this.persistWinningBaseUrl(baseUrl);
          return lastResult;
        }

        if (!RETRYABLE_STATUSES.has(result.status)) {
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
      verification: data.verification || null,
    };
  }

  private async confirmEmailVerification(userId: string, code: string) {
    return this.request<AuthResponseData>(`${API_PREFIX}/auth/verify/email/confirm`, {
      method: "POST",
      body: { userId, code },
    });
  }

  private async confirmPhoneVerification(userId: string, code: string) {
    return this.request<AuthResponseData>(`${API_PREFIX}/auth/verify/phone/confirm`, {
      method: "POST",
      body: { userId, code },
    });
  }

  private async finalizeVerification(data: AuthResponseData) {
    let current = data;

    if (current.verification?.emailRequired && current.verification?.emailPreviewCode) {
      current =
        (await this.confirmEmailVerification(
          current.verification.userId,
          current.verification.emailPreviewCode,
        )) || current;
    }

    if (current.session?.access_token) {
      return this.hydrateSession(current);
    }

    if (current.verification?.phoneRequired && current.verification?.phonePreviewCode) {
      current =
        (await this.confirmPhoneVerification(
          current.verification.userId,
          current.verification.phonePreviewCode,
        )) || current;
    }

    return this.hydrateSession(current);
  }

  async login(email: string, password: string) {
    const { status, payload } = await this.fetchAuthPayload(
      `${API_PREFIX}/auth/login`,
      {
        email: email.trim().toLowerCase(),
        password,
      },
    );

    if (status === 200 && payload?.data) {
      const hydrated = await this.hydrateSession(payload.data);
      if (hydrated) {
        return hydrated;
      }
    }

    if (status === 403 && payload?.data?.verification) {
      const finalized = await this.finalizeVerification(payload.data);
      if (finalized) {
        return finalized;
      }

      throw new Error(
        payload?.error?.message ||
          "Completa la verifica del tuo account per accedere.",
      );
    }

    throw new Error(
      payload?.error?.message ||
        (status
          ? `Risposta backend non valida durante il login (HTTP ${status}).`
          : "Sessione non valida restituita dal backend."),
    );
  }

  async registerAccount(input: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  }) {
    const { status, payload } = await this.fetchAuthPayload(
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

    if (status !== 201 || !payload?.data) {
      throw new Error(payload?.error?.message || "Errore durante la registrazione");
    }

    const finalized = await this.finalizeVerification(payload.data);
    if (finalized) {
      return finalized;
    }

    return {
      user: payload.data.user ? mapAuthUser(payload.data.user) : null,
      session: payload.data.session,
      verification: payload.data.verification || null,
    };
  }

  async logout() {
    await this.ensureInit();
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

  async activateMembership(organizationId: string) {
    return this.request<MembershipRecord>(`${API_PREFIX}/auth/memberships/activate`, {
      method: "POST",
      body: {
        organization_id: organizationId,
      },
    });
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
    return this.request<T>(`${API_PREFIX}/${resource}/${encodeURIComponent(id)}`, {
      method: "GET",
      clubId,
    });
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
    return this.request<T>(`${API_PREFIX}/${resource}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      clubId,
      body: {
        data,
      },
    });
  }
}

export const api = new EasyGameApiService();
