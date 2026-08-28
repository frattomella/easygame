# 26 — Full Club UAT: il collaudo fatto creando un club da zero

**Data:** 2026-08-28 · **Branch:** `integration/web-v1` · **Base:** `10d06ca`

Come [24 — RC Fix 1](24-rc-fix-1.md) e [25 — RC Fix 2](25-rc-fix-2.md), questo
documento risponde a una domanda sola: **cosa era rotto, perche, e come si sa
che adesso funziona.**

## Il metodo, e perche ha trovato cose diverse dai giri precedenti

RC Fix 1 e RC Fix 2 hanno collaudato un'applicazione **gia configurata**: un
club che esisteva, con le sue stagioni, le sue categorie e i suoi atleti.
Questo giro ha fatto l'unica cosa che nessuno dei due aveva fatto: **ha creato
un club da zero e ci ha lavorato dentro**, dalla registrazione fino
all'incasso di una rata.

Sette dei nove difetti di questo documento **non erano raggiungibili su un
club gia configurato**. Il piu grave — un club che esce dall'onboarding con
due stagioni e le categorie invisibili — richiede letteralmente di premere
«Crea club».

La seconda differenza e il **dataset**. RC Fix 2 aveva imparato che «conta con
quali dati»; qui i dati sono stati costruiti apposta per rompere: un file di
import di venti righe con tutte le patologie di un export vero — date
impossibili, il 29 febbraio di un anno bisestile e di uno che non lo e, un
nome con l'accento, un cognome con l'apostrofo, una virgola dentro un campo
quotato — e poi duecento atleti per vedere cosa fa l'applicazione quando
l'archivio non sta piu in una pagina.

La terza e che **due difetti si vedono solo interrogando il database**, non
guardando lo schermo: i record marcati con una stagione che non esiste e i
nomi salvati in forma Unicode decomposta. A schermo erano identici a quelli
giusti.

## I nove difetti

### 1. Un club nuovo nasceva con due stagioni, e senza le sue categorie — P1

**Cosa si vedeva.** Finito l'onboarding, l'intestazione diceva «Nessuna
stagione attiva» su un club a cui la stagione era appena stata data. La
Dashboard contava «Categorie Attive 2»; la pagina Categorie diceva «Nessuna
categoria presente». La scheda Stagioni mostrava **due** righe «2026/2027»
indistinguibili, e le due categorie stavano sotto quella archiviata.

**La causa, che sono tre cose intrecciate.**

`normalizeClubSeasons` **sintetizza** una stagione quando il club non ne ha:
serve a non lasciare l'interfaccia senza perimetro dei dati. Non e un dato del
club. Il passo Stagione dell'onboarding scriveva pero `settings.seasons` a
mano — invece di passare dal suo dominio, `src/lib/server/seasons.ts` — e
portava quella stagione sintetizzata nel database insieme a quella scelta,
senza riapplicare l'invariante: **due stagioni, entrambe `status: "active"`**.
Sullo staging il difetto era presente su 2 club su 4.

Da li discende il resto. Lo scaffale locale del club attivo era stato scritto
alla creazione con `activeSeasonLabel: null`, e il passo Stagione non lo
aggiornava: l'intestazione continuava a dire «Nessuna stagione attiva» anche
dopo un ricaricamento, finche non si rientrava dal pannello account. E poiche
`apiRequest` costruisce l'header `x-active-season-id` proprio da li, le
categorie create subito dopo venivano scritte **senza stagione**. Un record
senza stagione appartiene alla piu vecchia, che era la fantasma: fuori dal
perimetro dell'annata attiva, e quindi invisibile.

**Correzione.** L'onboarding crea la stagione da `POST /api/v1/seasons`;
`createClubSeason` non porta in scrittura la stagione sintetizzata e fa
nascere attiva la prima stagione di un club; `rememberActiveSeason` in
`lib/api/client.ts` aggiorna lo scaffale locale — ed e ora l'unico punto di
scrittura, al posto della copia che viveva nella pagina Organizzazione.

### 2. Record marcati con una stagione che il club non ha — P1, latente

Trovato interrogando il database, non aprendo una pagina: **EasyGame FC ha una
categoria e i suoi due gruppi operativi marcati `seasonId: "season-2026-2027"`,
mentre `clubs.settings.seasons` e vuoto.** Sono le anagrafiche di collaudo di
RC Fix 2.

Oggi si vedono per coincidenza: quell'id e lo stesso della stagione
sintetizzata in lettura. Il giorno in cui quel club crea la sua prima stagione
vera, la sintetizzata sparisce dall'elenco e quei tre record non appartengono
piu a nessuna annata — `filterCollectionBySeason` li scartava come «di
un'altra stagione», e sparivano da ogni schermata in silenzio.

**Correzione, sui due lati.** In scrittura: finche il club non ha una stagione
salvata non si marca niente. In lettura: un `seasonId` che nomina una stagione
che il club non ha non e un record di un'altra annata, e un record **senza**
annata, e come tale compare accanto agli altri. Le stagioni vere di altre
annate restano escluse come prima.

### 3. Due incassi simultanei sulla stessa rata si sommavano oltre il dovuto — P0

Il difetto piu grave del giro, e l'unico che tocca i soldi. Documentato per
esteso come incidente **I-02** in [14 — Sicurezza](14-security.md).

**Misurato**, non dedotto: sei richieste concorrenti da 50 € su una rata con
99,80 € di residuo, **quattro accettate**. Stato finale del club di collaudo:

| Rata | Dovuto | Incassato | Incassi | Stato salvato |
|---|---|---|---|---|
| Prima | 130,00 € | **150,00 €** | 3 | `partially_paid` |
| Seconda | 199,80 € | **300,00 €** | 5 | `paid` |

329,80 € dovuti, 450,00 € registrati: **120,20 € di entrate che non esistono**.
E la prima rata risultava `partially_paid` pur avendo incassato piu del dovuto,
perche anche il ricalcolo dello stato girava su una lettura vecchia.

**La causa.** Il controllo di capienza leggeva il registro **prima** di aprire
la transazione che scrive. Non serviva un trucco per arrivarci: due segretarie
sullo stesso incasso, un telefono e un computer, una richiesta ritentata dalla
rete. Il pulsante si disabilita durante l'invio, ma quella e una difesa del
singolo browser e non vale fra due client.

**Perche un indice unico non bastava, e perche non e una svista.**
[ADR-0062](18-decision-log.md) aveva gia chiuso lo stesso difetto sul canale
**online**, con due indici unici parziali. Quegli indici sono parziali di
proposito, e il pezzo che lasciano fuori e esattamente questo: gli incassi
manuali, che un identificativo del provider non ce l'hanno. Ne poteva essere
altrimenti — due incassi da 50 € in contanti sulla stessa rata sono
legittimi. La regola qui non e «questa riga non si ripete», e «la somma delle
righe non supera il dovuto»: un invariante su un aggregato, che un indice non
esprime. Vedi [ADR-0067](18-decision-log.md).

**Correzione.** Le tre operazioni che muovono denaro — incasso, storno,
rimborso — bloccano con `SELECT ... FOR UPDATE` la riga su cui decidono,
**dentro** la transazione, e rifanno li la verifica. Il blocco lo prende una
funzione sola e sempre nello stesso ordine — prima la rata, poi l'incasso —
perche due ordini diversi sulle stesse due righe sono un abbraccio mortale che
si presenta solo sotto carico.

I dati di collaudo sono stati **stornati dall'applicazione**, non cancellati:
l'eccedenza e sparita dai totali e le due rate sono tornate coerenti
(100/130 e 150/199,80), con lo storico intatto.

### 4. Il nome con l'accento non si trovava — P2

Cercando `Niccolò` l'elenco rispondeva «Nessun atleta». Cercando `Niccolo`
trovava l'atleta che si chiama Niccolò.

**La causa non era la ricerca.** `ò` si scrive in due modi — un carattere solo
(NFC) oppure `o` piu accento combinante (NFD) — identici a schermo, diversi
per il database. Verificato: `octet_length` 9 su 8 caratteri,
`first_name = normalize(first_name, NFC)` falso. `ILIKE '%Niccolò%'` su una
stringa decomposta non trova niente; con le sole lettere di base si.

La forma decomposta non arriva da chi digita: arriva dai **file**. Gli export
fatti su macOS la usano, ed e da un import che era entrata. E fa contare a
`length()` un carattere in piu di quelli che si vedono.

> **Correzione a questo documento (revisione indipendente).** La prima
> stesura diceva che la stessa differenza «rompe il riconoscimento dei
> duplicati». **Non e vero**, e il codice lo dice: `identityKey` in
> `src/lib/athlete-import.ts` decompone e toglie i segni diacritici prima di
> confrontare, quindi era gia insensibile sia agli accenti sia alla forma di
> normalizzazione. La riga era una deduzione plausibile che nessuno aveva
> verificato. Vince il codice (CLAUDE.md §1).

**Correzione.** `normalizeAnagraficaText` normalizza a NFC prima di salvare:
nome, cognome, luogo di nascita e genitori, in tutte e cinque le scritture di
anagrafica.

**Restava aperta l'altra meta, chiusa dalla revisione indipendente.** Una
`ILIKE` confronta byte, e normalizzare solo cio che si **scrive** sposta il
difetto invece di chiuderlo: una chiave di ricerca in forma decomposta non
trova un nome in forma composta. E la forma decomposta arriva anche nella
casella di ricerca — incollando da un Finder, da un foglio esportato su macOS
o da certi metodi di inserimento. Ora la chiave si normalizza a NFC nei due
percorsi di ricerca: `buildSearchFilter` per i club sopra la soglia di
paginazione, e il filtro nel browser per tutti gli altri — che sono la
maggioranza, e che dal primo non passano mai.

### 5. L'import accettava una data di nascita nel 2030 — P2

Il file ostile di venti righe ha dato un riepilogo giusto — 19 lette, 11
importabili, 8 scartate — e ogni scarto motivato con precisione, comprese le
due date di febbraio: il **29 febbraio 2016 passa, quello del 2015 no**. Ma
tre righe uscivano «Pronta» senza esserlo:

- `05/05/2030` — una data di nascita nel futuro. Ora e uno scarto: non e un
  dato discutibile, e impossibile;
- `05/05/1890` — `toIsoDate` rifiuta gia da sempre un anno **numerico** minore
  di 1900, ma la stessa cifra scritta come testo passava. Due strade per lo
  stesso dato non possono dare due risposte diverse;
- `2016` nella colonna **data** diventava il 1 gennaio senza dire niente. La
  riga resta importabile — meglio un atleta con una data approssimata che
  nessun atleta — ma ora l'avviso c'e. Nella colonna «Anno di nascita» un anno
  secco resta il dato atteso e non produce rumore.

Da quella data discendono eta, categoria per anno di nascita e codice fiscale:
inventarla produce un codice **plausibile e sbagliato**, che e la categoria di
difetto peggiore.

### 6. Nell'anteprima dell'import, scartata e con-avviso le distingueva il colore — P3

«Codice fiscale non valido» (rosso: la riga **non** verra creata) e «Sesso non
riconosciuto» (ambra: la riga verra creata senza quel campo) erano due frasi
di problema con la stessa forma. La differenza non e il problema, e la
conseguenza. Ora la riga la scrive.

### 7. Il numero in cima all'elenco Atleti diceva 200 su 212 — P2

Sopra la soglia di paginazione i tre conteggi «Atleti Attivi / Sospesi / in
Prestito» si ricavavano da `athletes`, che e la **pagina caricata**. Su un club
con 212 atleti tutti attivi la riga diceva «Atleti Attivi: 200», due centimetri
sopra la barra che diceva «212 atleti nell'archivio». Ora, quando il server
pagina, il numero e quello che il server ha contato — ed e gia filtrato per lo
stato scelto, quindi ne basta uno.

### 8. La porta d'ingresso, e il pannello con cui nasce un club — P2/P3

Quattro cose che la schermata di accesso **dice**, che su una pagina di
accesso e tutto quello che c'e: un riquadro che spiegava all'utente finale
come si popolano le variabili d'ambiente OAuth; «Invalid login credentials»,
unica frase inglese del prodotto e la prima che si incontra sbagliando;
il titolo «Accedi» anche su `/register`; il riquadro d'errore che non era un
`alert` e quindi non veniva annunciato.

Nel pannello «Crea club», due difetti che si vedono solo aprendo una seconda
scheda: gli id dei campi erano ricavati dal testo dell'etichetta, e con due
«Nome contatto», due «Telefono», due «Email» e una riga per federazione,
cliccare l'etichetta del secondo portava il cursore nel primo; e i due campi
obbligatori che vivono nella scheda «Contatti» non erano raggiungibili dal
messaggio d'errore — le schede smontano il contenuto, quindi `required` non
veniva valutato e il toast nominava campi non presenti sulla pagina.

E l'inserimento rapido degli atleti nell'onboarding chiedeva Cognome prima di
Nome, con un `Input` semplice: l'unica delle nove anagrafiche rimasta fuori da
[ADR-0066](18-decision-log.md).

### 9. L'onboarding scriveva un badge da 51 caratteri in un campo da 25 — P3

Il campo «Descrizione» di una categoria e un **badge**: «Under 12»,
«Calcio a 5», massimo 25 caratteri, e la scheda di modifica lo dichiara.
L'onboarding ci scriveva dentro «Categoria creata durante la configurazione
iniziale», che ne conta 51.

Aprendo la scheda di una categoria appena creata il contatore diceva **51/25**
su un testo che l'applicazione aveva scritto **da sola**, e la card portava un
badge lungo una riga intera. Nessuna regola era stata violata da un utente: era
il prodotto a non rispettare la propria.

**Correzione.** Nessuna descrizione. Che una categoria sia nata durante la
configurazione iniziale non serve a chi la guarda: il nome basta, e chi vuole
scriverci «Calcio a 5» lo fa. Il test misura la stringa che l'onboarding
scrive, invece di controllarne il testo: qualunque descrizione futura dovra
stare nel badge.

## Cosa il collaudo ha invece confermato

### Isolamento multi-tenant — nessuna falla

Provato a runtime dall'utente `demo` (proprietario di due club) verso un terzo
club a cui non appartiene:

| Tentativo | Esito |
|---|---|
| `?club_id=` e `?organization_id=` estranei | 403 «Accesso negato alla risorsa del club» |
| `clubs?id=` estraneo, `PATCH clubs/<estraneo>` | 403 |
| item atleta estraneo: `GET`, `PATCH`, `DELETE` | 403 |
| allegato estraneo: record e byte | 403 «l'allegato appartiene a un altro club» |
| incassi di un altro club | 403 «l'incasso appartiene a un altro club» |
| `POST` con `organization_id` estraneo nel corpo | 403 |
| header `x-active-club-id` estraneo | **nessuna perdita**: ripiega su un club posseduto |
| id di un atleta estraneo senza filtro di club | lista vuota, nessun record |

E per ruolo, entrando come `trainer`: stagioni in lettura **e** scrittura 403,
modifica club 403, creazione atleta 403, registrazione incasso 403, condizioni
commerciali di piattaforma 403.

### Allegati — la politica regge alla prova

| Prova | Esito |
|---|---|
| PDF valido | 201, servito `inline` con `nosniff`, CSP che vieta script e rete, `X-Frame-Options: DENY` |
| `text/html`, `image/svg+xml`, eseguibile | 400, elenco chiuso di tipi ammessi applicato **lato server** |
| nome con `CR`/`LF` | neutralizzato: `qaX-Injected-1.txt`, nessuna iniezione di header |
| nome con `../../etc/passwd` | neutralizzato: `etc-passwd.txt` |
| HTML dichiarato `application/pdf` | servito come PDF con `nosniff`: il browser non lo esegue |
| cancellazione | i byte non si servono piu (404), nessun blob orfano |

### Messaggi d'errore — niente esce dal database

`?id=non-un-uuid`, risorsa inesistente, JSON malformato, `order_by` su una
colonna che non c'e, `limit` assurdo, negativo o non numerico: nessuna fuga di
schema Prisma, nome di modello, query o percorso del server. `limit` e
clampato a 200.

### Pro-rata — il conto torna, e la schermata lo spiega

Stagione 01/09/2026 – 30/06/2027, iscrizione 15/01/2027, quota 600 €:
**600 × 166/302 = 329,80 €**. La convenzione e la differenza fra date senza
`+1`, coerente fra numeratore e denominatore. Le rate — 130,00 € e 199,80 € —
sommano esattamente al totale, con l'arrotondamento a multipli di 5 sulla prima
e il resto sulla seconda.

La finestra di conferma dichiara importo originario, importo ricalcolato,
periodo usato **e da dove viene il periodo** («periodo della stagione
attiva»). La validazione dell'incasso copre acconto, eccedenza, zero e
negativo, con il pulsante disabilitato quando l'importo non e valido.

### Responsive — 375 / 768 / 1280 / 1440

Ventitre pagine di club: **nessuno scorrimento orizzontale di pagina, nessun
comando fuori dal viewport** a nessuna delle quattro larghezze. I soli
elementi piu larghi dello schermo stanno dentro un contenitore con
`overflow-x`, che e il comportamento voluto.

> Verifica **strutturale**, non visiva: nell'ambiente di collaudo il pannello
> del browser era nascosto (`document.visibilityState === "hidden"`), gli
> screenshot non erano disponibili e le animazioni CSS non venivano eseguite.
> La geometria — `getBoundingClientRect`, `scrollWidth`, stili calcolati —
> resta quella del motore vero, ed e cio su cui si basano queste righe.

### Console e rete

Ventitre pagine di club attraversate con `console.error`, `console.warn`,
`onerror`, `unhandledrejection` e `fetch` strumentati: **zero errori di
console, zero richieste API fallite**.

## Prestazioni, misurate

Club di collaudo con **212 atleti**.

| Cosa | Prima | Dopo |
|---|---|---|
| Dashboard, letture di `simplified_athletes` | 4 (226 KB decodificati ciascuna) | 3 |
| di cui **mai usate** | 1 (`all-athletes`, 226 KB scaricati e scartati) | 0 |
| Import di 200 atleti | 4,6 s, 400 POST (una riga per volta, scelta dichiarata nel codice per resilienza) | invariato |

Tendina atleti dell'abbigliamento con 212 voci: `max-height` 288 px,
`overflow-y: auto`, campo di ricerca presente, prima e ultima voce
raggiungibili, tutto dentro il viewport. La ricerca filtra per cognome, per
categoria e senza distinzione di maiuscole.

**Registrato in [16 — Debito tecnico](16-technical-debt.md)**, non corretto qui:
l'elenco Atleti legge l'archivio **due volte** a ogni apertura (226 KB
decodificati scartati, piu 84 KB di appartenenze lette due volte). La prima
lettura non serve solo alla lista: alimenta categorie, sedi, gruppi e la
decisione stessa di paginare, e intrecciarla con il debounce della ricerca
durante una campagna di collaudo non e il momento giusto.

## I gate

| Gate | Esito |
|---|---|
| `npm test` | **1.955 verdi**, 0 falliti (da 1.913: **42 nuovi**) |
| `npm run typecheck` | nessun output |
| `npm run lint` | 0 errori, 40 warning — **invariati** |
| `npm run build` | completa |
| `npx tsc --allowUnreachableCode false` | pulito |
| Multi-tenant | nessuna falla, verificata a runtime (tabella sopra) |
| Responsive | 375 / 768 / 1280 / 1440, 23 pagine, zero difetti |
| CI remota | **verde** su `b4108d5` e su `189b1d2` (Web App, Mobile App, Guardrail di sicurezza). Il giro su `HEAD` era ancora in corso quando la quota dell'API GitHub non autenticata si e esaurita: i due commit successivi sono una modifica di una riga con il suo test, piu documentazione, e i gate locali sono verdi su `HEAD` |
| Migrazioni | **nessuna nuova**: le 21 dello staging restano quelle di prima |
| CodeRabbit | **non eseguibile**: il CLI non e installato in questo ambiente |
| Deploy staging | **non eseguito**: bloccato dal classificatore dei permessi |

### Test nuovi, per file

| File | Cosa protegge |
|---|---|
| `tests/server/payment-transaction-race.test.mjs` | cio che la corsa **fa**: fra il controllo e la scrittura il registro cambia. E l'ordine dei blocchi |
| `tests/lib/club-onboarding-season.test.mjs` | la prima stagione di un club, i record orfani di stagione, lo scaffale locale |
| `tests/lib/athlete-import-plausibility.test.mjs` | date impossibili e implausibili, l'anno secco, e che le date valide restino valide |
| `tests/server/anagrafica-validation.test.mjs` | la forma composta, costruita con i punti di codice perche un editor non renda il test vuoto |
| `tests/ui/auth-entry-copy.test.mjs` | cosa dice la schermata di accesso, e che i due rami del login restino indistinguibili |
| `tests/ui/club-create-dialog.test.mjs` | id non ripetibili, obbligatori raggiungibili, ordine dei campi |
| `tests/ui/athletes-counters.test.mjs` | il conteggio viene dal server quando e il server a paginare |
| `tests/ui/dashboard-metrics-requests.test.mjs` | **quante volte** la dashboard legge l'archivio |

## I dati di collaudo lasciati sullo staging

Tutti su un club **creato apposta**, `QA UAT Club`
(`ae3d545b-717f-4197-ad65-c09f7cbbf553`): nessun dato di altri club e stato
toccato, in lettura o in scrittura.

| Cosa | Quanti | Nota |
|---|---|---|
| Atleti | 210 | 200 dall'import di volume, 9 dal file ostile, 1 dall'onboarding. I cognomi finiscono per `Qa` |
| Appartenenze di categoria | 209 | |
| Categorie | 5 | `Pulcini` ed `Esordienti` in doppia copia (riporto fra stagioni), piu `Categoria Inesistente` creata dall'import |
| Stagioni | 2 | una e la **fantasma** del difetto 1: resta come prova, ed e archiviata |
| Piani di pagamento | 1 | `Quota annuale QA`, 600 € su due rate, pro-rata per giorni |
| Rate | 2 | 100/130 e 150/199,80, coerenti dopo gli storni |
| Movimenti | 12 | 5 incassi validi, 4 storni e i loro movimenti di compensazione |
| Allegati | 1 | il PDF di prova; i tre file ostili sono stati cancellati |

Su `EasyGame FC` non e stato creato niente. Le due anagrafiche con il nome in
forma decomposta sono state riscritte in NFC **dall'applicazione**, e le due
con una data di nascita impossibile — quella del 1890 e quella del 2030, che
l'import corretto oggi rifiuterebbe — sono state eliminate. Verifica finale
sul database: **zero** atleti, appartenenze, rate, incassi o blob orfani; zero
nomi fuori da NFC; zero date di nascita impossibili.

## Cosa resta aperto

1. **CodeRabbit non e stato eseguito.** Il CLI `coderabbit` non e presente
   nell'ambiente (`command not found`; il plugin Claude Code c'e, il binario
   no). La revisione indipendente e stata fatta rileggendo criticamente il
   changeset, e ha prodotto tre correzioni — l'ordine dei blocchi, l'audit
   della stagione, la stagione scritta sul club di un altro account — tutte
   in `b4108d5`. **Non e un sostituto**: il gate resta scoperto.

2. **La ricerca non ignora gli accenti.** Ora che i nomi sono in NFC,
   `Niccolò` si trova scrivendolo con l'accento e **non** si trova
   scrivendolo senza. E il comportamento corretto di `ILIKE`, ma una
   segreteria italiana digita senza accenti. Renderla insensibile agli accenti
   e una decisione di prodotto: richiede `unaccent` in Postgres oppure una
   colonna normalizzata.

3. **Il registro incassi e leggibile da chiunque abbia accesso al club**,
   allenatori compresi. E dichiarato in
   [14 — Sicurezza §6-bis](14-security.md) e nel commento della rotta, quindi
   e una scelta, non un difetto: ma un allenatore non ha ragione di sapere chi
   ha pagato e quando. Proposta, non correzione.

4. **La scheda Pagamenti resta dietro l'abbonamento** anche su un club nuovo,
   come in RC Fix 2: Stripe Connect, checkout, webhook e rimborsi non sono
   stati esercitati a schermo. Il contratto dei dati si — `provider` dal
   record, `chargesEnabled` e `payoutsEnabled` separati, `readiness.blocker`
   distinto — e le rotte di piattaforma rispondono 403 a chi non amministra.

5. **Le correzioni non sono state riprovate sullo staging.** Il deploy e
   stato **bloccato dal classificatore dei permessi** dell'ambiente di
   collaudo, quindi `easygame-staging-pi.vercel.app` porta ancora la build
   precedente. Tutto cio che questo documento riporta come **difetto** e stato
   osservato sullo staging; tutto cio che riporta come **correzione** e
   verificato da test e dai gate, non riaperto a schermo. Le due riprove fatte
   comunque sull'applicazione — lo storno degli incassi in eccesso e la
   riscrittura in NFC dei due nomi — usano funzioni gia distribuite, e sono
   segnate come tali.

6. **Gli incassi parziali non compaiono nel centro contabile.** Sul club di
   collaudo sono stati incassati 250,00 € su due rate; `/movements` — «centro
   contabile unico» — mostra «Entrate 0,00 €» e «Nessun movimento trovato»,
   perche aggrega le **rate** e una rata parzialmente pagata non e «pagata».
   La scheda dell'atleta dice 250,00 €: due schermate dello stesso club che
   non concordano su quanto denaro sia entrato. Le due correzioni possibili
   sono entrambe decisioni di prodotto — postare ogni incasso come movimento,
   oppure distinguere «incassato» da «rate saldate» — e sono registrate in
   [16 — Debito tecnico](16-technical-debt.md).

7. **Nessuna verifica visiva.** Il pannello del browser era nascosto per tutta
   la sessione: niente screenshot, niente animazioni. Tutto cio che in questo
   documento riguarda il layout e verifica **strutturale**.

---

# FINAL INDEPENDENT REVIEW

**Data:** 2026-08-28 · **Base:** `10d06ca` · **HEAD alla prima revisione:**
`bd83be1`

CodeRabbit non e eseguibile in questo ambiente (il binario non c'e), e il gate
di revisione indipendente e stato sostituito da **due letture complete del
changeset fatte da revisore**, separate dal lavoro di sviluppo: la prima
cercando errori senza fidarsi delle correzioni precedenti, dei test, della CI
o di questo documento; la seconda sul codice risultante, comprese le
correzioni della prima.

Il metodo che ha prodotto i finding: partire dagli **invarianti dichiarati** e
chiedersi chi altro puo violarli. Non «questo codice e sbagliato?», ma «questa
regola vale per tutti quelli che potrebbero infrangerla?». Tre dei quattro
finding piu gravi vengono da li.

## Prima revisione

| Gravita | Trovati | Validi | Corretti |
|---|---|---|---|
| Critical | 0 | 0 | — |
| High | 1 | 1 | 1 |
| Medium | 6 | 6 | 4 |
| Low | 5 | 5 | 1 |
| Falso positivo / non applicabile | 4 | — | — |

### High — la quarta operazione che decide sul denaro

[ADR-0067](18-decision-log.md#adr-0067--il-denaro-si-arbitra-bloccando-la-riga-non-solo-con-un-indice)
aveva messo in fila «le tre operazioni che muovono denaro». La lista era
sbagliata: la regola non e *chi scrive un movimento*, e **chi decide sullo
stato economico di una rata**. La quarta e `PATCH /api/athlete-payments/:id`,
che ne cambia l'importo — e cambiare l'importo cambia il residuo, quindi
cambia lo stato. Quella rotta leggeva la rata fuori da qualunque transazione e
chiamava `recomputeChargeFromLedger` fuori dal blocco.

Cosa lasciava passare, **riprodotto** da test che falliscono sul codice
precedente:

| Cosa | Conseguenza |
|---|---|
| Il guardiano «le rate gia pagate non si modificano» girava sulla lettura vecchia | Un incasso arrivato nel frattempo lasciava cambiare l'importo di una rata **appena saldata**: una rata da 130 incassata per intero diventava una rata da 500, scoperta di 370 che nessuno doveva |
| I tre rami riscrivono `data` per intero a partire dalla copia letta fuori | Il `data.ledger` scritto dal ricalcolo di un incasso appena committato spariva sotto |
| `createPaymentTransaction` calcolava la capienza sulla rata letta **prima** della transazione | Il residuo e una sottrazione fra due numeri, e ADR-0067 ne rileggeva dentro il blocco solo uno: con la rata portata da 130 a 40 mentre l'incasso e in volo, il controllo diceva ancora di si a 130 |

Correzione: `lockInstallmentAndTransaction` e esportata e la rotta la usa,
con l'ordine di sempre — prima la rata, poi l'incasso; i tre rami leggono e
scrivono dentro la transazione; `createPaymentTransaction` rilegge anche la
rata. ADR-0067 porta ora la regola scritta per esteso.

### Medium

1. **Il messaggio del driver usciva da quattro rotte.** Incassi, azioni sugli
   incassi, rate e stagioni inoltravano `error.message` cosi com'era. Lo
   schema del corpo non impone la forma di un UUID a `payment_id` — non e
   compito suo — quindi un identificativo arbitrario arrivava fino a
   `findUnique`, e l'envelope tornava con l'invocazione Prisma per intero.
   `publicErrorMessage` esiste dal Blocco E esattamente per questo ed era gia
   usato dalle rotte generiche: ora ci passano anche queste. Vedi
   [I-03](14-security.md). **Corretto.**
2. **La correzione dei record orfani era applicata a un percorso solo.** Il
   difetto 2 era stato chiuso su `listResourcePage`; `getClubData` — il
   percorso di lettura del **browser**, che meta applicazione usa —
   continuava a scartare gli orfani e a filtrare sulla stagione sintetizzata.
   Lo stesso club mostrava due elenchi diversi a seconda di quale strada
   avesse preso la pagina. **Corretto**, con le stesse due regole del server.
3. **La ricerca era normalizzata da una parte sola.** Il difetto 4 aveva
   normalizzato a NFC cio che si scrive; una chiave in forma decomposta
   continuava a non trovare un nome in forma composta. **Corretto** nei due
   percorsi: database e browser.
4. **La capienza del rimborso poteva guardare tutto il club.**
   `external_payment_id: original.external_payment_id || undefined` diventa
   «nessun filtro» quando il valore e nullo: la somma passava da «quanto e
   stato rimborsato su questo incasso» a «quanto e stato rimborsato in tutto
   il club». Non raggiungibile oggi — il webhook trova l'incasso originale
   **per** quell'identificativo — ma la nuova copia dentro la transazione
   ripeteva la trappola. **Corretto**, e il doppio di Prisma ora tratta
   `undefined` come Prisma: nessun filtro. Era la semantica su cui il difetto
   si era nascosto.
5. **`clubs.settings` si riscrive per intero senza blocco**, e due scritture
   concorrenti se ne perdono una: creare una stagione mentre l'autosave della
   scheda Club e in volo sono due comandi della stessa pagina.
   **Non corretto**: la correzione giusta richiede che `resources.ts` accetti
   un client di transazione, ed e un lavoro di un blocco, non di una riga.
   [Registrato](16-technical-debt.md).
6. **Qualita dei test.** La deduplica del rimborso dentro la transazione e
   l'ordine dei blocchi erano coperti da assert **sul testo del sorgente**:
   passano con un'implementazione semanticamente rotta. E mancavano gli
   scenari che il collaudo dichiara di presidiare — incasso + storno
   concorrenti, incasso + rimborso. **Corretto**: sostituiti da test che
   esercitano le funzioni vere.

### Low

Registrati, non corretti: l'intestazione dell'elenco Atleti che per 250 ms
etichetta con lo stato scelto un totale non filtrato; l'import che ignora la
colonna «Anno di nascita» quando la colonna data e mappata ma vuota; la
stagione dell'avvio guidato creata sul club che dice `localStorage` invece
che su quello caricato dalla pagina (nessun rischio multi-tenant: il server
valida comunque l'header contro i club dell'utente). Tutti e tre in
[16](16-technical-debt.md).

Il quarto e una **riga sbagliata di questo documento**, corretta sopra: la
forma decomposta non rompeva il riconoscimento dei duplicati nell'import,
perche `identityKey` toglie gia i segni diacritici prima di confrontare. Era
una deduzione plausibile che nessuno aveva verificato.

### Falsi positivi, e perche

| Sospetto | Perche non lo era |
|---|---|
| `rememberActiveSeason` cancella la chiave `localStorage` illeggibile | E l'idioma gia in uso nello stesso file, in `readStoredActiveClub` e `readCachedUserId` |
| La risorsa generica puo scrivere `payments.status` | Gia chiuso da `guardLedgerOwnedPaymentState` |
| Un `athlete_id` di un altro club su un incasso proprio | Nessun percorso di lettura lo espone: ogni elenco filtra per `organization_id` |
| Ordine dei blocchi, abbraccio mortale | Verificato coerente — prima `payments`, poi `payment_transactions` — in tutte le operazioni, compresa la quarta aggiunta |

## Seconda revisione

Fatta sul codice risultante, considerandolo scritto da altri, e senza
limitarsi ai file toccati dalle correzioni.

| Gravita | Residui |
|---|---|
| Critical | **0** |
| High | **0** (uno trovato, corretto) |

### High — il difetto 1 rientrava dalla porta di servizio

Sul percorso piu probabile: quello di chi **non tocca i campi**.

`normalizeClubSeasons` restituisce sempre una stagione, anche su un club che
non ne ha salvata nessuna — e la stagione sintetizzata, che esiste per non
lasciare l'interfaccia senza perimetro. Il passo Stagione dell'avvio guidato
la prendeva per buona e scriveva:

> Stagione attiva: 2026/2027. Puoi passare avanti.

su un club che di stagioni non ne aveva **nessuna**. Chi accettava l'invito
usciva dall'avvio guidato senza stagione: `saveSeasonStep` senza date esce
subito, l'intestazione continua a dire «Nessuna stagione attiva», e le
categorie del passo successivo nascono senza annata — cioe esattamente i tre
sintomi del difetto 1, prodotti dalla correzione del difetto 1.

La causa e la stessa confusione di partenza: **una stagione sintetizzata non
e una stagione del club**. `isFallback` era stato aggiunto proprio per
distinguerle, e questa pagina non lo usava. Ora lo usa; e le date della
stagione sintetizzata — che sono l'annata sportiva corrente — riempiono i due
campi, cosi «Avanti» crea la stagione invece di saltarla.

Nessun altro consumatore di `normalizeClubSeasons` ha lo stesso difetto:
`account-shared`, `AuthProvider`, la pagina Categorie e i riepiloghi la usano
come perimetro di **lettura**, che e cio per cui esiste. L'avvio guidato era
l'unico a farne un'affermazione su cui l'utente decide.

## I gate, dopo la revisione

| Gate | Esito |
|---|---|
| `npm test` | **1.978 verdi**, 0 falliti (da 1.955: **23 nuovi**, di cui 12 falliscono sul codice precedente) |
| `npm run typecheck` | nessun output |
| `npm run lint` | 0 errori, 40 warning — **invariati** |
| `npm run build` | completa |
| Migrazioni | **nessuna nuova**: restano 20 |
| CI remota | **verde su `f99e6b8`**, cioe su HEAD e non su un commit precedente: Web App, Mobile App e Guardrail di sicurezza, tutti `success`. La spunta «Vercel» resta rossa per una ragione che non viene da qui: l'ambiente **Preview** del progetto non ha `DIRECT_URL`, quindi `prisma migrate deploy` non parte e il build muore in 27 secondi. Vale da prima di questo lavoro, non si corregge dal repository, e non tocca il deployment di staging, che e `production` |
| Revisione indipendente | doppia, chiusa: 0 Critical, 0 High residui |

### Test nuovi della revisione

| File | Cosa prova |
|---|---|
| `tests/server/payment-installment-serialization.test.mjs` | La rotta che cambia l'importo prende il blocco prima di scrivere; una rata saldata nel frattempo non si lascia modificare; il ledger di un incasso concorrente non sparisce; la capienza si calcola sulla rata riletta; incasso + storno concorrenti; la deduplica del rimborso riconosce invece di esplodere; nessun messaggio del driver esce. **7 su 10 falliscono sul codice precedente** |
| `tests/server/search-unicode-normalization.test.mjs` | La chiave decomposta arriva al database composta, nei due percorsi di ricerca, senza allentare il confine del club |
| `tests/lib/club-orphan-season-records.test.mjs` | Il percorso di lettura del browser applica le stesse due regole del server. **3 su 5 falliscono sul codice precedente** |
| `tests/lib/club-onboarding-season.test.mjs` (esteso) | L'avvio guidato non annuncia come attiva una stagione sintetizzata, e propone le date dell'annata corrente |

> **Perche i test che falliscono sul codice precedente si contano.** Un test
> che passa sia con la correzione sia senza non protegge niente: e la domanda
> che questa revisione ha posto a ogni test nuovo del changeset, e che ha
> prodotto il finding Medium 6. Averla posta anche ai propri e l'unico modo
> di non ripetere l'errore che si e appena trovato.
