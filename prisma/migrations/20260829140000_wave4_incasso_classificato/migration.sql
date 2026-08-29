-- Wave 4 / la classificazione congelata anche sull'incasso.
--
-- **Cosa mancava, e come e emerso.** La lane della fiscalita ha reso
-- `operation_type_code` finalmente scrivibile sugli incassi — era la riga di
-- validazione che rompeva l'intera catena — e nel farlo ha trovato che
-- `payment_transactions` **non ha dove congelare** la classificazione che quel
-- codice implica. La colonna esisteva solo su `accounting_entries`.
--
-- **Perche congelare, e non leggere la causale ogni volta.** La causale e
-- configurazione **mutabile**: `saveOperationType` riscrive `activity_scope` in
-- place. Se la prima nota leggesse la classificazione dalla causale corrente,
-- il giorno in cui un club corregge la natura di una voce **tutti gli incassi
-- passati cambierebbero natura retroattivamente** — e un rendiconto gia
-- consegnato al commercialista direbbe qualcosa di diverso da quello che
-- diceva.
--
-- E la stessa disciplina gia applicata tre volte in questo prodotto: il lavoro
-- sportivo congela contributi e aliquote sulla riga di registro, un documento
-- fiscale porta il suo snapshot, e `accounting_entries` porta
-- `activity_scope_snapshot`. Qui e la quarta, e non e una scelta nuova: e
-- l'ultima riga che ne era rimasta scoperta.
--
-- **Nasce nullo, e ha senso che lo sia.** Gli incassi gia registrati non hanno
-- una classificazione, perche `operation_type_code` e sempre stato `null`
-- (§5.2 del piano). Riempirli con un valore dedotto oggi vorrebbe dire
-- attribuire una natura fiscale a duemila righe che nessuno ha mai guardato.
-- Restano `unspecified`, il rendiconto li conta fra le righe non classificate,
-- e il club vede quanto lavoro di classificazione ha davanti.
ALTER TABLE "payment_transactions" ADD COLUMN "activity_scope_snapshot" TEXT;

ALTER TABLE "payment_transactions"
    ADD CONSTRAINT "payment_transactions_ambito_check"
    CHECK (
        "activity_scope_snapshot" IS NULL
        OR "activity_scope_snapshot" IN ('institutional', 'commercial', 'unspecified')
    );
