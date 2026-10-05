# 04 — Architettura Web App

Stack: **Next.js 14.2.23 (App Router) · React 18 · TypeScript strict ·
Tailwind CSS 3 · shadcn/ui su Radix · Prisma 6 · Neon PostgreSQL**.
Runtime Node `22.x`. Hosting Vercel, regione `fra1`.

## Struttura di rendering

**Due alberi, due root layout** (ADR-0200 §4, dal 2026-10-05). Le pagine del
gestionale vivono nel gruppo di rotte `src/app/(app)/`, il sito pubblico di un
club in `src/app/(site)/`; `src/app/api/` resta fuori da entrambi. I gruppi non
cambiano gli URL: `/athletes` e sempre `/athletes`. La separazione esiste
perche il visitatore del dominio di un club non scarichi sessione, guscio,
toast ed editor del gestionale: la presidia `tests/web/app-site-separation.test.mjs`.

- `src/app/(app)/layout.tsx` — root layout del gestionale. Monta
  `AppClientProviders`, forza `lang="it"` e tema chiaro.
- `src/app/(site)/layout.tsx` — root layout del sito pubblico: nessun provider,
  CSS proprio (`src/styles/website/site.css` con `tailwind.website.config.ts`),
  caratteri del catalogo del tema (`src/components/website/render/fonts.ts`).
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
- **Lo stesso middleware sceglie l'albero dall'host** (ADR-0200). Sugli host
  del gestionale (`EASYGAME_APP_HOSTS`, l'host di `NEXT_PUBLIC_APP_URL` e di
  `AUTH_BASE_URL`, `localhost`, `*.vercel.app`) tutto resta com'era e
  `/site-render/*` risponde 404. **Ogni altro host e il dominio di un club**:
  la richiesta si riscrive verso `src/app/(site)/site-render/[host]/…`, che
  risolve host → sito → revisione pubblicata sul runtime Node; le API
  rispondono 404 tranne `/api/public/website/*`, e l'host vero viaggia
  nell'intestazione `x-easygame-site-host`. Dettagli in
  [13](13-environments.md) e [14](14-security.md).
- **Il sito pubblico e reso sul server.** `site-render` e `force-dynamic`, con
  i dati in `unstable_cache` a tag (snapshot della revisione, dati vivi per un
  minuto) e `React.cache` per non risolvere due volte nella stessa richiesta;
  il client riceve HTML e poche isole (`src/components/website/render/islands/`).
  L'editor del gestionale (`/website/editor`) e invece un client component che
  mostra l'anteprima privata (`src/app/(site)/website-preview/[siteId]/`) in un
  iframe e le parla per messaggi (`src/lib/website/editor-protocol.ts`).

## Layout e chrome

| Layout | Percorso | Contenuto |
|--------|----------|-----------|
| Root gestionale | `src/app/(app)/layout.tsx` | Provider globali |
| Root sito pubblico | `src/app/(site)/layout.tsx` | Nessun provider: solo CSS e caratteri del sito; `noindex` per default (lo toglie solo una pagina pubblicata risolta) |
| Sito della societa (gestionale) | `src/app/(app)/website/layout.tsx` | Re-export di `management-area-layout` (= `AccessAreaGuard`); `/website` e un prefisso di gestione non riservato alla direzione |
| Dashboard | `src/app/(app)/dashboard/layout.tsx` | `AccessAreaGuard` + `Sidebar` + `Header` desktop, `MobileTopBar` mobile |
| Trainer | `src/app/(app)/trainer-dashboard/layout.tsx` | `AccessAreaGuard` |
| Parent | `src/app/(app)/parent-view/[id]/layout.tsx` | `AccessAreaGuard` |
| Athlete | `src/app/(app)/athletes/[id]/profile/layout.tsx` | `AccessAreaGuard` |
| Organization | `src/app/(app)/organization/layout.tsx` | `AccessAreaGuard` + `ToastProvider` |
| Aree di gestione (22) | `src/app/(app)/<area>/layout.tsx` | Re-export di `management-area-layout` (= `AccessAreaGuard`) |

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
| Pubblico / auth | `/login`, `/register`, `/auth/complete`, `/token-verification`, `/token-verification/[userId]`, `/forms/[publicSlug]` |
| Account | `/account`, `/profile/[userId]`, `/create-club` |
| Management | `/dashboard`, `/dashboard/[dashboardId]`, `/dashboard/access-management`, `/hub`, `/athletes`, `/athletes/[id]`, `/athletes/[id]/edit`, `/categories`, `/matches`, `/training`, `/medical`, `/structures`, `/structures/[id]`, `/clothing`, `/soci`, `/soci/new`, `/soci/[id]`, `/staff`, `/staff/new`, `/staff/[id]`, `/staff/[id]/edit`, `/trainers`, `/trainers/new`, `/trainers/[id]`, `/trainers/[id]/edit`, `/trainers/[id]/contracts`, `/trainers/[id]/contracts/upload`, `/sponsors`, `/sponsors/[id]`, `/payments`, `/movements`, `/reports`, `/secretariat`, `/modulistica`, `/procura`, `/registration-management`, `/notifications`, `/organization`, `/permissions`, `/settings` |
| Sito della societa e sport core (ADR-0200) | `/website`, `/website/editor`, `/website/media`, `/website/news`, `/website/news/[id]`, `/website/persone`, `/website/sponsor`, `/website/messaggi`, `/website/domini`, `/website/versioni`, `/website/impostazioni`, `/website-preview/[siteId]/[[...path]]` (anteprima privata, gruppo `(site)`), `/categories/squadre`, `/matches/competizioni`. Il sito pubblico non ha route proprie: e `/site-render/[host]/[[...path]]`, raggiunto solo per rewrite dal dominio di un club |
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

- **Web V2 (2026-09-15, ADR-0184).** Il guscio delle pagine di gestione e in
  `src/components/web/shell/`; `src/components/dashboard/{Sidebar,Header,
  shared-page-header,dashboard-page-container}.tsx` sono riesportazioni verso
  di esso, cosi le ~45 pagine che li montano non cambiano. `ShellProvider`
  (in `AppClientProviders`) tiene lo stato della barra (compressa, cassetti
  globali, ⌘J/⌘K). Le pagine migrate compongono `DataGrid`, `PageHeader`,
  `Drawer` e le altre primitive di `src/components/web/` — inventario in
  [10](10-ui-ux-conventions.md) §Web V2.

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
