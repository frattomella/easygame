import { notifyUnauthorized } from "@/lib/auth/session-sync";

export type ApiEnvelope<T> = {
  data: T;
  error: null | {
    message: string;
    status?: number;
    code?: string;
    [key: string]: any;
  };
};

type ApiRequestOptions = Omit<RequestInit, "body"> & {
  body?: any;
};

/**
 * Endpoint che gestiscono da soli il ciclo di vita della sessione: un 401 qui
 * significa "credenziali errate" o "nessuna sessione", non "sessione scaduta
 * mentre navigavo", quindi non deve innescare il logout centralizzato.
 */
const SESSION_LIFECYCLE_PATHS = [
  "/api/v1/auth/login",
  "/api/v1/auth/register",
  "/api/v1/auth/logout",
  "/api/v1/auth/session",
  "/api/v1/auth/verify",
  "/api/v1/auth/oauth",
];

const isSessionLifecyclePath = (path: string) =>
  SESSION_LIFECYCLE_PATHS.some((lifecyclePath) =>
    path.startsWith(lifecyclePath),
  );

const readCachedUserId = () => {
  if (typeof window === "undefined") {
    return null;
  }

  const sources: Array<[Storage, string]> = [
    [window.localStorage, "easygame.api-session.v1"],
    [window.sessionStorage, "supabase_session"],
  ];

  for (const [storage, key] of sources) {
    const rawSession = storage.getItem(key);
    if (!rawSession) {
      continue;
    }

    try {
      const session = JSON.parse(rawSession);
      const userId = session?.user?.id;
      if (typeof userId === "string" && userId.trim()) {
        return userId;
      }
    } catch {
      storage.removeItem(key);
    }
  }

  return null;
};

/**
 * Club attivo memorizzato dal browser.
 *
 * Esportato perche e gia la fonte da cui `apiRequest` costruisce gli header di
 * contesto: chi ha bisogno del club o della stagione attiva deve leggere da
 * qui, non reimplementare la lettura da `localStorage`.
 */
export const readStoredActiveClub = () => {
  if (typeof window === "undefined") {
    return null;
  }

  const cachedUserId = readCachedUserId();
  const candidateKeys = cachedUserId
    ? [`activeClub_${cachedUserId}`, "activeClub"]
    : ["activeClub"];

  for (const key of candidateKeys) {
    const rawActiveClub = window.localStorage.getItem(key);
    if (!rawActiveClub) {
      continue;
    }

    try {
      const activeClub = JSON.parse(rawActiveClub);
      if (activeClub?.id) {
        return activeClub;
      }
    } catch {
      window.localStorage.removeItem(key);
    }
  }

  return null;
};

export async function apiRequest<T = any>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<ApiEnvelope<T>> {
  try {
    const headers = new Headers(options.headers || {});
    const hasJsonBody =
      options.body !== undefined &&
      options.body !== null &&
      !(options.body instanceof FormData);

    if (hasJsonBody && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    if (typeof window !== "undefined" && !headers.has("x-active-club-id")) {
      const activeClub = readStoredActiveClub();
      if (activeClub?.id) {
        headers.set("x-active-club-id", String(activeClub.id));
      }

      if (activeClub?.role && !headers.has("x-active-access-role")) {
        headers.set("x-active-access-role", String(activeClub.role));
      }

      if (activeClub?.activeSeasonId && !headers.has("x-active-season-id")) {
        headers.set("x-active-season-id", String(activeClub.activeSeasonId));
      }
    }

    const response = await fetch(path, {
      ...options,
      credentials: "include",
      headers,
      body: hasJsonBody ? JSON.stringify(options.body) : options.body,
    });

    const payload = await response
      .json()
      .catch(() => ({ data: null, error: { message: response.statusText } }));

    if (response.status === 401 && !isSessionLifecyclePath(path)) {
      // Il server è l'unica fonte autorevole della sessione: se rifiuta la
      // richiesta la cache client è stale e va invalidata subito.
      notifyUnauthorized();
    }

    if (!response.ok && !payload?.error) {
      return {
        data: payload?.data ?? null,
        error: {
          message: response.statusText || "API request failed",
          status: response.status,
        },
      };
    }

    return {
      data: payload?.data ?? null,
      error: payload?.error
        ? { ...payload.error, status: response.status }
        : null,
    };
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return {
        data: null as T,
        error: {
          message: "Richiesta annullata",
          code: "REQUEST_ABORTED",
        },
      };
    }

    // Errore di trasporto: non possiamo dedurre nulla sulla sessione.
    return {
      data: null as T,
      error: {
        message: error?.message || "Errore di rete",
        code: "NETWORK_ERROR",
      },
    };
  }
}
