-- ===========================================================================
-- Il doppio invio di una domanda produce una domanda sola
-- ===========================================================================
--
-- ## Il difetto, misurato
--
-- La sonda di concorrenza della Wave 5 (`scripts/wave-5-concurrency-probe.mjs`)
-- ha inviato due volte in parallelo la **stessa** domanda di iscrizione e ne ha
-- contate **due** in `form_submissions`, entrambe in `pending`, con gli allegati
-- caricati due volte perche `storeSubmissionFiles` gira una volta per invio.
--
-- Nessun controllo lo impediva: `receipt_token_hash` e unico ma si genera nuovo
-- a ogni chiamata, quindi non deduplica niente. Il contrasto era gia dentro il
-- prodotto: l'appuntamento una chiave di idempotenza ce l'ha, e la stessa prova
-- sul doppio clic la supera.
--
-- Il costo per la segreteria non e teorico: due domande identiche in coda per la
-- stessa persona, che qualcuno deve leggere e scartare a mano — e ADR-0040 dice
-- che i duplicati si **mostrano** e non si risolvono da soli, quindi restano li.
--
-- ## La chiave, e perche ha una finestra dentro
--
-- Deterministica su modulo, versione, chi compila e **il contenuto**, dentro una
-- finestra di dieci minuti. Due invii identici in parallelo collidono; lo stesso
-- modulo ricompilato un'ora dopo — o con dati diversi — passa.
--
-- La finestra sta **nella chiave** e non in un controllo applicativo, perche e
-- proprio con due richieste concorrenti che un controllo in memoria non regge:
-- entrambe leggono «non c'e» e scrivono. E la stessa lezione di ADR-0095 e
-- della deduplica delle comunicazioni — la difesa e l'indice.
--
-- ## Le righe gia in archivio
--
-- Restano con la chiave nulla, e in PostgreSQL due `NULL` non collidono: una
-- domanda inviata prima di oggi non e mai stata protetta e non lo diventa
-- retroattivamente. Fabbricarle una chiave adesso vorrebbe dire dichiarare un
-- presidio che al momento del bisogno non c'era.

ALTER TABLE "form_submissions" ADD COLUMN "dedup_key" TEXT;

CREATE UNIQUE INDEX "form_submissions_organization_id_dedup_key_key"
    ON "form_submissions"("organization_id", "dedup_key");
