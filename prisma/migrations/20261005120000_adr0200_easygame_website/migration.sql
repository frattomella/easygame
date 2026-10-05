-- ------------------------------------------------------------------------
-- ADR-0200 — EasyGame Website e sport core
-- ------------------------------------------------------------------------
--
-- Due famiglie di tabelle, entrambe nuove:
--
-- 1. **Sport core** (§8): `club_teams` (identita stabile di una squadra fra
--    le stagioni), `competitions`, `opponents`, `club_event_player_stats`, e
--    colonne nuove **facoltative** su `club_events` per il risultato
--    (`home_score`, `away_score`, `result_status`, `period_scores`) e per i
--    riferimenti a squadra, competizione e avversario. `club_events.opponent`
--    (testo) resta com'e: nessuna riga esistente viene riletta o riscritta.
--
-- 2. **EasyGame Website** (§3-§9): `website_sites`, `website_pages`,
--    `website_revisions` (immutabili: un trigger rifiuta ogni UPDATE),
--    `website_domains` (hostname unico sulla piattaforma, un primario per
--    sito), `website_redirects`, `website_articles`,
--    `website_person_publications`, `website_media_meta`, `website_inquiries`.
--
-- Migrazione **additiva e deterministica**: tabelle vuote, colonne nullable,
-- indici e vincoli. Ritorno: DROP delle tabelle nuove e delle colonne nuove di
-- `club_events` (nessun dato preesistente vi e stato scritto).
-- ------------------------------------------------------------------------

-- AlterTable
ALTER TABLE "club_events" ADD COLUMN     "away_score" INTEGER,
ADD COLUMN     "competition_id" UUID,
ADD COLUMN     "home_score" INTEGER,
ADD COLUMN     "opponent_id" UUID,
ADD COLUMN     "period_scores" JSONB,
ADD COLUMN     "result_status" TEXT,
ADD COLUMN     "result_updated_at" TIMESTAMP(3),
ADD COLUMN     "result_updated_by" UUID,
ADD COLUMN     "round_label" TEXT,
ADD COLUMN     "team_id" UUID;

-- CreateTable
CREATE TABLE "club_teams" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "short_name" TEXT,
    "slug" TEXT NOT NULL,
    "previous_slugs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sport" TEXT,
    "description" TEXT,
    "photo_attachment_id" UUID,
    "season_links" JSONB NOT NULL DEFAULT '[]',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "short_name" TEXT,
    "season_id" TEXT,
    "sport" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'league',
    "standings" JSONB,
    "standings_updated_at" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opponents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "short_name" TEXT,
    "city" TEXT,
    "logo_attachment_id" UUID,
    "website_url" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opponents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_event_player_stats" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "stats" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_event_player_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_sites" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "template_key" TEXT NOT NULL,
    "template_version" INTEGER NOT NULL DEFAULT 1,
    "theme" JSONB NOT NULL,
    "header" JSONB NOT NULL,
    "footer" JSONB NOT NULL,
    "navigation" JSONB NOT NULL,
    "seo" JSONB NOT NULL,
    "settings" JSONB NOT NULL,
    "onboarding" JSONB,
    "draft_version" INTEGER NOT NULL DEFAULT 1,
    "current_revision_id" UUID,
    "published_at" TIMESTAMP(3),
    "published_by" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_pages" (
    "id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'standard',
    "slug" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "seo" JSONB NOT NULL,
    "document" JSONB NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_revisions" (
    "id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "snapshot_hash" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'publish',
    "source_revision_id" UUID,
    "idempotency_key" TEXT,
    "note" TEXT,
    "published_by" UUID,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "website_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_domains" (
    "id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "hostname" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'redirect',
    "state" TEXT NOT NULL DEFAULT 'pending_dns',
    "tls_state" TEXT NOT NULL DEFAULT 'not_started',
    "verification_token" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_ref" TEXT,
    "dns_records" JSONB NOT NULL,
    "last_error" TEXT,
    "last_checked_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "activated_at" TIMESTAMP(3),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_redirects" (
    "id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "from_path" TEXT NOT NULL,
    "to_path" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "website_redirects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_articles" (
    "id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL DEFAULT '',
    "body_html" TEXT NOT NULL DEFAULT '',
    "cover" JSONB,
    "gallery" JSONB NOT NULL DEFAULT '[]',
    "category_slug" TEXT,
    "author_label" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publish_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "seo" JSONB NOT NULL,
    "related_event_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_person_publications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "person_kind" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_person_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_media_meta" (
    "attachment_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "alt_text" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "focal_x" INTEGER NOT NULL DEFAULT 50,
    "focal_y" INTEGER NOT NULL DEFAULT 50,
    "width" INTEGER,
    "height" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_media_meta_pkey" PRIMARY KEY ("attachment_id")
);

-- CreateTable
CREATE TABLE "website_inquiries" (
    "id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "topic" TEXT,
    "message" TEXT NOT NULL,
    "consent_text" TEXT NOT NULL,
    "source_path" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "handled_by" UUID,
    "handled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "website_inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "club_teams_organization_id_active_idx" ON "club_teams"("organization_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "club_teams_organization_id_slug_key" ON "club_teams"("organization_id", "slug");

-- CreateIndex
CREATE INDEX "competitions_organization_id_season_id_idx" ON "competitions"("organization_id", "season_id");

-- CreateIndex
CREATE UNIQUE INDEX "opponents_organization_id_name_key" ON "opponents"("organization_id", "name");

-- CreateIndex
CREATE INDEX "club_event_player_stats_organization_id_athlete_id_idx" ON "club_event_player_stats"("organization_id", "athlete_id");

-- CreateIndex
CREATE UNIQUE INDEX "club_event_player_stats_event_id_athlete_id_key" ON "club_event_player_stats"("event_id", "athlete_id");

-- CreateIndex
CREATE UNIQUE INDEX "website_sites_organization_id_key" ON "website_sites"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "website_sites_current_revision_id_key" ON "website_sites"("current_revision_id");

-- CreateIndex
CREATE INDEX "website_pages_organization_id_idx" ON "website_pages"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "website_pages_site_id_path_key" ON "website_pages"("site_id", "path");

-- CreateIndex
CREATE INDEX "website_revisions_organization_id_idx" ON "website_revisions"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "website_revisions_site_id_revision_number_key" ON "website_revisions"("site_id", "revision_number");

-- CreateIndex
CREATE UNIQUE INDEX "website_revisions_site_id_idempotency_key_key" ON "website_revisions"("site_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "website_domains_hostname_key" ON "website_domains"("hostname");

-- CreateIndex
CREATE INDEX "website_domains_organization_id_idx" ON "website_domains"("organization_id");

-- CreateIndex
CREATE INDEX "website_domains_site_id_idx" ON "website_domains"("site_id");

-- CreateIndex
CREATE INDEX "website_redirects_organization_id_idx" ON "website_redirects"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "website_redirects_site_id_from_path_key" ON "website_redirects"("site_id", "from_path");

-- CreateIndex
CREATE INDEX "website_articles_organization_id_status_published_at_idx" ON "website_articles"("organization_id", "status", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "website_articles_site_id_slug_key" ON "website_articles"("site_id", "slug");

-- CreateIndex
CREATE INDEX "website_person_publications_organization_id_published_idx" ON "website_person_publications"("organization_id", "published");

-- CreateIndex
CREATE UNIQUE INDEX "website_person_publications_organization_id_person_kind_per_key" ON "website_person_publications"("organization_id", "person_kind", "person_id");

-- CreateIndex
CREATE INDEX "website_media_meta_organization_id_idx" ON "website_media_meta"("organization_id");

-- CreateIndex
CREATE INDEX "website_inquiries_organization_id_status_created_at_idx" ON "website_inquiries"("organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "club_events_organization_id_team_id_starts_at_idx" ON "club_events"("organization_id", "team_id", "starts_at");

-- CreateIndex
CREATE INDEX "club_events_organization_id_competition_id_idx" ON "club_events"("organization_id", "competition_id");

-- AddForeignKey
ALTER TABLE "club_events" ADD CONSTRAINT "club_events_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "club_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_events" ADD CONSTRAINT "club_events_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_events" ADD CONSTRAINT "club_events_opponent_id_fkey" FOREIGN KEY ("opponent_id") REFERENCES "opponents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_teams" ADD CONSTRAINT "club_teams_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opponents" ADD CONSTRAINT "opponents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_event_player_stats" ADD CONSTRAINT "club_event_player_stats_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_event_player_stats" ADD CONSTRAINT "club_event_player_stats_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "club_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_event_player_stats" ADD CONSTRAINT "club_event_player_stats_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_sites" ADD CONSTRAINT "website_sites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_sites" ADD CONSTRAINT "website_sites_current_revision_id_fkey" FOREIGN KEY ("current_revision_id") REFERENCES "website_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_pages" ADD CONSTRAINT "website_pages_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "website_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_pages" ADD CONSTRAINT "website_pages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_revisions" ADD CONSTRAINT "website_revisions_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "website_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_revisions" ADD CONSTRAINT "website_revisions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_domains" ADD CONSTRAINT "website_domains_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "website_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_domains" ADD CONSTRAINT "website_domains_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_redirects" ADD CONSTRAINT "website_redirects_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "website_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_redirects" ADD CONSTRAINT "website_redirects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_articles" ADD CONSTRAINT "website_articles_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "website_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_articles" ADD CONSTRAINT "website_articles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_person_publications" ADD CONSTRAINT "website_person_publications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_media_meta" ADD CONSTRAINT "website_media_meta_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_media_meta" ADD CONSTRAINT "website_media_meta_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_inquiries" ADD CONSTRAINT "website_inquiries_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "website_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_inquiries" ADD CONSTRAINT "website_inquiries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ------------------------------------------------------------------------
-- Vincoli che Prisma non sa esprimere
-- ------------------------------------------------------------------------

-- Un solo dominio primario per sito.
CREATE UNIQUE INDEX "website_domains_one_primary_per_site"
    ON "website_domains"("site_id") WHERE "role" = 'primary';

-- I vocabolari chiusi: un valore fuori elenco e un errore del database, non
-- uno stato che un lettore dovrebbe indovinare.
ALTER TABLE "website_sites"
    ADD CONSTRAINT "website_sites_status_check"
    CHECK ("status" IN ('draft', 'published', 'offline'));

ALTER TABLE "website_pages"
    ADD CONSTRAINT "website_pages_kind_check"
    CHECK ("kind" IN ('home', 'standard', 'legal', 'news_index', 'article_detail', 'team_detail', 'match_detail', 'player_detail', 'event_detail'));

ALTER TABLE "website_revisions"
    ADD CONSTRAINT "website_revisions_origin_check"
    CHECK ("origin" IN ('publish', 'rollback'));

ALTER TABLE "website_domains"
    ADD CONSTRAINT "website_domains_role_check" CHECK ("role" IN ('primary', 'redirect')),
    ADD CONSTRAINT "website_domains_state_check" CHECK ("state" IN ('pending_dns', 'verifying', 'provisioning', 'active', 'failed')),
    ADD CONSTRAINT "website_domains_tls_state_check" CHECK ("tls_state" IN ('not_started', 'pending', 'active', 'failed')),
    ADD CONSTRAINT "website_domains_hostname_lowercase_check" CHECK ("hostname" = lower("hostname"));

ALTER TABLE "website_articles"
    ADD CONSTRAINT "website_articles_status_check"
    CHECK ("status" IN ('draft', 'scheduled', 'published', 'archived'));

ALTER TABLE "website_person_publications"
    ADD CONSTRAINT "website_person_publications_kind_check"
    CHECK ("person_kind" IN ('athlete', 'trainer', 'staff'));

ALTER TABLE "website_inquiries"
    ADD CONSTRAINT "website_inquiries_status_check"
    CHECK ("status" IN ('new', 'handled', 'archived'));

ALTER TABLE "website_media_meta"
    ADD CONSTRAINT "website_media_meta_focal_check"
    CHECK ("focal_x" BETWEEN 0 AND 100 AND "focal_y" BETWEEN 0 AND 100);

ALTER TABLE "club_events"
    ADD CONSTRAINT "club_events_result_status_check"
    CHECK ("result_status" IS NULL OR "result_status" IN ('provisional', 'final')),
    ADD CONSTRAINT "club_events_scores_check"
    CHECK (("home_score" IS NULL OR "home_score" >= 0) AND ("away_score" IS NULL OR "away_score" >= 0));

ALTER TABLE "competitions"
    ADD CONSTRAINT "competitions_kind_check"
    CHECK ("kind" IN ('league', 'cup', 'tournament', 'friendly'));

-- ------------------------------------------------------------------------
-- Una revisione pubblicata non si modifica mai
-- ------------------------------------------------------------------------
--
-- Il rollback scrive una revisione nuova: nessun percorso del codice ha
-- bisogno di aggiornarne una. La cancellazione resta possibile (cascata alla
-- cancellazione del club, potatura delle revisioni vecchie non correnti).

CREATE OR REPLACE FUNCTION "website_revisions_reject_update"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'website_revisions e immutabile: una pubblicazione non si modifica, se ne crea una nuova';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "website_revisions_immutable"
    BEFORE UPDATE ON "website_revisions"
    FOR EACH ROW EXECUTE FUNCTION "website_revisions_reject_update"();
