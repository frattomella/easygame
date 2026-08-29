-- Wave 2 / W2-C — Il registro delle consegne (ADR-0084).
--
-- Una tabella sola per quattro sorgenti: solleciti, automazioni, comunicazioni
-- massive e bacheca. L'indice unico e la difesa contro il doppione, e regge
-- anche con due esecuzioni del cron in parallelo — cosa che un controllo in
-- memoria non fa.

CREATE TABLE "communication_deliveries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "source_kind" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "dedup_key" TEXT NOT NULL,
    "recipient_key" TEXT NOT NULL,
    "recipient_user_id" UUID,
    "recipient_name" TEXT,
    "recipient_email" TEXT,
    "athlete_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "subject" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "communication_deliveries_dedup_unique"
    ON "communication_deliveries" ("organization_id", "dedup_key", "recipient_key", "channel");

CREATE INDEX "communication_deliveries_source_idx"
    ON "communication_deliveries" ("organization_id", "source_kind", "source_id");

CREATE INDEX "communication_deliveries_reader_idx"
    ON "communication_deliveries" ("organization_id", "recipient_user_id", "read_at");

CREATE INDEX "communication_deliveries_created_idx"
    ON "communication_deliveries" ("organization_id", "created_at");

ALTER TABLE "communication_deliveries"
    ADD CONSTRAINT "communication_deliveries_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
