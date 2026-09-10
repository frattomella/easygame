# 05 — Architettura Mobile App

> **SVILUPPO DIFFERITO, salvo le eccezioni dichiarate** (2026-08-22,
> [ADR-0025](18-decision-log.md#adr-0025--mobile-app-differita-la-priorita-e-easygame-web-v1-responsive);
> eccezioni in
> [ADR-0161](18-decision-log.md#adr-0161--la-decisione-esplicita-di-adr-0025-riguarda-identity--access-mobile-non-tutto-il-mobile-si-riprende-ma-solo-per-trainer-e-parent) (Identity & Access),
> [ADR-0162](18-decision-log.md#adr-0162--leccezione-di-adr-0161-si-allarga-parita-funzionale-trainer-non-solo-identity--access) (parita Trainer) e
> [ADR-0163](18-decision-log.md#adr-0163--leccezione-si-allarga-ancora-larea-parent-reale-sugli-stessi-contratti-del-web) (area Parent, WP4-WP6),
> tutte 2026-09-10). La priorita assoluta resta completare EasyGame Web V1 e
> renderla responsive. **Nessuna nuova area funzionale Mobile** oltre a
> quanto queste tre eccezioni coprono, fino a una decisione esplicita — in
> particolare pagamenti, documenti, consensi, iscrizione e l'area Athlete
> restano fuori. Vedi la sezione "Autenticazione mobile" qui sotto, che
> descrive lo stato **attuale**, non congelato.

Cartella: `easygamemobile/`. **Progetto npm indipendente**: proprio
`package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.js`,
`node_modules`.

Stack: **Expo SDK 54 · React Native 0.81 · React 19 · React Navigation 7 ·
TanStack Query 5 · expo-secure-store**. TypeScript `~5.9`.

> Il mobile e **escluso** dal `tsconfig.json` e dal `.vercelignore` della Web
> App. Non viene mai compilato ne deployato insieme al Web.

## Design system mobile

**Source design version**: Claude Design, namespace
`EasyGameDesignSystem_845326`, **EGDS v2.1.0 "Parent-ready", sync
2026-09-10** (`design-source/CHANGELOG.md`, `design-source/github.md`) —
CURRENT al momento di ogni WP elencato in questa pagina. Versioni precedenti
nello stesso changelog: v2.0.0 "Floodlit" (2026-09-09, la firma visiva:
cielo notturno navy a due riflettori, superfici in vetro smerigliato,
angolo firmato, gradiente unico per "agisci qui", eyebrow su display
compatto) e v1.0.0 (2026-09-09, estrazione iniziale). Verificato prima di
scrivere UI nuova in ciascun WP, come richiesto — mai usata una versione
precedente a quella disponibile al momento. Riguarda **solo** la mobile
app: "nothing here was derived from [the web dashboard], and no web UI is
defined" (readme.md) — la dashboard Web non e stata ne consultata ne
modificata per nessuno di questi WP.

**Implementation version**: 2026-09-10, parziale — vedi sotto cosa e stato
portato e cosa no. Il codice sorgente del design system (CSS, JSX, HTML di
anteprima, le tre guide normative `guidelines/component-specs.md`,
`guidelines/navigation.md`, `guidelines/trainer-migration.md`) vive in
`design-source/` alla radice del repository, escluse le parti binarie non
necessarie (illustrazioni — l'app non ne usa — icone gia vendorizzate via
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
| `SecondaryScreenLayout` | `signature/SecondaryScreenLayout.tsx` | formalizzato in EGDS v2.1.0 Parte A (nato come estensione WP3) |
| `SignatureInput` | `signature/SignatureInput.tsx` | `components/core/Input.jsx`, formalizzato in EGDS v2.1.0 Parte A |
| `NumberTile` | `signature/NumberTile.tsx` | `components/core/NumberTile.jsx` (spec Parte B, §B1) — portato in WP4, prima del resto di Parte B, perche `ChildSwitcher` lo richiede subito |
| `ChildSwitcher` | `signature/ChildSwitcher.tsx` | spec Parte C, §C1 — usa un avatar/iniziali con anello di accento, non `NumberTile`, perche un figlio collegato non porta un numero di maglia in questo payload |
| `BottomSheet` | `signature/BottomSheet.tsx` | **estensione**: implementa il "Livello 4" di `guidelines/navigation.md` (foglio), non normato come componente a se nello spec — vedi sotto |
| `ParentPrimaryScreenLayout` | `signature/ParentPrimaryScreenLayout.tsx` | **composizione locale**, non un componente dello spec: `Floodlight` + `AppBar` + `ChildSwitcher`, centralizza la regola "lo switcher sta sotto l'AppBar su ogni schermata primaria Parent" (`guidelines/navigation.md`) |
| `EventCard` | `signature/EventCard.tsx` | `components/patterns/EventCard.jsx` (spec Parte B, §B2) — portato in WP5 per Calendario/Home Parent |
| `SectionHero` | `signature/SectionHero.tsx` | `components/patterns/SectionHero.jsx` (spec Parte B, §B4) |
| `StatCard` | `signature/StatCard.tsx` | `components/patterns/StatCard.jsx` (spec Parte B, §B5) |
| `HighlightCard` | `signature/HighlightCard.tsx` | spec Parte B, §B6 |
| `RSVPControl` | `signature/RSVPControl.tsx` | spec Parte C, §C2 — disegna solo le transizioni che il server ha gia deciso, mai un terzo stato inventato |
| `NotificationRow` | `signature/NotificationRow.tsx` | spec Parte C, §C6 |
| `AccountAccessCard` | `signature/AccountAccessCard.tsx` | spec Parte C, §C10 — applicato in `AccountHubScreen` |

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
- **`SelectableAthleteRow`** (Parte B) non ancora portato: serve solo al
  reskin di Allenamenti/Gare **Trainer** (riga atleta selezionabile), che
  restano invariate in questo giro (vedi sotto). `NumberTile`, `EventCard`,
  `SectionHero`, `StatCard`, `HighlightCard` sono stati portati in WP4/WP5
  per l'area Parent (vedi la tabella sopra) — il loro uso Trainer (roster,
  Home) resta un lavoro a se.
- **Componenti Parte C non ancora portati**: `PaymentCard`,
  `DocumentRow`/`DocumentCard`, `ConsentRow`, `AppointmentCard`,
  `BookingCard`, `EnrollmentStatusCard` — specificati in
  `guidelines/component-specs.md` Parte C ma non implementati: le sezioni
  che li userebbero (Pagamenti, Documenti, Consensi, Iscrizione,
  Appuntamenti, Strutture) sono esplicitamente fuori perimetro del batch
  WP4-6 (ADR-0163). `ChildSwitcher`, `RSVPControl`, `NotificationRow` e
  `AccountAccessCard` sono stati portati.
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
`handleSelectAccess`, il caricamento, i modali (profilo, nuovo club, token)
restano quelli di sempre. **Comportamento nuovo, non solo estetico**: un
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

## Stato attuale: Trainer completo, Parent perimetro WP4-6 completo, gate su tutto il resto

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
| Profilo | `ProfileStackNavigator` | `TrainerProfileDashboardScreen` → "Altre sezioni" → `TrainerMoreScreen` |

Ogni stack include anche `NotificationsScreen`. Da `TrainerMoreScreen`
(navigazione secondaria, non una tab): `TrainerBoardScreen`,
`TrainerDocumentsScreen`, `TrainerAppointmentsScreen`,
`TrainerCompensationScreen`, `TrainerCategoriesScreen` — vedi "WP3 — Parita
funzionale Trainer" sopra.

`ParentTabNavigator` espone 5 tab (`guidelines/navigation.md`):

| Tab | Stack | Schermata | Stato |
|-----|-------|-----------|-------|
| Home | `ParentHomeStackNavigator` | `ParentHomeScreen` | Reale (WP5): SectionHero + StatCard + HighlightCard |
| Calendario | `ParentCalendarStackNavigator` | `ParentCalendarScreen` → `ParentEventDetailScreen` | Reale (WP5): allenamenti+gare unificati, RSVP nel dettaglio |
| Segreteria | `ParentSegreteriaStackNavigator` | `ParentSegreteriaScreen` | Segnaposto permanente per questo batch (pagamenti/documenti/consensi/iscrizione fuori perimetro, ADR-0163) |
| Bacheca | `ParentBoardStackNavigator` | `ParentBoardScreen` | Reale (WP6): bacheca + notifiche, due sezioni |
| Profilo | `ParentProfileStackNavigator` | `ParentProfileScreen` → `ParentChildrenScreen` / `ParentMoreScreen` / `ParentComingSoonScreen` | Account, multi-figlio, cambio contesto, logout, hub (WP6) |

### Schermate collegate (21)

Identity & Access: `LoginScreen`, `RegisterScreen`, `VerifyOtpScreen`,
`ForgotPasswordScreen`, `AccountHubScreen`, `UnsupportedRoleScreen`.

Trainer, navigazione secondaria (WP3): `TrainerMoreScreen`,
`TrainerBoardScreen`, `TrainerDocumentsScreen`, `TrainerAppointmentsScreen`,
`TrainerCompensationScreen`, `TrainerCategoriesScreen`.

Trainer (invariate): `NotificationsScreen`, `TrainerHomeDashboardScreen`,
`TrainerTrainingsDashboardScreen`, `TrainerMatchesDashboardScreen`,
`TrainerAthletesScreen`, `TrainerAthleteProfileScreen`,
`TrainerProfileDashboardScreen`.

Parent (`ParentTabNavigator`): `ParentHomeScreen`, `ParentChildrenScreen`,
`ParentProfileScreen` (WP4); `ParentCalendarScreen`,
`ParentEventDetailScreen` (WP5); `ParentBoardScreen`, `ParentMoreScreen`,
`ParentComingSoonScreen` (WP6). Segnaposto onesto, non funzionalita finta:
`ParentSegreteriaScreen` (permanente per questo batch, ADR-0163) e le otto
voci non implementate dell'hub, che aprono `ParentComingSoonScreen`.

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

## Cosa manca per completare il mobile

Identity & Access, le fondamenta di ruolo, la parita funzionale Trainer
(WP3) e il batch Parent WP4-6 (multi-figlio, Home, Calendario/RSVP,
Bacheca/Notifiche, esperienza Account) sono a posto. Restano aperti, in
ordine indicativo:

- **Area Parent — Pagamenti, Documenti, Consensi, Iscrizione, Segreteria/
  Appuntamenti, Strutture, Contatti**: esplicitamente fuori perimetro di
  WP4-6 (ADR-0163), predisposti come slot onesti in `ParentMoreScreen`. I
  contratti `/api/parent-dashboard/[athleteId]/appointments`, `/documents`,
  `/consents`, `/structures`, `/checkout` sono gia mappati (vedi il report
  di ricognizione del batch Parent) e pronti per un batch successivo.
- **RSVP da link senza account**: fuori perimetro anche lato Web (`11 —
  Capability`), non nel mobile per lo stesso motivo.
- **Reskin delle quattro tab Trainer primarie** (Home, Allenamenti, Gare,
  Atleti) sul linguaggio visivo nuovo — restano sul linguaggio attuale,
  vedi "Perche solo il Dock e stato applicato" sopra. Servirebbe anche
  `SelectableAthleteRow` (`NumberTile`/`EventCard`/`SectionHero`/`StatCard`/
  `HighlightCard` sono gia stati portati per l'area Parent, il loro uso
  Trainer resta un lavoro a se).
- **Download dei documenti Trainer**: mostrati i metadati, non il file —
  richiede una richiesta autenticata col Bearer token e
  `expo-file-system`/`expo-sharing` (non dipendenze del progetto oggi).
- **Selettore data/ora nativo** per la riprogrammazione di un appuntamento:
  oggi testo libero `AAAA-MM-GG`/`HH:MM`.
- **Notifiche push e deep linking**: nessuno dei due e configurato;
  il completamento nativo del recupero password ne dipende.
- **Link esterni centralizzati**: oggi hardcoded sia lato Web sia lato
  mobile, nessuna ownership CediSoft dichiarata.
- Nessuna pipeline di build (EAS), mock ancora presenti nelle schermate v1
  non collegate.

Vedi [11 — Capability](11-capabilities.md) e [WP-21..WP-25](20-work-packages.md).
