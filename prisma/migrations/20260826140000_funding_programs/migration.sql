-- Voucher e contributi legati alla frequenza (Workstream A, ADR-0037).
--
-- Un contributo pubblico non e un pagamento della famiglia, e un voucher
-- assegnato non e denaro incassato. Fino a qui EasyGame non aveva un posto
-- dove tenere questa distinzione: l'unico modo di registrare un contributo
-- sarebbe stato inventare un incasso, cioe dichiarare denaro che nessuno ha
-- ancora versato.
--
-- Cinque tabelle, ognuna per una domanda diversa:
--
--   funding_programs         quali sono le regole del bando
--   funding_enrollments      chi ne beneficia, con quale plafond
--   funding_accruals         quanto e maturato, periodo per periodo
--   funding_settlements      quando l'ente ha versato, e quanto
--   funding_settlement_lines a quali periodi di quali atleti quel versamento
--                            si riferisce
--
-- **Nessuna regola di un singolo bando e nel codice.** Importo per periodo,
-- frequenza, requisito minimo, unita del requisito, comportamento sotto
-- soglia e tetti sono colonne. Il Voucher per lo Sport della Regione Lazio
-- 2025 e una riga di `funding_programs`, non un ramo dentro il calcolo.
--
-- La migrazione e **additiva**: non tocca, non legge e non riscrive nessuna
-- tabella esistente. In particolare non tocca `payments` ne
-- `payment_transactions`: un contributo maturato non e un incasso, e le due
-- contabilita restano separate anche nello schema.

-- CreateTable
CREATE TABLE "funding_programs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "funder_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3) NOT NULL,
    "athlete_plafond" DOUBLE PRECISION NOT NULL,
    "period_amount" DOUBLE PRECISION NOT NULL,
    "period_frequency" TEXT NOT NULL DEFAULT 'monthly',
    "period_length_days" INTEGER,
    "requirement_unit" TEXT NOT NULL DEFAULT 'hours',
    "requirement_min" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unmet_behavior" TEXT NOT NULL DEFAULT 'none',
    "max_periods" INTEGER,
    "max_total_amount" DOUBLE PRECISION,
    "notes" TEXT,
    "data" JSONB,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "funding_programs_pkey" PRIMARY KEY ("id"),
    -- Un periodo che vale zero non e un contributo, e un plafond negativo non
    -- e un plafond.
    CONSTRAINT "funding_programs_amounts_check" CHECK ("athlete_plafond" >= 0 AND "period_amount" >= 0),
    -- Un periodo di validita che finisce prima di cominciare non produce
    -- nessun periodo, e nessuno se ne accorgerebbe.
    CONSTRAINT "funding_programs_validity_check" CHECK ("valid_to" >= "valid_from")
);

-- CreateTable
CREATE TABLE "funding_enrollments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "voucher_code" TEXT,
    "assigned_amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "enrolled_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "notes" TEXT,
    "data" JSONB,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "funding_enrollments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "funding_enrollments_assigned_amount_check" CHECK ("assigned_amount" >= 0)
);

-- CreateTable
CREATE TABLE "funding_accruals" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "period_index" INTEGER NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "period_label" TEXT NOT NULL,
    "requirement_min" DOUBLE PRECISION NOT NULL,
    "requirement_unit" TEXT NOT NULL,
    "measured_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "requirement_met" BOOLEAN NOT NULL DEFAULT false,
    "eligible_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "accrued_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unaccrued_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'not_accrued',
    "reported_at" TIMESTAMP(3),
    "reported_by" UUID,
    "computed_at" TIMESTAMP(3) NOT NULL,
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "funding_accruals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "funding_accruals_amounts_check" CHECK ("accrued_amount" >= 0 AND "eligible_amount" >= 0)
);

-- CreateTable
CREATE TABLE "funding_settlements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "reference" TEXT,
    "settled_at" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" TEXT,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "funding_settlements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "funding_settlements_amount_check" CHECK ("amount" > 0)
);

-- CreateTable
CREATE TABLE "funding_settlement_lines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "settlement_id" UUID NOT NULL,
    "accrual_id" UUID NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "funding_settlement_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "funding_settlement_lines_amount_check" CHECK ("amount" > 0)
);

-- CreateIndex
CREATE INDEX "funding_programs_organization_id_idx" ON "funding_programs"("organization_id");

-- CreateIndex
CREATE INDEX "funding_enrollments_organization_id_idx" ON "funding_enrollments"("organization_id");

-- CreateIndex
CREATE INDEX "funding_enrollments_athlete_id_idx" ON "funding_enrollments"("athlete_id");

-- Un atleta non si iscrive due volte allo stesso programma: due plafond sullo
-- stesso bando renderebbero il residuo indeterminato.
-- CreateIndex
CREATE UNIQUE INDEX "funding_enrollments_program_id_athlete_id_key" ON "funding_enrollments"("program_id", "athlete_id");

-- CreateIndex
CREATE INDEX "funding_accruals_organization_id_idx" ON "funding_accruals"("organization_id");

-- Il ricalcolo e idempotente **per questo vincolo**: ricalcolare aggiorna la
-- riga del periodo invece di aggiungerne una seconda.
-- CreateIndex
CREATE UNIQUE INDEX "funding_accruals_enrollment_id_period_index_key" ON "funding_accruals"("enrollment_id", "period_index");

-- CreateIndex
CREATE INDEX "funding_settlements_organization_id_idx" ON "funding_settlements"("organization_id");

-- CreateIndex
CREATE INDEX "funding_settlements_program_id_idx" ON "funding_settlements"("program_id");

-- CreateIndex
CREATE INDEX "funding_settlement_lines_organization_id_idx" ON "funding_settlement_lines"("organization_id");

-- CreateIndex
CREATE INDEX "funding_settlement_lines_accrual_id_idx" ON "funding_settlement_lines"("accrual_id");

-- Una liquidazione non copre due volte lo stesso periodo.
-- CreateIndex
CREATE UNIQUE INDEX "funding_settlement_lines_settlement_id_accrual_id_key" ON "funding_settlement_lines"("settlement_id", "accrual_id");

-- AddForeignKey
ALTER TABLE "funding_programs" ADD CONSTRAINT "funding_programs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_enrollments" ADD CONSTRAINT "funding_enrollments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_enrollments" ADD CONSTRAINT "funding_enrollments_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "funding_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_enrollments" ADD CONSTRAINT "funding_enrollments_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_accruals" ADD CONSTRAINT "funding_accruals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_accruals" ADD CONSTRAINT "funding_accruals_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "funding_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_settlements" ADD CONSTRAINT "funding_settlements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_settlements" ADD CONSTRAINT "funding_settlements_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "funding_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_settlement_lines" ADD CONSTRAINT "funding_settlement_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_settlement_lines" ADD CONSTRAINT "funding_settlement_lines_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "funding_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_settlement_lines" ADD CONSTRAINT "funding_settlement_lines_accrual_id_fkey" FOREIGN KEY ("accrual_id") REFERENCES "funding_accruals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
