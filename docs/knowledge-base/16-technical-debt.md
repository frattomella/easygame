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

### D3 — Il filtro per stagione e solo client-side

`x-active-season-id` viene inviato dal client ma **nessun endpoint lo legge**.
Le API restituiscono tutti i dati del club, il filtro lo fa
`filterCollectionBySeason` nel browser.

**Perche pesa:** payload piu grandi del necessario e nessuna garanzia
applicativa sul perimetro stagione.

→ WP-11

### D4 — Nessuna paginazione, ordinamento o ricerca server-side

`buildWhereFromSearchParams` supporta 13 campi in uguaglianza esatta e basta.
Le liste tornano complete.

→ WP-12

### D5 — Copertura test assente sulle aree critiche

Zero test su route handler, `resources.ts`, isolamento multi-tenant,
`simplified-db.ts`. Il runner non fa discovery: i file vanno elencati a mano in
`package.json`.

→ WP-04

### D6 — Nessuna CI

Nessuna pipeline: i gate (test, typecheck, lint, build) dipendono dalla
disciplina di chi committa. In piu **`.gitignore` contiene `.github/`**, quindi
oggi un workflow non sarebbe nemmeno committabile.

→ WP-02

## Impatto medio

### D7 — Adapter `supabase.ts` fuorviante

`src/lib/supabase.ts` (1.116 righe) espone un'API in stile Supabase
(`from().select().eq()`) implementata su `fetch`. **Non parla con Supabase.**
Il nome inganna chi legge, e il livello di indirezione in piu complica il
debug.

Persistono anche chiavi legacy nello storage del browser
(`sessionStorage: supabase_session`).

→ WP-17 (rinomina e riduzione graduale)

### D8 — `.babelrc` disattiva SWC

`.babelrc` con `next/babel` (residuo del tool Tempo) fa usare a Next **Babel**
al posto di SWC: build piu lente e `swcMinify` di fatto meno efficace.
`babel.config.js` e un file vuoto messo «per evitare conflitti».

Rimuoverli e probabilmente corretto ma cambia la toolchain di compilazione:
va fatto in un WP con build e smoke test dedicati.

→ WP-08

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

### D13 — File nel database

`Asset.data_base64` permette di salvare binari in Postgres.

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
- `@babel/runtime`: necessario solo finche resta `.babelrc` (vedi D8).

Nessuna di queste finisce nel bundle client (il tree-shaking le esclude perche
i moduli non sono raggiungibili): l'impatto e su `npm install`, non a runtime.

### D17 — 53 warning ESLint

Prevalentemente `@next/next/no-img-element` e
`react-hooks/exhaustive-deps`. Nessun errore. Non farli crescere.

### D18 — `.gitignore` con voci discutibili

Contiene `.git`, `.github/`, `**/tempobook/**`, `node_modules` ripetuto piu
volte, `.vercel`. La voce `.github/` va rimossa prima di introdurre la CI.

### D19 — Drift Prisma cosmetico

`athlete_category_memberships`: il DB ha default a livello colonna, lo schema
Prisma default applicativi; due indici hanno nome troncato diversamente.
Comportamento identico. **Non generare una migrazione correttiva** senza motivo
funzionale.

### D20 — Documentazione operativa parzialmente superata

`docs/testing-and-deploy.md` cita `typescript.ignoreBuildErrors = true` in
`next.config.js`: **quel flag non c'e piu**. Il resto della guida e valido.
