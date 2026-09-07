# 07 — Autenticazione e sessioni

Codice di riferimento:
`src/lib/server/auth.ts`, `src/lib/server/auth-workflows.ts`,
`src/lib/server/auth-rate-limit.ts`, `src/lib/auth/*.ts`,
`src/app/api/v1/auth/**`.

## Modello di sessione

- **Sessioni opache server-side.** Nessun JWT. Il token e
  `${randomUUID()}-${randomBytes(16).hex}` salvato nella tabella `sessions`.
- Durata: **14 giorni** (`SESSION_DURATION_SECONDS = 60*60*24*14`).
- Trasporto: cookie `easygame_session` (`httpOnly`, `sameSite=lax`,
  `secure` solo in produzione, `path=/`) **oppure** header
  `Authorization: Bearer <token>` (usato dal mobile).
- `getSessionFromRequest` rilegge la sessione dal DB a **ogni** richiesta e
  cancella la riga se scaduta.
- La risposta ha forma «Supabase-like» (`access_token`, `refresh_token`,
  `expires_at`, `user.user_metadata`) per retrocompatibilita con l'adapter
  client. `refresh_token` **e uguale** ad `access_token`: non esiste un vero
  meccanismo di refresh.

## Password

`src/lib/auth/password-policy.ts`:

- minimo **12** caratteri, massimo 128;
- blacklist di password comuni;
- hashing **bcrypt, cost 10** (`bcryptjs`).

Sul login con email inesistente viene comunque eseguito un `bcrypt.compare`
contro un hash fittizio (`DUMMY_PASSWORD_HASH`) per **non rivelare** l'esistenza
dell'account tramite timing. Il messaggio d'errore e sempre
`Email o password non corretti` (`INVALID_CREDENTIALS_MESSAGE`).

## Endpoint auth

| Metodo | Path | Scopo |
|--------|------|-------|
| POST | `/api/v1/auth/login` | Login |
| POST | `/api/v1/auth/register` | Registrazione (con eventuale creazione club) |
| POST | `/api/v1/auth/logout` | Logout |
| GET | `/api/v1/auth/session` | Sessione corrente |
| GET/PATCH | `/api/v1/auth/user` | Profilo utente |
| GET | `/api/v1/auth/providers` | Capability auth + provider OAuth attivi |
| GET | `/api/v1/auth/memberships` | Club dell'account con ruoli |
| POST | `/api/v1/auth/memberships/activate` | Imposta club attivo, ritorna `redirectPath` |
| POST | `/api/v1/auth/memberships/delete` | Rimuove una membership |
| POST | `/api/v1/auth/access/redeem` | Collega l'account a un club via token condiviso |
| GET | `/api/v1/auth/athlete-profile/[athleteId]` | Profilo atleta collegato |
| POST | `/api/v1/auth/verify/email/send` · `/confirm` | OTP email |
| POST | `/api/v1/auth/verify/phone/send` · `/confirm` | OTP telefono |
| POST | `/api/v1/auth/password/forgot` | Richiesta reset password |
| POST | `/api/v1/auth/password/reset` | Imposta la nuova password |
| GET | `/api/v1/auth/oauth/[provider]/start` · `/callback` | OAuth |

## Flusso di login (stato reale, da PP-05)

```
POST /api/v1/auth/login { email, password }
  1. rate limit  IP (30 / 15 min)  +  identita (10 / 15 min)
  2. utente inesistente        → 401 "Email o password non corretti" (con bcrypt fittizio)
  3. password errata           → 401 "Email o password non corretti"
  4. telefono da verificare    → 403 PHONE_NOT_VERIFIED  (+ invio OTP, tre assi di rate limit)
  5. finalizeVerifiedSession   → crea sessione, imposta cookie, 200
```

**Il passaggio «email non verificata → 403» non esiste piu** (ADR-0132). Era il
punto 4 fino a PP-05, e su un'installazione senza SMTP era un blocco totale:
l'account si creava, non poteva entrare, e la schermata che gli chiedeva di
confermare l'indirizzo era irraggiungibile. Oggi l'indirizzo e **obbligatorio**
ma si verifica **dopo**, dalla pagina Account.

### L'unica cosa che blocca: `isPhoneVerificationBlocking`

```ts
isPhoneVerificationRequired() &&
  Boolean(user.phone_verification_required && user.phone) &&
  !user.phone_verified_at
```

Vive in `auth-workflows.ts` ed e **l'unica definizione** di «account non
pienamente attivato». L'unica limitazione che ne discende e che **non nasce una
sessione**: chi e gia dentro resta dentro. La condizione era scritta due volte
— nella rotta di login e in `finalizeVerifiedSession` — e poteva divergere.

`isPhoneVerificationRequired()` e falsa quando non esiste un trasporto SMS
**che consegni** e non ci sono i codici di prova: pretendere cio che non si puo
consegnare chiuderebbe fuori ogni account nuovo. Il ripiego e dichiarato, non
silenzioso: `/api/v1/auth/providers` restituisce `phoneVerificationRequired` e
la schermata di registrazione lo scrive sotto il campo.

### SMTP non e piu una dipendenza critica per entrare

`resolveEmailVerificationPolicy` restituisce ancora
`{ required: true, allowUnverifiedSession: false }`, ma `finalizeVerifiedSession`
**non lo usa piu per bloccare**. Senza SMTP un account si crea, entra, e vede
sulla pagina Account l'avviso «Email non verificata» con il pulsante che manda
il codice: il pulsante fallira finche SMTP non e configurato, e lo dira. Vedi
[12 — Integrazioni](12-integrations.md).

## Verifica email e telefono (OTP)

- Modello `AuthVerificationChallenge`: `code_hash`, `expires_at`, `attempts`,
  `consumed_at`, `channel` (`email` | `phone`), `purpose` (`signup`, `login`,
  `verify_email`, `verify_phone`, `reset_password`).
- **Una sola challenge viva per utente e canale**, e a farlo rispettare sono
  due **indici unici parziali** del database (migrazione
  `20260904120000_pp05_una_challenge_viva_per_canale`), non una promessa del
  codice: la sonda contro Postgres aveva misurato **dodici challenge vive** —
  dodici codici validi insieme, con cinque tentativi ciascuno — a fronte di
  dodici reinvii simultanei. Chi perde la corsa riceve un `P2002`, tradotto in
  «attendi prima di richiedere un altro codice», che e la risposta vera: un
  codice valido esiste gia ed e gia partito.
- Codice a **6 cifre uniformi su tutto l'intervallo**, zeri iniziali compresi.
  `randomInt(100000, 1_000_000)` — la forma di prima — non produceva mai un
  codice che comincia per zero: novecentomila valori invece di un milione.
- Scadenza: **5 minuti** il telefono, **15 minuti** l'email. Cooldown sul
  reinvio: **60 secondi**. Massimo **5 tentativi** per challenge
  (`MAX_OTP_ATTEMPTS`), consumati in una scrittura condizionata sola.
- **L'impronta e un HMAC con pepe, e lega canale, scopo, utente e
  destinatario.** Uno SHA-256 nudo di un codice a sei cifre non e un'impronta:
  un milione di valori, una tabella precalcolata, e chi legge `code_hash` legge
  il codice. Il pepe vive nell'ambiente (`AUTH_OTP_SECRET`) e non nel database.
  Il legame rende inutile spostare una riga: un `code_hash` copiato dalla
  challenge email di un account sulla challenge telefono di un altro non
  corrisponde piu a niente.
- **La challenge e legata al destinatario corrente**, e in **due** modi
  indipendenti. `verifyInternalChallenge` e `confirmPasswordReset` filtrano per
  `target` — l'indirizzo o il numero in forma canonica — e il destinatario e
  **anche** dentro l'impronta. Senza il filtro, un codice emesso per il proprio
  numero confermava il numero di un altro e l'azzeramento di
  `phone_verified_at` al cambio recapito era teatro; senza il legame
  nell'impronta bastava che **un solo chiamante** dimenticasse il filtro — ed e
  successo alla rotta di reset, dove e costato il Critical del quarto round
  della revisione ostile (ADR-0134 §8). Chi verifica passa il destinatario
  **corrente**, mai quello salvato sulla riga: leggerlo dalla riga renderebbe
  il legame vero per costruzione.

  La regola dietro: **un token dimostra il possesso del recapito a cui e stato
  consegnato, e di nessun altro.** Finche un indirizzo non poteva cambiare
  sotto un token vivo la differenza non si vedeva; da quando puo (ADR-0132),
  «legato all'account» ha smesso di significare «legato alla casella».
- **Uno sfratto spegne anche le challenge vive**, sue e di chiunque le tenesse
  gia in mano: una challenge viva e un canale di accesso come una sessione
  (ADR-0134 §7). Lo stesso fa un reset password su tutte le **altre**.
- **La scrittura di «verificato» e condizionata**: `updateMany` con il `where`
  sull'indirizzo o sul numero, non `update` per id. Fra l'emissione e la
  conferma il recapito puo cambiare da un'altra sessione.
- **Un codice apre una sessione solo se la porta era gia stata aperta**
  (ADR-0134): `challengePurposeCanMintSession` ammette solo `signup` e `login`.
  Un codice chiesto da `/verify/<canale>/send` ha scopo `verify_email` o
  `verify_phone`: conferma il recapito e restituisce `session: null`.
- **Chi si identifica alle rotte di verifica, e con che cosa.** Le quattro
  rotte `/verify/<canale>/send|confirm` prendono un campo `userId` che accetta
  **due** valori, e non sono equivalenti:
  - il **riferimento opaco** (`token_verification_id`, forma `verify_<48 esa>`)
    vale sempre, ed e cio che le risposte senza sessione emettono come
    `verification.userId` — registrazione, login con telefono non verificato,
    conferma che non apre una sessione. Se manca lo crea
    `ensureVerificationReference`;
  - l'**UUID nudo dell'account** vale **solo per chi ha gia una sessione su
    quel medesimo account**: e il caso della pagina Account, che manda
    `user.id` perche e l'unico identificativo che il client ha di se stesso, e
    dove non si rivela niente a chi non lo sappia gia.

  Il vincolo non e una formalita (ADR-0134 §6): senza, la rotazione del
  riferimento fatta dallo sfratto era teatro — l'UUID non cambia mai e
  l'occupante lo aveva gia — e chiunque avesse raccolto UUID utente, che
  circolano in molte proiezioni club-scoped, poteva pilotare quelle rotte su
  account altrui e distinguere un identificativo vero da uno inventato.
- `AUTH_ALLOW_TEST_CODES=true` espone il codice OTP nella risposta
  (`previewCode`) — **mai in produzione**.
  `shouldExposeVerificationPreviewCode` ammette **solo** `NODE_ENV` fra
  `development`, `test` e `local`, e con `NODE_ENV` **assente** chiede
  `EASYGAME_DB_ENV=development`. E un elenco di ammissione e non di negazione:
  la prima stesura negava `production`, `staging` e `preview` e lasciava
  passare `NODE_ENV=prod`, che non e nessuno dei tre. Una difesa che si apre
  quando una variabile manca — o quando ne compare una che nessuno aveva
  previsto — e scritta al contrario.

### Il numero di cellulare ha una forma sola

`src/lib/auth/phone-number.ts` (modulo puro) normalizza in **E.164**. Finche le
quattro forme in cui una persona scrive lo stesso numero restano quattro
stringhe diverse succedono quattro cose sbagliate insieme: il contatore per
numero conta quattro secchielli, la challenge legata al `target` non si
ritrova, il provider consegna a caso, e due account occupano lo stesso numero
senza che nessuno se ne accorga.

Conosce **una** regola nazionale, quella italiana (cellulari: `3` piu 8 o 9
cifre), e per ogni altro prefisso applica il solo vincolo E.164 dichiarando
`mobileChecked: false`. Lo zero interurbano italiano **non** si toglie:
toglierlo dava «troppo corto» al posto di «serve un cellulare», cioe il rifiuto
giusto con il motivo falso.

**Nelle risposte senza sessione il numero esce mascherato** (prefisso e ultime
tre cifre), sia in `verification.phone` sia in `user_metadata.phone`
(`serializeAuthUserWithoutSession`). Il ramo «indirizzo gia occupato» della
registrazione risponde identico a quello di un indirizzo libero, per non
rivelare l'occupazione: restituire il numero per intero avrebbe reso quel ramo
il modo piu comodo per farsi dire il cellulare di qualcun altro.

### Cambio recapito

Cambiare **email, cellulare o password** richiede la **password attuale**
(`CURRENT_PASSWORD_REQUIRED`, chiude il debito W4-R13). Con i recapiti
diventati un fattore, una sessione presa in prestito diventava altrimenti
proprieta definitiva del conto. Il tentativo ha un tetto (10 per account in un
quarto d'ora) e lascia una riga di audit: senza, la sessione rubata poteva
semplicemente indovinare la password.

Cambiare il recapito azzera la verifica corrispondente e obbliga a rifarla.

### Lo sfratto di un occupante (ADR-0134)

Un account registrato con l'indirizzo di un'altra persona e **il numero di chi
lo registra** era raggiungibile all'occupante anche dopo che la vittima aveva
dimostrato di possedere l'indirizzo. `sfrattaOccupante` azzera **tutti** i
canali insieme — password casuale, sessioni cancellate, `phone`,
`phone_verified_at` e `token_verification_id` azzerati, **e le righe di
`external_accounts` cancellate** — e vale nei due punti in cui quella prova
arriva: l'adozione da accesso esterno, e la conferma di un reset password su un
account mai verificato. Confermare un reset **verifica l'indirizzo**: il token e
stato consegnato a quella casella e consumato.

I legami esterni sono l'ultima voce arrivata nell'elenco, e la piu grave: un
`external_accounts` superstite riapre l'account al prossimo accesso
dell'occupante **senza passare da nessuna challenge**, perche
`findOrCreateOAuthUser` risolve per `provider_account_id` prima di ogni altra
cosa. Chi adotta l'account ricrea il proprio legame subito dopo, in
`upsertExternalAccount`; un legame che non si ricrea non era suo.

**Chi resta senza password dopo uno sfratto** — e chi non ne ha mai avuta una
perche accede solo con Google o Microsoft — trova nella pagina Account, accanto
agli avvisi di verifica, il pulsante **«Ricevi un link per impostarla»**, che
chiama `POST /auth/password/forgot` sul proprio indirizzo. Senza quel pulsante
`CURRENT_PASSWORD_REQUIRED` chiudeva a quelle due popolazioni email, numero e
password, cioe proprio il cellulare che il prodotto dichiara obbligatorio. Non
apre nessuna strada nuova: quel link chiunque puo chiederlo dalla pagina di
accesso, e la password si imposta **dalla casella**, non dalla sessione.

## Reset password

Implementato il 2026-08-22 ([ADR-0015](18-decision-log.md)). Diverso dagli OTP:
usa un **token lungo consegnato come link**, non un codice a 6 cifre.

```
POST /api/v1/auth/password/forgot { email }
  1. rate limit su email e IP (3 / 10 min per ciascuno)
  2. se SMTP non e configurato → 503 SMTP_CONFIGURATION_INVALID
  3. token casuale da 32 byte, salvato solo come hash SHA-256 in
     auth_verification_challenges (channel "email", purpose "reset_password")
  4. eventuali token di reset precedenti vengono consumati: ne resta uno solo
  5. email con link {AUTH_BASE_URL}/auth/reset-password?uid=...&token=...
  6. risposta SEMPRE identica, esista o no l'account

POST /api/v1/auth/password/reset { userId, token, password }
  1. rate limit su utente e IP (5 / 15 min)
  2. challenge cercata per user + channel + purpose, non consumata, non scaduta
  3. confronto degli hash con timingSafeEqual; tentativo errato incrementa
     attempts, oltre MAX_OTP_ATTEMPTS la challenge viene bruciata
  4. validazione con la policy password del progetto — DOPO il token, non prima
  5. in transazione: consuma la challenge, aggiorna password_hash,
     cancella TUTTE le sessioni dell'utente
```

L'ordine fra il passo 2 e il passo 4 e stato invertito nella decima tornata, e
non e un dettaglio di stile. La policy password veniva applicata subito dopo
aver trovato l'utente, e i suoi messaggi escono verbatim dalla rotta: una
password corta rispondeva «deve contenere almeno 12 caratteri» quando quell'`uid`
esisteva e «Link di reset non valido o scaduto» quando non esisteva — **senza
avere il token**. E `validatePassword` confronta anche con la parte locale
dell'indirizzo, quindi l'errore «una password che non contenga il nome
dell'email» confermava di aver indovinato l'indirizzo della vittima.

Dettagli che contano:

- **Nessuna enumerazione**: la risposta di `forgot` non cambia mai, nemmeno in
  caso di errore inatteso; non esiste un 404. Entrambi i rami passano dallo
  stesso costruttore di risposta, cosi la forma e identica: durante il test su
  staging del 2026-08-22 era emerso che l'account reale riceveva un campo
  `previewToken` in piu, ed e stato corretto.
- **Residuo noto sui tempi**: la risposta per un account esistente impiega ~2 s
  (handshake e invio SMTP), quella per un account inesistente e immediata. La
  differenza e osservabile. La mitiga il rate limit (3 richieste per email e
  3 per IP ogni 10 minuti), che rende impraticabile enumerare a volume.
  Eliminarla richiederebbe di inviare l'email in modo asincrono.
- **Token monouso**, TTL **30 minuti**.
- **Ogni sessione viene revocata** dopo il reset, su tutti i dispositivi.
- Se l'email non era verificata, il reset la marca come verificata: chi ha
  aperto il link ha dimostrato di controllare la casella.
- `verifyInternalChallenge` esclude esplicitamente `purpose: "reset_password"`,
  cosi una conferma OTP non puo consumare un reset in corso e viceversa.
- **Dipende da SMTP**: senza provider configurato l'endpoint risponde 503.

UI: `/auth/forgot-password` e `/auth/reset-password`, piu il link «Password
dimenticata?» nella schermata di login. Entrambe le pagine restano pubbliche
(il middleware non protegge `/auth`).

### Verificato end-to-end il 2026-08-22

Ciclo completo eseguito contro un **database reale** (ambiente di sviluppo),
22 verifiche tutte superate: token casuale da 32 byte salvato solo come hash
SHA-256, scadenza a 30 minuti, token errato rifiutato con incremento di
`attempts`, password debole rifiutata dalla policy, reset valido che cambia la
password e **revoca tutte le sessioni** (2 → 0), email marcata verificata,
riuso del token rifiutato, token scaduto rifiutato, una nuova richiesta che
invalida la precedente, e nessuna interferenza fra challenge di reset e OTP di
verifica email.

**Consegna SMTP verificata su staging**: la richiesta per un account reale ha
prodotto un evento di audit `auth.password_reset.requested` con
`{"delivered": true}`, che il codice imposta solo quando il provider SMTP
conferma l'invio. Il token generato dal test e stato invalidato subito dopo.

## Rate limiting

Persistente su DB (`auth_rate_limit_buckets`), non in memoria: funziona anche
con piu istanze serverless. Chiave = SHA-256 di
`AUTH_RATE_LIMIT_SECRET : scope : identita`.

| Policy | Limite | Finestra |
|--------|--------|----------|
| `loginIdentity` | 10 | 15 min |
| `loginIp` | 30 | 15 min |
| `registerIdentity` | 3 | 60 min |
| `registerIp` | 10 | 60 min |
| `otpSend` | 3 | 10 min |
| `otpConfirm` | 5 | 15 min |
| `otpSendAccount` | 5 | 60 min |
| `otpSendTarget` | 5 | 60 min |
| `otpSendIp` | 20 | 60 min |
| `otpConfirmIp` | 30 | 15 min |
| `credentialChangeAccount` | 10 | 15 min |
| `credentialChangeIp` | 30 | 15 min |

**Gli OTP contano su tre assi, non su uno solo (PP-05).** La chiave era
`canale:utente:indirizzoIP`: chi cambia rete cambia chiave, e con una manciata
di indirizzi in uscita si facevano partire tutti gli SMS che si volevano
**verso il numero di un altro**, invalidandogli ogni volta il codice appena
ricevuto. Costava soldi al club e rendeva l'account inverificabile.

- **per account** — ferma chi martella un identificativo che ha scoperto, da
  qualunque rete;
- **per destinatario** — il numero in E.164 o l'indirizzo email, sempre come
  **impronta** e mai in chiaro: i secchielli non devono diventare un secondo
  archivio da cui leggere i recapiti. E l'asse che ferma il pompaggio di SMS
  anche quando l'attaccante si crea account nuovi, e per questo lo consumano
  **anche la registrazione e il ramo `PHONE_NOT_VERIFIED` del login**, non
  solo `/verify/*/send`;
- **per indirizzo IP** — ferma chi prova tanti account diversi.

Il **cooldown** di `otp-policy.ts` (60 secondi) e una cosa diversa e vive
accanto a questi: dice «non adesso», non «non piu».

`credentialChange*` conta i tentativi di indovinare la **password attuale** su
`PATCH /api/v1/auth/user`: la richiesta della password e nata contro la
sessione rubata, e senza contatore la sessione rubata poteva semplicemente
indovinarla. Il tentativo sbagliato lascia anche una riga di audit.

Se `AUTH_RATE_LIMIT_SECRET` manca, il fallback e `CRON_SECRET`, poi
`DATABASE_URL`, poi la costante `"easygame-local"`. **Impostare sempre il
segreto negli ambienti condivisi.**

### Quale indirizzo IP conta

`getRequestIp` non prende piu la voce piu a **sinistra** di `X-Forwarded-For`.
Quella la scrive il client: cambiandola a ogni richiesta si otteneva un
secchiello nuovo ogni volta, e con esso login, registrazione, moduli pubblici,
checkout dei link di pagamento e — perche la chiave li contiene l'indirizzo —
invio e conferma degli OTP, cioe rinvii illimitati verso la casella di
qualcun altro.

Ogni proxy **accoda** l'indirizzo da cui ha ricevuto, quindi l'indirizzo vero e
la n-esima voce da destra, con n il numero di proxy fidati:
`AUTH_RATE_LIMIT_TRUSTED_PROXIES`, che vale **1** (Vercel) se non dichiarato.
Chi mette una CDN davanti a Vercel deve dichiarare 2, altrimenti i limiti
contano gli indirizzi della CDN invece di quelli di chi bussa.

I limiti per **identita** (`identity:`, `pwreset:`) non passano di qui e non
sono mai stati aggirabili in questo modo: e la ragione per cui il difetto era
un fastidio — posta indesiderata verso la vittima — e non una chiave rotta.

## OAuth

Provider previsti: **Google** e **Microsoft** (`getEnabledOAuthProviders`).
Attivi solo se sono presenti le rispettive coppie
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`,
`MICROSOFT_CLIENT_ID`/`MICROSOFT_CLIENT_SECRET`.

Flusso: `/start` genera lo state e il cookie dedicato → redirect al provider →
`/callback` scambia il codice, fa upsert su `external_accounts`, crea o collega
l'utente e apre la sessione. `AUTH_BASE_URL` determina la redirect URI.

### Un indirizzo non verificato non apre e non crea un account

`findOrCreateOAuthUser` decide in quest'ordine:

1. se esiste un `external_accounts` con lo stesso `(provider, sub)`, entra —
   quell'identita e dimostrata dal provider, e l'indirizzo non c'entra;
2. altrimenti, se `emailVerified` e **falso**, rifiuta;
3. altrimenti collega l'account che ha quell'indirizzo, o ne crea uno nuovo.

Il passo 2 e la correzione della decima tornata. Prima non esisteva: il valore
`emailVerified` veniva calcolato da `profile()` e la callback non lo passava —
la funzione non aveva nemmeno il parametro. Il collegamento avveniva **per solo
indirizzo**, e chi controllava una directory Entra ID poteva presentarsi con
l'indirizzo di un altro e ricevere la sua sessione (vedi
[14 — Sicurezza](14-security.md), decima tornata).

`email_verified_at` si scrive solo quando il provider ha davvero verificato.

### Quando un provider «verifica» davvero

| Provider | `emailVerified` |
|---|---|
| Google | il claim `email_verified` di `openidconnect.googleapis.com/v1/userinfo` |
| Microsoft | **vero solo** se `MICROSOFT_TENANT_ID` nomina un tenant preciso |

Con `common`, `organizations` o `consumers` — i tre endpoint multi-tenant —
Microsoft accetta l'utente di **qualunque** directory, compresa una creata
poco fa da chi attacca, e l'attributo `mail` non e legato a un dominio
dimostrato. In quella configurazione l'accesso Microsoft puo far entrare solo
chi si e gia collegato (passo 1), e ogni collegamento nuovo viene rifiutato con
un messaggio che dice come abilitarlo.

## Platform admin

`src/lib/platform-admin.ts`:

- gli admin di piattaforma sono elencati in
  `EASYGAME_PLATFORM_ADMIN_EMAILS` / `NEXT_PUBLIC_EASYGAME_PLATFORM_ADMIN_EMAILS`
  (CSV di email);
- se la lista **e valorizzata**, conta solo l'appartenenza alla lista oppure
  `role === "platform_admin"`;
- se la lista **e vuota**, si ricade su `role in ("platform_admin", "admin")`;
- dopo il login, un platform admin viene rediretto a
  `/private/easygame-platform-admin-0c7a` (`getPostLoginPath`).

Il path «privato» e solo poco indovinabile, **non e una misura di sicurezza**:
la protezione vera e `requirePlatformAdmin` sugli endpoint
`/api/v1/admin/*`.

## Lato client

- `AuthProvider` (`src/components/providers/AuthProvider.tsx`) espone utente,
  ruolo, `activeClub`, flag di ruolo e `signOut`.
- `src/lib/auth/session-sync.ts` centralizza l'invalidazione: `apiRequest`
  chiama `notifyUnauthorized()` su 401 e il provider pulisce cache e
  `localStorage`.
- `src/lib/auth/request-deduper.ts` evita richieste duplicate concorrenti
  (session/memberships) al mount di piu componenti.

## Test esistenti

`tests/auth/` copre: `session-sync`, `request-deduper`, `active-club-access`,
`membership-load-result`, `role-authorization`, `auth-security`.
Vedi [15 — Testing](15-testing.md).

### E il rientro da un provider gia collegato

Il ramo «stesso `sub`» non passa dalla guardia sull'indirizzo, e non deve:
quell'identita e dimostrata dal provider. Ristampava pero `email_verified_at`
guardando solo **se** il provider avesse verificato qualcosa, non se avesse
verificato **quell'** indirizzo — cioe quello che l'account porta adesso.

Era la strada che riapriva la porta chiusa dalla regola qui sopra: si collega
il proprio account al provider; si cambia il proprio indirizzo con quello del
tutore di un'altra famiglia — il cambio azzera `email_verified_at`, ed e quel
`null` a chiudere l'area genitore; si rientra dal provider. Stesso `sub`,
nessun controllo, e la verifica tornava su un indirizzo che nessuno aveva mai
verificato.

`email_verified_at` si stampa quindi solo quando il provider ha verificato
**l'indirizzo che l'account porta in quel momento**.

---

## L'accesso di un atleta si consegna con un link, mai con una password (2026-09-01, Wave 6 — 6C2)

### Il difetto che chiude

Il ruolo `athlete` era **modellato end-to-end**: il tipo, l'area, la guardia di
percorso, il rinvio di atterraggio, il riconoscimento in sessione, perfino lo
**slegamento** (`unlinkDirectAthleteProfile`). Mancava una cosa sola: **nessun
percorso scriveva `athletes.user_id`**. Il ruolo esisteva e non era ottenibile.

E il pulsante che avrebbe dovuto consegnarlo — «Invia credenziali» — mostrava un
messaggio di errore. Prima ancora mostrava un messaggio **verde** che diceva
«Credenziali inviate»: la segreteria chiudeva la scheda, e l'atleta restava
senza accesso senza che nessuno lo sapesse.

### Come funziona adesso

Due tempi, e **in nessuno dei due esiste una password che qualcuno conosce**:

1. **L'invito.** Un token opaco di 32 byte in un link. In archivio
   (`athlete_account_invites`) resta solo la sua **impronta**, come per il link
   di pagamento (ADR-0085). L'utenza, se va creata, nasce con la forma di
   `createOAuthBootstrapUser`: hash di byte casuali che nessuno vede, e
   `email_verified_at` **nullo**.
2. **La password la sceglie la persona**, con il meccanismo che esiste gia
   (`sendPasswordResetChallenge` / `confirmPasswordReset`, ADR-0015).

`email_verified_at === null` e il **segnale** che dice se quell'utenza ha
credenziali che qualcuno conosce: chi ha gia un account verificato non viene
toccato, e non riceve nessun reset che non ha chiesto.

### Un solo invito vivo per atleta, garantito dal database

`athlete_account_invites` ha un indice unico **parziale** su
`(organization_id, athlete_id) WHERE status = 'sent'` — la stessa forma di
`appointments_slot_vivo_unico`. Un reinvio revoca il precedente e ne crea uno
nuovo; due inviti vivi non sono una cosa che il codice si ricorda di impedire.

### La colonna in piu rispetto al piano, e perche

Il §9.4 di [41](41-wave-6-planning.md) non prevedeva `user_id` sulla riga
dell'invito. E stata aggiunta, e il motivo va scritto: senza, l'accettazione
dovrebbe ritrovare l'utenza **dall'indirizzo**, e fra l'invio e il clic quello
indirizzo puo cambiare o essere rioccupato. Il token finirebbe per legare
l'atleta a un'utenza diversa da quella invitata.

### La porta che resta fuori dalla guardia

`/athlete-dashboard/attiva` e in `PUBLIC_EXCEPTIONS` del middleware. Ci arriva
chi ha appena ricevuto l'invito: senza sessione, senza ruolo e senza una
password. Mandarlo su `/login` sarebbe mandarlo dove non puo entrare — la stessa
forma dell'eccezione che gia esiste per `/auth/complete`.

L'eccezione e **a un percorso solo**: un ramo che dicesse «tutto cio che comincia
per attiva» aprirebbe domani una pagina che nessuno ha valutato.

### Cosa resta rotto, e va detto

«Invia credenziali» su **staff** e **socio** mostra ancora il messaggio di
errore. Il dominio e generalizzabile, ma `athlete_account_invites` e modellata
sull'atleta: estenderla richiede una decisione sul soggetto (colonna polimorfa o
seconda tabella). Vedi `W6-D05` in [16 — Debito tecnico](16-technical-debt.md).

---

## Che cosa consegna un riscatto (P0-2, 2026-09-06)

Riscattare un gettone non e solo «collegare un account»: e **concedere una
tessera**, e una tessera ha un perimetro. Fino a questa correzione nessuna
delle due strade ne scriveva uno, e zero righe di perimetro significano tutto
il club (ADR-0103): il dettaglio, la misura e le prove stanno in
[14 — Sicurezza](14-security.md).

Quello che chi legge questo file deve sapere e la forma finale:

| gettone | profilo collegato | ruolo | perimetro |
|---------|-------------------|-------|-----------|
| invito dell'atleta | `athletes.user_id` | `athlete` | le sedi e le categorie delle sue appartenenze |
| gettone dell'allenatore | `linkedUserId` sulla scheda | `trainer` | le categorie della scheda, dentro il recinto di chi ha coniato |
| gettone del tutore | la riga tutore indicata | `parent` | le appartenenze del minore, dentro il recinto di chi ha coniato |
| gettone di solo ruolo | nessuno | il ruolo del gettone, sotto il soffitto di `minted_by_role` | il recinto di chi ha coniato |

Tre regole che valgono per tutti e quattro:

1. **il perimetro non si allarga** — mai piu largo di quello di chi ha coniato,
   verificato due volte: una volta calcolandolo e una volta rimisurandolo prima
   di scriverlo;
2. **un gettone vale una volta**, a meno che non sia legato a un profilo, che e
   l'unica forma in cui il multiuso ha un freno;
3. **si consuma con una condizione**, non con una scrittura: due riscatti
   simultanei dello stesso invito ne fanno entrare uno solo.

Dopo il riscatto lo stato e utilizzabile subito: non serve passare dalla
Gestione accessi, che resta amministrazione successiva e non onboarding.
