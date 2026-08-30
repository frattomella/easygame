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
| `EASYGAME_MAINTENANCE_TOKEN` | `POST /api/v1/maintenance` non accetta il token e resta azionabile solo da una sessione `platform_admin`. **E il comportamento voluto**: un confronto con una stringa vuota aprirebbe a chiunque una rotta che cancella righe. Dal 2026-08-28 la pulizia periodica **non dipende piu da questa variabile**: la aziona Vercel Cron sul `GET`, che usa `CRON_SECRET`. Questa resta per un cron che non sia quello dell'hosting (ADR-0007) |
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
| `EASYGAME_TRUSTED_MEDIA_HOSTS` | CSV di host verso cui `/api/v1/athletes/<id>/avatar` accetta di rimandare quando `avatar_url` porta un indirizzo esterno. Vuota va bene: le foto caricate diventano `data:` e non hanno bisogno di rimandi. Senza l elenco la rotta sarebbe un **rimando aperto** ospitato dal dominio del prodotto, su un valore che la segreteria digita |
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

## Stato di staging verificato — 2026-08-28 (UAT di RC Fix 2)

| Voce | Valore |
|------|--------|
| Deployment | `r8a5kgaky`, **READY**, target `production` del progetto `easygame-staging`, commit `a2f6ec7` |
| Alias | `https://easygame-staging-pi.vercel.app` |
| Migrazioni | **Nessuna nuova.** RC Fix 2 non tocca lo schema: `prisma migrate deploy` non ha avuto niente da applicare |
| CI remota | verde su `ca4a51f` e su `a2f6ec7` |
| Progetto production | **non esiste** nello scope Vercel, come dichiarato da CLAUDE.md sezione 9. Il progetto **Neon** `easygame-production` esiste, non e stato toccato e ha `active_time: 0` |

**Due deploy, non uno.** Il primo (`dztsougyk`) portava le correzioni dei
sette difetti trovati provando l'applicazione; l'ottavo — `Elimina categoria`
che rispondeva 400 — e emerso **mentre si usava** quel deploy, ed e stato
corretto e distribuito con il secondo (`r8a5kgaky`). E il modo in cui la
verifica su un ambiente vero si paga da sola: la riprova di una correzione e
il posto piu probabile dove trovare la successiva.

### Cosa e stato letto, non solo interrogato

La UAT ha esercitato le pagine, non gli endpoint: creazione di un atleta, di
un allenatore, di un membro dello staff e di un socio; due sedi e una
categoria attiva su entrambe; selezione multipla ed export sui tre elenchi;
l'assegnazione di massa a un gruppo, due volte di fila; la scheda atleta
aperta **senza** `clubId`; l'indicatore di autosave osservato campionando il
DOM ogni 150 ms. Il dettaglio, punto per punto, sta in
[25 — RC Fix 2](25-rc-fix-2.md#la-uat-su-staging-e-gli-otto-difetti-che-ha-trovato).

### Due cose che restano non verificabili da qui

- **La scheda del conto di incasso** non si monta su EasyGame FC: la voce
  «Pagamenti» e dietro un abbonamento non attivo. Il contratto dei dati e
  stato letto lo stesso — `GET /api/v1/payments/account` risponde
  `provider: "stripe"` dal record, con `chargesEnabled` e `payoutsEnabled`
  separati e un `readiness.blocker` distinto — ma il logotipo e le due righe
  di stato no. Attivare un abbonamento di prova richiede una riga in
  `platform_billing_accounts`;
- **i deployment Preview continuano a fallire** per `DIRECT_URL` mancante
  sull'ambiente Preview. Non e una regressione: vale da prima di questo
  lavoro e non si corregge dal repository (vedi D39).

### I dati di collaudo lasciati su EasyGame FC

Le quattro categorie «Categoria importata» di RC Fix 1 **sono state
rimosse**, dall'applicazione e con le condizioni verificate prima.

Restano invece, di proposito, le anagrafiche create per la UAT — tutte con il
cognome che finisce per `Uat` — piu la categoria `UAT Pulcini` con le sedi
`Roma` e `Aprilia`: sono la configurazione multi-sede senza la quale tre degli
otto difetti non si vedono, e questo e l'unico club multi-sede a cui le
credenziali demo diano accesso.

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

## Stato di staging verificato — 2026-08-26 (Blocco D2)

| Voce | Valore |
|------|--------|
| Deployment | **READY**, target `production` del progetto `easygame-staging`, commit `a5d4231` |
| Migrazioni | **Due applicate** durante il build: `20260826200000_platform_billing_and_fiscal` (arretrata dal Blocco D) e `20260826210000_funding_accrual_source`. Ora sono 17 |
| Progetto production | **non esiste** nello scope, come dichiarato da CLAUDE.md sezione 9 |

### Due cose successe durante questo deploy, e vanno dette

**La CI di GitHub non ha eseguito.** Il push e arrivato — `git ls-remote`
conferma `a5d4231` su `integration/web-v1` — e il workflow risulta
`active`, ma nessun run e stato creato: l'ultimo sull'API delle Actions resta
`2c94f8f` delle 10:36Z, e i tredici commit spinti dopo non ne hanno prodotto
nessuno. E una condizione dell'account, non del repository, e non si vede senza
autenticazione. **Al suo posto sono stati eseguiti in locale tutti e tre i job
del workflow**, con gli stessi comandi: build, typecheck, lint, test,
`--allowUnreachableCode false`, i due comandi del mobile e i quattro
guardrail di sicurezza. Tutti verdi.

**`npx vercel --prod` ha risposto `Not authorized` a meta build.** Il
comando e uscito con errore *dopo* che le migrazioni erano gia state applicate,
mentre Next stava costruendo. Il deployment pero **e proseguito lato server**:
`vercel ls` lo ha mostrato prima `Building` e poi `Ready` in tre minuti.
L'errore era della sessione della CLI, non della build. Chi rilancia un deploy
e vede quel messaggio deve **controllare `vercel ls` prima di ripetere**, per
non lanciarne un secondo su un primo che sta riuscendo.

### Smoke test

Sull'URL pubblico `easygame-staging-pi.vercel.app`. Le pagine sono state
lette **nel contenuto**, non solo nello stato.

| Verifica | Esito |
|----------|-------|
| `/`, `/login` | **200**, e `<title>EasyGame</title>` — non la pagina di autenticazione di Vercel |
| `/dashboard`, `/athletes`, `/athletes/new`, `/categories`, `/training`, `/payments`, `/organization` senza sessione | **307** verso `/login?next=…`. La rotta nuova `/athletes/new` si comporta come le altre protette: un 404 direbbe che non esiste |
| `GET /api/v1/registry` | **200**, 325 endpoint, e gli undici dei contributi ci sono tutti |
| `GET /api/v1/funding/programs`, `/funding/accruals`, `/payment-transactions` senza sessione | **401** |
| `POST /api/v1/funding/accruals` con `{"action":"confirm"}` e senza sessione | **401** — l'autenticazione viene prima della validazione dell'azione, come deve |

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
| `STRIPE_SECRET_KEY` | Nessun checkout e nessun collegamento Connect. `describeCheckoutReadiness` risponde `provider_not_configured` e l'interfaccia lo dice, invece di offrire il pulsante. Il suo prefisso — `sk_` seguito da `test` o da `live` — dichiara anche **quale ambiente** questo deployment accetta sui webhook, e vince su `PAYMENT_MODE` |
| `STRIPE_WEBHOOK_SECRET` | `/api/payments/webhook` risponde **503** e non crede a niente. E il comportamento voluto: senza segreto non si distingue un evento del PSP da un POST qualunque |
| `STRIPE_BILLING_WEBHOOK_SECRET` | `/api/billing/webhook` risponde **503**. E una variabile distinta e non un vezzo: riusare quella degli incassi renderebbe impossibile ruotarne una sola senza fermare l'altro flusso |
| `PAYMENT_MODE` | Si assume `test`. Compare nell'interfaccia, ed e il **ripiego** per decidere quali eventi di webhook accettare quando la chiave segreta non e riconoscibile ([ADR-0060](18-decision-log.md#adr-0060--la-firma-dice-chi-ha-parlato-non-da-quale-mondo-sandbox-e-produzione-si-separano-sullevento)) |
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

---

## Backup e ripristino — procedura provata (Blocco E, 2026-08-26)

Era il blocker RC-3: «un gestionale che tiene anagrafiche di minori e movimenti
di denaro non si rilascia senza aver **ripristinato** almeno una volta».
L'esercitazione e stata eseguita sul database di **sviluppo**, mai su staging.

### Perche non su staging

Un ripristino e distruttivo per definizione: sostituisce cio che c'e. Provarlo
sull'unico ambiente condiviso significherebbe rischiare il dato di staging per
dimostrare di saperlo salvare. Il database di sviluppo ha lo **stesso schema**
— stesse 17 migrazioni, stesso `prisma migrate status` — quindi prova la
procedura senza rischiare niente.

### La procedura

```bash
# 1. backup
docker exec easygame-dev-db pg_dump -U easygame -d easygame_dev -Fc -f /tmp/rc.dump
docker cp easygame-dev-db:/tmp/rc.dump ./backup/rc.dump

# 2. ripristino
docker cp ./backup/rc.dump easygame-dev-db:/tmp/rc.dump
docker exec easygame-dev-db pg_restore -U easygame -d easygame_dev \
  --clean --if-exists --no-owner --no-privileges /tmp/rc.dump

# 3. verifica
npx prisma migrate status
```

Su Neon il formato non cambia: cambia solo il modo di raggiungere l'endpoint
(`pg_dump "$DIRECT_URL"`, non `docker exec`). `DIRECT_URL` e la variabile
giusta perche il ripristino non deve passare dal pooler.

### L'esercitazione, con i numeri

| Passo | Esito |
|-------|-------|
| Stato di partenza | 224 atleti, 6 rate, 6 incassi, 5 moduli, 4 compilazioni, 17 risorse di club |
| Backup | **492 ms**, 192 kB in formato `custom` |
| Alterazione deliberata | un atleta aggiunto, **undici** cognomi riscritti in `ALTERATO`, **due** incassi cancellati |
| Stato alterato | 225 atleti, 4 incassi |
| Ripristino | **1.392 ms** |
| Verifica | 224 atleti, 6 rate, 6 incassi, 5 moduli, 4 compilazioni, 17 risorse. **Zero** righe alterate, **zero** righe aggiunte |
| Dopo il ripristino | `prisma migrate status` verde; login e lettura atleti rispondono 200 |

### Cosa verificare sempre dopo un ripristino

1. `npx prisma migrate status` — deve dire «up to date». Un dump vecchio di
   una migrazione lascia lo schema indietro, e il difetto si manifesta alla
   prima query su una colonna nuova;
2. il conteggio delle righe delle tabelle che contano — atleti, rate,
   incassi, allegati;
3. **una richiesta vera**: un login e la lettura di un elenco. Un database
   ripristinato che l'applicazione non riesce a interrogare non e ripristinato.

### Recovery instructions per la produzione, quando esistera

- Neon conserva la storia recente e permette il *point-in-time restore* dalla
  console: e il primo strumento da usare, ed e piu preciso di un dump
  giornaliero.
- Il dump serve comunque, e per una ragione diversa: e l'unica copia che
  sopravvive alla perdita dell'**account**, non solo del database. Va tenuto
  fuori da Neon e fuori da Vercel.
- La cadenza la decide chi possiede il prodotto. Il criterio: quanti dati si
  accetta di perdere. Per una societa sportiva un giorno e ragionevole; a
  settembre, con le iscrizioni aperte, non lo e.

---

## Integrazione continua — stato reale (Blocco E, 2026-08-26)

**La CI gira, e gira verde.** La matrice RC precedente supponeva il contrario e
si preparava a distinguere «gate locali verdi» da «CI remota bloccata»: la
supposizione era sbagliata.

| Voce | Valore verificato |
|------|-------------------|
| Repository | `frattomella/easygame`, **pubblico** |
| Workflow | `.github/workflows/ci.yml`, presente sul branch `integration/web-v1` |
| Run totali | 41 |
| Ultima run | numero 41, commit `46b5e29`, evento `push`, branch `integration/web-v1` |
| Esito | `success` su tutti e tre i job: Web App, Mobile App, Guardrail di sicurezza |

Il workflow **non** e sul branch predefinito (`main` non ha `.github/`), e non
serve che lo sia: GitHub esegue il workflow presente sul ref che riceve il
push. Lo sara al primo merge su `main`.

### Variabili d'ambiente su Vercel — cosa manca davvero

Verificato con `vercel env ls` sul progetto `easygame-staging`:

| Variabile | Production | Preview | Development |
|-----------|------------|---------|-------------|
| `DATABASE_URL` | si | **no** | si |
| `DIRECT_URL` | si | **no** | si |
| `AUTH_BASE_URL` | si | **no** | si |
| `NEXT_PUBLIC_APP_URL` | si | **no** | si |
| `EASYGAME_PLATFORM_ADMIN_EMAILS` | si | **no** | si |
| `AUTH_RATE_LIMIT_SECRET` | si | **no** | **no** |
| `EASYGAME_MAINTENANCE_TOKEN` | **no** | **no** | **no** |

Ecco perche ogni deployment Preview e rosso: senza `DATABASE_URL` il build
importa `src/lib/server/prisma.ts` e si ferma. La correzione e una riga per
variabile — `vercel env add <nome> preview` — ed e una **modifica di
configurazione**, che richiede l'autorizzazione di chi possiede il progetto.

Finche `EASYGAME_MAINTENANCE_TOKEN` non esiste, `POST /api/v1/maintenance`
risponde 403.

**Aggiornamento del 2026-08-28**: la pulizia periodica non passa piu da quella
variabile. La aziona Vercel Cron su `GET /api/v1/maintenance`, che si autentica
con `CRON_SECRET` — obbligatoria in **ogni** ambiente per questa sola rotta.
Vedi «Le quattro funzioni periodiche» piu sotto.

---

## Stato di staging verificato — 2026-08-26 (Blocco E)

Due deploy, perche fra il primo e il secondo e stata trovata e chiusa una
vulnerabilita critica.

| Voce | Valore |
|------|--------|
| Progetto | `easygame-staging`, regione `fra1` |
| Deployment finale | `easygame-staging-6g5kg4qfp`, stato **READY** |
| Alias verificato | `https://easygame-staging-pi.vercel.app` |
| Commit | `77dc5da` di `integration/web-v1` |
| Migrazioni | 17, **nessuna nuova**: il Blocco E non tocca lo schema. Il build lo conferma con «No pending migrations to apply» |
| Next.js | **14.2.35** (era 14.2.23) |
| Vulnerabilita critiche nelle dipendenze | **zero** (erano una) |

### Smoke test dopo il deploy

Verificato nel **contenuto**, non solo nello stato: un 200 che restituisce una
pagina di errore non e un 200 di EasyGame.

| Prova | Esito |
|-------|-------|
| `/`, `/login`, `/register`, `/account` | 200, e l'HTML contiene EasyGame |
| `/api/v1/registry` | 200, 53 kB, contiene `registry.list` |
| `GET /api/v1/athletes` senza sessione | **401** |
| `GET /api/v1/admin/overview` senza sessione | **403** |
| `POST /api/v1/maintenance` senza token | **403** |
| Slug pubblico inesistente | **404**, senza dire se esiste |
| `POST /api/v1/auth/login` con corpo malformato | **400** `VALIDATION_ERROR` con i due campi |
| `/api/v1/comuni` senza sessione | **401** — l'archivio comuni e per chi ha un club |

### La verifica che conta piu delle altre

L'aggiornamento di Next serviva a chiudere
[GHSA-f82v-jwr5-mffw](https://github.com/advisories/GHSA-f82v-jwr5-mffw),
l'aggiramento dell'autorizzazione nel middleware. Non basta aggiornare: va
provato.

`GET /dashboard` senza sessione, con e senza l'intestazione interna che
l'exploit usa (`x-middleware-subrequest`, in tre varianti):

    senza intestazione            -> 307 verso /login?next=%2Fdashboard
    x-middleware-subrequest: ...  -> 307 verso /login?next=%2Fdashboard

Il middleware non si aggira. Su una versione vulnerabile la pagina avrebbe
risposto.

---

## Il giro notturno del lavoro sportivo (2026-08-28)

`vercel.json` dichiara un cron:

```json
{ "path": "/api/v1/sport-work/scheduler", "schedule": "30 3 * * *" }
```

Porta a scaduti i contratti finiti, ricalcola il maturato, riallinea l'agenda
degli adempimenti e notifica cio che scade entro sette giorni (compensi) o
quattordici (adempimenti).

**Si autentica con `CRON_SECRET`**, la stessa variabile gia usata
dall'automazione degli allenamenti. In produzione, **senza quella variabile la
porta non si apre**: risponde 503. Un job che riscrive stati e manda notifiche,
esposto senza autenticazione, e un modo per far arrivare messaggi ai club di
qualcun altro.

| Variabile | Dove serve | Se manca |
|-----------|-----------|----------|
| `CRON_SECRET` | Vercel, ambiente in cui il cron gira | In produzione la rotta risponde 503; in sviluppo passa, cosi la si puo provare |

**Stato al 2026-08-28**: impostata su `easygame-staging`, ambiente Production.
Il giro e stato provato — 401 senza credenziali, 200 con quelle giuste, due
esecuzioni identiche. Non e impostata da nessun'altra parte: quando esistera un
progetto di produzione andra impostata anche li, altrimenti il cron non parte.

Il giro e **idempotente**, e la difesa contro il doppione non e uno stato sul
lavoro ma una chiave deterministica dentro la notifica (`data.sportWorkKey`):
regge anche se il job viene rieseguito a mano dalla schermata mentre il cron
sta girando. `POST` sulla stessa rotta esegue il giro sul **solo club attivo**,
e passa dai permessi come ogni altra rotta del dominio.


---

## Le quattro funzioni periodiche (2026-08-28, W1-C)

Fino a oggi `vercel.json` dichiarava **un solo** cron. Tre funzioni periodiche
esistevano nel codice e non giravano: nessuno le invocava, quindi gli
allenamenti si generavano a mano, le righe scadute crescevano e i promemoria
sui certificati medici partivano solo se qualcuno apriva la schermata giusta.

```json
"crons": [
  { "path": "/api/v1/sport-work/scheduler",       "schedule": "30 3 * * *" },
  { "path": "/api/v1/training-automation",        "schedule": "0 4 * * *"  },
  { "path": "/api/v1/maintenance",                "schedule": "30 4 * * *" },
  { "path": "/api/medical-certificate-reminders", "schedule": "0 7 * * *"  }
]
```

Gli orari sono **distanziati di mezz'ora** di proposito: quattro giri nella
stessa finestra si contenderebbero le stesse connessioni al database di Neon,
e il primo che le esaurisce fa fallire gli altri tre. Il promemoria sui
certificati e alle 07:00 e non alle 04:00 perche e l'unico che parla a delle
persone: a quell'ora la notifica si legge.

### Autenticazione

| Variabile | Dove serve | Se manca |
|-----------|-----------|----------|
| `CRON_SECRET` | Vercel, ambiente in cui il cron gira | Lavoro sportivo, allenamenti e promemoria: **503 in produzione**, in sviluppo passano cosi il giro si puo provare. **Manutenzione: 503 sempre**, in qualunque ambiente |

Tutte e quattro le porte sono `GET` con
`Authorization: Bearer <CRON_SECRET>`, perche e l'unica cosa che Vercel Cron sa
invocare. Il segreto sbagliato risponde **401** con un messaggio che contiene
`Accesso negato`.

**Perche la manutenzione e piu severa.** E l'unica che **cancella righe**. Il
motivo per cui fino a ieri non aveva un `GET` era buono — un `GET` lo esegue un
prefetch del browser, un antivirus o un crawler — e la risposta non e una
promessa ma il controllo: senza `CRON_SECRET` non esegue niente, in nessun
ambiente, e il Bearer si confronta a **tempo costante**. Nessuno dei tre
scenari temuti porta il segreto.

Il `POST` con `x-maintenance-token` resta e non cambia: ADR-0007 vieta di legare
il dominio a un servizio dell'hosting, quindi deve restare azionabile da
un'azione GitHub o dal cron di una macchina.

### Cosa e garantito per tutti e quattro

- **Idempotenza.** Rieseguire un giro non produce niente di nuovo. Per i
  promemoria certificati la difesa e una chiave deterministica dentro la
  notifica (`medical_certificate_reminder:<atleta>:<certificato|missing>`) con
  una finestra di sette giorni che vale **anche se il promemoria e stato
  letto**: il filtro «solo non lette» della rotta a mano, applicato a un cron,
  rimanderebbe ogni notte lo stesso avviso a chi lo ha gia aperto.
- **Isolamento fra club.** Ogni lettura filtra per `organization_id`, e i
  destinatari di un promemoria devono essere iscritti al club dell'atleta: la
  stessa email puo esistere in due societa.
- **Un club che fallisce non ferma gli altri.** I giri iterano i club con un
  `try/catch` per club e restituiscono `{ processedClubs, failed, results }`:
  il log dice **quale** club e rimasto indietro, non solo che qualcosa non ha
  funzionato.
- **Audit.** Il giro dei promemoria lascia una riga
  `medical_certificate_reminder.run` per club, con creati, saltati e atleti
  coinvolti. Serve a rispondere a «il promemoria e partito?» quando una
  famiglia dice di non averlo ricevuto.

### Da verificare prima di considerarlo fatto

- **Il limite di cron del piano Vercel.** Il repository non lo documenta da
  nessuna parte. Un piano Hobby ne consente pochi e con granularita
  giornaliera: se il progetto non e su un piano che regge quattro voci, il
  deploy le rifiuta. Va confermato sul progetto `easygame-staging` prima del
  primo deploy.
- **`CRON_SECRET` sugli ambienti.** Risulta impostata su `easygame-staging`,
  ambiente Production, dal giro del lavoro sportivo. Le tre voci nuove usano la
  stessa variabile e quindi non ne servono altre. Quando esistera un progetto
  di produzione andra impostata anche li.

---

## Le due variabili della decima tornata (2026-08-31)

| Variabile | Default | Cosa cambia |
|---|---|---|
| `MICROSOFT_TENANT_ID` | vuoto → `common` | Con `common` (o `organizations`/`consumers`) l'indirizzo dichiarato da Microsoft **non e considerato verificato**, e un accesso Microsoft non puo piu collegarsi a un account EasyGame esistente ne crearne uno nuovo. Nominare qui il tenant del club lo riabilita |
| `AUTH_RATE_LIMIT_TRUSTED_PROXIES` | `1` | Quanti proxy fidati stanno davanti all'app. Determina quale voce di `X-Forwarded-For` conta come indirizzo del chiamante. Su Vercel e 1; con una CDN davanti a Vercel va portato a 2 |

Nessuna delle due va impostata su Vercel perche il comportamento predefinito e
gia corretto per quel deployment: `MICROSOFT_TENANT_ID` serve solo a chi vuole
**abilitare** l'accesso Microsoft, e `AUTH_RATE_LIMIT_TRUSTED_PROXIES` solo a
chi cambia la topologia davanti all'applicazione.

> **Attenzione al verso dell'errore su `AUTH_RATE_LIMIT_TRUSTED_PROXIES`.**
> Dichiararne **meno** di quanti ce ne sono fa contare l'indirizzo di un proxy
> al posto di quello del chiamante: tutti finiscono nello stesso secchiello e i
> limiti diventano troppo stretti — fastidioso, ma visibile. Dichiararne **piu**
> di quanti ce ne sono fa risalire dentro la parte della catena che scrive il
> client, e li i limiti tornano aggirabili. Nel dubbio, il numero piu basso.
