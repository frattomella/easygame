# 15 — Testing

## Stack

**Nessun framework esterno.** Si usa il test runner nativo di Node 22
(`node:test` + `node:assert/strict`), con `--experimental-strip-types` per
importare direttamente i `.ts` sorgente.

```jsonc
"test":      "npm run test:unit",
"test:unit": "node --experimental-strip-types --experimental-test-isolation=none --import ./tests/helpers/register-hooks.mjs --test \"tests/**/*.test.mjs\""
```

Dal 2026-08-22 la **discovery e automatica**: un file nuovo sotto `tests/` viene
eseguito senza toccare `package.json`. Prima andava elencato a mano ed era la
dimenticanza piu frequente.

I file di test hanno estensione `.mjs` e importano i moduli TypeScript con il
percorso completo:

```js
import { validatePassword } from "../../src/lib/auth/password-policy.ts";
```

Restano non testabili i moduli con JSX o con dipendenze da Next e dal browser.

Dal 2026-08-22 **`src/lib/server/**` e invece testabile**, grazie a due
tasselli:

1. `tests/helpers/extensionless-resolver.mjs` — hook di risoluzione ESM
   registrato via `--import ./tests/helpers/register-hooks.mjs`. Risolve gli
   import senza estensione (`./prisma`) e l'alias `@/`, che Node non conosce
   ma il bundler di Next si. **Non tocca il codice di produzione.**
2. `src/lib/server/prisma.ts` costruisce il client **alla prima query** invece
   che all'import, ed espone `__setPrismaClientForTests()`. Il client esportato
   e un Proxy che inoltra al client reale (o al doppio) legando i metodi,
   perche Prisma usa `this` internamente.

`tests/helpers/fake-prisma.mjs` fornisce un doppio che registra le chiamate e
filtra i record con la semantica dei `where` di Prisma (uguaglianza, `in`,
`not`, `gt`, `OR`, `AND`, `NOT`, filtri su path JSON).

Dove il runtime resta irraggiungibile si usano **test di conformita statica**
sul sorgente: meno espressivi, ma colgono la regressione che conta — un
endpoint nuovo che dimentica il controllo.

## Cosa e coperto oggi — 175 test, 17 file

| File | Test | Copre |
|------|------|-------|
| `tests/auth/auth-security.test.mjs` | 5 | Password policy, ruoli in registrazione pubblica, policy rate limit, OTP, provider telefono |
| `tests/auth/role-authorization.test.mjs` | 5 | Matrice `canAccessPath` / `canAccessClubResource` per i 7 ruoli |
| `tests/auth/route-guards.test.mjs` | 7 | Ogni area di gestione monta un guard; il middleware copre tutti i prefissi; le aree riservate restano a owner e club_manager; il guard e idempotente rispetto all'annidamento |
| `tests/auth/api-authorization.test.mjs` | 7 | Conformita di tutti i route handler: sessione richiesta, scope di club o deroga motivata, matrice permessi sul CRUD generico, `requirePlatformAdmin` su `/v1/admin/*`, nessuna esposizione di hash |
| `tests/auth/password-reset.test.mjs` | 11 | Token casuale e mai in chiaro, confronto a tempo costante, monouso, scadenza, tetto tentativi, revoca sessioni, atomicita, nessuna enumerazione, rate limit, dipendenza SMTP, isolamento dagli OTP |
| `tests/auth/active-club-access.test.mjs` | 5 | Selezione e persistenza del club attivo |
| `tests/auth/request-deduper.test.mjs` | 5 | Deduplicazione richieste concorrenti |
| `tests/auth/session-sync.test.mjs` | 3 | Invalidazione cache e handler `unauthorized` |
| `tests/auth/membership-load-result.test.mjs` | 3 | Normalizzazione del caricamento membership |
| `tests/email/smtp-config.test.mjs` | 4 | Validazione config SMTP, **la password non e mai esposta**, cifratura autenticata e rilevamento manomissioni |
| `tests/server/multi-tenant-isolation.test.mjs` | 29 | **Isolamento multi-tenant a runtime**: lettura, dettaglio, creazione, update e delete cross-tenant sulle funzioni vere di `resources.ts` |
| `tests/server/audit-log.test.mjs` | 14 | Registrazione degli eventi sensibili e assenza di dati riservati nel log |
| `tests/server/web-v1-regressions.test.mjs` | 16 | Proiezione `view=summary` della lista atleti, filtro e stampa della stagione attiva, sincronizzazione transazionale delle risorse club |
| `tests/lib/club-seasons.test.mjs` | 7 | Separazione delle stagioni e attribuzione dei record legacy alla stagione baseline |
| `tests/lib/category-birth-years.test.mjs` | 6 | Categorie con un solo anno di nascita: normalizzazione, etichetta, associazione atleta |
| `tests/lib/payment-enrollment.test.mjs` | 16 | Servizi opzionali nel totale e nelle rate, pro-rata applicato e diagnosticato, stato reale di ogni rata |
| `tests/lib/api-adapter-requests.test.mjs` | 4 | L'adapter fa **una** richiesta per select senza relazioni, e carica le relazioni solo quando servono |
| `tests/lib/trainer-delete.test.mjs` | 8 | L'eliminazione di un allenatore e persistita su tutte le origini che la lettura rimette insieme |
| `tests/lib/coalescing-saver.test.mjs` | 6 | L'autosave scrive una volta alla volta e accorpa le modifiche fatte durante l'attesa |
| `tests/lib/club-write-requests.test.mjs` | 8 | Quante richieste costa ogni operazione sul club e con quale proiezione di colonne |

## Isolamento multi-tenant: cosa dimostrano i test

`tests/server/multi-tenant-isolation.test.mjs` esercita le funzioni reali con
un doppio del client. Copre, per un utente che appartiene al solo club A:

| Operazione | Verifica |
|-----------|----------|
| `listResource` | la query parte gia con `where.organization_id` del club attivo; un `organization_id` o `club_id` altrui viene rifiutato |
| `listResource("clubs")` | `where.id` ristretto a `{ in: allowedOrganizationIds }`; senza club consentiti la lista e vuota |
| `getResourceById` | un record altrui non e leggibile |
| `createResource` | un `organization_id` altrui e rifiutato; senza, viene imposto il club attivo; senza club attivo non si crea nulla |
| `updateResource` | un record altrui non e modificabile e **resta intatto**; non si puo spostare un record in un altro club |
| `deleteResource` | un record altrui non e cancellabile e **resta presente** |
| Alias | `simplified_athletes` e `organizations` applicano lo stesso isolamento |
| Copertura d'insieme | **tutte** le risorse `club_resource` piu atleti, certificati, pagamenti, fatture e ricevute filtrano per organizzazione |

Due forme di rifiuto, entrambe corrette:

- modelli Prisma dedicati → `"Accesso negato"` (il record e letto e poi
  rifiutato);
- risorse generiche di club → `"non trovata"`, perche il filtro e **dentro la
  query**: il record altrui non viene mai letto. E la forma migliore, perche
  non conferma l'esistenza. Un test dedicato verifica che un id inventato e un
  id reale di un altro club diano **la stessa** risposta.

### Verificati per mutazione

I test sono stati validati sabotando temporaneamente il codice:

| Sabotaggio | Test falliti |
|-----------|--------------|
| `listResource` non impone piu `organization_id` | **8** |
| `ensureOrganizationAccess` non solleva piu | **11** |

## Cosa NON e coperto

- **`syncClubResourceItemsFromField`** — la sincronizzazione distruttiva
  `club_resource_items` ⇄ `clubs.<json>` non e ancora coperta. → WP-10
- **`src/lib/simplified-db.ts`** — 4.036 righe di logica di dominio.
- **Componenti e pagine** — nessun test di rendering.
- **Mobile** — nessun test. → [WP-24](20-work-packages.md)
- **End-to-end** — nessuna suite. Esistono script manuali
  (`scripts/verify-staging-access-switch.mjs`,
  `scripts/provision-staging-e2e.mjs`).
- **Migrazioni** — nessuna verifica automatica.

## Gate di qualita

Eseguiti automaticamente dalla CI su ogni push e pull request
(`.github/workflows/ci.yml`), e da eseguire in locale prima di ogni commit:

```bash
npm test           # 84/84 attesi
npm run typecheck  # nessun output = OK
npm run lint       # 0 errori (i warning esistenti sono tollerati)
npm run build      # deve completare
```

Per il mobile, separatamente:

```bash
cd easygamemobile
npm run check:types
npm run lint
```

La CI aggiunge anche `npx tsc --allowUnreachableCode false` e quattro
guardrail di sicurezza (nessun `.env` committato, nessun token noto, nessuna
connection string con credenziali, nessun `DATABASE_URL` nel mobile).

### Baseline verificata il 2026-08-22

| Gate | Esito |
|------|-------|
| `npm test` | 84 pass / 0 fail |
| `npm run typecheck` | OK |
| `npm run lint` | 0 errori, 53 warning (`no-img-element`, `exhaustive-deps`) |
| `npm run build` | OK, 120 route, 62 s |
| `easygamemobile` `check:types` | OK |
| `easygamemobile` `lint` | esce 0, 20 warning |
| `tsc --allowUnreachableCode false` | 0 segnalazioni |

**Il numero di warning ESLint non deve crescere.** Se un tuo commit lo aumenta,
correggi prima di committare.

## Come aggiungere un test

1. Il modulo da testare non deve avere JSX ne dipendenze da Next o dal DOM.
   Gli import senza estensione e l'alias `@/` sono gestiti dall'hook di
   risoluzione. Se il modulo tocca il database, inietta un doppio con
   `__setPrismaClientForTests()` e usa `createFakePrisma()`.
2. Crea `tests/<area>/<nome>.test.mjs`. Viene raccolto automaticamente.
3. Esegui `npm test`.

Se il modulo non e importabile, valuta un test di conformita statica sul
modello di `api-authorization.test.mjs`: leggi il sorgente e verifica
l'invariante.

## Regola

Ogni commit che tocca **autenticazione, ruoli, permessi o accesso ai dati**
deve includere o aggiornare un test. Non e negoziabile: e il presidio
automatico piu vicino all'isolamento multi-tenant, finche quello vero manca.
