import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const CONTEXT = "easygame:smtp-credentials:v1";
const getEncryptionSecret = () =>
  process.env.SMTP_CREDENTIALS_SECRET ||
  process.env.AUTH_RATE_LIMIT_SECRET ||
  "";

const getEncryptionKey = () => {
  const secret = getEncryptionSecret();
  if (secret.length < 32)
    throw new Error("SMTP_CREDENTIAL_ENCRYPTION_UNAVAILABLE");
  return createHash("sha256").update(`${CONTEXT}:${secret}`).digest();
};

export const isCredentialEncryptionAvailable = () =>
  getEncryptionSecret().length >= 32;

export const encryptCredential = (plaintext: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  cipher.setAAD(Buffer.from(CONTEXT));
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

export const decryptCredential = ({
  ciphertext,
  iv,
  tag,
}: {
  ciphertext: string;
  iv: string;
  tag: string;
}) => {
  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      getEncryptionKey(),
      Buffer.from(iv, "base64"),
    );
    decipher.setAAD(Buffer.from(CONTEXT));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("SMTP_CREDENTIAL_DECRYPTION_FAILED");
  }
};
