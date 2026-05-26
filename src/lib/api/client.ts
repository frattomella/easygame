export type ApiEnvelope<T> = {
  data: T;
  error: null | {
    message: string;
    [key: string]: any;
  };
};

type ApiRequestOptions = Omit<RequestInit, "body"> & {
  body?: any;
};

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

const readStoredActiveClub = () => {
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

    if (!response.ok && !payload?.error) {
      return {
        data: payload?.data ?? null,
        error: {
          message: response.statusText || "API request failed",
        },
      };
    }

    return {
      data: payload?.data ?? null,
      error: payload?.error ?? null,
    };
  } catch (error: any) {
    return {
      data: null as T,
      error: {
        message: error?.message || "Errore di rete",
      },
    };
  }
}
