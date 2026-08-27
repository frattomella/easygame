-- E9: distinguere «mai deciso» da «spento di proposito».
--
-- `online_payments_enabled` nasce `false` per default di colonna. Il ramo di
-- aggiornamento dell'upsert di onboarding non lo toccava, quindi una riga gia
-- esistente restava `false` anche con l'account Stripe pienamente operativo:
-- il club incassava su Stripe ed EasyGame mostrava «pagamenti non attivi».
--
-- Risolverlo scrivendo `true` sempre avrebbe riacceso gli incassi di una
-- societa che la piattaforma ha sospeso di proposito, al primo evento
-- `account.updated` utile. Serve sapere se qualcuno ha deciso: e questa data.
ALTER TABLE "club_payment_accounts"
  ADD COLUMN "online_payments_decided_at" TIMESTAMP(3);

-- Le righe esistenti su cui una decisione **c'e gia stata** vanno stampigliate
-- adesso, altrimenti la nuova regola le tratterebbe come non inizializzate e
-- la prima sincronizzazione riaccenderebbe cio che era stato spento.
--
--   * `online_payments_enabled = true`  -> l'interruttore e acceso: qualcuno lo
--     ha acceso, e non c'e piu niente da inizializzare;
--   * `status = 'disabled'` -> lo scrive **solo** `setClubOnlinePaymentsEnabled`
--     con `enabled = false`, cioe la sospensione decisa dalla piattaforma.
--
-- Tutto il resto resta `NULL`: e il caso legacy, ed e quello che va inizializzato.
UPDATE "club_payment_accounts"
SET "online_payments_decided_at" = "updated_at"
WHERE "online_payments_enabled" = true
   OR "status" = 'disabled';
