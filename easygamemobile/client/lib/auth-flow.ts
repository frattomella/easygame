/**
 * Interpretazione pura delle risposte di autenticazione EasyGame.
 *
 * Nessuna dipendenza da React Native, da Expo o da `fetch`: riceve status,
 * corpo ed eventuale intestazione `Retry-After` gia estratti dal chiamante, e
 * decide **una sola cosa** — quale stato deve mostrare la schermata. Le
 * regole di sicurezza (password, telefono obbligatorio, blocco OTP, ecc.)
 * restano sul server: questo modulo non le duplica, si limita a leggere cio
 * che il backend ha gia deciso.
 *
 * Stessi endpoint della Web App (`/api/v1/auth/**`): un account creato o
 * verificato da qui e lo stesso account, con la stessa sessione, che puo
 * accedere anche dalla Web App.
 */

export type VerificationChannel = "email" | "phone";

export interface VerificationInfo {
  userId: string;
  email?: string | null;
  phone?: string | null;
  emailRequired?: boolean;
  phoneRequired?: boolean;
}

export interface AuthSessionPayload {
  access_token: string;
}

export interface AuthenticatedOutcome {
  kind: "authenticated";
  user: unknown;
  session: AuthSessionPayload;
}

export interface VerificationRequiredOutcome {
  kind: "verification_required";
  channel: VerificationChannel;
  verification: VerificationInfo;
}

export interface RateLimitedOutcome {
  kind: "rate_limited";
  message: string;
  retryAfterSeconds: number | null;
}

export interface AuthErrorOutcome {
  kind: "error";
  message: string;
  code?: string;
}

export type AuthOutcome =
  | AuthenticatedOutcome
  | VerificationRequiredOutcome
  | RateLimitedOutcome
  | AuthErrorOutcome;

export interface AuthEnvelopeData {
  user?: unknown;
  session?: AuthSessionPayload | null;
  verification?: VerificationInfo | null;
}

export interface AuthEnvelopeError {
  message?: string | null;
  code?: string | null;
}

/**
 * Codici che il backend usa per dire "stai chiedendo troppo, aspetta".
 * `rate-limit-policy.ts` e `otp-policy.ts` ne restano l'unica fonte: qui si
 * riconoscono solo per smistare la risposta, non per deciderne il valore.
 */
const RATE_LIMIT_CODES = new Set(["RATE_LIMITED", "RESEND_TOO_SOON"]);

/**
 * Quale canale mostrare quando il backend ne chiede piu di uno.
 *
 * L'ordine e quello con cui l'account nasce: l'indirizzo email e sempre
 * obbligatorio, il telefono lo diventa solo se l'installazione lo richiede
 * (`isPhoneVerificationRequired` lato server). Se l'email e gia stata
 * confermata e resta solo il telefono, si passa a quello.
 */
export const pickVerificationChannel = (
  verification: VerificationInfo | null | undefined,
): VerificationChannel => {
  if (verification?.phoneRequired && !verification?.emailRequired) {
    return "phone";
  }
  return "email";
};

/**
 * Il numero di secondi da un'intestazione `Retry-After`, o `null` se non
 * leggibile. Le rotte di autenticazione la valorizzano sempre su un 429.
 */
export const parseRetryAfterSeconds = (
  headerValue: string | null | undefined,
): number | null => {
  if (!headerValue) return null;
  const seconds = Number(headerValue);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
};

/**
 * Ripiego quando l'intestazione manca ma il messaggio la riporta in chiaro
 * ("Attendi 42 secondi prima di richiedere un altro codice."), com'e il caso
 * del cooldown di reinvio. Non inventa una policy: legge un numero che il
 * server ha gia scritto nella frase.
 */
export const extractRetryAfterFromMessage = (
  message: string | null | undefined,
): number | null => {
  if (!message) return null;
  const match = message.match(/(\d+)\s*second/i);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
};

export interface AckEnvelopeData {
  sent?: boolean;
  message?: string | null;
}

export interface ResendOutcome {
  kind: "sent" | "rate_limited" | "error";
  message: string;
  retryAfterSeconds?: number | null;
  code?: string;
}

/**
 * Classifica una risposta "invia e basta" (reinvio OTP, avvio reset
 * password): non porta ne sessione ne una challenge da proseguire, solo un
 * `sent` e un messaggio. Stessa individuazione del limite di frequenza
 * dell'esito di autenticazione, per non riscriverla due volte.
 */
export const interpretAckResponse = (params: {
  status: number;
  data: AckEnvelopeData | null | undefined;
  error: AuthEnvelopeError | null | undefined;
  retryAfterHeader?: string | null;
}): ResendOutcome => {
  const { status, data, error, retryAfterHeader } = params;
  const code = error?.code || undefined;

  if (status === 429 || (code && RATE_LIMIT_CODES.has(code))) {
    const retryAfterSeconds =
      parseRetryAfterSeconds(retryAfterHeader) ??
      extractRetryAfterFromMessage(error?.message);
    return {
      kind: "rate_limited",
      message: error?.message || "Troppe richieste. Riprova più tardi.",
      retryAfterSeconds,
      code,
    };
  }

  if (status >= 200 && status < 300 && data?.sent) {
    return { kind: "sent", message: data.message || "Fatto." };
  }

  return {
    kind: "error",
    message: error?.message || "Operazione non riuscita.",
    code,
  };
};

/**
 * Il messaggio unico che `confirmPasswordReset` (server) restituisce per
 * **ogni** token invalido, scaduto, gia usato o mai esistito — di proposito,
 * per non dare a chi prova un link a caso un modo di distinguere questi casi
 * (vedi `src/lib/server/auth-workflows.ts`, lato Web). Il client non deve
 * inventare una distinzione che il server rifiuta di fare: un client che
 * mostrasse "scaduto" contro "gia usato" ricostruirebbe l'oracolo che il
 * messaggio unico esiste per chiudere.
 */
const PASSWORD_RESET_TOKEN_MESSAGE = "Link di reset non valido o scaduto";

export interface PasswordResetSuccessOutcome {
  kind: "success";
  message: string;
}
export interface PasswordResetTokenInvalidOutcome {
  kind: "token_invalid";
  message: string;
}
export interface PasswordResetPolicyOutcome {
  kind: "policy_error";
  message: string;
}
export type PasswordResetOutcome =
  | PasswordResetSuccessOutcome
  | PasswordResetTokenInvalidOutcome
  | PasswordResetPolicyOutcome
  | RateLimitedOutcome
  | AuthErrorOutcome;

/**
 * Classifica `POST /api/v1/auth/password/reset`. Tre e non quattro stati di
 * errore: il token comprende invalido, scaduto e gia usato (vedi sopra),
 * `policy_error` e ogni altro messaggio di dominio (oggi solo la regola sulla
 * password) e `error` resta per un imprevisto senza `error.message` — che in
 * pratica non succede mai, la rotta lo scrive sempre.
 */
export const interpretPasswordResetResponse = (params: {
  status: number;
  data: { reset?: boolean; message?: string | null } | null | undefined;
  error: AuthEnvelopeError | null | undefined;
  retryAfterHeader?: string | null;
}): PasswordResetOutcome => {
  const { status, data, error, retryAfterHeader } = params;
  const code = error?.code || undefined;

  if (status === 429 || (code && RATE_LIMIT_CODES.has(code))) {
    const retryAfterSeconds =
      parseRetryAfterSeconds(retryAfterHeader) ??
      extractRetryAfterFromMessage(error?.message);
    return {
      kind: "rate_limited",
      message: error?.message || "Troppe richieste. Riprova più tardi.",
      retryAfterSeconds,
    };
  }

  if (status >= 200 && status < 300 && data?.reset) {
    return { kind: "success", message: data.message || "Password aggiornata." };
  }

  if (!error?.message) {
    return { kind: "error", message: "Reset password non riuscito.", code };
  }

  if (error.message === PASSWORD_RESET_TOKEN_MESSAGE) {
    return { kind: "token_invalid", message: error.message };
  }

  return { kind: "policy_error", message: error.message };
};

/**
 * Classifica una risposta di `/api/v1/auth/**` in uno dei quattro esiti che
 * la UI sa disegnare. E l'unico punto che lo fa: le schermate leggono
 * `outcome.kind` e basta, non ricostruiscono la logica dallo status HTTP.
 */
export const interpretAuthResponse = (params: {
  status: number;
  data: AuthEnvelopeData | null | undefined;
  error: AuthEnvelopeError | null | undefined;
  retryAfterHeader?: string | null;
}): AuthOutcome => {
  const { status, data, error, retryAfterHeader } = params;
  const code = error?.code || undefined;

  if (status === 429 || (code && RATE_LIMIT_CODES.has(code))) {
    const retryAfterSeconds =
      parseRetryAfterSeconds(retryAfterHeader) ??
      extractRetryAfterFromMessage(error?.message);
    return {
      kind: "rate_limited",
      message: error?.message || "Troppe richieste. Riprova più tardi.",
      retryAfterSeconds,
    };
  }

  if (data?.session?.access_token && data.user) {
    return { kind: "authenticated", user: data.user, session: data.session };
  }

  if (data?.verification?.userId) {
    return {
      kind: "verification_required",
      channel: pickVerificationChannel(data.verification),
      verification: data.verification,
    };
  }

  return {
    kind: "error",
    message: error?.message || "Si è verificato un errore imprevisto.",
    code,
  };
};
