# 05 — Architettura Mobile App

> **SVILUPPO DIFFERITO, salvo Identity & Access** (2026-08-22,
> [ADR-0025](18-decision-log.md#adr-0025--mobile-app-differita-la-priorita-e-easygame-web-v1-responsive);
> eccezione dichiarata in
> [ADR-0161](18-decision-log.md#adr-0161--la-decisione-esplicita-di-adr-0025-riguarda-identity--access-mobile-non-tutto-il-mobile-si-riprende-ma-solo-per-trainer-e-parent),
> 2026-09-10). La priorita assoluta resta completare EasyGame Web V1 e
> renderla responsive. **Nessuna nuova area funzionale Mobile** (Parent
> completo, nuove schermate Trainer) fino a una decisione esplicita. Sono
> state completate le **fondamenta di Identity & Access** (registrazione,
> verifica OTP, login, logout, recupero password, gate di ruolo) perche senza
> queste l'app non funzionava con un account reale — vedi la sezione
> "Autenticazione mobile" qui sotto, che descrive lo stato **attuale**, non
> congelato.

Cartella: `easygamemobile/`. **Progetto npm indipendente**: proprio
`package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.js`,
`node_modules`.

Stack: **Expo SDK 54 · React Native 0.81 · React 19 · React Navigation 7 ·
TanStack Query 5 · expo-secure-store**. TypeScript `~5.9`.

> Il mobile e **escluso** dal `tsconfig.json` e dal `.vercelignore` della Web
> App. Non viene mai compilato ne deployato insieme al Web.

## Design system mobile

**Source design version**: Claude Design, namespace
`EasyGameDesignSystem_845326`, ultimo sync dichiarato **2026-09-09**
(`design-source/github.md`). E l'unico export di design presente nel
repository — nessuna versione precedente con cui confrontarlo — verificato
prima di scrivere UI nuova, come richiesto: `design-source/readme.md`
descrive per intero il linguaggio visivo ("floodlit pitch": cielo notturno
navy a due riflettori, superfici in vetro smerigliato, angolo firmato a tre
raggi e un taglio, gradiente unico per "agisci qui", eyebrow tracciato su
display compatto). Riguarda **solo** la mobile app: "nothing here was
derived from [the web dashboard], and no web UI is defined" (readme.md) — la
dashboard Web non e stata ne consultata ne modificata per questo lavoro.

**Implementation version**: 2026-09-10, parziale — vedi sotto cosa e stato
portato e cosa no. Il codice sorgente del design system (CSS, JSX, HTML di
anteprima) vive in `design-source/` alla radice del repository, escluse le
parti binarie non necessarie (illustrazioni — l'app non ne usa — icone gia
vendorizzate via `@expo/vector-icons`, l'HTML di anteprima offline, il
bundle compilato dello strumento): sono elencate in `.gitignore` con la
motivazione.

### Come si usa

I token vivono in `client/constants/theme.ts`, sotto il namespace `EG*`
(`EGColors`, `EGInk`, `EGGlass`, `EGCorner`, `EGGradients`, `EGShadow`,
`EGTypography`) — **additivo**: `Colors`/`Spacing`/`BorderRadius`/
`Typography` esistenti non cambiano, e ogni schermata che li usa gia
continua a funzionare senza modifiche. I componenti vivono in
`client/components/signature/` (barrel: `index.ts`), **fratelli** dei
componenti in `client/components/*`, non sostituti: `Button`/`Card`/`Badge`
restano quelli che le schermate esistenti gia usano.

| Componente firma | File | Da (design-source) |
|---|---|---|
| `GlassSurface` / `GlassCard` | `signature/GlassSurface.tsx`, `GlassCard.tsx` | `components/core/Card.jsx` |
| `GradientFill` | `signature/GradientFill.tsx` | pattern gia in `EasyGameGradientBackground.tsx`, generalizzato ai 6 gradienti di `EGGradients` |
| `SignatureText` | `signature/SignatureText.tsx` | `components/core/Text.jsx` |
| `IconChip` | `signature/IconChip.tsx` | `components/core/IconChip.jsx` |
| `StatusPill` | `signature/StatusPill.tsx` | `components/core/Badge.jsx` |
| `ActionButton` | `signature/ActionButton.tsx` | `components/core/Button.jsx` |
| `MetaRow` | `signature/MetaRow.tsx` | `components/patterns/MetaRow.jsx` |
| `Floodlight` | `signature/Floodlight.tsx` | `components/brand/Floodlight.jsx` |
| `AppBar` | `signature/AppBar.tsx` | `components/brand/AppBar.jsx` |
| `Dock` | `signature/Dock.tsx` | `components/brand/TabBar.jsx` — **applicato**: e la chrome reale di `MainTabNavigator`, non solo disponibile |
| `StateMessage` | `signature/StateMessage.tsx` | **estensione**, non nel design system: vedi sotto |

Traduzione CSS → React Native (dove non e 1:1) documentata nel commento di
testa di `theme.ts`: `border-radius` a quattro valori diventa quattro
proprieta separate (`EGCorner`), `backdrop-filter: blur()` diventa
`expo-blur`'s `BlurView` dietro un overlay tinteggiato (gia dipendenza del
progetto), i gradienti passano da CSS a `react-native-svg`
`LinearGradient`/`RadialGradient` (gia dipendenza, stesso pattern che
`EasyGameGradientBackground.tsx` usava solo per il gradiente di marca).

### Estensione dichiarata: `StateMessage`

Il design system non definisce una superficie per loading/vuoto-reale/
accesso-negato/errore-di-rete — solo un `EmptyState` con uno slot per
illustrazione (inutilizzato qui: "no illustrations" e un requisito
dell'app). `StateMessage` e un'estensione nello stesso linguaggio (icon
chip, eyebrow, testo muto, un'azione opzionale) pensata per non ripetere il
difetto della dashboard Web dove un 403/500 diventa una lista vuota
indistinguibile (vedi il report di audit Identity & Access). Non e nel
namespace del design system originale — dichiarato qui, non presentato come
se lo fosse.

### Cosa non e stato portato (gap dichiarati, non dimenticanze)

- **Poppins**: nessun binario di font fornito col design system e nessuno
  gia caricato nell'app (`@expo-google-fonts/nunito` e una dipendenza
  presente ma **mai usata** — debito preesistente, non toccato). `theme.ts`
  usa lo stack di sistema esistente con i soli pesi/spaziature del design
  system. Caricare un Google Font e una decisione a se (nuova dipendenza +
  passo di caricamento in `App.tsx`), non un effetto collaterale di questo
  WP.
- **Linee del campo** (`repeating-linear-gradient` sullo sfondo cielo):
  richiederebbero un pattern SVG piastrellato per un dettaglio a peso visivo
  minimo su schermo telefono. `Floodlight` riproduce il gradiente navy e i
  due riflettori, non le righe.
- **Componenti non ancora portati**: `NumberTile`, `SelectableAthleteRow`,
  `EventCard`, `SectionHero`, `StatCard`, `HighlightCard` — servono a
  ridisegnare Allenamenti/Gare/Home (numero di maglia, riga atleta
  selezionabile, la card evento con la rotaia oraria), che restano
  **invariate** in questo giro (vedi sotto). Arriveranno quando quelle
  schermate verranno riprese.
- **Dark mode**: i token esistono (`.eg-dark` lato CSS) ma senza schede di
  esempio nel design system stesso; non modellato lato RN.

### Perche solo il Dock e stato applicato, non le altre quattro tab

Le schermate Trainer esistenti (Home, Allenamenti, Gare, Atleti) restano sul
linguaggio visivo attuale — sfondo piatto, `Card`/`Button`/`Badge` esistenti
— **non ridisegnate in questo giro**: la richiesta di WP2 e la foundation
"per le schermate nuove", e ridisegnare quattro schermate gia funzionanti e
un lavoro a se, con un suo rischio di regressione. Il Dock (guscio delle tab,
non le schermate che contiene) e stata l'unica eccezione: e chrome
condiviso, non contenuto di schermata, appare su **ogni** schermata Trainer
per definizione, ed e uno dei sei elementi che il design system dichiara
riconoscibili "su ogni schermata" — il beneficio di applicarlo era immediato
e il rischio contenuto (la logica di visibilita per permesso e la mappa
`tabBarIcon` non sono state toccate, solo la chrome attorno).

Conseguenza intenzionale: le **cinque sezioni nuove** di WP3 (Bacheca,
Documenti, Appuntamenti, Compensi, Squadre) usano il linguaggio nuovo per
intero (`Floodlight` + `AppBar` + `GlassCard`), raggiunte da un hub in
Profilo — sono internamente coerenti fra loro, le quattro tab primarie sono
internamente coerenti fra loro, e la sola transizione visibile e nel passare
dalle une alle altre. E un rollout incrementale dichiarato, non
un'incoerenza sfuggita: la stessa `docs/knowledge-base/10-ui-ux-conventions.md`
andra aggiornata quando il reskin delle quattro tab primarie verra
programmato.

## Stato attuale: Trainer completo, Parent segnaposto, gate su tutto il resto

Il navigator root (`client/navigation/RootStackNavigator.tsx`) e il **solo**
punto che decide quale guscio mostrare — nessuna schermata a valle rifa questo
controllo:

```
non autenticato                  → Login | Register | VerifyOtp | ForgotPassword
autenticato, nessun contesto     → AccountHubScreen  (registrato come "ContextSelection")
contesto attivo, ruolo Trainer   → MainTabNavigator
contesto attivo, ruolo Parent    → ParentStackNavigator (ParentHomeScreen, segnaposto)
contesto attivo, altro ruolo     → UnsupportedRoleScreen ("EasyGame Mobile è in aggiornamento")
```

Il ruolo che decide l'ultimo passo lo calcola `resolveMobileRoleGate`
(`client/lib/mobile-role-gate.ts`): specchio minimo di `normalizeAccessRole`
lato Web (stessi alias, stessa lettura di un gettone `custom:<base>:<nome>`),
non una seconda fonte di permessi — il server resta autorevole su ogni
chiamata API. Owner, Club Manager, Collaborator, Staff non-Trainer, Athlete e
i ruoli di club personalizzati non basati su Trainer finiscono tutti su
`UnsupportedRoleScreen`, con l'uscita per tornare alla selezione o fare
logout.

`MainTabNavigator` espone 5 tab, tutte trainer (**non riscritte in questo
giro**):

| Tab | Stack | Schermata |
|-----|-------|-----------|
| Home | `HomeStackNavigator` | `TrainerHomeDashboardScreen` |
| Allenamenti | `TrainingsStackNavigator` | `TrainerTrainingsDashboardScreen` |
| Partite | `MatchesStackNavigator` | `TrainerMatchesDashboardScreen` |
| Atleti | `AthletesStackNavigator` | `TrainerAthletesScreen` → `TrainerAthleteProfileScreen` |
| Profilo | `ProfileStackNavigator` | `TrainerProfileDashboardScreen` |

Ogni stack include anche `NotificationsScreen`.

### Schermate collegate (15)

Identity & Access: `LoginScreen`, `RegisterScreen`, `VerifyOtpScreen`,
`ForgotPasswordScreen`, `AccountHubScreen`, `UnsupportedRoleScreen`.

Trainer (invariate): `NotificationsScreen`, `TrainerHomeDashboardScreen`,
`TrainerTrainingsDashboardScreen`, `TrainerMatchesDashboardScreen`,
`TrainerAthletesScreen`, `TrainerAthleteProfileScreen`,
`TrainerProfileDashboardScreen`.

Parent (segnaposto, `ParentStackNavigator`): `ParentHomeScreen` — mostra
contesto attivo, cambio club/accesso e logout; nessuna funzionalita di
dominio (figli, allenamenti, pagamenti, documenti — WP successivi).

### Schermate NON collegate (10) — generazione precedente

`HomeScreen`, `TrainingsScreen`, `MatchesScreen`, `AthletesScreen`,
`ContextSelectionScreen`, `ProfileScreen`, `TrainerHomeScreen`,
`TrainerMatchesScreen`, `TrainerTrainingsScreen`, `TrainerProfileScreen`.

Sono la v1 basata su dati mock. Non modificarle: se serve una funzione, portala
sulla v2 collegata.

## Layer dati — due servizi in uso, piu un mock

| File | Righe | Cosa fa | Stato |
|------|-------|---------|-------|
| `client/services/api.ts` | 995 | Client HTTP verso `/api/v1` della Web App, auth inclusa (register/login/verify/forgot-password). Base URL da `EXPO_PUBLIC_EASYGAME_API_URL` (o override salvato in SecureStore). Timeout 6 s, retry solo su risposte senza corpo (408/429/502/503/504 senza payload — una risposta analizzata, anche un 429, non si ripete). Stesso envelope `{data, error}`. | **In uso, fonte dati reale** |
| `client/services/mobile-backend-storage.ts` | 1.292 | Cache AsyncStorage + normalizzazione sopra `api.ts`. Chiavi `@easygame/mobile/*`. | **In uso** |
| `client/services/storage.ts` | 387 | **Dati mock hard-coded** (`MOCK_USER`, `MOCK_CLUBS`). Chiavi `@easygame/*`. | Usato solo dalle schermate non collegate (R8) |
| ~~`client/services/mobile-storage-service.ts`~~ | 1.240 | Terzo layer di storage, duplicato di `mobile-backend-storage` | **Rimosso** il 2026-08-22: zero import, riclassificato SAFE |

Regola pratica: **codice nuovo → `api.ts` + `mobile-backend-storage.ts`**.

## Autenticazione mobile

Stesso backend, stessa identita, stesse credenziali e stesse membership della
Web App: nessun sistema auth parallelo. Tutta l'interpretazione delle risposte
vive in un modulo puro, `client/lib/auth-flow.ts` (`interpretAuthResponse`,
`interpretAckResponse`), senza dipendenze da React Native — provato in
`easygamemobile/tests/auth-flow.test.ts` senza rete ne SecureStore.

- **Registrazione**: `POST /api/v1/auth/register` (stesso endpoint del Web).
  Risponde **sempre 202**, mai 201 — un vecchio controllo lato client
  cercava 201 e classificava come fallita ogni registrazione riuscita, cioe
  la registrazione mobile non funzionava mai contro un backend reale. Il
  telefono e raccolto sempre (`isPhoneNumberRequiredAtSignup`, ADR-0132): il
  formato lo valida solo il server.
- **Verifica OTP**: `VerifyOtpScreen` gestisce email e telefono con lo stesso
  componente, parametrizzato dal canale. Nessun `emailPreviewCode` /
  `phonePreviewCode` entra piu nel percorso di produzione — quei valori
  esistono nella risposta **solo** fuori produzione
  (`shouldExposeVerificationPreviewCode`, `AUTH_ALLOW_TEST_CODES=true`) e
  prima venivano confermati automaticamente al posto della persona, rendendo
  la registrazione utilizzabile solo in ambiente di test. L'unico uso che ne
  resta e precompilare il campo per chi sviluppa (gated da `__DEV__`), mai
  inviarli al posto dell'utente. Reinvio con countdown **derivato
  dall'intestazione `Retry-After`** che il server restituisce sui 429 (mai un
  timer client-side indovinato). Il codice sbagliato e quello scaduto
  condividono lo stesso messaggio — il backend non li distingue di proposito
  (anti-enumerazione) — quindi non li distingue nemmeno la UI.
- **Login**: `POST /api/v1/auth/login`, invariato nel contratto. Se il
  telefono blocca la sessione (`isPhoneVerificationBlocking`, rilevante solo
  se `SMS_PROVIDER` e configurato — oggi non lo e, `.env.example`), il login
  incatena alla stessa `VerifyOtpScreen` sul canale telefono.
- **Logout**: `api.logout()` chiama `POST /api/v1/auth/logout` (revoca
  server-side reale) prima di cancellare il token locale — gia cosi prima di
  questo giro, verificato e non modificato.
- **Recupero password**: `ForgotPasswordScreen` chiama
  `POST /api/v1/auth/password/forgot`, stesso endpoint del Web, risposta
  generica identica esista o no l'account. Il completamento
  (`/api/v1/auth/password/reset`) pretende un identificativo e un token che
  **solo** il link nell'email porta; senza deep linking configurato (nessuna
  prop `linking` su `NavigationContainer`), quel link si apre nel browser del
  telefono sulla pagina Web `/auth/reset-password` — stesso sistema, ultimo
  passo fuori dall'app. **Gap aperto**: un completamento nativo in-app
  richiede di configurare i deep link, non fatto in questo giro.
- Token salvato in **`expo-secure-store`** (`easygame_auth_token`), inviato come
  `Authorization: Bearer <token>`. Il server accetta sia il cookie sia il Bearer
  (`readAuthToken` in `src/lib/server/auth.ts`). Nessuna credenziale in
  AsyncStorage (che tiene solo il contesto club/ruolo non sensibile).
- Il club/contesto attivo viaggia con `x-active-club-id`/`x-active-access-role`,
  come nel Web; l'attivazione (`POST /api/v1/auth/memberships/activate`) porta
  anche `role` e `membership_id` quando noti
  (`client/lib/activation-request.ts`), per scegliere la tessera giusta se la
  stessa persona ha piu ruoli sullo stesso club (ADR-0102).

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
npm run check:types     # tsc --noEmit
npm run lint            # expo lint
npm run test            # node --test sui moduli puri in client/lib/**
npm run expo:local      # avvio Expo in LAN
```

### Test — `easygamemobile/tests/`

Nessun framework di test RN (jest-expo, Testing Library) e installato: i test
coprono i moduli **puri** che decidono il flusso Identity & Access
(`auth-flow.ts`, `mobile-role-gate.ts`, `activation-request.ts`), eseguiti con
il test runner nativo di Node (`node --import tsx --test`) senza rete,
SecureStore o rendering — `api.ts` e `mobile-backend-storage.ts` importano
moduli nativi Expo e non sono testabili sotto Node senza mock pesanti; non lo
sono in questo giro. Discovery su `tests/**/*.test.ts`, nessuna voce da
aggiungere altrove per un file nuovo.

### Verifica di avvio reale — 2026-08-22

Typecheck e lint non dimostrano che l'app parta: il grafo di import viene
risolto da Metro, non da `tsc`. Verifica effettuata:

```bash
EXPO_NO_DEPENDENCY_VALIDATION=1 CI=1 npx expo start --offline --port 8082
curl "http://localhost:8082/client/index.bundle?platform=android&dev=true"
```

Esito: Metro avviato, **bundle Android costruito, 12,9 MB**, nessun errore di
risoluzione. Tutte e otto le schermate collegate risultano nel bundle
(`LoginScreen`, `AccountHubScreen`, `NotificationsScreen`, e le cinque
`Trainer*DashboardScreen`/`TrainerAthletesScreen`). Il layer dati rimosso non
compare.

Nota: l'entry point e `client/index.bundle`, non `index.bundle`, perche
`package.json` punta a `client/index.js`.

**Non ancora verificato:** esecuzione su un dispositivo o emulatore reale.

Configurazione: copiare `.env.example` e valorizzare
`EXPO_PUBLIC_EASYGAME_API_URL` con l'URL del backend (staging o locale).

### Verifica di avvio reale — 2026-09-10 (Identity & Access)

Dopo le schermate nuove (`RegisterScreen`, `VerifyOtpScreen`,
`ForgotPasswordScreen`, `UnsupportedRoleScreen`, `ParentHomeScreen`) e il gate
di ruolo: `npx expo export --platform ios` completato senza errori di
risoluzione, 2410 moduli, bundle iOS 5,97 MB. Non e un avvio su dispositivo —
resta vero il limite dichiarato sopra — ma prova che il grafo di import di
Metro risolve tutte le schermate nuove insieme a quelle esistenti.

## Cosa manca per completare il mobile

Identity & Access e le fondamenta di ruolo sono a posto (vedi sopra). Restano
aperti, in ordine indicativo:

- **Area Parent reale**: figli/multi-figlio, allenamenti/gare con RSVP,
  pagamenti, documenti, bacheca, notifiche — oggi solo `ParentHomeScreen`
  segnaposto.
- **Sezioni Trainer mancanti rispetto al Web**: bacheca, documenti propri,
  appuntamenti, compensi (vedi il report di audit Trainer/Parent per i due
  difetti server-side da correggere prima: allow-list documenti trainer e
  campo `note` obbligatorio sul rifiuto appuntamento).
- **Notifiche push e deep linking**: nessuno dei due e configurato;
  il completamento nativo del recupero password ne dipende.
- **Link esterni centralizzati**: oggi hardcoded sia lato Web sia lato
  mobile, nessuna ownership CediSoft dichiarata.
- Nessuna pipeline di build (EAS), mock ancora presenti nelle schermate v1
  non collegate.

Vedi [11 — Capability](11-capabilities.md) e [WP-21..WP-25](20-work-packages.md).
