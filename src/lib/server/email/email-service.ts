import { prisma } from "../prisma";
import {
  SMTP_CONFIG_ID,
  type SmtpConfigurationInput,
  toPublicSmtpConfiguration,
} from "../../email/smtp-config";
import {
  decryptCredential,
  encryptCredential,
  isCredentialEncryptionAvailable,
} from "./credential-crypto";
import type {
  EmailDeliveryResult,
  EmailProvider,
  TransactionalEmail,
} from "./provider";
import { SmtpEmailProvider } from "./smtp-provider";

export type SafeEmailErrorCode =
  | "SMTP_AUTH_FAILED"
  | "SMTP_CONNECTION_FAILED"
  | "SMTP_CONFIGURATION_INVALID"
  | "SMTP_DELIVERY_FAILED";

export class EmailDeliveryError extends Error {
  constructor(readonly code: SafeEmailErrorCode) {
    super(code);
    this.name = "EmailDeliveryError";
  }
}

const toSafeErrorCode = (error: unknown): SafeEmailErrorCode => {
  const code = String((error as { code?: unknown })?.code || "").toUpperCase();
  const message = String((error as { message?: unknown })?.message || "");
  if (code === "EAUTH") return "SMTP_AUTH_FAILED";
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "ECONNREFUSED"].includes(code)) {
    return "SMTP_CONNECTION_FAILED";
  }
  if (
    message.includes("SMTP_CREDENTIAL") ||
    message.includes("EMAIL_CONFIGURATION")
  ) {
    return "SMTP_CONFIGURATION_INVALID";
  }
  return "SMTP_DELIVERY_FAILED";
};

export const getEmailErrorMessage = (code: SafeEmailErrorCode) => {
  if (code === "SMTP_AUTH_FAILED") return "Autenticazione SMTP rifiutata";
  if (code === "SMTP_CONNECTION_FAILED") {
    return "Connessione al server SMTP non riuscita";
  }
  if (code === "SMTP_CONFIGURATION_INVALID") {
    return "Configurazione SMTP non valida o non decifrabile";
  }
  return "Invio email non riuscito";
};

export const getPublicSmtpConfiguration = async () =>
  toPublicSmtpConfiguration(
    await prisma.emailProviderConfig.findUnique({
      where: { id: SMTP_CONFIG_ID },
    }),
  );

export const saveSmtpConfiguration = async (
  input: SmtpConfigurationInput,
  updatedBy: string,
) => {
  const existing = await prisma.emailProviderConfig.findUnique({
    where: { id: SMTP_CONFIG_ID },
  });
  if (!input.password && !existing?.password_ciphertext) {
    throw new EmailDeliveryError("SMTP_CONFIGURATION_INVALID");
  }
  if (!isCredentialEncryptionAvailable()) {
    throw new EmailDeliveryError("SMTP_CONFIGURATION_INVALID");
  }

  const encrypted = input.password
    ? encryptCredential(input.password)
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
    from_email: input.fromEmail,
    from_name: input.fromName,
    updated_by: updatedBy,
  };
  const saved = await prisma.emailProviderConfig.upsert({
    where: { id: SMTP_CONFIG_ID },
    create: { id: SMTP_CONFIG_ID, provider: "smtp", ...commonData },
    update: { ...commonData, last_test_status: null },
  });
  return toPublicSmtpConfiguration(saved);
};

const createConfiguredProvider = async (
  requireEnabled = true,
): Promise<EmailProvider | null> => {
  const config = await prisma.emailProviderConfig.findUnique({
    where: { id: SMTP_CONFIG_ID },
  });
  if (
    !config ||
    (requireEnabled && !config.enabled) ||
    !isCredentialEncryptionAvailable()
  ) {
    return null;
  }

  const password = decryptCredential({
    ciphertext: config.password_ciphertext,
    iv: config.password_iv,
    tag: config.password_tag,
  });
  return new SmtpEmailProvider({
    host: config.host,
    port: config.port,
    securityMode: config.security_mode === "ssl" ? "ssl" : "starttls",
    username: config.username,
    password,
    fromEmail: config.from_email,
    fromName: config.from_name,
  });
};

export const isEmailDeliveryConfigured = async () => {
  if (!isCredentialEncryptionAvailable()) return false;
  const config = await prisma.emailProviderConfig.findUnique({
    where: { id: SMTP_CONFIG_ID },
    select: { enabled: true, password_ciphertext: true },
  });
  return Boolean(config?.enabled && config.password_ciphertext);
};

export const sendTransactionalEmail = async (
  message: TransactionalEmail,
): Promise<EmailDeliveryResult> => {
  let provider: EmailProvider | null;
  try {
    provider = await createConfiguredProvider();
  } catch (error) {
    throw new EmailDeliveryError(toSafeErrorCode(error));
  }
  if (!provider) return { status: "skipped", reason: "not_configured" };
  try {
    await provider.send(message);
    return { status: "sent", provider: provider.id };
  } catch (error) {
    throw new EmailDeliveryError(toSafeErrorCode(error));
  }
};

export const testSmtpDelivery = async (to: string) => {
  try {
    const provider = await createConfiguredProvider(false);
    if (!provider) throw new EmailDeliveryError("SMTP_CONFIGURATION_INVALID");
    await provider.verify();
    await provider.send({
      to,
      subject: "Test configurazione email EasyGame",
      text: "La configurazione SMTP di EasyGame funziona correttamente.",
      html: "<p>La configurazione SMTP di <strong>EasyGame</strong> funziona correttamente.</p>",
    });
    await prisma.emailProviderConfig.update({
      where: { id: SMTP_CONFIG_ID },
      data: { last_test_at: new Date(), last_test_status: "success" },
    });
    return { sent: true };
  } catch (error) {
    const deliveryError =
      error instanceof EmailDeliveryError
        ? error
        : new EmailDeliveryError(toSafeErrorCode(error));
    await prisma.emailProviderConfig
      .update({
        where: { id: SMTP_CONFIG_ID },
        data: { last_test_at: new Date(), last_test_status: "failed" },
      })
      .catch(() => undefined);
    throw deliveryError;
  }
};

export const sendNotificationEmails = async (recipientUserIds: string[]) => {
  const userIds = Array.from(new Set(recipientUserIds.filter(Boolean)));
  if (userIds.length === 0 || !(await isEmailDeliveryConfigured())) return;

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true },
  });
  for (const user of users) {
    try {
      await sendTransactionalEmail({
        to: user.email,
        subject: "Nuova notifica EasyGame",
        text: "Hai una nuova notifica. Accedi a EasyGame per visualizzarla in modo sicuro.",
        html: "<p>Hai una nuova notifica.</p><p>Accedi a <strong>EasyGame</strong> per visualizzarla in modo sicuro.</p>",
      });
    } catch (error) {
      console.error("Notification email delivery failed", {
        code:
          error instanceof EmailDeliveryError
            ? error.code
            : "SMTP_DELIVERY_FAILED",
      });
    }
  }
};
