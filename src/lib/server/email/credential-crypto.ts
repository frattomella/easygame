import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";

/**
 * Contesto crittografico per famiglia di credenziali.
 *
 * Entra sia nella derivazione della chiave sia nel dato autenticato (AAD): una
 * credenziale SMTP non e decifrabile come se fosse una credenziale IMAP, e
 * viceversa. E la traduzione crittografica della regola di prodotto "SMTP e
 * IMAP restano separati".
 *
 * Il valore `smtp` non va cambiato: e quello con cui sono gia cifrate le
 * credenziali salvate.
 */
export type CredentialPurpose = "smtp" | "imap";

const CONTEXTS: Record<CredentialPurpose, string> = {
  smtp: "easygame:smtp-credentials:v1",
  imap: "easygame:imap-credentials:v1",
};

const getEncryptionSecret = () =>
  process.env.SMTP_CREDENTIALS_SECRET ||
  process.env.AUTH_RATE_LIMIT_SECRET ||
  "";

const getEncryptionKey = (purpose: CredentialPurpose) => {
  const secret = getEncryptionSecret();
  if (secret.length < 32)
    throw new Error("SMTP_CREDENTIAL_ENCRYPTION_UNAVAILABLE");
  return createHash("sha256")
    .update(`${CONTEXTS[purpose]}:${secret}`)
    .digest();
};

export const isCredentialEncryptionAvailable = () =>
  getEncryptionSecret().length >= 32;

export const encryptCredential = (
  plaintext: string,
  purpose: CredentialPurpose = "smtp",
) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(purpose), iv);
  cipher.setAAD(Buffer.from(CONTEXTS[purpose]));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
};

export const decryptCredential = (
  {
    ciphertext,
    iv,
    tag,
  }: {
    ciphertext: string;
    iv: string;
    tag: string;
  },
  purpose: CredentialPurpose = "smtp",
) => {
  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      getEncryptionKey(purpose),
      Buffer.from(iv, "base64"),
    );
    decipher.setAAD(Buffer.from(CONTEXTS[purpose]));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("SMTP_CREDENTIAL_DECRYPTION_FAILED");
  }
};
