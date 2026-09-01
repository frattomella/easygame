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

## Flusso di login (stato reale)

```
POST /api/v1/auth/login { email, password }
  1. rate limit  IP (30 / 15 min)  +  identita (10 / 15 min)
  2. utente inesistente        → 401 "Email o password non corretti" (con bcrypt fittizio)
  3. password errata           → 401 "Email o password non corretti"
  4. email non verificata      → 403 EMAIL_NOT_VERIFIED  (+ invio OTP se SMTP configurato)
  5. telefono da verificare    → 403 PHONE_NOT_VERIFIED  (+ invio OTP)
  6. finalizeVerifiedSession   → crea sessione, imposta cookie, 200
```

### Dipendenza critica da SMTP

`resolveEmailVerificationPolicy` restituisce sempre
`{ required: true, allowUnverifiedSession: false }`.

Conseguenza: **se il provider SMTP non e configurato, un utente con email non
verificata non puo entrare** — riceve 403 e nessun codice, perche
`canSendOtp = false`. Non esiste bypass.

Prima di considerare un ambiente utilizzabile end-to-end occorre quindi che la
configurazione SMTP sia presente. Vedi [12 — Integrazioni](12-integrations.md).

## Verifica email e telefono (OTP)

- Modello `AuthVerificationChallenge`: `code_hash`, `expires_at`, `attempts`,
  `consumed_at`, `channel` (`email` | `phone`), `purpose` (`login`,
  `verify_email`, `verify_phone`, ...).
- Massimo **5 tentativi** per challenge (`MAX_OTP_ATTEMPTS`).
- La verifica telefono e attiva **solo** se Twilio e configurato
  (`isPhoneVerificationEnabled`, `src/lib/auth/provider-policy.ts`). Senza
  Twilio il passaggio viene saltato.
- `AUTH_ALLOW_TEST_CODES=true` espone il codice OTP nella risposta
  (`previewCode`) — **solo fuori produzione**, vedi
  `shouldExposeVerificationPreviewCode` in `src/lib/auth/otp-policy.ts`.

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
