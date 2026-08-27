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


### E8 — L'idempotenza dell'incasso e una lettura seguita da una scrittura

**Impatto: medio.** [ADR-0062](18-decision-log.md#adr-0062--un-incasso-si-riconosce-dal-denaro-non-dallevento-che-lo-racconta)
ha chiuso il doppio accredito: prima di registrare, il gestore del webhook
cerca nel registro tutti i nomi che il provider da a quel pagamento. Nel
collaudo i due eventi dello stesso incasso sono arrivati a **55 millisecondi**
di distanza, elaborati da due invocazioni distinte.

La guardia e una lettura seguita da una scrittura: fra le due c'e una finestra.
Non si e manifestata, ma esiste, ed e la stessa classe di problema che la
deduplica degli eventi risolve con un vincolo di unicita in base dati invece
che con un controllo applicativo.

**Cosa farebbe la differenza:** un indice unico parziale su
`payment_transactions (organization_id, external_payment_id)`. Va progettato
con attenzione: le righe di **storno** e di **rimborso** copiano per
costruzione l'identificativo dell'incasso originale, quindi un indice pieno le
rifiuterebbe. Serve escludere le righe che hanno `reverses_transaction_id`
valorizzato. E' una migrazione, e merita di essere pensata a parte.


### E9 — Un conto di incasso che nasce per altra via non riceve il proprio default

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
