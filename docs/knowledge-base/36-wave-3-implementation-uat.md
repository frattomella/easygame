# 36 — Wave 3: implementazione e collaudo

**Data:** 2026-08-29
**Baseline:** `integration/web-v1` @ `18f0f40`
**Contratto:** [35 — Wave 3: planning esecutivo](35-wave-3-planning.md)
**Stato:** vedi [§9](#9--verdetto)

> Il documento [35](35-wave-3-planning.md) dice **cosa** si sarebbe fatto e
> **perche**. Questo dice **cosa e stato fatto davvero**, con la prova, e dove
> l'esecuzione si e discostata dal piano.

---

## Indice

1. [Cosa e cambiato per il club](#1--cosa-e-cambiato-per-il-club)
2. [La barriera, e le sette lane](#2--la-barriera-e-le-sette-lane)
3. [Dove ci siamo discostati dal piano](#3--dove-ci-siamo-discostati-dal-piano)
4. [Il collaudo a runtime](#4--il-collaudo-a-runtime)
5. [Prestazioni](#5--prestazioni)
6. [I bug trovati durante la Wave](#6--i-bug-trovati-durante-la-wave)
7. [Il catalogo: cosa esce e cosa resta fermo](#7--il-catalogo-cosa-esce-e-cosa-resta-fermo)
8. [Audit e seconda revisione](#8--audit-e-seconda-revisione)
9. [Verdetto](#9--verdetto)
10. [Residui dichiarati](#10--residui-dichiarati)

---

## 1 — Cosa e cambiato per il club

| Prima | Adesso |
|---|---|
| «Nuovo documento» apre una pagina bianca con scritto «Inserisci il contenuto qui» | Sei modelli pronti, scritti per una ASD italiana, che si adottano con un clic e da quel momento sono tuoi |
| Correggi un modello e i documenti dell'anno scorso cambiano sotto i piedi, perche non ne esisteva una copia | Un modello corretto e una **versione nuova**. Cio che hai gia consegnato resta com'era, e continua a citare la sua |
| «Chi ha rilasciato questa attestazione?» non ha risposta: il documento nasceva nel browser e moriva alla chiusura della scheda | Ha una riga: chi, quando, con quale modello, quale versione, e quali numeri c'erano scritti |
| L'attestazione la scrive la segretaria copiando gli importi da una schermata | Il documento dice la cifra giusta perche la legge dal registro incassi — e se un dato manca **lo dice prima**, invece di stampare un foglio con un buco |
| Trenta richieste di visita medica sono trenta aperture di scheda | Si selezionano trenta atleti e si genera un lotto. Chi non si e potuto generare compare con il motivo, e gli altri passano |
| «Chi ha dato il consenso immagini?» si risponde aprendo le compilazioni una per una, e «chi lo ha revocato» non si risponde affatto | Si risponde con un elenco. E la revoca **non cancella** la prova del consenso dato prima |
| Il documento d'identita scaduto lo scopre chi lo cerca | Lo dice il gestionale trenta giorni prima, con le stesse regole che il club gia governa per i certificati |
| Un collaboratore puo riscrivere il testo che la societa firma, e non puo stamparne una copia | I modelli li scrive la direzione; la segreteria genera cio che non porta dati delicati, e quando non puo **le viene detto perche** |

---

## 2 — La barriera, e le sette lane

L'ordine di merge e quello deciso al §15.4 del planning, con la barriera come
commit a se davanti a tutte.

| Lane | Commit | Cosa contiene |
|---|---|---|
| **barriera** | `963724b` | Sei tabelle e due colonne in una migrazione sola; la matrice dei permessi documentali in un modulo puro; il **contratto dei segnaposto** — ogni chiave dichiara soggetto, proprietario del dato e sensibilita. Le due porte di `W3-14` chiuse insieme |
| **W3-G** — scadenze | `ebcc29a` | `valid_from`/`valid_until` su `attachments`, lo stato derivato, il quinto innesco `AUT-05` con filtro per categoria, e il doppione con il certificato medico impedito in **tre** punti |
| **W3-A** — motore | `46a7947` | `src/lib/server/document-templates.ts` come proprietario unico, le rotte dei modelli e dei documenti generati, il travaso dalla colonna JSON |
| **W3-C** — consensi | `4737653` | Definizione, versione immutabile, decisioni append-only, stato derivato, schermata `/consensi` |
| **W3-B** — soggetti | `7995534` | Il risolutore impara club, persona e socio oltre all'atleta; sponsor, fornitori ed eventi smettono di essere proposti |
| **W3-A** — schermata | `fab5cd9` | `/modulistica` sopra il motore nuovo, e **cinquecento righe** di implementazioni doppie rimosse |
| **UAT** | `34a06d0` | I 38 scenari del §19, decisi prima del codice: 56 controlli su 56 |
| **W3-D** — catalogo | `ae8cdd6` | Dieci voci scritte, sei distribuite, quattro ferme e dichiarate |
| **W3-F** — moduli | `797f76c` | Un campo puo dichiarare un consenso, un modulo un modello: all'approvazione nascono la decisione e il documento, con due idempotenze diverse e la ragione di entrambe |
| **W3-E** — massiva | `ea27d01` | Fette da cinquanta, lotto ripartibile dopo un ricaricamento, fascicolo stampabile, «riprova i falliti» |
| **audit** | `41404ee` | Le ventuno correzioni delle quattro revisioni ostili, la porta del catalogo, e sette scenari di collaudo che le provano |
| **W3-F** — moduli | `797f76c` | Un campo puo dichiarare un consenso, un modulo un modello: all'approvazione nascono la decisione e il documento, con due idempotenze diverse e la ragione di entrambe |
| **W3-E** — massiva | `ea27d01` | Fette da cinquanta, lotto ripartibile dopo un ricaricamento, fascicolo stampabile, «riprova i falliti» |
| **audit** | `41404ee` | Le ventuno correzioni delle quattro revisioni ostili, piu sette scenari di collaudo che le provano |

---

## 3 — Dove ci siamo discostati dal piano

**Uno.** La barriera si era dimenticata una colonna: la **bozza** del contenuto
di un modello. Senza, l'editor avrebbe avuto due sole strade — pubblicare a
ogni salvataggio, e allora il numero di versione non direbbe piu «revisione» ma
«battitura», oppure tenere il testo nel browser, cioe perderlo. E arrivata con
una migrazione propria (`20260829110000_wave3_template_draft`) invece di essere
infilata nella barriera gia applicata.

**Due.** Il **protocollo** del documento generato era un `EXTEND` previsto dal
planning (E-8, su `document_number_sequences`). Non e stato fatto: quella e la
numerazione **fiscale**, con due invarianti proprie (ADR-0044) e un perimetro
che finisce alle ricevute e alle fatture. Estenderla a un documento che fiscale
non e, oppure aprire una seconda numerazione, sono due decisioni — e nessuna
delle due si prende dentro una lane. La colonna esiste e resta nulla (debito
`W3-01`).

**Tre.** Il contratto dei segnaposto e stato scritto **per intero nella
barriera** invece che a meta in W3-B. Il planning lo aveva diviso — tipi nella
barriera, valori nella lane — ma il catalogo ha un proprietario solo, e due
lane che scrivono lo stesso file nello stesso giorno sono due lane che si
sovrascrivono. W3-B si e concentrata sul risolutore, che e il pezzo che
mancava davvero.

**Quattro, e poi rientrato.** La Wave aveva riservato `/modulistica` alla
direzione per chiudere `W3-14`, rendendo pero irraggiungibili quattro righe
della matrice del §13 — la segreteria puo generare cio che non porta dati
delicati, e il server glielo consente. L'audit ha misurato il costo dal lato
peggiore: il collaboratore **vedeva la voce nel menu**, ci cliccava, e finiva
sulla dashboard senza una parola. La pagina e tornata gestionale; il difetto
vero di `W3-14` erano le **rotte**, e quelle restano chiuse dove serve.

**Cinque.** Due `EXTEND` del §16.2 sono decaduti senza che il piano lo
prevedesse: **E-7** (il naming dei file in un fascicolo, su
`attachment-names.ts`) e **E-10** (la consegna del fascicolo, su
`stored-file-response.ts`). Senza un motore PDF un documento non e un file,
quindi non ha un nome di file ne una risposta di file: il fascicolo e diventato
una pagina HTML stampabile. La scelta e difendibile — e la stessa decisione del
§3.4 — ma va detta, perche il planning li impegnava.

---

## 4 — Il collaudo a runtime

`scripts/wave-3-documents-uat.mjs`, contro un'applicazione vera con un
database vero, due club veri e cinque ruoli veri.

**67 controlli su 67.**

Cosa dimostra, in ordine di importanza:

1. **Il documento consegnato non cambia mai.** Generato con la versione 1, poi
   il modello viene riscritto e ripubblicato: la rilettura restituisce lo
   stesso HTML byte per byte e cita ancora la versione 1;
2. **l'anteprima non scrive.** Da una bozza non pubblicata non si genera, e la
   riga in `generated_documents` resta zero;
3. **l'importo e il denaro entrato.** Rata da 130 marcata pagata, incassati 80:
   il foglio dice **80,00**. E la ragione per cui si puo firmare;
4. **il lotto e idempotente nel database.** Cinquanta documenti, riesecuzione,
   zero righe nuove. Un soggetto di un altro club fallisce da solo e compare
   fra i falliti con il motivo;
5. **un documento generato non e un allegato.** Il suo identificativo su
   `/api/v1/attachments/:id` risponde **404**, e sulla sua rotta 200: ADR-0089
   provato, non dichiarato;
6. **il permesso guarda cosa il documento dice.** Il collaboratore genera la
   dichiarazione di iscrizione (201) e non l'attestazione con gli importi
   (403, «questo modello contiene importi, e li genera la direzione del club»);
7. **cross-tenant, quattro volte**, e mai il messaggio dell'ORM. Un
   identificativo inesistente e uno di un altro club danno la **stessa**
   risposta;
8. **la revoca non cancella.** Accettare, revocare, riaccettare lascia tre
   righe e uno stato derivato;
9. **le scadenze non producono doppioni**, nemmeno con due giri in parallelo, e
   il certificato medico resta su `AUT-03`;
10. **Unicode.** `Nicolò D'Angiò` e `Öztürk Đurić` arrivano interi; un cognome
    che contiene `<script>` resta un cognome.

Piu **sette scenari aggiunti dopo l'audit**, che provano a runtime le
correzioni piu delicate: il ruolo di un club che non vale su un altro (sei
tentativi, sei 403, e la bozza intatta), il documento che porta **solo** i
valori che ha nominato — in anteprima e nella copia conservata — l'identificativo
malformato che non racconta lo schema, «firmato» che pretende una copia
esistente, lo stesso lotto su due modelli che produce due documenti distinti, la
decisione di consenso datata nel futuro che viene rifiutata, e la segreteria che
vede i modelli.

---

## 5 — Prestazioni

Misurate durante il collaudo, sulla stessa esecuzione dei 56 controlli.

| Misura | Soglia (§20 del planning) | Misurato | Margine |
|---|---|---|---|
| Render di **un** documento | < 400 ms | **44 ms** | 9x |
| Anteprima completa | — | 57 ms | — |
| **Dieci** documenti | < 3 s | **228 ms** | 13x |
| **Cinquanta** in un lotto | — | **915 ms** | — |
| **Cento** in due lotti | < 30 s | **1.712 ms** | 17x |
| Elenco dei modelli | < 200 ms | **22 ms** | 9x |
| Elenco dei documenti generati (174) | — | 32 ms, 116 kB | — |

**Il fascicolo, misurato dopo l'audit.** Il §20 del planning chiedeva
esplicitamente di cercare il costo della firma incorporata, e il primo collaudo
non lo aveva fatto. Con una firma da 90 kB e un timbro da 76 kB — dimensioni
normali per una scansione — ogni documento portava **222 kB** di `data:` URL, e
un fascicolo da cento pesava **22,24 MB**: 2,5 volte la soglia, e si spezzava
gia a trentasei documenti, cioe dentro il caso d'uso che giustifica G-43.
Estraendo le immagini ripetute e portandole una volta sola: **0,84 MB**, due
`data:` URL invece di duecento, e una parte sola invece di tre.

Due controlli verificano che gli elenchi **non portino il peso**: l'elenco dei
modelli non contiene `draftContent`, quello dei documenti non contiene
`contentHtml`. E lo stesso difetto per cui i modelli sono usciti dalla riga del
club, e sarebbe rientrato dalla finestra.

---

## 6 — I bug trovati durante la Wave

| # | Cosa | Dove trovato | Esito |
|---|---|---|---|
| 1 | **Collaboratore e staff potevano creare, modificare e cancellare i modelli** dal CRUD generico, e non potevano generare un documento | Sonda a runtime scritta **prima** della correzione (`scripts/wave-3-permissions-probe.mjs`), cinque ruoli veri | Corretto nella barriera, in **entrambe** le porte: la pagina e la rotta |
| 2 | **Due forme diverse nella stessa colonna JSON** — un modello creato dall'API compariva in Modulistica senza titolo e senza testo | Stessa sonda | Sparisce con il motore nuovo; il travaso riconosce entrambe le forme |
| 3 | **Una rotta Next non puo esportare costanti proprie**: `MAX_GENERATION_BATCH` faceva fallire la generazione dei tipi, quindi la build | `npx tsc` sul progetto intero | La costante e scesa nel dominio, dove serve anche al client |
| 4 | **Ricorsione infinita** in `buildCommonValues` durante l'estrazione delle chiavi comuni del risolutore | I 31 test esistenti sul risolutore, diventati rossi | Corretto prima del commit; i 31 tornano verdi senza modifiche al test |
| 5 | **Un commento troppo lungo** ha spinto `/onboarding` oltre la finestra di 400 caratteri che un test presidia | `npm test` | Commento accorciato. Il test presidia la cosa giusta con un mezzo fragile: debito `W3-07` |

**Tre controlli del collaudo erano scritti male**, e sono stati corretti nel
collaudo e non nel prodotto: il giro delle automazioni si aziona da una
sessione e non dal segreto del cron, un diniego di permesso e un `403` e non un
`400`, e la prova Unicode leggeva un modello che nel frattempo era stato
riscritto.

---

## 7 — Il catalogo: cosa esce e cosa resta fermo

Dieci voci scritte. **Sei distribuite**, quattro ferme.

| Voce | Classe | Stato |
|---|---|---|
| Attestazione di pagamento e frequenza | A | **distribuita** |
| Attestazione di sola frequenza | A | **distribuita** |
| Dichiarazione di iscrizione all'attivita | A | **distribuita** |
| Avviso di versamento della quota | A | **distribuita** |
| Richiesta di visita medico-sportiva | A | **distribuita** |
| Attestazione per bando o voucher | A | **distribuita** |
| Informativa e consenso privacy | **C** | ferma: cita il Regolamento (UE) 2016/679 |
| Consenso all'uso di immagini e video | **C** | ferma: riguarda l'immagine di minori |
| Autorizzazione alla trasferta | **C** | ferma: assegna responsabilita durante il trasporto |
| Delega al ritiro del minore | **C** | ferma: sposta la custodia di un minore |

Le quattro ferme **sono scritte**, cosi chi deve validarle ha un testo da
leggere invece di un foglio bianco, e ognuna dichiara **dentro il documento**
di non essere validata. La rotta del catalogo non le nomina nemmeno.

**Nessuna voce di classe B.** I trenta moduli territoriali di richiesta visita
medica sono il fossato editoriale di Golee, e il §17 del planning dice che non
lo apriamo. Il club carica il suo e lo compila con i segnaposto: il 90% del
valore all'1% del costo.

Un test verifica che **ogni voce distribuibile sia pubblicabile cosi com'e**:
una voce che nominasse un segnaposto fuori catalogo sarebbe un difetto
consegnato.

---

## 8 — Audit e seconda revisione

Quattro revisioni **indipendenti e ostili**, in parallelo, ognuna con il mandato
di rompere la Wave e non di confermarla: correttezza e versionamento, sicurezza
e multi-tenant, architettura e duplicazione, UX e prestazioni.

**Esito: sette CRITICAL e quattordici HIGH.** Quasi tutti dimostrati con un
test scritto apposta o con una sonda contro il server vero — non segnalati come
sospetti. Sono stati corretti tutti.

### Gli otto che pesavano di piu

| # | Cosa | Come e stato trovato |
|---|---|---|
| **1** | **Il ruolo di un club valeva sui documenti di un altro.** Il confine confrontava con **tutti** i club accessibili mentre `role` e il ruolo del club **attivo**. Chiunque puo crearsi una societa e diventarne proprietario: bastava tenerla attiva e mandare l'identificativo di un modello altrui per riprendere cancellazione, modifica e pubblicazione — e per leggere documenti con gli importi da **allenatore** | Sonda a runtime, due club veri, con la controprova: la stessa richiesta con il club giusto selezionato rispondeva 403 |
| **2** | **Gli importi di una famiglia uscivano da ogni documento.** Il risolutore costruisce sempre la mappa completa per il soggetto, e usciva **intera** anche da un modello che nomina il solo nome — pubblicato con `sensitivity: []`, quindi generabile da chi gli importi non li vede. E si **conservava** in `values_snapshot` | Sonda a runtime: `values.payment.total_paid = "320,00"` su un modello dichiarato non sensibile |
| **3** | **Il catalogo non aveva nessuna porta.** `GET`/`POST /documents/catalog` funzionavano, erano nel registro, avevano i test — e nessuna riga di client li chiamava. Cinque voci su sei irraggiungibili, e l'unica adozione possibile era un pulsante che si scriveva da se una copia **impoverita**, senza classe redazionale ne data di rilettura | Lettura: zero riferimenti in `src/` e `tests/` |
| **4** | **`/modulistica` era chiusa a chi il server autorizza.** Quattro righe della matrice del §13 erano irraggiungibili, e il collaboratore vedeva la voce nel menu, ci cliccava, e finiva sulla dashboard **senza una parola** | Verificato a schermo, con la tabella dei quattro ruoli sulle rotte vere |
| **5** | **L'unicita del lotto ignorava il modello.** Due lotti con lo stesso identificativo su modelli diversi restituivano il documento **dell'altro**, e la rotta rispondeva 201 | Test con il doppio di Prisma: `due.templateId === a.id` |
| **6** | **Un consenso datato nel futuro mascherava ogni revoca successiva.** Un refuso sull'anno, non un attacco: la famiglia revocava, l'operatore scriveva la revoca, e la schermata continuava a dire «accettato» | Test: `deriveConsentState([accettazione2027, revoca2026]).status === "accepted"` |
| **7** | **Il fascicolo da cento documenti pesava 22,24 MB**, 2,5 volte la soglia dichiarata, perche firma e timbro erano incorporati **cento volte**. Con una firma normale il fascicolo si spezzava gia a trentasei documenti — cioe dentro il caso d'uso che giustifica G-43 | Misurato: mediana di una riga 229 kB, di cui il 97% due immagini ripetute |
| **8** | **«Firmato» accettava un allegato inventato**, o di un altro club: la colonna non ha chiave esterna e nessuno controllava. ADR-0091 era tornata una spunta | Test: `PATCH { status: "signed", signed_attachment_id: "9999…" }` riusciva |

### Le altre, in breve

Chi non poteva **leggere** un documento poteva cambiarne lo stato, e la
risposta gli diceva di chi era · cambiare **solo** il soggetto non creava una
versione e non compariva fra le modifiche non pubblicate, lasciando il modello
ingenerabile senza via d'uscita · un valore di anagrafica che conteneva
`{{…}}` veniva **interpretato**, perche le tre sostituzioni erano in catena ·
le rotte documentali facevano uscire l'invocazione Prisma per intero · la
provenienza redazionale si dichiarava dal corpo della richiesta, cioe si poteva
falsificare · il nome di una persona aveva una **settima** copia che stampava
«undefined undefined» · il modulo vuoto stampava la bozza con una regex propria
· c'era un **terzo** foglio di stile di stampa e una stampa a tempo ·
`/consensi` a 375 px tagliava sessantasette elementi senza modo di
raggiungerli · «Produci il documento» diceva **«Bad Request»** invece del
motivo · gli avvisi dell'approvazione uscivano come N toast in una pila che ne
tiene uno · il fascicolo scartava in silenzio i documenti illeggibili e poi
dichiarava un totale sicuro · un lotto interrotto veniva buttato via da
qualunque altro lotto · azioni offerte su stati che il server rifiuta.

### Cosa le revisioni hanno trovato **giusto**

Vale la pena scriverlo, perche e cio che regge senza essere stato toccato.
L'invariante «un documento rilasciato non cambia mai» e stata verificata
elencando **ogni** scrittura su `generated_documents`: nessun percorso tocca
`content_html`, `values_snapshot` o `version_id` dopo la creazione. Nessun
`update` su una versione pubblicata, in tutto l'albero. Nessuna scrittura
Prisma sui domini posseduti fuori dai due proprietari. Nessun `fetch` diretto a
`/api` nei componenti. Nessun modulo dichiarato puro che importi Prisma, la
rete o il DOM. Nessun refactoring opportunistico, nessun `console.log`, nessun
`TODO` nuovo. E la separazione di ADR-0089 — un documento generato non e un
allegato — regge: nessun percorso scrive un documento dentro `attachments`.

### La seconda revisione

Chiuse le ventuno, la Wave e stata rivista **una seconda volta**, sulle
correzioni e non piu sul codice originale: e la domanda giusta da fare a una
remediation, perche una correzione scritta in fretta e un posto dove un difetto
nuovo entra senza che nessuno lo guardi.

Ha trovato **una CRITICAL e una HIGH**, entrambe nate dalle correzioni stesse.

| Gravita | Cosa | Esito |
|---------|------|-------|
| **CRITICAL** | Lo stesso confine sbagliato della #1 — il ruolo del club attivo applicato ai dati di un altro — sopravviveva in `form-submissions.ts`, che la prima correzione non aveva toccato perche appartiene alla Wave 2 | Gia chiusa da `c93a8c3`, con `roleForNeighbours`: fuori dal club attivo il ruolo e `null`, non «quello che ho qui» |
| **HIGH** | **Una regressione mia.** Filtrando `values` alle sole chiavi usate — la correzione della #2 — era sparito anche `recipient.name`, che il chiamante leggeva da li per intestare il documento: `subject_label` era `null` su **ogni** modello del catalogo | Chiusa in `12edf8b`: il nome del destinatario esce come campo proprio, non come effetto collaterale della mappa dei segnaposto |

La seconda vale piu della prima, e per un motivo scomodo: la HIGH l'avevo
introdotta io correggendo una CRITICAL, i test esistenti non la vedevano — il
documento usciva, ben formato, senza intestazione — e senza una revisione delle
correzioni sarebbe arrivata su staging.

Poi lo **smoke su staging** ne ha trovata una terza, che nessuna delle sei
revisioni poteva vedere leggendo il codice: `/consensi` era stata aggiunta ai
percorsi gestionali di `access-roles.ts` e **dimenticata** nell'elenco del
middleware, quindi rispondeva `200` senza sessione mentre `/modulistica`
rispondeva `307`. Non era una fuga — la pagina si difende da sola e ogni rotta
rifiuta con 401 — ma e esattamente il tipo di disallineamento che un elenco
scritto a mano produce, e che si vede solo interrogando il server vero.

---

## 9 — Verdetto

_Da compilare._

---

## 10 — Residui dichiarati

Dieci voci, tutte in [16 — Debito tecnico](16-technical-debt.md), sezione
«Debito aperto dalla Wave 3». Le tre che pesano davvero:

- **`W3-01`** — il protocollo di un documento generato resta nullo. E una
  decisione rimandata, non una dimenticanza: darglielo significa estendere la
  numerazione fiscale o aprirne una seconda;
- **`W3-02`** — il permesso di generare concesso a collaboratore e staff non ha
  una schermata da cui esercitarlo. Il server lo consente, provato a runtime;
  manca la porta;
- **`W3-09`/`W3-10`** — il presidio redazionale. Le sei voci distribuite hanno
  un proprietario **nominale**, e le quattro ferme aspettano una validazione
  che nessuno ha ancora preso in carico. ADR-0092 dice cosa fare se non arriva:
  smettere di distribuire, non lasciare invecchiare.
