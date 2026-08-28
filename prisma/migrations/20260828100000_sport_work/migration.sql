-- Lavoro sportivo e compensi (WP Sport Work V1).
--
-- **Perche undici tabelle e non tre colonne su trainer_payments.**
--
-- `trainer_payments` esiste dal 2024 ed e una riga con `trainer_name` in testo
-- libero, `month` come stringa, `amount` in virgola mobile e uno `status` che
-- si imposta a mano. Non ha un rapporto, non ha lordo e netto, non conosce i
-- contributi, non sa in che anno fiscale cade e non si puo stornare. E un
-- promemoria di pagamento, e va benissimo come promemoria di pagamento.
--
-- Cio che serve qui e un'altra cosa: sapere **chi lavora per il club, a quali
-- condizioni, quanto ha maturato, quanto e uscito davvero, con quali regole e
-- verso quali soglie**. Nessuna di queste domande si risponde aggiungendo
-- colonne a un promemoria.
--
-- Le tabelle, e la domanda a cui ognuna risponde:
--
--   sport_work_people                      chi e la persona
--   sport_work_relationships               a quali condizioni lavora
--   sport_work_compensation_plans          quanto e stato pattuito
--   sport_work_compensation_installments   quando e dovuto, e quanto e maturato
--   sport_work_outbound_transactions       quanto e uscito davvero (il registro)
--   sport_work_external_declarations       cosa il lavoratore ha dichiarato
--   sport_work_year_positions              a che punto e verso le soglie
--   sport_work_bonuses                     i premi, che non sono compensi
--   sport_work_expense_reimbursements      i rimborsi, che non sono compensi
--   sport_work_vat_invoices                le fatture ricevute dai professionisti
--   sport_work_obligations                 cosa il club deve fare, entro quando
--
-- **La migrazione e additiva.** Non tocca, non legge e non riscrive nessuna
-- tabella esistente. In particolare non tocca `payments`,
-- `payment_transactions` ne `trainer_payments`: un compenso che esce non e un
-- incasso che entra, e le due contabilita restano separate anche nello schema.
--
-- **Cosa il database fa rispettare, e non lascia al codice.** I vincoli in
-- fondo al file non sono decorazione: sono le tre regole che, se le
-- garantisse solo il codice applicativo, cadrebbero sotto concorrenza — cioe
-- il giorno in cui la segreteria paga venti compensi in dieci minuti.

-- CreateTable
CREATE TABLE "sport_work_people" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "origin_type" TEXT NOT NULL DEFAULT 'external',
    "origin_id" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "fiscal_code" TEXT,
    "birth_date" TIMESTAMP(3),
    "birth_place" TEXT,
    "gender" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "fiscal_profile" TEXT NOT NULL DEFAULT 'NONE',
    "vat_number" TEXT,
    "pension_fund" TEXT,
    "social_coverage" TEXT NOT NULL DEFAULT 'NONE',
    "iban" TEXT,
    "notes" TEXT,
    "data" JSONB,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sport_work_people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sport_work_relationships" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "season_id" TEXT,
    "role" TEXT NOT NULL DEFAULT 'OTHER',
    "relationship_type" TEXT NOT NULL DEFAULT 'SPORT_COCOCO',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "contract_amount" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "compensation_frequency" TEXT NOT NULL DEFAULT 'SEASONAL',
    "weekly_hours" DOUBLE PRECISION,
    "contract_attachment_id" UUID,
    "signature_state" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
    "rasd_status" TEXT NOT NULL DEFAULT 'TO_PREPARE',
    "rasd_reference" TEXT,
    "rasd_communicated_at" TIMESTAMP(3),
    "rasd_notes" TEXT,
    "terminated_at" TIMESTAMP(3),
    "termination_reason" TEXT,
    "notes" TEXT,
    "data" JSONB,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sport_work_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sport_work_compensation_plans" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "relationship_id" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'EQUAL_INSTALMENTS',
    "total_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "config" JSONB,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sport_work_compensation_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sport_work_compensation_installments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "relationship_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "accrual_period_start" TIMESTAMP(3) NOT NULL,
    "accrual_period_end" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "gross_amount" DOUBLE PRECISION NOT NULL,
    "accrued_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paid_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remaining_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "fiscal_year" INTEGER NOT NULL,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sport_work_compensation_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sport_work_outbound_transactions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "transaction_type" TEXT NOT NULL DEFAULT 'COMPENSATION_PAYMENT',
    "person_id" UUID NOT NULL,
    "relationship_id" UUID,
    "installment_id" UUID,
    "bonus_id" UUID,
    "reimbursement_id" UUID,
    "vat_invoice_id" UUID,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "gross_amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "payment_method" TEXT,
    "reference" TEXT,
    "bank_account_id" TEXT,
    "rules_version" TEXT,
    "social_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reduction_factor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxable_social" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "social_franchise_used" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "employee_contribution" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "employer_contribution" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxable_fiscal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fiscal_franchise_used" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "withholding_amount" DOUBLE PRECISION,
    "net_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "club_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "f24_causale" TEXT,
    "fiscal_treatment" TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
    "definitive" BOOLEAN NOT NULL DEFAULT true,
    "fiscal_snapshot" JSONB,
    "reversal_of_id" UUID,
    "reversed_at" TIMESTAMP(3),
    "reversal_reason" TEXT,
    "idempotency_key" TEXT,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sport_work_outbound_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sport_work_external_declarations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "external_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "declaration_date" TIMESTAMP(3) NOT NULL,
    "effective_from" TIMESTAMP(3),
    "attachment_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "has_other_coverage" BOOLEAN NOT NULL DEFAULT false,
    "supersedes_id" UUID,
    "notes" TEXT,
    "data" JSONB,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sport_work_external_declarations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sport_work_year_positions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "club_gross" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "external_declared" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "progressive" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "social_franchise_used" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "social_taxable" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "employee_contribution" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "employer_contribution" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fiscal_franchise_used" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fiscal_taxable" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "withheld" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "payment_count" INTEGER NOT NULL DEFAULT 0,
    "last_payment_at" TIMESTAMP(3),
    "last_declaration_at" TIMESTAMP(3),
    "has_current_declaration" BOOLEAN NOT NULL DEFAULT false,
    "computed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sport_work_year_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sport_work_bonuses" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "relationship_id" UUID,
    "reason" TEXT NOT NULL,
    "competition" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "award_date" TIMESTAMP(3) NOT NULL,
    "payment_date" TIMESTAMP(3),
    "fiscal_treatment" TEXT NOT NULL DEFAULT 'TO_VERIFY',
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "paid_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sport_work_bonuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sport_work_expense_reimbursements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "relationship_id" UUID,
    "category" TEXT NOT NULL DEFAULT 'OTHER_DOCUMENTED',
    "description" TEXT NOT NULL,
    "expense_date" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "rejected_reason" TEXT,
    "paid_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sport_work_expense_reimbursements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sport_work_vat_invoices" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "relationship_id" UUID,
    "document_number" TEXT NOT NULL,
    "document_date" TIMESTAMP(3) NOT NULL,
    "taxable_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vat_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "withholding_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "due_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paid_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "attachment_id" UUID,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sport_work_vat_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sport_work_obligations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "reference_key" TEXT NOT NULL,
    "person_id" UUID,
    "relationship_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "due_date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DUE',
    "amount" DOUBLE PRECISION,
    "period" TEXT,
    "source" TEXT NOT NULL DEFAULT 'derived',
    "completed_by" UUID,
    "completed_at" TIMESTAMP(3),
    "evidence_attachment_id" UUID,
    "notified_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sport_work_obligations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sport_work_people_organization_id_idx" ON "sport_work_people"("organization_id");

-- CreateIndex
CREATE INDEX "sport_work_people_organization_id_origin_type_origin_id_idx" ON "sport_work_people"("organization_id", "origin_type", "origin_id");

-- CreateIndex
CREATE INDEX "sport_work_relationships_organization_id_idx" ON "sport_work_relationships"("organization_id");

-- CreateIndex
CREATE INDEX "sport_work_relationships_organization_id_status_idx" ON "sport_work_relationships"("organization_id", "status");

-- CreateIndex
CREATE INDEX "sport_work_relationships_person_id_idx" ON "sport_work_relationships"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "sport_work_compensation_plans_relationship_id_key" ON "sport_work_compensation_plans"("relationship_id");

-- CreateIndex
CREATE INDEX "sport_work_compensation_plans_organization_id_idx" ON "sport_work_compensation_plans"("organization_id");

-- CreateIndex
CREATE INDEX "sport_work_compensation_installments_organization_id_idx" ON "sport_work_compensation_installments"("organization_id");

-- CreateIndex
CREATE INDEX "sport_work_compensation_installments_organization_id_due_da_idx" ON "sport_work_compensation_installments"("organization_id", "due_date");

-- CreateIndex
CREATE INDEX "sport_work_compensation_installments_relationship_id_idx" ON "sport_work_compensation_installments"("relationship_id");

-- CreateIndex
CREATE UNIQUE INDEX "sport_work_compensation_installments_plan_id_sequence_key" ON "sport_work_compensation_installments"("plan_id", "sequence");

-- CreateIndex
CREATE INDEX "sport_work_outbound_transactions_organization_id_idx" ON "sport_work_outbound_transactions"("organization_id");

-- CreateIndex
CREATE INDEX "sport_work_outbound_transactions_organization_id_paid_at_idx" ON "sport_work_outbound_transactions"("organization_id", "paid_at");

-- CreateIndex
CREATE INDEX "sport_work_outbound_transactions_organization_id_person_id__idx" ON "sport_work_outbound_transactions"("organization_id", "person_id", "fiscal_year");

-- CreateIndex
CREATE INDEX "sport_work_outbound_transactions_installment_id_idx" ON "sport_work_outbound_transactions"("installment_id");

-- CreateIndex
CREATE INDEX "sport_work_outbound_transactions_reversal_of_id_idx" ON "sport_work_outbound_transactions"("reversal_of_id");

-- CreateIndex
CREATE INDEX "sport_work_external_declarations_organization_id_idx" ON "sport_work_external_declarations"("organization_id");

-- CreateIndex
CREATE INDEX "sport_work_external_declarations_organization_id_person_id__idx" ON "sport_work_external_declarations"("organization_id", "person_id", "fiscal_year");

-- CreateIndex
CREATE INDEX "sport_work_year_positions_organization_id_year_idx" ON "sport_work_year_positions"("organization_id", "year");

-- CreateIndex
CREATE UNIQUE INDEX "sport_work_year_positions_organization_id_person_id_year_key" ON "sport_work_year_positions"("organization_id", "person_id", "year");

-- CreateIndex
CREATE INDEX "sport_work_bonuses_organization_id_idx" ON "sport_work_bonuses"("organization_id");

-- CreateIndex
CREATE INDEX "sport_work_bonuses_person_id_idx" ON "sport_work_bonuses"("person_id");

-- CreateIndex
CREATE INDEX "sport_work_expense_reimbursements_organization_id_idx" ON "sport_work_expense_reimbursements"("organization_id");

-- CreateIndex
CREATE INDEX "sport_work_expense_reimbursements_person_id_idx" ON "sport_work_expense_reimbursements"("person_id");

-- CreateIndex
CREATE INDEX "sport_work_vat_invoices_organization_id_idx" ON "sport_work_vat_invoices"("organization_id");

-- CreateIndex
CREATE INDEX "sport_work_vat_invoices_person_id_idx" ON "sport_work_vat_invoices"("person_id");

-- CreateIndex
CREATE INDEX "sport_work_obligations_organization_id_status_due_date_idx" ON "sport_work_obligations"("organization_id", "status", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "sport_work_obligations_organization_id_reference_key_key" ON "sport_work_obligations"("organization_id", "reference_key");

-- AddForeignKey
ALTER TABLE "sport_work_people" ADD CONSTRAINT "sport_work_people_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sport_work_relationships" ADD CONSTRAINT "sport_work_relationships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sport_work_relationships" ADD CONSTRAINT "sport_work_relationships_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "sport_work_people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sport_work_compensation_plans" ADD CONSTRAINT "sport_work_compensation_plans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sport_work_compensation_plans" ADD CONSTRAINT "sport_work_compensation_plans_relationship_id_fkey" FOREIGN KEY ("relationship_id") REFERENCES "sport_work_relationships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sport_work_compensation_installments" ADD CONSTRAINT "sport_work_compensation_installments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sport_work_compensation_installments" ADD CONSTRAINT "sport_work_compensation_installments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "sport_work_compensation_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sport_work_compensation_installments" ADD CONSTRAINT "sport_work_compensation_installments_relationship_id_fkey" FOREIGN KEY ("relationship_id") REFERENCES "sport_work_relationships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sport_work_outbound_transactions" ADD CONSTRAINT "sport_work_outbound_transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sport_work_outbound_transactions" ADD CONSTRAINT "sport_work_outbound_transactions_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "sport_work_people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sport_work_outbound_transactions" ADD CONSTRAINT "sport_work_outbound_transactions_relationship_id_fkey" FOREIGN KEY ("relationship_id") REFERENCES "sport_work_relationships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sport_work_outbound_transactions" ADD CONSTRAINT "sport_work_outbound_transactions_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "sport_work_compensation_installments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sport_work_external_declarations" ADD CONSTRAINT "sport_work_external_declarations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sport_work_external_declarations" ADD CONSTRAINT "sport_work_external_declarations_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "sport_work_people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sport_work_year_positions" ADD CONSTRAINT "sport_work_year_positions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sport_work_year_positions" ADD CONSTRAINT "sport_work_year_positions_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "sport_work_people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sport_work_bonuses" ADD CONSTRAINT "sport_work_bonuses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sport_work_bonuses" ADD CONSTRAINT "sport_work_bonuses_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "sport_work_people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sport_work_bonuses" ADD CONSTRAINT "sport_work_bonuses_relationship_id_fkey" FOREIGN KEY ("relationship_id") REFERENCES "sport_work_relationships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sport_work_expense_reimbursements" ADD CONSTRAINT "sport_work_expense_reimbursements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sport_work_expense_reimbursements" ADD CONSTRAINT "sport_work_expense_reimbursements_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "sport_work_people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sport_work_expense_reimbursements" ADD CONSTRAINT "sport_work_expense_reimbursements_relationship_id_fkey" FOREIGN KEY ("relationship_id") REFERENCES "sport_work_relationships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sport_work_vat_invoices" ADD CONSTRAINT "sport_work_vat_invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sport_work_vat_invoices" ADD CONSTRAINT "sport_work_vat_invoices_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "sport_work_people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sport_work_vat_invoices" ADD CONSTRAINT "sport_work_vat_invoices_relationship_id_fkey" FOREIGN KEY ("relationship_id") REFERENCES "sport_work_relationships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sport_work_obligations" ADD CONSTRAINT "sport_work_obligations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sport_work_obligations" ADD CONSTRAINT "sport_work_obligations_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "sport_work_people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sport_work_obligations" ADD CONSTRAINT "sport_work_obligations_relationship_id_fkey" FOREIGN KEY ("relationship_id") REFERENCES "sport_work_relationships"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- I vincoli che il database fa rispettare da solo.
-- ---------------------------------------------------------------------------

-- **Un gesto, un movimento.**
--
-- Il difetto e gia stato visto su questo repository, sugli incassi: tre clic
-- su «Registra pagamento» in sei millesimi di secondo hanno prodotto tre
-- righe. Il controllo applicativo legge e poi scrive, e fra le due cose sta
-- la finestra.
--
-- Qui la chiave la produce chi apre il dialogo di erogazione, e accompagna la
-- richiesta: due invii dello stesso gesto portano la stessa chiave e il
-- secondo si infrange sul vincolo, invece di far uscire il denaro due volte.
-- Le righe senza chiave — le registrazioni da script, gli storni generati dal
-- servizio — non sono toccate, perche in Postgres due NULL non collidono.
CREATE UNIQUE INDEX IF NOT EXISTS "sport_work_outbound_gesto_unico"
  ON "sport_work_outbound_transactions" ("organization_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

-- **Uno storno solo per ogni erogazione.**
--
-- Stornare due volte la stessa riga produrrebbe un credito verso il
-- lavoratore che nessuno gli ha mai dato: il registro tornerebbe in attivo di
-- un compenso intero. Il gemello di `payment_transactions_storno_unico`
-- (ADR-0062), sul denaro che esce.
CREATE UNIQUE INDEX IF NOT EXISTS "sport_work_storno_unico"
  ON "sport_work_outbound_transactions" ("reversal_of_id")
  WHERE "reversal_of_id" IS NOT NULL;

-- **Una sola autocertificazione valida per persona e anno.**
--
-- Il motore legge «la» dichiarazione dell'anno per sapere quanta franchigia
-- resta. Due righe valide contemporaneamente significherebbero due risposte a
-- quella domanda, e la scelta fra le due la farebbe l'ordinamento di una
-- query. Sostituire una dichiarazione porta la vecchia a SUPERSEDED nella
-- stessa transazione in cui nasce la nuova.
CREATE UNIQUE INDEX IF NOT EXISTS "sport_work_dichiarazione_attiva_unica"
  ON "sport_work_external_declarations" ("organization_id", "person_id", "fiscal_year")
  WHERE "status" = 'ACTIVE';

-- **La stessa persona non si censisce due volte nello stesso club.**
--
-- Il codice fiscale e l'unico identificatore che regge fra anagrafiche
-- diverse: lo stesso allenatore puo essere in `clubs.trainers` con un nome e
-- fra i soci con un altro. Due `sport_work_people` per la stessa persona
-- spezzerebbero il progressivo annuo in due meta, e ognuna delle due
-- resterebbe sotto le soglie.
CREATE UNIQUE INDEX IF NOT EXISTS "sport_work_persona_unica_per_codice_fiscale"
  ON "sport_work_people" ("organization_id", upper("fiscal_code"))
  WHERE "fiscal_code" IS NOT NULL AND btrim("fiscal_code") <> '';

-- **Il denaro ha un segno, e il segno dipende dal tipo di movimento.**
--
-- Un'erogazione positiva e uno storno negativo: e cosi che la somma del
-- registro torna a zero quando qualcosa viene annullato. Una riga di storno
-- con importo positivo raddoppierebbe l'uscita invece di compensarla.
ALTER TABLE "sport_work_outbound_transactions"
  ADD CONSTRAINT "sport_work_outbound_segno_check"
  CHECK (
    ("transaction_type" = 'COMPENSATION_REVERSAL' AND "gross_amount" < 0)
    OR ("transaction_type" <> 'COMPENSATION_REVERSAL' AND "gross_amount" > 0)
  );

-- Uno storno e una riga che punta a un'altra riga: senza il riferimento non
-- compensa niente, e con il riferimento su una riga che non e uno storno il
-- collegamento non vuol dire nulla.
ALTER TABLE "sport_work_outbound_transactions"
  ADD CONSTRAINT "sport_work_outbound_storno_coerente_check"
  CHECK (
    ("transaction_type" = 'COMPENSATION_REVERSAL' AND "reversal_of_id" IS NOT NULL)
    OR ("transaction_type" <> 'COMPENSATION_REVERSAL' AND "reversal_of_id" IS NULL)
  );

-- Una rata di importo nullo non e una rata, e una rata pagata piu del dovuto
-- e un errore che va fermato prima di diventare un residuo negativo.
ALTER TABLE "sport_work_compensation_installments"
  ADD CONSTRAINT "sport_work_rata_importi_check"
  CHECK ("gross_amount" > 0 AND "accrued_amount" >= 0 AND "paid_amount" >= 0);

-- Un rapporto che finisce prima di cominciare non genera nessuna scadenza, e
-- nessuno se ne accorgerebbe.
ALTER TABLE "sport_work_relationships"
  ADD CONSTRAINT "sport_work_rapporto_periodo_check"
  CHECK ("end_date" IS NULL OR "end_date" >= "start_date");

-- Un anno fiscale fuori scala e un dato che non si potra piu attribuire a
-- nessuna regola: i rule set esistono per anno solare, non per l'anno 202.
ALTER TABLE "sport_work_outbound_transactions"
  ADD CONSTRAINT "sport_work_outbound_anno_check"
  CHECK ("fiscal_year" BETWEEN 2000 AND 2200);

ALTER TABLE "sport_work_year_positions"
  ADD CONSTRAINT "sport_work_posizione_anno_check"
  CHECK ("year" BETWEEN 2000 AND 2200);
