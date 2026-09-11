# 05 — Architettura Mobile App

> **SVILUPPO DIFFERITO, salvo le eccezioni dichiarate** (2026-08-22,
> [ADR-0025](18-decision-log.md#adr-0025--mobile-app-differita-la-priorita-e-easygame-web-v1-responsive);
> eccezioni in
> [ADR-0161](18-decision-log.md#adr-0161--la-decisione-esplicita-di-adr-0025-riguarda-identity--access-mobile-non-tutto-il-mobile-si-riprende-ma-solo-per-trainer-e-parent) (Identity & Access),
> [ADR-0162](18-decision-log.md#adr-0162--leccezione-di-adr-0161-si-allarga-parita-funzionale-trainer-non-solo-identity--access) (parita Trainer),
> [ADR-0163](18-decision-log.md#adr-0163--leccezione-si-allarga-ancora-larea-parent-reale-sugli-stessi-contratti-del-web) /
> [ADR-0164](18-decision-log.md#adr-0164--il-batch-parent-si-chiude-pagamenti-documenti-consensi-segreteria-strutture-iscrizione-contatti)
> (area Parent, WP4-WP9) e
> [ADR-0165](18-decision-log.md#adr-0165--il-reskin-delle-quattro-tab-trainer-primarie-wp10) (reskin
> visivo delle quattro tab Trainer primarie, WP10, 2026-09-10),
> [ADR-0166](18-decision-log.md#adr-0166--push-deep-linking-e-recupero-password-nativo-restano-unanagrafica-non-una-pipeline-di-invio-wp11)
> (push/deep linking/recupero password, WP11),
> [ADR-0167](18-decision-log.md#adr-0167--candidato-al-rilascio-ios-hardening-non-nuove-funzioni-wp12)
> (candidato iOS, WP12, entrambe 2026-09-10) e
> [ADR-0168](18-decision-log.md#adr-0168--reskin-completo-a-egds-v300-easygame-blue-trainer-e-parent-ancora-solo-visivo-wp13)
> (reskin visivo completo a EGDS v3.0.0, Trainer **e** Parent, WP13,
> 2026-09-11). La priorita assoluta resta completare EasyGame Web V1 e
> renderla responsive. **Nessuna nuova area funzionale Mobile** oltre a
> quanto queste eccezioni coprono, fino a una decisione esplicita — WP10 e
> WP13 sono **visivi**, non aggiungono funzionalita (il tri-state delle
> presenze, rinviato da ADR-0168 punto 3, e stato poi portato nel passaggio
> di parita visiva **senza** cambiare endpoint: vedi l'addendum "parita
> visiva" di ADR-0168 e la sezione "WP13 — parita visiva" qui sotto). Vedi
> la sezione "Autenticazione mobile" qui sotto, che descrive lo stato
> **attuale**, non congelato.

Cartella: `easygamemobile/`. **Progetto npm indipendente**: proprio
`package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.js`,
`node_modules`.

Stack: **Expo SDK 54 · React Native 0.81 · React 19 · React Navigation 7 ·
TanStack Query 5 · expo-secure-store**. TypeScript `~5.9`.

> Il mobile e **escluso** dal `tsconfig.json` e dal `.vercelignore` della Web
> App. Non viene mai compilato ne deployato insieme al Web.

## Design system mobile

**Source design version**: Claude Design, namespace
`EasyGameDesignSystem_845326`, attualmente **EGDS v3.0.0 "EasyGame blue",
2026-09-11** (`design-source/CHANGELOG.md`) — CURRENT. Non una nuova
direzione: una correzione di colore, chrome e branding sull'artefatto
approvato gia consolidato in `design-source/uploads/Extending EasyGame
Design System/` (verificato identico all'input fornito per WP13). Guida di
implementazione normativa: `design-source/guidelines/migration-v3.md`
(supersede `guidelines/archive/v2.3/trainer-migration.md`). Versioni
precedenti: v2.3.0 "Real data" (2026-09-10, WP10), v2.2.0 "Sheet & shell"
(2026-09-10, formalizza `BottomSheet`/`ParentPrimaryScreenLayout` da
implementazione e affina i componenti Parte C), v2.1.0 "Parent-ready"
(2026-09-10, formalizza `StateMessage`/`SecondaryScreenLayout`/
`SignatureInput` e specifica per intero le componenti Parte B/C), v2.0.0
"Floodlit" (2026-09-09, la firma visiva: cielo notturno navy a due
riflettori, superfici in vetro smerigliato, angolo firmato, gradiente unico
per "agisci qui", eyebrow su display compatto) e v1.0.0 (2026-09-09,
estrazione iniziale). Verificato prima di scrivere UI nuova in ciascun WP,
come richiesto — mai usata una versione precedente a quella disponibile al
momento: i WP4-6 sono stati costruiti quando v2.1.0 era CURRENT (dichiarato
li sotto cosi), i WP7-9 con v2.2.0, WP10 con v2.3.0, **WP13 con v3.0.0**.
Riguarda **solo** la mobile app: "nothing here was derived from [the web
dashboard], and no web UI is defined" (readme.md) — la dashboard Web non e
stata ne consultata ne modificata per nessuno di questi WP.

**Implementation version**: 2026-09-11, parziale — vedi sotto cosa e stato
portato e cosa no. Il codice sorgente del design system (CSS, JSX, HTML di
anteprima, le guide normative in `guidelines/`) vive in `design-source/`
alla radice del repository, escluse le parti binarie non necessarie
(illustrazioni — l'app non ne usa — icone gia vendorizzate via
`@expo/vector-icons`, l'HTML di anteprima offline, il bundle compilato dello
strumento): sono elencate in `.gitignore` con la motivazione.

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
| `Dock` | `signature/Dock.tsx` | `components/brand/TabBar.jsx` — **applicato**: e la chrome reale di `MainTabNavigator` **e** `ParentTabNavigator` |
| `StateMessage` | `signature/StateMessage.tsx` | **estensione**, non nel design system: vedi sotto |
| `SecondaryScreenLayout` | `signature/SecondaryScreenLayout.tsx` | formalizzato in EGDS v2.1.0 Parte A (nato come estensione WP3) — esteso in WP10 con `skyHeight` (le tab primarie aprono un `SectionHero`, 330–360px contro il default 300), `onNotifications`/`notificationCount` (il campanello che l'header nativo dava) e `refreshControl` (pull-to-refresh, passato al proprio `ScrollView`); tutti opzionali, i sei chiamanti precedenti non cambiano |
| `SignatureInput` | `signature/SignatureInput.tsx` | `components/core/Input.jsx`, formalizzato in EGDS v2.1.0 Parte A |
| `NumberTile` | `signature/NumberTile.tsx` | `components/core/NumberTile.jsx` (spec Parte B, §B1) — portato in WP4, prima del resto di Parte B, perche `ChildSwitcher` lo richiede subito |
| `ChildSwitcher` | `signature/ChildSwitcher.tsx` | spec Parte C, §C1 + prototipo v3 `showChildBar` — pillola dark-glass 56px con glifo ad anello-accento (iniziali/foto: un figlio collegato non porta un numero di maglia), nome e squadra in eyebrow, chevron; il foglio "Cambia atleta" ha righe di scelta con anello e Annulla + Conferma |
| `BottomSheet` | `signature/BottomSheet.tsx` | **estensione**: implementa il "Livello 4" di `guidelines/navigation.md` (foglio), non normato come componente a se nello spec — vedi sotto |
| `ParentPrimaryScreenLayout` | `signature/ParentPrimaryScreenLayout.tsx` | **composizione locale**, non un componente dello spec: `Floodlight` + `AppBar` + `ChildSwitcher`, centralizza la regola "lo switcher sta sotto l'AppBar su ogni schermata primaria Parent" (`guidelines/navigation.md`) |
| `EventCard` | `signature/EventCard.tsx` | `components/patterns/EventCard.jsx` (spec Parte B, §B2) — portato in WP5 per Calendario/Home Parent |
| `SectionHero` | `signature/SectionHero.tsx` | `components/patterns/SectionHero.jsx` (spec Parte B, §B4) |
| `StatCard` | `signature/StatCard.tsx` | `components/patterns/StatCard.jsx` (spec Parte B, §B5) |
| `RSVPControl` | `signature/RSVPControl.tsx` | spec Parte C, §C2 + prototipo v3 `actionsRsvp` — due bottoni sulla scheda ("Ci sarà" successo / "Non ci sarà" secondario); disegna solo le transizioni che il server ha gia deciso, mai un terzo stato inventato. Montato da `components/parent/ParentEventCard.tsx` (Home, Calendario, dettaglio: una composizione sola) |
| `NotificationRow` | `signature/NotificationRow.tsx` | spec Parte C, §C6 |
| `AccountAccessCard` | `signature/AccountAccessCard.tsx` | spec Parte C, §C10 — applicato in `AccountHubScreen` |
| `PaymentCard` | `signature/PaymentCard.tsx` | spec Parte C, §C3 + prototipo v3 `payments` — striscia, piano, titolo, importo a destra, pill + scadenza, barra azioni (Paga ora · Ricevuta · Fattura · Dettaglio); formato valuta `it-IT`, stato mai ricalcolato da un orologio locale |
| `GlassRow` | `signature/GlassRow.tsx` | prototipo v3 `GLASS_ROW` — **sostituisce** `DocumentRow`/`DocumentCard`/`ConsentRow`/`AppointmentCard`/`BookingCard`/`EnrollmentStatusCard`/`HighlightCard` (rimossi nel passaggio di parita visiva): una riga di vetro sola — icona, titolo, meta, coda (pill/contatore), **o** chevron **o** barra azioni etichettata (regola `migration-v3.md` passo 4) |
| `ActionBarButton` | `signature/ActionBarButton.tsx` | prototipo v3 `act(...)` — il bottone 36px "icona + parola" della barra azioni (Carica documento, Visualizza, Scarica, Paga ora, Ricevuta, Fattura, Dettaglio, Conferma, Riprogramma…) |
| `NavTile` / `NavTileGrid` | `signature/NavTile.tsx` | design `IA e Home` §1a — la tile di scorciatoia della Home (griglia 4×2 con badge numerati) |
| `SectionLabel` | `signature/SectionLabel.tsx` | prototipo v3 — eyebrow di sezione con contatore o azione a destra ("Le tue sezioni · 8", "Oggi · Segna tutte come lette") |
| `SummaryCard` | `signature/SummaryCard.tsx` | design §3c/3d e §2b — la scheda di vetro scuro in testa alle schermate secondarie e alla Home Parent, che parte dentro il cielo e copre l'orizzonte |
| `InfoNote` | `signature/InfoNote.tsx` | prototipo v3 — la nota tinta blu ("Formati accettati: PDF, JPG, PNG…"); varianti `warning`/`danger` per gli errori inline |
| `SelectionRing` | `signature/SelectionRing.tsx` | prototipo v3 `ring(on)` — l'anello di scelta (figlio, metodo di pagamento, scheda di accesso) |
| `BrandLine` / `BrandMark` / `Wordmark` | `signature/BrandLine.tsx`, `BrandMark.tsx` | design §2 correzione 1-2 — la riga di marchio (scritta EasyGame a sinistra, chip del club a destra, filo) su ogni schermata operativa; i file `logo-white.png`/`icon-white.png` copiati da `design-source/assets/` in `assets/images/brand/` (i due alberi npm non si importano) |
| `AuthFrame` / `GhostButton` | `signature/AuthFrame.tsx` | design §5a — la composizione comune di Login/Registrazione/Recupero/Reset/OTP: passo, eyebrow/titolo/corpo, scheda di vetro con campi e CTA a gradiente, secondario bianco in contorno |
| `SelectableAthleteRow` | `signature/SelectableAthleteRow.tsx` | spec Parte B, §B3 — portato in WP10, assente da ogni versione precedente dell'export (nessun file, nessun uso). La superficie resta glass regolare anche selezionata (non "glass strong"): quella distinzione non e fra i quattro segnali di selezione obbligatori dello spec, e `GlassSurface` non ha un aggancio per l'alpha per istanza — semplificazione dichiarata, non un gap dimenticato |
| `NotificationPermissionCard` | `signature/NotificationPermissionCard.tsx` | spec Parte G, §G1 (EGDS v2.3.0) — portato in WP11. **Semplificato**: lo stato "Allowed" elenca le categorie con Icon Chip nello spec; questa app non ha preferenze di notifica per categoria (un solo token per dispositivo), quindi e una riga descrittiva sola |

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

### Estensione dichiarata: `BottomSheet` (WP4)

`guidelines/navigation.md` definisce quattro livelli di navigazione, il
quarto essendo "Bottom sheet, `28 28 0 0`, glass strong, grabber" per
"qualunque cosa risponda a una domanda sola e ritorni" — ma non specifica il
componente-guscio stesso, solo cosa ci va dentro (`ChildSwitcher` espanso,
form di riprogrammazione, motivo di rifiuto). `BottomSheet` e
quell'implementazione: `Modal` + scrim + pannello che scorre dal basso,
dismissione al tocco dello scrim o a un controllo esplicito dentro il
contenuto. **Gap dichiarato**: il trascinamento del grabber per chiudere non
e implementato — nessuna libreria di sheet basata su gesture-handler e
dipendenza del progetto, e aggiungerne una e una decisione a se, non un
effetto collaterale di questo componente. Il grabber resta un'indicazione
visiva.

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
- **Componenti Parte C**: tutti e dieci portati (`ChildSwitcher`,
  `RSVPControl`, `PaymentCard`, `DocumentRow`/`DocumentCard`, `ConsentRow`,
  `NotificationRow`, `AccountAccessCard`, `AppointmentCard`, `BookingCard`,
  `EnrollmentStatusCard` — WP4-WP8, vedi la tabella sopra per lo spec
  esatto e le eventuali semplificazioni dichiarate).
- **Dark mode**: i token esistono (`.eg-dark` lato CSS) ma senza schede di
  esempio nel design system stesso; non modellato lato RN.

### Dal Dock al reskin completo (WP2 → WP10)

Dal WP2 al WP9, le schermate Trainer primarie (Home, Allenamenti, Gare,
Atleti) sono rimaste sul linguaggio visivo precedente — sfondo piatto,
`Card`/`Button`/`Badge` esistenti — mentre il Dock (guscio delle tab, non le
schermate che contiene) era gia quello nuovo: chrome condiviso, appariva su
**ogni** schermata Trainer per definizione, beneficio immediato e rischio
contenuto. Le **cinque sezioni nuove** di WP3 (Bacheca, Documenti,
Appuntamenti, Compensi, Squadre) usavano gia il linguaggio nuovo per intero,
raggiunte da un hub in Profilo — da cui una cucitura visibile fra le quattro
tab primarie e tutto il resto, dichiarata come rollout incrementale in
attesa del WP dedicato.

### WP10 — Reskin visivo delle quattro tab Trainer primarie (ADR-0165)

**Implementation version**: 2026-09-10. La cucitura sopra e chiusa:
`guidelines/trainer-migration.md` (normativo da EGDS v2.3.0) e stato seguito
schermata per schermata, nell'ordine che il documento prescrive (guscio →
Allenamenti → Gare → Atleti → Home), su tutte e sei le schermate Trainer
raggiungibili dal Dock — le cinque tab primarie
(`TrainerHomeDashboardScreen`, `TrainerTrainingsDashboardScreen`,
`TrainerMatchesDashboardScreen`, `TrainerAthletesScreen`,
`TrainerProfileDashboardScreen`) piu `TrainerAthleteProfileScreen`
(dettaglio) e `NotificationsScreen` (raggiunta dal campanello su ognuna di
esse). Nessun dato, endpoint, permesso o comportamento e cambiato: stessi
`mobileBackendStorage.*`, stesse chiavi `trainerPermissions.*`, stesso
ordine di raggruppamento (oggi → settimana → dopo → storico). Le cinque
sezioni secondarie di WP3 non sono state toccate — erano gia nel linguaggio
nuovo.

**Cambi funzionali minimi, dentro il perimetro "bug visivi trovati durante
la migrazione" che lo stesso WP10 autorizza**:
- La `Modal` nativa delle presenze/convocazioni e diventata `BottomSheet` +
  `SelectableAthleteRow`: un atleta col certificato medico scaduto ora
  **blocca** la presenza invece di lasciarla segnare con solo un'icona di
  avviso (§B3: "un atleta disabilitato dice sempre perche").
- La Home mostra ora un saluto reale (`Buongiorno, {nome}`), come richiesto
  dallo spec — prima il titolo era il solo "Dashboard".
- Il pull-to-refresh nativo (`RefreshControl`) e stato **preservato**
  passandolo a `SecondaryScreenLayout` (nuovo prop, vedi tabella sopra) —
  non era scontato: `ParentPrimaryScreenLayout` non lo espone, e le cinque
  sezioni secondarie di WP3 se ne affidano solo al refetch al focus.

**Semplificazioni dichiarate**: i "pillola filtro categoria" di Atleti
(§trainer-migration.md step 4) non esistevano come filtro interattivo prima
di WP10 — solo un elenco informativo delle categorie assegnate — e non lo
sono diventati ora (avrebbe aggiunto un comportamento nuovo, fuori dal
perimetro "solo visivo" del WP): restano una riga di sottotitolo nell'hero.
Il rientro di ~40px del primo pannello sotto l'hero ("straddle the horizon",
checklist §10.5) e un `marginTop` negativo fisso per schermata, non un
calcolo geometrico — stesso livello di approssimazione di
`ParentHomeScreen`, che non lo implementa affatto.

**Vedi anche.** ADR-0161–ADR-0164, `guidelines/trainer-migration.md`,
[16 — Debito tecnico](16-technical-debt.md) per le cinque schermate Trainer
orfane scoperte durante l'audit.

### WP11 — Push, deep linking e recupero password nativo (ADR-0166)

**Implementation version**: 2026-09-10. Tre capacita, tutte **anagrafica e
instradamento** — vedi ADR-0166 per il vincolo che le governa tutte e tre:
nessuna diventa una seconda autorita.

**Push.** `expo-notifications` + `expo-device` (nuove dipendenze). Il
dialogo di sistema non parte mai da solo (`configurePushNotificationHandler`
non lo chiede, solo configura come una notifica si mostra in primo piano);
lo chiede solo un tocco su "Attiva" nella card di permesso
(`NotificationPermissionCard`, §G1), in `Profilo → Notifiche` per Trainer
(`NotificationsScreen`) e Parent (`ParentBoardScreen`, sezione Notifiche).
Il token si registra su `POST /api/v1/auth/device-tokens` — vedi
[07](07-authentication.md#token-push-del-dispositivo-wp11-adr-0166) per il
contratto server — al login se il permesso e gia concesso, a ogni rinnovo
del token (`Notifications.addPushTokenListener`), e non richiede nessuna
azione di revoca separata al logout (il server la fa da solo). Il tocco su
una notifica instrada tramite `data.url`, con la **stessa** risoluzione dei
deep link (`navigateToParsedDeepLink`) — una notifica e, per questa app, un
deep link consegnato da APNs/FCM. **Nessuna pipeline di invio esiste**:
nessun dominio che scrive su `notifications` genera oggi una push reale.

**Deep linking.** Scheme `easygame://` (gia dichiarato in `app.json` prima
di questo WP). `client/lib/deep-linking.ts` e puro e testato (34 casi fra
questo modulo e `interpretPasswordResetResponse`): interpreta un URL in
`{tab, screen, params}` usando solo parametri che le schermate accettavano
gia. Il risolutore (`useDeepLinkRouter`, montato in `RootStackNavigator`)
rispetta la sequenza dichiarata: bootstrap → sessione → contesto → ruolo →
navigazione, con un link ricevuto prima che tutto sia pronto tenuto in
sospeso e ripreso da solo. Rotte supportate:

| Ruolo | Percorso | Destinazione |
|---|---|---|
| Trainer | `training/:id`, `match/:id` | `Trainings`/`Matches` con `focusTrainingId`/`focusMatchId`, gia esistenti |
| Trainer | `notification`, `appointment` | Lista (nessun dettaglio per id) |
| Parent | `training/:id`, `match/:id`, `rsvp/:id`, `event/:kind/:id` | `ParentEventDetail` con `eventId`/`kind`, gia esistenti |
| Parent | `payment`, `document`, `appointment` | Lista (nessun dettaglio per id) |
| Parent | `notification` | `ParentBoard` con `initialSection: "notifications"`, stesso instradamento gia usato dalla Home |
| Nessuno (pre-sessione) | `reset-password?uid=...&token=...` | `ResetPasswordScreen`, sempre raggiungibile |

**Recupero password nativo.** `ResetPasswordScreen` chiama lo stesso
`POST /api/v1/auth/password/reset` di sempre — vedi
[07](07-authentication.md#reset-password) per il contratto invariato. Il
link emesso dal server resta un URL Web (nessuna modifica al dominio
identita); `/auth/reset-password` offre in piu un link di passaggio con lo
schema dell'app, toccato dall'utente, mai un redirect automatico.

**Gap dichiarati, non dimenticanze:**

- **Nessun invio push reale.** L'anagrafica esiste, l'invio no. Collegare
  ogni dominio (appuntamenti, bacheca, scadenze) a un dispatch reale e un
  lavoro a se.
- **Nessun Universal Link.** Il link emesso via email resta un URL Web
  aperto dal browser del telefono se l'utente non tocca il link di
  passaggio — serve un dominio associato reale (Team ID Apple, WP12) per
  intercettarlo direttamente.
- **Nessun cambio di contesto automatico su un link cross-club/cross-figlio**
  (design-source §G2, "Wrong context"). Un link verso una risorsa fuori dal
  contesto attivo mostra oggi lo stato "non disponibile" della schermata di
  destinazione — corretto e mai fuorviante, ma non lo switch automatico con
  banner che lo spec descrive.
- **Nessun banner una-tantum in Home.** Solo la card permanente in
  Profilo/Notifiche (§G1) e implementata.
- **La navigazione verso una tab Parent e "best effort".** `ParentTabNavigator`
  monta le sue tab solo dopo che il contesto figlio ha caricato
  (`ParentGate`); il risolutore riprova per una finestra limitata
  (`navigateWhenReady`, 10 tentativi ogni 300ms) e poi abbandona in
  silenzio — l'utente resta sulla Home del proprio ruolo, non su una
  schermata rotta, ma non necessariamente sulla destinazione esatta se il
  caricamento del figlio e insolitamente lento.

**Vedi anche.** ADR-0166, [07](07-authentication.md),
[16](16-technical-debt.md).

### WP12 — iOS hardening e release readiness (ADR-0167)

**Implementation version**: 2026-09-10. Nessuna nuova area funzionale:
preparazione di un candidato al rilascio iOS, senza sottoporlo a TestFlight
o App Store.

**Dipendenze allineate.** `npx expo-doctor` segnalava 13 pacchetti fuori
dalla versione attesa dall'SDK 54 (patch/minor, accumulati nel tempo).
Allineati con `npx expo install --fix`: 18/18 controlli passano ora. Lo
stesso comando ha scoperto e corretto una lacuna reale — `babel-preset-expo`
era referenziato da `babel.config.js` ma **non dichiarato** in
`package.json` (probabilmente una dipendenza transitiva di una versione
precedente di `expo`, sparita quando la risoluzione e cambiata): senza,
`expo export`/le build fallivano con "Cannot find module
'babel-preset-expo'". Aggiunto come devDependency esplicita.

**`eas.json` (nuovo).** Tre profili — `development` (`developmentClient`,
distribuzione interna), `preview` (distribuzione interna), `production`
(`autoIncrement`, sorgente versione `remote` — EAS gestisce build
number/versionCode, non un contatore a mano nel repository). **Tutti e tre
puntano oggi allo stesso backend di staging**
(`EXPO_PUBLIC_EASYGAME_API_URL`): non esiste, nello scope Vercel corrente,
un progetto di produzione (CLAUDE.md §9) — quando ne esistera uno, il
profilo `production` va aggiornato, non prima. Nessun segreto nel file:
solo URL pubblici: le credenziali Apple/Google restano gestite da `eas
credentials`, mai committate.

**`app.json` — permessi rivisti:**
- `expo-image-picker`: `microphonePermission: false`. L'app usa
  `ImagePicker` solo per `mediaTypes: ["images"]` (foto di un documento,
  `ParentDocumentsScreen`) — mai video o audio — ma il plugin, senza questo
  flag, aggiunge comunque `NSMicrophoneUsageDescription` e il permesso
  Android `RECORD_AUDIO` per un uso che non esiste nel codice. Rimosso.
- `expo-secure-store`: testo di `NSFaceIDUsageDescription` reso onesto
  (protegge le credenziali salvate, non "accede ai tuoi dati biometrici Face
  ID" del default) — la chiave stessa non si puo togliere: il modulo nativo
  la richiede a prescindere da come viene usato il Keychain, non e dietro un
  flag come il microfono di `expo-image-picker`.
- `ios.infoPlist.ITSAppUsesNonExemptEncryption: false` — evita la domanda di
  conformita sulla crittografia in App Store Connect: l'app non usa
  crittografia propria oltre TLS standard.
- Le due descrizioni di `expo-image-picker` (foto/fotocamera) erano gia
  specifiche e vere, non il testo generico del plugin — nessuna modifica.

**Sessione (hardening).** Fin qui una sessione revocata si notava solo al
prossimo avvio a freddo (`checkAuth` in `useAuth.ts`, che gia gestiva
correttamente token mancante/utente non trovato). Aggiunto: una sessione
revocata **mentre l'app e aperta** (reset password su un altro dispositivo,
revoca lato club, scadenza) si nota alla **prossima chiamata autenticata**
— `EasyGameApiService.handleSessionExpired` (in `client/services/api.ts`)
pulisce token/utente/contesto e avvisa gli iscritti
(`mobileBackendStorage.onSessionExpired`, consumato da `useAuth.ts`), che
riportano l'app al login nello stesso istante. Nessun ciclo di redirect: il
guardiano si disinnesca da solo quando non c'e piu un token da pulire (un
401 sulla login stessa, credenziali sbagliate, non tocca niente). **Non
testato automaticamente**: il progetto non ha un'infrastruttura per
mockare `fetch`/`expo-secure-store` nei test (`node --test` copre solo
moduli puri), e costruirne una per questo solo caso avrebbe superato il
perimetro dell'hardening.

**Isolamento cache/dati — verificato, non modificato.** Ogni `queryKey`
Parent (28 in tutto lo screen tree) include `selectedChildId`: un cambio
figlio, anche fra club diversi, legge una chiave di cache diversa — mai un
dato di un figlio mostrato per un altro. Lato Trainer non esiste cache
persistente: ogni schermata rilegge `snapshot.context.clubId` da zero a
ogni chiamata (`getActiveSnapshot` in `mobile-backend-storage.ts`) e lo
manda come header `x-active-club-id`, validato server-side contro
`allowedOrganizationIds` — un cambio di club/categoria si riflette alla
prossima fetch, senza bisogno di invalidare nulla perche non c'e nulla da
invalidare.

**Checkout — verificato, non modificato.** `ParentPaymentsScreen` apre
`/pay/<token>` con `expo-web-browser` (`openBrowserAsync`, non una WebView
costruita a mano) e, al ritorno — checkout riuscito, fallito, o browser
chiuso a mano, i tre casi indistinguibili dal solo evento di ritorno —
invalida sempre la query del cruscotto invece di assumere il successo: lo
stato del pagamento resta quello che il server deriva, mai un
aggiornamento ottimistico.

**Flussi documento/foto — verificato, non modificato.**
`ParentDocumentsScreen`: annullamento del picker gestito (nessun caricamento
finto), permesso fotocamera negato mostra il motivo, download autenticato
con l'header Bearer (necessario: un link nudo non lo porterebbe), apertura
tramite `expo-sharing` se disponibile. Gli errori del server (MIME non
ammesso, file troppo grande) arrivano all'utente per intero
(`fetchErrorMessage` legge `error.message`), mai mascherati da un messaggio
generico.

**Il difetto noto del Calendario — chiuso.** "Da confermare" leggeva
`invitations.find(...)`: se la fetch degli inviti falliva, l'elenco vuoto
faceva apparire **ogni** evento come gia confermato — un errore di rete
travestito da lista pulita. `resolveCalendarRsvpBadge`
(`client/lib/parent-rsvp.ts`, 4 test nuovi) rende **impossibile** ottenere
quel risultato: la firma pretende `invitationsLoadFailed` a ogni chiamata,
niente default con cui dimenticarselo. Un fallimento della fetch produce
ora "Da verificare" sui singoli eventi piu un riquadro con `Riprova`
sopra la lista — recuperabile, mai silenzioso.

**Link esterni centralizzati.** `support@easygame.it` viveva duplicato in
`AccountHubScreen` (come `mailto:`) e `TrainerProfileDashboardScreen` (come
testo) — due stringhe che una modifica futura avrebbe potuto far divergere.
Ora in `client/constants/external-links.ts`, l'unica fonte. *(ADR-0164
diceva questo file gia creato in WP8: non lo era — vince il codice,
CLAUDE.md §1, corretto nello stesso commit di questa voce.)*

**Placeholder/UI morta — verificato, non introdotto nulla di nuovo.**
`ParentComingSoonScreen` (commento corretto: elencava sezioni che il batch
WP4-9 ha gia reso reali) resta raggiunta solo da "Impostazioni" — nessuna
sezione propria esiste, e lo dichiara esplicitamente (`StateMessage
kind="empty"`, mai un bottone morto). `UnsupportedRoleScreen` conferma le
due uscite richieste dallo spec (§Parte F). Le cinque schermate Trainer
orfane restano quelle di [16](16-technical-debt.md) D-MOB-1, non toccate.

**Gap dichiarati, non costruiti in questo WP:**

- **Nessun Universal Link** (D-MOB-5, invariato): serve un Team ID Apple
  reale, non disponibile in questo scope.
- **Nessuno stato offline/manutenzione/aggiornamento obbligatorio
  persistente** (design-source Parte F). L'app gestisce gli errori di rete
  **per chiamata** (`classifyFetchError`/`StateMessage kind="error"`, con
  `Riprova`) — reale e funzionante — ma non un rilevamento di connettivita
  persistente ne un bollettino di manutenzione: richiederebbe una nuova
  dipendenza (`@react-native-community/netinfo`, non presente) e un
  meccanismo lato server (versione minima richiesta, stato di
  manutenzione) che oggi non esiste nemmeno lato Web.
- **Nessuna pipeline di invio push** (D-MOB-4, invariato).

**Vedi anche.** ADR-0167, [14](14-security.md), [16](16-technical-debt.md).

### WP3 — Parita funzionale Trainer (ADR-0162)

**Implementation version**: 2026-09-10. Le cinque sezioni che il Web ha e il
mobile non aveva sono complete, sola lettura salvo Appuntamenti:

| Sezione | Schermata | Endpoint | Note |
|---|---|---|---|
| Bacheca | `TrainerBoardScreen` | `GET /api/v1/announcements?mine=1` | Sola lettura, nessun RSVP — stessa scelta di prodotto del Web |
| Documenti | `TrainerDocumentsScreen` | `GET /api/v1/trainers` (propria scheda) | Richiede la correzione WP1 dell'allow-list; **apertura/download del file non implementato** — vedi gap sotto |
| Appuntamenti | `TrainerAppointmentsScreen` | `GET/POST /api/v1/appointments[/​:id]` | Conferma/rifiuta/riprogramma secondo `transitions` (la macchina a stati del dominio, mai tre bottoni fissi); il rifiuto raccoglie sempre il motivo, stesso contratto corretto in WP1 |
| Compensi | `TrainerCompensationScreen` | `GET /api/v1/sport-work/me` | Elenco chiuso, niente IBAN — identico al Web |
| Squadre | `TrainerCategoriesScreen` | elenchi gia disponibili (categorie, atleti, allenamenti, gare) | Nomi leggibili, mai identificativi grezzi (`summarizeTrainerCategories`) |

Raggiungibili da un hub (`TrainerMoreScreen`, "Altre sezioni" nel Profilo),
non da nuove tab permanenti — navigazione secondaria per sezioni meno
frequenti, come da richiesta. Ogni voce dell'hub e gated dal permesso reale
del club (`trainerPermissions.navigation.*`).

**Due difetti di permesso mobile-solo trovati e corretti**
(`client/lib/trainer-permissions.ts`):

1. Le dieci chiavi di navigazione erano cinque: `board`/`documents`/
   `appointments`/`notifications`/`compensation` non esistevano, quindi la
   scelta di un club su quelle non aveva alcun effetto (ora l'hub le
   rispetta).
2. **Il piu serio**: `resolveTrainerDashboardPermissions` leggeva
   `navigation`/`widgets`/`actions` direttamente sull'ingresso, ma il
   chiamante reale (`resolveMobilePermissions`) passa `clubs.settings` —
   dove quelle chiavi vivono un livello sotto, in
   `settings.trainerDashboardPermissions`. La fusione ricadeva quindi
   **sempre** sui valori di default: qualunque scelta di un club su
   `/permissions` per home/allenamenti/gare/atleti non aveva mai avuto
   effetto sul mobile. Corretto spacchettando l'ingresso come fa il Web.

**Componenti nuovi rispetto all'export Claude Design** (estensioni
dichiarate, non nel namespace originale):

- `SecondaryScreenLayout` — il guscio comune (`Floodlight` + `AppBar` con
  freccia indietro) delle cinque sezioni: non e un componente del design
  system, e la composizione dei suoi pezzi per uno schermo "di dettaglio"
  che il design system non modella esplicitamente.
- `SignatureInput` — porta effettiva di `components/core/Input.jsx`
  (mancava dal primo giro di WP2): campo vetro con angolo tagliato, usato
  per il motivo del rifiuto e la riprogrammazione di un appuntamento.

**Gap dichiarati:**

- **Download dei documenti**: non implementato. Aprire `attachment:<id>`
  richiederebbe una richiesta autenticata col Bearer token e
  `expo-file-system`/`expo-sharing` (non dipendenze del progetto) per
  salvare/aprire il file sul dispositivo — un link semplice non
  funzionerebbe: il browser del telefono non porta il Bearer token del
  mobile. La schermata mostra i metadati e lo stato di scadenza, non un
  pulsante che aprirebbe un link destinato a fallire.
- **Riprogrammazione senza selettore nativo**: data e ora si scrivono come
  testo libero (`AAAA-MM-GG`, `HH:MM`), non con un date/time picker nativo
  (`@react-native-community/datetimepicker` non e una dipendenza). Stesso
  formato che il server gia accetta, funzionale ma meno comodo di un
  selettore.
- **`NumberTile`/`SelectableAthleteRow`/`EventCard`/`SectionHero`/
  `StatCard`/`HighlightCard`** restano non portati (vedi sopra): nessuna
  delle cinque sezioni nuove ne aveva bisogno, servono al reskin di
  Allenamenti/Gare/Home.

### WP4 — Parent foundation e multi-figlio (ADR-0163)

**Implementation version**: 2026-09-10, EGDS v2.1.0. Sostituisce
`ParentStackNavigator` (segnaposto a schermata unica) con
`ParentTabNavigator`: cinque tab primarie (Home, Calendario, Segreteria,
Bacheca, Profilo — `guidelines/navigation.md`), guscio `Dock` condiviso con
`MainTabNavigator`.

**Contesto figlio (`ParentContext`, `client/contexts/ParentContext.tsx`)**:
carica `GET /api/v1/family/children` (`listParentChildren` lato server),
risolve il figlio selezionato con `client/lib/parent-children.ts` (puro,
8 test) — nessun figlio → `null`; un figlio → selezione automatica, mai uno
switcher a una voce; piu figli → una scelta salvata valida vince, altrimenti
il primo in ordine stabile (mai "nessuno" quando esiste almeno un figlio).
La scelta persiste in `AsyncStorage`
(`@easygame/mobile/parent/selected-child`). **Deliberatamente separato da
`AuthContext.currentClub`**: il Web deriva sempre l'organization
dall'`athleteId` nel path (`getParentDashboardData`), mai da un club attivo
lato client — replicarlo con `currentClub` avrebbe significato scegliere
l'organization sbagliata per un genitore con figli su club diversi.

`ParentTabNavigator` monta le cinque tab solo quando `ParentContext` e
`"ready"`; altrimenti mostra un guscio unico (`ParentGateShell`) per
`loading`/`empty`/`forbidden`/`network`/`error` — mai le tab su un elenco
vuoto. Lo stato `"empty"` invita a contattare la segreteria, senza dati
finti.

**Schermate nuove**: `ParentHomeScreen` (minima in questo WP: identita del
figlio selezionato — il cruscotto reale e nel WP5), `ParentChildrenScreen`
("I miei figli", elenco raggruppato per club con selezione), 
`ParentProfileScreen` (account, figli, cambio club/accesso, logout).
`ParentCalendarStackNavigator` e `ParentBoardStackNavigator` montano per ora
un segnaposto onesto (`StateMessage kind="empty"`, "in arrivo") — sostituito
per intero, non esteso, dai WP5 e WP6.
`ParentSegreteriaScreen` resta un segnaposto **per l'intero batch**:
pagamenti, documenti, consensi e iscrizione sono fuori perimetro di WP4-6
(vedi ADR-0163).

**Componenti nuovi** — vedi la tabella sopra: `NumberTile`, `ChildSwitcher`,
`BottomSheet`, `ParentPrimaryScreenLayout`. Nuovi token in `theme.ts`:
`EGMoney` (`due`/`paid`), `EGChildAccents` (4 accenti stabili),
`EGCorner.sheet`, `EGGradients.warning`/`.neutral`, `EGShadow.glowWarning`/
`.row` — tutti presenti in EGDS v2.1.0 (`tokens/signature.css`).

**API nuove** (`client/services/api.ts` + `mobile-backend-storage.ts`):
`getFamilyChildren()` → `GET /api/v1/family/children`. Le altre chiamate
Parent (`getParentDashboard`, RSVP, bacheca) arrivano nei WP5/WP6, quando le
schermate che le consumano esistono.

**Test**: `easygamemobile/tests/parent-children.test.ts` (8 casi: 0/1/N
figli, figli su club diversi, scelta salvata non piu valida, raggruppamento,
cambio cross-club, accento stabile e ciclico).

### WP5 — Parent Home, Calendario, RSVP (ADR-0163)

**Implementation version**: 2026-09-10, EGDS v2.1.0. Sostituisce la Home
minima e i due segnaposto di WP4 con contenuto reale.

**Home** (`ParentHomeScreen`): `SectionHero` (nome figlio, club, tre stat
chip: prossimo allenamento, prossima gara, presenze) + due `StatCard`
(certificato medico, notifiche non lette) + due `HighlightCard`
(Allenamenti/Gare, al massimo due anteprime ciascuna, azione verso il
Calendario). Ogni numero viene da `GET /api/parent-dashboard/[athleteId]`
(`analytics`, `attendance`, `health`, `notificationsUnread`,
`trainings.upcoming`, `matches.upcoming`) — nessuna card inventata.
Derivazione pura e testata in `client/lib/parent-home-summary.ts`.

**Calendario** (`ParentCalendarScreen` + `ParentEventDetailScreen`):
allenamenti e gare unificati (`client/lib/parent-calendar.ts`, dominio
puro), filtro Tutto/Allenamenti/Gare, ordinati per data/ora. Nessuna azione
RSVP dalla lista — stesso principio del Web (`ParentCalendarPage` non la
offre): tocco su un evento apre il dettaglio, dove vive `RSVPControl`.

**RSVP**: `GET /api/v1/rsvp?athlete_id=...` (inviti allenamenti **e** gare
insieme, `kind` distingue) e `POST /api/v1/rsvp` (`athlete_id`,
`training_id`, `status`, `note?` — idempotente, l'ultima risposta vince,
nessun endpoint separato per "cambiare risposta"). `RSVPControl` disegna
esattamente le transizioni che l'invito porta (`canAnswer`,
`blockedMessage`) — non decide da solo se si puo rispondere. Nessun
ottimismo: lo stato cambia solo alla conferma del server
(`client/lib/parent-rsvp.ts`, dominio puro, 7 test).

**Perche TanStack Query qui e non `useAsyncSection`**: Home e Calendario
leggono **lo stesso** `GET /api/parent-dashboard/[athleteId]` — con
`useAsyncSection` ciascuna schermata rifarebbe la propria fetch ad ogni
mount, anche per lo stesso figlio gia caricato, cioe esattamente il fetch
duplicato che l'istruzione del WP vieta. `useQuery` con `queryKey:
["parent-dashboard", athleteId]` condivide la cache fra le due tab; cambiare
figlio e una `queryKey` diversa, mai un aggiornamento in-place che
lascerebbe per un istante i dati del figlio precedente
(`client/hooks/useParentSectionStatus.ts` riporta lo stesso vocabolario a
sei stati sopra `useQuery`). Il dominio Trainer non condivide risorse fra
schermate e resta su `useAsyncSection` — non e stato migrato senza motivo.

**Componenti nuovi** (Parte B, formalizzati in EGDS v2.1.0): `EventCard`
(§B2), `SectionHero` (§B4), `StatCard` (§B5), `HighlightCard` (§B6).
Parte C: `RSVPControl` (§C2).

**Test**: `parent-calendar.test.ts` (7), `parent-rsvp.test.ts` (7),
`parent-home-summary.test.ts` (3) — training/match/combinazione, i cinque
stati di `RSVPControl`, dati caricati/empty/anteprime limitate a due.

### WP6 — Parent Bacheca, Notifiche, esperienza Account (ADR-0163)

**Implementation version**: 2026-09-10, EGDS v2.1.0. Ultimo WP del batch
Parent: sostituisce il segnaposto Bacheca di WP4/5 con contenuto reale,
aggiunge l'hub Parent e reskina la lista accessi di `AccountHubScreen`.

**Bacheca + Notifiche** (`ParentBoardScreen`): due sezioni della stessa tab
(`guidelines/navigation.md`: "Notifications... shares Bacheca"), selezionate
con un interruttore locale.
- Bacheca: `GET /api/parent-dashboard/[athleteId]/board` (stessa forma di
  `Announcement`, gia usata dalla bacheca Trainer — stesso dominio annunci).
  Segnare letto invia `POST .../board` con `{deliveryId}` (la singola
  consegna, non l'annuncio — un fratello nello stesso club ha una propria
  consegna).
- Notifiche: **nessun GET dedicato** — arrivano dentro
  `GET /api/parent-dashboard/[athleteId]` (`notifications`,
  `notificationsUnread`), stessa query key di Home/Calendario: aprire la
  sezione Notifiche non aggiunge una fetch se il figlio e gia stato
  visitato in Home. Segnare letta una o tutte: `PATCH .../notifications`
  (`{id}` o `{all:true}`).
- Il campanello dell'AppBar (Home e Calendario, dove il conteggio e gia
  disponibile dalla stessa query) apre direttamente la sezione Notifiche
  (`navigation.getParent().navigate("ParentBoardTab", { screen:
  "ParentBoard", params: { initialSection: "notifications" } })`).
  Segreteria e Profilo non lo mostrano: non hanno gia la query del
  cruscotto in cache, e aggiungerla solo per un badge sarebbe la fetch
  duplicata che il WP vieta — gap dichiarato, non dimenticanza.

**Hub Parent** (`ParentMoreScreen`, da "Altre sezioni" nel Profilo): "I
miei figli" (reale, → `ParentChildrenScreen`) e "Accessi e club" (reale,
richiama `clearContext()` — lo stesso meccanismo del pulsante "Cambia club
o accesso" gia in Profilo, verso l'`AccountHubScreen` reskinato sotto).
Le altre otto voci (Pagamenti, Documenti, Consensi, Iscrizione,
Appuntamenti, Prenotazioni strutture, Contatti club, Impostazioni) aprono
`ParentComingSoonScreen`, un segnaposto condiviso onesto — mai un bottone
morto, mai un elenco finto.

**Esperienza Account** (`AccountHubScreen`): le righe `Card` generiche per
i club posseduti e gli accessi assegnati usano ora `AccountAccessCard`
(spec C10). Solo il rendering e cambiato — `handleSelectOwnedClub`/
`handleSelectAccess`, il caricamento restano quelli di sempre. I tre
moduli (profilo, nuovo club, token) sono passati da un `Modal` scritto a
mano a `BottomSheet` nel reskin EGDS v3.0.0 (WP13, ADR-0168, passo 7d) —
stesso componente delle altre schermate con moduli, stessi campi e stessa
logica di invio, solo il contenitore e cambiato. **Comportamento nuovo,
non solo estetico**: un
club posseduto e sempre ruolo `"owner"`, e `resolveMobileRoleGate` non apre
nessuna area per owner/admin in questa V1 (Area management mobile:
MISSING) — prima il tocco portava comunque a `UnsupportedRoleScreen`, ora
la card lo dice **prima** del tocco (`supported={false}`, spec C10: "shown,
not hidden"), riusando `normalizeMobileAccessRole` (stessa funzione pura di
`mobile-role-gate.ts`, non una seconda verifica). Il gate di ruolo stesso
resta invariato — solo la card smette di navigare verso l'esito che il
gate avrebbe comunque dato.

**Componenti nuovi**: `NotificationRow` (spec C6), `AccountAccessCard`
(spec C10). `ParentComingSoonScreen` — non un componente del design
system, il segnaposto condiviso per le sezioni fuori perimetro.

**Test**: `parent-notifications.test.ts` (4: unread/read, ordinamento,
raggruppamento per giorno, categoria per parola chiave). Routing
Account/Trainer/Parent/ruolo-non-supportato non ha una suite propria in
questo WP: la logica che decide (`resolveMobileRoleGate`,
`normalizeMobileAccessRole`) non e stata toccata ed e gia coperta da
`mobile-role-gate.test.ts` (Identity & Access) — `AccountAccessCard` la
richiama, non la ripete.

### WP7 — Parent Pagamenti, Documenti, Consensi (ADR-0164)

**Implementation version**: 2026-09-10, EGDS v2.2.0. La tab Segreteria
smette di essere un segnaposto: `ParentSegreteriaScreen` diventa un hub con
quattro righe (`guidelines/navigation.md`: "one tab, four sections") — tre
reali, Iscrizione ancora "in arrivo" fino al WP8.

**Pagamenti** (`ParentPaymentsScreen`): `data.payments.items` dal
cruscotto aggregato (stessa query key di Home/Calendario, nessuna fetch in
piu). Lo stato lo scrive il server (`statusKey`: solo `paid`/`pending`/
`cancelled`; le sfumature — scaduto, parziale — vivono nell'etichetta
italiana `status`, mai ricalcolate da un orologio locale:
`resolvePaymentCardState` in `client/lib/parent-payments.ts`, puro, 11
test). Il checkout (`POST .../checkout`) risponde l'URL di `/pay/<token>`,
una pagina EasyGame pubblica — **non** gia una sessione Stripe hosted: il
mobile la apre con `WebBrowser.openBrowserAsync` (`expo-web-browser`, gia
dipendenza) e invalida la query al ritorno, senza sapere se il pagamento e
riuscito finche il server non lo dice. Ricevute e fatture (`.../payments`
→ `receipts`/`invoices`) sono mostrate come metadati soltanto: il loro
`downloadPath` risponde HTML stampabile con auth Bearer, non un file — un
link che il browser di sistema non potrebbe autenticare fallirebbe sempre,
quindi non c'e un pulsante che lo aprirebbe (stessa regola gia applicata ai
documenti Trainer in WP3).

**Documenti** (`ParentDocumentsScreen`): **non** la `GET .../documents`
dedicata (legacy, la Web app non la usa) ma `data.documents.required`/
`.uploaded` del cruscotto aggregato — stessa fonte della Web app. Stato
interamente derivato server-side (`deriveFamilyDocumentState`): il mobile
legge `state`/`stateLabel`/`daysLeft`/`action`, non ricalcola nulla.
`DocumentCard` per i richiesti (portano una nota di requisito), `DocumentRow`
per l'archivio. Upload multipart (mai base64: il limite reale e 10 MB) con
scelta file/fotocamera in un `BottomSheet`; download via richiesta
autenticata (header Bearer) e apertura col foglio di condivisione nativo.

**Consensi** (`ParentConsentsScreen`): `GET/POST .../consents`. **Nessuna
API espone al genitore il testo legale integrale** di un consenso — nemmeno
la Web app lo mostra oggi (il componente Parent la cerca su un campo che
non esiste nella risposta, `title`/`description` invece di
`definitionTitle`; qui usato il campo giusto, un piccolo miglioramento
onesto, non un contratto inventato). Il foglio di dettaglio lo dichiara
esplicitamente invece di fingere una lettura che non c'e. Le transizioni
ammesse (`canApplyConsentDecision`, `client/lib/parent-consents.ts`, puro, 5
test) sono uno specchio della matrice del dominio
(`src/lib/consents/model.ts`) — abilitano/disabilitano i pulsanti, ma il
server resta l'unico a farle valere (400 su una non ammessa).

**Dipendenze native aggiunte**: `expo-document-picker`, `expo-image-picker`
(con `NSCameraUsageDescription`/`photosPermission` in `app.json`),
`expo-file-system` (API nuova di SDK 54, `File.downloadFileAsync` con
header — non la `legacy`), `expo-sharing`. `expo-web-browser` era gia
dipendenza (WP1), riusata cosi com'e per il checkout.

**Componenti nuovi** (Parte C, raffinati in v2.2): `PaymentCard` (§C3),
`DocumentRow`/`DocumentCard` (§C4), `ConsentRow` (§C5).

**Test**: `parent-payments.test.ts` (11: stati paid/due/overdue/parziale/
annullato, prima rata pagabile, disponibilita checkout, formato valuta
it-IT), `parent-consents.test.ts` (5: la matrice di transizione per ogni
stato), `parent-documents.test.ts` (8: tint/varianti per stato, icona per
tipo, densita riga/scheda).

### WP8 — Parent Segreteria/Appuntamenti, Strutture, Iscrizione, Contatti (ADR-0164)

**Implementation version**: 2026-09-10, EGDS v2.2.0. Chiude il perimetro
Parent: la tab Segreteria arriva alle sue quattro sezioni reali, e i tre
segnaposto restanti dell'hub Profilo (Appuntamenti, Prenotazioni strutture,
Contatti club — `guidelines/navigation.md`) diventano schermate vere.

**Appuntamenti** (`ParentAppointmentsScreen`, hub Profilo): `data.appointments`
del cruscotto aggregato (`config`, `items`, `availableSlots` — stessa query
key, nessuna fetch in piu). La faccia famiglia di un appuntamento
(`toFamilyAppointment`) **non** porta un elenco di transizioni come quella
del club: solo due booleani, `can_reschedule`/`can_cancel`
(`client/lib/parent-appointments.ts`, puro, 4 test) — `AppointmentCard`
disegna esattamente quei due, mai una terza azione inventata. Riprogrammare
crea una richiesta nuova e chiude la vecchia (`PATCH`, ammesso solo finche
"in richiesta"); disdire (`DELETE`) non richiede un motivo dal contratto
reale quando e la famiglia a farlo — a differenza del rifiuto lato club,
qui non c'e un `BottomSheet` di motivo obbligatorio, sarebbe un campo che
il server non legge. Una nuova richiesta sceglie fra gli `availableSlots`
del club o, se non configurati, data/ora libere (stesso gap dichiarato del
testo libero per la riprogrammazione Trainer).

**Strutture** (`ParentStructuresScreen`, hub Profilo): `data.structures`
(`items`, `bookings`). **Nessun annullamento lato Parent**: il dominio
espone solo `POST` sotto `.../structures`, e nemmeno il Web lo permette —
`BookingCard` e quindi sola lettura per le prenotazioni esistenti. La
richiesta di una nuova prenotazione sceglie un campo prenotabile
(`bookableFields`, `client/lib/parent-structures.ts`, puro, 4 test) e una
durata/tariffa, poi calcola l'orario di fine
(`computeBookingEnd`) — il server resta l'unico a validare conflitti e
fasce orarie dichiarate.

**Iscrizione** (`ParentEnrollmentScreen`, tab Segreteria): `data.enrollment`
per lo stato d'insieme (`enrolled`/`not_enrolled`, piano, saldo) piu
`GET /api/v1/family/enrollment-requests` per le pratiche (ognuna col
proprio stato `sent`/`in_review`/`approved`/`rejected`). **Il rail a passi
dello spec `EnrollmentStatusCard` (§C9) e stato semplificato**: presuppone
un flusso granulare che `data.enrollment` non porta — qui `EnrollmentStatusCard`
mostra stato/piano/pill, e le pratiche (che hanno davvero un progresso per
fase) sono righe separate. Il rinnovo vero e proprio e un motore di form
dinamici (`FormField`: `checkbox`/`file_upload`/`signature`/testo libero,
alcuni legati a un consenso) — costruire un renderer generico e
esplicitamente fuori perimetro (ADR-0164): la schermata mostra stato,
pratiche e documenti in sospeso (con collegamento diretto a Documenti/
Pagamenti, entrambi reali), non un modulo che non sa ancora compilare.

**Contatti** (`ParentContactsScreen`, hub Profilo): solo `data.club.*` —
nessun endpoint dedicato, nessun link hardcoded (telefono/email/sito sono
dati del club, dinamici per club). Gli orari di apertura sono JSON libero
non normalizzato server-side: portata fedele di
`src/lib/opening-hours-utils.ts` in `client/lib/opening-hours.ts` (puro, 5
test) — stessa logica di alias/forme che il Web usa lato client, non
un'assunzione di forma fissa.

**Hub aggiornato**: `ParentMoreScreen` collega le tre voci reali;
"Impostazioni" resta l'unico segnaposto, senza un contenuto previsto in
nessun WP di questo batch.

**Componenti nuovi** (Parte C, raffinati in v2.2): `AppointmentCard` (§C7,
adattato al contratto reale — due booleani, non un elenco di transizioni),
`BookingCard` (§C8), `EnrollmentStatusCard` (§C9, semplificato: nessun rail
a passi senza i dati per sostenerlo).

**Link esterni centralizzati**: nessuna schermata di questo WP introduce un
link business-critical hardcoded (Contatti legge tutto da `data.club`), 
quindi non e nato un `client/constants/external-links.ts` — sarebbe stato
un file senza un solo consumatore reale. La regola resta valida per il
prossimo link hardcoded che comparira.

**Test**: `parent-appointments.test.ts` (4: stati aperti/storico, abilitazione
invio), `parent-structures.test.ts` (4: campi prenotabili, tariffa minima,
calcolo orario fine), `opening-hours.test.ts` (5: stringa libera, alias
italiani, sotto-fasce, assenza dati, spacchettamento array).

### WP9 — Parent, chiusura della parita funzionale e hardening (ADR-0164)

**Implementation version**: 2026-09-10, EGDS v2.2.0. Non un WP di nuove
sezioni: confronto sistematico con la dashboard Web, l'unico gap reale
chiuso (Profilo atleta), e un audit su error handling/cache/sicurezza che
ha trovato e corretto due difetti reali.

**Profilo atleta** (`ParentAthleteProfileScreen`, raggiunta toccando
l'intestazione della Home): l'unica sezione della dashboard Web senza
equivalente mobile fino a questo WP. Verificato sul codice reale
(`ParentAthletePage`) che legge esclusivamente `data.athlete`/`data.health`/
`data.attendance` — gia nel cruscotto aggregato, **nessun endpoint
aggiuntivo**. I tipi `athlete`/`health` in `services/api.ts` sono stati
allargati alla whitelist completa che il server dichiara
(`serializeAthleteCard`): anagrafica, tutori (mai un token di accesso),
certificati, allergie, visite mediche libere (`athlete.data.medicalVisits`,
l'unica chiave del blob `data` che sopravvive oltre `address`). L'unico
valore derivato lato client e l'eta da una data di nascita
(`client/lib/parent-athlete-profile.ts`, puro, 5 test) — non una decisione
di dominio.

**Due difetti trovati dall'audit e corretti, perche sicuri e circoscritti**
(stessa regola gia applicata ai difetti di permesso Trainer in WP3):

1. `ParentEventDetailScreen` controllava solo `dashboardQuery.isPending`:
   un 403/500 cadeva nel ramo "Evento non trovato" — lo stesso difetto Web
   che questo intero batch ha evitato ovunque, sfuggito qui. Corretto con
   `useParentSectionStatus` completo.
2. `ParentSegreteriaScreen` (l'hub) aveva lo stesso problema, piu sottile:
   un errore sul cruscotto aggregato faceva comunque renderizzare le righe
   con contatori a zero — **un badge "0 in sospeso" che in realta significa
   "non lo so"** e piu ingannevole di un elenco vuoto. Corretto: l'intero
   hub ora passa da `useParentSectionStatus`; il conteggio Consensi (da una
   query secondaria) si nasconde invece di mostrare zero quando quella
   query fallisce.
3. **Un terzo, minore**: `RSVPControl` in `ParentEventDetailScreen` non
   renderizzava nulla se `rsvpQuery` falliva — "nessun controllo" si legge
   come "nessuna risposta richiesta", falso quando e solo la fetch ad
   essere fallita. Ora mostra un errore recuperabile al posto del
   controllo. **Gap residuo minore, non corretto**: lo stesso silenzio
   esiste ancora sul badge "Da confermare" della lista Calendario (un
   errore RSVP li si traduce in "nessun badge", non in un errore) — piu
   tollerabile perche il tocco sull'evento porta comunque al dettaglio,
   dove l'errore e visibile.

**Audit cache/query** (nessun difetto trovato): ogni `queryKey` Parent di
questo intero batch e scoped su `selectedChildId` — verificato a tampone su
tutte le schermate. Nessun `placeholderData`/`keepPreviousData` in uso da
nessuna parte: cambiare figlio e sempre una `queryKey` diversa, mai un
aggiornamento in-place, quindi mai un istante con i dati del figlio
precedente mostrati come correnti (comportamento di default di TanStack
Query, non serviva altro codice). Nessuna mutazione Parent usa
`setQueryData`: ogni scrittura aspetta la conferma del server e poi
invalida, mai un aggiornamento ottimistico.

**Audit permessi/sicurezza** (nessun difetto trovato): ogni chiamata
Parent passa `selectedChildId` da `ParentContext`, mai un valore digitabile
o un parametro di rotta; nessuna chiamata invia un `organization_id` che il
server userebbe per filtrare (dove il contratto lo accetta — es. `POST
/api/v1/rsvp` — e solo verificato contro quello reale dell'atleta). Il
gate Parent (`canParentAccessAthlete`) resta l'unica autorita, richiamato
dal server su **ogni** endpoint di questo batch (checkout, documenti,
consensi, appuntamenti, strutture) — il mobile non lo ricalcola mai.

**Navigazione**: le cinque tab restano quelle di `guidelines/navigation.md`
— nessuna aggiunta. Il child switcher, l'hub secondario e il cambio
club/accesso restano dove il WP4 li aveva messi.

#### Parity matrix — Web Parent ↔ Mobile

| Area | Mobile | Note |
|---|---|---|
| Account | COMPLETE | `AccountHubScreen` con `AccountAccessCard` (WP6) |
| Multi-club | COMPLETE | Un `AccountAccessCard` per club, nessuna selezione automatica |
| Multi-ruolo | COMPLETE | Gate su Trainer/Parent, resto → `UnsupportedRoleScreen` (invariato da Identity & Access) |
| Multi-figlio | COMPLETE | `ChildSwitcher` + `ParentContext` (WP4) |
| Home | COMPLETE | `SectionHero`/`StatCard`/`HighlightCard` (WP5) |
| Profilo atleta | COMPLETE | `ParentAthleteProfileScreen` (WP9) |
| Allenamenti | COMPLETE | Uniti in Calendario, non una tab a se (scelta dichiarata di `guidelines/navigation.md`) |
| Gare | COMPLETE | Idem |
| RSVP | COMPLETE | `RSVPControl`, stesso contratto `/api/v1/rsvp` (WP5) |
| Calendario | COMPLETE | Nessun RSVP inline, stesso principio del Web (WP5) |
| Pagamenti | PARTIAL | Lista + checkout reali (WP7); ricevute/fatture solo metadati (l'endpoint risponde HTML stampabile con auth Bearer, non un file) |
| Documenti | COMPLETE | Upload/download reali (WP7) |
| Consensi | PARTIAL | Accetta/revoca reali (WP7); nessun testo legale integrale — nessuna API lo espone al genitore, nemmeno sul Web |
| Bacheca | COMPLETE | (WP6) |
| Notifiche | COMPLETE | (WP6) |
| Segreteria/Appuntamenti | COMPLETE | Richiesta/riprogrammazione/disdetta reali (WP8) |
| Strutture | PARTIAL | Prenotazione reale; nessun annullamento — il dominio non lo offre nemmeno sul Web (WP8) |
| Iscrizione | PARTIAL | Stato/pratiche/documenti in sospeso reali; il rinnovo (modulo dinamico) resta fuori perimetro (WP8, ADR-0164) |
| Contatti | COMPLETE | (WP8) |

**Nessuna riga MISSING.** Le sole righe PARTIAL sono gap gia dichiarati
prima di questo WP (ricevute/fatture, testo consensi, annullamento
strutture, rinnovo iscrizione) — nessuno di questi e "codice
irraggiungibile": ogni schermata che li tocca lo dice esplicitamente
all'utente, mai un bottone che sembra funzionare e non lo fa.

**Test**: `parent-athlete-profile.test.ts` (5: eta da data di nascita,
assenza dati, visite mediche). Nessun nuovo test sui tre difetti corretti
dall'audit — sono difetti di *rendering condizionale* (quale ramo JSX si
sceglie in base allo stato della query), non di logica pura: la copertura
reale e la lettura del codice stesso, coerente con l'assenza di un
renderer RN nella suite (vedi "Test — `easygamemobile/tests/`" sopra).

### WP13 — Parita visiva schermata per schermata (ADR-0168, addendum 2026-09-11)

Il primo giro di WP13 aveva portato token, componenti e regole di v3 ma
**non la composizione** delle schermate dell'artefatto approvato (due
export Claude Design, `EasyGame Mobile - IA e Home` e `EasyGame Mobile -
Prototipo`): il feedback di accettazione lo ha detto esplicitamente — "usa
EGDS v3.0.0" non basta. Questo passaggio ricostruisce ogni schermata sulla
composizione del prototipo, con i dati/permessi/endpoint di prima. Ordine
delle fonti: (1) prototipo per layout e composizione, (2) EGDS v3.0.0 per
token e regole, (3) codice esistente per dati, API, permessi, logica.

Cosa cambia di guscio, per tutte le schermate:

- **Riga di marchio** (`BrandLine`): scritta EasyGame a sinistra, chip del
  club a destra (crest + nome + chevron → Account Hub), filo bianco 12%.
  Sulle schermate Parent il club e quello del figlio selezionato.
- **AppBar**: "‹ Indietro" e una pillola sulla propria riga (36px, bianco
  12%, bordo 28%), il campanello resta solo a destra, 20px fra titolo e
  azioni. Le schermate secondarie non mostrano il Dock.
- **Floodlight** ha ora anche le righe di campo (`Pattern` SVG mascherato):
  i tre strati del sorgente. `BrandStateLayout` porta l'arco di campo, la
  linea di fondo con il tick, il watermark "e" **con il file reale**
  (`icon-white.png`), la riga marchio+passo.
- **Dock**: 56px, padding 5, puck 46 (13/15 laterali, gap 7, etichetta
  11.5); pallino 8px con bordo navy (`tabBarBadge`) — sul tab Pagamenti
  quando c'e una rata da saldare.
- **BottomSheet**: eyebrow + titolo 22/600 nel foglio, corpo scorrevole,
  barra azioni **solo** dove serve una conferma (Annulla 100px + primario a
  tutta larghezza), riga di suggerimento per i fogli di sola scelta;
  curva `cubic-bezier(.2,.9,.25,1)`, 220/180ms.
- **Margini**: contenuto 14px sopra, 16px ai lati, 118px sotto con il Dock;
  gap 12 per le schede, 8 per le liste a righe; `SectionHero` a tutta
  larghezza (slot `hero`), contenuto sotto a 6px.

Composizioni ricostruite (design → schermata):

| Prototipo / artboard | Schermata | Composizione |
|---|---|---|
| `isLogin` / §5a | `LoginScreen` | `AuthFrame`: "1 di 3", Accedi · Bentornato, scheda con Email/Password/CTA, ghost "Password dimenticata?", rimando registrazione |
| §5a "Nuovo account" | `RegisterScreen` | `AuthFrame`: nome+cognome affiancati, cellulare, email, password, conferma (errore inline), nota requisiti, ghost "Hai già un account? Accedi" |
| §5a "Recupero" / §3a "Controlla la posta" | `ForgotPasswordScreen` | `AuthFrame` prima/dopo l'invio |
| §3a "Nuova password" | `ResetPasswordScreen` | `AuthFrame` per modulo e tre esiti |
| `isOtp` / §3a "codice non valido" | `VerifyOtpScreen` | sei celle 56px (cella attiva blu, tutte rosse su errore), input reale nascosto (`oneTimeCode`), "Riprova tra 0:42" / "Richiedi un nuovo codice" |
| `isAccounts` / §5b | `AccountHubScreen` | nome in eyebrow, "Scegli come entrare", `AccountAccessCard` (crest, club, riga, pill ruolo, anello; ruolo non supportato al 60%), rimandi testuali (Profilo · Nuovo club · Collega un token · Assistenza), "Esci" ghost in fondo |
| §5b "Ruolo non supportato" | `UnsupportedRoleScreen` | pill bianca, titolo 30/36, riquadro "Da qui puoi già" con gli accessi reali, "Cambia accesso" bianco + "Esci" ghost |
| `isTHome` / §2a | `TrainerHomeDashboardScreen` | `SectionHero` (Oggi · Buongiorno · 3 contatori) → `EventCard` del prossimo allenamento con "Registra presenze" (apre il foglio in Allenamenti) → riga compatta della prossima gara con pill "Convocazioni" → "Le tue sezioni" `NavTileGrid` 4×2 gated dai permessi |
| `isTTrainings` | `TrainerTrainingsDashboardScreen` | hero "{data} · Allenamenti di oggi", `EventCard` con "Registra presenze" a tutta larghezza (primaria la prima), nota "Nessun altro allenamento…", settimana / calendario / storico con ricerca |
| `isTMatches` | `TrainerMatchesDashboardScreen` | hero "Settimana N · Gare della settimana", `EventCard` con giorno nella rotaia e "Gestisci convocazioni", programmate / storico |
| `isTAthletes` | `TrainerAthletesScreen` | ricerca nel cielo, rosa raggruppata per categoria ("U13 · 12 atleti"), `GlassRow` con `NumberTile` navy e pill di stato |
| `isTAthlete` / turno 6 §11 | `TrainerAthleteProfileScreen`, `ParentAthleteProfileScreen` | testata di vetro scuro che attraversa l'orizzonte, due `StatCard`, "Scheda" con `MetaRow`, "Ultime presenze" a righe, poi le sezioni con le porte di permesso di prima |
| `isProfile` | `TrainerProfileDashboardScreen`, `ParentProfileScreen` | avatar + nome + "ruolo · club" nel cielo, riga evidenziata "Accessi e club", righe di navigazione, "Esci" distruttivo; il modulo dati va in `TrainerPersonalDataScreen` |
| `isTServices` | `TrainerMoreScreen` ("Servizi") | "Tutte le sezioni", `GlassRow` con chevron |
| §3c Bacheca / Documenti / Appuntamenti / Compensi | `TrainerBoardScreen`, `TrainerDocumentsScreen`, `TrainerAppointmentsScreen`, `TrainerCompensationScreen`, `TrainerCategoriesScreen` | `SummaryCard` scura nel cielo + `GlassRow` con pill a quattro livelli; le azioni degli appuntamenti in barra etichettata, motivo/nuovo orario in un foglio |
| `isNotifications` | `NotificationsScreen`, sezione Notifiche di `ParentBoardScreen` | `SectionLabel` "Oggi · Segna tutte come lette", `NotificationRow` (pallino dentro la riga, vetro forte da non letta) |
| `isPHome` / §2b / §5c | `ParentHomeScreen` | barra figlio, `SummaryCard` "Documenti da caricare" (o rata da saldare, o tutto in regola), "Scorciatoie" 4×2 con badge (pagamenti, documenti, consensi, bacheca), "Prossimi impegni" con RSVP sulla scheda |
| `isPCalendar` | `ParentCalendarScreen` | filtri a pillola, eventi raggruppati per giorno, RSVP sulla scheda |
| `isPPayments` | `ParentPaymentsScreen` | `SummaryCard` "Saldo stagione" con anello di avanzamento, `PaymentCard` con barra azioni |
| `isPPayDetail` + `sheetIsPay` | `ParentPaymentDetailScreen` (nuova) + `components/parent/PaymentSheet.tsx` | scheda importo nel cielo, "Piano rate", "Paga ora" → foglio "Come vuoi pagare?" (l'unico canale reale e il checkout online; "In segreteria" e informativo) |
| `isPDocuments` + `sheetIsUpload` / `uploaded` | `ParentDocumentsScreen` | "Documenti di {nome}", schede con barra azioni (Carica documento · Visualizza · Scarica · Sostituisci · Carica nuova), nota formati; foglio di scelta (fotocamera · galleria · file) senza barra; foglio "Documento inviato" |
| `isPConsents` | `ParentConsentsScreen` | `GlassRow` + pill a quattro livelli; la decisione in un foglio con Annulla + Accetto/Revoca |
| `isPServices` | `ParentServicesScreen` | "Servizi del club", sette `GlassRow` con riga di contesto dal payload e chevron |
| §3d Appuntamenti / Iscrizione / Strutture / Contatti | `ParentAppointmentsScreen`, `ParentEnrollmentScreen`, `ParentStructuresScreen`, `ParentContactsScreen` | `SummaryCard` + `GlassRow`; richiesta/prenotazione in un foglio con pillole di scelta |
| `sheetRoster` (attendance / callup) / turno 6 §5-6 | fogli presenze e convocazioni | "Registra le presenze" / "Scegli i convocati", riga di avanzamento con scorciatoia, `SelectableAthleteRow` (tile navy sempre, parola di stato a destra, anello 30px), Annulla + "Salva N/M" (successo) / "Convoca N" |

**Presenze a tre stati — chiuso.** ADR-0168 punto 3 lo aveva rinviato
perche il mobile scriveva sulla proiezione legacy; da D-MOB-12 scrive su
`POST /api/v1/events/:id/participants`, che fa un **upsert per riga** e
accetta i tre stati del vocabolario server (`ATTENDANCE_STATUSES`:
`present`, `absent`, `pending`). La riga cicla `da segnare → presente →
assente → da segnare` per ogni atleta; al salvataggio le righe segnate
vanno come present/absent, una riga che il server aveva ed e tornata "da
segnare" si riscrive come `pending`, e chi non ha mai avuto una riga ed e
ancora "da segnare" non si manda (e gia quello stato). Alla rilettura
(`GET /api/v1/events/:id`, `mapParticipantsToAttendance`) una riga
`pending` — o senza stato — torna "da segnare" (`present: null`): nessuno
stato solo del client, verificato a runtime su Expo Web con andata e
ritorno dal server (presente → assente → da segnare → salva → ricarica →
"da segnare" → presente → salva). Nessun cambio di endpoint, nessuno stato
inventato. Le convocazioni restano a due stati (convocato / da segnare):
il server sostituisce l'intero elenco, "non convocato" non e uno stato
distinto.

**Verifica a runtime (Expo Web, account Trainer di staging, 2026-09-11).**
Ogni schermata Trainer raggiungibile e stata aperta con dati reali e
confrontata con il prototipo reso nel browser (servito in locale dalla
cartella dell'export). Scostamenti trovati e corretti in quel giro:

- `Dock`: il puck attivo aveva `flex: 0` — su web e `0 1 0%` e, con
  `overflow: hidden`, tagliava l'etichetta ("Hom"); ora `flexGrow 0 /
  flexShrink 0 / flexBasis auto`.
- `BottomSheet`: `Dimensions.get("window")` letto a caricamento del modulo
  valeva 0 su web → `maxHeight: 0`, scrim visibile e pannello invisibile;
  ora `useWindowDimensions()` nel componente.
- `SecondaryScreenLayout` / `ParentPrimaryScreenLayout`: le altezze del
  cielo del prototipo (160/250/300/360/430) includono i suoi 32px di barra
  di stato; si somma l'inset reale e il cielo non scende mai sotto il
  chrome (riga di marchio + AppBar), cosi il titolo bianco non cavalca mai
  l'orizzonte (con 160 e "‹ Indietro" lo faceva di 3px su web, di 50px su
  iPhone).
- Il campanello e su **ogni** schermata come nel prototipo (anche con
  "‹ Indietro"): `SecondaryScreenLayout` lo risolve da solo (Trainer →
  `Notifications` dello stack corrente; Parent → `ParentServicesTab` /
  `ParentBoard` sezione notifiche) e lo toglie sulla schermata Notifiche.
- `Floodlight`: l'orizzonte e il blu inferiore del cielo (`--eg-blue-600`)
  che sfuma su 120px (EGDS v3 `signature-foundations`), non piu il velo
  navy al 35% della v2 che lasciava un taglio visibile.
- `StateMessage` con `tone="dark"` (vuoto/errore/vietato/caricamento nel
  cielo) e una scheda di vetro scuro: un messaggio piu alto del cielo aveva
  la seconda riga bianca sulla foschia.
- `SectionHero`: titolo 24/28 come nel DS (era il display 26/30 dell'AppBar).
- Home Trainer: tolta la riga "Stagione" (il prototipo chiude con le tile;
  il permesso `widgets.summary` ora governa i chip dell'hero).
- `NumberTile`: numero di maglia 0/mancante → "–", non un falso "0".
- Scheda gara: "EasyGame FC vs Avversario" nell'ordine casa/trasferta col
  nome del club di contesto (`homeTeam`/`awayTeam` del payload sono
  segnaposto "Casa"/"Ospiti").
- Scheda atleta: "Presenze %" e "Ultime presenze" leggono l'appello vero
  (`GET /api/v1/events/:id` per gli ultimi 12 allenamenti registrati della
  categoria) — con la sola lista (conteggi) erano sempre "–".
- `NotificationPermissionCard` riscritta nella grammatica di riga del
  prototipo (titolo su una riga + pillola, corpo, barra azioni da 36px).

Schermate Trainer senza dati sull'account di staging (Bacheca, Documenti,
Appuntamenti, Compensi): verificato lo stato vuoto; la composizione con
dati resta verificata solo staticamente.

**Verifica a runtime Parent (stesso giorno, account Parent di staging, due
figli).** Ogni schermata Parent raggiungibile aperta con dati reali, cambio
figlio incluso; scostamenti trovati e corretti:

- Le altezze del cielo del prototipo si leggono **meno i suoi 32px di barra
  di stato** (`PROTOTYPE_STATUS_BAR`) piu l'inset reale: con la sola somma
  dell'inset, su web l'etichetta del primo gruppo cadeva sul blu pieno.
- `Floodlight` / `BrandStateLayout`: id SVG **unici per istanza** — su web
  gli id sono globali al documento e lo stack tiene montate le schermate
  sotto, cosi `url(#eg-floodlight-fade)` risolveva sul Floodlight nascosto
  e l'orizzonte della schermata in cima tornava un taglio netto.
- `StateMessage` e sempre un pannello di vetro (chiaro, o scuro con
  `tone="dark"`): uno stato vuoto chiaro a cavallo dell'orizzonte aveva
  l'icona sul blu e il testo sulla foschia.
- Le sezioni secondarie Parent sono registrate **anche** nello stack Home
  (`ParentHomeStackNavigator`), come per il Trainer: dalle scorciatoie e dal
  campanello "‹ Indietro" torna alla Home (`nav.back → pHome`) e il Dock
  sparisce; dalle altre tab si passa alla tab Servizi con `initial: false`
  (radice sotto, Dock nascosto).
- Home: l'occhiello della scheda era `enrollment.selectedPlan` — un
  identificativo ("PLAN_1787857047458"), non un nome — ora "Stagione
  2026/27" (`describeSportSeason`, da luglio anno/anno+1) come nel
  prototipo; tolto il link "Scheda di …" sull'orizzonte (non nel
  prototipo; la scheda resta da Profilo → I miei figli); con certificato
  mancante/scaduto/in scadenza e nessuna richiesta aperta la scheda non
  dice piu "Tutto in regola" ma "Certificato da consegnare / in scadenza"
  (legge `health.familyState`, che distingue il consegnato senza data).
- Calendario: le date del payload sono istanti ISO
  (`2026-09-11T16:00:00.000Z`), non giorni — `parseEventDate`/`eventDayKey`
  in `lib/parent-calendar.ts` raggruppano per giorno locale (prima ogni
  evento faceva gruppo a se sotto "Data da definire" e la rotaia data era
  vuota anche in Home).
- Dettaglio evento: lo stato e in italiano ("Svolto", "In programma"), non
  la chiave del server.
- Pagamenti: `type` nel payload reale e il **metodo** ("Bonifico"); il piano
  vive in `data.planName`/`planId`, la rata in `data.installmentLabel` —
  `resolvePaymentPlanIdentity` (`lib/parent-payment-plan.ts`) da occhiello,
  titolo e chiave del piano rate; la ricevuta "Ricevuta <descrizione>" si
  abbina per inclusione (prima nessuna ricevuta compariva sulla scheda);
  il dettaglio nasconde la chiave di generazione ("enrollment_plan:…")
  mostrata come "Rif."; occhiello "Genitore · Stagione 2026/27".
- Appuntamenti: pillola con una parola ("In attesa"), non l'etichetta
  lunga del server; gli slot del foglio sono "lun 14 set · 09:30", non
  "2026-09-14 09:30".
- Strutture: titolo di riga = campo, struttura nella riga di contesto.
- Iscrizione: occhiello "Segreteria · <figlio>", nome del piano da
  `income.planName`, mai `selectedPlan`.
- Contatti: `normalizeOpeningHours` tiene solo i giorni veri, in ordine di
  settimana — le chiavi `id`/`date`/`name` dell'oggetto orari uscivano
  come giorni "Chiuso" (lo stesso porto sul Web ha il difetto: vedi 16).
- I miei figli: chip del club sulla riga di marchio; stato "Attivo"
  quieto/verde invece di "ACTIVE" outline/warning.
- Scheda atleta: "Certificato medico: mancante" invece del solo "Mancante".

Non verificabili con i dati di staging: RSVP sulla scheda (nessun invito
aperto), pagamento online (canale non attivo per il club: verificato il
foglio con "Carta" disabilitata e "In segreteria"), Bacheca con avvisi.
Ambiguita: nel prototipo `pServices` e marcata secondaria (Indietro,
niente Dock) pur essendo una voce del Dock — qui resta una tab primaria.

**Componenti rimossi** perche non piu raggiungibili da nessuna schermata:
`HighlightCard`, `DocumentRow`, `DocumentCard`, `ConsentRow`,
`AppointmentCard`, `BookingCard`, `EnrollmentStatusCard`,
`ParentComingSoonScreen`. I costanti di libreria che quei componenti
usavano (`DOCUMENT_STATE_VARIANT`, `APPOINTMENT_STATUS_*`) restano perche
coperti da test; i nuovi risolutori dei quattro livelli sono
`resolveDocumentStatusTier` (`lib/parent-documents.ts`) e
`lib/parent-payment-plan.ts`.

**Ambiguita dell'artefatto, risolte cosi:** il foglio "Cambia atleta" ha
sia la chiusura al tocco sia Annulla/Conferma nel prototipo — qui il tocco
sceglie (anello), Conferma applica; le tre opzioni di pagamento del
prototipo (carta · bonifico · segreteria) diventano l'unico canale reale
(checkout online) piu una riga informativa; "Segna tutte come lette" sui
promemoria Trainer non esiste perche i promemoria non hanno uno stato
"letto" lato server; la scheda di accesso "attiva" dell'Account Hub e quella
che si sta aprendo (nessun accesso e attivo prima della scelta).

## Stato attuale: Trainer completo, Parent WP4-9 completo, gate su tutto il resto

Il navigator root (`client/navigation/RootStackNavigator.tsx`) e il **solo**
punto che decide quale guscio mostrare — nessuna schermata a valle rifa questo
controllo:

```
non autenticato                  → Login | Register | VerifyOtp | ForgotPassword
autenticato, nessun contesto     → AccountHubScreen  (registrato come "ContextSelection")
contesto attivo, ruolo Trainer   → MainTabNavigator
contesto attivo, ruolo Parent    → ParentTabNavigator (5 tab, vedi WP4 sopra)
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
| Profilo | `ProfileStackNavigator` | `TrainerProfileDashboardScreen` → `TrainerPersonalDataScreen` / "Tutte le sezioni" → `TrainerMoreScreen` (hub "Servizi") |

Ogni stack include anche `NotificationsScreen`. Le sezioni secondarie
(`TrainerBoardScreen`, `TrainerDocumentsScreen`,
`TrainerAppointmentsScreen`, `TrainerCompensationScreen`,
`TrainerCategoriesScreen`, `TrainerMoreScreen`) sono registrate **sia**
nello stack Profilo **sia** nello stack Home (parita visiva v3, "Home as
hub": le tile della Home le aprono con "‹ Indietro" che torna alla Home) —
stessi componenti, nessuna copia. `Dock` non si disegna su una schermata
secondaria (stack annidato oltre la radice): "Secondary screens ... never
the dock".

`ParentTabNavigator` espone 5 tab (v3.0, `migration-v3.md` passo 8 —
ADR-0168; sostituisce l'elenco di `guidelines/navigation.md`, che restava
su Segreteria/Bacheca):

| Tab | Stack | Schermata | Stato |
|-----|-------|-----------|-------|
| Home | `ParentHomeStackNavigator` | `ParentHomeScreen` → `ParentAthleteProfileScreen` | Reale (WP5), ricomposta nel passaggio di parita visiva: scheda scura "la cosa da fare" + griglia 4×2 di scorciatoie + "Prossimi impegni" con RSVP sulla scheda; scheda atleta reale dal WP9 |
| Calendario | `ParentCalendarStackNavigator` | `ParentCalendarScreen` → `ParentEventDetailScreen` | Reale (WP5): allenamenti+gare unificati per giorno, RSVP sulla scheda (e nel dettaglio) |
| Pagamenti | `ParentPaymentsStackNavigator` | `ParentPaymentsScreen` → `ParentPaymentDetailScreen` | Reale (WP7); tab proprio (WP13, passo 8); il dettaglio rata (prototipo `pPayDetail`) e il foglio "Come vuoi pagare?" aggiunti nel passaggio di parita visiva — stessa `checkoutParentPayment`, ricevute/fatture aperte con lo stesso meccanismo dei documenti |
| Servizi | `ParentServicesStackNavigator` | `ParentServicesScreen` (hub) → `ParentDocumentsScreen` / `ParentConsentsScreen` / `ParentEnrollmentScreen` / `ParentAppointmentsScreen` / `ParentStructuresScreen` / `ParentContactsScreen` / `ParentBoardScreen` | Sostituisce Segreteria (`ParentSegreteriaStackNavigator`, rimosso) e Bacheca (`ParentBoardStackNavigator`, rimosso) — un contenitore di navigazione, nessuna sezione persa (WP13, passo 8) |
| Profilo | `ParentProfileStackNavigator` | `ParentProfileScreen` → `ParentChildrenScreen` → `ParentAthleteProfileScreen` | Account, multi-figlio, cambio contesto, logout; `ParentMoreScreen` rimosso (WP13, passo 8); `ParentComingSoonScreen` ("Impostazioni", un segnaposto senza sezione dietro) rimosso nel passaggio di parita visiva |

### Schermate collegate (21)

Identity & Access: `LoginScreen`, `RegisterScreen`, `VerifyOtpScreen`,
`ForgotPasswordScreen`, `ResetPasswordScreen`, `AccountHubScreen`,
`UnsupportedRoleScreen`.

Trainer, navigazione secondaria (WP3): `TrainerMoreScreen`,
`TrainerBoardScreen`, `TrainerDocumentsScreen`, `TrainerAppointmentsScreen`,
`TrainerCompensationScreen`, `TrainerCategoriesScreen`.

Trainer: `NotificationsScreen`, `TrainerHomeDashboardScreen`,
`TrainerTrainingsDashboardScreen`, `TrainerMatchesDashboardScreen`,
`TrainerAthletesScreen`, `TrainerAthleteProfileScreen`,
`TrainerProfileDashboardScreen`, `TrainerPersonalDataScreen` (parita
visiva: il modulo dei dati personali, prima dentro il Profilo).

Parent (`ParentTabNavigator`): `ParentHomeScreen`, `ParentChildrenScreen`,
`ParentProfileScreen` (WP4); `ParentCalendarScreen`,
`ParentEventDetailScreen` (WP5); `ParentBoardScreen`,
`ParentComingSoonScreen` (WP6); `ParentPaymentsScreen`,
`ParentDocumentsScreen`, `ParentConsentsScreen` (WP7);
`ParentEnrollmentScreen`, `ParentAppointmentsScreen`,
`ParentStructuresScreen`, `ParentContactsScreen` (WP8);
`ParentAthleteProfileScreen` (WP9); `ParentServicesScreen` (WP13, passo 8
— hub che sostituisce `ParentSegreteriaScreen` e `ParentMoreScreen`,
entrambi rimossi); `ParentPaymentDetailScreen` (parita visiva). Il batch
Parent e completo e senza segnaposto: `ParentComingSoonScreen` e stato
rimosso.

### Schermate NON collegate (10) — generazione precedente

`HomeScreen`, `TrainingsScreen`, `MatchesScreen`, `AthletesScreen`,
`ContextSelectionScreen`, `ProfileScreen`, `TrainerHomeScreen`,
`TrainerMatchesScreen`, `TrainerTrainingsScreen`, `TrainerProfileScreen`.

Sono la v1 basata su dati mock. Non modificarle: se serve una funzione, portala
sulla v2 collegata.

## Layer dati — due servizi in uso, piu un mock

| File | Righe | Cosa fa | Stato |
|------|-------|---------|-------|
| `client/services/api.ts` | 1.154 | Client HTTP verso `/api/v1` della Web App, auth inclusa (register/login/verify/forgot-password) e le sezioni Trainer di WP3 (announcements/appointments/sport-work). Base URL da `EXPO_PUBLIC_EASYGAME_API_URL` (o override salvato in SecureStore). Timeout 6 s, retry solo su risposte senza corpo (408/429/502/503/504 senza payload — una risposta analizzata, anche un 429, non si ripete). Stesso envelope `{data, error}`. | **In uso, fonte dati reale** |
| `client/services/mobile-backend-storage.ts` | 1.351 | Cache AsyncStorage + normalizzazione sopra `api.ts`. Chiavi `@easygame/mobile/*`. | **In uso** |
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

### Verifica di avvio reale — 2026-09-10 (design foundation + WP3 Trainer)

Dopo `client/components/signature/**` (WP2) e le cinque sezioni Trainer piu
il Dock (WP3): `npx expo export --platform ios` completato senza errori di
risoluzione, 2437 moduli, bundle iOS 6,06 MB. `npm run test` 47/47 verdi
(Identity & Access incluso, non regredito), `npm run check:types` e
`npm run lint` puliti (0 errori, stessi 20 warning preesistenti).

### Verifica di avvio reale — 2026-09-10 (WP4 Parent foundation)

Dopo `ParentTabNavigator`, `ParentContext`, `ChildSwitcher`/`NumberTile`/
`BottomSheet`/`ParentPrimaryScreenLayout` e le tre schermate Parent nuove:
`npx expo export --platform ios` completato senza errori di risoluzione,
2451 moduli, bundle iOS 6,11 MB. `npm run test` 55/55 verdi (47 preesistenti
+ 8 nuovi su `parent-children.ts`, nessuna regressione Identity & Access ne
Trainer), `npm run check:types` e `npm run lint` puliti (0 errori, stessi 20
warning preesistenti).

### Verifica di avvio reale — 2026-09-10 (WP5 Parent Home/Calendario/RSVP)

Dopo `EventCard`/`SectionHero`/`StatCard`/`HighlightCard`/`RSVPControl`, il
cruscotto Home reale e il Calendario unificato con dettaglio RSVP:
`npx expo export --platform ios` completato senza errori di risoluzione,
2462 moduli, bundle iOS 6,15 MB. `npm run test` 72/72 verdi (55 preesistenti
+ 17 nuovi su calendario/RSVP/riepilogo Home), `npm run check:types` e
`npm run lint` puliti (0 errori, stessi 20 warning preesistenti).

### Verifica di avvio reale — 2026-09-10 (WP6 Bacheca/Notifiche/Account)

Dopo `ParentBoardScreen`, `ParentMoreScreen`, `ParentComingSoonScreen`, il
reskin di `AccountHubScreen` con `AccountAccessCard`, `NotificationRow`:
`npx expo export --platform ios` completato senza errori di risoluzione,
2468 moduli. `npm run test` 76/76 verdi (72 preesistenti + 4 nuovi su
raggruppamento/categoria notifiche), `npm run check:types` e `npm run lint`
puliti (0 errori, stessi 20 warning preesistenti) — nessuna regressione
Identity & Access ne Trainer.

### Verifica di avvio reale — 2026-09-10 (WP7 Pagamenti/Documenti/Consensi)

Dopo `PaymentCard`/`DocumentRow`/`DocumentCard`/`ConsentRow`, le quattro
nuove dipendenze native (`expo-document-picker`, `expo-image-picker`,
`expo-file-system`, `expo-sharing`) e il nuovo `app.json` (permessi
fotocamera/libreria foto): `npx expo export --platform ios` completato
senza errori di risoluzione, 2498 moduli. `npm run test` 100/100 verdi (76
preesistenti + 24 nuovi su stati pagamento/matrice consensi/presentazione
documenti), `npm run check:types` e `npm run lint` puliti (0 errori, stessi
20 warning preesistenti) — nessuna regressione Identity & Access, Trainer o
Parent WP4-6.

### Verifica di avvio reale — 2026-09-10 (WP8 Appuntamenti/Strutture/Iscrizione/Contatti)

Dopo `AppointmentCard`/`BookingCard`/`EnrollmentStatusCard`, le quattro
schermate nuove e il porto di `opening-hours-utils.ts`: `npx expo export
--platform ios` completato senza errori di risoluzione, 2508 moduli. `npm
run test` 113/113 verdi (100 preesistenti + 13 nuovi su appuntamenti/
strutture/orari di apertura), `npm run check:types` e `npm run lint`
puliti (0 errori, stessi 20 warning preesistenti) — nessuna regressione
Identity & Access, Trainer o Parent WP4-7.

### Verifica di avvio reale — 2026-09-10 (WP9 chiusura parita Parent)

Dopo `ParentAthleteProfileScreen`, l'allargamento dei tipi `athlete`/
`health` e le tre correzioni di error handling: `npx expo export --platform
ios` completato senza errori di risoluzione, 2510 moduli. `npm run test`
118/118 verdi (113 preesistenti + 5 nuovi su eta/visite mediche), `npm run
check:types` e `npm run lint` puliti (0 errori, stessi 20 warning
preesistenti) — nessuna regressione Identity & Access, Trainer o Parent
WP4-8.

### Verifica di avvio reale — 2026-09-10 (WP10 reskin visivo Trainer)

Dopo il reskin delle sei schermate Trainer (`TrainerHomeDashboardScreen`,
`TrainerTrainingsDashboardScreen`, `TrainerMatchesDashboardScreen`,
`TrainerAthletesScreen`, `TrainerAthleteProfileScreen`,
`TrainerProfileDashboardScreen`, piu `NotificationsScreen`) e
`SelectableAthleteRow`: `npx expo export --platform ios` completato senza
errori di risoluzione, 2496 moduli. `npm run test` 122/122 verdi (118
preesistenti + 4 nuovi su `getAthletePositionCaption`), `npm run check:types`
e `npm run lint` puliti (0 errori, stessi 20 warning preesistenti) —
nessuna regressione Identity & Access, Trainer WP3 o Parent WP4-9. Nessun
test di rendering per i componenti visivi: il progetto non ha una libreria
di component testing per React Native (solo `node --test` su moduli di
dominio puro), quindi la copertura nuova e sulla sola logica pura aggiunta
(la sigla di ruolo); permessi e navigazione restano verificati dalla suite
preesistente, che non e stata toccata.

### Verifica di avvio reale — 2026-09-10 (WP11 push, deep linking, recupero password nativo)

Dopo `device-push-tokens.ts` (server), `client/lib/deep-linking.ts` +
`deep-link-navigator.ts` + `push-notifications.ts` (mobile),
`ResetPasswordScreen` e `NotificationPermissionCard`:

- **Backend/Web**: `npm test` 5590/5590 verdi (5 nuovi su
  `device-push-tokens.test.mjs`, piu l'aggiunta della nuova rotta alla suite
  di conformita `tests/auth/api-authorization.test.mjs`), `npm run typecheck`
  e `npm run lint` puliti (0 errori, stesso baseline di warning
  preesistenti), `npm run build` completato. Migrazione
  `20260910120000_wp11_device_push_tokens` **scritta, non applicata**
  (richiede autorizzazione esplicita — CLAUDE.md §8).
- **Mobile**: `npm run test` 144/144 verdi (122 preesistenti + 22 nuovi: 5 su
  `interpretPasswordResetResponse`, 17 su `parseDeepLink`/
  `resolveRoleGatedDeepLinkTarget`/`resolvePasswordResetTarget`), `npm run
  check:types` e `npm run lint` puliti (0 errori, stessi 20 warning
  preesistenti), `npx expo export --platform ios` completato senza errori
  di risoluzione, 2647 moduli (2496 prima di questo WP — coerente con le due
  dipendenze native nuove, `expo-notifications` ed `expo-device`). Nessuna
  regressione Identity & Access, Trainer o Parent.
- Nessun test automatico per i listener runtime di `expo-notifications`
  (permesso concesso/negato dall'OS, tocco su una notifica reale, invio
  effettivo): la logica pura che li governa (parsing dell'URL, risoluzione
  del ruolo, classificazione della risposta di reset) e coperta; il
  cablaggio nativo resta da verificare manualmente su un dispositivo fisico
  con un build di sviluppo (i simulatori non supportano le push).

### Verifica di avvio reale — 2026-09-10 (WP12 iOS hardening e release readiness)

Migrazione `20260910120000_wp11_device_push_tokens` **applicata** al
database di sviluppo locale (`easygame_dev`, autorizzazione esplicita
ricevuta per il solo ambiente locale — CLAUDE.md §8): `npx prisma migrate
status` conferma "Database schema is up to date", lo schema reale della
tabella verificato colonna per colonna via `information_schema.columns`
contro `prisma/schema.prisma`.

- **Backend**: 12/12 verdi sui test mirati
  (`device-push-tokens.test.mjs` + `api-authorization.test.mjs`, questi
  ultimi non toccati da WP12 ma rieseguiti come richiesto), `npm run
  typecheck` pulito. Nessun file `src/**` toccato da WP12: la suite
  completa (5590/5590) resta quella verificata a chiusura WP11.
- **Mobile**: `npm run test` 148/148 verdi (144 preesistenti + 4 nuovi su
  `resolveCalendarRsvpBadge`), `npm run check:types` e `npm run lint`
  puliti (0 errori, stessi 20 warning preesistenti), `npx expo-doctor`
  18/18, `npx expo export --platform ios` completato senza errori di
  risoluzione (2649 moduli).
- `npx eas-cli config` (validazione EAS con le credenziali) non e stato
  eseguibile: richiede un account Expo autenticato, che questa sessione non
  ha e non deve crearne uno. `npx expo-doctor` e la validazione locale
  (`eas.json`/`app.json` JSON valido, dipendenze allineate, plugin
  risolvibili) sono state eseguite al suo posto, come da istruzione
  esplicita ("se possibile senza credenziali").

## Cosa manca per completare il mobile

Identity & Access, le fondamenta di ruolo, la parita funzionale Trainer
(WP3), l'intero batch Parent WP4-9 (multi-figlio, Home, Profilo atleta,
Calendario/RSVP, Bacheca/Notifiche, esperienza Account,
Pagamenti/Documenti/Consensi, Segreteria/Appuntamenti/Strutture/
Iscrizione/Contatti), il reskin visivo delle quattro tab Trainer primarie
(WP10), l'anagrafica push/deep linking/recupero password nativo (WP11) e la
preparazione del candidato al rilascio iOS (WP12) sono a posto — la parity
matrix del WP9 non ha trovato nessuna riga MISSING. Restano aperti, in
ordine indicativo:

- **Rinnovo iscrizione come modulo dinamico**: `RenewalDraft.form.fields`
  e un motore di campi (`checkbox`/`file_upload`/`signature`/testo libero,
  alcuni legati a un consenso) — costruire un renderer generico e un lavoro
  a se, dichiarato fuori perimetro (ADR-0164): `ParentEnrollmentScreen`
  mostra stato/pratiche/documenti in sospeso, non un modulo che non sa
  ancora compilare.
- **Rail a passi di `EnrollmentStatusCard`**: lo spec (§C9) lo prevede,
  `data.enrollment` non porta uno stato granulare per sostenerlo — vedi la
  sezione WP8 sopra.
- **Ricevute e fatture non apribili da mobile**: `downloadPath` risponde
  HTML stampabile con auth Bearer, non un file — un browser esterno non
  potrebbe autenticarlo. Servirebbe un endpoint che generi un PDF vero, non
  un lavoro mobile.
- **Testo legale integrale dei consensi**: nessuna API lo espone al
  genitore, nemmeno sul Web — non "replicabile" perche il Web stesso non
  lo fa.
- **Annullamento di una prenotazione struttura**: il dominio non lo offre
  (solo `POST` sotto `.../structures`), nemmeno sul Web.
- **Badge "Da confermare" nel Calendario silenzioso su un errore RSVP**:
  gap minore trovato dall'audit WP9, non corretto — il tocco sull'evento
  porta comunque al dettaglio, dove l'errore e visibile.
- **RSVP da link senza account**: fuori perimetro anche lato Web (`11 —
  Capability`), non nel mobile per lo stesso motivo.
- **Download dei documenti Trainer**: mostrati i metadati, non il file. Le
  dipendenze non mancano piu (`expo-file-system`/`expo-sharing` sono state
  aggiunte nel WP7 per i documenti Parent) — resta solo da collegare
  `TrainerDocumentsScreen` allo stesso meccanismo, un lavoro a se non
  incluso in questo batch.
- **Selettore data/ora nativo** per la riprogrammazione di un appuntamento:
  oggi testo libero `AAAA-MM-GG`/`HH:MM` (Trainer e, dal WP8, Parent).
- **Notifiche push e deep linking**: configurati e funzionanti dal WP11
  (ADR-0166) — anagrafica del token, permesso, instradamento del tocco e
  dei link, completamento nativo del recupero password. Restano aperti,
  dichiarati nella sezione WP11 sopra: nessuna pipeline di invio push
  reale, nessun Universal Link (serve un Team ID Apple, WP12), nessun
  cambio di contesto automatico su un link cross-club/cross-figlio.
- **Link esterni centralizzati**: nessun meccanismo esiste ne lato Web ne
  lato mobile oggi (il link di supporto CediSoft e una stringa duplicata in
  piu punti del Web). Il WP8 non l'ha creato lato mobile perche nessuna
  schermata nuova ne aveva davvero bisogno (i Contatti Parent leggono
  telefono/email/sito da `data.club`, dati dinamici per club, non stringhe
  hardcoded) — un file senza un consumatore reale sarebbe stato prematuro.
  La regola resta valida per il prossimo link business-critical che un WP
  futuro dovesse hardcodare.
- Nessuna pipeline di build (EAS), mock ancora presenti nelle schermate v1
  non collegate.

Vedi [11 — Capability](11-capabilities.md) e [WP-21..WP-25](20-work-packages.md).
