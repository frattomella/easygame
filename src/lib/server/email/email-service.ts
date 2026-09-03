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
import { renderEmailLayout } from "./layout";

export type SafeEmailErrorCode =
  | "SMTP_AUTH_FAILED"
  | "SMTP_CONNECTION_FAILED"
  | "SMTP_CONFIGURATION_INVALID"
  | "SMTP_DELIVERY_FAILED";

export class EmailDeliveryError extends Error {
  // Campo esplicito invece di parameter property: le parameter property non
  // sono supportate dallo strip-only di Node e renderebbero questo modulo,
  // e tutti quelli che lo importano, non testabili. Vedi 15-testing.md.
  readonly code: SafeEmailErrorCode;

  constructor(code: SafeEmailErrorCode) {
    super(code);
    this.code = code;
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
      html: renderEmailLayout({
        bodyHtml:
          "<p>La configurazione SMTP di <strong>EasyGame</strong> funziona correttamente.</p>",
      }),
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

/**
 * Il contenuto del sollecito di pagamento (W1-F).
 *
 * **Perche una email propria e non `sendNotificationEmails`.** Quella dice
 * «hai una nuova notifica» e chiede di accedere: e corretta quando il
 * contenuto e riservato e vive dentro l'applicazione. Un sollecito che non
 * dice **quanto** e **entro quando** costringe la famiglia ad accedere per
 * scoprire una cosa che si scrive in una riga, e chi non ha un account non
 * puo nemmeno farlo.
 *
 * **Cosa contiene, e cosa no.** Il minimo che serve a riconoscere la posizione
 * — nome dell'atleta, residuo, rate scadute, prossima scadenza — piu, dalla
 * Wave 2, **il link per pagare**: sollecitare senza dare il modo di pagare
 * produce un secondo sollecito, ed e la ragione per cui G-06 esiste. Il link e
 * facoltativo: un club che non incassa online riceve lo stesso messaggio senza
 * quella riga, perche meglio un sollecito senza link che nessun sollecito.
 */
export type PaymentReminderEmailContent = {
  to: string;
  clubName: string;
  athleteName: string;
  guardianName: string;
  /** Quanto resta da incassare, in euro. */
  residualAmount: number;
  overdueCount: number;
  /** ISO, oppure `null` quando tutte le rate sollecitate sono gia scadute. */
  nextDueDate: string | null;
  /** L'indirizzo per pagare, oppure vuoto quando il club non incassa online. */
  paymentLink?: string;
};

const euroFormatter = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
});

const formatItalianDate = (value: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? null
    : parsed.toLocaleDateString("it-IT");
};

/** Le righe del sollecito, in un posto solo: le usano testo e HTML. */
export const buildPaymentReminderLines = (
  content: PaymentReminderEmailContent,
) => {
  const lines = [
    `Atleta: ${content.athleteName}`,
    `Importo ancora da versare: ${euroFormatter.format(content.residualAmount)}`,
  ];

  /*
    Zero rate scadute non si scrive: «0 rate scadute» in un sollecito e una
    riga che contraddice il motivo per cui il messaggio e partito.
  */
  if (content.overdueCount > 0) {
    lines.push(
      content.overdueCount === 1
        ? "Rate scadute: 1"
        : `Rate scadute: ${content.overdueCount}`,
    );
  }

  const nextDueDate = formatItalianDate(content.nextDueDate);
  if (nextDueDate) {
    lines.push(`Prossima scadenza: ${nextDueDate}`);
  }

  return lines;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Manda il sollecito a **un** indirizzo.
 *
 * Non guarda se il destinatario ha un account: l'indirizzo lo decide chi
 * chiama, che lo ha risolto dall'anagrafica. Restituisce l'esito senza
 * addolcirlo — `skipped` quando SMTP non e configurato — perche chi sollecita
 * deve poter dire, per destinatario, se il messaggio e partito davvero.
 */
export const sendPaymentReminderEmail = async (
  content: PaymentReminderEmailContent,
): Promise<EmailDeliveryResult> => {
  const lines = buildPaymentReminderLines(content);
  const greeting = content.guardianName
    ? `Gentile ${content.guardianName},`
    : "Gentile famiglia,";

  /*
    Il link, quando c'e, sta **dopo** i dati della posizione e prima della
    chiusura: chi apre il messaggio deve prima riconoscere di cosa si parla e
    poi trovare il gesto da fare. Un club che non incassa online riceve
    esattamente il messaggio di prima, senza righe vuote.
  */
  const paymentLink = String(content.paymentLink || "").trim();
  const linkLines = paymentLink ? ["", "Puoi pagare da qui:", paymentLink] : [];

  return sendTransactionalEmail({
    to: content.to,
    subject: `${content.clubName}: quote da regolarizzare per ${content.athleteName}`,
    text: [
      greeting,
      "",
      `${content.clubName} ricorda che risultano quote ancora da versare.`,
      "",
      ...lines,
      ...linkLines,
      "",
      "Se il pagamento e gia stato effettuato, consideri questo messaggio come non ricevuto.",
      "",
      content.clubName,
    ].join("\n"),
    html: renderEmailLayout({
      bodyHtml: [
        `<p>${escapeHtml(greeting)}</p>`,
        `<p>${escapeHtml(content.clubName)} ricorda che risultano quote ancora da versare.</p>`,
        `<ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`,
        paymentLink
          ? `<p><a href="${escapeHtml(paymentLink)}">Paga la quota</a></p>`
          : "",
        "<p>Se il pagamento e gia stato effettuato, consideri questo messaggio come non ricevuto.</p>",
        `<p>${escapeHtml(content.clubName)}</p>`,
      ].join(""),
    }),
  });
};

/**
 * Contenuto fisso, di proposito: copre appuntamenti, richieste documenti,
 * form, alert trainer, certificati e le notifiche generiche `/api/v1` — mai
 * un dato riservato nell'oggetto o nel corpo, solo l'invito ad accedere.
 * Estratto per essere richiamabile anche dall'anteprima di sviluppo.
 */
export const buildGenericNotificationEmailHtml = (): string =>
  renderEmailLayout({
    bodyHtml:
      "<p>Hai una nuova notifica.</p><p>Accedi a <strong>EasyGame</strong> per visualizzarla in modo sicuro.</p>",
  });

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
        html: buildGenericNotificationEmailHtml(),
      });
    } catch (error) {
      /* eslint-disable-next-line no-console -- il codice di una mancata consegna, non il messaggio */
      console.error("Notification email delivery failed", {
        code:
          error instanceof EmailDeliveryError
            ? error.code
            : "SMTP_DELIVERY_FAILED",
      });
    }
  }
};
