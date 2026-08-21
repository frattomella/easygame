import { createHash } from "crypto";
import { prisma } from "./prisma";
import {
  buildRateLimitResult,
  type AuthRateLimitPolicy,
  type AuthRateLimitResult,
} from "../auth/rate-limit-policy";

export { AUTH_RATE_LIMITS } from "../auth/rate-limit-policy";

const hashIdentifier = (scope: string, identifier: string) =>
  createHash("sha256")
    .update(
      `${process.env.AUTH_RATE_LIMIT_SECRET || process.env.CRON_SECRET || process.env.DATABASE_URL || "easygame-local"}:${scope}:${identifier.trim().toLowerCase()}`,
    )
    .digest("hex");

export const getRequestIp = (request: Request) => {
  const forwarded = request.headers.get("x-forwarded-for");
  return (
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
};

export const consumeAuthRateLimit = async (
  policy: AuthRateLimitPolicy,
  identifier: string,
  now = new Date(),
): Promise<AuthRateLimitResult> => {
  const key = hashIdentifier(policy.scope, identifier);
  const nextExpiry = new Date(now.getTime() + policy.windowMs);

  const bucket = await prisma.$transaction(async (tx) => {
    const existing = await tx.authRateLimitBucket.findUnique({ where: { key } });

    if (!existing || existing.expires_at <= now) {
      return tx.authRateLimitBucket.upsert({
        where: { key },
        create: {
          key,
          scope: policy.scope,
          count: 1,
          expires_at: nextExpiry,
        },
        update: {
          scope: policy.scope,
          count: 1,
          expires_at: nextExpiry,
        },
      });
    }

    return tx.authRateLimitBucket.update({
      where: { key },
      data: { count: { increment: 1 } },
    });
  });

  return buildRateLimitResult(bucket.count, policy, bucket.expires_at, now);
};

export const consumeRequestRateLimits = async (
  entries: Array<{
    policy: AuthRateLimitPolicy;
    identifier: string;
  }>,
) => {
  for (const entry of entries) {
    const result = await consumeAuthRateLimit(entry.policy, entry.identifier);
    if (!result.allowed) return result;
  }

  return null;
};

export const rateLimitHeaders = (result: AuthRateLimitResult) => ({
  "Retry-After": String(result.retryAfterSeconds),
  "X-RateLimit-Limit": String(result.limit),
  "X-RateLimit-Remaining": String(result.remaining),
});
