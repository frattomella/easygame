-- Wave 4 / il vincolo che impediva lo storno di una liquidazione.
--
-- **Come e stato trovato.** Non leggendo il codice: eseguendolo. Una sonda di
-- concorrenza ha lanciato due storni simultanei della stessa liquidazione e ne
-- ha contate le righe nel database. Ne sono comparse **zero**, e non una come
-- atteso:
--
--     new row for relation "funding_settlements"
--     violates check constraint "funding_settlements_amount_check"
--
-- Lo storno che la Wave 4 ha scritto per il dominio bandi **non poteva
-- funzionare contro Postgres**, e nessuno se ne era accorto: i test del
-- repository girano su un doppio di Prisma, che i vincoli `CHECK` non li
-- applica. Tredici test verdi su una funzione che in produzione avrebbe
-- risposto un errore del driver a ogni chiamata.
--
-- **Perche il vincolo c'era, e aveva ragione.** Quando fu scritto, una
-- liquidazione era **solo** un bonifico dell'ente: un importo negativo sarebbe
-- stato un errore di digitazione, e il vincolo lo fermava. Il dominio non aveva
-- storni, e lo aveva anche dichiarato — «una liquidazione registrata per errore
-- resta, e blocca a valle».
--
-- La Wave 4 aggiunge lo storno, e con esso una riga che **deve** essere
-- negativa: e cosi che la somma del registro torna a zero quando qualcosa viene
-- annullato.
--
-- **La forma non e inventata qui.** E la stessa che il lavoro sportivo usa gia
-- (`sport_work_outbound_segno_check`): il segno **dipende dal tipo di riga**, e
-- un vincolo lo dice a voce alta invece di lasciarlo alla buona volonta del
-- servizio. Una riga di storno con importo positivo raddoppierebbe la
-- liquidazione invece di compensarla — che e il difetto opposto, e piu grave
-- del primo.

-- ------------------------------------------------------- la liquidazione
ALTER TABLE "funding_settlements"
    DROP CONSTRAINT IF EXISTS "funding_settlements_amount_check";

ALTER TABLE "funding_settlements"
    ADD CONSTRAINT "funding_settlements_amount_check"
    CHECK (
        ("reversal_of_id" IS NULL AND "amount" > 0)
        OR ("reversal_of_id" IS NOT NULL AND "amount" < 0)
    );

-- ------------------------------------------------- le righe di ripartizione
--
-- Stessa cosa un livello sotto: le righe di uno storno rimettono indietro cio
-- che coprivano, quindi sono negative. Il segno lo decide **la liquidazione a
-- cui appartengono**, e non la riga da sola: e per questo il vincolo guarda la
-- riga padre invece di accontentarsi di `<> 0`, che avrebbe lasciato passare
-- una ripartizione negativa dentro una liquidazione vera.
ALTER TABLE "funding_settlement_lines"
    DROP CONSTRAINT IF EXISTS "funding_settlement_lines_amount_check";

ALTER TABLE "funding_settlement_lines"
    ADD CONSTRAINT "funding_settlement_lines_amount_check"
    CHECK ("amount" <> 0);

-- Il segno coerente con la liquidazione padre non si puo esprimere in un
-- `CHECK`, che non vede altre tabelle. Lo difende un trigger: e l'unico posto
-- della Wave in cui ne serve uno, e la ragione e che il dato che decide sta
-- **nell'altra riga**.
CREATE OR REPLACE FUNCTION "funding_settlement_line_segno"() RETURNS trigger AS $$
DECLARE
  e_storno BOOLEAN;
BEGIN
  SELECT "reversal_of_id" IS NOT NULL INTO e_storno
  FROM "funding_settlements" WHERE "id" = NEW."settlement_id";

  IF e_storno AND NEW."amount" > 0 THEN
    RAISE EXCEPTION 'Una riga di storno deve rimettere indietro cio che copriva: importo negativo atteso';
  END IF;
  IF NOT e_storno AND NEW."amount" < 0 THEN
    RAISE EXCEPTION 'Una ripartizione di liquidazione non puo essere negativa';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "funding_settlement_line_segno_trigger" ON "funding_settlement_lines";

CREATE TRIGGER "funding_settlement_line_segno_trigger"
  BEFORE INSERT OR UPDATE ON "funding_settlement_lines"
  FOR EACH ROW EXECUTE FUNCTION "funding_settlement_line_segno"();
