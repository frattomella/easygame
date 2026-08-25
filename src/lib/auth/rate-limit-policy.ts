export type AuthRateLimitPolicy = {
  /**
   * Il nome del contatore. Le prime quattro voci sono di autenticazione; le
   * due dei moduli pubblici usano lo stesso meccanismo perche il problema e
   * lo stesso — un endpoint raggiungibile senza sessione — e un secondo
   * sistema di conteggio sarebbe una seconda implementazione della stessa
   * cosa.
   */
  scope:
    | "login"
    | "register"
    | "otp_send"
    | "otp_confirm"
    | "public_form_view"
    | "public_form_submit";
  limit: number;
  windowMs: number;
};

export type AuthRateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

export const AUTH_RATE_LIMITS = {
  loginIdentity: { scope: "login", limit: 10, windowMs: 15 * 60_000 },
  loginIp: { scope: "login", limit: 30, windowMs: 15 * 60_000 },
  registerIdentity: { scope: "register", limit: 3, windowMs: 60 * 60_000 },
  registerIp: { scope: "register", limit: 10, windowMs: 60 * 60_000 },
  otpSend: { scope: "otp_send", limit: 3, windowMs: 10 * 60_000 },
  otpConfirm: { scope: "otp_confirm", limit: 5, windowMs: 15 * 60_000 },
  /*
    Aprire un modulo pubblico e gratuito ma non illimitato: sessanta aperture
    in un quarto d'ora da uno stesso indirizzo bastano a una famiglia che
    ricarica, e non bastano a enumerare gli slug.
  */
  publicFormView: { scope: "public_form_view", limit: 60, windowMs: 15 * 60_000 },
  /*
    Inviare invece costa: crea righe e allegati. Dieci invii all'ora dallo
    stesso indirizzo coprono una famiglia con tre figli che sbaglia due volte,
    e fermano chi riempie la coda della segreteria.
  */
  publicFormSubmit: { scope: "public_form_submit", limit: 10, windowMs: 60 * 60_000 },
} as const satisfies Record<string, AuthRateLimitPolicy>;

export const buildRateLimitResult = (
  count: number,
  policy: AuthRateLimitPolicy,
  expiresAt: Date,
  now = new Date(),
): AuthRateLimitResult => ({
  allowed: count <= policy.limit,
  limit: policy.limit,
  remaining: Math.max(policy.limit - count, 0),
  retryAfterSeconds: Math.max(
    Math.ceil((expiresAt.getTime() - now.getTime()) / 1000),
    1,
  ),
});
