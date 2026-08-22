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
`Invalid login credentials`.

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
  2. utente inesistente        → 401 "Invalid login credentials" (con bcrypt fittizio)
  3. password errata           → 401 "Invalid login credentials"
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
  2. validazione con la policy password del progetto
  3. challenge cercata per user + channel + purpose, non consumata, non scaduta
  4. confronto degli hash con timingSafeEqual; tentativo errato incrementa
     attempts, oltre MAX_OTP_ATTEMPTS la challenge viene bruciata
  5. in transazione: consuma la challenge, aggiorna password_hash,
     cancella TUTTE le sessioni dell'utente
```

Dettagli che contano:

- **Nessuna enumerazione**: la risposta di `forgot` non cambia mai, nemmeno in
  caso di errore inatteso; non esiste un 404.
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

## OAuth

Provider previsti: **Google** e **Microsoft** (`getEnabledOAuthProviders`).
Attivi solo se sono presenti le rispettive coppie
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`,
`MICROSOFT_CLIENT_ID`/`MICROSOFT_CLIENT_SECRET`.

Flusso: `/start` genera lo state e il cookie dedicato → redirect al provider →
`/callback` scambia il codice, fa upsert su `external_accounts`, crea o collega
l'utente e apre la sessione. `AUTH_BASE_URL` determina la redirect URI.

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
