-- Modulistica V2: i moduli escono da `clubs.document_templates` (ADR-0035).
--
-- Fino a qui un modulo online, e ogni risposta che aveva raccolto, erano
-- oggetti dentro lo stesso campo JSON dei modelli di stampa. Tre conseguenze
-- misurabili, tutte chiuse da questa migrazione:
--
--   1. salvare una risposta riscriveva l'intero array del club: due invii
--      contemporanei e l'ultimo vinceva, cancellando il primo;
--   2. risolvere uno slug pubblico voleva dire `document_templates @> ...`
--      su tutta la tabella `clubs`, senza indice utilizzabile;
--   3. modificare un modulo cambiava retroattivamente il significato delle
--      risposte gia raccolte, perche non esisteva nessuna versione.
--
-- Tre tabelle: il modulo (con la bozza), la versione pubblicata (immutabile),
-- la compilazione (che cita la versione con cui e stata compilata).
--
-- La migrazione e **additiva**: non legge, non tocca e non cancella
-- `clubs.document_templates`. I moduli gia esistenti si travasano con
-- `node scripts/migrate-forms-v2.mjs`, che e uno script a parte e va
-- autorizzato esplicitamente (vedi CLAUDE.md, sezione 8).

-- CreateTable
CREATE TABLE "form_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "public_slug" TEXT NOT NULL,
    "public_enabled" BOOLEAN NOT NULL DEFAULT true,
    "draft" JSONB NOT NULL,
    "published_version" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_template_versions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "schema_json" JSONB NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_by" UUID,

    CONSTRAINT "form_template_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "form_template_versions_version_check" CHECK ("version" > 0)
);

-- CreateTable
CREATE TABLE "form_submissions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'public',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "subjects" JSONB NOT NULL,
    "answers" JSONB NOT NULL,
    "files" JSONB NOT NULL,
    "respondent_name" TEXT,
    "respondent_email" TEXT,
    "submitted_by" UUID,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "form_templates_public_slug_key" ON "form_templates"("public_slug");

-- CreateIndex
CREATE INDEX "form_templates_organization_id_status_idx" ON "form_templates"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "form_template_versions_template_id_version_key" ON "form_template_versions"("template_id", "version");

-- CreateIndex
CREATE INDEX "form_template_versions_organization_id_idx" ON "form_template_versions"("organization_id");

-- CreateIndex
CREATE INDEX "form_submissions_organization_id_status_idx" ON "form_submissions"("organization_id", "status");

-- CreateIndex
CREATE INDEX "form_submissions_organization_id_template_id_submitted_at_idx" ON "form_submissions"("organization_id", "template_id", "submitted_at");

-- AddForeignKey
ALTER TABLE "form_templates" ADD CONSTRAINT "form_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_template_versions" ADD CONSTRAINT "form_template_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "form_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "form_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "form_template_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
