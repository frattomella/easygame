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
  una rata. La rata viene ricalcolata nella stessa transazione. Il corpo
  accetta anche `operation_type_code` (la causale), `financial_account_id` (il
  conto su cui il denaro e entrato) e la controparte
  (`counterparty_kind`/`_id`/`_label`): senza queste righe nello schema di
  validazione i tre campi sparivano fra la richiesta e il dominio, ed e il
  motivo per cui `operation_type_code` era `null` su ogni incasso reale
- `GET /api/v1/payment-transactions/:id/document-decision` — **cosa si sta per
  emettere, prima di emetterlo**: documento proposto e perche, numero che
  verra assegnato (letto senza consumarlo), classificazione — `NON
  CLASSIFICATO` quando nessuno l'ha dichiarata — imponibile e imposta, e cosa
  manca per la fattura, distinguendo l'emittente dall'intestatario. Solo
  proprietario e gestore del club, come l'emissione. Con
  `?operation_type_code=` risponde «e se lo classificassi cosi?» senza
  scrivere niente
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
- `POST /api/v1/communications` — la **comunicazione massiva** alle famiglie.
  Il corpo porta `criteria` (enum chiusa: `all_families`, `category_ids`,
  `group_ids`, `site_ids`, `athlete_ids`, `overdue_payments`,
  `certificate_missing_or_expiring`, `no_account`), `template`
  (`subject` + `body` con i segnaposto del catalogo unico) e
  `communication_id`, che e cio che rende **lo stesso gesto** due clic sullo
  stesso pulsante. Con `preview: true` risponde con i raggiungibili, gli
  esclusi **con il motivo** e il messaggio come lo leggera il primo
  destinatario; senza `preview` invia a lotti e dichiara `remaining`. Un
  criterio sconosciuto risponde **400** invece di allargare il pubblico. Il
  criterio `overdue_payments` richiede `communications.audience_economic`
- `GET|POST /api/v1/announcements` — la **bacheca**. Senza parametri gli
  annunci che la societa governa, con `?mine=1` quelli destinati a chi sta
  guardando (solo i pubblicati, dentro la finestra di validita). `POST` crea
  una **bozza**: la creazione non pubblica
- `GET|PATCH|POST /api/v1/announcements/:id` — un annuncio. `?deliveries=1`
  dice chi lo ha ricevuto e chi lo ha aperto (permesso
  `communications.read_recipients`). `POST { action }` accetta `publish`,
  `withdraw` e `read`; `read` e l'unica che un genitore puo chiamare, e porta
  `delivery_id`. Un annuncio di un altro club risponde **404**, non 403
- `POST /api/v1/payment-links` — emette un **link di pagamento** per una rata
  (`payment_id`). Il club lo dice la sessione, non il corpo. Risponde con
  `url`, `path`, `linkId` e `expiresAt`; **mai** il token nudo. Senza
  l'entitlement `online_payments` risponde **409** con
  `code: "ENTITLEMENT_MISSING"`, cosi il sollecito puo dirlo e partire comunque
- `DELETE /api/v1/payment-links/:id` — revoca un link. Un link di un altro club
  risponde come uno inesistente
- `GET /api/public/payment-links/:token` — **superficie pubblica, senza
  autenticazione.** Quanto resta da versare, con il residuo ricalcolato al
  momento e **nessun identificativo interno**. Token sconosciuto, scaduto,
  revocato o manomesso rispondono **la stessa cosa**. Rate limit per token e
  per indirizzo
- `POST /api/public/payment-links/:token/checkout` — **superficie pubblica.**
  Apre il checkout sulla rata del link passando dallo **stesso**
  `openGatewayCheckout` del canale autenticato. `successUrl` e `cancelUrl` li
  costruisce il server: accettarli dal client renderebbe il link un redirector
  aperto
- `GET|POST|PATCH /api/v1/automations` — le **quattro** regole di automazione
  del club: interruttore, fino a tre anticipi, pubblico (famiglia / societa /
  entrambe), modalita di consegna (notifica singola o riepilogo giornaliero) e
  testo con i segnaposto del catalogo unico. Permesso `automations.manage`;
  tutte nascono **spente**
- `POST /api/v1/automations/run` — esegue il giro sul **club attivo**, per
  vedere subito l'effetto di una regola senza aspettare la notte. Stesso
  permesso
- `GET /api/v1/automations/run` — il giro notturno su **tutti** i club, quello
  che invoca il cron. Richiede `CRON_SECRET` come `Bearer`: **503** se il
  segreto non e configurato in ambiente, **401** se non corrisponde, mai `200`
  a vuoto. Un club che fallisce non ferma gli altri e compare nel rapporto con
  il suo nome
- `POST /api/v1/rsvp` — la conferma di partecipazione della famiglia. Corpo:
  `training_id`, `athlete_id`, `status` (`yes` | `no`), `note` facoltativa.
  Registra **e** cambia la risposta finche la scadenza non e passata: e un
  upsert sulla chiave `(organization_id, training_id, athlete_id)`, quindi due
  invii identici lasciano una riga sola. Autorizza il **legame con l'atleta**
  (tutore dichiarato o l'atleta stesso), non il ruolo. Non scrive mai
  `training_attendance.status`, cioe la presenza
- `GET /api/v1/rsvp?training_id=` — il riepilogo per lo staff: si, no e
  **senza risposta** con i nomi. Permesso `rsvp.read`; l'allenatore lo ottiene
  solo per i propri gruppi operativi (ADR-0055)
- `GET /api/v1/rsvp?athlete_id=` — gli inviti di un atleta per l'area
  genitore: comprende anche quelli gia risposti e quelli chiusi, con il motivo
- `GET|POST /api/v1/consents` — le **definizioni di consenso** del club
  (privacy, immagini, trasferte), con lo stato pubblicato.
  `?include_retired=1` mostra anche le ritirate. `POST` crea una definizione
  **in bozza**: la creazione non pubblica, perche una definizione senza testo
  raccoglierebbe accettazioni che non citano niente. Definire e configurazione
  societaria (`canManageConsentDefinitions`)
- `GET|PATCH /api/v1/consents/:id` — una definizione e le sue versioni.
  `PATCH` cambia titolo, descrizione, obbligatorieta e stato (`draft` |
  `active` | `retired`). **La chiave non e modificabile**: moduli e modelli la
  citano per nome, e rinominarla spezzerebbe in silenzio ogni riferimento gia
  scritto. Una definizione non si cancella: si ritira, e continua a spiegare i
  consensi gia raccolti
- `POST /api/v1/consents/:id/versions` — pubblica il testo: crea una versione
  **immutabile** e la fa diventare quella corrente. Non esiste un `PATCH` su
  una versione e non deve esistere — correggere l'informativa significa
  pubblicarne un'altra, e i consensi gia raccolti restano validi
- `GET|POST /api/v1/consents/:id/records` — le decisioni. Il registro e
  **append-only**: revocare e un `POST` con `status: "revoked"` che **aggiunge
  una riga**, e non ci sono `PATCH` ne `DELETE`. Rifiuta una decisione su una
  definizione non attiva, su un soggetto fuori elenco (`athlete` | `person` |
  `member` | `guardian`) e su una versione di un altro club. Non si revoca un
  consenso che non risulta dato. Registrare e un gesto di segreteria
  (`canRecordConsentDecision`)
- `GET /api/v1/consents/states` — lo stato dei consensi, **derivato** dallo
  storico e mai letto da una colonna. Con `?subject_kind=&subject_id=` una riga
  per ogni consenso, comprese quelle mai decise con stato `missing`: e quello
  l'elenco di **cio che manca**. Senza soggetto, chi ha deciso e cosa. Il flag
  `onOutdatedVersion` dice che la decisione valida cita una versione precedente
  a quella pubblicata: non invalida niente, e il club a decidere
- `GET|POST /api/v1/membership/events` — il **libro soci**. `GET ?member_id=`
  la posizione di un socio: lo storico e lo stato **derivato**, con `&at=` a
  una data passata. `POST` registra ammissione, dimissione, decadenza,
  esclusione o riammissione. Il registro e **append-only**: non esistono
  `PATCH` ne `DELETE`, e il `membership_number` mandato dal client viene
  **rifiutato** — lo assegna il libro
- `GET /api/v1/membership/register` — il libro completo. Con `?at=2026-03-12`
  risponde a «chi era socio quel giorno», che e la domanda per cui il registro
  esiste: la classificazione di un'entrata dipende dalla qualifica della
  controparte al momento dell'operazione
- `POST /api/v1/membership/admissions` — crea l'anagrafica del socio **e** la
  sua ammissione in una transazione sola. Prima la creazione riscriveva
  l'intera colonna `clubs.members` dal browser, e due segreterie in
  contemporanea si cancellavano a vicenda
- `PATCH|DELETE /api/v1/membership/profiles/:id` — la **scheda** di un socio,
  una alla volta. Prima si correggeva riscrivendo l'intera colonna
  `clubs.members` dal browser: una sonda di concorrenza ha ottenuto un socio
  presente nel libro e assente dall'anagrafica. Il `DELETE` rifiuta se il libro
  nomina la persona — chi non e piu socio si dimette o si esclude, con una data
  e una delibera
- `GET /api/v1/sponsorships` — gli sponsor del club, ognuno con le sue tre
  cifre e con gli **incassi che le spiegano**. Prima l'elenco calcolava il
  residuo nel browser e da una fonte sola — la piu vecchia delle due — e uno
  sponsor che aveva appena pagato 2.000 su 5.000 compariva con residuo 5.000
  nell'elenco e 3.000 nella sua scheda: due schermate della stessa
  applicazione, due risposte alla stessa domanda
- `GET|PUT /api/v1/sponsorships/:id` — il **contratto** di uno sponsor e le sue
  tre cifre — dovuto, incassato, residuo — con gli incassi che le spiegano. Il
  credito lo calcola il server perche le fonti sono due: gli incassi con la
  controparte dichiarata e la vecchia collezione JSON
- `POST /api/v1/sponsorships/:id/collections` — l'incasso di uno sponsor,
  registrato **nel registro degli incassi** con la controparte congelata. Prima
  finiva in una collezione JSON e il denaro non arrivava mai in prima nota: il
  residuo dello sponsor era giusto, il rendiconto del club no
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
- `GET|PUT|POST|DELETE /api/v1/fiscal/operation-types` — classificazione delle
  operazioni e serie di numerazione. Leggere e lavoro di segreteria
  (`accounting.read`: senza l'elenco non si registra un movimento);
  **modificare** e configurazione societaria (`accounting.causes_manage`). Il
  `DELETE` vuole `?code=` e `?action=deactivate|activate|delete`: una voce
  predefinita, e una gia citata da un movimento, si disattiva e non si
  cancella, e la risposta dice quale delle due cose e successa
- `GET|POST /api/v1/accounting/accounts` — i conti finanziari del club.
  `?with_balances=1` aggiunge i saldi, che **non sono una colonna**: sono la
  somma di prima nota, incassi, uscite del lavoro sportivo e liquidazioni dei
  bandi. L'elenco senza saldi basta `accounting.read`, perche chi registra un
  movimento deve poter scegliere il conto; i saldi vogliono
  `accounting.accounts_read`
- `GET|PATCH /api/v1/accounting/accounts/:id` — un conto.
  `?with_balance=1` ne calcola il saldo. Il `PATCH` rinomina, corregge gli
  estremi e archivia (`{"archived": true}`). **Non esiste il `DELETE`**: un
  conto e citato dai movimenti che ci sono passati, e il tipo e il saldo di
  apertura non si modificano
- `GET|POST /api/v1/accounting/entries` — la **prima nota**. La `GET`
  (`accounting.read`) restituisce in una lettura sola le righe proprie —
  movimenti manuali, gambe di giroconto, storni — e quelle **proiettate** dai
  domini proprietari: incassi, compensi, liquidazioni. Le proiezioni sono
  sempre in sola lettura, e i flag `canEdit`/`canReverse`/`canReconcile`
  viaggiano **con la riga**, perche la pagina non li ricalcoli. Filtri:
  `from`, `to`, `fiscal_year`, `season_id`, `financial_account_id`,
  `operation_type_code`, `direction`, `source_domain`, `site_id`,
  `activity_scope`, `reconciliation_status`, `q`, `limit`, `offset`.
  `fiscal_year` e `season_id` sono **due assi diversi**, e una riga che non
  dichiara una stagione appartiene a quella nel cui periodo cade.
  La `POST` (`accounting.manage`) registra un movimento manuale, con
  **causale obbligatoria**; con `?kind=transfer` registra un giroconto, che
  nasce come **due gambe in una transazione sola** — o entrambe, o nessuna
- `PATCH /api/v1/accounting/entries/:id` — la **correzione**
  (`accounting.manage`). Si corregge cio che **descrive** il fatto senza
  cambiarlo: descrizione, note, metodo, controparte, riferimento bancario, sede
  e causale. **Data, verso, importo e conto non si toccano**: sono il fatto
  finanziario, e se uno di essi e sbagliato la risposta e uno storno.
  Riclassificare una riga ricongela l'ambito e lascia in audit il valore di
  prima e quello di dopo — cosa diversa dal modificare una causale nel
  catalogo, che riscriverebbe la natura di mille movimenti passati in silenzio.
  Una riga stornata, uno storno e un giroconto non si correggono
- `POST /api/v1/accounting/entries/:id/reverse` — lo **storno**
  (`accounting.reverse`, che la segreteria **non** ha: registrare non e
  stornare). Nasce la riga opposta, l'originale resta e porta il motivo, e i
  totali escludono entrambe. **Non esiste il `DELETE`.** Un giroconto si
  storna intero: stornarne una gamba sola lascerebbe denaro sparito fra due
  conti
- `POST /api/v1/accounting/entries/:id/reconcile` — la **riconciliazione**
  (`accounting.reconcile`): `unreconciled` | `reconciled` | `disputed`, con
  data valuta e riferimento. In V1 e un atto umano su un dato che il sistema
  gia conosce: nessun import di tracciati bancari, nessun matching automatico
  su causale libera. Un movimento stornato non si riconcilia
- `GET|POST /api/v1/accounting/entries` — la **prima nota**. La `GET`
  (`accounting.read`) restituisce in una lettura sola le righe proprie —
  movimenti manuali, gambe di giroconto, storni — e quelle **proiettate** dai
  domini proprietari: incassi, compensi, liquidazioni. Le proiezioni sono
  sempre in sola lettura, e i flag `canEdit`/`canReverse`/`canReconcile`
  viaggiano **con la riga**, perche la pagina non li ricalcoli. Filtri:
  `from`, `to`, `fiscal_year`, `season_id`, `financial_account_id`,
  `operation_type_code`, `direction`, `source_domain`, `site_id`,
  `activity_scope`, `reconciliation_status`, `q`, `limit`, `offset`.
  `fiscal_year` e `season_id` sono **due assi diversi**, e una riga che non
  dichiara una stagione appartiene a quella nel cui periodo cade.
  La `POST` (`accounting.manage`) registra un movimento manuale, con
  **causale obbligatoria**; con `?kind=transfer` registra un giroconto, che
  nasce come **due gambe in una transazione sola** — o entrambe, o nessuna
- `POST /api/v1/accounting/entries/:id/reverse` — lo **storno**
  (`accounting.reverse`, che la segreteria **non** ha: registrare non e
  stornare). Nasce la riga opposta, l'originale resta e porta il motivo, e i
  totali escludono entrambe. **Non esiste il `DELETE`.** Un giroconto si
  storna intero: stornarne una gamba sola lascerebbe denaro sparito fra due
  conti
- `POST /api/v1/accounting/entries/:id/reconcile` — la **riconciliazione**
  (`accounting.reconcile`): `unreconciled` | `reconciled` | `disputed`, con
  data valuta e riferimento. In V1 e un atto umano su un dato che il sistema
  gia conosce: nessun import di tracciati bancari, nessun matching automatico
  su causale libera. Un movimento stornato non si riconcilia
- `GET /api/v1/accounting/reports` — il **riepilogo gestionale**
  (`accounting.read`). Incassato e pagato (cassa) restano separati da crediti
  e debiti (competenza), e nessun campo li somma. Filtri: `from`, `to`,
  `fiscal_year`, `season_id`, `financial_account_id`, `operation_type_code`,
  `site_id`, `direction`, `activity_scope`; `compare_from`/`compare_to`/
  `compare_fiscal_year` aggiungono il confronto con un secondo periodo, **solo
  fra grandezze omogenee**. `fiscal_year` e `season_id` sono due assi diversi:
  la stagione 2026/27 contiene movimenti del 2026 e del 2027. I saldi dei conti
  arrivano solo a chi ha `accounting.accounts_read`, e per gli altri valgono
  `null` e non zero. **Non e un documento ufficiale**: la risposta porta il suo
  `disclaimer`, e nessuna etichetta usa «ufficiale», «conforme» o «a norma»
- `GET|POST /api/v1/accounting/expected` — le **previsioni** del club: entrate
  e uscite attese e non ancora accadute, con i loro totali
  (`expectedIncomeCents`, `expectedExpenseCents`, `expectedNetCents`). Il nome
  dei campi e la garanzia: **nessuno di questi numeri e un saldo**, e nessuno
  entra in un totale di cassa. Vivono in `expected_income` e
  `expected_expenses`, **non** in `accounting_entries`, che ospita solo fatti
  avvenuti. La `GET` chiede `accounting.read` e filtra sulla stagione attiva
  (`season_id` o l'header `x-active-season-id`); la `POST`
  (`accounting.manage`) scrive **dal server** una riga in
  `club_resource_items` sotto lock — mai la riscrittura della colonna JSON dal
  browser, che era il difetto per cui due segreterie si cancellavano a vicenda
- `DELETE /api/v1/accounting/expected/:id?direction=income|expense` — toglie
  una previsione (`accounting.manage`). Qui il `DELETE` esiste e sulla prima
  nota no, e non e un'incoerenza: un fatto di cassa e accaduto e si storna, una
  previsione e un promemoria e un promemoria sbagliato si toglie
- `GET /api/v1/accounting/export` — l'**export della contabilita**
  (`accounting.export`, che la segreteria **non** ha: e la fotografia completa
  dei conti della societa e lascia l'applicazione dentro un file). Risponde un
  **CSV**, non JSON: `;`, CRLF e BOM, cioe cio che l'Excel italiano apre senza
  chiedere niente. Filtri identici a quelli della prima nota. Colonne
  dichiarate: data, numero del documento, codice ed etichetta della causale,
  descrizione, **entrata e uscita in due colonne** (nessun importo con il
  segno), conto, metodo, controparte con il suo tipo, documento,
  classificazione **congelata sulla riga**, imponibile e imposta quando ci
  sono, origine, anno fiscale, stato di riconciliazione, data di storno e
  note. Oltre le 40.000 righe **non consegna un file parziale**: risponde un
  errore che dice cosa restringere. **Non e un documento**: nessuna
  intestazione e nessun nome di file usa «ufficiale», «conforme», «a norma» o
  «per il deposito»
- `POST /api/v1/documents/:kind/:id/cancel` — annullamento di un documento
  emesso, con motivo obbligatorio. Il numero non si libera
- `GET|POST /api/v1/einvoice/:invoiceId` — stato e preparazione del tracciato
  FatturaPA. `action=transmit` risponde 503: nessun intermediario
  accreditato e configurato
- `GET /api/v1/documents/:kind/:id` — il documento stampabile di una ricevuta
  (`receipt`) o di una fattura (`invoice`), con il branding della societa.
  Restituisce **HTML**, non JSON: chi apre questo indirizzo vuole stampare
- `GET|POST /api/v1/documents/templates` — i modelli di documento del club.
  `?include_retired=1` mostra anche i ritirati. `POST` crea **in bozza**:
  creare non pubblica. Legge la segreteria, scrive la direzione
- `GET|PATCH|DELETE /api/v1/documents/templates/:id` — un modello con la sua
  bozza e le sue versioni. `PATCH` scrive la **bozza**, mai una versione;
  `DELETE` riesce solo se il modello non ha mai prodotto niente — altrimenti si
  ritira ([ADR-0088](knowledge-base/18-decision-log.md))
- `POST /api/v1/documents/templates/:id/publish` — congela la bozza in una
  versione **immutabile**. Se non si puo, la risposta porta `issues` con la
  chiave del segnaposto che lo impedisce: mai un rifiuto muto
- `GET|POST /api/v1/documents/catalog` — le voci di catalogo adottabili, e
  l'adozione. Escono **solo** le voci di classe A e attive: quelle legali o
  fiscali non validate non vengono nemmeno nominate
  ([ADR-0092](knowledge-base/18-decision-log.md))
- `GET /api/v1/documents/filled` — l'**anteprima** di un modello compilato
  (`templateId`, `subjectKind`, `subjectId`; `athleteId` resta accettato per
  compatibilita). Restituisce la pagina stampabile **insieme** ai segnaposto non
  risolti e a quelli senza dato, perche si vedano prima di stampare;
  `?format=html` restituisce la sola pagina. **Non scrive niente**: il documento
  che conta lo produce la rotta qui sotto. Gli importi vengono dal registro
  incassi ([ADR-0068](knowledge-base/18-decision-log.md)), la frequenza dal
  dominio contributi
- `GET|POST /api/v1/documents/generated` — i documenti generati, e la loro
  produzione. `POST { template_id, subjects[], batch_id? }` vale per uno come
  per cinquanta: dentro lo stesso lotto un soggetto produce **un** documento, e
  chi fallisce compare in `failed` con il motivo mentre il lotto continua
- `GET|PATCH /api/v1/documents/generated/:id` — un documento **com'era**:
  `?format=html` restituisce la resa conservata, non una rigenerazione. `PATCH`
  porta avanti lo stato, e «firmato» pretende la copia firmata
  ([ADR-0091](knowledge-base/18-decision-log.md)). **Non** si legge
  dall'endpoint degli allegati ([ADR-0089](knowledge-base/18-decision-log.md))
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
- `training_attendance` — alias storico di `club_event_participants`
- `club_events` — sola lettura: si scrive da /api/v1/events
- `club_event_participants` — sola lettura: si scrive da /api/v1/events/:id/participants
- ~~`assets`~~ — chiusa al registro generico: quattro rotte proprie

## Fascicolo documentale (Club ↔ Parent)

Il workflow esisteva gia per intero; cio che mancava e che richiesta e decisione
fossero **righe**, con un `organization_id` proprio, una scadenza sorvegliata e
un audit. I byte passano da Attachment Core: **nessun secondo archivio**.

- `GET|POST /api/v1/document-requests`
- `GET|PATCH|DELETE /api/v1/document-requests/:id` — il `PATCH` sollecita, il
  `DELETE` annulla
- `GET|POST /api/v1/document-submissions` — la coda «da verificare» e il
  deposito. L'upload e **multipart**, non base64
- `POST /api/v1/document-submissions/:id` — accettato, o rifiutato con motivo

Le due rotte storiche (`/api/athletes/:id/documents`,
`/api/parent-dashboard/:id/documents`) restano in **lettura**, unendo il
fascicolo nuovo a quello storico; le scritture passano dal dominio nuovo.

## Appuntamenti

- `GET|POST /api/v1/appointments` — la coda di lavoro della segreteria
- `GET|POST /api/v1/appointments/:id` — `action`: `confirm`, `reject`,
  `reschedule`, `cancel`, `complete`, `no-show`
- `GET /api/v1/appointments/availability` — gli slot liberi, con la fonte
  dichiarata (`slot` oppure `opening_hours`)
- `GET|POST /api/v1/appointment-slots` e `PATCH|DELETE /:id` — la disponibilita

La risorsa `appointments` resta **chiusa** al registro generico (D-1): la rotta
statica prevale su quella dinamica, e il dominio ha la sua porta.

## Eventi sportivi

Allenamenti e gare non hanno piu due rotte separate su due colonne JSON: hanno
una rotta sola su una tabella sola, e il tipo e un parametro (ADR-0098).

- `GET /api/v1/events` — il calendario, filtrabile per `kind`, `from`, `to`,
  `season_id`, `site_id`, `category_id`, `group_id`, `status`
- `POST /api/v1/events` — crea un evento, o un blocco con `{events: [...]}`
- `GET /api/v1/events/:id` — un evento e i suoi partecipanti
- `PATCH /api/v1/events/:id` — modifica con **controllo ottimistico**: il corpo
  porta `version`, e due salvataggi concorrenti non si sovrascrivono. Il secondo
  riceve **409**
- `DELETE /api/v1/events/:id` — solo per un evento **senza storia**: con
  presenze, convocazioni o risposte si annulla con un `PATCH`
- `GET|POST /api/v1/events/:id/participants` — convocazione
  (`action: "convoke"`) e appello (`action: "attendance"`). La risposta della
  famiglia non passa di qui

Le rotte `/api/v1/trainings` e `/api/v1/matches` **non esistono piu**:
`trainings` e `matches` sono usciti da `CLUB_RESOURCE_TYPES`. Le due colonne
del club restano come **proiezione in sola lettura**, con un solo scrittore.

## Area famiglia (Wave 5)

Tutte autorizzano sul **legame** con l'atleta e non sul ruolo: un tutore ha un
accesso di ruolo genitore e nessun ruolo gestionale, e il club non arriva mai
dal client — si legge dalla riga dell'atleta.

- `GET|POST /api/parent-dashboard/:athleteId/board` — la bacheca, letta dalle
  **consegne**; il `POST` segna una consegna come letta
- `GET|POST /api/parent-dashboard/:athleteId/consents` — i consensi che la
  famiglia accetta e revoca da se, con sorgente `subject`
- `POST /api/parent-dashboard/:athleteId/checkout` — «Paga ora»: emette il link
  di pagamento gia esistente con l'identita della sessione, solo per una rata
  del proprio figlio
- `GET /api/v1/family/enrollment-requests?athlete_id=…` — le pratiche di
  iscrizione e rinnovo, con lo stato e cio che il club aspetta
- `GET|POST /api/v1/family/enrollment-requests/renewal` — la bozza di rinnovo
  precompilata e il suo invio

`GET /api/v1/documents/receipt/:id` accetta adesso **anche** il legame: la
ricevuta era elencata e non scaricabile perche il gate era di ruolo.

## I namespace fuori da `/api/v1` (W5-74)

Cinque namespace stavano **fuori dal registro**, fra cui
`/api/parent-dashboard/**`, che e **il** canale della famiglia: chi leggeva
questo documento credeva di aver visto tutte le porte. Un elenco incompleto e
peggio di nessun elenco, perche nessuno lo verifica.

- `/api/parent-dashboard/**` — il cruscotto della famiglia e le sue superfici
- `/api/athletes/:athleteId/documents/**` — il fascicolo dal lato club
- `/api/athlete-payments/:paymentId` — una rata
- `/api/clothing/assignments` — assegnazioni di materiale
- `/api/forms/assets/:assetId` — allegati di una compilazione
- `/api/payments/**` e `/api/billing/webhook` — checkout e i due webhook firmati
- `/api/public/**` — le rotte senza sessione, elencate qui sotto

## Rotte pubbliche senza sessione

- `GET /api/public/enrollment-status/:reference` — lo stato della propria
  domanda, con il riferimento opaco restituito dall'invio. Rate limit doppio,
  404 unico per ogni esito negativo, nessun identificativo interno in risposta

## Area allenatore

- `GET /api/v1/trainer/preferences` — permessi della dashboard, scadenza
  convocazioni, taglio sul dato clinico (`clinical.status_read` /
  `clinical.read`), programma settimanale, strutture e orari di apertura. E la
  porta che sostituisce le otto letture di `GET /api/v1/clubs?fields=…`, che al
  ruolo allenatore rispondevano 403 (Wave 5, D-2)
- `GET|POST /api/v1/trainer/operational-alerts` — gli avvisi operativi, adesso
  **calcolati** dal server e non ricevuti dal client: prima titolo, testo,
  record e link li dettava il browser, e un avviso vero si spegneva
  semplicemente non mandandolo

## Risorse club aggregate

- ~~`appointments`~~ — **chiusa al registro generico** (Wave 5, D-1). Il
  CRUD generico rigenerava `clubs.appointments` da `club_resource_items` e
  cancellava le richieste delle famiglie, che nascono altrove. La segreteria
  passa da `PATCH /api/v1/clubs`; il dominio proprio arriva in 5E
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
- `members`
- `opening_hours`
- `payment_plans`
- `procure`
- `secretariat_notes`
- `sponsor_payments`
- `sponsors`
- `staff_members`
- `trainers`
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

## Wave 6 — le rotte nuove (2026-09-01)

### Area famiglia

- `GET /api/v1/family/children` — i figli fra cui un genitore sceglie. Il gate e
  il **legame**, non il ruolo: un tutore puo non avere nessuna tessera nel club,
  e un permesso di ruolo lo terrebbe fuori dalla propria area. Nessun parametro:
  non c'e niente da chiedere che non sia gia nella sessione. Un elenco vuoto e
  una risposta vera, non un errore.
- `PATCH /api/parent-dashboard/:athleteId/notifications` — segna letta una
  notifica, o tutte. Il club si **rilegge dalla riga dell'atleta** e finisce nel
  `where`: un genitore con figli in due societa non deve chiudere le notifiche
  dell'altra.

### Accesso EasyGame di un atleta

- `GET|POST|DELETE /api/v1/athlete-accounts/:athleteId` — lo stato, l'invito, la
  revoca. In archivio resta **solo l'impronta** del token (ADR-0085).
- `POST /api/v1/athlete-accounts/:athleteId/resend` — rimanda l'invito e revoca
  il precedente. Un indice unico parziale garantisce **un solo invito vivo per
  atleta**: lo impedisce il database, non il codice.
- `POST /api/v1/athlete-accounts/:athleteId/email` — cambia l'indirizzo a cui
  l'invito e destinato.
- `POST /api/v1/athlete-accounts/accept` — riscatta l'invito. **Pubblica per
  costruzione**: ci arriva chi non ha ancora una password, e chiedergli una
  sessione sarebbe mandarlo dove non puo entrare.
- `GET|PATCH /api/v1/athlete-accounts/me` — l'area dell'atleta, con proiezione a
  elenco chiuso, e i **sei** campi che puo correggere. Nome, data di nascita,
  codice fiscale, maglia e stato restano della societa.
- `DELETE /api/v1/athlete-accounts/:athleteId/link` — scollega l'utenza dalla
  scheda, **senza** toccare `organization_users`. Distinta dalla revoca
  completa (la rotta senza `/link`), che tessera e invito li tocca di
  proposito (ADR-0110).

### Scollegare un profilo (allenatore, genitore)

- `DELETE /api/v1/trainer-accounts/:trainerId` — scollega l'utenza dalla
  scheda allenatore e revoca il suo gettone d'accesso. Non e la rotta generica
  su `organization_users`, che una tessera di club la rifiuta sempre
  (ADR-0110).
- `DELETE /api/v1/guardian-accounts/:athleteId/:guardianId` — scollega
  l'utenza dal genitore indicato di questo atleta. Non tocca
  `organization_users` ne gli altri genitori dello stesso atleta.

### Lavoro sportivo

- `GET /api/v1/sport-work/me` — i propri compensi. Chiede `sport_work.read_own`
  e **non accetta nessun identificativo di persona**: il perimetro lo risolve il
  server dalla sessione.

### Documenti

- `GET /api/v1/document-submissions?view=queue` — la coda operativa del club.
  Stesso percorso di prima; senza il parametro la forma resta identica.

### Diritti dell'interessato

- `GET /api/v1/data-subject/:subjectId` — il **riepilogo di cio che verrebbe
  distrutto**, con una riga per tabella e il motivo di cio che resta. Produce un
  gettone che e l'impronta del piano: se l'inventario cambia fra il riepilogo e
  la cancellazione, la cancellazione non parte.
- `DELETE /api/v1/data-subject/:subjectId` — la cancellazione. Per un minore
  serve una conferma esplicita, e **un'anagrafica senza data di nascita si
  tratta come minore**.
- `GET /api/v1/data-subject/:subjectId/export` — i dati di una persona,
  attraverso i **sei** indici polimorfi. Nessun byte: gli allegati escono come
  metadati.

### Audit

- `GET /api/v1/audit` — il registro degli eventi, con lo scope di club
  obbligatorio. Era **write-only**: 108 punti di scrittura e nessun lettore.

### Ruoli personalizzati e accessi di club (lane 6G)

Quattro rotte, e nessuna di loro verifica il permesso: lo verifica il dominio
(`src/lib/server/club-roles.ts`), che e anche l'unico posto in cui il diniego
lascia la propria riga di audit. Il preambolo comune legge la sessione, risolve
il club attivo e basta.

- `GET|POST /api/v1/club-roles` — l'elenco dei ruoli che il club si e scritto,
  con le chiavi e quante persone lo portano; e la creazione, che e **solo del
  proprietario**. Clonare un preset non e un'operazione diversa dal creare, e
  non ha una rotta propria: darle una vorrebbe dire avere due strade per la
  stessa scrittura.
- `PATCH|DELETE /api/v1/club-roles/:id` — nome, descrizione, chiavi, attivo; e
  la cancellazione, che riesce **solo se non lo porta nessuno**. Entrambe del
  solo proprietario. Il **ruolo base** non e fra i campi modificabili, e non e
  una svista: e lo slug, ed e il tetto — cambiarlo cambierebbe i permessi di chi
  lo porta senza che nessuno abbia toccato la sua tessera.
- `GET|POST /api/v1/club-roles/assignments` — chi ha accesso al club, con che
  ruolo e con quale perimetro; e l'assegnazione. E la rotta che sostituisce i
  tre nomi inventati con indirizzi `@example.com` della vecchia schermata, e il
  token generato con `Math.random()` **nel browser** e mai salvato. L'invito
  vero resta quello che esisteva gia: `POST /api/v1/auth/access/redeem` per il
  riscatto, e la scheda della persona per la consegna.
- `PATCH|DELETE /api/v1/club-roles/assignments/:id` — il perimetro e la revoca.
  Il perimetro si scrive per **sostituzione**, e un elenco vuoto significa
  «tutto il club»: la stessa convenzione della tabella, dove zero righe non sono
  zero accessi ma nessuna restrizione.

Un ruolo personalizzato **non si assegna dalla rotta generica**: `POST
/api/v1/organization_users` lo rifiuta con una riga di audit del diniego, perche
una tessera con lo slug in `role` e senza `custom_role_id` darebbe il ruolo base
**senza** restringimento.

---

## Cosa questo file elenca e `src/lib/api/registry.ts` no (2026-09-02)

`GET /api/v1/registry` serve il registro che vive nel **codice**, e le due
fonti sono compilate a mano: divergono, e conviene sapere dove.

Rotte servite dall'applicazione e **assenti dal registro del codice**:

| Rotta | Nota |
|-------|------|
| `GET\|POST /api/v1/club-roles` | Wave 6, lane 6G |
| `PATCH\|DELETE /api/v1/club-roles/:id` | Wave 6, lane 6G |
| `GET\|POST /api/v1/club-roles/assignments` | Wave 6, lane 6G |
| `PATCH\|DELETE /api/v1/club-roles/assignments/:id` | Wave 6, lane 6G |
| `PATCH /api/parent-dashboard/:athleteId/notifications` | Wave 6, lane 6D — documentata qui sopra, non nel codice |
| `GET /api/v1/auth/athlete-profile/:athleteId` | preesistente |
| `POST /api/v1/auth/memberships/delete` | preesistente |
| `GET\|PATCH\|DELETE /api/v1/admin/clubs/:id`, `/api/v1/admin/users/:id` | preesistenti, console di piattaforma |
| `/api/v1/payments/account` | preesistente |
| `/api/v1/seasons/:seasonId/roster` | preesistente |
| `/api/v1/forms/:id/compile` | preesistente |
| `/api/v1/funding/settlements/:id/reverse` | preesistente |

Il registro del codice e **codice** e non si corregge da un commit di
documentazione: l'allineamento e un intervento a se, e va fatto verificando che
`docs/api-registry.md`, `src/lib/api/registry.ts` e `src/app/api/**` dicano la
stessa cosa. Finche non e fatto, **la fonte piu vicina alla verita e il
filesystem**, non nessuno dei due elenchi.
