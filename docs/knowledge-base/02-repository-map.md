# 02 — Mappa del repository

Il repository ospita **due applicazioni separate** nella stessa working copy.
La separazione va mantenuta: vedi [17 — Convenzioni](17-development-conventions.md).

```
easygame/
├── src/                    WEB APP (Next.js 14 App Router)  <- app principale
├── easygamemobile/         MOBILE APP (Expo / React Native) <- app secondaria
├── prisma/                 schema + migration + seed (condivisi, owner = Web)
├── scripts/                utility Node per avvio locale e verifiche staging
├── tests/                  test Node runner (solo Web)
├── docs/                   documentazione, inclusa questa KB
└── public/                 asset statici serviti dalla Web App
```

## Web App — `src/`

| Percorso | Contenuto | Note |
|----------|-----------|------|
| `src/app/` | 131 file. Route App Router: 72 `page.tsx`, 42 `route.ts` API, 6 `layout.tsx` | Vedi [04](04-web-architecture.md) |
| `src/app/api/v1/` | API versionata: auth, admin, registry, risorse generiche | Superficie usata anche dal mobile |
| `src/app/api/` (fuori `v1`) | Endpoint di dominio non versionati: parent-dashboard, online-forms, payments, athletes/documents, clothing, forms/assets, medical-certificate-reminders | Incoerenza nota, vedi [09](09-api-conventions.md) |
| `src/components/ui/` | 58 file. Primitive shadcn/ui + componenti custom (chat, avatar-upload, toast) | 18 primitive non referenziate, vedi [cleanup-report](cleanup-report.md) |
| `src/components/trainer/` | 28 file. Dashboard allenatore | Convivono v1 (`trainer-*-page`) e v2 (`trainer-*-dashboard-page`); solo v2 e in uso |
| `src/components/forms/` | 21 file. Moduli online, editor documenti, form di dominio | |
| `src/components/dashboard/` | 15 file. Sidebar, Header, widget dashboard club | |
| `src/components/providers/` | `AuthProvider`, `ThemeProvider`, `GlobalLoadingProvider`, `AppClientProviders` | Montati in `src/app/layout.tsx` |
| `src/components/auth/` | `auth-shell.tsx` (login+registrazione), `access-area-guard.tsx` | |
| `src/lib/` | 77 file. Logica di dominio, utility, policy | Vedi tabella sotto |
| `src/lib/server/` | Codice **solo server**: Prisma client, auth, resources, email, workflow | Non importare dal client |
| `src/pages/` | 4 file residui del Pages Router: `_app`, `_document`, `_error`, `404` | Legacy, vedi [16](16-technical-debt.md) |
| `src/types/` | `bcryptjs.d.ts` — dichiarazione ambient necessaria (non esistono `@types/bcryptjs` installati) | **Non cancellare** |

### File chiave di `src/lib`

| File | Righe | Ruolo |
|------|-------|-------|
| `simplified-db.ts` | 4.036 | Data layer **client-side** di dominio. Il file piu grande e piu critico del progetto. |
| `server/resources.ts` | 1.919 | Data layer **server-side** generico: `RESOURCE_CONFIG`, `listResource`, `createResource`, `API_REGISTRY`. |
| `supabase.ts` | 1.116 | Adapter con API in stile Supabase implementato sopra `fetch` verso `/api/v1`. **Non parla con Supabase.** Vedi [ADR-0003](18-decision-log.md). |
| `access-roles.ts` | 340 | Unica fonte di verita su ruoli, aree e permessi risorsa. |
| `server/auth.ts` | 335 | Sessioni, cookie, scope organizzativo, platform admin. |
| `auth/*.ts` | — | Policy pure e testabili: password, OTP, rate limit, registrazione, provider. |
| `api/client.ts` | 178 | `apiRequest`: envelope, header di contesto, invalidazione sessione su 401. |
| `api/registry.ts` | 211 | Registro endpoint per il client mobile. |
| `server/email/` | — | Provider SMTP, cifratura credenziali, invio transazionale. |
| `payments/` | — | Tipi, fee di piattaforma, registro provider (nessuno implementato). |

## Mobile App — `easygamemobile/`

| Percorso | Contenuto | Stato |
|----------|-----------|-------|
| `client/screens/` | 19 schermate | Solo 9 sono collegate ai navigator |
| `client/navigation/` | 7 navigator (root, tab, 5 stack) | Wiring **solo trainer** |
| `client/services/api.ts` | Client HTTP verso `/api/v1` della Web App | Fonte dati reale |
| `client/services/mobile-backend-storage.ts` | Cache/adapter sopra `api.ts` | In uso |
| `client/services/storage.ts` | **Dati mock** (`MOCK_USER`, `MOCK_CLUBS`) | Usato solo da schermate non collegate |
| `client/services/mobile-storage-service.ts` | Terzo layer di storage | **Orfano** |
| ~~`server/`, `shared/`, `drizzle.config.ts`, `.replit`~~ | Scaffold Replit, schema Drizzle e accesso diretto al database | **Rimossi** il 2026-08-22, vedi [ADR-0018](18-decision-log.md) |

## Radice

| File | Ruolo |
|------|-------|
| `package.json` | Web App. `engines.node = 22.x`. Script test/typecheck/lint/build/prisma. |
| `next.config.js` | Config Next: `reactStrictMode`, remote images, `serverActions.bodySizeLimit`. |
| `vercel.json` | `buildCommand: npm run vercel-build`, regione `fra1`. |
| `.vercelignore` | Esclude `easygamemobile/`, `.codex-tmp/`, log, env. |
| `.github/workflows/ci.yml` | Pipeline CI: job web, mobile e guardrail di sicurezza. |
| `tempo.config.json` | Residuo del tool Tempo. Nessun codice lo legge. |
| `components.json` | Config shadcn/ui. |
| `.eslintrc.json` / `.eslintignore` | ESLint via `next/core-web-vitals`. |
| `src/middleware.ts` | Cancello di autenticazione edge sui percorsi protetti. |
| `scripts/db-guard.mjs` | Blocca le scritture locali verso database condivisi. |
| `EasyGame - Avvio Locale.bat`, `avvia-easygame.cmd`, `start-local.sh`, `scripts/start-local.*` | Launcher locali multi-piattaforma. |

## Directory locali non versionate

`.next/`, `node_modules/`, `.vercel/`, `.vercel-home/`, `.codex*/`,
`.git-backups/` sono ignorate da Git. `.codex-tmp/` conteneva uno **snapshot
duplicato dell'intero repository** ed e stata rimossa dal tracking (commit di
cleanup 2026-08-22).
