# 42b — PP-01: la UAT a schermo, da percorrere con una sessione

Complemento a [42 — PP-01](42-pp-01-club-atleti-allenamenti.md). Qui stanno
**solo** gli elementi che richiedono un accesso autenticato e un paio d'occhi:
tutto il resto e gia coperto da `scripts/pp-01-uat.mjs` (31/31, contro un
database vero) e dai test strutturali.

Per ogni riga: cosa fare, cosa deve succedere, e **cosa succedeva prima**, che e
il modo piu rapido di riconoscere una regressione.

Larghezze di riferimento: **375 / 768 / 1280 / 1440 px**.

---

## A — Allenamenti

| # | Cosa fare | Atteso | Prima |
|---|---|---|---|
| A1 | Crea un allenamento su **tre** categorie | Il titolo della riga elenca tutte e tre | uguale |
| A2 | **Ricarica la pagina** | Elenca ancora tutte e tre | ne restava **una** |
| A3 | Aspetta che finisca (o creane uno gia passato) e riapri | Ancora tutte e tre, anche nello storico e nel calendario | una sola |
| A4 | Apri il calendario filtrato sulla **seconda** categoria | L'allenamento c'e | non compariva |
| A5 | Entra come allenatore della **sola seconda** categoria | Lo vede nel proprio calendario e ci puo fare l'appello | era fuori perimetro sul proprio allenamento |

## B — Modifica di un allenamento concluso

| # | Cosa fare | Atteso | Prima |
|---|---|---|---|
| B1 | Su un allenamento **concluso**, cerca «Modifica» | Il pulsante c'e | spariva |
| B2 | Su un concluso **senza presenze registrate**, cambia ora e salva | Salva, e resta «concluso» | tornava «in programma», in silenzio |
| B3 | Registra le presenze, poi riapri «Modifica» | In testa al modulo compare l'avviso su cosa e congelato | non c'era |
| B4 | Con le presenze registrate, cambia **solo** titolo e note | Salva | — |
| B5 | Riapri: le presenze ci sono ancora | Nessuna presenza persa | — |
| B6 | Con le presenze registrate, prova a cambiare **il giorno** | Rifiutato, e il messaggio **nomina** i campi congelati e dice cosa resta modificabile | il server accettava e ridatava le presenze |
| B7 | Su una **gara**: chiudi le convocazioni, poi cambia il titolo | Le convocazioni restano chiuse | si **riaprivano** |
| B8 | Annulla un allenamento che ha gia presenze | Si annulla | — |

## C — Conflitto di campo e orario

| # | Cosa fare | Atteso | Prima |
|---|---|---|---|
| C1 | Crea un allenamento su un campo e orario gia occupati | Compare un dialogo dell'applicazione (non la finestrella del browser) | `window.confirm` |
| C2 | Conferma «Inseriscilo comunque» | **L'allenamento viene creato** | «Errore durante l'aggiunta dell'allenamento» |
| C3 | Annulla il dialogo | Non viene creato niente | — |
| C4 | Due allenamenti alla stessa ora su **due campi diversi della stessa struttura** | Nessun avviso, e nascono entrambi | nessun avviso e poi **errore** |
| C5 | Prova un orario in cui la struttura e **chiusa** | Rifiutato, e resta rifiutato: non e scavalcabile | uguale |
| C6 | Doppio clic rapido sul salvataggio | Un solo allenamento | — |
| C7 | Guarda il registro attivita dopo C2 | La riga porta `sovrapposizioneConfermata` | non c'era traccia |

## D — Elenco atleti

Serve un club con almeno un atleta per stato. Sul database di sviluppo li semina
`scripts/pp-01-uat.mjs`; su staging usa atleti veri gia presenti.

| # | Cosa fare | Atteso | Prima |
|---|---|---|---|
| D1 | Apri la pagina Atleti e **guarda il primo mezzo secondo** | Nessun lampeggio di una lista diversa | si vedevano tutti, poi solo gli attivi |
| D2 | Filtro «Sospesi» | Mostra i sospesi, **etichettati «Sospeso»** | — |
| D3 | Filtro «In prestito» | Mostra quelli in prestito, **etichettati «In prestito»** | erano etichettati **«Sospeso»** |
| D4 | Filtro «Disattivati» | Mostra i disattivati, **etichettati «Disattivato»** | erano etichettati **«In Prestito»** |
| D5 | Cambia filtro otto volte di seguito | Nessun passaggio svuota l'elenco | si svuotava |
| D6 | Ricarica su un filtro non-attivo | Il filtro tiene | — |

## E — Foto atleta

Non riproducibile in nessuna sonda: **va riguardato su staging**, dove la
segnalazione e nata, perche li il codice corretto non era ancora arrivato.

| # | Cosa fare | Atteso |
|---|---|---|
| E1 | Carica una foto, salva, ricarica | C'e |
| E2 | Rimuovi, **ricarica** | Non c'e piu |
| E3 | Carica A, sostituisci con B, rimuovi, ricarica | Non c'e piu |
| E4 | Atleta senza foto | Iniziali, nessuna immagine rotta |

## F, G, H, I — Scheda atleta

| # | Cosa fare | Atteso | Prima |
|---|---|---|---|
| F1 | «Elimina» | Chiede conferma con un dialogo che dice cosa si perde | gia cosi |
| G1 | Apri una scheda atleta | In cima ci sono anagrafica e schede, **non** due pannelli di amministrazione | l'accesso e i dati personali occupavano la prima schermata |
| G2 | Cerca «Accesso EasyGame» nell'intestazione | C'e, e apre un dialogo | era un pannello sempre aperto |
| G3 | Nel dialogo: stato, email, invito, ultimo invio, reinvia, revoca | Tutto presente | uguale, ma sempre a schermo |
| G4 | Manda un invito, poi riaprilo | Lo stato e passato a «Invito inviato», con la data | — |
| G5 | Entra come **allenatore** e apri una scheda | Il pulsante «Accesso EasyGame» **non c'e** | — |
| H1 | Cerca «Scansiona documento» sulla scheda | **Non c'e piu**, ne in cima ne nella scheda Documenti | c'era in due punti |
| H2 | Nuovo socio / nuovo staff / nuovo allenatore / nuovo atleta | La lettura del documento c'e ancora e funziona | — |
| H3 | Sulla scheda atleta, aggiungi un **tutore** | Il campo con la lettura del documento c'e ancora | — |
| I1 | Scheda «Generale», scorri in fondo | «Dati personali» e li | era in cima, sopra l'anagrafica |
| I2 | «Mostra cosa contiene» | Funziona come prima | — |

## K, L — Navigazione

| # | Cosa fare | Atteso | Prima |
|---|---|---|---|
| K1 | Desktop 1280 e 1440 px | La barra e piu stretta, e **nessuna etichetta va a capo o si taglia** | 320 px |
| K2 | Il logotipo in alto | Intero, non tagliato | — |
| K3 | Comprimi la barra | 80 px, solo icone, il marchio diventa l'icona | — |
| K4 | Compressa: **passa il mouse** su ogni icona | Fumetto con il nome della pagina | tutte tranne **l'HUB** |
| K5 | Compressa: **Tab** fino alle icone | Il fumetto compare anche col fuoco da tastiera | l'HUB no |
| K6 | 768 px | La barra sparisce, compare la barra in alto col menu | — |
| K7 | 375 px | Menu utilizzabile, niente scorrimento orizzontale della pagina | — |
| L1 | Cerca «Lavoro Sportivo» nella barra | **Una voce sola** | cinque |
| L2 | Aprila | Dentro c'e la riga Dashboard / Rapporti / Compensi / Scadenze / Adempimenti | — |
| L3 | Clicca ognuna delle cinque sezioni | Si apre, ed e segnata come attiva | — |
| L4 | Incolla `/sport-work/compensations` nella barra indirizzi | Si apre | — |
| L5 | Da Contabilita, il link ai compensi | Funziona | — |
| L6 | Menu mobile a 375 px | Anche li una voce sola | cinque |

## J, M — Account e permessi

| # | Cosa fare | Atteso | Prima |
|---|---|---|---|
| J1 | Menu utente in alto a destra -> «Profilo» | Si apre `/account` **con il dialogo del profilo gia aperto** | `/profile/<id>`, che per molti ruoli era vuoto e in errore |
| J2 | Modifica nome e salva | Salva | — |
| J3 | Ripeti come **allenatore**, **genitore**, **collaboratore** | Funziona per tutti | 403 per cinque ruoli su sette |
| J4 | Incolla a mano `/profile/<un-id>` | Rimanda a `/account` col dialogo aperto | apriva la vecchia pagina |
| J5 | Avatar del menu mobile a 375 px | Stessa destinazione | — |
| M1 | Barra laterale, gruppo Configurazione | Si legge «Permessi allenatore» e «Ruoli e accessi» | «Permessi» e «Ruoli e accessi» |
| M2 | Apri «Permessi allenatore» | Funziona come prima: **non e stata toccata** | — |

## Sicurezza — da rifare dopo il deploy

| # | Cosa fare | Atteso |
|---|---|---|
| S1 | Con un club attivo, prova ad aprire un allenamento di **un altro club** | Negato |
| S2 | Ruolo personalizzato recintato su una categoria: calendario | Vede solo gli eventi che toccano la sua categoria |
| S3 | Lo stesso ruolo prova a convocare un atleta **fuori** dal proprio perimetro | Negato (verificato anche in `pp-01-uat.mjs` P-08) |
| S4 | Allenatore su una pagina gestionale che non gli spetta | Negato |

---

## Cosa fare se qualcosa non torna

Annotare **cosa si e fatto, cosa si e visto e cosa ci si aspettava** — e, se e un
errore, il testo esatto del messaggio: da PP-01 §B e §C il messaggio del server
arriva intero all'utente invece di essere sostituito da uno generico, quindi
adesso dice quasi sempre la causa.
