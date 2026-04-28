-- CreateTable
CREATE TABLE "athlete_category_memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "category_id" TEXT NOT NULL,
    "category_name" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "athlete_category_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "athlete_category_memberships_organization_id_athlete_id_ca_key"
ON "athlete_category_memberships"("organization_id", "athlete_id", "category_id");

-- CreateIndex
CREATE INDEX "athlete_category_memberships_organization_id_idx"
ON "athlete_category_memberships"("organization_id");

-- CreateIndex
CREATE INDEX "athlete_category_memberships_athlete_id_idx"
ON "athlete_category_memberships"("athlete_id");

-- CreateIndex
CREATE INDEX "athlete_category_memberships_organization_id_athlete_id_is_pri_idx"
ON "athlete_category_memberships"("organization_id", "athlete_id", "is_primary");

-- Guarantee a single primary category per athlete within the club
CREATE UNIQUE INDEX "athlete_category_memberships_single_primary_per_athlete"
ON "athlete_category_memberships"("organization_id", "athlete_id")
WHERE "is_primary" = true;

-- AddForeignKey
ALTER TABLE "athlete_category_memberships"
ADD CONSTRAINT "athlete_category_memberships_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "clubs"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_category_memberships"
ADD CONSTRAINT "athlete_category_memberships_athlete_id_fkey"
FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
