import { z } from "zod";

export const IMAP_CONFIG_ID = "imap";
export const IMAP_SECURITY_MODES = ["ssl", "starttls"] as const;

/**
 * Configurazione della casella IMAP di piattaforma.
 *
 * Volutamente **non** riusa lo schema SMTP: sono due servizi diversi con
 * credenziali diverse, e mescolarli renderebbe facile scriverne una sopra
 * l'altra. IMAP non ha mittente ne nome mittente, e la porta tipica e 993
 * (SSL implicito) invece di 587.
 */
const imapHostSchema = z
  .string()
  .trim()
  .min(1, "Host IMAP obbligatorio")
  .max(253, "Host IMAP troppo lungo")
  .refine(
    (value) =>
      !value.includes("://") &&
      !/[\s/@]/.test(value) &&
      value.toLowerCase() !== "localhost",
    "Host IMAP non valido",
  );

export const imapConfigurationInputSchema = z.object({
  enabled: z.boolean(),
  host: imapHostSchema,
  port: z.coerce.number().int().min(1).max(65535),
  securityMode: z.enum(IMAP_SECURITY_MODES),
  username: z.string().trim().min(1, "Username IMAP obbligatorio").max(320),
  password: z.string().min(1).max(1024).optional(),
});

export type ImapConfigurationInput = z.infer<
  typeof imapConfigurationInputSchema
>;

export type PublicImapConfiguration = Omit<
  ImapConfigurationInput,
  "password"
> & {
  configured: boolean;
  passwordConfigured: boolean;
  lastTestAt: string | null;
  lastTestStatus: string | null;
};

export const toPublicImapConfiguration = (
  config: {
    enabled: boolean;
    host: string;
    port: number;
    security_mode: string;
    username: string;
    password_ciphertext: string;
    last_test_at: Date | null;
    last_test_status: string | null;
  } | null,
): PublicImapConfiguration => ({
  configured: Boolean(config),
  enabled: Boolean(config?.enabled),
  host: config?.host || "",
  port: config?.port || 993,
  securityMode: config?.security_mode === "starttls" ? "starttls" : "ssl",
  username: config?.username || "",
  // La password non esce mai: esce solo il fatto che ce n'e una.
  passwordConfigured: Boolean(config?.password_ciphertext),
  lastTestAt: config?.last_test_at?.toISOString() || null,
  lastTestStatus: config?.last_test_status || null,
});
