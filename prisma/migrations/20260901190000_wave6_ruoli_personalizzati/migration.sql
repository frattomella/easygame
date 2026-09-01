-- Wave 6, lane 6G — Ruoli personalizzati di club (blocker W6-1).
--
-- Migrazione **additiva**: zero righe in queste tabelle e una colonna nulla
-- riproducono esattamente il comportamento di oggi. Nessun backfill, nessuna
-- riscrittura di `organization_users.role`.
--
-- `club_access_scopes` con zero righe significa **tutto il club**: e la scelta
-- che rende additiva anche la parte del perimetro (§9.3 del piano 41).

CREATE TABLE "club_roles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "base_role" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "club_roles_organization_id_slug_key" ON "club_roles"("organization_id", "slug");
CREATE INDEX "club_roles_organization_id_idx" ON "club_roles"("organization_id");

CREATE TABLE "club_role_permissions" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_role_permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "club_role_permissions_role_id_permission_key_key" ON "club_role_permissions"("role_id", "permission_key");
CREATE INDEX "club_role_permissions_role_id_idx" ON "club_role_permissions"("role_id");

CREATE TABLE "club_access_scopes" (
    "id" UUID NOT NULL,
    "organization_user_id" UUID NOT NULL,
    "scope_kind" TEXT NOT NULL,
    "scope_value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_access_scopes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "club_access_scopes_organization_user_id_scope_kind_scope_val_key" ON "club_access_scopes"("organization_user_id", "scope_kind", "scope_value");
CREATE INDEX "club_access_scopes_organization_user_id_idx" ON "club_access_scopes"("organization_user_id");

ALTER TABLE "organization_users" ADD COLUMN "custom_role_id" UUID;
CREATE INDEX "organization_users_custom_role_id_idx" ON "organization_users"("custom_role_id");

ALTER TABLE "club_roles" ADD CONSTRAINT "club_roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "club_role_permissions" ADD CONSTRAINT "club_role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "club_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "club_access_scopes" ADD CONSTRAINT "club_access_scopes_organization_user_id_fkey" FOREIGN KEY ("organization_user_id") REFERENCES "organization_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- `RESTRICT` e non `CASCADE`, ed e deliberato: cancellare un ruolo mentre
-- qualcuno lo porta non deve **cancellargli la tessera**, cioe toglierlo dal
-- club in silenzio. Il dominio revoca prima le assegnazioni, con una riga di
-- audit per ciascuna, e solo allora il ruolo si puo eliminare.
ALTER TABLE "organization_users" ADD CONSTRAINT "organization_users_custom_role_id_fkey" FOREIGN KEY ("custom_role_id") REFERENCES "club_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
