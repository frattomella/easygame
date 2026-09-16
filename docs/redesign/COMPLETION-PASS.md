# Redesign Web — passata di completamento (2026-09-16)

Branch `feat/web-redesign`, ambiente `easygame-redesign-staging`, Neon
`web-redesign-staging`. Decisioni: ADR-0187 (completamento del redesign),
ADR-0188 (persone in prova) in
[18 — Decision log](../knowledge-base/18-decision-log.md).

## 1. Censimento delle rotte

Classi: **A** = gia sul Web V2 prima di questa passata (Wave A–E);
**B** = migrata in questa passata; **C** = rotta utente ancora V1 (obiettivo
0); **D** = eccezione dichiarata (non raggiungibile da un ruolo di club, o
rinvio puro). Le rotte di rinvio (`redirect`) non disegnano niente e sono
segnate **R**.

| Rotta | Classe | Guscio | Note |
|---|---|---|---|
| `/` | B | OutsideShell (ambiente 3) | ripiego `Suspense` sui token |
| `/login`, `/register` | B | OutsideShell | `AuthShell`: sola resa, logica intatta |
| `/auth/forgot-password`, `/auth/reset-password` | B | OutsideShell | `PasswordResetShell` |
| `/auth/complete` | B | OutsideShell | conferma accesso |
| `/token-verification`, `/token-verification/[userId]` | R | — | rinvio a `/account` |
| `/onboarding` | B | OutsideShell `full` `bare` | stepper conservato |
| `/create-club` | R | — | rinvio (`create-club-redirect`) |
| `/account` | A | Sidebar/Topbar (ambiente 2) | `SkyProvider`: contrasto sul cielo |
| `/profile/[userId]` | R | — | rinvio a `/account?profile=1` |
| `/dashboard`, `/dashboard/[dashboardId]`, `/dashboard/access-management` | A | Sidebar/Topbar | |
| `/athletes`, `/athletes/new`, `/athletes/[id]` | A | Sidebar/Topbar | voce «Atleti in prova» aggiunta al menu |
| `/athletes/[id]/edit`, `/athletes/[id]/profile` | R | — | rinvii (il secondo con `AppLoadingScreen` sui token) |
| `/athletes/in-prova`, `/athletes/in-prova/[id]` | B (nuove) | Sidebar/Topbar | ADR-0188 |
| `/trainers`, `/trainers/new`, `/trainers/[id]` · `/trainers/[id]/edit` (R) | A | Sidebar/Topbar | |
| `/staff*`, `/soci*`, `/structures*`, `/sponsors*`, `/categories`, `/medical`, `/training`, `/matches`, `/calendar`, `/registration-management`, `/movements`, `/reports`, `/procura`, `/documenti`, `/modulistica`, `/consensi`, `/secretariat`, `/appuntamenti`, `/communications*`, `/notifications`, `/hub`, `/audit`, `/sport-work*`, `/organization`, `/settings`, `/permissions`, `/clothing` | A | Sidebar/Topbar | `/matches` non scrive piu la scadenza convocazioni; `/settings?tab=gare` la porta |
| `/payments` | R | — | rinvio a `/movements` |
| `/parent-view` | B | OutsideShell | scelta del figlio: categorie via indice, ruolo in `MembershipRoleBadge`, stato in `StatusPill` |
| `/parent-view/[id]` e le 14 sotto-rotte | B | AreaShell | `parentAreaNavGroups` |
| `/trainer-dashboard` e le 11 sotto-rotte | B | AreaShell | `trainerAreaNavGroups(permissions)`; «Persone in prova» nella pagina Atleti |
| `/athlete-dashboard` e le 13 sotto-rotte | B | AreaShell | `/attiva` (riscatto invito) su OutsideShell |
| `/forms/[publicSlug]` | B | OutsideShell | modulo pubblico |
| `/iscrizione/[reference]` | B | OutsideShell | stato iscrizione |
| `/pay/[token]` | B | OutsideShell | pagamento con link |
| `/private/easygame-platform-admin-0c7a`, `/private/email-preview`, `/private/api-docs` | D | proprio | console di piattaforma e anteprime: non raggiungibili da un ruolo di club (D-RD-20) |

**Totali**: 117 pagine. Rotte utente V1 (C): **0**. Miste: **0**. Eccezioni
D: 3 (tutte sotto `/private/`). Rinvii: 8.

## 2. Cosa resta fuori dai token, e perche

| Dove | Perche resta | Voce |
|---|---|---|
| `src/components/payments/*`, `src/components/funding/*` (pannelli a fondo scuro) | famiglia «editor V1 avvolti» gia aperta in WP-RD; testo chiaro su scuro, leggibile | D-RD-19 |
| `/private/*`, `src/components/platform-admin/*` | non raggiungibile da un ruolo di club | D-RD-20 |
| `src/components/brand/*`, `stripe-brand.tsx` | colori di marchio, non di sistema | — |
| `ui/chat.tsx`, `ui/timer-badge.tsx` | nessun consumatore | gia in [16](../knowledge-base/16-technical-debt.md) (primitive `ui/*` non usate); `ui/mobile-header.tsx` e `app/mobile-layout-wrapper.tsx` sono stati tolti |
| `categories.color` (`bg-blue-500 text-white`, …) | **dato** del club, persistito sulla riga | — |

## 3. Le guardie che restano

- `tests/ui/branding-cedisoft.test.mjs` — «Francesco srl» = 0 nel prodotto.
- `tests/ui/contrasto-sul-cielo.test.mjs` — testo scuro sul cielo = 0.
- `tests/ui/navigazione-sotto-1024-e-768.test.mjs` — un elenco solo di voci
  per la barra larga e il menu mobile.
- `tests/lib/scadenza-convocazioni-impostazioni.test.mjs` — default 4,
  valori espliciti conservati, `/matches` non scrive.
- `tests/lib/proiezione-appartenenze-riallineata.test.mjs` — la proiezione
  dice le righe come stanno.
- `tests/server/atleti-in-prova.test.mjs` — le 42 prove del dominio (33 del mandato + 9 della revisione).
- `tests/ui/redesign-completamento.test.mjs` — le superfici del completamento
  (§33 del mandato).

## 4. Revisione ostile (§35)

Tre revisori in sola lettura, un solo scrittore. Trovati: Critical 1, High 9,
Medium 15, Low 17. Chiusi: Critical 1, High 9, Medium 14, Low 12. Dettaglio
in ADR-0187 e ADR-0188 («Revisione ostile»). Alla chiusura: **Critical 0,
High 0**. Aperti e dichiarati: D-RD-19 (pannelli scuri dei pagamenti),
D-RD-20 (`/private/*`), D-RD-22 (conversione non transazionale: presa
condizionata + rilascio), le presenze di prova sulle gare, la troncatura dei
chip di categoria molto lunghi sulla scelta del figlio a 375 px.

## 5. Invarianti di categoria (club pilota, `web-redesign-staging`)

Misurati con il censimento D-RD-16 prima e dopo la migrazione ADR-0188:
fuori catalogo 0, primarie invalide 0, id legacy 0, dangling 0,
primaria = secondaria 0, fantasma 0, nomi stantii 0. **Righe 215** (era 216)
e proiezioni non allineate 1: l'atleta R3 e stato modificato dal proprietario
del club sull'ambiente il 2026-09-16 alle 02:05Z (secondaria tolta, sede
azzerata) **prima** di questa passata — un atto dell'utente, non una
regressione della migrazione. Il writer che produceva la deriva della
proiezione e corretto (ADR-0187 §9); la riga non e stata toccata (nessuna
bonifica senza autorizzazione, D-RD-21).
