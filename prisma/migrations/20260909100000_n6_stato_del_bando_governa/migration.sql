-- N6 — **lo stato di un bando comincia a significare qualcosa.**
--
-- ## Il fatto
--
-- `funding_programs.status` ammette `draft | active | closed` dal Blocco D, e
-- fino a oggi non governava niente:
--
-- * ogni programma nasce `draft` (`@default("draft")`);
-- * nessuna schermata sapeva cambiarlo — la `PATCH` esisteva e **nessun
--   componente la chiamava**;
-- * l'unico controllo nel dominio era su `closed`, quindi una **bozza**
--   iscriveva atleti e faceva maturare denaro pubblico esattamente come un
--   programma attivo;
-- * `active` era un valore che nessuna riga di `src/` leggeva.
--
-- Effetto a schermo: la scheda scriveva «BOZZA» accanto a un bando che stava
-- gia maturando. Uno stato che non impedisce niente non e uno stato: e
-- un'etichetta, e un'etichetta che mente e peggio di una che manca.
--
-- ## La correzione, e perche serve una migrazione
--
-- Da adesso `draft` **chiude la porta**: non si iscrive e non si matura. Le
-- regole di un bando decidono quanto vale ogni periodo, e cambiarle sotto a
-- un'iscrizione gia attiva riscriverebbe in silenzio importi che qualcuno ha
-- gia letto — e forse rendicontato all'ente. La bozza serve esattamente a
-- questo, ed e utile solo se la porta la chiude davvero.
--
-- Ma i programmi che il pilota ha in archivio sono **tutti** in bozza, e alcuni
-- hanno beneficiari, maturati e liquidazioni. Lasciarli cosi vorrebbe dire
-- spegnere il ricalcolo su bandi vivi il giorno del rilascio: la segreteria
-- aprirebbe la scheda e leggerebbe «attivalo prima di calcolare il maturato»
-- su un bando che sta finanziando dei ragazzi da mesi.
--
-- Questa migrazione porta ad `active` i programmi che **hanno gia almeno un
-- beneficiario**. Non e una scelta: e la constatazione di un fatto. Un
-- programma con degli iscritti *e* attivo — lo era anche ieri, e la colonna
-- diceva un'altra cosa.
--
-- ## Cosa NON fa
--
-- * **Non tocca i programmi senza iscritti.** Quelli sono bozze vere, e
--   restano bozze: e il club a decidere quando aprirle.
-- * **Non tocca i programmi gia `closed`.** Chiuso e una decisione presa, e
--   riaprirla d'ufficio sarebbe sostituirsi al club.
-- * **Non cancella e non riscrive niente d'altro.** Nessuna iscrizione, nessun
--   maturato, nessuna liquidazione: lo storico resta intero.
--
-- Non e distruttiva ed e **idempotente**: rieseguirla non cambia altre righe.

UPDATE "funding_programs" AS p
SET "status" = 'active',
    "updated_at" = NOW()
WHERE p."status" = 'draft'
  AND EXISTS (
    SELECT 1
    FROM "funding_enrollments" e
    WHERE e."program_id" = p."id"
  );
