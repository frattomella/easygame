# 17 — Convenzioni di sviluppo

Vale per sviluppatori umani e agenti AI. Le regole specifiche per gli agenti
sono in [`CLAUDE.md`](../../CLAUDE.md) e [`AGENTS.md`](../../AGENTS.md).

## Prima di scrivere codice

1. Leggi la parte di KB che riguarda il dominio che stai toccando.
2. Cerca il codice esistente: la funzione o l'utility che ti serve **molto
   spesso esiste gia** in `src/lib/`.
3. Se il comportamento che trovi differisce dalla KB, **vince il codice**:
   correggi la KB nello stesso commit.

## Separazione Web / Mobile

- `src/` e `easygamemobile/` sono **progetti distinti** con `package.json`,
  `node_modules` e `tsconfig.json` separati.
- **Non importare mai** tra i due alberi. Non esistono path alias condivisi.
- Il codice comune di fatto duplicato (permessi trainer, utility certificati)
  va tenuto allineato **manualmente**; se lo modifichi da una parte, verifica
  l'altra e dichiaralo nel commit.
- Un commit non deve toccare Web e Mobile insieme, salvo un cambiamento di
  contratto API che li riguarda entrambi. In quel caso spiegalo nel messaggio.

## Dove mettere il codice

| Cosa | Dove |
|------|------|
| Logica pura e testabile | `src/lib/<dominio>.ts` |
| Logica che tocca il DB o segreti | `src/lib/server/**` (**mai** importata dal client) |
| Policy di autorizzazione | **solo** `src/lib/access-roles.ts` |
| Endpoint | `src/app/api/v1/**/route.ts` |
| Componenti di dominio | `src/components/<dominio>/` |
| Primitive UI | `src/components/ui/` |
| Composizione pagina | `src/app/**/page.tsx` — **senza nuova logica di dominio** |

## TypeScript

- `strict: true`. Non aggiungere `any` dove un tipo e ricavabile; se serve
  davvero, commenta il perche.
- Niente `@ts-ignore` senza motivazione scritta.
- `tsc --noEmit` deve restare pulito. **Non** reintrodurre
  `typescript.ignoreBuildErrors` in `next.config.js`.
- Niente codice dopo un `return`: `tsc --allowUnreachableCode false` oggi e
  pulito, mantienilo cosi.

## Naming

- File di componenti: `kebab-case.tsx` per i piu recenti, `PascalCase.tsx` per
  i piu vecchi. **Per il codice nuovo usa `kebab-case`.**
- Funzioni e variabili in inglese; testo utente e messaggi di errore in
  **italiano**.
- Colonne DB e campi API in `snake_case`; codice TypeScript in `camelCase`.

## Modifiche atomiche

Un commit = un cambiamento coerente.

- **Vietato** il refactoring opportunistico fuori dallo scope del task:
  niente riformattazioni di massa, rinomine non richieste, riordino import,
  aggiornamento dipendenze «gia che c'ero».
- Se noti un problema fuori scope, **annotalo** in
  [16 — Debito tecnico](16-technical-debt.md) o proponi un WP: non risolverlo
  nello stesso commit.
- Se un cambiamento richiede piu di ~400 righe di diff, valuta di dividerlo.

## Gate obbligatori prima del commit

```bash
npm test           # 30/30
npm run typecheck  # pulito
npm run lint       # 0 errori, warning non in aumento
npm run build      # completa
```

Se hai toccato il mobile:

```bash
cd easygamemobile && npm run check:types && npm run lint
```

## Test

Ogni commit che tocca **auth, ruoli, permessi o accesso ai dati** deve
includere o aggiornare un test. Ricorda di **aggiungere il file alla lista in
`package.json → test:auth`**: non c'e discovery automatica.
Vedi [15 — Testing](15-testing.md).

## Git

- Branch dal `main`: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`,
  `docs/<slug>`, `wp/<numero>-<slug>`.
- **Non committare su `main`.** Non fare push forzati su branch condivisi.
- Messaggi in **italiano**, imperativo, con prefisso convenzionale
  (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`).
  Corpo: cosa e cambiato, perche, come e stato validato.
- Non committare `.env`, segreti, `node_modules`, `.next`, build artifact,
  screenshot di debug, snapshot del repository.
- Non committare file generati in `.codex-tmp/`, `.codex-run/`, `.codex-logs/`.

## Database e ambienti — regole non negoziabili

- **Il `.env` locale punta al database Neon di staging.** Non esiste un DB
  locale.
- Consentiti senza autorizzazione: comandi di **sola lettura**
  (`npx prisma migrate status`, query di lettura).
- Richiedono **autorizzazione esplicita**: `prisma migrate dev`,
  `prisma db push`, `prisma:seed`, `staging:provision-e2e`, qualunque `UPDATE`
  o `DELETE` massivo.
- **Vietato sempre**: `npm run db:push` dentro `easygamemobile/` (Drizzle
  altererebbe la tabella `users` reale — vedi [14](14-security.md)).
- Una nuova migrazione va scritta a mano in `prisma/migrations/`, rivista, e
  applicata prima a staging. Ricorda che **ogni deploy Vercel esegue
  `prisma migrate deploy`**.

## Deploy

- Staging: `npx vercel --prod` sul progetto collegato `easygame-staging`,
  **dopo** che tutti i gate sono verdi.
- Produzione: **nessun deploy senza autorizzazione esplicita del proprietario
  del prodotto.** Nello scope Vercel corrente non esiste nemmeno un progetto
  production: se ne trovi uno, fermati e chiedi conferma.
- Dopo ogni deploy: verifica lo stato `READY` e uno smoke test minimo
  (home, `/login`, `/api/v1/registry`).

## Aggiornare la Knowledge Base

La KB fa parte della definizione di «fatto». Aggiornala **nello stesso commit**
quando cambi:

| Cosa cambi | Documento da aggiornare |
|------------|-------------------------|
| Schema Prisma o migrazioni | [06](06-data-model.md) |
| Auth, OTP, OAuth, sessioni | [07](07-authentication.md) |
| Ruoli o permessi | [08](08-roles-and-permissions.md) |
| Endpoint API | [09](09-api-conventions.md) + `docs/api-registry.md` + `src/lib/api/registry.ts` |
| Stato di una funzionalita | [11](11-capabilities.md) |
| Integrazioni esterne | [12](12-integrations.md) |
| Variabili d'ambiente o deploy | [13](13-environments.md) + `.env.example` |
| Postura di sicurezza | [14](14-security.md) |
| Test | [15](15-testing.md) |
| Scelta architetturale | [18](18-decision-log.md) — nuovo ADR |
| Stato di un WP | [20](20-work-packages.md) |

## Non fare

- Non introdurre nuove dipendenze senza necessita verificata e senza dichiararlo.
- Non introdurre un secondo ORM, un secondo client HTTP, un secondo sistema di
  toast o una seconda libreria di stato.
- Non aggiungere accoppiamento a servizi proprietari Vercel (KV, Blob, Edge
  Config) o a funzionalita che rendano difficile spostare il backend:
  vedi [ADR-0007](18-decision-log.md).
- Non riattivare Tempo, Supabase o Replit.
- Non aggiungere varianti `dark:` finche il tema scuro non e un WP attivo.
