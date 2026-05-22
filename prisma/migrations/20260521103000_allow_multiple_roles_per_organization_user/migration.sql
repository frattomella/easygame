-- Allow the same account to hold multiple independent roles in the same club.
-- Club ownership remains defined by clubs.creator_id, not by organization_users.role.
DROP INDEX IF EXISTS "organization_users_organization_id_user_id_key";

CREATE UNIQUE INDEX IF NOT EXISTS "organization_users_organization_id_user_id_role_key"
ON "organization_users"("organization_id", "user_id", "role");
