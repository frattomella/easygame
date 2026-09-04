# 43b — PP-02: la UAT a schermo

**Data:** 2026-09-04 · Accompagna [43 — PP-02](43-pp-02-area-famiglia.md).

Questo file esiste per la stessa ragione di
[42b](42-pp-01-uat-a-schermo.md): **le pagine dell'area famiglia richiedono una
sessione, e non inserisco credenziali in un modulo di login.** Tutto cio che si
poteva verificare senza sessione e stato verificato — la logica dalle sonde di
dominio contro un database vero (`scripts/pp-02-uat.mjs`, 86 prove), le
proprieta strutturali dai test — e quello che resta e cio che si guarda con gli
occhi.

Per ogni riga c'e **cosa succedeva prima**, che e il modo piu rapido di
riconoscere una regressione: se vedi il comportamento della colonna «prima», la
correzione non e arrivata.

## Come prepararsi

Serve, su `easygame-staging`:

- un account **genitore con due figli** collegati nello stesso club — e la
  configurazione su cui meta di PP-02 si misura;
- un account **genitore con un figlio solo**, per il verso opposto;
- un account **gestionale** (proprietario o club manager) dello stesso club.

Se non esiste un genitore con due figli, collegarne uno dalla scheda di un
secondo atleta e sufficiente.

---

## A — La scelta del figlio

| # | Cosa fare | Cosa deve succedere | Cosa succedeva prima |
|---|---|---|---|
| A-1 | Entra con il genitore di **due** figli | Si apre la schermata «Di quale figlio vuoi occuparti?» | uguale (W6-12) |
| A-2 | Guarda una riga | Foto, nome, **«Classe 2013 · Nome del club»**, e sotto **tutte** le categorie con la sede fra parentesi | c'erano nome, club e la **sola** categoria primaria |
| A-3 | Se uno dei due non e piu iscritto | Sulla sua riga una pastiglia ambra: «Non piu iscritto» | niente: due righe identiche, una viva e una no |
| A-4 | Scegli un figlio, poi guarda **il contenuto** della pagina | In cima **non** c'e piu la fascia bianca «Stai vedendo …» | la fascia occupava la prima riga di ogni pagina |
| A-5 | Guarda la barra laterale, in basso | Foto e nome del figlio, e sotto «Cambia figlio» | non c'era |
| A-6 | Restringi a 375 px e apri il menu | La prima sezione del menu si chiama «FIGLIO · Nome», con dentro «Cambia figlio» | non c'era |
| A-7 | Con il genitore di **un** figlio solo | Ne la scheda in barra ne «Cambia figlio» compaiono | — |
| A-8 | Da una pagina qualunque, cambia l'indirizzo in `/parent-view/pippo` | «Accesso non disponibile», con **due** pulsanti: «Riprova» e «Scegli il figlio» | si apriva il cruscotto del **primo** figlio, con il suo nome accanto, senza dire niente |
| A-9 | Ricarica una pagina profonda, es. `/parent-view/<id>/payments` | Resta su quel figlio e su quella pagina | uguale |
| A-10 | Vai avanti e indietro con i tasti del browser fra due figli | Ogni pagina parla del figlio del proprio indirizzo | uguale |

## B — Le squadre del figlio

| # | Cosa fare | Cosa deve succedere | Cosa succedeva prima |
|---|---|---|---|
| B-1 | Home dell'area famiglia, riquadro «Atleta» | Sotto il nome, **tutte** le categorie separate da `·`, con «(principale)» su una sola | uguale (W6-14) |
| B-2 | Con un figlio in due categorie su **due sedi** | Nella schermata di scelta, accanto a ogni categoria il **nome** della sede | c'era l'identificativo della sede, o niente |
| B-3 | Con un club a sede unica | Nessuna sede scritta accanto alle categorie | — |

## C — La stagione

| # | Cosa fare | Cosa deve succedere | Cosa succedeva prima |
|---|---|---|---|
| C-1 | Guarda la barra in alto, in una pagina dell'area famiglia | Accanto al nome del club, la targhetta **«Stagione 2026/27»** | «Nessuna stagione attiva», su un club che ne ha una |
| C-2 | Ricarica con `Ctrl+F5` e guarda **subito** la barra | La stagione c'e gia alla prima pittura | compariva «Nessuna stagione attiva» e poi si correggeva |
| C-3 | Prova con un tutore **senza tessera di club** | La stagione si legge lo stesso | «Nessuna stagione attiva» per sempre |
| C-4 | Prova a cliccare sulla targhetta della stagione | Non e cliccabile | portava a `/organization`, che per un genitore e un rimbalzo |

## D — Il pagamento

| # | Cosa fare | Cosa deve succedere | Cosa succedeva prima |
|---|---|---|---|
| D-1 | Pagamenti, con una rata aperta e il club **senza** incassi online configurati | «Paga ora» **spento**, e sotto la frase «Il pagamento online non e attivo per questa societa: la quota si salda in segreteria.» | il pulsante era **acceso** e l'errore arrivava dopo il clic |
| D-2 | Con nessuna rata aperta | «Paga ora» spento, e sotto «Non ci sono rate da saldare.» | spento, con il motivo dentro un `title` che su un telefono non esiste |
| D-3 | Nel dettaglio del piano, con il canale spento | Anche i pulsanti di riga sono spenti, e la didascalia dice la stessa frase | i pulsanti di riga restavano accesi e rispondevano con un errore rosso |
| D-4 | Con il club che **ha** gli incassi online e una rata aperta | «Paga ora» acceso, nessuna frase sotto; il clic porta al checkout del club con l'importo e la causale della rata | uguale |
| D-5 | Torna indietro dal checkout senza pagare | La rata resta aperta | uguale |

## E — Le ricevute

| # | Cosa fare | Cosa deve succedere | Cosa succedeva prima |
|---|---|---|---|
| E-1 | Pagamenti, in fondo | **Una** sezione, «Ricevute e documenti di pagamento», con ricevute e fatture insieme, in ordine di data | due card separate, e le fatture comparivano solo se ce n'era almeno una |
| E-2 | Guarda una riga | Causale, importo, tipo, numero, data, **nome del figlio**, stato, e due pulsanti: «Visualizza» e «Scarica» | causale, data, importo e «Scarica» |
| E-3 | Premi «Visualizza» | Il documento si apre in una scheda nuova | uguale |
| E-4 | Premi «Scarica» | Il file viene salvato | non c'era |
| E-5 | Con una ricevuta annullata dal club | Si legge, con la pastiglia rossa «Annullata» | non si distingueva |
| E-6 | A 375 px | La riga si impila e i due pulsanti vanno a capo: nessuno viene tagliato | con la riga a tre blocchi, «Scarica» poteva finire fuori dal bordo |

## F — Il certificato

| # | Cosa fare | Cosa deve succedere | Cosa succedeva prima |
|---|---|---|---|
| F-1 | Home, riquadro «Certificato» | Etichetta (**Valido / In scadenza / Scaduto / Consegnato / Mancante**) e sotto la data | solo l'etichetta, senza data |
| F-2 | Home, riquadro «Avvisi» | Una riga sola: «Valido — Scade il 01/06/2027» | due paragrafi separati |
| F-3 | Con un certificato caricato **senza** data di scadenza | «Consegnato — Data di scadenza non disponibile» | «Certificato mancante», che non e vero |
| F-4 | Confronta la data con quella sulla scheda del club | **Lo stesso giorno** | poteva essere il giorno prima |
| F-5 | Con un certificato in scadenza o scaduto | Il pulsante «Aggiorna il certificato» porta ai Documenti con il tipo gia scelto | uguale |

## G — I documenti

| # | Cosa fare | Cosa deve succedere | Cosa succedeva prima |
|---|---|---|---|
| G-1 | Documenti, terza card «Moduli online» | Un **elenco** dei moduli pubblicati dal club, con stato, scadenza e data di invio | una frase e un pulsante «Vai ai moduli» |
| G-2 | Su un modulo mai compilato | Pastiglia ambra «Da compilare» e un pulsante «Compila» | — |
| G-3 | Su un modulo gia inviato che si puo rimandare | Pastiglia blu «Inviato», la data, e «Compila di nuovo» | — |
| G-4 | Su un modulo «una volta sola» gia compilato | Pastiglia verde «Completato», **nessun pulsante**, e la frase che spiega di scrivere alla segreteria | — |
| G-5 | Su un modulo chiuso | Pastiglia rossa «Scaduto», nessun pulsante | — |
| G-6 | Le prime due card, «Da fare» e «Documenti» | Invariate | — |

## H — La coda del club

| # | Cosa fare | Cosa deve succedere | Cosa succedeva prima |
|---|---|---|---|
| H-1 | Con l'account gestionale, apri **Documenti** dal menu SEGRETERIA | La coda con i sette filtri: Nuovi, Da integrare, Certificati, Identita, Scaduti, Approvati, Tutti | uguale (W6-39) |
| H-2 | Approva un documento e torna nell'area famiglia | Lo stesso documento risulta approvato, nella stessa parola | uguale |
| H-3 | Rifiutane uno scrivendo il motivo | Nell'area famiglia compare in «Da fare» con il motivo del club scritto | uguale |

## J — La modulistica

| # | Cosa fare | Cosa deve succedere | Cosa succedeva prima |
|---|---|---|---|
| J-1 | Modulistica → Moduli online → scheda «Modelli consigliati EasyGame» | Sotto ogni modello, «Cosa chiede questo modulo»: aprendolo si legge l'elenco dei campi | nessuna anteprima: per saperlo bisognava adottarlo |
| J-2 | Il pulsante di adozione | Dice **«Usa modello»** | diceva «Adotta» |
| J-3 | Apri un modulo del club → Impostazioni | C'e l'interruttore «Si compila una volta sola» | non c'era |
| J-4 | Accendilo, pubblica, e fai compilare il modulo a una famiglia due volte | Il secondo invio viene rifiutato con «Questo modulo e gia stato compilato…» | il secondo invio creava una seconda pratica |
| J-5 | Un modulo **non** pubblicato | Non compare alla famiglia | uguale |

## K — La segreteria

| # | Cosa fare | Cosa deve succedere | Cosa succedeva prima |
|---|---|---|---|
| K-1 | Con l'account gestionale, apri **Appuntamenti** | In cima, la card «Come riceviamo» | non c'era |
| K-2 | Aggiungi un motivo, es. «Colloquio con la segreteria», 30 minuti | Compare nell'elenco | il motivo non era configurabile |
| K-3 | Nell'area famiglia, Segreteria | Il campo «Motivo» e una **tendina** con i motivi del club | era un campo di testo libero |
| K-4 | Togli tutti i motivi | Nell'area famiglia il campo torna libero | — |
| K-5 | Spegni «Le famiglie possono prenotare» | Nell'area famiglia il modulo sparisce e compare «Le richieste online non sono attive» | non c'era modo di chiudere le richieste se non spegnendo le fasce a una a una |
| K-6 | Riaccendilo, prenota, e con l'account gestionale conferma | La famiglia riceve la notifica e vede lo stato confermato | uguale |

## L — Le strutture

| # | Cosa fare | Cosa deve succedere | Cosa succedeva prima |
|---|---|---|---|
| L-1 | Con l'account gestionale: una struttura con «Prenotabile dalle famiglie» **acceso**, un campo con fasce dichiarate e una tariffa | — | — |
| L-2 | Nell'area famiglia, Strutture, prenota **dentro** una fascia | La richiesta va a buon fine | **«Struttura non prenotabile», sempre, su qualunque struttura** |
| L-3 | Prova a prenotare **fuori** dalle fasce | Rifiuto che dice quali sono le fasce aperte | la richiesta passava e arrivava in segreteria |
| L-4 | Con l'account gestionale, guarda le notifiche | C'e l'avviso della richiesta | non arrivava niente |
| L-5 | Spegni «Prenotabile dalle famiglie» su una struttura | Sparisce dall'area famiglia | uguale (W6-54) |

## O — Gli allenamenti

| # | Cosa fare | Cosa deve succedere | Cosa succedeva prima |
|---|---|---|---|
| O-1 | Con l'account gestionale, elimina una categoria che ha allenamenti in programma, poi apri **Allenamenti** e premi «Rimuovi allenamenti in programma» | Un dialogo dell'applicazione, e dopo la conferma la pulizia **riesce** | «Errore durante la pulizia degli allenamenti…», sempre |
| O-2 | Se fra quelli da togliere c'e un allenamento con l'appello gia fatto | Il messaggio dice quanti sono stati tolti **e** quanti no, e perche | il conteggio prometteva anche quelli che non si potevano togliere |
| O-3 | Apri lo stesso allenamento in due schede, modificalo nella prima, poi salva nella seconda | La seconda riceve «L'evento e stato modificato da qualcun altro» e la pagina **si ricarica da sola** | la seconda sovrascriveva la prima, in silenzio |

## N — Le larghezze

Da guardare a **375 px**, **768 px**, **1280 px** e **1440 px**, su queste
schermate: scelta del figlio, Home, Pagamenti, Ricevute, Documenti (tutte e tre
le card), Iscrizione, Segreteria, Strutture, Certificato.

| # | Cosa guardare |
|---|---|
| N-1 | Niente scorre in orizzontale: la pagina non e mai piu larga dello schermo |
| N-2 | Nessun pulsante e tagliato dal bordo di una card |
| N-3 | La barra laterale a 264 px, e la scheda del figlio dentro non allarga la barra con un nome lungo |
| N-4 | A 375 px il menu si apre e la prima voce e «Cambia figlio» |
| N-5 | Gli stati vuoti («Nessuna ricevuta disponibile», «Il club non ha pubblicato nessun modulo online») si leggono e non lasciano una card vuota |
| N-6 | I due orari della prenotazione di un campo si impilano invece di stringersi |

---

## La verifica a schermo, fatta

La checklist qui sopra e cio che deve fare **una persona**. Prima di consegnarla
il pacchetto e stato guardato **a schermo** su una build vera
(`NEXT_DIST_DIR=.next-verify npm run build` + `scripts/start-verify-server.mjs`),
con un genitore seminato sul database di sviluppo e due figli, alle quattro
larghezze del mandato.

| Larghezza | Cosa e stato guardato | Esito |
|---|---|---|
| 1280 | Scelta del figlio, Home, Pagamenti | La scheda porta **«Classe 2013 · Club»** e la categoria; l'intestazione dice **«STAGIONE 2026/2027»** e non «Nessuna stagione attiva» |
| 375 | Pagamenti, Documenti | Le colonne si impilano, niente scorrimento orizzontale, il motivo del pagamento va a capo sotto il pulsante |
| 768 | Documenti | La barra si riduce a icone e le tre sezioni restano leggibili |
| 1440 | Segreteria | «Prenota appuntamento» dice perche non si puo, e offre «Aggiorna» |

Cio che si e visto con gli occhi, e che vale la pena scrivere:

- **§C** — l'intestazione porta la stagione. Era il difetto per cui il riquadro
  diceva «Nessuna stagione attiva» con una stagione configurata.
- **§F** — il riquadro del certificato scrive per esteso **«Mancante — Data di
  scadenza non disponibile»**, con «Aggiungi il certificato». E la forma alla
  lettera del mandato, ed e anche la correzione R2 del secondo round: senza
  quella, li ci sarebbe stata la sola frase sulla data.
- **§D** — «Paga ora» non e un pulsante morto: accanto c'e **«Non ci sono rate
  da saldare»**, e piu sotto «Il club non ha ancora emesso rate».
- **§A** — la barra dice «STAI VEDENDO / Bianchi Marco» con «Cambia figlio», e a
  375 px la stessa voce vive nel menu. Nessuno switch sempre presente.
- **§G/§J** — «Da fare», «Documenti», «Moduli online», ognuna con il suo stato
  vuoto onesto; i moduli non pubblicati **non compaiono**.
- **Link diretto** — `/parent-view/<id-del-figlio>/payments` apre la pagina nel
  contesto giusto. Un percorso che **non e** un figlio riporta alla scelta,
  invece di aprire il primo della lista: e la rimozione del ripiego
  `UUID_PATTERN`, vista da fuori.
- Nessun errore in console su nessuna delle quattro larghezze.

**Una nota su come si e arrivati qui.** Il primo giro e stato fatto su una build
di verifica **vecchia**, e l'API dei figli rispondeva senza `birthYear` e senza
`categories`: sembrava un difetto del codice. Non lo era, era l'artefatto. Vale
la pena scriverlo perche la prossima volta il sospetto vada prima li:
`.next-verify` non si ricostruisce da solo.

---

## P — La revoca di un tutore (round 7-12)

Questa parte non c'era nel mandato originale: e nata da sei round di revisione
ostile, e **e la piu importante da provare a mano**, perche riguarda chi vede il
fascicolo sanitario di un minore.

Serve: due account genitore (`A` e `B`), un minore con entrambi come tutori, e
un ruolo di segreteria.

| # | Cosa fare | Cosa deve succedere |
|---|---|---|
| P1 | Con `A` collegato al minore, apri l'area famiglia | Si apre: calendario, pagamenti, documenti, certificato |
| P2 | Dalla scheda del minore, premi **«Scollega account»** su `A` | La scheda dice «Account non collegato» |
| P3 | Ricarica l'area famiglia con `A` | **Accesso negato.** Prima di questa correzione `A` continuava a vedere tutto, byte del certificato medico compresi |
| P4 | Con la segreteria, apri la scheda del minore e **salva una sezione qualunque** (o carica un certificato) | Ricaricando l'area famiglia con `A`: ancora negato. Il salvataggio non deve riaprire l'accesso |
| P5 | Aggiungi sulla scheda un tutore **nuovo** con lo **stesso indirizzo** di `A` | `A` resta fuori: la revoca vale per l'identita, non per la riga |
| P6 | Genera un invito per `A` e fallo riscattare | `A` rientra, e **torna a ricevere** i promemoria del certificato: un accesso ridato si ridà per intero |
| P7 | Controlla che `B` non sia mai stato toccato | `B` entra sempre, in ogni passo qui sopra |

### P8 — Il modulo pubblico (il piu delicato)

| # | Cosa fare | Cosa deve succedere |
|---|---|---|
| P8a | Da una finestra **anonima**, apri il link pubblico di iscrizione e compila i campi del **tutore** con un indirizzo tuo di prova | L'invio riesce |
| P8b | Dalla segreteria approva la pratica, scegliendo il minore proposto fra i duplicati | La riga tutore compare sulla scheda |
| P8c | Registra un account con quell'indirizzo e apri l'area famiglia | **Accesso negato.** Prima di questa correzione l'area del minore si apriva per intero |
| P8d | Controlla che quel contatto **non** riceva il sollecito degli insoluti ne i promemoria del certificato | Nessun invio: un indirizzo dichiarato da uno sconosciuto non e una credenziale, e i solleciti portano un link di pagamento |

### P9 — Il rinnovo, che deve continuare a funzionare

| # | Cosa fare | Cosa deve succedere |
|---|---|---|
| P9a | Con `B`, dall'area famiglia, invia il **rinnovo** dell'iscrizione | L'invio riesce |
| P9b | La segreteria approva | `B` **continua a entrare** nell'area famiglia |

> P9 e il verso opposto di P8: per un round intero il rinnovo che una famiglia
> mandava dalla propria area le toglieva l'accesso, e colpiva proprio le
> famiglie che entrano con l'indirizzo scritto dalla segreteria.

## Q — L'RSVP e l'area del ragazzo

| # | Cosa fare | Cosa deve succedere |
|---|---|---|
| Q1 | Crea un allenamento che **chiede conferma**, per la categoria del figlio | L'invito arriva alla famiglia |
| Q2 | Con il genitore, premi **«Ci sara»** | La risposta viene registrata. Per un round il prodotto rifiutava **ogni** risposta con «questo evento non riguarda l'atleta» |
| Q3 | Prova a rispondere su un allenamento di **un'altra categoria** | Rifiutato, ed e giusto |
| Q4 | Con l'account di un **atleta**, apri la sua bacheca | Si apre. Per un round rispondeva 403 |
| Q5 | Con l'account dell'atleta, apri il pannello della campanella e segna letta una notifica | Il contatore cala e resta calato dopo un ricaricamento |
