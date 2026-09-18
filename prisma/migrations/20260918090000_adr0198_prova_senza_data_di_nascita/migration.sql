-- ADR-0198 §4: la data di nascita di una persona in prova e facoltativa.
-- Solo il vincolo: nessuna riga cambia, nessun segnaposto.
ALTER TABLE "trial_athletes" ALTER COLUMN "birth_date" DROP NOT NULL;
