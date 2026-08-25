-- Allegati fuori dai record JSON (WP-15, ADR-0034).
--
-- Fino a qui un allegato era una stringa `data:...;base64,...` dentro
-- `athletes.data`, dentro il payload di un contratto, dentro un certificato.
-- Il costo si pagava a ogni lettura della riga, anche quando il file non
-- serviva.
--
-- Due tabelle, non una: `attachments` porta i metadati e la si legge spesso,
-- `attachment_blobs` porta i byte e la si legge solo quando qualcuno apre
-- davvero il file. Con il binario sulla stessa riga dei metadati, un
-- `SELECT` sui metadati farebbe risalire il TOAST — cioe il difetto che
-- questa migrazione esiste per chiudere.
--
-- La migrazione e **additiva**: non tocca, non legge e non riscrive nessun
-- dato esistente. Gli allegati legacy continuano a vivere nei record e a
-- funzionare (vedi `resolveAttachmentSource`).

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "owner_type" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "storage_driver" TEXT NOT NULL DEFAULT 'database',
    "storage_key" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "attachments_size_bytes_check" CHECK ("size_bytes" > 0)
);

-- CreateTable
CREATE TABLE "attachment_blobs" (
    "attachment_id" UUID NOT NULL,
    "content" BYTEA NOT NULL,

    CONSTRAINT "attachment_blobs_pkey" PRIMARY KEY ("attachment_id")
);

-- CreateIndex
CREATE INDEX "attachments_organization_id_idx" ON "attachments"("organization_id");

-- CreateIndex
CREATE INDEX "attachments_organization_id_owner_type_owner_id_idx" ON "attachments"("organization_id", "owner_type", "owner_id");

-- CreateIndex
CREATE INDEX "attachments_organization_id_checksum_idx" ON "attachments"("organization_id", "checksum");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment_blobs" ADD CONSTRAINT "attachment_blobs_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
