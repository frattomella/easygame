/**
 * Punto unico di sincronizzazione tra la cache di sessione lato client e la
 * sessione autorevole lato server (cookie `easygame_session` + tabella Prisma
 * `Session`).
 *
 * Le cache client servono solo ad accelerare il rendering: non sono mai una
 * prova di autenticazione. Quando il server risponde 401 (oppure dichiara che
 * non esiste alcuna sessione valida) le cache devono essere invalidate qui.
 */

export const SESSION_CACHE_KEY = "easygame.api-session.v1";
export const LEGACY_SESSION_CACHE_KEY = "supabase_session";
export const LEGACY_SESSION_TIMESTAMP_KEY = "supabase_session_timestamp";

const isBrowser = () => typeof window !== "undefined";

const unauthorizedHandlers = new Set<() => void>();
let unauthorizedSignalPending = false;

/**
 * Rimuove ogni traccia locale della sessione: cache sessione, cache legacy e
 * club attivo (che non deve sopravvivere a un account non autenticato).
 */
export const clearClientAuthCache = () => {
  if (!isBrowser()) {
    return;
  }

  try {
    window.localStorage.removeItem(SESSION_CACHE_KEY);
    window.sessionStorage.removeItem(LEGACY_SESSION_CACHE_KEY);
    window.sessionStorage.removeItem(LEGACY_SESSION_TIMESTAMP_KEY);

    const staleKeys = Object.keys(window.localStorage).filter(
      (key) => key === "activeClub" || key.startsWith("activeClub_"),
    );
    staleKeys.forEach((key) => window.localStorage.removeItem(key));
    window.localStorage.removeItem("userClubs");
  } catch (error) {
    console.warn("Impossibile ripulire la cache di sessione:", error);
  }
};

export const registerUnauthorizedHandler = (handler: () => void) => {
  unauthorizedHandlers.add(handler);
  return () => {
    unauthorizedHandlers.delete(handler);
  };
};

/**
 * Segnala che il server ha rifiutato la sessione. Viene notificato una sola
 * volta finché non si osserva nuovamente una sessione valida, così richieste
 * parallele in 401 non generano logout/redirect a catena.
 */
export const notifyUnauthorized = () => {
  if (unauthorizedSignalPending) {
    return;
  }

  unauthorizedSignalPending = true;
  clearClientAuthCache();

  unauthorizedHandlers.forEach((handler) => {
    try {
      handler();
    } catch (error) {
      console.error("Errore nella gestione del 401:", error);
    }
  });
};

/** Da chiamare quando il server conferma una sessione valida. */
export const markSessionValidated = () => {
  unauthorizedSignalPending = false;
};

export const isUnauthorizedSignalPending = () => unauthorizedSignalPending;
