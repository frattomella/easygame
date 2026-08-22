# 15 — Testing

## Stack

**Nessun framework esterno.** Si usa il test runner nativo di Node 22
(`node:test` + `node:assert/strict`), con `--experimental-strip-types` per
importare direttamente i `.ts` sorgente.

```jsonc
"test":      "npm run test:auth",
"test:auth": "node --experimental-strip-types --experimental-test-isolation=none --test <lista file>"
```

I file di test hanno estensione `.mjs` e importano i moduli TypeScript con il
percorso completo:

```js
import { validatePassword } from "../../src/lib/auth/password-policy.ts";
```

Conseguenza pratica: **si possono testare solo moduli senza JSX e senza
dipendenze da Next o dal browser**. Per questo la copertura si concentra sulle
policy pure di `src/lib/auth/` e `src/lib/email/`.

## Cosa e coperto oggi — 30 test, 7 file

| File | Test | Copre |
|------|------|-------|
| `tests/auth/auth-security.test.mjs` | 5 | Password policy, ruoli in registrazione pubblica, policy rate limit, OTP (max tentativi, esposizione preview code), provider telefono |
| `tests/auth/role-authorization.test.mjs` | 5 | Matrice `canAccessPath` / `canAccessClubResource` per i 7 ruoli |
| `tests/auth/active-club-access.test.mjs` | 5 | Selezione e persistenza del club attivo, membership memorizzata |
| `tests/auth/request-deduper.test.mjs` | 5 | Deduplicazione richieste concorrenti |
| `tests/auth/session-sync.test.mjs` | 3 | Invalidazione cache e handler `unauthorized` |
| `tests/auth/membership-load-result.test.mjs` | 3 | Normalizzazione del risultato di caricamento membership |
| `tests/email/smtp-config.test.mjs` | 4 | Validazione config SMTP, **la password non e mai esposta**, cifratura autenticata e rilevamento manomissioni |

## Cosa NON e coperto

- **Route handler API** — nessun test su `/api/v1/**`. In particolare non e
  testato l'isolamento multi-tenant di `listResource` / `createResource`, che
  e la protezione piu importante del sistema.
- **`src/lib/server/resources.ts`** — 1.919 righe, zero test. Include la
  sincronizzazione distruttiva `club_resource_items` ⇄ `clubs.<json>`.
- **`src/lib/simplified-db.ts`** — 4.036 righe di logica di dominio, zero test.
- **Componenti e pagine** — nessun test di rendering.
- **Mobile** — nessun test.
- **End-to-end** — nessuno. Esistono script manuali
  (`scripts/verify-staging-access-switch.mjs`,
  `scripts/provision-staging-e2e.mjs`) ma non una suite.
- **Migrazioni** — nessuna verifica automatica.

## Gate di qualita da eseguire prima di ogni commit

```bash
npm test           # 30/30 attesi
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

### Baseline verificata il 2026-08-22

| Gate | Esito |
|------|-------|
| `npm test` | 30 pass / 0 fail |
| `npm run typecheck` | OK |
| `npm run lint` | 0 errori, 53 warning (tutti `no-img-element` e `exhaustive-deps`) |
| `npm run build` | OK, 116 route |
| `easygamemobile` `check:types` | OK |
| `tsc --allowUnreachableCode false` | 0 segnalazioni |

**Il numero di warning ESLint non deve crescere.** Se un tuo commit lo aumenta,
correggi prima di committare.

## Come aggiungere un test

1. Il modulo da testare deve essere **puro**: nessun import di `next/*`, nessun
   JSX, nessuna dipendenza dal DOM. Se non lo e, estrai la logica in
   `src/lib/<dominio>.ts` e testa quella.
2. Crea `tests/<area>/<nome>.test.mjs`.
3. **Aggiungi il file alla lista in `package.json` → `test:auth`.** Il runner
   non fa discovery automatica: un file non elencato non viene eseguito. Questa
   e la dimenticanza piu comune.
4. Esegui `npm test`.

> Rinominare `test:auth` in qualcosa di piu generale, o passare alla discovery
> automatica, e [WP-04](20-work-packages.md).

## Regola

Ogni commit che tocca **autenticazione, ruoli, permessi o accesso ai dati**
deve includere o aggiornare un test. Non e negoziabile: e l'unico presidio
automatico sull'isolamento multi-tenant.
