import { z } from "zod";

export const SMTP_CONFIG_ID = "smtp";
export const SMTP_SECURITY_MODES = ["starttls", "ssl"] as const;

const smtpHostSchema = z
  .string()
  .trim()
  .min(1, "Host SMTP obbligatorio")
  .max(253, "Host SMTP troppo lungo")
  .refine(
    (value) =>
      !value.includes("://") &&
      !/[\s/@]/.test(value) &&
      value.toLowerCase() !== "localhost",
    "Host SMTP non valido",
  );

export const smtpConfigurationInputSchema = z.object({
  enabled: z.boolean(),
  host: smtpHostSchema,
  port: z.coerce.number().int().min(1).max(65535),
  securityMode: z.enum(SMTP_SECURITY_MODES),
  username: z.string().trim().min(1, "Username SMTP obbligatorio").max(320),
  password: z.string().min(1).max(1024).optional(),
  fromEmail: z.string().trim().email("Email mittente non valida").max(320),
  fromName: z.string().trim().min(1, "Nome mittente obbligatorio").max(120),
});

export const smtpTestInputSchema = z.object({
  to: z.string().trim().email("Email destinatario non valida").max(320),
});

export type SmtpConfigurationInput = z.infer<
  typeof smtpConfigurationInputSchema
>;
export type PublicSmtpConfiguration = Omit<
  SmtpConfigurationInput,
  "password"
> & {
  configured: boolean;
  passwordConfigured: boolean;
  lastTestAt: string | null;
  lastTestStatus: string | null;
};

export const toPublicSmtpConfiguration = (
  config: {
    enabled: boolean;
    host: string;
    port: number;
    security_mode: string;
    username: string;
    from_email: string;
    from_name: string;
    password_ciphertext: string;
    last_test_at: Date | null;
    last_test_status: string | null;
  } | null,
): PublicSmtpConfiguration => ({
  configured: Boolean(config),
  enabled: Boolean(config?.enabled),
  host: config?.host || "",
  port: config?.port || 587,
  securityMode: config?.security_mode === "ssl" ? "ssl" : "starttls",
  username: config?.username || "",
  fromEmail: config?.from_email || "",
  fromName: config?.from_name || "EasyGame",
  passwordConfigured: Boolean(config?.password_ciphertext),
  lastTestAt: config?.last_test_at?.toISOString() || null,
  lastTestStatus: config?.last_test_status || null,
});
