# EasyGame API Registry

Fonte ufficiale da mantenere aggiornata:

- `src/lib/api/registry.ts`

## Convenzioni

- Base path: `/api/v1`
- Auth: `/api/v1/auth/*`
- Risorse applicative: `/api/v1/<resource>`
- Dettaglio risorsa: `/api/v1/<resource>/:id`

## Endpoint auth

- `GET /api/v1/registry`
- `GET /api/v1/comuni` — archivio ISTAT dei comuni italiani, con il CAP da IPA
  dove il comune ne ha uno solo (sola lettura,
  non e un dato di club)
- `GET /api/v1/athletes/:id/avatar` — la foto di un atleta come immagine.
  La lista riceve questo indirizzo al posto del base64
- `GET|POST /api/v1/attachments` — allegati: elenco dei metadati e
  caricamento (multipart). Il file non passa mai dentro un record JSON
- `GET|PUT|DELETE /api/v1/attachments/:id` — contenuto di un allegato.
  `?download=<nome>` lo consegna come download con quel nome
- `GET|PUT|DELETE /api/v1/clubs/:id/signature` — firma del presidente e
  timbro della societa. Senza `?kind=` il `GET` restituisce i metadati di
  entrambi in JSON; con `?kind=signature|stamp` restituisce i **byte**
  dell'immagine (cache privata, `nosniff`, ETag sull'impronta del contenuto).
  Il `PUT` e multipart (`file`, `kind`) e **sostituisce** quella che c'era; il
  `DELETE` vuole `?kind=`. **Legge chi appartiene al club** — serve
  all'anteprima e al documento stampabile — ma **scrivono solo proprietario e
  gestore** (`canManageClubConfiguration`): non e un allegato qualsiasi, e la
  firma con cui un documento diventa della societa
- `GET|POST /api/v1/payment-transactions` — registro incassi: elenco dei
  movimenti (`?athlete_id=`, `?payment_id=`) e registrazione di un incasso su
  una rata. La rata viene ricalcolata nella stessa transazione
- `POST /api/v1/payment-transactions/:id` — `{"action":"reverse"}` storna un
  incasso, `{"action":"refund"}` ne chiede al provider la restituzione,
  `{"action":"issue-receipt"}` ne emette la ricevuta e
  `{"action":"issue-invoice"}` la fattura. Le due emissioni sono idempotenti,
  con due numerazioni distinte. Non esiste `DELETE`: un incasso non si
  cancella
- `{"action":"refund"}` accetta `amountCents` (assente = tutto il
  rimborsabile), `reason` fra i tre che il provider riconosce, e `notes`
  interne che al provider **non** vengono inviate. Risponde con rata e
  registro riscritti piu `refund.awaitingWebhook`: finche e vero il rimborso
  e **in elaborazione** e il movimento non c'e ancora — lo scrive l'evento
  firmato, non questa risposta. Solo proprietario e gestore del club
- `POST /api/v1/payment-reminders` — sollecito degli insoluti verso le
  famiglie. Il corpo porta `charge_ids`: con `preview: true` risponde con i
  destinatari **raggiungibili** e quelli **non raggiungibili con il motivo**
  (`no_guardian`, `no_email`, `no_account`, `already_reminded`) e non manda
  niente; senza `preview` esegue e riferisce l'esito **per destinatario**
  (`sent`, `skipped`, `failed`). Rifiuta di partire se non c'e nessun
  raggiungibile, e non dichiara mai «inviato» quando SMTP non e configurato.
  Due richieste ravvicinate producono un solo invio per destinatario: la
  finestra di riguardo e di **sei ore**, la stessa del sollecito sui
  documenti. Solo proprietario e gestore del club
- `GET /api/v1/funding/programs/:id/reconciliation` — la riconciliazione di un
  bando: una riga per atleta e per periodo, con la misura grezza accanto al
  requisito e il non maturato accanto al maturato. `?format=csv` la scarica in
  una forma che Excel in italiano apre senza chiedere niente
- `GET /api/v1/funding/programs/:id?view=detail` — la scheda di un
  programma di contributo: configurazione, beneficiari con i cinque importi
  (assegnato, maturato, rendicontato, liquidato, residuo), totali e atleti
  ancora iscrivibili
- `POST /api/v1/funding/enrollments` — iscrive **uno o piu** atleti a un
  programma. Plafond e codice voucher possono essere individuali; chi era
  gia iscritto viene saltato con il motivo e non fa fallire il lotto
- `GET /api/v1/funding/enrollments?view=enrollable&athlete_id=…` — i
  programmi a cui un atleta non e ancora iscritto, esclusi quelli chiusi
- `GET|PATCH|DELETE /api/v1/funding/enrollments/:id` — una singola
  iscrizione. Il `DELETE` **revoca** invece di cancellare quando ci sono gia
  importi rendicontati o liquidati, e lo dice nella risposta
- `GET|POST /api/v1/platform/payments` — centro di controllo commerciale:
  stato Stripe Connect e billing, commissione standard e override per club,
  ultimi eventi. Scritture distinte da `operation`. Solo `platform_admin`;
  non restituisce mai una chiave segreta
- `GET|POST /api/v1/payments/account` — il conto di incasso visto dalla
  societa: **quale intermediario** (`provider`), stato, requisiti mancanti,
  commissione applicata (sola lettura) e richiesta del link di collegamento
- `POST /api/payments/create-checkout-session` — apre un checkout online per
  una rata, anche per un importo parziale. Club, provider, conto e commissione
  non arrivano dal corpo: il club e quello attivo della sessione
  (`x-active-club-id`), e un `clubId` nel corpo puo solo restringere
- `GET /api/payments/checkout-status` — lo stato di un pagamento online
  secondo il registro incassi: «in verifica» finche il webhook non conferma
- `POST /api/payments/webhook` — callback del PSP per gli incassi (Connect)
- `POST /api/billing/webhook` — callback degli abbonamenti EasyGame
  (account centrale di Cedi Soft). Segreto di firma **distinto**
- `GET|PUT /api/v1/fiscal/profile` — profilo fiscale della societa, con i
  vocabolari e cosa manca per fatturare e per la fattura elettronica
- `GET|PUT|POST /api/v1/fiscal/operation-types` — classificazione delle
  operazioni e serie di numerazione
- `POST /api/v1/documents/:kind/:id/cancel` — annullamento di un documento
  emesso, con motivo obbligatorio. Il numero non si libera
- `GET|POST /api/v1/einvoice/:invoiceId` — stato e preparazione del tracciato
  FatturaPA. `action=transmit` risponde 503: nessun intermediario
  accreditato e configurato
- `GET /api/v1/documents/:kind/:id` — il documento stampabile di una ricevuta
  (`receipt`) o di una fattura (`invoice`), con il branding della societa.
  Restituisce **HTML**, non JSON: chi apre questo indirizzo vuole stampare
- `GET /api/v1/documents/filled` — un modello di modulistica **compilato** per
  un atleta e una stagione (`templateId`, `athleteId`, `seasonId`). Restituisce
  la pagina stampabile **insieme** ai segnaposto non risolti e a quelli senza
  dato, perche l'anteprima li mostri prima di stampare; `?format=html`
  restituisce la sola pagina. Gli importi vengono dal registro incassi
  ([ADR-0068](knowledge-base/18-decision-log.md)), la frequenza dal dominio
  contributi. **Un documento, un atleta**: nessuna stampa massiva
- `GET /api/v1/entitlements` — cosa un club puo usare, funzione per funzione,
  con il **motivo** di ogni esito. Non e un campo salvato: e un calcolo su
  piano, servizi attivi ed eccezioni
- `POST /api/v1/entitlements` — tre scritture distinte da `operation`:
  `plan` assegna piano, stato dell'abbonamento e data di rinnovo; `service`
  attiva o disdice un servizio aggiuntivo; il valore predefinito concede
  (`true`), revoca (`false`) o toglie (`null`) l'eccezione su una funzione.
  **Solo platform_admin**, e ognuna delle tre lascia una riga di audit: il
  piano di un club non e una sua preferenza ([ADR-0048](knowledge-base/18-decision-log.md))
- `POST /api/v1/maintenance` — toglie cio che e scaduto: sessioni, sfide OTP,
  contatori di rate limit e audit oltre la retention. **Nessuna schermata le
  legge, quindi nessuna schermata le pulira mai.** La aziona un cron con
  `x-maintenance-token` (confrontato con `EASYGAME_MAINTENANCE_TOKEN`, e se la
  variabile e vuota il token non vale) oppure un `platform_admin` a mano. Il
  *trigger* sta fuori dall'applicazione: Vercel Cron, un'azione GitHub o il
  cron di una macchina, per non legarsi a un servizio dell'hosting (ADR-0007)
- `GET /api/v1/maintenance` — la stessa pulizia, invocata da Vercel Cron alle
  04:30. Si autentica con `Bearer CRON_SECRET`, confrontato a **tempo
  costante**. `CRON_SECRET` e **obbligatorio in ogni ambiente**: se manca la
  rotta risponde **503** e non cancella niente. E la regola piu severa fra le
  porte di cron del progetto, e la ragione per cui un `GET` che cancella righe
  e accettabile: un prefetch, un antivirus o un crawler non portano il segreto
- `GET|POST /api/v1/funding/programs` — programmi di contributo (voucher,
  bandi). Le regole del bando sono colonne, non codice
- `GET|PATCH /api/v1/funding/programs/:id` — nessun `DELETE`: un programma con
  maturati si porta a `closed`
- `GET|POST /api/v1/funding/enrollments` — beneficiari.
  `?view=overview&athlete_id=` restituisce i cinque importi gia calcolati
- `GET|POST /api/v1/funding/accruals` — `{"action":"confirm"}` e
  `{"action":"import"}` registrano cio che una fonte esterna ha riconosciuto
  (ADR-0054). `{"action":"recompute"}` ricalcola il
  maturato dalle presenze, `{"action":"report"}` lo rendiconta all'ente
- `GET|POST /api/v1/funding/settlements` — liquidazioni dell'ente, con la
  ripartizione obbligatoria sui periodi maturati
- `GET|POST /api/v1/forms` — moduli del club: elenco e creazione
- `GET|PATCH|DELETE /api/v1/forms/:id` — un modulo. `PATCH` porta una
  `action`: `save_draft`, `publish`, `unpublish`, `archive`, `restore`,
  `duplicate`, `regenerate_slug`, `set_public_access`
- `GET|POST /api/v1/forms/submissions` — coda delle compilazioni;
  `POST` e la compilazione fatta dalla segreteria (multipart)
- `GET|POST /api/v1/forms/submissions/:id` — cosa cambierebbe approvando,
  duplicati possibili, e la decisione (`preview`, `approve`, `reject`)
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/session`
- `GET|PATCH /api/v1/auth/user`
- `GET /api/v1/auth/memberships`
- `GET /api/v1/auth/providers`
- `POST /api/v1/auth/verify/email/send`
- `POST /api/v1/auth/verify/email/confirm`
- `POST /api/v1/auth/verify/phone/send`
- `POST /api/v1/auth/verify/phone/confirm`
- `GET /api/v1/auth/oauth/:provider/start`
- `GET /api/v1/auth/oauth/:provider/callback`
- `POST /api/v1/auth/password/forgot`
- `POST /api/v1/auth/password/reset`

## Endpoint amministrazione piattaforma

Riservati a `platform_admin` (`requirePlatformAdmin`). Non fanno parte della
superficie mobile.

- `GET /api/v1/admin/overview`
- `DELETE /api/v1/admin/clubs/:id`
- `DELETE /api/v1/admin/users/:id`
- `GET|PUT /api/v1/admin/email` — provider SMTP
- `POST /api/v1/admin/email/test`
- `GET|PUT /api/v1/admin/imap` — casella IMAP, credenziali separate da SMTP
- `POST /api/v1/admin/imap/test`

## Endpoint stagioni

Configurazione di club: solo `owner` e `club_manager`
(`canManageClubConfiguration`). Non fanno parte della superficie mobile
(ADR-0025).

- `GET /api/v1/seasons` — stagioni del club attivo, catalogo di cio che si puo
  riportare e conteggio delle voci per stagione
- `POST /api/v1/seasons` — crea una stagione; `activate` la rende subito
  attiva, `rollover: { sourceSeasonId, types }` ne popola la configurazione
- `PATCH /api/v1/seasons/:seasonId` — `{ action: "activate" | "archive" }`
- `POST /api/v1/seasons/:seasonId/rollover` —
  `{ sourceSeasonId, types, preview }`; con `preview: true` non scrive nulla e
  restituisce lo stesso conteggio dell'esecuzione

## Flusso auth applicativo

- Login password classico
- Registrazione con verifica email
- Registrazione con verifica cellulare
- OAuth web con Google e Microsoft
- Redirect finale su `/auth/complete`

## Risorse principali

- `users`
- `clubs`
- `organizations`
- `dashboards`
- `organization_users`
- `athletes`
- `simplified_athletes`
- `medical_certificates`
- `simplified_certificates`
- `payments`
- `simplified_payments`
- `payment_methods`
- `invoices`
- `receipts`
- `trainer_payments`
- `notifications`
- `simplified_notifications`
- `training_attendance`
- `assets`

## Risorse club aggregate

- `appointments`
- `bank_accounts`
- `categories`
- `category_groups`
- `clothing_inventory`
- `clothing_kits`
- `clothing_products`
- `club_sites`
- `discounts`
- `document_templates`
- `expected_expenses`
- `expected_income`
- `jersey_assignments`
- `jersey_groups`
- `kit_assignments`
- `matches`
- `members`
- `opening_hours`
- `payment_plans`
- `procure`
- `secretariat_notes`
- `sponsor_payments`
- `sponsors`
- `staff_members`
- `trainers`
- `trainings`
- `transactions`
- `transfers`
- `weekly_schedule`

## CRUD standard

Per ogni risorsa sopra:

- `GET /api/v1/<resource>`
- `POST /api/v1/<resource>`
- `GET /api/v1/<resource>/:id`
- `PATCH /api/v1/<resource>/:id`
- `DELETE /api/v1/<resource>/:id`

## Lavoro sportivo e compensi

Tutte sotto `/api/v1/sport-work`. Nessuna e `mobile_ready`: lo sviluppo mobile
e differito (ADR-0025), e un dato economico riservato non e il posto da cui
riaprirlo.

**I permessi non sono quelli generici del club.** Il dominio ha cinque permessi
propri (`src/lib/sport-work/permissions.ts`), e il perimetro economico coincide
con quello che gia protegge conti correnti e configurazione societaria:
**proprietario e club manager**. Allenatore, staff, collaboratore e atleta
hanno solo `sport_work.read_own`, che in V1 nessuna superficie consuma — quindi
in pratica non leggono niente di questo dominio. Ogni diniego viene tracciato.

- `GET|POST /api/v1/sport-work/people` — le persone che lavorano per il club.
  **L'elenco non porta mai l'IBAN**: le coordinate bancarie si leggono aprendo
  la scheda, una alla volta
- `GET|PATCH /api/v1/sport-work/people/:id` — la scheda completa. Non esiste
  `DELETE`: una persona ha un contratto firmato, si chiude il rapporto
- `GET /api/v1/sport-work/people/:id/position?year=2026` — la posizione annua
  verso le soglie dei 5.000 e dei 15.000, con lo **scostamento** che una
  dichiarazione arrivata in ritardo produrrebbe. Lo scostamento si mostra e non
  si scrive
- `GET|POST /api/v1/sport-work/relationships` — i rapporti di lavoro sportivo.
  La lettura porta prima a scaduti i contratti la cui data di fine e passata;
  un rapporto nuovo nasce sempre in **bozza**
- `GET|PATCH /api/v1/sport-work/relationships/:id` — dettaglio e modifica.
  `?view=detail` restituisce la scheda intera: persona, piano, scadenze,
  movimenti e cosa manca per attivarlo
- `POST /api/v1/sport-work/relationships/:id/status` — cambio di stato. Non e
  un `PATCH` sul campo perche non e la modifica di un campo: attivare richiede
  contratto e anagrafica, cessare richiede un motivo
- `GET|PUT /api/v1/sport-work/relationships/:id/plan` — il piano compensi nelle
  tre forme (rate uguali, mensilita, rate personalizzate). `PUT` e non `POST`
  perche un rapporto ha **un** piano; rifarlo viene rifiutato se una scadenza
  ha gia ricevuto denaro
- `GET /api/v1/sport-work/installments` — le scadenze, con programmato,
  maturato e pagato tenuti separati
- `POST /api/v1/sport-work/installments/:id/cancel` — annulla una scadenza
  programmata. La riga resta marcata; una scadenza gia erogata non si annulla
  affatto, si storna l'erogazione
- `GET|POST /api/v1/sport-work/payouts` — il registro in uscita. Il `POST`
  accetta `idempotencyKey`: due invii dello stesso clic restituiscono lo stesso
  movimento invece di farne uscire due
- `POST /api/v1/sport-work/payouts/prepare` — **la proposta**: imponibili,
  contributi, netto, costo del club e la motivazione riga per riga. Non scrive
  niente. Se il calcolo porta avvisi duri — autocertificazione mancante, soglia
  fiscale superata — la registrazione va confermata con `acknowledgeWarnings`
- `POST /api/v1/sport-work/payouts/:id/reverse` — storna con una riga di segno
  opposto e un motivo obbligatorio. **Non esiste `DELETE` su questo registro**
- `GET|POST /api/v1/sport-work/declarations` — le autocertificazioni dei
  compensi percepiti da altri committenti. Non sono un allegato: sono un dato
  di input del motore. Registrarne una nuova sostituisce quella dell'anno, che
  resta marcata
- `GET|POST /api/v1/sport-work/bonuses` e
  `POST /api/v1/sport-work/bonuses/:id/pay` — i premi. Il trattamento fiscale
  si **dichiara** e non si deduce: la distinzione fra premio e retribuzione
  variabile la fa il contratto, non l'etichetta
- `GET|POST /api/v1/sport-work/reimbursements`,
  `PATCH /api/v1/sport-work/reimbursements/:id` e
  `POST /api/v1/sport-work/reimbursements/:id/pay` — i rimborsi spese. A
  «liquidato» non ci si arriva con un `PATCH`: si registra il pagamento
- `GET|POST /api/v1/sport-work/vat-invoices` e
  `POST /api/v1/sport-work/vat-invoices/:id/pay` — le fatture ricevute dai
  professionisti. Gli importi si trascrivono dal documento: il calcolo lo ha
  fatto chi l'ha emessa, e nessuna regola co.co.co. la tocca
- `GET|POST /api/v1/sport-work/obligations`,
  `POST /api/v1/sport-work/obligations/sync` e
  `POST /api/v1/sport-work/obligations/:id/complete` — l'agenda. La
  sincronizzazione e **idempotente** per chiave deterministica; «assolto»
  significa che una persona lo ha fatto, non che EasyGame lo abbia trasmesso
- `GET /api/v1/sport-work/dashboard` — i numeri del cruscotto, con
  programmato, maturato e pagato in tre colonne diverse
- `GET /api/v1/sport-work/datasets?kind=f24|cu&year=2026` — i dati strutturati
  per F24 e CU. **Non sono un F24 e non sono una CU**: sono le tabelle che il
  consulente si porta via. Richiedono `sport_work.fiscal`
- `POST /api/v1/sport-work/scheduler` — il giro sul club attivo, a mano
- `GET /api/v1/sport-work/scheduler` — lo stesso giro su tutti i club,
  invocato da Vercel Cron alle 03:30. Si autentica con `CRON_SECRET`; in
  produzione senza quella variabile non si apre

## Le funzioni periodiche

Quattro giri, quattro rotte, **un solo meccanismo di autenticazione**: un
`GET` con `Authorization: Bearer <CRON_SECRET>`. Il *trigger* sta fuori
dall'applicazione — oggi Vercel Cron, domani un'azione GitHub o il cron di una
macchina — perche ADR-0007 vieta di legare il dominio a un servizio
dell'hosting.

| Ora (UTC) | Rotta | Cosa fa |
|-----------|-------|---------|
| 03:30 | `GET /api/v1/sport-work/scheduler` | contratti scaduti, maturato, agenda, notifiche del lavoro sportivo |
| 04:00 | `GET /api/v1/training-automation` | genera gli allenamenti dalla programmazione settimanale |
| 04:30 | `GET /api/v1/maintenance` | toglie sessioni, sfide OTP, rate limit e audit scaduti |
| 07:00 | `GET /api/medical-certificate-reminders` | promemoria ai tutori sui certificati medici |

Gli orari sono distanziati di proposito: quattro giri sulla stessa finestra si
contenderebbero le stesse connessioni al database. Il promemoria alle 07:00 e
l'unico che parla a delle persone, e a quell'ora la notifica si legge.

**Tre di questi quattro** applicano la regola comune: `CRON_SECRET` assente
blocca la rotta **solo in produzione**, cosi in sviluppo il giro si puo
provare. `GET /api/v1/maintenance` e l'eccezione — segreto obbligatorio
ovunque — perche e l'unico che **cancella righe**.

- `POST /api/v1/training-automation` — la stessa generazione sul solo club
  attivo, a mano. Richiede una sessione e un ruolo che possa configurare il
  club
- `POST /api/medical-certificate-reminders` — il promemoria su **un** atleta,
  a mano dalla segreteria. Richiede una sessione e l'atleta deve appartenere a
  un club nello scope
- `GET /api/medical-certificate-reminders` — lo stesso promemoria su tutti gli
  atleti di tutti i club. **Idempotente**: la difesa contro il doppione e una
  chiave deterministica dentro la notifica
  (`medical_certificate_reminder:<atleta>:<certificato|missing>`), e la
  finestra di sette giorni vale **anche se il promemoria e gia stato letto**.
  Le regole stanno in `src/lib/server/medical-certificate-reminders.ts`, non
  nel route handler: un club che fallisce non ferma gli altri, e i destinatari
  devono essere iscritti al club dell'atleta
