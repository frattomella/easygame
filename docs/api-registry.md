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
- `GET|POST /api/v1/payment-transactions` — registro incassi: elenco dei
  movimenti (`?athlete_id=`, `?payment_id=`) e registrazione di un incasso su
  una rata. La rata viene ricalcolata nella stessa transazione
- `POST /api/v1/payment-transactions/:id` — `{"action":"reverse"}` storna un
  incasso, `{"action":"issue-receipt"}` ne emette la ricevuta e
  `{"action":"issue-invoice"}` la fattura. Entrambe idempotenti, con due
  numerazioni distinte. Non esiste `DELETE`: un incasso non si cancella
- `GET /api/v1/funding/programs/:id/reconciliation` — la riconciliazione di un
  bando: una riga per atleta e per periodo, con la misura grezza accanto al
  requisito e il non maturato accanto al maturato. `?format=csv` la scarica in
  una forma che Excel in italiano apre senza chiedere niente
- `GET /api/v1/documents/:kind/:id` — il documento stampabile di una ricevuta
  (`receipt`) o di una fattura (`invoice`), con il branding della societa.
  Restituisce **HTML**, non JSON: chi apre questo indirizzo vuole stampare
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
- `GET|POST /api/v1/funding/programs` — programmi di contributo (voucher,
  bandi). Le regole del bando sono colonne, non codice
- `GET|PATCH /api/v1/funding/programs/:id` — nessun `DELETE`: un programma con
  maturati si porta a `closed`
- `GET|POST /api/v1/funding/enrollments` — beneficiari.
  `?view=overview&athlete_id=` restituisce i cinque importi gia calcolati
- `GET|POST /api/v1/funding/accruals` — `{"action":"recompute"}` ricalcola il
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
