-- Wave 2 / W2-B — Il link di pagamento (G-06, ADR-0085).
--
-- Si conserva l'hash del token, mai il token: chi legge il database non
-- ottiene link funzionanti. E la stessa scelta gia fatta per `code_hash` delle
-- sfide di verifica e per i token di reset password.

CREATE TABLE "payment_links" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "athlete_id" UUID,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_by" UUID,
    "last_used_at" TIMESTAMP(3),
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_links_token_hash_key" ON "payment_links" ("token_hash");

CREATE INDEX "payment_links_organization_id_payment_id_idx"
    ON "payment_links" ("organization_id", "payment_id");

CREATE INDEX "payment_links_expires_at_idx" ON "payment_links" ("expires_at");

ALTER TABLE "payment_links"
    ADD CONSTRAINT "payment_links_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
