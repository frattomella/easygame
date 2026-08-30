-- ===========================================================================
-- Un documento annullato non deve bloccare per sempre il suo incasso.
-- ===========================================================================
--
-- ## Il difetto
--
-- `receipts.transaction_id` era `UNIQUE` **pieno**, e
-- `invoices_transaction_unico` lo era su ogni riga con `transaction_id` non
-- nullo. `cancelDocument` lascia il collegamento dov'e — ed e giusto, perche il
-- documento annullato deve continuare a dire a quale incasso si riferiva.
--
-- Le due cose insieme producevano uno stato senza uscita: annullata una
-- ricevuta emessa per errore, quell'incasso **non poteva piu essere
-- documentato**. E il controllo di idempotenza dell'emissione, che non
-- filtrava sull'annullamento, restituiva la ricevuta morta **dichiarando
-- successo**: la famiglia riceveva un documento ritirato, e la prima nota —
-- che i documenti annullati li esclude di proposito — mostrava l'incasso senza
-- numero.
--
-- E la stessa forma dell'indice di idempotenza della prima nota, corretta due
-- migrazioni fa: la procedura consigliata dal prodotto era resa impossibile dal
-- vincolo che la consigliava.
--
-- ## La regola
--
-- L'unicita vale fra i documenti **vivi**. Un documento annullato ha smesso di
-- rappresentare quell'incasso; il suo numero resta assegnato e non torna
-- disponibile (ADR-0044), ma il posto di «documento di questo incasso» si
-- libera.
-- ===========================================================================

DROP INDEX IF EXISTS "invoices_transaction_unico";

CREATE UNIQUE INDEX "invoices_transaction_unico"
  ON "invoices" ("transaction_id")
  WHERE "transaction_id" IS NOT NULL AND "cancelled_at" IS NULL;

/*
  Sulle ricevute il vincolo era un `UNIQUE` di colonna, quindi va tolto come
  vincolo e rifatto come indice parziale.
*/
ALTER TABLE "receipts" DROP CONSTRAINT IF EXISTS "receipts_transaction_id_key";
DROP INDEX IF EXISTS "receipts_transaction_id_key";

CREATE UNIQUE INDEX "receipts_transaction_unico"
  ON "receipts" ("transaction_id")
  WHERE "transaction_id" IS NOT NULL AND "cancelled_at" IS NULL;

/*
  **Una fattura per incasso, non una per rata.**

  `invoices_payment_id_key` era un `UNIQUE` pieno su `payment_id`: una rata
  saldata in due incassi poteva avere **una sola** fattura, mentre il dominio
  le emette per incasso. Il secondo tentativo si infrangeva sul vincolo — ma
  **dopo** che il numero era gia stato assegnato, quindi ogni clic bruciava un
  numero e la sequenza avanzava sul nulla.

  Il collegamento alla rata resta, e serve; l'unicita che pretendeva no.
*/
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_payment_id_key";
DROP INDEX IF EXISTS "invoices_payment_id_key";

CREATE INDEX IF NOT EXISTS "invoices_payment_id_idx"
  ON "invoices" ("payment_id");
