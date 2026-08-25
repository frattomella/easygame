# 13 — Ambienti: Vercel, Neon, variabili

## Quadro degli ambienti (verificato 2026-08-22)

| Ambiente | Vercel | Database | Note |
|----------|--------|----------|------|
| **Locale** | — | **Database di sviluppo dedicato** (Docker su porta 5434, oppure branch Neon `development`) | `npm run dev` su `127.0.0.1:3001` |
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

### Development separato da staging — ATTIVO

[ADR-0012](18-decision-log.md) stabilisce che lo sviluppo locale non deve mai
scrivere su staging. Dal 2026-08-22 la separazione e **effettiva**: l'ambiente
locale punta a un proprio database.

#### Opzione A — database in Docker (predefinita)

`docker-compose.dev.yml` avvia un PostgreSQL 17 dedicato sulla porta **5434**,
scelta per non collidere con un eventuale PostgreSQL gia installato sulla
macchina (tipicamente 5432/5433).

```bash
docker compose -f docker-compose.dev.yml up -d
npx prisma migrate deploy
SEED_DEMO_PASSWORD="$(openssl rand -base64 18)" npm run prisma:seed
```

Connection string (gia in `.env.example`):

```
postgresql://easygame:easygame_dev_local@127.0.0.1:5434/easygame_dev?sslmode=disable
```

Le credenziali del container sono volutamente banali: e un database locale,
usa e getta, mai esposto. Il volume `easygame-dev-db-data` conserva i dati tra
un riavvio e l'altro; per ripartire da zero,
`docker compose -f docker-compose.dev.yml down -v`.

#### Opzione B — branch Neon `development`

Piu vicino alla produzione (stesso motore gestito, stesso SSL). Va creato dalla
console Neon — **non e automatizzabile da questa working copy**, che non ha
credenziali API Neon. Una volta creato, incolla le due connection string in
`DATABASE_URL` (pooled) e `DIRECT_URL` (direct).

#### In entrambi i casi

Imposta nel `.env` locale:

```
EASYGAME_DB_ENV="development"
```

#### La guardia sulle scritture

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

Comportamento in base a `EASYGAME_DB_ENV`: `development` passa;
`staging`/`production` sono bloccati; **variabile assente** e bloccata, perche
il target sarebbe ignoto. La guardia stampa host e nome database, mai
credenziali.

Override per un singolo comando, **solo con autorizzazione esplicita**:

```bash
EASYGAME_ALLOW_SHARED_DB_WRITE=1 npm run prisma:seed
```

Anche `npm run local` avvisa in modo visibile se sta per avviarsi contro un
database non di sviluppo.

**Limite noto:** la guardia copre gli script npm, non un `npx prisma db push`
invocato a mano.

## Variabili d'ambiente

### Presenti su Vercel `easygame-staging`

`DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_APP_URL`, `AUTH_BASE_URL`,
`EASYGAME_PLATFORM_ADMIN_EMAILS`,
`NEXT_PUBLIC_EASYGAME_PLATFORM_ADMIN_EMAILS`, `AUTH_RATE_LIMIT_SECRET`.

### Assenti su staging (e le funzioni che ne dipendono)

| Variabile | Effetto dell'assenza |
|-----------|----------------------|
| `SMTP_CREDENTIALS_SECRET` | Fallback su `AUTH_RATE_LIMIT_SECRET` — funziona, ma le password SMTP **e IMAP** restano legate a quel segreto: cambiarlo le rende indecifrabili e vanno riconfigurate dal pannello |
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
| `DATABASE_URL` | Connection string PostgreSQL: endpoint **pooler** Neon negli ambienti, database di sviluppo in locale. Obbligatoria: `src/lib/server/prisma.ts` fallisce alla prima query se manca |
| `DIRECT_URL` | Endpoint diretto per Prisma CLI e migrazioni |
| `NEXT_PUBLIC_APP_URL` | URL pubblico dell'app |
| `AUTH_BASE_URL` | Base per le redirect URI OAuth |
| `AUTH_RATE_LIMIT_SECRET` | Salt degli hash delle chiavi di rate limit **e** fallback per la cifratura SMTP. Cambiarla invalida i bucket e rende indecifrabile la password SMTP |
| `EASYGAME_PLATFORM_ADMIN_EMAILS` | CSV di email admin di piattaforma. Se **vuota**, chiunque abbia `role in ("platform_admin","admin")` diventa admin: tenerla sempre valorizzata |
| `AUTH_ALLOW_TEST_CODES` | Espone gli OTP in risposta. **Mai `true` in un ambiente condiviso** |

### I deploy di anteprima falliscono, e non e una regressione (rilevato 2026-08-25)

Ogni push su un branch fa partire un deploy di **anteprima** su Vercel, e ogni
deploy di anteprima **fallisce**:

```
Error code: P1012
error: Environment variable not found: DIRECT_URL.
```

**Causa.** Nessuna variabile del progetto `easygame-staging` e assegnata
all'ambiente **Preview**: `npx vercel env ls` le mostra tutte su
`Development` e `Production`, impostate 129 giorni fa. Il build di anteprima
esegue `npm run vercel-build`, che comincia con `prisma generate`, e senza
`DIRECT_URL` lo schema non valida.

**Non e un difetto del codice** e non e stato introdotto dal Blocco 7: e cosi
da sempre, e i deploy espliciti (`npx vercel --prod`, che su questo progetto
pubblica **staging**) funzionano perche usano l'ambiente Production.

**Conseguenza pratica.** L'anteprima automatica per branch non e utilizzabile:
la verifica su staging va fatta con un deploy esplicito dopo che i gate sono
verdi, come prescrive [CLAUDE.md](../../CLAUDE.md).

**Come si chiuderebbe.** Assegnando `DATABASE_URL` e `DIRECT_URL` anche
all'ambiente Preview. **Non e stato fatto**: cambiare una variabile d'ambiente
Vercel richiede autorizzazione esplicita, e va deciso a quale database far
puntare le anteprime — farle puntare a staging significa che un branch
qualunque puo scriverci.

### Migrazione `20260825120000_attachments`: audit e rollback (2026-08-25)

**Cosa fa.** Due `CREATE TABLE` (`attachments`, `attachment_blobs`), tre
indici e due chiavi esterne. Le due `ALTER TABLE` aggiungono i vincoli alle
tabelle **nuove**, non a `clubs`.

**Cosa non fa, e conta piu di cosa fa.** Non legge, non scrive e non altera
nessuna tabella esistente. Non c'e nessuna riga di dati coinvolta: gli
allegati legacy restano dove sono e continuano a funzionare. Applicarla su un
database popolato e un'operazione a rischio zero, e reversibile.

**Verifica fatta senza toccare nessun database:**

```bash
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
```

Il DDL generato da Prisma coincide colonna per colonna con quello scritto a
mano. L'unica differenza e la `CHECK ("size_bytes" > 0)`, che il modello
Prisma non esprime: e lo stesso drift cosmetico gia documentato per
`email_provider_configs` e `imap_provider_configs` in [06](06-data-model.md).

**Rollback.** Nell'ordine, perche il blob ha una chiave esterna verso
l'allegato:

```sql
DROP TABLE IF EXISTS "attachment_blobs";
DROP TABLE IF EXISTS "attachments";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20260825120000_attachments';
```

**Cosa si perde facendo rollback:** gli allegati caricati **dopo** il deploy,
perche i loro byte stanno in quelle tabelle. I record che li referenziano
resterebbero con un `attachment:<uuid>` che non risolve — l'interfaccia
direbbe «Allegato non trovato», che e il comportamento corretto ma non
riporta indietro il file. Gli allegati legacy non sono toccati in nessun caso.

Prima di un rollback su un ambiente in uso conviene quindi guardare
`SELECT count(*) FROM attachments`: se e zero, il rollback e gratuito.

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
| `scripts/start-local.mjs` / `.ps1` | Avvio guidato locale; avvisa se il target non e un database di sviluppo |
| `scripts/db-guard.mjs` | Blocca gli script npm di scrittura verso database condivisi |
| `docker-compose.dev.yml` | Database PostgreSQL di sviluppo, porta 5434 |

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
