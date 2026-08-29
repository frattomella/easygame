-- Wave 3 / barriera — Il motore documentale, i consensi, la validita di un
-- allegato.
--
-- Sei tabelle e due colonne, in un commit solo e prima di aprire qualunque
-- lane. E la lezione della Wave 2: tre migrazioni scritte in parallelo
-- collidono sui timestamp, e quattro copie della stessa matrice dei permessi
-- restano indietro in silenzio.
--
-- **`clubs.document_templates` non viene toccata.** La colonna JSON resta dove
-- e: il travaso e una copia, come per i moduli online (ADR-0039). Il giorno in
-- cui qualcuno decidera di svuotarla, sara una decisione a se.
--
-- La tabella si chiama `document_templates_v2` e non `document_templates`
-- perche `document_templates` e gia il nome di una **colonna** di `clubs` e
-- della risorsa che la espone: due nomi identici per due cose diverse, nello
-- stesso periodo in cui convivono, sono un errore che si paga a ogni lettura.

-- ---------------------------------------------------------------- allegati

-- La validita di un documento e una proprieta del documento, e il documento e
-- la riga di `attachments`. Lo **stato** (valido / in scadenza / scaduto) non
-- e qui: si ricava da `valid_until` e da oggi.
ALTER TABLE "attachments" ADD COLUMN "valid_from" TIMESTAMP(3);
ALTER TABLE "attachments" ADD COLUMN "valid_until" TIMESTAMP(3);

-- Il giro notturno chiede «cosa scade fra N giorni in questo club»: senza
-- indice sarebbe una scansione di tutti gli allegati del club.
CREATE INDEX "attachments_organization_id_valid_until_idx"
    ON "attachments" ("organization_id", "valid_until");

-- ----------------------------------------------------------------- modelli

CREATE TABLE "document_templates_v2" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "subject_kind" TEXT NOT NULL DEFAULT 'athlete',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "published_version" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP(3),
    "catalog_key" TEXT,
    "catalog_class" TEXT,
    "editorial_owner" TEXT,
    "last_reviewed_at" TIMESTAMP(3),
    "editorial_notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_templates_v2_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "document_templates_v2_organization_id_status_idx"
    ON "document_templates_v2" ("organization_id", "status");

CREATE INDEX "document_templates_v2_organization_id_catalog_key_idx"
    ON "document_templates_v2" ("organization_id", "catalog_key");

-- ---------------------------------------------------------------- versioni

-- Immutabile. Nessuna `updated_at`, ed e voluto: una riga che non si aggiorna
-- non ha bisogno di dire quando e stata aggiornata.
CREATE TABLE "document_template_versions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content_html" TEXT NOT NULL,
    "placeholder_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sensitivity" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject_kind" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_by" UUID,

    CONSTRAINT "document_template_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_template_versions_template_id_version_key"
    ON "document_template_versions" ("template_id", "version");

CREATE INDEX "document_template_versions_organization_id_idx"
    ON "document_template_versions" ("organization_id");

-- ------------------------------------------------------ documenti generati

CREATE TABLE "generated_documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "subject_kind" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "subject_label" TEXT,
    "season_id" TEXT,
    "values_snapshot" JSONB NOT NULL,
    "content_html" TEXT NOT NULL,
    "unresolved" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "missing" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sensitivity" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "protocol_number" TEXT,
    "status" TEXT NOT NULL DEFAULT 'generated',
    "signed_attachment_id" UUID,
    "signed_at" TIMESTAMP(3),
    "batch_id" TEXT,
    "generated_by" UUID,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generated_documents_pkey" PRIMARY KEY ("id")
);

-- L'idempotenza del lotto. In PostgreSQL un indice unico non vincola le righe
-- con un `NULL` nelle colonne indicizzate: le generazioni singole
-- (`batch_id IS NULL`) restano quindi libere di ripetersi — ed e giusto, due
-- attestazioni chieste due volte sono due documenti — mentre dentro un lotto
-- lo stesso soggetto compare una volta sola. E cio che rende un nuovo
-- tentativo capace di rigenerare **solo** i falliti.
CREATE UNIQUE INDEX "generated_documents_organization_id_batch_id_subject_kind_s_key"
    ON "generated_documents" ("organization_id", "batch_id", "subject_kind", "subject_id");

CREATE INDEX "generated_documents_organization_id_subject_kind_subject_id_idx"
    ON "generated_documents" ("organization_id", "subject_kind", "subject_id");

CREATE INDEX "generated_documents_organization_id_template_id_idx"
    ON "generated_documents" ("organization_id", "template_id");

CREATE INDEX "generated_documents_organization_id_generated_at_idx"
    ON "generated_documents" ("organization_id", "generated_at");

CREATE INDEX "generated_documents_organization_id_batch_id_idx"
    ON "generated_documents" ("organization_id", "batch_id");

-- ---------------------------------------------------------------- consensi

CREATE TABLE "consent_definitions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "published_version" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consent_definitions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "consent_definitions_organization_id_key_key"
    ON "consent_definitions" ("organization_id", "key");

CREATE INDEX "consent_definitions_organization_id_status_idx"
    ON "consent_definitions" ("organization_id", "status");

CREATE TABLE "consent_versions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "definition_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body_text" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_by" UUID,

    CONSTRAINT "consent_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "consent_versions_definition_id_version_key"
    ON "consent_versions" ("definition_id", "version");

CREATE INDEX "consent_versions_organization_id_idx"
    ON "consent_versions" ("organization_id");

-- Append-only: nessuna colonna `updated_at`, perche nessuna riga si aggiorna.
-- Una revoca e una riga in piu, non una modifica di quella prima.
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "definition_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "subject_kind" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "subject_label" TEXT,
    "status" TEXT NOT NULL,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by" UUID,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "evidence_kind" TEXT,
    "evidence_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "consent_records_organization_id_definition_id_subject_kind__idx"
    ON "consent_records" ("organization_id", "definition_id", "subject_kind", "subject_id", "decided_at");

CREATE INDEX "consent_records_organization_id_subject_kind_subject_id_idx"
    ON "consent_records" ("organization_id", "subject_kind", "subject_id");

CREATE INDEX "consent_records_organization_id_evidence_kind_evidence_id_idx"
    ON "consent_records" ("organization_id", "evidence_kind", "evidence_id");

-- ------------------------------------------------------------ le relazioni

ALTER TABLE "document_templates_v2"
    ADD CONSTRAINT "document_templates_v2_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_template_versions"
    ADD CONSTRAINT "document_template_versions_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "document_templates_v2"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "generated_documents"
    ADD CONSTRAINT "generated_documents_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- `RESTRICT` e non `CASCADE`, ed e l'invariante del §5 del planning scritta
-- nel database: cancellare un modello o una versione che un documento cita
-- **non si puo**. Un modello con documenti generati si archivia.
ALTER TABLE "generated_documents"
    ADD CONSTRAINT "generated_documents_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "document_templates_v2"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "generated_documents"
    ADD CONSTRAINT "generated_documents_version_id_fkey"
    FOREIGN KEY ("version_id") REFERENCES "document_template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "consent_definitions"
    ADD CONSTRAINT "consent_definitions_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "consent_versions"
    ADD CONSTRAINT "consent_versions_definition_id_fkey"
    FOREIGN KEY ("definition_id") REFERENCES "consent_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "consent_records"
    ADD CONSTRAINT "consent_records_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "consent_records"
    ADD CONSTRAINT "consent_records_definition_id_fkey"
    FOREIGN KEY ("definition_id") REFERENCES "consent_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Anche qui `RESTRICT`: la versione che qualcuno ha accettato non si cancella,
-- o «a cosa ha detto di si» torna a essere una domanda senza risposta.
ALTER TABLE "consent_records"
    ADD CONSTRAINT "consent_records_version_id_fkey"
    FOREIGN KEY ("version_id") REFERENCES "consent_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
