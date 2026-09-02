# WAVE 6 — HANDOFF FOR FINAL REVIEW

> Documento **autosufficiente**. Chi riprende non deve ricostruire la storia
> delle revisioni precedenti: qui c'e lo stato, cosa e stato fatto, cosa resta
> aperto e cosa va rieseguito.
>
> Data: **2026-09-02**.

---

## 1. Stato del repository

| | |
|---|---|
| Branch | `integration/web-v1` |
| HEAD | `2641ed7ed0a3d6a46420de25ddccd3710bca9eb5` |
| Messaggio | `fix(wave-6): i due nomi della stessa tabella, e la porta contenitore` |
| Working tree | **pulito** (`git status --short` non stampa nulla) |
| Commit della Wave 6 | 33, da `843cc13` (`docs(wave-6): il piano…`) a HEAD |
| Branch principale | `main` — la Wave 6 **non** e stata unita |

Ultimi sei commit:

```
2641ed7 fix(wave-6): i due nomi della stessa tabella, e la porta contenitore
eb2a56f docs(wave-6): il 409, il beneficiario che deve essere del club, e dove sta davvero la difesa sull'IBAN
0432b4f fix(wave-6): il beneficiario di un altro club, il maturato di un altro bando, e il presidio sui log che si aggirava
dfba50a fix(wave-6): le quattro porte che non chiedevano il perimetro, e l'IBAN in lettura
28f91d6 fix(wave-6): il denaro che usciva due volte, e le due chiavi del legame di famiglia
d672285 fix(wave-6): l'ottava revisione, il ramo che scavalcava, e la regola che negava troppo
```

---

## 2. Gate — tutti verdi su HEAD

| Gate | Comando | Esito |
|------|---------|-------|
| Test | `npm test` | **4.543 / 4.543** |
| Tipi | `npm run typecheck` | pulito, nessun output |
| Lint | `npm run lint` | **0 errori**, 36 warning (invariati: sono tutti `@next/next/no-img-element`) |
| Build | `npm run build` | completa |
| UAT | `npm run wave6:uat` | **78 / 78** |
| Ruoli | `npm run wave6:roles` | **52 / 52** |
| Sicurezza / multi-tenant | `npm run wave6:security` | **249 / 249** |

Le tre sonde girano contro il **database di sviluppo vero** e non stanno in
`npm test`: un archivio vuoto non le puo eseguire. Sono il gate che conta per
tutto cio che riguarda perimetri, ruoli e isolamento fra club, perche
`createFakePrisma` — il doppio usato nei test unitari — **non sa valutare i
filtri di relazione**.

`npm run wave6:perf` esiste ma **misura**, non verifica: il suo esito non e un
gate.

---

## 3. Database e migrazioni

| | |
|---|---|
| Locale | Docker `easygame-dev-db`, porta **5434** (`docker compose -f docker-compose.dev.yml up -d`) |
| Migrazioni in `prisma/migrations/` | **53** |
| Ultima | `20260901210000_wave6_liquidazione_e_una_entrata` |
| `npx prisma migrate status` | *53 migrations found · Database schema is up to date!* |
| Migrazioni pendenti | **nessuna** |
| Migrazioni nuove in questa sessione | **nessuna** — tutte le correzioni sono applicative |

`scripts/db-guard.mjs` blocca gli script npm di scrittura se
`EASYGAME_DB_ENV` non vale `development`. **La guardia copre solo gli script
npm**: un `npx prisma db push` a mano la aggira.

Il database di sviluppo e stato usato dalle sonde e dai revisori. Una pulizia
di un revisore ha rimosso anche **110 utenze `@example.invalid` preesistenti**:
erano sintetiche, ma se una fixture le dava per esistenti va rieseguito il
seed.

---

## 4. Variabili d'ambiente

`.env.example` dichiara **30** variabili. Per far girare test, sonde e build in
locale servono:

```
DATABASE_URL   DIRECT_URL   EASYGAME_DB_ENV="development"
```

Le altre riguardano integrazioni (SMTP, Twilio, Google, Microsoft, Stripe),
amministrazione di piattaforma, limiti di frequenza e manutenzione:

```
SEED_DEMO_PASSWORD NEXT_PUBLIC_APP_URL AUTH_BASE_URL
NEXT_PUBLIC_EASYGAME_PLATFORM_ADMIN_EMAILS EASYGAME_PLATFORM_ADMIN_EMAILS
CRON_SECRET EASYGAME_MAINTENANCE_TOKEN AUDIT_LOG_RETENTION_DAYS
AUTH_ALLOW_TEST_CODES AUTH_RATE_LIMIT_SECRET AUTH_RATE_LIMIT_TRUSTED_PROXIES
SMTP_CREDENTIALS_SECRET TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN
TWILIO_VERIFY_SERVICE_SID GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET
MICROSOFT_CLIENT_ID MICROSOFT_CLIENT_SECRET MICROSOFT_TENANT_ID
STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET STRIPE_BILLING_WEBHOOK_SECRET
PAYMENT_MODE PLATFORM_FEE_PERCENT EASYGAME_TRUSTED_MEDIA_HOSTS
STRIPE_HTTP_TIMEOUT_MS
```

Nessuna variabile nuova e stata introdotta.

---

## 5. Staging

| | |
|---|---|
| Progetto Vercel | `mefrancesco2007-5434s-projects/easygame-staging` |
| Ultimo deploy | **2 giorni fa**, `● Ready` — `https://easygame-staging-a74xnrekh-mefrancesco2007-5434s-projects.vercel.app` |
| Deploy di HEAD | **NON eseguito** |
| Produzione | **non esiste** un progetto production nello scope. Se ne compare uno: fermarsi e chiedere |

Lo staging e **indietro rispetto a HEAD di 33 commit di Wave 6**: non riflette
nessuna delle correzioni qui sotto. Ogni deploy esegue `prisma migrate deploy`.

---

## 6. Cosa ha implementato la Wave 6

Piano in [`41-wave-6-planning.md`](knowledge-base/41-wave-6-planning.md).
DAG a sei onde: 6A → 6B → {6C1 ‖ 6D ‖ 6F ‖ 6H} → {6C2 ‖ 6E ‖ 6I} → 6G → 6J.

| Lane | Contenuto | Esito |
|------|-----------|-------|
| 6A | Difetti dimostrati: filtro stato, avatar, conferme, segreteria, strutture, sidebar | Fatta |
| 6B | Il catalogo dei permessi diventa vero (W5-D01) | Fatta |
| 6C1 | Perimetro allenatore, «I miei compensi», tre incoerenze | Fatta |
| 6C2 | Account atleta e Athlete Dashboard V1 | Fatta |
| 6D | Area famiglia: multi-figlio, multi-categoria, stagione, pagamenti, ricevute, certificato | Fatta |
| 6E | Le tre aree documentali e la coda del club | Fatta |
| 6F | Moduli e iscrizione online | Fatta |
| 6G | Ruoli personalizzati, access management, UI di audit | Fatta |
| 6H | Appuntamenti: UI degli slot, segreteria completa, `capacity` rimossa | Fatta |
| 6I | Consensi prima dell'invio, export e cancellazione, identificativo di richiesta, log | Fatta |
| 6J | W4-R7, OCR, registro API, KB, tre sonde di runtime | Fatta |

Undici lane su undici chiuse. Dopo la chiusura delle lane sono seguite
**undici tornate di rimedio** guidate da revisioni ostili indipendenti; le
ultime tre sono i commit elencati al §1.

---

## 7. Gli ultimi 4 HIGH + 1 MEDIUM (revisione di conferma) e le correzioni

Tutti e cinque erano la **stessa classe**: una regola giusta applicata a **un
nome solo**, quando i nomi che raggiungono la stessa riga sono due. Nessuno era
una regola sbagliata.

### F1 — CRITICAL/HIGH · `training_attendance` scavalcava il proprietario di dominio

`training_attendance` e `club_event_participants` sono **due nomi di risorsa
sullo stesso delegato Prisma**. `DOMAIN_OWNED_MODEL_RESOURCES` ne nominava uno.

```
PATCH /api/v1/club_event_participants/<id>  ->  403  «si scrive dal suo dominio»
PATCH /api/v1/training_attendance/<id>      ->  200
```

Una sola chiamata scriveva le tre colonne che ADR-0086 e ADR-0099 assegnano a
tre scrittori distinti: presenza, risposta della famiglia (senza
`rsvp_by_user_id`, quindi non attribuibile) e convocazione. La presenza e la
colonna su cui `funding/attendance-measure.ts` rendiconta i **contributi
pubblici**.

**Correzione.** Nuovo modulo `src/lib/resource-aliases.ts`: dichiara i sei
alias e il loro nome canonico. Le tre guardie del registro confrontano il nome
canonico. `training_attendance` esce da `TRAINER_WRITE_RESOURCES` e resta in
lettura: l'allenatore prende l'appello dalla sua rotta di dominio.

### F2 — HIGH · Il gruppo dell'allenatore era un filtro di elenco

`filterTrainerDashboardRecords` girava solo dentro `listResourcePage`;
`getResourceById` non la chiamava. Misurati **613 byte** con tutori, codice
fiscale, data di nascita e codice di accesso di un minore di un'altra squadra.
E l'identificativo non era un segreto: `athlete_category_memberships` serviva
per prima la mappa completa `atleta -> sede/categoria`.

**Correzione.** `getResourceById` fa passare la riga dallo **stesso** filtro
dell'elenco (non un secondo giudizio) e `athlete_category_memberships` entra
in `TRAINER_DASHBOARD_FILTERED_RESOURCES`.

### F3 — HIGH · `club_resource_items` serviva le schede senza proiezione

Le schede di club vivono tutte in quella tabella, servita in due modi: per nome
(`/api/v1/trainers`, `kind: "club_resource"`) e per contenitore
(`/api/v1/club_resource_items`, `kind: "model"`). La proiezione stava solo nel
primo ramo.

| Attore | `GET /api/v1/trainers` | `GET /api/v1/club_resource_items` |
|--------|------------------------|-----------------------------------|
| allenatore | senza IBAN, CF, gettone | **IBAN, CF e gettone in chiaro** |
| ruolo di club a **zero chiavi** | senza IBAN, CF, gettone | **IBAN, CF e gettone in chiaro** |

Il gettone in chiaro si riscatta su `POST /api/v1/auth/access/redeem`.

**Correzione.** `serializeRecord` risolve il **tipo della riga** e proietta come
se la risorsa fosse stata chiesta per nome.

### F4 — HIGH · `club_resource_items` era la porta aperta anche in scrittura

`POST /api/v1/discounts` risponde 403 a un ruolo a zero chiavi;
`POST /api/v1/club_resource_items` con `{resource_type: "discounts"}` creava,
modificava e cancellava la stessa riga. In lettura il mazzo si restringeva ai
soli tipi **riservati alla direzione**, non a quelli governati da una chiave.

**Correzione.** Il `where` si restringe a cio che il ruolo puo davvero leggere
(`canAccessClubResource(..., "read")`); nuova `assertPuoScrivereIlTipoDellaRiga`
chiamata su create, update e delete con il verbo giusto.

### F5 — MEDIUM · Il perimetro non copriva le partecipazioni

Un ruolo recintato sulla sede Nord leggeva le righe dell'atleta della sede Sud —
`status`, convocazione e `notes` in testo libero su un ragazzo — mentre la rotta
di dominio sullo stesso dato negava.

**Correzione.** `buildAccessScopeFilter` copre `club_event_participants`. La
funzione diventa **asincrona**: `athlete_id` non ha una relazione, quindi il
filtro chiede l'insieme degli identificativi a `athleteIdsWithinAccessScope`.

### Prova e non vacuita

`U-68` in `scripts/wave-6-security-probe.mjs` misura tutte e cinque **dalla
rotta o dalla funzione che la rotta chiama**, con la controprova positiva
accanto a ognuna. Non vacuita verificata reintroducendo i difetti insieme:
cinque prove rosse, controprove positive verdi. Il controllo sulla mappa delle
appartenenze e stato verificato con una mutazione a se.

Presidio strutturale nuovo: `tests/lib/alias-di-risorsa.test.mjs` verifica che
la mappa degli alias copra **tutti** i delegati condivisi di `RESOURCE_CONFIG`.
Un settimo alias non dichiarato fa fallire la prova invece di aprire una porta.

### Contratto che cambia

L'allenatore **non scrive piu** la partecipazione dal registro generico
(`training_attendance`): la scrive dalla sua rotta di dominio. Due prove che
fissavano la forma precedente sono aggiornate con il motivo.

---

## 8. Critical / High conosciuti ancora APERTI

> **Questa e la sezione piu importante dell'handoff.**
>
> In parallelo alla revisione che ha prodotto F1–F5, una **seconda** revisione
> ostile indipendente ha coperto denaro, documenti, eventi e sessioni. Ha
> confermato F1 per conto suo, e ha riportato **altri sei High e otto Medium**
> che **NON sono stati corretti**: l'utente ha esplicitamente limitato questa
> sessione a F1–F5.
>
> Tutto cio che segue e **riportato dal revisore**, con la sua riproduzione.
> **Nessuno di questi e stato verificato da me in modo indipendente**: la prima
> cosa da fare nella revisione finale e riprodurli, perche un revisore puo
> sbagliare — in questa sessione due segnalazioni Medium si sono rivelate
> inesistenti alla misura.

### HIGH aperti

| # | Titolo | File | Cosa e stato misurato |
|---|--------|------|------------------------|
| **B-H1** | Il contatore dei tentativi OTP conta le raffiche, non i tentativi | `src/lib/server/auth-workflows.ts:308-325` (`verifyInternalChallenge`) | Read-modify-write fuori da transazione con valore **assoluto** invece di `increment`. Misurato: **300 codici** provati su una sola challenge contro un limite dichiarato di 5. Il codice e a 6 cifre e il successo **restituisce una sessione**: e presa di possesso dell'account. La challenge si fa emettere senza sessione da `POST /api/v1/auth/verify/email/send`. Correzione proposta: `updateMany({ where: { id, attempts: { lt: MAX } }, data: { attempts: { increment: 1 } } })`, `count === 0` = esaurita |
| **B-H2** | Il contatore di frequenza si azzera in parallelo | `src/lib/server/auth-rate-limit.ts:78-100` | Il ramo *increment* e corretto; il ramo di creazione/riapertura fa `upsert` con `update: { count: 1 }`. Misurato: **20–33 ammessi** contro un limite di 5, sia a freddo sia a finestra scaduta, e la finestra si riapre a **ogni** scadenza. Tocca login, invio e conferma OTP, riscatto gettone, moduli pubblici, link di pagamento. Correzione proposta: un solo `INSERT … ON CONFLICT DO UPDATE SET count = CASE WHEN expires_at <= now() THEN 1 ELSE count + 1 END … RETURNING count` |
| **B-H3** | Il registro generico riscrive l'importo di una rata senza lock ne ricalcolo | `src/lib/server/resources.ts` (`guardLedgerOwnedPaymentState`, guarda solo `status`) contro `src/app/api/athlete-payments/[paymentId]/route.ts` | Misurato: rata `paid` con `amount` portato da 130 a 500 dal registro; ledger ricalcolato `partial`, **residuo 370 €**, `overdue`. Lo stato salvato contraddice i propri importi (ADR-0067/0036). Correzione proposta: estendere la guardia ad `amount`/`due_date`/`athlete_id`, o instradare `payments` su `payment-transactions.ts` |
| **B-H4** | Due approvazioni simultanee della stessa iscrizione creano due schede | `src/lib/server/form-submissions.ts:1652-1656` e `:2002-2012` | Misurato: due `decideFormSubmission` in parallelo → `['OK','OK']`, **due schede** per lo stesso minore, con appartenenze, consensi e richieste documentali duplicate. Il modello di correzione e gia nel repository: `document-requests.ts:1148-1162` usa `updateMany({ where: { id, status: row.status } })` |
| **B-H5** | `reviewFormSubmission` non applica ne perimetro ne taglio clinico | `src/lib/server/form-submissions.ts:1035-1052` contro `:2120-2167` | **Verificato staticamente, non riprodotto.** La gemella `buildCompileContext` toglie il clinico e chiama `athleteWithinAccessScope`; questa no. Il `recordId` arriva dal corpo, il ramo `preview` non scrive e non lascia audit; uscirebbero nome, CF, data di nascita, tutori e — con un campo legato a `athlete.allergies` — il dato sanitario di un minore fuori perimetro |
| **B-H6** | Seconda porta alla prima nota: `sport_work.manage` scrive `accounting_entries` | `src/app/api/v1/sport-work/obligations/[id]/complete/route.ts:20` → `sport-work-agenda.ts:921-1009` | **Verificato staticamente, non riprodotto.** `createAccountingEntry` non contiene `assertAccountingPermission` (il permesso vive nell'involucro `accountingRoute`); qui lo scope e sintetizzato a mano e l'importo viene dal corpo. Un ruolo con `sport_work.manage` e senza `accounting.manage` scriverebbe prima nota |

### MEDIUM aperti (dal secondo revisore, non verificati)

`M-1` premi/rimborsi/fatture escono senza `financial_account_id`, quindi non
abbassano nessun conto · `M-2` `confirmAccrualPeriods` fuori da transazione ·
`M-3` `markAccrualsReported` riapre un periodo `settled` · `M-4`
`cancelInstallment` check-then-act senza lock · `M-5` `PATCH
/api/v1/accounting/entries/:id` scrive `site_id` non risolto · `M-6`
`applySubscriptionSnapshot` guardia d'ordine come check-then-act · `M-7` il
giroconto non ha idempotenza · `M-8` `reverseCompensationPayout` accetta
premi/rimborsi/fatture e non riapre il documento.

### LOW aperti (dal secondo revisore, non verificati)

`L-1` oracolo di esistenza cross-tenant su moduli e compilazioni · `L-2`
entitlement `forms_v2` aggirabile via `duplicate` + `publish` · `L-3`
`requestMissingDocuments` deduplica sulla stringa grezza · `L-4` l'elenco
documenti dell'area genitore ignora `visibleToParent` (titolo, descrizione e
`assetId`; i byte sono filtrati) · `L-5` `season_id` mai verificato in
scrittura · `L-6` `allowOverpayment` si accende dal corpo senza traccia · `L-7`
la convocazione non verifica che l'atleta sia del club (righe sporche, non una
fuga).

### Dove il secondo revisore non ha trovato nulla

Webhook di pagamento (firma Stripe, deduplica, ambiente) · link di pagamento e
ricevuta pubblici · appuntamenti (la doppia prenotazione e chiusa dall'indice
unico parziale `appointments_slot_vivo_unico`) · diritti dell'interessato ·
log · idempotenze dichiarate con indice · confine `activeOrganizationId` vs
`allowedOrganizationIds` nei moduli del denaro.

---

## 9. Debiti Medium/Low accettati e dichiarati

In [`16-technical-debt.md`](knowledge-base/16-technical-debt.md), voci della
Wave 6:

| | |
|---|---|
| **W6-D23** | I contatori di frequenza — **attenzione: B-H2 lo supera in gravita** |
| **W6-D24** | `/api/v1/registry` e pubblica |
| **W6-D25** | Il perimetro conferma l'esistenza di una riga: 403 contro 404 |
| **W6-D26** | `accessScopes` e un campo opzionale, e l'assenza e il valore piu permissivo |
| **W6-D27** | Il registro generico non e governato da chiavi dove una chiave non esiste |
| **W6-D28** | Un legame di famiglia verso un'utenza che nascera domani |
| **W6-D29** | `access_tokens.name` non ha un vincolo di unicita (la chiusura durevole e una **migrazione**) |

---

## 10. Blocker production ancora esistenti

1. **I sei High del §8** — nessuno corretto. `B-H1` e `B-H2` insieme sono un
   percorso di presa di possesso di un account: sono il blocker piu grave.
2. **W6-4 · Policy dei consensi** — il meccanismo esiste ed e configurazione,
   ma la **validazione legale** e un blocker esterno che nessuna lane chiude.
3. **W6-5 · Dato clinico per singolo operatore** — non chiuso, e la dipendenza
   dichiarata («dipende da W6-1») era una previsione che i fatti correggono. Un
   ruolo di club e un **sottoinsieme** del suo ruolo base e `clinical.read`
   appartiene a `GESTIONE`, dove `trainer` non c'e: restituire il clinico a un
   allenatore richiede una decisione diversa (allargare la chiave nel catalogo,
   o una concessione per persona che oggi non ha modello).
4. **Staging indietro di 33 commit** — nessuna verifica end-to-end su un
   ambiente vero delle correzioni delle ultime undici tornate.
5. **Deploy in produzione** — non esiste un progetto production nello scope
   Vercel, e comunque richiede autorizzazione esplicita.

---

## 11. Documenti KB e ADR rilevanti

| Documento | Perche |
|-----------|--------|
| [`CLAUDE.md`](../CLAUDE.md) | Proprietari di dominio, gate obbligatori, regole di sicurezza DB |
| [08 — Ruoli e permessi](knowledge-base/08-roles-and-permissions.md) | Ruoli personalizzati, perimetro, **la tabella delle superfici che non chiedevano il perimetro** |
| [14 — Sicurezza](knowledge-base/14-security.md) | IBAN, presidi, **«i nomi diversi che portano alla stessa riga»** |
| [16 — Debito tecnico](knowledge-base/16-technical-debt.md) | W6-D23 … W6-D29 |
| [20 — Work Package](knowledge-base/20-work-packages.md) | Stato delle lane e dei cinque blocker |
| [06 — Modello dati](knowledge-base/06-data-model.md) | Vincoli dei contributi, `FundingEnrollment`, `FundingSettlementLine` |
| [09 — Convenzioni API](knowledge-base/09-api-conventions.md) | Codici di stato, incluso il **409** |

ADR piu recenti: **0101** appuntamenti · **0102** ruoli di club · **0103**
perimetro · **0104** accesso atleta · **0105** cancellazione · **0106** causale
contabile · **0107** PDF/contenitore · **0108** colonna senza presidio.

Riferimenti citati nelle correzioni: **ADR-0086** e **ADR-0099** (tre colonne,
tre scrittori), **ADR-0098** (proiezione in sola lettura), **ADR-0037**
(contributo ≠ pagamento), **ADR-0067** e **ADR-0036** (lo stato di una rata si
ricava).

---

## 12. Comandi da rieseguire nella nuova sessione

```bash
docker compose -f docker-compose.dev.yml up -d
```

```bash
git -C E:/Download/easygame log --oneline -1 && git -C E:/Download/easygame status --short
```

```bash
npm ci && npx prisma generate
```

```bash
npx prisma migrate status
```

```bash
npm test
```

```bash
npm run typecheck && npm run lint && npm run build
```

```bash
npm run wave6:uat && npm run wave6:roles && npm run wave6:security
```

Attesi: HEAD `2641ed7`, tree pulito, 53 migrazioni e schema allineato, 4.543
test, 0 errori di lint, 78/78 · 52/52 · 249/249.

**Vietato** in questa fase: `npm run db:push`, `db:migrate`, `prisma:seed`,
qualunque `npx prisma` di scrittura, e ogni deploy. Vietato `git worktree`: in
questa sessione ha svuotato `node_modules` attraverso una junction Windows e ha
rotto l'ambiente (1872 test falliti, recuperati con `npm ci` +
`npx prisma generate`).

---

## 13. Perimetro esatto della FINAL REVIEW

**Obiettivo:** decidere se la Wave 6 e `DONE`. Il criterio e **Critical = 0 e
High = 0**.

**Dentro il perimetro:**

1. **Riprodurre i sei High del §8**, uno per uno, a runtime e dalla rotta.
   Cominciare da `B-H1` e `B-H2`: insieme sono un percorso di presa di
   possesso di un account. Per ognuno: riprodurre, correggere la causa radice,
   aggiungere una prova comportamentale nella sonda, verificare la non vacuita
   reintroducendo il difetto, ripristinare.
2. **Non dare per buona nessuna delle segnalazioni del §8**: sono di un
   revisore, non misurate da me. In questa sessione due Medium segnalati si
   sono rivelati **inesistenti** (la fattura P.IVA non consuma le franchigie;
   la «terza nozione di identita di famiglia» non c'e — guardia e predicato
   condividono `getGuardianRows`, e la corrispondenza per email pretende
   `email_verified_at`).
3. **Verificare i Medium del §8** e decidere quali possono diventare debito:
   la regola e che un Medium/Low diventa debito **solo se** non compromette
   sicurezza, privacy, isolamento fra club, integrita dei dati o funzioni
   necessarie alla produzione. `M-2`, `M-3` e `M-8` toccano il denaro; `M-1`
   tocca i saldi.
4. **Rieseguire tutti i gate del §2** dopo ogni tornata di correzioni.

**Fuori dal perimetro — non fare:**

- nuove capability o ampliamenti funzionali (siamo in closeout);
- redesign, design system, Wave 7;
- sviluppo Mobile (ADR-0025: differito; ammesse solo correzioni di sicurezza e
  adeguamenti a un cambio di contratto API deciso lato Web);
- migrazioni di schema, salvo autorizzazione esplicita (W6-D29 ne chiederebbe
  una);
- deploy su staging o produzione senza autorizzazione esplicita.

**Metodo che questa Wave ha imparato a sue spese**, e che conviene tenere:

- una guardia provata **solo** a negare genera il difetto opposto. Ogni
  correzione porta la sua **controprova positiva** nella stessa prova;
- si misura **dalla rotta**, non dalla funzione: quattro difetti gravi di
  questa Wave rispondevano correttamente alla chiamata diretta e sbagliato alla
  rotta, perche le rotte costruiscono lo scope a mano;
- un presidio che enumera **nomi** viene evaso da un nome nuovo. Dove si e
  potuto, la difesa e diventata strutturale (regola di lint per i log, mappa
  degli alias per le risorse);
- `npm test` non puo provare un perimetro: `createFakePrisma` non valuta i
  filtri di relazione. Le prove di perimetro vanno nelle **sonde**.
