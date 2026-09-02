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
| `presidentSignature`, `presidentStamp` | `src/lib/server/club-signature.ts` (W1-E) | **Riferimento** `attachment:<id>` all'immagine di firma e timbro, mai un data URL: i byte stanno in `attachments` con `owner_type: "club"`. Stringa vuota = non caricata. Le scrive solo quel modulo, per chiavi, e le legge il generatore documentale con `readClubSignatureImage` |

Poiche la colonna e unica, una scrittura parziale deve dire **soltanto le
chiavi che cambia**. Dal RC Fix 3 il modo canonico e il campo `settings_patch`
sulla PATCH del club: il server lo fonde con il valore corrente, dentro una
transazione con `SELECT … FOR UPDATE` sulla riga
([ADR-0069](18-decision-log.md#adr-0069--una-modifica-parziale-di-clubssettings-dichiara-solo-le-proprie-chiavi), `applyClubSettingsPatch` in
`src/lib/server/resources.ts`). `settings` intero resta accettato e continua a
**sostituire** — chi lo manda sta dichiarando tutto, ed e cosi che si toglie
una chiave.

Il read-modify-write lato client resta solo in `patchClubSettings`
(`src/lib/club-profile.ts`), che serve onboarding e reparti staff e ha bisogno
dell'oggetto intero per poter **cancellare** una chiave. Vedi
[16 — Debito tecnico](16-technical-debt.md).

#### `athletes.birth_date` — cosa il server accetta

Non basta che `new Date(valore)` non fallisca: in JavaScript
`new Date("2026-02-31")` **non** e una data invalida, e il 3 marzo 2026. Prima
del RC Fix 3 la rotta salvava quel giorno diverso senza segnalare niente, e da
`birth_date` discendono eta, categoria per anno di nascita e codice fiscale.

La regola sta in `src/lib/birth-date.ts` (modulo puro) ed e la stessa per
l'anteprima dell'import e per la scrittura via API: la data si legge **come
testo** e le sue tre parti devono ricomporre lo stesso giorno; poi dev'essere
passata e non anteriore al 1900. La respinge
`assertAnagraficaIsValid` con un errore di dominio (400), con l'indulgenza
consueta del modulo: una scheda che porta **gia** quella data resta
correggibile.

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
| `ClubEvent` | `club_events` | **L'evento sportivo: una riga** ([ADR-0098](18-decision-log.md#adr-0098--levento-sportivo-e-una-riga-non-un-elemento-di-un-array)). `kind` — `training` oppure `match` — assorbe allenamenti e gare. `starts_at` e un **istante assoluto** con `timezone` accanto; `legacy_id` conserva l'identificativo della vecchia collezione JSON, unico per `(organization_id, kind, legacy_id)`. `version` per il controllo ottimistico, `capacity`, `rsvp_required`, `rsvp_deadline`, `payload` per cio che non ha ancora una colonna |
| `ClubEventParticipant` | `club_event_participants` | **Non e una tabella nuova**: e `training_attendance` portata dall'allenamento all'evento ([ADR-0099](18-decision-log.md#adr-0099--la-partecipazione-a-un-evento-e-una-riga-sola-convocazione-risposta-e-presenza-sono-tre-colonne)). Chiave unica `(organization_id, event_id, athlete_id)`, con `event_id` **chiave esterna vera** verso `club_events`. `legacy_training_id` resta per leggibilita, e non e una chiave |

**`club_event_participants` porta tre fatti diversi, e non si scrivono a vicenda.**

| Colonne | Cos'e | Chi le scrive |
|---------|-------|---------------|
| `convocation_status`, `convocated_at`, `convocated_by`, `is_extra_category` | La **convocazione**: il club chiama, o esclude | `src/lib/server/events.ts`, con `events.convoke` |
| `rsvp_status`, `rsvp_note`, `rsvp_at`, `rsvp_by_user_id` | L'**intenzione** dichiarata dalla famiglia | Solo `src/lib/server/rsvp.ts`, con il **legame** |
| `status`, `notes` | La **presenza**: un fatto verificato | `src/lib/server/events.ts`, con `events.attendance` |

La convocazione prima viveva dentro il payload della gara in **dieci grafie**
diverse, normalizzate a ogni lettura: la migrazione le normalizza una volta
sola. «Nessuna decisione» (`null`) non e «non convocato» (`excluded`): togliere
un nome da una lista non e la stessa cosa che dire a un ragazzo che non gioca.

`src/lib/funding/attendance-measure.ts` legge `status` per rendicontare i
contributi pubblici: se un «si» della famiglia scrivesse `status = "present"`,
un ente riceverebbe come frequenza dimostrata una promessa che nessuno ha
verificato. Per questo l'upsert dell'RSVP **non nomina mai `status`** nel ramo
di aggiornamento, e nel ramo di creazione usa il valore neutro `"pending"`, che
nessun consumatore conta come presenza. Nessuno stato `no_response` viene
scritto: il silenzio si **deriva** dall'assenza di risposta.

### Fascicolo documentale e appuntamenti (Wave 5)

| Modello | Tabella | Note |
|---------|---------|------|
| `DocumentRequest` | `document_requests` | La richiesta del club come **riga** ([ADR-0100](18-decision-log.md#adr-0100--il-fascicolo-documentale-e-una-riga-e-i-byte-non-generano-una-tabella-nuova)). `status` porta solo `open` e `cancelled`: `fulfilled` **non viene mai scritto**, perche lo stato del deposito si **deriva** dall'ultimo deposito (ADR-0058). `legacy_id` conserva l'identificativo che il documento aveva in `athletes.data.sharedDocuments` |
| `DocumentSubmission` | `document_submissions` | Il deposito e la sua decisione, **append-only**. `request_id` nullo = deposito **spontaneo**. `attachment_id` punta ad Attachment Core: **i byte non generano una tabella nuova** |
| `Appointment` | `appointments` | Otto stati, `starts_at`/`ends_at` come **istante assoluto** con `timezone` accanto, `version` per il controllo ottimistico, `idempotency_key` unica per club, `parent_appointment_id` per la riprogrammazione. **La doppia prenotazione la impedisce il database**: indice unico parziale su `(organization_id, assigned_to_user_id, starts_at)` per gli stati vivi ([ADR-0101](18-decision-log.md#adr-0101--lappuntamento-e-un-dominio-con-un-proprietario-e-la-doppia-prenotazione-la-impedisce-il-database)) |
| `AppointmentSlot` | `appointment_slots` | La disponibilita come **dato**: sede, operatore, giorno o data specifica, orario, durata, capienza, validita. Senza slot si ricade sugli orari di apertura, e la risposta dichiara da dove viene |

**`internal_notes` non esce verso la famiglia**, e non e nascosto
dall'interfaccia: la proiezione della famiglia **non ha quel campo**. E la
lezione di D-4 — una guardia che vive solo nel browser non e una guardia.

### Amministrazione

| Modello | Tabella | Note |
|---------|---------|------|
| `PaymentMethod` | `payment_methods` | Metodi di incasso configurati dal club |
| `AthletePayment` | `payments` | **La rata: quanto e dovuto.** `amount`, `due_date`, `description`. `status`, `paid_at` e `method` sono una **cache derivata** dal registro incassi, riscritta dal server: non sono un dato che l'interfaccia imposta. Vedi [ADR-0036](18-decision-log.md#adr-0036--una-rata-e-un-debito-un-incasso-e-un-movimento-due-tabelle-non-una) |
| `PaymentTransaction` | `payment_transactions` | **L'incasso: un movimento di denaro** che salda una rata in tutto o in parte. `amount`, `paid_at`, `payment_method`, `source`, `external_reference`, `created_by`. Uno storno marca l'originale (`reversed_at`) e crea il movimento opposto (`reverses_transaction_id`): niente si cancella |
| `Invoice` | `invoices` | `invoice_number` unique **per club** (`@@unique([organization_id, invoice_number])`, ADR-0044), `payment_id` unique opzionale, campi fatturazione elettronica |
| `Receipt` | `receipts` | `receipt_number` unique **per club** (ADR-0044): Alfa e Beta hanno entrambe la loro ricevuta 1 del 2026. `transaction_id` unique collega la ricevuta all'**incasso**, che e il livello corretto; `payment_id` resta per le ricevute anteriori al registro e **non e piu unique** — una rata pagata in tre volte ha tre ricevute |
| `PaymentWebhookEvent` | `payment_webhook_events` | Gli eventi gia ricevuti da un PSP. La firma dice che l'evento viene dal provider; questa tabella dice che non era gia arrivato — e Stripe riprova per tre giorni finche non riceve un 2xx |
| `DocumentNumberSequence` | `document_number_sequences` | La sequenza di numerazione di un tipo di documento, per club e anno. Si **incrementa**, non si ricava contando: due operatori che incassano insieme conterebbero lo stesso numero. Vedi [ADR-0044](18-decision-log.md#adr-0044--un-numero-di-documento-appartiene-a-un-club-e-a-un-esercizio-e-si-incrementa) |
| `TrainerPayment` | `trainer_payments` | Compensi allenatori per mese |
| `FundingProgram` | `funding_programs` | **Le regole di un bando, in colonne**: `athlete_plafond` (il **massimale del programma**, non cio che il club ha in carico), importo per periodo, frequenza (mensile o N giorni), requisito minimo, unita (`hours`/`sessions`), comportamento sotto soglia (`none`/`prorata`/`full`), tetti, validita e `accrual_source` (`easygame_attendance`/`external_confirmation`/`external_import`/`external_api`). Nessuna regola di un singolo bando vive nel codice. Vedi [ADR-0037](18-decision-log.md#adr-0037--un-contributo-non-e-un-pagamento-due-contabilita-separate-e-le-regole-del-bando-sono-dati) e [ADR-0054](18-decision-log.md#adr-0054--il-massimale-del-bando-non-e-limporto-assegnato-al-club-e-una-presenza-non-e-sempre-una-prova) |
| `FundingEnrollment` | `funding_enrollments` | Atleta ammesso a un programma: `assigned_amount` (**l'importo assegnato presso questo club**, che non e ne il massimale del bando ne denaro incassato) e `voucher_code`. E il tetto di ogni maturazione e di ogni conferma. Unique `(program_id, athlete_id)` |
| `FundingAccrual` | `funding_accruals` | Il **maturato di un periodo**: misura della frequenza, requisito, `estimated_amount` (la **previsione** EasyGame), `accrued_amount` (il credito vero), non maturato, stato (`not_accrued`/`pending_confirmation`/`accrued`/`reported`/`settled`) e le colonne di conferma (`accrual_origin`, `confirmed_at`, `confirmed_by`, `external_reference`, `confirmation_notes`). Il periodo e denormalizzato qui e **non ha una tabella**: si ricava dalla configurazione. Unique `(enrollment_id, period_index)`, che rende il ricalcolo idempotente |
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
| `cap-ipa.json` | Il CAP di 7.836 comuni, piu i 52 che ne hanno piu d'uno. Chiave: codice catastale | Generato da `scripts/build-cap-dataset.mjs` da IPA (AgID). Vedi [ADR-0042](18-decision-log.md#adr-0042--il-cap-arriva-da-ipa-e-si-propone-solo-dove-il-comune-ne-ha-uno-solo) |

Le 107 province con regione restano dov'erano, in `src/lib/italian-registry.ts`:
sono un insieme chiuso e piccolo, e servono anche al client.

**Le due tabelle sono separate perche hanno fonti separate.** I comuni vengono
da ISTAT, il CAP da IPA: licenze diverse, cadenze di aggiornamento diverse,
regole diverse. Si incontrano in `src/lib/server/comuni.ts`, che attacca il
CAP al comune prima di rispondere, e non prima.

**`cap-ipa.json` non e l'elenco dei CAP di un comune.** IPA pubblica il CAP
della *sede* di ogni pubblica amministrazione: raggruppati per comune sono i
CAP **osservati**. Per un comune con un solo CAP l'osservazione e il CAP; per
Roma e un sottoinsieme dei suoi duecento. Per questo il file registra i comuni
con piu CAP come `ambiguous` senza dire quali sono, e il form non compila.

**I file non si modificano a mano.** Si rigenerano:
`node scripts/build-comuni-dataset.mjs` e `node scripts/build-cap-dataset.mjs`
(con `--check` verificano soltanto). Gli script falliscono senza scrivere se la
fonte cambia forma. Il secondo va rigenerato piu spesso: IPA cambia ogni
giorno.

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
| `document_templates` | `id: "attestazione-pagamento-frequenza"` | **identificativo riservato**, non un tipo speciale: e il modello «Attestazione di pagamento e frequenza» (`src/lib/documents/attestation-template.ts`). Il risolutore dei segnaposto non lo conosce e non lo tratta diversamente da un altro modello — l'id serve solo a `/modulistica` per sapere se il club ce l'ha gia e smettere di proporlo. Nessuna migrazione lo scrive: lo semina il pulsante, club per club ([ADR-0079](18-decision-log.md#adr-0079--il-risolutore-dei-segnaposto-e-lunica-capability-nuova-della-wave-1-e-accetta-quattro-vincoli-per-restarlo)). |

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
| `20260826180000_payment_webhook_events` | `payment_webhook_events`, unico su `(provider, event_id)`: la memoria che impedisce a una seconda consegna dello stesso evento di incassare una seconda volta. Il corpo dell'evento **non** si conserva. Vedi [ADR-0045](18-decision-log.md#adr-0045--cedipay-e-il-livello-di-prodotto-il-psp-sta-sotto-e-si-sostituisce) |
| `20260826170000_document_numbering` | `document_number_sequences` (`(club, tipo, anno) → last_number`), vincoli di numerazione da globali a **per club**, riporto delle sequenze gia in uso dal massimo fra numero leggibile e conteggio righe. Vedi [ADR-0044](18-decision-log.md#adr-0044--un-numero-di-documento-appartiene-a-un-club-e-a-un-esercizio-e-si-incrementa) |
| `20260826090000_payment_transactions` | `payment_transactions` + `receipts.transaction_id` (Workstream A, ADR-0036). **Additiva**: nessun pagamento esistente viene letto, convertito o riscritto. L'unica modifica a una tabella esistente e la **rimozione** del vincolo unique su `receipts.payment_id`, che non invalida nessuna riga |
| `20260826140000_funding_programs` | Le cinque tabelle dei contributi (Workstream A, ADR-0037). **Additiva**: non tocca nessuna tabella esistente, e in particolare non tocca `payments` ne `payment_transactions` — le due contabilita restano separate anche nello schema |
| `20260826210000_funding_accrual_source` | Fonte della maturazione, previsione e conferma esterna (ADR-0054). **Additiva**: `accrual_source` nasce con il default che riproduce il comportamento precedente, e nessun importo gia rendicontato o liquidato viene toccato |
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

Lo stesso vale, per la stessa ragione, su altre quattro righe che il diff emette
e che questo elenco per un po' non ha nominato: i `DROP DEFAULT` su
`document_number_sequences` e `payment_webhook_events`, e i `RenameIndex` su
`communication_deliveries`, `club_event_participants` e `generated_documents`. Sono
state trovate rileggendo l'elenco contro l'uscita vera del comando: chi lo usa
come lista di controllo deve trovarci **tutto** cio che il diff dice, altrimenti
una riga in piu sembra una novita da applicare.

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

## Blocco D — piattaforma e fiscalita (2026-08-26)

Otto tabelle nuove e cinque estese. La migrazione
`20260826200000_platform_billing_and_fiscal` e **additiva**: nessun DROP,
nessun UPDATE, e le colonne nuove sono nullable oppure hanno il default che le
righe esistenti gia significano.

### Le tabelle di piattaforma

| Tabella | Risponde a | Chi la scrive |
|---------|-----------|---------------|
| `platform_settings` | «com'e configurato questo ambiente» | Solo `platform_admin`. **Nessun segreto**: identificativi e scelte, non credenziali |
| `platform_commission_rules` | «quanto trattiene EasyGame, da quando, e perche» | Solo `platform_admin`. Una riga per decisione: non si sovrascrive mai ([ADR-0050](18-decision-log.md#adr-0050--una-condizione-commerciale-ha-una-decorrenza-e-la-commissione-si-congela-sullincasso)) |
| `club_payment_accounts` | «questa societa puo incassare online, adesso?» | La console di piattaforma e gli eventi `account.updated` **firmati**. Mai un club |
| `platform_billing_accounts` | «questa societa ha pagato l'abbonamento EasyGame?» | Il webhook del flusso di piattaforma ([ADR-0051](18-decision-log.md#adr-0051--due-flussi-stripe-due-account-due-segreti-il-denaro-delle-famiglie-non-e-il-fatturato-di-easygame)) |

### Le tabelle fiscali, di proprieta del club

| Tabella | Risponde a |
|---------|-----------|
| `organization_fiscal_profiles` | «che soggetto e questa societa davanti al fisco». Separata dall'anagrafica, che risponde a «come si chiama e dove la trovo» |
| `fiscal_operation_types` | «cosa si sta incassando». Classificazione **configurata**, non dedotta ([ADR-0052](18-decision-log.md#adr-0052--la-sigla-non-decide-il-trattamento-fiscale-il-profilo-si-dichiara-il-documento-si-propone)) |
| `document_series` | «in quale registro va questo documento». Chi non ne configura nessuna ne ha comunque una: quella vuota |
| `einvoice_transmissions` | «a che punto e la fattura elettronica». Separata dalla fattura, che resta valida anche se non e mai stata trasmessa ([ADR-0053](18-decision-log.md#adr-0053--easygame-prepara-il-tracciato-fatturapa-non-lo-trasmette-e-non-lo-dichiara-trasmesso)) |

### Le colonne aggiunte, e perche

**`payment_transactions`** porta ora la **riconciliazione congelata** di un
incasso online: `currency`, `gross_amount_cents`, `platform_fee_cents`,
`provider_fee_cents`, `net_amount_cents`, `applied_fee_percent`,
`applied_fee_fixed_cents`, `commission_rule_id`, `external_account_id`,
`external_payment_id`, `external_event_id`, `operation_type_code`.

Sono **nulle** sulle righe gia scritte, ed e corretto: quegli incassi sono
manuali e una commissione di piattaforma non l'hanno mai avuta. Non si
retrodata cio che non e successo.

`provider_fee_cents` resta spesso `null` anche sugli incassi nuovi: Stripe
espone la propria commissione sul `balance_transaction`, che non viaggia
nell'evento del pagamento. `null` significa «non lo so», e non «e zero» — sono
due affermazioni diverse e confonderle produrrebbe un netto sbagliato.

**`invoices` e `receipts`** portano `series`, `sequence`, `document_year`,
`operation_type_code`, `snapshot`, `cancelled_at`, `cancelled_by`,
`cancellation_reason`, `cancels_document_id`, `issued_by`; `invoices` anche
`transaction_id`, che prima viveva dentro `data.transactionId`.

Lo **snapshot** e la fonte autorevole; i campi sciolti restano una copia
interrogabile perche mezza applicazione li filtra. Quando divergono, vince lo
snapshot.

**`document_number_sequences`** guadagna `series`, e il vincolo di unicita
passa da `(club, tipo, anno)` a `(club, tipo, serie, anno)`. Le righe
esistenti prendono la serie vuota, che e esattamente quella in cui hanno
sempre numerato: il vecchio vincolo e un caso particolare del nuovo e nessuna
sequenza si azzera.

**`payment_webhook_events`** guadagna `flow` (`connect` | `platform`) e
`external_account_id`. Il default `connect` e cio che erano tutti gli eventi
ricevuti finora: prima del Blocco D esisteva un solo webhook.

## Blocco E — cio che il collaudo sandbox ha reso necessario (2026-08-27)

Tre migrazioni, tutte **additive**, e tutte scritte perche un giro reale contro
Stripe ha mostrato qualcosa che i test su mock non potevano mostrare.

| Migrazione | Contenuto |
|------------|-----------|
| `20260827020000_incasso_unico_per_pagamento` | Indice unico **parziale** `payment_transactions_incasso_unico` su `(organization_id, external_payment_id)` per le sole righe con importo positivo. E dove si arbitra la corsa fra i due eventi che un solo pagamento genera. Vedi [ADR-0062](18-decision-log.md#adr-0062--un-incasso-si-riconosce-dal-denaro-non-dallevento-che-lo-racconta) |
| `20260827030000_storno_unico_per_rimborso` | Il gemello sul denaro che esce: `payment_transactions_storno_unico` su `(organization_id, external_reference)` per le sole righe con importo negativo. Un rimborso raccontato da due eventi resta un movimento solo |
| `20260827040000_interruttore_pagamenti_deciso` | `club_payment_accounts.online_payments_decided_at`. Vedi sotto |

### `online_payments_decided_at`: perche un booleano non bastava

`online_payments_enabled` nasce `false` per default di colonna, e `false`
significava due cose che non si potevano distinguere: «nessuno ha mai acceso»
e «la piattaforma ha sospeso questa societa».

La confusione costava in entrambe le direzioni. Un club con l'account Stripe
pienamente operativo restava spento per sempre, perche il ramo `update`
dell'upsert di onboarding non toccava l'interruttore e la sincronizzazione
leggeva quel `false` come una sospensione — forzando lo stato a `disabled`
senza che nessuno avesse deciso niente (E9). Risolverlo scrivendo `true` sempre
avrebbe fatto il danno opposto, e peggiore: riaccendere gli incassi di una
societa sospesa di proposito, al primo `account.updated` che passa.

`NULL` significa **mai deciso**; una data significa **deciso**, e vale che sia
«acceso» o «spento». La stampiglia solo `setClubOnlinePaymentsEnabled`: una
inizializzazione automatica non e una decisione, e dichiararla tale renderebbe
indistinguibile la prossima.

La migrazione **stampiglia le decisioni gia prese** prima di cambiare le
regole: le righe con l'interruttore acceso e quelle in stato `disabled` — che
scrive solo la sospensione esplicita — ricevono `updated_at` come data di
decisione. Tutto il resto resta `NULL`, ed e il caso legacy che va
inizializzato. Vedi [ADR-0064](18-decision-log.md#adr-0064--un-interruttore-spento-di-proposito-si-distingue-da-uno-mai-acceso-e-la-differenza-e-una-data).


---

## Lavoro sportivo e compensi (2026-08-28)

Undici tabelle, `sport_work_*`, introdotte dalla migrazione
`20260828100000_sport_work`. La migrazione e **additiva**: non tocca, non legge
e non riscrive nessuna tabella esistente — in particolare non tocca `payments`,
`payment_transactions` ne `trainer_payments`, perche un compenso che esce non e
un incasso che entra ([ADR-0074](18-decision-log.md#adr-0074--il-denaro-che-esce-ha-un-registro-proprio-non-e-un-incasso-al-contrario)).

| Tabella | Risponde a |
|---------|-----------|
| `sport_work_people` | chi e la persona |
| `sport_work_relationships` | a quali condizioni lavora |
| `sport_work_compensation_plans` | quanto e stato pattuito |
| `sport_work_compensation_installments` | quando e dovuto, e quanto e maturato |
| `sport_work_outbound_transactions` | quanto e uscito davvero — **il registro** |
| `sport_work_external_declarations` | cosa il lavoratore ha dichiarato |
| `sport_work_year_positions` | a che punto e verso le soglie |
| `sport_work_bonuses` | i premi, che non sono compensi |
| `sport_work_expense_reimbursements` | i rimborsi, che non sono compensi |
| `sport_work_vat_invoices` | le fatture ricevute dai professionisti |
| `sport_work_obligations` | cosa il club deve fare, entro quando |

### Le tre grandezze che non si confondono

`gross_amount`, `accrued_amount` e `paid_amount` su una scadenza sono
**programmato**, **maturato** ed **erogato**: tre numeri diversi. La colonna
`status` si **deriva** da loro e da una data, e nessun corpo di richiesta puo
impostarla — stessa disciplina di
[ADR-0036](18-decision-log.md#adr-0036--una-rata-e-un-debito-un-incasso-e-un-movimento-due-tabelle-non-una),
applicata al denaro che esce.

### Due anni, non uno

`sport_work_compensation_installments.fiscal_year` e l'anno **della scadenza
programmata**: una previsione. L'anno fiscale che conta e
`sport_work_outbound_transactions.fiscal_year`, cioe l'anno solare della data
di pagamento, perche le franchigie si consumano **per cassa**. Una stagione
2026/27 attraversa due anni solari, due franchigie intere e due rule set.

### Cio che il database fa rispettare da solo

Quattro indici e quattro CHECK, e nessuno di loro e decorazione: sono le regole
che sotto concorrenza il codice applicativo non riesce a garantire, perche fra
la lettura e la scrittura c'e una finestra
([ADR-0067](18-decision-log.md#adr-0067--il-denaro-si-arbitra-bloccando-la-riga-non-solo-con-un-indice)).

| Vincolo | Cosa impedisce |
|---------|----------------|
| `sport_work_outbound_gesto_unico` (parziale) | che due invii dello stesso clic facciano uscire il denaro due volte |
| `sport_work_storno_unico` (parziale) | che stornare due volte riporti il registro in attivo di un compenso intero |
| `sport_work_dichiarazione_attiva_unica` (parziale) | che due autocertificazioni valide diano due risposte a «quanta franchigia resta» |
| `sport_work_persona_unica_per_codice_fiscale` (parziale) | che la stessa persona censita due volte spezzi il progressivo annuo in due meta, ognuna sotto soglia |
| `sport_work_outbound_segno_check` | che uno storno abbia importo positivo e raddoppi l'uscita invece di compensarla |
| `sport_work_outbound_storno_coerente_check` | che uno storno non punti a niente, o che una riga qualunque si dichiari storno |
| `sport_work_rata_importi_check` | rate di importo nullo o pagamenti negativi |
| `sport_work_rapporto_periodo_check` | un rapporto che finisce prima di cominciare |

### Il dato riservato

`sport_work_people.iban` non compare **mai** in una proiezione di elenco: la
lista risponde `has_iban: true/false`. Le coordinate bancarie si leggono
aprendo la scheda, una alla volta, e chi lo fa ha `sport_work.manage`. Il
filtro dell'audit gia rimuove `iban` dai metadati per nome di chiave.

### Cosa non e stato creato

Nessuna colonna JSON nuova su `clubs` — il club ne ha gia trentadue ed e un
debito noto. Nessun secondo archivio di allegati: i documenti sono righe di
`attachments` con `owner_type` `sport_work_relationship` o `sport_work_person`.
Nessun secondo canale di notifica: il giro notturno scrive in `notifications`.

---

## Wave 2 — comunicazioni (2026-08-29)

Due tabelle, gia descritte in [33](33-wave-2-planning.md) e
[34](34-wave-2-implementation-uat.md): `communication_deliveries` (il registro
unico di cosa e uscito, con l'indice unico che regge la deduplica anche con due
cron in parallelo) e `payment_links` (il token opaco di cui l'archivio conserva
solo l'impronta).

---

## Wave 3 — documenti, consensi, scadenze (2026-08-29)

Sei tabelle e due colonne, scritte in **una migrazione sola prima di aprire le
lane**: `20260829100000_wave3_documents`. La settima colonna — la bozza di un
modello — e arrivata subito dopo con
`20260829110000_wave3_template_draft`, perche la barriera se l'era dimenticata.

### Il motore documentale (ADR-0088)

| Tabella | Cosa contiene | L'invariante che porta |
|---|---|---|
| `document_templates_v2` | Il modello: titolo, soggetto, **bozza** (`draft_content`), stato `draft`/`active`/`retired`, e i quattro campi redazionali di ADR-0092 (`catalog_key`, `catalog_class`, `editorial_owner`, `last_reviewed_at`) | Un modello con documenti generati si **ritira**, non si cancella |
| `document_template_versions` | La versione **immutabile**: titolo, `content_html`, `placeholder_keys[]`, `sensitivity[]`, soggetto, chi e quando | Non si aggiorna mai. Non ha `updated_at`, ed e voluto: una riga che non si aggiorna non deve dire quando e stata aggiornata |
| `generated_documents` | Il documento: versione citata, soggetto, `values_snapshot`, **`content_html`**, `unresolved[]`, `missing[]`, `warnings[]`, `sensitivity[]`, stato, lotto | Dentro un lotto uno stesso soggetto produce **un** documento |

**Perche il suffisso `_v2`.** `document_templates` e gia il nome di una colonna
JSON di `clubs` e della risorsa che la espone. Nel periodo in cui le due cose
convivono, due nomi identici si pagano a ogni lettura.

**Cosa fa rispettare il database, e non una funzione.**

- `generated_documents.template_id` e `version_id` hanno `ON DELETE RESTRICT`:
  cancellare cio che un documento cita non e possibile nemmeno da una query
  scritta a mano;
- l'indice unico
  `(organization_id, batch_id, subject_kind, subject_id)` e l'idempotenza del
  lotto. In PostgreSQL un indice unico **non vincola le righe con un `NULL`**:
  una generazione singola (`batch_id IS NULL`) resta quindi libera di ripetersi
  — due attestazioni chieste due volte sono due documenti — mentre dentro un
  lotto lo stesso soggetto compare una volta sola. E cio che rende un nuovo
  tentativo capace di rigenerare **solo** i falliti;
- `document_template_versions(template_id, version)` e unico: due righe con lo
  stesso numero renderebbero ambigua la citazione di un documento.

**`content_html` sta nella riga, non in Attachment Core** (ADR-0089). Le
ragioni, in ordine di forza: l'endpoint degli allegati autorizza la lettura a
chiunque appartenga al club; `text/html` e fuori dall'elenco chiuso dei tipi
accettati, e ci sta apposta; e un documento generato non e un file dell'utente,
e un **fatto** del gestionale.

### I consensi (ADR-0090)

| Tabella | Cosa contiene | L'invariante |
|---|---|---|
| `consent_definitions` | Cosa si chiede: `key` unica per club, titolo, obbligatorieta, stato | La chiave e cio con cui un modulo o un modello lo nomina |
| `consent_versions` | Il testo esatto accettato, **immutabile** | Senza, «a cosa ha detto di si» resta senza risposta il giorno in cui l'informativa viene corretta |
| `consent_records` | La decisione: `accepted` \| `rejected` \| `revoked`, chi, quando, da dove, con quale evidenza | **Append-only**: nessuna `updated_at`, perche nessuna riga si aggiorna |

`consent_records.version_id` ha `ON DELETE RESTRICT`: la versione che qualcuno
ha accettato non si cancella.

**Lo stato attuale non e una colonna.** Si deriva: e l'ultima decisione per
(definizione, soggetto), con `created_at` e poi `id` come spareggio
deterministico a parita di `decided_at`. E la stessa regola dello stato di una
rata e di una scadenza del lavoro sportivo.

### La validita di un allegato (W3-G)

Due colonne su `attachments`: `valid_from` e `valid_until`, piu l'indice
`(organization_id, valid_until)` che serve al giro notturno per chiedere «cosa
scade fra N giorni in questo club» senza scandire tutti gli allegati.

Lo **stato** (valido / in scadenza / scaduto / non ancora valido) **non e una
colonna**: si ricava dalla data e da oggi. Scriverlo vorrebbe dire tenerlo
aggiornato, e nessun giro notturno puo garantirlo per ogni riga.

**Il certificato medico non passa di qui.** Ha `medical_certificates` con una
semantica propria e la sua automazione `AUT-03`; le categorie del certificato
sono escluse dalla lettura delle scadenze, dal filtro configurabile e dal
valutatore — tre volte, perche un doppio promemoria per la stessa scadenza e
esattamente il difetto che si stava evitando.

### Una deriva nota fra schema e database

L indice che impedisce di adottare due volte la stessa voce di catalogo e
**parziale** in base dati — `WHERE catalog_key IS NOT NULL` — perche un modello
scritto dal club non ha una voce di catalogo e deve restare libero di chiamarsi
come vuole. Prisma non sa modellare un indice parziale, quindi nello schema
compare **pieno**.

Semanticamente i due coincidono: PostgreSQL tratta i `NULL` come distinti in un
indice unico. Ma `prisma migrate diff` segnala la differenza ed emette un
`CREATE UNIQUE INDEX` **senza** la clausola `WHERE`: applicata, quella riga non
creerebbe un secondo indice, **fallirebbe**, perche il nome che Prisma genera e
gia quello dell'indice parziale in base dati
(`document_templates_v2_organization_id_catalog_key_key`). Chi genera la
prossima migrazione deve scartarla. E lo stesso genere di deriva gia registrata
al §«Drift noto e benigno».

### Cosa non e stato creato

Nessuna colonna JSON nuova su `clubs`. **Nessun secondo archivio di file**: la
copia firmata di un documento e una riga di `attachments`, come tutto il resto.
Nessun secondo scheduler: le scadenze documentali sono il quinto innesco del
motore di Wave 2. Nessuna libreria PDF, e la decisione e scritta in
[35](35-wave-3-planning.md) §3.4.

---

## Wave 4 — contabilita e prima nota (2026-08-29)

Tre tabelle nuove, dieci estensioni, e un principio che spiega il rapporto fra
i due numeri:

> Un movimento di prima nota **non e mai la fonte** di un numero che un altro
> dominio possiede. E la sua **proiezione datata e classificata**. Se i due
> divergono, ha ragione il dominio.

### `financial_accounts` — i conti, e il saldo che non e una colonna

Prima erano `clubs.bank_accounts`, un blob JSON con un `current_balance`
**mutato a mano dal browser** con una seconda chiamata HTTP non transazionale.
Se la scrittura del movimento riusciva e quella del saldo no, restavano
disallineati per sempre; due utenti in contemporanea, e il saldo di uno spariva.
Nessuna funzione era in grado di ricostruirlo.

Qui **il saldo non e una colonna**: e la somma dei movimenti, come lo stato di
una rata e la somma dei suoi incassi (ADR-0036). Cio che si conserva del vecchio
numero e `opening_balance_cents` con la sua data — l'unico modo onesto di
tenerlo, perche i movimenti che l'hanno prodotto nessuno puo ricostruirli.

Serviva una tabella vera perche e il **bersaglio di una foreign key** da tre
tabelle: incassi, uscite del lavoro sportivo, liquidazioni dei bandi. Un blob
JSON non puo esserlo.

I tre tipi sono `CASH`, `BANK` e `CLEARING`. Il transito non e un vezzo: il
denaro incassato online non e in banca il giorno dell'incasso, e il versamento
arriva dopo al netto delle commissioni.

### `accounting_entries` — la prima nota

Ospita **solo** cio che prima viveva in `clubs.transactions` e
`clubs.transfers`: il movimento di cassa registrato a mano, le due gambe di un
giroconto, e i loro storni. Incassi, compensi, contributi e pagamenti sponsor
restano ai loro proprietari e vengono **proiettati**.

Un vincolo di database lo difende, e non e ridondante con il codice:
`accounting_entries_origine_check` ammette in scrittura **solo** `MANUAL`,
`INTERNAL_TRANSFER` e `REVERSAL`. Una riga `ATHLETE_PAYMENT` in tabella sarebbe
lo stesso incasso rappresentato due volte, e i totali lo conterebbero due volte.
Il vincolo e nato **stretto dopo**: la prima versione ammetteva tutto il
catalogo, e una sonda lo ha dimostrato in un minuto.

Gli altri invarianti, tutti nel database:

| Vincolo | Cosa impedisce |
|---|---|
| `amount_cents > 0` | Il segno lo dice il verso, non l'importo |
| `direction IN ('IN','OUT')` | Il giroconto non e un terzo verso: sono due movimenti |
| `fiscal_year = EXTRACT(YEAR FROM entry_date)` | L'anno fiscale non si digita |
| indice unico parziale su `reversal_of_id` | Niente doppio storno |
| indice unico parziale su `(organization_id, source_domain, source_event_key)` | Lo stesso fatto, una sola rappresentazione finanziaria |
| `INTERNAL_TRANSFER` ⇒ `transfer_group_id NOT NULL` | Un giroconto ha due gambe, sempre |
| `REVERSAL` ⇒ `reversal_of_id NOT NULL` | Uno storno deve dire cosa compensa |

`activity_scope_snapshot` e **congelato**: la causale e configurazione mutabile,
e senza congelamento la correzione di una voce cambierebbe la natura di tutti i
movimenti passati, retroattivamente.

### `accounting_ledger_lines` — la vista che **e** la prima nota (2026-08-30)

Non e una tabella. E una **vista** che unisce in un solo elenco cinque
sorgenti: i movimenti propri di `accounting_entries`, e la proiezione di
`payment_transactions`, `sport_work_outbound_transactions`,
`funding_settlements` e del blob storico `clubs.transactions` /
`clubs.transfers`.

**Perche una vista e non una tabella.** Una tabella che materializzasse
incassi, compensi e liquidazioni sarebbe la seconda contabilita che questa
Wave vieta: due fonti per lo stesso numero, e nessun modo di tenerle
allineate. Una vista non contiene niente, quindi non puo disallinearsi da cio
che legge. Se un incasso viene stornato, la vista lo sa nello stesso istante in
cui lo sa `payment_transactions`, perche **e** `payment_transactions`.

**Il difetto che chiude.** `listAccountingEntries` rileggeva l'**intero**
registro a ogni chiamata, filtrava in memoria, ordinava in memoria e affettava
cinquanta righe. Il rendiconto e l'export la **sfogliavano**, quaranta e
ottanta volte, e ognuna di quelle chiamate ricostruiva tutto per restituirne
cinquecento. Il costo era O(N x pagine). Misurato su 35.000 righe:

| | prima | dopo |
|---|---:|---:|
| prima nota, prima pagina | 5.719 ms | **409 ms** |
| pagina intermedia | 4.885 ms | **397 ms** |
| ultima pagina | 5.225 ms | **371 ms** |
| filtro anno fiscale | 3.305 ms | **190 ms** |
| filtro conto | 1.904 ms | **135 ms** |
| filtro causale | 1.934 ms | **42 ms** |
| ricerca testuale | 5.107 ms | **227 ms** |
| rendiconto annuale | 110.621 ms | **1.859 ms** |
| export annuale completo | 93.285 ms | **1.321 ms** |

Le misure si rifanno con
`node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs scripts/measure-accounting-performance.mjs --grande`.

**La regola e scritta due volte, e una sonda lo tiene onesto.**

| Dove | Cosa fa |
|---|---|
| la migrazione `20260830090000_wave4_registro_unico` | la **esegue**, in SQL: e cio che la produzione usa |
| `src/lib/accounting/ledger-view.ts` | la **dichiara**, in TypeScript: e cio che i test leggono, e cio che il doppio Prisma ricompone |
| `scripts/wave-4-registro-riconciliazione.mjs` | prova che le due **coincidono**, contro Postgres vero, riga per riga e campo per campo |

Senza la terza, le prime due sarebbero due contabilita. La sonda semina i casi
in cui potrebbero divergere — storno, rimborso, compenso a netto zero,
liquidazione stornata, documento annullato, movimento storico, importo con la
frazione a mezzo centesimo — e confronta 35 colonne piu l'ordine.

**Cosa la sonda ha insegnato sul database vero:**

- `payment_transactions_amount_check` **vieta l'importo zero**: il ramo «importo
  zero» delle due proiezioni e irraggiungibile per gli incassi, e resta
  esercitato solo dove un importo nullo e possibile davvero — il blob storico,
  che vincoli non ne ha, e il netto di un compenso interamente trattenuto;
- `funding_settlements_amount_check` impone importo **positivo** a una
  liquidazione e **negativo** a uno storno. Entrambe le letture prendono il
  valore assoluto, quindi coincidono; ma una stesura che avesse dato allo
  storno un importo positivo sarebbe passata nei doppi e caduta sul database.

**`row_kind` dice cosa si puo toccare**, e non e presentazione: `entry` e di
questa contabilita e si modifica e si storna; `projected` appartiene a un
dominio proprietario e si corregge li, dove ci sono i suoi permessi, i suoi
invarianti e il suo audit; `legacy` e il blob storico, che non ha nemmeno un
conto a cui appartenere.

**Sola lettura, e non per convenzione.** Postgres rifiuta una scrittura su una
vista con `UNION ALL`: non serve una guardia applicativa, il database non ha un
modo di eseguirla. Il doppio dei test fa lo stesso, perche un test che
riuscisse a scrivere qui descriverebbe un database che non esiste.

La vista richiede `previewFeatures = ["views"]` sul generatore Prisma: e
l'unica del progetto, e la dichiarazione completa vive nel file SQL della
migrazione, che e l'unico posto dove puo stare per intero.

**Tre indici aggiunti con lei**, perche i domini proiettati avevano
`organization_id` e nessuno la **data**, che e l'asse su cui il registro ordina
e filtra sempre: `payment_transactions (organization_id, paid_at)`,
`funding_settlements (organization_id, settled_at)`, e
`accounting_entries (organization_id, operation_type_code)` per il filtro per
causale, che non era indicizzato da nessuna parte.

#### Quanto puo valere un importo, e perche il database lo dice (2026-08-30)

`amount_cents` della vista e un `int`. Oltre **21.474.836,47 euro** i centesimi
non ci entrano, e Postgres non tronca: alza `integer out of range` e l'intera
query cade — cioe quel club perde prima nota, rendiconto, export e saldi, tutti
insieme, per una riga sola.

Tre `CHECK` impediscono che una riga cosi nasca:

| Vincolo | Tabella | Regola |
|---|---|---|
| `payment_transactions_amount_scala_check` | `payment_transactions` | `abs(amount) <= 21474836.47` |
| `sport_work_outbound_scala_check` | `sport_work_outbound_transactions` | lo stesso su `net_amount` e `gross_amount` |
| `funding_settlements_scala_check` | `funding_settlements` | lo stesso su `amount` |

E `easygame_centesimi(double precision) RETURNS int` regge comunque: `NULL` per
il fuori scala, per `NaN` e per gli infiniti — che Postgres accetta volentieri
come `double precision` e rifiuta come `int`. Le due meta non si sostituiscono:
il vincolo impedisce, la funzione limita il danno se il vincolo verra aggirato
da una scrittura che l'applicazione non vede.

#### La data storica accetta ISO 8601, e nient'altro

`easygame_blob_timestamp(text)` rifiuta tutto cio che non ha la forma
`AAAA-MM-GG[THH:MM[:SS[.mmm]][Z|±HH:MM]]`. Non e pignoleria: e la sola forma su
cui la vista SQL e la sua dichiarazione in TypeScript
(`src/lib/accounting/ledger-view.ts`) possono essere d'accordo. Postgres
risolve `'now'`, `'today'`, `'epoch'`, `'infinity'`; JavaScript no.
`'09/03/2026'` e il 3 settembre per uno e il 9 marzo per l'altro. Un giorno di
scarto a cavallo di dicembre e un **anno fiscale** sbagliato.

Quando l'offset c'e, si onora e si porta in UTC: e cio che fa JavaScript, e
percio il risultato non dipende dal fuso della sessione — la dichiarazione
`IMMUTABLE` resta vera, che prima non lo era.

Il ripiego sceglie fra i due valori **letti**, non fra i due grezzi:
`COALESCE(easygame_blob_timestamp(date), easygame_blob_timestamp(created_at))`.
Con `COALESCE` sui grezzi una `date` sporca ma presente vinceva su un
`created_at` buono, e la riga usciva da una lettura del registro e non
dall'altra.

#### E tre dettagli che una seconda revisione ha misurato

**I vincoli nascono `NOT VALID`.** Un `ADD CONSTRAINT` che valida legge ogni
riga gia scritta, e la premessa di questa migrazione e che un importo fuori
scala **possa gia esserci**. Se c'e, la validazione fallisce, la migrazione
fallisce, e — dato che ogni deploy esegue `prisma migrate deploy` — fallisce il
deploy intero: il rimedio sarebbe peggiore del guasto, perche il guasto toglie
la contabilita a un club e questo la toglierebbe a tutti. La validazione si
tenta in coda alla migrazione e, se non passa, lo **dice** invece di
interrompere.

**La forma ISO e piu stretta di quanto sembri.** L'ora e vincolata a 00–23 e i
secondi a 00–59 perche Postgres accetta `T24:00` e `T23:59:60` e li fa scorrere
al momento dopo, mentre JavaScript li rifiuta; e l'anno `0000` non esiste per
Postgres e vale 1 a.C. per JavaScript. Ogni forma che una sola delle due
letture sa leggere e una riga che compare in una sola delle due.

**Il fuso, e il giorno.** Senza offset, `valore::timestamp` legge l'ora **come
e scritta** e `new Date("2026-03-09T12:00")` la legge in **ora locale**: le due
letture divergevano di un'ora su ogni macchina che non sta a Greenwich, e la
sonda di riconciliazione dava percio un verdetto diverso a seconda di dove la
si eseguiva. La dichiarazione in TypeScript costruisce ora l'orologio da muro
in UTC e applica l'offset dopo — e il controllo «il giorno scritto dev'essere
il giorno letto», che esiste per il 31 febbraio, lo fa **prima** dell'offset:
fatto dopo rifiutava ogni data valida che in UTC cade il giorno prima o dopo,
`2026-01-01T00:30:00+02:00` compresa, che per giunta finisce in un anno fiscale
diverso.

**E il millesimo, che sposta l'anno.** `timestamp(3)` **arrotonda** e
`new Date` **tronca**: `23:59:59.9999` diventa il secondo dopo per Postgres e
resta il millesimo prima per JavaScript, e a cavallo di capodanno le due
letture finiscono in anni fiscali diversi. Peggio: quell'arrotondamento su
`9999-12-31T23:59:59.9996` produce l'**anno 10000**, che `isfinite` accetta e
che il convertitore di Prisma non sa rileggere — una riga sola cosi faceva
cadere prima nota, rendiconto, export e saldi di quel club, raggiungendo da una
data lo stesso guasto che i vincoli di scala chiudono da un importo. Entrambe
le letture arrotondano allo stesso modo, e rifiutano un anno fuori da 1–9999.

Un fuso oltre ±15:59, o con piu di 59 minuti, e rifiutato da entrambe: Postgres
non lo conosce, JavaScript si.

Le tre funzioni fissano `search_path = pg_catalog, pg_temp`.

Vedi ADR-0096.

### `membership_events` — il libro soci

Append-only, e lo stato **si deriva**. L'anagrafica del socio resta in
`clubs.members`: questo le nasce accanto.

Non e estetica. La decommercializzazione di un'entrata dipende dalla qualifica
della controparte **al momento dell'operazione**, e un'anagrafica mutabile non
sa dire chi era socio il 12 marzo 2026. Due indici unici parziali difendono
«un socio si ammette una volta sola» e «il numero di tessera non si ripete».

### Le colonne aggiunte, e perche

| Tabella | Colonne | Perche |
|---|---|---|
| `fiscal_operation_types` | `direction_hint`, `reporting_bucket`, `default_description`, `deductible`, `is_membership_fee`, `classified_by`, `classified_at` | I due flag che il documento 30 chiama «il perno». Nascono `NULL` e **non** `false`: un valore non dichiarato si vede che manca, uno sbagliato sembra compilato |
| `payment_transactions` | `financial_account_id`, `counterparty_*`, `activity_scope_snapshot` | Su quale conto e entrato il denaro, da chi quando non e un atleta, e la classificazione congelata |
| `payments` | `counterparty_*` | Un socio o uno sponsor possono dovere una rata. `athlete_id` resta |
| `sport_work_outbound_transactions` | `financial_account_id` | `bank_account_id` esisteva, il servizio lo scriveva, e **nessuna superficie lo compilava** |
| `funding_settlements` | `financial_account_id`, `reversal_*` | Un bonifico dell'ente era invisibile nel saldo, e una liquidazione sbagliata non aveva rimedio |
| `invoices`, `receipts` | `taxable_amount_cents`, `vat_amount_cents` | Il **dato**, non il motore: EasyGame li conserva e li espone, non ne ricava liquidazioni |

Piu un indice unico parziale su `invoices.transaction_id`: le ricevute lo
avevano gia, le fatture no, e due richieste simultanee producevano **due
documenti fiscali con due numeri** per lo stesso incasso.

### Cosa il database ha insegnato che i test non potevano

Due difetti trovati eseguendo, non leggendo, e nessuno dei due sarebbe emerso
dai test: girano su un doppio di Prisma, che i vincoli `CHECK` non li applica.

1. **Il vincolo delle origini era troppo largo** — una sonda ha inserito una
   riga per invariante e ha guardato quali il database rifiutasse davvero. Otto
   su nove tenevano; il nono lasciava scrivere in tabella un incasso proiettato;
2. **lo storno di una liquidazione non poteva funzionare.**
   `funding_settlements_amount_check` imponeva `amount > 0`, e uno storno e
   negativo per costruzione. Tredici test verdi su una funzione che in
   produzione avrebbe risposto un errore del driver a ogni chiamata. Il vincolo
   ora fa dipendere il segno dal tipo di riga, come gia fa il lavoro sportivo;
   un livello sotto, dove il segno dipende dalla **riga padre** e un `CHECK` non
   vede altre tabelle, lo difende un trigger — l'unico della Wave.

### Il taglio storico, e perche non c'e doppio conteggio

I movimenti scritti prima della Wave **non** sono stati travasati in tabella:
travasarli avrebbe richiesto di **inventare** per ognuno un conto e una causale
che nessuno ha mai dichiarato.

Compaiono nella prima nota, in sola lettura, marcati non classificati — che e la
verita — e **non toccano nessun saldo**: il loro effetto e gia dentro
`opening_balance_cents`, che di quei movimenti e la somma.

### Cosa non e stato creato

**Nessun piano dei conti e nessuna partita doppia**: una ASD non la tiene e
nessuna norma gliela chiede. **Nessuna tabella `counterparties`**: duplicherebbe
atleti, soci, persone del lavoro sportivo e sponsor, che esistono gia — al loro
posto una coppia polimorfa con l'etichetta congelata. **Nessuna tabella che
materializzi incassi, compensi o contributi**: sarebbe la seconda contabilita.
**Nessun ruolo `treasurer`**: la separazione «registra / storna» ottiene lo
stesso con i permessi.

### Wave 4 — remediation (2026-08-30)

**`accounting_entries_evento_unico` diventa parziale anche su `reversed_at`.**
L'unicita dell'evento contava anche le righe **stornate**, e il risultato era
che la procedura di correzione consigliata dal prodotto era resa impossibile
dal vincolo che la consigliava: un versamento F24 registrato per l'importo
sbagliato e poi stornato lasciava in tabella la riga morta con il suo
`source_event_key`, e da quel momento l'adempimento non si assolveva piu.

Una riga stornata non rappresenta piu niente — la coppia originale/storno somma
zero, e il fatto e tornato non registrato. L'unicita vale fra le righe **vive**:

```sql
CREATE UNIQUE INDEX accounting_entries_evento_unico
  ON accounting_entries (organization_id, source_domain, source_event_key)
  WHERE source_event_key IS NOT NULL AND reversed_at IS NULL;
```

La protezione contro la doppia registrazione non si indebolisce: due richieste
simultanee per lo stesso evento continuano a infrangersi qui, perche nessuna
delle due e stornata.

**`payment_transactions.activity_scope_snapshot` viene finalmente scritto.** La
colonna esisteva e il valore lo doveva passare il chiamante; nessun chiamante lo
passava, e lo schema di validazione non lo dichiarava, quindi Zod lo toglieva
anche a chi ci avesse provato. Ogni incasso reale finiva in tabella con
`"unspecified"`, e il rendiconto dichiarava **non classificato il cento per
cento degli incassi delle famiglie** — mentre il documento emesso per lo stesso
incasso diceva «commerciale».

Adesso lo risolve `getOperationType`, che e il proprietario del catalogo: e la
stessa disciplina del numero di un documento, che non si digita ma si chiede a
chi lo possiede. Senza causale non si congela niente, **nemmeno un ambito
dichiarato**: un ambito che nessuna causale giustifica sarebbe una
classificazione che nessuno ha preso.


---

## Due semantiche di cancellazione corrette (2026-08-31, tredicesima tornata)

Migrazione `20260831140000_wave4_cancellazioni_che_non_distruggono`.

| Vincolo | Prima | Adesso | Perche |
|---|---|---|---|
| `notifications.user_id → users.id` | `SET NULL` | **`CASCADE`** | In questo modello `user_id = NULL` significa «di societa», e l'area genitore lo legge come **«di tutti»**: `getParentDashboardData` interroga `OR: [{ user_id }, { user_id: null }]` e restituisce la riga intera, `data` compreso. Cancellare un account trasformava quindi ogni sua notifica privata in una notifica per tutte le famiglie del club — una richiesta di cancellazione **pubblicava** i dati invece di toglierli. Una notifica indirizzata a chi non c'e piu non ha significato residuo |
| `funding_settlement_lines.accrual_id → funding_accruals.id` | `CASCADE` | **`RESTRICT`** | La catena `athletes → funding_accruals → funding_settlement_lines` faceva sparire, cancellando un atleta, le righe che attribuiscono una liquidazione **gia erogata**. La testata sopravviveva con l'importo intero: un totale «liquidato» senza nessuno a cui attribuirlo, e una riconciliazione che perde beneficiari in silenzio. Lo dichiarava gia il commento del modello |

`RESTRICT` non e raggiungibile dal percorso legittimo: `removeFundingEnrollment`
cancella i maturati **solo** nel ramo «nessuno storico», che per costruzione non
ha righe liquidate.

### E la vista del registro porta la sede del conto

Migrazione `20260831160000_wave4_la_sede_di_un_incasso`: i tre rami proiettati —
incassi, compensi, liquidazioni — leggono `financial_accounts.site_id` dalla
tabella che gia univano per il **nome** del conto. Prima scrivevano `NULL`, e
siccome gli incassi delle famiglie stanno tutti in uno di quei rami, nessun euro
pagato da una famiglia poteva avere una sede. I due rami storici restano senza:
il vecchio blob non dice su quale conto sia passato il denaro.

> **Il gemello in TypeScript deve derivarla insieme alla vista.**
> `src/lib/accounting/projection.ts` prende la sede da `_accountSiteId`. Se una
> delle due letture la derivasse e l'altra no, il registro racconterebbe sedi
> diverse a seconda di chi lo chiede — ed e esattamente cio che
> `scripts/wave-4-registro-riconciliazione.mjs` esiste per impedire. La sonda
> semina apposta **un conto con una sede e uno senza**: senza il primo, il
> confronto su quel campo sarebbe vacuo.

---

## `form_submissions.dedup_key`: il doppio invio produce una domanda sola (2026-09-01, Wave 5 — 5J)

Migrazione `20260901140000_wave5_invio_idempotente`: colonna `dedup_key` piu
l'unico `(organization_id, dedup_key)`.

**Il difetto, misurato.** La sonda di concorrenza
(`scripts/wave-5-concurrency-probe.mjs`) ha inviato due volte in parallelo la
stessa domanda di iscrizione e ne ha contate **due** in `form_submissions`,
entrambe in `pending`, con gli allegati caricati due volte. Niente lo impediva:
`receipt_token_hash` e unico ma si genera nuovo a ogni chiamata, quindi non
deduplica nulla. Il contrasto era gia dentro il prodotto — l'appuntamento una
chiave di idempotenza ce l'ha, e la stessa prova sul doppio clic la supera.

Il costo non e teorico: due domande identiche in coda per la stessa persona, che
qualcuno deve leggere e scartare a mano — e ADR-0040 dice che i duplicati si
**mostrano** e non si risolvono da soli, quindi restano li.

**La chiave** (`buildSubmissionDedupKey`, in `src/lib/forms/enrollment-receipt.ts`,
modulo puro) e deterministica su modulo, versione, chi compila, **il contenuto**
e gli allegati per nome e dimensione, dentro una finestra di dieci minuti.

Perche c'e una finestra: senza, la stessa famiglia non potrebbe piu reinviare
quel modulo con quelle risposte mai piu, nemmeno l'anno dopo. La finestra dice
cosa si sta davvero difendendo — non l'unicita della domanda, ma il **gesto
ripetuto**.

Perche il tempo sta **nella chiave** e non in un controllo applicativo: con due
richieste concorrenti un controllo in memoria non regge, leggono entrambe «non
c'e» e scrivono entrambe. Il codice fa comunque una lettura preventiva, ma
soltanto per non far pagare al caso frequente il caricamento inutile degli
allegati; a decidere e l'indice. Il prezzo e il bordo: due invii a cavallo di un
intervallo cadono in due chiavi diverse e passano entrambi — un caso raro che
sbaglia **verso il permettere**, che e il verso giusto, perche una domanda in
piu si scarta e una domanda persa no.

**Chi perde la corsa porta via i propri allegati** (`scartaAllegati`): lasciarli
vorrebbe dire che ogni doppio clic deposita per sempre una copia di un
certificato medico che nessuna pratica cita piu.

**Le righe gia in archivio restano con la chiave nulla**, e in PostgreSQL due
`NULL` non collidono: una domanda inviata prima di oggi non e mai stata protetta
e non lo diventa retroattivamente.

**Cosa riceve il secondo invio**: la stessa `submissionId`, lo stesso messaggio
di successo, e `receiptReference` **vuoto**. Non e una dimenticanza: in archivio
del riferimento vive solo l'impronta (ADR-0085), quindi il valore in chiaro del
primo invio non e piu leggibile da nessuno — nemmeno da li. Fabbricarne un
secondo darebbe due credenziali a una pratica sola; derivarlo dalla chiave lo
renderebbe ricalcolabile da chiunque conosca le risposte. Il riferimento vuoto e
gia una forma prevista dal tipo: escono cosi le compilazioni della segreteria.

---

# Wave 6 — quattro migrazioni, e una colonna in meno (2026-09-01)

Cinque file sotto `prisma/migrations/20260901*` portano la sesta wave. Tre
aggiungono, una toglie, una non tocca lo schema affatto: corregge dei dati.
Vale la pena leggerle in quest'ordine, perche l'ordine dice cosa dipende da
cosa.

## `20260901160000_wave6_stato_atleta` — una migrazione che non cambia lo schema

`athletes.status` e una colonna `text` senza vincolo, e un'azione di massa della
pagina Atleti ci scriveva il nome dell'**azione** (`activate`) invece del nome
dello **stato** (`active`). Da quel momento l'atleta spariva da ogni filtro,
«Attivi» compreso: nessun confronto poteva riconoscere quel valore.

La migrazione riporta le grafie note ai quattro stati canonici — `active`,
`suspended`, `loan`, `inactive` — e **cio che resta fuori dai quattro insiemi
torna ad `active`**, che e la scelta piu discutibile del file ed e dichiarata
nel suo commento: un atleta invisibile nel proprio club per colpa di una stringa
che nessuno riconosce e il difetto, non la protezione. La stessa correzione
tocca la copia dentro `athletes.data.status`, che alcune schermate leggono come
ripiego: due copie che dicono cose diverse sono la premessa del prossimo
difetto.

Non e reversibile, e va bene: si sta annullando un valore che non e mai stato
uno stato valido, e la sua forma originale non porta informazione.

**Il difetto e sopravvissuto dentro la propria correzione.** L'elenco delle
grafie che il filtro cerca e scritto in minuscolo, e `text IN (...)` su
PostgreSQL confronta lettera per lettera: un atleta scritto `Attivo` continuava
a non comparire in nessun filtro. Lo ha trovato una sonda di runtime, non un
test — misurato sul database di sviluppo, le stesse due grafie danno 0 righe con
il confronto sensibile e 224 con quello insensibile — ed e chiuso in
`buildWhereFromSearchParams` con `mode: "insensitive"`. Chi scrive una query su
una colonna di testo popolata da versioni diverse del prodotto dovrebbe
assumere che le grafie siano miste, perche lo sono.

## `20260901170000_wave6_slot_senza_capienza` — la colonna che si toglie

`appointment_slots.capacity` prometteva di poter ricevere piu persone nello
stesso istante, e il calcolo della disponibilita ci credeva: proponeva
`capacity - presi` posti. Ma il presidio che impedisce davvero la doppia
prenotazione e l'indice unico parziale `appointments_slot_vivo_unico`
([ADR-0101](18-decision-log.md#adr-0101--lappuntamento-e-un-dominio-con-un-proprietario-e-la-doppia-prenotazione-la-impedisce-il-database)),
che sta su `(organization_id, assigned_to_user_id, starts_at)` per i soli stati
vivi e **non conosce la capienza**. Con `capacity = 2` il prodotto offriva due
prenotazioni sullo stesso orario e la seconda, legittima, riceveva un P2002
tradotto in «quell'orario e appena stato preso»: una frase falsa, detta a chi
aveva appena visto il posto libero.

Delle due strade si e presa quella che toglie. Rendere vera la capienza avrebbe
richiesto di toccare il presidio piu delicato del dominio per abilitare una
funzione che **nessuna schermata sapeva chiedere**: nessuna UI ha mai scritto
quella colonna, quindi in archivio ogni riga porta il default `1`. Con 1 i due
comportamenti coincidono, e la rimozione non cambia nessun risultato
osservabile. E la ragione per cui e sicura, ed e anche la ragione per cui la
colonna non serviva.

Non e reversibile, ed e dichiarato: ripristinarla significherebbe ripristinare
il default, cioe l'unico valore che ha mai avuto.

> La riga di ADR-0101 che elenca fra i campi di `AppointmentSlot` anche la
> «capienza» descrive lo schema fino al 1 settembre 2026. Da questa migrazione
> in poi quel campo non esiste, e la stessa correzione vale per la tabella dei
> modelli del §«Fascicolo documentale e appuntamenti (Wave 5)» qui sopra.

## `20260901180000_wave6_accesso_atleta` — `athlete_account_invites`

Il ruolo `athlete` era modellato da capo a fondo — un ruolo canonico, un'area,
una guardia di percorso, un redirect, una sessione che lo riconosce leggendo
`athletes.user_id` — e **nessun percorso scriveva quella colonna**.
`unlinkDirectAthleteProfile` la slegava; niente la legava mai. La colonna
esiste dal principio: questa migrazione non aggiunge il legame, aggiunge il
**ciclo di vita** che lo produce e che lo toglie lasciando traccia.

| Colonna | Perche c'e |
|---------|-----------|
| `token_hash` | Lo SHA-256 del token consegnato via email, **mai** il token ([ADR-0085](18-decision-log.md#adr-0085--il-link-di-pagamento-e-un-token-opaco-in-archivio-non-un-token-firmato-senza-stato)). Il valore in chiaro vive il tempo di comporre il messaggio e poi non esiste piu, ne in archivio ne nei log. Unico: un token individua **un** invito, e il riscatto cerca per impronta e non per atleta — chi ha il token non deve poter dire di quale atleta sia |
| `user_id` | L'utenza destinataria, risolta o creata al momento dell'invito. **Non era nel piano**, ed e stata aggiunta: senza, l'accettazione dovrebbe ritrovare l'utenza dall'indirizzo, e fra l'invio e il clic quell'indirizzo puo essere cambiato o rioccupato. Il token finirebbe per legare l'atleta a un'utenza diversa da quella invitata. `ON DELETE SET NULL`, non `CASCADE`: cancellare un'utenza non deve far sparire la traccia di un invito che e stato mandato |
| `status` | `sent`, `accepted`, `revoked`, `expired` |
| `expires_at`, `sent_at`, `accepted_at`, `revoked_at` | La storia di chi ha invitato chi, e quando: e cio che la scheda atleta deve saper mostrare |

**Un solo invito vivo per atleta, e lo garantisce il database.**
`athlete_account_invites_vivo_unico` e unico e **parziale** su
`(organization_id, athlete_id)` per il solo stato `sent`. E la stessa forma di
`appointments_slot_vivo_unico` e la stessa regola di
[ADR-0095](18-decision-log.md#adr-0095--lidempotenza-vale-sulle-righe-vive-non-su-quelle-stornate):
il vincolo vale sulle righe vive, non su quelle morte. Un invito revocato,
scaduto o accettato libera il posto **senza essere cancellato**, cosi la storia
resta leggibile. Un reinvio revoca il precedente e ne crea uno nuovo: se lo
facesse solo il codice, due segretarie che premono insieme produrrebbero due
token validi per la stessa persona, e revocarne uno lascerebbe l'altro in giro.

## `20260901190000_wave6_ruoli_personalizzati` — tre tabelle e una colonna

Migrazione **additiva**: zero righe in queste tabelle e una colonna nulla
riproducono esattamente il comportamento precedente. Nessun backfill, nessuna
riscrittura di `organization_users.role`.

| Modello | Tabella | Note |
|---------|---------|------|
| `ClubRole` | `club_roles` | Il ruolo che un club si scrive da solo. `slug` e **prefissato e autodescrittivo** — `custom:collaborator:segreteria` — perche `organization_users.role` e testo libero: il prefisso rende impossibile la collisione con un canonico, e la base dentro il nome fa si che ogni lettore gia scritto sappia rispondere «al massimo quanto il ruolo base» anche prima di aver letto una riga di questa tabella. Unique `(organization_id, slug)`. `base_role` e **immutabile** dopo la creazione: cambiarlo sposterebbe il tetto sotto i piedi delle assegnazioni gia in essere, e la stessa persona si troverebbe con permessi diversi senza che nessuno abbia toccato la sua tessera |
| `ClubRolePermission` | `club_role_permissions` | Una riga per chiave concessa, e **nessun diniego esplicito**: l'assenza e il diniego, come nel catalogo. Una colonna `granted boolean` avrebbe prodotto tre stati — concesso, negato, non detto — e il terzo si sarebbe comportato come uno dei primi due a seconda di chi leggeva. Unique `(role_id, permission_key)` |
| `ClubAccessScope` | `club_access_scopes` | Il perimetro di **un'assegnazione**, non di un ruolo: `scope_kind` vale `site` o `category`. **Zero righe significano tutto il club**, ed e la scelta che rende additiva anche questa meta — la forma opposta, dover elencare le sedi di ogni tessera esistente, avrebbe spento l'accesso a tutti la notte del rilascio. Il «gruppo» non e un `scope_kind` perche non e un'entita: e la coppia (categoria, sede), e darglielo come perimetro significherebbe crearne una ([ADR-0055](18-decision-log.md)) |

`organization_users` acquista `custom_role_id`. Quando e valorizzata, `role`
porta lo **slug**, e le due colonne si scrivono **insieme e da una strada sola**
(`src/lib/server/club-roles.ts`): una riga con lo slug e senza il riferimento e
incoerente, e la sessione la **scarta** — altrimenti la persona otterrebbe il
ruolo base senza il restringimento, che e la scalata piu economica che questo
meccanismo permetterebbe. Scarta anche una riga il cui `custom_role_id` punta a
un ruolo di un altro club, disattivato, scomparso, o il cui slug non corrisponde
piu a `role`.

**Il vincolo e `ON DELETE RESTRICT`, e non e una svista.** Cancellare un ruolo
mentre qualcuno lo porta non deve cancellargli la tessera, cioe toglierlo dal
club in silenzio: il dominio revoca prima le assegnazioni, con una riga di audit
per ciascuna, e solo allora il ruolo si puo eliminare. E la stessa scelta della
Wave 4 sulle cancellazioni che distruggevano.

## `20260901200000_wave6_causale_in_uscita` — le tre colonne, e la vista rifatta

Prima di questa migrazione le due strade con cui il denaro esce da un club — il
compenso del lavoro sportivo e la liquidazione di un bando — uscivano dal
registro **senza causale**: la vista proiettava `NULL` e `'unspecified'`
**scritti nel SQL**, perche il percorso di scrittura un campo per dirlo non ce
l'aveva. Su una stagione vera erano 7.000 euro su 7.210 del non classificato: il
buco non era un residuo di data entry, era strutturale. La Wave 4 lo ha reso
**misurabile** — il rendiconto dichiara la quota in denaro invece che in righe —
senza chiuderlo.

`sport_work_outbound_transactions` e `funding_settlements` acquistano le stesse
tre colonne che `payment_transactions` ha gia:

- `operation_type_code` — la causale;
- `operation_type_label_snapshot` — la sua etichetta **congelata**;
- `activity_scope_snapshot` — l'ambito **congelato**, default `unspecified`.

Lo scatto serve perche la causale e configurazione mutabile: senza congelarla,
un club che la corregge cambierebbe **retroattivamente** la natura di cio che ha
gia registrato, e un rendiconto stampato a marzo direbbe una cosa diversa
ristampato a maggio. Su `sport_work_outbound_transactions` la colonna
`f24_causale` sta gia accanto e **non e questa cosa**: quella e la causale del
modello F24, cioe un adempimento;
[ADR-0093](18-decision-log.md#adr-0093--la-prima-nota-e-una-vista-non-una-tabella)
tiene distinte le due, e la colonna nuova sta dalla parte gestionale.

Due indici `(organization_id, operation_type_code)` servono al rendiconto, che
raggruppa per causale su un intervallo di date: senza, la lettura per voce
diventa una scansione su tutto lo storico delle uscite.

La migrazione e additiva, e **le righe esistenti restano non classificate**. E
corretto che sia cosi: inventare una causale per un movimento che nessuno ha
classificato vorrebbe dire scrivere una scelta contabile al posto del club.

### Cosa e cambiato dentro `accounting_ledger_lines`

Un `CREATE OR REPLACE VIEW` conserva nome, colonne, tipi e ordine: cambiano le
espressioni di tre colonne su due rami. Ma la ricreazione ha portato con se
altre tre correzioni, e conviene conoscerle perche toccano numeri gia stampati:

1. **un documento annullato non presta il suo numero.** Il ramo dei movimenti
   propri univa `invoices` e `receipts` senza filtrare `cancelled_at`, a
   differenza del ramo degli incassi che lo filtra da sempre: un movimento
   manuale che citava una ricevuta annullata ne stampava il numero in prima
   nota, come se il documento fosse ancora valido;
2. **il verso di uno storno lo dice il suo importo**, non il fatto di essere uno
   storno. Il `CASE` guardava solo `reverses_transaction_id`, e lo storno di un
   **rimborso** — che e una riga positiva — usciva come uscita: il registro
   raccontava sessanta euro usciti per trenta rientrati;
3. **un incasso di sponsorizzazione non e la quota di una famiglia.** Tutti gli
   incassi uscivano come `ATHLETE_PAYMENT`, quindi le sponsorizzazioni
   comparivano come «Incasso quota» con controparte «Sponsor», e il filtro
   «Incasso sponsor» che l'interfaccia offriva non poteva **mai** restituire
   niente: quel valore non era prodotto da nessuna riga. L'origine la dice
   adesso la controparte congelata sulla riga.

Sul ramo del lavoro sportivo resta la regola gia scritta in Wave 4: il verso lo
decide il **segno** del netto, non un valore assoluto con `OUT` forzato — il
saldo del conto somma `net_amount` con il suo segno, e le due letture
divergerebbero del doppio dell'importo su ogni riga con netto negativo.

L'ordine dei `COALESCE` non e cosmetico: **prima lo scatto sulla riga**, poi cio
che la causale dice adesso. Invertirlo farebbe cambiare natura al passato ogni
volta che un club rinomina una classificazione.

> **La vista e il gemello SQL della proiezione TypeScript**
> (`src/lib/accounting/projection.ts`), e le due devono dire la stessa cosa. Due
> letture dello stesso denaro che non concordano sono il difetto peggiore che
> questo dominio possa avere: il registro mostrerebbe un totale e l'elenco un
> altro, senza che nessuno sappia quale credere. Chi tocca una delle due tocca
> l'altra nello stesso commit — e la Wave 6 lo ha fatto, aggiungendo le tre
> colonne a `projectSportWorkPayouts` e `projectFundingSettlements`.

## Il seme delle causali completa, non popola soltanto

Fuori dalle migrazioni ma della stessa lane, perche senza questo la migrazione
sopra non si vedrebbe: `listOperationTypes` seminava il catalogo di sistema solo
quando il club **non aveva nessuna riga**. Bastava una riga perche il seme non
girasse piu, e ha funzionato finche il catalogo di sistema non e cambiato.

Con quella condizione un club gia configurato — cioe ogni club vero — non
avrebbe visto mai le causali nuove, e avrebbe continuato a non poter
classificare un compenso. Invisibile in sviluppo, dove i club nascono vuoti;
universale in produzione. Adesso si scrivono **solo le mancanti**, per codice:
cio che il club ha configurato non si tocca, e una causale di sistema
disattivata resta disattivata, perche la riga c'e e `skipDuplicates` la salta.

E una classe di difetto che vale oltre questo caso: **un seme condizionato alla
tabella vuota e un seme che smette di funzionare al primo dato**, e il giorno in
cui il vocabolario di sistema si allunga nessuno se ne accorge.
