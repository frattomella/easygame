import { prisma } from "../prisma";
import {
  IMAP_CONFIG_ID,
  type ImapConfigurationInput,
  toPublicImapConfiguration,
} from "../../email/imap-config";
import {
  decryptCredential,
  encryptCredential,
  isCredentialEncryptionAvailable,
} from "./credential-crypto";
import { ImapConnectionError, verifyImapConnection } from "./imap-client";
import type { ImapErrorCode } from "./imap-protocol";

export class ImapConfigurationError extends Error {
  readonly code: ImapErrorCode;

  constructor(code: ImapErrorCode) {
    super(code);
    this.code = code;
    this.name = "ImapConfigurationError";
  }
}

export const getImapErrorMessage = (code: ImapErrorCode) => {
  if (code === "IMAP_AUTH_FAILED") return "Autenticazione IMAP rifiutata";
  if (code === "IMAP_CONNECTION_FAILED") {
    return "Connessione al server IMAP non riuscita";
  }
  if (code === "IMAP_TLS_REQUIRED") {
    return "Il server IMAP non ha accettato STARTTLS: prova con SSL/TLS";
  }
  return "Configurazione IMAP non valida o non decifrabile";
};

export const toImapErrorCode = (error: unknown): ImapErrorCode => {
  if (error instanceof ImapConnectionError) return error.code;
  if (error instanceof ImapConfigurationError) return error.code;
  return "IMAP_CONFIGURATION_INVALID";
};

export const getPublicImapConfiguration = async () =>
  toPublicImapConfiguration(
    await prisma.imapProviderConfig.findUnique({ where: { id: IMAP_CONFIG_ID } }),
  );

export const saveImapConfiguration = async (
  input: ImapConfigurationInput,
  updatedBy: string,
) => {
  const existing = await prisma.imapProviderConfig.findUnique({
    where: { id: IMAP_CONFIG_ID },
  });

  // Salvare senza password e legittimo solo se ce n'e gia una cifrata da
  // conservare: altrimenti resterebbe una configurazione inutilizzabile.
  if (!input.password && !existing?.password_ciphertext) {
    throw new ImapConfigurationError("IMAP_CONFIGURATION_INVALID");
  }
  if (!isCredentialEncryptionAvailable()) {
    throw new ImapConfigurationError("IMAP_CONFIGURATION_INVALID");
  }

  const encrypted = input.password
    ? encryptCredential(input.password, "imap")
    : {
        ciphertext: existing!.password_ciphertext,
        iv: existing!.password_iv,
        tag: existing!.password_tag,
      };

  const commonData = {
    enabled: input.enabled,
    host: input.host,
    port: input.port,
    security_mode: input.securityMode,
    username: input.username,
    password_ciphertext: encrypted.ciphertext,
    password_iv: encrypted.iv,
    password_tag: encrypted.tag,
    updated_by: updatedBy,
  };

  const saved = await prisma.imapProviderConfig.upsert({
    where: { id: IMAP_CONFIG_ID },
    create: { id: IMAP_CONFIG_ID, ...commonData },
    // Cambiando i parametri l'esito del test precedente non vale piu.
    update: { ...commonData, last_test_status: null },
  });

  return toPublicImapConfiguration(saved);
};

/**
 * Prova la configurazione salvata, anche se disabilitata: un amministratore
 * deve poter verificare prima di attivare.
 */
export const testImapConnection = async () => {
  const config = await prisma.imapProviderConfig.findUnique({
    where: { id: IMAP_CONFIG_ID },
  });

  if (!config || !isCredentialEncryptionAvailable()) {
    throw new ImapConfigurationError("IMAP_CONFIGURATION_INVALID");
  }

  try {
    const password = decryptCredential(
      {
        ciphertext: config.password_ciphertext,
        iv: config.password_iv,
        tag: config.password_tag,
      },
      "imap",
    );

    await verifyImapConnection({
      host: config.host,
      port: config.port,
      securityMode: config.security_mode === "starttls" ? "starttls" : "ssl",
      username: config.username,
      password,
    });

    await prisma.imapProviderConfig.update({
      where: { id: IMAP_CONFIG_ID },
      data: { last_test_at: new Date(), last_test_status: "success" },
    });

    return { connected: true };
  } catch (error) {
    await prisma.imapProviderConfig
      .update({
        where: { id: IMAP_CONFIG_ID },
        data: { last_test_at: new Date(), last_test_status: "failed" },
      })
      .catch(() => undefined);
    throw new ImapConfigurationError(toImapErrorCode(error));
  }
};
