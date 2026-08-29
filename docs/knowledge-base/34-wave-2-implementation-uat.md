# 34 — Wave 2: implementazione e collaudo

**Data:** 2026-08-29
**Baseline:** `integration/web-v1` @ `790c7d4`
**Contratto:** [33 — Wave 2: planning esecutivo](33-wave-2-planning.md)
**Stato:** in corso di verdetto — vedi [§9](#9--verdetto)

> Il documento [33](33-wave-2-planning.md) dice **cosa** si sarebbe fatto e
> **perche**. Questo dice **cosa e stato fatto davvero**, con la prova, e dove
> l'esecuzione si e discostata dal piano.

---

## Indice

1. [Cosa e cambiato per il club](#1--cosa-e-cambiato-per-il-club)
2. [Le sei lane](#2--le-sei-lane)
3. [Dove ci siamo discostati dal piano](#3--dove-ci-siamo-discostati-dal-piano)
4. [Il collaudo a runtime](#4--il-collaudo-a-runtime)
5. [Prestazioni](#5--prestazioni)
6. [Responsivita](#6--responsivita)
7. [I bug trovati durante la Wave](#7--i-bug-trovati-durante-la-wave)
8. [Audit e seconda revisione](#8--audit-e-seconda-revisione)
9. [Verdetto](#9--verdetto)
10. [Residui dichiarati](#10--residui-dichiarati)

---

## 1 — Cosa e cambiato per il club

| Prima | Adesso |
|---|---|
| Il testo di ogni messaggio e codice: cambiare una parola apre una richiesta di assistenza | Il club scrive con le sue parole, con i segnaposto del catalogo, e vede il messaggio **come lo leggera il primo destinatario** prima di mandarlo |
| Sollecitare senza dare il modo di pagare produce un secondo sollecito | Nel sollecito c'e un link che vale trenta giorni, si spegne quando serve, e se la rata e gia saldata **lo dice** invece di prendere altri soldi |
| Per dire una cosa a trenta famiglie si apre WhatsApp, e il dato esce dal gestionale | Si sceglie categoria, gruppo o sede; si vede **prima** chi si raggiunge e chi no con il motivo; dopo l'invio si sa a chi e arrivato |
| Una famiglia con due figli riceve due messaggi identici | Ne riceve **uno**, che li nomina entrambi |
| I promemoria sui certificati partono, ma il club non li governa: non li spegne, non ne sceglie il momento, non ne cambia il testo | Quattro regole con interruttore, fino a tre anticipi, pubblico e testo. Tutte **nate spente** |
| Trenta promemoria al giorno alla societa sono trenta email | Una sola, se il club sceglie il riepilogo giornaliero |
| «Domenica il campo e chiuso» e una notifica che sparisce dopo sei giorni | E un avviso in bacheca, con l'allegato, ai destinatari giusti, programmabile e con una scadenza. Accanto: quanti lo vedono e quanti lo hanno aperto |
| L'allenatore scopre chi manca la sera stessa | Il giorno prima vede tre numeri — **si, no, senza risposta** — e chiama solo i terzi |
| «Gli ho gia scritto?» si risponde in tre modi diversi, e «cosa gli ho scritto?» non si risponde affatto | Una riga sola risponde a entrambe |

---

## 2 — Le sei lane

L'ordine di merge e quello deciso al §13 del planning — **F → B → C → E → A →
D** — con una barriera davanti a tutte, che il planning non aveva previsto come
commit a se.

| Lane | Commit | Cosa contiene |
|---|---|---|
| **barriera** | `b560cab` | Le tre migrazioni e la matrice dei permessi, scritte **una volta sola prima di aprire le lane**. Il §12 del planning indicava proprio queste come il conflitto vero: tre migrazioni create in parallelo collidono sui timestamp, e quattro copie della stessa matrice restano indietro in silenzio |
| **W2-F** — contenuto | `08b04cf` | 14 segnaposto nuovi nel catalogo **esistente**; `src/lib/messages/` rende un modello in testo e in HTML in modo deterministico; i segnaposto economici hanno un interruttore proprio, predefinito negato |
| **W2-B** — link di pagamento | `1b69819` | Token opaco, solo l'impronta in archivio, ambito e scadenza nella riga; pagina pubblica a tre stati; rate limit per token **e** per indirizzo; lo stesso `openGatewayCheckout` del canale autenticato |
| **W2-C** — pubblico e registro | `75bed42` | L'audience engine, `communication_deliveries`, la comunicazione massiva, e la **migrazione del sollecito di Wave 1** sopra entrambi |
| **W2-E** — RSVP | `5493122` | Colonne separate su `training_attendance`, la chiave unica che mancava, il componente orfano riscritto, la vista «senza risposta» dentro l'appello |
| **W2-D** — bacheca | `76d8f34` | Annunci in `club_resource_items`, pubblico dall'audience engine, letto/non letto dal registro, allegati su Attachment Core |
| **W2-A** — automazioni | `66e71c5` | Il valutatore notturno, quattro regole, il riepilogo giornaliero, la porta cron, la schermata di configurazione |
| — | `d0844a6`, `5b97089` | Il collaudo a runtime, con un server SMTP finto per provare una consegna vera |
| — | `f75550e`, `7f42626` | ADR-0083..0087, il registro API, la matrice dei permessi in KB e il debito dichiarato |

### 2.1 EXTEND vs NEW — il conto sul codice scritto

Il §3.1 del planning prevedeva **due capability nuove** nel motore
(catalogo delle regole, registro delle consegne); il §18.2 ne contava **quattro**
sull'intera Wave, aggiungendo l'audience engine e il link di pagamento. E cio che
e stato fatto:

| # | Capability nuova | Perche non poteva essere un'estensione |
|---|---|---|
| 1 | **Audience engine** (`src/lib/audience/`, `src/lib/server/audience.ts`) | Non esisteva nessun risolutore del pubblico: ne esistevano **due parziali con politiche divergenti**, dentro due moduli che facevano altro |
| 2 | **Registro delle consegne** (`communication_deliveries`) | Le tre deduplica esistenti vivevano dentro le notifiche e dentro l'anagrafica: non c'era una riga che rispondesse a «cosa gli ho scritto» |
| 3 | **Catalogo delle regole** (`src/lib/automations/`) | La configurabilita di un promemoria non esisteva in nessuna forma |
| 4 | **Link di pagamento** (`payment_links`) | Nessuna superficie pubblica apriva un pagamento |

Tutto il resto **estende**: la porta cron, il giro per club, il modello
`Notification`, `src/lib/server/email/`, `recordAuditEvent`, il catalogo dei
segnaposto, `training_attendance`, `club_resource_items`, Attachment Core,
`openGatewayCheckout`, `AuthRateLimitBucket`.

Due moduli nuovi che **non** sono capability nuove, e vale la pena dirlo:
`src/lib/announcements/model.ts` e `src/lib/rsvp/model.ts` sono la parte pura di
due domini che scrivono su tabelle gia esistenti, e non aggiungono niente che il
prodotto non sapesse gia rappresentare.

---

## 3 — Dove ci siamo discostati dal piano

Quattro scostamenti. Sono dichiarati qui perche il planning e il contratto, e un
contratto che cambia in silenzio non e piu un contratto.

### 3.1 La barriera di schema e diventata un commit a se

Il §12 del planning prescriveva «ogni lane possiede esattamente una migrazione,
e la crea al momento del merge». In esecuzione si e visto che non bastava: le
lane parallele avrebbero comunque toccato `prisma/schema.prisma`, che e **un
file solo**, e la matrice dei permessi serviva a quattro lane su sei prima che
la prima finisse.

Le tre migrazioni e i permessi sono quindi stati scritti **prima**, in un commit
di fondazione, e le lane hanno avuto il divieto di toccare lo schema. E uno
scostamento dalla lettera del piano che ne rispetta lo scopo: nessuna collisione
di timestamp, nessuna matrice duplicata.

### 3.2 Gli annunci e le regole non passano dal registro generico delle risorse

Il §8 del planning diceva «risorsa di club nuova `announcements` in
`club_resource_items` (quindi dentro `resources.ts`)». Non e stato fatto cosi, e
la ragione e emersa leggendo `resources.ts`: aggiungere un tipo a
`CLUB_RESOURCE_TYPES` lo aggiunge anche a `CLUB_JSON_FIELDS`, cioe pretende una
colonna `Json?` su `clubs` da tenere sincronizzata a ogni scrittura. E la
duplicazione **D-B**, gia registrata come debito nel §9 dell'audit
[30](30-golee-easygame-gap-audit.md).

Le righe si scrivono quindi direttamente da moduli di dominio dedicati
(`src/lib/server/announcements.ts`, il lettore delle regole in
`src/lib/server/automations.ts`), con `organization_id` sempre nel `where`. La
tabella e quella prevista; il registro generico no.

### 3.3 Un permesso in piu rispetto ai sette del planning

Il §11 elencava sette permessi. Ne sono stati scritti **otto**:
`communications.audience_economic` e stato separato da `communications.send`.

Il motivo e il requisito stesso del planning — «un allenatore non deve ottenere
informazioni economiche tramite l'audience engine» — che con un permesso solo
non sarebbe stato esprimibile: chi puo mandare avrebbe potuto anche selezionare
gli insoluti. Separandoli, oggi i due hanno lo stesso perimetro e domani possono
non averlo.

### 3.4 Il sollecito e stato migrato, ma non del tutto

Il §6 del planning prometteva che `payment-reminders.ts` fosse «portato sopra
l'audience engine». E stato fatto per la **risoluzione dei contatti** e per la
**rivendicazione**, che erano le due duplicazioni vere. Non e stato fatto per la
forma del messaggio: il sollecito resta **per atleta**, mentre la comunicazione
massiva fonde le posizioni della stessa famiglia in un messaggio solo.

Non e una svista: il sollecito parla di **una posizione economica** — residuo,
rate scadute, prossima scadenza — e fondere due figli in un messaggio solo
direbbe un residuo che non e quello di nessuno dei due. La differenza e voluta,
ed e la stessa ragione per cui i segnaposto economici non si risolvono in una
comunicazione massiva.

---

## 4 — Il collaudo a runtime

### 4.1 Ambiente e disciplina

| Voce | Valore |
|---|---|
| Database | **sviluppo locale** — `127.0.0.1:5434/easygame_dev`, `EASYGAME_DB_ENV="development"` |
| Applicazione | `next dev` su `127.0.0.1:3010`, avviata per il collaudo e **spenta al termine** |
| Percorso | **HTTP reale**, con cookie di sessione vero e le stesse rotte del browser |
| Email | **consegna vera** verso un server SMTP finto su TLS, montato dal collaudo |
| Scritture | due club QA con prefisso `UAT-W2`, 125 atleti, rate, allenamenti, annunci; piu la riga di configurazione SMTP |
| Pulizia | **eseguita e verificata**: club QA residui 0, utenti QA residui 0, consegne 0, link 0, presenze 0. La configurazione SMTP e tornata al valore precedente |
| Script | `scripts/wave-2-communications-uat.mjs`, nel repository |

### 4.2 Perche il server SMTP finto, e cosa cambia

Il collaudo della Wave 1 non poteva provare una consegna: SMTP non era
configurato sull'ambiente di sviluppo, e l'unico scenario verificabile era «il
prodotto non deve dire *inviato*». Utile, ma lascia fuori la meta che conta.

Qui il collaudo **monta un server SMTP** su TLS diretto con un certificato
autofirmato generato al volo, e configura EasyGame per parlarci. Da questo
discendono tre verifiche che prima non erano possibili:

1. «inviato» significa inviato: **il messaggio si rilegge nel sink**, con i
   segnaposto risolti;
2. il **fallimento parziale** si prova davvero, rifiutando un destinatario e
   verificando che gli altri partano lo stesso;
3. la deduplica si prova **sui messaggi**, non solo sulle righe di archivio.

Il prezzo e `NODE_TLS_REJECT_UNAUTHORIZED=0` sul processo di sviluppo, perche il
certificato e autofirmato. E una concessione del banco di prova, dichiarata
nella testata dello script, e vale per un processo che viene spento al termine.

### 4.3 Gli esiti, gruppo per gruppo

**67 controlli su 67.**

| Gruppo | Controlli | Cosa dice |
|---|---|---|
| **1 — Il pubblico** | 12/12 | La famiglia con due figli e **un** destinatario con due posizioni; l'atleta senza recapito compare fra gli esclusi con il motivo; categoria, sede e selezione restringono; un criterio inventato risponde **400** invece di allargare il pubblico; l'allenatore riceve **403** sia sugli insoluti sia sull'invio; il club B non vede le famiglie del club A |
| **2 — La comunicazione massiva** | 12/12 | L'anteprima mostra il messaggio vero e **non scrive niente**; due destinatari su tre ricevono davvero e il terzo risulta `failed`; il doppio clic non manda un secondo messaggio; **chi aveva fallito riparte e solo lui**; il registro conserva le due persone rappresentate; un segnaposto inventato blocca l'invio |
| **3 — Il link di pagamento** | 7/7 | Senza il piano il link **non si emette e lo dice**; la pagina pubblica non espone ne club ne rata ne atleta; **token manomesso e token sconosciuto rispondono la stessa cosa**, byte per byte; una rata gia saldata lo dice invece di dare errore; in archivio c'e solo l'impronta; un link revocato risponde come uno sconosciuto |
| **4 — La bacheca** | 10/10 | Un annuncio nasce bozza e non lo legge nessuno; pubblicare raggiunge **solo** il pubblico scelto; pubblicare due volte non consegna due volte; segnare letto funziona una volta sola; la societa vede quanti lo hanno aperto; un annuncio di un altro club risponde **404**; ritirare non cancella le consegne |
| **5 — L'RSVP** | 7/7 | La risposta **non scrive una presenza**; si puo cambiare e resta una riga sola; **due risposte simultanee producono una riga sola**; il club B non risponde per un atleta del club A; l'appello scrive la presenza senza toccare l'intenzione |
| **6 — La scala** | 2/2 | 125 atleti, 123 destinatari risolti in **66-89 ms** |
| **7 — Le porte automatiche** | 2/2 | Senza segreto e con segreto sbagliato: **401**, mai `200` a vuoto |
| **8 — Le automazioni** | 14/14 | La rata a sette giorni produce **un** messaggio; la seconda esecuzione dello stesso giorno **zero**; **due giri in parallelo un messaggio solo**; un anticipo gia trascorso non recupera all'indietro; una regola spenta tace; il giro attraversa quattro club senza fermarsi su quello con la rata orfana; dopo il giro **le rate sono intatte e non e nata nessuna presenza** |

### 4.4 I tre controlli che valgono piu degli altri

- **«Due giri in parallelo producono un messaggio solo».** E il caso in cui un
  controllo applicativo cede, ed e la ragione per cui la deduplica e un indice
  unico e non un `if`.
- **«Token manomesso e token sconosciuto rispondono la stessa cosa».** Il
  confronto e sul **corpo della risposta**, non solo sullo stato: distinguerli
  direbbe a chi prova token a caso quando ha indovinato.
- **«Dopo il giro le rate sono intatte e non e nata nessuna presenza».** E
  l'invariante di ADR-0083 misurata a runtime: un'automazione legge stato e
  manda messaggi, non tocca il dominio.

---

## 5 — Prestazioni

Misurate sul collaudo, su un club con 125 atleti.

| Operazione | Misura | Nota |
|---|---|---|
| Anteprima del pubblico su 125 atleti | **66-89 ms**, 123 destinatari risolti | Nessuna N+1: un test dedicato impone un tetto di **sei interrogazioni** su 202 atleti |
| Invio a 3 destinatari, con consegna SMTP vera | **109-116 ms** | Include il dialogo TLS con il sink |
| Giro delle automazioni, 4 club, prima esecuzione | **463 ms** | Con le occorrenze da servire |
| Giro delle automazioni, seconda esecuzione | **41 ms** | Tutto gia deduplicato: e la misura che dice che il registro fa il suo lavoro |
| Giro del lavoro sportivo (confronto) | 574 ms | Preesistente |
| Giro dei certificati (confronto) | 275 ms | Preesistente |

**Il limite dichiarato.** L'invio massivo e sincrono dentro la richiesta HTTP e
si ferma a `BULK_BATCH_SIZE = 200` destinatari per chiamata, dichiarando quanti
ne restano. Su 123 destinatari sta in un lotto; oltre i 200 il chiamante
richiama, e la ripresa e sicura perche il registro sa chi e gia stato servito.
**Non e stato misurato** un invio da 400 destinatari contro un SMTP lento: e il
caso in cui il lotto serve davvero, e va misurato su staging.

---

## 6 — Responsivita

Verifica **VISUAL**, non solo strutturale: le pagine sono state caricate su una
build di sviluppo con sessione autenticata e misurate a quattro larghezze,
guardando lo scorrimento orizzontale del documento — che e il difetto che una
verifica statica non vede.

| Pagina | 375 | 768 | 1280 | 1440 |
|---|---|---|---|---|
| `/communications` | nessun trabocco | nessun trabocco | nessun trabocco | nessun trabocco |
| `/communications/bacheca` | nessun trabocco | nessun trabocco | nessun trabocco | nessun trabocco |
| `/communications/automazioni` | nessun trabocco | nessun trabocco | nessun trabocco | nessun trabocco |
| `/pay/[token]` (pubblica) | nessun trabocco | — | — | — |

A 375 px la barra delle azioni va a capo invece di tagliarsi, i campi occupano
la larghezza piena e l'elenco degli esclusi scorre nel proprio riquadro. La
pagina pubblica del pagamento mostra lo stato «non disponibile» in una colonna
sola, senza guscio autenticato e senza nessun identificativo.

La console non riporta errori applicativi: gli unici due sono i **404 attesi**
della rotta pubblica interrogata con un token inventato.

**Cosa resta fuori.** Le superfici toccate dalle lane dentro schermate
preesistenti — la sezione RSVP nell'area genitore e il riepilogo dentro
`AttendanceSheet` — sono state verificate in modo **STRUCTURAL** dalle lane, non
VISUAL: richiedono un club con allenamenti e un tutore collegato, che il
collaudo crea e distrugge.

---

## 7 — I bug trovati durante la Wave

*(compilato al termine dell'audit)*

---

## 8 — Audit e seconda revisione

*(compilato al termine dell'audit)*

---

## 9 — Verdetto

*(compilato al termine dell'audit)*

---

## 10 — Residui dichiarati

*(compilato al termine dell'audit)*
