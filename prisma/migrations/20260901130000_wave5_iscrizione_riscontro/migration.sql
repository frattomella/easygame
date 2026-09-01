-- ===========================================================================
-- L'iscrizione online: il riscontro alla famiglia
-- ===========================================================================
--
-- ## Cosa esisteva davvero, e cosa no
--
-- Esiste un motore di moduli online **corretto e ben costruito**: pagina
-- pubblica senza sessione, limite di frequenza per indirizzo, errori collassati
-- a 404, versione del modulo immutabile citata dalla compilazione, controllo
-- duplicati, e — punto decisivo — **l'anagrafica nasce solo all'approvazione
-- umana** (ADR-0040). `prisma.athlete.create` non esiste in tutto `src/`: non
-- c'e nessuna strada pubblica che crei un atleta.
--
-- Quindi l'iscrizione online **esisteva per il club e non esisteva per la
-- famiglia**. Il gap non era il motore: era che la famiglia inviava e poi non
-- sapeva piu niente. Nessun riscontro, nessuno stato, nessun modo di aggiungere
-- un allegato mancante, nessun modo di sapere che era stata approvata.
--
-- ## Le tre colonne
--
-- `receipt_token_hash` e **l'impronta** del riferimento opaco che l'invio
-- restituisce, non il riferimento: quello vive solo nelle mani di chi lo ha
-- ricevuto. E la stessa forma dei link di pagamento (ADR-0085), e la ragione e
-- la stessa — chi legge il database non deve poter aprire la pratica di
-- nessuno.
--
-- `kind` distingue l'iscrizione dal **rinnovo**, che non e un secondo motore: e
-- lo stesso modulo con un contesto, i dati esistenti precompilati e la stagione
-- di destinazione citata.
--
-- `season_id` e quella stagione, quando la domanda la dichiara.
--
-- ## Cosa questa migrazione NON fa
--
-- Non tocca nessuna riga esistente: le domande gia inviate restano senza
-- ricevuta, ed e corretto — un riferimento opaco creato adesso non e mai stato
-- consegnato a nessuno, e fabbricarlo darebbe alla segreteria una chiave che
-- nessuna famiglia ha.

ALTER TABLE "form_submissions"
    ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'enrollment',
    ADD COLUMN "season_id" TEXT,
    ADD COLUMN "receipt_token_hash" TEXT;

CREATE UNIQUE INDEX "form_submissions_receipt_token_hash_key"
    ON "form_submissions"("receipt_token_hash");

CREATE INDEX "form_submissions_organization_id_kind_submitted_at_idx"
    ON "form_submissions"("organization_id", "kind", "submitted_at");
