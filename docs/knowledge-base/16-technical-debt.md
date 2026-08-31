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

**RISOLTO (2026-08-26, Blocco Finale C): la lista Atleti la usa.** La scelta
di interfaccia e stata: **due modi, decisi dall'archivio e non
dall'operatore**. Sotto una pagina (200 atleti) tutto arriva in una richiesta
sola e la pagina continua a cercare, raggruppare ed esportare nel browser —
con centocinquanta righe e piu rapido di un giro sulla rete, e nessun club
piccolo deve imparare che esistono le pagine. Sopra, ricerca, stato e sede
vanno al server, compare la barra delle pagine, «totali» diventa il conteggio
del database, e l'export si prende tutte le pagine prima di stampare.

Sono serviti due filtri nuovi (`category_id`, `site_id`) perche la categoria
di un atleta non e una colonna ma una riga di appartenenza: senza, una pagina
sarebbe stata «duecento atleti da filtrare poi a tre».

→ WP-12 chiuso

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

### D22 — Un secondo componente di programma settimanale, non collegato — **CHIUSO**

`src/components/dashboard/WeeklyTrainingSchedule.tsx` non era importato da
nessuna pagina — `/training` usa `WeeklyTrainingSchedulePanel.tsx` — e
conteneva un autosave a 3 secondi **senza deduplicazione**, che avrebbe scritto
a ogni montaggio.

**Chiuso nel Blocco D2** ([ADR-0055](18-decision-log.md#adr-0055--configurazione-si-sceglie-per-categoria-operazione-si-sceglie-per-gruppo)):
il file e stato rimosso. Il lavoro sui gruppi operativi ha attraversato quella
schermata, ed e stato il momento in cui la trappola dell'errore tipico n. 1 di
`CLAUDE.md` si e materializzata davvero — le prime modifiche sono finite nel
componente sbagliato. Un test statico ora verifica che non torni.

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
- Componenti orfani vari (`SetupGuide`, `ProtectedRoute`, `NewDashboard`,
  `AttendanceConfirmation`, ...). `AddAthleteForm` e
  `WeeklyTrainingSchedule` sono stati **rimossi** nel Blocco D2.

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

### D14 — Validazione input disomogenea — **CHIUSO DOVE IL CORPO E CHIUSO** (2026-08-26, Blocco Finale C)

`src/lib/validation/` dichiara con `zod` la forma degli endpoint a corpo
chiuso e conosciuto — autenticazione, incassi, stagioni, piano commerciale,
contributi — e un corpo malformato produce `400` con `VALIDATION_ERROR`
nell'envelope ([09](09-api-conventions.md)).

**Resta fuori, per scelta**, il CRUD generico `/api/v1/<resource>`: cinquanta
risorse con forme aperte e in evoluzione, che uno schema chiuso rifiuterebbe a
raffica. Li la difesa e altrove — `normalizeModelInput`, `assertAnagraficaIsValid`,
la guardia sui campi di proprieta della piattaforma — e va lasciata li finche
le risorse non hanno un contratto stabile.

→ WP-05 chiuso per lo scope dichiarato

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

### D27 — ~~Due route di modifica orfane, una su dati finti~~ — RISOLTO (2026-08-26, Blocco Finale C)

`src/app/athletes/[id]/edit/page.tsx` e
`src/app/trainers/[id]/edit/page.tsx` non sono raggiungibili: **nessun link,
nessun `router.push`** in tutto il repository porta li. La prima e peggio che
orfana — e costruita su dati **inventati a mano nel file** (`+39 123 456
7890`, `RSSGPP80A01H501Z`), quindi chi ci arrivasse digitando l'indirizzo
vedrebbe un'anagrafica che non esiste.

La modifica vera avviene nelle schede di dettaglio (`[id]/page.tsx`), che
hanno le proprie sezioni in modifica.

**Come sono state chiuse (Blocco Finale C).** Non cancellate: **sostituite
con un rimando** alla scheda di dettaglio, come gia faceva `/staff/:id/edit`.
Un indirizzo puo essere in un segnalibro o in una vecchia email, e un 404 non
aiuta chi lo apre; il rimando porta dove la modifica avviene davvero. I dati
inventati sono spariti con il form, e un test statico impedisce di
reintrodurli.

→ chiuso da Blocco Finale C

### D28 — ~~`receipts.receipt_number` e univoco su tutta la tabella, non per club~~ CHIUSO

**Chiuso dal Blocco Finale B** ([ADR-0044](18-decision-log.md#adr-0044--un-numero-di-documento-appartiene-a-un-club-e-a-un-esercizio-e-si-incrementa)),
migrazione `20260826170000_document_numbering`.

Il vincolo e composto — `(organization_id, receipt_number)` e
`(organization_id, invoice_number)` — e la sequenza sta in
`document_number_sequences`, incrementata con una sola istruzione dentro una
transazione. I venticinque tentativi non ci sono piu.

Emerso chiudendolo: la pagina Movimenti aveva una **seconda** numerazione, nel
browser, che contava le ricevute scaricate in pagina. Rimossa.

**Resta aperto** il numero di fattura digitato a mano in `AddInvoiceForm`:
vedi D36.

### D36 — ~~Il numero di fattura lo scrive una persona~~ CHIUSO sul percorso principale

`AddInvoiceForm` chiede il numero all'operatore e lo manda al server. Con il
vincolo per club ([ADR-0044](18-decision-log.md#adr-0044--un-numero-di-documento-appartiene-a-un-club-e-a-un-esercizio-e-si-incrementa))
due societa non si scontrano piu, ma dentro la stessa societa nulla impedisce
di ripetere un numero, di saltarne uno o di scriverlo in una forma che poi
nessuno rilegge.

**Chiuso dal Blocco Finale B** ([ADR-0047](18-decision-log.md#adr-0047--un-pagamento-non-e-un-documento-ricevuta-e-fattura-si-scelgono)):
`POST /api/v1/payment-transactions/:id {"action":"issue-invoice"}` emette la
fattura di un incasso con un numero assegnato dal server, e l'elenco degli
incassi mostra la scelta fra ricevuta e fattura.

**Resta** `AddInvoiceForm`, per le fatture **non** collegate a un incasso: li
il numero lo digita ancora una persona. E il percorso a volume basso, e va
chiuso spostando anche quelle sull'allocatore.

→ nessun WP ancora

### D37 — ~~Il piano di un club lo puo cambiare il club~~ — RISOLTO (2026-08-26, Blocco Finale C)

Il piano, lo stato dell'abbonamento e i servizi aggiuntivi stavano in
`clubs.settings` e la pagina Organizzazione li rendeva modificabili **dal
club**. Erano descrittivi finche
[ADR-0046](18-decision-log.md#adr-0046--chi-puo-usare-cosa-si-calcola-in-un-posto-solo-e-la-risposta-dice-sempre-perche)
non ne ha fatto l'ingresso del calcolo degli entitlement: da li in poi
accendere il gating avrebbe voluto dire lasciare che un club si concedesse il
piano superiore da solo.

**Come e stato chiuso**
([ADR-0048](18-decision-log.md#adr-0048--il-piano-di-una-societa-appartiene-alla-piattaforma-non-alla-societa)).
Quattro chiavi di `clubs.settings` sono ora di proprieta della piattaforma e
la guardia sta **nella scrittura** (`withPlatformOwnedSettings`, chiamata da
`resources.ts` in creazione e in modifica), non nell'interfaccia: togliere la
tendina non avrebbe protetto niente, perche la stessa `PATCH` la puo rifare a
mano chiunque. Un valore diverso da quello presente viene ignorato e lascia
una riga di audit con esito `denied`.

**Il difetto trovato chiudendolo.** Il calcolo leggeva
`settings.subscriptionSettings`, la pagina scriveva `settings.subscription`:
nessun club aveva il piano che credeva di avere, e il test che avrebbe dovuto
accorgersene seminava la chiave sbagliata.

→ chiuso da Blocco Finale C, 22 test in `tests/server/entitlements-ownership.test.mjs`


### D38 — Il documento di una ricevuta non viene archiviato

Ricevute e fatture si **ristampano** da `GET /api/v1/documents/:kind/:id`, che
rigenera il documento dalla riga ([ADR-0047](18-decision-log.md#adr-0047--un-pagamento-non-e-un-documento-ricevuta-e-fattura-si-scelgono)).
Nessuna copia impaginata viene conservata.

**Per una ricevuta va bene**: il documento e una proiezione della riga, e una
copia in piu diverge la prima volta che il club cambia logo. **Per una
fattura e discutibile**: un documento fiscale, una volta emesso, dovrebbe
restare identico a com'era.

**Le due strade, e perche nessuna si prende scrivendo un file.**

- *PDF in `attachments`* — serve una libreria di generazione, cioe una
  dipendenza nel bundle del server. E la strada giusta, ed e una decisione;
- *HTML in `attachments`* — richiederebbe di aggiungere `text/html`
  all'elenco chiuso dei tipi accettati, che oggi lo esclude perche
  `attachments` serve file **caricati dagli utenti**. Ammetterlo per un
  documento generato dal server lo ammetterebbe anche per un file che arriva
  da un modulo pubblico. **Non va fatto** senza separare i due percorsi.

→ nessun WP ancora


### D39 — I deployment Preview falliscono: mancano `DATABASE_URL` e `DIRECT_URL`

Ogni push sul branch innesca un deployment **Preview** che si ferma alla
validazione dello schema Prisma:

    Error code: P1012
    error: Environment variable not found: DIRECT_URL.

Le due variabili sono configurate sull'ambiente **Production** del progetto
`easygame-staging` e non su **Preview**. Il deploy da riga di comando con
`--prod` funziona; quello automatico no.

**Non e una regressione**: succede da almeno il 2026-08-25. **Non si corregge
dal repository**: richiede di aggiungere le variabili all'ambiente Preview su
Vercel, cioe una modifica alla configurazione che richiede autorizzazione
(CLAUDE.md, sezione 9).

**Costo di lasciarlo aperto.** Nessuna anteprima per branch, e un deployment
rosso in dashboard a ogni push che non riguarda il codice — cioe il rumore
che fa smettere di guardare i deployment rossi.

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

### D31 — ~~`AddPaymentForm` e una terza finestra di pagamento, mai montata~~ — RISOLTO (2026-08-26, Blocco Finale C)

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

**Come e stata chiusa (Blocco Finale C).** Rimossa, dopo aver dimostrato che
nessun file del repository la referenzia. Qui la cancellazione e la cosa
giusta e il rimando no: non e un indirizzo, e un componente — e il danno che
faceva era proprio essere trovabile.

→ chiuso da Blocco Finale C

### D32 — ~~L'API assegnazioni scrive `clubs.<json>` aggirando `resources.ts`~~ — RISOLTO (2026-08-25, integrazione Web V1)

`src/app/api/clothing/assignments/route.ts` scriveva **direttamente**
`clubs.clothing_inventory`, `clubs.kit_assignments` e
`clubs.jersey_assignments` con `prisma.club.update`. Era la trappola numero 3
di [CLAUDE.md](../../CLAUDE.md): la scrittura non passava da
`syncClubResourceItemsFromField`, quindi le righe corrispondenti in
`club_resource_items` restavano quelle di prima. Non rompeva niente di
visibile — le pagine leggono le colonne JSON — ma il CRUD generico
(`/api/v1/kit_assignments`) serviva dati vecchi, e il disallineamento cresceva
a ogni assegnazione.

**Come e stato chiuso.** La route usa ora
`replaceClubResourceCollections(organizationId, [...])`, aggiunto a
`resources.ts` insieme all'estrazione di `applyClubResourceSync`, il cuore
della sincronizzazione che accetta una transazione gia aperta.

**Perche una funzione nuova e non tre chiamate a quella esistente.** Chiamare
tre volte `replaceClubResourceCollection` sarebbe stato corretto sul singolo
campo e sbagliato sull'operazione: assegnare un kit scala il magazzino,
aggiunge l'assegnazione e puo assegnare un numero di maglia, e un errore sulla
seconda avrebbe lasciato la prima gia scritta — magazzino scalato per un kit
che nessuno risulta avere. Con una transazione sola le tre collezioni
riescono o falliscono insieme.

**Compatibilita con le assegnazioni esistenti.** L'aggregato scritto in
`clubs.<campo>` e un **sovrainsieme** dell'elemento originale: i campi di
dominio restano dove erano, quindi le pagine che li leggono non cambiano. Alla
prima scrittura dopo la correzione, `club_resource_items` viene riallineato
dall'aggregato completo: i club che avevano usato solo questa route si
riparano da soli, senza uno script di travaso. Le righe gia presenti
conservano `created_at`, cosi una riscrittura non rigenera l'identita di cio
che c'era gia.

**Su `saveClubJson` nella pagina Abbigliamento** — indicato qui come «stessa
forma» quando la voce e stata aperta — la verifica ha mostrato che il sospetto
era infondato: passa da `updateClubData` → `writeClubFields` →
`PATCH /api/v1/clubs/:id`, cioe dal CRUD generico, che
`syncClubResourceItemsFromField` lo chiama gia. Non c'era una seconda
scrittura da correggere.

Otto test runtime in `tests/server/clothing-assignments-resources.test.mjs`
presidiano allineamento, transazione unica, validazione prima della
scrittura, isolamento multi-tenant e conservazione delle date.

→ chiuso, nessun WP

### D33 — `athlete_category_memberships`: la migrazione e lo schema non dicono la stessa cosa

`npx prisma migrate diff --from-migrations prisma/migrations
--to-schema-datamodel prisma/schema.prisma` non e vuoto. La differenza e
tutta su una tabella:

- `id` — lo schema dichiara `@default(dbgenerated("gen_random_uuid()"))`, la
  migrazione `20260409113000_athlete_category_memberships` crea la colonna
  **senza** default;
- `updated_at` — stessa forma: `now()` nello schema, nessun default nel SQL;
- due indici hanno nomi diversi per il troncamento a 63 caratteri
  di PostgreSQL (`..._ca_key` contro `..._cat_key`).

**Quanto pesa oggi:** poco. Prisma genera gli id dal client e scrive
`updated_at` a ogni `update`, quindi l'assenza dei default non si manifesta.
I nomi degli indici sono cosmetici finche nessuno li cita per nome.

**Cosa rompera:** un `INSERT` che non passi da Prisma — uno script di
importazione, una correzione a mano in SQL — fallirebbe su `id` invece di
riceverne uno generato. E un `prisma migrate dev` su una macchina nuova
genererebbe una migrazione «di allineamento» che nessuno ha chiesto,
confondendo la cronologia.

**Perche non e stato corretto nell'integrazione Web V1:** e un difetto
**preesistente**, verificato eseguendo lo stesso `migrate diff` sulla baseline
`d78e047`, che produce una differenza identica. Le quattro migrazioni dei tre
workstream non aggiungono deriva: correggere questa qui avrebbe mescolato una
riparazione vecchia con un'integrazione, e reso impossibile dire quale delle
due avesse rotto qualcosa.

**Cosa lo chiude:** una migrazione additiva che fa `ALTER COLUMN ... SET
DEFAULT` sulle due colonne, e la rinomina dei due indici ai nomi che Prisma si
aspetta. Nessuna riga esistente viene letta o riscritta.

→ nuovo WP da aprire

### D34 — Un guscio di club su quattro non puo restringersi

Il contenitore principale del club e un elemento flex dentro una riga. Un
elemento flex ha `min-width: auto`: **si rifiuta di restringersi sotto la
larghezza del proprio contenuto**, a meno che non abbia un `overflow` diverso
da `visible` oppure `min-width: 0`.

Quarantanove pagine usano la variante `flex flex-1 flex-col overflow-hidden` e
ottengono il comportamento giusto **per effetto collaterale**: `overflow-hidden`
azzera la dimensione minima automatica. Quattro usavano
`flex flex-1 flex-col lg:hidden`, che non ha ne l'uno ne l'altro.

**Cosa produceva.** A 768 px su `/organization` la barra delle nove schede —
che ha gia `overflow-x-auto` e dovrebbe scorrere da sola — allargava il guscio
a 1022 px invece di scorrere, e con lui tutta la pagina: «Salva Modifiche»
finiva fuori dallo schermo. Nessuna invariante statica poteva vederlo, perche
ogni singola classe era corretta: sbagliato era cio che mancava.

**Come e stato chiuso (Blocco A).** `min-w-0` sui quattro gusci, piu
un'invariante in `tests/ui/responsive-invariants.test.mjs`.

**Cosa resta.** Il debito vero non e la classe, e che la stessa struttura di
guscio sia **ricopiata in cinquantatre file** invece di stare in un componente.
Finche e cosi, il cinquantaquattresimo nascera con la variante sbagliata e
nessuno se ne accorgera fino alla prossima verifica su schermo.

→ WP-19 (scomposizione delle pagine monolitiche), di cui e un caso particolare

### D35 — I due script di misura non sono eseguibili come documentato

`scripts/measure-athletes-payload.mjs` e
`scripts/measure-multisite-performance.mjs` importano moduli con alias `@/` e
senza estensione, che Node da solo non risolve: servono
`--experimental-strip-types` **e** `--import ./tests/helpers/register-hooks.mjs`.

Il primo lo documentava, il secondo no — e quindi il comando scritto nel suo
stesso commento moriva sull'import invece di misurare. Una misura che non si
puo rifare torna a essere un numero copiato, che e esattamente cio che quegli
script esistono per evitare.

**RISOLTO (2026-08-26, Blocco Finale C).** `package.json` ha tre voci che
incapsulano i flag: `measure:athletes`, `measure:multisite` e `measure:web` —
quest'ultima per lo scenario nuovo, che misura come **cresce** il costo di
ogni dominio da 200 a 2.000 atleti e conta le interrogazioni, non solo i byte.

→ chiuso da Blocco Finale C

---

## Debito registrato dal Blocco E (2026-08-26)

Sono cose viste durante l'hard check finale e **non** corrette li, perche
correggerle sarebbe stato lavoro estraneo al blocco. Nessuna impedisce a una
segreteria di lavorare: la matrice
[23](23-v1-release-matrix.md) le classifica `DEFERRED_POST_V1`.

### E1 — Un doppio del client Prisma non prova il driver

**Impatto: alto.** E la causa per cui il difetto piu grave del blocco — nessun
allegato poteva essere salvato ([ADR-0059](18-decision-log.md#adr-0059--ladapter-del-driver-e-il-client-prisma-sono-la-stessa-cosa-in-due-pacchetti)) — e sopravvissuto a
1.535 test verdi. I test del servizio allegati sostituiscono il client, e
quella e la scelta giusta: verificano il dominio. Manca uno strato sottile che
eserciti **contro un database vero** ogni tipo di colonna che non sia testo,
numero, data o JSON.

Oggi ce n'e uno solo, `Bytes`. L'invariante sull'allineamento delle dipendenze
copre la causa nota; non copre la prossima.

**Cosa farebbe la differenza:** una manciata di test che girano solo quando
`DATABASE_URL` punta a un database di sviluppo, e che vengono saltati
altrimenti. Non nella CI, che non ha un database: in locale, prima di un
rilascio.

### E2 — La scheda atleta chiede quindici volte lo stesso club

**Impatto: medio.** Aprendo una scheda, la pagina emette quindici richieste
`GET /api/v1/clubs?id=…&fields=<uno>` — piani di pagamento, sconti,
previsionale, articoli, kit, magazzino, gruppi numerazione, assegnazioni,
sedi, e cosi via — una per campo. Sono piccole e vanno in parallelo, quindi il
tempo non e il problema; la forma lo e.

Non e un difetto introdotto: e il modo in cui `resources.ts` espone i campi di
`clubs`. Una sola richiesta con `fields=a,b,c` chiuderebbe la questione.

### E3 — Il primo link pubblico di un modulo conserva il titolo predefinito

**Impatto: basso.** Lo slug si genera alla **creazione** del modulo, quando il
titolo e ancora «Nuovo modulo». Rinominarlo e pubblicarlo non lo rigenera, e
il link che si manda alle famiglie resta `/forms/nuovo-modulo-<suffisso>`
invece del `/forms/iscrizione-2026-<suffisso>` che la documentazione del
modello promette.

Non e un errore: rigenerare lo slug alla pubblicazione romperebbe i link gia
condivisi, e il comando «rigenera il link» esiste nell'interfaccia. Ma il caso
comune — primo modulo, prima pubblicazione — produce un link che dice la cosa
sbagliata, e nessuno sa di dover premere quel comando.

**Cosa farebbe la differenza:** rigenerare lo slug **solo** alla prima
pubblicazione, quando `published_version` e ancora zero e nessuno puo averlo
condiviso.

### E4 — Cambiare l'importo di una rata pagata non e possibile, e va bene solo per meta

**Impatto: basso.** `PATCH /api/athlete-payments/:id` rifiuta di modificare
una rata gia saldata, ed e giusto: un debito estinto non si riapre di
soppiatto. Ma la strada corretta — stornare l'incasso, correggere l'importo,
registrare di nuovo — non e suggerita da nessuna parte: il messaggio dice solo
«I pagamenti gia pagati non possono essere modificati».

### E5 — La console di piattaforma non ha un'utenza propria negli ambienti

**Impatto: medio, e non e codice.** L'accesso amministrativo si decide con una
lista di indirizzi email in una variabile d'ambiente. Per verificare la
console nel Blocco E e stato necessario aggiungere un indirizzo di collaudo
alla configurazione locale, creare l'utenza sul database di sviluppo e
togliere l'indirizzo a verifica finita.

Funziona, ed e verificabile; ma significa che **non esiste un modo previsto**
per far entrare un amministratore in un ambiente nuovo senza modificare la
configurazione. E una decisione di prodotto, non un difetto.

### E6 — «1 atleti»

**Impatto: basso, visibile a tutti.** Le schede categoria scrivono
«1 atleti», «1 allenatori», «1 allenamenti settimanali»: il numero e
variabile, il sostantivo e sempre al plurale. Succede ovunque si componga
`{n} {parola}` senza chiedersi quanto vale `n`.

Non e un difetto di funzionamento ed e la prima cosa che si nota aprendo
Categorie con una categoria da un atleta solo.

**Cosa farebbe la differenza:** una funzione sola — `plurale(n, "atleta",
"atleti")` — e la sostituzione nei punti che oggi concatenano a mano. E un
lavoro di mezz'ora che tocca molte righe: esattamente il genere di cosa che
non si fa dentro un blocco di stabilizzazione.


### E7 — Next.js resta sulla 14, e sulla 14 alcuni avvisi non si chiudono

**Impatto: medio.** Il Blocco E ha portato Next da 14.2.23 a 14.2.35, l'ultima
della stessa minor, e con questo ha chiuso l'unica vulnerabilita **critica**
del progetto: l'aggiramento dell'autorizzazione nel middleware
([GHSA-f82v-jwr5-mffw](https://github.com/advisories/GHSA-f82v-jwr5-mffw)), che
su un prodotto che usa il middleware per le route guard non poteva restare
aperta.

Restano avvisi che si chiudono solo con la **15.x**. La verifica uno per uno
sta nella [matrice](23-v1-release-matrix.md): quasi tutti descrivono funzioni
che EasyGame non usa — Server Actions, rewrites, Pages Router con i18n. Quello
che resta davvero e la superficie di `next/image`, che ammette due host
esterni in `remotePatterns`.

**Cosa farebbe la differenza, nell'ordine:** togliere i due host esterni da
`remotePatterns` se non servono piu (mezz'ora); poi pianificare la 15, che e
un lavoro suo e va fatto con i suoi tempi.


### E8 — L'idempotenza dell'incasso era una lettura seguita da una scrittura — `CHIUSO`

**Chiuso nello stesso collaudo che lo aveva aperto.** La finestra non era
teorica: Stripe consegna i due eventi di un pagamento praticamente insieme —
**109 millisecondi** nel collaudo — e il doppio accredito si e ripresentato a
ogni pagamento anche dopo che l'identita dell'incasso era corretta.

La chiude l'indice unico **parziale** `payment_transactions_incasso_unico`
(migrazione `20260827020000`): al piu un incasso positivo per (club, pagamento
del provider). Parziale perche storni e rimborsi copiano per costruzione
l'identificativo dell'incasso che compensano, e un indice pieno avrebbe
impedito di rimborsare.

**La lezione che vale oltre questo difetto.** Un controllo applicativo di
unicita non e un vincolo di unicita: e un suggerimento che regge finche non
c'e concorrenza. Dove due invocazioni possono toccare lo stesso denaro, la
regola va scritta dove la concorrenza si arbitra.


### E9 — Un conto di incasso che nasce per altra via non riceve il proprio default — RISOLTO (2026-08-27)

> **Risolto.** La domanda che questa voce poneva — «default tecnico o atto
> commerciale?» — aveva come risposta **entrambi, in momenti diversi**, ed e la
> ragione per cui un booleano solo non poteva bastare. Ora la distinzione la
> porta una data, `online_payments_decided_at`: `NULL` significa mai deciso e si
> puo inizializzare, valorizzata significa deciso e nessun evento del PSP la
> ribalta. La regola sta in `resolvePlatformEnablement`, funzione pura, e la
> applicano entrambi gli upsert. Migrazione
> `20260827040000_interruttore_pagamenti_deciso`, dodici test di regressione in
> `tests/server/connect-enablement.test.mjs`. Vedi
> [ADR-0064](18-decision-log.md#adr-0064--un-interruttore-spento-di-proposito-si-distingue-da-uno-mai-acceso-e-la-differenza-e-una-data).
>
> Il testo che segue resta come descrizione del difetto.

**Impatto: basso, ma silenzioso.** `startConnectOnboarding` fa `upsert` su
`club_payment_accounts`: il ramo *create* imposta
`online_payments_enabled: true`, il ramo *update* no. Se la riga esiste gia —
creata da un'altra strada, o rimasta da un tentativo precedente — l'onboarding
la aggiorna senza mai accendere l'interruttore.

Nel collaudo e successo esattamente questo: l'account era attivo su Stripe,
`charges_enabled` e `payouts_enabled` entrambi veri, zero requirements, e i
pagamenti online restavano spenti. Dalla console si vede lo stato `disabled`
senza un motivo apparente, e non c'e nulla che spieghi perche.

**Cosa farebbe la differenza:** decidere se `online_payments_enabled` sia un
default tecnico o un atto commerciale. Se e un atto commerciale — come dice il
commento in `src/app/api/v1/payments/account/route.ts` — allora il ramo
*create* non dovrebbe accenderlo, e la console dovrebbe mostrarlo come «da
abilitare» invece che come `disabled`. Se e un default tecnico, va allineato
anche nel ramo *update*. Oggi le due strade dicono cose diverse.

### E10 — Un rimborso non produce la nota di credito che gli corrisponde

**Impatto: nullo sul software, aperto sulla fiscalita.** Dal 2026-08-27 il
rimborso si avvia da EasyGame
([ADR-0065](18-decision-log.md#adr-0065--il-rimborso-si-avvia-da-easygame-a-scriverlo-nel-registro-resta-levento-firmato)),
e il registro incassi lo rappresenta correttamente: movimento append-only,
rata ricalcolata, commissione restituita in proporzione.

**Cosa e gia coerente, e va detto perche non sembri un buco piu grande di
quello che e.** Un rimborso **non** lascia documenti fiscali in uno stato
impossibile:

- `assertIssuable` rifiuta di emettere una ricevuta da un movimento negativo,
  con il messaggio che dice cosa fare invece — «si rettifica il documento
  originale»;
- la ricevuta dell'incasso originale **resta valida**, ed e giusto: attesta che
  del denaro e arrivato, e quel denaro era arrivato davvero. Il fatto successivo
  e un secondo fatto;
- `cancelDocument` esiste, con motivo obbligatorio, per il caso in cui il
  documento vada annullato del tutto.

**Cosa manca.** Il documento che **rettifica** una ricevuta dopo un rimborso
parziale. In EasyGame esiste la **numerazione** — `credit_note` e uno dei tre
`DOCUMENT_NUMBER_KINDS`, con prefisso `NC` — e non esiste il documento: nessun
modello Prisma, nessun emettitore, nessuna stampa.

**Perche non e stato fatto insieme al rimborso.** Perche e scope fiscale e non
scope pagamenti, e le due cose hanno cardinalita diverse: un rimborso puo non
richiedere nessun documento (la maggior parte delle ASD non emette fatture),
e un documento di rettifica ha un intestatario, una serie e una numerazione
proprie. Farlo qui avrebbe voluto dire deciderne anche la trasmissione, che e
il confine che [ADR-0053](18-decision-log.md#adr-0053--easygame-prepara-il-tracciato-fatturapa-non-lo-trasmette-e-non-lo-dichiara-trasmesso)
tiene chiuso di proposito.

**Cosa farebbe la differenza:** un work package fiscale che aggiunga il modello
`CreditNote` accanto a `Receipt` e `Invoice`, con lo stesso snapshot e lo stesso
registro di numerazione — che gia lo prevede — e l'emissione a partire dal
documento originale, non dal movimento di rimborso. **Non** la trasmissione
allo SdI, che resta bloccata altrove.

---

## Debito registrato da RC Fix 2 (2026-08-28)

### Il conteggio di un gruppo operativo e quello della pagina, non dell'archivio

**Dove:** `src/app/athletes/page.tsx`, `athleteGroups`.

**Cosa succede.** Ogni squadra ha la propria scheda con il proprio conteggio —
`Pulcini · Scauri (99)`. Quel numero conta le righe **caricate**, non quelle
che il gruppo ha davvero: sopra la soglia di paginazione la pagina ne ha
duecento su tutto l'archivio, e il conteggio si divide fra i gruppi presenti in
quelle duecento.

**Come si vede.** Su un club di collaudo con 224 atleti, la scheda
`Pulcini · Scauri` diceva **99** senza filtri e **110** — il numero vero —
scegliendo quel gruppo dal filtro, perche a quel punto e il server a
restringere. Due numeri diversi per la stessa squadra, a seconda di come ci si
e arrivati.

**Perche non e stato corretto qui.** Non e una regressione di RC Fix 2: e il
comportamento della lista paginata da quando esiste, e valeva gia per le
schede di categoria prima che diventassero gruppi. Correggerlo vuol dire
chiedere al server un conteggio **per gruppo** — una query di aggregazione
nuova sulla rotta di elenco — e non e una riga.

**Cosa farebbe la differenza:** far tornare a `/api/v1/simplified_athletes` i
conteggi per `(category_id, site_id)` accanto a `meta.total`, e usarli nelle
intestazioni delle schede invece di contare le righe in memoria. Finche non
c'e, il numero da credere e quello che si ottiene **filtrando** per gruppo.

---

## Debito registrato dalla UAT su staging di RC Fix 2 (2026-08-28)

Tre inezie viste provando l'applicazione sul deployment pubblico. Nessuna
delle tre era fra i venti punti di RC Fix 2, e nessuna e stata corretta li:
un commit che chiude un elenco non e il posto dove infilare altro.

### Le spunte delle sedi non dicono se sono premute

**Dove:** la scheda «Nuova categoria» / «Modifica categoria», sezione «Sedi in
cui e attiva» (`src/app/categories/page.tsx`).

**Cosa succede.** Le sedi si accendono e si spengono con dei `Button` che
cambiano colore. A schermo si capisce; con uno screen reader no: non c'e
`aria-pressed`, quindi la sola differenza fra sede attiva e sede spenta e il
colore.

**Cosa farebbe la differenza:** `aria-pressed={selected}` sui pulsanti, come
gia fanno i filtri di stato dell'elenco Atleti.

### Quattro tendine della scheda staff non hanno un nome

**Dove:** `src/app/staff/new/page.tsx` — tipo documento, ruolo, reparto,
stato.

**Cosa succede.** Nell'albero di accessibilita compaiono come
`combobox` senza nome. Il campo ha un'etichetta visibile accanto, ma non
associata al controllo: chi naviga a voce sente «casella combinata» e basta.

**Perche non e stato corretto qui.** E precedente a RC Fix 2, che su quella
scheda ha toccato solo i sei campi di identita in cima — quelli, il nome ce
l'hanno.

**Cosa farebbe la differenza:** `aria-label` sul trigger, oppure legare
l'etichetta con `id`/`aria-labelledby`.

### Con un solo elemento, il menu di export offre due voci uguali

**Dove:** `availableExportScopes` in `src/lib/list-selection.ts`.

**Cosa succede.** Su un elenco con una riga sola, selezionata, il menu offre
«Esporta selezionati (1)» **e** «Esporta tutti (1)»: due voci che producono
lo stesso documento.

**Perche non e stato corretto qui.** La regola scritta riguarda il **filtro**
— «risultato filtrato» si offre solo se il filtro toglie davvero qualcosa — e
allargarla a «selezionati» significa cambiare una funzione coperta da nove
test per un caso limite che non fa danni. Va fatto, non di corsa.

**Cosa farebbe la differenza:** non offrire `all` quando
`selectedCount === totalCount`.

### L'elenco Atleti legge l'archivio due volte a ogni apertura

**Dove:** `src/app/athletes/page.tsx` — `refreshAthletesData` e l'effetto
debounced che chiama `loadAthletePage`.

**Cosa succede.** Su un club sopra la soglia di paginazione la pagina fa due
letture in fila:

    GET /api/v1/simplified_athletes?...&view=summary&limit=200&order_by=last_name
    GET /api/v1/simplified_athletes?...&view=summary&limit=200&status=active&order_by=last_name

La prima serve a conoscere il totale, le categorie e le sedi, e a decidere se
la pagina e paginata; appena `paginated` diventa vero, l'effetto debounced
rilegge la stessa pagina applicando il filtro di stato predefinito
(`active`) e butta via il primo risultato. Nella stessa apertura
`athlete_category_memberships` viene letto **due volte**, con la stessa URL.

**Misurato** su staging, club `QA UAT Club` con 212 atleti: la lettura
scartata vale 226 KB decodificati (14 KB sul filo), quella delle appartenenze
84 KB decodificati (11 KB sul filo). Sei chiamate API in tutto, di cui tre
ridondanti.

**Perche non e stato corretto durante il collaudo.** La prima lettura non
serve solo alla lista: alimenta categorie, sedi, gruppi e la decisione stessa
di paginare. Toglierla o filtrarla intreccia il debounce della ricerca, il
ritorno a pagina 1 sui filtri e il filtro gruppo — cioe il cuore della pagina
piu usata del prodotto. Non e il genere di modifica da fare di passaggio
durante una campagna di collaudo.

**Cosa farebbe la differenza:** far applicare alla prima lettura i filtri
correnti e tenere una firma dei filtri gia caricati, cosi l'effetto debounced
salta il primo giro quando riprodurrebbe cio che e gia in memoria; e chiedere
le appartenenze una volta sola per apertura.

### Gli incassi parziali non compaiono nel centro contabile — RISOLTO (RC Fix 3, 2026-08-28)

**Risolto** in [27 — RC Fix 3](27-rc-fix-3.md), punto 1, con
[ADR-0068](18-decision-log.md#adr-0068--le-entrate-sono-cassa-il-denaro-incassato-non-si-deduce-dallo-stato-della-rata):
delle due strade descritte qui sotto e stata scelta la **seconda**, e senza
inventare righe di prima nota. Il movimento porta ora `collectedAmount` accanto
ad `amount`, «Entrate» somma il primo e «Previste» e il residuo. La descrizione
che segue resta come l'analisi che ha portato alla decisione.


**Dove:** `/movements` — la scheda «Entrate» e la tabella «Movimenti».

**Cosa succede.** Sul club di collaudo sono stati incassati **250,00 €** su due
rate (100 su 130 e 150 su 199,80): la scheda dell'atleta lo dice, e
`GET /api/v1/payment-transactions` restituisce quattro movimenti netti per
250,00 €. La pagina Movimenti — che si presenta come «centro contabile unico
per entrate, uscite, giroconti, fatture e ricevute» — mostra
**«Entrate 0,00 €»**, **«Nessun movimento trovato»** e «Previste: 329,80 €».

Non e un errore di somma: e il modello. La pagina aggrega le **rate**, e una
rata `partially_paid` non e «pagata», quindi finisce fra i previsti. Gli
incassi veri — le righe di `payment_transactions` — non entrano
nell'aggregazione. Finche una rata non e saldata per intero, il denaro gia
arrivato non risulta da nessuna parte in contabilita.

**Perche non e stato corretto durante il collaudo.** Le due strade sono
entrambe decisioni di prodotto, non correzioni:

- **postare ogni incasso come movimento**: risolve il numero, ma introduce
  righe di prima nota che nessuno ha inserito a mano, e va deciso se e quando
  si possano modificare o cancellare;
- **cambiare cosa dice la scheda**: distinguere «incassato» da «rate saldate»
  e mostrarli entrambi, lasciando la prima nota com'e.

Chi sceglie deve saperlo prima: e la differenza fra un registro di cassa e un
riepilogo di crediti, e oggi la pagina ha il titolo del primo e il contenuto
del secondo.

**Cosa farebbe la differenza, comunque si decida:** che la scheda «Entrate» non
possa dire `0,00 €` mentre il club ha incassato 250,00 €.

## Registrati dalla revisione indipendente finale (2026-08-28)

Quattro cose viste rileggendo il changeset del Full Club UAT da revisore, e
**non** corrette li: nessuna e un difetto di sicurezza o di contabilita, e
ognuna aprirebbe uno scopo che una campagna di collaudo non e il momento di
aprire.

### `clubs.settings` si riscrive per intero, e due scritture concorrenti se ne perdono una — RISOLTO IN PARTE (RC Fix 3, 2026-08-28)

**Riprodotto** — `tests/server/club-settings-concurrency.test.mjs`, primo test —
e **chiuso per la scheda Club**: le sue sezioni mandano ora solo le proprie
chiavi in `settings_patch`, e la fusione la fa il server sotto
`SELECT … FOR UPDATE`
([ADR-0069](18-decision-log.md#adr-0069--una-modifica-parziale-di-clubssettings-dichiara-solo-le-proprie-chiavi)).

**Resta aperto** per i due percorsi che hanno bisogno dell'oggetto intero
perche devono poter **cancellare** una chiave: `patchClubSettings`
(onboarding, reparti staff) e `createClubSeason` in `src/lib/server/seasons.ts`.
La ragione per cui la stagione non e stata spostata e ancora quella scritta qui
sotto — il riporto passa da `resources.ts`, che usa il client globale — e non e
cambiata.


**Dove:** `src/lib/server/seasons.ts` — `createClubSeason` legge lo stato con
`readClubSeasonState` e lo riscrive con `saveClubSeasons`, che rilegge
`clubs.settings` e ne salva una copia nuova. Lo stesso schema, dal lato
client, in `patchClubSettings` (`src/lib/club-profile.ts`).

**Cosa succede.** Fra la lettura e la scrittura non c'e ne transazione ne
blocco di riga. Due scritture concorrenti su `settings` — creare una stagione
mentre l'autosave della scheda Club e in volo, che sono due comandi della
**stessa pagina** `/organization` — si sovrascrivono: l'ultima vince e porta
con se la copia che aveva letto, quindi le modifiche dell'altra spariscono.

**Perche non e stato corretto.** La correzione giusta e la stessa di
[ADR-0067](18-decision-log.md): transazione piu `SELECT ... FOR UPDATE` sulla
riga del club. Ma `createClubSeason` puo trascinarsi dietro un **riporto** che
scrive collezioni di club passando da `resources.ts`, che usa il client
globale e non quello della transazione: metterci intorno una transazione senza
far scendere il client fin la significa scrivere meta dentro e meta fuori, che
e peggio del difetto. E un lavoro di un blocco, non di una riga.

**Cosa farebbe la differenza:** far accettare a `resources.ts` un client di
transazione, e allora il blocco sulla riga del club diventa una riga sola.

### L'intestazione dell'elenco Atleti dice il totale sbagliato per un quarto di secondo

**Dove:** `src/app/athletes/page.tsx` — `refreshAthletesData` e l'effetto
debounced.

**Cosa succede.** La prima lettura non manda il filtro di stato, quindi
`listMeta.total` e il totale **di tutti** gli atleti; l'intestazione lo
etichetta pero con lo stato scelto («Atleti Attivi: 212» su un club che ne ha
200 attivi e 12 sospesi). Dopo 250 ms l'effetto debounced rilegge con il
filtro e il numero si corregge da solo.

E lo stesso nodo della [doppia lettura](#lelenco-atleti-legge-larchivio-due-volte-a-ogni-apertura):
si chiude insieme a quella, facendo applicare alla prima lettura i filtri
correnti.

### L'import ignora la colonna «Anno di nascita» quando la colonna data e mappata ma vuota

**Dove:** `src/lib/athlete-import.ts` — `rawBirth` in
`normalizeImportedAthletes`.

**Cosa succede.** `rawBirth` guarda `mapping.birthDate`, e se quella
mappatura c'e non guarda mai `mapping.birthYear`. Un file con una colonna
«Data nascita» parzialmente compilata e una colonna «Anno» piena scarta le
righe senza data con «Data di nascita mancante», anche quando l'anno basterebbe
a importarle come fa gia oggi un anno secco nella colonna data.

**Cosa farebbe la differenza:** ripiegare sull'anno quando la cella della data
e vuota, con lo stesso avviso «solo l'anno» che l'anteprima gia sa dire.

### La stagione dell'avvio guidato si crea sul club che dice `localStorage`, non su quello caricato dalla pagina

**Dove:** `src/app/onboarding/page.tsx` chiama `createSeason` da
`src/lib/api/seasons.ts`, che non porta un club: `apiRequest` costruisce
`x-active-club-id` leggendo lo scaffale locale al momento della chiamata,
mentre la pagina ha catturato `clubId` al montaggio.

**Cosa succede.** Se il club attivo cambia in un'altra scheda durante l'avvio
guidato, i due divergono e la stagione nasce sull'altro club. Non e una falla
multi-tenant — il server valida comunque l'header contro i club dell'utente, e
un club non posseduto resta un 403 — e la finestra e stretta.

**Cosa farebbe la differenza:** un parametro `clubId` facoltativo su
`createSeason` che imposti l'header, come fanno gia le altre chiamate che
sanno su quale club stanno lavorando.

## Registrati dal ritest a runtime sul deployment finale (2026-08-28)

### Le date di nascita impossibili passano dall'API — RISOLTO (RC Fix 3, 2026-08-28)

**Risolto** in [27 — RC Fix 3](27-rc-fix-3.md), punto 2, con
[ADR-0070](18-decision-log.md#adr-0070--una-data-di-nascita-si-legge-come-testo-non-come-date).
La misura qui sotto ha inoltre sottostimato il difetto: non passavano solo le
date implausibili, ma anche quelle **inesistenti** — `2026-02-31` veniva
salvata come 3 marzo 2026, perche `new Date` la riporta invece di rifiutarla.


**Dove:** `src/lib/athlete-import.ts` — la regola di plausibilita vive
nell'anteprima dell'import, che gira nel browser. Lo schema di validazione
delle anagrafiche (`src/lib/validation/schemas.ts`) non pone limiti a
`birth_date`.

**Misurato** sullo staging, con sessione valida e ruolo che governa il club:

    POST /api/v1/simplified_athletes  { birth_date: "2030-05-05" }  ->  200
    POST /api/v1/simplified_athletes  { birth_date: "1890-05-05" }  ->  200

Il difetto 5 del [Full Club UAT](26-full-club-uat.md) e stato chiuso dove era
stato visto — il file — ma la stessa riga entrata dall'API passa senza una
parola. Da quella data discendono eta, categoria per anno di nascita e codice
fiscale: e la stessa conseguenza descritta li, da una porta diversa.

**Perche non e stata corretta durante il closeout.** La correzione giusta e un
limite sul campo nello schema: server, una regola sola, valida per ogni
scrittura di anagrafica. Ma tocca il contratto di un endpoint che usano anche
l'import a scaglioni e l'app mobile, ed e arrivata **dopo** la doppia revisione
e dopo il deploy verificato: applicarla avrebbe richiesto un altro giro di
deploy e di ritest per poter essere dichiarata provata.

**Cosa farebbe la differenza:** `birth_date` non nel futuro e non prima del
1900, nello schema, con lo stesso confine che `toIsoDate` applica gia a un anno
numerico.

### La Dashboard legge l'archivio atleti quattro volte

**Dove:** `/dashboard` — la pagina intera, non la sola scheda delle metriche.

**Misurato** sul deployment finale, club con 210 atleti, da
`PerformanceResourceTiming`: 23 chiamate API, 1.246,5 KB decodificati, di cui
**883,8 KB** in quattro letture di `simplified_athletes` — due URL distinte
(`?view=summary` e la completa), ognuna chiesta **due volte** — e **324,8 KB**
in quattro letture di `athlete_category_memberships`, tutte con la stessa URL.

La query morta `all-athletes` **non c'e piu**: nessuna delle letture porta
`select=id`. Il conteggio «4 → 3» scritto nel documento del collaudo riguardava
la sola scheda delle metriche; la pagina intera ne fa quattro.

E la stessa doppia lettura gia registrata per l'elenco Atleti, su un'altra
pagina, e si chiude nello stesso modo: una firma dei parametri gia caricati,
cosi la seconda richiesta identica non parte.

## Registrato da RC Fix 3 (2026-08-28)

### Il report Pagamenti dice «Incassato» contando le rate saldate, non il denaro

**Dove:** `calculatePaymentReport` in `src/lib/club-report-utils.ts`, letta da
`/reports`.

**Cosa succede.** E lo stesso difetto che RC Fix 3 ha chiuso su `/movements`,
sopravvissuto su un'altra pagina: `totalPaid` somma l'**importo dovuto** di
ogni rata che risulta saldata, e zero per una rata incassata a meta. Sui dati
del Full Club UAT — 329,80 EUR dovuti, 250,00 EUR incassati — Movimenti dice
ora 250,00 e il report continuerebbe a dire 179,80.

**Perche non e stato corretto qui.** RC Fix 3 aveva per perimetro esplicito la
pagina Movimenti, e ampliarlo a `/reports` avrebbe portato dentro le sue
categorie e le sue soglie di scaduto, che nessuno ha ancora ricollaudato. La
correzione e pero minima: il campo `collectedAmount` che il report gia riceve
sul movimento e la sola cosa che manca.

**Cosa farebbe la differenza:** `totalPaid` che somma `movement.collectedAmount`
e `totalPending` / `totalOverdue` che ne ripartiscono il residuo, come fa
`summarizeClubMovements`
([ADR-0068](18-decision-log.md#adr-0068--le-entrate-sono-cassa-il-denaro-incassato-non-si-deduce-dallo-stato-della-rata)).

---

## Debito aperto dal modulo Lavoro sportivo (2026-08-28)

| # | Voce | Perche resta aperta |
|---|------|---------------------|
| SW-01 | **Movimenti non dice perche mancano i compensi** | Chi non ha `sport_work.read` vede Uscite piu basse senza una riga che lo spieghi. La conseguenza e voluta, il silenzio no |
| SW-02 | **Le regole normative in attesa di validazione professionale** | Elencate nel cap. 21 dell'analisi [28](28-lavoro-sportivo-e-compensi-analisi.md). Nel rule set sono **dieci voci** marcate `PENDING_PROFESSIONAL_VALIDATION`: tre per il 2026 (ritenuta sull'eccedenza, deducibilita dei contributi, trattamento dei premi) e sette per il 2027, che aggiungono aliquote, causali F24, massimale e minimale. Nessuna produce calcoli definitivi: il collaudo del 2026-08-28 lo ha verificato a runtime |
| SW-03 | **Le aliquote 2027 sono provvisorie** | Pubblicate da INPS a febbraio 2027. Fino ad allora ogni erogazione datata 2027 e una stima dichiarata, non un errore |
| ~~SW-04~~ | ~~**Il numero della circolare INPS 2026 non e concorde**~~ | **Chiuso il 2026-08-28.** Il riferimento corretto e la **circolare INPS n. 8 del 3 febbraio 2026**; la «n. 5/2026» delle fonti secondarie e sbagliata. Aggiornati `src/lib/sport-work/rules/2026.ts` e l'analisi 28 |
| SW-05 | **`trainer_payments` convive con il modulo nuovo** | Per scelta ([ADR-0076](18-decision-log.md#adr-0076--un-promemoria-di-pagamento-non-diventa-unerogazione-perche-i-contributi-non-si-inventano)): convertirlo inventerebbe contributi. La convivenza va chiusa quando i club avranno riportato a mano cio che serve |
| SW-06 | **`/procura` resta ambiguo** | Quattro fattispecie con lo stesso nome. Il modulo non le migra e non le classifica: serve una decisione di prodotto |
| SW-07 | **Rate personalizzate solo via API** | Il modello e l'endpoint le accettano; l'editor offre solo rate uguali e mensilita |
| SW-08 | **Volontari e rimborsi forfettari non implementati** | Il tetto mensile e in regola; le condizioni di legittimita no |
| SW-09 | **Nessun entitlement di piano sul dominio** | Il modulo e disponibile a ogni club con i permessi giusti: se deve diventare un servizio a pagamento serve una voce nel catalogo |
| SW-10 | **Massimale annuo non applicato** | Il valore c'e, il modo in cui si applica al lavoro sportivo con franchigia e riduzione non e validato: superarlo produce un avviso, non un troncamento |
| SW-11 | **Gli elenchi del modulo non paginano** | Compensi, Scadenze e Adempimenti restituiscono e disegnano **tutte** le righe del club: al collaudo, 236 scadenze producono 139 kB e 227 pulsanti «Eroga» in pagina. A questa scala e irrilevante (28 ms), ma il costo cresce linearmente e nessun limite lo ferma. Trovato dal collaudo a runtime del 2026-08-28 |
| SW-12 | **`/api/v1/attachments/:id` fa uscire il messaggio dell'ORM** | Un identificativo non-UUID produce il testo di Prisma, con il nome del modello e il codice d'errore di Postgres. Sul lavoro sportivo il difetto e stato chiuso in `sportWorkFailure`; su Allegati resta, ed e fuori dal perimetro di questo commit. Trovato dal collaudo a runtime del 2026-08-28 |
| ~~SW-13~~ | ~~**`CRON_SECRET` non e configurato su staging**~~ | **Chiuso il 2026-08-28.** La variabile e stata generata e impostata su `easygame-staging` (ambiente Production): `GET /api/v1/sport-work/scheduler` non risponde piu 503 ma 401 senza credenziali e 200 con quelle giuste, e il giro e stato eseguito due volte con risposta identica. **Resta da fare su produzione** quando un progetto di produzione esistera: oggi nello scope Vercel non ce n'e uno |

---

## Debito aperto dall'export CSV delle anagrafiche (W1-D, 2026-08-28)

> Numerazione provvisoria: il workstream e stato sviluppato in parallelo, chi
> integra rinumera ([ADR-0041](18-decision-log.md#adr-0041--numerazione-e-fine-riga-quando-piu-workstream-lavorano-in-parallelo)).

| # | Voce | Perche resta aperta |
|---|------|---------------------|
| CSV-01 | **Due serializzatori CSV residui fuori da `src/lib/csv.ts`** | `src/lib/funding/reconciliation.ts` (`toReconciliationCsv`) e `src/components/sport-work/ObligationsPanel.tsx` scrivono ancora il proprio tracciato. Erano gia divergenti fra loro — uno mette il BOM, l'altro no — e **nessuno dei due virgoletta il ritorno a capo (CR)**: una nota incollata da Windows spezza la riga in due. W1-D non li ha toccati perche uno serve una risposta HTTP e l'altro un dominio diverso: farli convergere e un lavoro a se, con i suoi test. Un test strutturale in `tests/lib/csv-export.test.mjs` li tiene in allowlist e impedisce che ne nasca un terzo |
| CSV-02 | **L'elenco Allenatori non filtra le colonne dell'export** | `src/app/trainers/page.tsx` passa `visibleColumns: null` sia al PDF sia al CSV, mentre Staff e Soci passano le colonne visibili in tabella. Chi nasconde una colonna fra gli allenatori se la ritrova comunque nel file. W1-D ha replicato il comportamento esistente per non cambiarlo di nascosto in una lane che parla d'altro |

## Debito aperto da firma e timbro del presidente (W1-E, 2026-08-28)

> Numerazione provvisoria: il workstream e stato sviluppato in parallelo, chi
> integra rinumera ([ADR-0041](18-decision-log.md#adr-0041--numerazione-e-fine-riga-quando-piu-workstream-lavorano-in-parallelo)).

| # | Voce | Perche resta aperta |
|---|------|---------------------|
| FIRMA-01 | **CHIUSA il 2026-08-28** — le rotte generiche degli allegati aggiravano il gate della firma | I byte vivono nella tabella `attachments`, e `/api/v1/attachments/**` autorizzava **solo** su sessione e appartenenza al club: un collaboratore poteva elencare `GET /api/v1/attachments?owner_type=club&owner_id=<club>`, ottenere l'id della firma e sostituirla o cancellarla da li. **Chiusa dall'audit di fine Wave** (commit `0bb120e` e `ad09690`, [ADR-0082](18-decision-log.md#adr-0082--un-allegato-del-club-e-configurazione-del-club)): un allegato con `owner_type: "club"` e configurazione del club, e la sua **scrittura** passa da `canManageClubConfiguration` sul club **attivo**. La lettura resta a chi appartiene al club. Nessun permesso nuovo dedicato alla firma
| FIRMA-02 | **Il logo del club resta un data URL** | `clubs.logo_url` e ancora prodotto da `LogoUpload` come `data:` dentro la colonna, mentre firma e timbro passano da Attachment Core. Sono due schede della stessa pagina che si comportano in modo opposto, e la piu vecchia e quella che si copia per sbaglio. Portare anche il logo su Attachment Core e un lavoro a se: tocca la dashboard, i documenti stampabili e l'area account, che lo leggono direttamente dal record |

## Debito aperto dal sollecito degli insoluti (W1-F, 2026-08-28)

> Numerazione provvisoria: il workstream e stato sviluppato in parallelo, chi
> integra rinumera ([ADR-0041](18-decision-log.md#adr-0041--numerazione-e-fine-riga-quando-piu-workstream-lavorano-in-parallelo)).

| # | Voce | Perche resta aperta |
|---|------|---------------------|
| SOLL-01 | **Il sollecito sui documenti ha ancora il difetto che questo modulo chiude** | `createParentNotifications` in `src/app/api/athletes/[athleteId]/documents/route.ts` parte da `getParentUserIds` e **esce in silenzio** quando nessun tutore ha un account collegato: l'azione «Sollecita» di un documento si dichiara riuscita anche quando non ha raggiunto nessuno (W1-15). W1-F ne ha copiato il **pattern** e corretto il difetto per il denaro; la rotta dei documenti non e stata toccata perche appartiene a una lane parallela. La correzione e ora meccanica: `readAthleteGuardianContacts` risolve i recapiti anche senza account |
| SOLL-02 | **Cinque letture diverse di `athletes.data.guardians`** | `src/lib/athlete-guardians.ts` (il proprietario, con `readAthleteGuardianContacts`), `src/lib/server/medical-certificate-reminders.ts` (`getGuardianRows`), `src/lib/server/document-placeholders.ts` (`guardianAt`), `src/lib/server/parent-dashboard.ts` e `src/app/modulistica/page.tsx` leggono lo stesso campo con normalizzazioni diverse. L'audit di fine Wave ne ha allineate due — l'ordine delle chiavi email divergeva, e lo stesso tutore riceveva il sollecito a un indirizzo e il promemoria certificati a un altro — ma restano tre letture e `guardianAt` non conosce la coppia storica `parent1`/`parent2`: su un club non migrato l'attestazione esce con il genitore in bianco. Farle convergere tocca certificati, area genitori e modulistica con i loro test: e un lavoro a se |
| SOLL-03 | **`/payments` e solo una redirezione** | La pianificazione di Wave 1 (§5.4) indica `/payments` come schermata dell'elenco pagamenti; nel codice `src/app/payments/page.tsx` e un `redirect("/movements")` e l'elenco degli insoluti e la scheda **Previsti** di `/movements`. L'azione «Sollecita» e stata messa li, dove le rate ci sono davvero. Se un giorno `/payments` diventera una schermata propria, l'azione va spostata, non duplicata |
| SOLL-04 | **La traccia dell'ultimo sollecito vive in `payments.data`** | `data.lastReminderAt` e `data.lastReminderBy` non sono colonne: nessuna query puo ordinare o filtrare per «rate sollecitate piu di N giorni fa» senza leggere il JSON. E la stessa forma che il sollecito sui documenti usa gia, e diventa un limite quando servira una vista «da risollecitare» ([ADR-0078](18-decision-log.md)) |
| SOLL-05 | **Il registro degli invii non e uno storico** | Su ogni rata resta **l'ultima** data, e sull'atleta l'ultima rivendicazione per indirizzo: «quante volte questa famiglia e stata sollecitata quest'anno» non e rispondibile senza leggere l'audit log. Per Wave 1 basta; un motore di automazioni (Wave 2) avra bisogno di una tabella |
| SOLL-06 | **Un atleta maggiorenne senza tutori risulta `no_guardian`** | Il sollecito parla alle famiglie e parte dai tutori. Un atleta adulto con un proprio account non viene raggiunto e compare fra i non raggiungibili con un motivo che, per lui, e impreciso. Aggiungere l'atleta stesso fra i destinatari e una decisione di prodotto, non una svista da correggere di nascosto |

## Debito aperto dall'attestazione compilata (W1-G, 2026-08-28)

> Numerazione provvisoria: il workstream e stato sviluppato in parallelo, chi
> integra rinumera ([ADR-0041](18-decision-log.md#adr-0041--numerazione-e-fine-riga-quando-piu-workstream-lavorano-in-parallelo)).

| # | Voce | Perche resta aperta |
|---|------|---------------------|
| DOC-01 | **`payments` non porta una stagione** | Non e fra i `SEASON_SCOPED_DATA_TYPES` (`src/lib/club-seasons.ts`), quindi il perimetro dell'attestazione si ricava dalla **data di scadenza** della rata, e una rata senza data resta dentro. Funziona, ed e la stessa compatibilita che `filterCollectionBySeason` applica ai record senza stagione — ma e una deduzione, non un'appartenenza dichiarata: una rata la cui scadenza cade il 31 agosto finisce nella stagione sbagliata a seconda di come il club ha impostato le date. Marcare le rate con `seasonId` tocca la generazione dei piani e ogni schermata economica: e un lavoro a se |
| ~~DOC-02~~ | ~~«generateDocumentTemplates in /modulistica e codice morto»~~ | **CHIUSA** dalla Wave 3 (W3-A). Le 174 righe sono state rimosse insieme al «generatore IA» che scriveva le stesse chiavi storiche: erano cio che il catalogo di piattaforma voleva essere, e adesso il catalogo esiste davvero (`src/lib/documents/catalog/`) |
| ~~DOC-03~~ | ~~«Compila sostituisce i segnaposto per conto proprio, nel browser»~~ | **CHIUSA** dalla Wave 3 (W3-A). Assorbita da «Genera compilato», che fa la stessa cosa con i dati veri e passa dal catalogo condiviso. Era la decisione di prodotto che il debito indicava, ed e stata presa |
| ~~DOC-04~~ | ~~«Il catalogo propone dati che nessun documento sa riempire»~~ | **CHIUSA** dalla Wave 3 (W3-B). Ogni chiave dichiara il suo **soggetto**: il risolutore ne ha imparati quattro (club, atleta, persona, socio) e l'elenco che l'editor propone e filtrato da `listPlaceholderTokensForSubject`. Sponsor, fornitori ed eventi restano in catalogo per i messaggi ma non sono soggetti di un documento: chi li scrive in un modello se lo sente dire alla pubblicazione |

---

## Debito aperto dal passaggio di stagione e dai giri automatici (W1-A e W1-C, 2026-08-28)

### STAG-01 — Il gemello del validatore troncato vive ancora nella dashboard genitori

`src/lib/server/parent-dashboard.ts:17` porta la stessa forma di UUID a
**quattro** gruppi che rendeva inutilizzabile il `POST` dei promemoria
certificati (`...-[89ab][0-9a-f]{12}$`, senza il penultimo gruppo). Li l'effetto
e rovesciato: `!UUID_PATTERN.test(requestedId)` e **sempre vero**, quindi la
riga 690 ricade su `linkedAthletes[0]` anche quando l'identificativo richiesto e
un UUID valido che non appartiene a nessun atleta collegato. Non e una fuga di
dati — l'atleta restituito e comunque uno di quelli del genitore — ma e un
controllo che non controlla.

**Perche non e stato corretto nella Wave 1.** E un altro dominio, e correggerlo
cambia cio che la dashboard genitori risponde in un caso che nessuno ha
collaudato in questa Wave. Va fatto con il suo collaudo.

### STAG-02 — Gli allenamenti generati scrivono `clubs.trainings` senza passare da `resources.ts`

`runTrainingAutomationForClub` (`src/lib/server/training-automation.ts:724-731`)
fa `prisma.club.update({ data: { trainings, settings } })` direttamente. E
l'errore tipico n. 3 di `CLAUDE.md`: scrivere `clubs.<campo>` a mano disallinea
`club_resource_items`, che e la proiezione da cui leggono le altre superfici.

Trovato **collaudando** il giro automatico: il conteggio degli allenamenti
generati non si vedeva in `club_resource_items` perche non ci arriva.

**Perche non e stato corretto nella Wave 1.** E preesistente e fuori dal
perimetro: la Wave 1 accende il giro, non riscrive dove salva. Va affrontato
insieme a WP-07.

### STAG-03 — Il nome del tutore ricade sull'indirizzo email

`getGuardianDisplayName` (`src/lib/athlete-guardians.ts:111`) compone il nome da
`name` e `surname` e, se mancano, mostra l'email. E la forma canonica — la
scrivono cosi `AthleteCreateForm` e la scheda atleta — ma
`src/lib/server/medical-certificate-reminders.ts` accetta anche
`firstName`/`lastName`, e il dato importato da terzi potrebbe arrivare in quella
forma. In quel caso l'anteprima del sollecito mostra un indirizzo email dove
dovrebbe esserci un nome.

E la stessa famiglia di SOLL-02 (tre letture diverse di `athletes.data.guardians`)
e va chiusa con quella.

### STAG-04 — L'elenco di riconferma non pagina

`GET /api/v1/seasons/:id/roster` restituisce tutti i tesserati della stagione di
origine. Misurato: **78 kB e 53-641 ms su 200 tesserati**, che e il caso reale di
un club medio. E una scelta dichiarata — chi deve decidere chi rinnova deve poter
scorrere l'elenco intero, e paginare una scelta la rende piu lenta, non piu
leggera — ma sopra il migliaio di tesserati va rivista.

E la stessa classe di P-5 e SW-11: dichiarata, non nascosta.

---

## Debito rilevato dall'audit di fine Wave 1 e non chiuso (2026-08-29)

L'audit ha prodotto piu di quaranta rilievi. I CRITICAL e gli HIGH sono stati
corretti nel commit `ad09690`; i MEDIUM di cui la correzione avrebbe allargato
il dominio, e i LOW, restano qui.

| # | Voce | Perche resta aperta |
|---|------|---------------------|
| AUD-01 | **`pickRelevantCertificate` sceglie il certificato sbagliato per il messaggio** | Lo stato dell'atleta si decide sulla scadenza **piu lontana** (giusto: chi ha un certificato vecchio scaduto e uno nuovo valido e in regola), ma il testo del promemoria cita il **primo** in ordine crescente fra quelli scaduti o in scadenza. Un atleta con un certificato scaduto nel 2024 e uno che scade fra venti giorni riceve un messaggio che cita il 2024. La chiave di idempotenza si aggancia allo stesso certificato, quindi almeno e coerente con se stessa. Logica preesistente, che pero da questa Wave gira ogni mattina invece che a richiesta |
| AUD-02 | **`toISOString().slice(0, 10)` sposta una data di un giorno** | In `medical-certificate-reminders.ts` (data comunicata alla famiglia) e in `document-placeholders.ts` (perimetro della stagione nell'attestazione). Un `DateTime` reso come mezzanotte locale in un fuso positivo retrocede al giorno prima: su Vercel, che gira in UTC, non si vede; in locale e su qualunque runtime non-UTC si. Va corretto con una formattazione consapevole del fuso, in tutti i punti insieme |
| AUD-03 | **`releaseClaim` e ora sotto blocco, ma il modello resta «riscrivi tutto il JSON»** | La correzione ha messo `SELECT ... FOR UPDATE` attorno alla lettura-scrittura di `athletes.data`, il che chiude la perdita di scritture concorrenti. Resta che la traccia dei solleciti vive dentro un blob condiviso con l'anagrafica: una colonna o una tabella dedicata renderebbe impossibile la classe di difetto invece che difenderla |
| AUD-04 | **Il catalogo dei segnaposto propone dati che nessun documento sa riempire** | Staff, allenatori, soci, sponsor, fornitori e certificati sono nell'elenco che l'editor mostra, ma il risolutore non li produce: in un documento intestato a un atleta non hanno un soggetto. Chi li usa ottiene un campo bianco **dichiarato** — quindi il documento non mente — ma l'editor continua a proporre una promessa. O il risolutore impara un secondo soggetto, o il catalogo va marcato per contesto |
| AUD-05 | **`csvValue` non arrotonda il denaro** | `0.1 + 0.2` esce `0,30000000000000004` e un importo molto grande esce in notazione esponenziale. Oggi nessuna colonna delle quattro anagrafiche e un importo, quindi non si vede; il giorno in cui lo sara, va arrotondato a due decimali prima di scriverlo |
| AUD-06 | **La firma del presidente e scaricabile da qualunque membro del club** | La `GET` di `/api/v1/clubs/:id/signature?kind=` non passa dal permesso di configurazione, ed e voluto: serve all'anteprima e ai documenti che stampa anche la segreteria, e restringerla farebbe uscire le ricevute senza firma. Resta che un genitore con una sessione puo scaricare il PNG e riusarlo. La difesa vera e legare la lettura al documento che la consuma, non alla persona che la chiede: e un lavoro di progetto |
| AUD-07 | **`RESOLVED_PLACEHOLDER_KEYS` fa lavoro all'import del modulo** | `src/lib/server/document-placeholders.ts` esegue `buildPlaceholderValues` su oggetti vuoti al caricamento, per ricavare un elenco di chiavi statiche che serve a un test di contratto. Va sostituito con un elenco dichiarato |
| AUD-08 | **Il parser dei segnaposto e ancora doppio** | Il **catalogo** e uno solo (`src/lib/documents/placeholders.ts`), ma `DocumentEditor` conserva una propria `PLACEHOLDER_PATTERN` con una classe di caratteri diversa (`[^}]+?` invece di `[^{}]+?`). Due grammatiche per la stessa sintassi: divergono su un modello con parentesi graffe annidate |

---

## Debito aperto dalla Wave 2 — comunicazioni e automazioni (2026-08-29)

Registrato **durante** la Wave, non dopo: ogni voce e una cosa che si sarebbe
potuta fare e che si e deciso di non fare, con il motivo. Le prime due sono le
sole che riguardano promesse dichiarate nel planning e non mantenute per intero.

| # | Voce | Perche resta aperta |
|---|------|---------------------|
| **W2-01** | **`medical-certificate-reminders.ts` non e migrato sull'audience engine** | E l'ultimo consumatore con una politica di raggiungibilita propria: raggiunge **solo chi ha un account nel club** (`resolveGuardianRecipientIds` filtra su `organization_users`), mentre tutto il resto della Wave scrive a un indirizzo. ADR-0087 dichiara la politica unica; questo modulo non la applica ancora. La migrazione tocca un giro che gira ogni mattina su tutti i club e va fatta con il suo collaudo, non in coda a una Wave |
| **W2-02** | **Restano due dialetti di deduplica dentro `notifications`** | `data.sportWorkKey` (permanente) e `data.key` con finestra di sette giorni. ADR-0084 li dichiara superati dal registro delle consegne, ma migrarli e un refactor con rischio non nullo su domini che funzionano e **senza guadagno per l'utente**: chi li usa non riceve doppioni oggi. Vanno assorbiti quando uno dei due dovra cambiare per altre ragioni |
| ~~**W2-03**~~ | ~~«saveTrainingAttendance cancella ancora a mano le righe duplicate»~~ | **CHIUSA** dalla correzione di fine Wave. Il DELETE e stato rimosso — con la chiave unica quella difesa era gia morta, e restava una cancellazione su righe che adesso portano la risposta della famiglia — e l inserimento riprova come aggiornamento quando la chiave e duplicata, invece di far fallire l intero appello per una riga che qualcun altro ha gia scritto un istante prima |
| **W2-04** | **`escapeHtml` e definita due volte, in modo divergente** | `src/lib/documents/document-view.ts` la esporta e neutralizza anche l'apostrofo; `src/lib/server/email/email-service.ts` ne tiene una copia privata che non lo fa. I messaggi della Wave 2 usano la prima — quindi il sottoinsieme piu debole non e sulla strada di nessun messaggio nuovo — ma due implementazioni della stessa neutralizzazione sono due occasioni di sbagliarne una |
| **W2-05** | **Il doppio del database non applica i valori predefiniti dello schema** | `tests/helpers/fake-prisma.mjs` restituisce `undefined` dove il database scriverebbe il valore di `@default`: `use_count` di `payment_links` ne e il primo caso. Non rompe niente oggi, ma e una differenza dal database vero che puo far passare o fallire un test **per la ragione sbagliata** |
| **W2-06** | **Il link di pagamento non ha mai parlato con Stripe** | Il percorso e coperto da 39 test con iniezione, ma `resolveClubGatewayContext`, il congelamento della commissione, il ritorno del browser e soprattutto **il webhook che registra l'incasso sulla rata citata dal link** non sono mai passati da un account vero. E la stessa voce `R-16` gia aperta per il checkout autenticato, che questa Wave non chiude: si chiudera con credenziali sandbox e un giro reale |
| **W2-07** | **La bacheca raggiunge solo chi ha un account** | Chi non ne ha uno non ha un posto dove leggere, e l'esito lo **dichiara** (`withoutAccount`) invece di contarlo fra i raggiunti. E corretto, ma vuol dire che per una parte delle famiglie la bacheca oggi non esiste: la chiusura vera e G-18, il ciclo di vita dell'account, che questa Wave ha deliberatamente lasciato fuori |
| **W2-08** | **L'RSVP copre gli allenamenti, non le partite** | La convocazione vive dentro il payload di `matches` sotto **nove grafie diverse** (`calledAthletes`, `selectedAthletes`, `roster`, `lineup`, `convocations`, …), normalizzate a valle da `parent-dashboard.ts`. Non si puo chiedere una conferma su un oggetto che non ha una forma: prima va data una forma alla convocazione. Dichiarato V1.1 nel planning, e resta tale |
| **W2-09** | **Rispondere all'RSVP richiede un account** | La risposta da link senza account riuserebbe il meccanismo di token gia costruito per il pagamento (ADR-0085), ma sarebbe la **seconda superficie pubblica** della Wave e merita la sua decisione di sicurezza. Dichiarata V1.1 |
| **W2-10** | **Il modello di messaggio non ha condizionali, per scelta** | La riga «Rate scadute: {{installment.overdue_count}}» resta scritta anche quando il valore manca, mentre `buildPaymentReminderLines` la ometteva a zero. Il rimedio previsto e l'**anteprima obbligatoria**, non un `{{#if}}`: chi risolve i valori passa il segnaposto solo quando ha senso, e chi manda vede l'irrisolto prima di premere. Se un giorno servisse davvero un condizionale, sara una decisione di prodotto — e il primo passo verso il linguaggio che ADR-0083 ha deciso di non dare all'utente |

### Aggiunte dalle due tornate di revisione indipendente (2026-08-29)

Le revisioni di fine Wave hanno chiuso due CRITICAL e quattordici HIGH. Queste
sono le voci che **restano**, piu quelle che le correzioni stesse hanno aperto.

| # | Voce | Perche resta aperta |
|---|------|---------------------|
| **W2-11** | **Consegna «almeno una volta», non «esattamente una volta»** | Superata la soglia di quindici minuti una rivendicazione si considera abbandonata e si riprende. E cio che rende recuperabile un processo morto — senza, il destinatario restava bloccato per sempre — ma vuol dire che un messaggio gia accettato da SMTP, la cui chiusura non e mai arrivata, puo ripartire. E il prezzo dichiarato della scelta: fra «due volte, raramente» e «mai, in silenzio», la prima e l'unica di cui qualcuno possa accorgersi |
| **W2-12** | **Il giro notturno attraversa tutti i club dentro una richiesta HTTP** | `runAutomationsForAllClubs` cicla su `club.findMany()` senza limite e senza budget di tempo, con un dialogo SMTP per destinatario. Su molti club il timeout della funzione e l'esito atteso, non l'eccezione: e la ragione per cui la ripresa di W2-11 esiste. La chiusura vera e un giro paginato con ripresa, non una finestra piu larga |
| **W2-13** | **Il registro generico accetta ancora scritture su `club_resource_items`** | La guardia impedisce di scrivere righe di un **dominio che ha un proprietario** (annunci, regole di automazione), ma `canAccessClubResource` continua a concedere creazione, modifica e cancellazione su quella tabella a collaboratori e segreteria per qualunque altro tipo. Restringere il modello dei ruoli e una decisione di prodotto, non una correzione di sicurezza |
| **W2-14** | **Una consegna fallita si ritenta a ogni giro, senza tetto** | Un indirizzo permanentemente invalido su un'occorrenza che non scade mai produce un tentativo per notte, per sempre, e una riga di audit `failure` a ogni giro. Serve un contatore di tentativi, che e un campo in piu sul registro |
| **W2-15** | **Una seconda comunicazione dalla stessa scheda non parte** | L'identificativo ruota solo con «Nuova comunicazione»: chi cambia oggetto e corpo e rimanda senza premerlo riusa la stessa chiave e non raggiunge nessuno. La schermata lo dice — «Nessun messaggio inviato» — ma e indistinguibile da un guasto. Il rimedio e ruotare l'identificativo quando cambia il contenuto |
| **W2-16** | **La bacheca del destinatario indicizza per annuncio, non per consegna** | Se l'indirizzo di un tutore cambia fra due pubblicazioni dello stesso annuncio esistono due righe con lo stesso `source_id`: la data di lettura diventa quella dell'ultima riga letta |
| **W2-17** | **La triade rivendica, scrivi, chiudi e ripetuta nove volte** | `communication-deliveries.ts` possiede le primitive ma non la **sequenza**: ogni canale nuovo dovra ricordarsi da solo di chiudere la rivendicazione in tutti i rami, compreso quello d'errore. Una funzione che la avvolge la renderebbe impossibile da sbagliare |
| **W2-18** | **Il giro per club e la terza copia della stessa funzione** | `automations.ts`, `sport-work-scheduler.ts` e `medical-certificate-reminders.ts` ripetono venticinque righe identiche — stessa query, stesso tipo unione, stesso `try/catch`. Un EXTEND che produce una terza copia non e un EXTEND |
| **W2-19** | **Il testo del sollecito a mano e ancora codice** | G-05 e chiuso per automazioni e comunicazione massiva; il sollecito passa ancora da `buildPaymentReminderLines`. E il messaggio che una segreteria manda piu spesso, ed e proprio quello che il club non puo riscrivere con parole sue |
| **W2-20** | **Il catalogo promette un promemoria il giorno della scadenza** | Con l'anticipo `0` il messaggio parte quel giorno, ma a mezzanotte UTC il certificato risulta gia scaduto e il testo lo dice. Non e un difetto — e coerente con quello che l'anagrafica mostra — ma l'etichetta del catalogo va riscritta, perche chi configura la regola non si aspetti un preavviso |
| **W2-21** | **Restano due copie del nome di una persona** | La pagina pubblica del pagamento e l'esito del giro compongono ancora `nome cognome` a mano, mentre il resto passa dal proprietario canonico. Nessuna delle due e sulla stessa schermata di un'altra, quindi la divergenza non si vede oggi — ma e la quinta e la sesta copia, e il test strutturale non presidia il nome |

---

## Debito aperto dalla Wave 3 — documenti, consensi, scadenze (2026-08-29)

> Numerazione `W3-nn`. Come per le Wave precedenti, qui c'e **solo** cio che la
> Wave lascia aperto sapendolo: cio che ha chiuso sta nelle voci barrate piu
> sopra (`DOC-02`, `DOC-03`, `DOC-04`).

| # | Voce | Perche resta aperta |
|---|------|---------------------|
| **W3-01** | **Il protocollo di un documento generato resta nullo** | La colonna `generated_documents.protocol_number` esiste e non viene mai scritta. Darle un numero significherebbe o estendere `document_number_sequences` — che e la numerazione **fiscale**, con due invarianti proprie (ADR-0044) e un perimetro che finisce alle ricevute e alle fatture — oppure aprire una seconda numerazione, che e esattamente cio che CLAUDE.md vieta. E una decisione, non una dimenticanza, e va presa quando un club chiedera di protocollare |
| ~~**W3-02**~~ | ~~«Nessuna superficie non amministrativa per generare»~~ | **CHIUSA** dall audit di fine Wave. `/modulistica` e tornata gestionale: il difetto vero di `W3-14` erano le rotte, e restano chiuse dove serve. Il collaboratore vedeva la voce nel menu e finiva sulla dashboard senza una parola |
| **W3-03** | **`clubs.document_templates` resta popolata** | Il travaso e una copia, come per i moduli (ADR-0039). La colonna JSON resta, e con lei `src/lib/document-templates.ts`, che esiste solo per filtrarne i residui. Si chiude insieme a `D28`, che copre lo stesso campo |
| **W3-04** | **Il fascicolo massivo e HTML, non PDF** | Senza un motore PDF lato server non esistono file, quindi non esiste lo ZIP. Il fascicolo unico stampabile copre il caso vero — trenta richieste di visita che si stampano insieme — ma un club che voglia **archiviare** i cento documenti come cento file oggi non puo. Dipende dall'ADR sul motore PDF, che il planning ha deliberatamente lasciato fuori (§3.4) |
| **W3-05** | **Il client degli allegati non manda ancora la validita** | `src/lib/api/attachments.ts` non passa `valid_from`/`valid_until`: l'API le accetta e il dominio le conserva, ma finche una schermata non le scrive il quinto innesco gira su un insieme quasi vuoto. E la dipendenza dichiarata da W3-G, e vale un campo in due form |
| **W3-06** | **La sensibilita `compensation` e prevista e non prodotta** | `canGenerateDocumentWithSensitivity` sa gia rifiutare un modello che porti un compenso senza `sport_work.read`, ma nessuna chiave del catalogo dichiara quella classe: i segnaposto del rapporto di lavoro sportivo non sono stati aggiunti (era G-16, POST-V1). Il controllo e scritto e non ha ancora niente da controllare — va bene cosi, ma va detto |
| **W3-07** | **Il test dell'onboarding presidia una finestra di 400 caratteri** | `tests/ui/account-onboarding-and-admin.test.mjs` verifica che `/onboarding` compaia nei primi 400 caratteri dopo `MANAGEMENT_ADMIN_ONLY_PATH_PREFIXES`. E diventato rosso perche un commento nuovo lo ha spinto oltre, e la correzione e stata accorciare il commento. Il test presidia la cosa giusta con un mezzo fragile: dovrebbe leggere l'elenco, non contare i caratteri |
| **W3-08** | **Il doppio di Prisma non risolve le relazioni** | `tests/helpers/fake-prisma.mjs` ignora `include`, quindi un test che legga il **numero** di versione di un documento generato ottiene zero. Non nasconde difetti — l'identificativo della versione, che e l'invariante vera, si prova comunque — ma obbliga a scrivere l'asserzione sull'id invece che sul numero, e chi legge il test deve saperlo |
| **W3-09** | **Le sei voci di catalogo hanno un proprietario redazionale nominale** | `editorial_owner` vale «EasyGame — redazione di prodotto», che oggi non e una persona con un calendario. Finche non lo diventa, la data di rilettura resta quella del giorno in cui il catalogo e nato. ADR-0092 dice cosa fare se il presidio non arriva: **smettere di distribuire**, non lasciare invecchiare |
| **W3-10** | **Le quattro voci di classe C sono scritte e ferme** | Informativa privacy, consenso immagini, autorizzazione alla trasferta, delega al ritiro del minore. Non e un difetto tecnico: e lavoro che aspetta una validazione professionale. Va tenuto in evidenza perche un catalogo che resta a sei voci per sempre e una decisione, e va presa da qualcuno |

### Cosa l'audit di fine Wave 3 ha chiuso, e cosa lascia aperto

Quattro revisioni indipendenti e ostili — correttezza, sicurezza, architettura,
UX — hanno prodotto **sette CRITICAL e quattordici HIGH**, tutti con uno
scenario concreto e la maggior parte dimostrati con un test o con una sonda a
runtime. Sono stati corretti tutti. Qui resta cio che **non** e stato corretto,
e il perche.

**`W3-02` si chiude.** Diceva che il permesso di generare concesso a
collaboratore e staff non aveva una schermata da cui esercitarlo. L'audit lo ha
misurato dal lato peggiore: il collaboratore **vedeva la voce nel menu**, ci
cliccava, e finiva sulla dashboard senza una parola. `/modulistica` e tornata
gestionale — il difetto vero di `W3-14` erano le rotte, e quelle restano chiuse
dove serve.

| # | Voce | Perche resta aperta |
|---|------|---------------------|
| **W3-11** | **Un consenso si puo registrare su un soggetto che non esiste** | `recordConsentDecision` controlla che `subjectId` non sia vuoto e che `subjectKind` sia nell'enum, ma non che il soggetto esista **in questo club**. La riga nasce comunque nel club di chi scrive, quindi non e una fuga; e un problema di integrita su un registro che esiste per essere probatorio, e un refuso produce un orfano che compare in «chi manca» per sempre — perche il registro e append-only e non si cancella. La chiusura e risolvere il soggetto dal suo proprietario, come fa gia il risolutore dei documenti |
| **W3-12** | **Il marcatore di idempotenza del travaso vive in un campo modificabile** | `scripts/migrate-document-templates.mjs` riconosce «gia fatto» cercando `legacy:<id>` dentro `editorial_notes`, che una `PATCH` puo riscrivere. Chi ripulisce le note — cosa naturale, visto che per i modelli non pubblicabili contengono il motivo — rende il travaso non idempotente. Serve una colonna dedicata, e per uno script che si esegue una volta sola non e sembrato valere una migrazione |
| **W3-13** | **La finestra di concorrenza sui consensi resta applicativa** | Il controllo che evita due decisioni con la stessa evidenza legge e poi scrive: fra le due ci sono sei viaggi di rete. Il danno e contenuto — due righe con lo stesso stato, storico gonfiato, stato derivato identico — e la finestra vera e gia chiusa a monte dalla compilazione che risulta `approved`. Un indice unico su `(evidenza)` la chiuderebbe davvero, ma vieterebbe il caso legittimo di due decisioni con la stessa evidenza in momenti diversi |
| **W3-14** | **`source` di una decisione la dichiara chi scrive** | ADR-0090 dice che la distinzione fra `public_form` e `manual` serve a **pesare l'evidenza**: se la sceglie chi registra, non pesa niente. Il valore giusto lo sa il chiamante — la rotta pubblica, la segreteria — e va imposto li invece che accettato |
| **W3-15** | **Lo spareggio fra due decisioni allo stesso istante e arbitrario** | A parita di `decided_at` **e** `created_at` decide l'identificativo in ordine alfabetico: e deterministico, come il commento promette, ma non e sensato. Gli stessi due fatti danno «accettato» o «revocato» a seconda di quale riga ha ricevuto l'UUID piu alto. Serve un ordinatore vero — un numero di sequenza — e non e una riga |
| **W3-16** | **Il fascicolo tiene tutti i documenti in memoria** | La deduplica delle immagini ha portato il fascicolo da 22 MB a 0,84, ma il dialogo accumula comunque gli HTML in un array e li trattiene in stato React quando deve dividere. Leggerli e comporli a flusso e un intervento a se |
| **W3-17** | **Il modulo vuoto stampa la bozza, dichiarandolo** | Nessuna rotta restituisce al client il **contenuto** della versione pubblicata: il dettaglio di un modello porta la bozza e i soli metadati delle versioni. Quando bozza e versione coincidono — il caso normale — non c'e differenza; quando divergono, la schermata lo dice prima di stampare. Farlo davvero significa aggiungere un campo all'API, ed e un cambio di contratto |
| **W3-18** | **Restano dodici rifiniture di interfaccia dichiarate** | Il consenso si cerca digitando un identificativo a mano (e «Mancante» risponde anche a un identificativo inesistente); i gesti irreversibili di `/consensi` partono al primo clic senza conferma; tre controlli non hanno etichetta; le intestazioni delle tabelle nuove non hanno `scope`; il pulsante di chiusura dei dialoghi dice «Close» in una interfaccia italiana. Sono tutte piccole e tutte vere: valgono un giro di rifinitura, non una riga in coda a una Wave |
| **W3-19** | **Una ripresa che dice il vero puo sembrare falsa** | Quando il server scrive e la risposta si perde, la ripresa rispedisce quei soggetti, il server risponde «c'erano gia» per tutti, e un lotto eseguito **una volta sola** conclude con «quattro documenti prodotti, di cui quattro gia presenti». Letteralmente vero, e proprio la ripresa e il caso per cui il conteggio esiste. Servirebbe distinguere «gia presenti da prima» da «gia presenti perche li ho appena scritti io e non me lo hai detto», e per farlo il lotto dovrebbe ricordare quali fette ha spedito e non solo quali ha visto tornare |
| **W3-20** | **Il fascicolo deduplica le immagini di qualunque elemento, ma ne reidrata solo le `img`** | `extractRepeatedImages` estrae `src="data:…"` da ogni tag, `hydrateEmbeddedImages` rimette il valore solo su `img[data-fascicolo-immagine]`: un `iframe` con la stessa immagine ripetuta verrebbe svuotato e mai ricomposto. E comportamento preesistente all'ancoraggio della regex, e raggiungibile solo da un modello scritto dal club — che non e HTML sanificato. Va chiuso restringendo l'estrazione alle `img`, insieme alla sanificazione del contenuto dei modelli |
| **W3-21** | **Sotto concorrenza vera «quanti c'erano gia» sotto-conta** | L'`upsert` di Prisma non e un `INSERT … ON CONFLICT`: e `SELECT` piu `INSERT` in transazione. Due richieste sullo stesso soggetto e lotto leggono entrambe «non c'e», e una delle due dichiara «nuovo» un documento che l'indice unico le ha poi fatto ritrovare. Raggiungibile duplicando la scheda del browser, che copia il `sessionStorage` e quindi l'identificativo del lotto. L'effetto e su un numero, non su un dato: il documento resta uno |

---

## Difetti trovati dalla ricognizione della Wave 4, e non corretti (2026-08-29)

Trovati da sette letture **di sola lettura** durante il planning gate della
[Wave 4](37-wave-4-planning.md). Nessuno e stato corretto: un planning gate non
scrive codice. Sono elencati qui perche chi apre la Wave li trovi, e perche i
primi due **non sono debito, sono difetti attivi**.

| # | Cosa | Perche non e stato corretto subito |
|---|---|---|
| **W4-D1** | **`DELETE` a cascata distrugge il registro degli incassi.** `payment_transactions.payment_id -> payments.id` e `ON DELETE CASCADE`; `deleteResource` cancella fisicamente **senza** la guardia di ledger che protegge gli altri verbi; `payments` e il suo alias `simplified_payments` non sono fra le risorse riservate a proprietario e gestore. Quindi `DELETE /api/v1/simplified_payments/:id` cancella la rata e, a cascata, tutti i suoi incassi, storni e rimborsi — **per un ruolo che non ha il permesso di registrarne uno**. Il dominio dichiara «Non esiste un `DELETE`, ed e una scelta»: la scelta e vera su una porta e falsa sull'altra | **BLOCKER della Wave 4**, lane W4-0. Va corretto con il suo collaudo scritto **prima** della correzione |
| **W4-D2** | **«Entrate» somma cassa e dovuto.** In `club-financial-summary.ts:251`, per ogni riga che non porta la fotografia `data.ledger.paidAmount` — tutti i movimenti manuali, le previsioni convertite, le fatture, le ricevute, i pagamenti sponsor e fornitore — l'incassato e `status === "paid" ? amount : 0`, cioe **il dovuto dedotto dallo stato**. E `normalizeStatus` mappa `"issued"` su `"paid"`: una fattura emessa e non pagata conta come denaro entrato. E la stessa famiglia di G-19, chiuso in Wave 1 **sulle sole rate** | **BLOCKER della Wave 4**, lane W4-0 |
| **W4-D3** | **Il movimento manuale si cancella senza traccia.** Un incasso di 100 € su una rata non si puo cancellare: si storna, e restano entrambe le righe con il motivo. Un movimento manuale di 10.000 € in cassa si cancella con un `confirm()` del browser, sparisce dall'array e dalla tabella gemella, e nell'audit resta «qualcuno ha modificato il club» — senza dire **quale** movimento | Wave 4, lane W4-B. La regola «il denaro non si cancella» vale dove il denaro e una riga di tabella e non vale dove e un oggetto in un JSON |
| **W4-D4** | **`/movements` mostra zeri invece di dire «non puoi».** La pagina e aperta a staff e collaboratore, il CRUD generico su `transactions` pure, ma la pagina legge via `clubs` — che e admin-only — e `getClubData` **inghiotte il 403 restituendo un array vuoto**. Un collaboratore apre la pagina, la vede caricarsi senza errori, e trova tutto a zero | E `W3-14` daccapo su un altro dominio. Wave 4, lane W4-0 |
| **W4-D5** | **`operation_type_code` e una colonna fiscale che non si riempie mai.** Presente su `payment_transactions`, `invoices`, `receipts` e nello snapshot, e nella firma del servizio. Ma lo schema di validazione degli incassi non l'accetta e il webhook non la passa: e **sempre `null`**, e ogni documento emesso e classificato `quota_attivita`. Ne discende che `activity_scope` — la colonna che distingue istituzionale da commerciale — non tocca nessuna riga reale | E il presupposto della lane W4-A: senza, la causale non ha dove attaccarsi |
| **W4-D6** | **Tre funzioni scritte per fare la cosa giusta non hanno chiamanti.** `assertDocumentMutable` implementa «un documento emesso non si modifica» mentre il CRUD generico su `/api/v1/invoices` accetta un `invoice_number` digitato dal client; `describeDocumentDecision` e la spiegazione che l'operatore dovrebbe leggere **prima** di emettere e oggi arriva come errore dopo; `peekDocumentNumber` mostrerebbe «la prossima sara la 12» | Wave 4, lane W4-E. Non e codice da scrivere: e codice da collegare |
| **W4-D7** | **Il totale del tracciato FatturaPA esclude l'imposta.** `<ImportoTotaleDocumento>` e la somma delle righe piu il bollo e non comprende l'imposta esposta in `<DatiRiepilogo>`. Non si manifesta oggi **solo perche** l'unica classificazione raggiungibile ha `vat_rate = null` (vedi `W4-D5`). Difetto laterale della stessa famiglia: `resolveStampDuty` usa `Boolean(vatRate)`, e `Boolean(0)` e falso — un'operazione dichiarata ad aliquota zero verrebbe trattata come senza IVA | Wave 4, lane W4-E. Diventa attivo nel momento in cui una causale con aliquota diventa raggiungibile |
| **W4-D8** | **Una liquidazione di un bando non si puo stornare, e l'errore propaga.** `funding_settlements` ha solo `create` e letture: nessun `update`, nessun `delete`, nessuna rotta `PATCH` o `DELETE`. Una liquidazione registrata per errore resta, e a valle l'accrual diventa `settled`, non si riscrive piu, non si conferma piu, e l'iscrizione non si cancella piu | Wave 4, lane W4-C |
| **W4-D9** | **Il versamento F24 dei contributi esce dal club senza lasciare una riga.** Un adempimento assolto aggiorna solo il proprio stato. I tipi `CONTRIBUTION_PAYMENT` e `EXTERNAL_PAYROLL_COST` sono dichiarati e **nessun codice li produce**: il costo del lavoro sportivo in prima nota e sistematicamente inferiore al vero della parte contributiva | Wave 4, lane W4-C |
| **W4-D10** | **`bank_account_id` esiste, il servizio lo scrive, nessuna superficie lo compila.** Su `sport_work_outbound_transactions`. Le tre funzioni dell'agenda — premi, rimborsi, fatture P.IVA — non lo accettano nemmeno nella firma | Wave 4, lane W4-C |
| **W4-D11** | **Il filtro Periodo di `/reports` non tocca il report pagamenti.** Le dipendenze del `useMemo` non includono il periodo, e `calculatePaymentReport` non lo riceve. Selezionare «Ultimi 30 giorni» cambia allenamenti, presenze e gare e lascia i quattro numeri finanziari sull'intero storico, **senza dirlo** | Wave 4, lane W4-D |
| **W4-D12** | **Due letture morte a ogni apertura di `/movements`.** `supplier_payments` e `suppliers` non esistono ne come colonna ne come risorsa, e tornano sempre vuote. Sono due dei ~17 round trip HTTP che la pagina fa, di cui 14 sono `GET` sulla **stessa singola riga** `clubs`, una per colonna, ognuna riportando `settings` per intero | Wave 4, lane W4-B, e il collaudo delle prestazioni lo misura |
| **W4-D13** | **Un incasso online non ha autore e non lascia audit.** Il webhook passa `{ userId: "" }`, quindi `created_by` e `null`, e **non scrive nessun `AuditLog`** per l'incasso registrato: solo `PaymentWebhookEvent`. Un rimborso ha `created_by: null` per costruzione. E `backfillProviderFees` riscrive `net_amount_cents` **senza audit e senza attore**: un numero di rendiconto cambia dopo il fatto e non c'e traccia di chi o quando | Wave 4, lane W4-C. La correzione onesta e registrare **il provider come attore**, non lasciare `null` |
| **W4-D14** | **La creazione di un socio riscrive l'intera colonna dal browser.** `src/app/soci/new/page.tsx` legge `clubs.members`, appende un oggetto e risalva tutto: due segreterie che creano un socio nello stesso minuto, la seconda cancella la prima. Nessun vincolo, nessuna transazione, nessuna validazione server | Wave 4, lane W4-F |
| **W4-D15** | **`invoices.transaction_id` non e unique.** La ricevuta ha l'idempotenza **garantita dal database**; la fattura ha solo un `findFirst` applicativo, e due richieste simultanee possono produrre due fatture con due numeri su un documento fiscale. La differenza non e dichiarata da nessuna parte | Wave 4, lane W4-E. E una riga di migrazione |
| **W4-D16** | **Il riferimento normativo scritto come costante scade il 31 dicembre 2026.** Il riordino in testi unici cambia la numerazione di quasi tutti gli articoli rilevanti: il TUIR, il decreto IVA e gli artt. 20, 20-bis e 22 del D.P.R. 600/1973. Le costanti del bollo (soglia 77,45 €, importo 2,00 €) sono gia oggi **senza fonte e senza anno** in `src/lib/fiscal/fiscal-profile.ts` | Wave 4, lane W4-E. La forma giusta esiste gia: `src/lib/sport-work/rules/`, un file per anno con `source` obbligatorio |
| **W4-D17** | **Il §3 del documento 30 non e stato riscritto dopo tre Wave.** C-144 e ancora `EG~` P1 benche G-19 sia chiuso; C-118, C-119, C-120 e C-125 portano i verdetti di prima della Wave 3; i totali del §3.19 e del §23 sono fermi a `EG- 48` quando le Wave dichiarano 36. Le §4.5, §4.6 e §4.7 sono le uniche sezioni aggiornate. Piu tre gap — **G-13, G-40 e G-52** — che il §22 assegnava alla Wave 3 e che **non hanno uno stato dichiarato** | Non e debito di codice, ma disorienta chiunque legga quel documento per decidere cosa fare dopo |

---

## Debito aperto dagli sponsor (W4-H, 2026-08-29)

Trovato mentre si costruivano il contratto e il credito. Nessuno e stato
corretto qui: sono superfici e domini di altre lane, e correggerli nello stesso
diff avrebbe nascosto la catena che questa lane doveva chiudere.

| # | Cosa | Perche non e stato corretto qui |
|---|---|---|
| **W4-H1** | **I pagamenti di uno sponsor vivono in due archivi diversi, e le due superfici ne leggono uno ciascuna.** L'elenco `/sponsors` legge la collezione di club `sponsor_payments`; la scheda `/sponsors/[id]` legge la lista annidata `sponsor.payments`. Un pagamento registrato da una parte non compare dall'altra, e il credito calcolato dalle due superfici puo differire. Il servizio (`listSponsorCollections`) le unisce entrambe **e in piu** legge `payment_transactions`, che e la fonte che resta | Unificare vuol dire migrare lo storico, e la migrazione ha senso solo dopo che W4-C ha reso scrivibile la controparte non-atleta: prima non c'e dove migrare |
| **W4-H2** | **Un pagamento sponsor si cancella, fisicamente, con un `confirm()` del browser.** `handleDeletePayment` in `src/app/sponsors/[id]/page.tsx` filtra l'array e risalva. E la stessa famiglia di `W4-D3`: la regola «il denaro non si cancella» vale dove il denaro e una riga di tabella e non vale dove e un oggetto in un JSON | Il rimedio non e una guardia in piu sul JSON: e far passare l'incasso sponsor da `payment_transactions`, dove lo storno esiste gia. Dipende da W4-C |
| ~~**W4-H3**~~ | **CHIUSO (2026-08-30).** La rotta di dominio c'e: `PUT /api/v1/sponsorships/:id` salva il contratto con `updateClubResourceItem` — una riga sola sotto il `FOR UPDATE` del club — e `POST /api/v1/sponsorships/:id/collections` registra l'incasso nel registro degli incassi. Il testo originale: **Il salvataggio di uno sponsor riscrive l'intera colonna dal browser.** `updateClubDataItem` legge `clubs.sponsors`, fonde l'elemento e risalva tutto: due segreterie che modificano due sponsor diversi nello stesso minuto, la seconda scrittura cancella la prima. E `W4-D14` sui soci, sulla stessa colonna JSON e con lo stesso rimedio — `appendClubResourceItem` e la scrittura per riga di `resources.ts` | Il rimedio e una rotta di dominio per lo sponsor. Fuori dal perimetro di questa lane, che doveva chiudere la catena del credito e non riscrivere la pagina |

---

## Debito aperto dalla fiscalita (W4-E, 2026-08-29)

La lane ha chiuso `W4-D5`, `W4-D6` e la meta laterale di `W4-D7` — il bollo su
un'aliquota dichiarata zero. Resta aperto cio che richiede una colonna nuova o
un file di un'altra lane.

| # | Cosa | Perche non e stato corretto qui |
|---|---|---|
| **W4-E1** | **L'incasso porta la causale, ma non puo congelare l'ambito.** `activity_scope_snapshot` esiste su `accounting_entries` e **non** su `payment_transactions`: l'incasso conserva `operation_type_code`, e chi legge la classificazione la rilegge dalla causale — che e configurazione mutabile. Sul documento il congelamento c'e (nello snapshot); sull'incasso no | Servono due cose che non appartengono a questa lane: una colonna (barriera, `prisma/schema.prisma`) e una riga in `createPaymentTransaction` (W4-C). Il modulo puro che la produce e gia scritto e collaudato: `freezeClassification` in `src/lib/fiscal/operation-types.ts` |
| **W4-E2** | **Il checkout online non porta con se una causale, e il webhook non ne inventa una.** L'evento del provider non contiene una classificazione, e nessuno dei dati che porta ne e una fonte affidabile: la rata (`payments`) non ha una causale propria, e dedurla dal fatto che l'incasso e online direbbe qualcosa sul canale, non sull'operazione. Il webhook passa quindi `operationTypeCode: null` **dichiarando perche** | La fonte giusta e il `reference` del checkout, che lo sceglierebbe chi prepara la richiesta di pagamento. Aggiungerlo e un cambio del contratto dell'adapter del PSP e delle rotte di checkout: appartiene al dominio pagamenti, non alla fiscalita |
| **W4-E3** | **`invoices.transaction_id` non e ancora unique** (`W4-D15`). L'idempotenza della fattura resta applicativa: due richieste simultanee possono produrre due fatture con due numeri | E una riga di migrazione, e le migrazioni appartengono alla barriera |
| **W4-E4** | **Le costanti del bollo restano senza fonte e senza anno** (`W4-D16`). Soglia 77,45 € e importo 2,00 € vivono in `src/lib/fiscal/fiscal-profile.ts` come valori predefiniti del profilo, non come una regola datata | La forma giusta esiste gia — `src/lib/sport-work/rules/`, un file per anno con `source` obbligatorio — ma versionare una regola fiscale e classe C: richiede la fonte **e** la validazione (§31) |
| **W4-E5** | **`paymentTransactionActionSchema` non ha chiamanti.** La rotta delle azioni su un incasso legge `body.action` a mano; lo schema che dichiara l'elenco chiuso delle azioni sta in `src/lib/validation/schemas.ts` e nessuno lo usa. E la stessa famiglia dei tre casi di `W4-D6`, trovata mentre li si chiudeva | Collegarlo cambia il codice di errore di un'azione sconosciuta da 400-di-dominio a 400-di-validazione: e un cambio di contratto piccolo ma reale, e non appartiene a una lane che stava chiudendo la catena della classificazione |

## Debito aperto dalla prima nota (W4-B, 2026-08-29)

Trovato riscrivendo `/movements` sopra il registro canonico. Nessuno e stato
corretto qui: tre riguardano file di altre lane, e uno e una superficie che
questa lane ha tolto di proposito e che va ricollocata, non rimessa dov'era.

| # | Cosa | Perche non e stato corretto qui |
|---|---|---|
| ~~**W4-B1**~~ | ~~**La scheda «Previsti» non esiste piu, e con lei l'unica interfaccia di `expected_income` / `expected_expenses`.**~~ **CHIUSO (2026-08-29, lane di rimedio W4-B1).** La scheda e tornata come **scheda propria** di `/movements`, non come riga del riepilogo: `src/components/accounting/ExpectedEntries.tsx`, con i suoi totali `expected*` dentro un riquadro separato da un bordo. Le previsioni **non** sono state spostate in `accounting_entries` e non entrano in nessun totale di cassa ne in nessun saldo | La decisione che mancava era «dove», non «se». Le due colonne restano quelle di sempre; cio che cambia e **chi scrive**: `src/lib/server/expected-entries.ts` e le rotte `GET\|POST /api/v1/accounting/expected` e `DELETE /api/v1/accounting/expected/:id`, sotto `accounting.read` / `accounting.manage`. La scrittura passa da `appendClubResourceItem` e dalla nuova `removeClubResourceItem` — una riga in `club_resource_items` sotto `FOR UPDATE`, aggregato ricalcolato dalla tabella — cioe lo stesso rimedio gia applicato ai soci, e non dal browser. Provato da `tests/server/accounting-expected-entries.test.mjs` e `tests/ui/accounting-expected-surface.test.mjs` |
| **W4-B2** | **Il riepilogo in testa alla prima nota non conosce tre dei suoi filtri.** I totali vengono da `GET /api/v1/accounting/reports` (W4-D), che accetta date, anno, conto, causale, sede e verso — e **non** origine, stato di riconciliazione e ricerca testuale, che l'elenco invece applica. Filtrando l'elenco per «da riconciliare» i totali continuano a coprire tutto il periodo. La scheda **lo dichiara** invece di tacerlo, ma resta una discrepanza fra due letture della stessa domanda | I tre filtri mancanti vanno aggiunti a `ReportingFilters` e a `buildAccountingReport`, che sono di W4-D. Passarli lo stesso non darebbe un errore: darebbe un totale che ignora silenziosamente la restrizione, che e peggio. Sommare nel browser le righe della pagina darebbe il totale di cento righe spacciato per totale del periodo |
| **W4-B3** | **Il servizio marca `canEdit` su una riga propria, ma nessuna rotta espone la modifica.** `src/app/api/v1/accounting/entries/[id]/` ha solo `reverse` e `reconcile`. La pagina quindi non mostra nessun pulsante «Modifica»: un pulsante che risponde 404 e peggio della sua assenza | Aggiungere un `PATCH` significa decidere **cosa** di un movimento e correggibile senza diventare uno storno (una nota, un riferimento) e cosa no (importo, data, verso). E una decisione di dominio, e il file da toccare non e di questa tornata |
| **W4-B4** | **Tre componenti restano orfani: `AdvancedTransactionDialog`, `BankAccountList`, `MovementDetailPanel`.** Erano montati solo da `/movements` e nessun'altra superficie li usa. Scrivono conti e movimenti nelle colonne JSON `clubs`, cioe fanno esattamente cio che il registro sostituisce | Cancellarli e refactoring estraneo al diff che la lane doveva produrre, ed e la regola §3 di `CLAUDE.md`. L'emissione di fattura e ricevuta che `MovementDetailPanel` esponeva **ha gia un'altra porta**: la finestra «cosa stai per emettere» vive in `AthletePaymentLedger` e in `AthleteEnrollmentTab`, entrambi montati. Restano da cancellare in un commit proprio |

---

## Debito aperto dalla remediation (2026-08-30)

Cio che le sonde di concorrenza hanno trovato e che **non** e stato corretto,
con la ragione. Le quattro voci chiuse dalla stessa tornata — l'IDOR di classe,
il socio perso, i due contratti sponsor, storno-e-riconciliazione insieme —
stanno nel codice e in [14 — Sicurezza](14-security.md); qui c'e solo cio che
resta.

| # | Cosa | Perche resta, e cosa lo tiene |
|---|---|---|
| **W4-R1** | **Il database accetta una gamba di giroconto orfana.** Un `INSERT` diretto con `source_domain = 'INTERNAL_TRANSFER'` e un `transfer_group_id` che nessun'altra riga porta viene scritto: nessun vincolo conta le gambe di un gruppo | Un `CHECK` non puo contare righe; servirebbe un trigger di vincolo differito. La transazione **e** la difesa, e regge: la sonda `1b` prova che se la seconda gamba fallisce la prima non resta. Il rischio residuo e un `INSERT` a mano sul database, che aggira anche la guardia di `db-guard.mjs`. Un trigger e coupling che ADR-0007 chiede di non aggiungere senza necessita |
| **W4-R2** | **Due letture del saldo dentro la stessa transazione possono dare due numeri.** E `READ COMMITTED`, l'isolamento predefinito di Postgres: una scrittura confermata fra le due letture si vede. Un riepilogo generato mentre qualcuno registra un movimento puo mostrare il riquadro dei **saldi** con dentro quel movimento e il riquadro dei **movimenti** senza — o viceversa | Il rimedio e leggere il riepilogo intero in una transazione `REPEATABLE READ`. Richiede di far passare il client della transazione attraverso `readAllAccountingLines`, `listFinancialAccountBalances`, `readAccrualSummary` e `listOperationTypes`, che oggi usano tutti il client di modulo. **Cosa non puo succedere:** il registro non perde ne duplica denaro, e nessun totale e sbagliato in se. Cio che puo succedere e che due riquadri della stessa pagina si riferiscano a due istanti diversi, e la differenza e esattamente l'importo scritto in quell'istante |
| **W4-R3** | **Un movimento puo essere scritto su un conto appena archiviato.** Il controllo «il conto e archiviato?» e la scrittura del movimento non sono atomici: una sonda su dodici giroconti simultanei ne ha visto passare uno dopo l'archiviazione, e non a ogni esecuzione | Il rimedio e il `FOR UPDATE` sul conto dentro la transazione della scrittura. Non e denaro perso ne saldo sbagliato — il conto archiviato deriva comunque il suo saldo — ed e una finestra di millisecondi che si apre solo se qualcuno archivia un conto mentre qualcun altro ci sta scrivendo sopra |
| **W4-R4** | **Le collezioni di club senza un proprietario di dominio si riscrivono ancora in blocco dal browser.** `updateClubDataItem` legge la colonna JSON intera, cambia un elemento e risalva l'array: una riga cancellata da qualcun altro nel frattempo **risorge**. La sonda `S3` lo ottiene su `discounts` | Le collezioni che portano denaro o un atto — `transactions`, `transfers`, `expected_income`, `expected_expenses`, `members` — sono chiuse alla riscrittura di massa (`DOMAIN_OWNED_RESOURCE_ITEM_TYPES`), e sponsor e previsioni hanno una rotta per riga. Le altre — sconti, categorie, orari, allenamenti — sono **configurazione**: una riscrittura persa e un fastidio, non un numero sbagliato. Chiuderle tutte richiede una rotta per riga per ognuna delle ventotto, ed e un lavoro di superficie che non appartiene alla contabilita |
| ~~**W4-R5**~~ | **Risolto (2026-08-30).** Il verso di una riga del registro lo dice ora il **segno** dell'importo, non il fatto di essere uno storno, e lo storno di un rimborso porta la sua etichetta. Una revisione di conferma indipendente ha verificato che saldo derivato e registro coincidono su un insieme che contiene un incasso stornato, un rimborso, lo storno di un rimborso e una liquidazione stornata | — |
| **W4-R6** | **`validateUserToken` non valida niente.** `src/lib/auth.ts` controlla la **lunghezza** della stringa e risponde `valid: true`; il commento dice «in a real implementation». La pagina di verifica del token se ne serviva per tesserare l'utente nel club, e quella strada e chiusa dal lato della scrittura (ADR-0097) | Un invito redento davvero richiede un dominio che oggi non esiste: un record di invito, un destinatario, una scadenza, un consumo. E un Work Package, non una correzione. Finche non c'e, la funzione non concede piu niente — ma resta una promessa non mantenuta, e va tolta o riempita |


### Wave 4 — cosa resta dichiarato dopo l'ottava tornata (2026-08-30)

| # | Cosa | Perche resta |
|---|---|---|
| **W4-R7** | **Compensi del lavoro sportivo e liquidazioni dei bandi non si classificano.** I due rami della vista proiettano `NULL` come causale e `'unspecified'` come ambito, scritti nel SQL: `recordCompensationPayout` e `createFundingSettlement` non hanno un campo per la causale. Su una stagione vera sono **7.000 euro su 7.210** del non classificato — cioe il non classificato e quasi tutto **strutturale** | Darglielo e una colonna nuova su due tabelle, due percorsi di scrittura e due schermate: e una funzione, non una correzione, e la Wave 4 non la amplia. Il rendiconto adesso dice la quota in **denaro** invece che in righe (prima diceva 3,1% dove il denaro era il 67% delle uscite), il che rende il buco visibile invece che mascherato |
| **W4-R8** | **Un ambito congelato su un incasso non si corregge.** `activity_scope_snapshot` si scrive all'incasso e nessun percorso lo riscrive; sul movimento manuale invece riassegnare la causale lo ricongela. Un club che scopre a marzo di aver classificato male la quota deve stornare e riregistrare ogni incasso | Il congelamento e voluto (ADR sulla classificazione): correggerlo non e cambiare un campo, e decidere **da quando** vale la correzione. E una decisione di dominio con effetti fiscali, non una riga di codice |
| **W4-R9** | **«Crediti e debiti» non dipendono dal periodo.** `readAccrualSummary` non prende un intervallo: aperto il rendiconto della stagione 2026/27 si leggono anche crediti della 2027/28 | E dichiarato nella schermata («non dipendono dal periodo»), ed e corretto per un **credito**, che e uno stato di oggi e non un fatto di un intervallo. Ma un lettore che ha appena scelto un periodo legge quei numeri come se lo rispettassero: e tecnicamente giusto e praticamente fuorviante, e va risolto scegliendo — o il periodo, o un'etichetta che nessuno possa mancare |
| **W4-R10** | **Un conto di cassa puo andare in negativo senza che niente lo segnali.** Una cassa non puo contenere denaro negativo: quando succede e sempre un movimento mancante o un giroconto mal datato | Il saldo e derivato e non ha un posto dove mettere un avviso: `listFinancialAccountBalances` restituisce numeri, non diagnosi. Serve una superficie, non un vincolo |
| **W4-R11** | **La data di una ricevuta segue la data dell'incasso, non quella di emissione.** Emettendo oggi la ricevuta di un incasso di ottobre si ottiene un numero dell'anno di **ottobre**, inserito in un registro gia stampato | Legarla alla data di emissione cambierebbe la numerazione di ogni ricevuta emessa in ritardo, e senza chiusura di periodo non c'e niente che dica quale delle due sia giusta per quel club |
| **W4-R12** | **Il residuo di uno sponsor confronta un contratto con incassi lordi.** Nulla sul contratto dice se l'importo e al netto o al lordo dell'IVA | E una decisione di prodotto sul significato del campo, non un difetto di calcolo |
| **W4-R13** | **Cambiare la propria password non richiede quella corrente.** `PATCH /api/v1/auth/user` riscrive `password_hash` con la sola sessione. Dalla decima tornata il cambio **chiude tutte le altre sessioni**, quindi chi possiede quella vera se ne accorge subito e il furto non e piu silenzioso — ma una sessione presa in prestito resta sufficiente per un momento | Chiedere la password corrente e un campo nuovo, una validazione e due schermate (`src/app/profile/[userId]/page.tsx`, `src/components/account/account-home-screen.tsx`) piu il contratto di `supabase.auth.updateUser`. E una funzione, non una correzione, e la Wave 4 non si amplia |
| **W4-R14** | **Una ventina di rotte restituisce ancora `error.message` grezzo.** Stessa classe dell'incidente I-03: un identificativo malformato fa arrivare al browser il testo interno di Prisma — nome del modello, operazione, codice Postgres. L'elenco: `athletes/[athleteId]/documents` (4 punti), `parent-dashboard/**` (6), `clothing/assignments`, `forms/assets/[assetId]`, `payments/*`, `public/forms`, `public/payment-links` | `publicErrorMessage` esiste ed e la correzione, ma applicarla a venti rotte in una tornata di sicurezza e una spazzata che tocca file estranei al resto del lavoro (CLAUDE.md §3). Sono tutte autenticate tranne due, e cio che esce e informazione sull'implementazione, non dati del club. Le quattro rotte gia corrette sono quelle che erano nel perimetro delle tornate 8-10 |
| **W4-R15** | **`GET /api/v1/auth/session` restituisce il token di sessione nel corpo JSON.** Il cookie e `httpOnly`, ma qualunque XSS legge il token da questo endpoint della stessa origine e se lo tiene per 14 giorni fuori dal browser | E voluto: e il canale con cui il mobile ottiene il suo Bearer (`buildSessionPayload`). Toglierlo richiede separare il flusso mobile da quello web, che e un cambio di contratto API — e ADR-0025 congela lo sviluppo mobile. Va deciso quando il mobile riparte |
| **W4-R16** | **Gli indirizzi degli amministratori di piattaforma finiscono nel bundle pubblico.** `NEXT_PUBLIC_EASYGAME_PLATFORM_ADMIN_EMAILS` e letto da `src/lib/platform-admin.ts`, che due componenti client importano: Next lo inlinea a build time, e un visitatore non autenticato scarica un chunk e sa quali account hanno i privilegi piu alti | Separare la meta client da quella server e un piccolo rifacimento del modulo piu la revisione dei due punti d'uso (`auth/complete`, `private/api-docs`). Non concede nessun accesso da solo: e ricognizione, e dice a chi attacca quali indirizzi valga la pena provare |
| **W4-R17** | **Un evento da un account connesso sconosciuto riceve 200, quindi non viene mai riconsegnato.** `resolveEventOrganization` che restituisce `unknownAccount` porta a `markIgnored`, che risponde 200: se `club_payment_accounts.external_account_id` e momentaneamente disallineato rispetto all'account che ha generato l'addebito — un account ricollegato, una riga riscritta da `applyProviderAccountSnapshot`, un club creato fuori da `startConnectOnboarding` — un incasso vero sparisce senza riga e senza ritentativo | Rispondere 500 farebbe ritentare per tre giorni **ogni** evento di un account davvero estraneo, cioe rumore continuo su una condizione che non si risolvera. La scelta giusta e una terza via — accodare l'evento e segnalarlo a chi amministra la piattaforma — e vuole una superficie che oggi non esiste: l'unico lettore di quella tabella e un elenco dei venti eventi piu recenti, senza avviso e senza rigioco. Vale anche per le righe `failed` che nessuno rilegge |
| **W4-R18** | **Il consenso non e consultato da nessun percorso di invio.** Il registro dei consensi esiste, e append-only e gestisce la revoca — ma `audience.ts`, `communications.ts`, `announcements.ts`, `automations.ts` e `payment-reminders.ts` non lo interrogano mai, e `AudienceExclusionReason` non ha un membro «revocato». Revocare un consenso oggi non cambia chi riceve una comunicazione | Non e un difetto di codice esistente ma un collegamento mai fatto fra due domini completi: decidere **quale** consenso governa **quale** invio e una scelta di prodotto con effetti legali, non una riga da aggiungere a un filtro |
| **W4-R19** | **Un tentativo di webhook ucciso dalla piattaforma resta indistinguibile da uno concluso.** La ripresa introdotta nell'undicesima tornata agisce sulle righe `failed`, e una riga diventa `failed` solo se l'errore e catturato nel processo. Il limite di tempo sulla chiamata a Stripe copre la causa piu probabile, ma un esaurimento di memoria o una terminazione della piattaforma lascia la riga in `processed` per sempre | Distinguerli richiede uno stato `processing` scritto all'inserimento e portato a `processed` solo a lavoro concluso, piu una finestra di scadenza oltre la quale un `processing` si riprende. E un cambio di macchina a stati su una tabella che il console di piattaforma legge, e va fatto insieme al rigioco delle righe `failed` di W4-R17: sono lo stesso lavoro |
| **W4-R20** | **«Attesi» su un allenamento conta l'intera categoria, ignorando il gruppo e la sede.** `training-automation.ts` calcola `expectedAttendees` con `athleteMatchesAnyCategory` mentre dichiara `groupIds` dodici righe sopra, e `loadAutomationAthletes` non legge nemmeno `site_id`. Il numero viene **persistito** dentro `clubs.trainings`, e la pagina preferisce quello memorizzato: misurato su un club a due sedi, un allenamento «Pulcini · Scauri» dichiara 220 attesi dove l'appello ne elenca 110. Ogni percentuale di presenza di un club multi-sede e dimezzata | Il percorso manuale ha lo stesso calcolo ma non lo persiste, quindi si autocorregge alla rilettura; quello automatico no. Correggerlo bene vuol dire far leggere `site_id` all'automazione e decidere cosa fare dei numeri gia scritti — una migrazione di dati su un campo di comodo. E un lavoro di dominio allenamenti, non della contabilita, e la Wave 4 non lo apre |
| **W4-R21** | **Cancellare una sede non e sorvegliato, e la guardia che c'e sta nel browser.** `club-sites-section.tsx` rifiuta solo se la sede ha strutture collegate; niente controlla appartenenze, conti, movimenti o gruppi, e la scrittura e un `updateClubData` che accetta qualunque array. Le appartenenze restano con un `site_id` che non esiste piu: quegli atleti non corrispondono a nessuna sede **e** non sono «senza sede», quindi spariscono da ogni elenco per sede pur comparendo in quello generale, e la squadra viene mostrata con l'identificativo grezzo | La correzione vera e una rotta di dominio per le sedi, con archiviazione al posto della cancellazione e riassegnazione delle righe collegate — cioe il trattamento che hanno gia stagioni e conti. Disattivare una sede, che e la strada che l'interfaccia offre per prima, e gia sicuro |
| **W4-R22** | **Il rendiconto per sede mescola cassa filtrata e saldi di club.** `accounting-reports.ts` chiama `listFinancialAccountBalances` e `readAccrualSummary` senza la sede: scelta «Sede Nord», i movimenti sono quelli della sede e i saldi e i crediti sono quelli dell'intero club. Il risultato dichiara `accrualScope: "club"`, che l'interfaccia spiega per il **periodo** e non per la **sede** | E lo stesso nodo di W4-R9 su un altro asse: un saldo e uno stato di oggi, non un fatto di una sede, e un conto puo servire due sedi. Va risolto scegliendo — o si filtra anche il saldo accettando che «saldo della sede» significhi qualcosa di nuovo, o si etichetta in modo che nessuno possa scambiarlo. E una decisione di prodotto |
| **W4-R23** | **`financial_accounts.site_id` si scrive e non si legge mai.** E validata contro le sedi del club e poi nessun filtro, saldo, elenco o rendiconto la usa. Dalla tredicesima tornata la vista del registro la legge — e da li che gli incassi prendono la loro sede — ma il dominio dei conti continua a ignorarla | Il campo adesso ha un lettore, quindi non e piu inerte; resta che l'elenco dei conti non si puo filtrare per sede e la maschera chiede un dato che in quella schermata non cambia niente. E superficie, non correttezza |
| **W4-R24** | **Divergenze mobile/web ancora aperte** (ADR-0025 congela lo sviluppo mobile). `trainer-dashboard-utils.ts` mostra all'allenatore le note di segreteria indirizzate a un **socio** quando l'identificativo coincide con il suo id, indirizzo o **nome** — il web non le mostra a nessuno; `roleHasFullClubAccess` non riconosce `club_manager`, quindi un gestore vede liste vuote (piu restrittivo, non piu permissivo); `finalizeVerification` completa l'OTP da un codice di anteprima restituito dal server, inerte se `AUTH_ALLOW_TEST_CODES` non e mai `true` fuori sviluppo | Sono tutte da correggere **quando il mobile riparte**: la prima e l'unica in cui il mobile e piu permissivo del web, e il premio piu grande sta comunque lato server — `secretariat_notes` viaggia intero verso entrambe le piattaforme, ed e un WP web |
| **W4-R25** | **Un tentativo di webhook ucciso dalla piattaforma resta indistinguibile da uno concluso** — vedi W4-R19. Il limite di tempo sulle chiamate a Stripe (5 s, `STRIPE_HTTP_TIMEOUT_MS`) copre la causa piu probabile, ma non e dichiarato nessun `maxDuration` sulle rotte dei webhook, quindi il margine effettivo dipende dal budget predefinito della piattaforma | Dichiarare `maxDuration` cambia il costo e il piano richiesto: e una scelta di esercizio, da prendere insieme al rigioco delle righe `failed` |
