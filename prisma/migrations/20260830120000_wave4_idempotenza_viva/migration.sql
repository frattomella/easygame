-- ===========================================================================
-- L'idempotenza vale sui movimenti **vivi**, non su quelli stornati.
-- ===========================================================================
--
-- ## Il difetto
--
-- `accounting_entries_evento_unico` diceva: lo stesso fatto non puo avere due
-- rappresentazioni finanziarie. Giusto — ma contava anche quelle **stornate**.
--
-- Un versamento F24 registrato per 1.000 euro e poi stornato perche l'importo
-- era sbagliato lasciava in tabella la riga originale, marcata `reversed_at` e
-- con il suo `source_event_key` intatto. Da quel momento l'adempimento non si
-- poteva piu assolvere: il controllo di idempotenza trovava la riga morta,
-- rispondeva «esiste gia», e l'importo corretto non entrava mai. Il messaggio
-- che l'utente riceveva — «per correggerla si storna il movimento e se ne
-- registra uno nuovo» — descriveva una procedura che il vincolo rendeva
-- impossibile.
--
-- ## La regola giusta
--
-- Una riga stornata non rappresenta piu niente: la coppia originale/storno
-- somma zero e il fatto e tornato non registrato. L'unicita deve quindi valere
-- fra le righe **vive**, ed e cio che questo indice dice.
--
-- La protezione contro la doppia registrazione non si indebolisce: due
-- richieste simultanee per lo stesso evento continuano a infrangersi qui,
-- perche nessuna delle due e stornata.
-- ===========================================================================

DROP INDEX IF EXISTS "accounting_entries_evento_unico";

CREATE UNIQUE INDEX "accounting_entries_evento_unico"
  ON "accounting_entries" ("organization_id", "source_domain", "source_event_key")
  WHERE "source_event_key" IS NOT NULL AND "reversed_at" IS NULL;
