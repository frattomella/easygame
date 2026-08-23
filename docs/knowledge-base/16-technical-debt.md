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

**Resta aperto:** non esiste una funzione per **riportare** categorie, piani o
listini da una stagione all'altra. Aprire una stagione nuova significa oggi
ricrearli a mano. Vedi WP-35.

→ WP-11 (chiuso), WP-32

### D4 — Nessuna paginazione, ordinamento o ricerca server-side

`buildWhereFromSearchParams` supporta 13 campi in uguaglianza esatta e basta.
Le liste tornano complete.

→ WP-12

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

### D10 — Pagine monolitiche

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

### D13 — File nel database — **PIU GRAVE DI QUANTO SEMBRASSE**

`Asset.data_base64` permette di salvare binari in Postgres, ma il problema non
si ferma li: `supabase.storage.upload` produce un **data URL base64** e le
schede atleta lo salvano dentro `athletes.data` (`identityDocuments`,
`enrollmentDocuments`, `documents`, `certificateFiles`, `avatar`). Con 200
atleti la lista trasferiva ~25 MB.

`view=summary` (WP-31) toglie gli allegati dalle liste e porta il payload a
~2 MB, ma **i file restano nel database** e i ~2 MB residui sono quasi tutti
avatar base64. La soluzione strutturale resta spostarli su object storage.

→ WP-15

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

### D25 — Due immagini decorative non piu referenziate

`public/images/account/account-team.png` non e piu usato da nessuna pagina
dopo il rifacimento della home account.
`public/images/account/account-hero.png` resta, ma solo da 1280 px in su.
Sono asset statici: non pesano sul bundle, pesano sul repository. Da valutare
insieme agli altri residui di `public/`.
