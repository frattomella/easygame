-- ===========================================================================
-- L'appuntamento diventa un dominio con un proprietario e una tabella
-- ===========================================================================
--
-- ## Cosa c'era, e cosa mancava
--
-- C'era la **domanda**: la famiglia chiede, modifica e annulla, con validazione
-- server contro gli orari di apertura. Mancava la **risposta**:
--
--   - **nessun codice scriveva `confirmed`.** Ne `rejected`. Le etichette
--     esistevano solo nel formatter generico: una richiesta restava in attesa
--     per sempre, e l'unica risposta possibile della segreteria era cancellarla
--     senza avvisare nessuno;
--   - **le richieste si cancellavano da sole** (D-1, chiuso in 5A rendendo
--     `appointments` una risorsa chiusa al registro generico);
--   - **nessun proprietario**: la logica stava in un route handler e in una
--     pagina client, e i due scrittori usavano due forme diverse dello stesso
--     oggetto — quello della segreteria non aveva nemmeno uno stato ne un
--     `athlete_id`;
--   - **nessuna disponibilita**: c'era l'orario di apertura, non lo slot. Due
--     famiglie potevano chiedere lo stesso orario;
--   - **nessuna notifica alla famiglia, zero email, nessun audit**,
--     identificativi generati dall'orologio, data e ora come due stringhe
--     separate interpretate nel fuso del server, e nessuna protezione dal
--     doppio clic.
--
-- ## I presidi che sono la ragione della tabella
--
--   1. indice **unico parziale** su (club, operatore, inizio) per gli stati
--      vivi: la doppia prenotazione la impedisce il **database**, non il codice
--      — e un vincolo che nessuno puo dimenticare di chiamare;
--   2. `idempotency_key` unica per club: il doppio clic non produce due
--      appuntamenti;
--   3. `version` per il controllo ottimistico: due operatori che confermano
--      insieme non si sovrascrivono;
--   4. la **riprogrammazione crea una riga nuova** e chiude la vecchia. La data
--      non si muta in luogo, cosi l'audit resta leggibile.
--
-- ## Cosa NON fa
--
-- Non cancella `clubs.appointments`. La colonna resta, in sola lettura, finche
-- il codice che la legge non e sparito: un travaso che perde qualcosa deve
-- poter essere confrontato con l'originale.

CREATE TABLE "appointment_slots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "site_id" TEXT,
    "assigned_to_user_id" UUID,
    "weekday" INTEGER,
    "specific_date" TIMESTAMP(3),
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 30,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_slots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "appointments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "site_id" TEXT,
    "season_id" TEXT,
    "slot_id" UUID,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Rome',
    "status" TEXT NOT NULL DEFAULT 'requested',
    "athlete_id" UUID,
    "requested_by_user_id" UUID,
    "assigned_to_user_id" UUID,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "internal_notes" TEXT,
    "decision_note" TEXT,
    "decided_by" UUID,
    "decided_at" TIMESTAMP(3),
    "parent_appointment_id" UUID,
    "idempotency_key" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "appointment_slots_organization_id_site_id_weekday_idx"
    ON "appointment_slots"("organization_id", "site_id", "weekday");
CREATE INDEX "appointment_slots_organization_id_specific_date_idx"
    ON "appointment_slots"("organization_id", "specific_date");

CREATE INDEX "appointments_organization_id_starts_at_idx"
    ON "appointments"("organization_id", "starts_at");
CREATE INDEX "appointments_organization_id_status_starts_at_idx"
    ON "appointments"("organization_id", "status", "starts_at");
CREATE INDEX "appointments_organization_id_athlete_id_starts_at_idx"
    ON "appointments"("organization_id", "athlete_id", "starts_at");
CREATE INDEX "appointments_organization_id_assigned_to_user_id_starts_at_idx"
    ON "appointments"("organization_id", "assigned_to_user_id", "starts_at");
CREATE INDEX "appointments_organization_id_site_id_starts_at_idx"
    ON "appointments"("organization_id", "site_id", "starts_at");

-- Il doppio clic non produce due appuntamenti.
CREATE UNIQUE INDEX "appointments_organization_id_idempotency_key_key"
    ON "appointments"("organization_id", "idempotency_key");

-- **La doppia prenotazione la impedisce il database.**
--
-- Parziale sugli stati **vivi**: un appuntamento rifiutato, cancellato o
-- riprogrammato libera il posto, e deve poterlo liberare senza essere
-- cancellato — la storia resta leggibile solo se le righe morte restano.
--
-- E la stessa forma di ADR-0095 sull'idempotenza degli incassi: il vincolo vale
-- sulle righe vive, non su quelle stornate.
CREATE UNIQUE INDEX "appointments_slot_vivo_unico"
    ON "appointments"("organization_id", "assigned_to_user_id", "starts_at")
    WHERE "status" IN ('requested', 'confirmed');

ALTER TABLE "appointment_slots"
    ADD CONSTRAINT "appointment_slots_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "clubs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "appointments"
    ADD CONSTRAINT "appointments_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "clubs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- `SET NULL` e non `CASCADE`: cancellare un'anagrafica non deve far sparire la
-- storia degli appuntamenti presi per quella persona. E la stessa regola con
-- cui la Wave 4 ha chiuso le cancellazioni che distruggevano.
ALTER TABLE "appointments"
    ADD CONSTRAINT "appointments_athlete_id_fkey"
    FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "appointments"
    ADD CONSTRAINT "appointments_slot_id_fkey"
    FOREIGN KEY ("slot_id") REFERENCES "appointment_slots"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- La riprogrammazione punta alla riga che sostituisce, e quella riga non si
-- cancella: `NO ACTION` fa fallire chi ci provasse.
ALTER TABLE "appointments"
    ADD CONSTRAINT "appointments_parent_appointment_id_fkey"
    FOREIGN KEY ("parent_appointment_id") REFERENCES "appointments"("id")
    ON DELETE NO ACTION ON UPDATE CASCADE;

-- --------------------------------------------------------------------------
-- Il travaso da `clubs.appointments`
-- --------------------------------------------------------------------------
--
-- Le due forme convivevano nella stessa colonna:
--
--   - la **richiesta della famiglia**: `id` che inizia per `parent-appointment-`,
--     `date` + `time` separati, `status: "pending"`, `athlete_id`,
--     `requested_by_user_id`, `reason`;
--   - l'**appuntamento della segreteria**: nessuno stato, nessun `athlete_id`,
--     `title` invece di `reason`, e a volte `person` al posto del nome.
--
-- `pending` diventa `requested`, che e il nome dello stato nella macchina.
-- Un elemento senza data leggibile riceve il 1970-01-01 e conserva tutto il
-- resto: un dato rotto va reso visibile, non buttato via ne indovinato.

INSERT INTO "appointments" (
    "organization_id", "starts_at", "ends_at", "status",
    "athlete_id", "requested_by_user_id", "reason", "notes",
    "idempotency_key", "created_at", "updated_at"
)
SELECT
    c."id",
    inizio.valore,
    inizio.valore + INTERVAL '30 minutes',
    CASE
        WHEN COALESCE(a->>'status', '') IN ('confirmed', 'confermato') THEN 'confirmed'
        WHEN COALESCE(a->>'status', '') IN ('rejected', 'rifiutato') THEN 'rejected'
        WHEN COALESCE(a->>'status', '') IN ('cancelled', 'annullato') THEN 'cancelled_by_club'
        WHEN COALESCE(a->>'status', '') IN ('completed', 'completato') THEN 'completed'
        ELSE 'requested'
    END,
    -- L'anagrafica citata da un appuntamento e nel frattempo cancellata lascia
    -- la colonna vuota invece di far fallire la migrazione: si risolve
    -- **guardando** se esiste, non fidandosi della stringa.
    (SELECT at."id" FROM "athletes" at
      WHERE at."organization_id" = c."id"
        AND at."id"::text = COALESCE(a->>'athlete_id', a->>'athleteId', '')),
    CASE WHEN COALESCE(a->>'requested_by_user_id', a->>'requestedByUserId', '')
              ~ '^[0-9a-fA-F-]{36}$'
         THEN COALESCE(a->>'requested_by_user_id', a->>'requestedByUserId')::uuid END,
    COALESCE(NULLIF(a->>'reason', ''), NULLIF(a->>'title', ''), 'Appuntamento'),
    NULLIF(a->>'notes', ''),
    'travaso:' || COALESCE(NULLIF(a->>'id', ''), md5(a::text)),
    NOW(),
    NOW()
FROM "clubs" c
CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(c."appointments"::jsonb) = 'array'
         THEN c."appointments"::jsonb ELSE '[]'::jsonb END
) AS a
CROSS JOIN LATERAL (
    SELECT COALESCE(
        CASE WHEN (a->>'date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN
            (substring(a->>'date' FROM 1 FOR 10) || ' ' ||
             COALESCE(NULLIF(substring(COALESCE(a->>'time', a->>'startTime', '') FROM 1 FOR 5), ''), '00:00')
             || ':00')::timestamp
        END,
        TIMESTAMP '1970-01-01 00:00:00'
    ) AS valore
) AS inizio
ON CONFLICT ("organization_id", "idempotency_key") DO NOTHING;
