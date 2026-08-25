-- Multi-sede: sedi, gruppi operativi e sede dell'appartenenza (ADR-0036).
--
-- Il problema che chiude: la stessa categoria svolta in citta diverse veniva
-- duplicata a mano (`Pulcini - Roma`, `Pulcini - Aprilia`), e con lei fascia
-- d'anno, compatibilita e ogni elenco che ragiona per categoria.
--
-- La migrazione e **additiva** e non riscrive nessun dato esistente:
--
--   * `clubs.club_sites` e `clubs.category_groups` nascono NULL. Un club senza
--     sedi resta esattamente com'e: `isMultiSiteClub` e falsa e nessuna
--     interfaccia mostra il concetto di sede;
--   * `athlete_category_memberships.site_id` nasce NULL. NULL non significa
--     «nessuna sede» ma «sede non dichiarata», e i filtri lo trattano come
--     presente ovunque: nessun atleta storico puo sparire da un elenco.
--
-- Non c'e vincolo di chiave esterna su `site_id` perche le sedi vivono in una
-- colonna JSON del club, come tutte le altre risorse di club (ADR-0010). Il
-- vincolo che conta e comunque `organization_id`, gia presente.

-- AlterTable
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "club_sites" JSONB;
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "category_groups" JSONB;

-- AlterTable
ALTER TABLE "athlete_category_memberships" ADD COLUMN IF NOT EXISTS "site_id" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "athlete_category_memberships_organization_id_site_id_idx"
ON "athlete_category_memberships"("organization_id", "site_id");
