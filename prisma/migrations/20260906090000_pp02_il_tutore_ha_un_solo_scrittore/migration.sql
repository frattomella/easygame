-- PP-02 / WP-C — **l'archivio rifiuta uno scrittore che non sia il proprietario.**
--
-- ## Perche questa migrazione esiste
--
-- Il censimento degli scrittori di `athletes.data.guardians[]` e stato rifatto
-- cinque volte e ogni volta era piu grande del precedente: quattro, sei, otto,
-- nove, sedici. Non per distrazione. La rotta generica scrive attraverso un
-- delegato **calcolato a runtime** (`getDelegate(resource)` -> `client[...]`):
-- una ricerca testuale di `prisma.athlete.update` non la trova, e nessun
-- elenco scritto a mano puo essere completo per costruzione.
--
-- Un test che porti la lista dei file «che oggi conosciamo» ripeterebbe percio
-- lo stesso errore in forma di prova. L'invariante deve stare **dove nessun
-- file nuovo puo aggirarla**: nell'archivio.
--
-- ## Cosa fa
--
-- `athlete_guardians` accetta un `INSERT` o un `UPDATE` solo dentro una
-- transazione che abbia dichiarato `SET LOCAL "easygame.guardian_writer" =
-- 'on'`. Quella dichiarazione la scrive **una sola funzione** in tutto il
-- prodotto — `withGuardianWriter` in `src/lib/server/athlete-guardians.ts` — e
-- il modulo che la contiene e il proprietario del dominio.
--
-- Uno scrittore nuovo che nasca domani in un file qualunque, con Prisma o con
-- SQL grezzo, dentro la rotta generica o fuori, non incontra una lista da
-- aggiornare: incontra un errore dell'archivio.
--
-- ## Le tre scelte che questa forma comporta, e perche
--
-- **1. Il permesso vive nella transazione, non nella sessione.** `SET LOCAL`
-- si annulla al `COMMIT` e al `ROLLBACK`. Un modulo che lo accendesse una
-- volta per connessione lo lascerebbe acceso per tutte le richieste servite da
-- quella connessione — cioe non sarebbe piu un permesso. Misurato: la quarta
-- prova della sonda ripete la stessa `UPDATE` in una transazione successiva e
-- viene rifiutata.
--
-- **2. La cancellazione a cascata resta possibile.** Cancellare la scheda di
-- un atleta cancella i suoi tutori, ed e giusto: e la strada del diritto
-- all'oblio. Il vaglio riconosce quel caso dal fatto che la scheda **non
-- esiste piu** nel momento in cui il vaglio gira, e lo lascia passare. Non e
-- una deduzione: e verificato contro PostgreSQL, il figlio sparisce e il
-- vaglio non solleva.
--
-- **3. Una `DELETE` non a cascata resta sorvegliata.** Togliere una riga di
-- tutore non concede niente — chiude un accesso — ma toglierla e poi
-- riscriverla sarebbe il modo di rimettere in piedi un tutore revocato, e
-- l'`INSERT` che servirebbe e sbarrato. Sorvegliarla comunque costa una riga e
-- toglie la domanda.
--
-- `TRUNCATE` non fa scattare i vagli di riga: e dichiarato, ed e una
-- operazione che **toglie** tutti i tutori, quindi non apre un accesso. Chi ha
-- il diritto di troncare una tabella ha gia molto altro.

CREATE OR REPLACE FUNCTION "easygame_athlete_guardians_solo_il_proprietario"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Il permesso che il modulo proprietario accende dentro la propria
  -- transazione, e che il COMMIT spegne da se.
  IF coalesce(current_setting('easygame.guardian_writer', true), '') = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- La cascata dalla cancellazione della scheda: qui la scheda non c'e gia
  -- piu, ed e il solo modo in cui questo caso si presenta.
  IF TG_OP = 'DELETE'
     AND NOT EXISTS (SELECT 1 FROM "athletes" WHERE "id" = OLD."athlete_id") THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION
    'athlete_guardians: scrittura (%) fuori dal modulo proprietario. Passa da src/lib/server/athlete-guardians.ts',
    TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$;

DROP TRIGGER IF EXISTS "athlete_guardians_solo_il_proprietario" ON "athlete_guardians";

CREATE TRIGGER "athlete_guardians_solo_il_proprietario"
BEFORE INSERT OR UPDATE OR DELETE ON "athlete_guardians"
FOR EACH ROW
EXECUTE FUNCTION "easygame_athlete_guardians_solo_il_proprietario"();
