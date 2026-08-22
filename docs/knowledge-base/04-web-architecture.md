# 04 — Architettura Web App

Stack: **Next.js 14.2.23 (App Router) · React 18 · TypeScript strict ·
Tailwind CSS 3 · shadcn/ui su Radix · Prisma 6 · Neon PostgreSQL**.
Runtime Node `22.x`. Hosting Vercel, regione `fra1`.

## Struttura di rendering

- `src/app/layout.tsx` — root layout server component. Monta
  `AppClientProviders`, forza `lang="it"` e tema chiaro.
- `AppClientProviders` (`src/components/providers/AppClientProviders.tsx`)
  incapsula, nell'ordine: `ToastProvider` → `AuthProvider` → `ThemeProvider`
  (`forcedTheme="light"`) → `GlobalLoadingProvider` + `Toaster`.
- **47 delle 72 pagine sono client component** (`"use client"`). Il progetto usa
  poco il rendering server: i dati arrivano quasi sempre via `fetch` dal
  browser. Non e un bug, e la scelta corrente: mantieni lo stesso approccio
  salvo WP dedicati.
- `src/middleware.ts` fa da cancello di autenticazione edge: verifica la
  **presenza** del cookie di sessione sui percorsi protetti. Non puo validarla
  (niente Prisma su edge) ne applicare i ruoli.

## Layout e chrome

| Layout | Percorso | Contenuto |
|--------|----------|-----------|
| Root | `src/app/layout.tsx` | Provider globali |
| Dashboard | `src/app/dashboard/layout.tsx` | `AccessAreaGuard` + `Sidebar` + `Header` desktop, `MobileTopBar` mobile |
| Trainer | `src/app/trainer-dashboard/layout.tsx` | `AccessAreaGuard` |
| Parent | `src/app/parent-view/[id]/layout.tsx` | `AccessAreaGuard` |
| Athlete | `src/app/athletes/[id]/profile/layout.tsx` | `AccessAreaGuard` |
| Organization | `src/app/organization/layout.tsx` | `AccessAreaGuard` + `ToastProvider` |
| Aree di gestione (22) | `src/app/<area>/layout.tsx` | Re-export di `management-area-layout` (= `AccessAreaGuard`) |

Dal 2026-08-22 **tutte** le aree hanno un guard. La protezione e a due livelli:

1. `src/middleware.ts` — cancello edge: senza cookie di sessione su un
   percorso protetto, redirect a `/login?next=...`. Non valida la sessione
   contro il database (il runtime edge non ha Prisma) e non applica i ruoli.
2. `AccessAreaGuard` — client: applica `canAccessPath` sul pathname corrente.
   Essendo basato sul pathname, montarlo piu in alto e idempotente:
   `/athletes/[id]/profile` resta area atleta anche con il guard su
   `/athletes`.

Nessuno dei due sostituisce l'autorizzazione server-side delle API, che resta
il presidio principale (vedi [14](14-security.md)).

## Route pagina (72)

| Area | Route |
|------|-------|
| Pubblico / auth | `/login`, `/login/trainer`, `/register`, `/auth/complete`, `/token-verification`, `/token-verification/[userId]`, `/forms/[publicSlug]` |
| Account | `/account`, `/profile/[userId]`, `/create-club` |
| Management | `/dashboard`, `/dashboard/[dashboardId]`, `/dashboard/access-management`, `/hub`, `/athletes`, `/athletes/[id]`, `/athletes/[id]/edit`, `/categories`, `/matches`, `/training`, `/medical`, `/structures`, `/structures/[id]`, `/clothing`, `/soci`, `/soci/new`, `/soci/[id]`, `/staff`, `/staff/new`, `/staff/[id]`, `/staff/[id]/edit`, `/trainers`, `/trainers/new`, `/trainers/[id]`, `/trainers/[id]/edit`, `/trainers/[id]/contracts`, `/trainers/[id]/contracts/upload`, `/sponsors`, `/sponsors/[id]`, `/payments`, `/movements`, `/reports`, `/secretariat`, `/modulistica`, `/procura`, `/registration-management`, `/notifications`, `/organization`, `/permissions`, `/settings` |
| Trainer | `/trainer-dashboard`, `/trainer-dashboard/[dashboardId]` (redirect), `/trainer-dashboard/athletes`, `/trainer-dashboard/athletes/[id]`, `/trainer-dashboard/categories`, `/trainer-dashboard/matches`, `/trainer-dashboard/notifications`, `/trainer-dashboard/trainings` |
| Parent | `/parent-view/[id]` + 9 sottopagine (athlete, contacts, documents, matches, payments, secretariat, structures, trainings, `[dashboardId]`) |
| Athlete | `/athletes/[id]/profile` |
| Privato | `/private/easygame-platform-admin-0c7a`, `/private/api-docs` |
| Radice | `/` — mostra `AuthShell` in modalita login (nessuna landing pubblica) |

### Nota storica sulla route `/`

Fino al cleanup del 2026-08-22, `src/app/page.tsx` era lungo 1.750 righe: il
componente esportato si chiamava `ClothingPage` e conteneva una copia
precedente della pagina Abbigliamento. Quel codice era pero **interamente dopo
il `return`**, quindi mai eseguito: la route ha sempre reso il login. Il file e
stato ridotto al solo componente reale (`HomePage`).

La landing pubblica e stata rimossa in passato e non e stata sostituita: `/`,
`/login` e `/register` mostrano tutte i flussi di autenticazione.

## Catena dati lato client

```
componente React
   └─ src/lib/simplified-db.ts        (4.036 righe, logica di dominio)
        └─ src/lib/supabase.ts        (adapter stile Supabase, NON usa Supabase)
             └─ src/lib/api/client.ts (apiRequest)
                  └─ fetch → /api/v1/...
```

`apiRequest` fa tre cose non ovvie:

1. aggiunge `credentials: "include"` (cookie di sessione);
2. legge il club attivo da `localStorage` e imposta `x-active-club-id`,
   `x-active-access-role`, `x-active-season-id`;
3. su **401 fuori dagli endpoint di lifecycle sessione** invoca
   `notifyUnauthorized()`, che invalida la cache client e forza il logout.

Gli endpoint esclusi dal punto 3 sono elencati in `SESSION_LIFECYCLE_PATHS`
(login, register, logout, session, verify, oauth): li un 401 significa
«credenziali errate», non «sessione scaduta».

## Stato client

- `AuthProvider` (584 righe) e l'unico store globale: utente, ruolo, club
  attivo, membership, profilo atleta collegato.
- Il club attivo e persistito in `localStorage` con chiave
  `activeClub_<userId>` (piu il fallback legacy `activeClub`).
- La sessione e in `localStorage` con chiave `easygame.api-session.v1`
  (piu il fallback legacy `sessionStorage: supabase_session`).
- Nessun React Query / Redux / Zustand. Le cache sono fatte a mano
  (`cachedQuery` in `supabase.ts`, `createScopedRequestDeduper` in
  `src/lib/auth/request-deduper.ts`).

## Componenti

- `src/components/ui/` — 58 file: primitive shadcn/ui piu componenti custom
  (`chat.tsx`, `avatar-upload.tsx`, `toast-notification.tsx`,
  `mobile-header.tsx`). 18 primitive non sono referenziate da nessuna pagina.
- `src/components/trainer/` — 28 file. Convivono due generazioni:
  `trainer-*-page.tsx` (v1, **orfana**) e `trainer-*-dashboard-page.tsx` (v2,
  in uso). Usa sempre la v2.
- Le pagine molto grandi (`athletes/[id]/page.tsx` ≈ 340 KB,
  `clothing/page.tsx` ≈ 176 KB) contengono anche logica di dominio inline.

## Build

- `npm run build` → `next build`.
- `npm run vercel-build` → `prisma generate && prisma migrate deploy && next build`
  (**esegue le migrazioni**, vedi [13 — Ambienti](13-environments.md)).
- La transpilazione usa **SWC**: `.babelrc` e stato rimosso il 2026-08-22
  ([ADR-0017](18-decision-log.md)). Build di riferimento: **62 s, 120 route**.
