-- N7 / ADR-0158 — **l'allocazione di copertura: di questa rata, questa parte
-- la porta un ente.**
--
-- ## Che cosa apre
--
-- Una societa iscrive un atleta con una quota di 600 EUR e sa che un voucher
-- regionale ne portera 500. La famiglia deve 100.
--
-- EasyGame sapeva rappresentare i due numeri separatamente e non sapeva
-- metterli in relazione: il piano generava rate per 600 e il registro incassi
-- diceva che la famiglia era indietro di 600, mentre il bando sapeva che a
-- quell'atleta erano assegnati 500. Nessuna riga diceva «di questa rata da
-- 200, 150 li porta il voucher».
--
-- ADR-0037 aveva visto il problema e aveva scelto di **non** risolverlo, per
-- una ragione giusta: compensare in automatico farebbe risultare saldate rate
-- che nessuno ha pagato. Quella decisione chiudeva la porta sbagliata e
-- lasciava aperta la domanda. ADR-0158 la chiude.
--
-- ## Che cosa NON e questa tabella
--
-- **Non e un movimento di denaro.** Scrivere una riga qui non crea nessun
-- `payment_transaction`, non tocca `payments.status`, non entra in prima nota
-- e non compare in nessun riquadro di cassa. Dice una cosa sola: «di questa
-- rata, questa parte il club se l'aspetta da quell'ente».
--
-- ## Storno, non cancellazione
--
-- Una copertura revocata resta, marcata `reversed_at`, e lo storno e esso
-- stesso una riga di segno opposto collegata da `reverses_allocation_id`. E la
-- forma che il denaro ha gia qui (ADR-0036, ADR-0071).
--
-- ## Le difese che vivono nell'archivio
--
-- * `payment_coverage_allocations_importo_segno` — una copertura vale piu di
--   zero, uno storno meno di zero. Senza, uno storno da +150 raddoppierebbe la
--   copertura invece di toglierla.
-- * `payment_coverage_allocations_storno_unico` — uno storno per originale.
--   Due storni della stessa riga porterebbero la copertura sotto zero, e la
--   quota famiglia sopra il debito.
-- * `ON DELETE RESTRICT` sull'adesione — cancellare un'adesione che ha gia
--   coperto delle rate porterebbe via la spiegazione di perche quelle rate
--   chiedevano meno alla famiglia.
--
-- I **due tetti** (per rata e per adesione) sono somme e vivono
-- nell'applicazione: Postgres non li puo esprimere come vincolo di riga senza
-- un trigger che serializzi ogni scrittura sulla rata. Li fa valere
-- `sport-funding-coverage.ts` dentro la transazione che blocca la rata, con la
-- stessa forma con cui `createPaymentTransaction` fa valere la capienza.
--
-- Non tocca nessuna riga esistente: e solo una tabella nuova.

CREATE TABLE "payment_coverage_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "created_by" UUID,
    "reversed_at" TIMESTAMP(3),
    "reversed_by" UUID,
    "reversal_reason" TEXT,
    "reverses_allocation_id" UUID,
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_coverage_allocations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_coverage_allocations_organization_id_idx"
  ON "payment_coverage_allocations"("organization_id");
CREATE INDEX "payment_coverage_allocations_payment_id_idx"
  ON "payment_coverage_allocations"("payment_id");
CREATE INDEX "payment_coverage_allocations_enrollment_id_idx"
  ON "payment_coverage_allocations"("enrollment_id");
CREATE INDEX "payment_coverage_allocations_athlete_id_idx"
  ON "payment_coverage_allocations"("athlete_id");
CREATE INDEX "payment_coverage_allocations_reverses_allocation_id_idx"
  ON "payment_coverage_allocations"("reverses_allocation_id");

-- Una copertura vale piu di zero; uno storno meno di zero. Le due righe si
-- elidono, e nessuna delle due puo fingersi l'altra.
ALTER TABLE "payment_coverage_allocations"
ADD CONSTRAINT "payment_coverage_allocations_importo_segno" CHECK (
  ("reverses_allocation_id" IS NULL AND "amount" > 0)
  OR ("reverses_allocation_id" IS NOT NULL AND "amount" < 0)
);

-- Uno storno per originale: due porterebbero la copertura sotto zero, e la
-- quota a carico della famiglia sopra il debito che ha davvero.
CREATE UNIQUE INDEX "payment_coverage_allocations_storno_unico"
  ON "payment_coverage_allocations"("reverses_allocation_id")
  WHERE "reverses_allocation_id" IS NOT NULL;

ALTER TABLE "payment_coverage_allocations"
ADD CONSTRAINT "payment_coverage_allocations_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "clubs"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_coverage_allocations"
ADD CONSTRAINT "payment_coverage_allocations_payment_id_fkey"
FOREIGN KEY ("payment_id") REFERENCES "payments"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_coverage_allocations"
ADD CONSTRAINT "payment_coverage_allocations_enrollment_id_fkey"
FOREIGN KEY ("enrollment_id") REFERENCES "funding_enrollments"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_coverage_allocations"
ADD CONSTRAINT "payment_coverage_allocations_athlete_id_fkey"
FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_coverage_allocations"
ADD CONSTRAINT "payment_coverage_allocations_reverses_allocation_id_fkey"
FOREIGN KEY ("reverses_allocation_id") REFERENCES "payment_coverage_allocations"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
