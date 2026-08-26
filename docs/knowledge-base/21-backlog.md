# 21 — Backlog master

**Ultimo aggiornamento:** 2026-08-26 (Blocco Finale B: sede nei moduli, numerazione documenti, CediPay)

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

> **Per sapere se si puo rilasciare** c'e un documento a parte:
> [22 — Matrice Release Candidate](22-release-candidate.md). Questo dice a che
> punto e una richiesta; quello dice che cosa impedisce il rilascio.

## Conteggio

| Stato | Voci |
|-------|------|
| `DONE` | 215 |
| `IN PROGRESS` | 11 |
| `OPEN` | 22 |
| `DEFERRED` | 8 |
| `SUPERSEDED` | 2 |
| **Totale** | **258** |

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
| F1-05 | Validare gli input delle API con uno schema | `DONE` | **Blocco Finale C** — `src/lib/validation/` con `zod`: autenticazione, incassi, stagioni, piano commerciale, contributi. Il CRUD generico resta fuori **per scelta**: cinquanta risorse con forme aperte, che uno schema chiuso rifiuterebbe a raffica |
| F1-06 | Togliere ORM e scaffold server dal mobile | `DONE` | WP-06 |
| F1-07 | Spostare la logica di dominio dal client al server | `OPEN` | — (WP-07, dipende da WP-04, gia fatto) |
| F1-08 | Rimuovere `.babelrc` e riabilitare SWC | `DONE` | WP-08 |
| F1-09 | Database di sviluppo separato dallo staging | `DONE` | WP-09, ADR-0012 |
| F1-10 | Sincronizzazione transazionale delle risorse club | `DONE` | WP-10 |
| F1-11 | Filtro stagione applicato lato server | `DONE` | WP-11 |
| F1-12 | Paginazione, ordinamento e filtri server-side | `DONE` | **Blocco 8** per il server (`?limit=`, `?page=`, `?q=`, `?order_by=`, `meta`, tetto di 200 righe); **Blocco Finale C** per il consumo nella lista Atleti. La scelta di interfaccia e stata: sotto una pagina tutto resta come prima, sopra i filtri vanno al server e compare la barra delle pagine. Aggiunti `category_id` e `site_id`, senza i quali una pagina non sarebbe stata una pagina |
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
| B3-03 | Ogni pagina usabile a 375, 768 e 1280 px | `DONE` | **Blocco Finale C** — verifica su schermo eseguita su diciotto pagine a 375, 768 e 1280 px, con sessione autenticata sul database di sviluppo, misurando per ogni elemento se esce dal riquadro e se qualcuno lo taglia. **Sette difetti trovati e corretti**, tutti invisibili alle invarianti statiche. Resta fuori solo la console di piattaforma, che richiede un account amministratore assente dal seed di sviluppo |

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
| B7-07 | Ricerca assistita per **CAP** | `DONE` | **Blocco A**, ADR-0042 — la fonte mancante era IPA (AgID, CC BY 4.0, giornaliera). Il comune scelto porta con se il CAP dove ne ha uno solo: 7.836 comuni su 7.896. Per i 52 con piu CAP il form lo dice e non compila. La direzione **CAP → comune** resta aperta: vedi B8-06 |
| B7-08 | Calcolo CF disponibile su atleta, genitore, socio, allenatore, staff | `DONE` | Blocco 7 per i moduli di creazione; **completata dal Blocco A** — la scheda socio era l'ultima superficie senza. Vedi BA-15 |
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
| B7-29 | Taglie vestiario per allenatori, staff e soci | `DONE` | Blocco 7 per la raccolta; **riaperta e chiusa dal Blocco A** — erano di sola scrittura: nessuna delle tre schede di dettaglio le mostrava. Vedi BA-18 |
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
| B8-06 | CAP → comune | `OPEN` | **Blocco A**, ADR-0042 — la fonte c'e ora (IPA) e chiude la direzione comune → CAP (B7-07). La direzione opposta resta aperta **per scelta**: con i soli CAP univoci si risolverebbe il paese e non la citta, cioe si sbaglierebbe proprio dove una segreteria la userebbe di piu |
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
| B8-21 | Paginazione, ricerca e filtri server-side | `DONE` | Consumata dalla lista Atleti nel **Blocco Finale C**: vedi F1-12 |
| B8-22 | Griglie a due colonne su schermi da 375 px | `DONE` | Blocco 8 — 22 griglie corrette, sette invarianti a difenderle |
| B8-23 | Verifica su schermo a 375, 768 e 1280 px | `DONE` | **Blocco A** — eseguita con migrazioni e seed applicati in locale e una sessione autenticata, su quattordici pagine dei domini del blocco. Ha trovato tre difetti invisibili alle invarianti statiche, fra cui un guscio di club che cresceva con il contenuto invece di lasciarlo scorrere. Vedi BA-31 |

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
| A1-18 | Registrare un pagamento da smartphone deve essere semplice | `DONE` | **Blocco Finale C** — /payments e la scheda atleta verificate su schermo a 375, 768 e 1280 px: nessun elemento tagliato |
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
| A2-18 | Verifica su schermo dei pannelli contributi a 375, 768 e 1280 px | `DONE` | **Blocco Finale C** — la scheda «Voucher e Contributi» di Gestione iscrizioni era **irraggiungibile** da un telefono: la barra delle schede usciva di 382 px e veniva tagliata. Corretta e riverificata |
| A2-19 | Compensazione automatica del contributo sulla rata della famiglia | `OPEN` | ADR-0037 — **scelta consapevole**: quale parte della quota il voucher copre lo decide il club, non l'importo maturato. Compensare in automatico farebbe risultare saldate rate che nessuno ha pagato |
| A2-20 | Trasmissione telematica delle rendicontazioni all'ente | `OPEN` | ADR-0037 — `reported` e una marcatura interna; il canale verso il finanziatore cambia da bando a bando e non si puo implementare a memoria |

---

### Blocco 9 — Modulistica V2, moduli online e iscrizioni (2026-08-26)

Workstream C. Ogni voce corrisponde a una richiesta del documento di lavoro.
Chiuse da WP-50, [ADR-0039](18-decision-log.md#adr-0039--i-moduli-escono-da-clubsdocument_templates-e-diventano-tre-tabelle)
e [ADR-0040](18-decision-log.md#adr-0040--una-compilazione-cita-una-versione-immutabile-e-non-scrive-in-anagrafica).

| # | Richiesta | Stato | Chiuso da |
|---|-----------|-------|-----------|
| B9-01 | Form builder semplice: titolo, descrizione, «Aggiungi campo» | `DONE` | Blocco 9 — un campo chiuso mostra tre cose, il resto dietro «Impostazioni» |
| B9-02 | Tipi di campo: testo, numero, data, scelte, email, telefono, firma | `DONE` | Blocco 9 — dodici tipi piu la sezione. Erano diciassette: divisore, link video e consenso non erano tipi, erano casi di altri tre |
| B9-03 | Campi dinamici EasyGame con etichette umane | `DONE` | Blocco 9 — catalogo chiuso server-side; l'interfaccia mostra «Telefono del genitore», mai `guardian.phone` |
| B9-04 | Soggetti collegati: quale atleta, quale genitore | `DONE` | Blocco 9 — dedotti dai campi, non dichiarati a mano; con piu tutori la scelta e esplicita |
| B9-05 | «Compila modulo» dalla scheda atleta, con atleta preselezionato | `DONE` | Blocco 9 — precompilazione calcolata dal server, campi precompilati dichiarati |
| B9-06 | Moduli online pubblici veri | `DONE` | Blocco 9 — `/forms/:slug` riscritto, priorita smartphone |
| B9-07 | Iscrizione online con coda della segreteria | `DONE` | Blocco 9 — submission → validazione → coda → approvazione → anagrafica |
| B9-08 | Controllo duplicati prima di creare una scheda | `DONE` | Blocco 9 — codice fiscale, nome piu data di nascita, email; con il motivo scritto, e senza unire da soli |
| B9-09 | La segreteria deve capire cosa cambiera | `DONE` | Blocco 9 — valore attuale accanto a quello proposto, calcolati dalla stessa funzione che poi scrive |
| B9-10 | Mapping dei campi validato lato server | `DONE` | Blocco 9 — il modulo salva una chiave del catalogo, mai un percorso |
| B9-11 | Versionamento dei moduli | `DONE` | Blocco 9 — versioni immutabili citate dalla compilazione |
| B9-12 | Sicurezza dei moduli pubblici | `DONE` | Blocco 9 — slug con suffisso casuale, rate limiting per IP, limiti di payload, upload ristretti, un solo esito negativo |
| B9-13 | Responsivita di builder e modulo pubblico | `DONE` | Blocco 9 — verificata staticamente a 375/768/1280; la verifica su schermo resta R-01 |
| B9-14 | Documenti generati dai form collegati alla scheda | `DONE` | Blocco 9 — allegati del servizio del Blocco 8, ricollegati ai documenti di iscrizione all'approvazione |
| B9-15 | Ripulire `clubs.document_templates` dai residui dei moduli V1 | `OPEN` | Il travaso e una copia, non uno spostamento: cancellare il dato di partenza e una decisione di chi lo possiede |
| B9-16 | Eseguire il travaso sugli ambienti | `OPEN` | `scripts/migrate-forms-v2.mjs` esiste ed e idempotente. Richiede autorizzazione esplicita: non e stato eseguito |
| B9-17 | Logica condizionale fra campi (mostra B se A vale X) | `OPEN` | Fuori scope dichiarato di WP-50: aggiunge un modello di dipendenze al modulo, e va disegnato a parte |
| B9-18 | La sede di un atleta creato da un modulo online | `DONE` | **Blocco Finale B**, ADR-0043 — non un promemoria e non un campo scritto a mano: sede e categoria sono campi il cui **elenco lo mette il server** quando il modulo si apre, dalle sedi attive del club proprietario. Approvare risolve il nome in identificativo e colloca l'appartenenza. Un club con una sola sede non vede la domanda e la sede viene assegnata lo stesso |

---

### Blocco Finale A — chiusura funzionale delle anagrafiche (2026-08-26)

Il blocco non ha aggiunto un dominio: ha **riaperto e verificato** cio che i
Blocchi 7, 8 e il Workstream B avevano dichiarato chiuso, chiedendo per ognuno
la prova nel codice e non la somiglianza. Cinque voci sono tornate indietro, e
in tre casi il difetto era che la funzione c'era **solo nella UI**.

Le voci di questa tabella non duplicano quelle dei blocchi precedenti: dicono
che cosa la riverifica ha trovato. Dove non ha trovato niente, la riga lo dice
e cita chi l'aveva chiusa.

| # | Richiesta | Stato | Esito della verifica |
|---|-----------|-------|----------------------|
| BA-01 | Coerenza UI/UX: badge stagione neutro, niente logo EasyGame in topbar club, console piattaforma separata, CF dopo i dati anagrafici | `DONE` | Gia chiuso dai Blocchi 7 e 8; 30 invarianti in `brand-and-chrome` e `topbar-club-vs-platform` lo verificano, e la posizione del CF e stata riguardata a schermo su allenatore, staff e socio |
| BA-02 | Reparto staff creato con «Altro» subito riutilizzabile | `DONE` | Blocco 7 — `staff-directory.ts` e la fonte unica; la deduzione dai membri e recupero, non secondo canale di creazione |
| BA-03 | Ruoli Dirigente, Presidente, Vicepresidente | `DONE` | Blocco 7 — presenti in `STAFF_ROLES` |
| BA-04 | Rimozione del PIN club, non nascondimento | `DONE` | Blocco 7, ADR-0033 — un test statico impedisce a qualunque file di nominare `payment_pin`. La colonna resta nello schema, inutilizzata: rimuoverla e una migrazione distruttiva senza guadagno |
| BA-05 | Togliere «Ruolo» dai dati societari dell'allenatore | `DONE` | Blocco 7 |
| BA-06 | Data di inizio dell'allenatore modificabile e persistente | `DONE` | Blocco 7 — `startDate` e `hireDate` restano allineate al salvataggio |
| BA-07 | «Id club non trovato» all'aggiunta di un contratto | `DONE` | Blocco 7 — `resolveActiveClubId` copre il caso; il messaggio resta come guardia quando nessun club e attivo |
| BA-08 | Piu allenamenti associabili anche in modifica | `DONE` | Blocco 7 — `trainerIds` non viene piu riscritto con un id solo |
| BA-09 | Visite mediche: CRUD completo, tipologia con significato | `DONE` | Blocco 7 — agonistica / non agonistica in `medical-visits.ts` |
| BA-10 | Ogni «Visualizza» apre davvero, ogni «Scarica» scarica | `DONE` | Blocchi 7 e 8, ADR-0034 — quattro test statici impediscono di reintrodurre `window.open` su un data URL o un link diretto a un allegato |
| BA-11 | Nomi di download leggibili per persona | `DONE` | Blocco 7 per il formato, Blocco 8 per l'estensione, che la mette il server |
| BA-12 | Tipo di socio scelto alla creazione | `DONE` | Blocco 7 — stessa fonte dati della modifica (`member-types.ts`) |
| BA-13 | Numero di tessera mai obbligatorio | `DONE` | Blocco 7 — un test verifica che nessuna schermata di persona lo renda `required` |
| BA-14 | Il comune scelto porta con se il CAP | `DONE` | **Blocco A**, [ADR-0042](18-decision-log.md#adr-0042--il-cap-arriva-da-ipa-e-si-propone-solo-dove-il-comune-ne-ha-uno-solo) — la fonte mancante era IPA di AgID (CC BY 4.0, giornaliera). 7.836 comuni su 7.896; per i 52 con piu CAP il form lo dice e non compila. Chiude B7-07 |
| BA-15 | Codice fiscale assistito su **ogni** anagrafica di persona | `DONE` | **Blocco A** — la scheda socio era l'ultima senza: raccoglieva il CF alla creazione e non lo mostrava mai piu |
| BA-16 | Telefono internazionale ovunque | `DONE` | Blocco 8 — nove superfici elencate in `anagrafiche-coverage` |
| BA-17 | Capitalizzazione condivisa con le esclusioni giuste | `DONE` | Blocchi 7 e 8 — verificata sull'intero dataset ISTAT a ogni esecuzione |
| BA-18 | Taglie vestiario per allenatori, staff e soci | `DONE` | **Riaperta e chiusa nel Blocco A.** Erano di **sola scrittura**: raccolte dai tre moduli di creazione, mostrate da nessuna scheda, e stampate dall'export. Un dato che si vede solo nell'export e peggio di un dato assente |
| BA-19 | Nessun campo stagione sul kit | `DONE` | **Riaperta e chiusa nel Blocco A.** Il Workstream B l'aveva tolta dal form; restava nel tipo, nella serializzazione e in una colonna d'export sempre vuota. Era nascosta, non rimossa — e il test guardava il JSX, non il modello |
| BA-20 | Togliere «categorie compatibili» da articoli e kit | `DONE` | **Nuova nel Blocco A.** Era eleggibilita sportiva applicata a un magazzino: meta delle voci disabilitate in tendina, e `getCompatibleInventoryForAthlete` che rispondeva **zero righe** quando le categorie non coincidevano — magazzino esaurito per una ragione inventata |
| BA-21 | Taglia dell'anagrafica proposta all'assegnazione, override che non riscrive l'anagrafica | `DONE` | Workstream B, riverificato: `clothing-delivery.test.mjs` copre entrambe le direzioni |
| BA-22 | Consegne per singolo articolo con stato del kit derivato | `DONE` | Workstream B — quattro stati per articolo, riepilogo derivato e mai scritto |
| BA-23 | Audit del debito sulle scritture abbigliamento | `DONE` | **Verificato nel Blocco A**: [D32](16-technical-debt.md) e risolto per le assegnazioni, e il catalogo passava gia da `PATCH /api/v1/clubs/:id`, che sincronizza `club_resource_items`. Nessun bypass residuo |
| BA-24 | Nessuna regressione sui gruppi di numerazione | `DONE` | Gruppi chiusi, nomi non duplicati, compatibilita orientata e non transitiva, filtro sede: quattro file di test verdi dopo le modifiche al catalogo |
| BA-25 | Export coerente per allenatori, staff e soci | `DONE` | Blocco 7 — `person-export.ts` sopra `people-pdf-export.ts`: un motore solo, tre insiemi di colonne |
| BA-26 | Lettura documenti nella creazione di atleta, allenatore, staff e socio | `DONE` | Blocchi 7 e 8 — contratto provider-agnostico, conferma obbligatoria, formati dichiarati. Restano aperte le parti che dipendono da un provider esterno: vedi B7-34 (PDF) e B7-33 |
| BA-27 | «Nuovo atleta» al livello delle nuove form | `DONE` | Blocco 8 — sezioni genitori/tutori, tesseramento e categorie secondarie; obbligatori sempre tre |
| BA-28 | Nessuna regressione multi-sede | `DONE` | Categoria, sede, struttura e gruppo restano quattro concetti; `multisite-model` e `multisite-ux` verdi |
| BA-29 | Nessuna regressione su Payment V2 e Contributi | `DONE` | `installment-ledger`, `payment-transactions`, `payment-partial-regressions` e `funding-*` verdi dopo le modifiche alle anagrafiche |
| BA-30 | Nessuna regressione di performance | `DONE` | Rimisurate: lista Atleti 140 kB su 200 atleti (99,4% in meno degli avatar base64), multi-sede sotto 3x raddoppiando gli atleti. Il Blocco A ha **tolto** lavoro dal percorso abbigliamento, non aggiunto |
| BA-31 | Verifica su schermo a 375, 768 e 1280 px | `DONE` | **Blocco A** — quattordici pagine dei domini del blocco, con sessione autenticata sul database di sviluppo. Ha trovato tre difetti che nessuna invariante statica poteva vedere. Chiude B8-23; **non** chiude R-01, che comprende anche le pagine nate dall'integrazione |
| BA-32 | Residenza assistita anche dove il form e semplice | `DONE` | **Nuova nel Blocco A.** Le sei anagrafiche di persona avevano tre `<Input>` liberi ciascuna: nessuna ricerca del comune, nessun CAP. `PersonResidenceFields` e uno solo |
| BA-33 | La scheda socio deve caricare cio che la creazione scrive | `DONE` | **Nuova nel Blocco A.** `setMember` costruiva un elenco chiuso di dodici chiavi su ventuno: nove campi si scrivevano e non si leggevano mai |

**Le cinque voci che sono tornate indietro.** BA-18 e BA-19 erano `DONE` e non
lo erano: la funzione esisteva nella UI e non nel modello. BA-15 era `DONE` per
cinque anagrafiche su sei. BA-31 era `OPEN` da due blocchi per una ragione
ambientale, non tecnica. BA-14 era `OPEN` per una fonte che si e rivelata
esistere. Le tre nuove — BA-20, BA-32, BA-33 — sono uscite dalla riverifica,
non da una richiesta.

---

## Blocco Finale B — Finance & Forms Completion

Il blocco che chiude i domini economici e la modulistica. Undici voci: nove
chiuse, due che restano aperte **per scelta** e dicono cosa manca.

Nessuna voce riguarda funzioni gia esistenti: l'audit iniziale ha trovato
Forms V2, il builder, i campi dinamici, i soggetti collegati, la coda di
approvazione, il controllo duplicati, Payment V2 e i contributi **gia
completi** dai blocchi precedenti. Riscriverli sarebbe stato il difetto
numero 1 di CLAUDE.md.

| # | Richiesta | Stato | Chiuso da |
|---|-----------|-------|-----------|
| BB-01 | La sede in un modulo di iscrizione online | `DONE` | ADR-0043 — sede e categoria sono campi le cui **opzioni le mette il server** dalle sedi attive del club proprietario. La stessa funzione riempie le opzioni quando il modulo si serve e quando l'invio si valida, quindi un valore fuori elenco lo rifiuta la validazione dei campi a scelta che c'era gia. Chiude R-14 e B9-18 |
| BB-02 | Club mono-sede senza complicazioni | `DONE` | ADR-0043 — la domanda non si mostra e la sede viene assegnata lo stesso |
| BB-03 | L'approvazione colloca categoria e sede | `DONE` | ADR-0043 — l'appartenenza nasce con il gruppo giusto. Un'appartenenza gia collocata non si sposta |
| BB-04 | Numerazione documenti per club ed esercizio | `DONE` | ADR-0044 — vincolo composto e sequenza incrementata in una sola istruzione dentro una transazione. Chiude D28. Trovata chiudendolo: una **seconda numerazione** nel browser, nella pagina Movimenti, rimossa |
| BB-05 | Pagamenti online: astrazione provider-agnostica | `DONE` | ADR-0045 — CediPay come livello di prodotto, contratto a sette operazioni, adapter Stripe con addebiti diretti, commissione configurabile. Chiude la parte architetturale di R-05 |
| BB-06 | Webhook: firma, deduplica, idempotenza | `DONE` | ADR-0045 — verifica HMAC con diciassette test, deduplica su `(provider, event_id)`, 503 senza segreto. Rischio 6 di [14](14-security.md) da MEDIO a PRESIDIATO |
| BB-07 | Entitlements centralizzati e console piattaforma | `DONE` | ADR-0046 — catalogo chiuso, risoluzione con il **motivo** di ogni esito, `GET|POST /api/v1/entitlements`, sezione «Servizi e piani». Oggi **descrittivo**: vedi BB-10 |
| BB-08 | Ricevuta e fattura come documenti distinti | `DONE` | ADR-0047 — due registri di numerazione, intestatario risolto dal tutore, `is_electronic` falso per costruzione. Chiude D36 sul percorso che genera il volume |
| BB-09 | Il documento stampabile con il marchio del club | `DONE` | `GET /api/v1/documents/:kind/:id`. **Non archiviato**: le due strade — PDF con una libreria, o `text/html` in `attachments` — sono in D38 e nessuna si prende scrivendo un file |
| BB-10 | Il gating vero delle funzioni | `DONE` | **Blocco Finale C**, [ADR-0048](18-decision-log.md#adr-0048--il-piano-di-una-societa-appartiene-alla-piattaforma-non-alla-societa) — D37 chiuso: piano, abbonamento, servizi ed eccezioni sono di proprieta della piattaforma e la guardia sta nella scrittura, non nell'interfaccia. Il gating e acceso su tre scritture (checkout online, nuovo bando, nuovo modulo); la **lettura** non e mai negata, perche togliere un servizio non deve nascondere cio che una societa ha gia ricevuto |
| BB-11 | Strumenti per riconciliare il primo bando reale | `DONE` | `GET /api/v1/funding/programs/:id/reconciliation`, anche in CSV: una riga per atleta e periodo, con la misura grezza accanto al requisito. **Non chiude R-11**, che e l'atto di caricare un bando vero |

**Cosa il blocco ha trovato senza cercarlo.** Due seconde implementazioni gia
presenti — la numerazione delle ricevute nel browser (BB-04) e il gestore del
webhook senza scope, che avrebbe scritto su una rata di un altro club — e un
doppio di Prisma che non conosceva i vincoli di unicita, per cui il test sulla
deduplica sarebbe passato provando il contrario di cio che deve provare.

---

## Blocco Finale C — Release Candidate Hardening

Il blocco che porta da «molte funzionalita implementate» a «Web V1
verificabile». Non ha aggiunto un dominio: ha chiuso i quattro blocker che
restavano dentro il codice, misurato cio che si diceva a memoria, e aperto le
pagine a 375 px invece di dedurne la responsivita da una regex.

**Cosa ha trovato senza cercarlo.** Sei difetti veri, tutti in cose dichiarate
funzionanti: il calcolo degli entitlement leggeva una chiave che nessuno
scriveva; un `Object.assign` cancellava il filtro categoria appena si scriveva
nella casella di ricerca; due cicli annidati nei report costavano centinaia di
milioni di confronti; il doppio di Prisma non conosceva `lt` e cancellava
tutto; Modulistica montava un secondo guscio che su un telefono le lasciava
146 px su 375.

| # | Richiesta | Stato | Chiuso da |
|---|-----------|-------|-----------|
| BC-01 | Il piano e i servizi di un club escono dalle mani del club | `DONE` | [ADR-0048](18-decision-log.md#adr-0048--il-piano-di-una-societa-appartiene-alla-piattaforma-non-alla-societa) — quattro chiavi di `clubs.settings` scrivibili solo da `platform_admin`, e la guardia sta **nella scrittura**: nascondere i campi non avrebbe protetto niente. Ignora invece di rifiutare, perche il salvataggio di un recapito manda anche il piano; un valore **diverso** lascia una riga di audit `denied`. Chiude D37, R-18, BB-10 |
| BC-02 | Il gating vero delle funzioni | `DONE` | `requireClubEntitlement` su checkout online, nuovo bando e nuovo modulo. La **lettura** non e mai negata: togliere un servizio non deve nascondere a una societa cio che ha gia ricevuto. `CapabilityGate` mostra il motivo — piano, abbonamento, servizio, assistenza sono quattro strade diverse |
| BC-03 | Il difetto trovato chiudendo BC-01 | `DONE` | Il calcolo leggeva `settings.subscriptionSettings`, la pagina scriveva `settings.subscription`: **nessun club aveva il piano che credeva di avere**. Il test che avrebbe dovuto accorgersene seminava a sua volta la chiave sbagliata |
| BC-04 | La lista Atleti consuma la paginazione | `DONE` | Due modi decisi dall'archivio: sotto una pagina niente cambia, sopra i filtri vanno al server e compare la barra delle pagine. Aggiunti `category_id` e `site_id`, senza i quali una pagina sarebbe stata «duecento atleti da filtrare poi a tre». Chiude R-02, F1-12, B8-21, D4 |
| BC-05 | Misura su archivi realistici | `DONE` | `npm run measure:web` su 200, 1.000 e 2.000 atleti: peso, righe, **interrogazioni**, tempo, per cinque domini. La lista Atleti paginata resta a 121 kB e 2 query a ogni scala; nessuna schermata cresce di interrogazioni. Chiude D35 |
| BC-06 | I due cicli annidati nei report | `DONE` | `club-report-utils` e `category-athlete-stats` rileggevano l'intero elenco delle presenze per **ogni** allenamento, e in un caso per ogni atleta per ogni allenamento. Con 2.000 atleti l'elenco e di 128.000 righe. Ora si scorre una volta e si legge da un indice; un test misura il **rapporto** di crescita |
| BC-07 | Validazione del corpo con uno schema | `DONE` | `src/lib/validation/` con zod su autenticazione, incassi, stagioni, piano, contributi. `VALIDATION_ERROR` nell'envelope con la lista dei campi. Il CRUD generico resta fuori **per scelta**: cinquanta risorse aperte che uno schema chiuso rifiuterebbe a raffica. Chiude R-04, F1-05, D14 |
| BC-08 | Audit sulle anagrafiche di persona | `DONE` | `anagrafica.updated` su sei risorse, e azioni **proprie** per incassi, storni, documenti emessi, rendicontazioni, liquidazioni e commerciale della piattaforma. Restano fuori allenamenti e magazzino: non hanno un soggetto. Chiude R-07, F3-04 |
| BC-09 | Cosa deve essere periodico e cosa no | `DONE` | Audit scritto in `maintenance.ts`: request-driven quasi ovunque, con il perche. L'unica cosa che nessuna schermata fara mai e togliere le righe scadute, e la fa `POST /api/v1/maintenance`. Il trigger sta fuori dall'applicazione (ADR-0007) |
| BC-10 | Lo scenario dei pagamenti, dall'inizio alla fine | `DONE` | Rata da 130: 50 contanti, 30 carta, 50 bonifico, poi storno dei 30. Residuo che torna a 30, rata di nuovo parziale, data di saldo tolta, storico che si allunga invece di riscriversi, ordine cronologico anche registrando a ritroso |
| BC-11 | Verifica su schermo a 375, 768 e 1280 px | `DONE` | Diciotto pagine su una build vera con sessione autenticata. **Sette difetti**, tutti invisibili a un test statico. Chiude R-01, B3-03, A1-18, A2-18, WB-12, WP-34 |
| BC-12 | Residui legacy classificati | `DONE` | Le due rotte orfane (D27) diventano un rimando alla scheda — un segnalibro merita un rimando, non un 404 — e `AddPaymentForm` (D31) e rimossa. Con Modulistica se ne vanno anche il guscio duplicato e la sua navigazione |
| BC-13 | Import atleti senza una richiesta per atleta | `DONE` | Scaglioni da 50: due richieste per scaglione invece di due per atleta. Uno scaglione che fallisce ripiega riga per riga, cosi una sola anagrafica sbagliata non porta via le altre quarantanove |
| BC-14 | Lo strumento per migrare i file legacy fuori dai record | `DONE` | `scripts/migrate-legacy-attachments.mjs`: prova a vuoto predefinita, conteggi, dimensioni, tipi, errori, `--limit`, ripetibile. **Non eseguito** su nessun ambiente: e una migrazione di dati e richiede autorizzazione |
| BC-15 | Matrice Release Candidate | `DONE` | [22 — Matrice Release Candidate](22-release-candidate.md): ogni requisito storico con stato, implementazione, prova e «blocca il rilascio?». Tre blocker, tutti **fuori dal codice** |
| BC-17 | Deploy su staging e smoke test del blocco | `DONE` | Deployment **READY**, nessuna migrazione nuova. Undici pagine e cinque API verificate **nel contenuto**: la validazione nuova risponde 400 con `VALIDATION_ERROR`, la manutenzione senza token risponde 403. Trovato e corretto un secondo difetto d'ambiente: la build di verifica del responsive finiva nel caricamento verso Vercel e lo faceva superare i 100 MB |
| BC-18 | Il guardrail dei segreti della CI era rosso | `DONE` | Un test scriveva una chiave Stripe finta con il prefisso vero: il job era rosso dal commit di CediPay. Corretto, e i quattro guardrail sono ora anche test, cosi si scoprono in un secondo invece che dopo un push |
| BC-16 | Console di piattaforma verificata su schermo | `OPEN` | **Per un motivo di ambiente, non di codice**: il seed di sviluppo non contiene un account amministratore, e crearne uno significa scrivere una credenziale. Serve una decisione |

---

## Remaining Web V1 after integration

Cio che manca perche la Web V1 si possa dichiarare **release candidate**, dopo
l'integrazione dei tre workstream paralleli (Pagamenti V2 e Contributi,
multi-sede e abbigliamento, Modulistica V2).

Sostituisce «Remaining Web V1 before release» del Blocco 8. Le voci uscite
dall'elenco perche chiuse nell'integrazione sono citate in coda, cosi non
sembra che siano state dimenticate. Non contiene niente delle proposte grandi
piu sotto: quelle vengono **dopo** il rilascio.

| # | Cosa manca | Perche blocca | Dove |
|---|-----------|---------------|------|
| ~~R-01~~ | ~~Verifica su schermo delle pagine restanti a 375, 768 e 1280 px~~ | **Chiuso dal Blocco Finale C.** Diciotto pagine caricate a tre larghezze su una build vera con sessione autenticata, misurando elemento per elemento chi esce dal riquadro e chi lo taglia. **Sette difetti**, tutti invisibili a un test statico: la dashboard perdeva 50 px di larghezza, l'onboarding scorreva di lato di 347, tre barre di schede erano tagliate — «Sconti e Promozioni», «Voucher e Contributi», «Mancanti» irraggiungibili da un telefono — e Modulistica montava un **secondo guscio** che su 375 px lasciava 146 px al contenuto. **Resta fuori** la sola console di piattaforma: il seed di sviluppo non contiene un account amministratore, e crearne uno e una scrittura di credenziali | BA-31, B3-03, ADR-0025 |
| ~~R-02~~ | ~~La lista Atleti deve consumare la paginazione~~ | **Chiuso dal Blocco Finale C.** Due modi decisi dall'archivio: sotto una pagina niente cambia, sopra i filtri vanno al server. Misurato con `npm run measure:web` — la richiesta della lista resta a 121 kB e due interrogazioni **da 200 a 2.000 atleti**, contro 1.221 kB dell'archivio intero | F1-12, B8-21 |
| R-03 | Decisione sul provider di storage | Non blocca il funzionamento, blocca la crescita: oggi i file stanno nel database di Neon, e la Modulistica V2 ne aggiunge uno per ogni certificato caricato da un modulo pubblico | B8-13, ADR-0034 |
| ~~R-04~~ | ~~Validazione input con uno schema (`zod`)~~ | **Chiuso dal Blocco Finale C** dove il corpo e chiuso e conosciuto: autenticazione, incassi, stagioni, piano, contributi. Un corpo malformato risponde 400 con `VALIDATION_ERROR` nell'envelope. Il CRUD generico resta fuori per scelta motivata; i moduli pubblici hanno gia una validazione guidata dallo schema del modulo | F1-05, WP-05 |
| R-05 | Pagamenti online: implementarli o togliere la promessa | **Parzialmente chiuso dal Blocco Finale B** (ADR-0045). Il contratto provider-agnostico, l'adapter Stripe, la verifica della firma, la deduplica degli eventi e le rotte ci sono, e la promessa non e piu rotta: dove manca una configurazione l'interfaccia lo **dice**, con un messaggio diverso per ognuno dei quattro blocchi. **Resta aperto** cio che non si puo collaudare senza credenziali Stripe: un checkout vero, un webhook vero, un rimborso vero. Piu tre decisioni di prodotto elencate nell'ADR | F4-03, WP-13, ADR-0045 |
| R-06 | Unificare i due sistemi di toast | Due sistemi montati insieme: due comportamenti per lo stesso avviso | F3-02, WP-14 |
| ~~R-07~~ | ~~Completare l'audit log sulle anagrafiche~~ | **Chiuso dal Blocco Finale C**: `anagrafica.updated` su atleti, allenatori, staff, soci, appartenenze e certificati, piu azioni proprie per incassi, storni, documenti, rendicontazioni, liquidazioni e commerciale della piattaforma | F3-04 |
| R-08 | Scheduler dei promemoria certificati | Un certificato scaduto e un atleta che non puo scendere in campo, e oggi avvisa solo chi apre la schermata e preme il pulsante. **Il posto dove agganciarlo c'e** (`runScheduledMaintenance`, `POST /api/v1/maintenance`); manca la decisione di prodotto su destinatari, frequenza e disiscrizione — vedi F3-09 | F3-09 |
| R-09 | Rimuovere i residui legacy classificati | **Parzialmente chiuso dal Blocco Finale C**: le due route orfane (D27) sono diventate un rimando alla scheda — un indirizzo in un segnalibro merita un rimando, non un 404 — e `AddPaymentForm` (D31) e stata rimossa dopo aver dimostrato che nessun file la referenzia. **Restano** le 19 primitive `ui/*`, e restano **per scelta**: sono la libreria shadcn/ui, il tree-shaking le tiene fuori dal bundle, e rimuoverle costerebbe quattro dipendenze e nessun guadagno a runtime | F3-06, WP-18 |
| R-10 | Ambiente di produzione, error tracking, backup provati, UAT | E la fase F5 per intero: senza, «rilasciato» non ha un significato operativo | F5-01, F5-02, F5-03, F5-04 |
| R-11 | Voucher e contributi: primo bando reale caricato e riconciliato a mano | **Lo strumento c'e** dal Blocco Finale B: `GET /api/v1/funding/programs/:id/reconciliation`, anche in CSV, mette una riga per atleta e periodo con la misura grezza accanto al requisito. **Resta l'atto**: caricare un bando vero e farlo verificare una volta da chi lo rendiconta. E una verifica su dati reali, non un lavoro di codice | A2-18, WP-48 |
| R-12 | Multi-sede: primo club con due sedi vere, configurato e usato | Il modello, i filtri e i gruppi operativi sono coperti dai test, ma «due sedi» diventa reale solo quando una segreteria assegna atleti veri e usa i filtri per una settimana | P-01, WP-49 |
| R-13 | Modulistica V2: primo modulo pubblicato e primo ciclo di approvazione reale | Il builder, la coda e l'approvazione sono coperti dai test. Un modulo pubblico e pero l'unica superficie che sta su Internet senza autenticazione: il primo giro va fatto con un modulo vero e una compilazione vera prima di dichiararlo rilasciabile | B9-01, WP-50 |
| ~~R-14~~ | ~~La sede di un atleta iscritto da un modulo online si assegna a mano~~ | **Chiuso dal Blocco Finale B** (ADR-0043). Il modulo puo chiedere la sede, l'elenco lo mette il server e l'approvazione colloca l'appartenenza. Resta la verifica su schermo del modulo pubblico multi-sede, che e in R-01 | B9-18, ADR-0043 |

| ~~R-15~~ | ~~Applicare le due migrazioni del Blocco Finale B~~ | **Chiuso il 2026-08-26**: applicate su staging durante il deploy, con autorizzazione esplicita. «All migrations have been successfully applied», 17/17. Restano da applicare in produzione quando l'ambiente esistera (R-10) | ADR-0044, ADR-0045 |
| R-19 | I deployment Preview non partono | `DATABASE_URL` e `DIRECT_URL` sono configurate sull'ambiente Production del progetto e non su Preview: ogni push lascia un deployment rosso che non riguarda il codice, ed e il rumore che fa smettere di guardare i deployment rossi. Richiede una modifica alla configurazione Vercel | D39 |
| R-16 | Credenziali Stripe e primo giro reale di CediPay | Contratto, adapter, firma e deduplica ci sono e sono coperti dai test. **Nessun checkout, nessun webhook e nessun rimborso e mai passato da Stripe**: non ci sono credenziali in questo repository. Finche non gira contro un account vero, l'integrazione e da collaudare, non funzionante | R-05, ADR-0045 |
| R-17 | Le tre decisioni Connect che non sono tecniche | Tipo di dashboard dell'account connesso — **irreversibile** dopo la creazione dell'account —, responsabilita dei saldi negativi, e percentuale della commissione, che e un accordo commerciale. Sono elencate in ADR-0045 perche vanno prese, non perche siano state prese | ADR-0045 |
| ~~R-18~~ | ~~Il piano di un club deve uscire dalle mani del club~~ | **Chiuso dal Blocco Finale C** ([ADR-0048](18-decision-log.md#adr-0048--il-piano-di-una-societa-appartiene-alla-piattaforma-non-alla-societa)). Quattro chiavi di `clubs.settings` sono ora scrivibili solo da `POST /api/v1/entitlements` con ruolo `platform_admin`; la guardia e in `resources.ts`, cioe dove il dato viene scritto, e un tentativo lascia una riga di audit. Chiudendolo si e trovato che il calcolo leggeva una chiave che nessuno scriveva: **nessun club aveva il piano che credeva di avere** | D37, ADR-0046, BB-10 |

**Uscite dall'elenco con l'integrazione.** Erano due, entrambe chiuse in questo
blocco e non rinviate:

- *Le scritture dell'abbigliamento devono passare da `resources.ts`* — chiusa:
  `/api/clothing/assignments` usa `replaceClubResourceCollections`, e
  [D32](16-technical-debt.md) e RISOLTO;
- *Il test della topbar dipende dai fine riga del checkout* — chiusa da
  `.gitattributes` piu la normalizzazione a LF nel test;
  [D30](16-technical-debt.md) e RISOLTO.
---

## Fase F3 — Completamento funzionale

| # | Richiesta | Stato | Note |
|---|-----------|-------|------|
| F3-01 | Pagamenti online reali | `IN PROGRESS` | **Blocco Finale B**, ADR-0045 — CediPay: contratto provider-agnostico, adapter Stripe (addebiti diretti, commissione, rimborsi, attivazione del club), firma dei webhook verificata e collaudata, deduplica degli eventi, rotte agganciate. **Manca** cio che richiede credenziali vere: un checkout, un webhook e un rimborso provati contro Stripe |
| F3-02 | Unificare i sistemi di toast | `OPEN` | WP-14. Ne convivono due |
| F3-03 | Spostare i file fuori dai record | `IN PROGRESS` | **Blocco 8**, ADR-0034 — un allegato e ora una riga di `attachments` e il record ne conserva solo il riferimento. **Mancano**: la tabella `assets` (logo club, moduli online) e la scelta di un provider esterno, che e una decisione del proprietario del prodotto (opzioni e raccomandazione nell'ADR) |
| F3-04 | Audit log | `DONE` | WP-16, ADR-0019. Copre auth, risorse economiche, stagioni, **tutti** i dinieghi e, dal **Blocco Finale C**, anagrafiche di persona, incassi e storni, documenti emessi, rendicontazioni e liquidazioni, e il commerciale della piattaforma — ognuno con un'azione propria. Restano fuori allenamenti e magazzino, che non hanno un soggetto |
| F3-05 | Ridurre l'adapter `supabase.ts` | `OPEN` | WP-17, dipende da WP-07 |
| F3-06 | Rimuovere i residui legacy | `IN PROGRESS` | WP-18. Il Blocco 7 ne ha tolti tre (`page-modals.tsx`, `TrainerPayments.tsx`, `pin-input.tsx`). **Mancano** i 19 componenti `ui/*` non usati e gli alias di compatibilita |
| F3-07 | Scomporre le pagine monolitiche | `IN PROGRESS` | WP-19. **Blocco 8**: `athletes/[id]/page.tsx` da 8.696 a 8.480 righe pur aggiungendo funzioni, con genitori, campi dei form, sezioni, intestazione e barra estratti, e un test che impedisce di risalire sopra 8.500. **Mancano** i sette pannelli e i circa novanta `useState`, piu `clothing/page.tsx` e `registration-management/page.tsx` |
| F3-08 | Deprecare gli alias di compatibilita | `DEFERRED` | WP-20, dipende da WP-21 che e differito |
| F3-09 | Scheduler per promemoria certificati | `OPEN` | **Blocco Finale C** ha fatto l'audit di cosa deve essere periodico e cosa no (`src/lib/server/maintenance.ts`). Le pulizie sono scheduled e hanno una rotta; i **promemoria no, per scelta**: mandarli a orario richiede di decidere a chi, quanto spesso e come ci si toglie. Sono tre domande di prodotto, e inventarle qui vorrebbe dire spedire email a nome di una societa senza che l'abbia chiesto |
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
| WB-08 | Niente stagione sul kit | `DONE` | Workstream B l'aveva tolta dal form; **il Blocco A l'ha tolta dal modello**, dove restava insieme a una colonna d'export sempre vuota. Vedi BA-19 |
| WB-09 | Numerazione per sede senza regressioni | `DONE` | `siteIds` sul gruppo; vuoto = tutte le sedi, cioe ogni gruppo esistente |
| WB-10 | Performance con 200+ atleti e piu sedi | `DONE` | Rapporto sotto 3x raddoppiando gli atleti; `scripts/measure-multisite-performance.mjs` stampa i tempi |
| WB-11 | Filtro sede sugli allenamenti | `DONE` | La sede viene dalla struttura, non da un campo proprio: un secondo campo si disallineerebbe al primo allenamento in trasferta |
| WB-12 | Consegne usabili da smartphone | `DONE` | **Blocco Finale C** — /clothing verificata su schermo a 375, 768 e 1280 px: nessun elemento tagliato |

---

## Proposte grandi, ancora future

Non sono state dimenticate e non sono state ridotte a righe di un altro
elenco. Nessuna e cominciata; ognuna vale un blocco o piu.

| # | Proposta | Stato | Perche non ora |
|---|----------|-------|----------------|
| P-01 | **Multi-sede per le categorie** | `DONE` | **Workstream B** — WP-49, [ADR-0038](18-decision-log.md). La categoria non si duplica: sede, struttura e gruppo operativo sono concetti separati. Filtro sede su Categorie, Atleti, Strutture e gruppi numerazione; il club mono-sede non vede il concetto |
| P-02 | **Abbigliamento e consegne V2** | `IN PROGRESS` | **Workstream B** — WP-49: ciclo di consegna per articolo con stato del kit derivato, taglia proposta dall'anagrafica con override. **Manca** la riconciliazione con gli ordini fornitore, che resta un flusso a se |
| P-03 | **Modulistica V2** | `DONE` | Blocco 9, WP-50 — campi, versioni immutabili, firma, e i documenti generati collegati alla scheda della persona |
| P-04 | **Moduli online** | `IN PROGRESS` | Blocco 9 — collegamento all'anagrafica e iscrizione online **fatti**. **Mancano** la validazione condizionale (B9-17) e il pagamento contestuale, che dipende da WP-13 |
| P-05 | **Scanner documenti** | `IN PROGRESS` | La foundation e del Blocco 7 (ADR e KB). Restano: PDF, provider remoto, migrazione della scheda atleta. Vedi B7-32/33/34 |
| P-06 | **Stripe / CediPay** | `IN PROGRESS` | **Blocco Finale B**, ADR-0045. La verifica di firma che bloccava l'attivazione del webhook adesso c'e ed e coperta da diciassette test; il rischio 6 di [14](14-security.md) e passato a PRESIDIATO. **Mancano** le credenziali e il primo giro reale |
| P-07 | **SaaS ed entitlements** | `IN PROGRESS` | **Blocco Finale B**, ADR-0046 — lo strato centralizzato c'e: catalogo chiuso delle funzioni, risoluzione su piano, servizi ed eccezioni, con il **motivo** di ogni esito; `GET|POST /api/v1/entitlements`; sezione «Servizi e piani» nella console di piattaforma. **Manca** il gating vero, che non va acceso finche il piano resta modificabile dal club (D37), e l'ambiente di produzione (F5-01) |
| P-08 | **Bonus Sport e Salute** | `OPEN` | **Il modello c'e** dal Workstream A (WP-48, ADR-0037): un bando si descrive con la configurazione, e il Voucher Lazio 2025 e gia coperto come scenario. Resta aperta la parte che **non si puo implementare a memoria**: la fonte dati esterna, le regole annuali del bando e il canale di trasmissione delle rendicontazioni, che cambia da ente a ente |
| P-09 | **AI per gli allenamenti** | `OPEN` | Nessun requisito scritto. Va definito cosa deve produrre prima di scegliere come |
| P-10 | **OAuth Google e Microsoft** | `OPEN` | L'infrastruttura OAuth esiste (`/api/v1/auth/oauth/:provider`). Mancano le credenziali applicative e la decisione su quali domini ammettere |

---

## Voci superate

| # | Richiesta originale | Stato | Cosa l'ha superata |
|---|--------------------|-------|--------------------|
| S-01 | «Il PIN di club deve proteggere le operazioni sensibili» | `SUPERSEDED` | ADR-0033: non proteggeva niente. Sostituito da un controllo di ruolo vero |
| S-02 | «Il codice catastale lo inserisce l'operatore una volta sola» | `SUPERSEDED` | ADR-0032: la tabella ufficiale e arrivata, il codice si cerca |
