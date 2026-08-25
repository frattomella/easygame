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
| `EmailProviderConfig` | `email_provider_configs` | Configurazione SMTP unica, password cifrata (`password_ciphertext` + `iv` + `tag`). CHECK `provider = 'smtp'` |
| `ImapProviderConfig` | `imap_provider_configs` | Configurazione IMAP unica, password cifrata con contesto crittografico **separato** da SMTP. Nessun mittente: la posta si legge, non si invia |

### Tenant

| Modello | Tabella | Note |
|---------|---------|------|
| `Club` | `clubs` | Il tenant. `slug` unique, `creator_id -> users.id`. Dati anagrafici, fiscali e bancari in colonne dedicate. **~35 colonne `Json?`** di mirroring (vedi sotto). |
| `Dashboard` | `dashboards` | Dashboard configurabili per club |
| `OrganizationUser` | `organization_users` | Membership. Unique `(organization_id, user_id, role)`: **piu ruoli per utente nello stesso club sono ammessi**. `is_primary` marca il default. |

#### `clubs.settings` — chiavi note

`settings` e una sola colonna JSON e raccoglie tutto cio che non ha una
colonna dedicata. Le chiavi con un significato per il codice:

| Chiave | Scritta da | Significato |
|--------|------------|-------------|
| `seasons`, `activeSeasonId` | `POST/PATCH /api/v1/seasons` | Perimetro dei dati visibili (WP-32, WP-35) |
| `paymentSettings`, `subscription`, `extraServices` | scheda Club → Pagamenti | Listini e abbonamento |
| `types`, `sports`, `foundingYear` | scheda Club → Generale | Descrittivi, in autosave |
| `contact1*`, `contact2*`, `companyEmail`, `companyPec` | scheda Club → Contatti | Recapiti, in autosave |
| `website`, `facebook`, `instagram`, `twitter`, `youtube` | scheda Club → Social | Link pubblici, in autosave |
| `federations` | scheda Club → Federazione | Affiliazioni |
| `onboarding` | `/onboarding` (Blocco 4) | Stato della configurazione iniziale: `status`, `completedSteps`, date. Vedi `src/lib/onboarding.ts` |
| `staffDepartments` | `src/lib/api/staff-departments.ts` (Blocco 7) | Reparti dello staff. **Fonte unica**: il modello sta in `src/lib/staff-directory.ts`, e ogni schermata che salva un membro con un reparto lo persiste qui |

Poiche la colonna e unica, ogni scrittura parziale e un **read-modify-write**:
`patchClubSettings` in `src/lib/club-profile.ts` rilegge la sola colonna
`settings` prima di riscriverla, per non azzerare le chiavi che non tocca.

#### Stagioni sportive

Una stagione non ha una tabella: e un elemento di `clubs.settings.seasons`.
Il modello sta in `src/lib/club-seasons.ts`, la scrittura in
`src/lib/server/seasons.ts` ([ADR-0031](18-decision-log.md)).

```
{ id, label, startDate, endDate, status, createdAt, archivedAt }
```

| Stato | Significato |
|-------|-------------|
| `upcoming` | Futura: preparata, non ancora il perimetro dei dati |
| `active` | Attiva: e cio che l'applicazione mostra |
| `archived` | Archiviata: consultabile riattivandola, non riceve riporti |

**Invariante unica.** La stagione puntata da `activeSeasonId` e l'unica
`active`. `applySeasonStatuses` la riapplica a ogni lettura e a ogni
scrittura: un elenco incoerente arrivato dal passato viene corretto, non
propagato. Le altre stagioni diventano `archived` se cominciano prima di
quella attiva e `upcoming` se cominciano dopo, a meno che non portino gia uno
stato esplicito diverso da `active`.

`draft` era il nome storico di «futura» e continua a essere letto come
`upcoming`: i club creati prima non vanno riscritti.

**Appartenenza dei record.** Le risorse in `SEASON_SCOPED_DATA_TYPES` portano
`payload.seasonId`. Quelle senza appartengono alla **stagione baseline**, cioe
la piu vecchia del club (WP-32). La stagione di un record e **immutabile in
aggiornamento**: una PATCH con un `seasonId` diverso viene ignorata, perche
spostare un elemento riscriverebbe la storia di un'annata chiusa.

**Record riportati.** Un elemento nato da un riporto porta due chiavi in piu:

| Chiave | Significato |
|--------|-------------|
| `rolloverSourceId` | Id dell'elemento di origine. E cio che rende il riporto idempotente |
| `rolloverSourceSeasonId` | Stagione da cui e stato riportato |

Non sono chiavi esterne: l'origine puo essere cancellata senza rompere nulla.

### Dominio sportivo

| Modello | Tabella | Note |
|---------|---------|------|
| `Athlete` | `athletes` | `organization_id`, `user_id?` (collegamento all'account), `category_id`/`category_name` denormalizzati, `data` JSON per il resto |
| `AthleteCategoryMembership` | `athlete_category_memberships` | Multi-categoria per atleta. Unique `(organization_id, athlete_id, category_id)`, flag `is_primary`, `site_id?` (sede in cui l'atleta svolge **quella** categoria, [ADR-0038](18-decision-log.md)) |
| `MedicalCertificate` | `medical_certificates` | `issue_date`, `expiry_date`, `status` |
| `TrainingAttendance` | `training_attendance` | Presenze. `training_id` e `athlete_id` sono **stringhe non vincolate** (no FK), perche gli allenamenti vivono in `club_resource_items` |

### Amministrazione

| Modello | Tabella | Note |
|---------|---------|------|
| `PaymentMethod` | `payment_methods` | Metodi di incasso configurati dal club |
| `AthletePayment` | `payments` | **La rata: quanto e dovuto.** `amount`, `due_date`, `description`. `status`, `paid_at` e `method` sono una **cache derivata** dal registro incassi, riscritta dal server: non sono un dato che l'interfaccia imposta. Vedi [ADR-0036](18-decision-log.md#adr-0036--una-rata-e-un-debito-un-incasso-e-un-movimento-due-tabelle-non-una) |
| `PaymentTransaction` | `payment_transactions` | **L'incasso: un movimento di denaro** che salda una rata in tutto o in parte. `amount`, `paid_at`, `payment_method`, `source`, `external_reference`, `created_by`. Uno storno marca l'originale (`reversed_at`) e crea il movimento opposto (`reverses_transaction_id`): niente si cancella |
| `Invoice` | `invoices` | `invoice_number` unique, `payment_id` unique opzionale, campi fatturazione elettronica |
| `Receipt` | `receipts` | `receipt_number` unique. `transaction_id` unique collega la ricevuta all'**incasso**, che e il livello corretto; `payment_id` resta per le ricevute anteriori al registro e **non e piu unique** — una rata pagata in tre volte ha tre ricevute |
| `TrainerPayment` | `trainer_payments` | Compensi allenatori per mese |
| `FundingProgram` | `funding_programs` | **Le regole di un bando, in colonne**: plafond per atleta, importo per periodo, frequenza (mensile o N giorni), requisito minimo, unita (`hours`/`sessions`), comportamento sotto soglia (`none`/`prorata`/`full`), tetti, validita. Nessuna regola di un singolo bando vive nel codice. Vedi [ADR-0037](18-decision-log.md#adr-0037--un-contributo-non-e-un-pagamento-due-contabilita-separate-e-le-regole-del-bando-sono-dati) |
| `FundingEnrollment` | `funding_enrollments` | Atleta ammesso a un programma: `assigned_amount` (il plafond **assegnato**, che non e denaro) e `voucher_code`. Unique `(program_id, athlete_id)` |
| `FundingAccrual` | `funding_accruals` | Il **maturato di un periodo**: misura della frequenza, requisito, maturato e non maturato, stato (`not_accrued`/`accrued`/`reported`/`settled`). Il periodo e denormalizzato qui e **non ha una tabella**: si ricava dalla configurazione. Unique `(enrollment_id, period_index)`, che rende il ricalcolo idempotente |
| `FundingSettlement` | `funding_settlements` | Il versamento dell'ente: l'unico momento in cui un contributo diventa denaro |
| `FundingSettlementLine` | `funding_settlement_lines` | La riconciliazione: quanto di un versamento copre quale periodo di quale atleta. **Il liquidato si legge da qui**, non dallo stato del periodo |

### Trasversali

| Modello | Tabella | Note |
|---------|---------|------|
| `Notification` | `notifications` | Per club e/o utente |
| `ClubResourceItem` | `club_resource_items` | **Contenitore generico**: `resource_type` + `payload` JSON + `name`/`status`/`date` estratti per filtrare |
| `Attachment` | `attachments` | **Metadati** di un allegato: proprietario (`owner_type` + `owner_id`), `category`, nome originale, MIME, dimensione, sha256, `storage_driver`, autore. Mai i byte. Vedi [ADR-0034](18-decision-log.md#adr-0034--gli-allegati-escono-dai-record-e-passano-da-un-servizio-con-driver) |
| `AttachmentBlob` | `attachment_blobs` | I byte di un allegato, quando il driver e `database`. Tabella separata perche non si legge quasi mai: elencare gli allegati non deve costare quanto scaricarli |
| `Asset` | `assets` | File, **via legacy**. Unique `(bucket, path)`. `data_base64` = i binari nel database. Non e stata sostituita da `attachments`: la usano ancora logo di club e immagini dei form. Vedi [16](16-technical-debt.md) |
| `FormTemplate` | `form_templates` | Un modulo della Modulistica V2: la **bozza** (`draft`), lo stato, lo slug pubblico unico, `public_enabled`. Vedi [ADR-0039](18-decision-log.md#adr-0039--i-moduli-escono-da-clubsdocument_templates-e-diventano-tre-tabelle) |
| `FormTemplateVersion` | `form_template_versions` | Una versione **pubblicata**, immutabile: `schema_json` con titolo, descrizione, campi e impostazioni. Unique `(template_id, version)`. Vedi [ADR-0040](18-decision-log.md#adr-0040--una-compilazione-cita-una-versione-immutabile-e-non-scrive-in-anagrafica) |
| `FormSubmission` | `form_submissions` | Una compilazione. Cita la versione con cui e stata compilata, porta `subjects` (quale atleta, quale genitore), `answers`, `files` (riferimenti, mai byte) e lo stato di revisione. **Non e un dato ufficiale**: scrive in anagrafica solo l'approvazione |
| `AuditLog` | `audit_logs` | Traccia delle operazioni sensibili: `action`, `outcome`, actor, `organization_id`, risorsa, IP, user agent, `metadata` filtrati. Nessuna FK, per sopravvivere alla cancellazione dell'attore. Quattro indici per interrogazione e purge. Vedi [ADR-0019](18-decision-log.md) |

## Dati di riferimento non transazionali

Non tutto cio che EasyGame legge sta nel database. `src/data/` contiene le
tabelle di riferimento pubbliche, versionate nel repository perche non
cambiano per club e non devono viaggiare su una query.

| File | Contenuto | Origine |
|------|-----------|---------|
| `comuni-istat.json` | 7.896 comuni italiani: denominazione, sigla provincia, codice catastale (Belfiore), nome nell'altra lingua ufficiale dove esiste | Generato da `scripts/build-comuni-dataset.mjs` dall'elenco ISTAT. Vedi [ADR-0032](18-decision-log.md) |

Le 107 province con regione restano dov'erano, in `src/lib/italian-registry.ts`:
sono un insieme chiuso e piccolo, e servono anche al client.

**Il file non si modifica a mano.** Si rigenera:
`node scripts/build-comuni-dataset.mjs` (con `--check` verifica soltanto).
Lo script fallisce senza scrivere se la fonte cambia forma.

## `club_resource_items`: i 29 tipi

`access_tokens`, `appointments`, `bank_accounts`, `categories`,
`category_groups`, `clothing_inventory`, `clothing_kits`, `clothing_products`,
`club_sites`, `discounts`,
`document_templates`, `expected_expenses`, `expected_income`,
`jersey_assignments`, `jersey_groups`, `kit_assignments`, `matches`, `members`,
`opening_hours`, `payment_plans`, `procure`, `secretariat_notes`,
`sponsor_payments`, `sponsors`, `staff_members`, `trainers`, `trainings`,
`transactions`, `transfers`, `weekly_schedule`.

Definiti in `CLUB_RESOURCE_TYPES` (`src/lib/server/resources.ts`).

### Campi del payload che portano logica (Blocco 5, 2026-08-23)

I payload di `club_resource_items` non hanno schema, ma due campi sono letti
da moduli applicativi e vanno trattati come parte del contratto:

| Risorsa | Campo | Significato |
|---|---|---|
| `categories` | `compatibleCategoryIds: string[]` | categorie in cui gli atleti di questa categoria possono essere utilizzati. Esplicito, orientato, **non transitivo** ([ADR-0030](18-decision-log.md)). Letto da `src/lib/category-compatibility.ts`. |
| `jersey_groups` | `includeCompatibleCategories: boolean` | se il gruppo numerazione accoglie anche gli atleti eleggibili per compatibilita. Default `false`. |
| `club_sites` | `id`, `name`, `city`, `active` | sedi operative del club. Con meno di due sedi attive il club **non** e multi-sede e l'interfaccia non mostra il concetto ([ADR-0038](18-decision-log.md)). Letto da `src/lib/club-sites.ts`. |
| `category_groups` | `categoryId`, `siteId`, `structureId?` | gruppo operativo: la coppia (categoria, sede). Non duplica la categoria, la colloca. Una categoria senza gruppi ne riceve uno **implicito** in lettura. |

L'eleggibilita per compatibilita **non e persistita**: si calcola a ogni
lettura. Le appartenenze reali restano in `athlete_category_memberships`, che
resta l'unica sorgente di «questo atleta e in questa categoria».

I riferimenti dentro `compatibleCategoryIds` possono essere id o nomi:
`buildCategoryCompatibilityIndex` li risolve senza distinguere maiuscole,
perche i dati storici mescolano le due forme.

## La doppia scrittura club_resource_items ⇄ clubs.<json>

`CLUB_JSON_FIELDS` = tutti i tipi sopra **tranne `access_tokens`**, piu
`structures`, `members`, `dashboard_data`.

```
POST/PATCH/DELETE /api/v1/matches/:id
   → scrive club_resource_items (resource_type = 'matches')
   → syncClubAggregateField()  →  UPDATE clubs SET matches = <array ricostruito>

PATCH /api/v1/clubs/:id  con body { matches: [...] }
   → syncClubResourceItemsFromField()
   → BEGIN
       DELETE FROM club_resource_items WHERE resource_type='matches'
       INSERT ... (createMany, una sola istruzione)
       UPDATE clubs SET matches = <array nell'ordine inviato dal client>
     COMMIT
```

### Implicazioni operative

- Le due rappresentazioni **devono** restare allineate: non scrivere mai
  direttamente `clubs.<campo>` con Prisma aggirando `resources.ts`.
- Il percorso «PATCH club» riscrive tutte le righe di quel `resource_type`,
  ma dal 2026-08-22 (WP-10):
  - **e transazionale**: delete, insert e aggiornamento dell'aggregato stanno
    nella stessa transazione, quindi un errore a meta non lascia dati parziali;
  - **preserva l'identita**: un elemento gia presente mantiene la sua riga
    (stesso `id`, stesso `created_at`), anche quando il suo id logico non e un
    UUID;
  - **e una sola scrittura di massa** invece di una `INSERT` per elemento:
    salvare una categoria non costa piu N round trip.
- L'aggregato JSON riflette **l'ordine inviato dal client**, non l'ordine di
  `created_at`: un inserimento di massa condivide lo stesso istante e
  l'ordinamento sarebbe ambiguo.
- Resta senza controllo di concorrenza: due PATCH sullo stesso club in
  parallelo possono ancora perdere scritture.

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

13 migrazioni in `prisma/migrations/`:

| Migrazione | Contenuto |
|------------|-----------|
| `20260330155653_init` | Schema iniziale |
| `20260330175955_auth_verification_oauth` | OTP + account esterni |
| `20260409113000_athlete_category_memberships` | Multi-categoria atleta |
| `20260521103000_allow_multiple_roles_per_organization_user` | Unique su `(org, user, role)` |
| `20260821120000_auth_rate_limits` | `auth_rate_limit_buckets` |
| `20260821160000_email_provider_config` | `email_provider_configs` |
| `20260822180000_audit_log` | `audit_logs` |
| `20260823090000_imap_provider_config` | `imap_provider_configs` |
| `20260825120000_attachments` | `attachments` + `attachment_blobs` (WP-15). **Additiva**: non legge e non riscrive nessun dato esistente |
| `20260826090000_payment_transactions` | `payment_transactions` + `receipts.transaction_id` (Workstream A, ADR-0036). **Additiva**: nessun pagamento esistente viene letto, convertito o riscritto. L'unica modifica a una tabella esistente e la **rimozione** del vincolo unique su `receipts.payment_id`, che non invalida nessuna riga |
| `20260826140000_funding_programs` | Le cinque tabelle dei contributi (Workstream A, ADR-0037). **Additiva**: non tocca nessuna tabella esistente, e in particolare non tocca `payments` ne `payment_transactions` — le due contabilita restano separate anche nello schema |
| `20260826150000_multisite` | `clubs.club_sites`, `clubs.category_groups`, `athlete_category_memberships.site_id` ([ADR-0038](18-decision-log.md)). **Additiva**: tutte le colonne nascono `NULL` e `NULL` significa «sede non dichiarata», cioe visibile ovunque |
| `20260826090000_forms_v2` | `form_templates` + `form_template_versions` + `form_submissions` (Modulistica V2). **Additiva**: non legge e non riscrive `clubs.document_templates`. Il travaso dei moduli legacy e uno script a parte, `scripts/migrate-forms-v2.mjs` |

Stato verificato su Neon staging il 2026-08-22:
`npx prisma migrate status` → **Database schema is up to date**. La settima
(`audit_logs`) e l'ottava (`imap_provider_configs`) vengono applicate al
deploy successivo, da `prisma migrate deploy` nel comando `vercel-build`.

Le migrazioni `20260823090000_imap_provider_config`,
`20260825120000_attachments`, `20260826090000_payment_transactions`,
`20260826140000_funding_programs` e `20260826160000_forms_v2` sono state
**scritte a mano**,
nello stesso stile di `20260821160000_email_provider_config`: in locale
`prisma migrate dev` e bloccato dalla guardia di `scripts/db-guard.mjs`
(sezione 8 di `CLAUDE.md`) e non e stata chiesta autorizzazione a scrivere sul
database.

Verifica eseguita senza toccare nessun database:

```bash
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
```

Il `CREATE TABLE "imap_provider_configs"` generato da Prisma coincide colonna
per colonna con quello scritto a mano. Le due `CHECK` aggiuntive (intervallo
della porta, valori ammessi di `security_mode`) non sono nel modello Prisma —
esattamente come le tre di `email_provider_configs` — e rientrano nello stesso
drift cosmetico gia documentato: sono vincoli che il database applica e
l'applicazione rispetta.

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
