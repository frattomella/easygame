export type ApiRegistryEntry = {
  name: string;
  method: string;
  path: string;
  description: string;
  mobile_ready: boolean;
};

const resourceNames = [
  "users",
  "clubs",
  "organizations",
  "dashboards",
  "organization_users",
  "club_resource_items",
  "athletes",
  "athlete_category_memberships",
  "simplified_athletes",
  "medical_certificates",
  "simplified_certificates",
  "payments",
  "simplified_payments",
  "payment_methods",
  "invoices",
  "receipts",
  "trainer_payments",
  "notifications",
  "simplified_notifications",
  "training_attendance",
  "assets",
  "access_tokens",
  "appointments",
  "bank_accounts",
  "categories",
  "category_groups",
  "clothing_inventory",
  "clothing_kits",
  "clothing_products",
  "club_sites",
  "discounts",
  "document_templates",
  "expected_expenses",
  "expected_income",
  "jersey_assignments",
  "jersey_groups",
  "kit_assignments",
  "matches",
  "members",
  "opening_hours",
  "payment_plans",
  "procure",
  "secretariat_notes",
  "sponsor_payments",
  "sponsors",
  "staff_members",
  "trainers",
  "trainings",
  "transactions",
  "transfers",
  "weekly_schedule",
];

export const API_REGISTRY: ApiRegistryEntry[] = [
  {
    name: "registry.list",
    method: "GET",
    path: "/api/v1/registry",
    description: "Registro completo API per web e mobile",
    mobile_ready: true,
  },
  {
    name: "comuni.search",
    method: "GET",
    path: "/api/v1/comuni",
    description:
      "Archivio ISTAT dei comuni italiani: ricerca per nome, per codice catastale o per omonimia",
    mobile_ready: true,
  },
  {
    name: "athletes.avatar",
    method: "GET",
    path: "/api/v1/athletes/:id/avatar",
    description:
      "La foto di un atleta come immagine: la lista riceve un indirizzo, non un base64",
    mobile_ready: true,
  },
  {
    name: "clubs.signature",
    method: "GET|PUT|DELETE",
    path: "/api/v1/clubs/:id/signature",
    description:
      "Firma del presidente e timbro della societa. Senza `?kind=` restituisce i metadati di entrambi; con `?kind=signature|stamp` i byte dell'immagine. Legge chi appartiene al club, scrive solo proprietario e gestore",
    mobile_ready: false,
  },
  {
    name: "attachments.list",
    method: "GET",
    path: "/api/v1/attachments",
    description:
      "Metadati degli allegati di una risorsa del club. Mai i byte",
    mobile_ready: true,
  },
  {
    name: "attachments.upload",
    method: "POST",
    path: "/api/v1/attachments",
    description: "Caricamento di un allegato (multipart/form-data)",
    mobile_ready: true,
  },
  {
    name: "attachments.file",
    method: "GET|PUT|DELETE",
    path: "/api/v1/attachments/:id",
    description:
      "Contenuto di un allegato: visualizzazione, download, sostituzione, eliminazione",
    mobile_ready: true,
  },
  {
    name: "payment_transactions.list",
    method: "GET",
    path: "/api/v1/payment-transactions",
    description:
      "Registro incassi: i movimenti di denaro di un club, di un atleta o di una rata",
    mobile_ready: true,
  },
  {
    name: "payment_transactions.create",
    method: "POST",
    path: "/api/v1/payment-transactions",
    description:
      "Registra un incasso su una rata e ne ricalcola lo stato nella stessa transazione",
    mobile_ready: true,
  },
  {
    name: "payment_transactions.actions",
    method: "POST",
    path: "/api/v1/payment-transactions/:id",
    description:
      "Azioni su un incasso: `reverse` lo storna senza cancellarlo, `refund` ne chiede al provider la restituzione (totale o parziale), `issue-receipt` ne emette la ricevuta, `issue-invoice` la fattura",
    mobile_ready: true,
  },
  {
    name: "payment_reminders.run",
    method: "POST",
    path: "/api/v1/payment-reminders",
    description:
      "Sollecito degli insoluti verso le famiglie: con `preview: true` restituisce i destinatari raggiungibili e quelli non raggiungibili con il motivo, senza `preview` esegue l'invio e riferisce l'esito per destinatario",
    mobile_ready: false,
  },
  /*
    Wave 2 — comunicazioni. Nessuna e `mobile_ready`: lo sviluppo mobile e
    differito (ADR-0025), e dichiararle pronte sarebbe una promessa che nessuno
    ha verificato.
  */
  {
    name: "communications.send",
    method: "POST",
    path: "/api/v1/communications",
    description:
      "Comunicazione massiva alle famiglie: con `preview: true` restituisce i destinatari raggiungibili, gli esclusi con il motivo e il messaggio come lo leggera il primo destinatario; senza `preview` invia a lotti e riferisce l'esito per destinatario",
    mobile_ready: false,
  },
  {
    name: "announcements.list",
    method: "GET|POST",
    path: "/api/v1/announcements",
    description:
      "La bacheca del club: senza parametri gli annunci che la societa governa, con `?mine=1` quelli destinati a chi sta guardando. `POST` crea una bozza",
    mobile_ready: false,
  },
  {
    name: "announcements.item",
    method: "GET|PATCH|POST",
    path: "/api/v1/announcements/:id",
    description:
      "Un annuncio. `?deliveries=1` dice chi lo ha ricevuto e chi lo ha aperto; `POST { action }` accetta `publish`, `withdraw` e `read`",
    mobile_ready: false,
  },
  {
    name: "payment_links.issue",
    method: "POST",
    path: "/api/v1/payment-links",
    description:
      "Emette un link di pagamento per una rata: token opaco, scadenza, revocabile. Richiede l'entitlement `online_payments`",
    mobile_ready: false,
  },
  {
    name: "payment_links.revoke",
    method: "DELETE",
    path: "/api/v1/payment-links/:id",
    description: "Revoca un link di pagamento senza cancellarne la traccia",
    mobile_ready: false,
  },
  {
    name: "payment_links.public_view",
    method: "GET",
    path: "/api/public/payment-links/:token",
    description:
      "**Superficie pubblica, senza autenticazione.** Quanto resta da versare su una rata, senza nessun identificativo interno. Token sconosciuto, scaduto, revocato o manomesso rispondono la stessa cosa",
    mobile_ready: false,
  },
  {
    name: "payment_links.public_checkout",
    method: "POST",
    path: "/api/public/payment-links/:token/checkout",
    description:
      "**Superficie pubblica, senza autenticazione.** Apre il checkout sulla rata del link, con il residuo ricalcolato al momento. Passa dallo stesso `openGatewayCheckout` del canale autenticato",
    mobile_ready: false,
  },
  {
    name: "rsvp.answer",
    method: "GET|POST",
    path: "/api/v1/rsvp",
    description:
      "Conferma di partecipazione a un evento. `POST` registra la risposta della famiglia; `GET ?training_id=` il riepilogo per lo staff con chi non ha risposto, `GET ?athlete_id=` gli inviti aperti di un atleta",
    mobile_ready: false,
  },
  {
    name: "funding.reconciliation",
    method: "GET",
    path: "/api/v1/funding/programs/:id/reconciliation",
    description:
      "Riconciliazione di un bando: una riga per atleta e periodo, con la misura grezza accanto al requisito. `?format=csv` la scarica",
    mobile_ready: false,
  },
  {
    name: "documents.printable",
    method: "GET",
    path: "/api/v1/documents/:kind/:id",
    description:
      "Il documento stampabile di una ricevuta o di una fattura, con il branding della societa. Restituisce HTML",
    mobile_ready: false,
  },
  {
    name: "documents.filled",
    method: "GET",
    path: "/api/v1/documents/filled",
    description:
      "Un modello di modulistica compilato per un atleta e una stagione: HTML stampabile piu l'elenco dei segnaposto non risolti. `?format=html` restituisce la sola pagina",
    mobile_ready: false,
  },
  {
    name: "funding.programs.detail",
    method: "GET",
    path: "/api/v1/funding/programs/:id?view=detail",
    description:
      "La scheda di un programma: configurazione, beneficiari con i cinque importi, totali e atleti ancora iscrivibili",
    mobile_ready: false,
  },
  {
    name: "funding.enrollments.create",
    method: "POST",
    path: "/api/v1/funding/enrollments",
    description:
      "Iscrive uno o piu atleti a un programma. Ogni atleta puo avere plafond e codice voucher propri; chi era gia iscritto viene saltato con il motivo, non fa fallire il lotto",
    mobile_ready: false,
  },
  {
    name: "funding.enrollments.enrollable",
    method: "GET",
    path: "/api/v1/funding/enrollments?view=enrollable",
    description:
      "I programmi a cui un atleta non e ancora iscritto, esclusi quelli chiusi. E la stessa domanda della scheda programma, girata",
    mobile_ready: false,
  },
  {
    name: "funding.enrollments.update",
    method: "PATCH",
    path: "/api/v1/funding/enrollments/:id",
    description:
      "Plafond individuale, codice voucher, stato. Il plafond non puo scendere sotto il gia maturato",
    mobile_ready: false,
  },
  {
    name: "funding.enrollments.remove",
    method: "DELETE",
    path: "/api/v1/funding/enrollments/:id",
    description:
      "Toglie l iscrizione, oppure la **revoca** quando ha gia prodotto importi rendicontati o liquidati. La risposta dice quale delle due",
    mobile_ready: false,
  },
  /*
    Lavoro sportivo e compensi. Nessuna di queste rotte e `mobile_ready`: lo
    sviluppo mobile e differito (ADR-0025), e un dato economico riservato non
    e il posto da cui riaprirlo.
  */
  {
    name: "sport_work.people",
    method: "GET",
    path: "/api/v1/sport-work/people",
    description:
      "Le persone che lavorano per il club. L elenco non porta mai l IBAN: le coordinate bancarie si leggono aprendo la scheda",
    mobile_ready: false,
  },
  {
    name: "sport_work.people.create",
    method: "POST",
    path: "/api/v1/sport-work/people",
    description:
      "Censisce una persona nel modulo compensi, con il riferimento debole all anagrafica di origine (atleta, allenatore, staff, socio o esterno)",
    mobile_ready: false,
  },
  {
    name: "sport_work.people.detail",
    method: "GET",
    path: "/api/v1/sport-work/people/:id",
    description: "La scheda completa di una persona, IBAN compreso",
    mobile_ready: false,
  },
  {
    name: "sport_work.people.update",
    method: "PATCH",
    path: "/api/v1/sport-work/people/:id",
    description: "Modifica dell anagrafica del modulo compensi",
    mobile_ready: false,
  },
  {
    name: "sport_work.people.position",
    method: "GET",
    path: "/api/v1/sport-work/people/:id/position?year=2026",
    description:
      "La posizione annua verso le soglie dei 5.000 e dei 15.000, con lo scostamento che una dichiarazione arrivata in ritardo produrrebbe",
    mobile_ready: false,
  },
  {
    name: "sport_work.relationships",
    method: "GET",
    path: "/api/v1/sport-work/relationships",
    description:
      "I rapporti di lavoro sportivo. La lettura porta prima a scaduti i contratti la cui data di fine e passata",
    mobile_ready: false,
  },
  {
    name: "sport_work.relationships.create",
    method: "POST",
    path: "/api/v1/sport-work/relationships",
    description:
      "Crea un rapporto. Nasce sempre in bozza: attivarlo e un atto separato che verifica cosa manca",
    mobile_ready: false,
  },
  {
    name: "sport_work.relationships.detail",
    method: "GET",
    path: "/api/v1/sport-work/relationships/:id?view=detail",
    description:
      "La scheda del rapporto: persona, piano, scadenze, movimenti e cosa manca per attivarlo",
    mobile_ready: false,
  },
  {
    name: "sport_work.relationships.update",
    method: "PATCH",
    path: "/api/v1/sport-work/relationships/:id",
    description: "Modifica di un rapporto non cessato",
    mobile_ready: false,
  },
  {
    name: "sport_work.relationships.status",
    method: "POST",
    path: "/api/v1/sport-work/relationships/:id/status",
    description:
      "Cambio di stato. Non e un PATCH sul campo perche non e la modifica di un campo: attivare richiede contratto e anagrafica, cessare richiede un motivo",
    mobile_ready: false,
  },
  {
    name: "sport_work.plan",
    method: "GET",
    path: "/api/v1/sport-work/relationships/:id/plan",
    description: "Il piano compensi di un rapporto e le sue scadenze",
    mobile_ready: false,
  },
  {
    name: "sport_work.plan.save",
    method: "PUT",
    path: "/api/v1/sport-work/relationships/:id/plan",
    description:
      "Crea o rifa il piano nelle tre forme (rate uguali, mensilita, rate personalizzate). Rifiutato se una scadenza ha gia ricevuto denaro",
    mobile_ready: false,
  },
  {
    name: "sport_work.installments",
    method: "GET",
    path: "/api/v1/sport-work/installments",
    description:
      "Le scadenze compenso del club, con programmato, maturato e pagato tenuti separati",
    mobile_ready: false,
  },
  {
    name: "sport_work.installments.cancel",
    method: "POST",
    path: "/api/v1/sport-work/installments/:id/cancel",
    description:
      "Annulla una scadenza programmata. Non e un DELETE: la riga resta marcata, e una scadenza gia erogata non si annulla affatto",
    mobile_ready: false,
  },
  {
    name: "sport_work.payouts",
    method: "GET",
    path: "/api/v1/sport-work/payouts",
    description: "Il registro in uscita: compensi, premi, rimborsi, fatture",
    mobile_ready: false,
  },
  {
    name: "sport_work.payouts.prepare",
    method: "POST",
    path: "/api/v1/sport-work/payouts/prepare",
    description:
      "La proposta di erogazione: imponibili, contributi, netto, costo del club e la motivazione riga per riga. Non scrive niente",
    mobile_ready: false,
  },
  {
    name: "sport_work.payouts.record",
    method: "POST",
    path: "/api/v1/sport-work/payouts",
    description:
      "Registra un erogazione. Accetta `idempotencyKey`: due invii dello stesso clic restituiscono lo stesso movimento invece di farne uscire due",
    mobile_ready: false,
  },
  {
    name: "sport_work.payouts.reverse",
    method: "POST",
    path: "/api/v1/sport-work/payouts/:id/reverse",
    description:
      "Storna un erogazione con una riga di segno opposto. Non esiste DELETE su questo registro",
    mobile_ready: false,
  },
  {
    name: "sport_work.declarations",
    method: "GET",
    path: "/api/v1/sport-work/declarations",
    description:
      "Le autocertificazioni dei compensi percepiti da altri committenti",
    mobile_ready: false,
  },
  {
    name: "sport_work.declarations.create",
    method: "POST",
    path: "/api/v1/sport-work/declarations",
    description:
      "Registra un autocertificazione. Sostituisce quella dell anno, che resta marcata: quello che il club sapeva a marzo resta quello che sapeva a marzo",
    mobile_ready: false,
  },
  {
    name: "sport_work.bonuses",
    method: "GET",
    path: "/api/v1/sport-work/bonuses",
    description: "I premi, tenuti separati dai compensi",
    mobile_ready: false,
  },
  {
    name: "sport_work.bonuses.create",
    method: "POST",
    path: "/api/v1/sport-work/bonuses",
    description:
      "Registra un premio. Il trattamento fiscale si dichiara e non si deduce: la distinzione fra premio e retribuzione variabile la fa il contratto",
    mobile_ready: false,
  },
  {
    name: "sport_work.bonuses.pay",
    method: "POST",
    path: "/api/v1/sport-work/bonuses/:id/pay",
    description:
      "Eroga un premio. Esce dal registro ma non consuma le franchigie del lavoratore",
    mobile_ready: false,
  },
  {
    name: "sport_work.reimbursements",
    method: "GET",
    path: "/api/v1/sport-work/reimbursements",
    description: "I rimborsi spese, che non sono compensi",
    mobile_ready: false,
  },
  {
    name: "sport_work.reimbursements.create",
    method: "POST",
    path: "/api/v1/sport-work/reimbursements",
    description:
      "Registra una nota spese: viaggio, vitto, alloggio, chilometrico o altra spesa documentata",
    mobile_ready: false,
  },
  {
    name: "sport_work.reimbursements.transition",
    method: "PATCH",
    path: "/api/v1/sport-work/reimbursements/:id",
    description:
      "Presenta, approva o respinge un rimborso. A liquidato non ci si arriva da qui",
    mobile_ready: false,
  },
  {
    name: "sport_work.reimbursements.pay",
    method: "POST",
    path: "/api/v1/sport-work/reimbursements/:id/pay",
    description:
      "Liquida un rimborso approvato. L approvazione e il momento in cui qualcuno se ne assume la responsabilita",
    mobile_ready: false,
  },
  {
    name: "sport_work.vat_invoices",
    method: "GET",
    path: "/api/v1/sport-work/vat-invoices",
    description: "Le fatture ricevute dai professionisti con partita IVA",
    mobile_ready: false,
  },
  {
    name: "sport_work.vat_invoices.create",
    method: "POST",
    path: "/api/v1/sport-work/vat-invoices",
    description:
      "Registra una fattura ricevuta. Gli importi si trascrivono dal documento: il calcolo lo ha fatto chi l ha emessa",
    mobile_ready: false,
  },
  {
    name: "sport_work.vat_invoices.pay",
    method: "POST",
    path: "/api/v1/sport-work/vat-invoices/:id/pay",
    description:
      "Paga una fattura ricevuta, anche a rate. Nessuna regola co.co.co. la tocca",
    mobile_ready: false,
  },
  {
    name: "sport_work.obligations",
    method: "GET",
    path: "/api/v1/sport-work/obligations",
    description:
      "L agenda degli adempimenti: RASD, F24, autocertificazioni, contratti in scadenza, CU",
    mobile_ready: false,
  },
  {
    name: "sport_work.obligations.create",
    method: "POST",
    path: "/api/v1/sport-work/obligations",
    description: "Aggiunge un adempimento a mano, fuori da quelli derivati",
    mobile_ready: false,
  },
  {
    name: "sport_work.obligations.sync",
    method: "POST",
    path: "/api/v1/sport-work/obligations/sync",
    description:
      "Riallinea l agenda con cio che rapporti ed erogazioni richiedono. Idempotente: rieseguirla non duplica ne le scadenze ne le notifiche",
    mobile_ready: false,
  },
  {
    name: "sport_work.obligations.complete",
    method: "POST",
    path: "/api/v1/sport-work/obligations/:id/complete",
    description:
      "Marca un adempimento come assolto. Assolto significa che una persona lo ha fatto, non che EasyGame lo abbia trasmesso",
    mobile_ready: false,
  },
  {
    name: "sport_work.dashboard",
    method: "GET",
    path: "/api/v1/sport-work/dashboard",
    description:
      "I numeri del cruscotto: programmato, maturato e pagato del mese, costo club, da pagare, scaduti, contratti in scadenza, autocertificazioni mancanti",
    mobile_ready: false,
  },
  {
    name: "sport_work.datasets",
    method: "GET",
    path: "/api/v1/sport-work/datasets?kind=f24&year=2026",
    description:
      "I dati strutturati per F24 e CU. Non sono un F24 e non sono una CU: sono le tabelle che il consulente si porta via",
    mobile_ready: false,
  },
  {
    name: "sport_work.scheduler",
    method: "POST",
    path: "/api/v1/sport-work/scheduler",
    description:
      "Il giro sul club attivo, a mano: porta a scaduti i contratti finiti, ricalcola il maturato, riallinea l agenda e notifica le scadenze vicine. Idempotente",
    mobile_ready: false,
  },
  {
    name: "sport_work.scheduler.cron",
    method: "GET",
    path: "/api/v1/sport-work/scheduler",
    description:
      "Lo stesso giro su tutti i club, invocato da Vercel Cron alle 03:30. Si autentica con CRON_SECRET; in produzione senza quella variabile non si apre",
    mobile_ready: false,
  },
  {
    name: "platform.payments.read",
    method: "GET",
    path: "/api/v1/platform/payments",
    description:
      "Il centro di controllo commerciale: stato Stripe Connect e billing, commissione standard e override per club, ultimi eventi. Solo platform_admin; non restituisce mai una chiave segreta",
    mobile_ready: false,
  },
  {
    name: "platform.payments.write",
    method: "POST",
    path: "/api/v1/platform/payments",
    description:
      "Commissione (operation=commission), rientro allo standard (commission_reset), collegamento Connect (connect_onboarding), risincronizzazione (connect_sync), sospensione (connect_toggle), configurazione (settings). Solo platform_admin",
    mobile_ready: false,
  },
  {
    name: "fiscal.profile.read",
    method: "GET",
    path: "/api/v1/fiscal/profile",
    description:
      "Il profilo fiscale della societa, con i vocabolari (forme giuridiche, regimi) e cosa manca per fatturare e per la fattura elettronica",
    mobile_ready: false,
  },
  {
    name: "fiscal.profile.write",
    method: "PUT",
    path: "/api/v1/fiscal/profile",
    description:
      "Aggiornamento del profilo fiscale. Dominio del club: la piattaforma legge per assistere, non scrive al posto di chi risponde del contenuto",
    mobile_ready: false,
  },
  {
    name: "fiscal.operations.read",
    method: "GET",
    path: "/api/v1/fiscal/operation-types",
    description:
      "Classificazione delle operazioni economiche e serie di numerazione. Semina il catalogo iniziale al primo accesso",
    mobile_ready: false,
  },
  {
    name: "fiscal.operations.write",
    method: "PUT",
    path: "/api/v1/fiscal/operation-types",
    description:
      "Configurazione di un tipo di operazione: percorso documentale, aliquota, natura IVA, ambito. Il codice non si cambia: lo citano gli incassi gia registrati",
    mobile_ready: false,
  },
  {
    name: "fiscal.series.write",
    method: "POST",
    path: "/api/v1/fiscal/operation-types",
    description:
      "Creazione o aggiornamento di una serie di numerazione. Una sola serie predefinita per tipo di documento",
    mobile_ready: false,
  },
  {
    name: "documents.cancel",
    method: "POST",
    path: "/api/v1/documents/:kind/:id/cancel",
    description:
      "Annullamento di un documento emesso, con motivo obbligatorio. Il numero non si libera: un buco e spiegabile, un duplicato no",
    mobile_ready: false,
  },
  {
    name: "einvoice.read",
    method: "GET",
    path: "/api/v1/einvoice/:invoiceId",
    description:
      "Stato della fattura elettronica e capability dell'ambiente. Oggi la trasmissione allo SdI non e attiva: nessun intermediario accreditato configurato",
    mobile_ready: false,
  },
  {
    name: "einvoice.prepare",
    method: "POST",
    path: "/api/v1/einvoice/:invoiceId",
    description:
      "action=prepare genera e valida il tracciato FatturaPA dallo snapshot del documento; action=transmit risponde 503 con il motivo finche non e configurato un intermediario",
    mobile_ready: false,
  },
  {
    name: "payments.checkout.create",
    method: "POST",
    path: "/api/payments/create-checkout-session",
    description:
      "Apre un checkout online per una rata, anche per un importo parziale. Club, provider, conto e commissione non arrivano dal corpo: il club e quello attivo della sessione",
    mobile_ready: false,
  },
  {
    name: "payments.checkout.status",
    method: "GET",
    path: "/api/payments/checkout-status",
    description:
      "Lo stato di un pagamento online secondo il registro incassi. Il ritorno dal browser non e una fonte: finche il webhook non conferma, lo stato e «in verifica»",
    mobile_ready: false,
  },
  {
    name: "payments.webhook",
    method: "POST",
    path: "/api/payments/webhook",
    description:
      "Callback del PSP per gli incassi degli atleti (Connect). Firma verificata sul corpo grezzo, evento deduplicato. Nessuna sessione: chi chiama e Stripe",
    mobile_ready: false,
  },
  {
    name: "billing.webhook",
    method: "POST",
    path: "/api/billing/webhook",
    description:
      "Callback del billing di piattaforma (abbonamenti EasyGame sull'account centrale di Cedi Soft). Segreto di firma distinto da quello degli incassi",
    mobile_ready: false,
  },
  {
    name: "entitlements.read",
    method: "GET",
    path: "/api/v1/entitlements",
    description:
      "Cosa un club puo usare: esito e motivo funzione per funzione, calcolati su piano, servizi attivi ed eccezioni",
    mobile_ready: false,
  },
  {
    name: "entitlements.override",
    method: "POST",
    path: "/api/v1/entitlements",
    description:
      "Piano (operation=plan), servizio aggiuntivo (operation=service) o eccezione su una funzione. Solo platform_admin: sono decisioni di Cedi verso un cliente, non preferenze del club",
    mobile_ready: false,
  },
  {
    name: "maintenance.run",
    method: "POST",
    path: "/api/v1/maintenance",
    description:
      "Toglie cio che e scaduto: sessioni, sfide OTP, contatori di rate limit e audit oltre la retention. La aziona un cron con un segreto condiviso, o un platform_admin a mano",
    mobile_ready: false,
  },
  {
    name: "maintenance.cron",
    method: "GET",
    path: "/api/v1/maintenance",
    description:
      "La stessa pulizia, invocata da Vercel Cron alle 04:30. CRON_SECRET e obbligatorio in ogni ambiente: senza, risponde 503 e non cancella niente",
    mobile_ready: false,
  },
  {
    name: "training_automation.cron",
    method: "GET",
    path: "/api/v1/training-automation",
    description:
      "La generazione automatica degli allenamenti su tutti i club, invocata da Vercel Cron alle 04:00. Si autentica con CRON_SECRET; in produzione senza quella variabile non si apre",
    mobile_ready: false,
  },
  {
    name: "medical_certificate_reminders.run",
    method: "POST",
    path: "/api/medical-certificate-reminders",
    description:
      "Il promemoria sul certificato medico di un atleta, a mano dalla segreteria. Deduplicato per chiave deterministica nei sette giorni precedenti",
    mobile_ready: false,
  },
  {
    name: "medical_certificate_reminders.cron",
    method: "GET",
    path: "/api/medical-certificate-reminders",
    description:
      "Lo stesso promemoria su tutti i club, invocato da Vercel Cron alle 07:00. Idempotente entro sette giorni a prescindere dalla lettura; si autentica con CRON_SECRET",
    mobile_ready: false,
  },
  {
    name: "funding.programs",
    method: "GET|POST",
    path: "/api/v1/funding/programs",
    description:
      "Programmi di contributo: le regole di un bando sono configurazione, non codice",
    mobile_ready: false,
  },
  {
    name: "funding.programs.detail",
    method: "GET|PATCH",
    path: "/api/v1/funding/programs/:id",
    description:
      "Dettaglio e modifica di un programma. Nessun DELETE: un programma con maturati si chiude",
    mobile_ready: false,
  },
  {
    name: "funding.enrollments",
    method: "GET|POST",
    path: "/api/v1/funding/enrollments",
    description:
      "Beneficiari di un contributo. `view=overview` restituisce i cinque importi gia calcolati",
    mobile_ready: false,
  },
  {
    name: "funding.accruals",
    method: "GET|POST",
    path: "/api/v1/funding/accruals",
    description:
      "Maturato per periodo: `recompute` lo ricalcola dalle presenze, `confirm` registra cio che una fonte esterna ha riconosciuto, `import` ne carica un blocco, `report` lo rendiconta all'ente. Una previsione non si rendiconta",
    mobile_ready: false,
  },
  {
    name: "funding.settlements",
    method: "GET|POST",
    path: "/api/v1/funding/settlements",
    description:
      "Liquidazioni dell'ente, riconciliate con i periodi maturati di ciascun atleta",
    mobile_ready: false,
  },
  {
    name: "forms.list",
    method: "GET|POST",
    path: "/api/v1/forms",
    description:
      "Moduli del club: elenco e creazione da un modello di partenza",
    mobile_ready: false,
  },
  {
    name: "forms.detail",
    method: "GET|PATCH|DELETE",
    path: "/api/v1/forms/:id",
    description:
      "Un modulo: bozza, pubblicazione, archiviazione, duplicazione, link pubblico",
    mobile_ready: false,
  },
  {
    name: "forms.submissions",
    method: "GET|POST",
    path: "/api/v1/forms/submissions",
    description:
      "Coda delle compilazioni da esaminare e compilazione dalla segreteria",
    mobile_ready: false,
  },
  {
    name: "forms.submission",
    method: "GET|POST",
    path: "/api/v1/forms/submissions/:id",
    description:
      "Una compilazione: cosa cambierebbe approvandola, possibili duplicati, approvazione o rifiuto",
    mobile_ready: false,
  },
  {
    name: "auth.login",
    method: "POST",
    path: "/api/v1/auth/login",
    description: "Login utente e apertura sessione",
    mobile_ready: true,
  },
  {
    name: "auth.register",
    method: "POST",
    path: "/api/v1/auth/register",
    description: "Registrazione utente con verifica account",
    mobile_ready: true,
  },
  {
    name: "auth.logout",
    method: "POST",
    path: "/api/v1/auth/logout",
    description: "Logout e chiusura sessione",
    mobile_ready: true,
  },
  {
    name: "auth.session",
    method: "GET",
    path: "/api/v1/auth/session",
    description: "Sessione corrente",
    mobile_ready: true,
  },
  {
    name: "auth.user",
    method: "GET|PATCH",
    path: "/api/v1/auth/user",
    description: "Profilo utente autenticato",
    mobile_ready: true,
  },
  {
    name: "auth.memberships",
    method: "GET",
    path: "/api/v1/auth/memberships",
    description: "Elenco club dell'account con ruoli e proprieta",
    mobile_ready: true,
  },
  {
    name: "auth.memberships.activate",
    method: "POST",
    path: "/api/v1/auth/memberships/activate",
    description: "Imposta il club attivo dell'account",
    mobile_ready: true,
  },
  {
    name: "auth.access.redeem",
    method: "POST",
    path: "/api/v1/auth/access/redeem",
    description: "Collega l'account a un club tramite token condiviso",
    mobile_ready: true,
  },
  {
    name: "auth.providers",
    method: "GET",
    path: "/api/v1/auth/providers",
    description: "Provider auth esterni disponibili",
    mobile_ready: true,
  },
  {
    name: "auth.verify.email.send",
    method: "POST",
    path: "/api/v1/auth/verify/email/send",
    description: "Invio codice verifica email",
    mobile_ready: true,
  },
  {
    name: "auth.verify.email.confirm",
    method: "POST",
    path: "/api/v1/auth/verify/email/confirm",
    description: "Conferma verifica email e finalizzazione sessione",
    mobile_ready: true,
  },
  {
    name: "auth.verify.phone.send",
    method: "POST",
    path: "/api/v1/auth/verify/phone/send",
    description: "Invio codice verifica telefono",
    mobile_ready: true,
  },
  {
    name: "auth.verify.phone.confirm",
    method: "POST",
    path: "/api/v1/auth/verify/phone/confirm",
    description: "Conferma verifica telefono e finalizzazione sessione",
    mobile_ready: true,
  },
  {
    name: "auth.password.forgot",
    method: "POST",
    path: "/api/v1/auth/password/forgot",
    description:
      "Richiesta reset password: invia via SMTP un link monouso valido 30 minuti",
    mobile_ready: true,
  },
  {
    name: "auth.password.reset",
    method: "POST",
    path: "/api/v1/auth/password/reset",
    description:
      "Imposta la nuova password dal token di reset e revoca tutte le sessioni",
    mobile_ready: true,
  },
  {
    name: "auth.oauth.start",
    method: "GET",
    path: "/api/v1/auth/oauth/:provider/start",
    description: "Avvio login OAuth web",
    mobile_ready: false,
  },
  {
    name: "auth.oauth.callback",
    method: "GET",
    path: "/api/v1/auth/oauth/:provider/callback",
    description: "Callback OAuth web",
    mobile_ready: false,
  },
  {
    name: "admin.overview",
    method: "GET",
    path: "/api/v1/admin/overview",
    description: "Panoramica di piattaforma: account, club e accessi",
    mobile_ready: false,
  },
  {
    name: "admin.email.get",
    method: "GET",
    path: "/api/v1/admin/email",
    description: "Configurazione SMTP di piattaforma, senza la password",
    mobile_ready: false,
  },
  {
    name: "admin.email.save",
    method: "PUT",
    path: "/api/v1/admin/email",
    description: "Salvataggio configurazione SMTP, password cifrata a riposo",
    mobile_ready: false,
  },
  {
    name: "admin.email.test",
    method: "POST",
    path: "/api/v1/admin/email/test",
    description: "Invio di una email di prova con la configurazione salvata",
    mobile_ready: false,
  },
  {
    name: "admin.imap.get",
    method: "GET",
    path: "/api/v1/admin/imap",
    description: "Configurazione IMAP di piattaforma, senza la password",
    mobile_ready: false,
  },
  {
    name: "admin.imap.save",
    method: "PUT",
    path: "/api/v1/admin/imap",
    description: "Salvataggio configurazione IMAP, password cifrata a riposo",
    mobile_ready: false,
  },
  {
    name: "admin.imap.test",
    method: "POST",
    path: "/api/v1/admin/imap/test",
    description: "Prova di connessione e autenticazione sulla casella IMAP",
    mobile_ready: false,
  },
  {
    name: "seasons.list",
    method: "GET",
    path: "/api/v1/seasons",
    description:
      "Stagioni del club attivo, con quante voci riportabili contiene ciascuna",
    mobile_ready: false,
  },
  {
    name: "seasons.create",
    method: "POST",
    path: "/api/v1/seasons",
    description:
      "Creazione stagione, con l'eventuale riporto dalla stagione scelta",
    mobile_ready: false,
  },
  {
    name: "seasons.status",
    method: "PATCH",
    path: "/api/v1/seasons/:seasonId",
    description: "Attivazione o archiviazione di una stagione",
    mobile_ready: false,
  },
  {
    name: "seasons.rollover",
    method: "POST",
    path: "/api/v1/seasons/:seasonId/rollover",
    description:
      "Riporto della configurazione verso la stagione indicata; `preview` calcola senza scrivere",
    mobile_ready: false,
  },
  ...resourceNames.flatMap((resource) => [
    {
      name: `${resource}.list`,
      method: "GET",
      path: `/api/v1/${resource}`,
      description: `Lista risorsa ${resource}`,
      mobile_ready: true,
    },
    {
      name: `${resource}.create`,
      method: "POST",
      path: `/api/v1/${resource}`,
      description: `Creazione risorsa ${resource}`,
      mobile_ready: true,
    },
    {
      name: `${resource}.detail`,
      method: "GET",
      path: `/api/v1/${resource}/:id`,
      description: `Dettaglio risorsa ${resource}`,
      mobile_ready: true,
    },
    {
      name: `${resource}.update`,
      method: "PATCH",
      path: `/api/v1/${resource}/:id`,
      description: `Aggiornamento risorsa ${resource}`,
      mobile_ready: true,
    },
    {
      name: `${resource}.delete`,
      method: "DELETE",
      path: `/api/v1/${resource}/:id`,
      description: `Eliminazione risorsa ${resource}`,
      mobile_ready: true,
    },
  ]),
];
