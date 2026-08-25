# AGENTS.md — regole per agenti AI su EasyGame

Valgono per **qualsiasi** agente (Claude Code, Codex, Copilot, altri).
Claude Code trova le stesse regole, piu dettaglio operativo, in
[`CLAUDE.md`](CLAUDE.md).

**Fonte di verita:
[`docs/knowledge-base/`](docs/knowledge-base/README.md).**
Documenta il codice reale. Se KB e codice divergono, vince il codice e la KB va
corretta nello stesso commit.

---

## Contesto minimo

EasyGame: gestionale multi-tenant per ASD e societa sportive.

| | Web App | Mobile App |
|---|---------|------------|
| Percorso | `src/` | `easygamemobile/` |
| Stack | Next.js 14 App Router, TypeScript strict, Tailwind, shadcn/ui, Prisma 6 | Expo SDK 54, React Native 0.81, React Navigation 7 |
| Backend | Route Handler in `src/app/api/**` | consuma **la stessa** API `/api/v1` |
| Database | Neon PostgreSQL (unico, multi-tenant logico per `organization_id`) | nessuno proprio |
| Hosting | Vercel, progetto `easygame-staging`, regione `fra1` | nessuno |
| Stato | **funzionante — baseline da non rompere** | **incompleta**, solo area allenatore |
| Priorita | **assoluta**: completare la V1 e renderla responsive (375/768/1280 px) | **DIFFERITA** ([ADR-0025](docs/knowledge-base/18-decision-log.md)): nessuna nuova funzionalita |

---

## Le dieci regole

### 1. Leggi prima di scrivere
Consulta i documenti KB pertinenti al dominio del task. Non dedurre il
comportamento: verificalo nel codice.

### 2. Rispetta l'ownership dei domini
Un dominio ha un solo punto di ingresso. Non crearne un secondo.

| Dominio | Proprietario |
|---------|--------------|
| Ruoli e permessi | `src/lib/access-roles.ts` |
| Sessioni e scope organizzativo | `src/lib/server/auth.ts` |
| Incassi (movimenti di denaro) | `src/lib/server/payment-transactions.ts` |
| Voucher e contributi da enti | `src/lib/server/funding.ts` |
| Accesso dati server | `src/lib/server/resources.ts` |
| Client Prisma | `src/lib/server/prisma.ts` |
| Email | `src/lib/server/email/` |
| Trasporto HTTP client | `src/lib/api/client.ts` |
| Dati mobile | `easygamemobile/client/services/api.ts` + `mobile-backend-storage.ts` |

### 3. Modifiche atomiche
Un commit = un cambiamento. Nessun refactoring, nessuna riformattazione,
nessuna rinomina fuori dallo scope del task.

### 4. Niente lavoro estraneo al task
Se trovi un problema fuori scope, **annotalo** in
[16 — Debito tecnico](docs/knowledge-base/16-technical-debt.md) o proponi un
Work Package. Non risolverlo di passaggio.

### 5. Test obbligatori
```bash
npm test && npm run typecheck && npm run lint && npm run build
```
Tutti verdi prima di commettere. Mobile: `cd easygamemobile && npm run check:types && npm run lint`.

Ogni commit su **auth, ruoli, permessi o accesso ai dati** deve includere o
aggiornare un test. La discovery e automatica su `tests/**/*.test.mjs`.

### 6. Aggiorna la Knowledge Base
Nello stesso commit del codice. La tabella completa «cosa cambi → cosa
aggiorni» e in [17 — Convenzioni](docs/knowledge-base/17-development-conventions.md).

### 7. Tieni separati Web e Mobile
Progetti npm indipendenti. **Nessun import tra i due alberi.** Non toccarli
nello stesso commit, salvo un cambio di contratto API dichiarato.

### 8. Git
Branch dal `main` (`feat/`, `fix/`, `chore/`, `docs/`, `test/`,
`wp/<n>-<slug>`). Mai commit diretti su `main`, mai push forzati su branch
condivisi. Messaggi in italiano con prefisso convenzionale: cosa, perche, come
validato. Mai committare segreti, `.env`, artefatti di build o snapshot del
repository.

### 9. Sicurezza database e ambienti
**Il locale usa un database di sviluppo dedicato** (`docker-compose.dev.yml`,
porta 5434), non piu staging (ADR-0012).

- `scripts/db-guard.mjs` blocca gli script npm di scrittura se
  `EASYGAME_DB_ENV` non vale `development`. **Copre solo gli script npm**: un
  `npx prisma db push` a mano la aggira.
- Libero: sola lettura (`npm run db:status`, query di lettura).
- Richiede autorizzazione esplicita: ogni scrittura, anche con l'override
  `EASYGAME_ALLOW_SHARED_DB_WRITE=1`.
- **Vietato:** reintrodurre ORM, schemi o connection string in
  `easygamemobile/` (ADR-0018). La CI lo verifica.

Nel codice: mai una query club-scoped senza filtro `organization_id`; mai
fidarsi dell'`organization_id` inviato dal client; mai importare
`src/lib/server/**` dal client; mai restituire hash, credenziali cifrate,
token o codici OTP.

### 10. Nessuna modifica non autorizzata alla produzione
Staging: consentito dopo gate verdi. Produzione: **mai senza autorizzazione
esplicita**; nello scope Vercel corrente non esiste un progetto production — se
ne trovi uno, fermati e chiedi. **Ogni deploy esegue `prisma migrate deploy`.**

---

## Vincolo architetturale permanente

EasyGame potrebbe diventare un prodotto della **Cedi Platform**, con un
possibile backend .NET. **Nessuna migrazione ora.**

Non introdurre accoppiamento che renda difficile spostare il dominio fuori da
Next.js: niente servizi proprietari dell'hosting (KV, Blob, Edge Config),
niente Server Actions come unico canale di scrittura, logica nuova in moduli
isolabili sotto `src/lib/server/`.
Vedi [ADR-0007](docs/knowledge-base/18-decision-log.md).

---

## Cosa non fare, mai

- Introdurre un secondo ORM, client HTTP, sistema di toast o libreria di stato.
- Riattivare Tempo, Supabase o Replit.
- Reintrodurre `typescript.ignoreBuildErrors` in `next.config.js`.
- Lasciare codice dopo un `return` (`tsc --allowUnreachableCode false` e pulito:
  mantienilo cosi).
- Lasciare grandi blocchi di codice commentato al posto di cancellarli: c'e Git.
- Scrivere `clubs.<campo>` direttamente con Prisma aggirando `resources.ts`.
- Dichiarare `COMPLETE` una capability senza flusso end-to-end.

---

## Trappole specifiche di questo repository

1. `src/lib/supabase.ts` **non parla con Supabase**: e un adapter su `fetch`
   verso `/api/v1`.
2. Le risorse di club sono scritte **due volte** (`club_resource_items` e
   colonne `Json?` di `clubs`), tenute allineate da `resources.ts`.
3. L'header `x-active-season-id` viene inviato ma **nessun endpoint lo legge**:
   il filtro stagione e client-side.
4. La protezione delle pagine e a **due livelli**: `src/middleware.ts` (solo
   presenza del cookie, non valida la sessione) e `AccessAreaGuard` montato su
   ogni area tramite `management-area-layout`. L'autorizzazione vera resta
   server-side nelle API.
5. Convivono due generazioni di UI trainer: usa i `*-dashboard-page.tsx` (v2).
6. 19 primitive in `src/components/ui/` non sono referenziate da nulla.
7. La verifica email e obbligatoria e **senza SMTP configurato gli utenti non
   verificati non possono accedere**. Anche il reset password dipende da SMTP.
8. Il checkout pagamenti risponde **501**: nessun provider e implementato e
   non va implementato con un PSP diretto (ADR-0013, CediPay).
9. `src/lib/server/**` **e testabile**: l'hook in
   `tests/helpers/extensionless-resolver.mjs` risolve import senza estensione
   e alias `@/`, e `__setPrismaClientForTests()` permette di iniettare un
   doppio. L'isolamento multi-tenant ha 29 test a runtime.

---

## Prossimi lavori

Prendi un Work Package da
[20 — Work Package](docs/knowledge-base/20-work-packages.md), che indica per
ciascuno obiettivo, scope, dipendenze, acceptance criteria, test e stato.

Due WP che toccano lo stesso file **non si eseguono in parallelo**. I file a
maggior contesa sono `src/lib/server/resources.ts` e
`src/lib/simplified-db.ts`.
