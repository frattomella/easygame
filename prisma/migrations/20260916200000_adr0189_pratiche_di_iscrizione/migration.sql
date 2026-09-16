-- ADR-0189: una domanda di iscrizione online e una pratica. Additiva:
-- colonne nullable o con default su form_submissions, due tabelle nuove.
-- Nessuna riga esistente viene riscritta o reinterpretata.

ALTER TABLE "form_submissions"
    ADD COLUMN "declarations" JSONB,
    ADD COLUMN "snapshot_hash" TEXT,
    ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "changes_requested" JSONB,
    ADD COLUMN "athlete_id" UUID,
    ADD COLUMN "trial_athlete_id" UUID,
    ADD COLUMN "archived_at" TIMESTAMP(3);

CREATE INDEX "form_submissions_organization_id_athlete_id_idx"
    ON "form_submissions"("organization_id", "athlete_id");

CREATE TABLE "form_submission_revisions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "files" JSONB NOT NULL,
    "declarations" JSONB,
    "snapshot_hash" TEXT,
    "reason" JSONB,
    "submitted_at" TIMESTAMP(3) NOT NULL,
    "superseded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "form_submission_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "form_submission_revisions_submission_id_revision_key"
    ON "form_submission_revisions"("submission_id", "revision");
CREATE INDEX "form_submission_revisions_organization_id_idx"
    ON "form_submission_revisions"("organization_id");

ALTER TABLE "form_submission_revisions"
    ADD CONSTRAINT "form_submission_revisions_submission_id_fkey"
    FOREIGN KEY ("submission_id") REFERENCES "form_submissions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "form_drafts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "resume_token_hash" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "respondent_email" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "submitted_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "form_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "form_drafts_resume_token_hash_key" ON "form_drafts"("resume_token_hash");
CREATE INDEX "form_drafts_organization_id_template_id_idx" ON "form_drafts"("organization_id", "template_id");
CREATE INDEX "form_drafts_expires_at_idx" ON "form_drafts"("expires_at");

ALTER TABLE "form_drafts"
    ADD CONSTRAINT "form_drafts_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "form_templates"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_drafts"
    ADD CONSTRAINT "form_drafts_version_id_fkey"
    FOREIGN KEY ("version_id") REFERENCES "form_template_versions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
