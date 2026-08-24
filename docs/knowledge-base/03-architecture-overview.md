# 03 — Architettura generale

## Vista d'insieme

```
┌──────────────────────────┐        ┌──────────────────────────────┐
│  Web App (browser)       │        │  Mobile App (Expo / RN)      │
│  Next.js App Router      │        │  solo area Trainer           │
│  src/app/**              │        │  easygamemobile/client/**    │
│                          │        │                              │
│  simplified-db.ts        │        │  services/mobile-backend-    │
│    └─ supabase.ts        │        │    storage.ts                │
│         └─ api/client.ts │        │      └─ services/api.ts      │
└───────────┬──────────────┘        └───────────────┬──────────────┘
            │  fetch, cookie easygame_session       │  fetch, Bearer token
            │  header x-active-club-id              │  header x-active-club-id
            ▼                                       ▼
    ┌──────────────────────────────────────────────────────────┐
    │  Next.js Route Handlers  (src/app/api/**)                │
    │  runtime nodejs, hosting Vercel, regione fra1            │
    │                                                          │
    │  requireAuthenticatedUser  →  sessione DB                │
    │  resolveOrganizationScopeForUser  →  club consentiti     │
    │  assertClubResourceAccess  →  permesso per ruolo         │
    │  lib/server/resources.ts  →  accesso dati generico       │
    └───────────────────────────┬──────────────────────────────┘
                                │  Prisma 6 + @prisma/adapter-pg
                                ▼
                   ┌──────────────────────────────┐
                   │  Neon PostgreSQL             │
                   │  DATABASE_URL  (pooler)      │
                   │  DIRECT_URL    (migrazioni)  │
                   └──────────────────────────────┘
```

## Principi effettivamente implementati

1. **Un solo backend.** Le API Next.js sotto `src/app/api` servono sia il Web sia
   il Mobile. Non esistono backend paralleli attivi (l'Express in
   `easygamemobile/server` e uno scaffold vuoto).
2. **Multi-tenant logico.** Un unico database Neon; ogni entita operativa porta
   `organization_id`. Nessun database per club. Vedi
   [`docs/multi-tenant-architecture.md`](../multi-tenant-architecture.md).
3. **Sessioni server-side opache.** Nessun JWT: il token e una stringa random
   salvata nella tabella `sessions` e validata a ogni richiesta.
4. **Autorizzazione centralizzata.** Tutta la matrice ruoli/risorse vive in
   `src/lib/access-roles.ts`, usata sia dal server (API) sia dal client (guard).
5. **Envelope uniforme.** Ogni risposta API e `{ data, error }`.

## Il flusso di una richiesta di lettura

Esempio: la pagina atleti carica la lista.

1. Il componente chiama una funzione di `src/lib/simplified-db.ts`.
2. `simplified-db` usa l'adapter `src/lib/supabase.ts` (sintassi
   `from(...).select(...).eq(...)`).
3. L'adapter traduce in una chiamata `apiRequest` (`src/lib/api/client.ts`) verso
   `GET /api/v1/athletes?...`.
4. `apiRequest` aggiunge automaticamente `credentials: include` e gli header di
   contesto `x-active-club-id`, `x-active-access-role`, `x-active-season-id`
   letti da `localStorage`.
5. `src/app/api/v1/[resource]/route.ts`:
   - `requireAuthenticatedUser` legge il cookie o l'header `Authorization`,
     verifica la sessione a DB;
   - `resolveOrganizationScopeForUser` calcola club consentiti, club attivo e
     ruolo attivo (membership + ownership);
   - `assertClubResourceAccess(role, resource, "read")` applica la matrice
     permessi;
   - `listResource` forza `where.organization_id` allo scope risolto.
6. La risposta torna come `{ data: [...], error: null }`.

**Nota di sicurezza:** il client puo proporre `x-active-club-id`, ma il server
accetta il valore **solo se compreso in `allowedOrganizationIds`**; altrimenti
solleva «Accesso negato alla risorsa del club». Il client non puo scavalcare il
tenant.

**Nota:** `x-active-season-id` e letto dal CRUD generico (WP-32): in lettura
esclude le risorse di altre stagioni, in creazione stampa la stagione attiva
sul payload. Non e un confine di sicurezza — quello resta `organization_id` —
e in aggiornamento non puo spostare un record fra stagioni. Le stagioni si
governano da `/api/v1/seasons` ([ADR-0031](18-decision-log.md)).

## Layering (stato reale)

| Layer | Dove vive | Osservazione |
|-------|-----------|--------------|
| Presentazione | `src/app/**/page.tsx`, `src/components/**` | Pagine molto grandi, logica di dominio spesso inline |
| Dominio client | `src/lib/simplified-db.ts` + ~50 utility in `src/lib` | Qui vive gran parte delle regole di business |
| Trasporto | `src/lib/supabase.ts` → `src/lib/api/client.ts` | Due livelli di indirezione storici |
| API | `src/app/api/**/route.ts` | Auth + autorizzazione + validazione minima |
| Dominio server | `src/lib/server/**` | `resources.ts`, `auth-workflows.ts`, `email/`, `training-automation.ts` |
| Persistenza | Prisma → Neon | |

**Il punto debole strutturale**: la maggior parte delle regole di business e nel
**client** (`simplified-db.ts`), non nel server. Il server e prevalentemente un
CRUD generico con controllo accessi. Questo e il vincolo piu rilevante per una
futura estrazione del backend (Cedi Platform). Vedi
[19 — Roadmap](19-roadmap.md) e [ADR-0007](18-decision-log.md).

## Due forme di persistenza convivono

1. **Tabelle relazionali** — `users`, `sessions`, `clubs`, `athletes`,
   `payments`, `invoices`, `receipts`, `medical_certificates`, ...
2. **Risorse generiche di club** — la tabella `club_resource_items`
   (`organization_id` + `resource_type` + `payload` JSON) contiene 27 tipi:
   `categories`, `trainings`, `matches`, `sponsors`, `transactions`,
   `staff_members`, `trainers`, ...

Il registro risorse (`RESOURCE_CONFIG` in `src/lib/server/resources.ts`)
astrae la differenza: chi chiama `/api/v1/matches` non sa se il dato e in una
tabella dedicata o in `club_resource_items`.

**Doppia scrittura da conoscere.** Le stesse informazioni esistono anche come
colonne `Json?` su `clubs` (`clubs.matches`, `clubs.categories`, ...) e le due
copie sono tenute allineate esplicitamente:

- scrivere su `/api/v1/<club_resource>` aggiorna `club_resource_items` e poi
  riscrive la colonna JSON aggregata (`syncClubAggregateField`);
- scrivere il campo JSON su `/api/v1/clubs/:id` **cancella e ricrea** tutte le
  righe `club_resource_items` di quel tipo (`syncClubResourceItemsFromField`).

E il pezzo di architettura piu delicato del progetto. Prima di toccarlo leggi
[06 — Modello dati](06-data-model.md) e [16 — Debito tecnico](16-technical-debt.md).
