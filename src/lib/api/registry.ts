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
