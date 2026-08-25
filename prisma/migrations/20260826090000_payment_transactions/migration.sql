-- Registro degli incassi (Workstream A, ADR-0036).
--
-- Fino a qui una rata e un incasso erano la stessa riga di `payments`:
-- l'importo dovuto e il modo in cui era stato pagato vivevano negli stessi
-- campi. Da li discendevano i difetti segnalati — lo stato spostato a mano
-- dalla segreteria, l'impossibilita di incassare una rata in piu volte, la
-- correzione di un incasso che mutava il debito.
--
-- `payment_transactions` separa i due concetti: `payments` resta il **dovuto**,
-- ogni riga qui e un **movimento di denaro** che lo salda in tutto o in parte.
-- Lo stato della rata torna a essere una conseguenza degli importi.
--
-- La migrazione e **additiva**. Non legge, non riscrive e non converte nessun
-- pagamento esistente: una rata gia marcata come pagata resta tale e viene
-- letta come «incassata per intero» dal codice di dominio
-- (`resolveInstallmentLedger`). Riscrivere denaro gia registrato e esattamente
-- cio che non si fa.
--
-- L'unica modifica a una tabella esistente e la **rimozione di un vincolo di
-- unicita** su `receipts.payment_id`: una rata incassata in tre volte puo
-- avere tre ricevute, quindi il vincolo 1:1 era proprio il difetto. Rimuovere
-- un vincolo non invalida nessuna riga gia presente.

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "athlete_id" UUID,
    "payment_id" UUID,
    "amount" DOUBLE PRECISION NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "payment_method" TEXT NOT NULL,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "external_reference" TEXT,
    "created_by" UUID,
    "reversed_at" TIMESTAMP(3),
    "reversed_by" UUID,
    "reversal_reason" TEXT,
    "reverses_transaction_id" UUID,
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id"),
    -- Un incasso di zero euro non e un incasso. Il segno negativo e ammesso
    -- perche uno storno e un movimento di segno opposto, non una riga
    -- cancellata.
    CONSTRAINT "payment_transactions_amount_check" CHECK ("amount" <> 0)
);

-- CreateIndex
CREATE INDEX "payment_transactions_organization_id_idx" ON "payment_transactions"("organization_id");

-- CreateIndex
CREATE INDEX "payment_transactions_athlete_id_idx" ON "payment_transactions"("athlete_id");

-- CreateIndex
CREATE INDEX "payment_transactions_payment_id_idx" ON "payment_transactions"("payment_id");

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_reverses_transaction_id_fkey" FOREIGN KEY ("reverses_transaction_id") REFERENCES "payment_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Una ricevuta si emette per incasso, non per rata.
-- AlterTable
ALTER TABLE "receipts" ADD COLUMN "transaction_id" UUID;

-- DropIndex: `payment_id` non e piu univoco, vedi il commento in testa.
DROP INDEX IF EXISTS "receipts_payment_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "receipts_transaction_id_key" ON "receipts"("transaction_id");

-- CreateIndex
CREATE INDEX "receipts_payment_id_idx" ON "receipts"("payment_id");

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "payment_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
