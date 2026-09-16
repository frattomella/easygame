-- ------------------------------------------------------------------------
-- ADR-0188 — Le persone in prova sono una tabella, non uno stato di atleta
-- ------------------------------------------------------------------------
--
-- Chi viene ad allenarsi prima di iscriversi ha un'identita stabile (torna e
-- va riconosciuta), uno storico di presenze e, un giorno, una scheda atleta a
-- cui e legata. Non e un atleta: non conta fra gli attivi, non entra nelle
-- rose, non genera quote, tessere, obblighi documentali, tutori o accessi.
-- Per questo due tabelle proprie e nessuna colonna nuova su `athletes` o su
-- `club_event_participants`: un lettore di quelle tabelle che non sappia
-- delle prove non le vede — che e il verso giusto in cui sbagliare.
--
-- Migrazione **additiva e deterministica**: crea due tabelle vuote, indici e
-- vincoli. Nessuna riga esistente viene letta, reinterpretata o riscritta.
-- Ritorno: `DROP TABLE "trial_attendances"; DROP TABLE "trial_athletes";`.
--
-- `trial_athletes.athlete_id` e unico (una scheda nasce da una prova sola, e
-- una prova porta a una scheda sola); i NULL — le prove non ancora convertite
-- — non partecipano all'unicita, come vuole Postgres per un UNIQUE semplice.
-- `birth_date` e obbligatoria: nel settore giovanile e cio che distingue due
-- omonimi e dice la categoria (ADR-0188 §Identita).
-- ------------------------------------------------------------------------

CREATE TABLE "trial_athletes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "birth_date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_trial',
    "category_id" TEXT,
    "category_name" TEXT,
    "group_id" TEXT,
    "site_id" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "guardian_name" TEXT,
    "guardian_phone" TEXT,
    "notes" TEXT,
    "athlete_id" UUID,
    "converted_at" TIMESTAMP(3),
    "declined_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trial_athletes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "trial_athletes_athlete_id_key" ON "trial_athletes"("athlete_id");
CREATE INDEX "trial_athletes_organization_id_status_idx" ON "trial_athletes"("organization_id", "status");
CREATE INDEX "trial_athletes_organization_id_last_name_first_name_idx" ON "trial_athletes"("organization_id", "last_name", "first_name");
CREATE INDEX "trial_athletes_organization_id_category_id_idx" ON "trial_athletes"("organization_id", "category_id");

ALTER TABLE "trial_athletes"
    ADD CONSTRAINT "trial_athletes_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "clubs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "trial_athletes"
    ADD CONSTRAINT "trial_athletes_athlete_id_fkey"
    FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Lo stato e una parola di un vocabolario chiuso, e lo dice l'archivio.
ALTER TABLE "trial_athletes"
    ADD CONSTRAINT "trial_athletes_status_check"
    CHECK ("status" IN ('in_trial', 'enrolled', 'declined'));

-- Una riga `enrolled` porta sempre la scheda; una riga non convertita non la porta.
ALTER TABLE "trial_athletes"
    ADD CONSTRAINT "trial_athletes_enrolled_has_athlete_check"
    CHECK (("status" = 'enrolled') = ("athlete_id" IS NOT NULL));

CREATE TABLE "trial_attendances" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "trial_athlete_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'present',
    "notes" TEXT,
    "recorded_by" UUID,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trial_attendances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "trial_attendances_organization_id_event_id_trial_athlete_id_key" ON "trial_attendances"("organization_id", "event_id", "trial_athlete_id");
CREATE INDEX "trial_attendances_organization_id_trial_athlete_id_recorded_at_idx" ON "trial_attendances"("organization_id", "trial_athlete_id", "recorded_at");
CREATE INDEX "trial_attendances_organization_id_event_id_idx" ON "trial_attendances"("organization_id", "event_id");

ALTER TABLE "trial_attendances"
    ADD CONSTRAINT "trial_attendances_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "clubs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "trial_attendances"
    ADD CONSTRAINT "trial_attendances_trial_athlete_id_fkey"
    FOREIGN KEY ("trial_athlete_id") REFERENCES "trial_athletes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "trial_attendances"
    ADD CONSTRAINT "trial_attendances_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "club_events"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "trial_attendances"
    ADD CONSTRAINT "trial_attendances_status_check"
    CHECK ("status" IN ('present', 'absent'));
