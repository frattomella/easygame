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
| `EASYGAME_MAINTENANCE_TOKEN` | `POST /api/v1/maintenance` non accetta il token e resta azionabile solo da una sessione `platform_admin`. **E il comportamento voluto**: un confronto con una stringa vuota aprirebbe a chiunque una rotta che cancella righe. Finche non e impostata, sessioni, sfide OTP e contatori di rate limit scaduti **restano nel database** e crescono |
| `AUDIT_LOG_RETENTION_DAYS` | L'audit non viene mai cancellato. Voluto: il periodo di conservazione e una decisione di compliance, non un valore predefinito che si scopre dopo aver perso dei dati |
| `TWILIO_*` | Verifica telefono disattivata |
| `GOOGLE_*`, `MICROSOFT_*` | OAuth disattivato |
| `STRIPE_SECRET_KEY` | Nessun checkout online e nessun collegamento Connect. `describeCheckoutReadiness` risponde `provider_not_configured` e l'interfaccia lo dice, invece di offrire il pulsante ([ADR-0051](18-decision-log.md#adr-0051--due-flussi-stripe-due-account-due-segreti-il-denaro-delle-famiglie-non-e-il-fatturato-di-easygame)) |
| `STRIPE_WEBHOOK_SECRET` | `/api/payments/webhook` risponde **503** e non crede a niente. E il comportamento voluto: senza segreto non si distingue un evento del PSP da un POST qualunque |
| `PLATFORM_FEE_PERCENT` | Si usa il valore predefinito (2,5%). La commissione vera e configurazione per club e dipende da un accordo commerciale |
| `PAYPAL_*` | PayPal non ha un adapter: il registro dei gateway lo dichiara `no_adapter` |
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

### Le quattro migrazioni dell'integrazione Web V1: audit e rollback (2026-08-25)

Entrano insieme, in quest'ordine. I timestamp sono stati **rinominati**
all'integrazione perche tre workstream ne avevano prodotti tre identici
(`20260826090000`); il contenuto SQL non e stato toccato
([ADR-0041](18-decision-log.md#adr-0041--numerazione-e-fine-riga-quando-piu-workstream-lavorano-in-parallelo)).

| Ordine | Migrazione | Cosa fa |
|--------|-----------|---------|
| 1 | `20260826090000_payment_transactions` | `CREATE TABLE payment_transactions`, tre indici, quattro FK. Su `receipts`: aggiunge `transaction_id`, **rimuove** l'unique su `payment_id` e lo sostituisce con un indice non unico |
| 2 | `20260826140000_funding_programs` | Cinque `CREATE TABLE` (`funding_programs`, `funding_enrollments`, `funding_accruals`, `funding_settlements`, `funding_settlement_lines`), nove indici, undici FK |
| 3 | `20260826150000_multisite` | Tre `ADD COLUMN IF NOT EXISTS` (`clubs.club_sites`, `clubs.category_groups`, `athlete_category_memberships.site_id`) e un indice |
| 4 | `20260826160000_forms_v2` | Tre `CREATE TABLE` (`form_templates`, `form_template_versions`, `form_submissions`), cinque indici, cinque FK |

**Sono tutte additive.** Nessuna legge, converte o riscrive una riga
esistente. Le colonne nuove nascono `NULL`, e per la multi-sede `NULL` ha un
significato dichiarato — «sede non dichiarata», cioe visibile ovunque
([ADR-0038](18-decision-log.md)) — quindi un club che non configura le sedi
non si accorge della migrazione.

**L'unica operazione non additiva** e `DROP INDEX IF EXISTS
"receipts_payment_id_key"` nella prima. Rimuovere un vincolo di unicita non
puo invalidare nessuna riga: cio che era valido con il vincolo lo resta senza.
Serve perche una rata incassata a rate ha piu ricevute, una per incasso
([ADR-0036](18-decision-log.md)).

**Verifica fatta prima del deploy**, su un database *shadow* locale e
usa e getta, mai su staging:

```bash
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "<dev locale>/easygame_shadow"
```

Le tredici migrazioni si applicano in ordine su un database vuoto e producono
lo schema atteso. L'unica differenza segnalata riguarda
`athlete_category_memberships` (default di `id` e `updated_at`, nomi di due
indici) ed e **preesistente**: lo stesso comando eseguito sulla baseline
`d78e047` produce una differenza identica. Le quattro migrazioni nuove non
aggiungono deriva. La voce e [D33](16-technical-debt.md).

**Rollback.** Nell'ordine inverso, e dentro le singole migrazioni nell'ordine
imposto dalle chiavi esterne:

```sql
-- 4. Modulistica V2
DROP TABLE IF EXISTS "form_submissions";
DROP TABLE IF EXISTS "form_template_versions";
DROP TABLE IF EXISTS "form_templates";

-- 3. Multi-sede
DROP INDEX IF EXISTS "athlete_category_memberships_organization_id_site_id_idx";
ALTER TABLE "athlete_category_memberships" DROP COLUMN IF EXISTS "site_id";
ALTER TABLE "clubs" DROP COLUMN IF EXISTS "category_groups";
ALTER TABLE "clubs" DROP COLUMN IF EXISTS "club_sites";

-- 2. Contributi
DROP TABLE IF EXISTS "funding_settlement_lines";
DROP TABLE IF EXISTS "funding_settlements";
DROP TABLE IF EXISTS "funding_accruals";
DROP TABLE IF EXISTS "funding_enrollments";
DROP TABLE IF EXISTS "funding_programs";

-- 1. Incassi
ALTER TABLE "receipts" DROP CONSTRAINT IF EXISTS "receipts_transaction_id_fkey";
DROP INDEX IF EXISTS "receipts_transaction_id_key";
DROP INDEX IF EXISTS "receipts_payment_id_idx";
ALTER TABLE "receipts" DROP COLUMN IF EXISTS "transaction_id";
CREATE UNIQUE INDEX "receipts_payment_id_key" ON "receipts"("payment_id");
DROP TABLE IF EXISTS "payment_transactions";

DELETE FROM "_prisma_migrations" WHERE migration_name IN (
  '20260826090000_payment_transactions',
  '20260826140000_funding_programs',
  '20260826150000_multisite',
  '20260826160000_forms_v2'
);
```

**Cosa si perde facendo rollback**, e va guardato prima di deciderlo:

- **gli incassi registrati dopo il deploy.** Le rate tornano a portare solo
  `status`, `paid_at` e `method`, cioe la cache derivata: una rata incassata
  in tre volte tornerebbe a mostrare un solo stato, e i tre movimenti
  sparirebbero. Le rate **precedenti** al deploy non sono toccate, perche
  nessuna e stata convertita;
- **i contributi**: programmi, beneficiari, maturato, rendicontazioni e
  liquidazioni. Nessuno di questi dati esiste altrove;
- **sedi e gruppi operativi**, e la sede sulle appartenenze. Le appartenenze
  restano: perdono solo `site_id`;
- **i moduli V2 e le compilazioni.** I modelli V1 in
  `clubs.document_templates` non sono toccati — il travaso e una copia, non
  uno spostamento (B9-15) — quindi la Modulistica V1 tornerebbe funzionante.
  Gli allegati caricati dai moduli restano in `attachments`, orfani del
  modulo che li ha raccolti.

`CREATE UNIQUE INDEX "receipts_payment_id_key"` in coda al rollback **puo
fallire**, ed e giusto che fallisca: se dopo il deploy una rata ha ricevuto
piu di una ricevuta, il vincolo che si sta ripristinando non e piu vero. In
quel caso il rollback va fermato e le ricevute in eccesso decise a mano.

**Applicate su staging il 2026-08-25.** Deployment `dpl_DecP5z7KfH4UXzoWA4U9W98xSjdo`
(`easygame-staging`, stato `READY`, alias `easygame-staging-pi.vercel.app`),
dal branch `integration/web-v1` con CI verde su tutti e tre i job. Il log di
build mostra le quattro migrazioni applicate nell'ordine previsto, senza
errori:

```
13 migrations found in prisma/migrations
Applying migration `20260826090000_payment_transactions`
Applying migration `20260826140000_funding_programs`
Applying migration `20260826150000_multisite`
Applying migration `20260826160000_forms_v2`
```

Il deployment precedente, a cui tornare in caso di rollback applicativo, e
`easygame-staging-nc8q5sxws`. Attenzione: tornare al deployment precedente
**non** annulla le migrazioni, che restano applicate al database. Essendo
additive questo non rompe il codice vecchio — nessuna tabella o colonna che
usava e stata rimossa o cambiata — ma se serve annullare anche lo schema va
eseguito l'SQL di rollback qui sopra.

Smoke test dopo il deploy: nessun 5xx. Le pagine richieste rispondono 200,
`/api/v1/registry` serve 301 voci comprese quelle dei tre domini nuovi
(3 incassi, 5 contributi, 4 moduli), e le API protette rispondono 401 senza
sessione.

Prima di un rollback su un ambiente in uso conviene contare:

```sql
SELECT count(*) FROM payment_transactions;
SELECT count(*) FROM funding_enrollments;
SELECT count(*) FROM form_submissions;
SELECT count(*) FROM athlete_category_memberships WHERE site_id IS NOT NULL;
```

Se sono tutti a zero il rollback e gratuito.

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

---

## Stato di staging verificato — 2026-08-26 (Blocco Finale C)

| Voce | Valore |
|------|--------|
| Deployment | **READY**, target `production` del progetto `easygame-staging` |
| Migrazioni | **Nessuna nuova.** Il Blocco Finale C non tocca lo schema: `prisma migrate deploy` non ha avuto niente da applicare, e le 17 restano quelle del Blocco Finale B |
| Progetto production | **non esiste** nello scope, come dichiarato da CLAUDE.md sezione 9 |

Smoke test sull'URL pubblico `easygame-staging-pi.vercel.app`. Ogni riga e
stata letta **nel contenuto**, non solo nello stato: un 200 che restituisce la
pagina SSO di Vercel non e un 200 di EasyGame, ed e l'errore che il Blocco
Finale B ha gia dimostrato di poter fare.

| Verifica | Esito |
|----------|-------|
| `/`, `/login`, `/register`, `/account`, `/dashboard`, `/athletes`, `/payments`, `/modulistica`, `/organization`, console di piattaforma | **200**, e `<title>EasyGame</title>` — non la pagina di autenticazione di Vercel |
| `GET /api/v1/registry` | **200**, e contiene `maintenance.run`: la rotta nuova e servita davvero |
| `GET /api/v1/entitlements` senza sessione | **401** |
| `GET /api/v1/payment-transactions` senza sessione | **401** |
| `POST /api/v1/maintenance` senza token | **403** — la porta di servizio e chiusa, come deve essere quando `EASYGAME_MAINTENANCE_TOKEN` non e configurato |
| `POST /api/v1/auth/login` con `{"email":"non-una-email"}` | **400** con `code: "VALIDATION_ERROR"` e la lista dei campi: `email` non valida, `password` obbligatoria |
| `GET /api/public/forms/inesistente` | **404** |

**Cosa dice l'ultima riga della tabella.** Lo strato di validazione nuovo non e
solo compilato: risponde in produzione con il codice nell'envelope e con
entrambi i campi sbagliati elencati, che e esattamente il contratto scritto in
[09](09-api-conventions.md).

### Due cose da configurare su staging, quando si decide

- **`EASYGAME_MAINTENANCE_TOKEN`** non e impostata, quindi la pulizia delle
  righe scadute non e azionabile da un cron: sessioni, sfide OTP e contatori di
  rate limit scaduti restano nel database e crescono. Il 403 qui sopra e il
  comportamento voluto, non un difetto;
- **`AUDIT_LOG_RETENTION_DAYS`** non e impostata, quindi l'audit non viene mai
  cancellato. Anche questo e voluto: il periodo e una decisione di compliance.

### Il difetto d'ambiente di D39 non e cambiato

I deployment **Preview** continuano a fallire per `DIRECT_URL` mancante
sull'ambiente Preview del progetto. Non e una regressione di questo blocco e
non si corregge dal repository. Vedi D39.

### Un secondo difetto d'ambiente, trovato durante questo deploy

Il primo tentativo di deploy e stato **rifiutato**: `File size limit exceeded
(100 MB)`, con 612 MB caricati. La build di verifica del responsive
(`.next-verify`, prodotta con `NEXT_DIST_DIR`) non era in `.vercelignore`, che
elenca `.next/` per nome e non per prefisso. Aggiunto `.next-*/`: qualunque
build di verifica futura resta fuori dal caricamento.

---

## Stato di staging verificato — 2026-08-26 (Blocco Finale B)

| Voce | Valore |
|------|--------|
| Deployment | **READY**, target `production` del progetto `easygame-staging`, 2m di build |
| Migrazioni | **17/17 applicate.** Le due nuove — `20260826170000_document_numbering` e `20260826180000_payment_webhook_events` — applicate durante il deploy, «All migrations have been successfully applied» |
| Registro API | **305** endpoint (erano 261 al 2026-08-22) |
| Progetto production | **non esiste** nello scope, come dichiarato da CLAUDE.md sezione 9 |

Smoke test sull'URL pubblico `easygame-staging-pi.vercel.app`:

| Verifica | Esito |
|----------|-------|
| `/`, `/login`, `GET /api/v1/registry` | HTTP 200 |
| `GET /api/v1/entitlements` senza sessione | **401** |
| `GET /api/v1/documents/receipt/:id` senza sessione | **401** |
| `GET /api/v1/athletes` senza sessione | **401** |
| `POST /api/payments/webhook` con evento non firmato | **503** «Ricezione pagamenti non configurata» |

**Perche il 503 sul webhook e l'esito giusto e non un difetto.**
`STRIPE_WEBHOOK_SECRET` non e configurato su staging, quindi non c'e niente
con cui verificare una firma — e senza verifica non si puo credere a niente.
Un 200 direbbe al provider «ricevuto, non riprovare» e l'evento andrebbe
perso; il 503 dice che il problema e qui e che vale la pena riprovare. E la
prova sul campo che l'endpoint **non** accetta un evento non firmato
([ADR-0045](18-decision-log.md#adr-0045--cedipay-e-il-livello-di-prodotto-il-psp-sta-sotto-e-si-sostituisce)).

### Un difetto d'ambiente trovato durante il deploy

I deployment **Preview** falliscono, e falliscono da almeno quattordici ore —
cioe da prima di questo blocco. Il motivo sta nei log:

    Error code: P1012
    error: Environment variable not found: DIRECT_URL.

`DATABASE_URL` e `DIRECT_URL` sono configurate sull'ambiente **Production** del
progetto e non su **Preview**, quindi `npm run vercel-build` si ferma alla
validazione dello schema Prisma. Il deploy da riga di comando con `--prod`
funziona; quello automatico che Vercel innesca a ogni push sul branch no.

**Conseguenza pratica:** l'anteprima di un branch non e disponibile, e ogni
push lascia un deployment rosso nella dashboard che non riguarda il codice.
**Non e una regressione di questo blocco** e non si corregge dal repository:
richiede di aggiungere le due variabili all'ambiente Preview su Vercel, che e
una modifica alla configurazione e richiede autorizzazione (CLAUDE.md, sezione
9). Vedi D39.

## Le variabili del Blocco D (2026-08-26)

| Variabile | Se manca |
|-----------|----------|
| `STRIPE_SECRET_KEY` | Nessun checkout e nessun collegamento Connect. `describeCheckoutReadiness` risponde `provider_not_configured` e l'interfaccia lo dice, invece di offrire il pulsante |
| `STRIPE_WEBHOOK_SECRET` | `/api/payments/webhook` risponde **503** e non crede a niente. E il comportamento voluto: senza segreto non si distingue un evento del PSP da un POST qualunque |
| `STRIPE_BILLING_WEBHOOK_SECRET` | `/api/billing/webhook` risponde **503**. E una variabile distinta e non un vezzo: riusare quella degli incassi renderebbe impossibile ruotarne una sola senza fermare l'altro flusso |
| `PAYMENT_MODE` | Si assume `test`. Compare nell'interfaccia |
| `PLATFORM_FEE_PERCENT` | Vale `1`. **Non e piu il listino**: dal Blocco D le condizioni commerciali stanno in `platform_commission_rules` e si scrivono dalla console di piattaforma, con una decorrenza ([ADR-0050](18-decision-log.md#adr-0050--una-condizione-commerciale-ha-una-decorrenza-e-la-commissione-si-congela-sullincasso)) |

**Nessuna credenziale del provider fiscale.** Non esiste una variabile perche
non esiste un intermediario collegato: quando ne verra scelto uno, la sua
configurazione arrivera con il suo adapter.

### Cosa va configurato **nel database**, non nell'ambiente

Dalla console di piattaforma, sezione «Pagamenti & Billing»:

1. **il tipo di account Connect** (`standard` o `express`) — **prima** del
   primo collegamento reale, perche e irreversibile per account gia creato;
2. **la condizione commerciale standard**, con la sua decorrenza;
3. **gli identificativi dei prezzi** EasyGame su Stripe (`price_...`);
4. **l'abilitazione degli incassi online** per ogni societa, una per una: e
   un atto commerciale e non si concede da soli.

Sono nel database e non nell'ambiente perche cambiano per contratto e non per
rilascio del software.
