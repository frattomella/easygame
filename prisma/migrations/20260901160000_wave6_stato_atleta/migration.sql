-- Wave 6 — W6-03: gli atleti che un'azione di massa aveva reso invisibili.
--
-- `athletes.status` e una colonna `text` senza vincolo. Un'azione di massa
-- della pagina Atleti scriveva il nome dell'AZIONE (`activate`) al posto del
-- nome dello STATO (`active`): il valore finiva in archivio, e da quel momento
-- l'atleta spariva da OGNI filtro — «Attivi» compreso — perche nessun confronto
-- poteva riconoscerlo.
--
-- Il difetto e chiuso a monte: `normalizeAthleteStatus`
-- (src/lib/athletes/status.ts) e ora l'unica strada per cui uno stato entra
-- nella colonna, e il filtro dell'elenco cerca tutte le grafie note. Resta da
-- correggere cio che e gia scritto.
--
-- Gli elenchi qui sotto devono restare allineati con gli alias del vocabolario:
-- lo presidia `tests/lib/stato-atleta.test.mjs`.
--
-- Non e reversibile, e va bene: si sta annullando un valore che non e mai stato
-- uno stato valido. La sua forma originale non porta informazione.

UPDATE "athletes"
   SET "status" = 'active'
 WHERE lower(btrim("status")) IN (
   'activate', 'attivo', 'attiva', 'attivi', 'enabled', 'abilitato'
 );

UPDATE "athletes"
   SET "status" = 'suspended'
 WHERE lower(btrim("status")) IN (
   'suspend', 'sospeso', 'sospesa', 'sospesi'
 );

UPDATE "athletes"
   SET "status" = 'loan'
 WHERE lower(btrim("status")) IN (
   'on_loan', 'on-loan', 'prestito', 'in_prestito', 'in-prestito', 'in prestito'
 );

UPDATE "athletes"
   SET "status" = 'inactive'
 WHERE lower(btrim("status")) IN (
   'deactivate', 'deactivated', 'disabled',
   'inattivo', 'inattiva', 'disattivato', 'disattivata', 'disattivati'
 );

-- Cio che resta fuori dai quattro insiemi torna al default della colonna.
-- Un atleta non deve poter essere invisibile nel proprio club per colpa di una
-- stringa che nessuno riconosce: sparire e il difetto, non la protezione.
UPDATE "athletes"
   SET "status" = 'active'
 WHERE "status" IS NULL
    OR lower(btrim("status")) NOT IN ('active', 'inactive', 'suspended', 'loan');

-- Lo stesso valore vive in copia dentro `data.status`, che le schermate leggono
-- come ripiego. Le due copie devono dire la stessa cosa.
UPDATE "athletes"
   SET "data" = jsonb_set("data", '{status}', to_jsonb("status"))
 WHERE "data" ? 'status'
   AND "data" ->> 'status' IS DISTINCT FROM "status";
