-- Numerazione documenti per club e per anno (ADR-0044, chiude D28).
--
-- Il difetto che questa migrazione chiude. `receipts.receipt_number` e
-- `invoices.invoice_number` erano univoci su **tutta** la tabella: due
-- societa che emettevano la loro prima ricevuta dell'anno chiedevano
-- entrambe `R-2026-0001`, e la seconda falliva per un motivo che non aveva
-- niente a che vedere con lei. La mitigazione in uso — riprovare con il
-- numero successivo, fino a venticinque volte — funzionava, ma produceva
-- numerazioni con buchi appena due club emettevano nello stesso momento.
--
-- Un numero di documento appartiene a **un club e a un esercizio**: la
-- societa Alfa e la societa Beta hanno entrambe la loro ricevuta 1 del 2026,
-- e devono averla. Il vincolo diventa composto.
--
-- La sequenza sta in una tabella sua e non si ricava contando le righe.
-- Contare non e sicuro sotto concorrenza — due operatori che incassano nello
-- stesso istante contano lo stesso numero — e non e nemmeno corretto: una
-- ricevuta annullata non deve far riusare il suo numero.
--
-- La conversione dei vincoli e sicura sul dato esistente: finche il vincolo
-- e stato globale, due club non hanno potuto avere lo stesso numero.

-- CreateTable
CREATE TABLE "document_number_sequences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_number_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_number_sequences_organization_id_kind_year_key"
    ON "document_number_sequences"("organization_id", "kind", "year");

-- AddForeignKey
ALTER TABLE "document_number_sequences"
    ADD CONSTRAINT "document_number_sequences_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "clubs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Il vincolo globale lascia il posto a quello per club.
DROP INDEX IF EXISTS "receipts_receipt_number_key";
DROP INDEX IF EXISTS "invoices_invoice_number_key";

CREATE UNIQUE INDEX "receipts_organization_id_receipt_number_key"
    ON "receipts"("organization_id", "receipt_number");
CREATE UNIQUE INDEX "invoices_organization_id_invoice_number_key"
    ON "invoices"("organization_id", "invoice_number");

-- Riporto delle sequenze gia in uso.
--
-- Senza questo, il primo documento emesso dopo la migrazione tornerebbe a 1 e
-- si scontrerebbe con quelli gia emessi. Si prende il **massimo fra due
-- letture**: il numero piu alto leggibile dalla coda numerica di un numero
-- gia emesso, e il conteggio delle righe. Il conteggio copre il caso di
-- numeri scritti a mano in una forma che non si sa leggere — una fattura di
-- questo tipo esiste, perche fino a oggi il numero lo mandava il client.
INSERT INTO "document_number_sequences" ("organization_id", "kind", "year", "last_number", "updated_at")
SELECT
    "organization_id",
    'receipt',
    EXTRACT(YEAR FROM "issue_date")::int,
    GREATEST(
        COALESCE(MAX(NULLIF(regexp_replace("receipt_number", '^.*[^0-9]([0-9]+)$', '\1'), "receipt_number")::int), 0),
        COUNT(*)::int
    ),
    CURRENT_TIMESTAMP
FROM "receipts"
WHERE "receipt_number" IS NOT NULL
GROUP BY "organization_id", EXTRACT(YEAR FROM "issue_date")::int;

INSERT INTO "document_number_sequences" ("organization_id", "kind", "year", "last_number", "updated_at")
SELECT
    "organization_id",
    'invoice',
    EXTRACT(YEAR FROM "issue_date")::int,
    GREATEST(
        COALESCE(MAX(NULLIF(regexp_replace("invoice_number", '^.*[^0-9]([0-9]+)$', '\1'), "invoice_number")::int), 0),
        COUNT(*)::int
    ),
    CURRENT_TIMESTAMP
FROM "invoices"
WHERE "invoice_number" IS NOT NULL
GROUP BY "organization_id", EXTRACT(YEAR FROM "issue_date")::int;
