# 05 — Architettura Mobile App

Cartella: `easygamemobile/`. **Progetto npm indipendente**: proprio
`package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.js`,
`node_modules`.

Stack: **Expo SDK 54 · React Native 0.81 · React 19 · React Navigation 7 ·
TanStack Query 5 · expo-secure-store**. TypeScript `~5.9`.

> Il mobile e **escluso** dal `tsconfig.json` e dal `.vercelignore` della Web
> App. Non viene mai compilato ne deployato insieme al Web.

## Stato attuale: app **solo per allenatori**, incompleta

Il navigator root (`client/navigation/RootStackNavigator.tsx`) ha tre stati:

```
non autenticato        → LoginScreen
autenticato, no club   → AccountHubScreen  (registrato come "ContextSelection")
autenticato, con club  → MainTabNavigator
```

`MainTabNavigator` espone 5 tab, tutte trainer:

| Tab | Stack | Schermata |
|-----|-------|-----------|
| Home | `HomeStackNavigator` | `TrainerHomeDashboardScreen` |
| Allenamenti | `TrainingsStackNavigator` | `TrainerTrainingsDashboardScreen` |
| Partite | `MatchesStackNavigator` | `TrainerMatchesDashboardScreen` |
| Atleti | `AthletesStackNavigator` | `TrainerAthletesScreen` → `TrainerAthleteProfileScreen` |
| Profilo | `ProfileStackNavigator` | `TrainerProfileDashboardScreen` |

Ogni stack include anche `NotificationsScreen`.

### Schermate collegate (9)

`LoginScreen`, `AccountHubScreen`, `NotificationsScreen`,
`TrainerHomeDashboardScreen`, `TrainerTrainingsDashboardScreen`,
`TrainerMatchesDashboardScreen`, `TrainerAthletesScreen`,
`TrainerAthleteProfileScreen`, `TrainerProfileDashboardScreen`.

### Schermate NON collegate (10) — generazione precedente

`HomeScreen`, `TrainingsScreen`, `MatchesScreen`, `AthletesScreen`,
`ContextSelectionScreen`, `ProfileScreen`, `TrainerHomeScreen`,
`TrainerMatchesScreen`, `TrainerTrainingsScreen`, `TrainerProfileScreen`.

Sono la v1 basata su dati mock. Non modificarle: se serve una funzione, portala
sulla v2 collegata.

## Layer dati — tre servizi, due generazioni

| File | Righe | Cosa fa | Stato |
|------|-------|---------|-------|
| `client/services/api.ts` | 912 | Client HTTP verso `/api/v1` della Web App. Base URL da `EXPO_PUBLIC_EASYGAME_API_URL` (o override salvato in SecureStore). Timeout 6 s, retry su 408/429/502/503/504. Stesso envelope `{data, error}`. | **In uso, fonte dati reale** |
| `client/services/mobile-backend-storage.ts` | 1.260 | Cache AsyncStorage + normalizzazione sopra `api.ts`. Chiavi `@easygame/mobile/*`. | **In uso** |
| `client/services/storage.ts` | 387 | **Dati mock hard-coded** (`MOCK_USER`, `MOCK_CLUBS`). Chiavi `@easygame/*`. | Usato solo dalle schermate non collegate |
| `client/services/mobile-storage-service.ts` | 1.240 | Terzo layer di storage, stessa forma di `mobile-backend-storage`. | **Orfano: nessun import** |

Regola pratica: **codice nuovo → `api.ts` + `mobile-backend-storage.ts`**.

## Autenticazione mobile

- Login via `POST /api/v1/auth/login` sulla stessa API del Web.
- Token salvato in **`expo-secure-store`** (`easygame_auth_token`), inviato come
  `Authorization: Bearer <token>`. Il server accetta sia il cookie sia il Bearer
  (`readAuthToken` in `src/lib/server/auth.ts`).
- Il club/contesto attivo viaggia con `x-active-club-id`, come nel Web.

## Nessun accesso diretto al database — ADR-0018

Il mobile parla **solo** con le API `/api/v1` della Web App.

Fino al 2026-08-22 la cartella conteneva anche uno scaffold Replit
(`server/`, Express con `registerRoutes()` vuota), uno schema **Drizzle**
(`shared/schema.ts`) che ridefiniva una tabella `users` con colonne
`username` / `password`, e uno script `db:push` che avrebbe applicato quello
schema al **database Neon reale**, dove `users` e la tabella gestita da Prisma.

Sono stati rimossi tutti: `server/`, `shared/`, `drizzle.config.ts`, `.replit`,
gli script `db:push` e `server:*`, l'alias `@shared` da `tsconfig.json` e
`babel.config.js`, e le dipendenze `drizzle-orm`, `drizzle-zod`, `drizzle-kit`,
`express`, `@types/express`, `pg`, `ws`, `http-proxy-middleware`, `tsx`.

> **Regola permanente:** nessuna connection string, nessun ORM e nessuno
> strumento di migrazione dentro `easygamemobile/`. Se al mobile serve un dato
> che l'API non espone, si aggiunge un endpoint lato Web.
>
> La CI lo verifica: il job `guardrails` fallisce se `DATABASE_URL` ricompare
> in `easygamemobile/`.

## Comandi

```bash
cd easygamemobile
npm install
npm run check:types     # tsc --noEmit  (verificato OK il 2026-08-22)
npm run lint            # expo lint
npm run expo:local      # avvio Expo in LAN
```

Configurazione: copiare `.env.example` e valorizzare
`EXPO_PUBLIC_EASYGAME_API_URL` con l'URL del backend (staging o locale).

## Cosa manca per completare il mobile

Vedi [11 — Capability](11-capabilities.md) e [WP-21..WP-25](20-work-packages.md):
aree parent/atleta assenti, nessun test, nessuna pipeline di build (EAS),
mock ancora presenti, tre layer di storage da consolidare a uno.
