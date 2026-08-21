export type AuthRateLimitPolicy = {
  scope: "login" | "register" | "otp_send" | "otp_confirm";
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
