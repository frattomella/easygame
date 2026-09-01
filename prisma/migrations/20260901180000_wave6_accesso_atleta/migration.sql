-- Wave 6 — W6-25/26/27: l'accesso EasyGame di un atleta.
--
-- Il ruolo `athlete` era modellato end-to-end e **nessun percorso scriveva
-- `athletes.user_id`**. La colonna esiste dal principio: qui non si aggiunge
-- il legame, si aggiunge il **ciclo di vita** che lo produce e che lo toglie
-- lasciando traccia.
--
-- In archivio non finisce mai il token: solo il suo SHA-256 (ADR-0085). Il
-- token in chiaro vive il tempo di comporre l'email e poi non esiste piu, ne
-- nel database ne nei log.

CREATE TABLE "athlete_account_invites" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "user_id" UUID,
    "email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "athlete_account_invites_pkey" PRIMARY KEY ("id")
);

-- Un token individua **un** invito. Il riscatto cerca per hash e non per
-- atleta: chi ha il token non deve poter dire di quale atleta e.
CREATE UNIQUE INDEX "athlete_account_invites_token_hash_key"
    ON "athlete_account_invites"("token_hash");

CREATE INDEX "athlete_account_invites_organization_id_athlete_id_idx"
    ON "athlete_account_invites"("organization_id", "athlete_id");
CREATE INDEX "athlete_account_invites_organization_id_status_idx"
    ON "athlete_account_invites"("organization_id", "status");

-- **Un solo invito vivo per atleta, e lo garantisce il database.**
--
-- Parziale sul solo stato `sent`, per la stessa ragione per cui
-- `appointments_slot_vivo_unico` e parziale sugli stati vivi: un invito
-- revocato, scaduto o accettato non occupa piu il posto, e deve poterlo
-- liberare **senza essere cancellato** — la storia di chi ha invitato chi, e
-- quando, e proprio cio che la scheda atleta deve saper mostrare.
--
-- Un reinvio quindi revoca il precedente e ne crea uno nuovo. Se lo facesse
-- solo il codice, due segretarie che premono insieme produrrebbero due token
-- validi per la stessa persona, e revocarne uno lascerebbe l'altro in giro.
CREATE UNIQUE INDEX "athlete_account_invites_vivo_unico"
    ON "athlete_account_invites"("organization_id", "athlete_id")
    WHERE "status" = 'sent';

ALTER TABLE "athlete_account_invites"
    ADD CONSTRAINT "athlete_account_invites_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "clubs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "athlete_account_invites"
    ADD CONSTRAINT "athlete_account_invites_athlete_id_fkey"
    FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- `SET NULL` e non `CASCADE`: cancellare un'utenza non deve far sparire la
-- traccia di un invito che e stato mandato. E la stessa regola con cui la
-- Wave 4 ha chiuso le cancellazioni che distruggevano.
ALTER TABLE "athlete_account_invites"
    ADD CONSTRAINT "athlete_account_invites_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
