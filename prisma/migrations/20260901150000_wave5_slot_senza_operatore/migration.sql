-- ===========================================================================
-- Due NULL non collidono, e per questo lo slot senza operatore non era protetto
-- ===========================================================================
--
-- ## Il difetto, trovato dall'audit indipendente della Wave 5
--
-- `appointments.ts` dichiara, in testa al file: «Non impedisce la doppia
-- prenotazione in codice: la impedisce il database... Riscrivere quel controllo
-- in memoria vorrebbe dire riaprire proprio la corsa che l'indice chiude.»
--
-- L'indice pero era
--
--     UNIQUE (organization_id, assigned_to_user_id, starts_at)
--     WHERE status IN ('requested','confirmed')
--
-- e in PostgreSQL **due NULL non sono uguali fra loro**: due righe con
-- `assigned_to_user_id` nullo non collidono mai, qualunque siano club e istante.
--
-- `assigned_to_user_id` e nullo in due configurazioni tutt'altro che rare:
--
-- - uno slot dichiarato **senza titolare** — `createAppointmentSlot` non lo
--   pretende;
-- - il **ripiego sugli orari di apertura**, che il modello stesso definisce «la
--   forma piu diffusa fra i club che non hanno mai aperto quella schermata»:
--   produce regole con `assignedToUserId: null`, e `requestFamilyAppointment`
--   copia quel valore sulla riga.
--
-- Per quei club l'indice non scattava mai, e l'unica difesa restava una lettura
-- della disponibilita seguita da una scrittura, fuori transazione: due famiglie
-- che confermano lo stesso orario nello stesso istante ottenevano **due**
-- appuntamenti, senza errore e senza traccia. E l'incidente I-02 gia scritto in
-- `14-security.md`, ripetuto su un dominio nuovo.
--
-- La sonda di concorrenza lo sapeva gia e lo dice nel proprio commento: semina
-- di proposito uno slot **con** operatore, «perche in Postgres due NULL non
-- collidono». Misurava la configurazione in cui il vincolo funziona; il prodotto
-- permetteva l'altra.
--
-- ## La correzione
--
-- L'indice diventa **su espressione**, con un segnaposto al posto del nullo. Il
-- segnaposto e l'UUID tutto a zeri: non e un utente e non puo diventarlo — la
-- chiave esterna verso `users` non ammetterebbe quel valore su una colonna vera
-- — quindi non c'e nessun rischio che un giorno collida con una persona.
--
-- **Perche non rendere obbligatorio `assigned_to_user_id`.** Perche il nullo
-- significa qualcosa: «questo posto e della segreteria, chiunque risponda». Un
-- valore fittizio scritto sulla colonna renderebbe quel fatto illeggibile a
-- ogni lettura futura, per proteggere una scrittura. La colonna resta onesta e
-- l'indice normalizza soltanto per se stesso.
--
-- **Perche non aggiungere la sede alla chiave.** Due sedi diverse allo stesso
-- istante sono legittime, ma con `assigned_to_user_id` nullo il posto e uno solo
-- per club: e la stessa segreteria a rispondere. Distinguere per sede
-- riaprirebbe la doppia prenotazione dentro la stessa sede appena qualcuno
-- lasciasse il campo vuoto, che e il difetto che si sta chiudendo.
--
-- ## Le righe gia in archivio
--
-- La creazione dell'indice **fallisce** se esistono gia due appuntamenti vivi
-- sullo stesso club, orario e senza operatore. E il verso giusto: un duplicato
-- gia in archivio va guardato da una persona, non risolto da una migrazione che
-- decide da sola quale delle due famiglie perde il posto.

DROP INDEX IF EXISTS "appointments_slot_vivo_unico";

CREATE UNIQUE INDEX "appointments_slot_vivo_unico"
    ON "appointments"(
        "organization_id",
        (COALESCE("assigned_to_user_id", '00000000-0000-0000-0000-000000000000')),
        "starts_at"
    )
    WHERE "status" IN ('requested', 'confirmed');
