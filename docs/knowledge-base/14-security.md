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
| Segreti IMAP | Stessa cifratura, **contesto crittografico separato** (`purpose: "imap"`): una credenziale non e decifrabile come l'altra. Password mai restituita |
| Trasporto IMAP | Sempre cifrato: SSL implicito, oppure STARTTLS con chiusura della sessione se l'upgrade fallisce. Mai `LOGIN` in chiaro |
| Iniezione di comandi IMAP | Username e password con CR o LF vengono rifiutati prima di toccare il socket; il resto e quotato secondo RFC 3501 |
| Errori provider | Normalizzati in codici (`SMTP_*`, `IMAP_*`), nessun leak di dettagli del server di posta |
| Segreti nel repository | **Nessuno**: scansione dei file tracciati negativa; `.env` e `.env.local` non sono mai stati committati |
| Modifica di un pagamento atleta | Sessione + appartenenza al club + **ruolo** (`owner` o `club_manager`) + regole di dominio (un pagamento pagato non si modifica) + audit con l'id di chi agisce. Dal Blocco 7 al posto del PIN di club, che non controllava nessuna di queste cose |
| Validazione anagrafica | `assertAnagraficaIsValid` su ogni creazione e aggiornamento: club, atleti e — dal Blocco 7 — allenatori, staff e soci. Stesso modulo puro del client, quindi non possono divergere. Un dato gia in archivio non ri-valida: introdurre una regola non deve rendere immodificabile una scheda che la violava |
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

### 1. ~~Nessuna protezione di route~~ — RISOLTO (2026-08-22)

Protezione a due livelli: `src/middleware.ts` reindirizza a `/login` chi apre
un percorso protetto senza cookie di sessione, e `AccessAreaGuard` e montato
su **tutte** le aree. Nessuno dei due sostituisce l'autorizzazione server-side
delle API, che resta il presidio principale.

Limite dichiarato: il middleware verifica la **presenza** del cookie, non la
sua validita (il runtime edge non ha Prisma). Un cookie scaduto passa di li e
viene respinto dalle API con 401.

### 2. ~~`easygamemobile` puo distruggere il database reale~~ — RISOLTO (2026-08-22)

Lo schema Drizzle, lo scaffold Express, `drizzle.config.ts`, `.replit`, lo
script `db:push` e tutte le dipendenze di accesso al database sono stati
**rimossi** dal mobile ([ADR-0018](18-decision-log.md)).

Presidio permanente: il job `guardrails` della CI fallisce se `DATABASE_URL`
ricompare sotto `easygamemobile/`.

### 3. ~~`.env` locale punta al database di staging~~ — RISOLTO (2026-08-22)

L'ambiente locale usa un database di sviluppo dedicato
(`docker-compose.dev.yml`, porta 5434). In piu `scripts/db-guard.mjs` blocca
gli script npm di scrittura quando `EASYGAME_DB_ENV` non vale `development`.

Rischio residuo: la guardia protegge gli script npm, **non** un
`npx prisma db push` invocato a mano con un `.env` ripuntato su un ambiente
condiviso. Vedi [13 — Ambienti](13-environments.md).

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

### 7. ~~Nessun audit log~~ — IMPLEMENTATO (2026-08-22)

`src/lib/server/audit.ts` scrive su `audit_logs` chi ha fatto cosa, su quale
club, con quale esito ([ADR-0019](18-decision-log.md)).

Tracciate: login riuscito e fallito, logout, richiesta e completamento del
reset password, attivazione membership, creazione/modifica/cancellazione delle
risorse economiche e di accesso (`AUDITED_RESOURCES`), il ciclo di vita delle
stagioni (`season.created`, `season.activated`, `season.archived`,
`season.rollover` — Blocco 6), e **tutti** i dinieghi di autorizzazione su
qualunque risorsa.

Registrati: azione, esito, actor (id, email, ruolo), organizzazione, risorsa e
id, IP, user agent, metadati filtrati, timestamp.

Garanzie:

- **nessun segreto**: i metadati passano da `sanitizeMetadata`, che censura le
  chiavi sensibili per sottostringa (password, token, hash, iban, ...) e per
  segmento (`iv`, `pin`, `otp`, `code`, ...), a qualunque profondita;
- **non fa fallire l'operazione tracciata**: un errore di scrittura viene
  registrato su console e basta;
- **non legge mai il corpo delle richieste** (verificato da un test).

Retention: `AUDIT_LOG_RETENTION_DAYS` piu `purgeExpiredAuditEvents()`. Se la
variabile non e impostata **non si cancella nulla**: il periodo e una decisione
di prodotto e compliance, non un default tecnico. Manca ancora lo scheduler che
invochi la purge, e manca una UI di consultazione: → [WP-16](20-work-packages.md).

### 8. Binari nel database — RIDOTTO (2026-08-25, Blocco 8)

Il difetto grave non era `Asset.data_base64` ma i data URL **dentro i record
di dominio**: un allegato non aveva autorizzazione propria — chi poteva
leggere il record aveva i byte, tutti insieme — ne un limite di dimensione ne
un controllo di tipo.

Dal Blocco 8 gli allegati passano da `src/lib/server/attachments.ts`
([ADR-0034](18-decision-log.md#adr-0034--gli-allegati-escono-dai-record-e-passano-da-un-servizio-con-driver)),
che applica:

- **scope organizzativo su ogni operazione** — leggere, elencare,
  sostituire, cancellare. 8 test lo verificano dal club sbagliato;
- **elenco chiuso di tipi MIME**: niente eseguibili, niente archivi;
- **limite di 10 MB** per file, controllato prima di leggere i byte;
- `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox` e
  `Cache-Control: private` sulla risposta che serve il file;
- nome del download ripulito prima di finire in `Content-Disposition`: un
  nome con un ritorno a capo non puo aggiungere header.

**Resta aperto:** i data URL legacy gia in archivio, che continuano a
funzionare e migrano quando qualcuno li tocca; e la tabella `assets`, ancora
usata dal logo di club e dalle immagini dei form.

### 9. Path «segreto» del platform admin — BASSO

`/private/easygame-platform-admin-0c7a` e solo poco indovinabile. La sicurezza
reale e `requirePlatformAdmin` sulle API — che c'e. Non trattare il path come
una misura di sicurezza.

### 10. Fallback permissivo degli admin di piattaforma — BASSO

Se `EASYGAME_PLATFORM_ADMIN_EMAILS` e vuota, chiunque abbia
`users.role in ("platform_admin", "admin")` diventa admin di piattaforma.
`users.role` e una stringa libera senza vincoli. **Tenere sempre valorizzata la
lista email** negli ambienti condivisi.

### 11. Paginazione sulle liste — MITIGATO (2026-08-25, Blocco 8)

Il server sa impaginare, cercare e ordinare (`?limit=`, `?page=`, `?q=`,
`?order_by=`), con un tetto di 200 righe per pagina che il client non puo
alzare. La pagina piu pesante — la lista Atleti — e scesa da 23,7 MB a 140 kB
avendo tolto i binari dalla risposta. Resta che il **default** e ancora la
lista intera, quindi il rischio non e nullo: e ridotto di due ordini di
grandezza.

Testo originale, che resta valido per le liste non convertite:

`/api/v1/<resource>` restituisce tutti i record del club. Con club grandi
diventa un problema di memoria e latenza, non di riservatezza.

### 12. Nessun Row Level Security — informativo

L'isolamento multi-tenant e **solo applicativo**: un bug in `resources.ts`
diventerebbe direttamente una fuga cross-tenant.

Dal 2026-08-22 il presidio esiste: 29 test a runtime coprono lettura,
dettaglio, creazione, update e delete cross-tenant sulle funzioni vere, e sono
stati validati per mutazione (rimuovendo il filtro falliscono 8 test,
disattivando `ensureOrganizationAccess` ne falliscono 11). Vedi
[15 — Testing](15-testing.md).

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
6. Un'operazione sensibile nuova va tracciata con `recordAuditEvent`, e i suoi
   metadati non devono contenere segreti (`sanitizeMetadata` li censura, ma
   non passarglieli e meglio).
6. Nuovi segreti: solo variabili d'ambiente o colonne cifrate, mai nel
   repository, mai in `NEXT_PUBLIC_*`.
7. Ogni modifica ad `access-roles.ts` richiede l'aggiornamento di
   `tests/auth/role-authorization.test.mjs`.
8. Ogni **nuova rotta di pagina** va aggiunta sia a `PROTECTED_PREFIXES` in
   `src/middleware.ts` sia alla matrice di `access-roles.ts`: il middleware
   ferma chi non ha sessione, la matrice chi ha il ruolo sbagliato. Ne serve
   una senza l'altra. (`/onboarding` e l'ultima aggiunta, Blocco 4.)
9. Un valore che arriva da un form e finisce dentro un **protocollo testuale**
   (SMTP, IMAP, LDAP, CSV) va ripulito dai terminatori di riga prima di essere
   scritto sul canale: e la stessa classe di problema dell'iniezione SQL.
