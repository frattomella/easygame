-- Wave 4 / il vincolo che la sonda ha dimostrato mancante.
--
-- **Come e stato trovato.** Non ragionando: provando. Una sonda ha inserito una
-- riga per ogni invariante della barriera e ha guardato quali il database
-- rifiutasse davvero. Otto su nove hanno tenuto. Il nono no:
--
--     AMMESSO   origine proiettata scritta in tabella
--
-- `accounting_entries_origine_check` accettava tutti e otto i valori del
-- catalogo, e la distinzione fra le origini **scrivibili** e quelle
-- **proiettate** viveva solo in `WRITABLE_SOURCE_DOMAINS`, cioe in
-- TypeScript.
--
-- **Perche non basta.** La regola che quel controllo protegge non e una
-- convenzione di stile: e il primo comandamento della Wave.
--
-- > Un movimento di prima nota non e mai la fonte di un numero che un altro
-- > dominio possiede.
--
-- Una riga `ATHLETE_PAYMENT` dentro `accounting_entries` sarebbe **lo stesso
-- incasso rappresentato due volte**: una dal registro che lo possiede, una
-- dalla copia. I totali lo conterebbero due volte, e nessuno saprebbe a quale
-- delle due credere. E la seconda contabilita che il committente ha vietato,
-- e ci si arriverebbe per distrazione — uno script di migrazione, una rotta
-- futura scritta da qualcun altro, un import.
--
-- Un vincolo di database e l'unica regola che vale anche per chi non ha letto
-- il codice.
--
-- **Perche il catalogo largo resta comunque giusto** nel modello di dominio:
-- le righe *proiettate* portano quelle origini, e la proiezione e la tabella
-- devono parlare la stessa lingua perche un filtro, un export o un rendiconto
-- non debbano distinguere fra le due. Il catalogo descrive **cio che una riga
-- di prima nota puo dire**; questo vincolo dice **cio che si puo scrivere**.
-- Sono due cose diverse, e prima erano una sola.
--
-- Il giorno in cui una migrazione dovesse davvero portare qui una riga di un
-- altro dominio, quel giorno lo dichiara: toglie il vincolo, spiega perche, e
-- lo rimette.

ALTER TABLE "accounting_entries"
    DROP CONSTRAINT IF EXISTS "accounting_entries_origine_check";

ALTER TABLE "accounting_entries"
    ADD CONSTRAINT "accounting_entries_origine_check"
    CHECK ("source_domain" IN ('MANUAL', 'INTERNAL_TRANSFER', 'REVERSAL'));
