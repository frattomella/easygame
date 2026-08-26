-- Fonte della maturazione, previsione e conferma esterna (ADR-0054).
--
-- Il difetto che chiude: EasyGame faceva maturare un contributo appena
-- l'appello registrato qui superava la soglia. Su molti bandi la frequenza
-- ufficiale si registra su una piattaforma dell'ente, e cio che EasyGame sa e
-- al massimo una previsione. Dichiarare quel numero all'ente vuol dire
-- rendicontare un importo che l'ente non ha riconosciuto.
--
-- Tre cose nuove, tutte additive:
--
--   * `funding_programs.accrual_source` dice se le presenze EasyGame **sono**
--     la fonte o solo una previsione. Il default riproduce esattamente il
--     comportamento precedente, quindi nessun programma esistente cambia;
--   * `funding_accruals.estimated_amount` tiene la previsione accanto al
--     maturato invece che al posto suo;
--   * le colonne di conferma (`accrual_origin`, `confirmed_at`,
--     `confirmed_by`, `external_reference`, `confirmation_notes`) rendono
--     auditabile chi ha riconosciuto quell'importo e su quale riferimento.
--
-- `estimated_amount` nasce a zero anche sulle righe gia calcolate: sono tutte
-- di programmi a fonte EasyGame, dove previsione e maturato coincidono e il
-- primo ricalcolo lo riallinea. Nessun importo gia rendicontato o liquidato
-- viene toccato.

-- AlterTable
ALTER TABLE "funding_programs"
  ADD COLUMN IF NOT EXISTS "accrual_source" TEXT NOT NULL DEFAULT 'easygame_attendance';

-- AlterTable
ALTER TABLE "funding_accruals"
  ADD COLUMN IF NOT EXISTS "estimated_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "accrual_origin" TEXT,
  ADD COLUMN IF NOT EXISTS "confirmed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "confirmed_by" UUID,
  ADD COLUMN IF NOT EXISTS "external_reference" TEXT,
  ADD COLUMN IF NOT EXISTS "confirmation_notes" TEXT;

-- I periodi gia maturati sono nati dalle presenze EasyGame: dichiararlo rende
-- leggibile la provenienza anche dello storico, senza cambiare un importo.
UPDATE "funding_accruals"
   SET "accrual_origin" = 'easygame_attendance',
       "estimated_amount" = "accrued_amount"
 WHERE "accrual_origin" IS NULL
   AND "accrued_amount" > 0;
