# Report di cleanup — 2026-08-22

Classificazione di tutto il materiale sospetto trovato nell'audit.

- **SAFE TO DELETE** — dimostrabilmente inutilizzato, senza ambiguita di
  prodotto, recuperabile da Git. **Gia rimosso.**
- **REVIEW BEFORE DELETE** — non referenziato, ma la rimozione richiede una
  conferma (funzione da riportare? libreria da riusare? cambia la toolchain?).
  **Non rimosso.**
- **KEEP** — sembra inutilizzato ma serve.

## Metodo

Analisi statica degli import risolti (alias `@/`, relativi, estensioni e
`index`), con propagazione transitiva dagli entrypoint Next (`page`, `layout`,
`route`, `_app`, ...). In piu: `tsc --allowUnreachableCode false`, ricerca dei
blocchi commentati > 2.000 caratteri, scansione delle dipendenze dichiarate.

Validazione dopo ogni rimozione: `npm test`, `npm run typecheck`,
`npm run lint`, `npm run build`, **confronto del set di route** prodotto dal
build con la baseline.

---

## SAFE TO DELETE — eseguito

### Snapshot e artefatti temporanei

| Elemento | Perche |
|----------|--------|
| `.codex-tmp/` (**416 file tracciati**) | Snapshot duplicato dell'intero repository (`deploy-clean/`) piu `deploy-clean.zip`. Gia escluso da `.vercelignore` |
| `conflict_notification.jpg`, `error_image.jpg`, `error_screenshot.jpg`, `error_screenshot_detailed.jpg`, `logo_issue.jpg`, `matches_issue.jpg`, `pdf_button_issue.jpg` | Screenshot di debug nella root (~875 KB), nessun riferimento |
| `home/peter/tempo-api/projects/492b37b2-.../logo.png` | Percorso estraneo lasciato dal tool Tempo, nessun riferimento |
| `src/app/tempobook/`, `src/pages/tempobook/`, `src/tempobook/` | Storyboard del tool Tempo. **Non tracciati** (gitignored) ma compilati dal build locale: generavano 46 route fantasma assenti su Vercel. Archiviati prima della rimozione |
| Log di root (`.backend-ssh-tunnel*.log`, `.codex-dev-*.log`, `.next-dev.*.log`, ...), `undefined` (file vuoto), `tsconfig.tsbuildinfo` | Artefatti locali gitignored |
| `.agents/` | Directory vuota |

### Codice commentato (2.938 righe)

Blocchi `/* ... */` che occupavano l'intero file dopo una riga di re-export:

| File | Righe rimosse | Codice vivo rimasto |
|------|---------------|---------------------|
| `src/app/trainer-dashboard/page.tsx` | 1.506 | `<TrainerDashboardHomeV2Page />` |
| `src/app/account/page.tsx` | 995 | `export { default } from ".../account-home-screen"` |
| `src/app/trainer-dashboard/[dashboardId]/page.tsx` | 217 | `redirect("/trainer-dashboard")` |
| `src/app/create-club/page.tsx` | 220 | `export { default } from ".../create-club-redirect"` |

### Codice irraggiungibile (2.868 righe)

Segnalato da `tsc --allowUnreachableCode false`:

| File | Righe | Nota |
|------|-------|------|
| `src/app/page.tsx` | 1.680 | La route `/` restituisce `AuthShell` (login); seguiva una vecchia pagina Abbigliamento mai eseguita, con la funzione ancora chiamata `ClothingPage`. Ridotta e rinominata `HomePage` |
| `src/app/permissions/page.tsx` | 770 | La pagina delega a `TrainerPermissionsPage`; seguiva una UI permessi che non salvava nulla (`// In a real app, this would save to the backend`) |
| `src/app/training/page.tsx` | 410 | Dopo `return;` dentro l'`onClick` di «Presenze» |

### Catena di codice morto

| File | Perche |
|------|--------|
| `src/app/login/login-form.tsx` | Shim di una riga verso un file morto |
| `src/components/landing/landing-page.tsx`, `login-form.tsx`, `register-form.tsx` | Landing pubblica rimossa; superate da `components/auth/auth-shell.tsx` |
| `src/components/account/account-home.tsx` | Superata da `account-home-screen.tsx`, referenziata solo dal blocco commentato |
| `src/components/tempo-init.tsx` | Stub con import Tempo commentati |
| `src/components/ui/system-diagnostics.tsx` + `container-status.tsx` | Pannello diagnostico demo e sua unica dipendenza |
| `src/components/storyboards/AthleteDetailsStoryboard.tsx` | Storyboard demo |
| `src/lib/frontend-store.ts` (1.586 righe) | **Backend mock su localStorage**, superato dal backend Prisma |
| `src/lib/training-locations.ts` | Superata da `training-location-options.ts` |

### Configurazione

`.gitignore`: aggiunte `.codex-tmp/`, `.codex-run/`, `.codex-logs/`.

### Totale

**~443 file** rimossi dal tracking Git, **~10.900 righe** di codice morto,
zero variazioni nel set di route del build.

---

## REVIEW BEFORE DELETE — non rimosso

Nulla in questo elenco e referenziato. Ogni voce e recuperabile da Git.
Serve una conferma prima di procedere. Riferimento:
[WP-18](20-work-packages.md) e decisione **A6** in [19](19-roadmap.md).

### R1 — Componenti trainer v1 (11 file)

`trainer-athletes-page.tsx`, `trainer-categories-page.tsx`,
`trainer-categories-dashboard-page.tsx`, `trainer-dashboard-home-page.tsx`,
`trainer-dashboard-layout-shell.tsx`, `trainer-dashboard-shell.tsx`,
`trainer-matches-page.tsx`, `trainer-trainings-page.tsx`,
`TrainerCategories.tsx`, `TrainerPayments.tsx`,
`TrainingScheduleAutomation.tsx`, `TrainingScheduleGenerator.tsx`,
`TrainerAthleteTechnicalDialog.tsx`

**Perche non rimossi.** Sono la generazione precedente della dashboard
allenatore, superata dai `*-dashboard-page.tsx`. Potrebbero contenere
funzionalita **non ancora portate sulla v2** — in particolare
`TrainerPayments` (compensi visibili all'allenatore) e
`TrainerAthleteTechnicalDialog` (scheda tecnica atleta).

**Prima di rimuovere:** confrontare v1 e v2 funzione per funzione.

### R2 — Primitive UI non referenziate (19 file)

`aspect-ratio`, `carousel`, `context-menu`, `date-picker-with-range`, `drawer`,
`form`, `hover-card`, `icons`, `menubar`, `navigation-menu`,
`notification-badge`, `pagination`, `progress`, `resizable`, `skeleton`,
`slider`, `theme-toggle`, `timer-badge`, `toggle`

**Perche non rimossi.** Sono la libreria di componenti standard (shadcn/ui).
Non finiscono nel bundle (il tree-shaking le esclude: nessun modulo le
raggiunge), quindi il costo a runtime e **zero**. Rimuoverle libererebbe 4
dipendenze (`vaul`, `embla-carousel-react`, `react-resizable-panels`,
`react-hook-form`) ma renderebbe piu laborioso riusarle.

`pagination` e `skeleton` diventeranno probabilmente utili con
[WP-12](20-work-packages.md).

### R3 — Componenti orfani vari (12 file)

| File | Nota |
|------|------|
| `src/app/mobile-layout-wrapper.tsx` | Wrapper mobile mai montato; usa `ui/mobile-header` che invece e vivo |
| `src/app/organization/payment-methods-config.tsx` | Superato da `components/payments/PaymentMethodEnablementTable.tsx` |
| `src/app/parent-view/[id]/page-modals.tsx`, `payment-section.tsx` | `payment-section` contiene il commento «This is a placeholder» |
| `src/app/staff/page-modals.tsx` | Modali estratti e mai collegati |
| `src/components/account/account-club-card.tsx`, `account-empty-state.tsx` | Sotto-componenti di `account-home` (rimossa) |
| `src/components/dashboard/AccessCodeGenerator.tsx` | Generazione codici di accesso: verificare se la funzione esiste altrove |
| `src/components/dashboard/NewDashboard.tsx` | Prototipo di dashboard |
| `src/components/dashboard/ProtectedRoute.tsx` | Superato da `AccessAreaGuard` |
| `src/components/dashboard/SetupGuide.tsx` | Onboarding mai collegato |
| `src/components/dashboard/WeeklyTrainingSchedule.tsx` | Superato da `WeeklyTrainingSchedulePanel.tsx` |
| `src/components/forms/Add*Form.tsx` (5 file) | Form superati dai dialog nelle pagine |
| `src/components/parent/AttendanceConfirmation.tsx` | **Funzione di prodotto mai collegata**: conferma presenza da parte del genitore |
| `src/components/parent/PaymentMethods.tsx` | Referenziata solo dagli storyboard Tempo rimossi |
| `src/components/theme-switcher.tsx` | Il tema e forzato chiaro |

`AttendanceConfirmation` merita una decisione di prodotto, non solo tecnica.

### R4 — ~~Toolchain Babel / Tempo~~ — RIMOSSA (2026-08-22)

Riclassificata SAFE e rimossa dopo la verifica prevista da
[ADR-0017](18-decision-log.md): con SWC tutti i gate passano, la build scende
da 161 s a 62 s, il bundle condiviso si riduce e il set di route resta identico.

Rimossi: `.babelrc`, `babel.config.js`, `@babel/runtime`,
`tempo.config.json` (nessun file lo legge), la dipendenza `tempo-devtools`
(l'unico riferimento era un import commentato), l'alias webpack
`'tempo-devtools': false` in `next.config.js`, le righe commentate in
`src/pages/_app.tsx` e la variabile `NEXT_PUBLIC_TEMPO` da `.env.example`.

### R5 — Pages Router residuo

`src/pages/_app.tsx`, `_document.tsx`, `_error.tsx`, `404.tsx`.

**Perche non rimossi.** Convivono legittimamente con l'App Router e
intercettano ancora alcuni casi di errore. `_app.tsx` monta `ToastProvider`.
Da rimuovere insieme, dopo verifica che l'App Router copra 404 ed errori.

### R6 — Dipendenze non utilizzate

| Pacchetto | Nota |
|-----------|------|
| `radix-ui` | Pacchetto ombrello, nessun import (si usano i singoli `@radix-ui/react-*`) |
| ~~`tempo-devtools`~~ | **Rimosso** il 2026-08-22 insieme al resto della toolchain Tempo (R4) |
| `prettier` | In `dependencies` invece che `devDependencies`, nessuno script lo invoca |
| `vaul`, `embla-carousel-react`, `react-resizable-panels`, `react-hook-form` | Usati **solo** dalle primitive di R2 |
| ~~`@babel/runtime`~~ | **Rimosso** il 2026-08-22 insieme a `.babelrc` (R4) |

Nessuna finisce nel bundle client. L'impatto e su `npm install`.

### R7 — ~~Mobile: Drizzle ed Express~~ — RIMOSSI (2026-08-22)

Rimossi in attuazione di [ADR-0018](18-decision-log.md): `shared/schema.ts`,
`drizzle.config.ts`, `server/`, `.replit`, gli script `db:push` e
`server:*`, l'alias `@shared`, e le dipendenze `drizzle-orm`, `drizzle-zod`,
`drizzle-kit`, `express`, `@types/express`, `pg`, `ws`,
`http-proxy-middleware`, `tsx`.

Presidio permanente: la CI fallisce se `DATABASE_URL` ricompare nel mobile.

### R8 — Mobile: schermate v1 e storage mock

10 schermate non collegate + `client/services/storage.ts` (mock) +
`client/services/mobile-storage-service.ts` (**orfano, nessun import**).

`mobile-storage-service.ts` e il candidato piu sicuro: nessuno lo importa.
Vedi [WP-21](20-work-packages.md).

### R9 — Asset pubblici non referenziati

`public/images/company.png`, `public/images/user.png`,
`public/report-template.pdf`.

**Perche non rimossi.** I file in `public/` possono essere linkati
dall'esterno o da contenuti salvati a database. `report-template.pdf` suggerisce
una funzione di export non collegata.

### R10 — `.gitignore`: parzialmente sistemato (2026-08-22)

Rimosse `.github/` (impediva di committare la CI) e `.git` (inutile).
Restano `**/tempobook/**`, ormai superflua, e `node_modules` ripetuto piu
volte: innocui.

### R11 — Alias di compatibilita API

`simplified_athletes`, `simplified_payments`, `simplified_certificates`,
`simplified_notifications`, `organizations` in `RESOURCE_CONFIG`.

Ancora usati da web e mobile. Vedi [WP-20](20-work-packages.md).

---

## KEEP — sembra inutilizzato ma serve

| Elemento | Perche va tenuto |
|----------|------------------|
| `src/types/bcryptjs.d.ts` | Dichiarazione ambient: `@types/bcryptjs` non e installato. Rimuoverla rompe il typecheck |
| `autoprefixer`, `postcss`, `tailwindcss` | Usati da `postcss.config.js` e `tailwind.config.ts`, non importati dal codice |
| `pg` | Peer dependency di `@prisma/adapter-pg` |
| `@types/*`, `eslint`, `eslint-config-next`, `typescript` | Tooling, non importato dal codice |
| `prisma/seed.js` | Script di seed. Da non eseguire su dati reali, ma da conservare |
| `scripts/*.mjs`, `.ps1`, `.bat`, `.cmd`, `.sh` | Launcher e verifiche operative, invocati a mano |
| `docs/api-registry.md`, `multi-tenant-architecture.md`, `testing-and-deploy.md` | Documenti validi, referenziati dalla KB |
| `.vercel/project.json` | Collega la working copy al progetto `easygame-staging` |
| `src/components/ui/mobile-header.tsx` | Usato da `MobileTopBar`, vivo |
| `src/components/ui/chat.tsx` | Montato da `dashboard/Header.tsx` |
| Colonne `Json?` su `clubs` | Mirror attivo di `club_resource_items`, letto dal client |

---

## Come rimuovere una voce REVIEW

1. Verificare che sia ancora orfana (l'analisi si trova nella cronologia di
   questo audit; ripeterla e semplice: cercare l'import in `src/` e in
   `easygamemobile/`).
2. Aprire un commit **separato per blocco omogeneo**.
3. Eseguire i gate e **confrontare il set di route** del build con la baseline.
4. Aggiornare questo report e [11 — Capability](11-capabilities.md) se cade una
   funzione.
