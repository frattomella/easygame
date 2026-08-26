-- Blocco D — Stripe Connect, billing di piattaforma, motore fiscale.
--
-- **Additiva.** Nessun DROP, nessun UPDATE, nessuna colonna che perde dati.
-- Le colonne nuove sono tutte nullable oppure hanno un default che coincide
-- con cio che le righe esistenti significano gia:
--
--   * `document_number_sequences.series` nasce `''`, che e esattamente la
--     serie in cui sono state emesse tutte le ricevute e le fatture fino a
--     oggi. Il vincolo di unicita si allarga a includerla: le righe esistenti
--     restano valide e continuano a incrementare la stessa sequenza;
--   * `payment_webhook_events.flow` nasce `'connect'`, perche fino a oggi
--     l'unico webhook esistente era quello degli incassi degli atleti.
--
-- Le colonne di riconciliazione su `payment_transactions` restano NULL sulle
-- righe gia scritte, ed e corretto: quegli incassi sono manuali e una
-- commissione di piattaforma non l'hanno mai avuta. Non si retrodata cio che
-- non e successo.

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_commission_rules" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "percent" DOUBLE PRECISION NOT NULL,
    "fixed_cents" INTEGER NOT NULL DEFAULT 0,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_commission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_payment_accounts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'stripe',
    "external_account_id" TEXT,
    "account_type" TEXT NOT NULL DEFAULT 'standard',
    "status" TEXT NOT NULL DEFAULT 'not_configured',
    "charges_enabled" BOOLEAN NOT NULL DEFAULT false,
    "payouts_enabled" BOOLEAN NOT NULL DEFAULT false,
    "requirements" JSONB,
    "disabled_reason" TEXT,
    "online_payments_enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_synced_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_payment_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_billing_accounts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'stripe',
    "external_customer_id" TEXT,
    "external_subscription_id" TEXT,
    "external_price_id" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "status" TEXT NOT NULL DEFAULT 'not_active',
    "current_period_end" TIMESTAMP(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "last_event_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_billing_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_fiscal_profiles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "legal_name" TEXT,
    "legal_form" TEXT NOT NULL DEFAULT 'altro',
    "fiscal_code" TEXT,
    "vat_number" TEXT,
    "tax_regime_code" TEXT,
    "special_regimes" JSONB,
    "address" TEXT,
    "city" TEXT,
    "province" TEXT,
    "postal_code" TEXT,
    "country" TEXT NOT NULL DEFAULT 'IT',
    "city_code" TEXT,
    "pec" TEXT,
    "recipient_code" TEXT,
    "rea_office" TEXT,
    "rea_number" TEXT,
    "rea_capital" DOUBLE PRECISION,
    "rea_sole_shareholder" BOOLEAN,
    "rea_in_liquidation" BOOLEAN,
    "stamp_duty" JSONB,
    "settings" JSONB,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_fiscal_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_series" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT '',
    "label" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_operation_types" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "document_route" TEXT NOT NULL DEFAULT 'receipt',
    "vat_rate" DOUBLE PRECISION,
    "vat_nature" TEXT,
    "activity_scope" TEXT NOT NULL DEFAULT 'unspecified',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_operation_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "einvoice_transmissions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "provider" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "format" TEXT NOT NULL DEFAULT 'FPR12',
    "file_name" TEXT,
    "payload" TEXT,
    "payload_hash" TEXT,
    "validation_errors" JSONB,
    "sdi_identifier" TEXT,
    "sdi_receipts" JSONB,
    "transmitted_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "einvoice_transmissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_settings_key_key" ON "platform_settings"("key");

-- CreateIndex
CREATE INDEX "platform_commission_rules_organization_id_effective_from_idx" ON "platform_commission_rules"("organization_id", "effective_from");

-- CreateIndex
CREATE INDEX "platform_commission_rules_effective_from_idx" ON "platform_commission_rules"("effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "club_payment_accounts_organization_id_key" ON "club_payment_accounts"("organization_id");

-- CreateIndex
CREATE INDEX "club_payment_accounts_external_account_id_idx" ON "club_payment_accounts"("external_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_billing_accounts_organization_id_key" ON "platform_billing_accounts"("organization_id");

-- CreateIndex
CREATE INDEX "platform_billing_accounts_external_customer_id_idx" ON "platform_billing_accounts"("external_customer_id");

-- CreateIndex
CREATE INDEX "platform_billing_accounts_external_subscription_id_idx" ON "platform_billing_accounts"("external_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_fiscal_profiles_organization_id_key" ON "organization_fiscal_profiles"("organization_id");

-- CreateIndex
CREATE INDEX "document_series_organization_id_kind_idx" ON "document_series"("organization_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "document_series_organization_id_kind_code_key" ON "document_series"("organization_id", "kind", "code");

-- CreateIndex
CREATE INDEX "fiscal_operation_types_organization_id_idx" ON "fiscal_operation_types"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_operation_types_organization_id_code_key" ON "fiscal_operation_types"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "einvoice_transmissions_invoice_id_key" ON "einvoice_transmissions"("invoice_id");

-- CreateIndex
CREATE INDEX "einvoice_transmissions_organization_id_status_idx" ON "einvoice_transmissions"("organization_id", "status");

-- AddForeignKey
ALTER TABLE "platform_commission_rules" ADD CONSTRAINT "platform_commission_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_payment_accounts" ADD CONSTRAINT "club_payment_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_billing_accounts" ADD CONSTRAINT "platform_billing_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_fiscal_profiles" ADD CONSTRAINT "organization_fiscal_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_series" ADD CONSTRAINT "document_series_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_operation_types" ADD CONSTRAINT "fiscal_operation_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "einvoice_transmissions" ADD CONSTRAINT "einvoice_transmissions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "einvoice_transmissions" ADD CONSTRAINT "einvoice_transmissions_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: la riconciliazione congelata di un incasso online.
ALTER TABLE "payment_transactions" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'EUR',
ADD COLUMN     "gross_amount_cents" INTEGER,
ADD COLUMN     "platform_fee_cents" INTEGER,
ADD COLUMN     "provider_fee_cents" INTEGER,
ADD COLUMN     "net_amount_cents" INTEGER,
ADD COLUMN     "applied_fee_percent" DOUBLE PRECISION,
ADD COLUMN     "applied_fee_fixed_cents" INTEGER,
ADD COLUMN     "commission_rule_id" UUID,
ADD COLUMN     "external_account_id" TEXT,
ADD COLUMN     "external_payment_id" TEXT,
ADD COLUMN     "external_event_id" TEXT,
ADD COLUMN     "operation_type_code" TEXT;

-- CreateIndex
CREATE INDEX "payment_transactions_external_payment_id_idx" ON "payment_transactions"("external_payment_id");

-- AlterTable: serie, snapshot e ciclo di vita di una fattura.
ALTER TABLE "invoices" ADD COLUMN     "transaction_id" UUID,
ADD COLUMN     "series" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sequence" INTEGER,
ADD COLUMN     "document_year" INTEGER,
ADD COLUMN     "operation_type_code" TEXT,
ADD COLUMN     "snapshot" JSONB,
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "cancelled_by" UUID,
ADD COLUMN     "cancellation_reason" TEXT,
ADD COLUMN     "cancels_document_id" UUID,
ADD COLUMN     "issued_by" UUID;

-- CreateIndex
CREATE INDEX "invoices_transaction_id_idx" ON "invoices"("transaction_id");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "payment_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: serie, snapshot e annullamento di una ricevuta.
ALTER TABLE "receipts" ADD COLUMN     "series" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sequence" INTEGER,
ADD COLUMN     "document_year" INTEGER,
ADD COLUMN     "operation_type_code" TEXT,
ADD COLUMN     "snapshot" JSONB,
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "cancelled_by" UUID,
ADD COLUMN     "cancellation_reason" TEXT,
ADD COLUMN     "cancels_document_id" UUID,
ADD COLUMN     "issued_by" UUID;

-- AlterTable: la serie entra nella chiave della sequenza.
--
-- Le righe esistenti prendono `''`, che e la serie in cui sono state emesse:
-- il vecchio vincolo (club, tipo, anno) e quindi un caso particolare del
-- nuovo, e nessuna sequenza si azzera o si sposta.
ALTER TABLE "document_number_sequences" ADD COLUMN "series" TEXT NOT NULL DEFAULT '';

DROP INDEX "document_number_sequences_organization_id_kind_year_key";

CREATE UNIQUE INDEX "document_number_sequences_organization_id_kind_series_year_key" ON "document_number_sequences"("organization_id", "kind", "series", "year");

-- AlterTable: quale dei due flussi Stripe ha generato l'evento.
--
-- `connect` come default e cio che erano tutti gli eventi ricevuti finora:
-- prima del Blocco D esisteva un solo webhook, quello degli incassi.
ALTER TABLE "payment_webhook_events" ADD COLUMN     "flow" TEXT NOT NULL DEFAULT 'connect',
ADD COLUMN     "external_account_id" TEXT;
