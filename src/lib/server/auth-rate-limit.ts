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

/**
 * Quanti proxy fidati stanno davanti all'applicazione. Su Vercel e uno.
 *
 * Serve a sapere **quale** voce di `X-Forwarded-For` ha scritto un proxy e
 * quale ha scritto il client: ogni proxy accoda l'indirizzo da cui ha ricevuto,
 * quindi l'indirizzo vero e la n-esima voce da destra, con n il numero di
 * proxy fidati. Chi ne mette due davanti (per esempio una CDN sopra Vercel)
 * deve dichiararlo, altrimenti il limite finisce per contare gli indirizzi
 * della CDN e non quelli di chi bussa.
 */
const trustedProxyCount = () => {
  const dichiarato = Number(process.env.AUTH_RATE_LIMIT_TRUSTED_PROXIES || "1");
  return Number.isFinite(dichiarato) && dichiarato >= 1
    ? Math.floor(dichiarato)
    : 1;
};

/**
 * L'indirizzo da cui arriva la richiesta, per i limiti di tentativi.
 *
 * **Il difetto che chiude.** Si prendeva `X-Forwarded-For.split(",")[0]`, cioe
 * la voce **piu a sinistra** — che e esattamente quella che scrive il client.
 * Bastava aggiungere l'intestazione a mano e cambiarla a ogni richiesta per
 * avere un secchiello nuovo ogni volta: login, registrazione, moduli pubblici,
 * checkout dei link di pagamento, e — perche la chiave li contiene
 * l'indirizzo IP — anche invio e conferma degli OTP, cioe rinvii illimitati
 * verso la casella di qualcun altro.
 *
 * I limiti per identita (`identity:`, `pwreset:`) non passavano di qui e
 * reggevano: e per questo che restava un fastidio e non una chiave rotta.
 */
export const getRequestIp = (request: Request) => {
  const catena = (request.headers.get("x-forwarded-for") || "")
    .split(",")
    .map((voce) => voce.trim())
    .filter(Boolean);

  if (catena.length) {
    const indice = Math.max(0, catena.length - trustedProxyCount());
    const scelto = catena[indice];
    if (scelto) return scelto;
  }

  /*
    `x-real-ip` lo scrive il proxy sovrascrivendolo, quindi non e accodabile
    dal client come la catena qui sopra. In assenza di entrambe si restituisce
    `unknown`, che mette tutti nello stesso secchiello: e il verso prudente in
    cui sbagliare, perche stringe invece di aprire.
  */
  return request.headers.get("x-real-ip")?.trim() || "unknown";
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
