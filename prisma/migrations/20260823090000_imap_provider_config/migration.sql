-- Casella IMAP di piattaforma (Blocco 4).
--
-- Tabella separata da `email_provider_configs`: SMTP e IMAP sono due servizi
-- distinti e le credenziali restano separate. La riga SMTP porta mittente e
-- nome mittente, che per la lettura della posta non hanno senso, e il suo
-- CHECK vincola `provider` a 'smtp': non e riusabile per IMAP.

-- CreateTable
CREATE TABLE "imap_provider_configs" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "security_mode" TEXT NOT NULL DEFAULT 'ssl',
    "username" TEXT NOT NULL,
    "password_ciphertext" TEXT NOT NULL,
    "password_iv" TEXT NOT NULL,
    "password_tag" TEXT NOT NULL,
    "last_test_at" TIMESTAMP(3),
    "last_test_status" TEXT,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imap_provider_configs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "imap_provider_configs_port_check" CHECK ("port" BETWEEN 1 AND 65535),
    CONSTRAINT "imap_provider_configs_security_mode_check" CHECK ("security_mode" IN ('ssl', 'starttls'))
);
