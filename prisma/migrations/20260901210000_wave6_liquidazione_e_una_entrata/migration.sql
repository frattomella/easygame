-- Wave 6 — la liquidazione di un contributo e un'ENTRATA.
--
-- La migrazione precedente (20260901200000_wave6_causale_in_uscita) ha dato al
-- denaro che esce una causale, e nel farlo ha seminato `liquidazione_contributo`
-- dentro il blocco delle causali in uscita: `direction_hint = 'OUT'` e voce di
-- rendiconto «Contributi liquidati».
--
-- Il verso e sbagliato, e lo dicono tre punti indipendenti del prodotto:
--
--   1. lo schema, sulla colonna che la liquidazione ha accanto:
--      `funding_settlements.financial_account_id` e «su quale conto e ARRIVATO
--      il bonifico dell'ente»;
--   2. la proiezione del registro (`src/lib/accounting/projection.ts`), che sul
--      verso legge il segno: `firmato < 0 ? "OUT" : "IN"`, e una liquidazione ha
--      importo positivo per vincolo di database;
--   3. la vista SQL gemella, che dice la stessa cosa con
--      `CASE WHEN fs.amount < 0 THEN 'OUT' ELSE 'IN' END`.
--
-- Il danno era doppio. Il rendiconto per voce sommava un incasso dentro un
-- capitolo di uscita; e la guardia applicativa, che rifiuta ogni causale in
-- entrata su un movimento in uscita, rendeva un errore 400 l'unica
-- classificazione corretta: al club restava aperta solo quella sbagliata.
--
-- Lo storno di una liquidazione ha importo negativo, quindi verso 'OUT', e
-- resta sulla stessa causale: il verso suggerito appartiene al FATTO — «l'ente
-- ha liquidato» — non alla singola riga, e lo storno eredita la fotografia
-- (codice, etichetta e ambito congelati) invece di ricalcolarla. Le due righe
-- devono elidersi sotto la stessa voce, ed e questo che glielo permette.
--
-- ------------------------------------------------------------------------
-- Perche l'UPDATE e ristretto a cio che il seme ha scritto.
--
-- `direction_hint` e `reporting_bucket` sono configurazione del club: un club
-- che li avesse gia corretti, o che avesse dato alla voce un nome proprio, non
-- deve vederseli riscrivere. Si tocca quindi SOLO la riga di sistema rimasta
-- identica al seme sbagliato. Le righe non di sistema non si toccano mai.
--
-- Nessuna riga di `funding_settlements` viene modificata: le fotografie gia
-- scritte portano etichetta e ambito, che non cambiano — cambia il verso, che
-- il registro ricava dal segno dell'importo e non dalla causale.
-- ------------------------------------------------------------------------

UPDATE "fiscal_operation_types"
   SET "direction_hint" = 'IN',
       "reporting_bucket" = 'Contributi da enti'
 WHERE "code" = 'liquidazione_contributo'
   AND "is_system" = true
   AND "direction_hint" = 'OUT'
   AND COALESCE("reporting_bucket", '') = 'Contributi liquidati';
