# 16 — Debito tecnico

Ordinato per impatto. Ogni voce indica il WP che la affronta
([20 — Work Package](20-work-packages.md)).

## Alto impatto

### D1 — La logica di dominio vive nel client

`src/lib/simplified-db.ts` (4.036 righe) contiene gran parte delle regole di
business: aggregazioni, filtri per stagione, normalizzazioni, derivazioni.
Il server e in gran parte un CRUD generico.

**Perche pesa:** ogni regola e aggirabile da chi chiama direttamente le API;
il mobile deve riscrivere la stessa logica (e infatti lo fa, in
`mobile-backend-storage.ts`); una futura estrazione del backend (Cedi Platform)
dovrebbe riportare tutto lato server.

→ WP-07 (estrazione incrementale verso `src/lib/server/`)

### D2 — Doppia rappresentazione dei dati di club

Le risorse di club esistono sia in `club_resource_items` sia come colonne
`Json?` su `clubs`, tenute allineate da `syncClubAggregateField` e
`syncClubResourceItemsFromField`.

**Perche pesa:**
- il percorso «PATCH club» **cancella e ricrea** le righe: gli elementi senza
  `id` UUID valido cambiano identita;
- delete + insert **non sono in transazione**: un errore lascia dati parziali;
- nessun controllo di concorrenza: due PATCH paralleli possono perdere
  scritture;
- ogni scrittura di un singolo elemento riscrive l'intero array JSON del club.

→ WP-10 (transazione + eliminazione del percorso distruttivo)

### D3 — ~~Il filtro per stagione e solo client-side~~ — RISOLTO (2026-08-22)

`x-active-season-id` e ora letto dal CRUD generico: in lettura esclude le
risorse club di altre stagioni, in scrittura stampa la stagione attiva sul
payload. I record senza `seasonId` appartengono alla stagione baseline (la piu
vecchia del club), cosi le stagioni restano separate senza far sparire i dati
storici. Il filtro client resta come rete di sicurezza.

**Chiuso anche il riporto (2026-08-24, WP-35):** `/api/v1/seasons` crea la
stagione e ne popola la configurazione partendo da quella scelta. Restava
aperto un difetto simmetrico, ora corretto: il salvataggio generale della
scheda Club rimandava al server la fotografia delle stagioni tenuta in stato
React, quindi salvare un recapito poteva far riapparire una stagione
cancellata o rimettere attiva l'annata precedente.

→ WP-11 (chiuso), WP-32 (chiuso), WP-35 (chiuso)

### D4 — Paginazione, ordinamento e ricerca server-side — **DISPONIBILI** (2026-08-25, Blocco 8)

Il server sa fare tutto: `?limit=`, `?page=` / `?offset=`, `?q=`,
`?order_by=` + `?order=`, piu i filtri per uguaglianza gia esistenti. La
risposta porta un `meta` con `total`, `limit`, `offset` e `hasMore`.

Tre scelte che vale la pena conoscere prima di usarlo:

- **il default e ancora «tutto».** Senza `limit` non cambia niente e non c'e
  `meta`. Un default paginato avrebbe troncato in silenzio ogni lista della
  Web App;
- **i campi cercabili e ordinabili sono elenchi chiusi per risorsa.** `orderBy`
  arriva dalla query string: passarlo a Prisma senza filtrarlo vuol dire
  lasciare che il client scelga su cosa lavora il database;
- **con il filtro stagione o quello allenatore attivi la pagina si taglia in
  memoria**, non con `take`/`skip`. Quei due filtri vivono dentro il payload
  JSON e non sono esprimibili in un `where`: chiedendo la pagina al database
  si otterrebbe una pagina mezza vuota e un `total` che non corrisponde a cio
  che si vede.

**Resta aperto: la lista Atleti non la usa ancora.** La pagina raggruppa per
categoria, conta per stato, esporta e seleziona in blocco su tutto
l'archivio: consumarla a pagine e una scelta di interfaccia, non una modifica
meccanica. Vedi il punto corrispondente in [21 — Backlog](21-backlog.md).

→ WP-12 (server fatto, interfaccia da decidere)

### D5 — Copertura test — MOLTO MIGLIORATO (2026-08-22)

Il runner fa ora **discovery automatica** su `tests/**/*.test.mjs`: un file
nuovo non va piu aggiunto a mano a `package.json`. I test sono passati da 30 a
55, con copertura su route guard, middleware e conformita di tutti i 42 route
handler (autenticazione, scope, permessi, nessuna esposizione di hash).

`src/lib/server/**` e ora **testabile a runtime** ([ADR-0023](18-decision-log.md)):
97 test, di cui 29 sull'isolamento multi-tenant e 13 sull'audit log, validati
per mutazione.

**Resta scoperto:** `simplified-db.ts` (4.036 righe), la sincronizzazione
distruttiva `club_resource_items` ⇄ `clubs.<json>`, i componenti e il mobile.

→ WP-07, WP-10, WP-24

### D6 — ~~Nessuna CI~~ — RISOLTO (2026-08-22)

`.github/workflows/ci.yml` esegue su ogni push e pull request tre job:
**web** (typecheck, lint, test, build, controllo codice irraggiungibile),
**mobile** (check:types, lint) e **guardrails** (nessun `.env` committato,
nessun token noto, nessuna connection string con credenziali, nessun
`DATABASE_URL` nel mobile). La voce `.github/` e stata rimossa da
`.gitignore`.

## Impatto medio

### D22 — Un secondo componente di programma settimanale, non collegato

`src/components/dashboard/WeeklyTrainingSchedule.tsx` non e importato da
nessuna pagina: `/training` usa `WeeklyTrainingSchedulePanel.tsx`. Il
componente orfano contiene un autosave a 3 secondi **senza deduplicazione**,
che scriverebbe a ogni montaggio, e salva un programma settimanale nella
colonna `clubs.trainings`.

**Perche pesa:** e la trappola descritta nell'errore tipico n. 1 di
`CLAUDE.md` — chi cerca «autosave del programma settimanale» trova per primo
la versione sbagliata.

→ WP-18

### D7 — Adapter `supabase.ts` fuorviante

`src/lib/supabase.ts` (1.116 righe) espone un'API in stile Supabase
(`from().select().eq()`) implementata su `fetch`. **Non parla con Supabase.**
Il nome inganna chi legge, e il livello di indirezione in piu complica il
debug.

Persistono anche chiavi legacy nello storage del browser
(`sessionStorage: supabase_session`).

→ WP-17 (rinomina e riduzione graduale)

### D8 — ~~`.babelrc` disattiva SWC~~ — RISOLTO (2026-08-22)

`.babelrc` con `next/babel` (residuo del tool Tempo) faceva usare a Next Babel
al posto di SWC. Rimossi `.babelrc`, `babel.config.js` e la dipendenza
`@babel/runtime`, come previsto da [ADR-0017](18-decision-log.md), dopo aver
verificato che tutti i gate passassero.

Misurato: build **161 s -> 62 s**, First Load JS condiviso **95,8 -> 87,8 kB**
(app router) e **91 -> 82,5 kB** (pages router), set di route identico.

Restano da valutare separatamente `tempo.config.json` e la dipendenza
`tempo-devtools`, ancora classificati REVIEW.

### D9 — Residui di due generazioni di UI

- `src/components/trainer/`: `trainer-*-page.tsx` (v1, orfani) accanto a
  `trainer-*-dashboard-page.tsx` (v2, in uso).
- `easygamemobile/client/screens/`: 10 schermate v1 su mock non collegate.
- 18 primitive `src/components/ui/` mai referenziate.
- Componenti orfani vari (`AddAthleteForm`, `SetupGuide`, `ProtectedRoute`,
  `NewDashboard`, `AttendanceConfirmation`, ...).

Elenco completo e classificazione in [cleanup-report](cleanup-report.md).

→ WP-18

### D10 — Pagine monolitiche — **SCOMPOSIZIONE COMINCIATA** (2026-08-25, Blocco 8)

`athletes/[id]/page.tsx` e passata da **8.696 a 8.480 righe** — 216 in meno,
mentre nello stesso blocco le si aggiungeva la lettura documenti per il
genitore. L'estrazione ne aveva tolte 322 (8.751 → 8.429), poi 51 sono
rientrate con la funzione nuova: e il ritmo reale di una scomposizione
incrementale, e va detto com'e. Non e un
risultato: e un inizio, ed e dichiarato come tale.

Cosa e uscito, e perche proprio quello:

| Estratto | Dove | Perche per primo |
|----------|------|------------------|
| Genitori e tutori: stato dell'accesso, scadenza del token, nomi, id stabili | `src/lib/athlete-guardians.ts` | E dominio puro, e non era verificato da niente. 13 test ora lo esercitano |
| Stati iniziali dei form, eta compiuta, booleani, federazioni, kit | `src/lib/athlete-profile-fields.ts` | Funzioni pure che stavano dentro un componente solo perche le si era scritte li |
| Le sette sezioni e la loro risoluzione da `?tab=` | `src/lib/athlete-profile-tabs.ts` | E la struttura della pagina: era a riga 3.445 di ottomila |
| Intestazione (foto, nome, categorie, azioni) | `src/components/athletes/profile/athlete-profile-header.tsx` | E la parte che **non dipende da nient'altro** |
| Barra delle sezioni | `src/components/athletes/profile/athlete-profile-tabs.tsx` | Idem |

**La regola di lavoro**, piu importante del numero: un test verifica che il
file **non superi le 8.500 righe**. Chi aggiunge una funzione alla scheda
atleta e sfora deve prima portare fuori una sezione. E il modo in cui una
scomposizione incrementale non si ferma al primo giro.

**Cosa resta dentro:** i sette pannelli (`TabsContent`), i venti dialoghi e i
circa novanta `useState`. Ogni pannello dipende da decine di variabili di
stato dichiarate in cima: estrarne uno vuol dire prima raggruppare quello
stato in un hook, ed e il prossimo passo, non un dettaglio di questo.

**Nota su cio che il refactor non ha fatto**, deliberatamente: nessun
cambiamento di comportamento, nessuna classe CSS toccata, nessun testo
riscritto. Un refactor che ne approfitta per sistemare anche la grafica non e
piu verificabile.

### D10bis — Le altre pagine monolitiche

`athletes/[id]/page.tsx` ≈ 340 KB, `clothing/page.tsx` ≈ 176 KB,
`registration-management/page.tsx` ≈ 150 KB. Contengono markup, stato e logica
di dominio insieme. Sono difficili da modificare in sicurezza e da far leggere
a un agente AI in una sola passata.

→ WP-19 (scomposizione incrementale, una pagina per WP)

### D11 — Due sistemi di toast

`toast-notification.tsx` (custom, prevalente) e `toaster.tsx` + `use-toast.ts`
(shadcn) sono entrambi montati.

→ WP-14

### D12 — Pages Router residuo

`src/pages/_app.tsx`, `_document.tsx`, `_error.tsx`, `404.tsx` convivono con
l'App Router. `_app.tsx` contiene ancora riferimenti commentati a
`tempo-devtools`.

→ WP-18

### D13 — File nel database — **RISOLTO STRUTTURALMENTE** (2026-08-25, Blocco 8)

`Asset.data_base64` permette di salvare binari in Postgres, ma il problema non
si ferma li: `supabase.storage.upload` produce un **data URL base64** e le
schede atleta lo salvano dentro `athletes.data` (`identityDocuments`,
`enrollmentDocuments`, `documents`, `certificateFiles`, `avatar`). Con 200
atleti la lista trasferiva ~25 MB.

`view=summary` (WP-31) toglieva gli allegati dalle liste e portava il payload
a ~2 MB, ma i file restavano dentro il record.

**Cosa e cambiato con il Blocco 8**
([ADR-0034](18-decision-log.md#adr-0034--gli-allegati-escono-dai-record-e-passano-da-un-servizio-con-driver)):
un allegato e ora una riga di `attachments` con i suoi metadati, i byte
stanno in `attachment_blobs`, e il record di dominio conserva **solo** il
riferimento `attachment:<uuid>`. Il servizio
(`src/lib/server/attachments.ts`) e l'unico punto di lettura e scrittura, ha
un'autorizzazione propria, un limite di dimensione e un elenco chiuso di tipi.
Lo storage passa da un `StorageDriver`: cambiare provider e un file nuovo e
una riga di configurazione.

**Cosa resta**, e non e piu strutturale:

- **i data URL legacy gia in archivio.** Continuano a funzionare e migrano
  quando qualcuno li tocca. Non esiste, e non deve esistere, un comando che
  riscriva l'archivio in blocco;
- ~~**gli avatar**~~ — **chiuso il 2026-08-25**. Erano il residuo principale, e
  misurandolo si e visto quanto: la lista di 200 atleti pesava **23,7 MB**
  anche dopo aver tolto tutti gli altri allegati, perche `view=summary`
  conservava l'avatar in base64. Ora la lista riceve
  `/api/v1/athletes/:id/avatar` e le foto arrivano come immagini, in
  parallelo e in cache: **23,7 MB → 140 kB** (99,4%), 35 kB con una pagina da
  50. La misura si rifa con `scripts/measure-athletes-payload.mjs`;
- **la tabella `assets`**, ancora usata dal logo di club e dagli allegati dei
  moduli online della **prima** versione. I moduli nuovi passano dal servizio
  allegati (`owner_type: "form"`); i file legacy restano dove sono e vengono
  citati come `asset:<id>`, che `resolveSubmissionFileUrl` risolve. Travasare
  dei binari e un'operazione a se, con un rischio suo.

→ WP-15 (chiuso per gli allegati di persona), resta aperto per il logo di club
e per la tabella `assets`

### D28 — Residui dei moduli V1 in `clubs.document_templates` (2026-08-26)

La Modulistica V2 ha portato moduli, versioni e compilazioni in tre tabelle
([ADR-0039](18-decision-log.md#adr-0039--i-moduli-escono-da-clubsdocument_templates-e-diventano-tre-tabelle)),
ma il travaso e una **copia**: `clubs.document_templates` conserva ancora le
voci `online_form` e `online_form_submission` di prima.

**Non e un difetto di funzionamento**: niente le legge piu, se non
`src/lib/document-templates.ts` (28 righe) che le salta quando la pagina
Modulistica elenca i modelli di stampa. E una scelta: cancellare il dato di
partenza subito dopo un travaso significa non poterlo piu confrontare.

**Cosa serve per chiudere**: eseguire il travaso sugli ambienti, verificare
che i moduli e le risposte ci siano tutti, e solo allora rimuovere le voci dal
campo JSON. Finche non succede, `src/lib/document-templates.ts` resta.

→ B9-15 e B9-16 in [21](21-backlog.md)

### D14 — Validazione input disomogenea

Coercizioni manuali (`String(x || "").trim()`) ovunque; `zod` e installato ma
usato in un solo file.

→ WP-05

### D15 — Alias di compatibilita mai dismessi

`simplified_athletes`, `simplified_payments`, `simplified_certificates`,
`simplified_notifications`, `organizations` puntano agli stessi delegate delle
risorse reali. Raddoppiano la superficie API senza aggiungere valore.

→ WP-20

## Impatto basso

### D16 — Dipendenze non utilizzate

- `radix-ui` (pacchetto ombrello): nessun import.
- `tempo-devtools`: tutti gli import sono commentati.
- `prettier`: in `dependencies` invece che in `devDependencies`, e nessuno
  script lo invoca.
- `vaul`, `embla-carousel-react`, `react-resizable-panels`, `react-hook-form`:
  usati **solo** da primitive UI non referenziate.
- ~~`@babel/runtime`~~: rimosso insieme a `.babelrc` (vedi D8).

Nessuna di queste finisce nel bundle client (il tree-shaking le esclude perche
i moduli non sono raggiungibili): l'impatto e su `npm install`, non a runtime.

### D17 — 46 warning ESLint

Prevalentemente `@next/next/no-img-element` e
`react-hooks/exhaustive-deps`. Nessun errore. Non farli crescere.
(Erano 53; sono scesi con la rimozione di due componenti account morti nel
Blocco 4, non con una campagna di pulizia.)

### D18 — `.gitignore` con voci discutibili — MIGLIORATO (2026-08-22)

Rimosse `.github/` (impediva di committare la CI) e `.git` (inutile).
Restano `**/tempobook/**` ora superfluo e `node_modules` ripetuto piu volte:
innocui, da ripulire con calma.

### D19 — Drift Prisma cosmetico

`athlete_category_memberships`: il DB ha default a livello colonna, lo schema
Prisma default applicativi; due indici hanno nome troncato diversamente.
Comportamento identico. **Non generare una migrazione correttiva** senza motivo
funzionale.

### D20 — ~~Documentazione operativa superata~~ — RISOLTO (2026-08-22)

`docs/testing-and-deploy.md` non cita piu `typescript.ignoreBuildErrors` e
rimanda alla Knowledge Base.

### D21 — Il database di sviluppo e Docker, non un branch Neon

L'obiettivo di ADR-0012 e raggiunto — il locale non tocca piu staging — ma con
PostgreSQL in Docker invece che con un branch Neon
([ADR-0024](18-decision-log.md)): la creazione del branch richiede la console
Neon, non disponibile da questa working copy.

Differenza residua: lo sviluppo gira su PostgreSQL «nudo», gli ambienti su Neon
con pooler e SSL. Le 7 migrazioni si applicano identiche, ma la parita non e
totale.

Resta inoltre che `db-guard` protegge gli script npm, non un `npx prisma`
invocato a mano.

→ WP-09

### D23 — Manca la tabella dei comuni italiani

`src/lib/italian-registry.ts` conosce le 107 province con la loro regione, ma
non i comuni. Conseguenze concrete:

- il CAP si valida (cinque cifre) ma non si risolve in comune e provincia;
- il codice fiscale si calcola solo se qualcuno fornisce il codice catastale
  del comune di nascita, o se esiste gia un codice fiscale valido da cui
  ricavarlo.

E una scelta, non una svista: inventare i codici catastali produrrebbe codici
fiscali formalmente validi e sostanzialmente falsi
([ADR-0027](18-decision-log.md)). Si chiude importando una fonte ufficiale
(ANPR o ISTAT) con la sua licenza, e aggiornandola quando i comuni cambiano —
il che succede ogni anno.

### D24 — La casella IMAP si configura ma non si legge

Dal Blocco 4 la console di piattaforma configura host, porta, cifratura e
credenziali IMAP, e ne verifica la connessione. **Nessuna funzione applicativa
legge la posta**: non c'e ricezione, ne parsing dei messaggi, ne collegamento
con notifiche o moduli.

E il presupposto, non la funzione. Chi la completera trovera gia il trasporto
(`imap-client.ts`) e la macchina a stati (`imap-protocol.ts`), che oggi
implementano solo `LOGIN` e `LOGOUT`.

### D26 — Taglie di testo scritte a mano fuori dalla chrome

Quindici occorrenze di `text-[11px]`, `text-[10px]` e `text-[15px]` in
griglie dense (programma settimanale, calendario allenamenti, prenotazioni
strutture, badge notifiche) e tre `text-[0.8rem]` dentro le primitive shadcn
vendorizzate (`ui/calendar.tsx`, `ui/form.tsx`).

Sono precedenti alla regola tipografica fissata dopo il Blocco 5. Le superfici
che definiscono l'identita — marchio, chrome, accesso, console di piattaforma
— sono gia pulite e un test lo impedisce
(`tests/ui/topbar-club-vs-platform.test.mjs`).

**Come si chiude:** si normalizzano quando si tocca quella pagina per altro
motivo, non con un rifacimento di massa. Le primitive vendorizzate si lasciano
come sono: allinearle vuol dire perderne l'aggiornabilita.

### D25 — Due immagini decorative non piu referenziate

`public/images/account/account-team.png` non e piu usato da nessuna pagina
dopo il rifacimento della home account.
`public/images/account/account-hero.png` resta, ma solo da 1280 px in su.
Sono asset statici: non pesano sul bundle, pesano sul repository. Da valutare
insieme agli altri residui di `public/`.

### D27 — Due route di modifica orfane, una su dati finti

`src/app/athletes/[id]/edit/page.tsx` e
`src/app/trainers/[id]/edit/page.tsx` non sono raggiungibili: **nessun link,
nessun `router.push`** in tutto il repository porta li. La prima e peggio che
orfana — e costruita su dati **inventati a mano nel file** (`+39 123 456
7890`, `RSSGPP80A01H501Z`), quindi chi ci arrivasse digitando l'indirizzo
vedrebbe un'anagrafica che non esiste.

La modifica vera avviene nelle schede di dettaglio (`[id]/page.tsx`), che
hanno le proprie sezioni in modifica.

**Perche non sono state rimosse nel Blocco 8:** [ADR-0016](18-decision-log.md)
limita le eliminazioni ai residui gia classificati `SAFE TO DELETE` in
[cleanup-report](cleanup-report.md), dove queste due non compaiono. Vanno
classificate prima, e rimosse in un commit proprio.

→ WP-18

### D28 — `receipts.receipt_number` e univoco su tutta la tabella, non per club

Il vincolo e `@unique` globale. Due societa che emettono la loro prima
ricevuta dell'anno chiedono entrambe `R-2026-0001`, e la seconda fallisce per
un motivo che non ha niente a che vedere con lei. E un difetto di modello
preesistente, reso visibile dall'emissione automatica delle ricevute per
incasso (Workstream A, [ADR-0036](18-decision-log.md#adr-0036--una-rata-e-un-debito-un-incasso-e-un-movimento-due-tabelle-non-una)).

**Come e mitigato oggi.** `issueReceiptForTransaction` riprova con il numero
successivo, fino a 25 tentativi, invece di far fallire l'emissione. Funziona,
ma produce numerazioni con buchi quando piu club emettono nello stesso
momento, e con molti club i tentativi crescono.

**Cosa lo chiude.** Un unique composto `(organization_id, receipt_number)` al
posto di quello globale, e una sequenza per club. E una migrazione che tocca
un vincolo su dati esistenti: va verificato prima che non ci siano numeri
duplicati fra club — oggi non possono esserci, proprio per via del vincolo
globale, quindi la conversione e sicura. Lo stesso vale per
`invoices.invoice_number`, che ha esattamente la stessa forma.

→ nessun WP ancora

### D29 — `payments.status` e una copia del registro incassi

Dopo [ADR-0036](18-decision-log.md#adr-0036--una-rata-e-un-debito-un-incasso-e-un-movimento-due-tabelle-non-una)
la verita su quanto e stato incassato sta in `payment_transactions`;
`payments.status`, `paid_at` e `method` restano come **cache derivata**, piu
`data.ledger` con incassato e residuo.

**Perche pesa:** due rappresentazioni della stessa cosa possono divergere. Il
rischio e contenuto — le scrive **una sola** funzione
(`recomputeChargeFromLedger`), nella stessa transazione dell'incasso — ma
resta: una scrittura diretta su `payments` che aggirasse il servizio incassi
lascerebbe la cache disallineata senza che niente lo segnali.

**Perche e stato accettato:** rimuovere i tre campi avrebbe toccato area
Movimenti, report, dashboard e il contratto API che l'app mobile consuma, cioe
un'ampiezza sproporzionata rispetto al difetto, dentro un workstream che deve
restare confinato ai pagamenti. Il ragionamento completo e nell'ADR.

**Cosa lo chiude:** portare i consumatori a leggere il registro (o una vista
che lo aggrega) e togliere i tre campi. Presuppone WP-07.

→ nessun WP ancora

### D30 — ~~Un test di chrome dipende dai fine riga del checkout~~ — RISOLTO (2026-08-25, integrazione Web V1)

`tests/ui/topbar-club-vs-platform.test.mjs` verificava che dal marchio della
sidebar si tornasse all'elenco dei club con
`/href="\/account"[\s\S]{0,240}<EasyGameLogo/`. Fra i due punti ci sono
esattamente 240 caratteri con fine riga LF: in un checkout CRLF i cinque `\r`
in mezzo portavano la distanza a 245 e il test falliva su un componente che
nessuno aveva toccato.

**Come e stato chiuso.** Le due strade non erano alternative, e sono state
prese entrambe:

1. **`read()` normalizza a LF** prima di applicare qualunque espressione
   regolare. E la difesa che vale sempre, perche non dipende da come e
   configurata la macchina di chi esegue i test.
2. **`.gitattributes` con `* text=auto eol=lf`** fissa la convenzione del
   repository, cosi due sviluppatori con `core.autocrlf` diverso ottengono lo
   stesso checkout. L'operazione e stata sicura senza rinormalizzazioni: alla
   data l'index era gia interamente LF (740 file di testo, zero CRLF). I file
   eseguiti da Windows (`.bat`, `.cmd`, `.ps1`) restano CRLF di proposito.

Due test nuovi presidiano il risultato: uno **simula** un checkout CRLF e
verifica che l'asserzione regga comunque, l'altro che il sorgente letto dai
test non contenga mai `\r`. Senza la simulazione la garanzia sarebbe valsa
solo sulle macchine che gia non avevano il problema.

**Cosa era sbagliato nella reazione istintiva.** Cambiare `core.autocrlf`
sulla propria macchina faceva passare il test e lasciava il difetto intatto
per la macchina successiva, CI compresa.

→ chiuso, nessun WP

### D31 — `AddPaymentForm` e una terza finestra di pagamento, mai montata

`src/components/forms/AddPaymentForm.tsx` (200 righe) non e importata da
nessuna parte: **nessun** file del repository la referenzia. Porta con se un
elenco di metodi di pagamento **scritti a mano** — «Bonifico Bancario», «Carta
di Credito», «Contanti», «Assegno» — e una tendina «Stato» con Pagato / In
Attesa, cioe esattamente i due difetti che il Workstream A ha chiuso altrove
([ADR-0036](18-decision-log.md#adr-0036--una-rata-e-un-debito-un-incasso-e-un-movimento-due-tabelle-non-una)).

**Perche pesa piu di un componente morto qualunque:** e verosimile. Chi
cercasse «form pagamento» la troverebbe per prima, e montandola
reintrodurrebbe il testo libero sul metodo e lo stato impostato a mano, senza
accorgersene.

**Perche non e stata rimossa nel Workstream A:** vale la stessa regola di
[D27](#d27--due-route-di-modifica-orfane-una-su-dati-finti) —
[ADR-0016](18-decision-log.md) limita le eliminazioni ai residui gia
classificati `SAFE TO DELETE` in [cleanup-report](cleanup-report.md), dove
questa non compare. Va classificata prima, e rimossa in un commit proprio.

→ WP-18

### D32 — L'API assegnazioni scrive `clubs.<json>` aggirando `resources.ts`

`src/app/api/clothing/assignments/route.ts` legge e scrive **direttamente**
`clubs.clothing_inventory`, `clubs.kit_assignments` e
`clubs.jersey_assignments` con `prisma.club.update`. E la trappola numero 3 di
[CLAUDE.md](../../CLAUDE.md): la scrittura non passa da
`syncClubResourceItemsFromField`, quindi le righe corrispondenti in
`club_resource_items` **restano quelle di prima**.

**Cosa rompe oggi:** niente di visibile. Le pagine leggono le colonne JSON
tramite `getClubData`, che legge `clubs.<campo>`; `club_resource_items` e la
copia normalizzata che nessun percorso di lettura dell'abbigliamento usa. Il
disallineamento e reale e silenzioso.

**Cosa rompera:** il giorno in cui una lettura passa dal CRUD generico
(`/api/v1/kit_assignments`) — per esempio per impaginare le assegnazioni come
si e fatto per gli atleti (WP-12) — vedra dati vecchi.

**Perche non e stato corretto nel Workstream B:** il route handler e nello
scope del workstream ma la correzione non lo e. Spostarlo su `resources.ts`
significa riscrivere il percorso di scrittura di tre risorse insieme, e va
fatto con i suoi test di isolamento multi-tenant, non di passaggio dentro un
commit che parla di consegne. Lo stesso vale per `saveClubJson` nella pagina
Abbigliamento, che ha la stessa forma.

→ nuovo WP da aprire; correlato a WP-07 (riduzione di `simplified-db`)
