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

### STAG-01 — ~~Il gemello del validatore troncato vive ancora nella dashboard genitori~~ — CHIUSO (2026-09-04, PP-02 §A)

Chiuso **togliendo il ramo invece di correggerlo**: un identificativo che non e
nessuno dei propri figli non e una richiesta a cui rispondere con un figlio a
caso, e con il ripiego e sparito anche l'ultimo uso del validatore. Vedi
[ADR-0127](18-decision-log.md#adr-0127--il-legame-di-un-tutore-non-e-la-sua-tessera-il-suo-indirizzo-non-e-un-legame-che-apre-da-solo).
La descrizione storica resta qui sotto perche spiega **come** un controllo puo
non controllare senza che nessuno se ne accorga.

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
| **W4-R26** | **Cancellare un club con un bando ma senza documenti fiscali fallisce con l'errore grezzo del vincolo.** `clubs` cascata sia su `funding_accruals` sia su `funding_settlement_lines`, e Postgres esegue i trigger nell'ordine dei nomi: quello dei maturati scatta per primo e trova le righe di liquidazione ancora li, quindi il `RESTRICT` blocca. Vale anche sul percorso `?force=true` che la rotta admin offre come via d'uscita | Fallisce **chiuso** — la transazione si annulla e non si distrugge niente — quindi e un'operazione rotta e un messaggio incomprensibile, non una perdita di dati. Farlo bene vuol dire cancellare le righe di liquidazione prima, dentro la stessa transazione, cioe dare alla rotta admin una procedura di smontaggio ordinata invece di un `delete` — ed e lavoro che va fatto insieme a W4-R17 |
| **W4-R27** | **Un evento di billing senza istante scavalca del tutto la guardia di ordinamento.** `applySubscriptionSnapshot` non confronta piu quando `eventAt` manca — che e meglio di prima, quando scriveva l'ora di elaborazione e avvelenava la chiave — ma una fotografia vecchia e senza timestamp puo ancora sovrascrivere uno stato piu recente | L'istante manca solo se l'evento del provider non porta `created`, cosa che Stripe non fa; la difesa vera sarebbe rifiutare l'evento, ma rifiutare un evento di abbonamento significa non applicarlo mai. Va deciso insieme al rigioco delle righe `failed` |
| **W4-R28** | **La composizione del `where` contabile e coperta solo da una sonda con database.** `ledgerWhere` non e esportata e non ha nessun test puro sulla forma dell'oggetto che restituisce: la collisione fra due chiavi `OR` — che ha fatto sparire il filtro della sede per un commit — e presidiata oggi dalla UAT economica, che ha bisogno di Postgres. Un'asserzione pura sulla forma coglierebbe la stessa classe di difetto in millisecondi e senza ambiente | Esportare una funzione solo per collaudarla e un compromesso che questo repository ha finora evitato, e la sonda economica **e** nel gate. Vale la pena farlo quando quel modulo verra toccato di nuovo, non subito prima di un rilascio |
| **W4-R29** | **La pulizia della UAT economica puo fallire chiusa e lasciare residui nel database di sviluppo.** `pulisci` cancella il club di prova, e ricade nell'ordine dei trigger descritto in W4-R26 quando lo scenario dei bandi ha lasciato righe di liquidazione: la sonda dichiara comunque i suoi controlli passati, perche i controlli sono passati davvero | Riguarda solo il database di sviluppo, e si risolve con la stessa procedura di smontaggio ordinata di W4-R26 — sono la stessa correzione vista da due parti |

---

## Wave 5 — 5C: la proiezione delle due colonne JSON

`clubs.trainings` e `clubs.matches` restano, come **proiezione in sola lettura**
delle righe di `club_events`, con un solo scrittore (`src/lib/server/events.ts`)
e un rifiuto esplicito per chiunque altro provi a scriverle — anche da
`PATCH /api/v1/clubs` (ADR-0098).

Non e un compromesso nascosto: e dichiarato, ha un proprietario, ed e la
condizione per non fare un diff di migliaia di righe in cui nessun errore
sarebbe visibile. **Novantadue** punti del codice leggono ancora la forma
storica.

**Cosa serve per chiuderlo.** I lettori passano a `GET /api/v1/events` a
scaglioni. Quando l'ultimo e passato, la proiezione sparisce e le due colonne si
cancellano con una migrazione. La misura del debito e quel numero: si riporta a
ogni lane che ne sposta una parte.

**Cosa non va fatto.** Nessun altro modulo deve scrivere quelle colonne, e
nessuno deve leggerle come **fonte** quando la riga e disponibile: la copia e
per chi non e ancora passato, non un'alternativa.

**Aggiornamento — 2026-09-11, verificato in staging con account reale
(WP13, acceptance pass autenticata).** Il registro generico
(`src/app/api/v1/[resource]/route.ts`, whitelist in
`src/lib/server/resources.ts`) non ha **mai** avuto `trainings`/`matches`
riammessi dopo la rimozione del commit `d25934d` (2026-09-01): oggi
`GET /api/v1/trainings` e `GET /api/v1/matches` rispondono **400 "Unknown
resource"**, non solo le scritture. Il testo sopra ("resta... come
proiezione in sola lettura") descrive la colonna, non la rotta —
la proiezione e leggibile solo da chi gia parla con `GET /api/v1/events`,
non piu dal registro generico.

Il mobile (`easygamemobile/client/services/mobile-backend-storage.ts`,
`getTrainings`/`getMatches`, invariate dal 2026-04-07, mai aggiornate dopo
`d25934d`) chiama ancora `api.listResource("trainings"|"matches", …)` —
cioe proprio quella rotta. Effetto reale, confermato in staging con
`trainer@easygame.it`: Home (contatori/anteprima allenamenti e gare),
`TrainerTrainingsDashboardScreen`, `TrainerMatchesDashboardScreen`,
`TrainerCategoriesScreen` (che aggrega anche trainings/matches) — quattro
schermate su un club con dati reali non possono piu mostrare ne
allenamenti ne gare. Il fallimento **non e visibile**: l'errore 400 viene
assorbito a monte di `useAsyncSection`/`useAsyncData` (schema non
indagato oltre) e la UI mostra "Nessun allenamento"/"Nessuna gara" —
uno stato vuoto onesto per un errore silenzioso, la stessa cosa che
`StateMessage`'s quattro stati distinti (`05-mobile-architecture.md`,
"Error Handling") esistono apposta per evitare.

**Perche non e stato chiuso nel WP che lo ha trovato (WP13, reskin
EGDS v3.0.0).** E esattamente il caso "cambio di contratto/dominio, non
visivo" che ADR-0168 elenca come fuori dal proprio perimetro — la
correzione (b) sotto, non un reskin.

**RISOLTO — 2026-09-11, stesso giorno, batch di completamento funzionale
WP13.** `getTrainings`/`getMatches` (`easygamemobile/client/services/
mobile-backend-storage.ts`) e le scritture di presenze/convocazioni ora
parlano con `GET/PATCH /api/v1/events` e `POST /api/v1/events/:id/
participants` — la correzione (b) qui sopra, non l'alias (a). Mappatura
e filtro di perimetro (client, difesa in profondita — il server applica
gia da solo il perimetro per il ruolo "trainer") vivono in un modulo
puro nuovo, `easygamemobile/client/lib/trainer-events.ts`, con test
propri (`tests/trainer-events.test.ts`). Registro aggiornato:
`events.list`/`events.item`/`events.participants` sono ora
`mobile_ready: true` in `src/lib/api/registry.ts`. Presenze resta sul
modello binario per scelta dichiarata — vedi D-MOB-11, non toccato da
questa correzione. Dettagli completi in
[18](18-decision-log.md#adr-0168--reskin-completo-a-egds-v300-easygame-blue-trainer-e-parent-ancora-solo-visivo-wp13),
addendum "batch di completamento funzionale".

*(Nota di correzione: un addendum precedente su questo stesso giorno
aveva chiamato questo gap "D-MOB-12" — numero gia occupato
dall'omonima voce su Offline/Manutenzione qualche paragrafo sotto.
Questo gap non ha mai avuto un numero proprio: viveva qui, sotto
"Wave 5 — 5C". Corretto.)*

## Wave 5 — 5C: `training_attendance` come nome di risorsa

La tabella e diventata `club_event_participants`, ma il nome della risorsa nel
registro generico resta `training_attendance`, con la traduzione
`training_id` → `legacy_training_id` in lettura e in filtro. La ragione e
CLAUDE.md §6: il contratto API del mobile non cambia nello stesso commit in cui
cambia il modello.

Si chiude quando il mobile passa a `club_event_participants` — cioe non prima
che ADR-0025 venga rivista.

## Wave 5 — 5F: la pagina gare legge ancora la proiezione

`src/app/matches/page.tsx` carica le gare con `getClubData(clubId, "matches")`,
cioe dalla **proiezione** JSON e non da `GET /api/v1/events`. Le scritture
passano gia dal dominio (creazione, convocazioni, annullamento); la lettura no.

Sta qui e non e nascosto: e uno dei 92 lettori della forma storica, ed e uno
dei primi che 5J o la Wave 6 devono spostare, perche e la schermata su cui la
differenza si vede — la gara letta dalla riga porta con se capienza, RSVP,
versione e sede, che la proiezione ricostruisce ma nessuno usa.

---

## Wave 5 — 5J: cosa e stato tolto, e cosa resta

**Tolti** (W5-64, W5-65): dodici file dell'area allenatore che nessuno
importava — circa 3.258 righe — piu `TrainerAthleteTechnicalDialog`, che era
raggiungibile solo da uno di quei dodici; `/login/trainer`, un login
**simulato** non protetto dal middleware, che la KB elencava fra le rotte
pubbliche valide; e i due file morti dell'area genitore
(`payment-section.tsx`, `page-modals.tsx`).

**La scheda tecnica dell'atleta.** La decisione chiesta dal piano era «portarla
sulla v2 o cancellarla; non resta dov'e». Il contenuto — numero di maglia e note
tecniche — **e gia sulla v2**, nella scheda «Riepilogo Tecnico» del profilo
atleta, con lo stesso permesso (`viewAthleteTechnicalSheet`). Il dialogo era un
duplicato, e i duplicati in questo repository divergono: e stato cancellato.

**Resta**, ed e dichiarato altrove in questo documento:

- la **proiezione** di `clubs.trainings` e `clubs.matches`, con i suoi lettori
  ancora da spostare;
- `training_attendance` come **nome di risorsa** nel registro generico, per il
  contratto del mobile;
- `src/lib/shared-documents.ts` e le due rotte storiche dei documenti, in sola
  lettura per una release;
- `src/lib/simplified-db.ts`, che la Wave 5 ha **ridotto** — `saveTrainingAttendance`
  non scrive piu in tre posti, `clearUpcomingGeneratedTrainings` e
  `generateTrainingsFromWeeklySchedule` non riscrivono piu l'intera collezione —
  e che resta in riduzione (WP-07).

## Wave 5 — cosa l'audit indipendente ha lasciato aperto (2026-09-01)

Chiusi tutti i Critical e gli High, e i Medium che perdevano dati o permettevano
atti fuori perimetro (vedi [14 — Sicurezza](14-security.md)). Resta questo.

### W5-D01 · Nove chiavi del catalogo non le chiede nessuno, e cinque collassano su una

`documents.templates.manage`, `documents.generate`, `documents.generated.read`,
`documents.generated.advance`, `consents.definitions.manage`,
`consents.decide_for_others`, `consents.records.read`,
`members.register.manage`, `sport_work.read_own` non hanno riferimenti sotto
`src/lib/server/**` ne `src/app/api/**`.

Peggio: cinque di esse sono decise a runtime da un unico interruttore,
`documents.templates.read` (`src/lib/documents/permissions.ts`) — fra cui
`consents.decide_for_others`, cioè una chiave del dominio *documenti* che decide
un atto sui *consensi*. Togliere `staff` da quella chiave nel catalogo oggi non
cambia niente.

**Perché blocca la Wave 6 e non la Wave 5**: il motore dei ruoli personalizzati
mostrerebbe cinque caselle che agiscono su un bit solo, cioè prometterebbe una
configurabilità che non c'è. Va risolto **prima** di W6-1, non dopo.

`tests/lib/catalogo-permessi.test.mjs` verifica etichette, duplicati e
appartenenza ai ruoli — mai che una chiave sia **chiesta** da qualche parte.
Quel test è il posto in cui aggiungere il presidio.

### W5-D02 · Il test delle guardie attese copre 5 guardie su 11

`tests/server/guardie-attese.test.mjs` verifica 27 chiamate su 236. Fuori:
`assertSubjectAccess`, `assertSubjectMayDecide`, `assertFieldIsOpen`,
`assertNoOverlap`, `assertClinicalPermission`, `requireLinkedAthlete` — e le
prime due scrivono la propria riga di diniego.

Due buchi nel test stesso: il filtro scarta le chiamate scritte come
assegnazione (`const x = assertX(...)` — non attesa, promessa truthy, non ferma
niente **e** non alza il contatore), e il regex pretende `await` sulla stessa
riga fisica.

L'audit ha verificato a mano tutte e 236 le chiamate: **oggi sono tutte
attese**. Il debito è il presidio, non lo stato.

### W5-D03 · Il perimetro dell'allenatore sugli eventi è applicato in 1 punto su 9

`trainerEventFilter` è chiamata solo da `listClubEvents`. `readClubEvent`,
`updateClubEvent`, `deleteClubEvent`, `saveEventConvocations`,
`saveEventAttendance`, `listEventParticipants` e `createClubEventsBatch` si
fermano alla chiave di ruolo, che l'allenatore ha su tutte.

Il commento in testa a `events.ts` promette il perimetro riga per riga
(punto 3); `trainerEventFilter` dice che il gruppo «è un filtro e non un
confine». **Le due frasi sono nello stesso file e non dicono la stessa cosa**, e
va deciso quale delle due è la regola prima di scrivere il codice che la applica.

### W5-D04 · `capacity` di uno slot è inerte o attivamente sbagliata

`computeFreeAppointmentSlots` calcola `residui = capienza - presi`, quindi con
`capacity: 2` propone due prenotazioni sullo stesso istante. Ma l'indice unico
non conosce la capienza: la seconda prenotazione legittima riceve P2002, tradotto
in «quell'orario è appena stato preso». In nessuna configurazione `capacity` fa
quello che dice. O la si rende vera nel vincolo, o si toglie dal modello.

### W5-D05 · Minori

- La disponibilità restituita alla famiglia porta `assignedToUserId`, cioè
  l'UUID interno degli operatori del club.
- `stripClinicalCertificateFields` non conosce `CLINICAL_CERTIFICATE_FIELDS` sul
  `data` annidato: un `data.file_url` sopravvivrebbe. Nessuno scrive lì oggi.
- `POST /api/parent-dashboard/:id/documents` decodifica il base64 e **poi**
  misura; il ramo multipart misura prima. Nessun limite di frequenza su
  `POST /api/v1/document-submissions`.
- `riprogramma` filtra la disponibilità con l'`assigned_to_user_id` della riga
  esistente, mentre la `GET` della famiglia non filtra per operatore: uno slot
  offerto può essere rifiutato allo spostamento.
- `AttendanceConfirmation.tsx` e `DENIAL_MESSAGES` dicono «allenamento» a mano:
  su una gara si leggono sbagliati.
- `parent-dashboard-types.ts` non dichiara `availableSlots` benché il server lo
  mandi nel payload aggregato: due fonti per lo stesso dato, e va tolta una.
- L'upload della famiglia manda ancora **JSON base64** e non multipart, benché il
  commento della rotta dica «il ramo sparisce con la lane 5J».

### Difetti **precedenti** alla Wave 5, trovati dall'audit

- `member: "collaborator"` in `ROLE_ALIASES` più `const role = access?.role || "member"`
  in `resources.ts`: una `club_access` senza ruolo, scritta intendendo «socio»,
  produce un **collaboratore** con lettura e scrittura su anagrafica atleti,
  certificati e note di segreteria.
- `viewAthleteContacts` ha default `true`, è l'unico gate della scheda contatti
  e ha **zero** occorrenze lato server: la stessa forma di D-4.
  `RISORSE_CON_ANAGRAFICA_PERSONALE` copre `trainers` e `staff_members`, non gli
  atleti — la Wave 5 ha aggiunto quell'allowlist e si è fermata prima.
- `GET /api/v1/documents/:kind/:id` risponde 404 **prima** di ogni
  autorizzazione: 404 contro 403 distingue un id inesistente da uno altrui.
- `src/app/api/forms/assets/[assetId]/route.ts` autorizza con
  `allowedOrganizationIds.includes(...)`: l'ultima porta di byte non migrata ad
  `assertActiveClub`.

---

## Wave 6 — cosa la lane 6A e la lane 6B hanno chiuso, e cosa aprono (2026-09-01)

### Chiuso

| Voce | Come |
|---|---|
| **W5-D01** — nove chiavi che nessuno chiede, cinque su un interruttore solo | Ogni funzione chiede la propria chiave; i tre atti sui consensi lasciano il dominio dei documenti; il presidio e in `tests/lib/catalogo-permessi.test.mjs`. Resta **una** chiave dichiarata non ancora chiesta, con il motivo: `sport_work.read_own`, che aspetta la lane 6C. Vedi [08](08-roles-and-permissions.md) |
| **W6-01…W6-04** — il filtro stato dell'elenco atleti | `paginated` non dipende piu dal totale filtrato; il vaglio di stato si applica anche quando comanda il server; il vocabolario degli stati ha un proprietario (`src/lib/athletes/status.ts`) e sono quattro |
| **W6-05, W6-06** — foto profilo, codice di accesso e numero di maglia non azzerabili | `??` distingueva «nullo» da «non dichiarato»: `primoDichiarato` distingue la seconda cosa |
| **W6-07** — cancellazioni dietro il `confirm()` del browser | Un solo meccanismo di conferma per la scheda atleta, e il testo dice cosa si perde |
| **W6-51** — dalla segreteria non si poteva confermare ne rifiutare un appuntamento | La proiezione porta `actions` accanto a `transitions`, e la traduzione vive nel dominio |
| **W6-54, W6-55** — «struttura non prenotabile» e la tariffa a zero | `isBookableByMembers` e l'interruttore che mancava, onorato anche sulla rotta; un campo nuovo non nasce con due tariffe a zero |
| **§10** — sidebar compressa con icone mute | `SidebarItemTooltip`, uno per tutte e tre le barre, con nome accessibile e apertura al fuoco da tastiera |

### Aperto dalla lane 6A

#### W6-D01 — `@radix-ui/react-tooltip` non e una dipendenza dichiarata

Cinque componenti lo importano direttamente — quattro preesistenti piu
`src/components/navigation/sidebar-item-tooltip.tsx` — e in `package.json` non
c'e: arriva dal meta-pacchetto `radix-ui`. Funziona per via dell'appiattimento
di `node_modules`, e smetterebbe di funzionare il giorno in cui quel pacchetto
cambiasse le proprie dipendenze. **Non e stato corretto qui** perche toccare le
dipendenze dentro una lane di correzioni e un cambiamento di natura diversa: va
fatto con il suo commit e il suo lock.

#### W6-D02 — «Affittabile» resta un nome ambiguo

`isRentable` e il **contratto d'affitto della struttura** — importo, cadenza,
giorno di scadenza, `StructureRentPaymentsSection` — e non ha mai avuto effetto
sull'area famiglia. La Wave 6 gli mette accanto l'interruttore che mancava e ne
corregge la descrizione, ma il nome continua a leggersi come «prenotabile».
Rinominarlo tocca la colonna JSON di ogni club: e una migrazione, non una
rifinitura.

#### W6-D03 — il ripiego di `isBookableByMembers` e `true`

Chi non ha mai avuto un interruttore non puo aver espresso una scelta, quindi il
comportamento di oggi si conserva. La conseguenza va detta: **un club che
credeva di aver chiuso le prenotazioni spegnendo «Affittabile» continua ad
averle aperte** finche non spegne il comando nuovo. Il messaggio da dare ai club
al rilascio e questo, non «adesso funziona».

#### W6-D04 — le tariffe a zero gia in archivio restano

Il percorso famiglia non le mostra piu, ma le righe ci sono e il club le vede
nella propria scheda. Non e stata scritta una migrazione: cancellare righe di
prezzo di un club sulla base di un'inferenza — «zero vuol dire non compilata» —
e una decisione che il prodotto non puo prendere da solo.

---

## Wave 6 — debito aperto dalle lane 6C, 6E, 6F, 6H, 6I (2026-09-01)

Registrato, non corretto. Ogni voce dice **perche** non e stata chiusa qui.

### W6-D05 — «Invia credenziali» su staff e socio — CHIUSO IN PARTE (2026-09-02)

**Il pulsante finto non c'e piu.** `handleShareCredentials` e sparito da
`src/app/staff/[id]/page.tsx` e da `src/app/soci/[id]/page.tsx`: mostrava un
toast e non chiamava nessuna rotta. Al suo posto le due schede montano
`src/components/club/club-person-access-card.tsx` — «Accesso EasyGame» — che
dice se quella persona ha gia un'utenza del club e con quale ruolo, e rimanda a
`/dashboard/access-management`, la schermata che il ruolo lo assegna sul serio
via `/api/v1/club-roles/assignments`.

**Cosa resta aperto**: l'invito vero. `athlete_account_invites` e modellata
**sull'atleta** (`athlete_id NOT NULL`), e `athlete-accounts.ts` dichiara di non
essere «la porta dei tutori»: estenderla a staff e soci richiede o una colonna
soggetto polimorfa o una seconda tabella. **Va deciso, non improvvisato** — e la
stessa scelta che ha prodotto i sei indici polimorfi che `data-subject.ts` deve
ora attraversare. Il vuoto che ne resta e registrato come W6-D16.

### W6-D06 — la quarta implementazione del perimetro allenatore

`filterTrainerDashboardRecords` (`resources.ts:4121`) resta la quarta lettura di
«cosa vede questo allenatore». Non diverge sul difetto chiuso — legge gia
`trainers` **e** `staff_members`, e fallisce chiuso — ma su
`club_events`/`club_event_participants` applica **solo la categoria**, senza la
precedenza del gruppo. Rischio residuo: un elenco leggermente piu largo, mai un
atto piu largo, perche gli atti sono chiusi da `events.ts`.

### W6-D07 — la proiezione dell'area atleta vive nel modulo sbagliato

Sta dentro `src/lib/server/athlete-accounts.ts` per rispettare il perimetro
della lane. E un modulo puro e testabile, e il suo posto e
`src/lib/athlete-area/projection.ts`. Dichiarato, non svista.

### W6-D08 — `GET /api/v1/auth/athlete-profile/[athleteId]` non ha piu consumatori

L'area atleta legge `/api/v1/athlete-accounts/me`. La rotta e stata **riparata**
comunque (W6-34 lo chiedeva: restituiva atleta e certificati interi senza
passare dalla proiezione clinica), ma va deciso se ritirarla.

### W6-D09 — `duplicateFormTemplate` conserva la provenienza dal catalogo

Un club che duplica un modulo adottato e cancella l'originale vedra la voce
ancora marcata «gia fra i moduli del club». Caso di bordo.

### W6-D10 — le tariffe a zero gia in archivio restano

Il percorso famiglia non le mostra piu, ma le righe ci sono e il club le vede.
Non e stata scritta una migrazione: cancellare righe di prezzo di un club sulla
base di un'inferenza — «zero vuol dire non compilata» — e una decisione che il
prodotto non puo prendere da solo.

### W6-D11 — sette punti che loggano ancora l'errore intero

Registro **chiuso** in `tests/server/log-senza-dati-personali.test.mjs`:
`api/athlete-payments/[paymentId]/route.ts:294`,
`api/v1/accounting/accounts/route-context.ts:81`,
`api/v1/clubs/[id]/signature/route.ts:80`, `server/form-submissions.ts:609` e
`:783`, `server/prisma.ts:51`, `server/sport-work-route.ts:87`. Fuori dal
perimetro del presidio ma con lo stesso difetto: `src/lib/simplified-db.ts`
(**50 occorrenze**, WP-07 «in riduzione»), `src/lib/auth.ts` (9),
`src/lib/auth/session-sync.ts` (2), `src/lib/supabase.ts` (1).

### W6-D12 — `AUDIT_LOG_RETENTION_DAYS` non e impostata

Non impostata = **conserva tutto**. Va deciso prima della produzione: e la
prima riga di `RETENTION.md` che il prodotto non puo scrivere da solo.

### W6-D13 — `@radix-ui/react-tooltip` non e una dipendenza dichiarata

Cinque componenti lo importano direttamente e in `package.json` non c'e: arriva
dal meta-pacchetto `radix-ui`. Funziona per appiattimento di `node_modules`, e
smetterebbe di funzionare il giorno in cui quel pacchetto cambiasse le proprie
dipendenze. Toccare le dipendenze dentro una lane di correzioni e un
cambiamento di natura diversa: va fatto con il suo commit e il suo lock.

### W6-D14 — «Affittabile» resta un nome ambiguo

`isRentable` e il contratto d'affitto della struttura e non ha mai avuto effetto
sull'area famiglia. La Wave 6 gli mette accanto l'interruttore che mancava e ne
corregge la descrizione, ma il nome continua a leggersi come «prenotabile».
Rinominarlo tocca la colonna JSON di ogni club: e una migrazione.

### W6-D15 — il ripiego di `isBookableByMembers` e `true`

Chi non ha mai avuto un interruttore non puo aver espresso una scelta, quindi il
comportamento di oggi si conserva. **Va detto ai club al rilascio**: chi credeva
di aver chiuso le prenotazioni spegnendo «Affittabile» continua ad averle aperte
finche non spegne il comando nuovo.

### W6-D16 — una persona di staff e un socio senza utenza non hanno nessuna strada

Registrato mentre si chiudeva W6-D05, dopo aver percorso il flusso invece di
supporlo.

**Cosa esiste davvero oggi**, per una persona di staff o per un socio:

* se ha **gia** un'utenza EasyGame **e** una tessera in questo club,
  `/dashboard/access-management` («Ruoli e accessi», barra laterale, gruppo
  CONFIGURAZIONE) le assegna o le cambia il ruolo, canonico o personalizzato.
  E reale, e raggiungibile, ed e la strada a cui la scheda della persona ora
  rimanda;
* `POST /api/v1/club-roles/assignments` sa **creare** una tessera per una
  qualunque utenza esistente, ma la schermata non lo offre: disegna le righe che
  `listClubAccessAssignments` restituisce, cioe le tessere che il club ha gia.
  Non c'e nessun campo «aggiungi per email»;
* se **non** ha un'utenza, non c'e niente. L'unico invito del prodotto e
  `athlete-accounts` ed e dell'atleta (W6-D05). Il token `trainer_access` lo
  genera **solo** `/trainers/[id]`; il riscatto
  (`POST /api/v1/auth/access/redeem`, `loadTrainerAccessTarget`) accetterebbe
  anche una scheda `staff_members`, ma **nessuna schermata genera quel token
  per un membro dello staff**, e per un socio non esiste nemmeno l'aggancio. Il
  codice del riscatto per lo staff e quindi irraggiungibile: CLAUDE.md §11.8, la
  forma piu comune di difetto in questo repository.

**Effetto residuo**: la segreteria non ha, da nessuna schermata, un modo di
consegnare un accesso a una persona di staff o a un socio che non si sia
registrata da se. La scheda della persona ora lo **dichiara** invece di
prometterlo, che e il minimo onesto, non la soluzione.

**Nota di modello**: staff e soci non hanno una colonna che leghi l'anagrafica
all'utenza (`linked_user_id` lo scrive solo il riscatto di un token, che per
loro non parte). «Accesso EasyGame» confronta quindi le **email**, e lo scrive a
schermo: e un'indicazione, non un legame. Chiudere W6-D05 dara anche il legame
vero.

---

## W6-D17 — Il soffitto dei ruoli personalizzati copre il catalogo, non la matrice per risorsa

**Aperto il 2026-09-02, dall'audit ostile di fine Wave 6. Gravita: media.**

`roleHasPermission` restringe cio che ha una **chiave di catalogo**. Tutto il
resto passa da `normalizeAccessRole`, che di un gettone
`custom:club_manager:<slug>` restituisce `club_manager`, e risponde quindi al
**ruolo base**. Misurato in sonda con un gettone che porta tre chiavi:

```
canAccessClubResource(clubs, update)       -> true
canAccessClubResource(bank_accounts, read) -> true
canAccessClubResource(athletes, delete)    -> true
canAccessPath(/settings) /sport-work /communications -> true
roleHasPermission(audit.read)              -> false   (il soffitto funziona, qui)
```

**L'invariante regge**: nessun ruolo personalizzato eccede il proprio ruolo
base, e `assertMayGrantRole` impedisce di concedere il base intero. Cio che non
regge e l'**aspettativa** che chi spunta tre caselle su una base `club_manager`
stia creando un ruolo ristretto: le caselle governano 37 chiavi, mentre restano
al ruolo base una quarantina di risorse aperte, otto risorse riservate, otto
prefissi di percorso e ogni atto protetto da `canManageClubConfiguration`.

**Cosa e stato chiuso subito**, perche erano le due punte affilate:

- `data_subject.erase` e `data_subject.export` sono ora chiavi di catalogo, di
  **direzione**: la cancellazione irreversibile del fascicolo di una persona —
  spesso di un minore — era protetta da una guardia che nominava quella stringa
  e da nessuna voce di catalogo, quindi non c'era una casella da togliere;
- `seasons.change` era irrestringibile per la stessa ragione, e ora passa da
  `narrowDomainPermission` come gli altri tre domini con matrice privata.

E stato aggiunto il presidio della **domanda inversa** — nessuna guardia puo
chiedere una chiave che il catalogo non conosce — che e cio che chiude la
classe: la prima stesura di quel presidio non avrebbe visto il difetto, perche
cercava solo `permission: "..."` mentre la chiave arriva come argomento
posizionale. Un presidio che non trova il caso da cui nasce non e un presidio.

**Cosa resta.** Rendere restringibile la matrice per risorsa vorrebbe dire una
chiave di catalogo per risorsa e un'altra passata su `canAccessClubResource`: e
un lavoro di ampiezza pari a una lane, non una correzione. Nel frattempo la
scheda del ruolo **dichiara a schermo** cosa il ruolo base porta comunque, e
il consiglio operativo e nel testo: per restringere davvero si parte da una base
piu stretta.

## W6-D18 — Il perimetro di sede e categoria vale su tre domini, non su quindici

**Aperto il 2026-09-02, dall'audit ostile di fine Wave 6. Gravita: media.**

`accessScopes` e letto da: `resources.ts` (atleti: elenco, lettura per id,
modifica, cancellazione), `events.ts` (tutti e otto gli atti) e — da questa
correzione — `document-requests.ts` (fascicolo e coda documentale).

Restano **fuori**: pagamenti, certificati medici, appuntamenti, comunicazioni,
consensi, segreteria, moduli, libro soci, lavoro sportivo, bandi.

**Perche il documentale e stato chiuso subito e gli altri no.** Perche era il
solo dove il perimetro non era incompleto ma **sconfitto**: la coda porta
`subjectName`, cioe nome e cognome di un minore, per ogni riga di tutto il club.
Una segreteria perimetrata su una sede non poteva risolvere `athlete_id` → nome
sull'elenco atleti — li il perimetro funziona — e lo otteneva dalla coda. Il
recinto stava in piedi e la porta di servizio era aperta proprio sul dato per
cui era stato costruito.

Nella stessa correzione la forma Prisma del perimetro ha preso un **proprietario
unico** (`src/lib/server/access-scope-query.ts`): era scritta dentro
`resources.ts`, e quando e servita altrove le strade erano importare seimila
righe o riscriverla. Riscriverla era gia costato una divergenza — la copia nel
registro lasciava passare gli atleti **senza sede**, contro la regola pura — e a
decidere era sempre la copia piu larga.

**Cosa serve per chiudere.** Ogni dominio ha una chiave diversa verso l'atleta
(`athlete_id`, `subject_id`, il destinatario di una comunicazione), quindi non
c'e un innesto unico: e un passaggio per dominio. `athleteIdsWithinAccessScope`
esiste apposta ed e la strada per quelli che non interrogano `athletes`.

**Nel frattempo va detto.** La pagina della gestione accessi promette il
perimetro **senza riserve** («Nessuna casella spuntata significa tutto il
club»), e ADR-0103 lo chiama confine di sicurezza. Per dodici domini non lo e
ancora: chi assegna un perimetro deve saperlo.

## Wave 6 — closeout: cosa la sesta revisione ha lasciato aperto (2026-09-02)

Sei revisori indipendenti, **8 Critical e 24 High**, tutti chiusi in cinque
tornate. Qui restano le voci che **non** sono state chiuse, ognuna con il motivo
per cui non compromette sicurezza, privacy, isolamento tenant o integrita — che
e la sola condizione a cui una voce puo diventare debito.

### W6-D20 — La provenienza dei depositi travasati dice `parent` per tutti

`prisma/migrations/20260901100000_wave5_fascicolo_unico/migration.sql:171-181`
scrive `'parent'` come **costante** per ogni riga travasata, mentre il JSON di
origine porta `uploadedByRole`. Per l'archivio precedente `source` dice quindi
il falso al contrario del difetto chiuso in questa Wave: un documento
**condiviso dal club** risulta consegnato dalla famiglia.

**Perche non e un blocco.** `source` decide due cose operative — se il deposito
apre un lavoro nella coda della segreteria, e cosa la famiglia legge nel proprio
fascicolo — e nessuna delle due e un confine di accesso: chi vede quel documento
lo vede comunque, e il perimetro e i permessi non ci passano.

**Perche resta aperta.** Correggerla e una **migrazione di dati** su righe di
produzione: va decisa e autorizzata, non infilata in un closeout. Il dato di
origine e ancora nel JSON, quindi la correzione e possibile quando si vuole.

### W6-D21 — L'export di una consegna porta anche il testo del messaggio

`data-subject.ts` filtra `communication_deliveries.athlete_ids` sulla sola
persona che chiede, ma restituisce `subject`, `recipient_key`, `recipient_email`
e `recipient_name` interi — mentre `communication-deliveries.ts` li azzera tutti
in cancellazione, e commenta che il testo «puo contenere il nome di chiunque».

**Perche non e un blocco.** Ogni riga di consegna nasce per un destinatario che
ha una posizione sull'interessato: non e stata misurata nessuna fuga verso una
famiglia estranea, e i `recipient_*` sono i dati **del destinatario stesso**.
Resta che i due proprietari della stessa riga danno due risposte diverse su cosa
sia un dato personale, ed e la premessa dei difetti gia trovati: va riconciliata.

### W6-D22 — Un gettone `one_time: false` e una credenziale permanente e multiutente

`payload.one_time === false` rende un gettone riscattabile da **piu** utenze e
per sempre. Il valore vive in chiaro in `club_resource_items.name`.

**Perche non e un blocco.** Dopo questa Wave un gettone non puo piu concedere
piu di quanto il suo coniatore potesse concedere, non raggiunge un altro club,
e ogni riscatto lascia una riga di audit con il ruolo concesso. Restano dieci
tentativi all'ora per utenza. La forma «permanente e condivisibile» resta pero
una scelta di prodotto che nessuno ha mai dichiarato: va decisa.

### W6-D23 — Il contatore per indirizzo si aggira, quello per utenza no

Ruotando `x-forwarded-for` si creano secchielli distinti quando davanti non c'e
il proxy che `AUTH_RATE_LIMIT_TRUSTED_PROXIES` dichiara. Misurato: il 429 arriva
comunque, per il contatore **per utenza**. Con nove caratteri su un alfabeto di
trentadue la forza bruta resta infattibile.

**Aggiornamento 2026-09-03.** Il difetto piu grave dello stesso contatore —
il conteggio che si azzerava sotto richieste simultanee (B-H2, 21 ammesse su
40 contro un limite di 5) — e **chiuso** con un'istruzione atomica sola
([ADR-0109](18-decision-log.md#adr-0109--un-contatore-che-difende-si-scrive-in-unistruzione-condizionata-sola-mai-letto-e-poi-scritto)),
e la conferma OTP non conta piu le raffiche (B-H1). Resta vero cio che dice
questa voce: **senza il proxy dichiarato**, il contatore per indirizzo si
aggira ruotando l'intestazione; a difendere restano il contatore per utenza e,
per l'OTP, il tetto di cinque tentativi sulla challenge, che ora regge anche
in parallelo e da indirizzi diversi (`U-70`).

### W6-D24 — `/api/v1/registry` e pubblica

Pubblica la mappa completa dell'API prima del login. Non espone dati e non apre
nessuna rotta — le guardie restano dove sono — ma e ricognizione gratuita.

### W6-D25 — Il perimetro conferma l'esistenza di una riga: 403 contro 404

`active-club-boundary.ts` sceglie deliberatamente la formula ambigua «non
appartiene al club attivo, **o non esiste**» per non confermare un
identificativo indovinato. Il messaggio del perimetro non ha quell'ambiguita:
dice che la riga esiste, che e di questo club, e che e di un'altra sede. E una
coerenza mancata con una regola dichiarata, dentro il **proprio** club.

### W6-D26 — `accessScopes` e un campo opzionale, e l'assenza e il valore piu permissivo

Il perimetro e dichiarato `accessScopes?: … | null` in ogni scope, e
`normalizeAccessScopes(undefined)` risponde «tutto il club». Verificato che ogni
chiamante odierno passa lo scope reale, e che gli scope sintetici (famiglia,
modelli) sono quelli in cui il perimetro non si applica per disegno. Ma il
valore assente e il **piu permissivo**: e un fail-open in attesa del prossimo
chiamante, e la stessa forma di `if (!scope) return` che `data-subject.ts` ha
dovuto chiudere in questa Wave.

### W6-D27 — Il registro generico non e governato da chiavi dove una chiave non esiste

`RESOURCE_PERMISSION_KEYS` dichiara, per ognuna delle quarantatre risorse aperte
alla gestione, quale chiave di catalogo la governa. Per undici di esse la
risposta e «nessuna», con il motivo scritto — fra cui `athletes`, il cui elenco
e governato dal **ruolo** e dal **perimetro**.

**Perche non e un blocco.** Non e una promessa tradita: l'editor dei ruoli mostra
le sole chiavi di catalogo, quindi un club non ha mai visto una casella
«anagrafica» da togliere. Un ruolo personalizzato su quelle risorse fa cio che
fa la sua base — che e il ruolo che il club ha scelto.

**Perche resta aperta.** Dare una chiave all'elenco atleti vorrebbe dire
**aprire una capability nuova**, che questo closeout non fa. E la prima cosa da
decidere quando la Wave 7 aprira il capitolo dei permessi.

### W6-D28 — Un legame di famiglia verso un'utenza che non esiste ancora

`applicaGuardieDiModifica` in `src/lib/server/resources.ts` chiede due chiavi —
`accounts.athlete.manage` e `clinical.read` — a chi **fa crescere** l'insieme
delle identita dei tutori di un atleta, perche il legame apre a quella persona
l'area famiglia, dato sanitario compreso.

La crescita si misura sulle identita che **corrispondono a un'utenza esistente**,
per identificativo o per email. E deliberato: la stesura che negava ogni
crescita rendeva impossibile correggere un refuso nell'indirizzo di un tutore,
che e il lavoro di tutti i giorni di una segreteria, e una revisione l'ha
misurato.

**Cosa resta aperto.** Scrivere oggi l'indirizzo di un'utenza che **nascera
domani** produce il legame senza passare dalla guardia: alla registrazione,
`canParentAccessAthlete` trovera la corrispondenza per email.

**Perche non e un blocco.** Chi scrive quell'indirizzo sta gia amministrando
l'anagrafica del club, e il legame diventa effettivo solo se qualcuno registra
un'utenza con quell'indirizzo **e ne controlla la casella** — la registrazione
verifica l'email. Non e un'escalation silenziosa: e un ritardo nell'applicazione
della stessa guardia.

**La chiusura.** Valutare la guardia anche in **registrazione**: quando nasce
un'utenza, il legame per email si accende solo se l'identita era stata scritta
da un ruolo che aveva le due chiavi. Vuol dire tenere traccia di **chi** ha
scritto quell'identita, cioe una colonna nuova sul tutore, e non e un lavoro da
closeout.

### W6-D29 — `access_tokens.name` non ha un vincolo di unicita

Il riscatto di un codice di accesso (`POST /api/v1/auth/access/redeem`) cerca
la riga per `name` **senza sapere il club**: chi riscatta non ne fa ancora
parte, quindi non lo puo dichiarare.

Finche due club potevano coniare lo stesso nome, la ricerca teneva «il piu
recente di un club che esiste ancora», e questo permetteva un dirottamento:
chi conosce un codice ne conia uno omonimo nel proprio club, lo tocca, e da
quel momento e il suo club a rispondere.

**Cosa e stato fatto ora.** La rotta rifiuta l'ambiguita: se il nome risponde
per piu di una riga, il riscatto e negato con 409 e tracciato. Chi collide
ottiene di **fermare** un riscatto, non di dirottarlo.

**Cosa resta.** Un vincolo di unicita su `(resource_type, name)` limitato a
`access_tokens` sposterebbe la difesa dal momento della lettura al momento
della scrittura: la collisione non nascerebbe affatto, e il club che prova a
coniare un omonimo riceverebbe subito un errore invece di rompere il riscatto
altrui. E una **migrazione**, e in piu richiede di decidere cosa fare delle
righe gia esistenti che collidono: non e un lavoro da closeout.

### W6-D30 — Un'approvazione fallita **dopo** aver creato la scheda la ricrea al tentativo successivo

`decideFormSubmission` scrive `subjects` con il `recordId` della persona
creata solo nell'ultimo `update`, insieme ad `approved`. Se l'approvazione
fallisce dopo `createResource("athletes")` — per esempio su una richiesta
documentale con un tipo sconosciuto — la compilazione torna `pending` (la presa
si rilascia, B-H4) ma non ricorda la scheda gia creata: il tentativo
successivo ne crea una seconda. Consenso e documento sono idempotenti; la
scheda no. **Non e una corsa** (B-H4 la chiude) ed e visibile alla segreteria
come duplicato. Chiusura: scrivere `subjects` con i `recordId` subito dopo la
creazione, prima delle scritture successive.

### W6-D31 — I candidati duplicati dell'anteprima escono da tutto il club

`reviewFormSubmission` chiede il perimetro sull'atleta **scelto** (B-H5), ma
`findAthleteDuplicates` cerca per codice fiscale, cognome ed email in tutto il
club: un operatore recintato sulla sede Nord vede nome e data di nascita dei
possibili omonimi della sede Sud. Serve alla deduplica, e non porta ne
tutori ne clinico; e comunque un nome fuori perimetro. Chiusura: filtrare i
candidati con `buildAthleteAccessScopeConditions`, o mostrare solo «esiste un
omonimo fuori dal tuo perimetro» senza il nome.

### W6-D32 — Gli otto Medium del secondo revisore, con la classificazione

Riportati nell'handoff (§8) e **non riprodotti** in questa revisione, perche
fuori dal suo perimetro (le correzioni e le loro regressioni). Nessuno e un
accesso cross-tenant, una fuga di dato di minore o clinico, o denaro che esce
due volte; tre toccano il denaro e vanno riprodotti per primi alla prossima
tornata:

| # | Segnalazione | Perche non e un blocker | Priorita |
|---|--------------|-------------------------|----------|
| M-1 | premi/rimborsi/fatture escono senza `financial_account_id` | il denaro esce una volta e resta tracciato; non abbassa un conto, quindi il saldo del conto e ottimista | alta |
| M-2 | `confirmAccrualPeriods` fuori da transazione | interruzione a meta lascia periodi confermati parziali, riconfermabili | media |
| M-3 | `markAccrualsReported` riapre un periodo `settled` | stato incoerente su un periodo gia liquidato, senza uscita di denaro | alta |
| M-4 | `cancelInstallment` check-then-act senza lock | la forma di ADR-0109; una rata annullata mentre si incassa | media |
| M-5 | `PATCH /accounting/entries/:id` scrive `site_id` non risolto | una sede inesistente su una riga, senza effetto sul saldo | bassa |
| M-6 | `applySubscriptionSnapshot` guardia d'ordine come check-then-act | la forma di ADR-0109 sui webhook, gia deduplicati per evento | bassa |
| M-7 | il giroconto non ha idempotenza | un doppio clic scrive due giroconti, a somma zero sul club e visibili | media |
| M-8 | `reverseCompensationPayout` accetta premi/rimborsi/fatture e non riapre il documento | lo storno e corretto sul registro; il documento resta «erogato» | alta |

### W6-D33 — I sette Low del secondo revisore

`L-1` oracolo di esistenza cross-tenant su moduli e compilazioni (403 contro
404: la forma di W6-D25) · `L-2` entitlement `forms_v2` aggirabile via
`duplicate` + `publish` · `L-3` `requestMissingDocuments` deduplica sulla
stringa grezza · `L-4` l'elenco documenti dell'area genitore ignora
`visibleToParent` per titolo e descrizione (i byte sono filtrati) · `L-5`
`season_id` mai verificato in scrittura · `L-6` `allowOverpayment` si accende
dal corpo senza traccia · `L-7` la convocazione non verifica che l'atleta sia
del club (righe sporche, non una fuga). Non riprodotti; nessuno apre un dato
di un altro club o di un minore.

## Debito trovato dal Branding Pass, non toccato perche fuori scope (2026-09-03)

Trovato mentre si sostituiva il marchio placeholder con gli asset ufficiali e
si portava un'identita coerente su chrome, auth ed email. Nessuna di queste
e stata corretta qui: sono bug, incoerenze o superfici funzionali fuori dal
perimetro di un intervento dichiaratamente solo di branding.

| # | Cosa | Perche non e stato corretto qui |
|---|---|---|
| **BR-1** | `--eg-blue: #1d4ed8` (`globals.css`) non combacia esattamente col blu degli asset ufficiali (`#2563EB`, verificato per campionamento pixel) | Il token e usato da molti componenti: allinearlo e un cambiamento visivo diffuso, non uno scambio di asset. Va deciso e verificato a parte |
| **BR-2** | `src/components/ui/mobile-header.tsx` referenzia `/images/logo_bianco.png`, che non esiste in `public/`: un'immagine rotta | Il componente non e montato da nessuna pagina (verificato: nessun import vivo). E un bug reale ma su codice irraggiungibile, e "non correggere bug trovati incidentalmente" era un vincolo esplicito di questo intervento |
| **BR-3** | Nessun `error.tsx` / `global-error.tsx` / `not-found.tsx` esiste in `src/app`: gli errori cadono sul fallback di default di Next.js, senza marchio | Crearli e una superficie funzionale nuova (contenuti, layout, decisioni UX), non uno scambio di asset su una pagina che gia esiste |
| **BR-4** | Le pagine pubbliche transazionali (`iscrizione/[reference]`, `forms/[publicSlug]`, `pay/[token]`) non mostrano ne il marchio EasyGame ne quello del club | Scelta deliberata, non dimenticanza: sono superfici rivolte alla famiglia dove l'identita visibile e quella del club, la stessa distinzione Platform/Club chiesta per le email (§8 del mandato). Aggiungere il marchio EasyGame li e un giudizio di prodotto, non branding meccanico |
| **BR-5** | Il gradiente di sfondo blu-ciano (`from-blue-600 to-cyan-400`) di `token-verification/page.tsx` e `token-verification/[userId]/page.tsx` non usa i token `--eg-*` come il resto del prodotto | E uno stile preesistente incoerente, non un difetto di marchio: correggerlo e ridisegno, non sostituzione di un asset |
| **BR-6** | `12-integrations.md` (righe intorno a "Non contiene link di pagamento... Wave 2") descrive `sendPaymentReminderEmail` come privo di link di pagamento, ma il codice lo supporta gia (`paymentLink`, dal commento di W1-F) | Notato leggendo il file per il branding delle email; la KB era gia disallineata dal codice prima di questo intervento, per una ragione che non riguarda il marchio |

## Debito aperto da PP-01, non toccato perche fuori scope (2026-09-03)

Trovato mentre si riproducevano i difetti di
[42 — PP-01](42-pp-01-club-atleti-allenamenti.md). Nessuno di questi e stato
corretto li: «un commit = un cambiamento coerente», e una lane di correzioni non
e il posto dove riscrivere un chiamante o cambiare la forma di un elenco.

| # | Cosa | Perche non e stato corretto li |
|---|---|---|
| ~~**PP01-D1**~~ | **CHIUSO (2026-09-04, PP-02 §O).** La pulizia passa adesso dal dominio degli eventi: il programma settimanale resta su `clubs.weekly_schedule`, che nessuna proiezione governa, e gli allenamenti in programma si cancellano uno per uno con `deleteEventIfEmpty` — che rifiuta cio che ha lasciato una traccia. L'esito porta `keptWithHistory`, perche un conteggio silenziosamente diverso da quello promesso e il modo in cui una pulizia sembra riuscita e non lo e. La conferma e passata da `window.confirm` al dialogo dell'applicazione. Descrizione storica: `cleanupOrphanScheduledTrainings` (`src/lib/simplified-db.ts`) scrive `clubs.trainings` **direttamente dal browser**, passando da `PATCH /api/v1/clubs`. `resources.ts` lo rifiuta da ADR-0098 — «e una proiezione degli eventi e si scrive da `/api/v1/events`» — quindi il pulsante «Rimuovi allenamenti in programma» della pagina Allenamenti **fallisce sempre**, con un messaggio che parla d'altro | E un chiamante che nessuno ha migrato al dominio degli eventi quando ADR-0098 ha chiuso la porta. Migrarlo e una correzione con il suo commit e il suo test, non un ritocco dentro una lane di altri difetti |
| ~~**PP01-D2**~~ | **CHIUSO (2026-09-04, PP-02 §O).** La versione viaggia dalla lettura al salvataggio (`formatTrainingSession` la conserva, `updateEvent` la rimanda), e sul conflitto la pagina **ricarica** invece di limitarsi a dirlo: lasciare la ricarica come istruzione vuol dire che chi non la esegue riceve lo stesso errore per sempre. Descrizione storica: la modifica di un allenamento dal browser non mandava la **versione**: `updateEvent(id, data)` senza terzo argomento, quindi `expectedVersion` e `null` e ricade su `existing.version`. Il controllo ottimistico di ADR-0098 non puo mai fallire su quel percorso, ed e proprio il percorso delle due segretarie che salvano insieme | Mandare la versione senza avere un percorso di ricarica sul conflitto trasformerebbe un salvataggio riuscito in un errore che la segreteria non sa risolvere. Le due cose vanno insieme |
| **PP01-D3** | `historicalCategoryName` viene scritto in due punti di `src/app/training/page.tsx` e **non lo legge nessuno** | Codice morto trovato tracciando le categorie. Toglierlo e una pulizia, e va con le altre |
| **PP01-D4** | `buildAthleteRows` (`src/app/athletes/page.tsx`) emette **una riga per appartenenza**: un atleta in due categorie compare due volte nell'elenco, e i contatori per stato lo contano due volte | Tocca la forma dell'elenco e la sua paginazione, non i filtri di stato che PP-01 doveva correggere |
| **PP01-D5** | `/permissions` **non** ha l'esclusione dei ruoli personalizzati che `/dashboard/access-management` ha (`access-roles.ts`). Un `custom:*` passa la guardia di rotta; `getClubSettings` **inghiotte il 403** e la pagina mostra tutti i venticinque interruttori accesi a prescindere dalla configurazione reale; il salvataggio poi fallisce. E la divergenza fra cio che si vede e cio che si puo, su una pagina di permessi | E un difetto di autorizzazione su una pagina che PP-01 doveva **analizzare** e non modificare (§M: KEEP PARTIAL). Va corretto con il suo commit e il suo test di ruolo |
| **PP01-D6** | Il menu `...` di un allenamento e costruito con `innerHTML` a mano invece che con la primitiva del menu, e contiene una voce sola | Riscriverlo e un cambiamento di natura diversa da una correzione di difetto |
| **PP01-D7** | Ne la barra laterale ne il menu mobile filtrano per ruolo le voci «Permessi allenatore» e «Ruoli e accessi»: `collaborator` e `staff` le vedono e rimbalzano sulla guardia | Vale per l'intera barra — l'unico filtro esistente e `canOpenAccounting` — non per queste due voci |

## Debito aperto da PP-05, non toccato perche fuori scope (2026-09-04)

| Voce | Cosa | Perche non e stato risolto qui |
|------|------|-------------------------------|
| ~~**PP05-D1**~~ **CHIUSO** (secondo round PP-05) | **Un utente solo-OAuth non poteva aggiungere il cellulare, ne cambiare email, ne impostare una password.** `createOAuthBootstrapUser` scrive una password casuale che nessuno conosce, e `CURRENT_PASSWORD_REQUIRED` (`src/app/api/v1/auth/user/route.ts`) bloccava tutti e tre i campi. Valeva anche per chi aveva appena subito uno **sfratto** (ADR-0134), che e l'altra popolazione senza password | **Chiuso senza la colonna e senza l'ADR.** La distinzione «non ha mai avuto una password» / «ne ha una che non ricorda» resta indecidibile dal client, e non serve deciderla: la pagina Account porta ora, accanto agli avvisi di verifica, il pulsante «Ricevi un link per impostarla», che chiama `POST /auth/password/forgot` sul proprio indirizzo. Compare sempre — chiederlo al server pubblicherebbe un fatto che non serve a nessun altro — ed e discreto di proposito. Non apre nessuna strada nuova: quel link chiunque puo chiederlo dalla pagina di accesso, e la password si imposta **dalla casella**, non dalla sessione |
| **PP05-D2** | **Il pepe delle impronte OTP ricade su `DATABASE_URL`** (`otpPepper`, `src/lib/server/auth-workflows.ts`) quando `AUTH_OTP_SECRET`, `AUTH_RATE_LIMIT_SECRET` e `CRON_SECRET` mancano. Chi ha estratto un dump ha quasi certamente anche la stringa di connessione con cui l'ha estratto: in quel caso il milione di codici a sei cifre torna enumerabile. In piu, una rotazione della password del database invalida in silenzio tutte le impronte vive | Togliere il ripiego significherebbe che un'installazione locale non funziona senza configurare un segreto. La correzione giusta e **rifiutare l'avvio** quando `NODE_ENV=production` e nessun segreto e dichiarato — cioe una guardia di avvio, che oggi non esiste per nessuna variabile e va disegnata una volta per tutte. `AUTH_OTP_SECRET` e documentato in `.env.example` e in [13](13-environments.md) |
| **PP05-D3** | **`clubs.logo_url` e un data URL**, quindi il marchio club nelle email e sempre il nome scritto in lettere: nessun logo compare mai. Il core lo accetterebbe gia, se fosse un URL sulla nostra origine (`resolveBrandLogo`) | Serve un archivio di loghi servito dalla nostra origine — cioe toccare `attachments.ts` e la scheda club, che PP-05 non possiede. Il ripiego e leggibile e onesto, non un difetto visibile |
| **PP05-D4** | **L'invito ad attivare l'accesso atleta resta a marchio EasyGame** anche se lo manda il club, e `buildAthleteInviteEmailHtml` compone HTML a mano invece di passare dai blocchi del core. **Allargato dal terzo round della revisione ostile**: il suo `href` non passa nemmeno da `sanitizeEmailUrl`, ed e l'**unico** URL-in-attributo del sistema email rimasto fuori dal filtro — non sfruttabile oggi (link composto dal server, base da variabile d'ambiente, gettone casuale), ma reso anche nell'anteprima | `src/lib/server/athlete-accounts.ts` e di PP-04 nel contratto di ownership parallelo: la frontiera non si attraversa. Registrato come dependency verso PP-04 |
| **PP05-D5** | **`getRequestIp` dietro un proxy non fidato.** Con `AUTH_RATE_LIMIT_TRUSTED_PROXIES=1` e una catena `X-Forwarded-For` di lunghezza 1, l'indice cade sulla voce scritta dal client. Su Vercel la catena e piu lunga e regge; su un'installazione esposta direttamente gli assi per indirizzo IP sono aggirabili | Codice **precedente** a PP-05 (Wave 6), non toccato dalla lane. Gli assi per account e per destinatario introdotti da PP-05 non passano di li, ed e la ragione per cui il difetto e un fastidio e non una chiave rotta |
| ~~**PP05-D6**~~ **CHIUSO** (secondo round PP-05) | **`npm run lint` usciva con codice 1 in ogni worktree**, per un conflitto del plugin `@next/next` fra `.eslintrc.json` del worktree e quello identico della radice del repository — che ESLint trova risalendo l'albero, perche i worktree vivono sotto `.claude/`. Non era un errore di codice: `npx eslint --no-eslintrc --config .eslintrc.json` sugli stessi file dava 0 errori | **Chiuso con la riga prevista**, `"root": true` in `.eslintrc.json`. La prima stesura la rimandava all'integrazione perche vale per tutte e tre le lane parallele; e stata applicata qui perche il gate `npm run lint` e reale e questa e l'unica correzione possibile — e perche la riga e giusta a prescindere dai worktree: sopra la radice del repository non esiste nessuna configurazione ESLint legittima da ereditare. **Conflitto previsto in integrazione**: se PP-03 o PP-04 aggiungono la stessa riga, e la stessa riga nello stesso posto, e si risolve tenendone una |
| **PP05-D7** | **Le righe `prisma:error Unique constraint failed` sfuggono al punto unico degli errori** sotto concorrenza vera. Il logger interno di Prisma (`log: ["error"]` in `src/lib/server/prisma.ts`) stampa l'invocazione **prima** che il codice applicativo veda l'eccezione, quindi il `catch` la ferma ma non la riga. Vale per `createInternalChallenge` e per il ramo reset di `sendPasswordResetChallenge`, entrambi sotto l'indice unico parziale introdotto da PP-05. Contenuto: i soli **nomi** dei campi (`user_id`, `channel`), nessun valore e nessun dato personale — igiene di osservabilita, non riservatezza. Trovato dalla revisione ostile (terzo round) e **riconfermato dal quarto** sul percorso OTP, dove il pre-read non c'e: la proprieta di sicurezza regge (una sola challenge viva sotto dodici reinvii simultanei, misurato), il rumore no | La correzione e nella **configurazione del logger** di Prisma, cioe in `src/lib/server/prisma.ts`, che e il punto unico del client: e una decisione su tutto il prodotto (spegnere `log: ["error"]` toglie rumore ma anche segnale altrove), non una riga di questa lane. Il pre-read aggiunto al ramo reset (L-2 del secondo round) toglie gia il caso comune, che e il secondo clic sul pulsante |
| **PP05-D8** | **Il secchiello SMS per destinatario si puo saturare a danno di terzi.** Registrando account con indirizzi usa-e-getta e **il numero di un'altra persona** si consuma il contatore condiviso di quel numero (`otpSendTarget`, 5 all'ora), e per quell'ora l'SMS di verifica legittimo di quella persona non parte. Trovato dalla revisione ostile (terzo round), gravita bassa: reversibile, limitato, nessun dato esposto | **In parte intrinseco** a un tetto per destinatario, e toglierlo riaprirebbe HIGH-3 del primo round — dieci SMS all'ora verso un numero scelto — che e molto peggio. La correzione vera pretende di distinguere «chi sta registrando davvero quel numero» da «chi lo sta pompando», e l'unico segnale che le separa e il **possesso**, cioe proprio cio che l'SMS deve ancora provare. Va disegnata, non improvvisata |
| **PP05-D9** | **L'invio dell'SMS nella registrazione e un oracolo di enumerazione.** Le risposte HTTP dei due rami sono indistinguibili — corpo, stato e tempi, tutti misurati dal quarto round — ma la **consegna del messaggio** no: con un indirizzo gia occupato l'SMS parte solo se la password coincide, con un indirizzo libero parte sempre. Chi registra un indirizzo candidato **col proprio numero** scopre dall'arrivo del messaggio se quell'indirizzo esista. Richiede un operatore che consegna davvero, e costa un SMS al club per ogni tentativo | **Le tre correzioni possibili sono peggiori del difetto.** Mandare comunque l'SMS significa spedire verso un numero che nessuno ha ancora provato, cioe riaprire HIGH-3 del primo round; non mandarlo mai spegne la ripresa di una registrazione interrotta, che e un caso reale del prodotto; distinguere «chi sta registrando davvero quel numero» da «chi lo sta sondando» pretende il **possesso**, cioe proprio cio che l'SMS deve ancora provare. Nel frattempo il tetto per destinatario limita la misura a cinque tentativi l'ora **per numero**, e il numero e quello di chi sonda. Gemello di PP05-D8: hanno la stessa radice e la stessa correzione mancante. **E la quarta correzione, quella che sembra piu ovvia, va scartata per iscritto**: consumare `otpSendTarget` sul numero del **corpo** anche nel ramo dell'indirizzo occupato non chiude l'oracolo — l'SMS continua a non arrivare, e l'attaccante lo misura lo stesso — e apre una **seconda porta a PP05-D8**, perche si potrebbe saturare il secchiello del numero di un'altra persona registrando un indirizzo occupato qualunque, senza nemmeno possedere una password. Rende peggiore un difetto per attenuarne un altro |
| **PP05-D10** | **L'oggetto di un'email non passa da nessuna normalizzazione nostra.** Un oggetto puo portare contenuto di un utente — il titolo di un avviso di club, il nome del club nell'invito atleta, i segnaposto risolti di una comunicazione — e nessuna riga di EasyGame gli toglie CR/LF prima di consegnarlo al trasporto. Oggi non e sfruttabile: misurato sul MIME vero (`scripts/pp-05-giro-conclusivo-probe.mjs`, C4), il compositore di `nodemailer` piega il valore su **una riga sola** e non nasce nessuna intestazione nuova, nessun `Bcc`. Ma e una difesa che **appartiene alla libreria**, non al prodotto | Metterla dentro vorrebbe dire scegliere dove: nel punto unico di invio (`sendTransactionalEmail`) e la scelta giusta, e tocca **tutte** le email del prodotto, comprese quelle di domini che PP-05 non possiede. E una riga, ma va decisa una volta per tutte insieme alla normalizzazione dei destinatari — che oggi non arrivano mai dal client, e per questo il rischio resta teorico. La prova C4 esiste proprio per accorgersi del giorno in cui la proprieta della libreria smettesse di valere |
## Debito aperto da PP-03, non toccato perche fuori scope (2026-09-04)

Trovato mentre si riproducevano i difetti di
[47 — PP-03](47-pp-03-trainer.md). Vale la stessa regola: una lane di correzioni
non e il posto dove bonificare l'archivio o riscrivere una pagina intera.

| # | Cosa | Perche non e stato corretto qui |
|---|---|---|
| **PP03-D1** | Le righe **gia** dangling prodotte dallo sweep difettoso (§3 di [47](47-pp-03-trainer.md)) restano in archivio: `clubs.trainers[].linkedUserId`, `club_resource_items.payload.linkedUserId`, `athletes.data.guardians[].linkedUserId` e `athletes.user_id` che puntano a persone senza piu una tessera nel club. La correzione ferma la produzione di righe nuove, non ripulisce le vecchie | E una **bonifica dei dati**, non una modifica di codice: va scritta come script idempotente con il suo dry-run, eseguita per club e verificata, e le tre lane PP stanno lavorando in parallelo su database separati. Farla dentro una lane di correzioni significherebbe scrivere una migrazione di dati che nessuno ha ancora deciso di eseguire |
| **PP03-D2** | `GET /api/v1/auth/memberships` e `POST /api/v1/auth/memberships/activate` restituiscono al browser `membership.role` **grezzo**, cioe lo **slug** di un ruolo personalizzato (`custom:trainer:preparatori`). Il browser lo salva in `activeClub.role` e poi chiede `roleHasPermission(activeClub.role, chiave)`: uno slug senza `#` porta `permissions: []`, quindi **ogni** ruolo personalizzato riceve `false` su **ogni** chiave lato interfaccia. Le caselle spuntate nella schermata dei ruoli non accendono niente. Misurato sui consumatori `src/app/documenti/page.tsx:46`, `src/components/athletes/profile/athlete-account-section.tsx:111`, `athlete-data-subject-section.tsx:202`, `src/app/dashboard/access-management/page.tsx:402`. La correzione e emettere il **gettone** che `resolveOrganizationScopeForUser` gia costruisce (`src/lib/server/auth.ts` ~470) | Le rotte `src/app/api/v1/auth/**` sono di **PP-05** per il contratto di ownership delle lane parallele: PP-03 non le tocca, e ha registrato la dependency. Non e stato chiuso a valle allargando `roleHasPermission` ad accettare uno slug nudo, perche uno slug senza chiavi diventerebbe il ruolo **base intero** — cioe la scalata che ADR-0102 esiste per impedire. Il difetto **fallisce chiuso**: il server decide con `scope.activeRole`, che il gettone ce l'ha, quindi nessun dato esce e nessuna scrittura passa |
| **PP03-D3** | La bacheca dell'allenatore ha un riquadro **«Avvisi del club»** che per un allenatore non puo mai riempirsi. `readAnnouncementsForUser` legge le consegne (`communication_deliveries`), e le consegne le compone `resolveAudience`, che parte da `prisma.athlete.findMany`: i dieci criteri disponibili — `all_families`, `athlete_ids`, `category_ids`, `group_ids`, `site_ids`, `certificate_missing_or_expiring`, `no_account`, `overdue_payments`, `event_convocated`, `event_no_rsvp` — selezionano **atleti**, e il destinatario e sempre un tutore. Non esiste un criterio che nomini gli allenatori o lo staff, quindi un avviso «a tutti gli allenatori» non e esprimibile: il riquadro compare a ogni allenatore e resta vuoto salvo che quella persona sia anche tutore di un atleta. Il commento in testa a `trainer-board-dashboard-page.tsx` da per esistente quell'invio, e non esiste | Audience e Communication Core (`src/lib/server/audience.ts`, `announcements.ts`, `communications.ts`) non sono di PP-03 per il contratto di ownership delle lane parallele, e la comunicazione e il dominio di **PP-05**. Aggiungere un criterio che seleziona persone invece di atleti cambia la forma di `ResolvedAudience` — oggi ogni destinatario porta `positions[]` di atleti — e tocca cinque chiamanti: solleciti, automazioni, invio massivo, bacheca e invito a rispondere. Non e una riga: e una decisione di dominio. Registrata come dependency verso PP-05. **Fallisce chiuso**: nessun dato esce, manca una funzione |
| **PP03-D4** | `PATCH /api/v1/[resource]/[id]` risolve il corpo con `const payload = body?.data ?? body` (`src/app/api/v1/[resource]/[id]/route.ts:161`). Su una risorsa che ha davvero una colonna `data` — `athletes`, `medical_certificates`, `notifications`, `appointments` — l'intero corpo viene **scartato** e sostituito dal contenuto di `data`, i cui campi non sono colonne: la rotta risponde **200** e in archivio non cambia niente. Misurato: `PATCH /api/v1/athletes/<id>` con `{"first_name":"A","data":{...}}` torna 200, `first_name` non cambia e `data` resta `{}`. Il `POST` gemello ha un'euristica (`resolveCreatePayload`), il `PATCH` no | Perdita di dato **silenziosa su risposta di successo**, quindi va corretta; ma la rotta generica e la porta di **ogni** risorsa e di **ogni** ruolo, e tre lane stanno scrivendo in parallelo sullo stesso ramo. Un cambiamento alla risoluzione del corpo del `PATCH` va fatto con un inventario dei chiamanti — client interno, mobile, script — e misurato risorsa per risorsa, non infilato in una lane di correzioni dell'area allenatore |
| ~~**PP03-D5**~~ | **Chiuso dal quinto round** ([47](47-pp-03-trainer.md) §15.4). `athletes.data` era rimasta sull'elenco dei **vietati** mentre `medical_certificates.data` era gia passata a un elenco di **ammessi** ([ADR-0126](18-decision-log.md)), e un revisore ostile l'ha vinta con due contenitori dal nome nuovo (`schedaSanitaria`, `anamnesi[]`) e cinque campi dal nome italiano | L'obiezione che teneva aperto il debito — «enumerare cio che il prodotto scrive da anni, e ogni campo dimenticato sparisce da una schermata» — e stata risolta restringendo il **lettore** invece della colonna: l'elenco di ammessi vale per chi ha `clinical.status_read` e **non** `clinical.read`, cioe l'allenatore e i ruoli che ne derivano, le cui schermate leggono da `data` una ventina di campi enumerabili. La famiglia, che ne legge molti di piu sul proprio figlio, non ha nessuna delle due chiavi e resta fuori. I **contenitori** passano invece per ammissione per chiunque, perche li l'insieme e piccolo e dichiarato |
| **PP03-D6** | Tre chiavi di navigazione dell'area allenatore su dieci — `categories`, `notifications`, `compensation` — non compaiono in `resolveNavigationKey` (`trainer-dashboard-club-shell.tsx`), quindi la scorciatoia che rimanda alla prima rotta accessibile non scatta su quelle pagine. **Non e una falla**: ognuna delle tre si difende da sola con `SectionBlockedState`, e il dato che ci passa e comunque tagliato dal server. E un'incoerenza di comportamento — sette voci rimandano, tre mostrano una schermata di blocco | Correggerlo e una riga per chiave, ma cambia cosa vede un utente su tre pagine e il verso giusto non e ovvio: la schermata di blocco **spiega**, il rimando no. Va deciso una volta per tutta l'area allenatore, insieme alle altre superfici che usano `SectionBlockedState`, non tre righe alla volta |
| **PP03-D7** | `POST /api/v1/notifications` con `{"user_id": <un membro del club>, "title": …, "message": …}` risponde **200** a un allenatore, e `sendNotificationEmails` fa partire anche l'email. Le tre guardie giuste ci sono e sono state misurate: `user_id` nullo — cioe «a tutto il club» — e negato, una chiave mancante e negata, un utente di un altro club e negato. Resta un canale **uno-a-uno di testo libero, con email**, aperto a un ruolo che non ha `communications.send`, senza registro delle consegne e senza riga di audit | Chiuderlo non e togliere una riga: le notifiche uno-a-uno sono il modo in cui oggi diverse funzioni avvisano una persona, e restringere la creazione al solo `communications.send` va misurato su tutti i produttori prima di essere fatto. La domanda giusta — «una notifica indirizzata e una comunicazione, e come tale va registrata?» — e di dominio comunicazioni, cioe di PP-05 |
| **PP03-D8** | `GET /api/v1/appointment-slots` risponde **200** a un allenatore: escono gli orari di ricevimento del club, cioe la sua configurazione. Non e dato personale, ed e il contrario di cio che `assertPuoConfigurareLaDisponibilita` dichiara per la scrittura (`src/lib/server/appointments.ts:168`), che a un allenatore risponde 403 | La lettura degli slot serve al percorso di prenotazione della famiglia e a chi mostra le disponibilita: stringerla senza aver percorso quei due flussi rischia di spegnere la prenotazione. Va fatto con l'inventario dei lettori, non con una riga |

## Debito aperto dal quinto round ostile di PP-03 (2026-09-05)

Il round ha consegnato **Critical 0 / High 4 / Medium 5 / Low 5**. I quattro HIGH
sono chiusi ([47](47-pp-03-trainer.md) §15). Delle altre dieci righe, tre sono
state chiuse insieme a loro perche stavano nello stesso file e nella stessa
domanda; le altre stanno qui, ognuna con la ragione per cui una lane di
correzioni dell'area allenatore non e il posto giusto.

| # | Cosa | Perche non e stato corretto qui |
|---|---|---|
| **PP03-D9** | Le dieci caselle di `clubs.settings.trainerDashboardPermissions.actions` — fra cui `manageTrainingStatus` e `manageAttendance` — sono applicate **solo nel browser** (`src/lib/trainer-dashboard-permissions.ts`, letto da `trainer-trainings-dashboard-page.tsx` e `trainer-matches-dashboard-page.tsx`). Misurato con entrambe spente e `GET /api/v1/trainer/preferences` che le rilegge `false`: `POST /api/v1/events` 200, `PATCH` 200, appello 200, annullamento 200. Un club che spegne la casella ottiene una schermata senza pulsanti davanti a un server che accetta tutto. §11 di questa lane ha **allargato l'etichetta** di quella casella ai quattro verbi, quindi la promessa oggi e piu ampia di prima | Il file lo dichiara da solo (W6-28): sono preferenze di interfaccia, non chiavi di permesso, e non passano da `access-roles.ts`. Portarle sul server vuol dire decidere se diventano chiavi del catalogo — con la loro matrice per ruolo e il loro `narrowDomainPermission` — oppure una configurazione di club che le guardie leggono: e una decisione sul **modello dei permessi**, che ha un proprietario unico ([CLAUDE.md §2](../../CLAUDE.md)) e non si prende dentro una lane. Il difetto **non** allarga il perimetro: chi passa e comunque dentro le proprie categorie |
| **PP03-D10** | `status` di un evento e scelto dal **client** alla creazione (`src/lib/events/model.ts:281`, usato da `createClubEvent`, dove `assertEventTransition` non gira). Misurato: `POST /api/v1/events {"status":"completed","date":"2020-01-15"}` risponde 200, e l'appello sopra quell'evento scrive tre righe `present`. `src/lib/funding/attendance-measure.ts` conta `status = present` senza guardare la data ne lo stato dell'evento: la catena «crea un allenamento nel passato, dichiaralo concluso, segna i presenti» produce ore rendicontabili che nessuno ha fatto, e la riga in archivio e indistinguibile da una vera | §7.3 ha chiuso l'appello su `cancelled` e `archived` e ha lasciato `completed` aperto **deliberatamente**: e lo stato in cui un allenamento passato normalmente sta quando si completa l'appello in ritardo. Chiudere questa catena vuol dire decidere due cose insieme — se uno stato si possa dichiarare alla nascita, e se una presenza si possa scrivere su un evento datato nel passato — e la seconda tocca la **rendicontazione dei contributi pubblici**, cioe il dominio `funding`. Va fatto con il proprietario di quel dominio, non dall'area allenatore |
| **PP03-D11** | Cinque handler degli eventi rimandano `error?.message` grezzo (`src/app/api/v1/events/route.ts:85,154` e `src/app/api/v1/events/[id]/route.ts:61,105,141`). Misurato: `POST /api/v1/events {"capacity":2147483648}` risponde 400 con l'invocazione Prisma per intero — nome del modello, nome del metodo, forma dell'errore. `publicErrorMessage` (`src/lib/server/api-errors.ts`) esiste ed e usato in un centinaio di punti di `src/app/api/v1/`; su queste cinque no | E la stessa classe di §7.6, gia chiusa dentro `events.ts` dove l'errore nasce. Qui il difetto e nella **rotta**, e la correzione giusta non e infilare `publicErrorMessage` in cinque punti: e capire perche cento rotte lo usano e queste no, cioe se la rotta generica debba imporlo. Nel frattempo non esce nessun dato di club — esce la forma dell'ORM |
| **PP03-D12** | `assertEventoAperto` legge lo stato dell'evento **fuori** dalla transazione che scrive l'appello (`src/lib/server/events.ts`), senza lock sulla riga. Misurato con due sessioni distinte in `Promise.all`: appello 200 **e** annullamento 200, stato finale `cancelled` con una presenza `present` sopra — cioe esattamente lo stato che §7.3 esiste per impedire, raggiunto con due chiamate entrambe legittime. Il controllo ottimistico sul `PATCH` (due versioni uguali → `[200,409]`) e l'`upsert` dell'appello (due appelli opposti → una riga) invece reggono | Aggiungere un lock fra la guardia di stato e la scrittura e una modifica al modo in cui questo dominio apre le transazioni, e va fatta per **tutte** le guardie di stato insieme — non solo per l'appello — altrimenti si sposta la corsa invece di chiuderla. La finestra e stretta e l'esito e un dato incoerente, non un dato che esce |
| **PP03-D13** | `createClubEventsBatch` cicla `inputs` senza tetto (`src/lib/server/events.ts`), e la rotta accetta `{events:[…]}` da chiunque abbia `events.manage`. Misurato: 400 elementi in una richiesta → 200 e 400 righe create. Il modulo dell'allenatore non offre questa forma; la rotta si | Un tetto e una riga, ma il numero giusto non e ovvio: la generazione di un anno di allenamenti ricorrenti passa di qui e puo legittimamente produrre centinaia di righe. Va scelto guardando cosa genera davvero la segreteria, non a occhio |
| **PP03-D14** | `rsvpDeadline` non ha vincoli (`src/lib/events/model.ts`): una scadenza **dopo** l'evento e una scadenza nel **passato** si scrivono entrambe con 200. Sulla prima la conferma non chiude mai, sulla seconda l'RSVP nasce chiuso e nessuna famiglia potra rispondere. E la casella montata da §11.3 nel modulo dell'allenatore | La regola «una scadenza sta prima dell'evento» e del dominio RSVP e vale anche per i due moduli della segreteria, che quella casella ce l'hanno da due Wave: correggerla nel solo modulo nuovo lascerebbe il difetto negli altri due e ne creerebbe un terzo, la divergenza. Va scritta in `src/lib/events/model.ts` accanto alle altre due regole del convertitore, e misurata sui tre moduli |
| **PP03-D15** | `siteId`, `structureId` e `fieldId` di un evento non sono verificati contro il registro del club: `{"siteId":"sede-che-non-esiste"}` e l'identificativo del **club** al posto di quello della sede si scrivono entrambi. Non e una fuga — il perimetro di sede confronta comunque il valore — ma e una colonna di filtro che accetta qualunque stringa | Verificare un riferimento contro il registro e la cosa giusta e va fatta per **tutti** i riferimenti dell'evento insieme, con la stessa forma con cui §15.1 risolve adesso le categorie. Farlo per la sola sede lascerebbe due regole diverse per la stessa domanda |
| **PP03-D16** | Tre superfici dell'area allenatore si aprono e non si possono riempire, ognuna misurata **con il controllo positivo dalla direzione**: (a) «I miei documenti» — `proiettaPersonaPerAllenatore` non ammette `documents`, quindi la scheda che arriva all'allenatore non porta il proprio contratto e la pagina dice «Nessun documento» in ogni club, sempre; (b) «Primaria / Secondaria» e «Categorie secondarie» — le appartenenze di categoria si caricano solo per **filtrare** e non vengono riattaccate alla riga (`resources.ts`), quindi le due colonne restano vuote; (c) il badge «Presenze mancanti» — `saveEventAttendance` scrive `club_event_participants`, `toEventLegacyShape` non compone `attendance`, e `attachEventParticipation` gira solo dentro `trainer-area.ts`: dopo aver salvato l'appello la scheda dell'allenamento resta a `0/N` | Sono tre casi dell'errore n. 8 di [CLAUDE.md §11](../../CLAUDE.md) — codice irraggiungibile, non codice mancante — e nessuno dei tre e un difetto di sicurezza. (a) va deciso insieme al resto di `CAMPI_PERSONA_VISIBILI_ALL_ALLENATORE`, che e un elenco di ammessi e va allargato con criterio; (b) e (c) sono due proiezioni con un proprietario dichiarato, e riattaccare un dato a una riga cambia la forma della risposta per **tutti** i consumatori, mobile compreso |

**Chiuse insieme ai quattro HIGH, e vale la pena dirlo**: la contraffazione della
grafia in **maiuscolo** e con **spazi**, la categoria omonima di un'altra, e il
`PATCH` che spostava il proprio evento sotto la categoria di un altro erano
quattro righe distinte della sonda del round 4 e sono cadute tutte con §15.1 —
perche erano lo stesso difetto detto in quattro modi.

### Il sesto round e il giro conclusivo di PP-03 (2026-09-05)

Il sesto round ha riattaccato le correzioni del quinto e ha trovato **cinque**
difetti, tutti chiusi dentro la lane ([47](47-pp-03-trainer.md) §16 e §17).
Quello che segue e cio che il round ha misurato e che la lane **non** chiude,
piu i due rilievi che vivono fuori dalla sua superficie.

| ID | Cosa | Perche non e stato chiuso qui |
|---|---|---|
| **PP03-D17** | Due chiamanti di `stripClinicalAthleteFields` hanno il ruolo in mano e **non lo passano**, quindi applicano il solo elenco dei **vietati** — la difesa che §15.4 ha smesso di usare perche una colonna JSON libera si vince con un nome inventato. Sono `src/lib/server/data-subject.ts:932` (l'export dell'interessato) e `src/lib/server/form-submissions.ts:1095` e `:2264` (la precompilazione di un modulo). Misurato: un ruolo di club basato su `club_manager` a cui la societa ha **tolto** `clinical.read` riceve dall'export `data.diagnosi`, `data.referto` e il testo libero scritto dentro `guardians`, `clothingSizes`, `categories` e `payments` — cioe cio che il registro generico nega alle stesse chiavi. La terza porta della stessa classe, `auth/athlete-profile`, e stata chiusa da §17.4 | La correzione non e «passare il ruolo», ed e il motivo per cui questa lane si ferma. `data-subject.ts` serve **anche l'interessato e la sua famiglia**, che arrivano con `activeRole` `parent`: passare il ruolo cosi com'e strapperebbe alla famiglia il fascicolo del **proprio** figlio dentro il file che le si consegna — la trappola di §16.2 rifatta su un export. Serve prima l'esenzione «per legame» che `auth/athlete-profile` ha e questi due moduli non hanno, e i diritti dell'interessato hanno un **proprietario dichiarato** ([CLAUDE.md §2](../../CLAUDE.md)). **Nessun allenatore ci arriva**: `data_subject.export` non e fra le chiavi di `trainer` ne di un ruolo che ne deriva — misurato con `roleHasPermission`, non dedotto |
| **PP03-D18** | `club_sites` non e leggibile da un allenatore (`TRAINER_READ_RESOURCES` non lo contiene), eppure la **sede** e uno dei due assi del suo perimetro: la riconosce solo di riflesso, da `data.categoryMemberships[].site_id` sulla riga dell'atleta — che e la ragione per cui quel campo e dovuto entrare nell'elenco di ammessi di §16.2 dopo averlo tolto una volta. Un'area che filtra per sede e non puo leggere il registro delle sedi mostra identificativi dove servirebbero etichette | Non e una falla e non e nato in questa lane: e una scelta di `TRAINER_READ_RESOURCES` che precede PP-03. Allargarla vuol dire decidere se il registro delle sedi sia configurazione del club (come `opening_hours`, negato) o anagrafica di servizio (come `categories`, concesso), e la risposta vale per tutti i ruoli non gestionali insieme, non per il solo allenatore |

**Rilievi fuori dalla superficie di PP-03, registrati perche il verbale li
dichiara fra i coverage gap:** `PP04-D8` (il genitore revocato continua a
leggere e a scrivere l'area famiglia: la strada che tocca `clearLinkedFields` e
una **perdita di dato** — l'indirizzo con cui la segreteria scrive alla
famiglia — e nessuna lane e nella posizione di deciderla da sola) e `PP04-D10`
(il perimetro di sede e categoria **non vale sui byte** dei documenti, quindi un
allenatore recintato scarica l'archivio storico e il **certificato medico** di un
atleta di un'altra categoria). Il secondo e un difetto **del ruolo allenatore**,
ed e il complemento esatto del vincolo che questa lane presidia, preso dall'unica
porta che la lane non ha chiuso: PP-04 e chiusa, il file non e di nessuna lane
viva, e il mandato di questa fase lo assegna all'integrazione.

**Chiuso dal giro conclusivo**: `PP03-D5` era gia stato chiuso dal quinto round
e il sesto lo ha **riaperto da due lati** — la definizione del lettore e la
profondita del taglio — e richiuso entrambi (§16.1, §16.2). Vale la pena
scriverlo: una correzione che regge tre round non e per questo finita, e le due
riaperture non hanno trovato una svista ma la **stessa forma** del difetto
originale, un livello piu sotto.

### Il round 7 di PP-03 (2026-09-05)

| ID | Cosa | Perche non e stato chiuso qui |
|---|---|---|
| **PP03-D19** | `GET /api/athletes/<id>/documents/<documentId>/file` risponde **500** quando `documentId` e l'**identificativo logico** del documento invece del suo `assetId`. La rotta prova prima il ramo dei depositi documentali, che filtra su una colonna `uuid`: `doc-r7-normale` — cioe la grafia che il prodotto stesso scrive dentro `data.sharedDocuments` — fa fallire la query con `invalid input syntax for type uuid` prima che si arrivi al ramo dell'archivio storico. Misurato: succede **anche alla direzione**, quindi non e un perimetro ne un ruolo. E la stessa forma gia riconosciuta su `club_resource_items`, dove un id logico confrontato con una colonna `uuid` non «non trova niente» ma rompe la query | Non esce nessun dato: la porta si chiude sbagliando il codice, non aprendosi. La correzione giusta non e un `try/catch` su questa rotta: e riconoscere che **due identificativi diversi arrivano nello stesso segmento di percorso**, e decidere una volta per tutte se il ramo dei depositi debba filtrare solo su valori che sono UUID — che e la forma gia scelta per `club_resource_items` — oppure se le due porte vadano separate. Vale per tutte le rotte che accettano l'una o l'altra grafia, non per questa sola |

**Misura aggiornata di `PP04-D10`, che questa lane dichiara e non corregge.**
Il registro di PP-04 scriveva che un allenatore recintato scarica «l'archivio
storico **e il certificato medico**» di un atleta di un'altra categoria.
Misurato adesso con due attori — un allenatore base con perimetro in
`clubs.trainers` e un ruolo di club con due righe di `club_access_scopes` in AND
(categoria **e** sede) — il fatto e piu stretto e va scritto per intero:

```
GET /api/athletes/<atleta fuori recinto>/documents/<assetId>/file
  documento NON clinico     200, byte consegnati     <-- esce, per entrambi
  certificato medico        403                      <-- fermato, per entrambi
```

Il **certificato medico non esce**: lo ferma la guardia clinica che PP-03 ha
messo su entrambi i rami della rotta ([47](47-pp-03-trainer.md) §6.2). Esce il
documento **non clinico** — contratti, documenti d'identita, moduli firmati di
un minore di un'altra squadra — perche il perimetro di sede e categoria non
scende sui **byte** dell'archivio storico. Resta un difetto **del ruolo
allenatore**, ed e il complemento esatto del vincolo che PP-03 presidia: dove la
lane ha chiuso il contenuto clinico su sette porte, resta aperta la sola porta in
cui il confine non e clinico ma di perimetro. Assegnato all'integrazione.
## Debito aperto da PP-04, non toccato perche fuori scope (2026-09-04)

Trovato attaccando l'area atleta con
[`scripts/pp-04-atleta-probe.mjs`](../../scripts/pp-04-atleta-probe.mjs).
Registrato anche come dependency verso PP-03.

| # | Cosa | Perche non e stato corretto li |
|---|---|---|
| **PP04-D1** | Lo sweep `unlinkDirectAthleteProfile` (`src/lib/server/profile-account-links.ts`) decide se azzerare `athletes.user_id` guardando **lo slug** della tessera: `ATHLETE_ROLES = {athlete, atleta, player}`. Da quell'insieme mancano `giocatore` e `giocatrice`, che `ROLE_ALIASES` di `access-roles.ts` riconosce come atleta. Lo stesso vale per `PARENT_ROLES`, `TRAINER_ROLES`, `STAFF_ROLES`. Esito: una revoca di tessera puo lasciare il legame dangling in archivio | `profile-account-links.ts` e chiamato da `club-roles.ts`, che nella spartizione parallela e di **PP-03**. ADR-0114 chiude la porta a valle — l'area atleta non si apre piu — ma non ripulisce le righe, e ogni altro lettore che si fidi del solo legame resta esposto |
| **PP04-D2** | `assignClubRole` (`src/lib/server/club-roles.ts`) cancella le tessere sostituite con `organizationUser.delete` e `reason: "replaced_by_new_role"` **senza chiamare nessuno sweep**: cambiare ruolo a una persona lascia dietro tutti i suoi legami di profilo (atleta, tutore, allenatore, staff). E la strada piu raggiungibile del difetto sopra, perche non richiede nessuna configurazione insolita | Stesso proprietario, stessa ragione. La correzione naturale e chiamare gli stessi sweep di `revokeClubAccess` sul ramo `for (const vecchia of altre)` |
| **PP04-D3** | **Non esiste nessuna policy di club che regoli cosa l'atleta vede.** Verificato: `clubs.settings` non porta nessuna chiave a tema (`athletePortal`, `visibility`, `policy`, `selfService` non esistono), e non c'e nessuna schermata da cui configurarla. Il mandato PP-04 chiede che le **presenze** siano visibili all'atleta «solo se la policy del club lo consente» | Introdurre la policy vuol dire: una chiave in `clubs.settings`, un percorso di scrittura, **e una schermata da cui accenderla**. Senza la terza, sarebbe esattamente il difetto che CLAUDE.md §11.8 chiama codice irraggiungibile. E una funzione nuova con il suo WP, non un ritocco dentro una lane di stabilizzazione. Nel frattempo vale l'invariante che conta ed e presidiata: l'atleta vede **solo le proprie** presenze (sonda P-17) |
| **PP04-D4** | `athlete` non e fra i `CUSTOM_ROLE_BASE_ROLES` (`club_manager`, `collaborator`, `staff`, `trainer`): un club **non puo** creare un ruolo di atleta ristretto, per esempio un «Atleta Under 12» senza accesso ai documenti | E un limite di prodotto, non un difetto, e allargare l'insieme dei ruoli clonabili e una decisione di `src/lib/roles/` — dominio di PP-03. Registrato perche la domanda «perche non posso?» arriva dalla segreteria e finora non aveva risposta scritta |
| **PP04-D5** | **Un atleta maggiorenne non ha una strada per gestire da se quote e consensi.** ADR-0118 chiude il cruscotto di famiglia al legame diretto, perche da li uscivano denaro, tutori e contenuto clinico a un soggetto che e tipicamente un minore. L'area atleta, per progetto, quelle cose non le mostra | Non e una regressione: l'area famiglia pretendeva gia il ruolo `parent` per essere aperta dal browser, quindi la strada non c'era nemmeno prima. Ma e una funzione mancante, e la sua forma giusta non e un'eccezione nel gate — e una superficie dell'area atleta che mostri **le proprie** quote e i **propri** consensi con la sua proiezione, cioe un WP |
| **PP04-D6** | **`athletes.user_id` ha due letture nel repository.** Per `athlete-accounts.ts` e l'account **dell'atleta** (ADR-0104); per il ramo diretto di `parent-dashboard.ts` era, di fatto, «l'utenza a cui questa scheda appartiene», ed e cosi che tre file di fixture lo usavano per modellare un genitore. ADR-0117 sceglie la prima lettura e la rende vera in tutti e due i lettori | La seconda lettura non ha piu nessuno scrittore — l'unico e `acceptAthleteAccountInvite`, che scrive legame **e** tessera insieme — quindi la scelta e senza rischio sui dati veri. Resta da verificare, prima dell'integrazione con PP-02, che nessuna installazione porti righe scritte dalla vecchia falla dell'`upsert` di `resources.ts` |
| **PP04-D7** | **Un tutore senza nessuna tessera nel club non vede niente**, malgrado tre commenti del dominio dichiarino il contrario («un tutore puo legittimamente non avere nessuna appartenenza»). `getParentLinkedAthletes` cerca gli atleti candidati con `OR: [{ user_id }, { organization_id: { in: <i club in cui ho una tessera o che ho fondato> } }]`: per una persona senza tessere quell'elenco e vuoto, quindi nessun atleta e candidato e il ramo del tutore non viene nemmeno valutato. Misurato in PP-04 costruendo la sonda P-76 | **Preesistente a PP-04 e fuori dal suo Critical**: nella vita vera il riscatto del token genitore scrive la tessera `parent` insieme a `guardians[].linkedUserId`, quindi il caso si presenta solo per un tutore inserito a mano dalla segreteria e mai invitato. La correzione sta in `parent-dashboard.ts`, che nella spartizione parallela e conteso con **PP-02**: va fatta in integrazione, non dentro questa lane. Nel frattempo le fixture e le sonde modellano il tutore **con** la sua tessera, che e lo stato che il prodotto produce |
| **PP04-D8** | **La revoca dell'accesso di un genitore non revoca niente, se al genitore resta una tessera qualunque nel club.** `clearLinkedFields` (`src/lib/server/profile-account-links.ts`) riconosce il legame **anche per email** (`isLinkedToTarget` legge `record?.email`) e poi ripulisce `linkedUserId`, `linked_user_id`, `linkedUserEmail`, `linked_user_email`, `linkedAt` — **e non tocca `email`**, che e esattamente il campo su cui `isGuardianLinkedToUser` (`parent-dashboard.ts`) ricade. La spazzata di ADR-0110 toglie quindi il riferimento che non concedeva l'accesso e lascia quello che lo concede. Misurato contro PostgreSQL: un padre che e **anche allenatore** del club, revocato da Gestione Accessi, continua a leggere del minore quote, ricevute, diagnosi, `file_url` del certificato, allergie, note mediche e codice fiscale del tutore, **e a scrivere** (`PATCH .../notifications` -> `{"updated":1}`). Con la sola tessera `parent` la porta si chiude, ma non per la guardia: perche i candidati di `getParentLinkedAthletes` sono gli atleti dei club in cui la persona ha una tessera | **Preesistente a PP-04, e in dominio altrui**: `profile-account-links.ts` e di **PP-03**, l'area famiglia di **PP-02**. Nessuna riga di PP-04 lo causa o lo aggrava; ADR-0123 chiude la forma **atleta** dello stesso ramo, non quella genitore. Non e correggibile dal lato del lettore: un tutore revocato e un tutore mai collegato hanno la **stessa** riga in archivio — `linkedUserId: null` piu `email` — e distinguerli richiede una scrittura, quindi una decisione di quel dominio. Le due strade sono: azzerare anche `email` nella spazzata (si perde l'indirizzo di contatto della famiglia), oppure promuovere il legame per indirizzo a `linkedUserId` una volta sola, con una migrazione, cosi che esista **un solo campo revocabile**. Riproduzione registrata in `deps/PP-04-DEPENDENCIES.md` |
| **PP04-D9** | **Lo sweep dei legami riconosce lo slug, e il pannello «Accesso EasyGame» ne mente.** E la forma misurata di PP04-D1: revocata da Gestione Accessi la tessera di un atleta con lo slug `giocatrice` (alias legittimo in `ROLE_ALIASES`) o con un ruolo personalizzato basato su `athlete`, `unlinkDirectAthleteProfile` non azzera `athletes.user_id`. Le **letture** restano chiuse (ADR-0114/0117: nessuna tessera, nessuna area), ma `readAthleteAccountState` deriva `active` dal legame superstite e la scheda va in **vicolo cieco**: il club non puo piu invitare nessuno su quell'atleta perche la rotta risponde «ha gia un accesso attivo» | Stesso proprietario di PP04-D1 (**PP-03**). La correzione e una riga: `normalizeAccessRole(custom_role?.base_role ?? role) === "athlete"`, cioe il vocabolario che `revokeAthleteAccess` gia usa in `athlete-accounts.ts`. Aggiramento per la segreteria nel frattempo: usare «Revoca l'accesso» dal pannello dell'atleta, che gli alias li conosce |
| **PP04-D10** | **Il perimetro di sede e categoria non vale sui byte, ne sulla stampa di una ricevuta.** Misurato dal quarto round ostile di PP-04 (`scripts/pp-04-perimetro-byte-probe.mjs`, M-4/M-5/M-6/R-3) contro PostgreSQL e le rotte vere. L'elenco dei documenti e chiuso — `getDocumentDossier` chiama `assertSubjectWithinAccessScope` — ma `GET /api/athletes/[athleteId]/documents/[documentId]/file` non chiama mai `athleteWithinAccessScope`: un `club_manager` o un `trainer` recintato su una categoria scarica i byte dell'archivio storico e del **certificato medico** di un atleta di un'altra categoria. Stessa cosa su `GET /api/v1/documents/[kind]/[id]`, che stampa ricevuta e fattura senza guardare il perimetro — malgrado il registro generico lo applichi gia sulle stesse tabelle (`resources.ts`, `PER_ATLETA`). **High**: nessuna fuga fra club, serve una tessera di staff recintata e la conoscenza dell'identificativo; atleta e genitore restano chiusi | **Nessuna delle tre lane** possiede questi due file di rotta (contratto parallelo: `documents*`/`attachments` sono dependency per tutte e tre). Preesistente: i file sono byte-identici alla base `0d66921`. Contratto: una sola chiamata a `athleteWithinAccessScope(club, atleta, scope)` **prima del bivio** dei due rami nella rotta dei byte, e una sul solo ramo di ruolo (`!perLegame`) nella rotta fiscale, chiusa anche su `athlete_id` vuoto. Il legame di famiglia **non** si perimetra |
| **PP04-D11** | **Un diniego di perimetro esce come 500.** Stessa sonda, M-3: `assertAttachmentWithinAccessScope` solleva correttamente «Accesso negato» e i byte non escono, ma il `catch` finale di `GET /api/athletes/[athleteId]/documents/[documentId]/file` risponde 500 a qualunque errore, con il messaggio grezzo nel corpo. Contro CLAUDE.md §8, che su quella stringa fonda il 403. Nessuna perdita di dati: **Low** | Stesso file e stesso proprietario di PP04-D10. Va corretto **anche** applicando D10, perche altre guardie a valle sollevano la stessa stringa |

| **PP04-D12** | **I nomi dell'identita di un tutore sono quattro da una parte e due dall'altra, e la guardia in scrittura sta dal lato cieco.** `getGuardianRows` (`src/lib/server/parent-dashboard.ts`) normalizza ogni riga e collassa l'identita su **due** soli nomi (`linkedUserId`, `linked_user_id`); `guardianAccessIdentities`, `isGuardianLinkedToUser` e `isGuardianLinkedById` leggono `userId`/`user_id` su righe **gia normalizzate**, dove quelle chiavi non esistono piu: sono codice morto. Ma `src/lib/athlete-guardians.ts` legge le righe **grezze** e risolve tutti e quattro i nomi, e `buildAudienceContacts` (`src/lib/server/audience.ts`) ne fa un destinatario. Esito misurato contro PostgreSQL: un ruolo personalizzato su base `club_manager` **senza** `clinical.read` scrive `guardians[].userId = <la propria utenza>` dalla rotta generica e **non viene fermato** (`linkedUserId` e `linked_user_id` danno 403, `userId` e `user_id` danno 200), diventando in silenzio e senza audit **destinatario delle comunicazioni e dei solleciti di pagamento** di quella famiglia. **Medium** e non piu: `canParentAccessAthlete` resta `false`, il cruscotto di famiglia risponde 403 e nessun segreto esce — quote, ricevute, codice fiscale dei tutori, diagnosi e `file_url` restano dentro | **Preesistente e in file che nessuna lane possiede**: `athlete-guardians.ts`, `audience.ts` e `resources.ts` sono byte-identici alla base `0d66921`, e alla base `guardianAccessIdentities` portava gia quattro nomi mentre `getGuardianRows` ne portava due. Nessuna riga di PP-04 lo causa. La correzione e **una riga** in `getGuardianRows` (estendere la normalizzazione ai quattro nomi), verificata per mutazione nei due versi: estesa, tutte e quattro le scritture tornano 403; neutralizzata invece la guardia di crescita di `resources.ts`, anche `linkedUserId` passa e `canParentAccessAthlete` diventa `true` — il che dimostra che quella guardia e reale ed efficace **sui due nomi che oggi contano**. Stessa categoria di PP04-D10/D11: lavoro di integrazione |
| **PP04-D13** | **ADR-0124 annuncia una difesa in profondita che non c'e.** `isGuardianLinkedById` dichiara di riconoscere quattro nomi, ma due non possono mai arrivargli, per la ragione di PP04-D12. Nessun impatto sul comportamento di oggi; l'impatto e su chi legge quel commento e crede che la difesa esista. **Low** | Da correggere insieme a PP04-D12, o da dichiarare esplicitamente nel testo dell'ADR. La domanda che il round conclusivo si e posta ha comunque risposta rassicurante: **ADR-0124 non e un'escalation**, perche il ramo del tutore provato si apre solo con `linkedUserId`/`linked_user_id`, cioe precisamente i due nomi che la guardia di `resources.ts` copre |
### Nota del round conclusivo di PP-04 (2026-09-05, ADR-0125)

Due voci qui sopra hanno una **conseguenza sulle letture** che il round
conclusivo ha misurato e **chiuso dal lato del lettore**, senza toccarne la
causa.

- **PP04-D9** (e la sua radice **PP04-D1**) — il legame che sopravvive alla
  revoca di una tessera con lo slug non canonico non apriva solo il pannello
  «Accesso EasyGame»: apriva anche
  `GET /api/v1/auth/athlete-profile/:athleteId`, che ricavava
  `directAthleteAccess` dal **solo** `athletes.user_id`. Con zero tessere nel
  club uscivano allergie, note mediche e i certificati interi.
- **PP04-D6** — la seconda lettura storica dello stesso campo («l'utenza a cui
  questa scheda appartiene») rende quel 200 il fascicolo di **un'altra
  persona**: misurato con un legame ereditato, ne uscivano anche il codice
  fiscale del tutore di un minore.

ADR-0125 aggiunge `clubsWhereStillAthlete` al terzo lettore. **Le righe
dangling restano**, e restano di **PP-03**: qui si chiude chi legge, non chi
scrive. Riproduzione: `scripts/pp-04-round-conclusivo-probe.mjs`, R-82 e R-84.

**PP04-D11 resta aperto, ed e una scelta.** Correggere da qui il solo codice
di stato (500 -> 403) su
`GET /api/athletes/[athleteId]/documents/[documentId]/file` costerebbe due
righe, ma metterebbe le impronte di PP-04 su un file che il contratto parallelo
non assegna a nessuna lane e su cui **PP04-D10** — la guardia di perimetro che
manca davvero, con i byte del certificato medico che escono — deve ancora
atterrare. Le due correzioni vanno insieme: la mappatura del `catch` serve
proprio perche la guardia nuova solleva «Accesso negato», e separarle
produrrebbe prima un file che risponde 403 per una guardia che non c'e, e poi
un conflitto d'integrazione su un file conteso.
## Debito aperto da PP-02 (2026-09-04)

Trovato mentre si riproducevano i difetti di
[43 — PP-02](43-pp-02-area-famiglia.md). Ogni voce dice **perche** non e stata
chiusa li.

| # | Cosa | Perche non e stato corretto li |
|---|---|---|
| **PP02-D1** | `findClubsWhereUserIsGuardian` (`src/lib/server/parent-dashboard.ts`) e una **scansione di `athletes`**: la domanda «in quali club questa persona compare come tutore» attraversa un array JSON con una funzione per riga, e una funzione per riga non e indicizzabile. Costa una scansione per ogni lettura dell'area famiglia | La chiusura vera non e un indice: e **materializzare il legame** in una tabella con la sua chiave esterna, cioe togliere il tutore da `athletes.data.guardians`. E una migrazione che tocca cinque letture diverse dello stesso campo (SOLL-02) e il proprietario del dominio: un WP, non una riga dentro una lane di correzioni. Fino ad allora il costo lo pagano solo le famiglie, una volta per lettura, e restituisce poche righe |
| **PP02-D2** | **L'indirizzo di contatto di un tutore non apre un club in cui non ha gia una tessera**, ed e una **decisione**, non un difetto ([ADR-0127](18-decision-log.md#adr-0127--il-legame-di-un-tutore-non-e-la-sua-tessera-il-suo-indirizzo-non-e-un-legame-che-apre-da-solo)). Resta pero il fatto che la KB descrive quel percorso come il modo in cui «una famiglia entra senza riscattare un codice», e in un club nuovo quel modo **non funziona**: la segreteria scrive l'indirizzo, la famiglia si registra, e non trova nessun figlio finche non riceve un invito | Allargarlo capovolge una proprieta di sicurezza che la Wave 5 ha chiuso per nome — «un atleta di un altro club non e un figlio» — e con essa il rischio che un refuso su un dominio diffuso consegni a uno sconosciuto il fascicolo sanitario di un minore. **E una scelta del proprietario del prodotto**, e va fatta insieme al percorso di invito, non al posto suo |
| **PP02-D3** | La prenotazione di una struttura da parte della famiglia vive in `clubs.structures[].bookings`, un array JSON: nessuna riga, nessuna versione, nessun controllo di concorrenza. Due famiglie che prenotano lo stesso campo nello stesso istante si sovrascrivono, e il conflitto lo cerca un `filter` in memoria | E la stessa famiglia di D2 (doppia rappresentazione dei dati di club) e la stessa che ADR-0098 ha chiuso per gli eventi e ADR-0101 per gli appuntamenti. La chiusura e una tabella `structure_bookings` con l'indice unico parziale: un WP con la sua migrazione. PP-02 ha ristretto la finestra rileggendo dentro la transazione, e lo dichiara: **non e un controllo di concorrenza** |
| **PP02-D4** | Il **prezzo** non entra nella prenotazione della famiglia: le tariffe del campo si vedono, ma la richiesta salvata non porta nessun importo (`booking.amount` resta indefinito), e nessun incasso nasce da li | Legare la prenotazione al denaro vuol dire farla passare da `payment_transactions`, che e il proprietario del dominio: e una capability nuova, non una correzione. Finche non c'e, le tariffe restano un'informazione e la richiesta un impegno che la segreteria incassa come crede |
| **PP02-D5** | La **disponibilita di un campo** si legge nel fuso `Europe/Rome`, dichiarato come costante: le strutture non portano un proprio fuso e il club non lo configura | Per ogni club italiano e corretto, ed e lo stesso ripiego che il dominio degli appuntamenti dichiara da sempre (`DEFAULT_APPOINTMENT_TIMEZONE`). Renderlo configurabile e una decisione di prodotto — e va fatta **insieme** per appuntamenti e strutture, non su una superficie sola |
| **PP02-D7** | `normalizeAvailability` esiste **due volte**: in `src/lib/structures-utils.ts` (il dominio) e in `src/app/structures/page.tsx`, con lo stesso corpo. PP-02 ha dovuto togliere i ripieghi `18:00`/`22:00` da **entrambe**, perche una schermata che mostra una fascia che il server non applica e una schermata che mente | Fondere le due tocca la pagina delle strutture del club, che PP-02 non doveva modificare: e una pulizia con il suo commit. Fino ad allora ogni cambiamento al dominio va replicato a mano, e questa riga esiste per ricordarlo |
| **PP02-D6** | I **tipi di appuntamento** sono configurazione in `clubs.settings.appointments`, e un appuntamento gia preso porta il **nome** del motivo, non un riferimento. Rinominare un tipo non riscrive la storia — che e voluto — ma vuol dire che «quanti colloqui abbiamo fatto quest'anno» si risponde per stringa | Un riferimento stabile richiederebbe una tabella e una migrazione, e con essa la domanda su cosa fare degli appuntamenti storici. Per un elenco di cinque voci che il club scrive per se, il nome basta e il costo no |
| **PP02-D8** | Non c'e **rate limit** sulle rotte di famiglia: il limitatore di questo repository copre `api/public/**` e due rotte admin. Una famiglia autenticata puo ripetere una richiesta di prenotazione senza tetto, e ogni richiesta fa un read-modify-write dell'intero array `clubs.structures` — la colonna che ogni pagina del club rilegge | Il terzo round lo ha nominato accanto al difetto della durata illimitata, che **e** stato chiuso (tetto di un giorno, rifiuto del passato): con quello chiuso resta il volume, non piu la singola riga assurda. Un limitatore sulle rotte autenticate e una scelta trasversale — riguarda tutte le famiglie di rotte, non l'area famiglia — e va fatta una volta sola, non qui |
| **PP02-D9** | `saveAppointmentsConfig` legge `clubs.settings`, cambia una chiave e riscrive, **fuori da una transazione**. Una scrittura concorrente su un'altra chiave dello stesso oggetto — stagioni, configurazione fiscale — fatta da un'altra schermata nella stessa finestra viene persa | E la stessa famiglia di D3 e della doppia rappresentazione: `settings` e un oggetto JSON con molti proprietari e nessun controllo di versione. La chiusura non e una transazione in piu qui, e dare a ogni dominio la sua colonna o la sua tabella. La sonda P-108 prova la sequenzialita, e va detto che **non** prova la concorrenza |
| **PP02-D10** | Il legame di un tutore si **ricalcola** due o tre volte per richiesta, e ogni volta scandisce `athletes` di tutta la piattaforma. Su `/consents` sono tre letture (rotta, scope, dominio), su `/documents` due, sul cruscotto due | E il costo di D1 moltiplicato: la chiusura vera resta materializzare il legame in una tabella con la sua chiave esterna, e finche `athletes.data.guardians` e un array JSON ogni chiamante che chiede «e suo figlio?» paga una scansione. Una memoizzazione per richiesta la ridurrebbe a una, ed e un WP con la sua misura — non una riga dentro una lane di correzioni |
| **PP02-D11** | Una prenotazione di struttura chiesta dalla famiglia si conferma o si rifiuta **solo** dalla scheda della singola struttura (`/structures/[id]`): la schermata che le elenca mostra un contatore e nient'altro, e il modello delle notifiche non ha un campo per il collegamento | Il flusso e completo — la riga si scrive, il club la puo cambiare di stato — ma la strada per arrivarci non e disegnata. Il settimo round lo ha segnalato come funzione incompleta, e in parte lo e: `pending` **blocca** lo slot, quindi una richiesta che nessuno trova tiene occupato un campo. PP-02 ha messo il percorso in `data.link` e lo ha nominato nel testo dell'avviso; renderlo cliccabile vuol dire toccare il modello delle notifiche, che ha molti scrittori |
| **PP02-D12** | Il doppio di Prisma non implementa i filtri di **relazione** (`some`/`every`/`none`, `is`/`isNot`): cadono nel ripiego «condizione non supportata, quindi soddisfatta» | Tre operatori sono stati aggiunti durante PP-02 dopo altrettanti round (`array_contains`, `isEmpty`, piu `has`/`hasSome` gia presenti), ma i filtri di relazione sono un'altra classe e richiedono al doppio di sapere unire due collezioni. Le proprieta che ci si appoggiano — il perimetro di sede e categoria — sono gia provate contro PostgreSQL vero, e il test di PP-01 lo dichiara per esteso. Il rischio non e teorico: e che qualcuno domani scriva un test **nuovo** su un filtro di relazione e lo veda verde per il motivo sbagliato |
| **PP02-D13** | Due righe tutore **senza identificativo** allo stesso indirizzo non sono distinguibili: revocarne una revoca l'indirizzo, e quindi anche l'altra | Non e un difetto della revoca, e il limite del dato — li l'indirizzo **e** l'identita. Si chiude solo dando a ogni riga un identificativo stabile, cioe materializzando i tutori in una tabella (vedi **PP02-D1** e **PP02-D10**). Finche l'anagrafica e un array JSON, la configurazione ADR-0127 pura (indirizzo scritto dalla segreteria, nessun codice riscattato) su due genitori allo stesso indirizzo si comporta come una persona sola |
| **PP02-D14** | «Quale indirizzo e di questo tutore» ha due ordini di lettura: il vaglio dell'accesso legge `linkedUserEmail → linked_user_email → email`, i due canali di invio leggono `email → linkedUserEmail → linked_user_email` | Oggi e inerte, perche il vaglio della revoca guarda **tutte e sette** le grafie e l'indirizzo scelto viene comunque azzerato se e revocato: nessuna combinazione misurata fa uscire un indirizzo che non doveva uscire. Allinearli pero **sposta la posta** delle righe che portano entrambi i campi con valori diversi — dall'indirizzo di famiglia a quello dell'account — e non e un cambiamento da fare dentro una lane di correzioni di sicurezza. E la stessa asimmetria che questo pacchetto ha gia pagato tre volte, quindi va chiusa con una decisione esplicita su **quale** dei due sia il recapito |
| **PP02-D15** | Il ramo che **aggiorna** un tutore esistente all'approvazione di un modulo non marca `contactOnly`, per scelta dichiarata (non si declassa una riga che il club aveva scritto). Il verso opposto non e dichiarato: una compilazione **anonima** che la segreteria associa a un tutore esistente puo sostituirne l'`email`, che e una chiave dell'area famiglia, senza che la riga porti alcun segno | C'e una persona nel mezzo che approva, e vede «Genitore aggiornato»: non e una scrittura automatica. Ma quella schermata non dice che sta consegnando un accesso, e chi approva non ha modo di saperlo. La chiusura non e un marchio in piu — declassare la riga riaprirebbe il difetto per cui la regola esiste — e un avviso nella schermata di approvazione quando il modulo **cambia l'indirizzo** di un tutore gia collegato |
| **PP02-D16** | `tests/ui/pp-02-superfici.test.mjs` (28 test), `responsive-invariants.test.mjs` (36) e `area-famiglia-wave6.test.mjs` (14) provano il comportamento dei componenti con `readFileSync` + `includes`: **zero import**. Misurato al quindicesimo round spegnendo tre funzioni e lasciando intatte le stringhe cercate — campanella della famiglia, «Cambia figlio», elenco dei moduli online: **28/28 verdi con tre funzioni morte** | La suite non ha `jsdom` ne `react-dom`, quindi oggi il comportamento di un componente non e **misurabile**. Le proprieta che vivono sul server sono provate dalle sonde contro PostgreSQL; quelle che vivono nel browser non sono provate da nessuno. La chiusura e un motore di rendering nella suite (un WP con la sua misura), non un'asserzione piu furba: un grep piu stretto e piu fragile, non piu vero |
| **PP02-D17** | L'insieme delle identita e allineato al **cancello** ma non ai tre canali di invio: su 96 forme di riga misurate al quindicesimo round, 35 hanno cruscotto aperto e un canale chiuso, e una ha cruscotto chiuso con solleciti e promemoria aperti — e il sollecito porta il **collegamento a gettone per pagare** | Il verso che apre e chiuso (il cancello e piu stretto dei canali in 35 casi su 36, non piu largo). Cio che resta e una **incoerenza**, non un buco: la stessa persona riceve e non vede, o vede e non riceve. La chiusura vera e una lettura sola dei tutori — `guardianDeclaredIds` ne ha unificate due su otto — e vuole toccare quattro moduli con quattro storie diverse: e un WP, non una riga |
| **PP02-D18** | Riconcedere l'accesso a un tutore **dall'anagrafica** (riscrivendogli il legame dichiarato) apre il cruscotto e lascia l'identita nel registro delle revoche: i canali di invio restano chiusi, senza audit e senza niente a schermo | Contraddice «un accesso ridato si ridà per intero», che il riscatto rispetta. Non si chiude togliendo l'identita dal registro in `resources.ts` — li e in **sola lettura** per progetto (ADR-0129), e renderla scrivibile riaprirebbe il difetto per cui quella regola esiste. La strada e una schermata che dica «questa persona e stata revocata: per riattivarla, genera un invito», cioe UI, non un ramo in piu nella rotta generica |
| **PP02-D19** | `saveClubStructures` sostituisce l'array intero da uno snapshot del client: una prenotazione di famiglia accettata mentre la segreteria tiene aperta la pagina delle strutture sparisce, dopo aver risposto 200, scritto l'audit e mandato la notifica | E la classe «ultimo che salva vince» su un blob JSON, la stessa che il conflitto ottimistico chiude altrove nel prodotto. Va chiusa con una versione sulla riga, non con un rattoppo: `clubs.structures` ha piu scrittori e il campo `version` non c'e. Misurato leggendo il chiamante, non con due transazioni concorrenti |
| **PP02-D20** | La ricevuta pubblica anonima elenca **tutte** le richieste documentali aperte del minore, non quelle della pratica che la ricevuta rappresenta | Chi ha il link vede piu di quanto la pagina promette. Non e un IDOR — il link e una credenziale a 32 byte, con impronta SHA-256 e confronto a tempo costante — ma e un perimetro piu largo del necessario, e la correzione vuole legare la richiesta alla pratica, cioe una colonna che oggi non c'e |
| **PP02-D21** | Quattro implementazioni di «quanti atleti sono attesi a un allenamento», con precedenze opposte, e `clubs.trainings` ha **due** scrittori: `training-automation.ts` scrive `prisma.club.update({trainings})` direttamente, contro ADR-0098 | E il denominatore di ogni percentuale di presenza, e cambia fra la creazione (`0/40`), il ricaricamento (`0/12`) e il widget. La causa materiale e il secondo scrittore: finche esiste, allineare le quattro letture non serve. La chiusura e portare quella scrittura dentro `events.ts`, che e un WP con la sua misura |
| **PP02-D22** | Uno sconto **disattivato** continua a scontare, e uno **rinominato** smette in silenzio: ne `resolveSelectedDiscounts` ne `calculateDiscountAmount` guardano `discount.active`, e l'atleta memorizza il **titolo** dello sconto invece dell'id | Misurato: disattivato → sconta ancora 60 EUR; rinominato → il dovuto sale di 60 EUR a tutti gli atleti che lo avevano, senza avviso e senza storico. La chiusura vera e memorizzare l'id — una migrazione dei dati esistenti, non una riga — e va fatta insieme al vaglio su `active`, o disattivare uno sconto diventerebbe un aumento silenzioso |
| **PP02-D23** | Lo sconto si applica **sopra** l'importo scritto a mano: `manuale 300 + sconto 10% → 270` | Un importo negoziato e per definizione gia scontato. Cambiarlo pero sposta i totali di ogni atleta con un importo manuale **e** uno sconto, cioe e una decisione di prodotto con un impatto sui conti gia scritti: va presa dal club, non dentro una lane di correzioni |
| **PP02-D24** | Percentuali di sconto non limitate a 100 (150% su 600 EUR stampa «Sconti −900,00 EUR», e il totale e clampato ma l'etichetta no) e quattro parser di importi di cui uno solo legge le migliaia (`"1.200,00"` → **1,20 EUR** in tre su quattro) | Raggiungibili da API o seed, non dai campi umani (`type="number"`). Sono la stessa classe: piu letture della stessa nozione, e la chiusura e unificarle, non correggerle una per una |
| **PP02-D25** | Il gettone di invito di un tutore porta `guardian_email` e **nessuno lo verifica**: chi ha il codice, chiunque sia, diventa tutore dichiarato di quel minore e la sua eventuale revoca viene azzerata | Il codice si copia negli appunti e il club lo consegna come vuole — a voce, in chat, di persona — quindi legare il riscatto a quell'indirizzo **chiuderebbe fuori** le famiglie che si registrano con un altro indirizzo, che e la configurazione ordinaria di ADR-0127. Le due chiusure possibili sono entrambe decisioni di prodotto: **consegnare** l'invito per email (e allora vincolarlo), oppure dichiarare che il codice e un titolo al portatore e mostrarlo nella schermata che lo genera. Mitigazioni gia in essere: 2^45 di entropia, uso singolo, 10 riscatti/ora per utenza e 30 per indirizzo IP |
| **PP02-D26** | La campanella dell'**area atleta** suona solo per i documenti: dei sette produttori di notifiche, solo `document-requests.ts` risolve i destinatari includendo `athletes.user_id`. Appuntamenti, promemoria del certificato, comunicazioni del club e solleciti passano tutti da `guardians[]` | Un ragazzo con il proprio accesso (ADR-0104) vede l'appuntamento confermato nella sua area e la campanella a zero; quella della madre suona. Non e un buco di sicurezza ma una promessa a meta, e la chiusura tocca quattro risolutori di destinatari con storie diverse: e un WP, non una riga. Il gate non lo vede perche l'area atleta e provata per **proiezione** e per «la rotta risponde», mai per «esiste una notifica per lui» |
| **PP02-D27** | La campanella dell'**allenatore** e tre sorgenti scollegate: il numero conta gli avvisi operativi, il pannello legge la tabella `notifications`, «vedi tutte» torna agli avvisi operativi. Il terzo guscio non passa `onMarkRead` | Nessuna perdita di dati fra utenti (`applyRecipientScope` restringe la lettura generica a `user_id = se stesso oppure nullo`): e un'incoerenza fra badge, pannello e pagina. Va chiusa decidendo **che cosa conta** quella campanella, che e una domanda di prodotto |
| **PP02-D28** | L'etichetta della causale non e congelata sui `payment_transactions`: la colonna `operation_type_label_snapshot` non esiste su quella tabella, e la vista del registro fa `ot.label` in join **vivo** mentre per le altre tre sorgenti fa `COALESCE(snapshot, label)` | Un club che rinomina una causale vede **riscritti retroattivamente** tutti gli incassi passati delle famiglie nel rendiconto per voce: un prospetto stampato a marzo stampa diverso a maggio senza che nessun movimento sia cambiato — cioe il difetto che ADR-0106 esiste per impedire, ancora vivo sulla popolazione di righe piu grande. La chiusura e una colonna piu una migrazione della vista: va fatta con la sua misura, non dentro una lane di correzioni |
| **PP02-D29** | `reverseSettlement` ricalcola ogni storno parziale dal rapporto sull'importo **originale**: un pagamento rimborsato in piu tranche restituisce una commissione diversa da quella trattenuta (misurato: 156 centesimi restituiti contro 155 trattenuti su due rimborsi da 65 EUR; 208 contro 213 su tredici da 10) | La scorciatoia «rimborso pieno» che protegge l'ultimo centesimo non scatta mai quando il rimborso arriva in piu volte — che e l'esempio del modulo stesso. Serve che lo storno sappia **quanto e gia stato stornato**, cioe uno stato che oggi non c'e: e un WP |
| **PP02-D30** | Il perimetro del gruppo operativo di un allenatore vale in **lettura** (`getResourceById`, elenchi) e non in **scrittura**: `updateResource` e `deleteResource` non richiamano `filterTrainerDashboardRecords` | Oggi non e raggiungibile — la rotta generica nega `update` e `delete` al ruolo `trainer` su tutte e cinque le risorse filtrate — ma il commento accanto al filtro promette «lo stesso filtro, non un secondo giudizio», e la meta in scrittura non c'e. Il giorno in cui un ruolo con quel perimetro ottiene la scrittura, entra da li: misurato, un allenatore di Under 12 riscrive l'anagrafica di un atleta di Under 15 e ne cancella il legame della madre |
| **PP02-D31** | `generateInstallmentPreview` produce una rata da **0,00** senza nessun avviso, e le due schermate che la chiamano bloccano il salvataggio solo su `warnings.length > 0`: due rate «a saldo» su un piano da 600 EUR danno `[600, 0]`. Misurato su 200.000 piani casuali: 11.891 con due o piu rate a saldo, 133 con una sola | `roundInstallmentsToFive` e a prova di fuzz (200.000 giri, zero difetti): lo zero nasce **a monte**, da `preserveIndexes` che esclude l'ultimo indice e da un elenco di avvisi che copre solo `percentageTotal > 100` e `fixedTotal > total`. Si indurisce la funzione e il difetto si sposta di un anello: la chiusura e un avviso nuovo — «una rata resterebbe a zero» — piu il vincolo nelle due schermate, cioe una riga di prodotto e non di dominio |
| **PP02-D32** | La coppia storica `parent1`/`parent2` non entra nel riporto delle difese: `resources.ts` legge e riscrive solo `data.guardians`, quindi un marchio `accessRevokedAt` scritto su `parent1` da «Scollega account» sparisce al primo salvataggio dell'anagrafica | L'accesso resta chiuso — il registro delle identita revocate lo tiene, e i quattro lettori di notifiche lo onorano — quindi oggi si perde solo la ridondanza. E la stessa asimmetria che il registro dei soli recapiti ha appena chiuso per l'altra difesa, su un contenitore che il riporto non guarda affatto: la chiusura coerente e portare la coppia storica dentro il riporto, o completare la migrazione verso `guardians` |
| **PP02-D33** | Cinque approvazioni concorrenti di moduli sullo stesso atleta perdono righe tutore: tutte rispondono «Genitore aggiunto», e in anagrafica ne arrivano due o tre. Misurato sei giri su sei prima del blocco di riga | Il blocco introdotto in questo round mette in fila le scritture su `athletes.data`, quindi la corsa non si perde piu **fra** i quattro scrittori che lo prendono. Resta pero che `decideFormSubmission` legge l array dei tutori **prima** della transazione e lo rimanda: due approvazioni serializzate scrivono ognuna il proprio snapshot, e la seconda non vede la riga della prima. La chiusura e leggere i tutori **dentro** il blocco, cioe portare l intera decisione sotto la stessa transazione della scrittura: e un cambio di forma di `eseguiDecisione`, non una riga |
| **PP02-D34** | Lo sweep della revoca non puo avere insieme **correttezza** e **assenza di deadlock**: scegliere le schede fuori dal blocco fa sfuggire quella che acquista il tutore mentre la revoca gira (5 giri su 5); bloccarle tutte con un `FOR UPDATE` sul club chiude quella finestra e va in abbraccio mortale con il rollover di stagione, che prende le stesse righe in ordine di scansione (5 giri su 5, misurato dal log di PostgreSQL) | **Ricaratterizzato al round 28**: la finestra non e «stretta». Misurata dalle due porte vere in parallelo con 20 ms di sfasamento, il tutore revocato legge ancora il secondo figlio **5 giri su 5** sia su un club da 40 tesserati (revoca in 49 ms) sia su uno da 400 (222 ms): la finestra e **l'intera durata dello sweep** e cresce con i tesserati. La scelta fatta resta la meno dannosa, il deadlock fa fallire **ogni** revoca durante un passaggio di stagione, con un messaggio generico e nulla in audit. Non si chiude con una terza stesura del ciclo: si chiude quando la revoca diventa **una riga da aggiornare** invece di un ciclo su un blob — nessuna scansione, nessun blocco per riga, nessun ordine di acquisizione da incrociare |
| **PP02-D35** — **CHIUSO** (WP-A) | I quattro sweep di `revokeClubAccess` decidono se lavorare confrontando `organization_users.role` con quattro **insiemi di letterali** (`profile-account-links.ts:893-896`), mentre il resto del prodotto decide con `normalizeAccessRole`, che di alias ne conosce **36**. Quattordici grafie canoniche — fra cui `tutor`, `giocatore`, `club_manager`, `segreteria` — e **tutte** le forme di slug personalizzato `custom:<base>:<nome>` sono invisibili agli sweep. Misurato dalle porte vere: revoca riuscita, tessera cancellata, audit scritto, e il genitore apre ancora il fascicolo del minore | Non si chiude allungando i quattro elenchi — sarebbe la quinta volta. Si chiude togliendoli: gli sweep chiedono `normalizeAccessRole` e `parseCustomRoleValue`. Vedi [44 — AC-2](44-pp-02-root-cause-analysis.md) |
| **PP02-D36** — **CHIUSO** (WP-A) | `PATCH /api/v1/[resource]/[id]` legge il corpo con `body?.data ?? body`; il `POST` della stessa rotta ha `resolveCreatePayload`, con una euristica scritta apposta per non confondere l'involucro con il contenuto. Su `athletes`, che ha una colonna `data`, un `PATCH` con il corpo non incartato risponde **200 senza scrivere niente**. Nessun client del prodotto e colpito oggi (incartano tutti), ma un salvataggio che *toglie* un tutore diventerebbe un no-op silenzioso | Un corpo, una regola, tre verbi: `resolveCreatePayload` sale in un modulo condiviso dalle due rotte. Vedi [44 — AC-3](44-pp-02-root-cause-analysis.md) |
| **PP02-D37** — **CHIUSO** (WP-A) | **La classe, non il caso.** Tre round consecutivi hanno trovato il difetto piu grave nella stessa forma: una difesa vera e provata che copre **un valore su N** di un'enumerazione ricopiata a mano — un verbo su tre (round 26), una risorsa su due (round 27), una grafia di ruolo su ventidue (round 28). Ogni volta la chiusura e stata allungare l'elenco, e la correzione del round 27 ha introdotto il quinto elenco. Le sonde non lo vedono perche esercitano il valore che chi ha scritto la difesa aveva in mente: la copertura e alta, la **varieta** e bassa | Regola proposta: ogni enumerazione che governa una difesa ha un test che **enumera il dominio canonico** derivandolo dalla fonte unica, e fallisce quando compare un valore non coperto. Vedi [44](44-pp-02-root-cause-analysis.md) |

### WP-A — cosa si e chiuso, e con quale misura (2026-09-05)

Il primo dei quattro interventi di [44 — l'analisi della causa](44-pp-02-root-cause-analysis.md):
AC-2, AC-3 e i due test di totalita che ne discendono
([ADR-0130](18-decision-log.md#adr-0130--una-difesa-che-dipende-da-unenumerazione-ha-un-test-che-enumera-il-dominio)).
Nessuna migrazione, nessun cambio di modello.

| Debito | Esito | Come e stato misurato |
|--------|-------|------------------------|
| **PP02-D35** (R-1, High) | **CHIUSO** | I quattro `Set` di letterali sono spariti da `profile-account-links.ts`: i quattro sweep chiedono `isTrainerAccessRole` / `isManagementAccessRole` / `isParentAccessRole` / `isAthleteAccessRole`, che passano tutti da `normalizeAccessRole` e risolvono percio i 36 alias **e** il ruolo base di uno slug personalizzato. `scripts/pp-02-totalita-ruoli.mjs`: 6/6 su 40 grafie, e **rosso su 23 grafie** riportando la difesa vecchia |
| **PP02-D36** (R-3) | **CHIUSO** | `src/lib/server/resource-request-payload.ts` e l'unico lettore del corpo per i tre verbi. `scripts/pp-02-totalita-corpo.mjs`: 10/10, e **rosso su 22 risorse su 22** riportando la difesa vecchia |
| **PP02-D37** (la classe) | **CHIUSO come regola** | La regola e scritta in ADR-0130 e ha due esecutori veri. Resta aperto il lavoro di **applicarla alle altre enumerazioni** del prodotto: qui sotto |

**Due cose che la misura ha corretto nell'analisi.** Vale la pena scriverle
perche in entrambi i casi il numero della KB era piu ottimista del vero, ed e
la seconda volta in questo perimetro (vedi la nota in coda ad ADR-0129).

- **PP02-D35 diceva «quattordici grafie».** Sono **diciannove**: il vecchio
  `STAFF_ROLES` non conteneva nessuna delle cinque forme di `owner`
  (`owner`, `proprietario`, `proprietaria`, `club_creator`, `club-creator`),
  quindi revocare la tessera di un proprietario **non** scollegava la sua
  scheda staff. Con le quattro forme `custom:` fanno ventitre. Il conteggio
  della RCA era stato dedotto leggendo i due elenchi, non eseguendoli.
- **PP02-D36 era classificato Medium, con la nota «nessun client e colpito
  oggi, incartano tutti».** La sonda dice altro: sulla difesa vecchia,
  **ventidue risorse su ventidue** accettavano un `PATCH` con il corpo non
  incartato, rispondevano **200 e non scrivevano niente**. Non era una
  particolarita di `athletes`: era **qualunque** corpo della forma
  `{ ...campi, data: {...} }` su **qualunque** risorsa — `categories`,
  `club_sites`, `trainers`, `staff_members`, `sponsors`, `payment_plans`,
  `document_templates`, `weekly_schedule` e le altre. La gravita reale e
  perdita di dati silenziosa sull'intera superficie di scrittura generica; era
  stata sottostimata perche dedotta dalla forma del codice invece che
  eseguita.

**Cosa resta aperto di PP02-D37.** La regola ha due esecutori; le enumerazioni
del prodotto sono di piu. Non e stato fatto il censimento delle altre — a
partire da `RISORSE_CHE_SI_MODIFICANO_DA_UN_POSTO_SOLO`, che la RCA nomina
come il quinto elenco scritto a mano e che oggi **non ha** un test che lo
derivi dalle guardie di `updateResource`. E un WP, e va aperto con il suo
censimento.

**Cosa NON chiude WP-A.** `PP02-D33`, `PP02-D34` e la ricaratterizzazione di
R-2 restano intatti: si chiudono solo quando un tutore diventa **una riga**
(AC-1, cioe WP-B/C/D). WP-A e indipendente da quel lavoro e non lo anticipa.

### D-MIG-1 — la storia delle migrazioni non riproduce il modello (scoperto in WP-B, 2026-09-05)

**Come si e visto.** Validando la migrazione di WP-B: creato un database vuoto
e applicato `prisma migrate deploy`, tutte e 55 le migrazioni passano. Ma il
confronto fra il risultato e il modello

```bash
npx prisma migrate diff --from-url <db-vuoto-migrato> \
  --to-schema-datamodel prisma/schema.prisma --script
```

produce **39 istruzioni** di scarto. Nessuna riguarda `athlete_guardians` o
`anonymized_at` — la migrazione nuova produce esattamente il suo pezzo di
modello — ma il resto dello scarto era gia li:

- indici con nomi non canonici, che il modello vorrebbe rinominare
  (`accounting_entries_org_account_date_idx`,
  `club_event_participants_org_athlete_rsvp_idx`,
  `membership_events_org_type_idx`, e altri undici);
- vincoli di chiave esterna con nome proprio scritto a mano
  (`..._conto_dello_stesso_club` su quattro tabelle);
- `DEFAULT` su `id` e `updated_at` presenti nel database e assenti nel modello,
  su una dozzina di tabelle;
- un indice unico su `document_templates_v2` che il modello dichiara e le
  migrazioni non creano.

**Perche conta.** Non e cosmesi. `prisma migrate deploy` gira **a ogni deploy**
(`vercel-build`), e staging e produzione nascono da quella storia. Se lo schema
che la storia produce non e quello che il modello dichiara, allora:

- il client Prisma e generato su un modello che il database non ha esattamente;
- una migrazione futura generata da `prisma migrate dev` conterra anche questo
  scarto accumulato, mescolando la correzione voluta con dodici modifiche non
  volute — che e il modo in cui una migrazione diventa rischiosa senza che
  nessuno l'abbia decisa;
- oggi non si puo dire «lo schema di staging e quello del modello», e nessuno
  se ne accorge finche un indice mancante non diventa una query lenta o un
  vincolo mancante non lascia entrare una riga.

**Come si chiude.** Non dentro una lane di correzioni: e una migrazione di
riconciliazione con la sua misura, che porti la storia a produrre il modello e
riduca lo scarto a zero, piu un gate che lo verifichi (`migrate diff` fra la
storia e il modello deve essere vuoto). Va aperto come WP con il suo censimento
delle 39 istruzioni, decidendo per ognuna se vince il database o il modello.

**Mitigazione oggi**: nessuna necessaria in emergenza — lo scarto e fatto di
nomi e di default, non di colonne mancanti, e il prodotto gira. Ma va sanato
prima che qualcuno generi una migrazione con `prisma migrate dev` su questo
schema.
### D-EV-1 — `club_event_participants.athlete_id` non ha una chiave esterna

`prisma/schema.prisma`, `model ClubEventParticipant`: `athlete_id String` —
senza `@db.Uuid` e **senza relazione**. E una colonna di testo libero, quindi
l'archivio non rifiuta da se un identificativo che non nomina nessun atleta, ne
uno che nomina l'atleta di un altro club.

Oggi la porta e chiusa in applicazione (`assertAtletiDelClub`, KB 14), e le
sonde lo verificano. Ma la difesa e **una sola**, ed e in codice: il giorno in
cui nasce una quinta strada che scrive quella tabella, la difesa va ricordata a
mano. Una chiave esterna verso `athletes(id)` la renderebbe strutturale.

Non si chiude in questa correzione perche va misurato prima **che cosa c'e gia
in archivio**: righe orfane o cross-tenant scritte prima della guardia
farebbero fallire la migrazione. Serve un censimento, una bonifica dichiarata e
poi il vincolo — cioe un WP, non una riga.

### D-EV-2 — il perimetro di categoria dell'allenatore vale sull'evento, non sull'atleta

`assertAtletiDentroIlPerimetro` restringe per sede e categoria **solo** i ruoli
che dichiarano righe in `club_access_scopes`, cioe i ruoli personalizzati
ristretti. Per un `trainer` ordinario il perimetro e verificato
sull'**evento** (`assertTrainerEventPerimeter`: «questo evento e di una tua
categoria?») e non sull'**atleta**.

Conseguenza: un allenatore di Under 12, su un evento che gli compete, puo
convocare o segnare presente **qualunque atleta del club**, anche di categorie
che non allena.

Non e la stessa classe del Critical chiuso oggi — resta dentro il club, quindi
non e una scrittura cross-tenant — e non e ovvio che sia un difetto: la
convocazione fuori categoria e una **capability dichiarata**
(`isExtraCategory`), e un allenatore che prepara un'amichevole con due ragazzi
della categoria sopra sta usando il prodotto come previsto.

Va deciso come **prodotto**, non come sicurezza: se la convocazione fuori
categoria debba restare libera, o richiedere una chiave di permesso propria.
Finche non e deciso, non si stringe: una guardia messa qui per prudenza
romperebbe un uso legittimo, e sarebbe la sesta volta in questo perimetro che
una correzione allarga un predicato senza misurare chi **non** doveva
raggiungere.
### D-RIS-1 — «zero righe di perimetro» significa tutto il club, e non e stato cambiato

`accessScopeAllows` (`src/lib/roles/access-scope.ts`) esce con `true` quando
l'assegnazione non ha righe. E la semantica dichiarata da ADR-0103 — «zero
righe = tutto il club, mai *nessun accesso*» — e vale per **ogni** consumatore
di quel predicato: i filtri di `resources.ts`, il perimetro degli eventi, la
lettura dell'anagrafica.

P0-2 ha reso **esplicito il riscatto** invece di cambiare quel significato: chi
entra da un gettone porta adesso il perimetro del proprio profilo di origine,
mai piu largo di quello di chi ha coniato. La semantica globale e intatta.

**Cosa resta aperto.** Un caso in cui zero righe si scrivono ancora, ed e
voluto perche l'alternativa sarebbe peggio:

- un atleta **senza nessuna appartenenza** — il club non lo ha ancora messo in
  una categoria — riscatta il proprio invito, e la derivazione non trova
  niente. Se anche l'emittente non e recintato, restano zero righe, cioe tutto
  il club. Rifiutare il riscatto bloccherebbe un ragazzo per un dato che la
  segreteria non ha ancora inserito; inventare un recinto vorrebbe dire
  scegliere al posto del club.

La chiusura durevole non e in questo perimetro: e decidere se il modello debba
avere un **terzo stato** — «nessun perimetro dichiarato» distinto da «tutto il
club» — e quella e una modifica che tocca ogni lettore di `accessScopeAllows`.
Va aperta come WP, con il censimento dei consumatori e la loro misura, non
dentro una correzione di sicurezza.

Mitigazione oggi: il ruolo `athlete` limita da se cio che quella persona
raggiunge, perche la sua area nasce dal legame con la propria scheda e non dal
perimetro.

### D-RIS-2 — la rotta pubblica del riscatto dell'atleta non ha un tetto di tentativi

`POST /api/v1/athlete-accounts/accept` e pubblica per progetto — chi apre il
link una sessione non ce l'ha — e **non chiama `consumeRequestRateLimits`**. La
gemella (`/api/v1/auth/access/redeem`) ne ha due, per utenza e per indirizzo.

Il rischio e contenuto: il gettone e opaco di 32 byte, in archivio ne resta il
solo SHA-256, e la risposta e identica per token sconosciuto, scaduto, revocato
o gia usato — quindi non c'e un oracolo da interrogare. Ma e l'unica scrittura
non autenticata di questa forma, e un tetto per indirizzo va messo.

Non e stato messo in P0-2 per non mescolare una modifica di trasporto con una
correzione di perimetro, e perche va scelta la politica: quella del riscatto
generico e per utenza **e** per indirizzo, e qui l'utenza non c'e ancora.

### D-RIS-3 — il riscatto generico non e transazionale

`POST /api/v1/auth/access/redeem` fa in sequenza, senza `$transaction`: crea o
aggiorna la tessera, scrive il perimetro, collega il profilo
(`updateResource`), aggiorna lo stato del gettone, scrive l'audit. Un guasto a
meta lascia stati incoerenti — la tessera concessa e il profilo non collegato,
oppure il gettone consumato e nessuna tessera.

P0-2 ha ridotto la finestra ma non l'ha chiusa: la scrittura del perimetro e
adesso subito dopo la tessera, e un suo rifiuto solleva **prima** che il
gettone venga consumato. Chiuderla davvero vuol dire portare le cinque
scritture sotto la stessa transazione, e `updateResource` non accetta oggi un
client di transazione: e un WP, non una riga.

### PP02-D34 — la misura definitiva della finestra (2026-09-06)

`scripts/pp-02-revoca-atomica.mjs` sostituisce la caratterizzazione del round
28, che era gia una correzione di una precedente e **ancora** non era la misura
giusta.

**Cosa misurava W-79, e perche non bastava.** «La revoca vede anche una scheda
toccata mentre gira»: una taglia di club, **uno** sfasamento. Un istante in cui
la finestra non si apre. La RCA lo chiama per nome: la copertura e alta, la
varieta e bassa.

**Cosa misurava il round 28.** Due porte in parallelo con lo sfasamento fissato
a 20 ms: 5 giri su 5. Meglio, ma sempre **un** punto della finestra.

**Cosa si misura adesso.** Lo sfasamento non si indovina: si **percorre**. La
revoca viene cronometrata, e la scrittura concorrente — il salvataggio
ordinario dell'anagrafica, da `updateResource` — viene inserita a sette
frazioni diverse della sua durata. Su un club di 60 schede con lo stesso
tutore, revoca da **499 ms**:

| sfasamento | la scheda sfugge alla revoca? |
|------------|-------------------------------|
| 0% | no — la scrittura arriva prima che l'elenco sia scelto |
| 10%, 25%, 40%, 55%, 70%, 85% | **si**, tutte |

**Sei sfasamenti su sette.** Non e «una corsa rara» e non e nemmeno «una
finestra stretta»: e **tutta** la scansione tranne il suo primo istante. Su
quelle sei schede il tutore revocato entra ancora — tessera cancellata, audit
scritto, fascicolo del minore aperto.

E la ragione per cui la sonda vive: fino a quando non diventa verde, R-2 e
aperto e **PP-02 non e FINAL**. Diventera verde quando lo sweep smettera di
essere una scansione su un blob e diventera una `UPDATE` sola su
`athlete_guardians` (AC-1, WP-C+D): non c'e piu un elenco scelto prima, quindi
non c'e piu un dopo in cui infilarsi.

---

## PP-02 / WP-C+D — cosa si chiude quando un tutore diventa una riga (2026-09-06)

Il travaso di WP-B aveva creato la tabella e non l'aveva resa autorevole: nessun
codice di prodotto la leggeva o la scriveva. WP-C+D sposta l'autorita, e con lei
cadono cinque voci di questo registro — non perche siano state corrette una per
una, ma perche la forma da cui nascevano non c'e piu.

| Debito | Stato | Cosa lo chiude, e come si e misurato |
|---|---|---|
| **R-2** (High) | **CHIUSO** | La revoca di una tessera era un ciclo su ogni tesserato del club: ~840 ms su un club da 60 atleti, e la scheda che acquistava il tutore mentre girava sfuggiva a **7 sfasamenti su 7**. Adesso e una `UPDATE` con un `WHERE` su un indice: ~84 ms, **0 su 7**. `scripts/pp-02-revoca-atomica.mjs`, che percorre la finestra invece di indovinare uno sfasamento |
| **PP02-D34** | **CHIUSO** | Le due proprieta che «non si ottenevano insieme» — nessuna scheda sfugge, e nessun abbraccio mortale con il passaggio di stagione — adesso si ottengono tutte e due, e non per un compromesso migliore: non c'e piu una scansione da cui la finestra nasca, ne un elenco su cui prendere blocchi in un ordine da incrociare con quello del rollover. Cade anche il tetto oltre il quale la transazione scadeva, perche il costo non cresce piu con i tesserati del club |
| **PP02-D33** | **CHIUSO** | Cinque approvazioni concorrenti di moduli sullo stesso atleta perdevano righe tutore, 6 giri su 6. La causa era che `decideFormSubmission` leggeva l'array **prima** della transazione e lo rimandava: due decisioni serializzate scrivevano ognuna il proprio snapshot. Adesso l'elenco non si legge affatto — e una `upsert` su `(athlete_id, identity_key)` — quindi non c'e uno snapshot da rimandare. **Si chiude perche la domanda non si pone piu**, non perche sia stata messa una serratura piu grossa |
| **PP02-D1** | **CHIUSO** | «La chiusura vera e materializzare il legame in una tabella con la sua chiave esterna». La ricerca dei figli di un tutore era una scansione di `athletes` in SQL grezzo dentro un array JSON — non indicizzabile, e con un `catch` largo che la faceva degradare **in silenzio** a «nessun club» per tutte le famiglie del sistema. Adesso e una interrogazione su `(organization_id, user_id)` piu un indice sull'indirizzo |
| **PP02-D13** | **RIDIMENSIONATO** | «Due righe senza identificativo allo stesso indirizzo non sono distinguibili nemmeno in principio». Resta vero come enunciato, e smette di essere un rischio: una riga senza utenza e senza indirizzo riceve adesso una chiave **sua** (`riga:<identificativo>`), coniata insieme alla riga, quindi due sconosciuti diversi non collassano piu in uno |

### Cosa questo lavoro **non** chiude, e va detto

| Debito | Stato | Perche resta |
|---|---|---|
| **PP02-D38** (nuovo, Low) | **APERTO** | `athletes.data.parents`, `.tutors`, `.tutori` sono **dato morto**: un censimento indipendente dei lettori non ne ha trovato **nessuno** in tutto `src/`, e il travaso non li legge — leggerli inventerebbe legami che nessun predicato riconosceva, ed e uno dei quattro difetti che la sonda del travaso ha misurato. Restano in archivio perche cancellare un dato senza bisogno e un'altra classe di errore. Vanno tolti con una migrazione dedicata, dopo aver contato quante schede li portino |
| **PP02-D39** (nuovo, Medium) | **APERTO** | La finestra dichiarata da ADR-0135: scrivere oggi l'indirizzo di un'utenza che **nascera domani** produce il legame senza passare dal vaglio dei due permessi. Chiuderla vorrebbe dire negare la correzione di un refuso in un'email, che e il lavoro di tutti i giorni di una segreteria — e il difetto che due stesure precedenti hanno gia pagato. Si chiude con un vaglio al momento della **registrazione** dell'utenza, non a quello della scrittura dell'indirizzo |
| **PP02-D40** (nuovo, Medium) | **APERTO** | La **proiezione** `athletes.data.guardians[]` resta, e con lei restano i tre lettori che prendono i tutori **per posizione**: `billingGuardianIndex` (di chi e il codice fiscale su una ricevuta), i segnaposto `{{parent.1.*}}`, e il `recordId` di una compilazione gia salvata. La posizione e adesso una colonna e l'ordine e deterministico, quindi il rischio e chiuso; ma tre letture che decidono un fatto fiscale o il nome su un documento continuano a farlo per posizione invece che per persona. Vanno spostate su un riferimento esplicito, ed e un lavoro con conseguenze fuori dal prodotto: cambia chi paga una fattura |
| **PP02-D41** (nuovo, Low) | **APERTO** | Esistono **due** `getGuardianRows`: quella di `parent-dashboard.ts` (che dopo WP-C non decide piu niente) e quella **esportata** da `medical-certificate-reminders.ts`, che decide chi riceve gli avvisi sul certificato di un minore. Leggono le stesse righe con regole diverse — una conta sei grafie dell'identificativo, l'altra quattro. Adesso leggono tutte e due la **proiezione**, quindi i marchi non si perdono piu; ma restano due nozioni di «tutore» per due domande diverse, e almeno tre canali di notifica non sono d'accordo su quali grafie facciano di una persona un destinatario |
| **PP02-D42** (nuovo, Low) | **APERTO** | Il gettone di invito del tutore vive ancora **in chiaro** su `athlete_guardians.access_token_value`. Per l'atleta ADR-0104 conserva la sola impronta; qui il travaso ha portato cio che esisteva, e non ha cambiato il meccanismo. E lo stesso debito che WP-B aveva gia scritto sul campo |

### Il conteggio degli scrittori, rifatto da zero

Il censimento e stato rifatto contro il codice invece che aggiornato: sono
**diciannove istruzioni di scrittura in grado di cambiare uno stato di tutore,
su otto file**, e non sedici. Le tre in piu vivono nel **browser**
(`simplified-db.ts`): compongono il blob e lo mandano alla rotta generica, e
nessun censimento precedente le aveva nominate.

E la ragione per cui l'invariante e stata messa nell'archivio invece che in un
test: la rotta generica scrive attraverso un delegato **calcolato a runtime**,
quindi un elenco derivato da una ricerca testuale non puo essere completo per
costruzione (ADR-0136).

### PP02-D34 e tornato una volta, prima di chiudersi (2026-09-06)

Vale la pena scriverlo, perche l'errore non e stato nel codice ma **nel modo di
dichiarare chiusa una classe**.

WP-C ha tolto il ciclo dello sweep e il blocco sull'intero club, e le note del
lavoro dichiaravano: «non ci sono blocchi per riga, quindi non c'e un ordine di
acquisizione da incrociare con nessun altro». Era vero per i blocchi **tolti**,
e falso per quelli rimasti:

| Chi | Prende prima | Poi |
|---|---|---|
| il salvataggio dell'anagrafica | `athletes` (`lockAthleteRow`) | `athlete_guardians` |
| la revoca di una tessera | `athlete_guardians` | `athletes` (la proiezione) |

Due ordini opposti sulle stesse due tabelle. PostgreSQL:

```
deadlock detected: Process 340958 waits for ShareLock on transaction 320432;
blocked by process 340944. Process 340944 waits for ShareLock on transaction 320433...
```

Quando la vittima e la revoca, la schermata dice «revocato» e la persona e
ancora dentro — il modo di fallire da cui PP-02 e nato.

**Chiuso** con un ordine solo per tutti (`bloccaSchede`): prima la scheda, poi
le sue righe, e le schede in ordine crescente di identificativo. Non e il blocco
che D34 descriveva — quello prendeva quattrocento schede in ordine di
scansione — ma le schede su cui quella persona compare davvero: i suoi figli.

**La lezione.** Una classe di difetto non si dichiara chiusa perche e sparita
**l'istanza** che si stava guardando. Il deadlock non nasceva dal ciclo: nasceva
da **due ordini di acquisizione incrociati**, e togliere il ciclo ne ha tolto
uno lasciando l'altro. La domanda giusta non era «c'e ancora quel blocco?» ma
«esiste un ordine solo?».

Lo ha trovato una sonda — `W-72` e `W-79` — mentre veniva riscritta per il
modello nuovo, e non una revisione del codice: la coppia di transazioni che lo
produce non e evidente leggendo nessuna delle due funzioni da sola.


## PP-02 — cosa il secondo vaglio indipendente ha lasciato aperto (2026-09-06)

Cinque reperti chiusi (ADR-0137). Qui sotto cio che la revisione ha dichiarato
di **non** aver misurato: sono lacune di copertura, non difetti trovati.

### D43 — Il rollover di stagione e la revoca di tesseramento non sono stati attaccati

La revisione non ha toccato il passaggio di stagione ne la cancellazione di un
tesseramento. Le affermazioni su `bloccaSchede` e sull'ordine di acquisizione
dei blocchi rispetto al passaggio di stagione restano quindi **non misurate**
da questa revisione — non smentite, non confermate.

**Dove.** `src/lib/server/seasons.ts`, `src/lib/server/athlete-membership.ts`.

### D44 — La concorrenza vera resta misurata solo in sequenza

Le sonde di questo pacchetto serializzano: due segreterie che salvano la stessa
scheda **simultaneamente**, due approvazioni di modulo concorrenti e l'ordine di
acquisizione dei blocchi sotto contesa non sono stati riprodotti. La revoca
concorrente con un salvataggio in volo e invece misurata.

### D45 — `scripts/provision-staging-e2e.mjs` scrive ancora il blob

Lo script di provisioning semina i tutori dentro `athletes.data.guardians[]`,
che dopo WP-C e una proiezione: l'area famiglia di uno staging appena
provisionato non si apre. Va portato su `saveGuardianRegistry`.

### D46 — Tre letture del riscatto passano dalla proiezione, non dall'autorita

`loadParentAccessTarget` e `alreadyLinkedUserId` leggono `athletes.data`. Non
decidono un accesso — quello lo decide `findGuardianLinks` sulle righe — ma
sono la classe di lettura che questo pacchetto ha speso ventotto round a
spostare, e vanno riportate sull'autorita.

### D47 — L'approvazione di un modulo preferisce `linkedUserEmail`

Se una compilazione propone un indirizzo diverso da quello gia collegato, il
cambio proposto viene silenziosamente ignorato. E una perdita di dato, non un
buco di accesso.

### D48 — Il cruscotto della famiglia pubblica i recapiti di un tutore revocato

L'elenco mostrato in area famiglia proietta anche le righe revocate con i loro
recapiti. Nessun accesso ne deriva; e un'esposizione di dato personale fra
tutori della stessa scheda.

### D49 — Due salvataggi concorrenti della stessa scheda perdono un tutore

Il salvataggio dell'anagrafica **sostituisce** l'elenco dei tutori. Due
segreterie sulla stessa scheda, la seconda con l'elenco letto un istante prima:
entrambe riescono, e la riga che la prima aveva appena creato sparisce — nome,
telefono e codice fiscale di un tutore legittimo, in silenzio.

Non e una corsa che l'ordine dei blocchi non governa: le due transazioni sono
serializzate da `bloccaSchede`, ed e la semantica di sostituzione applicata a
uno snapshot vecchio. Lo stesso esito si ottiene in sequenza con due linguette
aperte.

**Perche non si chiude qui.** Chiuderla vuol dire concorrenza ottimistica sul
salvataggio della **scheda** — una versione che il client rimanda e il server
verifica — e riguarda ogni campo dell'anagrafica, non i tutori. Farla dentro
questo pacchetto la metterebbe in uno solo dei posti che ne hanno bisogno.

**Perimetro di sicurezza (misurato, e verde):** nessuna riga revocata risuscita
e nessun accesso si apre. Il danno e la perdita di un recapito, non un varco.
Sonda: `scripts/pp-02-terzo-vaglio.mjs`, sezione R-H, che stampa la misura.

### D50 — Un tutore non ha una strada di ingresso propria fra i diritti dell'interessato

`DATA_SUBJECT_KINDS` contiene solo `athlete`: non si puo chiedere «cancella
questo tutore» nominando lui. La motivazione storica — «un tutore vive dentro
`athletes.data.guardians`, e cancellarlo significa riscrivere l'anagrafica di un
altro» — **non e piu vera** da WP-C: e una riga con una chiave.

La parte urgente e stata fatta: `athlete_guardians` e ora una fetta
dell'inventario, quindi il riepilogo la nomina e il gettone di conferma la
copre. Resta da fare la strada di ingresso per il soggetto `guardian`.

### D51 — Un invito che nomina la riga dietro una voce della scheda da 404

`loadParentAccessTarget` cerca il tutore dentro `athletes.data.guardians`, che
pubblica **una voce per posizione**. Un gettone coniato fuori dall'interfaccia
che nomini una delle righe fuse dietro quella voce non si riscatta: 404.

Non e un buco di sicurezza — e il verso restrittivo — ed e irraggiungibile dal
conio odierno, perche la scheda quell'identificativo non lo pubblica. Va chiuso
risolvendo il bersaglio del riscatto sull'**autorita** invece che sulla
proiezione, insieme a D46.

### D52 — Un salvataggio ordinario cancella la riga nascosta dietro una voce

La proiezione ricompone i tutori per posizione e la scheda mostra una voce dove
il travaso puo aver messo due righe. Il salvataggio cancella ogni riga viva che
non sia nominata, e la scheda quella riga non la nomina: il primo salvataggio
ordinario la distrugge — un tutore legittimo perde l'accesso senza una revoca e
senza una riga di audit.

Non e un varco (toglie, non concede) ed e la stessa famiglia di D49: il rimedio
sta nel far portare al salvataggio l'insieme delle righe che la voce rappresenta,
non un id solo. Ipotesi lasciata dal sesto vaglio, **non ancora misurata**.

### D53 — Le posizioni delle righe revocate non si rinumerano

Le righe in arrivo prendono come `position` l'indice dell'array; le righe
revocate conservano la loro e non vengono rinumerate. Due righe possono percio
condividere una posizione, e la proiezione le fonde con la regola «chi chiude
vince»: un tutore **vivo** comparirebbe come revocato.

Sarebbe un falso senso di revoca — la schermata dice chiuso, l'archivio dice
aperto — ed e la direzione piu pericolosa fra le due. Ipotesi lasciata dal sesto
vaglio, **non ancora misurata**: e la prima cosa che il vaglio successivo deve
attaccare.

### D52 e D53 — chiusi (2026-09-06)

Erano le due ipotesi lasciate dal sesto vaglio interrotto. Il vaglio successivo
le ha misurate: erano **vere tutte e due**, ed erano **la stessa cosa** — la
posizione era diventata una chiave che nessuno teneva unica. Chiusi da ADR-0142.

### D54 — La deroga della cascata e tenuta stretta dal vincolo esterno, non dall'elenco delle colonne

Il vaglio d'archivio deroga per l'azzeramento del riferimento a un'utenza
cancellata, e il commento della migrazione dice «ogni altro campo deve restare
com'era». In realta fissa **quattro** colonne su dodici: restano libere
`position` (che decide che cosa si fonde e che cosa si revoca), `legacy_id` (che
decide quale gettone nomina la riga), `access_token_*`, `first_name`, `data`,
`linked_at`.

**Non e sfruttabile**, e la ragione non e quella scritta: la premessa della
deroga (`user_id` valorizzato ma inesistente in `users`) non e ricostruibile a
riposo, perche la chiave esterna la rifiuta. La deroga vive solo dentro la
cascata che PostgreSQL genera, che scrive quella colonna e nessun'altra.

A tenerla stretta e quindi il **vincolo esterno**. Se un giorno la FK diventasse
`NO ACTION` con azzeramento a mano, otto colonne si aprirebbero e nessun commento
lo direbbe. La migrazione e applicata e non si tocca: la correzione va fatta
quando una migrazione successiva tocchera quel vaglio, elencando le colonne o
dichiarando la dipendenza dalla FK.

### D55 — Togliere un tutore non chiede la chiave della concessione

`canGrantAccess` governa la **crescita** dell'insieme delle identita che aprono
il fascicolo, non la sua riduzione: un ruolo che sa scrivere una scheda puo
**togliere** un tutore senza portare ne `accounts.athlete.manage` ne
`clinical.read`, e lo stesso vale sulla porta dell'approvazione di un modulo.

E coerente fra le due porte e dichiarato dal modulo, quindi non e
un'asimmetria; ma togliere un tutore a un minore e un atto distruttivo, e la
domanda «quale permesso lo governa» non ha ancora una risposta scritta. Va
decisa da una revisione sull'insieme dei permessi, non dentro questo pacchetto.

La traccia intanto non mente piu: quando una riga viva viene sostituita, il
registro dice «Genitore **sostituito**», non «aggiunto».

---

## PP-02 — cosa il consolidamento e la sua revisione lasciano aperto (2026-09-07)

Il consolidamento strutturale ([ADR-0153](18-decision-log.md#adr-0153--le-regole-di-un-dominio-stanno-in-una-primitiva-non-in-ogni-consumatore))
e la revisione indipendente che lo ha attaccato chiudono sei invarianti
falsificate. Restano queste, **dichiarate e non chiuse**.

### D-PP02-A · La migrazione revoca il co-genitore per indirizzo condiviso — CHIUSO, exposure 0

`prisma/migrations/20260906180000_pp02_il_travaso_fondeva_due_persone/migration.sql`,
§3: le due `UPDATE` propagano il marchio confrontando il registro storico con
`identity_key`, `user_id` **e `email`**. L'indirizzo non e unico per persona —
e il presupposto di ADR-0127 e la ragione di ADR-0139.

Effetto: madre e padre con un solo indirizzo di famiglia, la madre nel registro
storico delle revoche, e il travaso marca **anche la riga del padre**, che ha
la propria utenza. Nessuna schermata, nessun audit, nessuna revoca: il padre
perde l'area famiglia al deploy.

`revokeGuardianAccessInClub` ha imparato questa lezione (`diUnAltraPersona`);
la migrazione no. **La migrazione e gia applicata**, quindi la correzione non e
una modifica al file: e una migrazione di bonifica che deve decidere, riga per
riga, quali revoche fossero reali — e quella decisione non e automatizzabile
senza il registro di audit. Va istruita con il cliente, e **richiede
autorizzazione esplicita** ([CLAUDE.md §8](../../CLAUDE.md)).

Nel frattempo la riga marcata cosi si comporta correttamente: e esclusa, e non
riceve (49 §C). Il difetto e che non doveva esserlo.

#### Misurato, e chiuso (2026-09-07)

`pp-02-diagnosi-travaso.mjs` e stato eseguito **in sola lettura imposta dal
server** (`transaction_read_only = on` sull'endpoint diretto Neon) sul database
di staging/pilota `neondb`, quello del pilota **Fortitudo Scauri**.

| | |
|---|---|
| club | 6, di cui Fortitudo Scauri con **307 atleti** |
| atleti | 520 |
| atleti con `revokedGuardianIdentities` come array | **0** |
| atleti con `contactOnlyIdentities` come array | **0** |
| voci con un indirizzo condiviso sulla stessa scheda | **0** |
| righe che la §3 marcherebbe (predicato simulato sul blob) | **0** |

**Exposure: zero, e non per fortuna.** La §3 si accende solo su un atleta il cui
blob porti uno dei due registri, e su staging **nessun atleta li porta in
nessuna forma**. Il difetto e reale nella logica della migrazione e non ha
nessuna riga su cui manifestarsi.

R4 si chiude percio come **difetto latente storico con exposure 0**: la logica
resta sbagliata per una scheda che venisse travasata portando un registro, e la
regola giusta e scritta in ADR-0154, ma non c'e niente da bonificare e nessuna
migrazione di rimedio da scrivere.

**Se un giorno un registro comparisse** — un ripristino da un backup
pre-PP-02, o un club nuovo importato da una fonte che li scrive — la diagnosi
va rieseguita **prima** del deploy che applica il travaso. E il solo momento in
cui il difetto potrebbe mordere.

### D-PP02-B · `escluseDietro` non ha un lettore

Il campo esiste, la proiezione lo deriva correttamente e **nessuna schermata lo
mostra**. La ragione dichiarata in 49 §F — «la scheda deve poter dire che
dietro una voce c'e qualcuno che il club ha escluso, altrimenti la porta che
revoca ragiona per posizione su qualcosa che la porta che mostra non dichiara»
— non e realizzata.

E l'errore n. 8 di CLAUDE.md nella sua forma piu comune: non codice mancante,
**codice irraggiungibile**. Va aggiunto alla scheda atleta o tolto.

### D-PP02-C · `guardian_id` non e vagliato al conio di un invito

`guardaIlConioDiUnGettone` (`resources.ts`) vaglia `role` e toglie la firma del
coniatore; **non** vaglia `guardian_id`, che il client sceglie. R1 della
revisione passava di li: un invito coniato sulla chiave d'identita invece che
sull'identificativo di riga.

Il difetto e chiuso alla radice giusta — la revoca adesso chiude tutto cio che
il riscatto risolve — ma imporre al conio che `guardian_id` nomini una riga
**di quella scheda** lo chiuderebbe una seconda volta, e piu vicino a dove
nasce. Fuori scope qui perche tocca la rotta generica.

### D-PP02-D · Nessuna bonifica dei residui in `athlete_guardians.data`

`CHIAVI_CON_UNA_COLONNA` impedisce che le chiavi di colonna e di sicurezza
**nascano** nel residuo, e `residuoSicuro` impedisce che quelle gia in archivio
**escano** nella proiezione. Nessuna delle due le **toglie** da dove sono: lo
fa solo `residuo()`, e solo quando quella scheda viene risalvata.

Non e urgente — la difesa in lettura e totale, ed e li che si decide — ma
finche i residui esistono, un lettore nuovo che dimenticasse di passare dalla
proiezione li troverebbe.

### Cosa il contratto continua a non coprire

Vedi la coda di [49](49-pp-02-invarianti-tutori.md): rollover di stagione sotto
contesa, riscatto cross-club sul ramo genitore, una persona con due utenze
sulla stessa scheda, `unlinkClubJsonProfiles`.

### D-PP02-E · Staging e indietro di quattro migrazioni: PP-02 non e ancora li

Misurato il 2026-09-07 con `npx prisma migrate status` sul database di
staging/pilota, in sola lettura:

```
Following migrations have not yet been applied:
  20260905120000_pp02_tutore_e_una_riga
  20260906090000_pp02_il_tutore_ha_un_solo_scrittore
  20260906100000_pp02_il_travaso_perdeva_e_inventava
  20260906180000_pp02_il_travaso_fondeva_due_persone
```

`athlete_guardians` **non esiste** su staging: il pilota Fortitudo Scauri —
307 atleti — gira ancora sul percorso pre-PP-02, con i tutori dentro
`athletes.data.guardians[]` e nessuna autorita di riga.

Non e un debito del dominio: e un **fatto operativo** che chiunque prepari
l'integrazione finale deve sapere, e ha due conseguenze.

1. **Niente di PP-02 e stato provato su dati veri.** Tutte le sonde girano sul
   database di sviluppo. Il primo deploy che applichera queste quattro
   migrazioni fara il travaso su 520 atleti in una volta sola.
2. **Il travaso su staging e piccolo, ed e una fortuna.** Il blob contiene in
   tutto **sei** voci di tutore su 520 schede, e nessun registro: e la ragione
   per cui D-PP02-A ha exposure zero. Non e una proprieta che sopravvivera a un
   club vero che compili l'anagrafica.

**Prima di quel deploy** vanno rieseguite, contro staging e in sola lettura,
`pp-02-diagnosi-travaso.mjs` e `npx prisma migrate status`. Il deploy stesso
**richiede autorizzazione esplicita** ([CLAUDE.md §9](../../CLAUDE.md)), perche
ogni deploy esegue `prisma migrate deploy`.

---

## Debito aperto dall'integrazione finale (2026-09-07)

Il ramo `integration/final-production-readiness` unisce PP-05, PP-03, PP-04 e
PP-02 e chiude P0-4. **Non** chiude il resto del mandato Fortitudo, e questa
tabella dice esattamente che cosa resta, perche, e da dove si riparte.

La regola di lettura e la stessa del resto del documento: una voce qui e una
cosa che **non e stata fatta**, non una cosa che si spera vada bene.

| # | Cosa | Perche non e stato fatto qui | Da dove si riparte |
|---|------|------------------------------|--------------------|
| **D-INT-1** | **I sette P0 Fortitudo che non sono P0-4.** Conteggio degli atleti nelle azioni massive (213 contro 245: un atleta con piu tessere si conta due volte); l'allenamento cancellato che resta su cruscotti e calendario; il registro presenze; le convocazioni; la bacheca dell'allenatore; la coerenza categoria↔sede quando una categoria si sposta; l'ordinamento canonico delle categorie; la pagina atleti senza paginazione classica; il conflitto di struttura fra eventi di giorni adiacenti | Sono **sette pacchetti di prodotto**, non sette correzioni. La bacheca dell'allenatore da sola e una riscrittura responsive su quattro larghezze con flussi a una mano; il registro presenze e le convocazioni pretendono prima la consolidazione dell'eleggibilita (`D-INT-2`). L'integrazione ha chiuso P0-4 perche e la **radice condivisa** di P0-4/5/6/7 — l'identita di una categoria — e perche era l'unica dei sette a essere un difetto di dominio invece che una funzione da costruire | Ognuno con la sua lane e il suo commit. P0-1 e il piu vicino a essere una correzione sola: l'insieme bersaglio di un'azione massiva va reso un insieme di **identificativi di atleta** distinti, e «tutti» deve significare tutti i risultati filtrati e non la pagina corrente |
| **D-INT-2** | **L'eleggibilita non e stata consolidata.** «Quali atleti appartengono a questa categoria o a questo gruppo?» ha ancora piu di una risposta nell'albero. Il censimento e stato fatto ed e questo: `category-compatibility.ts` (ADR-0030) e il modello canonico e **e gia corretto** — configurazione esplicita, per identificativo, non transitiva; `audience.ts` risolve `category_ids` per identificativo ed e corretto; `trainer-dashboard-helpers.ts` e stato corretto qui (ADR-0155); restano `parent-dashboard.ts` (`getAthleteCategoryTokens`, che normalizza **nomi**), `access-scope-query.ts`, `season-memberships.ts`, `trainer-area.ts`, `club-report-utils.ts` e `category-athlete-stats.ts` | La centralizzazione vera — un `resolveEligibleAthletes` unico che club e allenatore condividono — cambia la forma dei dati che sei schermate ricevono. Farla dentro l'integrazione avrebbe mescolato un refactor architetturale con quattro merge semantici, che e esattamente cio che CLAUDE.md §3 vieta | La primitiva esiste gia (`getAthleteCategoryEligibility`, `buildCategoryCompatibilityIndex`): il lavoro e portare i sei consumatori residui su di lei, uno per commit, e togliere il ripiego sul nome dove il catalogo c'e. `extractCategoryIdentity` e la forma che gli altri devono assumere |
| ~~**D-INT-3**~~ *(chiusa, vedi sotto)* | **Due categorie omonime restano due voci con la stessa scritta.** ADR-0155 ha tolto la **fusione**: l'Under 15 di Formia non e piu l'Under 15 di Scauri per il codice. A schermo pero i due menu, i due filtri e le due intestazioni continuano a dire «Under 15» due volte, e chi sceglie non sa quale sta scegliendo | E lavoro di interfaccia su una decina di superfici, e ha una decisione di prodotto dentro: accostare **sempre** la sede, o solo quando il nome e ambiguo. La seconda e piu pulita e piu difficile, perche l'ambiguita va calcolata dove si disegna | `getRecordDisplayCategory` e il punto unico dell'etichetta: e li che una sede si accosta, non in dieci schermate |
| **D-INT-4** | **Il ripristino dello snapshot non e mai stato provato.** Il runbook della finestra di migrazione ([50](50-finestra-migrazione-staging.md)) dichiara il ripristino come unico rimedio, e non esistono migrazioni `down` | Provarlo significa creare uno snapshot, romperlo di proposito e ripristinarlo su un ambiente vero: e una scrittura distruttiva su staging, che richiede un'autorizzazione esplicita (CLAUDE.md §9) | Va provato **prima** della finestra vera, non durante. Un piano di rollback mai eseguito e un'ipotesi |
| **D-INT-5** | **Le sonde precedenti a WP-C seminano ancora l'archivio sbagliato.** Restano da convertire: `wave-4-audit-concurrency-probe`, `wave-5-concurrency-probe`, `wave-5-security-probe`, `pp-04-atleta-probe`, `pp-04-round-conclusivo-probe`, e le tre `pp-03-round3-*` | Non e una regressione dell'integrazione: **misurato**, falliscono identiche su `d57ddce`, cioe su PP-02 da sola. PP-02 ha dichiarato FINAL con le proprie dieci sonde convertite e queste otto rotte dal proprio cutover | `scripts/helpers/travaso-tutori.mjs` fa il lavoro in una riga. `pp-03-revoca-sweep-probe` e `wave-6-security-probe` sono state convertite qui e mostrano la forma. `wave-6-security-probe` arriva ora a U-73 su U-74 e si ferma su un quarto strato: `reviewFormSubmission` pretende una tessera nel club che la sonda non semina |
| **D-INT-6** | **La revisione ostile sul sistema integrato non e stata eseguita.** Ogni lane ha la propria (PP-02 quindici tornate, PP-03 sette, PP-04 quattro, PP-05 quattro), e nessuna ha guardato la **composizione** | Va fatta da revisori indipendenti sul ramo integrato, dopo i P0. Farla ora misurerebbe un sistema che sta per cambiare | Il perimetro e quello del mandato: tenancy, ruoli personalizzati, eleggibilita, eventi, tutori, autenticazione, documenti, account, denaro. Le due regressioni trovate qui dalla sola riesecuzione delle sonde (§4a e §C2 di PP-02) dicono che il metodo paga |
| **D-INT-7** | **La pagina Account non e stata rifinita.** Club, organizzazione attiva, ruolo corrente, ruolo personalizzato, profili collegati, stato di invito e riscatto: ci sono, ma non sono stati riletti dopo il merge, e il requisito «dopo il riscatto il profilo collegato compare **subito**» non e stato verificato a schermo sul ramo integrato | Fuori dal perimetro dei quattro merge, e dipende da `D-INT-1` per la parte allenatore | Il flusso da percorrere e uno: riscatta un invito, e guarda se la pagina lo dice senza un secondo caricamento |

### Una nota sul metodo, che vale piu di ogni voce

Due sonde di PP-02 sono diventate rosse **dopo** il merge, e nessuna delle due
per una difesa caduta: in tutti e due i casi la composizione con un'altra lane
aveva prodotto una garanzia **piu stretta** di quella per cui l'asserzione era
scritta (PP-05 che chiude il registro generico dei recapiti, PP-03 che mette la
guardia di club attivo prima della ricerca).

La tentazione, in quel punto, e allargare il codice per far tornare verde la
sonda. Sarebbe stato riaprire una porta per una prova. Sono state corrette le
**asserzioni**, e ognuna porta scritto accanto perche — cosi che il prossimo che
le legga sappia che la regola vecchia non e caduta: e stata contenuta in una
piu larga.

---

## Debito dalla revisione ostile sull'integrato (2026-09-07)

Verbale completo in [14 — Sicurezza](14-security.md) §«Revisione ostile sul
sistema integrato». Qui vivono le voci, con la colonna che conta di piu:
**origine**, cioe se il reperto lo ha prodotto il merge o se vive nella base
comune delle quattro lane.

`D-AUD-2` e `D-AUD-8` non compaiono: sono stati corretti nella stessa tornata.

| # | Gravita | Cosa | Origine | Da dove si riparte |
|---|---------|------|---------|--------------------|
| **D-AUD-1** | **Critical** | Il generatore di allenamenti scrive `clubs.trainings` a mano (`training-automation.ts:725`) invece di passare da `createClubEventsBatch`. Cio che genera non ha una riga in `club_events` — quindi presenze, convocazioni e RSVP non lo trovano — e la prima proiezione di un evento qualunque lo **cancella**, senza errore e senza audit | preesistente (`aa62e16`) | Il gemello lato browser e gia corretto (`simplified-db.ts:3807`). Prima serve pero decidere **con quale autorita il cron scrive un evento**: `createClubEventsBatch` pretende uno `EventsScope` e la rotta autenticata ce l'ha, il cron no, e nell'albero non esiste uno scope di sistema |
| **D-AUD-3** | High | Un allenatore, anche `custom:trainer:*` a zero caselle, legge i byte di contratti e documenti d'identita di ogni collega: `TRAINER_READ_RESOURCES` include `trainers` e `staff_members`, il perimetro degli allegati vale solo per `owner_type: athlete`, e una risorsa con `keys: []` e raggiungibile da ogni ruolo personalizzato | preesistente | O il perimetro sale anche sugli allegati non-atleta, o `trainers`/`staff_members` escono da `TRAINER_READ_RESOURCES` per la parte documentale. La prima e piu giusta e piu larga |
| **D-AUD-4** | High | `stripClinicalAthleteFields` chiamata **senza ruolo** in `data-subject.ts:1019`: resta il solo elenco dei vietati, e un campo clinico sotto un nome inventato sopravvive all'export. La porta gemella e gia corretta e passa `ruoloEffettivo` | preesistente | Una riga: passare il ruolo, come fa `athlete-profile/[athleteId]/route.ts`. Stessa omissione latente in `form-submissions.ts:1268` e `:2592`, oggi innocua solo perche `DYNAMIC_FIELDS` e un vocabolario chiuso |
| **D-AUD-5** | High | Il registro presenze (`training/page.tsx`) porta due copie private del confronto fra categorie e incrocia identificativi con etichette: con due omonime su due sedi, «Segna tutti presenti» scrive presenze su atleti dell'altra sede, e da li passano al calcolo dei contributi | preesistente | Portarle su `extractCategoryIdentity` (ADR-0155). E la stessa correzione gia fatta in `trainer-dashboard-helpers.ts`, applicata ai due gemelli che non sono stati toccati |
| **D-AUD-6** | Medium | Il sollecito manuale del certificato consegna il nome di un minore fuori dal club: `resolveGuardianRecipientIds` risolve per indirizzo **senza pretendere la verifica** e applica il filtro di tessera solo se il chiamante passa `organizationId`. Dei tre chiamanti, la rotta manuale e l'unico che non lo passa | preesistente | Rendere `organizationId` obbligatorio, e pretendere `email_verified_at` come fa gia `findGuardianLinks` |
| **D-AUD-7** | Medium | Il cruscotto della famiglia elenca i tutori **revocati** e le righe di solo recapito come tutori correnti: `readGuardiansForAthlete` e il lettore d'autorita e non filtra `revoked_at` — giustamente — ma questo e l'unico dei nove consumatori che non applica `isGuardianExcluded` prima di consegnare al browser | preesistente | Una riga in `parent-dashboard.ts:1878`: filtrare con la primitiva del dominio, come fanno gli altri otto |
| **D-AUD-9** | Medium | Le convocazioni nei report di club si leggono da `match.convocations` e dalle grafie del payload, che dopo ADR-0099 **nessuno scrive piu**: ogni atleta risulta convocato zero volte | preesistente | Leggerle da `club_event_participants.convocation_status`, che e dove vivono |
| **D-INT-13b** | Medium | **L'appello si registra su un evento annullato.** `saveEventAttendance` non guarda lo stato dell'evento: una gara o un allenamento portati a `cancelled` accettano ancora una presenza, e quella presenza alimenta la misura dei contributi. Trovato da `pp-03-round5-concorrenza-e-grafie-probe` (`B-03`) durante i gate della passata funzionale, e **misurato preesistente**: la stessa sonda risponde identica su `fcedf82` | preesistente | E la meta mancante di `D-AUD-10`: li si decide che cosa significa «annullato» per la proiezione e per i conteggi, qui che cosa significa per le **scritture**. Le due vanno decise insieme, o la terza stesura scoprira di nuovo che una delle due porte era rimasta aperta |
| **D-AUD-10** | Medium | Gli eventi **annullati** restano nella proiezione (`events.ts:953` esclude `archived`, non `cancelled`) e `includeCancelled` non governa la cancellazione. I report li contano fra gli allenamenti previsti: annullarne cinque su venti fa scendere il tasso di presenza di ognuno dal 100% al 75% | preesistente | Decidere una volta che cosa significa «annullato» per la proiezione e per i conteggi, e applicarlo nei due posti insieme |
| **D-AUD-11** | Medium | `createClubEventsBatch` non chiama ne `assertFieldIsOpen` ne `assertNoOverlap`, che la creazione singola e la modifica applicano entrambe. Un orario fuori apertura passa a blocchi e viene rifiutato uno per uno | preesistente | Le due guardie accettano gia un elenco: e dove sono le altre due del blocco |
| **D-AUD-12** | Medium | La finestra della sovrapposizione e **un giorno UTC di `starts_at`**: un evento cominciato il giorno prima e finito dopo mezzanotte non e mai un candidato. La formula in se e corretta e su istanti. Piu: una prenotazione di struttura senza campo non collide con una del campo, perche il luogo e un token concatenato confrontato per uguaglianza | preesistente | Allargare la finestra all'indietro della durata massima ammessa, e far collidere il token «tutta la struttura» con quelli dei suoi campi |
| **D-AUD-13** | Medium | `secretariat_notes` e `club_events` letti dal registro generico non hanno un ramo in `buildAccessScopeFilter`: un ruolo gestionale con perimetro di sede legge le note di ogni sede, e il calendario di ogni sede. La porta di dominio degli eventi il perimetro lo applica — due porte sulle stesse righe, decide la piu larga | preesistente | Aggiungere i due rami. Le scritture sono gia bloccate da `assertNotDomainOwnedModel` |
| **D-AUD-14** | Medium | I byte del documento d'identita di un atleta sono raggiungibili da chi ha il solo `clinical.status_read`: la proiezione JSON toglie `identityDocuments`, l'allegato no, perche l'innalzamento a `clinical.read` scatta solo sul certificato medico. Mitigato: qui il perimetro di sede e categoria si applica | preesistente | Trattare `documento-identita` come il certificato nell'innalzamento |
| **D-AUD-15..19** | Low | `owner_type: guardian` dichiarato ma non coperto dal perimetro (latente: nessuno lo scrive oggi); tre confronti di ruolo con la stringa `"owner"` nelle rotte delle tessere; `sorgente()` che tratta la chiave `guardians` come proiezione anche su schede mai risalvate dopo la migrazione; `allowSelfAthleteLink` messo dentro lo scope del fascicolo e mai riletto da nessuno; e due difese (`revokeGuardianAccessInClub`, il filtro di revoca di `findGuardianLinks`) la cui correttezza dipende dal fatto che il chiamante passi `userId` — oggi lo passa sempre, ma la firma lo rende opzionale | preesistenti | Nessuna e sfruttabile oggi. La classe pero e quella che questo repository ha imparato a temere: una difesa che dipende da chi la chiama non e una difesa |

### Il reperto che valeva l'intera revisione

`D-AUD-2` era **della composizione**, e non lo avrebbe trovato nessuna delle
revisioni di lane: ADR-0155 e stato scritto in questa stessa tornata, e la sua
difesa era **inerte** su ogni percorso alimentato da `buildClubCategoryOptions`
— che fondeva per nome cio che la regola nuova aveva appena separato.

E la ragione per cui una revisione sull'integrato non e la somma delle
revisioni delle lane: una correzione puo essere giusta, avere le sue prove
verdi, e non arrivare mai al punto in cui serve.

---

## Debito dalla remediation (2026-09-07, seconda tornata)

Il Critical e i sette High della revisione ostile sono chiusi. Queste sono le
voci che restano, e la prima e l'unica che pretende una **decisione**, non del
lavoro.

| # | Cosa | Perche non e stato chiuso | Da dove si riparte |
|---|------|---------------------------|--------------------|
| **D-INT-8** | **Quando una categoria cambia sede, i suoi atleti spariscono.** La configurazione e gia corretta e **misurata**: A → B archivia il gruppo vecchio invece di cancellarlo, A+B → B ne archivia uno solo, B → nessuna sede non lascia gruppi attivi, e una sede disattivata non e piu una sede su cui aprirne. Cio che nessuno tocca e l'**appartenenza dell'atleta**, che porta il proprio `site_id`: da quel momento l'identificativo di gruppo che ne esce non corrisponde a nessun gruppo attivo, e quegli atleti escono da appello, convocazioni e avvisi della propria categoria | **E una decisione di prodotto, non una riga**, e le tre risposte possibili sono tutte difendibili: gli atleti **si spostano** con la categoria (ma allora un atleta di Scauri diventa di Formia senza che nessuno glielo abbia detto, e la sede e cio con cui il club decide dove si allena); **restano dove sono** senza categoria (che e cio che succede oggi, ma in silenzio); il cambio **si rifiuta** finche l'organico non e stato spostato (la piu onesta e la piu scomoda). Sceglierne una di nascosto dentro un commit di integrazione sarebbe decidere per il club come si chiamano le sue squadre | `tests/lib/categoria-cambia-sede.test.mjs` misura gia tutti e cinque gli scenari, **compreso il difetto**: la prova che lo descrive lo dice nel proprio commento. Scelta la risposta, quella prova cambia di segno e diventa l'invariante |
| **D-INT-9** | **L'ordinamento canonico delle categorie non esiste.** Non c'e un `sort_order` persistito: `compareCategoryGroups` ordina per **nome** di categoria e poi di sede, e le altre schermate ordinano ciascuna a modo proprio. Un club che pensa alle proprie squadre in ordine di eta le rivede in ordine alfabetico, e in due schermate diverse in due ordini diversi | Non e difficile, ed e per questo che va fatto bene: serve una colonna, una migrazione, un punto di scrittura (la pagina categorie, con il trascinamento) e **un solo lettore** che tutte le schermate chiedano. Farlo a meta — l'ordine su una schermata e non sulle altre — e peggio di non farlo, perche insegna che l'ordine non e affidabile | L'ordinamento per nome non deve restare come ripiego dove il `sort_order` manca: ricadrebbe sulla stessa fusione di ADR-0155. Il ripiego giusto e l'ordine di inserimento |
| **D-INT-10** | **La pagina atleti ha ancora la paginazione classica.** Il requisito chiede una lista continua con resa pigra. Il **comportamento** che contava e gia corretto: dopo P0-1 l'azione «tutti» prende l'insieme filtrato intero e non la pagina caricata, quindi il difetto che la paginazione produceva non c'e piu | E lavoro di interfaccia con una scelta di resa dentro (virtualizzazione o no, e a quale soglia), e non ha effetti sulla correttezza di nessuna scrittura | `collectAthletesForExport` e gia il lettore che scorre tutte le pagine: la lista continua ha di fatto il proprio caricatore gia scritto |
| **D-INT-11** | **La bacheca dell'allenatore non e stata rifatta.** Le sue **fondamenta** si: dopo D-INT-2 e ADR-0155 l'allenatore non vede piu gli allenamenti e gli atleti dell'omonima di un'altra sede, l'appello non gli apre davanti quindici atleti di trenta chilometri piu in la, e gli allenamenti generati dal cron sono eventi veri su cui puo fare l'appello. Cio che manca e la **schermata**: prossimi impegni, convocazioni, cose da fare, e i flussi a una mano su 375/768/1280/1440 | E una riscrittura responsive di una superficie intera con una fase di disegno dentro, e va verificata a schermo su quattro larghezze. Non e una cosa che si fa in coda a un'integrazione, e dichiararla fatta senza aver aperto la pagina sarebbe la forma di difetto che CLAUDE.md §11.8 descrive: il codice che c'e e non serve a nessuno | Le primitive canoniche esistono e sono misurate; il lavoro che resta e di interfaccia, non di dominio |
| **D-INT-12** | **La pagina Account non e stata rifinita**, e il requisito «dopo il riscatto il profilo collegato compare **subito**» non e stato percorso a schermo sul ramo integrato | Vedi `D-INT-7`: e la stessa voce, e resta aperta | Il flusso e uno: riscatta un invito, e guarda se la pagina lo dice senza un secondo caricamento |

### Cosa e stato chiuso dopo (2026-09-07, passata funzionale)

La tabella qui sopra e il verbale della remediation e **non si riscrive**:
quelle voci erano vere quando sono state scritte. Questo elenco dice cosa e
successo dopo, e chi legge la tabella deve leggere anche questo.

| # | Stato | Come |
|---|-------|------|
| **D-INT-8** | **CHIUSA** | Decisione di prodotto presa dal committente: cambiare la sede di una categoria **non** sposta gli atleti e **non** viene rifiutato. Le assegnazioni restano entita esplicite; l'editor rileva le appartenenze che il cambio rende incoerenti, ne mostra il numero **prima** della conferma e offre un riallineamento esplicito. Nessuna migrazione silenziosa. `tests/lib/cambio-sede-impatto.test.mjs` (10) |
| **D-INT-3** | **CHIUSA** | La decisione di prodotto che restava aperta e presa: la sede si accosta **solo quando serve**, e l'ambiguita si calcola dove si disegna. `src/lib/categories/display.ts` porta la regola, `CategoryLabel` la resa (la sede piu piccola e smorzata, in un elemento suo). Cablata su bacheca dell'allenatore — un punto solo che serve quattordici schermate, appello e convocazioni comprese — gare, azione massiva dell'elenco atleti, selettore e pettorine della scheda, filtro del calendario. Ha richiesto di dare all'allenatore la lettura di `club_sites` e `category_groups`: senza i gruppi una categoria non ha una sede (ADR-0038) e il cablaggio non cambierebbe niente. **Verificata sui dati del pilota**: le due «Scoiattoli» di Fortitudo si leggono ora «Scoiattoli (S. Cosma)» e «Scoiattoli (Scauri)». `tests/lib/categoria-omonima-sede-visibile.test.mjs` (11), `tests/ui/categoria-omonima-superfici.test.mjs` (11) |
| **D-INT-9** | **CHIUSA** | `sortOrder` persistito sulla categoria, un solo lettore (`sortCategoryOptions` / `compareCategoryGroups`) e un solo scrittore (la pagina Categorie, con due frecce invece del trascinamento: questa pagina si apre in palestra). Il ripiego dove l'ordine manca e l'ordine di inserimento, non il nome |
| **P0-5 (parte di `D-INT-1`)** | **CHIUSA** | **Il registro presenze era in sola scrittura.** L'appello salva su `club_event_participants` e nessuna rotta lo rileggeva: la scheda diceva «0/16 · Presenze mancanti» anche dopo un ricaricamento, la bacheca chiedeva di completare un appello completo, e riaprire il registro azzerava quello di prima — la seconda passata cancellava la prima, senza dirlo. Il calendario porta ora due conteggi per evento, chi apre il registro rilegge le righe (`src/lib/api/attendance-roll.ts`, un lettore per le due schermate) e il denominatore lo conta l'organico di oggi invece di un `expected_attendees` congelato. `tests/server/registro-presenze-rilettura.test.mjs` (5) |
| **Il perimetro dell'allenatore ignorava le appartenenze** | **CHIUSA** | Trovato aprendo la bacheca: l'allenatore dei suoi quindici Under 15 ne vedeva **tre**, perche le righe di `athlete_category_memberships` si caricavano solo per chi ha gruppi dichiarati. Da quell'elenco si aprono appello e convocazioni. Falliva chiuso, ma un confine che nasconde due terzi della squadra al suo allenatore non e un confine. `tests/server/perimetro-appartenenze-allenatore.test.mjs` (5) |
| **P0-6 (parte di `D-INT-1`)** | **CHIUSA** | **Le convocazioni si contavano su un payload che nessuno scrive piu.** La rosa e `club_event_participants.convocation_status`; le schermate leggevano dieci grafie dentro il payload della gara. Effetto: «0/16» dopo aver convocato undici atleti, rosa vuota riaprendo la finestra (quindi il secondo salvataggio la cancellava), «0 convocati» accanto a «Completate» sulla stessa riga, e dalla pagina Gare **nessun salvataggio possibile** — scriveva `clubs.matches`, che il server rifiuta. Il calendario porta `convocated_count`, le due schermate rileggono le righe, e la pagina Gare passa da `saveEventConvocations`. `tests/server/convocazioni-rilettura.test.mjs` (5). **`D-AUD-9` resta aperta per la sua meta**: i report di club (`club-report-utils.ts`) contano ancora dalle grafie del payload, e li non basta un conteggio — il rendiconto vuole gli **identificativi** degli atleti convocati, che una somma non porta |
| **La primitiva dell'eleggibilita rispondeva no a una stringa** | **CHIUSA** | Trovato aprendo le convocazioni dalla pagina Gare: `collectCategoryTokens` leggeva solo le **chiavi di un oggetto**, quindi `sameCategory(atleta, "<identificativo>")` rispondeva sempre no e la finestra si apriva su zero atleti con quindici iscritti. Falliva chiuso — non e mai stata una fusione fra omonime — ma una porta che non si apre e un difetto quanto una che si apre troppo. Postilla ad ADR-0155, tre prove con il loro controspecchio |
| **P0-7 (parte di `D-INT-1`) e `D-INT-11`** | **CHIUSA** | **La bacheca dell'allenatore diceva solo che cosa succede oggi.** Due riquadri sul giorno corrente e l'agenda gare della settimana; «quando torno in campo e con chi» non c'era. Il riquadro dei prossimi impegni era **scritto e irraggiungibile**: viveva dentro un `div` con la classe `hidden` e leggeva un `nextMatches` inizializzato a elenco vuoto — due modi indipendenti di non mostrarlo mai, sullo stesso blocco. Adesso allenamenti e gare stanno nello stesso elenco in ordine di orario, ognuno con l'azione che gli appartiene (convocazioni per una gara, il proprio giorno per un allenamento), e «Da completare» funziona davvero perche presenze e convocazioni si rileggono (P0-5, P0-6). Le caselle di appello e convocazione hanno finalmente un nome per chi legge con lo schermo. `tests/ui/bacheca-allenatore-impegni.test.mjs` (5), e la pagina aperta a 375/768/1280/1440 |
| **D-INT-7 / D-INT-12** (pagina Account) | **CHIUSA** | Il requisito era «dopo il riscatto il profilo collegato compare **subito**», e non era mai stato percorso a schermo. Adesso la card del club porta i profili collegati con il **nome** (`linked_profiles`: tutore, propria scheda, scheda allenatore), e il riscatto li mostra senza un secondo caricamento — `redeemClubAccess` rilegge le tessere e la rotta risponde gia con i nomi. **Percorso a schermo**: utente nuovo, gettone di tutore, riscatto, e la card passa da «Nessun accesso assegnato» a «EasyGame FC · Genitore · Tutore di Sara Bianchi003» nella stessa schermata. `tests/server/profili-collegati-account.test.mjs` (7) |
| **D-INT-10** | **CHIUSA** | L'elenco Atleti e continuo: la porzione successiva si **accoda** invece di sostituire, con un sentinello che la chiede arrivando in fondo e un pulsante che resta per la tastiera. La selezione in corso non va piu via dagli occhi. `tests/ui/elenco-atleti-continuo.test.mjs` (7), e la pagina aperta a 375/768/1280/1440 su un club da 223 atleti |
### I gate di questa passata (2026-09-07)

| Gate | Esito |
|------|-------|
| `npm test` | 5.160 / 5.160 |
| `npm run typecheck` | nessun output |
| `npm run lint` | 0 errori, 34 warning — **gli stessi 34** di prima della passata |
| `npm run build` | completato |
| `scripts/censimento-eleggibilita.mjs` | 4/4 |
| `scripts/pp-02-censimento.mjs` | 5/5 |
| `scripts/pp-02-mutazioni.mjs` | 18/18, albero identico a prima |
| `scripts/critical-automazione-sistema-probe.mjs` | 21/21 |
| `scripts/pp-03-eventi-scope-ruoli-probe.mjs` | 76/77 |
| `scripts/pp-03-round4-etichette-e-concorrenza-probe.mjs` | si ferma su un handler che la sonda non conosce |
| `scripts/pp-03-round5-concorrenza-e-grafie-probe.mjs` | 7/8 |

**I tre reperti delle ultime tre righe sono preesistenti**, e non e una
supposizione: le tre sonde sono state rieseguite su `fcedf82` — il commit
prima di questa passata — e rispondono **identiche**. Sono, nell'ordine:
`A-05b` (un identificativo malformato fa arrivare al browser il testo interno
di Prisma, gia `W4-R14`), un `POST /api/v1/events/:id` che la tabella di
instradamento della sonda non contempla, e `B-03` (l'appello si registra su un
evento annullato).

### I Medium della revisione ostile che restano

`D-AUD-6` (il sollecito manuale che consegna il nome di un minore fuori dal
club), `D-AUD-7` (il cruscotto di famiglia che elenca i tutori revocati),
`D-AUD-9` — **ridotta ai soli report**: le due schermate operative sono state
corrette (vedi sopra), il rendiconto no —,
`D-AUD-13` (`secretariat_notes` e `club_events` letti dal registro generico
senza il perimetro di sede), `D-AUD-14` (i byte del documento d'identita
raggiungibili con il solo `clinical.status_read`).

`D-AUD-10` e `D-AUD-11` sono stati chiusi con P0-3 e il conflitto di
struttura; `D-AUD-12` con la finestra e il token del luogo.

---

## Debito dalla seconda revisione ostile (2026-09-07)

I sette High sono chiusi. Restano questi, e nessuno e sfruttabile oggi.

| # | Gravita | Cosa | Da dove si riparte |
|---|---------|------|--------------------|
| ~~**D-AUD-20**~~ **CHIUSO** | Medium | **Gli eventi annullati erano spariti dal calendario, che era fatto per mostrarli.** Il predefinito nuovo di `listClubEvents` toglie `cancelled`, e nessuna schermata manda `include_cancelled`: la pastiglia «Annullato» che il calendario disegna e diventata irraggiungibile, e un evento annullato non si puo piu riaprire perche non si vede. La correzione di P0-3 ha risolto il conteggio e ha stretto troppo la lettura | **Chiuso nella stessa tornata.** Le due domande sono diverse — «lo conto?» e «lo mostro?» — e stringere la lettura le aveva risposte tutte e due insieme. I report continuano a escluderli; il calendario e la bacheca dell’allenatore mandano `include_cancelled`, cosi la pastiglia «Annullato» torna raggiungibile e con lei il **ripristino**, che senza la riga annullata non esisteva piu |
| **D-AUD-21** | Medium | **I due generatori coniano identificativi diversi per la stessa fascia**: il cron `auto:<chiave>`, il browser `training-<data>-<slot>`. `skipDuplicates` non puo unificarli, quindi rigenerare dal calendario settimanale una fascia che il cron ha gia creato e poi annullata produce un doppione attivo | Un solo modo di nominare una fascia. La chiave del cron e gia deterministica e leggibile: il browser deve usare quella |
| **D-AUD-22** | Medium | **La creazione a blocchi non controlla le sovrapposizioni.** Il commento adesso lo dice invece di lasciarlo credere, ma resta vero: un allenamento generato puo occupare un campo gia occupato senza che nessuno lo sappia | Un avviso pretende qualcuno a cui darlo. La forma giusta e probabilmente registrarlo nel risultato della generazione, che gia torna alla schermata |
| **D-AUD-23** | Medium | **`categoryIdentity` rialloca a ogni token**, e `sameCategory` ricalcola l'identita della categoria per ogni record. Su `training/page.tsx` il costo e allenamenti x atleti x categorie x token x catalogo | `conosciute` e invariante per catalogo e si issa fuori; l'identita del lato «categoria» e invariante per ciclo esterno. Nessuna delle due cambia la semantica |
| **D-AUD-24** | Medium | **La durata di un allenamento che scavalca la mezzanotte non arriva ai contributi.** `resolveEndsAt` ora tiene la fine, ma `getTrainingDurationHours` sottrae **minuti d'orologio** da `HH:mm`: per un 22:00 → 00:30 fa `30 − 1320 < 0` e restituisce `null`. Le sessioni notturne restano contate zero ore | La durata si calcola sugli **istanti**, che il modello ora ha. E la stessa lezione del conflitto di struttura, un modulo piu in la |
| **D-AUD-25** | Low | `training_automation.generate` e mappata su `events.manage`, che e la stessa chiave di modifica e cancellazione: la capacita e stretta, il **permesso** no. E l'attribuzione SISTEMA vive solo in `createClubEventsBatch`: un contesto di sistema che passasse da `updateClubEvent` sarebbe registrato senza nessun attore | Un permesso per l'azione (`events.create`), oppure l'attribuzione spostata dentro `recordAuditEvent` |
| **D-AUD-26** | Low | `Object.freeze` sul contesto non congela il `Set` delle capacita: si possono aggiungere dopo la costruzione, scavalcando il vaglio del costruttore. Piu: un diniego di sistema non registra il nome del lavoro | Congelare anche il `Set`; passare `job` al diniego |
| **D-AUD-27** | Low | `UpcomingTrainings`, `trainer-categories-dashboard-page` e `medical/page` chiamano l'eleggibilita **senza catalogo**, quindi per loro due omonime restano una. Il censimento li dichiara (`catalogo: false`) — non sono una sorpresa — ma due sono superfici operative | Passare il catalogo: e gia in mano a tutte e tre |
| **D-AUD-28** | Low | `listExpiringAttachments` accetta uno `scope` e non lo consulta: nessun perimetro, ne atleti ne staff. Non raggiungibile oggi (unico chiamante e un'automazione server) | Applicare i due perimetri, o togliere il parametro che promette cio che non fa |
| **D-AUD-29** | Low | `stripClinicalAthleteFields(data, role)` degrada all'elenco dei soli vietati quando il ruolo e `undefined` (non quando e `null`). Non raggiungibile oggi, ma la distinzione fra i due e invisibile a chi chiama | Il predefinito deve essere l'elenco dei **dichiarati**, non dei vietati |

---

## La revisione ostile finale pre-deploy (2026-09-07)

Terza revisione ostile sull'integrato, condotta con il mandato di **dimostrare
che EasyGame non e pronto**. Quattordici reperti trovati e chiusi, tutti
riprodotti prima di essere corretti e verificati per mutazione dopo. Cio che
segue e il verbale: dove si e rotto, come si e misurato, e cosa lo tiene chiuso.

### Il metodo, e perche cambia il verdetto

Le due revisioni precedenti avevano letto il codice. Questa ha **misurato**, e
tre volte su quattordici la misura ha smentito la lettura, in un verso o
nell'altro:

- il rendiconto delle presenze *sembrava* rotto — le righe di
  `club_event_participants` non hanno una colonna `training_id` — e **funziona**,
  perche il registro generico la traduce in lettura;
- la porta di servizio su `trainings` *sembrava* teorica e rispondeva **200**;
- il reperto rosso di `pp-03-round4` *sembrava* un difetto di prodotto ed era un
  difetto **della sonda**.

Le sonde nuove sono tre, e restano:
`scripts/audit-finale-report-canonici-probe.mjs` (5/5),
`scripts/audit-finale-concorrenza-probe.mjs` (7/7),
`scripts/audit-finale-scritture-probe.mjs` (11/11).

### I reperti, per gravita

| # | Gravita | Cosa | Chiuso da |
|---|---------|------|-----------|
| **AUD-F0** | **Critical** | **Un gettone di accesso monouso, riscattato da due persone insieme, conia due tessere.** Fra il vaglio «gettone gia riscattato?» e la marcatura in fondo alla rotta passano quindici query: il club manda il codice sul gruppo di famiglia, padre e madre lo aprono nello stesso minuto, e la rotta risponde **200 tutte e due**. Gli utenti sono diversi, quindi `@@unique([organization_id, user_id, role])` non collide; il registro scrive `redemption_count: 1`, cioe **nega l'incidente** a chi lo cerca. Su un gettone di tutore sono due account nel fascicolo sanitario di un minore | Claim atomico prima della prima scrittura: `updateMany` condizionato sullo stato, `count !== 1` → 409. E la disciplina che `redeemAthleteInvite` applicava gia sulla stessa forma di riga, e che questa rotta non aveva seguito. `audit-finale-concorrenza-probe` `A-01..A-03` |
| **AUD-F1** | **High** | **Lo stesso incasso registrato due volte dallo stesso clic.** Il blocco di riga sulla rata chiudeva il **sovraincasso** — tre clic su 130 non incassano 150 — e non la duplicazione **dentro** la capienza: rata da 130, si registrano 50, il clic parte due volte per rete lenta, e cento euro risultano incassati per un versamento da cinquanta. Nessuna delle due righe e distinguibile da un incasso vero. Il canale online la sua unicita ce l'ha nel database (indice parziale su `external_payment_id`), e un incasso manuale ha quella colonna vuota: due canali sullo stesso denaro, uno solo difeso | `idempotency_key` coniata dalla finestra a ogni apertura, riconosciuta **dentro** il blocco di riga — cioe dopo il punto in cui la concorrenza si arbitra, che e la lezione scritta in `E8`. `tests/server/incasso-idempotenza.test.mjs` (7), mutation-verified |
| **AUD-F2** | **High** | **`D-INT-13b`: l'appello si registra su un evento gia annullato.** La guardia esisteva e decideva su una riga letta **fuori** dalla transazione che scrive: fra quella lettura e l'`upsert` passano un permesso, due perimetri e due letture di atleti, e in quella finestra un `PATCH {"status":"cancelled"}` fa in tempo a committare. Una guardia che si scavalca aspettando il momento giusto e un commento, non una guardia | Lo stato si rilegge **dentro** la transazione, sotto `FOR UPDATE` sulla riga dell'evento. `tests/server/evento-annullato-in-corsa.test.mjs` (12), mutation-verified; `pp-03-round5` `B-03` da rosso a verde |
| **AUD-F3** | **High** | **`D-AUD-9`: il rendiconto contava le convocazioni su un payload che nessuno scrive piu.** Non un numero approssimato: **zero**, su ogni gara, per sempre — e con esso la statistica per categoria e per atleta, e l'avviso «fra i convocati c'e un certificato scaduto», che quindi non si accendeva **mai**, nemmeno con due certificati scaduti in rosa | Il rendiconto legge le righe (`convocation_status`) con la stessa proiezione della bacheca, e porta gli **identificativi** — un conteggio non dice se lo stesso ragazzo e stato convocato dieci volte o dieci ragazzi una volta ciascuno; la rotta del calendario serve `convocated_athlete_ids`, filtrati sul perimetro di chi legge. `tests/lib/report-convocazioni-canoniche.test.mjs` (8), mutation-verified |
| **AUD-F4** | **High** | **La famiglia non vedeva la convocazione fatta dal club.** `resolveMatchParticipationStatus` deduceva «convocato» da ventotto grafie del payload: allenatore e segreteria vedevano la rosa, e nella bacheca di ogni famiglia la gara restava «Non registrato». Tre superfici sullo stesso fatto, e quella della famiglia leggeva l'unica copia non piu aggiornata | Decide la riga di partecipazione, che la funzione aveva gia in mano per la presenza; le grafie storiche restano come ripiego per le gare antecedenti alla migrazione |
| **AUD-F5** | **High** | **Il perimetro di sede non arrivava ai pagamenti** (`W6-D18`). `GET /api/v1/payment-transactions` serviva l'**intero libro cassa** del club a un ruolo recintato, e con lui gli identificativi delle rate; `PATCH /api/athlete-payments/:id` li accettava e riscriveva, annullava o **cancellava** la rata di un'altra sede — e la cancellazione porta via a cascata incassi, storni e rimborsi. Misurato: importo da 200 a 1 | Il perimetro sull'atleta della rata, con la stessa primitiva che usano gia appuntamenti, allegati e documenti; l'elenco **filtra** invece di negare, come fa il registro generico sulla stessa risorsa. `audit-finale-scritture-probe` `D-01..D-04`, mutation-verified |
| **AUD-F6** | **High** | **`club_resource_items` era una seconda porta sugli allenamenti.** `POST` con `resource_type: "trainings"` rispondeva **200**. La riga non ha un `club_events` — appello e convocazioni rispondono «Evento non trovato» — ma `getClubTrainings` fonde tre fonti e quella e una: compariva in tre schermate. E il generatore automatico la contava fra gli allenamenti gia esistenti, quindi **saltava la generazione** della fascia vera | `trainings` e `matches` in `DOMAIN_OWNED_RESOURCE_ITEM_TYPES`. `audit-finale-scritture-probe` `A-01`, `A-02` |
| **AUD-F7** | **High** | **`P0-1` era chiusa a meta: «Azioni su tutti» con una casella spuntata toccava quella sola**, mentre la conferma diceva «tutti gli atleti registrati». `risolviBersagliMassivi("all")` passava da `collectAthletesForExport`, la cui prima riga e «se c'e una selezione, sono quelli» — giusto per un foglio, sbagliato per una scrittura. E i due contatori «Totali» e «Azioni su tutti (N)» contavano le **tessere**: quaranta atleti di cui otto in due categorie diventavano quarantotto, che e la forma esatta del «213 contro 245» da cui P0-1 e nata | Due funzioni per due domande, con la paginazione scritta una volta sola; i conteggi sono di persone in tutti e due i rami. `tests/ui/azioni-massive-atleti.test.mjs`, `tests/ui/athletes-counters.test.mjs` |
| **AUD-F8** | Medium | **`P0-3` era chiusa a meta: gli annullati restavano nella bacheca dell'allenatore.** Il contesto chiede il calendario con `include_cancelled=1` — serve al ripristino, ed e la correzione di `D-AUD-20` — e da quella deroga discendeva «Allenamenti di oggi: 3» con due annullati per maltempo, e un allenamento annullato fra i **prossimi impegni**, indistinguibile: la pastiglia di quel riquadro e la stringa fissa «Allenamento» | «Lo conto?» e «lo mostro?» separate anche nel consumatore, non solo nella rotta |
| **AUD-F9** | Medium | **L'ordine delle categorie era scritto e non rileggibile dalla pagina che lo scrive.** `buildCategoryViewModel` e un oggetto chiuso e `sortOrder` non ci entrava: lo stato ottimistico faceva sembrare che la freccia funzionasse, e al ricaricamento successivo l'elenco tornava all'ordine di creazione. Piu un **secondo lettore** del posto, che guardava due grafie su quattro | Il modello di vista porta `sortOrder`, letto dalla primitiva del dominio (`readCategorySortOrder`, ora esportata), e il lettore della pagina delega a quella |
| **AUD-F10** | Medium | **Un evento annullato si spostava di data, campo e squadra.** Con lo stesso stato in entrata e in uscita `canTransitionEvent` risponde sempre di si, e `assertEventoNonConsolidato` esce subito su un evento senza righe: `PATCH {"status":"cancelled","date":"2027-01-20"}` rispondeva 200 e la riga veniva **riproiettata** in `clubs.trainings`, dove gli annullati restano | Su un evento non operativo l'unico atto e la **riapertura** ([ADR-0157](18-decision-log.md)). Il ripristino resta aperto, e titolo, note e allenatori restano correggibili |
| **AUD-F11** | Medium | **La risposta della famiglia si scriveva su un evento archiviato**, che `TRANSITIONS` non lascia riaprire, ne annullare, ne su cui fare l'appello. Tre colonne, tre scrittori, e due regole di stato diverse fra loro — che e la divergenza per cui ADR-0086 e ADR-0099 esistono | `canAnswerRsvp` chiude `archived` con il suo motivo, come `assertEventoAperto` fa gia per le altre due colonne |
| **AUD-F12** | Medium | **Il cron fondeva le omonime di due sedi**: `athleteMatchesAnyCategory` chiamata senza catalogo, con il catalogo in mano da centosettanta righe. L'allenamento generato per Formia nasceva con gli attesi di Formia **piu** quelli di Scauri, e quel numero finisce in colonna e da li nel denominatore delle presenze. Stessa omissione su `medical/page` — dove cio che compare in piu e lo **stato sanitario di un minore** di un'altra sede — su `UpcomingTrainings` e sull'organico dell'allenatore (`D-AUD-27`) | Il catalogo passato in tutti e quattro; `scripts/censimento-eleggibilita.mjs` li dichiara ora `catalogo: true` |
| **AUD-F13** | Low | **Un identificativo malformato faceva arrivare al browser il testo interno di Prisma** (`A-05b`, classe `W4-R14`): `athletes.id` e un `uuid`, quindi `WHERE id IN ('non-e-un-uuid')` non risponde «nessuno», **fallisce**, e l'errore risale con nome del modello, invocazione e codice PostgreSQL | Cio che non ha la forma di un identificativo non e un atleta di questo club. Non si distingue con una parola nel messaggio ne con un codice — Prisma classifica lo stesso rifiuto in due modi — quindi si chiede **al database**: rieseguita la stessa lettura con un elenco vuoto, se risponde a non andare bene erano i valori; se non risponde, l'errore originale risale intero. `pp-03-eventi-scope-ruoli-probe` da 76/77 a 77/77 |

### I tre reperti rossi preesistenti, riclassificati

Erano tre, e il verbale precedente li dichiarava «preesistenti e invariati». Il
confronto storico c'era ed era corretto: le tre sonde erano state rieseguite su
`fcedf82` e rispondevano identiche. Questa passata li ha **risolti tutti e
tre**, e in due modi diversi — che e il punto:

| Sonda | Prima | Dopo | Natura |
|-------|-------|------|--------|
| `pp-03-round5-concorrenza-e-grafie-probe` (`B-03`) | 7/8 | **8/8** | **Difetto di prodotto** (`AUD-F2`): l'appello si registrava su un evento annullato in corsa |
| `pp-03-eventi-scope-ruoli-probe` (`A-05b`) | 76/77 | **77/77** | **Difetto di prodotto** (`AUD-F13`): il testo interno di Prisma arrivava al browser |
| `pp-03-round4-etichette-e-concorrenza-probe` | si fermava | **7/7** | **Difetto della sonda.** Chiamava `POST /api/v1/events/:id`, che non ha mai avuto un handler — gli atti sui partecipanti stanno su `/events/:id/participants`, e le voci sono `athleteId`/`status`. Moriva con `NESSUN-HANDLER` prima di misurare qualunque cosa. Round 5 era stato scritto apposta per eseguire cio che questa sezione impostava e non eseguiva; ora la sezione lo esegue da se |

**Una sonda rossa per un difetto proprio e peggio di nessuna sonda**: dichiara
coperta una domanda che non ha mai posto, e la ripete a ogni passata. Le tre
righe qui sopra sono la ragione per cui «preesistente» non e una
classificazione sufficiente: dice che il difetto non e nuovo, non che sia stato
capito.

### Cio che si e cercato e **non** si e trovato

Detto perche un audit che elenca solo cio che ha trovato non dice quanto e stato
guardato:

- **nessun IDOR cross-club sfruttabile**: `assertActiveClub` e il proprietario
  unico del confine, e la scansione di tutti i `findUnique`/`findFirst` di
  `src/lib/server/**` con `where: { id }` privo di `organization_id` non ha
  lasciato residui — quelli che sembrano l'anti-pattern di ADR-0094 passano
  tutti il club **della riga** a `resolveOrganizationScopeForUser`;
- **nessun percorso umano ottiene autorita di sistema**: l'unico costruttore di
  contesto di sistema e raggiungibile solo dal cron, che passa da
  `authorizeCronRequest` (503 senza segreto, confronto a tempo costante), e la
  `POST` umana passa **sempre** un `caller`. Nessuna rotta accetta un parametro
  che selezioni attore, lavoro o contesto;
- **eventi automatici e umani hanno lo stesso scrittore canonico**: il cron passa
  da `createClubEventsBatch`, e l'unica `prisma.club.update` rimasta scrive
  `settings.lastRunAt`;
- **i quattro domini con matrice propria** (sport-work, accounting,
  communications, seasons) passano davvero da `narrowDomainPermission`, e
  nell'ordine giusto;
- **nessun `src/lib/server/**` importato da un componente client**: 276 file con
  `"use client"`, zero import;
- **nessuna fuga** di `password_hash`, credenziali cifrate, token o codici OTP;
- **convocazioni, presenze e RSVP** sono `upsert` su chiave unica: nessuna
  perdita di aggiornamento su JSON, verificato anche sotto concorrenza vera
  (`pp-03-round4` `B-02b`);
- **`athlete_category_memberships`** ha il vincolo di unicita, e l'unico
  inserimento di massa usa `skipDuplicates` con la bandiera primaria riassegnata
  dopo — corretto anche nel caso in cui `ON CONFLICT DO NOTHING` salti la riga
  di destinazione.

### I Medium e i Low che restano

Nessuno sfruttabile oggi, e nessuno blocca la finestra di migrazione.

| # | Gravita | Cosa | Da dove si riparte |
|---|---------|------|--------------------|
| **D-AUD-21** | Medium | I due generatori coniano identificativi diversi per la stessa fascia, e la deduplica del browser legge il calendario **senza** `include_cancelled`: rigenerare una fascia che il cron ha creato e qualcuno ha annullato produce un doppione **attivo** accanto all'annullato. L'annullamento e di fatto reversibile per errore. Stessa cecita in `clearUpcomingGeneratedTrainings`, che gli annullati non li ripulisce mai | Un solo modo di nominare una fascia — la chiave del cron e gia deterministica e leggibile — e la lettura che include gli annullati |
| **D-AUD-22** | Medium | La creazione a blocchi non controlla le sovrapposizioni. Il commento adesso lo dice invece di lasciarlo credere | Registrarlo nel risultato della generazione, che gia torna alla schermata |
| **D-AUD-24** | Medium | La durata di un allenamento che scavalca la mezzanotte non arriva ai contributi: `getTrainingDurationHours` sottrae minuti d'orologio e per 22:00 → 00:30 restituisce `null`. Le sessioni notturne contano **zero ore** verso un ente | La durata si calcola sugli **istanti**, che il modello ora ha. E la stessa lezione del conflitto di struttura, un modulo piu in la |
| **D-AUD-6**, **D-AUD-7**, **D-AUD-13**, **D-AUD-14** | Medium | Invariati: il sollecito manuale che consegna il nome di un minore fuori dal club; il cruscotto di famiglia che elenca i tutori revocati; `secretariat_notes` e `club_events` letti dal registro generico senza il perimetro di sede; i byte del documento d'identita raggiungibili con il solo `clinical.status_read` | — |
| **Il rollover blocca le schede dopo le righe figlie** | Medium | `season-memberships.ts` scrive `athlete_category_memberships` e **poi** chiama `bloccaSchede`. `athlete-lock-order.ts` detta l'ordine opposto e lo nomina: «prima la scheda, poi le sue righe». Il ciclo completo non si chiude oggi — gli altri due percorsi sulle membership scrivono in autocommit — ma resta la violazione dichiarata e la corsa rollover-contro-rollover | Il lotto unico prima di ogni scrittura, come fa gia la revoca di una tessera |
| **La cancellazione dell'interessato non e una transazione** | Medium | `data-subject.ts` cancella una decina di tabelle figlie in autocommit: un errore a meta lascia l'interessato **parzialmente cancellato** — righe figlie sparite, nome e indirizzo sulla scheda, `anonymized_at` non scritto. Su una richiesta GDPR «cancellato a meta» e indistinguibile da «non cancellato» per chi non va a guardare | Una transazione, o un marcatore di avanzamento che una schermata sappia leggere |
| **Il pre-controllo delle sovrapposizioni e legato al giorno** | Medium | Il rilevamento lato server copre i giorni adiacenti e la mezzanotte; l'avviso del browser richiede lo **stesso giorno** e lo **stesso campo**, quindi non si accende e il salvataggio parte con `allowOverlap: false`: il server **rifiuta**, e la regola dichiarata — «la sovrapposizione e un avviso, non un muro» — e irraggiungibile proprio nei casi che il rilevamento ha appena reso visibili. Piu: l'editor dell'allenatore e la pagina Gare non mandano mai `allowOverlap` | Il pre-controllo sugli istanti, come il server |
| **`W4-R14` sulle altre due rotte** | Medium | `athletes/[id]/documents/[documentId]/file` e `forms/assets/[assetId]` rispondono **500** a un errore che *contiene* «Accesso negato», e non passano da `publicErrorMessage`. Non e un bypass — la porta si chiude — ma e una mappatura sbagliata sul monitoraggio e un leak di implementazione, sulla rotta che consegna i byte di un certificato medico | La mappatura che le altre rotte hanno gia |
| **`documents/:kind/:id/cancel` senza perimetro** | Medium | La **stampa** dello stesso documento applica `athleteWithinAccessScope`; l'annullamento no, e costruisce a mano uno scope che il perimetro non ce l'ha. Serve l'identificativo del documento, che le altre porte ora nascondono — da cui il Medium invece del High | La stessa primitiva della stampa |
| **`medical-certificate-reminders` senza perimetro** | Low | Il confine di club c'e, il perimetro no: un ruolo recintato fa partire notifiche ed email a nome della societa ai tutori di un atleta fuori dal proprio perimetro, e la risposta gli conferma quanti sono. Nessun dato personale esce, ma e un effetto verso terzi e una conferma d'esistenza | `athleteWithinAccessScope`, come le altre |
| **D-AUD-25**, **D-AUD-26** | Low | Invariati, e nessuno raggiungibile oggi: `training_automation.generate` e mappata su `events.manage`, che e anche modifica e cancellazione — il granulo del permesso e piu largo di quello della capacita; il `Set` delle capacita non e congelato (`Object.freeze` non lo tocca) e il test che lo nega prova solo l'oggetto esterno; l'attribuzione SISTEMA vive in **un punto su sei** | — |
| **D-AUD-23**, **D-AUD-28**, **D-AUD-29** | Low | Invariati | — |
| **`CLUB_DIRECT_UPDATE_FIELDS` elenca ancora `trainings` e `matches`** | Low | Un chiamante che passasse quelle chiavi farebbe fallire **l'intero** salvataggio del club con un 403, mentre si stava modificando l'indirizzo | Toglierle dalla tabella dei campi |
| **`getClubTrainings` interroga una tabella che non esiste** | Low | `supabase.from("trainings")`: terza fonte morta accanto alle due vive, inghiottita da un `console.warn`, su una funzione chiamata da tre schermate | WP-07 |
| **`D-AUD-27` per i due che restano** | Low | `simplified-db.ts` (in riduzione, WP-07) e `clothing-inventory-utils.ts` chiamano l'eleggibilita senza catalogo. Gli altri quattro sono stati chiusi | Passare il catalogo, o WP-07 |

### La revisione della correzione, e i tre High che ha trovato

Le correzioni di questa passata sono state a loro volta sottoposte a una
revisione ostile, sul solo diff. Ne ha trovati **tre di gravita alta, tutti
introdotti qui**, e vale la pena elencarli perche sono la prova che «ho
corretto» non e una misura:

| # | Cosa avevo rotto | Come |
|---|------------------|------|
| **AUD-R1** | **Chiudere la porta di servizio su `trainings` chiudeva anche la lettura e la cancellazione.** `DOMAIN_OWNED_RESOURCE_ITEM_TYPES` governa tre verbi, non uno: mettere `trainings` li dentro faceva perdere a `getClubTrainings` una delle sue tre fonti **in silenzio** (403 inghiottito da un `console.warn`), faceva sparire i due allenamenti del seme dimostrativo da tre schermate, e rendeva le righe fantasma **gia in archivio** insieme invisibili e non cancellabili — cioe la correzione chiudeva la porta lasciando dentro i fantasmi che quella porta aveva prodotto | Una seconda lista, `WRITE_ONLY_DOMAIN_OWNED_RESOURCE_ITEM_TYPES`, e un verbo passato alla guardia: scrittura chiusa, lettura e bonifica aperte. `audit-finale-scritture-probe` `A-03` e `A-04` lo misurano, ed erano il controspecchio che mancava |
| **AUD-R2** | **Un N+1 di due query per evento sulla rotta del calendario.** Chiamavo la guardia del perimetro **dentro un ciclo**: fino a **quattromila letture in fila** su una pagina da duemila eventi, sulla stessa rotta il cui commento, due riquadri piu su, rivendica «un `groupBy` per l'intera pagina invece di una lettura per riga». Piu un `catch` **nudo** che inghiottiva i guasti d'archivio — la rotta rispondeva 200 con le rose vuote — e una riga di audit `permission.denied` per ogni evento fuori recinto, cioe su una lettura legittima | Il perimetro si legge una volta e si giudica in memoria. Il predicato di sede e categoria e stato **estratto** invece di riscritto: `assertAccessScopeOnEvent` e il filtro chiamano la stessa funzione |
| **AUD-R3** | **Il claim atomico bruciava il gettone su un rifiuto legittimo.** Il commento dichiarava «sta dopo tutti i rifiuti legittimi»: era **falso**. Il soffitto del perimetro si giudica dopo, e cosi le scritture del profilo e del legame di tutela — otto punti di fallimento, nessuno in transazione con il consumo. Il caso peggiore: tessera di genitore creata, tutela **non** collegata, e nessun gettone per rifarla. Piu: `{ not: "redeemed" }` accettava anche `revoked`, quindi una revoca in corsa veniva **sovrascritta** | Il consumo si **disfa** se cio che viene dopo fallisce (`ripristinaGettone`), e la condizione e l'elenco chiuso degli stati riscattabili. Il commento adesso dice dove il claim sta davvero |

Altri quattro reperti minori della stessa revisione sono stati chiusi nello
stesso giro: la sonda `in: []` che mascherava un timeout e faceva risultare
estranei anche gli identificativi buoni (con una riga di audit che dichiarava
venti atleti fuori dal club quando erano zero); la guardia in transazione che
falliva **aperta** quando la rilettura non trovava la riga; il duplicato di un
incasso che rispondeva **201** e scriveva un audit di creazione — rimettendo nel
registro i due «incasso registrato» che la chiave toglie dall'archivio; e la
proiezione che azzerava `convocated_athlete_ids`, cioe la **risposta canonica
del server**, sulle tre schermate che le righe non le hanno in mano.

Ne restano due, dichiarati: la creazione di un incasso **senza rata** non passa
dalla chiave di idempotenza (il blocco che la arbitra e sulla rata, e li non
c'e), e `athleteIdsWithinAccessScope` carica gli identificativi dell'intero
perimetro anche quando il filtro ne nomina uno solo.

**La lezione.** Tre difetti di gravita alta in un diff di correzioni scritto per
chiudere difetti di gravita alta, e due dei tre erano **regressioni
funzionali**, non sviste di stile. Una correzione non e verificata dal fatto di
essere una correzione: la sonda che misura il difetto va accompagnata dal
controspecchio che misura cio che non deve smettere di funzionare. `A-03` e
`A-04` di `audit-finale-scritture-probe` esistono solo per questo, e sono nate
dopo — cioe troppo tardi per essere un merito.

### I gate di questa passata (2026-09-07)

| Gate | Esito |
|------|-------|
| `npm test` | 5.191 / 5.191 |
| `npm run typecheck` | nessun output |
| `npm run lint` | 0 errori, 34 warning — **gli stessi 34** |
| `npm run build` | completato |
| `scripts/censimento-eleggibilita.mjs` | 4/4 |
| `scripts/pp-02-censimento.mjs` | 5/5 |
| `scripts/pp-02-mutazioni.mjs` | 18/18, albero identico a prima |
| `scripts/critical-automazione-sistema-probe.mjs` | 21/21 |
| `scripts/pp-03-eventi-scope-ruoli-probe.mjs` | **77/77** (era 76/77) |
| `scripts/pp-03-round4-etichette-e-concorrenza-probe.mjs` | **7/7** (si fermava) |
| `scripts/pp-03-round5-concorrenza-e-grafie-probe.mjs` | **8/8** (era 7/8) |
| `scripts/audit-finale-report-canonici-probe.mjs` | 5/5 |
| `scripts/audit-finale-concorrenza-probe.mjs` | 9/9 |
| `scripts/audit-finale-scritture-probe.mjs` | 13/13 |
| `scripts/pp-02-uat.mjs` | **269/269** (era 265/269) |
| `scripts/pp-04-atleta-probe.mjs` | **125/125** (si fermava a circa il 60%; 114/123 dopo la prima correzione) |
| `scripts/riscatto-perimetro.mjs` | 31/31 |
| `scripts/pp-05-sicurezza-probe.mjs` | 14/14 |
| `scripts/pp-05-gettone-tessera-probe.mjs` | 5/5 |

### Due sonde rosse che nessuno aveva riclassificato

Il verbale precedente elencava **tre** sonde rosse. Ce n'erano cinque: due non
erano nell'elenco, e il confronto storico su `85876ee` le mostra rosse
identiche — quindi preesistenti, e mai guardate.

Entrambe per la stessa ragione, che e la terza volta che compare in questa
passata: **una semina rimasta indietro rispetto al dominio.**

`pp-02-uat` scriveva `athletes.user_id` e basta. Da ADR-0117 «questa persona e
ancora un atleta di questo club?» ha una risposta sola, e chiede una **tessera**
il cui ruolo risolto valga `athlete`: lo scrittore canonico
(`redeemAthleteInvite`) le scrive **insieme**, nella stessa transazione. Con la
tessera nella semina la sonda passa a **269/269**, e le tre prove che fallivano
tornano a misurare il prodotto invece di se stesse.

`pp-04-atleta-probe` moriva a meta su un vincolo che il dominio **dichiara** —
«esiste gia un invito in corso per questo atleta: reinvialo o revocalo prima di
crearne un altro» — perche la semina ne creava un secondo senza chiudere il
primo. Tolto quello, la sonda arriva in fondo, e si vede la seconda meta del
problema: i tutori sono seminati **solo** dentro `athletes.data.guardians[]`,
che da WP-C e una proiezione in sola lettura (ADR-0135, ADR-0153). Con zero
righe in `athlete_guardians`, `P-81` e `P-82b` misuravano una guardia **muta**:
il verde di una difesa che non ha niente da confrontare e indistinguibile da
quello vero, ed e il modo peggiore in cui una sonda puo sbagliare. Seminata la
riga dal proprietario del dominio, le due prove diventano verdi per la ragione
giusta.

**Sui dati veri non c'e nessun difetto**, e la verifica e stata fatta prima di
concludere: la migrazione `20260905120000_pp02_tutore_e_una_riga` legge il blob
e scrive le righe, quindi ogni club esistente le ha. Un atleta seminato **dopo**
quella migrazione no — ed e l'unico caso in cui il blob resta solo.

### Il debito che resta sulle sonde

| # | Cosa | Da dove si riparte |
|---|------|--------------------|
| ~~**AUD-S1**~~ **CHIUSA** (2026-09-08, e la classificazione era sbagliata: vedi in fondo) | `pp-04-atleta-probe`: nove prove su 123 restavano rosse, con **una sola causa** identificata. Le sezioni della famiglia seminano i tutori nel blob **dentro le proprie fasi**, e il legame lo scrivono come `linkedUserId` — che e il nome della **proiezione**, mentre la riga lo chiama `user_id` e lo scrive un secondo proprietario (`linkGuardianAccount`, non `saveGuardianRegistry`). Non e un difetto di prodotto: la stessa proprieta — «il tutore provato continua a vedere il figlio, prima e dopo i due gesti che tolgono l'accesso» — e misurata da `pp-02-uat`, che passa dagli scrittori canonici ed e a 269/269 | Portare le semine della famiglia sui **due** scrittori del dominio, come e stato fatto per `P-81`/`P-82b`. `allineaTutoriDalBlob` fa gia il gesto della migrazione, legame compreso, e va chiamata **dentro** le fasi invece che solo prima |

**La lezione, e vale piu dei nove reperti.** Una sonda che semina scrivendo in
archivio invece di passare dal dominio smette di misurare il prodotto nel
momento esatto in cui il dominio cambia — e smette **in silenzio**: resta verde
dove la difesa e diventata muta, e diventa rossa dove non c'e niente di rotto.
Nessuna delle due cose si vede leggendo il numero in fondo.

Le tre sonde nuove di questa passata seminano il minimo con Prisma e **agiscono**
sempre dalle rotte, che e l'unico modo in cui l'invecchiamento di una semina si
manifesta come un fallimento onesto invece che come un verde falso.

---

## `AUD-S1` chiusa, e la classificazione che l'aveva aperta era sbagliata (2026-09-08)

`pp-04-atleta-probe` e a **125/125**. Ma il modo in cui ci e arrivata smentisce
la voce che l'aveva registrata, e la smentita vale piu della chiusura.

### Cio che quella voce diceva, e perche era sbagliato

Diceva: «nove prove su 123 restano rosse, con **una sola causa** identificata»,
e la causa era la semina che scrive i tutori nel blob invece che nelle righe.

**Sette su nove, si.** Erano semine rimaste indietro rispetto a WP-C, e si sono
chiuse portandole sui due scrittori del dominio — `saveGuardianRegistry` per
l'anagrafica e `linkGuardianAccount` per il legame, che sono due proprietari
distinti proprio perche collegare un account non e registrare un tutore
(ADR-0135). Il travaso della semina fa ora lo stesso gesto della migrazione,
legame compreso.

**Due su nove no**, ed erano di natura opposta: `P-13` e `P-71` non misuravano
una semina invecchiata, misuravano **attese invecchiate**. Il prodotto era
andato avanti — con due ADR — e la sonda era rimasta ferma:

| Prova | Attesa vecchia | Cosa era successo |
|-------|----------------|-------------------|
| `P-13` | il certificato porta **tre** chiavi | PP-02 §F ne ha aggiunte due, `detail` e `summary`, perche il ragazzo e il genitore leggessero le **stesse parole**: prima al ragazzo si diceva «Certificato mancante» per un certificato consegnato senza scadenza, mentre sulla Home il genitore leggeva «Consegnato» |
| `P-71` | la scrittura sulle notifiche e **403** | ADR-0122 ha aperto il ramo «sono io» **deliberatamente**: senza, la campanella del ragazzo non si spegneva mai — lo stesso difetto che gli aveva spento la bacheca, sul pulsante accanto |

### Come sono state chiuse: irrigidendole, non rilassandole

Questa e la parte che conta. Una sonda rossa per un'attesa superata si «chiude»
in due modi, e uno dei due e una bugia:

* si allenta l'attesa fino a farla passare — e da quel momento la prova non
  misura piu niente;
* si guarda **cosa rendeva sicura la cosa nuova**, e si pretende quella.

`P-13` ora elenca le cinque chiavi **e** pretende che `detail` e `summary` non
portino niente di clinico: le due chiavi nuove sono descrizioni di stato —
`describeMedicalCertificateForFamily` compone un'etichetta e una data, «Scade il
12/03/2027» — e non leggono ne diagnosi, ne note, ne l'indirizzo del file.
Contare le chiavi e cio che si puo fare da fuori; guardare dentro le due nuove e
cio che serve, e l'attesa vecchia non lo faceva.

`P-71` ora pretende **200** e, accanto, che la scrittura **non chiuda la
notifica del tutore**. Cio che rende sicuro quel 200 non e il permesso: e il
perimetro della scrittura, che filtra su `user_id` e poi su
`notificationBelongsToAthlete`. Un 403 avrebbe misurato una porta chiusa;
questo misura cosa succede quando e aperta, che e la domanda vera.

### La lezione, che e diversa da quella della voce precedente

Una sonda invecchia in **due** modi, non uno. La semina che resta indietro
rispetto al dominio la rende rossa dove non c'e niente di rotto — ed e la
lezione che `AUD-S1` aveva gia scritto. Ma l'**attesa** che resta indietro
rispetto a una decisione di prodotto fa la stessa cosa, e assomiglia cosi tanto
alla prima che si e tentati di trattarle insieme. Trattarle insieme e
esattamente cio che questa voce aveva fatto: nove reperti, una causa. Erano
due, e la seconda non si chiudeva toccando la sonda — si chiudeva andando a
leggere **perche** il prodotto aveva cambiato idea.

Il rischio di sbagliare quella diagnosi ha un verso solo, e non e simmetrico:
chi crede che una prova rossa sia sempre colpa della semina la aggiusta finche
passa, e la prima volta che il rosso era un difetto vero lo aggiusta lo stesso.

---

## Quello che la lane N10–N14 ha trovato e non ha risolto

Tre cose, tutte fuori dal mandato della lane e tutte reali. Stanno qui e non in
un commit perche `CLAUDE.md` §3 lo dice: un problema fuori scope si annota, non
si risolve mentre si sta facendo altro.

### D-VOU-1 — Il portale della famiglia non conosce la copertura da voucher

**Dove.** `src/lib/server/parent-dashboard.ts` compone `payments.items` da
`getAthleteEnrollmentSummary`, e ne restituisce `totalDue`, `totalPaid` e
`remaining` **lordi**. `src/components/parent-dashboard/parent-dashboard-pages.tsx`
li disegna e apre il checkout sulla prima rata non saldata.

**Il fatto.** Da ADR-0158 una rata puo essere coperta da un voucher, e da
ADR-0159 la scheda del club mostra alla segreteria la quota **della famiglia**.
Il portale della famiglia continua a mostrare il lordo: su una rata da 200
coperta per 150 dice «200 da pagare», e «Paga ora» apre il checkout su quella
cifra. La famiglia versa centocinquanta euro che l'ente sta gia portando.

**Perche non e stato chiuso qui.** Il mandato N10–N14 riguarda la scheda del
**club**, e il portale della famiglia e un'altra superficie con un'altra
proiezione e un altro checkout. Chiuderlo di straforo avrebbe portato il diff
oltre il doppio e toccato il flusso di incasso online.

**Cosa serve.** `parent-dashboard.ts` deve leggere `payment_coverage_allocations`
e comporre con `resolveInstallmentCoverage`, esattamente come fa
`useAthletePaymentLedger`; il checkout deve ricevere la rata ridotta
(`withFamilyShare`), che e la correzione H2 gia applicata alle due superfici del
club. Il dominio c'e gia: manca il consumatore.

**Gravita.** Alta finche un club in produzione usa i voucher **e** il portale
della famiglia insieme. Sul pilota oggi il portale non e in uso.

### D-VOU-2 — Le affordance dei pagamenti sono spente per i ruoli personalizzati

**Dove.** `useAthletePaymentLedger` ricava `allowManagement` da
`canManageClubConfigurationAsActor(readStoredActiveClub()?.role)`.

**Il fatto.** Quel predicato rifiuta ogni ruolo personalizzato per costruzione,
mentre il **server** accetta chiunque passi `canAccessClubResource(role,
"payments", "update")` — che un `custom:club_manager:*` con `accounting.read`
passa. Un collaboratore o un ruolo personalizzato di segreteria puo registrare
un incasso secondo il server e non vede il pulsante.

**Perche non e stato chiuso qui.** Cambiarlo accende pulsanti su **tutta** la
superficie dei pagamenti — incassi, storni, ricevute, rimborsi — anche per
`collaborator` e `staff`, e non e una conseguenza di N10–N14: e una decisione di
prodotto sul perimetro degli incassi. ADR-0159 ha chiuso lo stesso difetto per i
soli contributi, dove la chiave e nata con la lane.

**Cosa serve.** Decidere se il perimetro visibile degli incassi debba
coincidere con quello che il server gia applica, e in caso affermativo far
dichiarare al server `canManage` accanto ai dati, come fa
`getAthleteFundingOverview`.

### D-VOU-3 — La revoca di un'adesione non e atomica sulle coperture

**Dove.** `reverseAllCoverageForEnrollment` in
`src/lib/server/payment-coverage.ts`: un ciclo che chiama `reverseCoverage` una
riga per volta, e ognuna apre la **propria** transazione.

**Il fatto.** Se la seconda di tre fallisce — uno storno concorrente, un timeout
sul blocco della rata — la prima resta stornata e l'adesione resta `active`. La
rotta risponde «Annullamento non riuscito», e chi ha premuto crede
ragionevolmente che non sia successo niente, mentre una rata e gia tornata a
carico della famiglia.

**Perche non e stato chiuso qui.** Metterle in una transazione sola significa
prendere N blocchi di rata in un ordine, e l'ordine dei blocchi fra rate,
adesioni e incassi e governato da ADR-0138: e una modifica al protocollo di
`lockInstallmentAndTransaction`, non un `$transaction` in piu. Il ramo che
**cancella** e stato reso atomico dalla lane (ADR-0159), perche li bastava.

**Cosa serve.** Un ordine dichiarato per le rate coinvolte — crescente per
identificativo, in un lotto solo, come impone
`src/lib/server/athlete-lock-order.ts` — e una transazione che le comprenda
tutte. Oppure, se il costo del blocco lungo non e accettabile, una ripresa
idempotente: la revoca e gia ripetibile, e basterebbe che la rotta lo dicesse a
chi ha premuto invece di lasciare intendere che non sia successo niente.

### D-VOU-4 — `confirmAccrualPeriods` verifica il tetto fuori dalla transazione

**Dove.** `src/lib/server/funding.ts`, `confirmAccrualPeriods`.

**Il fatto.** La somma dei confermati si vaglia contro l'importo assegnato
**prima** di aprire qualunque scrittura, e senza `SELECT … FOR UPDATE`
sull'adesione. Due conferme simultanee su periodi diversi leggono la stessa
capienza e passano entrambe. `decideAccrualPeriod` non ha il difetto — blocca
l'adesione e rilegge dentro — e la differenza fra le due funzioni e proprio la
misura di cosa manca.

**Perche non e stato chiuso qui.** Vale per i soli programmi a fonte esterna, e
la correzione e la stessa forma gia applicata due volte (ADR-0158 §H3,
ADR-0159): merita una lane sua con la propria sonda su Postgres, non un
allineamento silenzioso dentro un commit che parla d'altro.

**Cosa serve.** Portare il vaglio dentro `$transaction`, dopo il blocco
dell'adesione, e una sonda che misuri due conferme concorrenti.

---

## Quello che la lane N15 ha trovato e non ha risolto

Cinque cose, tutte reali, tutte fuori dal mandato della lane. Stanno qui e non
in un commit perche `CLAUDE.md` §3 lo dice.

### D-LIQ-1 — Il vincolo di club sui conti vive solo nel SQL, non nello schema

**Dove.** `prisma/migrations/20260831090000_wave4_vincolo_conto_no_action/migration.sql`
dichiara `funding_settlements_conto_dello_stesso_club FOREIGN KEY
(organization_id, financial_account_id) REFERENCES financial_accounts(organization_id, id)`,
appoggiata a un `UNIQUE (organization_id, id)` su `financial_accounts`. Nessuna
delle due compare in `prisma/schema.prisma`.

**Il fatto.** Una rigenerazione dello schema — `prisma migrate dev`, o un
`db push` — le toglie **in silenzio**, e l'unica difesa che resta e
`assertContoDelClub`, che gira in TypeScript e fuori dalla transazione. Vale per
quattro tabelle, non solo per questa: incassi, prima nota, uscite del lavoro
sportivo e liquidazioni. La lane N15 non l'ha introdotto, ma ha reso quel
percorso raggiungibile dall'interfaccia per la prima volta.

**Cosa serve.** Dichiarare `@@unique([organization_id, id])` su
`FinancialAccount` e le quattro relazioni composite nello schema, o — se Prisma
non le esprime — una prova che le cerchi in `information_schema` e fallisca se
mancano. La seconda e piu onesta della prima.

### D-LIQ-2 — `assertContoDelClub` gira fuori dalla transazione

**Dove.** `src/lib/server/funding.ts`, prima di `$transaction`, e con il client
globale invece di quello transazionale.

**Il fatto.** Fra il vaglio e la scrittura un conto puo essere archiviato: la
finestra e stretta e l'unico predicato mutabile e `is_archived`, ma esiste. Il
vincolo composito la copre per il club, non per l'archiviazione.

**Perche non e stato chiuso qui.** Spostarlo dentro significa passargli il
client transazionale, e la stessa firma la usano altri tre domini: e un cambio
che va fatto per tutti e quattro insieme, con la sua sonda.

### D-LIQ-3 — Il client e il server leggono un importo in due modi

**Dove.** `SettleAccrualDialog` fa `Number(String(x).replace(",", "."))`;
`toFundingAmount` fa `parseFloat` dopo aver sostituito **la prima** virgola.

**Il fatto.** `"1.234,56"` — un modo ordinario di scrivere milleduecentotrentaquattro
euro — per il client e `NaN` e viene rifiutato; per il server e `1.23`. La
finestra e al sicuro perche rifiuta prima, ma qualunque altro chiamante della
rotta — uno script, un'integrazione — registrerebbe **un euro e ventitre**.

**Cosa serve.** Un solo lettore di importi, esportato dal dominio e usato dalle
due parti. E una correzione che tocca ogni finestra di importo del prodotto,
non solo questa.

### D-LIQ-4 — Lo storno non blocca il periodo che ricalcola

**Dove.** `reverseFundingSettlement` ricalcola lo stato di ogni periodo toccato
con una lettura semplice, senza `SELECT … FOR UPDATE` — mentre `misuraCapienza`,
nella funzione gemella, il blocco lo prende.

**Il fatto.** Uno storno intrecciato con un accredito nuovo sullo stesso periodo
puo scrivere uno stato calcolato prima che l'altro committi. Il **denaro** resta
giusto — entrambi lo derivano dalle righe — ma lo stato puo restare vecchio, e
lo stato e cio che governa la riscrittura del maturato (vedi la guardia di
ADR-0160 §F2).

### D-LIQ-5 — La forma in blocco non pretende un conto

**Dove.** `POST /api/v1/funding/settlements` con `program_id` e `lines`.

**Il fatto.** La forma per periodo pretende il conto — senza, il denaro non
entrerebbe in nessun saldo — e quella in blocco no, per tolleranza verso le
righe registrate prima che il conto esistesse. Una liquidazione senza conto
compare comunque nel registro, ma **non** in nessun saldo di conto: due letture
della stessa cassa che non tornano.

**Perche non e stato chiuso qui.** Renderlo obbligatorio e un cambio di
contratto su una rotta che oggi nessuna schermata usa in quella forma, e
andrebbe accompagnato da cosa fare delle righe gia scritte senza conto.

## Debito trovato durante il reskin visivo Trainer, non toccato perche fuori scope (WP10, 2026-09-10)

### D-MOB-1 — Schermate Trainer/Parent orfane in `easygamemobile/client/screens/` — `RISOLTO` (WP13, 2026-09-11)

**Dove (erano).** `TrainerHomeScreen.tsx`, `TrainingsScreen.tsx`,
`MatchesScreen.tsx`, `AthletesScreen.tsx`, `ProfileScreen.tsx` — a fianco
delle omonime `TrainerXDashboardScreen.tsx`/`TrainerXScreen.tsx` che i
navigator (`HomeStackNavigator` e affini) importano davvero.

**Il fatto (allora).** Nessun file del repository le importava (verificato
con una ricerca testuale su tutto `easygamemobile/`): erano una seconda
implementazione mai raggiunta da nessuna rotta, lo stesso pattern che
`CLAUDE.md` §11 elenca fra gli errori tipici gia successi su questo
repository ("dashboard trainer", punto 1).

**Perche non era stato chiuso allora.** WP10 era migrazione visiva delle
schermate **raggiungibili**; cancellare file non importati da nessuno era
un cambiamento indipendente, sicuro ma estraneo al diff di quel WP
(CLAUDE.md §3: "vietato il refactoring opportunistico").

**Risolto in WP13.** Una riverifica testuale in apertura di WP13 ha trovato
il conteggio incompleto: **dieci** file orfani, non cinque — mancavano
`ContextSelectionScreen.tsx` (la rotta `"ContextSelection"` in
`RootStackNavigator` monta `AccountHubScreen`, mai questo file) e i
duplicati `TrainerMatchesScreen.tsx`/`TrainerProfileScreen.tsx`/
`TrainerTrainingsScreen.tsx` delle rispettive `...DashboardScreen`.
Verificato ancora zero riferimenti (nessun import, nessun test in
`tests/**`) prima della cancellazione: i dieci file sono stati rimossi in
un commit dedicato (`chore(mobile): rimuove le dieci schermate orfane`) —
cancellazione a rischio zero, non un reskin, tenuta separata dai commit
dei passi di `migration-v3.md` per la stessa ragione per cui non era
stata fatta in WP10.

### D-MOB-2 — Il contenuto padding di `SecondaryScreenLayout`/`ParentPrimaryScreenLayout` raddoppia sotto un `SectionHero`

**Dove.** Entrambi i gusci applicano `paddingHorizontal: Spacing.lg` (16px)
al proprio `ScrollView`; `SectionHero` applica **il proprio**
`paddingHorizontal: Spacing.xl` (20px), e ogni blocco di contenuto che i
consumatori aggiungono sotto l'hero ripete di norma lo stesso
`Spacing.lg`. Il risultato e un margine effettivo di 32–36px per lato
invece di 16–20px — gia cosi in `ParentHomeScreen` (WP5, non toccato da
WP10) prima che WP10 replicasse lo stesso schema sulle quattro tab Trainer
per coerenza con quanto gia spedito lato Parent.

**Perche non e stato chiuso qui.** E un comportamento gia in produzione dal
WP5, non introdotto da WP10; correggerlo tocca due componenti condivisi e
ogni schermata che li usa (Trainer e Parent insieme), un cambio visivo a se
che merita una verifica dedicata a 375px, non un effetto collaterale di
questo reskin.

### D-MOB-3 — `canSeeEnrollment` in `TrainerAthleteProfileScreen` e sempre `false`

**Dove.** `const canSeeEnrollment = false;`, con circa 90 righe di JSX
(tesseramenti, pagamenti, documenti identita) dietro quella guardia —
preesistente a WP10, portato sul nuovo linguaggio visivo senza toccarne la
condizione.

**Perche non e stato chiuso qui.** Rimuovere il ramo morto o accenderlo
davvero e una decisione di prodotto (quella sezione va mostrata al Trainer
o no?), non una scelta visiva: fuori perimetro per un WP dichiarato
"solo reskin".

## Debito aperto da push, deep linking e recupero password nativo (WP11, ADR-0166, 2026-09-10)

### D-MOB-4 — Nessuna pipeline di invio push

**Dove.** `src/lib/server/device-push-tokens.ts` registra e revoca token;
nessun dominio (`appointments.ts`, `club-notifications.ts`,
`medical-certificate-reminders.ts`, ecc.) invia una notifica push quando
scrive una riga in `notifications`.

**Perche non e stato chiuso qui.** Collegare ogni dominio che gia scrive
notifiche a un invio push reale (chiamata all'API push di Expo, gestione
degli errori di consegna, token scaduti/disinstallati da marcare revocati)
e un lavoro trasversale a se — tocca una decina di file di dominio, non
l'anagrafica dei destinatari che questo WP costruisce.

### D-MOB-5 — Il link di reset password non e un Universal Link

**Dove.** `src/app/auth/reset-password/page.tsx`; l'app mobile dichiara solo
lo schema personalizzato `easygame://` in `app.json`.

**Il fatto.** Il link che l'email porta resta un URL Web
(`{AUTH_BASE_URL}/auth/reset-password?...`): senza un dominio associato
reale (file `apple-app-site-association`, capacita "Associated Domains"
lato iOS, entrambi legati al Team ID Apple del progetto) il sistema
operativo non puo instradarlo all'app da solo. Il passaggio oggi e
manuale: la pagina Web offre un link con lo schema dell'app che l'utente
tocca lui stesso.

**Perche non e stato chiuso qui.** Il Team ID Apple non e ancora
disponibile in questo repository (WP12 tratta bundle identifier e
configurazione EAS); pubblicare un `apple-app-site-association` con un
identificativo segnaposto sarebbe peggio di non pubblicarlo — un file
pubblico che dichiara un legame falso.

### D-MOB-6 — Nessuno switch di contesto automatico su un deep link cross-club/cross-figlio

**Dove.** `client/lib/deep-linking.ts`, `client/lib/deep-link-navigator.ts`.

**Il fatto.** design-source `guidelines/component-specs.md` §G2 ("Wrong
context") descrive un link verso una risorsa di un altro club o di un
altro figlio come uno switch di contesto automatico con un banner che lo
dichiara. L'implementazione attuale naviga sempre nel contesto attivo: se
la risorsa non vi appartiene, la schermata di destinazione mostra il
proprio stato "non disponibile" (mai un errore grezzo, mai una lista
vuota indistinguibile) ma non cambia contesto da sola.

**Perche non e stato chiuso qui.** Lo switch automatico richiederebbe
sapere a quale club/figlio appartiene una risorsa **prima** di navigare —
una chiamata di risoluzione che oggi non esiste per nessuna delle
destinazioni del deep link — ed e un comportamento di navigazione nuovo,
non solo un instradamento.

### D-MOB-7 — Il banner una-tantum di richiesta permesso in Home non e implementato

**Dove.** `client/components/signature/NotificationPermissionCard.tsx`.

**Il fatto.** §G1 descrive due collocazioni per lo stato "Not requested":
una card permanente in Profilo → Notifiche (implementata) e, **al piu una
volta**, un banner discreto in fondo alla Home dopo la prima azione
significativa. Solo la prima e stata costruita.

**Perche non e stato chiuso qui.** Il banner una-tantum richiede uno stato
persistito ("l'ho gia mostrato") e una definizione di "azione
significativa" per ciascun ruolo — una decisione di prodotto, non
un'estensione meccanica della card gia scritta.

### D-MOB-8 — La navigazione verso una tab Parent via deep link e "best effort"

**Dove.** `client/hooks/useDeepLinkRouter.ts`,
`client/lib/deep-link-navigator.ts` (`navigateWhenReady`).

**Il fatto.** `ParentTabNavigator` monta le sue cinque tab solo dopo che
`ParentContext` ha caricato i figli collegati (`ParentGate`). Un deep link
verso una destinazione Parent ricevuto durante quel caricamento riprova la
navigazione per un numero limitato di tentativi (10, ogni 300ms) e poi
abbandona in silenzio: l'utente resta sulla Home del proprio ruolo, mai su
una schermata rotta, ma non necessariamente sulla destinazione esatta se il
caricamento e insolitamente lento.

**Perche non e stato chiuso qui.** Un'attesa garantita richiederebbe che
`ParentContext` esponesse una promessa "pronto" che il risolutore di deep
link potesse aspettare invece di ripetere un tentativo alla cieca — un
cambio all'interfaccia di un contesto condiviso con ogni schermata Parent,
non isolato a questo WP.

## Debito aperto da iOS hardening e release readiness (WP12, ADR-0167, 2026-09-10)

### D-MOB-9 — Nessuno stato persistente di offline/manutenzione/aggiornamento obbligatorio

**Dove.** L'app intera; design-source Parte F ("system, release and
connectivity states") lo prevede come stato distinto — un bollettino non
bloccante per l'offline, un blocco per la manutenzione, un blocco per una
versione troppo vecchia.

**Il fatto.** Ogni chiamata gestisce gia il proprio fallimento di rete
(`classifyFetchError` + `StateMessage kind="error"` con `Riprova`) — reale
e funzionante, non simulato. Cio che manca e un **rilevamento di
connettivita persistente** (un bollettino che compare quando il
dispositivo perde la rete, a prescindere da quale schermata sia aperta) e
un **blocco di manutenzione/versione minima**.

**Perche non e stato chiuso qui.** Il primo richiede una dipendenza nuova
(`@react-native-community/netinfo`, non presente); il secondo richiede un
meccanismo lato server (uno stato di manutenzione, una versione minima
dichiarata) che oggi non esiste nemmeno lato Web — costruirlo solo lato
mobile inventerebbe un contratto che il server non conosce.

### D-MOB-10 — La revoca di sessione a caldo non ha un test automatico

**Dove.** `client/services/api.ts` (`handleSessionExpired`,
`onSessionExpired`), `client/hooks/useAuth.ts`.

**Il fatto.** La logica e semplice (un contatore di iscritti, una guardia
su un token gia nullo) ma vive dentro una classe che parla con `fetch` e
`expo-secure-store` — nessuno dei due e mai stato mockato in questo
progetto (`tests/` copre solo moduli puri con `node --test`).

**Perche non e stato chiuso qui.** Costruire un'infrastruttura di mock per
`fetch`/`SecureStore` per un solo caso avrebbe superato il perimetro
dell'hardening. Se in futuro servisse testare altro nella stessa classe,
vale la pena costruirla una volta sola, non per questa singola guardia.

## Debito aperto dal reskin completo a EGDS v3.0.0 (WP13, ADR-0168, 2026-09-11)

### D-WEB — `normalizeOpeningHours` stampa come giorni le chiavi non-giorno (2026-09-11)

**Dove.** `src/lib/opening-hours-utils.ts`, ramo "oggetto per giorno":
`Object.entries(record)` non filtra le chiavi che non sono giorni (`id`,
`date`, `name` compaiono nell'oggetto `opening_hours` del club di
staging) e ne fa righe "Chiuso". Trovato nel passaggio di parita visiva
mobile: il porto mobile (`easygamemobile/client/lib/opening-hours.ts`)
tiene solo i sette giorni, in ordine di settimana. Da allineare sul Web
(commit Web separato, CLAUDE.md §3).

### D-MOB-11 — Le presenze mobile restano sul modello binario: il vero tri-state (`pending`) richiede un cambio di endpoint — CHIUSO (2026-09-11, parita visiva WP13)

**Chiusura.** Il vincolo che teneva aperto questo debito — "il mobile non
chiama `POST /api/v1/events/:id/participants`" — e caduto con il batch di
completamento funzionale (le presenze passano da quell'endpoint da
`f03854e`). Quell'endpoint fa un **upsert per riga**: nel passaggio di
parita visiva la riga cicla `da segnare → presente → assente → da segnare`
e al salvataggio le righe segnate vanno come present/absent, una riga
che il server aveva ed e tornata "da segnare" si riscrive come `pending`
(stato ammesso da `ATTENDANCE_STATUSES`), e chi non ha mai avuto una riga
resta senza riga — cioe lo stesso `pending` del dominio. Alla rilettura
una riga `pending` torna "da segnare": nessuno stato che viva solo sul
client, verificato a runtime con andata e ritorno dal server (2026-09-11).
Nessun cambio di endpoint, nessun nuovo campo. Il testo sotto resta come
storia della decisione.

**Dove.** `easygamemobile/client/services/mobile-backend-storage.ts`
(`saveTrainingAttendance`), `easygamemobile/client/services/api.ts`
(`TrainingAttendanceEntry.present: boolean`),
`TrainerTrainingsDashboardScreen.tsx` (toggle binario, `|| false` su
attendance non ancora segnata).

**Il fatto.** `migration-v3.md` passo 5 chiede un attendance a tre stati
(non segnato / presente / assente) con "assente" persistito come fatto
distinto da "non ancora segnato". Il backend gia lo rappresenta cosi:
`ClubEventParticipant.status` e il vocabolario chiuso `present | absent |
pending` (`src/lib/events/model.ts`), scritto **solo** da
`saveEventAttendance` in `src/lib/server/events.ts` dietro `POST
/api/v1/events/[id]/participants` (per la riga di ownership di CLAUDE.md
§2 su "Eventi sportivi"). Il mobile pero non chiama quell'endpoint: scrive
le presenze via `api.updateResource("trainings", …)`, che atterra sulla
proiezione JSON legacy `clubs.trainings[].attendance` — la stessa colonna
che ADR-0098 dichiara "sola lettura, un solo scrittore" (`events.ts`, non
la rotta generica). WP13 ha portato solo la **veste** del passo 5 (tile
navy, anello 30px, riga di progresso, "Segna tutti presenti", enfasi di
successo sul solo CTA di salvataggio) sul modello binario esistente,
senza introdurre uno stato "non segnato" che il backend non puo
confermare — vedi ADR-0168 punto 3.

**Perche non e stato chiuso qui.** Passare al tri-state reale significa
cambiare quale endpoint il mobile chiama per le presenze — un cambio di
contratto/dominio, non una scelta visiva, ed e esplicitamente escluso da
un WP dichiarato "solo reskin" (CLAUDE.md: adeguamenti al mobile ammessi
solo per sicurezza o per un cambio di contratto **deciso lato Web**).
Serve una decisione esplicita propria, con lo stesso proprietario
(`src/lib/server/events.ts`) che gia norma le scritture di presenza.

### D-MOB-12 — "Offline" e "Manutenzione" di `migration-v3.md` passo 7 restano sulla veste attuale, non sul bollettino/blocco previsti dal design

**Dove.** `easygamemobile/client/navigation/RootStackNavigator.tsx`,
`client/screens/LoginScreen.tsx` — non un file nuovo, e lo stesso gap gia
descritto da **D-MOB-9**, letto ora dal lato del reskin.

**Il fatto.** `migration-v3.md` passo 7 disegna "Offline" come bollettino
non bloccante e "Manutenzione" come schermata piena con due uscite. Nessuno
dei due stati esiste in questo codebase: D-MOB-9 spiega perche (nessun
`netinfo`, nessun contratto di manutenzione lato server). WP13 non ha
costruito ne l'uno ne l'altro — farlo sarebbe stata una **nuova area
funzionale**, esplicitamente fuori dal perimetro di ADR-0168 ("nessuna
nuova area funzionale" — reskin, non nuove capacita). Restano quindi sulla
veste precedente (l'errore inline per-schermata gia in campo), non su
`BrandStateLayout`.

**Divergenza dichiarata, non silenziosa (ADR-0168 punto 4).** "Sessione
scaduta" invece **e** stato affrontato: `LoginScreen` mostra ora un avviso
quando `signOutReason === "expired"` (passo 7d) — ma senza cambiare
*quando* la sessione si chiude, che resta il taglio immediato di WP12
(session hardening). La spec chiede un foglio che tiene montata la
schermata sotto; qui si e scelto di non farlo perche cambiare quel timing
e logica di sicurezza, non veste — fuori dal perimetro "same logic, new
dress" di questo WP. `withSignOutReason` (`client/lib/auth-flow.ts`) ha
anche aggiunto tre test (`tests/auth-flow.test.ts`) alla forma dello stato
di sign-out — una fetta di **D-MOB-10**, non la sua chiusura: la classe
`handleSessionExpired`/`onSessionExpired` in `api.ts` resta senza mock di
`fetch`/`SecureStore`.

**Perche non e stato chiuso qui.** Offline/Manutenzione richiedono
infrastruttura nuova (D-MOB-9, invariato). Il foglio di sessione scaduta
richiederebbe di ritardare un taglio di sicurezza deliberato — decisione
propria, non un effetto collaterale di un reskin.

---

## Debito chiuso — mandato Weekly Program & Training Automation (2026-09-12)

Audit end-to-end di `Programma settimanale → Training automation →
club_events` (WEB App). Dettaglio della decisione in
[ADR-0169](18-decision-log.md#adr-0169--programma-settimanale-la-generazione-rispetta-la-stagione-e-una-sovrapposizione-non-si-crea-piu-in-silenzio).

| # | Stato | Cosa |
|---|-------|------|
| **D-AUD-21** | ~~**CHIUSO**~~ | Il generatore col secondo schema di identificativo (`generateTrainingsFromWeeklySchedule`, `src/lib/simplified-db.ts`) non aveva piu nessun chiamante — verificato con grep su tutto l'albero prima di toglierlo. Non corretto: **rimosso**, insieme alle funzioni-supporto rimaste orfane (`resolveCategoryId`/`resolveCategoryLabel`/`buildTrainingLocationOptions`/`findTrainingLocationOption`/`getFallbackTrainingLocationOptions`/`createEventsBatchRemote`/`formatTrainingTitle`/`buildTrainingStart`/`resolveTrainingWeekday`/`formatLocalDateKey` negli import di quel file, dove non servivano ad altro). Un solo generatore resta, con un solo schema di identificativo (`auto:<giorno\|ora\|campo\|categoria>`) |
| **D-AUD-22** | ~~**CHIUSO**~~ | `createClubEventsBatch` rileva ora le sovrapposizioni — contro un evento gia esistente e contro un'altra riga dello stesso blocco — e la riga in conflitto non si crea: torna nel risultato come «conflitto da verificare» (`BatchConflict`). `tests/server/generazione-eventi-conflitti.test.mjs` (4 prove) |
| **Nessuno scoping di stagione nella training-automation** | ~~**CHIUSO**~~ | Non aveva un numero di debito proprio (trovato durante questo audit, non nella lista precedente). `runTrainingAutomationForClub` filtra ora `weekly_schedule` per stagione attiva con `filterCollectionBySeason`, e marca `season_id` sugli eventi generati. `tests/server/training-automation-stagione.test.mjs` (2 prove) |

Resta aperto e fuori da questo commit, perche e lavoro distinto: il
selettore per-slot nell'editor delle sospensioni (il modello lo sostiene
gia, l'UI oggi copre solo il caso club-wide — vedi ADR-0175). `D-AUD-25`
resta **invariato**: la capacita di sistema `training_automation.generate`
e ancora mappata sull'ampio `events.manage` — un problema distinto da
WP-19, che riguardava il **ruolo umano**, non la capacita del cron
(ADR-0174).

«Genera fino a...» con data assoluta e preview (WP-03, WP-17), la
distinzione esplicita fra evento generato invariato e generato-poi-
modificato-a-mano (WP-10), l'impatto di una modifica al programma
settimanale sugli eventi futuri gia generati (WP-08), il flag attivo/
disattivato per singolo slot (WP-14), la granularita dei permessi per i
ruoli personalizzati sulla generazione (WP-19), un modello minimo di
sospensioni/eccezioni (WP-15), e la misura di performance a scala
realistica con i due N+1 che ha trovato e chiuso (WP-20) sono stati chiusi
in commit successivi dello stesso mandato — vedi
[ADR-0170](18-decision-log.md#adr-0170--genera-fino-a-anteprima-e-perche-un-campo-chiuso-non-ferma-piu-una-generazione-lunga),
[ADR-0171](18-decision-log.md#adr-0171--un-evento-generato-sa-dire-se-e-ancora-quello-che-lautomazione-ha-scritto),
[ADR-0172](18-decision-log.md#adr-0172--limpatto-di-una-modifica-al-programma-settimanale-e-un-avviso-dopo-lautosave-non-una-finestra-prima),
[ADR-0173](18-decision-log.md#adr-0173--una-regola-disattivata-smette-di-generare-e-conta-come-una-rimozione-per-limpatto),
[ADR-0174](18-decision-log.md#adr-0174--training_automationmanage-un-ruolo-personalizzato-puo-generare-gli-allenamenti),
[ADR-0175](18-decision-log.md#adr-0175--sospensioni-ed-eccezioni-un-salto-e-una-sospensione-sono-la-stessa-cosa-con-un-intervallo-diverso)
e [ADR-0176](18-decision-log.md#adr-0176--performance-a-scala-realistica-wp-20-il-club-si-legge-una-volta-per-il-blocco-non-una-per-riga).

| # | Gravita | Cosa | Da dove si riparte |
|---|---------|------|--------------------|
| **D-AUD-30** | ~~**CHIUSO**~~ | Il gruppo operativo non entrava mai davvero nella chiave di deduplica della training-automation. Un audit ostile successivo (mandato Weekly Program & Training Automation) ha trovato che la stessa assenza si propagava, con conseguenze piu gravi della sola deduplica, a `mergeWeeklyScheduleSources` (una seconda squadra scartata in silenzio) e a `findWeeklyScheduleSlotChanges`/WP-08 (un cambio di sede non generava mai un avviso di impatto). `groupId` ora entra nell'oggetto normalizzato, in `buildWeeklyScheduleIdentityKey`, in `CAMPI_CHE_SPOSTANO_LA_FASCIA` e in `buildExistingTrainingKey` — vedi [ADR-0177](18-decision-log.md#adr-0177--laudit-ostile-del-mandato-il-gruppo-operativo-nellidentità-di-uno-slot-e-la-chiave-che-protegge-la-generazione-anche-sulla-rotta-generica). `tests/server/gruppo-operativo-identita-slot.test.mjs` (3 prove) |
| **D-AUD-31 (parziale)** | Low | **`applyWeeklyScheduleSlotChanges` resta senza una scrittura in blocco dedicata**: ogni evento "sicuro" passa da un `updateClubEvent` completo (permesso, perimetro, sovrapposizione, campo chiuso), ~12 query l'uno. `MAX_EVENTI_APPLICAZIONE_IMPATTO = 200` (vedi [ADR-0178](18-decision-log.md#adr-0178--un-allenamento-generato-non-portava-mai-il-campo-solo-la-struttura-e-un-salvataggio-in-blocco-poteva-restare-appeso-per-minuti)) impedisce che la richiesta resti appesa, ma un club che riscrive l'intero programma dopo aver gia generato molti mesi in avanti riceve un rifiuto, non un'applicazione parziale a scelta di chi chiama | Una primitiva di scrittura in blocco che non ripeta le stesse verifiche una query alla volta per riga, o l'esecuzione fuori dalla richiesta HTTP (coda, job) se il tetto risultasse in pratica troppo stretto |
