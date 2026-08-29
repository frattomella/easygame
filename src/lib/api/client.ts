import { notifyUnauthorized } from "@/lib/auth/session-sync";

export type ListPageMeta = {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type ApiEnvelope<T> = {
  data: T;
  error: null | {
    message: string;
    status?: number;
    code?: string;
    [key: string]: any;
  };
  /**
   * Presente solo nelle risposte a una lista paginata (WP-12). Chi non chiede
   * una pagina non lo riceve, e non deve controllarlo.
   */
  meta?: ListPageMeta;
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

/**
 * Aggiorna la stagione attiva nello scaffale locale del club.
 *
 * Sta accanto a `readStoredActiveClub` per la stessa ragione: le chiavi
 * `activeClub` e `activeClub_<utente>` hanno **un** punto di scrittura. Chi
 * crea o attiva una stagione la chiama; senza, la barra in cima all'app
 * continua a mostrare la stagione che c'era al momento in cui il club e stato
 * aperto — e su un club appena creato quella stagione e `null`, cioe
 * «Nessuna stagione attiva» su un club che ce l'ha.
 */
export const rememberActiveSeason = (
  seasonId: string | null,
  seasonLabel: string | null,
  /**
   * Il club a cui la stagione appartiene. Sullo stesso browser possono
   * convivere piu account (`activeClub_<utente>`), e ognuno puo avere aperto
   * un club **diverso**: scrivere la stagione su tutti significherebbe
   * attribuire l'annata di una societa a un'altra. Omesso, aggiorna la voce
   * generica e quelle che gia puntano allo stesso club di quella.
   */
  clubId?: string | null,
) => {
  if (typeof window === "undefined") {
    return;
  }

  const keys: string[] = ["activeClub"];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && key.startsWith("activeClub_")) {
      keys.push(key);
    }
  }

  const target =
    String(clubId || "").trim() ||
    (() => {
      try {
        return String(
          JSON.parse(window.localStorage.getItem("activeClub") || "{}")?.id ||
            "",
        );
      } catch {
        return "";
      }
    })();

  let updated: Record<string, any> | null = null;

  for (const key of keys) {
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      if (!parsed?.id) continue;
      if (target && String(parsed.id) !== target) continue;
      updated = {
        ...parsed,
        activeSeasonId: seasonId,
        activeSeasonLabel: seasonLabel,
      };
      window.localStorage.setItem(key, JSON.stringify(updated));
    } catch {
      window.localStorage.removeItem(key);
    }
  }

  if (updated) {
    window.dispatchEvent(
      new CustomEvent("club-updated", { detail: { clubData: updated } }),
    );
  }
};

/**
 * Gli header di contesto: club attivo, ruolo attivo, stagione attiva.
 *
 * Estratti in una funzione perche il trasporto ha **due** porte — `apiRequest`
 * per il JSON e `apiDownload` per un file — e il contesto deve viaggiare
 * uguale su entrambe. Copiarlo nella seconda sarebbe il modo in cui, il giorno
 * in cui se ne aggiunge uno, una delle due resta indietro: e esattamente cio
 * che e successo alle due implementazioni del CSV.
 */
const withContextHeaders = (init?: HeadersInit) => {
  const headers = new Headers(init || {});

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

  return headers;
};

export async function apiRequest<T = any>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<ApiEnvelope<T>> {
  try {
    const headers = withContextHeaders(options.headers);
    const hasJsonBody =
      options.body !== undefined &&
      options.body !== null &&
      !(options.body instanceof FormData);

    if (hasJsonBody && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
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
      ...(payload?.meta ? { meta: payload.meta } : {}),
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

/**
 * Il nome del file proposto dal server, letto da `Content-Disposition`.
 *
 * Torna `null` se l'header non c'e o non porta un nome: chi chiama ne ha
 * comunque uno proprio, e un nome inventato dal server e sempre preferibile a
 * uno costruito nel browser, che non sa quali filtri il server ha applicato
 * davvero.
 */
const readAttachmentName = (disposition: string | null): string | null => {
  if (!disposition) return null;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const name = match?.[1]?.trim();
  if (!name) return null;
  /*
    Il nome arriva da fuori e finisce in un attributo `download`: si tiene solo
    l'ultimo segmento, cosi nessun `../` puo suggerire un percorso.
  */
  return decodeURIComponent(name).split(/[\\/]/).pop() || null;
};

/**
 * Una richiesta che risponde **un file di testo** invece di una busta JSON.
 *
 * Esiste per l'export contabile, e sta qui e non nella pagina per la regola
 * del repository: nessun `fetch` diretto verso `/api` da un componente. Il
 * contesto (club attivo, ruolo, stagione), le credenziali e la gestione del
 * 401 sono gli stessi di `apiRequest` — che e il punto: due porte con due
 * comportamenti diversi sulla sessione sono due comportamenti da tenere
 * allineati a mano.
 *
 * **L'errore resta JSON.** Quando il server nega o fallisce non risponde un
 * file: risponde la busta di sempre, e questa funzione ne restituisce il
 * messaggio invece di far scaricare un file che conterrebbe l'errore.
 */
export async function apiDownload(
  path: string,
  options: Omit<RequestInit, "body"> = {},
): Promise<ApiEnvelope<{ text: string; fileName: string | null }>> {
  try {
    const response = await fetch(path, {
      ...options,
      credentials: "include",
      headers: withContextHeaders(options.headers),
    });

    if (response.status === 401 && !isSessionLifecyclePath(path)) {
      notifyUnauthorized();
    }

    if (!response.ok) {
      const payload = await response
        .json()
        .catch(() => ({ error: { message: response.statusText } }));

      return {
        data: null as any,
        error: {
          message:
            payload?.error?.message || response.statusText || "Richiesta non riuscita",
          status: response.status,
        },
      };
    }

    return {
      data: {
        text: await response.text(),
        fileName: readAttachmentName(response.headers.get("content-disposition")),
      },
      error: null,
    };
  } catch (error: any) {
    return {
      data: null as any,
      error: {
        message: error?.message || "Errore di rete",
        code: "NETWORK_ERROR",
      },
    };
  }
}
