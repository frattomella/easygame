-- ADR-0188, revisione ostile (H1): la chiave esterna su "athletes" e ON DELETE
-- SET NULL, e il vincolo di prima ("enrolled" <=> athlete_id IS NOT NULL)
-- vietava proprio quella riga: cancellare una scheda atleta nata da una prova
-- falliva nel database. Il vincolo nuovo dice cio che serve e non di piu: una
-- riga NON iscritta non porta mai una scheda; una riga iscritta la porta, o
-- l'ha persa perche la scheda e stata cancellata.
ALTER TABLE "trial_athletes"
    DROP CONSTRAINT IF EXISTS "trial_athletes_enrolled_has_athlete_check";

ALTER TABLE "trial_athletes"
    ADD CONSTRAINT "trial_athletes_enrolled_has_athlete_check"
    CHECK ("status" = 'enrolled' OR "athlete_id" IS NULL);
