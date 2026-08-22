# 14 — Sicurezza

Stato al 2026-08-22. Questo documento elenca cosa **e** protetto, cosa **non
lo e**, e i rischi operativi da conoscere prima di toccare il codice.

## Cosa e gia solido

| Area | Implementazione |
|------|-----------------|
| Password | bcrypt cost 10, minimo 12 caratteri, blacklist password comuni |
| Enumerazione account | Login su email inesistente esegue comunque un `bcrypt.compare` fittizio e restituisce lo stesso messaggio |
| Sessioni | Token opachi random su DB, revocabili, scadenza 14 giorni, riletti a ogni richiesta |
| Cookie | `httpOnly`, `sameSite=lax`, `secure` in produzione, `path=/` |
| Rate limiting | Persistente su DB (funziona con piu istanze serverless), 6 policy, chiavi hashate SHA-256 con segreto |
| OTP | Codici salvati come hash, scadenza, massimo 5 tentativi, consumo one-shot |
| Isolamento tenant | Server-side: `x-active-club-id` validato contro `allowedOrganizationIds`; `listResource` impone `organization_id` |
| Autorizzazione risorse | `assertClubResourceAccess` su ogni chiamata al CRUD generico; parent e athlete esclusi dalle API di club |
| Segreti SMTP | AES-GCM autenticato; la password non e mai restituita dalle API (test dedicato) |
| Errori provider | Normalizzati in codici, nessun leak di dettagli SMTP |
| Segreti nel repository | **Nessuno**: scansione dei file tracciati negativa; `.env` e `.env.local` non sono mai stati committati |
| TypeScript | `strict: true`, e `ignoreBuildErrors` **non** e attivo in `next.config.js` |

## Incidenti risolti

### I-01 — Credenziali demo pubblicate e funzionanti su staging (2026-08-22) — RISOLTO

**Cosa era esposto.** Il repository GitHub e **pubblico**. Il README elencava
`demo@easygame.it`, `trainer@easygame.it`, `athlete@easygame.it`,
`parent@easygame.it` con password `password123`. Gli stessi account
**esistevano davvero** sul database di staging, con email verificata e sessioni
attive, e lo staging e raggiungibile da internet. Verificato con un confronto
bcrypt in sola lettura: **la password pubblicata era valida su tutti e quattro**.
L'account `demo@easygame.it` ha ruolo `club_creator`, quindi dava accesso in
scrittura ai dati reali del club.

**Rimedio applicato.**

- Password ruotate su tutti e quattro gli account con valori casuali da 28
  caratteri, hash **bcrypt cost 12**.
- Revocate **37 sessioni** attive (24 + 5 + 4 + 4).
- Verificato che la vecchia password non funziona piu, sia con confronto bcrypt
  sia con una `POST /api/v1/auth/login` reale su staging → **401**.
- Credenziali nuove salvate solo in `.staging-credentials.local`, gitignored.
- Credenziali rimosse da `README.md` e da [06 — Modello dati](06-data-model.md).
- `prisma/seed.js` non ha piu una password predefinita: richiede
  `SEED_DEMO_PASSWORD` (minimo 16 caratteri) e usa bcrypt cost 12.

**Da fare comunque.** Non c'e modo di sapere se qualcuno ha usato quelle
credenziali prima della rotazione: i dati di staging vanno considerati
potenzialmente visti da terzi. Non e possibile verificarlo perche **non esiste
audit log** — vedi rischio aperto n. 7 e [ADR-0019](18-decision-log.md).

**Lezione registrata.** Nessuna credenziale reale, host di database, endpoint
Neon o URL di deployment nella documentazione di un repository pubblico.

## Rischi aperti

### 1. Nessuna protezione di route a livello edge — MEDIO

Non esiste `middleware.ts`. Il controllo di navigazione e il componente client
`AccessAreaGuard`, montato **solo** su `/dashboard`, `/trainer-dashboard`,
`/parent-view/[id]`, `/athletes/[id]/profile`.

Le altre ~40 pagine di area management non hanno guard: un utente autenticato
con ruolo non adeguato puo **caricare la shell** di quelle pagine.

*Perche non e critico*: i dati arrivano solo dalle API, che applicano
l'autorizzazione server-side. L'utente vede un'interfaccia vuota o con errori,
non dati altrui.

*Mitigazione*: [WP-03](20-work-packages.md) — estendere `AccessAreaGuard` o
introdurre un `middleware.ts`.

### 2. `easygamemobile` puo distruggere il database reale — ALTO

`easygamemobile/shared/schema.ts` definisce con Drizzle una tabella `users`
(`username`, `password`) diversa dalla `users` reale gestita da Prisma.
`drizzle.config.ts` legge `DATABASE_URL`.

Eseguire `npm run db:push` dentro `easygamemobile/` con `DATABASE_URL`
valorizzato lancerebbe `drizzle-kit push` **sul database Neon di
staging/produzione**, tentando di alterare la tabella degli utenti.

> **Non eseguire mai `npm run db:push` in `easygamemobile/`.**
> Rimedio strutturale: [WP-06](20-work-packages.md) — rimuovere Drizzle e lo
> scaffold Express dal mobile.

### 3. `.env` locale punta al database di staging — ALTO (operativo)

Non esiste un database locale. Qualunque comando Prisma di scrittura eseguito
in locale (`migrate dev`, `db push`, `prisma:seed`) modifica staging.
Vedi [13 — Ambienti](13-environments.md).

### 4. Il deploy applica le migrazioni — MEDIO

`vercel-build` esegue `prisma migrate deploy`. Un deploy con una migrazione
distruttiva in `prisma/migrations/` la applica senza conferma.
Controllare sempre lo stato migrazioni prima di deployare.

### 5. Nessuna protezione CSRF esplicita — MEDIO

Il cookie e `sameSite=lax`, che blocca la maggior parte dei POST cross-site,
ma non esiste un token CSRF ne un controllo di `Origin`/`Referer` sulle
mutazioni. Le API accettano `Content-Type: application/json`, il che riduce
ulteriormente la superficie (una form cross-site non puo inviare JSON senza
preflight CORS).

### 6. Webhook pagamenti senza verifica di firma — MEDIO (oggi teorico)

`POST /api/payments/webhook` non valida la firma del provider (TODO esplicito).
Oggi non processa eventi, quindi l'impatto e nullo — **ma non deve essere
attivato prima di implementare la verifica**. Vedi [WP-13](20-work-packages.md).

### 7. Nessun audit log — MEDIO

Non c'e traccia di chi ha modificato cosa. Per un gestionale che tratta dati di
minori e dati fiscali e una lacuna di compliance. Vedi [WP-16](20-work-packages.md).

### 8. Binari nel database — MEDIO

`Asset.data_base64` consente di salvare file interi in Postgres. Rischio di
crescita incontrollata del DB e di risposte pesanti. Vedi
[WP-15](20-work-packages.md).

### 9. Path «segreto» del platform admin — BASSO

`/private/easygame-platform-admin-0c7a` e solo poco indovinabile. La sicurezza
reale e `requirePlatformAdmin` sulle API — che c'e. Non trattare il path come
una misura di sicurezza.

### 10. Fallback permissivo degli admin di piattaforma — BASSO

Se `EASYGAME_PLATFORM_ADMIN_EMAILS` e vuota, chiunque abbia
`users.role in ("platform_admin", "admin")` diventa admin di piattaforma.
`users.role` e una stringa libera senza vincoli. **Tenere sempre valorizzata la
lista email** negli ambienti condivisi.

### 11. Nessuna paginazione sulle liste — BASSO (disponibilita)

`/api/v1/<resource>` restituisce tutti i record del club. Con club grandi
diventa un problema di memoria e latenza, non di riservatezza.

### 12. Nessun Row Level Security — informativo

L'isolamento multi-tenant e **solo applicativo**. Un bug in `resources.ts`
diventerebbe direttamente una fuga cross-tenant. La copertura di test su questo
punto e il presidio piu importante: vedi [WP-04](20-work-packages.md).

## Regole per chi scrive codice

1. **Mai** interrogare Prisma da un route handler senza aver prima ottenuto lo
   `scope` e senza filtrare per `organization_id`.
2. **Mai** fidarsi di `organization_id` che arriva dal client: deve passare da
   `ensureOrganizationAccess`.
3. **Mai** importare `src/lib/server/**` da un componente client.
4. **Mai** restituire `password_hash`, `password_ciphertext`, token di sessione
   o codici OTP in una risposta.
5. Un messaggio di errore di autorizzazione **deve** contenere la stringa
   `Accesso negato` (il route handler generico la usa per mappare il 403).
6. Nuovi segreti: solo variabili d'ambiente o colonne cifrate, mai nel
   repository, mai in `NEXT_PUBLIC_*`.
7. Ogni modifica ad `access-roles.ts` richiede l'aggiornamento di
   `tests/auth/role-authorization.test.mjs`.
