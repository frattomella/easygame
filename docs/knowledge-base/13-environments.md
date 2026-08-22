# 13 — Ambienti: Vercel, Neon, variabili

## Quadro degli ambienti (verificato 2026-08-22)

| Ambiente | Vercel | Database | Note |
|----------|--------|----------|------|
| **Locale** | — | Neon (stesso endpoint di staging via `.env`) | `npm run dev` su `127.0.0.1:3001` |
| **Staging** | Progetto `easygame-staging` | Neon, db `neondb` — endpoint in `DATABASE_URL` su Vercel | Alias pubblico dell'app |
| **Produzione** | **Non presente nello scope Vercel corrente** | — | Vedi avvertenza sotto |

> Questo repository e **pubblico**: host di database, endpoint Neon, connection
> string e nomi di team non vanno scritti nella documentazione. Per conoscerli
> usa `npx vercel env ls production` oppure la console Neon.

### Avvertenza sulla produzione

`vercel project ls` sull'account collegato mostra **un solo progetto**:
`easygame-staging`. Non esiste, in questo scope, un progetto di produzione.

Conseguenze:

- il deploy di staging usa l'environment `Production` **del progetto
  staging** — e normale, non e la produzione del prodotto;
- se una produzione esiste, vive su un altro account/team e **non e
  raggiungibile da questa working copy**;
- **nessun deploy verso un progetto production va eseguito senza
  autorizzazione esplicita e verifica del target.**

### Development separato da staging — `EASYGAME_DB_ENV` e la guardia

[ADR-0012](18-decision-log.md) stabilisce che lo sviluppo locale deve avere un
**branch/database Neon dedicato** e non deve mai scrivere su staging.

**Stato al 2026-08-22:** il branch Neon di sviluppo **non e ancora stato
creato** — richiede accesso alla console Neon, non disponibile da questa
working copy. Nel frattempo il `.env` locale punta ancora all'endpoint di
staging, ma **la scrittura e bloccata a livello di script**.

#### La guardia

`scripts/db-guard.mjs` precede ogni comando npm che scrive sul database:

| Script | Protetto |
|--------|----------|
| `db:push`, `prisma:push` | si |
| `db:migrate`, `prisma:migrate` | si |
| `prisma:seed` | si |
| `staging:provision-e2e` | si |
| `db:status` (`prisma migrate status`) | no — sola lettura |
| `db:generate`, `prisma:generate` | no — non tocca il database |
| `vercel-build` (`prisma migrate deploy`) | **no, di proposito** — e il percorso legittimo con cui gli ambienti ricevono le migrazioni |

Comportamento, in base a `EASYGAME_DB_ENV`:

- `development` → il comando procede;
- `staging` o `production` → **bloccato**, con l'indicazione che le migrazioni
  arrivano dal deploy Vercel;
- **non impostata** → **bloccato**, perche non e possibile sapere su cosa si
  scriverebbe.

La guardia stampa host e nome del database (mai utente, password o query
string) per rendere evidente il target.

Override per un singolo comando, da usare **solo con autorizzazione
esplicita**:

```bash
EASYGAME_ALLOW_SHARED_DB_WRITE=1 npm run prisma:seed
```

#### Come completare la separazione

1. Nella console Neon, crea un branch del progetto chiamato `development`.
2. Copia le due connection string (pooled e direct).
3. Nel `.env` locale imposta `DATABASE_URL`, `DIRECT_URL` e
   `EASYGAME_DB_ENV="development"`.
4. Allinea lo schema: `npx prisma migrate deploy` (oppure `npm run db:migrate`,
   ora consentito).
5. Popola i dati demo con una password tua:
   `SEED_DEMO_PASSWORD="$(openssl rand -base64 24)" npm run prisma:seed`.
6. Verifica che `npm run db:status` riporti il branch di sviluppo.

Finche il punto 1 non e fatto, in locale restano possibili solo le letture.

## Variabili d'ambiente

### Presenti su Vercel `easygame-staging`

`DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_APP_URL`, `AUTH_BASE_URL`,
`EASYGAME_PLATFORM_ADMIN_EMAILS`,
`NEXT_PUBLIC_EASYGAME_PLATFORM_ADMIN_EMAILS`, `AUTH_RATE_LIMIT_SECRET`.

### Assenti su staging (e le funzioni che ne dipendono)

| Variabile | Effetto dell'assenza |
|-----------|----------------------|
| `SMTP_CREDENTIALS_SECRET` | Fallback su `AUTH_RATE_LIMIT_SECRET` — funziona, ma la password SMTP e legata a quel segreto |
| `CRON_SECRET` | Job automatico allenamenti «tutti i club» non invocabile |
| `TWILIO_*` | Verifica telefono disattivata |
| `GOOGLE_*`, `MICROSOFT_*` | OAuth disattivato |
| `PAYPAL_*`, `STRIPE_*` | Checkout online comunque non implementato |
| `AUTH_ALLOW_TEST_CODES` | Codici OTP non esposti (corretto) |
| `NEXT_PUBLIC_TEMPO` | Nessun effetto: il codice Tempo e stato rimosso |

Riferimento completo: [`.env.example`](../../.env.example).

### Semantica di alcune variabili

| Variabile | Significato |
|-----------|-------------|
| `DATABASE_URL` | Endpoint **pooler** Neon. Obbligatoria: `src/lib/server/prisma.ts` lancia un errore all'avvio se manca |
| `DIRECT_URL` | Endpoint diretto per Prisma CLI e migrazioni |
| `NEXT_PUBLIC_APP_URL` | URL pubblico dell'app |
| `AUTH_BASE_URL` | Base per le redirect URI OAuth |
| `AUTH_RATE_LIMIT_SECRET` | Salt degli hash delle chiavi di rate limit **e** fallback per la cifratura SMTP. Cambiarla invalida i bucket e rende indecifrabile la password SMTP |
| `EASYGAME_PLATFORM_ADMIN_EMAILS` | CSV di email admin di piattaforma. Se **vuota**, chiunque abbia `role in ("platform_admin","admin")` diventa admin: tenerla sempre valorizzata |
| `AUTH_ALLOW_TEST_CODES` | Espone gli OTP in risposta. **Mai `true` in un ambiente condiviso** |

## Build e deploy

`vercel.json`:

```json
{
  "buildCommand": "npm run vercel-build",
  "outputDirectory": ".next",
  "installCommand": "npm install",
  "framework": "nextjs",
  "regions": ["fra1"]
}
```

`npm run vercel-build` = `prisma generate && prisma migrate deploy && next build`

> **Ogni deploy applica le migrazioni pendenti al database dell'ambiente.**
> Non e possibile deployare codice senza migrare. Prima di un deploy verifica
> sempre `npx prisma migrate status` e il contenuto di `prisma/migrations/`.

`.vercelignore` esclude `easygamemobile/`, `.codex-tmp/`, `node_modules/`,
`.next/`, `.git/`, i file `.env` e i log. **Il mobile non viene mai deployato.**

## Comandi

```bash
# stato migrazioni (sola lettura)
npx prisma migrate status

# build locale
npm run build

# deploy staging (progetto gia collegato in .vercel/project.json)
npx vercel --prod

# variabili ambiente del progetto collegato
npx vercel env ls production
```

## Avvio locale

```bash
npm install          # esegue anche prisma generate (postinstall)
npm run dev          # http://127.0.0.1:3001
```

Launcher alternativi per chi non usa la CLI:
`EasyGame - Avvio Locale.bat`, `avvia-easygame.cmd`,
`scripts/start-local.ps1`, `start-local.sh`, `npm run local`.

## Script di supporto

| Script | Scopo |
|--------|-------|
| `scripts/verify-neon-ssl.mjs` | Verifica che le connection string abbiano SSL/channel binding |
| `scripts/configure-staging-neon-ssl.mjs` | Allinea i parametri SSL su staging |
| `scripts/verify-staging-access-switch.mjs` | Verifica il cambio di club/ruolo su staging |
| `scripts/provision-staging-e2e.mjs` | `npm run staging:provision-e2e` — **crea dati** su staging |
| `scripts/start-local.mjs` / `.ps1` | Avvio guidato locale |

Gli script che scrivono (`provision-staging-e2e`) vanno eseguiti solo con
autorizzazione esplicita.

## Stato di staging verificato — 2026-08-22

| Voce | Valore |
|------|--------|
| Deployment | stato **READY**, target `production` del progetto staging |
| Alias pubblico | verificato: punta a questo deployment (URL nella dashboard Vercel) |
| Migrazioni | 6/6 applicate, «Database schema is up to date» prima e dopo il deploy |
| SMTP | **Configurato** — `GET /api/v1/auth/providers` restituisce `emailProviderConfigured: true`, `email_provider_configs` ha 1 riga |
| Verifica telefono | Disattivata (`phoneVerification: false`) — Twilio non configurato |
| OAuth | Nessun provider attivo (`providers: []`) |
| Codici OTP di test | Disattivati (`testCodesEnabled: false`) — corretto |
| Registro API | 261 endpoint esposti da `GET /api/v1/registry` |

Smoke test eseguiti dopo il deploy, tutti conformi:

| Verifica | Esito |
|----------|-------|
| `/`, `/login`, `/register`, `/account` | HTTP 200 |
| `GET /api/v1/registry`, `/auth/providers`, `/auth/session` | HTTP 200 |
| `GET /api/v1/athletes` senza sessione | **401** `{"error":{"message":"Sessione non valida"}}` |
| `POST /api/v1/auth/login` con credenziali errate | **401** |

Conteggi letti in sola lettura dopo il deploy (nessuna scrittura eseguita):
20 utenti, 4 club, 308 atleti, 155 `club_resource_items`, 14 membership,
1 configurazione email.
