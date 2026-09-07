-- PP-05 — **Una sola challenge viva per canale, e a dirlo e il database.**
--
-- ## Il difetto che chiude
--
-- `createInternalChallenge` chiudeva le challenge vive e ne apriva una nuova in
-- due istruzioni separate. In sequenza il risultato e corretto; **in
-- parallelo no**: dodici richieste simultanee eseguono prima i dodici
-- `UPDATE` (che non trovano niente da chiudere, perche nessuno ha ancora
-- inserito) e poi i dodici `INSERT`. Misurato contro Postgres dalla sonda
-- `scripts/pp-05-otp-probe.mjs` (P3): **dodici challenge vive, dodici codici
-- validi nello stesso istante.**
--
-- Le conseguenze erano due, e la seconda e peggiore della prima:
--
--  1. il cooldown non esisteva piu, perche si scavalcava mandando le richieste
--     insieme invece che in fila;
--  2. dodici codici validi contemporaneamente **moltiplicano per dodici** le
--     probabilita di indovinarne uno, e ognuno porta con se i propri cinque
--     tentativi: il tetto passava da 5 su 1.000.000 a 60 su 1.000.000 per
--     raffica, ripetibile.
--
-- Nessun test in memoria poteva vederlo: un doppio esegue una chiamata alla
-- volta e non ha i lock di riga di Postgres.
--
-- ## La forma della correzione
--
-- L'invariante non si affida al codice applicativo: diventa un **vincolo del
-- database**. Due indici unici parziali, perche i due mondi convivono sulla
-- stessa tabella e non devono escludersi a vicenda:
--
--  * le challenge OTP (`purpose <> 'reset_password'`): al massimo una viva per
--    utente e canale;
--  * i token di reset password: al massimo uno vivo per utente e canale.
--
-- Sotto concorrenza il secondo `INSERT` riceve una violazione di unicita, e
-- `createInternalChallenge` la traduce in «attendi prima di richiedere un altro
-- codice» — che e la risposta giusta, perche un codice valido esiste gia ed e
-- gia partito verso il destinatario.
--
-- ## Forward-safe
--
-- Prima di creare gli indici si chiudono le eventuali challenge vive in
-- eccesso, tenendo la piu recente per gruppo. Nessuna riga viene cancellata:
-- una challenge chiusa resta come traccia, e comunque scade da sola.

-- 1. Chiude le challenge OTP vive in eccesso, tenendo la piu recente.
UPDATE "auth_verification_challenges" AS c
SET "consumed_at" = NOW()
WHERE c."consumed_at" IS NULL
  AND c."purpose" <> 'reset_password'
  AND c."id" <> (
    SELECT p."id"
    FROM "auth_verification_challenges" AS p
    WHERE p."user_id" = c."user_id"
      AND p."channel" = c."channel"
      AND p."consumed_at" IS NULL
      AND p."purpose" <> 'reset_password'
    ORDER BY p."created_at" DESC, p."id" DESC
    LIMIT 1
  );

-- 2. Stessa cosa per i token di reset password, nel loro mondo separato.
UPDATE "auth_verification_challenges" AS c
SET "consumed_at" = NOW()
WHERE c."consumed_at" IS NULL
  AND c."purpose" = 'reset_password'
  AND c."id" <> (
    SELECT p."id"
    FROM "auth_verification_challenges" AS p
    WHERE p."user_id" = c."user_id"
      AND p."channel" = c."channel"
      AND p."consumed_at" IS NULL
      AND p."purpose" = 'reset_password'
    ORDER BY p."created_at" DESC, p."id" DESC
    LIMIT 1
  );

-- 3. L'invariante, da qui in avanti garantito dal database.
CREATE UNIQUE INDEX IF NOT EXISTS "auth_verification_challenges_una_viva_otp"
  ON "auth_verification_challenges" ("user_id", "channel")
  WHERE "consumed_at" IS NULL AND "purpose" <> 'reset_password';

CREATE UNIQUE INDEX IF NOT EXISTS "auth_verification_challenges_una_viva_reset"
  ON "auth_verification_challenges" ("user_id", "channel")
  WHERE "consumed_at" IS NULL AND "purpose" = 'reset_password';
