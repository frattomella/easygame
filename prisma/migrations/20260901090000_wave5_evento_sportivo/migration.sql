-- ===========================================================================
-- L'evento sportivo diventa una riga (ADR-0098, ADR-0099)
-- ===========================================================================
--
-- ## Il fatto architetturale
--
-- Allenamenti e gare vivevano in `clubs.trainings` e `clubs.matches`: due
-- colonne JSON che il client rilegge intere, modifica e riscrive intere. Da
-- quella singola causa discendono sette conseguenze che sembravano difetti
-- separati:
--
--   1. due segretarie che salvano insieme si sovrascrivono, e la seconda vince
--      in silenzio;
--   2. non esiste una chiave esterna: una presenza cita un allenamento con una
--      stringa, e nessuno garantisce che quell'allenamento esista ancora;
--   3. non esiste un permesso per riga: chi puo scrivere la colonna puo
--      scrivere ogni evento del club;
--   4. non esiste un audit: la modifica di un allenamento non lascia traccia
--      distinguibile dalla riscrittura dell'intera collezione;
--   5. non esiste un vincolo: capienza, sede, orario di apertura sono
--      controlli che qualcuno puo dimenticare di chiamare;
--   6. la convocazione vive dentro il payload della gara in dieci grafie
--      diverse, normalizzate a ogni lettura;
--   7. l'RSVP e il calendario non hanno un identificativo stabile su cui
--      appoggiarsi.
--
-- A un array JSON si puo aggiungere un campo, non un vincolo.
--
-- ## Cosa fa questa migrazione
--
--   1. crea `club_events`, con `kind` che assorbe allenamenti e gare;
--   2. porta `training_attendance` da «presenza dell'allenamento» a
--      «partecipazione all'evento»: **non** nasce una seconda tabella, questa
--      viene rinominata e la sua chiave cambia da `training_id` a `event_id`;
--   3. travasa gli array JSON in righe, normalizzando **una volta sola** le
--      grafie della convocazione;
--   4. riaggancia ogni presenza esistente al proprio evento.
--
-- ## Cosa NON fa
--
-- Non cancella `clubs.trainings` e `clubs.matches`. Le due colonne restano, in
-- **sola lettura**: un travaso che perde qualcosa deve poter essere confrontato
-- con l'originale, e il codice che le legge sparisce a scaglioni e non in un
-- commit solo.
--
-- ## L'evento senza una data leggibile
--
-- Un elemento JSON il cui `date` non e una data finisce con `starts_at` al
-- 1970-01-01 e conserva il proprio payload per intero. E deliberato: un dato
-- rotto va reso **visibile**, non buttato via ne indovinato. Il conteggio righe
-- prima e dopo deve tornare esatto.

-- --------------------------------------------------------------------------
-- 1. L'evento
-- --------------------------------------------------------------------------

CREATE TABLE "club_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "legacy_id" TEXT,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "season_id" TEXT,
    "site_id" TEXT,
    "structure_id" TEXT,
    "field_id" TEXT,
    "category_id" TEXT,
    "category_name" TEXT,
    "group_ids" JSONB,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Rome',
    "location" TEXT,
    "opponent" TEXT,
    "home_away" TEXT,
    "capacity" INTEGER,
    "rsvp_required" BOOLEAN NOT NULL DEFAULT false,
    "rsvp_deadline" TIMESTAMP(3),
    "convocation_status" TEXT,
    "notes" TEXT,
    "trainer_ids" JSONB,
    "payload" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "club_events"
    ADD CONSTRAINT "club_events_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "clubs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "club_events_organization_id_kind_legacy_id_key"
    ON "club_events"("organization_id", "kind", "legacy_id");
CREATE INDEX "club_events_organization_id_starts_at_idx"
    ON "club_events"("organization_id", "starts_at");
CREATE INDEX "club_events_organization_id_kind_starts_at_idx"
    ON "club_events"("organization_id", "kind", "starts_at");
CREATE INDEX "club_events_organization_id_season_id_starts_at_idx"
    ON "club_events"("organization_id", "season_id", "starts_at");
CREATE INDEX "club_events_organization_id_site_id_starts_at_idx"
    ON "club_events"("organization_id", "site_id", "starts_at");
CREATE INDEX "club_events_organization_id_category_id_starts_at_idx"
    ON "club_events"("organization_id", "category_id", "starts_at");

-- --------------------------------------------------------------------------
-- 2. La presenza diventa partecipazione: rinomina, non seconda tabella
-- --------------------------------------------------------------------------

ALTER TABLE "training_attendance" RENAME TO "club_event_participants";
ALTER TABLE "club_event_participants" RENAME CONSTRAINT "training_attendance_pkey" TO "club_event_participants_pkey";
ALTER TABLE "club_event_participants" RENAME COLUMN "training_id" TO "legacy_training_id";
ALTER TABLE "club_event_participants" ALTER COLUMN "legacy_training_id" DROP NOT NULL;

ALTER TABLE "club_event_participants"
    ADD COLUMN "event_id" UUID,
    ADD COLUMN "convocation_status" TEXT,
    ADD COLUMN "convocated_at" TIMESTAMP(3),
    ADD COLUMN "convocated_by" UUID,
    ADD COLUMN "is_extra_category" BOOLEAN NOT NULL DEFAULT false;

-- Gli indici della vecchia chiave se ne vanno **tutti**, compresi i due che
-- migrazioni precedenti avevano creato con un nome scelto a mano e che nessuno
-- schema Prisma conosce. Lasciarne uno indietro vorrebbe dire tenere in vita la
-- chiave che questa migrazione sostituisce: due chiavi uniche sullo stesso
-- fatto sono una sola chiave, quella piu stretta, e in un modo che nessuno si
-- ricorda leggendo il modello.
DROP INDEX IF EXISTS "training_attendance_organization_id_training_id_athlete_id_key";
DROP INDEX IF EXISTS "training_attendance_organization_id_training_id_idx";
DROP INDEX IF EXISTS "training_attendance_organization_id_athlete_id_rsvp_status_idx";
DROP INDEX IF EXISTS "training_attendance_event_athlete_unique";
DROP INDEX IF EXISTS "training_attendance_rsvp_idx";

-- --------------------------------------------------------------------------
-- 3. Il travaso degli allenamenti
-- --------------------------------------------------------------------------

INSERT INTO "club_events" (
    "organization_id", "kind", "legacy_id", "title", "status",
    "season_id", "site_id", "structure_id", "field_id",
    "category_id", "category_name", "group_ids",
    "starts_at", "ends_at", "location",
    "capacity", "rsvp_required", "notes", "trainer_ids", "payload"
)
SELECT
    c."id",
    'training',
    NULLIF(t->>'id', ''),
    NULLIF(COALESCE(t->>'title', t->>'name'), ''),
    COALESCE(NULLIF(t->>'status', ''), 'scheduled'),
    NULLIF(COALESCE(t->>'seasonId', t->>'season_id'), ''),
    NULLIF(COALESCE(t->>'siteId', t->>'site_id'), ''),
    NULLIF(COALESCE(t->>'structureId', t->>'structure_id'), ''),
    NULLIF(COALESCE(t->>'fieldId', t->>'field_id'), ''),
    NULLIF(COALESCE(t->>'categoryId', t->>'category_id'), ''),
    NULLIF(COALESCE(t->>'categoryName', t->>'category_name', t->>'category'), ''),
    CASE
        WHEN jsonb_typeof(t->'groupIds') = 'array' THEN t->'groupIds'
        WHEN jsonb_typeof(t->'group_ids') = 'array' THEN t->'group_ids'
        WHEN jsonb_typeof(t->'groups') = 'array' THEN t->'groups'
        ELSE NULL
    END,
    COALESCE(
        CASE WHEN (t->>'date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN
            (substring(t->>'date' FROM 1 FOR 10) || ' ' ||
             COALESCE(NULLIF(substring(COALESCE(t->>'time', t->>'start_time', t->>'startTime', '') FROM 1 FOR 5), ''), '00:00')
             || ':00')::timestamp
        END,
        TIMESTAMP '1970-01-01 00:00:00'
    ),
    CASE WHEN (t->>'date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
              AND COALESCE(t->>'end_time', t->>'endTime', '') <> '' THEN
        (substring(t->>'date' FROM 1 FOR 10) || ' ' ||
         substring(COALESCE(t->>'end_time', t->>'endTime') FROM 1 FOR 5) || ':00')::timestamp
    END,
    NULLIF(t->>'location', ''),
    NULLIF(COALESCE(t->>'capacity', t->>'expected_attendees', t->>'expectedAttendees'), '')::int,
    COALESCE((t->>'rsvpRequired')::boolean, (t->>'rsvp_required')::boolean, false),
    NULLIF(COALESCE(t->>'notes', t->>'description'), ''),
    CASE
        WHEN jsonb_typeof(t->'trainers') = 'array' THEN t->'trainers'
        WHEN jsonb_typeof(t->'trainerIds') = 'array' THEN t->'trainerIds'
        WHEN jsonb_typeof(t->'trainer_ids') = 'array' THEN t->'trainer_ids'
        WHEN COALESCE(t->>'trainer_id', t->>'trainerId', '') <> ''
            THEN jsonb_build_array(COALESCE(t->>'trainer_id', t->>'trainerId'))
        ELSE NULL
    END,
    t
FROM "clubs" c
CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(c."trainings"::jsonb) = 'array'
         THEN c."trainings"::jsonb ELSE '[]'::jsonb END
) AS t
WHERE NULLIF(t->>'id', '') IS NOT NULL
ON CONFLICT ("organization_id", "kind", "legacy_id") DO NOTHING;

-- --------------------------------------------------------------------------
-- 4. Il travaso delle gare
-- --------------------------------------------------------------------------

INSERT INTO "club_events" (
    "organization_id", "kind", "legacy_id", "title", "status",
    "season_id", "site_id", "structure_id", "field_id",
    "category_id", "category_name", "group_ids",
    "starts_at", "ends_at", "location", "opponent", "home_away",
    "capacity", "rsvp_required", "convocation_status", "notes", "trainer_ids", "payload"
)
SELECT
    c."id",
    'match',
    NULLIF(m->>'id', ''),
    NULLIF(COALESCE(m->>'title', m->>'name'), ''),
    COALESCE(NULLIF(m->>'status', ''), 'scheduled'),
    NULLIF(COALESCE(m->>'seasonId', m->>'season_id'), ''),
    NULLIF(COALESCE(m->>'siteId', m->>'site_id'), ''),
    NULLIF(COALESCE(m->>'structureId', m->>'structure_id'), ''),
    NULLIF(COALESCE(m->>'fieldId', m->>'field_id'), ''),
    NULLIF(COALESCE(m->>'categoryId', m->>'category_id'), ''),
    NULLIF(COALESCE(m->>'categoryName', m->>'category_name', m->>'category'), ''),
    CASE
        WHEN jsonb_typeof(m->'groupIds') = 'array' THEN m->'groupIds'
        WHEN jsonb_typeof(m->'group_ids') = 'array' THEN m->'group_ids'
        WHEN jsonb_typeof(m->'groups') = 'array' THEN m->'groups'
        ELSE NULL
    END,
    COALESCE(
        CASE WHEN (m->>'date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN
            (substring(m->>'date' FROM 1 FOR 10) || ' ' ||
             COALESCE(NULLIF(substring(COALESCE(m->>'time', m->>'start_time', m->>'startTime', '') FROM 1 FOR 5), ''), '00:00')
             || ':00')::timestamp
        END,
        TIMESTAMP '1970-01-01 00:00:00'
    ),
    CASE WHEN (m->>'date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
              AND COALESCE(m->>'end_time', m->>'endTime', '') <> '' THEN
        (substring(m->>'date' FROM 1 FOR 10) || ' ' ||
         substring(COALESCE(m->>'end_time', m->>'endTime') FROM 1 FOR 5) || ':00')::timestamp
    END,
    NULLIF(COALESCE(m->>'location', m->>'venue'), ''),
    NULLIF(COALESCE(m->>'opponent', m->>'opponentName'), ''),
    NULLIF(COALESCE(m->>'homeAway', m->>'home_away'), ''),
    NULLIF(COALESCE(m->>'capacity', m->>'expected_attendees', m->>'expectedAttendees'), '')::int,
    COALESCE((m->>'rsvpRequired')::boolean, (m->>'rsvp_required')::boolean, false),
    NULLIF(COALESCE(m->>'convocationsStatus', m->>'convocations_status', m->>'convocationStatus'), ''),
    NULLIF(COALESCE(m->>'notes', m->>'description'), ''),
    CASE
        WHEN jsonb_typeof(m->'trainers') = 'array' THEN m->'trainers'
        WHEN jsonb_typeof(m->'trainerIds') = 'array' THEN m->'trainerIds'
        WHEN jsonb_typeof(m->'trainer_ids') = 'array' THEN m->'trainer_ids'
        WHEN COALESCE(m->>'trainer_id', m->>'trainerId', '') <> ''
            THEN jsonb_build_array(COALESCE(m->>'trainer_id', m->>'trainerId'))
        ELSE NULL
    END,
    m
FROM "clubs" c
CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(c."matches"::jsonb) = 'array'
         THEN c."matches"::jsonb ELSE '[]'::jsonb END
) AS m
WHERE NULLIF(m->>'id', '') IS NOT NULL
ON CONFLICT ("organization_id", "kind", "legacy_id") DO NOTHING;

-- --------------------------------------------------------------------------
-- 5. Le convocazioni: dieci grafie, normalizzate una volta sola
-- --------------------------------------------------------------------------
--
-- Le grafie incontrate nel dato reale e nel codice che lo legge:
-- `convocatedAthletes` come elenco di stringhe, come elenco di oggetti con
-- `id` / `athleteId` / `athlete_id`; `convocationEntries` e
-- `convocation_entries` nelle stesse tre forme; piu `isExtraCategory` /
-- `is_extra_category` sul singolo elemento. Da qui in avanti la convocazione e
-- una colonna, e nessuno la normalizza piu a runtime.

INSERT INTO "club_event_participants" (
    "id", "organization_id", "event_id", "athlete_id",
    "status", "convocation_status", "convocated_at", "is_extra_category",
    "created_at", "updated_at"
)
SELECT
    gen_random_uuid(),
    e."organization_id",
    e."id",
    v."athlete_id",
    'pending',
    'convocated',
    e."created_at",
    v."is_extra",
    e."created_at",
    e."created_at"
FROM "club_events" e
CROSS JOIN LATERAL (
    SELECT DISTINCT ON (grezzo.athlete_id) grezzo.athlete_id, grezzo.is_extra
    FROM (
        SELECT
            CASE
                WHEN jsonb_typeof(entry) = 'string' THEN entry #>> '{}'
                WHEN jsonb_typeof(entry) = 'object'
                    THEN COALESCE(entry->>'athleteId', entry->>'athlete_id', entry->>'id')
                ELSE NULL
            END AS athlete_id,
            CASE
                WHEN jsonb_typeof(entry) = 'object'
                    THEN COALESCE(
                        (entry->>'isExtraCategory')::boolean,
                        (entry->>'is_extra_category')::boolean,
                        false)
                ELSE false
            END AS is_extra
        FROM jsonb_array_elements(
            CASE
                WHEN jsonb_typeof(e."payload"->'convocationEntries') = 'array'
                    THEN e."payload"->'convocationEntries'
                WHEN jsonb_typeof(e."payload"->'convocation_entries') = 'array'
                    THEN e."payload"->'convocation_entries'
                WHEN jsonb_typeof(e."payload"->'convocatedAthletes') = 'array'
                    THEN e."payload"->'convocatedAthletes'
                WHEN jsonb_typeof(e."payload"->'convocated_athletes') = 'array'
                    THEN e."payload"->'convocated_athletes'
                ELSE '[]'::jsonb
            END
        ) AS entry
    ) AS grezzo
    WHERE NULLIF(grezzo.athlete_id, '') IS NOT NULL
) AS v
WHERE e."kind" = 'match'
ON CONFLICT DO NOTHING;

-- --------------------------------------------------------------------------
-- 6. Ogni presenza ritrova il proprio evento
-- --------------------------------------------------------------------------

UPDATE "club_event_participants" p
SET "event_id" = e."id"
FROM "club_events" e
WHERE p."event_id" IS NULL
  AND e."organization_id" = p."organization_id"
  AND e."kind" = 'training'
  AND e."legacy_id" = p."legacy_training_id";

UPDATE "club_event_participants" p
SET "event_id" = e."id"
FROM "club_events" e
WHERE p."event_id" IS NULL
  AND e."organization_id" = p."organization_id"
  AND e."kind" = 'match'
  AND e."legacy_id" = p."legacy_training_id";

-- L'evento citato da una presenza ma non piu presente nella colonna JSON:
-- l'appello e stato fatto, poi qualcuno ha cancellato l'allenamento riscrivendo
-- l'array. La presenza **non si butta**: le si costruisce l'evento archiviato
-- che le mancava, cosi la chiave esterna puo diventare obbligatoria.
INSERT INTO "club_events" (
    "organization_id", "kind", "legacy_id", "title", "status", "starts_at", "created_at", "updated_at"
)
SELECT
    p."organization_id",
    'training',
    p."legacy_training_id",
    'Evento archiviato',
    'archived',
    MIN(p."created_at"),
    MIN(p."created_at"),
    NOW()
FROM "club_event_participants" p
WHERE p."event_id" IS NULL
  AND NULLIF(p."legacy_training_id", '') IS NOT NULL
GROUP BY p."organization_id", p."legacy_training_id"
ON CONFLICT ("organization_id", "kind", "legacy_id") DO NOTHING;

UPDATE "club_event_participants" p
SET "event_id" = e."id"
FROM "club_events" e
WHERE p."event_id" IS NULL
  AND e."organization_id" = p."organization_id"
  AND e."kind" = 'training'
  AND e."legacy_id" = p."legacy_training_id";

-- Una presenza senza nemmeno un identificativo di allenamento non e
-- riagganciabile a niente: sarebbe rimasta orfana anche prima. Le si costruisce
-- un evento archiviato per club, cosi il conteggio righe torna esatto.
INSERT INTO "club_events" (
    "organization_id", "kind", "legacy_id", "title", "status", "starts_at", "created_at", "updated_at"
)
SELECT DISTINCT
    p."organization_id",
    'training',
    '__senza_evento__',
    'Presenze senza evento',
    'archived',
    TIMESTAMP '1970-01-01 00:00:00',
    NOW(),
    NOW()
FROM "club_event_participants" p
WHERE p."event_id" IS NULL
ON CONFLICT ("organization_id", "kind", "legacy_id") DO NOTHING;

UPDATE "club_event_participants" p
SET "event_id" = e."id"
FROM "club_events" e
WHERE p."event_id" IS NULL
  AND e."organization_id" = p."organization_id"
  AND e."kind" = 'training'
  AND e."legacy_id" = '__senza_evento__';

-- --------------------------------------------------------------------------
-- 7. La chiave diventa obbligatoria, e vera
-- --------------------------------------------------------------------------

ALTER TABLE "club_event_participants" ALTER COLUMN "event_id" SET NOT NULL;

ALTER TABLE "club_event_participants"
    ADD CONSTRAINT "club_event_participants_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "club_events"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "club_event_participants"
    RENAME CONSTRAINT "training_attendance_organization_id_fkey"
    TO "club_event_participants_organization_id_fkey";

CREATE UNIQUE INDEX "club_event_participants_organization_id_event_id_athlete_id_key"
    ON "club_event_participants"("organization_id", "event_id", "athlete_id");
CREATE INDEX "club_event_participants_organization_id_event_id_idx"
    ON "club_event_participants"("organization_id", "event_id");
CREATE INDEX "club_event_participants_org_athlete_rsvp_idx"
    ON "club_event_participants"("organization_id", "athlete_id", "rsvp_status");
CREATE INDEX "club_event_participants_org_athlete_convocation_idx"
    ON "club_event_participants"("organization_id", "athlete_id", "convocation_status");
