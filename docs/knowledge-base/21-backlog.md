# 21 — Backlog master

**Ultimo aggiornamento:** 2026-08-26 (integrazione Web V1: Workstream A, B e C)

Questo documento risponde a una domanda sola: **«quella cosa che avevo chiesto,
a che punto e?»**

E complementare a [20 — Work Package](20-work-packages.md), non un suo
doppione. Il documento 20 e organizzato per **unita di lavoro** — cosa fare, in
che file, con quali criteri di accettazione. Questo e organizzato per
**richiesta ricevuta**, nell'ordine in cui e arrivata, e ogni voce dice quale
WP o quale blocco l'ha chiusa.

## Stati

| Stato | Significato |
|-------|-------------|
| `DONE` | Fatto e verificato dai gate. La colonna «Chiuso da» dice dove |
| `IN PROGRESS` | Cominciato, non finito. C'e sempre una nota su cosa manca |
| `OPEN` | Accettato, non ancora cominciato |
| `DEFERRED` | Sospeso per una decisione esplicita. C'e sempre l'ADR che la contiene |
| `SUPERSEDED` | Superato da una richiesta successiva o da una decisione diversa |

**Regola.** Una voce non passa a `DONE` per somiglianza. Se e stata chiusa a
meta, resta `IN PROGRESS` con scritto cosa manca: una backlog che dichiara
fatto cio che e fatto per meta smette di essere utile alla seconda volta che
succede.

---

## Conteggio

| Stato | Voci |
|-------|------|
| `DONE` | 128 |
| `IN PROGRESS` | 14 |
| `OPEN` | 26 |
| `DEFERRED` | 8 |
| `SUPERSEDED` | 2 |
| **Totale** | **178** |

Il conteggio e verificato da un test
(`tests/ui/backlog-master.test.mjs`): una tabella di riepilogo che non
corrisponde alle righe sotto e peggio di nessuna tabella.

---

## Fase F1 — Fondamenta

| # | Richiesta | Stato | Chiuso da |
|---|-----------|-------|-----------|
| F1-01 | Ripulire il repository dal materiale morto e pubblicare una KB che descriva il codice reale | `DONE` | WP-01 |
| F1-02 | Gate automatici su ogni push e pull request | `DONE` | WP-02 |
| F1-03 | Protezione uniforme delle route: nessuna area management raggiungibile senza sessione e ruolo | `DONE` | WP-03 |
| F1-04 | Poter testare i route handler, a partire dall'isolamento multi-tenant | `DONE` | WP-04 |
| F1-05 | Validare gli input delle API con uno schema | `OPEN` | — (WP-05, pronto) |
| F1-06 | Togliere ORM e scaffold server dal mobile | `DONE` | WP-06 |
| F1-07 | Spostare la logica di dominio dal client al server | `OPEN` | — (WP-07, dipende da WP-04, gia fatto) |
| F1-08 | Rimuovere `.babelrc` e riabilitare SWC | `DONE` | WP-08 |
| F1-09 | Database di sviluppo separato dallo staging | `DONE` | WP-09, ADR-0012 |
| F1-10 | Sincronizzazione transazionale delle risorse club | `DONE` | WP-10 |
| F1-11 | Filtro stagione applicato lato server | `DONE` | WP-11 |
| F1-12 | Paginazione, ordinamento e filtri server-side | `IN PROGRESS` | **Blocco 8** — il server sa impaginare, cercare e ordinare (`?limit=`, `?page=`, `?q=`, `?order_by=`), con `meta` e tetto di 200 righe. **Manca** il consumo nella lista Atleti: raggruppa per categoria, conta per stato ed esporta su tutto l'archivio, quindi paginarla e una scelta di interfaccia |
| F1-13 | Reset password via SMTP | `DONE` | WP-30 |

## Fase F2 — Web V1

### Blocco 1 — Performance, stagioni, pagamenti

| # | Richiesta | Stato | Chiuso da |
|---|-----------|-------|-----------|
| B1-01 | La pagina Atleti di un club reale deve caricare in pochi secondi | `DONE` | WP-31 |
| B1-02 | Stagioni e risorse club coerenti fra loro | `DONE` | WP-32 |
| B1-03 | Correttezza dei calcoli del dominio pagamenti | `DONE` | WP-33 |

### Blocco 2 — Scritture e autosave

| # | Richiesta | Stato | Chiuso da |
|---|-----------|-------|-----------|
| B2-01 | Ridurre il costo delle scritture; autosave che non riscrive tutto | `DONE` | WP-36 |

### Blocco 3 — Identita visiva e responsivita

| # | Richiesta | Stato | Chiuso da |
|---|-----------|-------|-----------|
| B3-01 | Identita visiva coerente: due font, una scala tipografica, token di colore | `DONE` | WP-37 |
| B3-02 | Console di piattaforma separata dalla chrome di club | `DONE` | WP-37 |
| B3-03 | Ogni pagina usabile a 375, 768 e 1280 px | `IN PROGRESS` | WP-34 — **manca**: la verifica su schermo di tutte le pagine. Il Blocco 8 ha corretto 22 griglie che erano a due colonne anche a 375 px e ha aggiunto sette invarianti statiche, ma un test statico non dice se una pagina e leggibile |

### Blocco 4 — Account, onboarding, produttivita

| # | Richiesta | Stato | Chiuso da |
|---|-----------|-------|-----------|
| B4-01 | Home account ridisegnata, con tre stati espliciti | `DONE` | WP-38 |
| B4-02 | Onboarding del club breve e riprendibile | `DONE` | WP-39, ADR-0028 |
| B4-03 | Anagrafica assistita: provincia, regione, CAP validato | `DONE` | WP-40 |
| B4-04 | Anagrafica assistita: calcolo del codice fiscale | `DONE` | WP-40, ADR-0027 |
| B4-05 | Anagrafica assistita: tabella dei comuni e codice catastale automatico | `DONE` | **Blocco 7**, ADR-0032 — era il «resta aperto» di WP-40 |
| B4-06 | Import atleti completo e verificabile | `DONE` | WP-41 |
| B4-07 | Autosave per sezione nella scheda Club | `DONE` | WP-42 |
| B4-08 | Casella IMAP di piattaforma | `DONE` | WP-43, ADR-0029 |

### Blocco 5 — Numerazione, categorie, ordinamento

| # | Richiesta | Stato | Chiuso da |
|---|-----------|-------|-----------|
| B5-01 | Gruppi di numerazione maglie | `DONE` | WP-44 |
| B5-02 | Compatibilita fra categorie configurata, non dedotta | `DONE` | WP-44, ADR-0030 |
| B5-03 | Un solo comparatore per gli elenchi nominali di tutta la Web App | `DONE` | WP-44 |
| B5-04 | Elenchi lunghi chiusi di default | `DONE` | WP-44 |

### Blocco 6 — Stagioni sportive

| # | Richiesta | Stato | Chiuso da |
|---|-----------|-------|-----------|
| B6-01 | Gestione completa delle stagioni: creazione, attivazione, archiviazione | `DONE` | WP-35, ADR-0031 |
| B6-02 | Riporto dei dati fra stagioni, idempotente e con anteprima | `DONE` | WP-35 |
| B6-03 | Topbar del club: comandi ripristinati e regole grafiche definitive | `DONE` | WP-45 |

### Blocco 7 — Anagrafiche, staff, allegati, coerenza UI (2026-08-25)

| # | Richiesta | Stato | Chiuso da |
|---|-----------|-------|-----------|
| B7-01 | Badge stagione grigio, non giallo | `DONE` | Blocco 7 |
| B7-02 | Togliere il logo EasyGame dalla topbar club | `DONE` | Blocco 7 |
| B7-03 | Logo club grande senza cornice, nome evidente, stagione non invasiva | `DONE` | Gia soddisfatto da WP-45, verificato |
| B7-04 | Codice fiscale subito dopo il blocco anagrafico | `DONE` | Blocco 7 |
| B7-05 | Archivio ufficiale dei comuni italiani con codice catastale | `DONE` | Blocco 7, ADR-0032 |
| B7-06 | Ricerca assistita comune e recupero automatico del codice catastale | `DONE` | Blocco 7 |
| B7-07 | Ricerca assistita per **CAP** | `OPEN` | ADR-0035 — verificato nel Blocco 8: nel repository **non esiste** una fonte del CAP, e ISTAT non lo pubblica. L'ADR dice quali cinque proprieta deve avere la fonte che la chiude, e perche Poste Italiane non basta (licenza). Non si inventa un mapping |
| B7-08 | Calcolo CF disponibile su atleta, genitore, socio, allenatore, staff | `DONE` | Blocco 7 |
| B7-09 | Non sovrascrivere un CF inserito a mano senza conferma | `DONE` | Blocco 7 — conferma in due tempi |
| B7-10 | Validazione anagrafica client **e** server | `DONE` | Blocco 7 — estesa a allenatori, staff e soci |
| B7-11 | Reparti staff: una sola fonte dati, persistenza, disponibilita immediata | `DONE` | Blocco 7 |
| B7-12 | Ruoli staff predefiniti: Dirigente, Presidente, Vicepresidente | `DONE` | Blocco 7 |
| B7-13 | Audit scheda Allenatore: togliere «Ruolo» dai dati societari | `DONE` | Blocco 7 |
| B7-14 | Audit scheda Allenatore: data di inizio modificabile e persistente | `DONE` | Blocco 7 |
| B7-15 | Numero tessera non obbligatorio per atleta e allenatore | `DONE` | Blocco 7 |
| B7-16 | Correggere «Id club non trovato» all'aggiunta di un contratto | `DONE` | Blocco 7 |
| B7-17 | Modifica allenamento: selezione multipla dove la creazione la permette | `DONE` | Blocco 7 |
| B7-18 | Visite mediche allenatore: aggiungi, modifica, elimina, scadenza, tipologia, allegato | `DONE` | Blocco 7 |
| B7-19 | Chiarire o rimuovere il campo «Tipologia» della visita | `DONE` | Blocco 7 — chiarito: agonistica / non agonistica |
| B7-20 | BLSD e attestati: caricabili, visualizzabili, scaricabili, sostituibili, eliminabili | `DONE` | Blocco 7 |
| B7-21 | Audit trasversale di tutti gli allegati Web | `DONE` | Blocco 7 — causa radice unica: `window.open` su data URL |
| B7-22 | Nessun pulsante «Visualizza» non funzionante | `DONE` | Blocco 7 — quattro test lo impediscono |
| B7-23 | Naming leggibile dei download, centralizzato | `DONE` | Blocco 7 |
| B7-24 | Tipo socio nel modulo «Nuovo socio» | `DONE` | Blocco 7 |
| B7-25 | Componente telefono internazionale condiviso | `DONE` | Blocco 7 |
| B7-26 | Applicare il campo telefono a tutte le anagrafiche pertinenti | `DONE` | **Blocco 8** — schede di dettaglio (atleta, genitore/tutore, allenatore, staff, socio) e scheda Club. Un test elenca le nove superfici |
| B7-27 | Regola condivisa di capitalizzazione dei campi anagrafici | `DONE` | Blocco 7 |
| B7-28 | Applicare la capitalizzazione a tutte le anagrafiche | `DONE` | **Blocco 8** — stesse nove superfici di B7-26. La regola e stata anche corretta: applicata ai comuni ne peggiorava 30 su 7.896 |
| B7-29 | Taglie vestiario per allenatori, staff e soci | `DONE` | Blocco 7 |
| B7-30 | Export coerente per allenatori, staff e soci | `DONE` | Blocco 7 |
| B7-31 | «Nuovo atleta» deve raccogliere tutto cio che si sa gia | `DONE` | Blocco 7 |
| B7-32 | Foundation per la lettura documenti | `DONE` | Blocco 7 |
| B7-33 | Migrare la scheda atleta sul contratto di lettura documenti | `IN PROGRESS` | **Blocco 8** — il contratto e ora usato dal genitore/tutore dentro la scheda atleta. **Manca** lo scanner con fotocamera della scheda, che ha ancora un flusso proprio |
| B7-34 | Lettura documenti da PDF | `OPEN` | Blocco 8 — resta aperta **per scelta**: rasterizzare richiede `pdfjs-dist`, circa un megabyte su ogni sessione. Il contratto del motore ora dichiara cosa sa leggere e un PDF viene rifiutato **con una spiegazione**, non accettato per poi fallire |
| B7-35 | Ordinamento cronologico di tutte le liste di pagamenti | `DONE` | Blocco 7 |
| B7-36 | Rimuovere il PIN Club dopo dependency audit | `DONE` | Blocco 7, ADR-0033 |
| B7-37 | Backlog master nella KB | `DONE` | Questo documento |

---

### Blocco 8 — Anagrafiche, documenti, storage e performance (2026-08-25)

| # | Richiesta | Stato | Chiuso da |
|---|-----------|-------|-----------|
| B8-01 | Telefono internazionale in **tutte** le anagrafiche, creazione e modifica | `DONE` | Blocco 8 — nove superfici, elencate in `tests/ui/anagrafiche-coverage.test.mjs` |
| B8-02 | Capitalizzazione in tutte le anagrafiche, creazione e modifica | `DONE` | Blocco 8 — stesse nove superfici |
| B8-03 | La capitalizzazione non deve rovinare i nomi ufficiali | `DONE` | Blocco 8 — ne cambiava 30 su 7.896 comuni ISTAT. Ora non tocca un valore che ha gia una maiuscola dentro; verificato sull'intero dataset a ogni esecuzione |
| B8-04 | Codice fiscale assistito e ricerca del comune ovunque si chieda un CF | `DONE` | Blocco 8 — aggiunto alle schede di allenatore e staff, che erano gli ultimi posti in cui si digitava a mano |
| B8-05 | Il sesso deve essere una scelta, non testo libero | `DONE` | Blocco 8 — su allenatore e staff ci finiva «M», «maschio», «Maschile»: con tre grafie il CF non si calcolava |
| B8-06 | CAP → comune | `OPEN` | ADR-0035 — la fonte non esiste nel repository e ISTAT non la pubblica. L'ADR elenca le cinque proprieta che deve avere |
| B8-07 | «Nuovo atleta» al livello delle schede staff e allenatore | `DONE` | Blocco 8 — aggiunte le sezioni genitori/tutori, tesseramento e categorie secondarie. Obbligatori sempre tre |
| B8-08 | Servizio allegati unico, provider-agnostico | `DONE` | Blocco 8, ADR-0034 — `attachments` + `attachment_blobs`, driver di storage, autorizzazione, limite di 10 MB, elenco chiuso di tipi |
| B8-09 | I file binari fuori dai record JSON | `DONE` | Blocco 8 — il record conserva `attachment:<uuid>` |
| B8-10 | Gli allegati legacy devono continuare a funzionare | `DONE` | Blocco 8 — `resolveAttachmentSource` classifica le due forme; migrazione incrementale, mai di massa |
| B8-11 | Audit di tutti i punti che caricano un file | `DONE` | Blocco 8 — convertiti documenti, documenti d'identita e d'iscrizione, visite mediche, tesseramenti e contratti allenatore. Cinque test statici impediscono di aggirare la regola |
| B8-12 | Nomi dei download standardizzati | `DONE` | Gia del Blocco 7; il Blocco 8 aggiunge che **l'estensione la mette il server**, che e l'unico a conoscere il tipo del file |
| B8-13 | Scelta di un provider di storage esterno | `OPEN` | ADR-0034 — opzioni, costi e raccomandazione sono scritti. **E una decisione del proprietario del prodotto**, non di chi scrive il codice |
| B8-14 | Ricondurre anche `assets` al servizio allegati | `OPEN` | Logo club e moduli online usano ancora la via legacy. Il file non e nel record, quindi non e il difetto strutturale: e una seconda implementazione da unificare |
| B8-15 | Parser nome/cognome dei documenti, definitivo | `DONE` | Blocco 8 — elenco di parole-etichetta invece di casi particolari, piu lettura della MRZ. 16 casi di regressione, ognuno un layout reale |
| B8-16 | Lettura documenti su genitore/tutore | `DONE` | Blocco 8 |
| B8-17 | Formati supportati dichiarati, non scoperti | `DONE` | Blocco 8 — JPG, PNG, WEBP, HEIC fino a 8 MB; PDF rifiutato con una spiegazione, prima di scaricare il worker OCR |
| B8-18 | Scomporre la scheda atleta | `IN PROGRESS` | WP-19 — **manca** l'estrazione dei sette pannelli, che richiede prima di raggruppare lo stato in hook |
| B8-19 | Rimisurare la lista Atleti dopo l'estrazione degli allegati | `DONE` | Blocco 8 — `scripts/measure-athletes-payload.mjs`: la misura si rifa, non si ricopia |
| B8-20 | La prossima ottimizzazione strutturale | `DONE` | Blocco 8 — la misura ha indicato gli **avatar**: 23,7 MB su 200 atleti. Serviti come immagini, la risposta scende a 140 kB (-99,4%) |
| B8-21 | Paginazione, ricerca e filtri server-side | `IN PROGRESS` | **Manca** il consumo nella lista Atleti: vedi F1-12 |
| B8-22 | Griglie a due colonne su schermi da 375 px | `DONE` | Blocco 8 — 22 griglie corrette, sette invarianti a difenderle |
| B8-23 | Verifica su schermo a 375, 768 e 1280 px | `OPEN` | **Non eseguita**: richiede una sessione autenticata su un database, e in questa working copy il database di sviluppo non e avviato. Le invarianti statiche non la sostituiscono |

### Workstream A — Pagamenti V2: rate, incassi e documenti fiscali (2026-08-26)

Chiuso da **WP-47**, [ADR-0036](18-decision-log.md#adr-0036--una-rata-e-un-debito-un-incasso-e-un-movimento-due-tabelle-non-una).
Una causa radice sola: `payments` portava il debito **e** il modo in cui era
stato pagato negli stessi campi.

| # | Richiesta | Stato | Chiuso da |
|---|-----------|-------|-----------|
| A1-01 | La segreteria non deve piu spostare a mano «In attesa» → «Pagata» | `DONE` | WP-47 — l'azione principale e «Registra pagamento»; lo stato e derivato e non ha piu un campo che lo imposti, ne nella modifica rata ne nell'aggiunta di una voce |
| A1-02 | Dialog «Registra pagamento» con importo, metodo, data, note e riepilogo | `DONE` | WP-47 — `RegisterPaymentDialog`. Il riepilogo mostra dovuto, gia incassato, questo pagamento e residuo dopo |
| A1-03 | Importo precompilato con il residuo, ma modificabile | `DONE` | WP-47 — il caso comune e il saldo; l'acconto si ottiene cambiando un campo gia a fuoco |
| A1-04 | Una rata deve accettare N incassi, anche con metodi diversi | `DONE` | WP-47 — `payment_transactions`. 50 contanti + 30 POS + 50 bonifico saldano una rata da 130 |
| A1-05 | Stati derivati: in attesa, parzialmente pagata, pagata, scaduta | `DONE` | WP-47 — calcolati da dovuto e incassato. Una rata scaduta e ancora scoperta mostra **entrambe** le etichette |
| A1-06 | Lo stato non deve essere un dato primario modificabile | `DONE` | WP-47 — `payments.status` resta come cache scritta **solo** dal server. Il residuo di modello e in [16 — D29](16-technical-debt.md) |
| A1-07 | Una rata mostra dovuto, pagato, residuo, scadenza, stato e progress bar | `DONE` | WP-47 — `InstallmentLedgerList`: «50,00 EUR / 130,00 EUR pagati», «Residuo 80,00 EUR», barra e badge |
| A1-08 | Il dettaglio di una rata elenca Data, Importo, Metodo, Note | `DONE` | WP-47 — si apre sulla riga, in ordine cronologico crescente |
| A1-09 | Contratto unico del modello Payment | `DONE` | WP-47 — id, athleteId, installmentId, amount, paidAt, paymentMethod, notes, source, createdBy, createdAt, externalReference, storno |
| A1-10 | `source` predisposto per MANUAL, STRIPE, CEDIPAY, IMPORT, OTHER | `DONE` | WP-47 — il modello li accetta, il servizio rifiuta tutto cio che non e `MANUAL`: Stripe e CediPay **non** sono implementati (WP-13) |
| A1-11 | Correzione, annullamento, reversal e audit di un incasso | `DONE` | WP-47 — lo storno marca l'originale e crea il movimento opposto. Nessun `DELETE`. Ogni operazione nell'audit log |
| A1-12 | Metodi di pagamento senza testo libero, con compatibilita legacy | `DONE` | WP-47 — si sceglie fra i metodi del club (`getClubPaymentMethodChoices`); il metodo gia salvato resta selezionabile anche se il club l'ha rimosso |
| A1-13 | Un solo flusso UI fra scheda atleta e area Pagamenti | `DONE` | WP-47 — `AthletePaymentLedger` montato in entrambe. Un test statico impedisce che ne nasca una seconda |
| A1-14 | Un pagamento aggiorna subito rata, piano, riepilogo, totale e residuo | `DONE` | WP-47 — il server risponde con la rata riscritta; nessun refresh manuale |
| A1-15 | Audit di regressione su servizi opzionali, pro-rata, totali e stato | `DONE` | WP-47 — trovato e corretto un difetto vero: i totali dell'atleta sommavano **per stato**, quindi un acconto valeva zero |
| A1-16 | Separare Payment, Receipt e Invoice; generare la ricevuta da un incasso | `DONE` | WP-47 — `receipts.transaction_id`, emissione idempotente. La fattura resta un oggetto distinto e non e stata toccata |
| A1-17 | Cronologie coerenti, con direzione documentata | `DONE` | WP-47 — incassi di una rata e rate di un atleta in ordine **crescente**; la tabella completa e in [10](10-ui-ux-conventions.md) |
| A1-18 | Registrare un pagamento da smartphone deve essere semplice | `IN PROGRESS` | WP-47 — verificato staticamente a 375 px (una colonna, pulsanti a piena larghezza, finestra che scorre, tabella che scorre nel proprio contenitore). **Manca** la verifica su schermo, che richiede una sessione autenticata su un database: vedi R-01 |
| A1-19 | Contabilita fiscale completa | `DEFERRED` | WP-47 — dichiarata fuori scope dalla richiesta stessa. Si emette e si numera la ricevuta; nessun registro IVA |
| A1-20 | Checkout online reale (Stripe / CediPay) | `DEFERRED` | WP-13, ADR-0013 — il modello e pronto, il canale no. Il webhook non va attivato prima della verifica di firma ([14](14-security.md), rischio 6) |

### Workstream A — Voucher e contributi legati alla frequenza (2026-08-26)

Chiuso da **WP-48**, [ADR-0037](18-decision-log.md#adr-0037--un-contributo-non-e-un-pagamento-due-contabilita-separate-e-le-regole-del-bando-sono-dati).
Caso reale di riferimento: Voucher per lo Sport, Regione Lazio / Sport e Salute
2025 — **configurato come dati, mai come codice**.

| # | Richiesta | Stato | Chiuso da |
|---|-----------|-------|-----------|
| A2-01 | Un voucher assegnato non deve equivalere a un pagamento incassato | `DONE` | WP-48 — cinque importi distinti: assegnato, maturato, rendicontato, liquidato, residuo. Solo il liquidato e cassa |
| A2-02 | Separare valore/plafond, maturato, rendicontato, liquidato e residuo | `DONE` | WP-48 — il liquidato si legge dalle **righe di liquidazione**, non dallo stato del periodo: con versamenti parziali i due numeri differiscono |
| A2-03 | Programma configurabile: nome, ente, validita, plafond, importo e frequenza del periodo | `DONE` | WP-48 — colonne di `funding_programs`, non rami nel calcolo |
| A2-04 | Requisito minimo e unita del requisito (ore, presenze) configurabili | `DONE` | WP-48 — `hours` e `sessions` sono un elenco dichiarato ed estendibile |
| A2-05 | Comportamento configurabile se il requisito non e raggiunto | `DONE` | WP-48 — `none` (soglia secca, il caso di riferimento), `prorata`, `full` |
| A2-06 | Limite massimo ed eventuale codice voucher individuale | `DONE` | WP-48 — tetto ai periodi, tetto all'importo del programma, `voucher_code` sul beneficiario |
| A2-07 | Stato del programma | `DONE` | WP-48 — `draft`, `active`, `closed`. Un programma con maturati non si cancella: si chiude |
| A2-08 | Collegare il programma al sistema presenze e calcolare tutto automaticamente | `DONE` | WP-48 — ore o presenze valide, requisito, raggiunto si/no, maturato, non maturato e stato per ogni periodo. Nessun numero digitato |
| A2-09 | La segreteria non deve fare calcoli manuali | `DONE` | WP-48 — il ricalcolo e idempotente e si rifa a ogni correzione di appello. L'interfaccia non offre da nessuna parte di digitare un maturato |
| A2-10 | Scheda atleta: voucher assegnato, maturato, liquidato, da liquidare, residuo | `DONE` | WP-48 — piu il dettaglio periodo per periodo con il **motivo** di ogni importo |
| A2-11 | Non trattare il contributo come pagamento della famiglia | `DONE` | WP-48 — il servizio dei contributi non importa `payment_transactions`, e il dominio dei pagamenti non conosce i contributi. Due test statici lo difendono |
| A2-12 | Il Riepilogo Incassi deve distinguere incassato da soltanto maturato | `DONE` | WP-48 — il riquadro degli incassi dichiara «Pagamenti della famiglia»; i contributi hanno un riquadro proprio |
| A2-13 | Registrare una liquidazione dell'ente e riconciliarla con periodi e atleti | `DONE` | WP-48 — ripartizione obbligatoria, non si liquida piu di quanto e maturato, una liquidazione parziale lascia il periodo fra i crediti |
| A2-14 | Scenario di regressione equivalente al Voucher Lazio 2025 | `DONE` | WP-48 — plafond 500, mensilita 60, soglia 8 ore, maturazione solo alla soglia, pagamento dell'ente successivo. **Nessuna di queste costanti e in `src/`**, e un test lo verifica |
| A2-15 | Convivenza con rate, pagamenti parziali, «Registra pagamento», ricevute, pro-rata e servizi opzionali | `DONE` | WP-48 — i due domini non si importano a vicenda; `npm test` copre entrambi |
| A2-16 | Contratti chiari per programma, beneficiario, periodo, maturato e liquidazione | `DONE` | WP-48 — `FundingProgram`, `FundingEnrollment`, `FundingAccrual`, `FundingSettlement`, `FundingSettlementLine`. Il **periodo non e una tabella**: si ricava dalla configurazione e viene congelato dentro il maturato |
| A2-17 | Audit, autorizzazioni e multi-tenant sui contributi | `DONE` | WP-48 — `canManageClubConfiguration` su ogni scrittura, audit log, e 27 test che provano ogni operazione dal club sbagliato |
| A2-18 | Verifica su schermo dei pannelli contributi a 375, 768 e 1280 px | `IN PROGRESS` | WP-48 — verificato staticamente (i cinque importi in colonna, tabella dei periodi che scorre nel proprio contenitore, finestra di configurazione scorrevole). **Manca** la verifica su schermo: vedi R-01 |
| A2-19 | Compensazione automatica del contributo sulla rata della famiglia | `OPEN` | ADR-0037 — **scelta consapevole**: quale parte della quota il voucher copre lo decide il club, non l'importo maturato. Compensare in automatico farebbe risultare saldate rate che nessuno ha pagato |
| A2-20 | Trasmissione telematica delle rendicontazioni all'ente | `OPEN` | ADR-0037 — `reported` e una marcatura interna; il canale verso il finanziatore cambia da bando a bando e non si puo implementare a memoria |

---

## Remaining Web V1 before release

Cio che manca perche la Web V1 si possa dichiarare rilasciabile. E la base del
prossimo blocco, e non contiene niente delle proposte grandi piu sotto: quelle
vengono **dopo** il rilascio.

| # | Cosa manca | Perche blocca | Dove |
|---|-----------|---------------|------|
| R-01 | Verifica su schermo di tutte le pagine a 375, 768 e 1280 px | E il criterio di uscita dichiarato da ADR-0025. Oggi e verificato staticamente, e su schermo solo pagina per pagina | B3-03, B8-23 |
| R-02 | La lista Atleti deve consumare la paginazione | Il server e pronto; finche la pagina scarica tutto, l'archivio grande resta il caso peggiore | F1-12, B8-21 |
| R-03 | Decisione sul provider di storage | Non blocca il funzionamento, blocca la crescita: oggi i file stanno nel database di Neon | B8-13, ADR-0034 |
| R-04 | Validazione input con uno schema (`zod`) | Oggi gli endpoint coercizzano a mano. E il presupposto di WP-12 e di ogni API pubblica | F1-05, WP-05 |
| R-05 | Pagamenti online: implementarli o togliere la promessa | Gli endpoint rispondono 501. Una funzione che l'interfaccia offre e il server rifiuta non e rilasciabile. **Il ciclo manuale non e piu un ostacolo**: dal Workstream A si incassa, si incassa a rate, si storna e si emette ricevuta senza nessun provider (WP-47) | F3-01, ADR-0013 |
| R-06 | Unificare i due sistemi di toast | Due sistemi montati insieme: due comportamenti per lo stesso avviso | F3-02, WP-14 |
| R-07 | Completare l'audit log sulle anagrafiche | ADR-0019 lo dichiara bloccante per la produzione | F3-04 |
| R-08 | Scheduler dei promemoria certificati | Un certificato scaduto e un atleta che non puo scendere in campo, e oggi nessuno avvisa | F3-09 |
| R-09 | Rimuovere i residui legacy classificati | 19 componenti `ui/*` non usati, e due route di modifica orfane — una costruita su dati inventati (vedi D27 in [16](16-technical-debt.md)) | F3-06, WP-18 |
| R-10 | Ambiente di produzione, error tracking, backup provati, UAT | E la fase F5 per intero: senza, «rilasciato» non ha un significato operativo | F5-01, F5-02, F5-03, F5-04 |
| R-11 | Voucher e contributi: verifica su schermo e primo bando reale caricato | Il modello e i calcoli sono coperti dai test, ma un contributo pubblico si rendiconta a un ente: il primo caricamento va fatto con un bando vero e riconciliato a mano una volta | A2-18, WP-48 |
| R-12 | Le scritture dell'abbigliamento devono passare da `resources.ts` | `/api/clothing/assignments` scrive `clubs.<json>` con Prisma: `club_resource_items` resta indietro e il disallineamento e silenzioso | D32 in [16](16-technical-debt.md), WP-49 |

---

## Fase F3 — Completamento funzionale

| # | Richiesta | Stato | Note |
|---|-----------|-------|------|
| F3-01 | Pagamenti online reali | `OPEN` | WP-13. Oggi gli endpoint rispondono 501: la promessa **non** e dichiarata completa da nessuna parte |
| F3-02 | Unificare i sistemi di toast | `OPEN` | WP-14. Ne convivono due |
| F3-03 | Spostare i file fuori dai record | `IN PROGRESS` | **Blocco 8**, ADR-0034 — un allegato e ora una riga di `attachments` e il record ne conserva solo il riferimento. **Mancano**: la tabella `assets` (logo club, moduli online) e la scelta di un provider esterno, che e una decisione del proprietario del prodotto (opzioni e raccomandazione nell'ADR) |
| F3-04 | Audit log | `IN PROGRESS` | WP-16, ADR-0019. Copre auth, risorse economiche, stagioni e **tutti** i dinieghi. Manca la copertura delle anagrafiche |
| F3-05 | Ridurre l'adapter `supabase.ts` | `OPEN` | WP-17, dipende da WP-07 |
| F3-06 | Rimuovere i residui legacy | `IN PROGRESS` | WP-18. Il Blocco 7 ne ha tolti tre (`page-modals.tsx`, `TrainerPayments.tsx`, `pin-input.tsx`). **Mancano** i 19 componenti `ui/*` non usati e gli alias di compatibilita |
| F3-07 | Scomporre le pagine monolitiche | `IN PROGRESS` | WP-19. **Blocco 8**: `athletes/[id]/page.tsx` da 8.696 a 8.480 righe pur aggiungendo funzioni, con genitori, campi dei form, sezioni, intestazione e barra estratti, e un test che impedisce di risalire sopra 8.500. **Mancano** i sette pannelli e i circa novanta `useState`, piu `clothing/page.tsx` e `registration-management/page.tsx` |
| F3-08 | Deprecare gli alias di compatibilita | `DEFERRED` | WP-20, dipende da WP-21 che e differito |
| F3-09 | Scheduler per promemoria certificati | `OPEN` | Nessun WP ancora |
| F3-10 | Automazione allenamenti | `OPEN` | Nessun WP ancora |

## Fase F4 — Mobile — **DIFFERITA**

Tutte le voci sono `DEFERRED` per
[ADR-0025](18-decision-log.md#adr-0025--mobile-app-differita-la-priorita-e-easygame-web-v1-responsive).
Non sono cancellate: riprendono quando Web V1 e completa.

| # | Richiesta | Stato | Note |
|---|-----------|-------|------|
| F4-01 | Consolidare il layer dati mobile | `DEFERRED` | WP-21 |
| F4-02 | Rimuovere le schermate mobile v1 | `DEFERRED` | WP-22 |
| F4-03 | Allineare le funzionalita trainer mobile al Web | `DEFERRED` | WP-23 |
| F4-04 | Test per il mobile | `DEFERRED` | WP-24 |
| F4-05 | Build distribuibile (EAS) | `DEFERRED` | WP-25 |

## Fase F5 — Production readiness

| # | Richiesta | Stato | Note |
|---|-----------|-------|------|
| F5-01 | Attivare l'ambiente di produzione | `OPEN` | WP-26, dopo la UAT |
| F5-02 | Error tracking e logging | `OPEN` | WP-27, dipende da WP-26 |
| F5-03 | Backup e restore provati | `OPEN` | WP-28, dipende da WP-26 |
| F5-04 | UAT strutturato | `OPEN` | WP-29, dipende da WP-26 |

### Workstream B — multi-sede, categorie, abbigliamento, kit e consegne (2026-08-26)

| # | Richiesta | Stato | Nota |
|---|-----------|-------|------|
| WB-01 | Stessa categoria in sedi diverse, senza duplicarla | `DONE` | ADR-0038: categoria, sede, struttura e gruppo operativo sono quattro concetti. «Pulcini · Roma» e un gruppo, non una categoria |
| WB-02 | UX semplice per il club mono-sede | `DONE` | `SiteFilter` non si monta con meno di due sedi attive: la decisione sta nel componente, non nelle pagine |
| WB-03 | Filtro sede su categorie, atleti, strutture, gruppi | `DONE` | Sede vuota = «non dichiarata»: nessun dato storico esce dagli elenchi |
| WB-04 | Compatibilita categorie invariata con piu sedi | `DONE` | Esplicita, orientata, non transitiva: la sede non cambia la regola, e un test lo verifica |
| WB-05 | Kit con stati indipendenti per articolo | `DONE` | Quattro stati: da preparare, pronto, consegnato, non disponibile |
| WB-06 | La taglia dell'anagrafica arriva sull'assegnazione | `DONE` | Era il difetto: la taglia si mostrava e non si usava. L'override non scrive l'anagrafica |
| WB-07 | Consegne parziali con stato derivato | `DONE` | «Parziale · 2/4 consegnati · 1 non disponibile». Lo stato del kit non si scrive |
| WB-08 | Niente stagione sul kit | `DONE` | `clothing_kits` non e un tipo stagionale: il campo sembrava un filtro e non filtrava |
| WB-09 | Numerazione per sede senza regressioni | `DONE` | `siteIds` sul gruppo; vuoto = tutte le sedi, cioe ogni gruppo esistente |
| WB-10 | Performance con 200+ atleti e piu sedi | `DONE` | Rapporto sotto 3x raddoppiando gli atleti; `scripts/measure-multisite-performance.mjs` stampa i tempi |
| WB-11 | Filtro sede sugli allenamenti | `DONE` | La sede viene dalla struttura, non da un campo proprio: un secondo campo si disallineerebbe al primo allenamento in trasferta |
| WB-12 | Consegne usabili da smartphone | `IN PROGRESS` | Il dialogo consegne e a schede impilate e le invarianti statiche sono verdi. **Manca** la verifica su schermo: il database di sviluppo non e in esecuzione in questo ambiente (vedi B3-03) |

---

## Proposte grandi, ancora future

Non sono state dimenticate e non sono state ridotte a righe di un altro
elenco. Nessuna e cominciata; ognuna vale un blocco o piu.

| # | Proposta | Stato | Perche non ora |
|---|----------|-------|----------------|
| P-01 | **Multi-sede per le categorie** | `DONE` | **Workstream B** — WP-49, [ADR-0038](18-decision-log.md). La categoria non si duplica: sede, struttura e gruppo operativo sono concetti separati. Filtro sede su Categorie, Atleti, Strutture e gruppi numerazione; il club mono-sede non vede il concetto |
| P-02 | **Abbigliamento e consegne V2** | `IN PROGRESS` | **Workstream B** — WP-49: ciclo di consegna per articolo con stato del kit derivato, taglia proposta dall'anagrafica con override. **Manca** la riconciliazione con gli ordini fornitore, che resta un flusso a se |
| P-03 | **Modulistica V2** | `OPEN` | Oggi i modelli generano documenti di stampa. Serve un modello di documento con campi, versioni e firme |
| P-04 | **Moduli online** | `OPEN` | Esistono e raccolgono risposte. Mancano validazione condizionale, pagamento contestuale e collegamento all'anagrafica |
| P-05 | **Scanner documenti** | `IN PROGRESS` | La foundation e del Blocco 7 (ADR e KB). Restano: PDF, provider remoto, migrazione della scheda atleta. Vedi B7-32/33/34 |
| P-06 | **Stripe / CediPay** | `OPEN` | WP-13. Il webhook **non va attivato** prima della verifica di firma (vedi [14](14-security.md), rischio 6) |
| P-07 | **SaaS ed entitlements** | `OPEN` | Presuppone un ambiente di produzione vero (F5-01) e un modello di abbonamento che oggi non esiste |
| P-08 | **Bonus Sport e Salute** | `OPEN` | **Il modello c'e** dal Workstream A (WP-48, ADR-0037): un bando si descrive con la configurazione, e il Voucher Lazio 2025 e gia coperto come scenario. Resta aperta la parte che **non si puo implementare a memoria**: la fonte dati esterna, le regole annuali del bando e il canale di trasmissione delle rendicontazioni, che cambia da ente a ente |
| P-09 | **AI per gli allenamenti** | `OPEN` | Nessun requisito scritto. Va definito cosa deve produrre prima di scegliere come |
| P-10 | **OAuth Google e Microsoft** | `OPEN` | L'infrastruttura OAuth esiste (`/api/v1/auth/oauth/:provider`). Mancano le credenziali applicative e la decisione su quali domini ammettere |

---

## Voci superate

| # | Richiesta originale | Stato | Cosa l'ha superata |
|---|--------------------|-------|--------------------|
| S-01 | «Il PIN di club deve proteggere le operazioni sensibili» | `SUPERSEDED` | ADR-0033: non proteggeva niente. Sostituito da un controllo di ruolo vero |
| S-02 | «Il codice catastale lo inserisce l'operatore una volta sola» | `SUPERSEDED` | ADR-0032: la tabella ufficiale e arrivata, il codice si cerca |
