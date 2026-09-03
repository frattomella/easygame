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

type RigaDelSecchiello = { count: number; expires_at: Date };

/**
 * **L'unico contatore di frequenza, e in un'istruzione sola.**
 *
 * **Il difetto che chiude (B-H2, revisione finale della Wave 6).** Il
 * contatore girava in una transazione interattiva: `findUnique`, e poi
 * `upsert` con `count: 1` se il secchiello mancava o era scaduto, altrimenti
 * `update` con `increment`. Il ramo dell'incremento era atomico; quello di
 * apertura no. Con N richieste **simultanee** su un secchiello nuovo — o su
 * uno appena scaduto — ognuna leggeva «non c'e», ognuna scriveva `count = 1`,
 * e nessuna vedeva le altre: Postgres in `READ COMMITTED` non serializza due
 * `SELECT` che non trovano niente. Misurato dal database vero: **21 ammesse
 * su 40** contro un limite di 5, e 19 su 40 a finestra scaduta. In sequenza
 * il conteggio era giusto, ed e per questo che nessun test lo vedeva: un
 * doppio in memoria esegue una chiamata alla volta.
 *
 * Con B-H1 questo era un percorso di presa di possesso di un account: le
 * raffiche superavano il contatore per indirizzo, e il contatore dei
 * tentativi sulla challenge contava le raffiche invece dei tentativi.
 *
 * **La forma.** `INSERT … ON CONFLICT DO UPDATE … RETURNING`: Postgres prende
 * il lock di riga sul conflitto e valuta il `SET` sulla versione **gia
 * committata** dalle richieste arrivate prima, quindi N richieste simultanee
 * ricevono N valori distinti `1..N`, e solo le prime `limit` passano. La
 * riapertura a finestra scaduta sta nello stesso `CASE`: e atomica come
 * l'incremento, e riparte da 1 **una volta** per finestra, non una volta per
 * richiesta. Non c'e piu una transazione interattiva ne una lettura prima
 * della scrittura: il database e l'unico stato, ed e per questo che regge
 * anche fra istanze serverless diverse, che non condividono memoria.
 *
 * La finestra e **fissa** per scelta: si apre al primo tentativo, dura
 * `windowMs`, e finche e viva l'incremento non la allunga. Quando scade, un
 * tentativo nuovo ne apre un'altra da 1 — e il comportamento dichiarato in
 * `rate-limit-policy.ts`, non una falla: cio che il difetto apriva era la
 * possibilita di riaprirla N volte **nello stesso istante**.
 *
 * E l'unica istruzione SQL grezza sul contatore, ed e l'unica che il doppio
 * dei test sa emulare (`tests/helpers/fake-prisma.mjs`): l'ordine dei
 * parametri — chiave, scope, scadenza, adesso — e parte del contratto con il
 * doppio. La prova di concorrenza vera sta nella sonda
 * (`scripts/wave-6-security-probe.mjs`, U-69), contro Postgres.
 */
export const consumeAuthRateLimit = async (
  policy: AuthRateLimitPolicy,
  identifier: string,
  now = new Date(),
): Promise<AuthRateLimitResult> => {
  const key = hashIdentifier(policy.scope, identifier);
  const nextExpiry = new Date(now.getTime() + policy.windowMs);

  const righe = await prisma.$queryRaw<RigaDelSecchiello[]>`
    INSERT INTO auth_rate_limit_buckets (key, scope, count, expires_at, created_at, updated_at)
    VALUES (${key}, ${policy.scope}, 1, ${nextExpiry}, ${now}, ${now})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN auth_rate_limit_buckets.expires_at <= ${now} THEN 1
        ELSE auth_rate_limit_buckets.count + 1
      END,
      expires_at = CASE
        WHEN auth_rate_limit_buckets.expires_at <= ${now} THEN ${nextExpiry}
        ELSE auth_rate_limit_buckets.expires_at
      END,
      scope = ${policy.scope},
      updated_at = ${now}
    RETURNING count, expires_at
  `;

  const bucket = righe[0];
  if (!bucket) {
    throw new Error("Il contatore di frequenza non ha restituito nessuna riga");
  }

  return buildRateLimitResult(
    Number(bucket.count),
    policy,
    new Date(bucket.expires_at),
    now,
  );
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
