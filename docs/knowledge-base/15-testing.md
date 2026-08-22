# 15 — Testing

## Stack

**Nessun framework esterno.** Si usa il test runner nativo di Node 22
(`node:test` + `node:assert/strict`), con `--experimental-strip-types` per
importare direttamente i `.ts` sorgente.

```jsonc
"test":      "npm run test:unit",
"test:unit": "node --experimental-strip-types --experimental-test-isolation=none --test \"tests/**/*.test.mjs\""
```

Dal 2026-08-22 la **discovery e automatica**: un file nuovo sotto `tests/` viene
eseguito senza toccare `package.json`. Prima andava elencato a mano ed era la
dimenticanza piu frequente.

I file di test hanno estensione `.mjs` e importano i moduli TypeScript con il
percorso completo:

```js
import { validatePassword } from "../../src/lib/auth/password-policy.ts";
```

Conseguenza pratica: si possono testare **solo moduli senza JSX, senza
dipendenze da Next o dal browser, e che usino import con estensione**.
`src/lib/server/resources.ts` non e importabile proprio per questo (usa
`import { prisma } from "./prisma"` e costruisce `PrismaClient` a livello di
modulo).

Dove il runtime non e raggiungibile si usano **test di conformita statica** sul
sorgente: leggono i file e verificano invarianti strutturali. Sono meno
espressivi di un test di comportamento, ma colgono la regressione che conta —
un endpoint nuovo che dimentica il controllo.

## Cosa e coperto oggi — 55 test, 10 file

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

## Cosa NON e coperto

- **Isolamento multi-tenant a runtime** — la lacuna piu importante.
  `listResource` e `ensureOrganizationAccess` sono verificati solo
  staticamente: nessun test dimostra che una query restituisca davvero solo i
  dati del club consentito. Richiede di rendere `resources.ts` importabile o
  iniettabile. → [WP-04](20-work-packages.md)
- **`src/lib/server/resources.ts`** — 1.919 righe, inclusa la sincronizzazione
  distruttiva `club_resource_items` ⇄ `clubs.<json>`.
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
npm test           # 55/55 attesi
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
| `npm test` | 55 pass / 0 fail |
| `npm run typecheck` | OK |
| `npm run lint` | 0 errori, 53 warning (`no-img-element`, `exhaustive-deps`) |
| `npm run build` | OK, 120 route, 62 s |
| `easygamemobile` `check:types` | OK |
| `easygamemobile` `lint` | esce 0, 20 warning |
| `tsc --allowUnreachableCode false` | 0 segnalazioni |

**Il numero di warning ESLint non deve crescere.** Se un tuo commit lo aumenta,
correggi prima di committare.

## Come aggiungere un test

1. Il modulo da testare deve essere **puro**: nessun import di `next/*`, nessun
   JSX, nessuna dipendenza dal DOM, e import con estensione esplicita. Se non
   lo e, estrai la logica in `src/lib/<dominio>.ts` e testa quella.
2. Crea `tests/<area>/<nome>.test.mjs`. Viene raccolto automaticamente.
3. Esegui `npm test`.

Se il modulo non e importabile, valuta un test di conformita statica sul
modello di `api-authorization.test.mjs`: leggi il sorgente e verifica
l'invariante.

## Regola

Ogni commit che tocca **autenticazione, ruoli, permessi o accesso ai dati**
deve includere o aggiornare un test. Non e negoziabile: e il presidio
automatico piu vicino all'isolamento multi-tenant, finche quello vero manca.
