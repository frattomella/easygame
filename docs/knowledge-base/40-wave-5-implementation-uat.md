# 40 — Wave 5: cosa è stato fatto, cosa è stato misurato, cosa resta

> Consuntivo della Wave 5, chiusa il **2026-09-01** sul branch
> `integration/web-v1`. Il piano è in
> [39 — Wave 5 planning](39-wave-5-planning.md); questo documento racconta
> l'**esito**, e dove i due divergono vince questo.

---

## 1. In una pagina

La Wave 5 ha portato a termine il DAG approvato — 5A → 5B → {5C ‖ 5D ‖ 5E} →
{5F ‖ 5G} → {5H ‖ 5I} → 5J — con **quindici commit**. Due strutture sono
diventate tabelle vere (l'evento sportivo, il fascicolo documentale), due
domini sono nati con un proprietario unico (gli appuntamenti, il catalogo dei
permessi), e due aree di prodotto che esistevano per il club e non per le
persone sono state chiuse: la famiglia e l'allenatore.

**La misura non è il numero di test.** I difetti da cui questa Wave è
cominciata non erano visibili da nessuno dei quattro gate — 3.632 test verdi,
typecheck pulito, build a 153 rotte, e tre superfici del prodotto che non
funzionavano. Perciò la Wave si chiude con **tre collaudi di runtime** contro
un database vero, e sono loro il verdetto:

| Collaudo | Cosa prova | Esito |
|---|---|---|
| `scripts/wave-5-uat.mjs` | U-01…U-14: due club, tre sedi, tre figli, perimetro allenatore, dato clinico, iscrizione, rinnovo, fascicolo, appuntamenti, calendario, RSVP, presenze, consensi | **62/62** |
| `scripts/wave-5-security-probe.mjs` | U-15 (undici tentativi cross-tenant) e U-16 (le sedici chiavi nuove, negate e concesse) | **91/91**, una deviazione dichiarata |
| `scripts/wave-5-concurrency-probe.mjs` | U-17: due operatori, due famiglie, due schede aperte sullo stesso dato | **10/10** |

Gate: **3.922 test**, typecheck pulito, **36 warning** di lint (baseline 39),
build completa.

---

## 2. Le lane, e cosa ognuna ha davvero cambiato

### 5A — I cinque difetti che vengono prima del piano

Non erano nel piano: erano nel prodotto, e li ha trovati il collaudo iniziale.
Un genitore con più figli non raggiungeva il secondo; la dashboard
dell'allenatore interrogava otto volte una risorsa vietata al suo ruolo e
inghiottiva il 403; la prima operazione della segreteria su un appuntamento
cancellava tutte le richieste delle famiglie; il dato clinico dei minori era
mascherato **solo dal browser**; il perimetro atleti dell'allenatore lo
decideva il client.

Il filo comune vale più dei cinque casi: **quattro di questi cinque erano
difetti fra il clic e la rete**, dove un test che sostituisce il trasporto non
guarda.

### 5B — Il catalogo dei permessi, e la fine dell'allow-by-default

`src/lib/permissions/catalog.ts`: una chiave, un dominio, un'etichetta, i
ruoli, e il simbolo `⛓` per i permessi che si ottengono dal **legame** e non
dal ruolo. `canAccessClubResource` non risponde più `true` a un nome di risorsa
sconosciuto.

Togliere il ramo permissivo ha reso visibile un difetto che teneva nascosto per
costruzione: la mappatura `staff` → `staff_members` non esisteva, e finché
ogni nome sconosciuto passava, nessuno poteva accorgersene.

### 5C — L'evento sportivo diventa una riga

`club_events` e `club_event_participants` (ADR-0098, ADR-0099). Allenamenti e
gare vivevano in due colonne JSON riscritte per intero da chiunque potesse
scrivere il club: da quel fatto solo discendevano sette conseguenze — nessuna
chiave esterna, nessun permesso per riga, nessun audit, nessun vincolo, due
segretarie che si sovrascrivono, la convocazione come chiave di dizionario,
l'RSVP senza un identificativo su cui appoggiarsi.

`clubs.trainings` e `clubs.matches` restano come **proiezione in sola lettura
con un solo scrittore**, e la differenza con la doppia scrittura di prima non è
sottile: prima c'erano due scrittori indipendenti e l'ultimo vinceva in
silenzio; adesso c'è una fonte e una copia che qualcuno mantiene.

### 5D — Il fascicolo unico, e i byte dentro Attachment Core

`document_requests` e `document_submissions` (ADR-0100). Il ciclo esisteva già
e funzionava: quello che non esisteva era un posto in cui vivesse. I byte
stavano in `Asset` come base64 — una tabella **senza `organization_id`**, dove
il confine multi-tenant era il prefisso di una stringa — e il fatto stava in un
array JSON scritto aggirando `resources.ts`. Accettare o rifiutare il documento
di un minore non lasciava **nessuna** traccia.

### 5E — L'appuntamento come dominio

`appointments` e `appointment_slots`. La doppia prenotazione non la impedisce
il codice: la impedisce il database, con l'indice unico parziale
`appointments_slot_vivo_unico`. Il servizio ne **traduce** il rifiuto in una
frase che una segretaria può leggere — riscrivere quel controllo in memoria
vorrebbe dire riaprire proprio la corsa che l'indice chiude.

### 5F — Calendario unico, gare al pari, RSVP che si può accendere

Un solo calendario per allenamenti e gare, la convocazione normalizzata, e
l'RSVP con una scadenza e un interruttore per evento.

### 5G — Il riscontro alla famiglia

L'iscrizione online esisteva **per il club e non per la famiglia**: si inviava,
e poi non si sapeva più niente. Tre regole nuove: la ricevuta è una credenziale
e non un identificativo (in archivio ne resta l'impronta, ADR-0085); lo stato
si **deriva** e non si scrive; la vista pubblica è un elenco chiuso di campi,
costruito da zero e non ottenuto togliendo.

E il rinnovo, che non è un secondo motore: è lo stesso modulo con un contesto.

### 5H — La dashboard della famiglia

Le cinque cose che una famiglia non poteva fare, e adesso fa: decidere sui
propri consensi senza telefonare; scaricare la ricevuta di ciò che ha pagato;
vedere il calendario del figlio giusto quando i figli sono più d'uno; seguire
una domanda di iscrizione; chiedere un appuntamento e sapere che fine ha fatto.

### 5I — La dashboard dell'allenatore

Gli avvisi li calcolava il client, quindi li poteva dettare; e l'anagrafica di
un collega usciva intera — **codice fiscale, indirizzo e telefono** — a
chiunque avesse il ruolo allenatore. La difesa è un elenco di ciò che **può
uscire**, non di ciò che va tolto: un campo nuovo sulla scheda di un
collaboratore nasce così invisibile.

### 5J — La pulizia, e i tre collaudi

Il registro delle API nominava metà delle porte (191 → 205 voci). E le tre
sonde di runtime, che hanno trovato ciò che la sezione 3 racconta.

---

## 3. Cosa hanno trovato le sonde, e che cosa insegna

Le sonde hanno girato **dopo** che tutti e quattro i gate erano verdi. Hanno
trovato nove difetti. Nessuno di essi era visibile da un test unitario, e vale
la pena guardarli insieme perché appartengono a tre famiglie sole.

### Famiglia 1 — «Il permesso è dichiarato e nessuno lo chiede»

`clinical.manage` e `clinical.status_read` erano in catalogo e **non chiamate da
nessun modulo server**: si registrava un certificato medico senza passare da
nessuna chiave. `consents.decide_own` era elencata nel piano e assente dal
catalogo. `rsvp.answer` aveva due matrici che si contraddicevano su sei ruoli su
sette.

> **La lezione.** Una chiave in un catalogo non è un permesso finché una strada
> non la chiede. Un catalogo che elenca chiavi non applicate è peggio di un
> catalogo assente: promette una configurabilità che non c'è, e il giorno dei
> ruoli personalizzati un club spunterà una casella che non cambia niente.

### Famiglia 2 — «Il rifiuto non lascia traccia»

Quattordici chiavi su diciotto rifiutavano correttamente e **zero** di esse
scrivevano in `audit_logs`: il `recordAuditEvent({outcome: "denied"})` viveva in
quattro route handler su diciassette.

> **La lezione.** La traccia va dove il diniego si **decide**, non dove si
> compone la risposta. Il 403 lo compone ognuna delle settantaquattro rotte per
> conto proprio; la guardia è una per dominio. Chi aggiunge domani una funzione
> al dominio eredita la traccia senza sapere che esiste; chi aggiunge una rotta
> no.

Il prezzo è che le guardie sono diventate `async`, e una guardia `async`
chiamata senza `await` **non ferma niente** mentre il compilatore tace. Lo
presidia `tests/server/guardie-attese.test.mjs`.

### Famiglia 3 — «Due richieste, due effetti»

`submitPublicForm` non aveva idempotenza: due invii identici producevano due
domande in coda e due copie di ogni allegato. E uno **scope contraffatto** —
`activeOrganizationId` di un club, `allowedOrganizationIds` di un altro —
passava ogni `assertActiveClub`: quattro chiamate su quattro riuscite, un evento
riscritto e un appuntamento confermato in un club altrui.

> **La lezione.** Contro due richieste concorrenti un controllo in memoria non
> regge: leggono entrambe «non c'è» e scrivono entrambe. La difesa è l'indice.
> E «non c'è oggi una seconda strada per costruire uno scope» è una proprietà
> che vale finché qualcuno non ne scrive una.

Il dettaglio di ognuno, con il perché delle correzioni, è in
[14 — Sicurezza](14-security.md).

---

## 4. La deviazione dichiarata

`clinical.read` **non nega: proietta.** La chiamata riesce e i campi clinici
spariscono dalla risposta. Non è ciò che il §22 chiede, e resta così
deliberatamente: negare l'elenco degli atleti a un allenatore perché non può
vedere le allergie renderebbe inservibile la sua dashboard, mentre il dato
clinico resta comunque fuori. Il §22 descrive la forma giusta per le chiavi che
proteggono un **atto**; questa protegge un **campo**, e un campo si toglie.

La sonda la registra come `DEVIA`, che non è né un successo né un difetto: una
sonda che non può essere portata a verde è una sonda in cui una regressione vera
si confonde con il rumore, ma un `PASS` avrebbe nascosto una scelta che merita
di essere riletta.

---

## 5. Cosa **non** è stato fatto, e va detto

### I ruoli personalizzati non esistono

È una decisione di prodotto confermata durante questa Wave: EasyGame avrà Owner,
Club Manager, Collaborator, Staff, Trainer, Parent, Athlete come ruoli
predefiniti, **più ruoli creati dal club** con permessi granulari e scope. La
Wave 5 non li implementa; ha costruito il catalogo su cui poggeranno.

`/dashboard/access-management` **è ancora un mock**, e non può restare tale
prima della produzione. Vedi la sezione 6.

### L'allenatore ha perso il dato clinico e non c'è modo di restituirglielo

Finché non esiste la concessione per singolo operatore, un allenatore non vede
più allergie, farmaci e gruppo sanguigno. È deliberato — il default su un dato
sanitario di un minore è negato — ma è una **perdita di funzionalità** per un
club che quella visibilità la voleva, e va detta invece di essere presentata
come un miglioramento netto.

### La policy dei consensi non è chiusa

Per la Wave 5 è stato mantenuto il presidio necessario a non introdurre percorsi
nuovi che ignorino i consensi. La definizione completa resta da chiudere prima
della produzione (W4-R18).

### I pagamenti online rispondono ancora 501

Non era nello scopo della Wave 5. Resta vero, e resta il caso da manuale di
«funzione dichiarata completa perché esiste il backend».

---

## 6. I blocker della Wave 6 (pre-production)

Requisiti **obbligatori**, non desiderata.

| # | Blocker | Perché blocca |
|---|---|---|
| W6-1 | **Ruoli personalizzati**: i sette ruoli predefiniti più ruoli creati dal club, con permessi granulari e scope | Decisione di prodotto definitiva. Il catalogo dei permessi (5B) è la base; manca il motore che li assegna e li risolve |
| W6-2 | **`/dashboard/access-management` non può restare un mock** | È la schermata da cui un club amministra chi vede cosa. Una schermata finta su quel dominio è peggio di una schermata assente |
| W6-3 | **W4-R7** | Confermato per la Wave 6 |
| W6-4 | **La policy completa dei consensi** | La Wave 5 ha tenuto il presidio, non ha chiuso la policy |
| W6-5 | **La concessione del dato clinico per singolo operatore** | Senza, il taglio della Wave 5 resta una perdita netta per i club che la visibilità la volevano |

Quando W6-1 arriverà, tre cose scritte in Wave 5 diventano operative da sole: il
catalogo delle chiavi, il simbolo `⛓` che distingue i permessi di legame da
quelli di ruolo, e la traccia di audit su ogni diniego — che è ciò che permette
a un club di capire perché un suo collaboratore non riesce a fare una cosa.

---

## 7. Come rieseguire i collaudi

Serve il database di sviluppo in piedi e `EASYGAME_DB_ENV=development`.

```bash
docker compose -f docker-compose.dev.yml up -d
```

```bash
node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs scripts/wave-5-uat.mjs
```

```bash
node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs scripts/wave-5-security-probe.mjs
```

```bash
node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs scripts/wave-5-concurrency-probe.mjs
```

Ognuno semina i propri club, li cancella in `finally`, e non tocca nessun dato
preesistente. Nessuno dei tre scrive sul codice di produzione: **misurano**.

---

## 8. Una postilla: il backend completo non è la funzione

La verifica responsive di U-18 ha trovato, cercando altro, la cosa più
istruttiva di tutta la Wave: la lane 5G aveva costruito **tutto** il riscontro
alla famiglia — la ricevuta come credenziale, lo stato derivato, la vista
pubblica a elenco chiuso di campi, la rotta con il doppio limite di frequenza e
il 404 unico, il percorso dichiarato da `buildEnrollmentReceiptPath`, i test —
e **nessuna pagina che li usasse**.

Il riferimento usciva una volta sola, nella risposta all'invio, e non c'era
nessun posto in cui portarlo. `buildEnrollmentReceiptPath` aveva **zero
chiamanti**. Cioè l'iscrizione online era tornata a esistere per il club e non
per la famiglia, che è esattamente il vuoto che 5G esisteva per chiudere.

Nessuno dei quattro gate poteva vederlo: una funzione esportata e mai chiamata
non è un errore di tipo, e i test del dominio passavano tutti — provavano il
servizio, che funzionava. **Nemmeno il collaudo di runtime lo vedeva**: U-07
chiamava `readPublicEnrollmentStatus` e leggeva la risposta giusta.

> La domanda che un collaudo deve porsi non è «il servizio risponde», ma
> **«una persona ci arriva»**. Sono due domande diverse, e la prima ha una
> risposta verde anche quando la seconda ha una risposta no.

Chiuso in 5J con `/iscrizione/[reference]` e il link consegnato sulla schermata
di conferma dell'invio. Le due correzioni responsive vere trovate nello stesso
passaggio — il guscio dell'area famiglia senza `min-w-0`, e la riga della
ricevuta che a 375 px tagliava il pulsante «Scarica», cioè rendeva di nuovo non
scaricabile la ricevuta che 5H aveva appena reso scaricabile — sono presidiate
da sei invarianti nuove in `tests/ui/responsive-invariants.test.mjs` (36
controlli, erano 30).

---

## 9. L'audit di raggiungibilità, e le sei capability che non lo erano

La sezione 8 raccontava un caso isolato. Non lo era.

Un audit indipendente ha percorso ogni riga dichiarata COMPLETE nelle sezioni
Wave 5 di [11 — Capability](11-capabilities.md) **all'indietro dalla persona** —
esiste una pagina? è raggiungibile dalla navigazione di quel ruolo? il
componente chiama davvero l'endpoint? il ruolo passa i controlli? il risultato
viene disegnato? — e ne ha trovate **sei** che non lo erano. Cinque hanno
esattamente la forma di 5G: dominio, rotta, test e collaudo verdi, e nessuna
schermata che li usi.

| Capability | Dove si spezzava | Chiusa con |
|---|---|---|
| **Rinnovo precompilato** | Zero chiamanti nella UI. La pagina si intitolava «Iscrizione e rinnovo» e sapeva **leggere** una pratica di rinnovo; nessuna schermata sapeva crearne una | Sezione «Rinnova l'iscrizione» nell'area famiglia, con il modulo precompilato che riusa `FormRenderer` |
| **Documento mancante all'approvazione** | Il client `decideSubmission` accettava solo `{action, note, subjects}`: `documentRequests` non era nel tipo e non partiva mai. `requestMissingDocuments` restituiva `[]` **ogni volta** | Controllo dei documenti mancanti nel dialogo di revisione, e il campo che arriva al server |
| **Comunicazioni per evento** | I due criteri `event_convocated` e `event_no_rsvp` esistevano nel dominio; il tipo `AudienceKind` delle due schermate non li conteneva, e nessuna caricava gli eventi | Criteri selezionabili con l'evento come parametro, in un modulo condiviso fra le due pagine |
| **RSVP su partite** | `buildInvitations` iterava `clubs.trainings`, la proiezione dei **soli allenamenti**: il servizio rispondeva a una gara e nessuna schermata gliela chiedeva mai | Gli inviti si leggono dalle righe di `club_events` (ADR-0098), con il tipo e l'avversario; il controllo di risposta montato anche sulla pagina Gare |
| **Appuntamenti, ciclo di vita** | `/secretariat` leggeva e scriveva ancora `clubs.appointments`: dalla lane 5E la richiesta di una famiglia finiva in una riga che **nessuna schermata del club leggeva** | La segreteria passa dal dominio, e ha finalmente le due risposte che nessuno poteva dare: conferma e rifiuto |
| **Appuntamenti su slot** | La rotta calcolava `availableSlots` e li produceva in due punti; **zero** componenti li leggevano. La famiglia digitava un orario libero e il server pretende la corrispondenza esatta di istante: «scegli uno slot fra quelli liberi», da un elenco che nessuno mostrava | La famiglia sceglie fra gli slot che il server calcola, con i tre stati distinti — caricamento, errore, nessuno slot |

### Un settimo, trovato correggendo il primo

Il rinnovo, una volta acceso, restava utilizzabile **solo da chi aveva ricevuto
il link**: nessuna rotta diceva a una famiglia quali moduli di rinnovo il suo
club avesse pubblicato. `listFamilyRenewalForms` lo dice adesso, con il gate sul
legame e restituendo solo slug e titolo; il `GET` del rinnovo senza slug
risponde «cosa puoi rinnovare» invece di un errore.

### La regola che ne esce

> Una capability è completa quando **una persona ci arriva**, non quando il
> servizio risponde. Sono due domande diverse, e la prima ha una risposta verde
> anche quando la seconda ha una risposta no.

Il modo di verificarlo che ha funzionato è percorrere la catena **all'indietro
dalla persona** — pagina, navigazione, componente, endpoint, ruolo, disegno — e
non in avanti dal servizio. L'impronta più rapida da cercare, che ha trovato
cinque casi su sei: **una funzione esportata da un modulo della Wave con zero
chiamanti fuori dai test.**

### Due difetti responsive veri, sulle stesse superfici

Il guscio dell'area famiglia dichiarava `min-h-0` dove serve `min-w-0` — l'asse
sbagliato — e la riga di una ricevuta non andava a capo: a 375 px il contenitore
tagliava il pulsante «Scarica», cioè la ricevuta tornava non scaricabile, il
difetto che 5H aveva appena chiuso. Stesso `min-w-0` mancante corretto anche sul
guscio dell'allenatore.

### Esito dopo le correzioni

3.966 test, typecheck pulito, 0 errori e 36 warning di lint, build completa.
UAT 62/62, sonda di sicurezza **91/91**, sonda di concorrenza 10/10 — e le due
prove del confine documentale sono passate da `ambiguo` a `inesistente`, cioè
alla risposta che il §22 chiede a una lettura cross-tenant.

**Nessun Critical e nessun High resta aperto.** I Low e i difetti precedenti
alla Wave che l'audit ha elencato sono in [16 — Debito tecnico](16-technical-debt.md).
