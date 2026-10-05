import { createHash, createHmac } from "node:crypto";

/**
 * **L'adattatore S3 compatibile** (Cloudflare R2, AWS S3, MinIO) per il
 * servizio allegati (ADR-0034, ADR-0200 §9).
 *
 * Implementa il contratto `StorageDriver` di `src/lib/server/attachments.ts`
 * — `put`, `get`, `remove` — e due funzioni in piu per la libreria del sito:
 * l'URL pubblico (se il bucket ha un dominio pubblico o una CDN) e l'URL
 * firmato a tempo. La firma AWS Signature V4 e scritta qui con `node:crypto`:
 * nessuna libreria nuova per quattro chiamate HTTP.
 *
 * Si accende con le variabili d'ambiente (vedi `.env.example`):
 *
 *   EASYGAME_STORAGE_DRIVER=s3          scrive gli allegati nuovi su S3
 *   S3_ENDPOINT=https://<id>.r2.cloudflarestorage.com
 *   S3_REGION=auto
 *   S3_BUCKET=easygame-attachments
 *   S3_ACCESS_KEY_ID=…  S3_SECRET_ACCESS_KEY=…
 *
 * Gli allegati gia scritti nel database restano leggibili: il driver di un
 * allegato si legge dalla sua riga, non dalla configurazione corrente.
 */

export type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
};

export const readS3Config = (env: NodeJS.ProcessEnv = process.env): S3Config | null => {
  const endpoint = String(env.S3_ENDPOINT || "").trim().replace(/\/+$/, "");
  const bucket = String(env.S3_BUCKET || "").trim();
  const accessKeyId = String(env.S3_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(env.S3_SECRET_ACCESS_KEY || "").trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint,
    region: String(env.S3_REGION || "auto").trim() || "auto",
    bucket,
    accessKeyId,
    secretAccessKey,
    prefix: String(env.S3_KEY_PREFIX || "attachments").trim().replace(/^\/+|\/+$/g, ""),
  };
};

const sha256Hex = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const hmac = (key: Buffer | string, value: string) => createHmac("sha256", key).update(value).digest();

const encodeKey = (key: string) => key.split("/").map((part) => encodeURIComponent(part)).join("/");

const amzDate = (now: Date) => now.toISOString().replace(/[:-]|\.\d{3}/g, "");

const signingKey = (secret: string, date: string, region: string) => {
  const kDate = hmac(`AWS4${secret}`, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
};

export type SignedRequest = { url: string; headers: Record<string, string> };

/** Firma una richiesta (path-style: `<endpoint>/<bucket>/<key>`). */
export const signS3Request = (
  config: S3Config,
  method: "GET" | "PUT" | "DELETE" | "HEAD",
  key: string,
  options: { body?: Buffer; contentType?: string; now?: Date } = {},
): SignedRequest => {
  const now = options.now || new Date();
  const stamp = amzDate(now);
  const date = stamp.slice(0, 8);
  const url = new URL(`${config.endpoint}/${encodeURIComponent(config.bucket)}/${encodeKey(key)}`);
  const payloadHash = options.body ? sha256Hex(options.body) : sha256Hex("");
  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": stamp,
  };
  if (options.contentType) headers["content-type"] = options.contentType;
  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name].trim()}\n`).join("");
  const canonicalRequest = [method, url.pathname, "", canonicalHeaders, signedHeaderNames.join(";"), payloadHash].join("\n");
  const scope = `${date}/${config.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", stamp, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(config.secretAccessKey, date, config.region)).update(stringToSign).digest("hex");
  const { host: _host, ...rest } = headers;
  return {
    url: url.toString(),
    headers: {
      ...rest,
      authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaderNames.join(";")}, Signature=${signature}`,
    },
  };
};

/** Un URL GET firmato e a scadenza (query string), per file privati. */
export const presignS3Get = (config: S3Config, key: string, expiresSeconds = 300, now = new Date()) => {
  const stamp = amzDate(now);
  const date = stamp.slice(0, 8);
  const url = new URL(`${config.endpoint}/${encodeURIComponent(config.bucket)}/${encodeKey(key)}`);
  const scope = `${date}/${config.region}/s3/aws4_request`;
  const params = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${config.accessKeyId}/${scope}`,
    "X-Amz-Date": stamp,
    "X-Amz-Expires": String(Math.max(1, Math.min(604800, Math.round(expiresSeconds)))),
    "X-Amz-SignedHeaders": "host",
  });
  const canonicalQuery = Array.from(params.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const canonicalRequest = ["GET", url.pathname, canonicalQuery, `host:${url.host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", stamp, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(config.secretAccessKey, date, config.region)).update(stringToSign).digest("hex");
  return `${url.toString()}?${canonicalQuery}&X-Amz-Signature=${signature}`;
};

export type S3Fetch = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Il driver. `fetchImpl` si inietta nei test; in produzione e il `fetch` di
 * Node. La chiave di un allegato e `<prefisso>/<id>`: l'id e gia unico, e un
 * nome di file scritto dall'utente non entra mai in una chiave.
 */
export const createS3StorageDriver = (config: S3Config, fetchImpl: S3Fetch = fetch) => {
  const keyFor = (attachmentId: string) => `${config.prefix}/${attachmentId}`;
  return {
    name: "s3",
    async put(attachmentId: string, content: Buffer) {
      const key = keyFor(attachmentId);
      const signed = signS3Request(config, "PUT", key, { body: content, contentType: "application/octet-stream" });
      const response = await fetchImpl(signed.url, { method: "PUT", headers: signed.headers, body: content as unknown as BodyInit });
      if (!response.ok) throw new Error(`Archivio file: scrittura non riuscita (${response.status})`);
      return { storageKey: key };
    },
    async get(attachmentId: string, storageKey: string | null) {
      const key = storageKey || keyFor(attachmentId);
      const signed = signS3Request(config, "GET", key);
      const response = await fetchImpl(signed.url, { method: "GET", headers: signed.headers });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Archivio file: lettura non riuscita (${response.status})`);
      return Buffer.from(await response.arrayBuffer());
    },
    async remove(attachmentId: string, storageKey: string | null) {
      const key = storageKey || keyFor(attachmentId);
      const signed = signS3Request(config, "DELETE", key);
      const response = await fetchImpl(signed.url, { method: "DELETE", headers: signed.headers });
      if (!response.ok && response.status !== 404) throw new Error(`Archivio file: cancellazione non riuscita (${response.status})`);
    },
    signedUrl(storageKey: string, expiresSeconds = 300) {
      return presignS3Get(config, storageKey, expiresSeconds);
    },
  };
};

export type S3StorageDriver = ReturnType<typeof createS3StorageDriver>;
