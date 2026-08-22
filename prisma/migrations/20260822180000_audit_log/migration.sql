-- Audit log delle operazioni sensibili (ADR-0019).
--
-- Nota: `prisma migrate diff` propone anche di rimuovere i default a livello
-- colonna di `athlete_category_memberships` e di rinominarne due indici. E il
-- drift cosmetico documentato come D19 in docs/knowledge-base/16-technical-debt.md:
-- il comportamento applicativo e identico e non c'e una ragione funzionale per
-- toccarlo, quindi quelle istruzioni sono state escluse di proposito.

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT 'success',
    "actor_user_id" UUID,
    "actor_email" TEXT,
    "actor_role" TEXT,
    "organization_id" UUID,
    "resource" TEXT,
    "resource_id" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");
