-- ------------------------------------------------------------------------
-- WP11 — L'anagrafica dei token push (ADR-0166)
-- ------------------------------------------------------------------------
--
-- Il mobile non aveva nessun modo di dire al backend "questo dispositivo
-- appartiene a questo account, mandagli le notifiche qui": ne esisteva una
-- tabella ne un endpoint. Questa migrazione aggiunge **solo l'anagrafica dei
-- destinatari** — nessun invio di notifiche push e implementato da qui, e
-- non lo e da nessuna parte del repository dopo questa migrazione: quello
-- resta un lavoro a se.
--
-- `token` e unico nel senso letterale, non solo per indice: lo stesso
-- telefono che cambia account (logout e login con un utente diverso)
-- riscrive la riga sul nuovo `user_id` invece di lasciarne una seconda che
-- punterebbe ancora al vecchio proprietario (`registerDevicePushToken` fa un
-- upsert su questa colonna) — un token duplicato varrebbe una notifica
-- recapitata alla persona sbagliata.
--
-- `session_id` lega il token alla sessione mobile che lo ha registrato, cosi
-- che il logout possa revocare **solo** i token di quel dispositivo e non
-- quelli di altri dispositivi dello stesso account ancora collegati.
-- `ON DELETE SET NULL` e una rete di sicurezza per una sessione cancellata da
-- un'altra strada (scadenza, pulizia) — il logout revoca (`revoked_at`)
-- leggendo `session_id` **prima** di cancellare la sessione, non si affida a
-- questo vincolo per farlo.
-- ------------------------------------------------------------------------

CREATE TABLE "device_push_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "session_id" UUID,
    "platform" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_push_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "device_push_tokens_token_key" ON "device_push_tokens"("token");
CREATE INDEX "device_push_tokens_user_id_idx" ON "device_push_tokens"("user_id");
CREATE INDEX "device_push_tokens_session_id_idx" ON "device_push_tokens"("session_id");

ALTER TABLE "device_push_tokens"
    ADD CONSTRAINT "device_push_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "device_push_tokens"
    ADD CONSTRAINT "device_push_tokens_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "sessions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
