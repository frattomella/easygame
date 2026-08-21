CREATE TABLE "email_provider_configs" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'smtp',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "security_mode" TEXT NOT NULL DEFAULT 'starttls',
    "username" TEXT NOT NULL,
    "password_ciphertext" TEXT NOT NULL,
    "password_iv" TEXT NOT NULL,
    "password_tag" TEXT NOT NULL,
    "from_email" TEXT NOT NULL,
    "from_name" TEXT NOT NULL,
    "last_test_at" TIMESTAMP(3),
    "last_test_status" TEXT,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_provider_configs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "email_provider_configs_provider_check" CHECK ("provider" = 'smtp'),
    CONSTRAINT "email_provider_configs_port_check" CHECK ("port" BETWEEN 1 AND 65535),
    CONSTRAINT "email_provider_configs_security_mode_check" CHECK ("security_mode" IN ('ssl', 'starttls'))
);
