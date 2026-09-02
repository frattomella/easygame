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

/**
 * La sessione **senza le credenziali**, per cio che il browser conserva.
 *
 * Il cookie di sessione e `httpOnly`: uno script della pagina non lo legge. Le
 * cache client ne tenevano pero una copia in chiaro — `localStorage` da una
 * parte, `sessionStorage` dall'altra — e quella copia annullava la difesa: a
 * uno script ostile non serviva rubare un cookie, bastava un `getItem` e poi
 * `Authorization: Bearer`, con una credenziale viva quattordici giorni.
 *
 * Il primo rimedio l'aveva tolta da **una** delle due cache, e il commento che
 * lo accompagnava diceva che non ne restava nessuna. Non era vero: una
 * revisione ostile ha trovato la seconda a duecento righe di distanza. Per
 * questo la regola sta adesso qui, nel modulo che possiede gia le chiavi delle
 * cache — una funzione sola, che le due cache chiamano entrambe.
 *
 * Togliere i due campi non costa niente: di queste cache il client usa **solo**
 * `session.user`, per dipingere subito l'interfaccia, e ogni chiamata autentica
 * con il cookie.
 *
 * **Cosa resta, dichiarato.** Il gettone continua a uscire nel **corpo** della
 * risposta di login: e l'unica credenziale della app mobile, che lo rilegge e
 * lo manda come `Bearer`. Toglierlo dalla risposta e un cambio di contratto
 * fra i due alberi, con la sua migrazione. Cio che questa funzione ottiene e
 * che il gettone non **sopravviva** in nessun archivio del browser.
 */
export const sessionSenzaCredenziali = <T extends Record<string, unknown>>(
  session: T,
): Omit<T, "access_token" | "refresh_token"> => {
  const { access_token: _a, refresh_token: _r, ...resto } = session as T & {
    access_token?: unknown;
    refresh_token?: unknown;
  };
  return resto as Omit<T, "access_token" | "refresh_token">;
};

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
