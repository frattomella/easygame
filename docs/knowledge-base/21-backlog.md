# 21 — Backlog master

**Ultimo aggiornamento:** 2026-08-25 (Blocco 7)

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
| `DONE` | 63 |
| `IN PROGRESS` | 7 |
| `OPEN` | 25 |
| `DEFERRED` | 6 |
| `SUPERSEDED` | 2 |
| **Totale** | **103** |

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
| F1-12 | Paginazione, ordinamento e filtri server-side | `OPEN` | — (WP-12, dipende da WP-05) |
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
| B3-03 | Ogni pagina usabile a 375, 768 e 1280 px | `IN PROGRESS` | WP-34 — **manca**: la verifica sistematica su tutte le pagine. Le pagine toccate dai blocchi successivi sono verificate una per una |

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
| B7-07 | Ricerca assistita per **CAP** | `IN PROGRESS` | ADR-0032 — **manca**: ISTAT non pubblica il CAP e non e derivabile dal comune (i comuni grandi ne hanno decine). Il CAP resta digitato e validato nella forma. Serve una seconda fonte |
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
| B7-26 | Applicare il campo telefono a tutte le anagrafiche pertinenti | `IN PROGRESS` | Blocco 7 — applicato ai form di creazione di staff, allenatore, socio e atleta. **Mancano**: le schede di dettaglio e la scheda Club |
| B7-27 | Regola condivisa di capitalizzazione dei campi anagrafici | `DONE` | Blocco 7 |
| B7-28 | Applicare la capitalizzazione a tutte le anagrafiche | `IN PROGRESS` | Blocco 7 — applicata ai form di creazione. **Mancano** le schede di dettaglio e la scheda Club, come per B7-26 |
| B7-29 | Taglie vestiario per allenatori, staff e soci | `DONE` | Blocco 7 |
| B7-30 | Export coerente per allenatori, staff e soci | `DONE` | Blocco 7 |
| B7-31 | «Nuovo atleta» deve raccogliere tutto cio che si sa gia | `DONE` | Blocco 7 |
| B7-32 | Foundation per la lettura documenti | `DONE` | Blocco 7 |
| B7-33 | Migrare la scheda atleta sul contratto di lettura documenti | `OPEN` | — Il flusso attuale funziona; migrarlo e un lavoro a se |
| B7-34 | Lettura documenti da PDF | `OPEN` | — Serve rasterizzare: libreria assente |
| B7-35 | Ordinamento cronologico di tutte le liste di pagamenti | `DONE` | Blocco 7 |
| B7-36 | Rimuovere il PIN Club dopo dependency audit | `DONE` | Blocco 7, ADR-0033 |
| B7-37 | Backlog master nella KB | `DONE` | Questo documento |

---

## Fase F3 — Completamento funzionale

| # | Richiesta | Stato | Note |
|---|-----------|-------|------|
| F3-01 | Pagamenti online reali | `OPEN` | WP-13. Oggi gli endpoint rispondono 501: la promessa **non** e dichiarata completa da nessuna parte |
| F3-02 | Unificare i sistemi di toast | `OPEN` | WP-14. Ne convivono due |
| F3-03 | Spostare i file fuori dal database | `OPEN` | WP-15. Oggi gli allegati sono data URL dentro il record: vedi D-xx in [16](16-technical-debt.md) |
| F3-04 | Audit log | `IN PROGRESS` | WP-16, ADR-0019. Copre auth, risorse economiche, stagioni e **tutti** i dinieghi. Manca la copertura delle anagrafiche |
| F3-05 | Ridurre l'adapter `supabase.ts` | `OPEN` | WP-17, dipende da WP-07 |
| F3-06 | Rimuovere i residui legacy | `IN PROGRESS` | WP-18. Il Blocco 7 ne ha tolti tre (`page-modals.tsx`, `TrainerPayments.tsx`, `pin-input.tsx`). **Mancano** i 19 componenti `ui/*` non usati e gli alias di compatibilita |
| F3-07 | Scomporre le pagine monolitiche | `OPEN` | WP-19, dipende da WP-07. `athletes/[id]/page.tsx` supera le 8.000 righe |
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

---

## Proposte grandi, ancora future

Non sono state dimenticate e non sono state ridotte a righe di un altro
elenco. Nessuna e cominciata; ognuna vale un blocco o piu.

| # | Proposta | Stato | Perche non ora |
|---|----------|-------|----------------|
| P-01 | **Multi-sede per le categorie** | `OPEN` | Una categoria oggi appartiene al club, non a una sede. Tocca il modello dati, i permessi e il filtro stagione insieme |
| P-02 | **Abbigliamento e consegne V2** | `OPEN` | Il magazzino c'e; mancano il ciclo di consegna, le taglie per soggetto (parzialmente introdotte dal Blocco 7) e la riconciliazione con gli ordini fornitore |
| P-03 | **Modulistica V2** | `OPEN` | Oggi i modelli generano documenti di stampa. Serve un modello di documento con campi, versioni e firme |
| P-04 | **Moduli online** | `OPEN` | Esistono e raccolgono risposte. Mancano validazione condizionale, pagamento contestuale e collegamento all'anagrafica |
| P-05 | **Scanner documenti** | `IN PROGRESS` | La foundation e del Blocco 7 (ADR e KB). Restano: PDF, provider remoto, migrazione della scheda atleta. Vedi B7-32/33/34 |
| P-06 | **Stripe / CediPay** | `OPEN` | WP-13. Il webhook **non va attivato** prima della verifica di firma (vedi [14](14-security.md), rischio 6) |
| P-07 | **SaaS ed entitlements** | `OPEN` | Presuppone un ambiente di produzione vero (F5-01) e un modello di abbonamento che oggi non esiste |
| P-08 | **Bonus Sport e Salute** | `OPEN` | Dipende da una fonte dati esterna e dalle sue regole annuali: non si puo implementare a memoria |
| P-09 | **AI per gli allenamenti** | `OPEN` | Nessun requisito scritto. Va definito cosa deve produrre prima di scegliere come |
| P-10 | **OAuth Google e Microsoft** | `OPEN` | L'infrastruttura OAuth esiste (`/api/v1/auth/oauth/:provider`). Mancano le credenziali applicative e la decisione su quali domini ammettere |

---

## Voci superate

| # | Richiesta originale | Stato | Cosa l'ha superata |
|---|--------------------|-------|--------------------|
| S-01 | «Il PIN di club deve proteggere le operazioni sensibili» | `SUPERSEDED` | ADR-0033: non proteggeva niente. Sostituito da un controllo di ruolo vero |
| S-02 | «Il codice catastale lo inserisce l'operatore una volta sola» | `SUPERSEDED` | ADR-0032: la tabella ufficiale e arrivata, il codice si cerca |
