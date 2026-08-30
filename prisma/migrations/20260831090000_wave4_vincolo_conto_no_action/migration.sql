-- ===========================================================================
-- Il vincolo del conto si cancella con NO ACTION, non con SET NULL
-- ===========================================================================
--
-- ## Perche una migrazione nuova e non una correzione di quella di ieri
--
-- La correzione era stata scritta **dentro**
-- `20260830230000_wave4_conto_dello_stesso_club`, che era gia stata applicata.
-- E la seconda volta nella stessa Wave: un database che aveva gia eseguito
-- quel file non avrebbe mai ricevuto la modifica, perche Prisma non rilegge le
-- migrazioni gia applicate — e in piu ne registra l'impronta, quindi il
-- `prisma migrate deploy` del deploy successivo **fallisce** trovandola
-- cambiata, e si porta dietro tutto il deploy.
--
-- Il file di ieri e stato quindi rimesso com'era, e la correzione vive qui.
--
-- ## Cosa correggeva
--
-- `ON DELETE SET NULL` **senza elenco di colonne** azzera tutte le colonne
-- della chiave: cancellare un conto avrebbe tentato di scrivere
-- `organization_id = NULL` sulle righe che lo citano. Su queste quattro
-- tabelle la colonna e NOT NULL, quindi il tentativo fallirebbe rumorosamente;
-- su una tabella dove non lo fosse, distruggerebbe in silenzio l'appartenenza
-- al club di righe di denaro.
--
-- Oggi non succede perche la chiave esterna storica su `financial_account_id`
-- e RESTRICT e blocca la cancellazione prima. Ma un vincolo che non fa danno
-- solo grazie a un altro vincolo che non lo nomina e una trappola per chi
-- verra dopo: qui la porta e chiusa da se.
--
-- ## Perche si puo eseguire ovunque
--
-- Ogni vincolo si toglie con `IF EXISTS` e si rimette: su un database che ha
-- la versione `SET NULL` la sostituisce, su uno che ha gia `NO ACTION` la
-- riscrive identica, su uno che non ha niente la crea. `NOT VALID` per la
-- ragione di sempre: una riga gia scritta male non deve far cadere il deploy
-- di tutti.
-- ===========================================================================

ALTER TABLE "payment_transactions"
  DROP CONSTRAINT IF EXISTS "payment_transactions_conto_dello_stesso_club";
ALTER TABLE "payment_transactions"
  ADD CONSTRAINT "payment_transactions_conto_dello_stesso_club"
  FOREIGN KEY ("organization_id", "financial_account_id")
  REFERENCES "financial_accounts" ("organization_id", "id")
  ON DELETE NO ACTION
  NOT VALID;

ALTER TABLE "accounting_entries"
  DROP CONSTRAINT IF EXISTS "accounting_entries_conto_dello_stesso_club";
ALTER TABLE "accounting_entries"
  ADD CONSTRAINT "accounting_entries_conto_dello_stesso_club"
  FOREIGN KEY ("organization_id", "financial_account_id")
  REFERENCES "financial_accounts" ("organization_id", "id")
  ON DELETE NO ACTION
  NOT VALID;

ALTER TABLE "funding_settlements"
  DROP CONSTRAINT IF EXISTS "funding_settlements_conto_dello_stesso_club";
ALTER TABLE "funding_settlements"
  ADD CONSTRAINT "funding_settlements_conto_dello_stesso_club"
  FOREIGN KEY ("organization_id", "financial_account_id")
  REFERENCES "financial_accounts" ("organization_id", "id")
  ON DELETE NO ACTION
  NOT VALID;

ALTER TABLE "sport_work_outbound_transactions"
  DROP CONSTRAINT IF EXISTS "sport_work_outbound_conto_dello_stesso_club";
ALTER TABLE "sport_work_outbound_transactions"
  ADD CONSTRAINT "sport_work_outbound_conto_dello_stesso_club"
  FOREIGN KEY ("organization_id", "financial_account_id")
  REFERENCES "financial_accounts" ("organization_id", "id")
  ON DELETE NO ACTION
  NOT VALID;

DO $$
DECLARE
  vincolo record;
BEGIN
  FOR vincolo IN
    SELECT unnest(ARRAY[
      'payment_transactions|payment_transactions_conto_dello_stesso_club',
      'accounting_entries|accounting_entries_conto_dello_stesso_club',
      'funding_settlements|funding_settlements_conto_dello_stesso_club',
      'sport_work_outbound_transactions|sport_work_outbound_conto_dello_stesso_club'
    ]) AS riga
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER TABLE %I VALIDATE CONSTRAINT %I',
        split_part(vincolo.riga, '|', 1),
        split_part(vincolo.riga, '|', 2)
      );
    EXCEPTION WHEN others THEN
      RAISE NOTICE
        'Il vincolo % non e stato validato, e vale comunque su ogni scrittura nuova. Se il motivo e una riga che cita il conto di un altro club va corretta; se e altro, lo dice il dettaglio: %',
        split_part(vincolo.riga, '|', 2), SQLERRM;
    END;
  END LOOP;
END;
$$;
