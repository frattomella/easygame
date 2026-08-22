# 06 — Modello dati (Prisma / Neon)

Fonte di verita: [`prisma/schema.prisma`](../../prisma/schema.prisma).

- Provider: `postgresql`
- Client: Prisma 6 con adapter `@prisma/adapter-pg` (driver `pg`)
- `url = env("DATABASE_URL")` — endpoint **pooler** Neon, usato dal runtime
- `directUrl = env("DIRECT_URL")` — endpoint **diretto**, usato da Prisma CLI e
  migrazioni

Convenzioni: chiavi primarie `uuid` (`@db.Uuid`), colonne `snake_case`,
`@@map` verso nomi tabella plurali, timestamp `created_at` / `updated_at`
ovunque.

## Modelli

### Identita e sessione

| Modello | Tabella | Note |
|---------|---------|------|
| `User` | `users` | `email` unique, `password_hash` bcrypt, `role` stringa libera (default `"user"`), `is_club_creator`, `email_verified_at`, `phone_verified_at`, `phone_verification_required`, `user_metadata` JSON |
| `Session` | `sessions` | `token` unique **opaco**, `expires_at`. Nessun JWT. |
| `ExternalAccount` | `external_accounts` | Account OAuth collegati. Unique `(provider, provider_account_id)` |
| `AuthVerificationChallenge` | `auth_verification_challenges` | OTP email/telefono: `code_hash`, `expires_at`, `attempts`, `consumed_at` |
| `AuthRateLimitBucket` | `auth_rate_limit_buckets` | Contatori rate limit, chiave = hash SHA-256 di scope+identita |
| `EmailProviderConfig` | `email_provider_configs` | Configurazione SMTP unica, password cifrata (`password_ciphertext` + `iv` + `tag`) |

### Tenant

| Modello | Tabella | Note |
|---------|---------|------|
| `Club` | `clubs` | Il tenant. `slug` unique, `creator_id -> users.id`. Dati anagrafici, fiscali e bancari in colonne dedicate. **~35 colonne `Json?`** di mirroring (vedi sotto). |
| `Dashboard` | `dashboards` | Dashboard configurabili per club |
| `OrganizationUser` | `organization_users` | Membership. Unique `(organization_id, user_id, role)`: **piu ruoli per utente nello stesso club sono ammessi**. `is_primary` marca il default. |

### Dominio sportivo

| Modello | Tabella | Note |
|---------|---------|------|
| `Athlete` | `athletes` | `organization_id`, `user_id?` (collegamento all'account), `category_id`/`category_name` denormalizzati, `data` JSON per il resto |
| `AthleteCategoryMembership` | `athlete_category_memberships` | Multi-categoria per atleta. Unique `(organization_id, athlete_id, category_id)`, flag `is_primary` |
| `MedicalCertificate` | `medical_certificates` | `issue_date`, `expiry_date`, `status` |
| `TrainingAttendance` | `training_attendance` | Presenze. `training_id` e `athlete_id` sono **stringhe non vincolate** (no FK), perche gli allenamenti vivono in `club_resource_items` |

### Amministrazione

| Modello | Tabella | Note |
|---------|---------|------|
| `PaymentMethod` | `payment_methods` | Metodi di incasso configurati dal club |
| `AthletePayment` | `payments` | Quota atleta. `status`, `due_date`, `paid_at` |
| `Invoice` | `invoices` | `invoice_number` unique, `payment_id` unique opzionale, campi fatturazione elettronica |
| `Receipt` | `receipts` | `receipt_number` unique, collegabile a payment e invoice |
| `TrainerPayment` | `trainer_payments` | Compensi allenatori per mese |

### Trasversali

| Modello | Tabella | Note |
|---------|---------|------|
| `Notification` | `notifications` | Per club e/o utente |
| `ClubResourceItem` | `club_resource_items` | **Contenitore generico**: `resource_type` + `payload` JSON + `name`/`status`/`date` estratti per filtrare |
| `Asset` | `assets` | File. Unique `(bucket, path)`. `data_base64` = **i binari possono essere salvati nel database**. Vedi [16](16-technical-debt.md). |
| `AuditLog` | `audit_logs` | Traccia delle operazioni sensibili: `action`, `outcome`, actor, `organization_id`, risorsa, IP, user agent, `metadata` filtrati. Nessuna FK, per sopravvivere alla cancellazione dell'attore. Quattro indici per interrogazione e purge. Vedi [ADR-0019](18-decision-log.md) |

## `club_resource_items`: i 27 tipi

`access_tokens`, `appointments`, `bank_accounts`, `categories`,
`clothing_inventory`, `clothing_kits`, `clothing_products`, `discounts`,
`document_templates`, `expected_expenses`, `expected_income`,
`jersey_assignments`, `jersey_groups`, `kit_assignments`, `matches`, `members`,
`opening_hours`, `payment_plans`, `procure`, `secretariat_notes`,
`sponsor_payments`, `sponsors`, `staff_members`, `trainers`, `trainings`,
`transactions`, `transfers`, `weekly_schedule`.

Definiti in `CLUB_RESOURCE_TYPES` (`src/lib/server/resources.ts`).

## La doppia scrittura club_resource_items ⇄ clubs.<json>

`CLUB_JSON_FIELDS` = tutti i tipi sopra **tranne `access_tokens`**, piu
`structures`, `members`, `dashboard_data`.

```
POST/PATCH/DELETE /api/v1/matches/:id
   → scrive club_resource_items (resource_type = 'matches')
   → syncClubAggregateField()  →  UPDATE clubs SET matches = <array ricostruito>

PATCH /api/v1/clubs/:id  con body { matches: [...] }
   → syncClubResourceItemsFromField()
   → DELETE FROM club_resource_items WHERE resource_type='matches'
   → INSERT una riga per elemento
   → syncClubAggregateField()
```

### Implicazioni operative

- Le due rappresentazioni **devono** restare allineate: non scrivere mai
  direttamente `clubs.<campo>` con Prisma aggirando `resources.ts`.
- Il percorso «PATCH club» e **distruttivo**: cancella e ricrea le righe. Gli
  elementi il cui `id` non e un UUID valido **ricevono un id nuovo**.
- Non c'e transazione attorno a delete+insert: un errore a meta lascia dati
  parziali.
- Non c'e controllo di concorrenza: due PATCH sullo stesso club in parallelo
  possono perdere scritture.

## Scoping multi-tenant

`ORGANIZATION_SCOPED_MODEL_RESOURCES` + tutte le `club_resource` sono filtrate
per `organization_id`:

- in lettura, `listResource` **impone** `where.organization_id` allo scope
  risolto lato server;
- in scrittura, `ensureOrganizationAccess` verifica che l'`organization_id`
  richiesto sia in `allowedOrganizationIds`;
- per `clubs`/`organizations`, `where.id` viene ristretto a
  `{ in: allowedOrganizationIds }`.

Nessuna Row Level Security a livello Postgres: l'isolamento e **solo
applicativo**.

## Migrazioni

7 migrazioni in `prisma/migrations/`:

| Migrazione | Contenuto |
|------------|-----------|
| `20260330155653_init` | Schema iniziale |
| `20260330175955_auth_verification_oauth` | OTP + account esterni |
| `20260409113000_athlete_category_memberships` | Multi-categoria atleta |
| `20260521103000_allow_multiple_roles_per_organization_user` | Unique su `(org, user, role)` |
| `20260821120000_auth_rate_limits` | `auth_rate_limit_buckets` |
| `20260821160000_email_provider_config` | `email_provider_configs` |
| `20260822180000_audit_log` | `audit_logs` |

Stato verificato su Neon staging il 2026-08-22:
`npx prisma migrate status` → **Database schema is up to date**. La settima
(`audit_logs`) viene applicata al primo deploy.

### Drift noto e benigno

`prisma migrate diff` segnala differenze su `athlete_category_memberships`:

- il DB ha default a livello colonna (`gen_random_uuid()`, `now()`), lo schema
  Prisma usa default applicativi (`@default(uuid())`, `@updatedAt`);
- due indici hanno nome troncato diversamente dal nome che Prisma genererebbe.

Sono differenze cosmetiche introdotte dalla migrazione SQL scritta a mano.
**Non generare una migrazione correttiva** senza una ragione funzionale: il
comportamento applicativo e identico.

Attenzione: `prisma migrate diff` include comunque queste istruzioni in ogni
nuova migrazione generata. Vanno **rimosse a mano** dal file, come e stato
fatto in `20260822180000_audit_log`, dove il motivo e scritto in testa al
file.

## Seed

`prisma/seed.js` (`npm run prisma:seed`) crea quattro account demo:
`demo@easygame.it` (owner), `trainer@easygame.it`, `athlete@easygame.it`,
`parent@easygame.it`.

La password **non e piu predefinita**: il seed legge `SEED_DEMO_PASSWORD`
(minimo 16 caratteri) e si rifiuta di partire se manca. L'hash e bcrypt cost 12.

```bash
SEED_DEMO_PASSWORD="$(openssl rand -base64 24)" npm run prisma:seed
```

**Da non eseguire mai contro un database con dati reali.**

> Fino al 2026-08-22 il seed usava `password123` e quella credenziale era
> pubblicata nel README di un repository pubblico, mentre gli account
> esistevano davvero sullo staging raggiungibile da internet. Le credenziali
> sono state ruotate e le sessioni revocate. Non reintrodurre credenziali
> nella documentazione: vedi [14 — Sicurezza](14-security.md).
